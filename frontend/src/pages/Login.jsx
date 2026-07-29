import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import AuthShell, {
  AUTH_INPUT, AuthError, AuthField, AuthNote, AuthSubmit, Divider, GoogleButton,
} from "../components/AuthShell.jsx";

export default function Login({ onLogin }) {
  const [cfg, setCfg] = useState({ google: false, dev_login: false });
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.authConfig().then(setCfg).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      onLogin(await api.login(form.email, form.password));
    } catch (err) {
      // A 403 means the credentials were right but the account isn't verified —
      // the server has already put it in the session, so continue to /verify
      // rather than dead-ending on an error message.
      if (/verify your/i.test(err.message)) {
        navigate("/verify");
        return;
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function devLogin() {
    setError("");
    try {
      onLogin(await api.devLogin());
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see your cards and rewards."
      footer={
        <p className="font-body-sm text-slate-500 m-0">
          Don't have an account?{" "}
          <Link to="/signup" className="text-emerald-400 hover:underline underline-offset-4">
            Create one
          </Link>
        </p>
      }
    >
      {cfg.google && (
        <>
          <GoogleButton href={api.googleLoginUrl()} />
          <Divider label="or use your email" />
        </>
      )}

      <form onSubmit={submit} className="w-full space-y-5">
        <AuthField label="Email" icon="alternate_email">
          <input
            className={AUTH_INPUT}
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </AuthField>

        <AuthField label="Password" icon="lock">
          <input
            className={AUTH_INPUT}
            type="password"
            value={form.password}
            onChange={set("password")}
            placeholder="••••••••••••"
            autoComplete="current-password"
            required
          />
        </AuthField>

        <AuthError>{error}</AuthError>

        <AuthSubmit type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </AuthSubmit>
      </form>

      {!cfg.google && !cfg.dev_login && (
        <div className="mt-6">
          <AuthNote tone="warn">
            Google sign-in isn't configured. Set <code>GOOGLE_CLIENT_ID</code> and{" "}
            <code>GOOGLE_CLIENT_SECRET</code> in <code>backend/.env</code> to enable it.
          </AuthNote>
        </div>
      )}

      {cfg.dev_login && (
        <div className="mt-6 pt-6 border-t border-slate-800 text-center">
          <button
            onClick={devLogin}
            className="font-label-md text-[10px] uppercase tracking-widest text-slate-500 hover:text-emerald-400 transition-colors bg-transparent border-0 cursor-pointer"
          >
            Continue as dev user (skips verification)
          </button>
        </div>
      )}
    </AuthShell>
  );
}
