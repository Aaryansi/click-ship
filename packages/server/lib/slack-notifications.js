/**
 * Slack Notifications Module for Click-Ship
 *
 * Sends notifications to Slack when PRs are created, merged, or closed.
 */

// ============================================
// PR Notifications
// ============================================

/**
 * Notify Slack channel when a PR is created
 */
export async function notifyPRCreated(edit, options = {}) {
  const { slackWebhookUrl, orgName } = options;

  if (!slackWebhookUrl) {
    console.warn('No Slack webhook URL configured');
    return;
  }

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚀 New Click-Ship PR',
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${edit.description}*`
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*File:*\n\`${edit.file_path}\``
        },
        {
          type: 'mrkdwn',
          text: `*Selector:*\n\`${edit.selector}\``
        },
        {
          type: 'mrkdwn',
          text: `*Author:*\n${edit.user?.github_login || 'Unknown'}`
        },
        {
          type: 'mrkdwn',
          text: `*Source:*\n${edit.source || 'Extension'}`
        }
      ]
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📝 View PR',
            emoji: true
          },
          url: edit.pr_url,
          action_id: 'view_pr'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✅ Approve & Merge',
            emoji: true
          },
          style: 'primary',
          action_id: 'approve_pr',
          value: JSON.stringify({
            editId: edit.id,
            prNumber: edit.pr_number,
            repoId: edit.repo_id
          })
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '❌ Close',
            emoji: true
          },
          style: 'danger',
          action_id: 'close_pr',
          value: JSON.stringify({
            editId: edit.id,
            prNumber: edit.pr_number,
            repoId: edit.repo_id
          })
        }
      ]
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Created via Click-Ship • ${new Date().toLocaleString()}`
        }
      ]
    }
  ];

  await sendSlackMessage(slackWebhookUrl, { blocks });
}

/**
 * Notify Slack when PR is merged
 */
export async function notifyPRMerged(edit, options = {}) {
  const { slackWebhookUrl } = options;

  if (!slackWebhookUrl) return;

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ *PR Merged:* ${edit.description}\n<${edit.pr_url}|View on GitHub>`
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Merged by Click-Ship • ${new Date().toLocaleString()}`
        }
      ]
    }
  ];

  await sendSlackMessage(slackWebhookUrl, { blocks });
}

/**
 * Notify Slack when PR is closed
 */
export async function notifyPRClosed(edit, options = {}) {
  const { slackWebhookUrl } = options;

  if (!slackWebhookUrl) return;

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `❌ *PR Closed:* ${edit.description}\n<${edit.pr_url}|View on GitHub>`
      }
    }
  ];

  await sendSlackMessage(slackWebhookUrl, { blocks });
}

// ============================================
// Annotation Notifications
// ============================================

/**
 * Notify Slack when a new annotation is created
 */
export async function notifyAnnotationCreated(annotation, options = {}) {
  const { slackWebhookUrl } = options;

  if (!slackWebhookUrl) return;

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `💬 *New Design Feedback*\n${annotation.note_text}`
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Page:*\n${annotation.page_url}`
        },
        {
          type: 'mrkdwn',
          text: `*From:*\n${annotation.user?.github_login || 'Unknown'}`
        }
      ]
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔧 Create PR',
            emoji: true
          },
          action_id: 'create_pr_from_annotation',
          value: annotation.id
        }
      ]
    }
  ];

  await sendSlackMessage(slackWebhookUrl, { blocks });
}

// ============================================
// Slack Commands
// ============================================

/**
 * Handle /click-ship status command
 */
