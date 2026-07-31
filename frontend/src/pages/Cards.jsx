import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { pct, rupee, rupeeShort } from "../format.js";
import {
  Alert, Button, CardFace, Chip, Field, Input, merchantIcon, CARD_ACCENTS, Panel,
  ProgressBar, Combobox, Stat, TERM_HELP, Tooltip,
} from "../components/ui.jsx";

// The user tells us which card they hold; every reward term is resolved from
// the bundled catalog server-side. Nobody knows their card's rupee-per-point
// off the top of their head, and guessing it silently corrupts every total.
const EMPTY = { issuer_slug: "", catalog_slug: "", statement_password: "", opened_on: "" };

export default function Cards() {
  const [params, setParams] = useSearchParams();
  const [cards, setCards] = useState([]);
  // Fee-waiver progress lives on the summary endpoint (it needs statements), so we
  // fetch it alongside and merge by card_id.
  const [waivers, setWaivers] = useState({});
  const [form, setForm] = useState(EMPTY);
  const [issuers, setIssuers] = useState([]);
  const [catalogCards, setCatalogCards] = useState([]);
  const [showForm, setShowForm] = useState(params.get("new") === "1");
  const [editing, setEditing] = useState(null); // { id, password, saving }
  const [error, setError] = useState("");

  // The card the user has selected, with its catalog terms — drives the
  // read-only preview below the picker.
  const picked = catalogCards.find((c) => c.slug === form.catalog_slug) || null;

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

  // Issuer list is static app data; fetch once.
  useEffect(() => {
    api.catalogIssuers().then(setIssuers).catch((e) => setError(e.message));
  }, []);

  // Cards follow the chosen issuer. Clearing the issuer clears the card too, so
  // a stale slug can never be submitted against the wrong issuer.
  useEffect(() => {
    if (!form.issuer_slug) {
      setCatalogCards([]);
      return;
    }
    let stale = false;
    api
      .catalogCards(form.issuer_slug)
      .then((cs) => !stale && setCatalogCards(cs))
      .catch((e) => !stale && setError(e.message));
    return () => { stale = true; };
  }, [form.issuer_slug]);

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

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!picked) return setError("Pick your card from the list first.");
    try {
      // issuer/name are for display; catalog_slug is what the server resolves
      // the actual terms from, so the client can't send terms that disagree.
      await api.createCard({
        issuer: issuers.find((i) => i.slug === form.issuer_slug)?.bank || "",
        name: picked.name,
        catalog_slug: picked.slug,
        ...(form.statement_password ? { statement_password: form.statement_password } : {}),
        ...(form.opened_on ? { opened_on: form.opened_on } : {}),
      });
      setForm(EMPTY);
      closeForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Statement-password editing. The plaintext is never sent back to the
  // browser (the API exposes only has_password), so the field always starts
  // blank rather than pretending to show the stored value.
  function startEdit(card) {
    setEditing({
      id: card.id,
      password: "",
      // <input type="month"> only accepts YYYY-MM, so trim any stored full date.
      opened_on: (card.opened_on || "").slice(0, 7),
      saving: false,
    });
    setError("");
  }

  async function saveEdit(e) {
    e.preventDefault();
    setError("");
    setEditing((s) => ({ ...s, saving: true }));
    try {
      await api.updateCard(editing.id, {
        statement_password: editing.password,
        opened_on: editing.opened_on || null,
      });
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
      setEditing((s) => s && { ...s, saving: false });
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
            <p className="font-body-sm text-[12px] text-slate-500 m-0">
              Pick the card you hold — fees, reward rates and point values are filled in
              from our catalog of {issuers.reduce((n, i) => n + i.card_count, 0)} Indian cards.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <Field label="Issuer" hint="Type to search">
                <Combobox
                  options={issuers.map((i) => ({ value: i.slug, label: i.bank }))}
                  value={form.issuer_slug}
                  onChange={(v) => setForm({ ...form, issuer_slug: v, catalog_slug: "" })}
                  placeholder="Search your bank…"
                  emptyText="No matching bank"
                  required
                />
              </Field>

              <Field label="Card" hint="Type to search">
                <Combobox
                  options={catalogCards.map((c) => ({
                    value: c.slug,
                    label: c.variant ? `${c.name} — ${c.variant}` : c.name,
                    note: c.status && c.status !== "active" ? c.status : null,
                    hint: c.category || null,
                  }))}
                  value={form.catalog_slug}
                  onChange={(v) => setForm((f) => ({ ...f, catalog_slug: v }))}
                  placeholder={form.issuer_slug ? "Search your card…" : "Pick an issuer first"}
                  emptyText="No matching card"
                  disabled={!form.issuer_slug}
                  required
                />
              </Field>

              <Field
                label="Card opened (month & year)"
                hint="Banks measure the fee waiver from your card's anniversary, not Apr–Mar. Check your welcome email if unsure."
              >
                <Input type="month" value={form.opened_on} onChange={set("opened_on")} />
              </Field>

              <Field
                label="Statement PDF password"
                hint="Optional. Stored encrypted at rest (Fernet, keyed from APP_SECRET)."
              >
                <Input
                  value={form.statement_password}
                  onChange={set("statement_password")}
                  placeholder="Leave blank if your statements aren't password protected"
                />
              </Field>
            </div>

            {/* What the catalog will apply — read-only, so the user can sanity
                check the terms before saving rather than discovering them later. */}
            {picked && (
              <div className="pt-5 border-t border-slate-800/60 space-y-4">
                <h4 className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-emerald-500/60">auto_awesome</span>
                  Terms we'll apply
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Stat label="Annual fee" value={rupee(picked.annual_fee)} tip={TERM_HELP.annual_fee} />
                  <Stat
                    label="Fee waiver"
                    value={picked.waiver_threshold ? `${rupeeShort(picked.waiver_threshold)}/yr` : "None"}
                    tip={TERM_HELP.fee_waiver}
                  />
                  <Stat
                    label="Base rate"
                    value={`${picked.base_points_per_100}/₹100`}
                    tip={TERM_HELP.base_rate}
                  />
                  <Stat
                    label="Point value"
                    value={`₹${picked.rupee_per_point}`}
                    tip={TERM_HELP.point_value}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Stat
                    label="Base cap / month"
                    value={picked.base_monthly_cap ? `${picked.base_monthly_cap} pts` : "Uncapped"}
                    tip={TERM_HELP.base_cap}
                  />
                  <Stat
                    label="Bonus cap / month"
                    value={picked.bonus_monthly_cap ? `${picked.bonus_monthly_cap} pts` : "Uncapped"}
                    tip={TERM_HELP.bonus_cap}
                  />
                </div>
                {picked.merchant_bonuses?.length > 0 && (
                  <div>
                    <p className="font-body-sm text-[9px] uppercase tracking-widest text-slate-600 m-0 mb-2">
                      Merchant bonuses ({picked.merchant_bonuses.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {picked.merchant_bonuses.map((b, i) => (
                        <Chip key={`${b.merchant}-${i}`}>{b.merchant} · {b.points_per_100}/₹100</Chip>
                      ))}
                    </div>
                  </div>
                )}
                {picked.status && picked.status !== "active" && (
                  <Alert kind="warn">
                    Our catalog lists this card as {picked.status}. The terms may be out of date.
                  </Alert>
                )}
              </div>
            )}

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
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => (editing?.id === c.id ? setEditing(null) : startEdit(c))}
                      aria-label={`Edit statement password for ${c.issuer} ${c.name}`}
                      title="Edit statement password"
                      className="text-slate-500 hover:text-emerald-400 transition-colors p-1 bg-transparent border-0 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {editing?.id === c.id ? "close" : "edit"}
                      </span>
                    </button>
                    <button
                      onClick={() => remove(c.id)}
                      aria-label={`Delete ${c.issuer} ${c.name}`}
                      title="Delete card"
                      className="text-slate-500 hover:text-red-400 transition-colors p-1 bg-transparent border-0 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>

                {/* Inline password editor */}
                {editing?.id === c.id && (
                  <form
                    onSubmit={saveEdit}
                    className="mb-stack-md p-stack-md rounded border border-emerald-500/30 bg-emerald-950/10 space-y-3"
                  >
                    <Field
                      label="Card opened (month & year)"
                      hint="Sets the fee-waiver year. Without it we fall back to Apr–Mar, which most banks don't use."
                    >
                      <Input
                        type="month"
                        value={editing.opened_on}
                        onChange={(e) => setEditing({ ...editing, opened_on: e.target.value })}
                      />
                    </Field>
                    <Field
                      label="Statement PDF password"
                      hint={
                        c.has_password
                          ? "A password is saved. Enter a new one to replace it, or leave blank and save to remove it."
                          : "No password saved yet. Used to open password-protected statement PDFs."
                      }
                    >
                      <Input
                        type="password"
                        value={editing.password}
                        onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                        placeholder={c.has_password ? "Enter new password" : "Enter password"}
                      />
                    </Field>
                    <div className="flex items-center gap-2">
                      <Button type="submit" disabled={editing.saving}>
                        <span className="material-symbols-outlined text-base">save</span>
                        {editing.saving ? "Saving…" : "Save"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}

                <div className="grid grid-cols-2 gap-y-stack-md gap-x-stack-lg mb-stack-lg">
                  <div className="min-w-0">
                    <p className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mb-1 m-0 flex items-center gap-1">
                      Base rate <Tooltip text={TERM_HELP.base_rate} />
                    </p>
                    <p className={`font-numeric-data text-body-md m-0 ${a.value}`}>
                      {c.base_points_per_100} pts / ₹100
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mb-1 m-0 flex items-center gap-1">
                      Point value <Tooltip text={TERM_HELP.point_value} />
                    </p>
                    <p className={`font-numeric-data text-body-md m-0 ${a.value}`}>
                      ₹{c.rupee_per_point} / pt
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mb-1 m-0 flex items-center gap-1">
                      Annual fee <Tooltip text={TERM_HELP.annual_fee} />
                    </p>
                    <p className="font-numeric-data text-body-md text-slate-200 m-0">{rupee(c.annual_fee)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mb-1 m-0 flex items-center gap-1">
                      Monthly caps
                      <Tooltip text={`Base — ${TERM_HELP.base_cap}\n\nBonus — ${TERM_HELP.bonus_cap}`} />
                    </p>
                    <p className="font-numeric-data text-body-md text-slate-200 m-0">
                      <span title="Base monthly cap">{c.base_monthly_cap || "—"}</span>
                      <span className="text-slate-600"> base / </span>
                      <span title="Bonus monthly cap">{c.bonus_monthly_cap || "—"}</span>
                      <span className="text-slate-600"> bonus</span>
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
                  {w.applicable && (
                    <p className="font-body-sm text-[10px] text-slate-600 mt-2 m-0">
                      {w.basis === "card_year" ? (
                        <>
                          Card year {w.year_number}: {w.period_start} → {w.period_end}
                          {w.precision === "month" && (
                            <span className="text-slate-700">
                              {" "}· approximate to the month
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          Measured Apr–Mar.{" "}
                          <button
                            onClick={() => startEdit(c)}
                            className="text-amber-400 hover:text-amber-300 underline bg-transparent border-0 p-0 cursor-pointer font-body-sm text-[10px]"
                          >
                            Add the month you opened this card
                          </button>{" "}
                          — banks measure the waiver from its anniversary, so this is
                          only an estimate.
                        </>
                      )}
                    </p>
                  )}
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
