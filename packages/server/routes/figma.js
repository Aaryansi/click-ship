/**
 * Figma Integration Routes for Click-Ship
 *
 * Handles requests from the Figma plugin to create PRs from design selections.
 */

import { getRepository, createEdit, updateEditPR, logAuditEvent } from '../lib/supabase.js';
import { getUserOctokit, getFileContent, searchFiles, createBranchAndCommit } from '../lib/github.js';
import { generateCodeFromFigmaStyles } from '../lib/ai.js';
import { findElementBySelector, extractCodeWithContext } from '../lib/ast-locator.js';
import { extractDesignTokens } from '../lib/design-tokens.js';
import { notifyPRCreated } from '../lib/slack-notifications.js';

/**
 * Register Figma routes
 */
export default async function figmaRoutes(fastify, options) {

  /**
   * POST /figma/edit
   * Create an edit from Figma styles
   */
  fastify.post('/figma/edit', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const {
      repoId,
      selector,
      figmaStyles,
      pageUrl = ''
    } = request.body;

    const user = request.user;
    const githubToken = request.githubToken;

    // Validate input
    if (!repoId || !selector || !figmaStyles) {
      return reply.code(400).send({
        error: 'Missing required fields: repoId, selector, figmaStyles'
      });
    }

    try {
      // Get repository info
      const repo = await getRepository(repoId);
      if (!repo) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      // Get Octokit instance
      const octokit = getUserOctokit(githubToken);

      // Extract design tokens
      const designTokens = await extractDesignTokens(
        octokit,
        repo.owner,
        repo.name,
        repo.default_branch
      );

      // Search for files containing the selector
      const files = await searchFiles(octokit, repo.owner, repo.name, selector);

      if (files.length === 0) {
        return reply.code(404).send({
          error: 'No files found containing the selector'
        });
      }

      // Find the file with matching element
      let targetFile = null;
      let fileContent = null;
      let matches = [];

      for (const file of files.slice(0, 10)) {
        const content = await getFileContent(
          octokit,
          repo.owner,
          repo.name,
          file.path,
          repo.default_branch
        );

        if (!content) continue;

        const elementMatches = findElementBySelector(content.content, selector);

        if (elementMatches.length > 0) {
          targetFile = file;
          fileContent = content;
          matches = elementMatches;
          break;
        }
      }

      if (!targetFile || !fileContent) {
        return reply.code(404).send({
          error: 'Could not find element matching selector in any file'
        });
      }

      // Generate code modification from Figma styles
      const aiResult = await generateCodeFromFigmaStyles({
        fileContent: fileContent.content,
        selector,
        figmaStyles,
        designTokens,
        filePath: targetFile.path
      });

      if (aiResult.error) {
        return reply.code(422).send({
          error: 'Could not generate code modification',
          details: aiResult.error
        });
      }

      // Apply modification
      const modifiedContent = fileContent.content.replace(
        aiResult.original,
        aiResult.modified
      );

      // Create branch and PR
      const branchName = `click-ship/figma-${Date.now()}`;
      const description = generateFigmaDescription(figmaStyles);

      const prResult = await createBranchAndCommit(octokit, repo.owner, repo.name, {
        baseBranch: repo.default_branch,
        newBranch: branchName,
        filePath: targetFile.path,
        content: modifiedContent,
        commitMessage: `style: ${description}`,
        prTitle: `[Click-Ship] ${description}`,
        prBody: generatePRBody({
          description,
          selector,
          filePath: targetFile.path,
          source: 'figma',
          figmaStyles,
          aiConfidence: aiResult.confidence
        })
      });

      // Record edit in database
      const edit = await createEdit({
        org_id: repo.org_id,
        repo_id: repo.id,
        user_id: user.id,
        selector,
        description,
        page_url: pageUrl,
        file_path: targetFile.path,
        original_code: aiResult.original,
        modified_code: aiResult.modified,
        source: 'figma',
        ai_model: aiResult.model,
        ai_tokens_used: aiResult.tokensUsed,
        ai_confidence: aiResult.confidence
      });

      // Update with PR info
      await updateEditPR(edit.id, {
        prNumber: prResult.prNumber,
        prUrl: prResult.prUrl,
        branchName: prResult.branch,
        commitSha: prResult.commitSha
      });

      // Send Slack notification
      if (repo.organizations?.slack_webhook_url) {
        await notifyPRCreated({
          ...edit,
          pr_number: prResult.prNumber,
          pr_url: prResult.prUrl,
          user
        }, {
          slackWebhookUrl: repo.organizations.slack_webhook_url
        });
      }

      // Audit log
      await logAuditEvent({
        orgId: repo.org_id,
        userId: user.id,
        action: 'figma_edit_created',
        resourceType: 'edit',
        resourceId: edit.id,
        metadata: {
          selector,
          filePath: targetFile.path,
          prNumber: prResult.prNumber
        }
      });

      return reply.send({
        ok: true,
        editId: edit.id,
        file: targetFile.path,
        branch: prResult.branch,
        prNumber: prResult.prNumber,
        prUrl: prResult.prUrl,
        confidence: aiResult.confidence
      });

    } catch (error) {
      console.error('Figma edit error:', error);
      return reply.code(500).send({
        error: 'Failed to create edit',
        message: error.message
      });
    }
  });

  /**
   * GET /figma/repos
   * Get repositories connected to the user's organizations
   */
  fastify.get('/figma/repos', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const user = request.user;

    try {
      const { getUserOrganizations, getOrganizationRepositories } = await import('../lib/supabase.js');

      const orgs = await getUserOrganizations(user.id);
      const repos = [];

      for (const org of orgs) {
        const orgRepos = await getOrganizationRepositories(org.id);
        repos.push(...orgRepos.map(r => ({
          ...r,
          orgName: org.name,
          orgSlug: org.slug
        })));
      }

      return reply.send({ repos });

    } catch (error) {
      console.error('Get repos error:', error);
      return reply.code(500).send({
        error: 'Failed to get repositories'
      });
    }
  });

  /**
   * POST /figma/preview
   * Preview the code change without creating a PR
   */
  fastify.post('/figma/preview', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const {
      repoId,
      selector,
      figmaStyles
    } = request.body;

    const githubToken = request.githubToken;

    try {
      const repo = await getRepository(repoId);
      if (!repo) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const octokit = getUserOctokit(githubToken);

      // Get design tokens
      const designTokens = await extractDesignTokens(
        octokit,
        repo.owner,
        repo.name,
        repo.default_branch
      );

      // Search for the file
      const files = await searchFiles(octokit, repo.owner, repo.name, selector);

      for (const file of files.slice(0, 5)) {
        const content = await getFileContent(
          octokit,
          repo.owner,
          repo.name,
          file.path,
          repo.default_branch
        );

        if (!content) continue;

        const matches = findElementBySelector(content.content, selector);

        if (matches.length > 0) {
          // Generate preview
          const aiResult = await generateCodeFromFigmaStyles({
            fileContent: content.content,
            selector,
            figmaStyles,
            designTokens,
            filePath: file.path
          });

          return reply.send({
            ok: true,
            file: file.path,
            match: matches[0],
            original: aiResult.original,
            modified: aiResult.modified,
            explanation: aiResult.explanation,
            confidence: aiResult.confidence,
            tokensMatched: designTokens.source.length > 0
          });
        }
      }

      return reply.code(404).send({
        error: 'Could not find element matching selector'
      });

    } catch (error) {
      console.error('Preview error:', error);
      return reply.code(500).send({
        error: 'Failed to generate preview'
      });
    }
  });
}

