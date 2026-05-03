/**
 * Slack Integration Routes for Click-Ship
 *
 * Handles Slack commands, interactive components, and OAuth.
 */

import crypto from 'crypto';
import {
  handleStatusCommand,
  handleInteractiveAction,
  verifySlackSignature
} from '../lib/slack-notifications.js';
import * as supabase from '../lib/supabase.js';
import * as github from '../lib/github.js';

/**
 * Register Slack routes
 */
export default async function slackRoutes(fastify, options) {

  /**
   * POST /slack/commands
   * Handle Slack slash commands
   */
  fastify.post('/slack/commands', async (request, reply) => {
    // Verify Slack signature
    const timestamp = request.headers['x-slack-request-timestamp'];
    const signature = request.headers['x-slack-signature'];
    const body = JSON.stringify(request.body);

    if (process.env.SLACK_SIGNING_SECRET) {
      const isValid = verifySlackRequest(body, timestamp, signature);
      if (!isValid) {
        return reply.code(401).send({ error: 'Invalid signature' });
      }
    }

    const { command, text, user_id, channel_id, team_id } = request.body;

    // Parse command
    const [action, ...args] = (text || '').trim().split(/\s+/);

    try {
      switch (action) {
        case 'status':
          return handleStatus(user_id, channel_id, team_id, reply);

        case 'connect':
          return handleConnect(args[0], user_id, reply);

        case 'help':
        default:
          return handleHelp(reply);
      }
    } catch (error) {
      console.error('Slack command error:', error);
      return reply.send({
        response_type: 'ephemeral',
        text: `Error: ${error.message}`
      });
    }
  });

  /**
   * POST /slack/interactive
   * Handle interactive component actions (buttons, menus)
   */
  fastify.post('/slack/interactive', async (request, reply) => {
    // Slack sends payload as form-encoded
    const payload = JSON.parse(request.body.payload || '{}');

    // Verify signature
    const timestamp = request.headers['x-slack-request-timestamp'];
    const signature = request.headers['x-slack-signature'];

    if (process.env.SLACK_SIGNING_SECRET) {
      const body = `payload=${encodeURIComponent(request.body.payload)}`;
      const isValid = verifySlackRequest(body, timestamp, signature);
      if (!isValid) {
        return reply.code(401).send({ error: 'Invalid signature' });
      }
    }

    try {
      const result = await handleInteractiveAction(payload, {
        github,
        supabase
      });

      return reply.send(result);
    } catch (error) {
      console.error('Slack interactive error:', error);
      return reply.send({
        text: `Error: ${error.message}`
      });
    }
  });

  /**
   * GET /slack/oauth/callback
   * Handle Slack OAuth callback
   */
  fastify.get('/slack/oauth/callback', async (request, reply) => {
    const { code, state } = request.query;

    if (!code) {
      return reply.code(400).send({ error: 'Missing code' });
    }

    try {
      // Exchange code for token
      const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: process.env.SLACK_CLIENT_ID,
          client_secret: process.env.SLACK_CLIENT_SECRET,
          code,
          redirect_uri: `${process.env.API_URL}/slack/oauth/callback`
        })
      });

      const tokenData = await tokenResponse.json();

      if (!tokenData.ok) {
        throw new Error(tokenData.error || 'OAuth failed');
      }

      // Parse state to get org ID
      const { orgId } = JSON.parse(Buffer.from(state, 'base64').toString());

      // Update organization with Slack info
      await supabase.updateOrganization(orgId, {
        slack_team_id: tokenData.team.id,
        slack_webhook_url: tokenData.incoming_webhook?.url,
        settings: {
          slack_bot_token: tokenData.access_token,
          slack_channel: tokenData.incoming_webhook?.channel
        }
      });

      // Redirect to success page
      return reply.redirect(`${process.env.APP_URL}/settings/integrations?slack=connected`);

    } catch (error) {
      console.error('Slack OAuth error:', error);
      return reply.redirect(`${process.env.APP_URL}/settings/integrations?slack=error`);
    }
  });

  /**
   * GET /slack/install
   * Generate Slack app installation URL
   */
  fastify.get('/slack/install', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { orgId } = request.query;

    if (!orgId) {
      return reply.code(400).send({ error: 'Missing orgId' });
    }

    // Create state parameter
    const state = Buffer.from(JSON.stringify({ orgId })).toString('base64');

    const installUrl = new URL('https://slack.com/oauth/v2/authorize');
    installUrl.searchParams.set('client_id', process.env.SLACK_CLIENT_ID);
    installUrl.searchParams.set('scope', 'commands,incoming-webhook,chat:write');
    installUrl.searchParams.set('redirect_uri', `${process.env.API_URL}/slack/oauth/callback`);
    installUrl.searchParams.set('state', state);

    return reply.send({ url: installUrl.toString() });
  });

  /**
   * POST /slack/events
   * Handle Slack Events API
   */
  fastify.post('/slack/events', async (request, reply) => {
    const { type, challenge, event } = request.body;

    // URL verification challenge
    if (type === 'url_verification') {
      return reply.send({ challenge });
    }

    // Verify signature
    const timestamp = request.headers['x-slack-request-timestamp'];
    const signature = request.headers['x-slack-signature'];

    if (process.env.SLACK_SIGNING_SECRET) {
      const body = JSON.stringify(request.body);
      const isValid = verifySlackRequest(body, timestamp, signature);
      if (!isValid) {
        return reply.code(401).send({ error: 'Invalid signature' });
      }
    }

    // Handle events
    if (type === 'event_callback' && event) {
      await handleSlackEvent(event);
    }

    return reply.send({ ok: true });
  });
}

