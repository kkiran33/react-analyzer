# Build Plan — "Master Stock Market Using AI" Workshop Platform

> A comprehensive system plan derived from the reference landing page (1-day
> live workshop, SEBI-registered research analysts, paid enrollment). This
> document defines scope, architecture, data model, screens, integrations, and
> a phased delivery roadmap.

---

## 1. What the screenshot is

The reference is the **top of a mobile marketing/registration funnel** for a
paid, instructor-led workshop:

- **Headline / promise** — "Learn How AI Tools Support Smarter, Data-Driven Trading & Investing" / "Master Stock Market Using AI".
- **Hero** — banner image, instructor photos, "Join 1 Day Workshop".
- **Credibility** — instructor names & titles (Ex-Hedge Fund Trader & Investment Banker), **SEBI Registered Research Analyst Reg. No. INH000022950**.
- **Event facts** — Date (July 19, 2026), Time (11:00 AM), Duration (3+ Hours), Format (Live Session).
- **Value props** — three checkmark benefits.
- **CTA** — "Enroll Now" + "No Prior Experience Needed".

A single static page like this is only the visible tip. A **comprehensive
system** is everything required to run this as a repeatable business: capture
leads, take payment, deliver the live session, remind attendees, and measure
conversion — with compliance baked in.

---

## 2. Goals & success metrics

| Goal | Metric (KPI) |
|------|--------------|
| Convert visitors to registrants | Landing → registration rate (target ≥ 25%) |
| Convert registrants to paid | Registration → paid rate (target ≥ 8%) |
| Maximize live attendance | Registered → attended rate (target ≥ 40%) |
| Reduce no-shows | Reminder-driven show-up lift |
| Repeat / upsell | Post-workshop offer conversion |
| Compliance | 100% of pages carry SEBI disclosures & disclaimers |

---

## 3. Scope — the five subsystems

```
┌──────────────────────────────────────────────────────────────┐
│ 1. MARKETING SITE      landing page(s), variants, A/B tests   │
│ 2. REGISTRATION        lead capture, seat/date selection      │
│ 3. PAYMENTS            checkout, order, invoice, refunds       │
│ 4. DELIVERY & COMMS    live-session join, email/SMS/WhatsApp   │
│ 5. ADMIN & ANALYTICS   dashboard, attendees, revenue, funnel  │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Architecture

**Recommended shape: React SPA/SSR frontend + API backend + managed 3rd-party
services.** Reuses the repo's existing React + Vite + TypeScript + Tailwind
toolchain.

```
   ┌─────────────┐        ┌──────────────────┐        ┌───────────────┐
   │  Frontend   │ HTTPS  │   Backend API    │        │  Data stores  │
   │ React+Vite  │───────▶│  Node (Fastify/  │───────▶│  Postgres     │
   │ Tailwind    │  REST  │  Express) or     │        │  Redis (cache/│
   │ (marketing +│◀───────│  Next.js API     │◀───────│  queue)       │
   │  admin)     │        │  routes          │        │  Object store │
   └─────────────┘        └───────┬──────────┘        └───────────────┘
                                  │ webhooks / SDKs
              ┌───────────────────┼───────────────────────────┐
              ▼                   ▼                           ▼
      ┌──────────────┐   ┌──────────────────┐        ┌────────────────┐
      │ Payment GW   │   │ Comms providers  │        │ Live / Webinar │
      │ Razorpay/    │   │ Email (Resend/   │        │ Zoom / YouTube │
      │ Stripe       │   │ SES), SMS, WA    │        │ Live / Meet    │
      └──────────────┘   └──────────────────┘        └────────────────┘
