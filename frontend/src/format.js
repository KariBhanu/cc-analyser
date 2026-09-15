// Shared ₹ / percentage formatting so every page renders numbers identically.

export const rupee = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// Same, but keeps paise — used where a reward can be a fraction of a rupee.
export const rupee2 = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

// Compact ₹ for big totals: 3450000 -> ₹34.50L, 145000 -> ₹1.45L, 60000 -> ₹60K
export const rupeeShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1e7) return "₹" + (v / 1e7).toFixed(2) + "Cr";
  if (v >= 1e5) return "₹" + (v / 1e5).toFixed(2) + "L";
  if (v >= 1e3) return "₹" + Math.round(v / 1e3) + "K";
  return rupee(v);
};

export const pct = (p) => Math.max(0, Math.min(100, Math.round((p || 0) * 100)));
