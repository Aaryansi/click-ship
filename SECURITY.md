# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.0.1   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by:

1. **Do NOT** open a public GitHub issue
2. Email the maintainers directly with details
3. Include steps to reproduce the vulnerability
4. Allow reasonable time for a fix before public disclosure

## Security Measures

### Implemented

| Measure | Description | Location |
|---------|-------------|----------|
| Input Validation | Hostname, selector, and change validation | `server/index.js` |
| XSS Prevention | HTML escaping for user data in UI | `content.js` |
| CORS Restrictions | Origin-based access control | `server/index.js` |
| Body Size Limits | 1MB request limit | `server/index.js` |
| Authorization | Multi-tier permission checking | `server/index.js` |
| Secure Token Storage | Chrome storage API | `auth.js` |

### Configuration Security

**Never commit these files:**
- `.env` - Contains API keys and secrets
- `repos.json` - Contains local file paths

Both files are included in `.gitignore`.

### OAuth Security

- OAuth scope limited to `repo,read:org`
- Token exchange via secure server endpoint
- Tokens stored in Chrome's encrypted storage

## Security Audit Checklist

### Before Deployment

- [ ] Rotate any exposed OAuth credentials
- [ ] Verify `.env` and `repos.json` are in `.gitignore`
- [ ] Review CORS allowed origins
- [ ] Enable HTTPS for production
- [ ] Review `allowedUsers` configurations

### Periodic Review

- [ ] Check for dependency vulnerabilities: `npm audit`
- [ ] Review GitHub OAuth app settings
- [ ] Audit `allowedUsers` lists
- [ ] Review server access logs

## Known Considerations

1. **OAuth Client ID**: Currently hardcoded in extension. For production, consider:
   - Using environment-specific OAuth apps
   - Loading from manifest configuration

2. **Local Development**: HTTP is acceptable for localhost but HTTPS is required for any remote deployment.

3. **Token Lifetime**: GitHub tokens do not expire by default. Consider implementing token rotation.

## Security Contact

For security concerns, contact the repository maintainers.
