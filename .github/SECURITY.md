# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch.

## Threat model

Web Mock Studio runs entirely in the browser and has no server component. The areas most
relevant to security are:

- **The Service Worker** (`public/mock-sw.js`), which can answer requests for its scope.
- **Workspace import**, which parses untrusted JSON files.
- **The drop-in interceptor script**, which users paste into other pages.
- **Response bodies** rendered in the UI, which must never be executed as HTML or script.

## Reporting a vulnerability

Please do not open a public issue. Report privately through
[GitHub security advisories](https://github.com/zzoraemon043/web-mock-studio/security/advisories/new)
with a description, reproduction steps and the affected version or commit.

You can expect an acknowledgement within 72 hours and a status update within 7 days. Once a fix
is released, the advisory will be published with credit to the reporter unless anonymity is
requested.
