# Contributing

Thanks for helping! Bug reports, translations, docs and code are all welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.
- Keep the scope of the project in mind: a single-user, self-hosted tracker. Booking, accounts/multi-user and fare prediction are out of scope by decision.

## Development setup

See the *Development* section of the [README](README.md). In short: Python 3.12 for `backend/`, Node 22 for `frontend/`.

Before opening a pull request:

```bash
cd backend && ruff check . && pytest
cd frontend && npm run build
```

CI also lints the Dockerfile, builds the image and runs a smoke test.

## Guidelines

- **Be gentle with Google.** Never add code that increases request volume to Google Flights (parallel searches, retries from the same IP, shorter default intervals). Tests must never hit the network; use the fake provider in `backend/tests/conftest.py`.
- **Errors must stay honest.** A refused or failed search must never be shown as "no flights".
- **Secrets stay secret.** Channel URLs and proxy credentials must never appear in API responses, logs or notifications.
- Code comments are mostly in Portuguese; new comments may be in Portuguese or English.

## Translations

Every user-facing string must exist in both **pt-BR** and **en**.

- **Interface:** `frontend/src/i18n/locales/pt-BR.ts` is the source of truth and `en.ts` must have the same keys (TypeScript fails the build otherwise). Use `const { t } = useI18n()` and `t("section.key", { var })`.
- **Server** (error messages, notifications): `backend/app/i18n.py`. A test checks that both languages have the same keys.

Adding a new language means adding a locale file in each place, registering it, and adding it to the language switcher. Open an issue first and we will help.

## Commits and pull requests

- Small, focused PRs are easier to review.
- Describe *what* and *why* in the PR; fill in the checklist in the template.
- By contributing you agree that your contributions are licensed under the [AGPL-3.0](LICENSE).
