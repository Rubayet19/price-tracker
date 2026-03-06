---
paths:
  - "libs/stripe.ts"
  - "libs/auth.ts"
  - "libs/cron-auth.ts"
  - "libs/entitlements.ts"
  - "app/api/webhook/**"
  - "app/api/cron/**"
  - "config.ts"
  - ".env*"
---

# Security-Critical Code

These files handle authentication, payments, access control, and secrets.

- Never skip Stripe webhook signature verification.
- Entitlements must be enforced server-side only — never trust client-side checks.
- Cron endpoints must be protected by `CRON_SECRET` via `libs/cron-auth.ts`.
- Never hardcode API keys or secrets — use `process.env`.
- Invoke `/stripe-best-practices` when modifying Stripe integration code.
- Run `everything-claude-code:security-reviewer` agent after changes to these files.
