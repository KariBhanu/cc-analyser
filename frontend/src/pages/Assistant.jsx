import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { rupee, rupeeShort } from "../format.js";

// The Assistant screen. The engine behind it is deterministic — keyword intent
// plus amount parsing over your own cards and statements, server side
// (backend/app/services/assistant.py). No language model is involved, and the UI
// says so rather than implying one.

const SUGGESTIONS = [
  "Review my last statement",
  "Which card for ₹50,000?",
  "Check fee waiver progress",
];

const LOG_KEY = "smartcred.assistant.log";
const INTENT_LABELS = {
  optimize: "Card comparison",
  waiver: "Fee waiver",
  statement: "Statement review",
  help: "Help",
};

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

function loadLog() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    return Array.isArray(raw) ? raw.slice(0, 12) : [];
  } catch {
    return [];
  }
}

export default function Assistant() {
  const [turns, setTurns] = useState([]);   // { role: "user" | "engine", ... }
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState(loadLog);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const streamRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.summary().then(setStats).catch(() => {});
  }, []);

  // Keep the newest turn in view as the transcript grows.
  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setError("");
    setInput("");
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text: q, at: new Date().toISOString() }]);
    try {
      const res = await api.assistantQuery(q);
      setTurns((t) => [...t, { role: "engine", ...res }]);
      const entry = { query: q, intent: res.intent, at: new Date().toISOString() };
      setLog((l) => {
        const next = [entry, ...l].slice(0, 12);
        try { localStorage.setItem(LOG_KEY, JSON.stringify(next)); } catch { /* quota — log is cosmetic */ }
        return next;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    // This screen's export uses a darker surface (#020617) than the rest of the
    // app, so it's scoped here and bleeds past the shell's container padding.
    // -m-6 is exactly -24px, matching the shell's p-container-padding.
    <div className="-m-6 bg-[#020617] min-h-[calc(100vh-4rem)] flex">
      {/* ───── Terminal ───── */}
      <section className="flex-1 flex flex-col relative min-w-0 p-gutter">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none select-none overflow-hidden">
          <div className="text-[200px] font-black absolute -bottom-20 -right-20">AI</div>
        </div>

        {/* Status strip */}
        <div className="flex items-center justify-between gap-4 mb-6 relative z-10 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-500 tracking-widest uppercase">
              Ready
            </span>
          </div>
          <p className="font-body-sm text-[11px] text-slate-500 m-0">
            Answers come from your own cards and statements — not a language model.
          </p>
        </div>

        {/* Transcript */}
        <div
          ref={streamRef}
          className="flex-1 overflow-y-auto space-y-6 pr-2 terminal-scroll relative z-10 min-h-[240px]"
        >
          {turns.length === 0 && !busy && (
            <div className="response-card p-6 rounded-xl rounded-tl-none glow-border max-w-[85%]">
              <div className="flex items-center gap-2 mb-4 text-emerald-500">
                <span className="material-symbols-outlined">smart_toy</span>
                <span className="font-bold tracking-widest text-xs">SmartCred Analysis</span>
              </div>
              <p className="font-body-md text-slate-200 m-0">
                <span className="text-emerald-500 font-bold">Ready.</span> Ask which card to use
                for a purchase, how close you are to waiving a fee, or what your recent statements
                look like.
              </p>
              <p className="font-body-sm text-[11px] text-slate-500 mt-3 m-0">
                Every number comes from the cards and statements you entered. Questions are matched
                by keyword and amount — nothing is sent to a language model.
              </p>
            </div>
          )}

          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[70%] glow-border p-4 bg-slate-800 rounded-xl rounded-tr-none">
                  <p className="font-body-md text-slate-100 m-0">{t.text}</p>
                  <span className="block text-[10px] text-right mt-2 opacity-50 font-numeric-data">
                    {new Date(t.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] response-card p-6 rounded-xl rounded-tl-none glow-border">
                  <div className="scan-line" />
                  <div className="flex items-center gap-2 mb-4 text-emerald-500">
                    <span className="material-symbols-outlined">smart_toy</span>
                    <span className="font-bold tracking-widest text-xs">{t.engine}</span>
                    <span className="ml-auto text-[10px] text-slate-500">
                      {INTENT_LABELS[t.intent] || t.intent}
                    </span>
                  </div>

                  <p className="font-body-md text-slate-200 mb-2 m-0">{t.headline}</p>
                  {t.detail && (
                    <p className="font-body-sm text-[11px] text-slate-500 mb-4 m-0">{t.detail}</p>
                  )}

                  {t.rows.length > 0 && (
                    <div className="bg-black/40 rounded-lg p-4 border border-slate-700 font-body-sm text-sm mb-4 overflow-x-auto">
                      <div className="grid grid-cols-3 gap-4 border-b border-slate-700 pb-2 mb-2 text-emerald-500 text-[10px] uppercase font-bold tracking-tighter min-w-[380px]">
                        {t.columns.map((c) => <span key={c}>{c}</span>)}
                      </div>
                      {t.rows.map((r, ri) => (
                        <div
                          key={ri}
                          className={`grid grid-cols-3 gap-4 py-1 min-w-[380px] ${
                            ri < t.rows.length - 1 ? "border-b border-slate-700/30" : ""
                          }`}
                        >
                          {r.cells.map((cell, ci) => (
                            <span
                              key={ci}
                              className={
                                ci === 0
                                  ? r.highlight ? "text-white font-bold" : "text-slate-200"
                                  : r.highlight && ci === 1
                                    ? "text-emerald-400"
                                    : "text-slate-400"
                              }
                            >
                              {cell}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="font-body-md text-slate-200 m-0">
                    <span className="text-emerald-500 font-bold">Recommendation:</span>{" "}
                    {t.recommendation}
                  </p>
                </div>
              </div>
            )
          )}

          {busy && (
            <div className="flex items-center gap-2 text-emerald-500/60 text-[10px] font-bold animate-pulse">
              <span className="material-symbols-outlined text-sm">terminal</span>
              <span className="tracking-widest">Working…</span>
              <span className="cursor-blink">_</span>
            </div>
          )}

          {error && (
            <p className="font-body-sm text-[12px] text-red-300 bg-red-950/30 border border-red-500/30 px-4 py-3 rounded-lg flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-base">error</span> {error}
            </p>
          )}
        </div>

        {/* Composer */}
        <div className="mt-6 relative z-10">
          <div className="flex flex-wrap gap-2 mb-4">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => send(s)}
                className="bg-slate-800 border border-slate-700 px-4 py-1.5 rounded-full text-[11px] font-bold text-slate-400 hover:border-emerald-500 hover:text-emerald-500 transition-all disabled:opacity-40 cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="relative glow-border rounded-xl bg-slate-950 p-2"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-emerald-500 ml-2 shrink-0">
                chevron_right
              </span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                maxLength={500}
                onChange={(e) => setInput(e.target.value)}
placeholder="Ask a question…"
                aria-label="Assistant query"
className="flex-1 min-w-0 bg-transparent border-none text-emerald-400 placeholder:text-emerald-500/40 focus:outline-none focus:ring-0 px-0"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Send query"
                className="w-10 h-10 bg-emerald-500 text-slate-950 rounded-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all shrink-0 border-0 disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ───── Recent questions ───── */}
      <aside className="w-80 shrink-0 bg-slate-950 border-l border-slate-800 p-gutter overflow-y-auto hidden xl:block terminal-scroll">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-500 m-0">
            Recent Questions
          </h2>
          <span className="material-symbols-outlined text-slate-500 text-sm">history</span>
        </div>

        <div className="space-y-4">
          {log.length === 0 && (
            <p className="font-body-sm text-[11px] text-slate-600 m-0">
              Nothing asked yet.
            </p>
          )}
          {log.map((entry, i) => (
            <button
              key={`${entry.at}-${i}`}
              type="button"
              onClick={() => send(entry.query)}
              className={`w-full text-left p-3 rounded-lg cursor-pointer transition-all bg-transparent ${
                i === 0
                  ? "border border-slate-700 hover:border-emerald-500/50"
                  : "border border-slate-800/30 opacity-60 hover:opacity-100"
              }`}
            >
              <div className="flex justify-between items-start gap-2 mb-1">
                <span
                  className={`text-[10px] font-bold uppercase ${
                    i === 0 ? "text-emerald-500/70" : "text-slate-500"
                  }`}
                >
                  {INTENT_LABELS[entry.intent] || entry.intent}
                </span>
                <span className="text-[10px] text-slate-500 shrink-0">{relativeTime(entry.at)}</span>
              </div>
              <p className="text-xs text-slate-200 truncate m-0">{entry.query}</p>
              {i === 0 && (
                <div className="flex gap-1 mt-2">
                  <span className="w-1 h-1 rounded-full bg-emerald-500" />
                  <span className="w-1 h-1 rounded-full bg-emerald-500/30" />
                  <span className="w-1 h-1 rounded-full bg-emerald-500/30" />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* The design had a decorative "system intelligence" panel here; this shows
            figures that are actually true instead. */}
        {stats && (
          <div className="mt-12 rounded-xl overflow-hidden border border-emerald-500/20 relative bg-gradient-to-br from-emerald-950/40 to-slate-950 p-4">
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter m-0">
              Your Portfolio
            </p>
            <p className="text-[11px] text-slate-300 mt-1 m-0">
              {stats.cards.length} {stats.cards.length === 1 ? "card" : "cards"} ·{" "}
              {rupeeShort(stats.totals.spend)} spent · {rupee(stats.totals.reward)} earned.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
