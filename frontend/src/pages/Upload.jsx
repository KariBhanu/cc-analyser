import { useEffect, useState } from "react";
import { api } from "../api.js";

// Two ways in: upload a PDF (parsed into a draft you confirm), or type figures manually.
export default function Upload() {
  const [cards, setCards] = useState([]);
  const [cardId, setCardId] = useState("");
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState({ total_spend: "", points_earned: "", period_start: "", period_end: "", note: "" });
  const [parsed, setParsed] = useState(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.listCards().then((cs) => {
      setCards(cs);
      if (cs[0]) setCardId(cs[0].id);
    });
  }, []);

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
        setError(res.error + (res.needs_password ? " (enter the PDF password above)" : ""));
        return;
      }
      setParsed(res);
      setDraft((d) => ({ ...d, total_spend: res.guessed_total ?? "" }));
      setMsg("Parsed! Review the numbers below and save.");
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
      setMsg("Statement saved ✅");
      setParsed(null);
      setDraft({ total_spend: "", points_earned: "", period_start: "", period_end: "", note: "" });
    } catch (err) {
      setError(err.message);
    }
  }

  const setD = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  if (cards.length === 0) return <p className="muted">Add a card first.</p>;

  return (
    <>
      <h1>Add a statement</h1>
      {error && <p className="error">{error}</p>}
      {msg && <p style={{ color: "var(--good)" }}>{msg}</p>}

      <div className="card">
        <label>Card</label>
        <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
          {cards.map((c) => <option key={c.id} value={c.id}>{c.issuer} {c.name}</option>)}
        </select>
      </div>

      <form className="card" onSubmit={doUpload}>
        <h3>Option A — upload PDF</h3>
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0])} />
        <label>PDF password (leave blank to use the one saved on the card)</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="optional" />
        <div style={{ marginTop: 10 }}><button type="submit">Parse PDF</button></div>
        {parsed && (
          <p className="muted">Guessed total: {parsed.guessed_total ?? "—"} · dates found: {parsed.dates?.join(", ") || "none"}</p>
        )}
      </form>

      <form className="card" onSubmit={save}>
        <h3>{parsed ? "Confirm & save" : "Option B — enter manually"}</h3>
        <div className="row">
          <div><label>Total spend (₹)</label><input type="number" value={draft.total_spend} onChange={setD("total_spend")} required /></div>
          <div><label>Points earned (blank = estimate)</label><input type="number" value={draft.points_earned} onChange={setD("points_earned")} /></div>
        </div>
        <div className="row">
          <div><label>Period start</label><input type="date" value={draft.period_start} onChange={setD("period_start")} /></div>
          <div><label>Period end</label><input type="date" value={draft.period_end} onChange={setD("period_end")} /></div>
        </div>
        <div><label>Note</label><input value={draft.note} onChange={setD("note")} placeholder="e.g. May statement" /></div>
        <div style={{ marginTop: 10 }}><button type="submit">Save statement</button></div>
      </form>
    </>
  );
}
