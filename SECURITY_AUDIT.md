# Security Audit Report: Navisio (Binnenvaart Intel)

**Date**: 2026-02-07
**Scope**: Next.js frontend, Supabase backend, Polar.sh payment integration
**Framework**: Next.js 16.1.6, Supabase SSR 0.8.0, @polar-sh/nextjs 0.9.3

---

## Executive Summary

Four parallel security reviews audited authentication/session handling, API/data security, payment/billing flows, and frontend client-side security. The audit identified **3 critical**, **5 high**, **8 medium**, and **6 low** severity findings across 22 distinct issues.

The most urgent issues are: (1) the checkout flow allows attacker-controlled `user_id` injection enabling subscription hijacking, (2) premium analytics content is gated purely by CSS blur and fully accessible in the DOM, and (3) the checkout API has no authentication. These three findings together mean an attacker can access premium content without paying and can manipulate subscription assignment to arbitrary users.

---

## Critical Findings

### C1. Checkout Metadata `user_id` Is Attacker-Controlled (Subscription Hijacking)

| | |
|---|---|
| **Severity** | CRITICAL |
| **Files** | `frontend/src/app/pricing/page.tsx:47-54`, `frontend/src/app/api/webhooks/polar/route.ts:16-17,109-110` |
| **Category** | Payment Security, Authorization |

**Description**: The pricing page constructs the Polar checkout URL entirely client-side, embedding `user.id` in a `metadata` query parameter:

```ts
params.set("metadata", JSON.stringify({ user_id: user.id }));
```

This metadata flows through Polar and arrives in webhook payloads. The webhook handlers (`onSubscriptionCreated`, `onCheckoutUpdated`) blindly trust `metadata.user_id` to determine which Supabase user gets the subscription. There is no server-side validation that the `user_id` matches the authenticated user who initiated checkout.

**Exploit scenario**: Attacker authenticates, modifies the checkout URL to set `metadata={"user_id":"<victim_UUID>"}`, completes payment. The webhook creates a subscription for the victim's account and overwrites the victim's `polar_customer_id` in their profile. The attacker has hijacked the victim's billing relationship.

**Remediation**: Convert `/api/checkout` from a pass-through `GET` to a `POST` that authenticates the user server-side (via Supabase auth cookies), extracts `user.id` from the session, and injects it into checkout metadata. The client must never control `user_id`.

---

### C2. Premium Content Gating Is Purely Cosmetic (CSS Blur Bypass)

| | |
|---|---|
| **Severity** | CRITICAL |
| **Files** | `frontend/src/components/PremiumGate.tsx:16-19`, `frontend/src/app/analytics/page.tsx:120-137` |
| **Category** | Access Control |

**Description**: `PremiumGate` renders all children unconditionally and applies `blur-[6px]`, `pointer-events-none`, and `select-none` CSS classes for non-premium users. The premium content (analytics charts, data tables) is fully present in the DOM. Several gated analytics components derive output from the `vessels` table, which has an anonymous-read RLS policy (`USING (true)`). The analytics page fetches vessels unconditionally (lines 29-37), so the data is already loaded regardless of subscription status.

**Exploit scenario**: Any visitor opens DevTools, removes the `blur-[6px]` class, and reads the full premium analytics dashboard. No authentication or subscription is required because the underlying data is already fetched and rendered.

**Remediation**: Premium components must not render content at all for non-premium users (return `null` or a placeholder). Analytics data should be fetched server-side after subscription verification, not client-side for all users.

---

### C3. Checkout API Endpoint Has No Authentication

| | |
|---|---|
| **Severity** | CRITICAL |
| **Files** | `frontend/src/app/api/checkout/route.ts:1-7` |
| **Category** | Authentication |

**Description**: The checkout route is a thin `GET` pass-through to `Checkout()` from `@polar-sh/nextjs` with zero authentication. Any request to `/api/checkout?products=<id>&metadata=<json>` creates a Polar checkout session. The `products`, `customerEmail`, and `metadata` parameters are all unvalidated.

**Exploit scenario**: (a) Bots create unlimited checkout sessions, exhausting Polar API quotas. (b) Combined with C1, arbitrary `user_id` values are injected. (c) Attackers substitute product IDs for cheaper or test products if others exist in the Polar account. (d) Unauthenticated card testing.

**Remediation**: Add server-side authentication. Validate `products` against known product IDs (`POLAR_PRODUCT_ID_MONTHLY`, `POLAR_PRODUCT_ID_ANNUAL`). Switch from `GET` to `POST` to prevent CSRF via link navigation.

---

## High Findings

### H1. Open Redirect in Auth Callback via Unvalidated `next` Parameter

| | |
|---|---|
| **Severity** | HIGH |
| **Files** | `frontend/src/app/auth/callback/route.ts:7,13` |
| **Category** | Authentication |

