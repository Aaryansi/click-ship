/**
 * Linear Integration Routes for Click-Ship
 *
 * Handles Linear OAuth, webhooks, and issue synchronization.
 */

import * as supabase from '../lib/supabase.js';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

/**
 * Register Linear routes
 */
export default async function linearRoutes(fastify, options) {

  /**
   * GET /linear/oauth/callback
   * Handle Linear OAuth callback
   */
  fastify.get('/linear/oauth/callback', async (request, reply) => {
    const { code, state } = request.query;

    if (!code) {
      return reply.code(400).send({ error: 'Missing code' });
    }

    try {
      // Exchange code for token
      const tokenResponse = await fetch('https://api.linear.app/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: process.env.LINEAR_CLIENT_ID,
          client_secret: process.env.LINEAR_CLIENT_SECRET,
          code,
          redirect_uri: `${process.env.API_URL}/linear/oauth/callback`
        })
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      // Parse state to get org ID
      const { orgId } = JSON.parse(Buffer.from(state, 'base64').toString());

      // Update organization with Linear token
      await supabase.updateOrganization(orgId, {
        linear_token: tokenData.access_token
      });

      // Redirect to success page
      return reply.redirect(`${process.env.APP_URL}/settings/integrations?linear=connected`);

    } catch (error) {
      console.error('Linear OAuth error:', error);
      return reply.redirect(`${process.env.APP_URL}/settings/integrations?linear=error`);
    }
  });

  /**
   * GET /linear/install
   * Generate Linear OAuth URL
   */
  fastify.get('/linear/install', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { orgId } = request.query;

    if (!orgId) {
      return reply.code(400).send({ error: 'Missing orgId' });
    }

    const state = Buffer.from(JSON.stringify({ orgId })).toString('base64');

    const authUrl = new URL('https://linear.app/oauth/authorize');
    authUrl.searchParams.set('client_id', process.env.LINEAR_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', `${process.env.API_URL}/linear/oauth/callback`);
    authUrl.searchParams.set('scope', 'read,write,issues:create');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    return reply.send({ url: authUrl.toString() });
  });

  /**
   * POST /linear/webhooks
   * Handle Linear webhook events
   */
  fastify.post('/linear/webhooks', async (request, reply) => {
    const { type, data, action } = request.body;

    // Verify webhook signature if configured
    const signature = request.headers['linear-signature'];
    if (process.env.LINEAR_WEBHOOK_SECRET && signature) {
      const isValid = verifyLinearSignature(
        JSON.stringify(request.body),
        signature
      );
      if (!isValid) {
        return reply.code(401).send({ error: 'Invalid signature' });
      }
    }

    try {
      switch (type) {
        case 'Issue':
          await handleIssueEvent(action, data);
          break;

        case 'Comment':
          await handleCommentEvent(action, data);
          break;
      }

      return reply.send({ ok: true });

    } catch (error) {
      console.error('Linear webhook error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /linear/link-pr
   * Link a Click-Ship PR to a Linear issue
   */
  fastify.post('/linear/link-pr', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { editId, issueId } = request.body;

    try {
      // Get the edit
      const { data: edit } = await supabase.supabase
        .from('edits')
        .select(`
          *,
          repositories (
            *,
            organizations (*)
          )
        `)
        .eq('id', editId)
        .single();

      if (!edit) {
        return reply.code(404).send({ error: 'Edit not found' });
      }

      const org = edit.repositories.organizations;
      if (!org.linear_token) {
        return reply.code(400).send({ error: 'Linear not connected to organization' });
      }

      // Create attachment in Linear
      await createLinearAttachment(org.linear_token, {
        issueId,
        title: `Click-Ship PR #${edit.pr_number}`,
        url: edit.pr_url,
        iconUrl: 'https://click-ship.dev/icon.png'
      });

      // Update issue state to "In Progress"
      await updateLinearIssueState(org.linear_token, issueId, 'started');

      return reply.send({ ok: true });

    } catch (error) {
      console.error('Link PR error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /linear/issues
   * Get Linear issues for the organization
   */
  fastify.get('/linear/issues', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { orgId, teamId } = request.query;

    try {
      // Get org
      const org = await supabase.getOrganizationBySlug(orgId);
      if (!org || !org.linear_token) {
        return reply.code(400).send({ error: 'Linear not connected' });
      }

      // Fetch issues
      const issues = await fetchLinearIssues(org.linear_token, teamId);

      return reply.send({ issues });

    } catch (error) {
      console.error('Get issues error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}

// ============================================
// Linear API Helpers
// ============================================

/**
 * Execute Linear GraphQL query
 */
async function linearQuery(token, query, variables = {}) {
  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token
    },
    body: JSON.stringify({ query, variables })
  });

  const result = await response.json();

  if (result.errors) {
    throw new Error(result.errors[0].message);
  }

  return result.data;
}

/**
 * Fetch Linear issues
 */
async function fetchLinearIssues(token, teamId) {
  const query = `
    query Issues($teamId: String, $first: Int) {
      issues(
        filter: {
          team: { id: { eq: $teamId } }
          state: { type: { nin: ["completed", "canceled"] } }
        }
        first: $first
        orderBy: updatedAt
      ) {
        nodes {
          id
          identifier
          title
          description
          state {
            id
            name
            color
          }
          priority
          labels {
            nodes {
              id
              name
              color
            }
          }
          assignee {
            id
            name
            avatarUrl
          }
        }
      }
    }
  `;

  const data = await linearQuery(token, query, {
    teamId,
    first: 50
  });

  return data.issues.nodes;
}

/**
 * Create attachment on Linear issue
 */
async function createLinearAttachment(token, { issueId, title, url, iconUrl }) {
  const mutation = `
    mutation CreateAttachment($issueId: String!, $title: String!, $url: String!, $iconUrl: String) {
      attachmentCreate(input: {
        issueId: $issueId
        title: $title
        url: $url
        iconUrl: $iconUrl
      }) {
        success
        attachment {
          id
        }
      }
    }
  `;

  return linearQuery(token, mutation, { issueId, title, url, iconUrl });
}

/**
 * Update Linear issue state
 */
async function updateLinearIssueState(token, issueId, stateType) {
  // First, get the state ID for the given type
  const statesQuery = `
    query IssueStates($issueId: String!) {
      issue(id: $issueId) {
        team {
          states {
            nodes {
              id
              name
              type
            }
          }
        }
      }
    }
  `;

  const statesData = await linearQuery(token, statesQuery, { issueId });
  const states = statesData.issue.team.states.nodes;
  const targetState = states.find(s => s.type === stateType);

  if (!targetState) {
    console.warn(`No state found for type: ${stateType}`);
    return;
  }

  // Update the issue
  const mutation = `
    mutation UpdateIssue($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
      }
    }
  `;

  return linearQuery(token, mutation, { issueId, stateId: targetState.id });
}

/**
 * Create Linear issue from annotation
 */
async function createLinearIssue(token, { teamId, title, description, labelIds = [] }) {
  const mutation = `
    mutation CreateIssue($teamId: String!, $title: String!, $description: String, $labelIds: [String!]) {
      issueCreate(input: {
        teamId: $teamId
        title: $title
        description: $description
        labelIds: $labelIds
      }) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }
  `;

  const data = await linearQuery(token, mutation, {
    teamId,
    title,
    description,
    labelIds
  });

  return data.issueCreate.issue;
}

// ============================================
// Webhook Handlers
// ============================================

/**
 * Handle Linear issue events
 */
async function handleIssueEvent(action, data) {
  const { id, title, labels, team } = data;

  // Check if issue has a "design-feedback" label
  const hasDesignLabel = labels?.some(l =>
    l.name.toLowerCase().includes('design') ||
    l.name.toLowerCase().includes('feedback')
  );

  if (action === 'create' && hasDesignLabel) {
    // Could auto-create an annotation from the issue
    console.log(`Design issue created: ${title}`);
  }
}

/**
 * Handle Linear comment events
 */
async function handleCommentEvent(action, data) {
  // Could sync comments back to PR
  console.log(`Comment ${action}:`, data.body?.substring(0, 50));
}

// ============================================
// Signature Verification
// ============================================

function verifyLinearSignature(body, signature) {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', process.env.LINEAR_WEBHOOK_SECRET);
  hmac.update(body);
  const expectedSignature = hmac.digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}
