# Project status — hand-off notes

Snapshot: 28 September 2026. Read this first when continuing work in a new
chat. README.md has the full feature overview.

## Stack

Next.js 14 (App Router), TypeScript, Tailwind, Prisma 5 on Neon Postgres,
NextAuth (credentials, JWT sessions).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill it in. Required values:
   - `DATABASE_URL`: the Neon connection string (the pooled one works).
   - `NEXTAUTH_SECRET` and `NEXTAUTH_URL`.
   - `PAYMENT_CREDENTIALS_KEY`: 32 random bytes in base64. It encrypts
     vendors' payment API keys. Generate it with:
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - `PUBLIC_APP_URL` (optional): an https address for MoPay to send
     customers back to, e.g. a tunnel URL during local testing.
3. `npm run db:push`, then `npm run prisma:seed` if the database is empty.
4. `npm run dev`

**Schema changes: always `npm run db:push`. Never `prisma migrate dev`.**
The project has no migration history, so `migrate dev` would offer to reset
the database, which deletes all data.

Uploaded product images are saved in `storage/uploads/`. Keep that folder out
of git.

## Built in the latest rounds

1. **Vendor area**
   - A shared layout (`src/app/vendor/layout.tsx`, `VendorNav`) gives every
     vendor page a sticky sidebar on desktop and scrollable tabs on mobile.
   - The add-product form explains every field.
   - Product photos are uploaded from the device: 1–8 per product, at least
     one required, JPG, PNG or WebP up to 5 MB each.
   - Photos are stored by `src/lib/uploads.ts` and served from `/api/uploads/*`.
   - The product page shows a thumbnail gallery.
2. **Notifications**
   - `NotificationCountProvider` holds the unread count for the header bell.
   - Opening `/notifications` marks everything read and resets the bell to 0.
   - The count refreshes on every page change and once a minute.
3. **Direct M-Pesa** (`src/lib/mpesa`)
   - A vendor connects their own Vodacom M-Pesa Open API credentials: API
     key, public key, short code, and sandbox or live.
   - The customer approves a PIN prompt on their phone.
   - Refunds are sent back automatically as M-Pesa reversals.
   - Settings page: `/vendor/payments/mpesa`.