**Description**: The `next` query parameter is used directly in `NextResponse.redirect(\`${origin}${next}\`)` without validation. While `origin` is prepended, crafted values like `next=.evil.com` produce `https://navisio.vercel.app.evil.com` -- a different domain controlled by the attacker.

**Exploit scenario**: After completing legitimate OAuth, the user is redirected to a phishing site mimicking the application, where session tokens or credentials can be harvested.

**Remediation**:
```ts
const rawNext = searchParams.get("next") ?? "/";
const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
```

---

### H2. Notification Subscribers Table Leaks All Email Addresses Publicly

| | |
|---|---|
| **Severity** | HIGH |
| **Files** | `supabase/schema.sql:67` |
| **Category** | Data Exposure, GDPR |

**Description**: The RLS policy `FOR SELECT USING (true)` on `notification_subscribers` grants anonymous read access to all rows. Any unauthenticated user can query `GET /rest/v1/notification_subscribers?select=email` using the publicly exposed anon key.

**Exploit scenario**: Attacker harvests all subscriber emails for spam, phishing, or social engineering. This is a GDPR-relevant personal data leak.

**Remediation**:
```sql
DROP POLICY "Allow anonymous read access" ON notification_subscribers;
CREATE POLICY "Users can view own subscription"
  ON notification_subscribers FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
```

---

### H3. No Rate Limiting on Any API Route

| | |
|---|---|
| **Severity** | HIGH |
| **Files** | `frontend/src/app/api/checkout/route.ts`, `frontend/src/app/api/customer-portal/route.ts`, `frontend/src/app/api/webhooks/polar/route.ts` |
| **Category** | Availability, Abuse Prevention |

**Description**: None of the three API routes implement rate limiting. The checkout route is unauthenticated (see C3), making abuse trivial.

**Exploit scenario**: Flood `/api/checkout` to exhaust Polar API quotas. Flood `/api/webhooks/polar` to cause resource exhaustion via signature verification computation. Flood `/api/customer-portal` to exhaust database connection pools.

**Remediation**: Implement rate limiting via `@upstash/ratelimit` with Redis or Vercel's built-in rate limiting. Apply stricter limits to checkout (5 req/min/IP) and webhook endpoints (60 req/min, scoped to Polar's IP range if possible).

---

### H4. Webhook Event Ordering Not Protected (Race Conditions)

| | |
|---|---|
| **Severity** | HIGH |
| **Files** | `frontend/src/app/api/webhooks/polar/route.ts:46-103` |
| **Category** | Payment Security |

**Description**: Webhook handlers update subscription status unconditionally using `new Date().toISOString()` for `updated_at`. No mechanism detects out-of-order event delivery (which Polar does not guarantee).

**Exploit scenario**: `subscription.canceled` arrives, then a stale `subscription.active` arrives late and overwrites the status back to `active`. User retains access after cancellation. The reverse can also deny access to paying users.

**Remediation**: Compare incoming event timestamps against stored `updated_at`. Only apply updates if the incoming event is newer. Implement a state machine that only allows valid transitions.

---

### H5. Webhook Handlers Silently Ignore All Database Errors

| | |
|---|---|
| **Severity** | HIGH |
| **Files** | `frontend/src/app/api/webhooks/polar/route.ts:21-121` |
| **Category** | Payment Security, Reliability |

**Description**: Every Supabase operation (`upsert`, `update`) discards its return value. If any database operation fails, the handler still returns HTTP 200 to Polar, which considers the event delivered and won't retry.

**Exploit scenario**: Transient database outage causes the subscription upsert to fail. Polar receives 200 and doesn't retry. User pays but never gets premium access. This also masks attacks where database writes are being blocked.

**Remediation**: Check `.error` on every Supabase response. If any critical operation fails, throw or return non-200 so Polar retries:
```ts
const { error } = await admin.from("subscriptions").upsert({...});
if (error) throw new Error(error.message);
```

---

## Medium Findings

### M1. No Server-Side Route Protection for Authenticated Pages

| | |
|---|---|
| **Severity** | MEDIUM |
| **Files** | `frontend/src/middleware.ts:1-12`, `frontend/src/app/account/page.tsx:15-18` |

The middleware refreshes sessions but never blocks unauthenticated access. Protected pages like `/account` rely on client-side `useEffect` redirects. Full page HTML/JS is sent before the client decides to redirect.

**Remediation**: Add server-side auth checks in middleware for protected routes (`/account`).

---

### M2. Missing Security Headers (CSP, X-Frame-Options, HSTS)

| | |
|---|---|
| **Severity** | MEDIUM |
| **Files** | `frontend/next.config.ts`, `frontend/src/middleware.ts` |

No Content Security Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, or Strict-Transport-Security headers are configured. The application is vulnerable to clickjacking and has no script injection defense-in-depth.