```

**Why this split**
- Frontend and marketing pages must be **fast and SEO/ads-friendly** → prefer
  SSR/SSG (Next.js) for the public funnel; the admin can stay a Vite SPA.
- Payments, PII, and webhook verification must live **server-side**.
- Live delivery and comms are **buy-not-build** — integrate proven providers.

### Tech stack (concrete recommendation)

| Layer | Choice | Notes |
|-------|--------|-------|
| Public funnel | Next.js (App Router) + Tailwind | SSG/SSR, OG tags, fast LCP for ad traffic |
| Admin dashboard | React + Vite + Tailwind (this repo) | Auth-gated SPA |
| Backend | Node + TypeScript (Fastify or Next API routes) | One language end-to-end |
| DB | PostgreSQL (Prisma ORM) | Relational: orders, registrations, sessions |
| Cache/queue | Redis + BullMQ | Reminder scheduling, webhook retries |
| Payments | Razorpay (India-first) w/ Stripe fallback | INR, UPI, cards; webhook-driven fulfilment |
| Email | Resend or Amazon SES | Transactional + drip |
| SMS / WhatsApp | MSG91 / Gupshup / Twilio | OTP + reminders (WA is key in India) |
| Live session | Zoom Webinars API (or YouTube Live) | Auto-generate unique join links |
| Auth (admin) | Email+password + TOTP, or Clerk/Auth.js | RBAC: admin, staff, viewer |
| Analytics | GA4 + Meta Pixel + server-side events | Funnel + ad attribution |
| Hosting | Vercel (frontend) + Fly/Render (API) or single Next.js deploy | |

---

## 5. Data model (core tables)

```
Workshop        id, title, slug, description, sebi_reg_no, is_active
Session         id, workshop_id, starts_at, duration_min, timezone,
                format(live|recorded), capacity, join_provider, meta
Instructor      id, name, title, bio, photo_url
Registration    id, session_id, name, email, phone, source, utm_*,
                status(lead|registered|paid|attended|no_show), created_at
Order           id, registration_id, amount, currency, gateway,
                gateway_order_id, status(created|paid|failed|refunded)
Payment         id, order_id, gateway_payment_id, method, status, paid_at
Coupon          id, code, type(pct|flat), value, max_uses, expires_at
Reminder        id, registration_id, channel(email|sms|wa), send_at,
                template, status(scheduled|sent|failed)
JoinLink        id, registration_id, url, provider_ref, issued_at
AdminUser       id, email, role, password_hash, totp_secret
Event(analytics) id, type, registration_id?, payload_json, created_at
```

Relationships: `Workshop 1—* Session 1—* Registration 1—1 Order 1—* Payment`.
Reminders and JoinLinks hang off Registration. UTM/source captured on every
Registration for attribution.

---

## 6. Screen / page inventory

### Public funnel (matches & extends the screenshot)
1. **Landing page** — hero, promise, instructor credibility, SEBI reg, event
   detail cards (date/time/duration/format), benefit checklist, sticky
   "Enroll Now" CTA, countdown timer, testimonials, FAQ, footer with legal
   disclosures.
2. **Registration modal/page** — name, email, phone (+OTP verify), UTM capture.
3. **Checkout** — order summary, coupon field, Razorpay/Stripe widget.
4. **Thank-you / confirmation** — calendar add (.ics + Google), WhatsApp opt-in,
   "what to expect", join instructions.
5. **Join page** — pre-session lobby + live join button (unlocks at start time).

### Admin (auth-gated)
6. **Dashboard** — funnel counts, revenue, upcoming session, live show-up rate.
7. **Registrations table** — filter/search/export CSV, status pipeline.
8. **Sessions** — create/schedule sessions, set capacity, attach instructors.
9. **Payments & refunds** — reconcile, issue refunds, view invoices.
10. **Coupons** — create/track discount codes.
11. **Comms** — templates, schedule reminders, send blasts.
12. **Analytics** — conversion funnel, source/UTM breakdown, A/B results.

---

## 7. Key flows

**Enroll flow**
```
Visitor → Landing → "Enroll Now" → Registration (OTP) → Checkout
   → Razorpay → webhook: payment.paid → Order=paid, Registration=paid
   → issue JoinLink + confirmation email/WA → schedule reminders
