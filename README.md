# Multi-Vendor Marketplace — Phase 1

A real, runnable Next.js 14 + PostgreSQL + Prisma multi-vendor marketplace,
implementing **Phase 1** of the full specification: authentication & roles,
vendor approval, categories, products with variants/inventory, search &
filtering, cart, **transactional multi-vendor checkout with commission
calculation and vendor wallet crediting**, order management, and admin/vendor
dashboards.

Nothing here is mocked UI or fake data flow — every button is wired to a real
API route backed by PostgreSQL. The one deliberate stand-in is the payment
gateway (see below), which is a documented abstraction, not a hidden fake.

## What's implemented

### Phase 1
- **Auth & roles**: Customer / Vendor / Admin, credential login, bcrypt
  hashing, JWT sessions, server-side role checks on every API route (never
  trust the client), page-level middleware for `/vendor` and `/admin`.
- **Vendors**: registration → PENDING → admin approve/reject/suspend/
  reactivate; vendor profile, wallet, per-vendor commission override.
- **Categories**: hierarchical (parent/child), admin CRUD.
- **Products**: full CRUD, images, attributes, variants (own SKU/price/
  stock/image each), draft/published/archived states, ownership-checked
  edits/deletes.
- **Discovery**: keyword search, category/brand/vendor/price filters, sort,
  pagination — all reflected as URL query params.
- **Cart**: add/update/remove, stock validated against live DB state.
- **Checkout (the critical flow)**: one checkout can include products from
  multiple vendors. It creates one parent `Order`, splits it into one
  `VendorOrder` per vendor, atomically (race-safe) decrements stock,
  calculates commission per vendor order, applies each vendor's shipping
  cost, charges payment, and credits each vendor's *pending* wallet balance
  — all inside a single DB transaction that rolls back completely on any
  failure. See `src/app/api/checkout/route.ts`.
- **Orders**: customers see their full order; vendors see only their own
  vendor sub-order; vendors can advance status through
  PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED, and delivery moves
  their earnings from pending → available balance.
- **Dashboards**: vendor (sales, orders, wallet) and admin (marketplace-wide
  totals, commission, vendor earnings).

### Phase 2
- **Vendor verification & badges**: `isVerified` flag shown as a "✓
  Verified" badge on product/vendor listings (an admin sets this today;
  a dedicated document-upload verification workflow is a good next step).
- **Wishlist**: add/remove, duplicate-safe, "move to cart" respects live
  stock.
- **Reviews & ratings**: product reviews and seller reviews, both gated to
  customers with an actual order for that product/vendor
  (`verifiedPurchase` is enforced, not just displayed), admin moderation
  queue (approve/reject), and a reporting endpoint that surfaces flagged
  reviews to admins. Average rating is computed live via aggregation, not
  a cached counter that can drift.
- **Vendor wallet & payouts**: vendors request a withdrawal (validated
  against available balance minus any already-pending requests); admins
  approve/reject/complete — completion is the one place the wallet is
  actually debited, re-checked transactionally at that moment too.
- **Notifications**: a real `notify()` service wired into checkout (order
  placed → customer + every involved vendor), vendor approval/rejection/
  suspension, vendor order status changes, payout decisions, and return
  status changes. In-app only for now; the function signature is the seam
  for email/SMS/push fan-out later.
- **Shipping**: vendors manage their own flat-rate shipping methods (one
  marked default); checkout automatically applies each vendor's default
  method's cost into that vendor's sub-order and the order total.
- **Returns & refunds**: customers request a return per order item (only
  once that vendor order is DELIVERED); vendor/admin move it through
  REQUESTED → ... → REFUNDED. Reaching REFUNDED actually reverses money:
  splits the refund into vendor-portion and commission-portion using the
  order's original commission rate, decrements the vendor's wallet and
  recorded commission, calls the payment provider's `refund()`, records a
  `Transaction`, and marks the parent order REFUNDED or
  PARTIALLY_REFUNDED depending on what else in it has been refunded.

## What's implemented (continued: Phase 3, this update)
- **Real-time-style chat**: customer ↔ vendor messaging, startable from a
  product page, with a conversation list (unread counts) and a thread view
  for both sides. Implemented as a polled REST API (client refetches every
  4s) rather than a WebSocket server — documented in the `Conversation`
  model's comment as a deliberate choice, since standing up a WS server is
  a real infra decision for the deployment target, not a Next.js API route
  default. Swapping the polling for a WS/SSE subscription later doesn't
  require changing the schema or the message-send/read logic.
