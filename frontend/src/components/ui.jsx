// Shared primitives so every page speaks the Dashboard's design language:
// Space Grotesk headings, JetBrains Mono labels, glass cards, emerald accents.
// Tokens come from the tailwind.config block in index.html.
//
// Note: styles.css still styles bare `input`/`select`/`button`/`label` with
// element selectors. Those lose to any utility class, but `font: inherit` and
// the label margin leak through unless we set weight/margin explicitly — hence
// the `font-normal` / `font-semibold` / `m-0` you'll see below.

// Accent palette cycled across card tiles.
export const CARD_ACCENTS = [
  { text: "text-emerald-500/80", icon: "text-emerald-500/50", border: "border-emerald-500/20", value: "text-emerald-400", bar: "bg-emerald-500", chip: "text-emerald-400 bg-emerald-950 border-emerald-500/20", dot: "text-emerald-400 border-emerald-500/30" },
  { text: "text-blue-500/80", icon: "text-blue-500/50", border: "border-blue-500/20", value: "text-blue-400", bar: "bg-blue-500", chip: "text-blue-400 bg-blue-950 border-blue-500/20", dot: "text-blue-400 border-blue-500/30" },
];

// Merchant icons used by the Popular Merchants tiles and the ranking chips.
export const MERCHANT_ICONS = {
  amazon: "shopping_cart",
  flipkart: "shopping_bag",
  swiggy: "restaurant",
  zomato: "fastfood",
  uber: "local_taxi",
  myntra: "apparel",
  bookmyshow: "local_activity",
};

export const merchantIcon = (m) => MERCHANT_ICONS[(m || "").trim().toLowerCase()] || "storefront";

