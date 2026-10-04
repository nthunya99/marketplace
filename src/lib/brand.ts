/**
 * Single source of truth for the Mmarakeng brand.
 *
 * Anything customer- or vendor-facing that names the platform (page
 * titles, the header, footer, AI support prompt, payment descriptions)
 * should read from here, so a future rename is a one-file change.
 */
export const BRAND = {
  name: "Mmarakeng",
  /** Sesotho for "at the market". */
  meaning: "at the market",
  domain: "mmarakeng.app",
  url: "https://mmarakeng.app",
  tagline: "Lesotho’s marketplace. Every seller, one cart.",
  description:
    "Mmarakeng is Lesotho’s multi-vendor marketplace. Shop from verified local sellers and check out once, however many stores you buy from.",
  supportPhone: "010 005 6200",
  supportEmail: "support@mmarakeng.app",
  /** Sellers' area name, used in the vendor sidebar. */
  sellerCentre: "Seller centre",
  colors: {
    pine: "#0F5C42",
    pineDark: "#0A4230",
    pineLight: "#E4F1EA",
    marigold: "#EE9330",
    paper: "#FAF8F3",
  },
} as const;
