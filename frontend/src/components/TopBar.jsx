import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

// Indian financial year runs 1 Apr – 31 Mar, and it's the window fee waivers are
// measured over — so it's genuinely useful context to keep on screen.
function financialYear(today = new Date()) {
  const start = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `${start}–${String(start + 1).slice(2)}`;
}

export default function TopBar({ user }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const initial = (user?.name || user?.email || "U").slice(0, 1).toUpperCase();

  // The search box answers "which card for this merchant?", so it routes to the
  // comparison page rather than pretending to search everything.
  function search(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/best-card?merchant=${encodeURIComponent(q)}`);
    setQuery("");
  }

  return (
    <header className="sticky top-0 z-40 flex justify-between items-center w-full px-container-padding h-16 bg-[#0f172a]/80 backdrop-blur-md border-b border-slate-800/50">
      {/* Mobile brand / desktop context */}
      <div className="flex-1 min-w-0">
        <div className="md:hidden flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-500 text-2xl">credit_card</span>
          <span className="font-headline-md text-headline-md font-bold text-white tracking-tighter">
            SmartCred
          </span>
        </div>
        <p className="hidden md:block font-headline-md text-headline-md text-white tracking-tight m-0">
          Financial year <span className="text-emerald-500">{financialYear()}</span>
        </p>
      </div>

      <div className="flex items-center gap-gutter shrink-0">
        <form onSubmit={search} className="hidden md:flex relative text-slate-500">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Compare cards for a merchant…"
            aria-label="Compare cards for a merchant"
            className="pl-10 pr-4 py-1.5 w-64 bg-slate-900/50 border border-slate-800 rounded font-body-sm text-body-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-0"
          />
        </form>

        <Link
          to="/upload"
          className="hidden md:flex items-center gap-2 bg-slate-800 text-slate-300 px-4 py-1.5 border border-slate-700 rounded font-label-md text-[12px] hover:bg-slate-700 hover:text-white transition-all"
        >
          <span className="material-symbols-outlined text-sm">add_circle</span> Add Statement
        </Link>

        <div className="w-8 h-8 rounded border border-slate-700 bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-label-md text-xs ml-stack-sm shrink-0">
          {initial}
        </div>
      </div>
    </header>
  );
}
