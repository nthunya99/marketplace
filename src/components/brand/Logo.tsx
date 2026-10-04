import { BRAND } from "@/lib/brand";

type Tone = "color" | "reversed";

/**
 * Mmarakeng market-stall mark: a domed canopy with a scalloped edge,
 * two posts and a counter, with a marigold drop under the canopy.
 *
 * "color"    — pine greens + marigold, for light backgrounds.
 * "reversed" — paper/mint stall + marigold, for the dark-green header,
 *              hero and footer.
 *
 * Flat fills (no gradients) so many instances on one page never clash
 * over SVG ids, and the shape stays crisp at favicon-ish sizes.
 */
export function BrandMark({
  size = 32,
  tone = "color",
  className,
  title,
}: {
  size?: number;
  tone?: Tone;
  className?: string;
  /** Pass a title only when the mark stands alone (no wordmark beside it). */
  title?: string;
}) {
  const canopy = tone === "color" ? "#136B4B" : "#FAF8F3";
  const base = tone === "color" ? "#0B4A35" : "#D5EADF";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path fill={base} d="M8.8 32h3.8v17H8.8zM51.4 32h3.8v17h-3.8z" />
      <path
        fill={canopy}
        d="M32 1.6C33.6 1.6 34 3 35 4.6C36.8 7.4 40.5 9 45 11.2C53.5 15.4 58.6 21.5 59.4 30.5C59.8 34.6 58.2 37.6 54.6 37.8C51 38 48.6 36 46.2 33.8C45.6 37 43.2 39.4 40 39.4C36.6 39.4 34 37.2 32 34.6C30 37.2 27.4 39.4 24 39.4C20.8 39.4 18.4 37 17.8 33.8C15.4 36 13 38 9.4 37.8C5.8 37.6 4.2 34.6 4.6 30.5C5.4 21.5 10.5 15.4 19 11.2C23.5 9 27.2 7.4 29 4.6C30 3 30.4 1.6 32 1.6Z"
      />
      <rect x="6" y="48" width="52" height="15" fill={base} />
      <path
        fill={BRAND.colors.marigold}
        d="M32 29.6C33.8 32.2 35.3 34.4 35.3 36.4A3.3 3.3 0 0 1 28.7 36.4C28.7 34.4 30.2 32.2 32 29.6Z"
      />
    </svg>
  );
}

/**
 * Full lockup. The wordmark is live Fraunces text (already loaded by the
 * root layout) rather than outlined paths, so it stays sharp, selectable
 * and readable by screen readers. Outlined SVG/PNG versions for print,
 * social and email live in /public/brand.
 *
 *   horizontal — header, footer, emails
 *   stacked    — login / register, splash moments
 *   mark       — tight spaces (mobile header, avatars)
 */
export default function Logo({
  variant = "horizontal",
  tone = "color",
  size = 36,
  className = "",
  hideWordmarkOnMobile = false,
}: {
  variant?: "horizontal" | "stacked" | "mark";
  tone?: Tone;
  /** Height of the mark in px; the wordmark scales with it. */
  size?: number;
  className?: string;
  /** Header use: show only the mark below the sm breakpoint. */
  hideWordmarkOnMobile?: boolean;
}) {
  if (variant === "mark") {
    return <BrandMark size={size} tone={tone} className={className} title={BRAND.name} />;
  }

  const wordColor = tone === "color" ? "text-brand" : "text-white";
  const stacked = variant === "stacked";
  // Matches the reference lockup: cap height ≈ 0.35× the mark (horizontal),
  // a touch smaller under the stacked mark.
  const fontSize = Math.round(size * (stacked ? 0.46 : 0.62));

  return (
    <span
      className={`inline-flex ${stacked ? "flex-col items-center gap-1.5" : "items-center gap-2"} ${className}`}
    >
      <BrandMark size={size} tone={tone} />
      <span
        className={`font-display font-semibold leading-none tracking-[-0.015em] ${wordColor} ${
          hideWordmarkOnMobile ? "hidden sm:inline" : ""
        }`}
        style={{ fontSize }}
      >
        {BRAND.name}
      </span>
    </span>
  );
}
