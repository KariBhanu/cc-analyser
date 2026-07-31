import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { rupee } from "../format.js";
import {
  Alert, Button, Chip, Combobox, EmptyState, merchantIcon, Panel,
} from "../components/ui.jsx";

// Landing page for statements: every transaction across every statement, with
// filters. The add form lives at /upload and is linked from here.
export default function Statements() {
  const [rows, setRows] = useState(null);
  const [statements, setStatements] = useState([]);
  const [card, setCard] = useState("");
  const [merchant, setMerchant] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.listTransactions().then(setRows).catch((e) => { setError(e.message); setRows([]); });
    api.listStatements().then(setStatements).catch(() => {});
  }, []);

  // Filter options come from the data itself, so we never offer a card or
  // merchant with nothing behind it.
  const cardOptions = useMemo(() => {
    const seen = new Map();
    (rows || []).forEach((r) => seen.set(r.card_id, r.card_label));
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [rows]);

  const merchantOptions = useMemo(() => {
    const counts = new Map();
    (rows || []).forEach((r) => counts.set(r.merchant, (counts.get(r.merchant) || 0) + 1));
    return [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, n]) => ({ value: name, label: name, hint: `${n}` }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter(
      (r) =>
        (!card || r.card_id === card) &&
        (!merchant || r.merchant === merchant) &&
        (!q || `${r.description} ${r.merchant}`.toLowerCase().includes(q))
    );
  }, [rows, card, merchant, query]);

  // Credits (refunds, payments) are not spend, so they're summed separately
  // rather than netted off — otherwise a bill payment looks like negative spend.
  const totals = useMemo(() => {
    let spend = 0, credit = 0;
    filtered.forEach((r) => (r.credit ? (credit += r.amount) : (spend += r.amount)));
    return { spend, credit };
  }, [filtered]);

  const activeFilters = Boolean(card || merchant || query);
  const clearAll = () => { setCard(""); setMerchant(""); setQuery(""); };

  if (rows === null) {
    return <p className="font-body-md text-slate-400">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-stack-lg">
      <div className="flex justify-between items-center gap-4">
        <div className="min-w-0">
          <h2 className="font-headline-lg text-headline-lg-mobile md:text-display-lg md:font-display-lg text-white tracking-tight m-0">
            Statements
          </h2>
          <p className="font-body-sm text-[12px] text-slate-500 mt-1.5 m-0">
            {statements.length} statement{statements.length === 1 ? "" : "s"} ·{" "}
            {rows.length} transaction{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link to="/upload" className="shrink-0 no-underline">
          <Button>
            <span className="material-symbols-outlined text-base">add</span> Add Statement
          </Button>
        </Link>
      </div>

      <Alert>{error}</Alert>

      {rows.length === 0 ? (
        <EmptyState icon="receipt_long" title="No transactions yet">
          Transactions are read from statement PDFs. Add a statement and any rows we
          can recognise will appear here.
        </EmptyState>
      ) : (
        <>
          {/* ───── Filters ───── */}
          <Panel icon="filter_alt" title="Filters" accent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Combobox
                options={cardOptions}
                value={card}
                onChange={setCard}
                placeholder="All cards"
                emptyText="No cards"
              />
              <Combobox
                options={merchantOptions}
                value={merchant}
                onChange={setMerchant}
                placeholder="All merchants"
                emptyText="No merchants"
              />
              <div className="relative">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-600">
                  search
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search descriptions…"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-10 pr-3 py-2 font-body-sm text-[13px] font-normal text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            </div>

            {activeFilters && (
              <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-800/60">
                <span className="font-label-md text-[10px] uppercase tracking-widest text-slate-600">
                  Showing {filtered.length} of {rows.length}
                </span>
                {card && <Chip tone="emerald">{cardOptions.find((c) => c.value === card)?.label}</Chip>}
                {merchant && <Chip tone="emerald">{merchant}</Chip>}
                {query && <Chip>“{query}”</Chip>}
                <button
                  onClick={clearAll}
                  className="font-label-md text-[10px] uppercase tracking-widest text-slate-500 hover:text-emerald-400 bg-transparent border-0 p-0 cursor-pointer transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </Panel>

          {/* ───── Totals for the current filter ───── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card rounded-xl p-5">
              <p className="font-label-md text-[10px] uppercase tracking-widest text-slate-500 m-0">
                Spend
              </p>
              <p className="font-numeric-data text-[22px] text-white mt-1 m-0">{rupee(totals.spend)}</p>
            </div>
            <div className="glass-card rounded-xl p-5">
              <p className="font-label-md text-[10px] uppercase tracking-widest text-slate-500 m-0">
                Credits &amp; refunds
              </p>
              <p className="font-numeric-data text-[22px] text-emerald-400 mt-1 m-0">
                {rupee(totals.credit)}
              </p>
            </div>
          </div>

          {/* ───── Transactions ───── */}
          {filtered.length === 0 ? (
            <EmptyState icon="search_off" title="Nothing matches those filters">
              Try clearing one of them.
            </EmptyState>
          ) : (
            <div className="glass-card rounded-xl overflow-hidden">
              {filtered.map((r, i) => (
                <div
                  key={`${r.statement_id}-${i}`}
                  className="flex items-center gap-4 px-5 py-3 border-b border-slate-800/40 last:border-b-0 hover:bg-slate-800/20 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">
                      {r.credit ? "undo" : merchantIcon(r.merchant)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-label-md text-[12px] text-slate-200 truncate m-0">
                      {r.merchant}
                    </p>
                    <p className="font-body-sm text-[10px] text-slate-600 truncate m-0">
                      {r.description}
                    </p>
                  </div>
                  <div className="hidden sm:block shrink-0 text-right">
                    <p className="font-body-sm text-[10px] text-slate-600 m-0 whitespace-nowrap">
                      {r.card_label}
                    </p>
                    <p className="font-body-sm text-[10px] text-slate-700 m-0">{r.date || "—"}</p>
                  </div>
                  <p
                    className={`font-numeric-data text-[14px] shrink-0 w-28 text-right m-0 ${
                      r.credit ? "text-emerald-400" : "text-slate-200"
                    }`}
                  >
                    {r.credit ? "+" : ""}
                    {rupee(r.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
