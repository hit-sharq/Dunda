/**
 * Default reporting window. This was spelled out in three places with
 * two different values (30 and 29 days), so two report pages silently
 * covered different periods.
 */
export const DEFAULT_REPORT_DAYS = 30;

export const productAccentColors: Record<string, string> = {
  lime: "#8ea7f2",
  sky: "#6f9fb2",
  mint: "#6ea493",
  violet: "#8f80a6",
  rose: "#b67d8c",
  orange: "#c77c4e",
  red: "#b75b56",
  cyan: "#5da3a3",
  gold: "#b08d49",
  amber: "#f07a4b",
};

export const tableStatusColors: Record<string, string> = {
  AVAILABLE: "border-[#b9d9c9] bg-[#e4f1e9] text-[#397460]",
  OCCUPIED: "border-[#efc2b3] bg-[#fff0e9] text-[#a84f32]",
  RESERVED: "border-[#e7d39c] bg-[#fbf2d9] text-[#92702b]",
  PAYMENT_PENDING: "border-[#e1b3b8] bg-[#f9e2e1] text-[#a54b57]",
  CLEANING: "border-[#d3d7d6] bg-[#ecefed] text-[#6e7b75]",
};
