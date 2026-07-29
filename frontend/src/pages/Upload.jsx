import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { Alert, Button, Chip, EmptyState, Field, Input, Select } from "../components/ui.jsx";

// Two ways in: drop a statement PDF (parsed into a draft you confirm), or type the
// figures manually. Layout follows the "Upload Statement" Stitch screen — one
// centred column, dropzone first, manual entry behind a toggle.
export default function Upload() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [cards, setCards] = useState([]);
  const [cardId, setCardId] = useState("");
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState({ total_spend: "", points_earned: "", period_start: "", period_end: "", note: "" });
  const [parsed, setParsed] = useState(null);
  const [manual, setManual] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.listCards().then((cs) => {
      setCards(cs);
      // Best Card's "Add a statement" action deep-links here with ?card=<id>.
      const wanted = params.get("card");
      const preselect = cs.find((c) => c.id === wanted) || cs[0];
      if (preselect) setCardId(preselect.id);
    });
  }, [params]);

  function pick(f) {
    if (!f) return;
    setFile(f);
    setError("");
    setMsg("");
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  }

  async function doUpload(e) {
    e.preventDefault();
    setError(""); setMsg(""); setParsed(null);
    if (!file) return setError("Choose a PDF first.");
    const fd = new FormData();
    fd.append("card_id", cardId);
    fd.append("file", file);
    if (password) fd.append("password", password);
    try {
      const res = await api.uploadStatement(fd);
      if (!res.ok) {
        setError(res.error + (res.needs_password ? " — enter the PDF password below." : ""));
        return;
      }
      setParsed(res);
      setDraft((d) => ({ ...d, total_spend: res.guessed_total ?? "" }));
      setManual(true);
      setMsg("PDF read. Check the numbers below and save.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function save(e) {
    e.preventDefault();
    setError(""); setMsg("");
    try {
      await api.createStatement({
        card_id: cardId,
        total_spend: Number(draft.total_spend),
        points_earned: draft.points_earned === "" ? null : Number(draft.points_earned),
        period_start: draft.period_start || null,
        period_end: draft.period_end || null,
        note: draft.note || null,
      });
      setMsg("Statement saved.");
      setParsed(null);
      setFile(null);
      setDraft({ total_spend: "", points_earned: "", period_start: "", period_end: "", note: "" });
    } catch (err) {
      setError(err.message);
    }
  }

  const setD = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  if (cards.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <EmptyState icon="credit_card_off" title="No cards yet">
          Add a card first, then come back to record a statement against it.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col items-stretch py-stack-lg">
      {/* ───── Header ───── */}
      <div className="w-full mb-stack-lg">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-slate-400 hover:text-emerald-500 transition-colors mb-stack-md group bg-transparent border-0 p-0 cursor-pointer"
        >
          <span className="material-symbols-outlined mr-base text-lg group-hover:-translate-x-1 transition-transform">
            arrow_back
          </span>
          <span className="font-label-md text-label-md">Back</span>
        </button>
        <h1 className="font-headline-lg text-headline-lg text-white mb-stack-sm tracking-tighter m-0">
          Add a Statement
        </h1>
        <p className="font-body-md text-body-md text-slate-500 m-0">
          Upload a statement PDF (password-protected is fine), or enter the figures yourself.
        </p>
      </div>

      <div className="w-full space-y-4 mb-stack-lg">
        <Alert>{error}</Alert>
        <Alert kind="ok">{msg}</Alert>
      </div>

      {/* ───── Main card ───── */}
      <div className="w-full glass-card rounded-xl p-container-padding shadow-2xl relative overflow-hidden accent-border">
        <div className="absolute top-0 right-0 p-4 hidden sm:block">
          <span className="font-label-md text-[10px] text-emerald-500/50 uppercase tracking-widest">
            {file ? "File ready" : "No file selected"}
          </span>
        </div>

        <form onSubmit={doUpload} className="space-y-stack-lg">
          {/* Which card */}
          <Field label="Which card is this statement for?">
            <Select value={cardId} onChange={(e) => setCardId(e.target.value)}>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>{c.issuer} {c.name}</option>
              ))}
            </Select>
          </Field>

          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`border border-dashed rounded-lg flex flex-col items-center justify-center p-8 sm:p-12 text-center transition-all cursor-pointer group ${
              dragging
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-slate-700 hover:border-emerald-500/50 bg-slate-900/50"
            }`}
          >
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <span className="material-symbols-outlined text-emerald-400 text-4xl">
                {file ? "task" : "upload_file"}
              </span>
            </div>
            <h3 className="font-headline-md text-headline-md text-white mb-2 tracking-tight m-0 break-all">
              {file ? file.name : "Drop your statement PDF here"}
            </h3>
            <p className="font-body-sm text-body-sm text-slate-500 mb-8 m-0">
              {file ? "Ready to read" : "or click to browse your files"}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
              // The programmatic .click() below re-bubbles to the dropzone's own
              // onClick, which would call .click() again — stop it here.
              onClick={(e) => e.stopPropagation()}
            />
            <span className="bg-emerald-600/20 text-emerald-400 border border-emerald-600/40 font-label-md text-label-md py-3 px-8 rounded tracking-widest hover:bg-emerald-600 hover:text-white transition-all">
              Choose File
            </span>
          </div>

          <Field label="PDF password" hint="Leave blank to use the one saved on the card.">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="optional"
              autoComplete="off"
            />
          </Field>

          <Button type="submit" className="w-full">
            <span className="material-symbols-outlined text-base">document_scanner</span> Read PDF
          </Button>

          {parsed && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Chip tone="emerald">total: {parsed.guessed_total ?? "—"}</Chip>
              {parsed.dates?.length ? (
                parsed.dates.map((d) => <Chip key={d}>{d}</Chip>)
              ) : (
                <Chip>no dates found</Chip>
              )}
            </div>
          )}
        </form>

        {/* Security note */}
        <div className="flex items-start bg-emerald-950/20 border border-emerald-900/30 p-4 rounded mt-stack-lg">
          <span className="material-symbols-outlined text-emerald-500 mr-4 mt-0.5">shield_lock</span>
          <div>
            <p className="font-label-md text-xs text-emerald-400 uppercase tracking-widest mb-1 m-0">
              Your data stays on your server
            </p>
            <p className="font-body-sm text-[12px] text-emerald-500/70 leading-relaxed m-0">
              PDFs are read on your own machine, and saved passwords are encrypted at rest.
            </p>
          </div>
        </div>

        {/* Manual override */}
        <div className="relative flex py-4 items-center">
          <div className="flex-grow border-t border-slate-800/50" />
          <span className="flex-shrink-0 mx-4 text-slate-600 font-label-md text-[10px] tracking-[0.3em] uppercase">
            or enter it manually
          </span>
          <div className="flex-grow border-t border-slate-800/50" />
        </div>

        <div className="text-center mt-stack-md">
          <button
            onClick={() => setManual((m) => !m)}
            className="text-slate-500 hover:text-emerald-400 font-label-md text-label-md flex items-center justify-center w-full transition-colors uppercase tracking-widest group bg-transparent border-0 cursor-pointer"
          >
            <span className="material-symbols-outlined mr-base text-lg group-hover:rotate-12 transition-transform">
              edit_document
            </span>
            {manual ? "Hide manual entry" : "Enter figures manually"}
          </button>
        </div>

        {manual && (
          <form onSubmit={save} className="mt-stack-lg pt-stack-lg border-t border-slate-800/50 space-y-stack-lg">
            {parsed && (
              <p className="font-label-md text-[10px] text-emerald-500/70 uppercase tracking-widest m-0">
                Pre-filled from the PDF — check the numbers before saving.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <Field label="Total spend (₹)">
                <Input type="number" value={draft.total_spend} onChange={setD("total_spend")} required />
              </Field>
              <Field label="Points earned" hint="Blank = estimate from spend.">
                <Input type="number" value={draft.points_earned} onChange={setD("points_earned")} />
              </Field>
              <Field label="Period start">
                <Input type="date" value={draft.period_start} onChange={setD("period_start")} />
              </Field>
              <Field label="Period end">
                <Input type="date" value={draft.period_end} onChange={setD("period_end")} />
              </Field>
              <Field className="sm:col-span-2" label="Note">
                <Input value={draft.note} onChange={setD("note")} placeholder="e.g. May statement" />
              </Field>
            </div>
            <Button type="submit" className="w-full">
              <span className="material-symbols-outlined text-base">save</span> Save Statement
            </Button>
          </form>
        )}
      </div>

    </div>
  );
}
