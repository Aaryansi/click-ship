# Click-Ship Cloud Migration - Implementation Plan

## Git Workflow

Each feature will be implemented on a separate branch, reviewed, and merged via PR.

**Branch Naming Convention:** `feature/<phase>-<feature-name>`

**Commit Convention:**
- `feat:` new features
- `fix:` bug fixes
- `refactor:` code restructuring
- `docs:` documentation
- `chore:` maintenance tasks

---

## Phase 1: Cloud Foundation

### Branch 1.1: `feature/1.1-supabase-schema`
**Scope:** Database schema only
**Files:**
- `packages/server/supabase/migrations/001_initial.sql`

**Commits:**
1. `feat: add organizations and users tables`
2. `feat: add repositories and org_memberships tables`
3. `feat: add edits and annotations tables`
4. `feat: add sessions and audit_log tables`
5. `feat: add RLS policies and triggers`

**PR Description:** Initial Supabase database schema for multi-tenant SaaS

---

### Branch 1.2: `feature/1.2-supabase-client`
**Scope:** Supabase client library
**Files:**
- `packages/server/lib/supabase.js`

**Commits:**
1. `feat: add supabase client initialization`
2. `feat: add user CRUD operations`
3. `feat: add organization operations`
4. `feat: add repository operations`
5. `feat: add edit and annotation operations`
6. `feat: add session management functions`

**PR Description:** Supabase client library with database operations

---

### Branch 1.3: `feature/1.3-github-api-helpers`
**Scope:** GitHub Content API helpers (replacing local fs)
**Files:**
- `packages/server/lib/github.js`

**Commits:**
1. `feat: add GitHub App authentication setup`
2. `feat: add file content read/write functions`
3. `feat: add branch and commit operations`
4. `feat: add PR creation and management`
5. `feat: add repository info and permission checks`
6. `feat: add webhook handling utilities`

**PR Description:** GitHub API helpers for cloud-native file operations

---

### Branch 1.4: `feature/1.4-auth-module`
**Scope:** JWT authentication and authorization
**Files:**
- `packages/server/lib/auth.js`

**Commits:**
1. `feat: add GitHub OAuth code exchange`
2. `feat: add JWT token generation and verification`
3. `feat: add Fastify auth middleware`
4. `feat: add permission checking functions`
5. `feat: add API key authentication for integrations`

**PR Description:** Authentication module with JWT sessions and GitHub OAuth

---

### Branch 1.5: `feature/1.5-vercel-deployment`
**Scope:** Vercel deployment configuration
**Files:**
- `packages/server/vercel.json`
- `packages/server/.env.example` (update)

**Commits:**
1. `feat: add vercel.json deployment config`
2. `docs: update .env.example with cloud variables`

**PR Description:** Vercel deployment configuration

---

### Branch 1.6: `feature/1.6-server-package-update`
**Scope:** Update server dependencies
**Files:**
- `packages/server/package.json`

**Commits:**
1. `chore: add cloud dependencies (supabase, babel, jwt)`
2. `chore: update package version to 2.0.0`
3. `chore: add deployment scripts`

**PR Description:** Update server package with cloud dependencies

---

## Phase 2: AI Pipeline Upgrade

### Branch 2.1: `feature/2.1-ai-module`
**Scope:** GPT-4 integration with better prompts
**Files:**
- `packages/server/lib/ai.js`

**Commits:**
1. `feat: add GPT-4 code modification prompt`
2. `feat: add generateCodeChange function with JSON output`
3. `feat: add code application with fuzzy matching`
4. `feat: add selector analysis helper`
5. `feat: add Figma style conversion`
6. `feat: add syntax validation`

**PR Description:** Upgraded AI module with GPT-4 and better context handling

---

### Branch 2.2: `feature/2.2-ast-locator`
**Scope:** AST-based element finding
**Files:**
- `packages/server/lib/ast-locator.js`

