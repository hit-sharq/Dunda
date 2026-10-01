export const colors = {
  ink: "#182127",
  inkSoft: "#27373d",
  surface: "#fbf9f3",
  canvas: "#f5f1e8",
  line: "#e2dcd0",
  muted: "#69736f",
  mutedSoft: "#859089",
  accent: "#f07a4b",
  green: "#3c7e69",
  greenSoft: "#e2f0e8",
  amber: "#92702b",
  amberSoft: "#fbf2d9",
  red: "#a3452e",
  redSoft: "#fbeae5",
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