- **Coupons & promotions**: platform-wide (admin) and store-specific
  (vendor) coupons — percentage or fixed, with expiry, usage limits, and
  per-user limits, all re-validated server-side at checkout against live
  DB state (not just at "apply" time). A documented business rule: coupon
  discounts are platform-funded, so vendor commission and payout math is
  computed on the pre-discount subtotal, same as if no coupon existed.
- **Vendor analytics**: revenue, orders, products sold, average order
  value, a real sales-over-time line chart, and best-sellers, all
  filterable by the spec's standard date-range presets (today/7-day/
  30-day/this-month/previous-month). Product view counts and conversion
  rate would need a page-view tracking table this build doesn't add yet.
- **Admin analytics**: marketplace-wide gross sales, commission, vendor
  earnings, refunds, payouts, failed payments, new customers/vendors, plus
  sales-by-vendor and sales-by-category bar charts and a best-sellers
  list — same date-range filtering, all computed from real order data.
- **Advanced search groundwork**: search already spans name/description/
  brand/SKU/tags with the price/category/vendor/brand filters from Phase
  1. Typo tolerance and true relevance ranking need a dedicated search
  index (e.g. Postgres full-text search or an external engine) — the
  `/api/products` route is structured so swapping its query for one is a
  contained change.
- **Product recommendations**: rule-based "similar products" (same
  category) and "customers also bought" (co-purchase frequency from real
  order history) on the product page, plus a "trending now" section on the
  homepage (most-ordered in the last 30 days). Deliberately simple and
  swappable for an ML ranking model later — the spec explicitly asks to
  start rule-based.
- **Recently viewed**: tracked server-side per logged-in customer,
  surfaced on the homepage.
- **Loyalty & rewards**: points earned per currency unit spent (rate
  configurable via `PlatformSettings`), redeemable at checkout for a
  discount, capped so an order can never go negative. A loyalty activity
  page shows balance and transaction history.

## What's intentionally not built yet (remaining spec gaps)

