# Changelog

All notable changes to Click-Ship will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Security

- **Fixed**: XSS vulnerability in user info display - now escapes HTML in usernames and validates avatar URLs
- **Fixed**: CORS misconfiguration - restricted to known origins instead of allowing all
- **Fixed**: Port mismatch between extension and server - now consistently uses port 8080
- **Added**: Input validation for hostname, selector, and change descriptions
- **Added**: Request body size limit (1MB) to prevent DOS attacks
- **Added**: `repos.json` to `.gitignore` to prevent path exposure
- **Added**: `repos.example.json` template file

### Changed

- Server URL now configurable via constant in both `background.js` and `content.js`
- Improved error messages for validation failures

## [0.0.1] - 2025-12-XX

### Added

- Live preview feature - see changes in real-time before committing
- Notes and annotations - leave feedback on elements for team members
- Change history sidebar with PR actions
- Branch deletion when closing PRs
- Keyboard shortcuts (Esc to cancel, Ctrl/Cmd+Enter to submit)
- Loading states and progress indicators
- Undo functionality for visual changes

### Features

- Click any DOM element to select it for modification
- Natural language change descriptions
- AI-powered code generation using OpenAI GPT
- Automatic PR creation with diff in body
- GitHub OAuth authentication
- Multi-tier authorization (config, env, GitHub permissions)

### Technical

- Chrome Extension (Manifest V3)
- Node.js/Fastify backend
- simple-git for Git operations
- Octokit for GitHub API
- fast-glob for file search