```

**Reminder flow** (BullMQ delayed jobs)
```
On registration: schedule T-24h, T-1h, T-10min reminders (email + WA + SMS)
Worker fires job → renders template → provider send → mark sent/failed → retry
```

**Attendance flow**
```
Join page checks session window → logs "attended" event → post-session:
mark no_show for paid-but-absent → trigger recording + upsell email
```

---

## 8. Integrations & webhooks

- **Payments**: verify signature on `payment.captured` / `order.paid`; make
  fulfilment **idempotent** (keyed on gateway_payment_id); handle `refunded`.
- **Live**: Zoom Webinar API to register attendee → unique join URL; or a
  single YouTube Live/Meet link gated behind the paid Join page.
- **Comms**: WhatsApp (India-critical) via approved template messages; email
  DKIM/SPF configured; SMS as fallback for reminders and OTP.
- **Analytics**: fire client events (view, register, purchase) to GA4 + Meta
  Pixel **and** server-side conversions API for ad-blocker-resistant attribution.

---

## 9. Compliance & trust (India / SEBI)

The reference cites a **SEBI Research Analyst registration** — this brings
regulatory obligations that must be reflected in the product:

- Display **SEBI RA name + registration number** on every page (footer).
- Standard **market-risk disclaimer** ("Investments are subject to market
  risks…") and "educational purposes only / not investment advice" language.
- **Grievance/contact** and RA disclosure page.
- **Refund & cancellation policy**, **Terms**, **Privacy Policy** pages.
- **DPDP Act** (India data protection): consent for marketing comms, WhatsApp
  opt-in, data-deletion request handling.
- **GST-compliant invoices** for paid orders.

> These are product requirements, not legal advice — confirm exact wording with
> a compliance/legal advisor before launch.

---

## 10. Non-functional requirements

- **Performance** — landing LCP < 2.5s on mobile 4G; images optimized/CDN.
- **Reliability** — payment fulfilment idempotent + webhook retry queue.
- **Security** — PII encrypted at rest, secrets in vault, rate-limit OTP,
  server-side gateway signature verification, admin RBAC + 2FA.
- **Scalability** — spikes on ad launch / session start; queue-based comms.
- **Accessibility** — WCAG AA, keyboard nav, contrast (matters for ads QA).
- **Observability** — structured logs, error tracking (Sentry), funnel dashboards.

---

## 11. Phased roadmap

### Phase 0 — Foundations (week 1)
- Repo/monorepo setup, CI, env config, DB schema (Prisma), design system tokens.

### Phase 1 — Marketing + capture (weeks 2–3) → **MVP-launchable**
- Pixel-accurate landing page from the screenshot (responsive, countdown, FAQ).
- Registration form + OTP, UTM capture, thank-you page, GA4/Pixel.
- **Deliverable:** collect leads for a real session.

### Phase 2 — Payments (weeks 3–4)
- Razorpay checkout, Order/Payment model, webhook fulfilment, coupons, invoices.
- **Deliverable:** take real paid enrollments.

### Phase 3 — Delivery & comms (weeks 4–5)
- Join page + live provider integration, .ics/calendar, email + WhatsApp + SMS
  reminders via queue.
- **Deliverable:** run the live workshop end-to-end.

### Phase 4 — Admin & analytics (weeks 5–6)
- Auth-gated dashboard, registrations table + export, sessions CRUD, refunds,
  funnel analytics.
- **Deliverable:** operate & measure without touching the DB.

### Phase 5 — Optimize (ongoing)
- A/B testing on landing variants, drip nurture, upsell/next-cohort offers,
  recorded-replay access.

---

## 12. Immediate next steps

1. **Confirm platform choice** — Next.js for the public funnel (recommended) vs.
   extend this Vite SPA. Affects Phase 0.
2. **Confirm payment gateway & region** — Razorpay (India/INR) assumed.
3. **Confirm live provider** — Zoom Webinar vs. YouTube Live vs. Meet.
4. Scaffold Phase 1: landing page component tree + registration API + schema.

> Tell me which of the four decisions above you want to lock in, and I'll
> scaffold Phase 1 (the landing page + registration capture) on this branch.