**Remediation**: Add `headers()` configuration to `next.config.ts` with CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, and Permissions-Policy.

---

### M3. Weak Password Policy (6 Characters, No Complexity)

| | |
|---|---|
| **Severity** | MEDIUM |
| **Files** | `frontend/src/app/signup/page.tsx:137` |

Only a client-side `minLength={6}` is enforced. No uppercase, digit, or special character requirements. NIST recommends minimum 8 characters.

**Remediation**: Configure Supabase password policy for 8+ characters with complexity. Add client-side strength feedback.

---

### M4. Raw Supabase Error Messages Exposed in UI

| | |
|---|---|
| **Severity** | MEDIUM |
| **Files** | `frontend/src/components/Dashboard.tsx:62-63,189`, `frontend/src/app/login/page.tsx:28-29`, `frontend/src/app/signup/page.tsx:33-34`, `frontend/src/app/api/customer-portal/route.ts:11,25` |

Supabase error messages containing table names, column names, RLS policy hints, or PostgreSQL error codes are displayed directly to users. Auth errors enable user enumeration (different messages for "user not found" vs "wrong password").

**Remediation**: Display generic user-facing messages. Log detailed errors server-side for debugging.

---

### M5. No Webhook Idempotency Key Tracking

| | |
|---|---|
| **Severity** | MEDIUM |
| **Files** | `frontend/src/app/api/webhooks/polar/route.ts` |

No webhook event ID is tracked. Duplicate deliveries (common during retries) repeatedly overwrite data without detection.

**Remediation**: Create a `webhook_events` table with a unique constraint on event ID. Check before processing each event.

---

### M6. Non-null Assertion on Environment Variables (No Startup Validation)

| | |
|---|---|
| **Severity** | MEDIUM |
| **Files** | `frontend/src/app/api/webhooks/polar/route.ts:6-7,12`, `frontend/src/app/api/checkout/route.ts:4`, `frontend/src/app/api/customer-portal/route.ts:5,15-16`, `frontend/src/lib/supabase/server.ts:7-8`, `frontend/src/lib/supabase/client.ts:4-5` |

All env var references use TypeScript's `!` operator. If `POLAR_WEBHOOK_SECRET` is unset, some SDKs may skip signature verification entirely, allowing forged webhooks.

**Remediation**: Create an `env.ts` module with zod schema validation that throws at startup if required variables are missing.

---

### M7. Wildcard Subdomain Image Patterns

| | |
|---|---|
| **Severity** | MEDIUM |
| **Files** | `frontend/next.config.ts:12-15,22-25` |

`*.rensendriessen.com` and `*.gallemakelaars.nl` with `pathname: "/**"` allow any subdomain to serve images through the Next.js proxy. Subdomain takeover of unused DNS records could serve malicious content.

**Remediation**: Replace wildcards with explicit hostnames (`api.rensendriessen.com`, `www.gallemakelaars.nl`).

---

### M8. No Refund/Chargeback Webhook Handling

| | |
|---|---|
| **Severity** | MEDIUM |
| **Files** | `frontend/src/app/api/webhooks/polar/route.ts` |

No handler for refund or chargeback events. If Polar issues a refund or chargeback occurs, the subscription remains `active` until `current_period_end`.

**Remediation**: Add handlers for Polar refund/chargeback events. Set status to `revoked` on chargeback.

---

## Low Findings

### L1. Authentication Error Messages Enable User Enumeration

| | |
|---|---|
| **Severity** | LOW |
| **Files** | `frontend/src/app/login/page.tsx:28-29` |

Different Supabase error messages for "invalid email" vs "invalid password" allow email enumeration.

**Remediation**: Generic message: "Ongeldige inloggegevens" for all auth failures.

---

### L2. No Session Invalidation / "Sign Out Everywhere"

| | |
|---|---|
| **Severity** | LOW |
| **Files** | `frontend/src/app/account/page.tsx:32-37`, `frontend/src/components/Header.tsx:38-44` |

No mechanism to revoke all active sessions on password change or suspected compromise. Stolen JWTs remain valid until expiry (default 1 hour).

**Remediation**: Implement global sign-out via `auth.admin.signOut(userId, 'global')`. Reduce JWT expiry to 900 seconds.

---

### L3. Scraped External URLs Used as Links Without Validation

| | |
|---|---|
| **Severity** | LOW |
| **Files** | `frontend/src/components/VesselCard.tsx:56`, `frontend/src/components/VesselDetail.tsx:214-221` |

`vessel.url` values from scraped broker sites are used as `href` without protocol or domain validation.

**Remediation**: Validate URLs start with `https://` and belong to expected broker domains.

---

### L4. Checkout Success Page Accessible Without Payment Verification

