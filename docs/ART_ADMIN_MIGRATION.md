# Art Design Pro Admin Migration

## Runtime layout

- User application: existing Vue 3 application at `/`
- Admin application: Art Design Pro based Vue 3 application at `/admin/`
- API: existing NestJS application at `/v1/`
- Authentication: existing `flux_session` cookie session; no separate admin token system

## Connected Xinyue modules

- Operations overview
- Customer accounts and credit adjustments
- User groups, default group, members, model permissions, pricing multiplier and BYOK policy
- Upstream OpenAI, NewAPI, Sub2API and compatible provider channels
- Frontend model catalog and credit pricing
- Subscription plans, trials, manual grants, active subscriptions and subscription orders
- Recharge packages
- Manual payment, EasyPay, Stripe and external checkout channels
- Payment transaction reconciliation actions
- Redemption code generation and status control
- Site, registration, password, email OTP, Linux.do, SMTP, billing and new-user defaults

## Existing Art pages retained

Art Design Pro's dashboard, examples, widgets, forms, tables, result pages and system examples remain in the route tree. They are not connected to Xinyue business APIs and should be reviewed before production role assignment. They are intentionally retained until product review decides which examples to remove.

## Connected enterprise operations

- Content moderation policy, rule CRUD and incident resolution
- Announcement campaigns and recipient-group delivery
- Inspiration CRUD, cover upload and grouped preview-image upload
- Prompt templates, prompt-library overrides and source controls
- Assistant, tool and external-navigation CRUD
- Support ticket assignment, status, priority and administrator replies
- Jobs, assets, credit ledger, alerts, audits, logins and system health
- Project workflow and version-history review
- Advanced model routing, failover, cost accounting, refund review and webhook reconciliation

## Licensing

Art Design Pro is MIT licensed. Its notice is recorded in `THIRD_PARTY_NOTICES.md`. Other referenced projects remain governed by their own licenses and the existing source ledger.
