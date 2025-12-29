# Click-Ship Setup Guide

This guide will walk you through setting up Click-Ship with GitHub authentication and pull request workflow.

## Prerequisites

- Node.js (v14 or higher)
- Git
- A GitHub account
- Chrome browser

## Step 1: Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in the application details:
   - **Application name**: Click-Ship
   - **Homepage URL**: `http://localhost:8080` (or your server URL)
   - **Application description**: AI-powered UI editing tool
   - **Authorization callback URL**: You'll need your extension ID first (see Step 3)
4. Click **"Register application"**
5. Copy the **Client ID** (you'll need this in Step 4) - Client ID
Ov23liHllcCFZ0fZ9FJN
6. Click **"Generate a new client secret"** and copy it (you'll need this in Step 4) - aec1d9c88d893f1b2636619b1251c394d6107948


## Step 2: Install Dependencies

```bash
# Install root dependencies
npm install

# Install server dependencies
cd packages/server
npm install

# Install extension dependencies (if any)
cd ../extension
npm install
```

## Step 3: Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **"Developer mode"** (toggle in top right)
3. Click **"Load unpacked"**
4. Select the `packages/extension` folder
5. **Copy the Extension ID** (it looks like: `abcdefghijklmnopqrstuvwxyz123456`)

## Step 4: Update GitHub OAuth Callback URL

1. Go back to your GitHub OAuth App settings
2. Update the **Authorization callback URL** to:
   ```
   https://<YOUR_EXTENSION_ID>.chromiumapp.org/oauth2
   ```
   Replace `<YOUR_EXTENSION_ID>` with the ID you copied in Step 3
3. Save changes

## Step 5: Configure the Extension

1. Open `packages/extension/auth.js`
2. Replace `YOUR_GITHUB_CLIENT_ID` with your actual GitHub OAuth Client ID:
   ```javascript
   const GITHUB_CLIENT_ID = 'your_actual_client_id_here';
   ```

## Step 6: Configure the Server

1. Copy the example environment file:
   ```bash
   cd packages/server
   cp .env.example .env
   ```

2. Edit `.env` and fill in your credentials:
   ```bash
   # OpenAI Configuration
   OPENAI_API_KEY=sk-your-actual-openai-api-key
   AI_MODEL=gpt-3.5-turbo
   AI_SERVICE=openai

   # GitHub OAuth Configuration
   GITHUB_CLIENT_ID=your_github_oauth_client_id
   GITHUB_CLIENT_SECRET=your_github_oauth_client_secret

   # Authorization (your GitHub username)
   ALLOWED_USERS=your_github_username

   # Server Configuration
   PORT=8080
   ```

## Step 7: Configure Repository Mapping

1. Edit `packages/server/repos.json`:
   ```json
   {
     "localhost": {
       "path": "C:/path/to/your/project",
       "github": {
         "owner": "your-github-username",
         "repo": "your-repo-name",
         "baseBranch": "main"
       },
       "allowedUsers": ["your-github-username", "designer1", "pm1"]
     }
   }
   ```

2. Adjust the configuration:
   - **path**: Local file system path to your project
   - **owner**: GitHub username or organization
   - **repo**: Repository name
   - **baseBranch**: Base branch for PRs (usually "main" or "master")
   - **allowedUsers**: GitHub usernames allowed to make changes

## Step 8: Start the Server

```bash
cd packages/server
npm start
```

You should see:
```
→ Using OpenAI with JSX awareness
→ Model: gpt-3.5-turbo
⚡ server listening on http://0.0.0.0:8080
```

## Step 9: Test the Setup

1. Open your local development website (e.g., `http://localhost:3000`)
2. Click on any element with a class or ID
3. You should see a login prompt
4. Click **"Login with GitHub"**
5. Authorize the application
6. Try making a change!

## How It Works

### User Flow

1. **Click** an element on your website
2. **Authenticate** with GitHub (first time only)
3. **Describe** the change you want
4. **Preview** the change live
5. **Commit** - Creates a pull request automatically

### Pull Request Flow

When you commit a change:
1. Creates a new branch: `click-ship/{timestamp}-{description}`
2. Commits the change with your GitHub username
3. Pushes to remote
4. Creates a pull request
5. Shows you the PR link

### Authorization

Users are authorized if they meet ANY of these criteria:
1. Listed in `repos.json` → `allowedUsers` array
2. Listed in `.env` → `ALLOWED_USERS` variable
3. Have write access to the GitHub repository

## Troubleshooting

### "No GitHub token provided"
- Make sure you've logged in with GitHub
- Check Chrome DevTools console for errors
- Try logging out and logging in again

### "GitHub OAuth not configured"
- Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are in `.env`
- Restart the server after editing `.env`

### "Authorization failed"
- Check that your GitHub username is in `allowedUsers` or `ALLOWED_USERS`
- Verify the repository configuration in `repos.json`

### OAuth redirect error
- Verify the callback URL in GitHub OAuth app settings
- Make sure it matches: `https://<extension-id>.chromiumapp.org/oauth2`
- Reload the extension and get the new ID if it changed

### PR creation failed
- Check that the GitHub repo configuration is correct
- Verify your token has `repo` scope
- Make sure the base branch exists

### Git push failed
- Ensure your local repo has a remote configured
- Check that you have push permissions
- Verify the branch doesn't already exist

## Adding More Projects

To add more websites/projects:

```json
{
  "localhost": {
    "path": "C:/Users/you/Documents/project1",
    "github": {
      "owner": "username",
      "repo": "project1",
      "baseBranch": "main"
    },
    "allowedUsers": ["username"]
  },
  "staging.myapp.com": {
    "path": "C:/Users/you/Documents/project2",
    "github": {
      "owner": "company",
      "repo": "project2",
      "baseBranch": "develop"
    },
    "allowedUsers": ["designer1", "designer2", "pm1"]
  }
}
```

## Security Best Practices

1. Never commit `.env` to git (it's in `.gitignore`)
2. Use environment-specific OAuth apps (dev, staging, prod)
3. Regularly rotate your GitHub OAuth client secret
4. Only add trusted users to `allowedUsers`
5. Review PRs before merging, even from trusted users

## Next Steps

- Set up CI/CD to test PRs automatically
- Configure branch protection rules
- Add team-based authorization using GitHub teams
- Implement undo functionality
- Add more sophisticated change detection

## Support

If you encounter issues:
1. Check the server logs (`packages/server`)
2. Check Chrome DevTools console
3. Verify all configuration files
4. Make sure all dependencies are installed
