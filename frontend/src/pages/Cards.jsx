import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { pct, rupee, rupeeShort } from "../format.js";
import {
  Alert, Button, CardFace, Chip, Field, Input, merchantIcon, CARD_ACCENTS, Panel,
  ProgressBar,
} from "../components/ui.jsx";

const EMPTY = {
  issuer: "", name: "", annual_fee: 0, waiver_threshold: 0,
  base_points_per_100: 0, rupee_per_point: 1, statement_password: "",
  base_monthly_cap: 0, bonus_monthly_cap: 0,
  merchant_bonuses: [],
};

export default function Cards() {
  const [params, setParams] = useSearchParams();
  const [cards, setCards] = useState([]);
  // Fee-waiver progress lives on the summary endpoint (it needs statements), so we
  // fetch it alongside and merge by card_id.
  const [waivers, setWaivers] = useState({});
  const [form, setForm] = useState(EMPTY);
  const [bonus, setBonus] = useState({ merchant: "", points_per_100: 0 });
  const [showForm, setShowForm] = useState(params.get("new") === "1");
  const [error, setError] = useState("");

  function load() {
    api.listCards().then(setCards).catch((e) => setError(e.message));
    api
      .summary()
      .then((s) => setWaivers(Object.fromEntries((s.cards || []).map((c) => [c.card_id, c.fee_waiver]))))
      .catch(() => {});
  }
  useEffect(() => { load(); }, []);

  // The sidebar's "Add Card" links here with ?new=1 — honour it even when we're
  // already on this page, where the initial state above wouldn't re-run.
  useEffect(() => {
    if (params.get("new") === "1") setShowForm(true);
  }, [params]);

  const set = (k) => (e) => {
    const v = e.target.type === "number" ? Number(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  function openForm() {
    setShowForm(true);
    setParams({ new: "1" }, { replace: true });
  }

  function closeForm() {
    setShowForm(false);
    setParams({}, { replace: true });
  }

  function addBonus() {
    if (!bonus.merchant) return;
    setForm((f) => ({ ...f, merchant_bonuses: [...f.merchant_bonuses, bonus] }));
    setBonus({ merchant: "", points_per_100: 0 });
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const payload = { ...form };
      if (!payload.statement_password) delete payload.statement_password;
      await api.createCard(payload);
      setForm(EMPTY);
      closeForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm("Delete this card?")) return;
    await api.deleteCard(id);
    load();
  }

  return (
    <div className="flex flex-col gap-stack-lg">
      {/* ───── Page title ───── */}
      <div className="flex justify-between items-center gap-4">
        <h2 className="font-headline-lg text-headline-lg-mobile md:text-display-lg md:font-display-lg text-white tracking-tight m-0">
          Your Cards
        </h2>
        <Button className="shrink-0" onClick={showForm ? closeForm : openForm}>
          <span className="material-symbols-outlined text-base">{showForm ? "close" : "add"}</span>
          {showForm ? "Cancel" : "Add Card"}
        </Button>
      </div>

      <Alert>{error}</Alert>

      {/* ───── Add-card form (revealed by the Add Card actions) ───── */}
      {showForm && (
        <Panel icon="add_circle" title="Add a Card" accent>
          <form onSubmit={submit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <Field label="Issuer">
                <Input value={form.issuer} onChange={set("issuer")} placeholder="HDFC" required />
              </Field>
              <Field label="Card name">
                <Input value={form.name} onChange={set("name")} placeholder="Millennia" required />
              </Field>
              <Field label="Annual fee (₹)">
                <Input type="number" value={form.annual_fee} onChange={set("annual_fee")} />
              </Field>
              <Field label="Spend to waive fee (₹/year)">
                <Input type="number" value={form.waiver_threshold} onChange={set("waiver_threshold")} />
              </Field>
              <Field label="Base rate (points per ₹100)">
                <Input type="number" value={form.base_points_per_100} onChange={set("base_points_per_100")} />
              </Field>
              <Field label="Point value (₹ per point)">
                <Input type="number" step="0.01" value={form.rupee_per_point} onChange={set("rupee_per_point")} />
              </Field>
              <Field label="Base monthly cap" hint="In points. 0 = no cap.">
                <Input type="number" value={form.base_monthly_cap} onChange={set("base_monthly_cap")} />
              </Field>
              <Field label="Bonus monthly cap" hint="In points. 0 = no cap.">
                <Input type="number" value={form.bonus_monthly_cap} onChange={set("bonus_monthly_cap")} />
              </Field>
              <Field
                className="md:col-span-2"
                label="Statement PDF password"
                hint="Stored encrypted at rest (Fernet, keyed from APP_SECRET)."
              >
                <Input value={form.statement_password} onChange={set("statement_password")} placeholder="optional" />
              </Field>
            </div>

            {/* Merchant bonuses */}
            <div className="pt-5 border-t border-slate-800/60 space-y-4">
              <h4 className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-500/60">local_offer</span>
                Merchant bonuses (optional)
              </h4>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <Field className="flex-1" label="Merchant">
                  <Input
                    placeholder="e.g. Amazon"
                    value={bonus.merchant}
                    onChange={(e) => setBonus({ ...bonus, merchant: e.target.value })}
                  />
                </Field>
                <Field className="sm:w-44" label="Points / ₹100">
                  <Input
                    type="number"
                    value={bonus.points_per_100}
                    onChange={(e) => setBonus({ ...bonus, points_per_100: Number(e.target.value) })}
                  />
                </Field>
                <Button type="button" variant="ghost" onClick={addBonus}>
                  <span className="material-symbols-outlined text-base">add</span> Add bonus
                </Button>
              </div>
              {form.merchant_bonuses.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.merchant_bonuses.map((b, i) => (
                    <Chip key={`${b.merchant}-${i}`} tone="emerald">
                      {b.merchant} · {b.points_per_100}/₹100
                    </Chip>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-1">
              <Button type="submit">
                <span className="material-symbols-outlined text-base">save</span> Save card
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {/* ───── Card grid ───── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-stack-lg">
        {cards.map((c, i) => {
          const a = CARD_ACCENTS[i % CARD_ACCENTS.length];
          const w = waivers[c.id] || {};
          const progress = w.applicable ? pct(w.pct) : 0;
          return (
            <article
              key={c.id}
              className={`glass-card rounded-xl p-container-padding card-hover relative overflow-hidden flex flex-col md:flex-row gap-container-padding ${
                i === 0 ? "accent-border" : ""
              }`}
            >
              {/* Left: the card itself */}
              <div className="w-full md:w-1/3 flex flex-col gap-stack-md shrink-0">
                <CardFace issuer={c.issuer} name={c.name} accent={a} ratio />
                <div className="flex justify-between items-center px-1 gap-2">
                  <span className="font-label-md text-[10px] text-slate-500">Fee waiver</span>
                  {w.applicable ? (
                    <span className={`font-label-md text-[10px] px-2 py-0.5 border rounded uppercase whitespace-nowrap ${a.chip}`}>
                      {w.waived ? "Waived" : `${progress}%`}
                    </span>
                  ) : (
                    <span className="font-label-md text-[10px] text-blue-400 bg-blue-950 px-2 py-0.5 border border-blue-500/20 rounded whitespace-nowrap">
                      Not applicable
                    </span>
                  )}
                </div>
              </div>

              {/* Right: the terms */}
              <div className="w-full md:w-2/3 flex flex-col flex-grow min-w-0 z-10">
                <div className="flex justify-between items-start gap-3 mb-stack-md">
                  <div className="min-w-0">
                    <h3 className="font-label-md text-xs uppercase text-slate-300 m-0">{c.issuer}</h3>
                    <p className="font-headline-md text-headline-md text-white mt-1 m-0 truncate">
                      {c.name}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(c.id)}
                    aria-label={`Delete ${c.issuer} ${c.name}`}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1 bg-transparent border-0 cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-y-stack-md gap-x-stack-lg mb-stack-lg">
                  <div className="min-w-0">
                    <p className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mb-1 m-0">
                      Base rate
                    </p>
                    <p className={`font-numeric-data text-body-md m-0 ${a.value}`}>
                      {c.base_points_per_100} pts / ₹100
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mb-1 m-0">
                      Point value
                    </p>
                    <p className={`font-numeric-data text-body-md m-0 ${a.value}`}>
                      ₹{c.rupee_per_point} / pt
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mb-1 m-0">
                      Annual fee
                    </p>
                    <p className="font-numeric-data text-body-md text-slate-200 m-0">{rupee(c.annual_fee)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mb-1 m-0">
                      Monthly caps (base / bonus)
                    </p>
                    <p className="font-numeric-data text-body-md text-slate-200 m-0">
                      {c.base_monthly_cap || "—"} / {c.bonus_monthly_cap || "—"}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mb-2 m-0">
                      Merchant bonuses
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {c.merchant_bonuses?.length ? (
                        c.merchant_bonuses.map((b, bi) => (
                          <span
                            key={`${b.merchant}-${bi}`}
                            className="inline-flex items-center px-2 py-1 rounded bg-slate-900/50 text-slate-300 border border-slate-800 font-label-md text-[10px] uppercase tracking-widest"
                          >
                            <span className={`material-symbols-outlined text-[14px] mr-1 ${a.value}`}>
                              {merchantIcon(b.merchant)}
                            </span>
                            {b.merchant} {b.points_per_100}x
                          </span>
                        ))
                      ) : (
                        <span className="font-body-sm text-[11px] text-slate-600">
                          None added
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fee-waiver threshold */}
                <div className="mt-auto bg-slate-950/50 p-stack-md rounded border border-slate-800/50">
                  <div className="flex justify-between items-end gap-3 mb-2">
                    <div className="min-w-0">
                      <p className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mb-0.5 m-0">
                        Fee waiver progress
                      </p>
                      {w.applicable ? (
                        <p className="font-numeric-data text-body-lg text-white m-0">
                          {rupeeShort(w.fy_spend)}{" "}
                          <span className="font-body-sm text-[11px] text-slate-500">
                            of {rupeeShort(w.threshold)} spent
                          </span>
                        </p>
                      ) : (
                        <p className="font-numeric-data text-body-lg text-slate-400 m-0">
                          <span className="font-body-sm text-[11px] text-slate-500">
                            No spend threshold on this card
                          </span>
                        </p>
                      )}
                    </div>
                    {w.applicable && !w.waived && c.annual_fee > 0 && (
                      <p className="font-label-md text-[10px] text-red-400 bg-red-950/20 px-2 py-0.5 rounded border border-red-500/30 whitespace-nowrap m-0">
                        {rupeeShort(c.annual_fee)} fee due
                      </p>
                    )}
                    {w.applicable && w.waived && (
                      <p className="font-label-md text-[10px] text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap m-0">
                        Waived
                      </p>
                    )}
                  </div>
                  <ProgressBar value={progress} bar={a.bar} muted={!w.applicable} />
                </div>

                {/* Statement password */}
                <div className="mt-stack-md flex items-center justify-between gap-3 py-2 border-t border-slate-800/50">
                  <div className="flex items-center min-w-0">
                    <span className="material-symbols-outlined text-slate-500 mr-2 text-[16px]">encrypted</span>
                    <span className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mr-2">
                      Statement password
                    </span>
                    <span className="font-numeric-data text-[11px] text-slate-300 tracking-[0.2em]">
                      {c.has_password ? "********" : "—"}
                    </span>
                  </div>
                  <span
                    className={`font-label-md text-[10px] uppercase tracking-widest shrink-0 ${
                      c.has_password ? "text-emerald-500" : "text-slate-600"
                    }`}
                  >
                    {c.has_password ? "Saved" : "Not saved"}
                  </span>
                </div>
              </div>
            </article>
          );
        })}

        {/* Add-card slot */}
        {!showForm && (
          <article
            onClick={openForm}
            className="bg-[#0b1120] border border-dashed border-slate-800 rounded-xl p-container-padding flex flex-col items-center justify-center min-h-[300px] text-center hover:bg-slate-900/50 transition-colors cursor-pointer group"
          >
            <div className="w-16 h-16 rounded border border-slate-800 bg-slate-900 flex items-center justify-center mb-stack-md group-hover:scale-110 group-hover:border-emerald-500/40 transition-all">
              <span className="material-symbols-outlined text-[32px] text-emerald-500">add_card</span>
            </div>
            <h3 className="font-label-md text-label-md uppercase tracking-widest text-white mb-2 m-0">
              Add a Card
            </h3>
            <p className="font-body-sm text-[11px] text-slate-500 max-w-[240px] leading-relaxed m-0">
              Add a card's reward rates and fee terms so SmartCred can track it.
            </p>
          </article>
        )}
      </div>
    </div>
  );
}
