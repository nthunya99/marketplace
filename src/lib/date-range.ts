/**
 * Resolves the named date-range presets from spec sections 19/20 (today,
 * last 7 days, last 30 days, this month, previous month) plus an explicit
 * custom range, into a concrete { from, to } pair used by both the vendor
 * and admin analytics routes.
 */
export function resolveDateRange(
  preset: string | null,
  fromParam: string | null,
  toParam: string | null
): { from: Date; to: Date } {
  const now = new Date();

  if (preset === "custom" && fromParam && toParam) {
    return { from: new Date(fromParam), to: new Date(toParam) };
  }

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "last7days":
      return { from: startOfDay(new Date(now.getTime() - 6 * 86400000)), to: endOfDay(now) };
    case "thisMonth":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case "previousMonth": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      return { from, to };
    }
    case "last30days":
    default:
      return { from: startOfDay(new Date(now.getTime() - 29 * 86400000)), to: endOfDay(now) };
  }
}
