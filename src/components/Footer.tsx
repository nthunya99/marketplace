import Link from "next/link";
import Logo from "./brand/Logo";
import { BRAND } from "@/lib/brand";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Shop",
    links: [
      { href: "/", label: "All products" },
      { href: "/wishlist", label: "Wishlist" },
      { href: "/cart", label: "Cart" },
      { href: "/orders", label: "Track my order" },
    ],
  },
  {
    title: "Sell",
    links: [
      { href: "/register", label: `Sell on ${BRAND.name}` },
      { href: "/vendor/dashboard", label: BRAND.sellerCentre },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/support", label: "Support chat" },
      { href: "/loyalty", label: "Loyalty points" },
    ],
  },
];

/**
 * Site-wide footer. Closes every page on the same dark pine as the
 * header, so the brand frames the content top and bottom.
 */
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-brand-dark text-white/75 mt-12">
      <div className="max-w-6xl mx-auto px-4 py-10 grid gap-8 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
        <div className="max-w-xs">
          <Link href="/" aria-label={`${BRAND.name} home`} className="inline-block">
            <Logo tone="reversed" size={40} />
          </Link>
          <p className="mt-3 text-sm leading-relaxed">{BRAND.tagline}</p>
          <p className="mt-3 text-xs text-white/55">
            Pay sellers with M-Pesa, EcoCash or bank transfer.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-sm font-medium text-white mb-3">{col.title}</p>
            <ul className="space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-xs text-white/55">
          <p>
            © {year} {BRAND.name}. Made in Maseru, Lesotho.
          </p>
          <p>
            Call {BRAND.supportPhone} or email{" "}
            <a href={`mailto:${BRAND.supportEmail}`} className="hover:text-white transition-colors">
              {BRAND.supportEmail}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