// The physical-card visual shared by the Cards, Dashboard and Best Card screens.
// `ratio` renders the true 1:1.586 card aspect; otherwise the caller sizes it.
export function CardFace({ issuer, name, accent, icon = "memory", ratio = false, className = "", children }) {
  return (
    <div
      className={`relative overflow-hidden bg-slate-950 border ${accent.border} rounded-lg p-stack-md flex flex-col justify-between text-white shadow-lg ${
        ratio ? "aspect-[1.586/1]" : ""
      } ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-50" />
      <div className="flex justify-between items-start gap-2 relative z-10">
        <span className={`font-label-md text-[10px] tracking-widest uppercase truncate ${accent.text}`}>
          {issuer}
        </span>
        <span className={`material-symbols-outlined text-lg shrink-0 ${accent.icon}`}>{icon}</span>
      </div>
      <div className="mt-auto relative z-10 min-w-0">
        <p className="font-numeric-data text-lg tracking-widest m-0">•••• ••••</p>
        <p className="font-body-sm text-[10px] uppercase text-slate-500 mt-1 m-0 truncate">Class: {name}</p>
        {children}
      </div>
    </div>
  );
}

// Thin progress rail used for fee-waiver / threshold tracking.
export function ProgressBar({ value, bar = "bg-emerald-500", muted = false }) {
  return (
    <div className={`w-full h-1 progress-bar-bg rounded-full overflow-hidden ${muted ? "opacity-30" : ""}`}>
      <div className={`h-full ${muted ? "bg-slate-600" : bar}`} style={{ width: `${value}%` }} />
    </div>
  );
}

export function PageHeader({ icon, title, subtitle, children }) {
  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="font-headline-md text-headline-md text-white uppercase tracking-tight flex items-center gap-2">
          {icon && <span className="material-symbols-outlined text-emerald-500 text-xl">{icon}</span>}
          {title}
        </h2>
        {subtitle && <p className="font-body-sm text-[11px] text-slate-500 mt-1.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-3 shrink-0">{children}</div>}
    </div>
  );
}

export function Panel({ icon, title, meta, accent = false, className = "", children }) {
  return (
    <section className={`glass-card rounded-xl p-6 ${accent ? "accent-border" : ""} ${className}`}>
      {(title || meta) && (
        <header className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-2 text-slate-500 min-w-0">
            {icon && <span className="material-symbols-outlined text-emerald-500 text-lg shrink-0">{icon}</span>}
            <h3 className="font-label-md text-[11px] font-semibold uppercase tracking-widest truncate">{title}</h3>
          </div>
          {meta && (
            <span className="font-label-md text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 border border-slate-700 rounded whitespace-nowrap shrink-0">
              {meta}
            </span>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, className = "", children }) {
  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-slate-500 m-0">
        {label}
      </label>
      {children}
      {hint && <p className="font-body-sm text-[10px] text-slate-600 m-0">{hint}</p>}
    </div>
  );
}

const CONTROL =
  "w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 font-body-sm text-[13px] font-normal text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-colors";

export function Input({ className = "", ...props }) {
  return <input {...props} className={`${CONTROL} ${className}`} />;
}

export function Select({ className = "", children, ...props }) {
  return (
    <select {...props} className={`${CONTROL} ${className}`}>
      {children}
    </select>
  );
}

export function FileInput({ className = "", ...props }) {
  return (
    <input
      {...props}
      type="file"
      className={`w-full bg-slate-950/60 border border-slate-800 border-dashed rounded-lg p-3 font-body-sm text-[12px] font-normal text-slate-400 cursor-pointer transition-colors hover:border-emerald-500/40 file:mr-4 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-700 file:bg-slate-800 file:text-slate-300 file:font-label-md file:text-[10px] file:font-semibold file:uppercase file:tracking-widest file:cursor-pointer ${className}`}
    />
  );
}

const BTN_VARIANTS = {
  primary:
    "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-400 hover:text-emerald-100",
  ghost:
    "bg-slate-800/40 border-slate-700 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-400",
  danger:
    "bg-transparent border-slate-800 text-slate-500 hover:border-red-500/50 hover:text-red-400",
};

export function Button({ variant = "primary", className = "", children, ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 border rounded-lg px-4 py-2.5 font-label-md text-[11px] font-semibold uppercase tracking-[0.15em] cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed ${BTN_VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({ tone = "slate", className = "", children }) {
  const tones = {
    slate: "text-slate-400 bg-slate-800/60 border-slate-700",
    emerald: "text-emerald-400 bg-emerald-950 border-emerald-500/20",
    blue: "text-blue-400 bg-blue-950 border-blue-500/20",
    red: "text-red-400 bg-red-900/20 border-red-500/30",
  };
  return (
    <span
      className={`font-label-md text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 border rounded whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Alert({ kind = "error", children }) {
  if (!children) return null;
  const ok = kind === "ok";
  return (
    <p
      className={`font-body-sm text-[12px] m-0 px-4 py-3 border rounded-lg flex items-center gap-2 ${
        ok
          ? "text-emerald-300 bg-emerald-950/40 border-emerald-500/30"
          : "text-red-300 bg-red-950/30 border-red-500/30"
      }`}
    >
      <span className="material-symbols-outlined text-base shrink-0">{ok ? "check_circle" : "error"}</span>
      {children}
    </p>
  );
}

// Small label/value pair used in the read-only spec grids.
export function Stat({ label, value, tone = "text-slate-200" }) {
  return (
    <div className="min-w-0">
      <p className="font-body-sm text-[9px] uppercase tracking-widest text-slate-600 m-0">{label}</p>
      <p className={`font-numeric-data text-[15px] mt-0.5 m-0 truncate ${tone}`}>{value}</p>
    </div>
  );
}

export function EmptyState({ icon = "inbox", title, children }) {
  return (
    <div className="glass-card rounded-xl p-10 flex flex-col items-center text-center gap-3">
      <span className="material-symbols-outlined text-3xl text-slate-700">{icon}</span>
      <p className="font-label-md text-[12px] font-semibold uppercase tracking-widest text-slate-400 m-0">{title}</p>
      {children && <p className="font-body-sm text-[12px] text-slate-500 m-0 max-w-sm">{children}</p>}
    </div>
  );
}
