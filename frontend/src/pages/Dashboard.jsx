import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { pct, rupee, rupeeShort } from "../format.js";
import { Alert, CARD_ACCENTS as ACCENTS } from "../components/ui.jsx";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const { state } = useLocation();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(state?.saved || "");

  useEffect(() => {
    api.summary().then(setData).catch((e) => setError(e.message));
  }, []);

  // Drop the flash message from history so a refresh or a Back/Forward doesn't
  // resurrect a stale "Statement saved."
  useEffect(() => {
    if (state?.saved) navigate(".", { replace: true, state: null });
  }, [state, navigate]);

  // Auto-dismiss: the updated totals below are the real confirmation, so the
  // banner shouldn't outstay its usefulness.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(""), 4000);
    return () => clearTimeout(t);
  }, [saved]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="font-body-md text-slate-400">Loading…</p>;

  const cards = data.cards || [];
  const totalStatements = cards.reduce((s, c) => s + (c.statement_count || 0), 0);

  // Fee-waiver focus: the card closest to waiving its annual fee (smallest remaining spend).
  const pending = cards
    .filter((c) => c.fee_waiver?.applicable && !c.fee_waiver?.waived)
    .sort((a, b) => (a.fee_waiver.remaining || 0) - (b.fee_waiver.remaining || 0));
  const focus = pending[0] || null;
  const anyWaived = cards.some((c) => c.fee_waiver?.applicable && c.fee_waiver?.waived);

  return (
    <div className="space-y-8">
      {saved && (
        <Alert kind="ok" onDismiss={() => setSaved("")} dismissLabel="Dismiss saved message">
          {saved}
        </Alert>
      )}

      {/* ───── Stat tiles ───── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total rewards */}
        <div className="glass-card rounded-xl p-6 flex flex-col gap-2 card-hover accent-border">
          <div className="flex items-center gap-2 text-slate-500">
            <span className="material-symbols-outlined text-emerald-500 text-lg">redeem</span>
            <h3 className="font-label-md text-[11px] uppercase tracking-widest">Total Rewards</h3>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="font-display-lg text-display-lg text-white text-gradient">{rupee(data.totals.reward)}</p>
          </div>
          <p className="font-body-sm text-[11px] text-slate-500 mt-1">
            Earned across {cards.length} {cards.length === 1 ? "card" : "cards"}
          </p>
        </div>

        {/* Total spend */}
        <div className="glass-card rounded-xl p-6 flex flex-col gap-2 card-hover">
          <div className="flex items-center gap-2 text-slate-500">
            <span className="material-symbols-outlined text-emerald-500 text-lg">bar_chart</span>
            <h3 className="font-label-md text-[11px] uppercase tracking-widest">Total Spend</h3>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="font-display-lg text-display-lg text-white">{rupeeShort(data.totals.spend)}</p>
            <span className="font-label-md text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 border border-slate-700 rounded">
              {totalStatements} {totalStatements === 1 ? "statement" : "statements"}
            </span>
          </div>
          <p className="font-body-sm text-[11px] text-slate-500 mt-1">From the statements you've added</p>
        </div>

        {/* Fee waiver */}
        <div className="glass-card rounded-xl p-6 flex flex-col gap-2 card-hover">
          <div className="flex items-center gap-2 text-slate-500">
            <span className="material-symbols-outlined text-emerald-500 text-lg">savings</span>
            <h3 className="font-label-md text-[11px] uppercase tracking-widest">Fee Waiver</h3>
          </div>
          {focus ? (
            <>
              <div className="flex items-baseline justify-between mt-2">
                <p className="font-display-lg text-display-lg text-white">{rupeeShort(focus.fee_waiver.remaining)}</p>
                <span className="font-label-md text-[10px] text-red-400 bg-red-900/20 px-2 py-0.5 rounded border border-red-500/30 flex items-center gap-1 whitespace-nowrap">
                  <span className="material-symbols-outlined text-[12px]">priority_high</span> Action needed
                </span>
              </div>
              <p className="font-body-sm text-[11px] text-slate-500 mt-1">
                More spend needed on {focus.issuer} {focus.name} this year
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between mt-2">
                <p className="font-display-lg text-display-lg text-white">{anyWaived ? "Waived" : "—"}</p>
              </div>
              <p className="font-body-sm text-[11px] text-slate-500 mt-1">
                {anyWaived ? "All annual fees waived" : "No spend thresholds set"}
              </p>
            </>
          )}
        </div>
      </section>

      {/* ───── Cards + recent activity ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Your cards */}
        <section className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-headline-md text-headline-md text-white tracking-tight">Your Cards</h3>
            <Link
              to="/cards"
              className="font-label-md text-[11px] text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
            >
              View all <span className="material-symbols-outlined text-sm">chevron_right</span>
            </Link>
          </div>

          {cards.length === 0 && (
            <div className="glass-card rounded-xl p-6 font-body-sm text-slate-400">
              No cards yet.{" "}
              <Link to="/cards" className="text-emerald-400 hover:text-emerald-300">Add a card</Link>{" "}
              to get started.
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
            {cards.map((c, i) => {
              const a = ACCENTS[i % ACCENTS.length];
              const w = c.fee_waiver || {};
              return (
                <div key={c.card_id} className="glass-card rounded-xl p-6 card-hover flex flex-col md:flex-row gap-6 items-center">
                  {/* Card face */}
                  <div className={`w-full md:w-48 shrink-0 h-32 rounded bg-slate-950 p-4 flex flex-col justify-between text-white shadow-lg border ${a.border} relative overflow-hidden`}>
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-50" />
                    <div className="flex justify-between items-start gap-2 relative z-10">
                      <span className={`font-label-md text-[10px] tracking-widest truncate ${a.text}`}>
                        {c.issuer}
                      </span>
                      <span className={`material-symbols-outlined text-lg shrink-0 ${a.icon}`}>credit_card</span>
                    </div>
                    <div className="relative z-10 min-w-0">
                      <p className="font-numeric-data text-lg tracking-widest">•••• ••••</p>
                      <p className="font-body-sm text-[10px] text-slate-500 mt-1 truncate">{c.name}</p>
                    </div>
                  </div>

                  {/* Card summary */}
                  <div className="flex-1 min-w-0 w-full space-y-4">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h4 className="font-label-md text-xs text-slate-300">
                          {w.applicable ? "Fee waiver progress" : "No fee waiver"}
                        </h4>
                        <p className="font-body-sm text-[11px] text-slate-500 mt-1">
                          {w.applicable
                            ? `${rupeeShort(w.fy_spend)} of ${rupeeShort(w.threshold)} spent this year`
                            : "No spend threshold on this card"}
                        </p>
                      </div>
                      <div className="text-right">
                        {w.applicable ? (
                          <p className={`font-label-md text-[10px] px-2 py-0.5 border rounded ${a.chip}`}>
                            {w.waived ? "Waived" : `${pct(w.pct)}%`}
                          </p>
                        ) : (
                          <span className="font-label-md text-[10px] text-blue-400 bg-blue-950 px-2 py-0.5 border border-blue-500/20 rounded">
                            No waiver
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={`w-full h-1 progress-bar-bg rounded-full overflow-hidden ${w.applicable ? "" : "opacity-30"}`}>
                      <div className={`h-full ${w.applicable ? a.bar : "bg-slate-600"}`} style={{ width: `${w.applicable ? pct(w.pct) : 100}%` }} />
                    </div>

                    <div className="flex justify-between items-center gap-4 pt-2 border-t border-slate-800/50">
                      <div className="min-w-0">
                        <p className="font-body-sm text-[10px] text-slate-500">Rewards earned</p>
                        <p className={`font-numeric-data text-lg truncate ${a.value}`}>{rupee(c.total_reward)}</p>
                      </div>
                      <Link
                        to="/best-card"
                        className="shrink-0 whitespace-nowrap px-4 py-1.5 border border-slate-700 text-slate-400 rounded font-label-md text-[10px] hover:border-emerald-500 hover:text-emerald-400 transition-colors"
                      >
                        Compare cards
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent activity */}
        <aside className="space-y-6">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-headline-md text-headline-md text-white tracking-tight">Recent Activity</h3>
          </div>
          <div className="glass-card rounded-xl p-4 flex flex-col gap-2">
            {cards.length === 0 && (
              <p className="font-body-sm text-[11px] text-slate-500 p-3">Nothing here yet.</p>
            )}
            {cards.map((c, i) => {
              const a = ACCENTS[i % ACCENTS.length];
              return (
                <div
                  key={c.card_id}
                  className="flex items-center gap-4 p-3 hover:bg-slate-800/40 border border-transparent hover:border-slate-700/50 rounded transition-all"
                >
                  <div className={`w-10 h-10 rounded-full bg-slate-900 border ${a.dot} flex items-center justify-center shrink-0`}>
                    <span className="material-symbols-outlined text-lg">credit_card</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-label-md text-xs text-white truncate">
                      {c.issuer} {c.name}
                    </p>
                    <p className="font-body-sm text-[10px] text-slate-500">
                      {c.statement_count} {c.statement_count === 1 ? "statement" : "statements"} added
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-label-md text-[11px] ${a.value}`}>+{rupee(c.total_reward)}</p>
                    <p className="font-body-sm text-[9px] text-slate-600">{rupeeShort(c.total_spend)} spent</p>
                  </div>
                </div>
              );
            })}
            <Link
              to="/upload"
              className="w-full mt-2 py-2 text-center text-slate-500 font-label-md text-[11px] hover:text-emerald-500 transition-colors"
            >
              Add a statement
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
