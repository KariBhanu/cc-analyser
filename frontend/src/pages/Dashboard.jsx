import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

const rupee = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.summary().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <>
      <h1>Dashboard</h1>
      <div className="grid">
        <div className="card">
          <div className="muted">Total spend (all cards)</div>
          <div className="stat">{rupee(data.totals.spend)}</div>
        </div>
        <div className="card">
          <div className="muted">Total rewards earned</div>
          <div className="stat">{rupee(data.totals.reward)}</div>
        </div>
      </div>

      <h2>Per card</h2>
      {data.cards.length === 0 && (
        <p className="muted">No cards yet. <Link to="/cards">Add a card</Link> to get started.</p>
      )}
      {data.cards.map((c) => {
        const w = c.fee_waiver;
        return (
          <div className="card" key={c.card_id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{c.issuer} {c.name}</strong>
              <span className="badge">{c.statement_count} statements</span>
            </div>
            <div className="grid" style={{ marginTop: 12 }}>
              <div>
                <div className="muted">Spend</div>
                <div className="stat" style={{ fontSize: "1.2rem" }}>{rupee(c.total_spend)}</div>
              </div>
              <div>
                <div className="muted">Rewards</div>
                <div className="stat" style={{ fontSize: "1.2rem" }}>{rupee(c.total_reward)}</div>
              </div>
            </div>
            {w.applicable ? (
              <div style={{ marginTop: 12 }}>
                <div className="muted">
                  {w.waived
                    ? `✅ Annual fee (${rupee(w.annual_fee)}) waived — you've spent ${rupee(w.fy_spend)} this FY.`
                    : `Spend ${rupee(w.remaining)} more this FY to waive the ${rupee(w.annual_fee)} fee.`}
                </div>
                <div className="progress">
                  <div style={{ width: `${Math.round((w.pct || 0) * 100)}%` }} />
                </div>
                <div className="muted">{rupee(w.fy_spend)} / {rupee(w.threshold)}</div>
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 12 }}>No fee-waiver threshold set.</div>
            )}
          </div>
        );
      })}
    </>
  );
}