**Commits:**
1. `feat: add CSS selector parsing`
2. `feat: add JSX element finder with Babel`
3. `feat: add className extraction (string, template, clsx)`
4. `feat: add context extraction with line numbers`
5. `feat: add file search helper`

**PR Description:** AST-based file localization using Babel parser

---

### Branch 2.3: `feature/2.3-design-tokens`
**Scope:** Design token extraction
**Files:**
- `packages/server/lib/design-tokens.js`

**Commits:**
1. `feat: add Tailwind config parser`
2. `feat: add CSS variables parser`
3. `feat: add tokens.json parser`
4. `feat: add color matching utilities`
5. `feat: add spacing matching utilities`

**PR Description:** Design token extraction from Tailwind and CSS variables

---

## Phase 3: Extension Modernization

### Branch 3.1: `feature/3.1-extension-shared`
**Scope:** Shared modules for extension
**Files:**
- `packages/extension/src/shared/constants.js`
- `packages/extension/src/shared/storage.js`

**Commits:**
1. `feat: add shared constants (API_URL, message types)`
2. `feat: add storage wrapper with typed operations`
3. `feat: add edit history storage functions`
4. `feat: add annotations storage functions`
5. `feat: add preferences storage functions`

**PR Description:** Shared modules for extension with storage abstraction

---

### Branch 3.2: `feature/3.2-extension-background`
**Scope:** Background service worker refactor
**Files:**
- `packages/extension/src/background/index.js`
- `packages/extension/src/background/auth.js`
- `packages/extension/src/background/api.js`

**Commits:**
1. `feat: add background service worker entry point`
2. `feat: add auth module with OAuth flow`
3. `feat: add API communication module`
4. `feat: add context menu handlers`
5. `feat: add badge and command handlers`

**PR Description:** Refactored background service worker with modular structure

---

### Branch 3.3: `feature/3.3-extension-content-core`
**Scope:** Content script core modules
**Files:**
- `packages/extension/src/content/index.js`
- `packages/extension/src/content/utils.js`
- `packages/extension/src/content/styles.js`

**Commits:**
1. `feat: add content script entry point`
2. `feat: add selector generation utilities`
3. `feat: add element highlighting utilities`
4. `feat: add injected CSS styles`

**PR Description:** Content script core with utilities and styles

---

### Branch 3.4: `feature/3.4-extension-content-ui`
**Scope:** Content script UI components
**Files:**
- `packages/extension/src/content/modal.js`
- `packages/extension/src/content/sidebar.js`
- `packages/extension/src/content/preview.js`

**Commits:**
1. `feat: add edit modal component`
2. `feat: add history sidebar component`
3. `feat: add annotations sidebar component`
4. `feat: add live preview component`

**PR Description:** Content script UI components (modal, sidebar, preview)

---

### Branch 3.5: `feature/3.5-extension-build`
**Scope:** Vite build configuration
**Files:**
- `packages/extension/vite.config.js`
- `packages/extension/package.json` (update)

**Commits:**
1. `feat: add Vite build configuration`
2. `chore: add build dependencies (vite, crxjs)`
3. `chore: add build scripts`

**PR Description:** Modern build system with Vite and CRXJS

---

## Phase 4: Figma Plugin

### Branch 4.1: `feature/4.1-figma-plugin-setup`
**Scope:** Figma plugin configuration
**Files:**
- `packages/figma-plugin/manifest.json`
- `packages/figma-plugin/package.json`
- `packages/figma-plugin/tsconfig.json`
- `packages/figma-plugin/scripts/build-ui.js`

**Commits:**
1. `feat: add Figma plugin manifest`
2. `chore: add plugin package.json with build scripts`
3. `chore: add TypeScript configuration`
4. `feat: add UI build script`

**PR Description:** Figma plugin project setup

---

### Branch 4.2: `feature/4.2-figma-plugin-code`
**Scope:** Figma plugin main code
**Files:**
- `packages/figma-plugin/src/code.ts`

**Commits:**
1. `feat: add plugin initialization and UI`
2. `feat: add style extraction from nodes`
3. `feat: add selection change handling`
4. `feat: add message handlers`

