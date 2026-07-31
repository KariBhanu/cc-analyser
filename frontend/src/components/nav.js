// Single source of truth for navigation, shared by the desktop Sidebar and the
// mobile BottomNav. `short` is the abbreviated label the bottom bar uses.
export const NAV = [
  { to: "/", label: "Dashboard", short: "Home", icon: "dashboard", end: true },
  { to: "/cards", label: "Cards", short: "Cards", icon: "credit_card" },
  { to: "/best-card", label: "Best Card", short: "Best", icon: "star" },
  { to: "/assistant", label: "Assistant", short: "Ask", icon: "smart_toy" },
  { to: "/statements", label: "Statements", short: "Spends", icon: "receipt_long" },
];
