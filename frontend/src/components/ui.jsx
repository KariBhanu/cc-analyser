import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

/* Searchable dropdown. A native <select> can't be styled to match this theme
   (the popup is drawn by the OS) and can't be typed into to filter -- picking
   one card out of 33 by scrolling is painful. This renders its own listbox.

   options: [{ value, label, hint?, note? }]
     hint  -- muted text on the right of the row (e.g. reward currency)
     note  -- appended to the label in brackets (e.g. a discontinued status) */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Search…",
  emptyText = "No matches",
  disabled = false,
  required = false,
  id,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Measured screen position for the portalled listbox.
  const [pos, setPos] = useState(null);
  const boxRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => o.value === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.hint || ""} ${o.note || ""}`.toLowerCase().includes(q)
    );
  }, [options, query]);

  /* The listbox is portalled to <body> rather than absolutely positioned in
     place. `.glass-card` sets backdrop-filter, which creates a stacking
     context, so an in-place dropdown is trapped inside its own panel and any
     later glass-card sibling paints over it -- no z-index can win that. A
     portal leaves the subtree entirely, so it needs its position measured. */
  useEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      // Flip upward when the space below can't hold the list but above can.
      const flip = below < 200 && r.top > below;
      setPos(
        flip
          ? { left: r.left, bottom: window.innerHeight - r.top + 4, width: r.width }
          : { left: r.left, top: r.bottom + 4, width: r.width }
      );
    };
    measure();
    // Capture phase so scrolling any ancestor keeps the list attached.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, filtered.length]);

  // Clicking outside closes it. The options call preventDefault on mousedown so
  // the input never blurs, which means blur alone can't be relied on.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (boxRef.current?.contains(e.target)) return;
      if (listRef.current?.contains(e.target)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open || !listRef.current) return;
    // Optional call: jsdom (and some older webviews) don't implement it.
    listRef.current.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  // Reset the highlight whenever the visible set changes, so Enter can't
  // select a row that scrolled out of the filtered results.
  useEffect(() => { setActive(0); }, [query, options]);

  function choose(option) {
    if (!option) return;
    onChange(option.value);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (filtered.length ? (i + step + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault();
        choose(filtered[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div
      ref={boxRef}
      className="relative"
      onBlur={(e) => {
        // Only close when focus actually leaves the widget, not when it moves
        // from the input to a row inside it.
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          required={required && !value}
          value={open ? query : selected?.label || ""}
          placeholder={open && selected ? selected.label : placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={onKeyDown}
          className={`${CONTROL} pr-9 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-text"}`}
        />
        <span
          className={`material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[18px] transition-transform ${
            open ? "rotate-180 text-emerald-400" : "text-slate-600"
          }`}
        >
          expand_more
        </span>
      </div>

      {open && !disabled && pos && typeof document !== "undefined" &&
        createPortal(
        <ul
          ref={listRef}
          role="listbox"
          style={pos}
          className="fixed z-[9999] max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-950 py-1 shadow-2xl"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 font-body-sm text-[12px] text-slate-600">{emptyText}</li>
          )}
          {filtered.map((o, i) => {
            const isActive = i === active;
            const isSelected = o.value === value;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                // mousedown, not click: click fires after blur would have
                // already closed the list.
                onMouseDown={(e) => { e.preventDefault(); choose(o); }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 font-body-sm text-[13px] transition-colors ${
                  isActive ? "bg-emerald-500/10 text-emerald-300" : "text-slate-300"
                }`}
              >
                <span className="min-w-0 truncate">
                  {o.label}
                  {o.note && <span className="text-slate-500"> ({o.note})</span>}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {o.hint && (
                    <span className="font-label-md text-[9px] uppercase tracking-widest text-slate-600">
                      {o.hint}
                    </span>
                  )}
                  {isSelected && (
                    <span className="material-symbols-outlined text-[15px] text-emerald-400">check</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </div>
  );
}

export function Input({ className = "", ...props }) {
  return <input {...props} className={`${CONTROL} ${className}`} />;
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

/* In-button spinner. Material Symbols ships "progress_activity" for exactly
   this, so it matches the icon set already in use rather than adding an SVG. */
export function Spinner({ className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined animate-spin text-base leading-none ${className}`}
    >
      progress_activity
    </span>
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

const ALERT_KINDS = {
  error: ["text-red-300 bg-red-950/30 border-red-500/30", "error"],
  ok: ["text-emerald-300 bg-emerald-950/40 border-emerald-500/30", "check_circle"],
  warn: ["text-amber-300 bg-amber-950/30 border-amber-500/30", "warning"],
};

export function Alert({ kind = "error", children }) {
  if (!children) return null;
  const [tone, icon] = ALERT_KINDS[kind] || ALERT_KINDS.error;
  return (
    <p
      className={`font-body-sm text-[12px] m-0 px-4 py-3 border rounded-lg flex items-center gap-2 ${tone}`}
    >
      <span className="material-symbols-outlined text-base shrink-0">{icon}</span>
      {children}
    </p>
  );
}

// Small label/value pair used in the read-only spec grids.
export function Stat({ label, value, tone = "text-slate-200", tip }) {
  return (
    <div className="min-w-0">
      <p className="font-body-sm text-[9px] uppercase tracking-widest text-slate-600 m-0 flex items-center gap-1">
        {label}
        {tip && <Tooltip text={tip} />}
      </p>
      <p className={`font-numeric-data text-[15px] mt-0.5 m-0 truncate ${tone}`}>{value}</p>
    </div>
  );
}

/* Explanations for the reward terms. Card jargon is genuinely opaque -- most
   people can't say what their card's point is worth -- and getting these wrong
   is what makes the reward maths untrustworthy. Kept here so the wording is
   identical everywhere a term appears. */
export const TERM_HELP = {
  base_rate:
    "Points you earn per ₹100 of ordinary spend — anything without a merchant bonus. A card at 2 pts/₹100 gives 200 points on ₹10,000.",
  point_value:
    "What one point is actually worth in rupees when redeemed. Points are not comparable across cards without this: 5 pts/₹100 at ₹0.25 a point beats 2 pts/₹100 at ₹0.50, and this is what we rank cards by.",
  base_cap:
    "The most base points this card will award in a single statement month. Spend beyond it still counts toward the fee waiver, but stops earning base points. Blank means uncapped.",
  bonus_cap:
    "The most bonus points the accelerated merchant categories will award in a month, shared across all of them together — not per merchant. Blank means uncapped.",
  annual_fee:
    "Charged yearly. Many cards refund it if you spend above the waiver threshold within the card year.",
  fee_waiver:
    "Spend this much in a financial year (April–March) and the annual fee is refunded or not charged.",
};

/* Hover/focus hint.

   The bubble is portalled to <body> with position:fixed rather than being
   absolutely positioned next to the trigger. It has to be: the card these sit
   in is `relative overflow-hidden` (for its rounded corners and gradient), and
   a clipping ancestor cuts off descendants no matter how high their z-index
   is. A portal leaves that subtree entirely, which fixes the clipping and the
   stacking order in one go. */
const TIP_WIDTH = 240;

export function Tooltip({ text, label = "More information" }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  function show() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Keep the bubble on screen horizontally; anchor above unless the trigger
    // is too near the top of the viewport, in which case flip below.
    const half = TIP_WIDTH / 2;
    const x = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
    const above = r.top > 140;
    setPos({
      left: x,
      ...(above
        ? { bottom: window.innerHeight - r.top + 8 }
        : { top: r.bottom + 8 }),
    });
  }

  const hide = () => setPos(null);

  // A fixed-position bubble would drift away from its trigger on scroll, so
  // dismiss instead of trying to track it.
  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        title={text}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.preventDefault(); pos ? hide() : show(); }}
        className="w-3.5 h-3.5 rounded-full border border-slate-700 text-slate-500 hover:text-emerald-400 hover:border-emerald-500/50 focus:text-emerald-400 focus:outline-none bg-transparent p-0 cursor-help inline-flex items-center justify-center shrink-0 align-middle transition-colors"
      >
        <span className="font-label-md text-[8px] leading-none">i</span>
      </button>
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            style={{ ...pos, width: TIP_WIDTH, transform: "translateX(-50%)" }}
            className="pointer-events-none fixed z-[9999] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left font-body-sm text-[11px] normal-case tracking-normal leading-relaxed text-slate-300 shadow-2xl whitespace-pre-line"
          >
            {text}
          </span>,
          document.body
        )}
    </>
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
