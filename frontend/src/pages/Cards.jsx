import { useEffect, useState } from "react";
import { api } from "../api.js";

const EMPTY = {
  issuer: "", name: "", annual_fee: 0, waiver_threshold: 0,
  base_points_per_100: 0, rupee_per_point: 1, statement_password: "",
  base_monthly_cap: 0, bonus_monthly_cap: 0,
  merchant_bonuses: [],
};

export default function Cards() {
  const [cards, setCards] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [bonus, setBonus] = useState({ merchant: "", points_per_100: 0 });
  const [error, setError] = useState("");

  const load = () => api.listCards().then(setCards).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => {
    const v = e.target.type === "number" ? Number(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

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
    <>
      <h1>Your cards</h1>
      {error && <p className="error">{error}</p>}

      <form className="card" onSubmit={submit}>
        <h3>Add a card</h3>
        <div className="row">
          <div><label>Issuer</label><input value={form.issuer} onChange={set("issuer")} placeholder="HDFC" required /></div>
          <div><label>Card name</label><input value={form.name} onChange={set("name")} placeholder="Millennia" required /></div>
        </div>
        <div className="row">
          <div><label>Annual fee (₹)</label><input type="number" value={form.annual_fee} onChange={set("annual_fee")} /></div>
          <div><label>Fee-waiver spend (₹/yr)</label><input type="number" value={form.waiver_threshold} onChange={set("waiver_threshold")} /></div>
        </div>
        <div className="row">
          <div><label>Base points / ₹100</label><input type="number" value={form.base_points_per_100} onChange={set("base_points_per_100")} /></div>
          <div><label>Conversion: ₹ per point</label><input type="number" step="0.01" value={form.rupee_per_point} onChange={set("rupee_per_point")} /></div>
        </div>
        <div className="row">
          <div><label>Base reward cap / month (pts, 0 = none)</label><input type="number" value={form.base_monthly_cap} onChange={set("base_monthly_cap")} /></div>
          <div><label>Bonus reward cap / month (pts, 0 = none)</label><input type="number" value={form.bonus_monthly_cap} onChange={set("bonus_monthly_cap")} /></div>
        </div>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Statement PDF password (stored encrypted)</label>
            <input value={form.statement_password} onChange={set("statement_password")} placeholder="optional" />
          </div>
        </div>

        <label>Merchant bonuses (optional)</label>
        <div className="row">
          <input placeholder="Merchant e.g. Amazon" value={bonus.merchant}
                 onChange={(e) => setBonus({ ...bonus, merchant: e.target.value })} />
          <input type="number" placeholder="points / ₹100" value={bonus.points_per_100}
                 onChange={(e) => setBonus({ ...bonus, points_per_100: Number(e.target.value) })} />
          <button type="button" className="ghost" onClick={addBonus}>Add bonus</button>
        </div>
        {form.merchant_bonuses.length > 0 && (
          <p className="muted">
            {form.merchant_bonuses.map((b, i) => `${b.merchant}: ${b.points_per_100}/₹100`).join(" · ")}
          </p>
        )}

        <div style={{ marginTop: 12 }}><button type="submit">Save card</button></div>
      </form>

      <h2>Saved cards</h2>
      {cards.length === 0 && <p className="muted">No cards yet.</p>}
      {cards.map((c) => (
        <div className="card" key={c.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <strong>{c.issuer} {c.name}</strong>{" "}
              {c.has_password && <span className="badge">🔒 password set</span>}
              <div className="muted">
                Base {c.base_points_per_100}/₹100 · 1 pt = ₹{c.rupee_per_point} ·
                fee ₹{c.annual_fee} (waive at ₹{c.waiver_threshold})
              </div>
              <div className="muted">
                Monthly caps: base {c.base_monthly_cap ? `${c.base_monthly_cap} pts` : "none"} ·
                bonus {c.bonus_monthly_cap ? `${c.bonus_monthly_cap} pts` : "none"}
              </div>
              {c.merchant_bonuses?.length > 0 && (
                <div className="muted">Bonuses: {c.merchant_bonuses.map((b) => `${b.merchant} ${b.points_per_100}/₹100`).join(", ")}</div>
              )}
            </div>
            <button className="danger" onClick={() => remove(c.id)}>Delete</button>
          </div>
        </div>
      ))}
    </>
  );
}
