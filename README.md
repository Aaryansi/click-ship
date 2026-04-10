<p align="center">
  <img src="https://img.shields.io/badge/Click--Ship-AI%20Powered%20UI%20Editor-6366f1?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTEyIDIwaDkiLz48cGF0aCBkPSJNMTYuNSAzLjVhMi4xMiAyLjEyIDAgMCAxIDMgM0w3IDE5bC00IDEgMS00TDE2LjUgMy41eiIvPjwvc3ZnPg==" alt="Click-Ship">
</p>

<h1 align="center">Click-Ship</h1>

<p align="center">
  <strong>Click any element. Describe your change. Ship a pull request.</strong>
</p>

<p align="center">
  <a href="#features"><img src="https://img.shields.io/badge/Features-6366f1?style=flat-square" alt="Features"></a>
  <a href="#installation"><img src="https://img.shields.io/badge/Installation-10b981?style=flat-square" alt="Installation"></a>
  <a href="#usage"><img src="https://img.shields.io/badge/Usage-f59e0b?style=flat-square" alt="Usage"></a>
  <a href="#architecture"><img src="https://img.shields.io/badge/Architecture-ef4444?style=flat-square" alt="Architecture"></a>
  <a href="#roadmap"><img src="https://img.shields.io/badge/Roadmap-8b5cf6?style=flat-square" alt="Roadmap"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Chrome_Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white" alt="OpenAI">
  <img src="https://img.shields.io/badge/GitHub_API-181717?style=flat-square&logo=github&logoColor=white" alt="GitHub API">
  <img src="https://img.shields.io/badge/Fastify-000000?style=flat-square&logo=fastify&logoColor=white" alt="Fastify">
</p>

---

## Overview

Click-Ship is a browser extension that bridges the gap between visual design and source code. Select any element on a webpage, describe your desired change in natural language, and Click-Ship automatically:

1. **Locates** the source file containing the element
2. **Generates** the code modification using AI
3. **Creates** a pull request with the change

No context switching. No manual file hunting. Just click, describe, and ship.

---

## Features

<table>
<tr>
<td width="50%">

### 🎯 **Visual Element Selection**
Click any element with a class or ID to select it for modification. Hover highlighting shows exactly what you're targeting.

### 🤖 **AI-Powered Code Generation**
OpenAI GPT transforms natural language descriptions into syntactically correct JSX/CSS modifications.

### 📝 **Live Preview**
See your changes in real-time before committing. Supports both text changes and CSS properties.

</td>
<td width="50%">

### 🚀 **Automatic PR Creation**
Every change creates a new branch and pull request with detailed diff information.

### 📋 **Change History**
Track all your modifications with timestamps, PR links, and status indicators.

### 💬 **Notes & Annotations**
Leave notes on elements for team members to review and implement later.

</td>
</tr>
</table>

---

## Demo

<p align="center">
  <em>📸 Demo GIF coming soon - showing the click → describe → commit workflow</em>
