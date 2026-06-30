import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Login({ onLogin }) {
  const [cfg, setCfg] = useState({ google: false, dev_login: false });
  const [error, setError] = useState("");

  useEffect(() => {
    api.authConfig().then(setCfg).catch(() => {});
  }, []);

  async function devLogin() {
    try {
      const user = await api.devLogin();
      onLogin(user);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="center">
      <div className="card" style={{ maxWidth: 360 }}>
        <h1>💳 cc-analyser</h1>
        <p className="muted">Track credit card spend, rewards & fee waivers.</p>
        {cfg.google && (
          <a href={api.googleLoginUrl()}>
            <button style={{ width: "100%" }}>Sign in with Google</button>
          </a>
        )}
        {cfg.dev_login && (
          <button className="ghost" style={{ width: "100%", marginTop: 8 }} onClick={devLogin}>
            Continue without Google (dev)
          </button>
        )}
        {!cfg.google && !cfg.dev_login && (
          <p className="error">No login method configured. See backend .env.</p>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