// ============================================
// Helpers
// ============================================

/**
 * Generate description from Figma styles
 */
function generateFigmaDescription(figmaStyles) {
  const changes = [];

  if (figmaStyles.fills?.length > 0) {
    changes.push('background color');
  }
  if (figmaStyles.strokes?.length > 0) {
    changes.push('border');
  }
  if (figmaStyles.cornerRadius) {
    changes.push('border radius');
  }
  if (figmaStyles.padding) {
    changes.push('padding');
  }
  if (figmaStyles.effects?.length > 0) {
    changes.push('shadow effects');
  }

  if (changes.length === 0) {
    return 'Update styles from Figma';
  }

  return `Update ${changes.join(', ')} from Figma`;
}

/**
 * Generate PR body with details
 */
function generatePRBody({ description, selector, filePath, source, figmaStyles, aiConfidence }) {
  let body = `## Summary
${description}

## Details
- **Source:** Figma Plugin
- **Selector:** \`${selector}\`
- **File:** \`${filePath}\`
- **AI Confidence:** ${(aiConfidence * 100).toFixed(0)}%

## Figma Styles Applied
`;

  if (figmaStyles.fills?.length > 0) {
    const fill = figmaStyles.fills[0];
    if (fill.type === 'SOLID') {
      body += `- Background: rgba(${Math.round(fill.color.r * 255)}, ${Math.round(fill.color.g * 255)}, ${Math.round(fill.color.b * 255)}, ${fill.opacity || 1})\n`;
    }
  }

  if (figmaStyles.strokes?.length > 0) {
    const stroke = figmaStyles.strokes[0];
    if (stroke.type === 'SOLID') {
      body += `- Border: rgba(${Math.round(stroke.color.r * 255)}, ${Math.round(stroke.color.g * 255)}, ${Math.round(stroke.color.b * 255)}, ${stroke.opacity || 1})\n`;
    }
  }

  if (figmaStyles.cornerRadius) {
    body += `- Border Radius: ${figmaStyles.cornerRadius}px\n`;
  }

  body += `
---
*Created via [Click-Ship](https://click-ship.dev) Figma Plugin*`;

  return body;
}