export async function handleStatusCommand(userId, channelId, orgData) {
  const recentEdits = orgData.recentEdits || [];
  const openPRs = recentEdits.filter(e => e.pr_status === 'open');
  const mergedToday = recentEdits.filter(e =>
    e.pr_status === 'merged' &&
    new Date(e.updated_at).toDateString() === new Date().toDateString()
  );

  return {
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Click-Ship Status',
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Open PRs:*\n${openPRs.length}`
          },
          {
            type: 'mrkdwn',
            text: `*Merged Today:*\n${mergedToday.length}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: openPRs.length > 0
            ? '*Recent Open PRs:*\n' + openPRs.slice(0, 5).map(e =>
                `• <${e.pr_url}|#${e.pr_number}> - ${e.description.slice(0, 50)}...`
              ).join('\n')
            : '_No open PRs_'
        }
      }
    ]
  };
}

/**
 * Handle /click-ship approve <pr-number> command
 */
export async function handleApproveCommand(prNumber, userId, orgData) {
  // This will be handled by the interactive component handler
  return {
    response_type: 'ephemeral',
    text: `Processing approval for PR #${prNumber}...`
  };
}

// ============================================
// Interactive Components
// ============================================

/**
 * Handle Slack interactive component actions
 */
export async function handleInteractiveAction(payload, services) {
  const action = payload.actions[0];
  const actionId = action.action_id;
  const userId = payload.user.id;

  switch (actionId) {
    case 'approve_pr': {
      const data = JSON.parse(action.value);
      return handleApprovePRAction(data, userId, services);
    }

    case 'close_pr': {
      const data = JSON.parse(action.value);
      return handleClosePRAction(data, userId, services);
    }

    case 'create_pr_from_annotation': {
      const annotationId = action.value;
      return handleCreatePRFromAnnotation(annotationId, userId, services);
    }

    default:
      return { text: 'Unknown action' };
  }
}

async function handleApprovePRAction(data, userId, services) {
  const { editId, prNumber, repoId } = data;
  const { github, supabase } = services;

  try {
    // Get repo info
    const repo = await supabase.getRepository(repoId);
    if (!repo) {
      return { text: '❌ Repository not found' };
    }

    // Get installation octokit
    const octokit = await github.getInstallationOctokit(
      repo.organizations.github_installation_id
    );

    // Merge PR
    await github.mergePullRequest(octokit, repo.owner, repo.name, prNumber);

    // Update edit status
    await supabase.updateEditStatus(editId, 'merged');

    return {
      text: `✅ PR #${prNumber} has been merged!`,
      replace_original: false
    };
  } catch (error) {
    console.error('Approve PR error:', error);
    return { text: `❌ Failed to merge: ${error.message}` };
  }
}

async function handleClosePRAction(data, userId, services) {
  const { editId, prNumber, repoId } = data;
  const { github, supabase } = services;

  try {
    const repo = await supabase.getRepository(repoId);
    if (!repo) {
      return { text: '❌ Repository not found' };
    }

    const octokit = await github.getInstallationOctokit(
      repo.organizations.github_installation_id
    );

    await github.closePullRequest(octokit, repo.owner, repo.name, prNumber);
    await supabase.updateEditStatus(editId, 'closed');

    return {
      text: `❌ PR #${prNumber} has been closed`,
      replace_original: false
    };
  } catch (error) {
    console.error('Close PR error:', error);
    return { text: `❌ Failed to close: ${error.message}` };
  }
}

async function handleCreatePRFromAnnotation(annotationId, userId, services) {
  // This would trigger the edit workflow from an annotation
  return {
    text: '🔧 Creating PR from annotation... (not yet implemented)',
    replace_original: false
  };
}

// ============================================
// Helpers
// ============================================

/**
 * Send message to Slack webhook
 */
async function sendSlackMessage(webhookUrl, payload) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Slack notification error:', error);
    return false;
  }
}

/**
 * Verify Slack request signature
 */
export function verifySlackSignature(body, timestamp, signature, signingSecret) {
  const crypto = await import('crypto');

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(baseString);
  const computedSignature = `v0=${hmac.digest('hex')}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computedSignature)
  );
}

export default {
  notifyPRCreated,
  notifyPRMerged,
  notifyPRClosed,
  notifyAnnotationCreated,
  handleStatusCommand,
  handleApproveCommand,
  handleInteractiveAction,
  verifySlackSignature
};
