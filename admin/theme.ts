/**
 * The platform console's colours.
 *
 * These used to be cream and near-black literals. The console renders inside the
 * club app's shell, which is dark, so it was painting its own light card with
 * near-black text and landing on a dark page — white on white, and the numbers
 * vanished. Rather than restyle the console by hand against a palette it shares
 * with the rest of the product, it reads the same tokens, so one change moves
 * both and neither can drift.
 *
 * `hsl(var(--app-ink))` rather than a flat colour because the tokens resolve per
 * theme: dark here, and light if the machine asks for it.
 */
export const colors = {
  ink: "hsl(var(--app-ink))",
  inkSoft: "hsl(var(--app-ink-soft))",
  surface: "hsl(var(--app-surface))",
  canvas: "hsl(var(--app-bg))",
  line: "hsl(var(--app-line))",
  lineSoft: "hsl(var(--app-line-soft))",
  muted: "hsl(var(--app-muted))",
  mutedSoft: "hsl(var(--app-faint))",
  accent: "hsl(var(--app-gold))",
  green: "hsl(var(--app-success))",
  greenSoft: "hsl(var(--app-success-soft))",
  amber: "hsl(var(--app-warn))",
  amberSoft: "hsl(var(--app-warn-soft))",
  red: "hsl(var(--app-critical))",
  redSoft: "hsl(var(--app-critical-soft))",
  info: "hsl(var(--app-info))",
  infoSoft: "hsl(var(--app-info-soft))",
} as const;

export const money = (value = 0) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);

export const timeAgo = (stamp: string | Date | null | undefined): string => {
  if (!stamp) return "never";
  const mins = Math.max(1, Math.floor((Date.now() - new Date(stamp).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
};

export const dateOnly = (stamp: string | Date | null | undefined): string =>
  stamp ? new Date(stamp).toISOString().slice(0, 10) : "—";
