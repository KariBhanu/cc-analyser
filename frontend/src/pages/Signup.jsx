import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import AuthShell, {
  AUTH_INPUT, AuthError, AuthField, AuthNote, AuthSubmit, Divider, GoogleButton,
} from "../components/AuthShell.jsx";

export default function Signup() {
  const [cfg, setCfg] = useState({ google: false, email_delivery: false, password_min_length: 8 });
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
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
      await api.signup(form);
      // The server put the new account in the session as "pending", so the
      // verify screen picks it up without passing anything through the URL.
      navigate("/verify");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const tooShort = form.password.length > 0 && form.password.length < cfg.password_min_length;

  return (
    <AuthShell
      title="Create your account"
      subtitle="We'll send a code to your email to confirm it's you."
      footer={
        <p className="font-body-sm text-slate-500 m-0">
          Already have an account?{" "}
          <Link to="/login" className="text-emerald-400 hover:underline underline-offset-4">
            Log in
          </Link>
        </p>
      }
    >
      {cfg.google && (
        <>
          <GoogleButton href={api.googleLoginUrl()} label="Sign up with Google" />
          <Divider label="or use your email" />
        </>
      )}

      <form onSubmit={submit} className="w-full space-y-5">
        <AuthField label="Full name" icon="person">
          <input
            className={AUTH_INPUT}
            type="text"
            value={form.name}
            onChange={set("name")}
            placeholder="Satish Kumar"
            autoComplete="name"
            required
          />
        </AuthField>

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

        <AuthField label="Mobile number" icon="smartphone" hint="Indian mobile, 10 digits.">
          <input
            className={AUTH_INPUT}
            type="tel"
            inputMode="numeric"
            value={form.phone}
            onChange={set("phone")}
            placeholder="98765 43210"
            autoComplete="tel"
            required
          />
        </AuthField>

        <AuthField
          label="Password"
          icon="lock"
          hint={`At least ${cfg.password_min_length} characters.`}
        >
          <input
            className={AUTH_INPUT}
            type="password"
            value={form.password}
            onChange={set("password")}
            placeholder="••••••••••••"
            autoComplete="new-password"
            minLength={cfg.password_min_length}
            required
          />
        </AuthField>

        <AuthError>{error}</AuthError>

        {!cfg.email_delivery && (
          <AuthNote tone="warn">
            Email sending isn't configured yet, so your code will be printed in the backend log
            instead of emailed. Set the SMTP values in <code>backend/.env</code> to receive it.
          </AuthNote>
        )}

        <AuthSubmit type="submit" disabled={busy || tooShort}>
          {busy ? "Creating account…" : "Create account"}
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