**PR Description:** Figma plugin main code with style extraction

---

### Branch 4.3: `feature/4.3-figma-plugin-ui`
**Scope:** Figma plugin UI
**Files:**
- `packages/figma-plugin/src/ui.html`
- `packages/figma-plugin/src/ui.ts`
- `packages/figma-plugin/src/api.ts`

**Commits:**
1. `feat: add plugin UI HTML and styles`
2. `feat: add UI logic and state management`
3. `feat: add API client for Click-Ship`
4. `feat: add auth flow handling`
5. `feat: add PR creation UI`

**PR Description:** Figma plugin UI with Click-Ship integration

---

### Branch 4.4: `feature/4.4-figma-server-routes`
**Scope:** Server routes for Figma
**Files:**
- `packages/server/routes/figma.js`

**Commits:**
1. `feat: add POST /figma/edit endpoint`
2. `feat: add GET /figma/repos endpoint`
3. `feat: add POST /figma/preview endpoint`

**PR Description:** Server routes for Figma plugin integration

---

## Phase 5: Slack Integration

### Branch 5.1: `feature/5.1-slack-notifications`
**Scope:** Slack notification module
**Files:**
- `packages/server/lib/slack-notifications.js`

**Commits:**
1. `feat: add PR created notification`
2. `feat: add PR merged/closed notifications`
3. `feat: add annotation notification`
4. `feat: add interactive component handlers`

**PR Description:** Slack notification module for PR events

---

### Branch 5.2: `feature/5.2-slack-routes`
**Scope:** Slack integration routes
**Files:**
- `packages/server/routes/slack.js`

**Commits:**
1. `feat: add /slack/commands endpoint`
2. `feat: add /slack/interactive endpoint`
3. `feat: add /slack/oauth/callback endpoint`
4. `feat: add /slack/events endpoint`
5. `feat: add signature verification`

**PR Description:** Slack bot integration routes

---

## Phase 6: Linear Integration

### Branch 6.1: `feature/6.1-linear-routes`
**Scope:** Linear integration routes
**Files:**
- `packages/server/routes/linear.js`

**Commits:**
1. `feat: add Linear OAuth flow`
2. `feat: add webhook handling`
3. `feat: add PR-to-issue linking`
4. `feat: add issue fetching API`

**PR Description:** Linear integration for issue tracking

---

## Phase 7: Server Integration

### Branch 7.1: `feature/7.1-server-cloud-routes`
**Scope:** Update server index.js with cloud routes
**Files:**
- `packages/server/index.js`

**Commits:**
1. `refactor: convert to ES modules`
2. `feat: add cloud route imports`
3. `feat: add auth middleware registration`
4. `feat: add health check endpoint`
5. `refactor: update /edit to use cloud services`
6. `feat: add webhook routes`

**PR Description:** Integrate cloud services into main server

---

## Implementation Order

```
Week 1:
  1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6

Week 2:
  2.1 → 2.2 → 2.3

Week 3:
  3.1 → 3.2 → 3.3 → 3.4 → 3.5

Week 4-5:
  4.1 → 4.2 → 4.3 → 4.4

Week 6:
  5.1 → 5.2

Week 7:
  6.1

Week 8:
  7.1 (Integration)
```

---

## Verification Checklist

### After Phase 1
- [ ] Supabase tables created
- [ ] Server deploys to Vercel
- [ ] Health endpoint responds

### After Phase 2
- [ ] AST locator finds elements
- [ ] GPT-4 generates valid modifications
- [ ] Design tokens extracted

### After Phase 3
- [ ] Extension builds with Vite
- [ ] Auth flow works
- [ ] Edits create PRs

### After Phase 4
- [ ] Figma plugin loads
- [ ] Styles extracted from selection
- [ ] PRs created from Figma

### After Phase 5-6
- [ ] Slack notifications work
- [ ] Linear issues linked

### After Phase 7
- [ ] Full end-to-end flow works
- [ ] Cloud deployment functional