</p>

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Click element          2. Describe change                  │
│  ┌─────────────────┐       ┌─────────────────────────────────┐ │
│  │   [Button]      │  →    │ "Make text red and bigger"      │ │
│  │   ↑ click       │       │                    [Commit]     │ │
│  └─────────────────┘       └─────────────────────────────────┘ │
│                                                                 │
│  3. PR Created                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ✅ Pull request created: github.com/user/repo/pull/42      ││
│  │    [View PR] [Undo]                                         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         🌐 BROWSER (Chrome Extension)                        │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────┐│
│  │   content.js    │    │  background.js   │    │       auth.js           ││
│  │  ┌───────────┐  │    │  ┌────────────┐  │    │  ┌─────────────────┐   ││
│  │  │ DOM Select│  │───▶│  │ IPC Router │  │───▶│  │ OAuth Handler   │   ││
│  │  │ Preview   │  │    │  │ Msg Relay  │  │    │  │ Token Storage   │   ││
│  │  │ History   │  │    │  └────────────┘  │    │  └─────────────────┘   ││
│  │  └───────────┘  │    └──────────────────┘    └─────────────────────────┘│
│  └─────────────────┘                                                        │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ HTTP POST /edit
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ⚡ SERVER (Node.js/Fastify)                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        THREE-STAGE PIPELINE                             ││
│  │  ┌─────────────┐   ┌─────────────────┐   ┌────────────────────────────┐││
│  │  │  📁 STAGE 1 │   │   🤖 STAGE 2    │   │      🚀 STAGE 3            │││
│  │  │  File       │──▶│   LLM Code      │──▶│      Git Operations        │││
│  │  │  Selection  │   │   Modification  │   │      + PR Creation         │││
│  │  │             │   │                 │   │                            │││
│  │  │  fast-glob  │   │   OpenAI API    │   │   simple-git + Octokit     │││
│  │  └─────────────┘   └─────────────────┘   └────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Stage 1: File Selection
- Extracts first CSS class/ID from selector (e.g., `.btn-primary` → `btn-primary`)
- Glob search across `src/**/*.{tsx,jsx,js,html,css}`
- First file containing the token is selected

### Stage 2: LLM Code Modification
- Extracts 20 lines of context (±10 from target line)
- OpenAI GPT with JSX-aware system prompt
- Temperature: 0.1 for deterministic output
- Fallback regex patterns if AI unavailable

### Stage 3: Git Operations
- Creates timestamped branch: `click-ship/{timestamp}-{description}`
- Commits with user attribution
- Pushes and creates PR via GitHub API

---

## Installation

### Prerequisites

