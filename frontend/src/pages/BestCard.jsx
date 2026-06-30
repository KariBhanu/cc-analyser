import { useState } from "react";
import { api } from "../api.js";

const POPULAR = ["Amazon", "Flipkart", "Swiggy", "Zomato", "Myntra", "BookMyShow", "Uber"];
const rupee = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function BestCard() {
  const [merchant, setMerchant] = useState("Amazon");
  const [amount, setAmount] = useState(1000);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function go(e) {
    e.preventDefault();
    setError("");
    try {
      setResult(await api.bestCard(merchant, amount));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <h1>Best card for a merchant</h1>
      <p className="muted">Which of your cards gives the most reward value for a purchase?</p>

      <form className="card" onSubmit={go}>
        <div className="row">
          <div>
            <label>Merchant / website</label>
            <input list="merchants" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
            <datalist id="merchants">{POPULAR.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <div><label>Spend amount (₹)</label><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          <div><button type="submit">Compare</button></div>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="card">
          <h3>Ranking for {rupee(result.amount)} at {result.merchant || "any merchant"}</h3>
          <table>
            <thead>
              <tr><th>#</th><th>Card</th><th>Points/₹100</th><th>₹/point</th><th>Est. reward</th><th>Monthly cap</th></tr>
            </thead>
            <tbody>
              {result.ranking.map((r, i) => (
                <tr key={r.card_id} style={i === 0 ? { color: "var(--good)", fontWeight: 700 } : {}}>
                  <td>{i + 1}</td>
                  <td>{r.issuer} {r.name}{i === 0 ? " 🏆" : ""}</td>
                  <td>{r.points_per_100}</td>
                  <td>{r.rupee_per_point}</td>
                  <td>{rupee(r.estimated_reward)}{r.capped ? " ⚠️" : ""}</td>
                  <td>{r.monthly_cap_rupees ? rupee(r.monthly_cap_rupees) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.ranking.length === 0 && <p className="muted">Add some cards first.</p>}
          <p className="muted">⚠️ = reward limited by the card's monthly cap (assumes no other spend this month).</p>
        </div>
      )}
    </>
  );
}
