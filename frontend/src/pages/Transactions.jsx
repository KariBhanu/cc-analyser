import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { rupee } from "../format.js";
import {
  Alert, Button, Chip, Combobox, EmptyState, merchantIcon, Panel,
} from "../components/ui.jsx";

const TYPE_OPTIONS = [
  { value: "debit", label: "Debits" },
  { value: "credit", label: "Credits & refunds" },
];

export default function Transactions() {
  const [rows, setRows] = useState(null);
  const [card, setCard] = useState("");
  const [statement, setStatement] = useState("");
  const [merchant, setMerchant] = useState("");
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listTransactions()
      .then(setRows)
      .catch((err) => { setError(err.message); setRows([]); });
  }, []);

  const cardOptions = useMemo(() => {
    const seen = new Map();
    (rows || []).forEach((row) => seen.set(row.card_id, row.card_label));
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [rows]);

  const merchantOptions = useMemo(() => {
    const counts = new Map();
    (rows || []).forEach((row) => {
      counts.set(row.merchant, (counts.get(row.merchant) || 0) + 1);
    });
    return [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ value: name, label: name, hint: `${count}` }));
  }, [rows]);

  const statementOptions = useMemo(() => {
    const grouped = new Map();
    (rows || []).forEach((row) => {
      const current = grouped.get(row.statement_id);
      grouped.set(row.statement_id, {
        label: row.statement_label,
        sortDate: row.statement_period_end || row.date || "",
        count: (current?.count || 0) + 1,
      });
    });

    return [...grouped].map(([id, group]) => {
      return {
        value: id,
        label: group.label,
        hint: `${group.count} transaction${group.count === 1 ? "" : "s"}`,
        sortDate: group.sortDate,
      };
    }).sort((a, b) => b.sortDate.localeCompare(a.sortDate));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter((row) =>
      (!card || row.card_id === card)
      && (!statement || row.statement_id === statement)
      && (!merchant || row.merchant === merchant)
      && (!kind || (kind === "credit" ? row.credit : !row.credit))
      && (!q || `${row.description} ${row.merchant} ${row.card_label}`.toLowerCase().includes(q))
    );
  }, [rows, card, statement, merchant, kind, query]);

  const totals = useMemo(() => {
    let spend = 0;
    let credit = 0;
    filtered.forEach((row) => (row.credit ? (credit += row.amount) : (spend += row.amount)));
    return { spend, credit };
  }, [filtered]);

  const activeFilters = Boolean(card || statement || merchant || kind || query);
  const clearAll = () => {
    setCard("");
    setStatement("");
    setMerchant("");
    setKind("");
    setQuery("");
  };

  if (rows === null) {
    return <p className="font-body-md text-slate-400">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-stack-lg">
      <div className="flex justify-between items-center gap-4">
        <div className="min-w-0">
          <h2 className="font-headline-lg text-headline-lg-mobile md:text-display-lg md:font-display-lg text-white tracking-tight m-0">
            Transactions
          </h2>
          <p className="font-body-sm text-[12px] text-slate-500 mt-1.5 m-0">
            {rows.length} transaction{rows.length === 1 ? "" : "s"} across your statements
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
          Add a statement and any transaction rows we recognise will appear here.
        </EmptyState>
      ) : (
        <>
          <Panel icon="filter_alt" title="Filters" meta={`${filtered.length}/${rows.length}`} accent>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <Combobox
                options={cardOptions}
                value={card}
                onChange={setCard}
                placeholder="All cards"
                emptyText="No cards"
              />
              <Combobox
                options={statementOptions}
                value={statement}
                onChange={setStatement}
                placeholder="All statements"
                emptyText="No statements"
              />
              <Combobox
                options={merchantOptions}
                value={merchant}
                onChange={setMerchant}
                placeholder="All merchants"
                emptyText="No merchants"
              />
              <Combobox
                options={TYPE_OPTIONS}
                value={kind}
                onChange={setKind}
                placeholder="All transaction types"
                emptyText="No types"
              />
              <div className="relative">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-600">
                  search
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search transactions…"
                  aria-label="Search transactions"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-10 pr-3 py-2 font-body-sm text-[13px] font-normal text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            </div>

            {activeFilters && (
              <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-800/60">
                <span className="font-label-md text-[10px] uppercase tracking-widest text-slate-600">
                  Showing {filtered.length} of {rows.length}
                </span>
                {card && <Chip tone="emerald">{cardOptions.find((item) => item.value === card)?.label}</Chip>}
                {statement && (
                  <Chip tone="emerald">
                    {statementOptions.find((item) => item.value === statement)?.label}
                  </Chip>
                )}
                {merchant && <Chip tone="emerald">{merchant}</Chip>}
                {kind && <Chip tone="emerald">{kind === "credit" ? "Credits" : "Debits"}</Chip>}
                {query && <Chip>“{query}”</Chip>}
                <button
                  type="button"
                  onClick={clearAll}
                  className="font-label-md text-[10px] uppercase tracking-widest text-slate-500 hover:text-emerald-400 bg-transparent border-0 p-0 cursor-pointer transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card rounded-xl p-5">
              <p className="font-label-md text-[10px] uppercase tracking-widest text-slate-500 m-0">
                Spend
              </p>
              <p className="font-numeric-data text-[22px] text-white mt-1 m-0">
                {rupee(totals.spend)}
              </p>
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

          {filtered.length === 0 ? (
            <EmptyState icon="search_off" title="Nothing matches those filters">
              Try clearing one or more filters.
            </EmptyState>
          ) : (
            <section className="glass-card rounded-xl overflow-hidden">
              {filtered.map((row) => (
                <article
                  key={row.id}
                  className="flex items-start sm:items-center gap-4 px-4 sm:px-5 py-3 border-b border-slate-800/40 last:border-b-0 hover:bg-slate-800/20 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">
                      {row.credit ? "undo" : merchantIcon(row.merchant)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-label-md text-[12px] text-slate-200 truncate m-0">
                      {row.merchant}
                    </p>
                    <p className="font-body-sm text-[10px] text-slate-500 truncate mt-0.5 m-0">
                      {row.description}
                    </p>
                    <p className="font-body-sm text-[10px] text-slate-700 truncate mt-0.5 m-0">
                      {row.card_label} · {row.date || "Date unavailable"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-numeric-data text-[14px] m-0 ${
                      row.credit ? "text-emerald-400" : "text-slate-200"
                    }`}>
                      {row.credit ? "+" : ""}{rupee(row.amount)}
                    </p>
                    <p className="font-label-md text-[9px] uppercase tracking-widest text-slate-600 mt-1 m-0">
                      {row.credit ? "Credit" : "Debit"}
                    </p>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