True AI/ML-trained recommendation or fraud models (Phase 4 delivers
rule-based fraud detection and a real optional LLM-backed support
assistant — see below — rather than trained models, which need training
data this project doesn't have), AI-powered search ranking beyond keyword
matching, an affiliate/referral program, full multi-language UI (see the
honest scope note below), real courier API integrations (the abstraction
is built — see below), and true multi-currency charging (display-only
conversion is built — see below). The schema and service layer were
designed so these extend Phases 1–4 without rewriting them.

### Phase 4 (this update)
- **Audit logs**: a real `AuditLog` table plus `recordAudit()` as the
  single choke point (mirroring `notify()`), wired into vendor approval/
  rejection/suspension, commission overrides, product deletion, refunds,
  and payout completion (manual and automated). Admin log viewer with
  before/after diffs.
- **Rule-based fraud detection**: `src/lib/fraud.ts` scores every
  completed order on explainable, auditable signals (brand-new account +
  high value, rapid failed-payment attempts, spend far above a customer's
  history, very high absolute value). Deliberately labeled as rules, not
  "AI" — a real ML model would slot in behind the same `{ score, reasons
  }` shape without touching callers. Flags never block a purchase; they
  only populate an admin review queue, since auto-declining risks denying
  real customers.
- **Automated vendor payouts**: `POST /api/admin/payouts/auto-run` pays
  out every vendor at/above a configurable threshold automatically.
  Next.js has no built-in scheduler, so this only runs on a schedule if
  something external calls it — Vercel Cron, a GitHub Action, or a plain
  OS cron job hitting the endpoint with `x-cron-secret: $CRON_SECRET`.
  An admin can also trigger it manually from Settings. Every run is
  audit-logged.
- **Courier/shipping abstraction**: `CourierProvider` interface mirroring
  the payment provider pattern exactly, a genuinely-functional
  `MockCourierProvider` (deterministic per tracking number, not random),
  and a tracking-lookup route/widget shown on order detail pages once a
  vendor adds a tracking number. Swap in a real carrier by implementing
  the interface and registering it in `src/lib/courier/index.ts`.
- **AI-assisted customer support**: `src/lib/ai` is a real integration
  with Anthropic's Messages API — not a canned-response simulation — but
  it's optional: it only activates when `ANTHROPIC_API_KEY` is set, and
  returns a clear "not configured" message otherwise rather than faking a
  reply. When active, it grounds answers in the signed-in customer's
  actual recent orders (fetched fresh from the DB, never trusted from the
  client or invented by the model) so it can answer "where's my order"
  accurately.
- **Multi-currency (display-only)**: admin-managed `CurrencyRate` table
  and settings UI. This is explicitly scoped to *display* conversion —
  shoppers can see approximate prices in another currency — while actual
  charging and all settlement (`Payment`, `VendorWallet`, commission)
  stay in the platform's base currency. True multi-currency *charging*
  needs a payment gateway that itself settles in multiple currencies,
  which is a provider-specific capability the abstraction in
  `src/lib/payment` is ready for once such a gateway is implemented.

### Honest scope note: multi-language
Full i18n (translating every page's copy, RTL support, locale-aware
formatting throughout) is a genuinely large, mechanical effort — every
string across ~30 pages — that wasn't attempted here rather than delivered
half-done. `PlatformSettings` and the schema don't block adding it: a
standard approach (e.g. `next-intl`) would wrap the existing page tree
without touching the API layer at all.

A few corners are intentionally minimal rather than fake: multi-image
upload UI, a dedicated variant builder UI, a public vendor "storefront"
page (seller reviews are reachable via the API but have no dedicated page
yet), and tax calculation (wired through the `Order` model as a real
`0`-valued field, not hard-coded into the total).

## Payment gateway

`src/lib/payment/PaymentProvider.ts` defines the interface every gateway
must implement. `PAYMENT_PROVIDER=mock` (the default) uses a fully-functional
test provider — it really executes charge/refund and really drives the
order/commission/wallet pipeline, it just doesn't move real money. To go
live, implement a class against the same interface (e.g.
`StripePaymentProvider`), register it in `src/lib/payment/index.ts`, and set
`PAYMENT_PROVIDER=stripe` with real credentials. Nothing in checkout,
commission, or order code needs to change.

## Getting started

```bash
npm install

# 1. Start a Postgres instance and copy .env.example to .env.local (or .env),
#    filling in DATABASE_URL and a NEXTAUTH_SECRET
cp .env.example .env

# 2. Create the schema
npm run db:push

# 3. Seed demo data (an admin, an approved vendor, a customer, two products)
npm run prisma:seed

# 4. Run it
npm run dev
```

Seeded logins (see `prisma/seed.ts`):

| Role     | Email                      | Password      |
|----------|-----------------------------|---------------|
| Admin    | admin@marketplace.test      | Admin123!     |
| Vendor   | vendor@marketplace.test     | Vendor123!    |
| Customer | customer@marketplace.test   | Customer123!  |

Try the core flow: log in as the customer, add the seeded t-shirt and phone
to your cart (both belong to the same seeded vendor — add a second vendor's
product once you've registered one via "Sell as a vendor" and had the admin
approve it, to see the multi-vendor split), check out, then log in as the
vendor to advance the order through shipped → delivered and watch the wallet
balance move from pending to available. Log in as admin to see the
marketplace-wide totals update.

## Project structure

```
prisma/schema.prisma       All Phase 1 tables + forward-looking ones (Payout, etc.)
prisma/seed.ts             Demo data
src/lib/                   Prisma client, auth, payment abstraction, commission
                            service, zod validators, shared API error handling
src/app/api/                Route handlers (the actual business logic)
src/app/(site)/              Customer-facing pages
src/app/vendor/              Vendor dashboard pages
src/app/admin/                Admin dashboard pages
src/middleware.ts             Page-level role guard
```

## Continuing the build

What's left, roughly in order of value:
1. **Affiliate/referral program** — following the coupon pattern closely:
   a new `AffiliateAccount`/`Referral` pair of tables, a referral-code
   param threaded through registration and checkout, validated and
   recorded the same way coupon redemptions are.
2. **A public vendor storefront page** surfacing seller reviews (the API
   is already there — `GET /api/vendors/[id]/reviews`), shipping options,
   and active coupons for that store.
3. **AI-assisted search** — the same `src/lib/ai` abstraction used for
   support could expand a search query into related terms before it hits
   `/api/products`, with the same "gracefully degrade to plain keyword
   search if no API key" behavior support already has.
4. **A real courier integration** — implement one more class against
   `CourierProvider` (e.g. for a specific carrier's REST API) and register
   it; nothing else in the tracking route or UI changes.
5. **next-intl-based i18n** for full multi-language coverage.
6. **A real payment gateway** — implement `PaymentProvider` for Stripe (or
   another gateway); the checkout, refund, and payout flows don't change.