| | |
|---|---|
| **Severity** | LOW |
| **Files** | `frontend/src/app/checkout/success/page.tsx:1-42` |

The success page displays "Betaling gelukt!" without verifying any payment occurred. Anyone can navigate to it directly.

**Remediation**: Verify a Polar checkout session ID from the URL query parameters server-side.

---

### L5. Missing Autocomplete Attributes on Auth Forms

| | |
|---|---|
| **Severity** | LOW |
| **Files** | `frontend/src/app/login/page.tsx:69-91`, `frontend/src/app/signup/page.tsx:103-141` |

No `autocomplete` attributes on email/password inputs. Browsers may not prompt password generation on signup.

**Remediation**: Add `autocomplete="email"`, `autocomplete="current-password"`, `autocomplete="new-password"`.

---

### L6. SECURITY DEFINER Trigger Accepts User-Controlled Input

| | |
|---|---|
| **Severity** | LOW |
| **Files** | `supabase/schema.sql:104` |

`handle_new_user()` runs as SECURITY DEFINER and reads `raw_user_meta_data` (user-controlled from signup/OAuth) into profiles. Could inject unexpected values for `full_name` or `avatar_url`.

**Remediation**: Add length limits and format validation in the trigger function. Ensure `avatar_url` starts with `https://`.

---

## Positive Security Observations

The audit identified several areas where security is correctly implemented:

| Area | Status | Details |
|------|--------|---------|
| XSS Prevention | **Pass** | No `dangerouslySetInnerHTML` or `eval()` anywhere in codebase |
| External Links | **Pass** | All `target="_blank"` links include `rel="noopener noreferrer"` |
| Secret Key Isolation | **Pass** | `SUPABASE_SERVICE_ROLE_KEY`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET` are server-side only (no `NEXT_PUBLIC_` prefix) |
| Price History RLS | **Pass** | `price_history` table protected by `is_premium()` SECURITY DEFINER function that checks active subscriptions at the database level |
| RLS Enabled | **Pass** | All tables have `ENABLE ROW LEVEL SECURITY` |
| Webhook Signing | **Pass** | Polar webhooks verified via `webhookSecret` using `@polar-sh/nextjs` |
| Session Refresh | **Pass** | Middleware calls `getUser()` on every request per Supabase SSR best practices |
| Search Path Hardening | **Pass** | SECURITY DEFINER functions set `search_path = public` |
| Server Client | **Pass** | Uses anon/publishable key, not service role key |
| Subscription RLS | **Pass** | Users restricted to their own subscription rows |

---

## Prioritized Remediation Roadmap

### Immediate (Before Next Deploy)

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | **C1**: Server-side checkout with authenticated `user_id` | Medium |
| 2 | **C3**: Add auth + product validation to checkout route | Low |
| 3 | **C2**: Stop rendering premium content for non-premium users | Medium |
| 4 | **H1**: Validate `next` parameter in auth callback | Low |
| 5 | **H2**: Restrict `notification_subscribers` RLS policy | Low |

### Short-Term (1-2 Weeks)

| Priority | Finding | Effort |
|----------|---------|--------|
| 6 | **H5**: Add error handling to all webhook DB operations | Low |
| 7 | **H3**: Implement rate limiting on API routes | Medium |
| 8 | **M6**: Add env var validation at startup | Low |
| 9 | **M4**: Replace raw error messages with generic ones | Low |
| 10 | **M2**: Add security headers (CSP, X-Frame-Options, etc.) | Medium |

### Medium-Term (1 Month)

| Priority | Finding | Effort |
|----------|---------|--------|
| 11 | **H4**: Protect webhook event ordering | Medium |
| 12 | **M5**: Add webhook idempotency tracking | Medium |
| 13 | **M8**: Handle refund/chargeback webhooks | Medium |
| 14 | **M3**: Strengthen password policy | Low |
| 15 | **M7**: Narrow image domain wildcards | Low |
| 16 | **M1**: Server-side route protection in middleware | Low |

### Ongoing / Low Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| 17 | **L1**: Generic auth error messages | Low |
| 18 | **L2**: Global session invalidation | Medium |
| 19 | **L3**: Validate scraped URLs | Low |
| 20 | **L4**: Verify checkout success page | Low |
| 21 | **L5**: Add autocomplete attributes | Low |
| 22 | **L6**: Validate trigger input | Low |

---

## Summary Statistics

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 5 |
| Medium | 8 |
| Low | 6 |
| **Total** | **22** |

| Category | Findings |
|----------|----------|
| Payment/Billing | C1, C3, H4, H5, M5, M8, L4 |
| Authentication/Authorization | C2, H1, M1, M3, M4, L1, L2 |
| Data Exposure | H2, M4, M7, L3, L6 |
| Infrastructure/Config | H3, M2, M6 |
| Frontend | C2, M4, L5 |
