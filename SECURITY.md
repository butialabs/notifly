# Security policy

## Supported versions

Only the latest release (and `main`) receives security fixes. Please upgrade before reporting.

## Reporting a vulnerability

**Do not open a public issue.** Report it privately through
[GitHub Security Advisories](https://github.com/butialabs/notifly/security/advisories/new).

Please include the affected version, how to reproduce it and the impact you expect. We aim to acknowledge reports within 7 days and to ship a fix or mitigation within 90 days, and we will credit you in the advisory unless you prefer otherwise.

## Scope and threat model

Notifly is a single-user, self-hosted app. Keep this in mind when assessing impact:

- **Without `NOTIFLY_PASSWORD`, there is no authentication by design.** Anyone who can reach the port has full access. Reports that boil down to "an unauthenticated instance exposed to the internet is accessible" are out of scope; reports that bypass the password, the Host allow-list, the CSRF protections or the anti-framing headers are in scope.
- Notification channel URLs contain secrets (bot tokens, SMTP passwords). Anything that leaks them through the API, logs or notifications is in scope.
- The unofficial Google Flights access (being rate-limited or blocked by Google) is not a security issue.

## Hardening checklist for operators

- Set `NOTIFLY_PASSWORD` or put an authenticating reverse proxy in front.
- Serve it over HTTPS and set `NOTIFLY_PUBLIC_URL` to the `https://` URL.
- Behind a proxy, set `FORWARDED_ALLOW_IPS` to the proxy IP.
- Keep the port bound to `127.0.0.1` unless you need it on the network.
- Verify image signatures with cosign (see README) and keep the image updated.
