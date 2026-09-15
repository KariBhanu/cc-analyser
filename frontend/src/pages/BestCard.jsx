import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { rupee2 } from "../format.js";
import { Alert, EmptyState, merchantIcon } from "../components/ui.jsx";

// The five merchant shortcuts shown above the results.
const POPULAR = ["Amazon", "Flipkart", "Swiggy", "Zomato", "Uber"];

export default function BestCard() {
  const [params, setParams] = useSearchParams();
  const [merchant, setMerchant] = useState(params.get("merchant") || "Amazon");
  const [amount, setAmount] = useState(Number(params.get("amount")) || 1000);
  // The last values actually sent to the API — keeps the inputs free-typing
  // while the results below stay pinned to a run.
  const [query, setQuery] = useState({
    merchant: params.get("merchant") || "Amazon",
    amount: Number(params.get("amount")) || 1000,
  });
  const [result, setResult] = useState(null);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState("");

  // Base rates let us tell a merchant-bonus rate apart from the base one.
  useEffect(() => {
    api.listCards().then(setCards).catch(() => {});
  }, []);

  useEffect(() => {
    let stale = false;
    setError("");
    api
      .bestCard(query.merchant, query.amount)
      .then((r) => !stale && setResult(r))
      .catch((e) => !stale && setError(e.message));
    return () => { stale = true; };
  }, [query]);

  function run(nextMerchant = merchant, nextAmount = amount) {
    setMerchant(nextMerchant);
    setAmount(nextAmount);
    setQuery({ merchant: nextMerchant, amount: nextAmount });
    setParams({ merchant: nextMerchant, amount: String(nextAmount) }, { replace: true });
  }

  const baseRate = (id) => cards.find((c) => c.id === id)?.base_points_per_100;
  const ranking = result?.ranking || [];

  return (
    <div className="flex flex-col gap-stack-lg">
      {/* ───── Hero: merchant selector ───── */}
      <section className="glass-card rounded-xl border border-slate-800/50 p-8 md:p-12 text-center relative overflow-hidden accent-border">
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-48 h-48 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />

        <h2 className="font-display-lg text-headline-lg md:text-display-lg text-white mb-stack-md relative z-10 text-gradient tracking-tight">
          Which Card Should I Use?
        </h2>
        <p className="font-body-lg text-sm text-slate-400 max-w-2xl mx-auto mb-10 relative z-10">
          Compare your cards for a specific merchant and spend amount.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); run(); }}
          className="max-w-xl mx-auto relative z-10 flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 text-xl pointer-events-none">
              storefront
            </span>
            <input
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Merchant — e.g. Amazon, Swiggy"
              aria-label="Merchant"
              className="w-full pl-12 pr-4 py-4 bg-slate-950 border border-slate-800 rounded font-body-md text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-0 transition-all"
            />
          </div>
          <div className="relative sm:w-40">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-lg pointer-events-none">
              currency_rupee
            </span>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label="Spend amount in rupees"
              className="w-full pl-10 pr-3 py-4 bg-slate-950 border border-slate-800 rounded font-numeric-data text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 focus:ring-0 transition-all"
            />
          </div>
          <button
            type="submit"
            className="bg-emerald-600/20 text-emerald-400 border border-emerald-600/40 px-6 py-4 rounded font-label-md text-[11px] uppercase tracking-[0.15em] hover:bg-emerald-600 hover:text-white transition-all active:scale-95 whitespace-nowrap"
          >
            Compare
          </button>
        </form>
      </section>

      {/* ───── Popular merchants ───── */}
      <section>
        <h3 className="font-label-md text-xs text-slate-500 uppercase tracking-[0.2em] mb-6">Popular Merchants</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-gutter">
          {POPULAR.map((m) => {
            const active = query.merchant.trim().toLowerCase() === m.toLowerCase();
            return (
              <button
                key={m}
                type="button"
                onClick={() => run(m)}
                className={`glass-card rounded p-4 flex flex-col items-center justify-center gap-3 relative transition-all group ${
                  active
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border border-slate-800/50 hover:border-emerald-500/30 hover:bg-emerald-500/5"
                }`}
              >
                {active && (
                  <span className="material-symbols-outlined text-emerald-500 text-xs icon-fill absolute top-2 right-2">
                    check_circle
                  </span>
                )}
                <span
                  className={`material-symbols-outlined text-2xl ${
                    active ? "text-emerald-500" : "text-slate-500 group-hover:text-emerald-400"
                  }`}
                >
                  {merchantIcon(m)}
                </span>
                <span
                  className={`font-label-md text-[10px] uppercase tracking-widest ${
                    active ? "text-emerald-400" : "text-slate-400"
                  }`}
                >
                  {m}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Alert>{error}</Alert>

      {/* ───── Ranking ───── */}
      {result && (
        <section className="mt-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 mb-6">
            <div className="min-w-0">
              <h3 className="font-headline-md text-headline-md text-white tracking-tight m-0">
                Best card for{" "}
                <span className="text-emerald-500">{result.merchant || "any merchant"}</span>
              </h3>
              <p className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mt-1 m-0">
                Ranked by reward value on {rupee2(result.amount)}
              </p>
            </div>
            <Link
              to="/cards"
              className="text-emerald-500 font-label-md text-[10px] uppercase tracking-widest hover:text-emerald-400 flex items-center gap-1 shrink-0"
            >
              Edit card rates <span className="material-symbols-outlined text-[14px]">edit</span>
            </Link>
          </div>

          {ranking.length === 0 ? (
            <EmptyState icon="credit_card_off" title="No cards to compare">
              Add a card first, then come back to compare.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-4">
              {ranking.map((r, i) => {
                const top = i === 0;
                const base = baseRate(r.card_id);
                const accelerated = base !== undefined && r.points_per_100 > base;
                const yieldPct = Number(r.value_per_100 || 0);
                return (
                  <div
                    key={r.card_id}
                    className={`glass-card rounded-xl p-6 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden transition-all ${
                      top
                        ? "border-emerald-500/50 bg-emerald-500/5 accent-border shadow-lg shadow-emerald-900/10"
                        : `border border-slate-800/50 ${i > 1 ? "opacity-60 hover:opacity-100" : "hover:border-emerald-500/30"}`
                    }`}
                  >
                    {top && (
                      <div className="absolute top-4 right-4 flex items-center gap-1 bg-emerald-500/20 text-emerald-400 px-3 py-0.5 rounded border border-emerald-500/30 font-label-md text-[10px] uppercase tracking-widest">
                        <span className="material-symbols-outlined text-xs icon-fill">stars</span> Best pick
                      </div>
                    )}

                    {/* Card visual */}
                    <div
                      className={`w-40 h-24 rounded bg-slate-950 border p-3 flex flex-col justify-between shadow-lg shrink-0 ${
                        top ? "border-emerald-500/30" : "border-slate-800"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span
                          className={`font-label-md text-[9px] tracking-widest truncate ${
                            top ? "text-emerald-500" : "text-slate-500"
                          }`}
                        >
                          {r.issuer}
                        </span>
                        <span
                          className={`material-symbols-outlined text-sm shrink-0 ${
                            top ? "text-emerald-500/30" : "text-slate-500/30"
                          }`}
                        >
                          contactless
                        </span>
                      </div>
                      <div
                        className={`font-numeric-data text-xs tracking-[0.2em] text-right truncate ${
                          top ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        {r.name}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 flex flex-col items-center md:items-start text-center md:text-left w-full">
                      <h4
                        className={`font-label-md text-sm tracking-widest mb-1 truncate max-w-full ${
                          top ? "text-white" : "text-slate-300"
                        }`}
                      >
                        {r.issuer} {r.name}
                      </h4>
                      <div className="flex items-center gap-2 mb-3 flex-wrap justify-center md:justify-start">
                        <span
                          className={`font-numeric-data ${top ? "text-2xl text-emerald-400" : "text-xl text-white"}`}
                        >
                          {yieldPct.toFixed(1)}%
                        </span>
                        <span className="font-body-sm text-[11px] text-slate-500">
                          ({rupee2(yieldPct)} per ₹100 spent)
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-center md:justify-start gap-2">
                        <span className="bg-slate-900 px-2 py-0.5 rounded text-[9px] font-label-md text-slate-400 border border-slate-800 uppercase tracking-wider">
                          {r.points_per_100} pts / ₹100
                        </span>
                        <span className="bg-slate-900 px-2 py-0.5 rounded text-[9px] font-label-md text-slate-400 border border-slate-800 uppercase tracking-wider">
                          1 pt = ₹{r.rupee_per_point}
                        </span>
                        {accelerated && (
                          <span className="bg-emerald-950 px-2 py-0.5 rounded text-[9px] font-label-md text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                            {result.merchant} bonus rate
                          </span>
                        )}
                        {r.capped && (
                          <span className="bg-amber-950/40 px-2 py-0.5 rounded text-[9px] font-label-md text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                            monthly cap reached
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Outcome + action */}
                    <div className="w-full md:w-auto flex flex-col items-center md:items-end gap-3 shrink-0">
                      <div className="text-center md:text-right">
                        <p className="font-body-sm text-[9px] text-slate-500 uppercase tracking-widest m-0">
                          You'd earn
                        </p>
                        <p
                          className={`font-numeric-data text-numeric-data m-0 ${
                            top ? "text-emerald-400" : "text-slate-200"
                          }`}
                        >
                          {rupee2(r.estimated_reward)}
                        </p>
                      </div>
                      {top && (
                        <Link
                          to={`/upload?card=${r.card_id}`}
                          className="w-full md:w-auto bg-emerald-600/20 text-emerald-400 border border-emerald-600/40 px-6 py-3 rounded font-label-md text-[11px] uppercase tracking-[0.15em] hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                          Add a statement
                          <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <footer className="mt-8 text-center pb-2 border-t border-slate-800/50 pt-8">
            <p className="font-label-md text-[10px] text-slate-600 flex items-center justify-center gap-2 tracking-wide m-0">
              <span className="material-symbols-outlined text-sm">info</span>
              Calculated from the point values and monthly caps you entered.
            </p>
          </footer>
        </section>
      )}
    </div>
  );
}
