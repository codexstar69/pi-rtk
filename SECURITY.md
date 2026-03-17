# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in pi-rtk, please report it through [GitHub Security Advisories](https://github.com/codexstar69/pi-rtk/security/advisories/new).

**Do not open a public issue for security vulnerabilities.**

### What to include

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if you have one)

### Response timeline

- Acknowledgment within 48 hours
- Fix or mitigation plan within 7 days
- Public disclosure after the fix is released

## Scope

pi-rtk processes command output locally and stores analytics in a local SQLite database. It does not make network requests or handle authentication. Security concerns are primarily around:

- **Tee files**: Raw command output is saved to `~/.pi/agent/rtk/tee/`. These files may contain sensitive data from command output. They are stored with default file permissions and rotated automatically.
- **SQLite database**: Stores command names and token counts at `~/.pi/agent/rtk/rtk.db`. Does not store command output content.
- **Settings files**: Stored in `~/.pi/agent/settings.json` (global) or `.pi/settings.json` (project). Contain only configuration, no secrets.