| Requirement | Version |
|-------------|---------|
| ![Node.js](https://img.shields.io/badge/Node.js-v14+-339933?style=flat-square&logo=nodedotjs&logoColor=white) | v14 or higher |
| ![Chrome](https://img.shields.io/badge/Chrome-Latest-4285F4?style=flat-square&logo=googlechrome&logoColor=white) | Latest version |
| ![GitHub](https://img.shields.io/badge/GitHub-Account-181717?style=flat-square&logo=github&logoColor=white) | OAuth App required |
| ![OpenAI](https://img.shields.io/badge/OpenAI-API_Key-412991?style=flat-square&logo=openai&logoColor=white) | API key required |

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-username/click-ship.git
cd click-ship

# 2. Install dependencies
npm install
cd packages/server && npm install
cd ../extension && npm install
cd ../..

# 3. Configure environment
cp packages/server/.env.example packages/server/.env
cp packages/server/repos.example.json packages/server/repos.json
# Edit both files with your credentials

# 4. Start the server
cd packages/server && npm start
```

### Chrome Extension Setup

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select `packages/extension` folder
5. Copy the **Extension ID** (you'll need this for OAuth)

### GitHub OAuth Configuration

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in the details:
   - **Application name:** Click-Ship
   - **Homepage URL:** `http://localhost:8080`
   - **Callback URL:** `https://<YOUR_EXTENSION_ID>.chromiumapp.org/oauth2`
4. Copy **Client ID** and **Client Secret** to your `.env` file

### Configuration Files

<details>
<summary><strong>📄 packages/server/.env</strong></summary>

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-api-key-here
AI_MODEL=gpt-3.5-turbo

# GitHub OAuth
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret

# Authorization
ALLOWED_USERS=your-github-username

# Server
PORT=8080
```
</details>

<details>
<summary><strong>📄 packages/server/repos.json</strong></summary>

```json
{
  "localhost": {
    "path": "/absolute/path/to/your/project",
    "github": {
      "owner": "your-username",
      "repo": "your-repo",
      "baseBranch": "main"
    },
    "allowedUsers": ["your-username", "teammate"]
  }
}
```
</details>

---

## Usage

### Basic Workflow

| Step | Action | Result |
|------|--------|--------|
| 1️⃣ | Click any element on your local dev site | Element highlighted, modal opens |
| 2️⃣ | Sign in with GitHub (first time only) | OAuth authentication |
| 3️⃣ | Type your change (e.g., `padding: 24px`) | Live preview updates |
| 4️⃣ | Click **Commit** | PR created automatically |

### Supported Change Formats

```javascript
// CSS Properties
"padding: 24px"
"color: red"
"font-size: 18px"

// Text Replacement
"text -> New Button Text"
"Hello -> Goodbye"

// Tailwind Classes (via fallback)
"red"           // adds text-red-500
"bigger"        // adds text-2xl font-bold
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Esc` | Close modal / Revert preview |
| `Ctrl/Cmd + Enter` | Submit change |

---

## API Reference

### Endpoints

<details>
<summary><strong>POST /auth/github</strong> - Exchange OAuth code for token</summary>

**Request:**
```json
{
  "code": "oauth-code-from-github",
  "redirectUri": "https://extension-id.chromiumapp.org/oauth2"
}
```

**Response:**
```json
{
  "token": "gho_xxxxxxxxxxxx",
  "user": {
    "login": "username",
    "name": "Full Name",
    "email": "user@example.com",
    "avatar_url": "https://avatars.githubusercontent.com/..."
  }
}
```
</details>

<details>
<summary><strong>POST /edit</strong> - Apply a code modification</summary>

**Request:**
```json
{
  "hostname": "localhost",
  "selector": "button.btn-primary",
  "desiredChange": "padding: 24px",
  "githubToken": "gho_xxxxxxxxxxxx"
}
```

**Response:**
```json
{
  "ok": true,
  "file": "/path/to/Component.tsx",
  "change": "padding: 24px",
  "ai": true,
  "modifiedLine": "<button className=\"btn-primary\" style={{padding: '24px'}}>",
  "branch": "click-ship/1234567890-padding-24px",
  "prUrl": "https://github.com/owner/repo/pull/42",
  "prNumber": 42
}
```
</details>

<details>
<summary><strong>POST /close-pr</strong> - Close a pull request</summary>

**Request:**
```json
{
  "owner": "username",
  "repo": "repo-name",
  "prNumber": 42,
  "githubToken": "gho_xxxxxxxxxxxx"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "PR #42 closed and branch deleted"
}
```
</details>

---

## Security

### Authorization Model

Users are authorized if **any** of these conditions are met:

| Level | Check | Location |
|-------|-------|----------|
| 1️⃣ | Listed in `allowedUsers` | `repos.json` |
| 2️⃣ | Listed in `ALLOWED_USERS` | `.env` |
| 3️⃣ | Has write/admin access | GitHub repository |

### Security Measures

- ✅ Input validation for hostname, selector, and change descriptions
- ✅ XSS prevention with HTML escaping
- ✅ CORS restricted to known origins
- ✅ Request body size limits (1MB)
- ✅ GitHub token required for all operations
- ✅ OAuth scope limited to `repo,read:org`

### Best Practices

> ⚠️ **Never commit sensitive files:**
> - `.env` files contain API keys
> - `repos.json` contains local file paths
> - Both are in `.gitignore`

---

## Tech Stack

<table>
<tr>
<td align="center" width="96">
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" width="48" height="48" alt="JavaScript" />
  <br>JavaScript
</td>
<td align="center" width="96">
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" width="48" height="48" alt="Node.js" />
  <br>Node.js
</td>
<td align="center" width="96">
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/chrome/chrome-original.svg" width="48" height="48" alt="Chrome" />
  <br>Chrome APIs
</td>
<td align="center" width="96">
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/github/github-original.svg" width="48" height="48" alt="GitHub" />
  <br>GitHub API
</td>
</tr>
</table>

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `fastify` | ^4.24.3 | HTTP server framework |
| `@octokit/rest` | ^22.0.1 | GitHub API client |
| `simple-git` | ^3.21.0 | Git operations |
| `fast-glob` | ^3.3.2 | File pattern matching |
| `openai` | ^4.20.0 | AI code generation |
| `@fastify/cors` | ^8.4.0 | CORS middleware |

---

## Roadmap

### 🚧 In Progress

| Feature | Status | Description |
|---------|--------|-------------|
| Rate Limiting | 🔄 Planned | Add `@fastify/rate-limit` to prevent abuse |
| Request Timeouts | 🔄 Planned | Add timeouts to OpenAI and GitHub API calls |
| Webhook Signatures | 🔄 Planned | HMAC-SHA256 verification for requests |
| Audit Logging | 🔄 Planned | Track all authorization attempts |

### 📋 Planned Improvements

<details>
<summary><strong>🔒 Security Enhancements</strong></summary>

- [ ] Move OAuth Client ID to secure configuration
- [ ] Implement short-lived token rotation
- [ ] Add request schema validation with Fastify schemas
- [ ] Remove `<all_urls>` permission from manifest
- [ ] Add HTTPS support for production deployment

</details>

<details>
<summary><strong>🎯 File Selection Improvements</strong></summary>

- [ ] AST-based file localization for better accuracy
- [ ] Support for CSS Modules and styled-components
- [ ] Multi-file change detection
- [ ] Component hierarchy understanding
- [ ] Tailwind JIT class support

</details>

<details>
<summary><strong>🤖 AI Enhancements</strong></summary>

- [ ] Multi-line code modifications
- [ ] Component-level refactoring
- [ ] Syntax validation before commit
- [ ] GPT-4 support for complex changes
- [ ] Local LLM fallback option

</details>

<details>
<summary><strong>📊 UX Improvements</strong></summary>

- [ ] Keyboard-only navigation
- [ ] Batch change operations
- [ ] Undo/redo stack with git integration
- [ ] Team collaboration features
- [ ] Change synchronization across browsers

</details>

### 🐛 Known Limitations

| Issue | Impact | Workaround |
|-------|--------|------------|
| Single file match | May select wrong file if class duplicated | Use unique class names |
| Line-level only | Cannot refactor multi-line structures | Make smaller changes |
| No merge conflict handling | Conflicts must be resolved in GitHub | Keep branches short-lived |
| Visual undo only | PR stays open after undo | Close PR manually |

---

## Metrics

### Code Statistics

| Component | Lines | Purpose |
|-----------|-------|---------|
| `content.js` | ~2,650 | UI, DOM interaction, history |
| `server/index.js` | ~680 | API, file search, git operations |
| `background.js` | ~175 | OAuth, message routing |
| `auth.js` | ~60 | Token management |
| **Total** | **~3,565** | |

### Configuration Limits

| Parameter | Value | Location |
|-----------|-------|----------|
| LLM Context | 20 lines | server/index.js:267 |
| Temperature | 0.1 | server/index.js:53 |
| Max Tokens | 150 | server/index.js:54 |
| History Items | 50 max | content.js:1181 |
| Notes per Host | 100 max | content.js:1498 |
| Body Size Limit | 1MB | server/index.js |

---

## Related Work

This tool addresses similar challenges to recent research in LLM-based code agents:

| Paper | Venue | Relation |
|-------|-------|----------|
| **Agentless** (Zhang et al.) | FSE 2025 | Hierarchical file localization; Click-Ship uses simpler substring matching but operates on DOM |
| **TransAgent** (Lou et al.) | - | Test-based validation for code changes; shares accurate modification challenges |
| **USEagent** (Tan et al.) | ICSE 2026 | LLM search-and-repair; Click-Ship operates at visual→code abstraction level |

Click-Ship differs by starting from rendered DOM output rather than source-level specifications, using browser inspection to bridge visual intent with code locations.

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Run server with auto-reload
cd packages/server
npm run dev

# Watch extension changes
# Reload extension in chrome://extensions after changes
```

---

## License

ISC License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built with ❤️ for developers who want to ship faster</strong>
</p>

<p align="center">
  <a href="https://github.com/your-username/click-ship/issues">Report Bug</a>
  ·
  <a href="https://github.com/your-username/click-ship/issues">Request Feature</a>
</p>
