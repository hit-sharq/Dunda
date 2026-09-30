export const colors = {
  ink: "#182127",
  inkSoft: "#27373d",
  surface: "#fbf9f3",
  canvas: "#f5f1e8",
  line: "#e2dbcd",
  accent: "#f07a4b",
  accentInk: "#182127",
  green: "#3c7e69",
  greenSoft: "#e2f0e8",
  amber: "#92702b",
  amberSoft: "#fbf2d9",
  red: "#a3452e",
  redSoft: "#fbeae5",
  muted: "#69736f",
  mutedSoft: "#859089",
} as const;

export const money = (value = 0) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);

export const statusColor: Record<string, { bg: string; fg: string; label: string }> = {
  AVAILABLE: { bg: "#e4f1e9", fg: "#397460", label: "Available" },
  OCCUPIED: { bg: "#fff0e9", fg: "#a84f32", label: "Occupied" },
  RESERVED: { bg: "#fbf2d9", fg: "#92702b", label: "Reserved" },
  PAYMENT_PENDING: { bg: "#f9e2e1", fg: "#a54b57", label: "Payment due" },
  CLEANING: { bg: "#ecefed", fg: "#6e7b75", label: "Resetting" },
};

export const orderStatusColor: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: "#ece8de", fg: "#6b7570" },
  PENDING: { bg: "#e4eceb", fg: "#3c7e69" },
  ACCEPTED: { bg: "#e4ecf2", fg: "#41708a" },
  PREPARING: { bg: "#f7ecd1", fg: "#92702b" },
  READY: { bg: "#fbe3d8", fg: "#a8502f" },
  SERVED: { bg: "#e7e9e2", fg: "#5f6b62" },
  PAYMENT_PENDING: { bg: "#f9e2e1", fg: "#a54b57" },
  COMPLETED: { bg: "#e2f0e8", fg: "#3c7e69" },
  CANCELLED: { bg: "#f0e6e3", fg: "#8a6a5f" },
};