// ============================================
// Command Handlers
// ============================================

async function handleStatus(userId, channelId, teamId, reply) {
  try {
    // Find org by Slack team ID
    const { data: org } = await supabase.supabase
      .from('organizations')
      .select('*')
      .eq('slack_team_id', teamId)
      .single();

    if (!org) {
      return reply.send({
        response_type: 'ephemeral',
        text: 'Click-Ship is not connected to this Slack workspace. Visit the Click-Ship dashboard to connect.'
      });
    }

    // Get recent edits
    const repos = await supabase.getOrganizationRepositories(org.id);
    const recentEdits = [];

    for (const repo of repos.slice(0, 3)) {
      const edits = await supabase.getRepositoryEdits(repo.id, { limit: 5 });
      recentEdits.push(...edits);
    }

    const response = await handleStatusCommand(userId, channelId, {
      org,
      recentEdits: recentEdits.sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      ).slice(0, 10)
    });

    return reply.send(response);

  } catch (error) {
    console.error('Status command error:', error);
    return reply.send({
      response_type: 'ephemeral',
      text: `Error getting status: ${error.message}`
    });
  }
}

async function handleConnect(repoName, userId, reply) {
  if (!repoName) {
    return reply.send({
      response_type: 'ephemeral',
      text: 'Usage: `/click-ship connect owner/repo`'
    });
  }

  return reply.send({
    response_type: 'ephemeral',
    text: `To connect \`${repoName}\`, visit the Click-Ship dashboard and add it to your organization.`
  });
}

function handleHelp(reply) {
  return reply.send({
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Click-Ship Commands*'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• \`/click-ship status\` - View open PRs and recent activity
• \`/click-ship connect owner/repo\` - Connect a repository
• \`/click-ship help\` - Show this help message`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'For more info, visit <https://click-ship.dev/docs|Click-Ship Docs>'
          }
        ]
      }
    ]
  });
}

// ============================================
// Event Handlers
// ============================================

async function handleSlackEvent(event) {
  const { type, user, channel, text } = event;

  switch (type) {
    case 'app_mention':
      // Handle @click-ship mentions
      console.log(`Mentioned by ${user} in ${channel}: ${text}`);
      break;

    case 'message':
      // Could handle specific message patterns
      break;
  }
}

// ============================================
// Helpers
// ============================================

function verifySlackRequest(body, timestamp, signature) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return true; // Skip in development

  // Check timestamp is recent (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return false;
  }

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(baseString);
  const computedSignature = `v0=${hmac.digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  } catch {
    return false;
  }
}