4. **MoPay** (`src/lib/mopay`, https://mopay.co.ls/docs)
   - A vendor pastes their own MoPay project API key. That one connection
     covers M-Pesa, EcoCash and cards on MoPay's hosted checkout page.
   - An order is confirmed only after our server checks the result with
     MoPay directly.
   - MoPay has no refund API, so vendors refund customers themselves.
   - Settings page: `/vendor/payments`.
5. **Sessions**
   - The login session re-reads the user's role and vendor status from the
     database every 5 minutes.
   - The login page explains when someone is already logged in, or is
     logged in with the wrong type of account.
   - Visiting a vendor or admin page while logged out sends you to
     `/login?callbackUrl=…`, and you return there after logging in.

6. **Vendor payment mode + pay-after-checkout** (28 Sep)
   - Registration asks sellers how customers will pay them
     (`VendorProfile.paymentMode`): `MANUAL` (default: pay offline, upload
     proof; bank / M-Pesa / EcoCash details collected on the form) or
     `ONLINE` (their own merchant API: MoPay or direct M-Pesa, connected
     after sign-up on `/vendor/payments`).
   - `src/lib/vendor-payment-methods.ts` is the single rule for which
     methods a customer can use for a seller.
   - Checkout no longer has a payment section and no longer takes a
     payment method. Vendor orders start as `paymentMethod: "unselected"`;
     the customer picks per seller on the order page
     (`POST /api/vendor-orders/[id]/payment-method`) and can switch while no
     payment attempt is in flight.
   - The platform "Pay by card" (mock provider) is no longer offered.
     `src/lib/payment` is kept for a future platform gateway (DPO).
   - Fraud scoring now runs at order placement (it used to run only for card).
   - Sellers switch mode on `/vendor/payments` (only to a mode that can take
     payment). Every vendor page shows a banner while a store can't take
     payment; checkout refuses items from such stores.

7. **Offline payment details accept personal numbers** (28 Sep)
   - Vendors can enter a bank account, an M-Pesa number, an EcoCash number,
     or any mix. Mobile money numbers can be a merchant (till) number or a
     personal number. Columns keep their old names
     (`mpesaMerchantNumber`, `ecocashMerchantNumber`); no schema change.
   - One rule set, `payoutDetailsIssue` in `src/lib/validators.ts`, is used
     by registration, Store settings and both APIs.
   - Shared form fields: `src/components/vendor/PayoutDetailsFields.tsx`.

8. **"Do you have a merchant account?" setup** (28 Sep)
   - Registration asks: merchant account? → if yes, API access? Personal
     numbers and merchant-without-API are offline payments (proof upload);
     merchant-with-API is online (direct M-Pesa or MoPay, connected on
     `/vendor/payments` after sign-up).
   - New column `VendorProfile.mobileMoneyAccountType` ("PERSONAL" |
     "MERCHANT") drives labels and the customer's instructions
     ("send money" vs "pay merchant"). Needs `npm run db:push`.

## Payment model

Payments go directly to each vendor ("direct payment methods": `mpesa` and
`mopay`, listed in `src/lib/commission.ts`).

- The money never passes through the marketplace, so nothing is added to the
  vendor's wallet balance.
- The marketplace's commission is recorded as `VendorWallet.commissionOwed`.
- Card payments still use the older wallet and payout flow.

## Open items and decisions

- **Backfill after the paymentMode change.** Run once after `db:push`:
  `npx tsx prisma/backfill-payment-mode.ts` — moves stores that only use
  MoPay/M-Pesa to `ONLINE` so their customers still see those options.

- **Manual payments are paid out twice.** Proof-of-payment orders add the
  vendor's earnings to their wallet, but the vendor already received the
  money directly. Fix: add `"manual"` to `DIRECT_PAYMENT_METHODS` in
  `src/lib/commission.ts`. Not done yet; waiting for approval.
- **Collecting commission owed.** How vendors pay it hasn't been decided:
  deduct it from card-sale payouts, or invoice them.
- **Untested against the real services.** Neither M-Pesa nor MoPay has been
  run end to end. Test both in sandbox first: MoPay's test numbers are
  M-Pesa 52211111 and EcoCash 63211111.
- **Direct EcoCash.** No public Lesotho API was found. EcoCash is available
  through MoPay; Pay Lesotho is an alternative that requires contacting them.
- **Unused uploaded photos.** Photos from abandoned add-product forms stay on
  disk. A cleanup job is still to do.
- **Image storage on serverless hosting.** Local-disk storage doesn't
  persist on hosts like Vercel. Before deploying there, switch
  `src/lib/uploads.ts` to object storage such as Cloudflare R2.

## Working conventions

- Each round delivers a zip of changed files, extracted into the project root
  with PowerShell:
  `Expand-Archive <zip> -DestinationPath . -Force`
  Windows "Extract All" creates an extra folder, so don't use it.
- The zip excludes `node_modules`, `.next` and `.git`.
- Fix problems where they start, and make each round's scope explicit.

## Branding — Mmarakeng (2 October 2026)

The platform is branded **Mmarakeng** (Sesotho, "at the market"), domain
mmarakeng.app.

- `src/lib/brand.ts`: name, domain, tagline, support contacts, brand colours.
  Change the brand here, not in individual pages.
- `src/components/brand/Logo.tsx`: `BrandMark` (the market-stall mark) and
  `Logo` (horizontal / stacked / mark; `color` or `reversed` tone).
- Used in: header, new site footer (`src/components/Footer.tsx`), login,
  register, seller-centre sidebar, homepage hero, AI support prompt, and
  vendor-facing copy that used to say "the marketplace".
- Icons via Next file conventions: `src/app/icon.svg`, `favicon.ico`,
  `apple-icon.png`, `opengraph-image.png`, `twitter-image.png`,
  `manifest.ts`.
- `public/brand/`: outlined SVG + PNG logos (horizontal, stacked, mark,
  wordmark; colour and reversed) for print, social and email.
- The `PlatformSettings.marketplaceName` row in an existing database still
  says "Marketplace" (it isn't shown anywhere yet); the seed now creates
  "Mmarakeng" for fresh databases.
