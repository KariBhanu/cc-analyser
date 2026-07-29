import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import AuthShell, {
  AUTH_INPUT, AuthError, AuthField, AuthNote, AuthSubmit,
} from "../components/AuthShell.jsx";

// Two-step verification: email first, then mobile. Which step we're on comes from
// the server's verification flags, so a refresh or a re-login lands in the right
// place instead of restarting.
export default function Verify({ onAuthenticated }) {
  const [state, setState] = useState(null);      // { user, verification, resend_in }
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const navigate = useNavigate();
  const timer = useRef(null);

  const channel = state && !state.verification.email_verified ? "email" : "phone";

  const load = useCallback(async () => {
    try {
      const p = await api.pending();
      setState(p);
      setCooldown(p.resend_in?.[!p.verification.email_verified ? "email" : "phone"] || 0);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Resend countdown.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    timer.current = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer.current);
  }, [cooldown]);

  async function submit(e) {
    e.preventDefault();
    setError(""); setNote(""); setBusy(true);
    try {
      const res = await api.verifyOtp(channel, code.trim());
      setCode("");
      if (res.logged_in) {
        // Phone may still be outstanding but isn't a gate — hand control to the
        // app and let the banner there nudge them.
        onAuthenticated?.(res.user);
        if (res.verification.phone_verified || !res.verification.has_phone) {
          navigate("/");
          return;
        }
      }
      setState((s) => ({ ...s, verification: res.verification, user: res.user }));
      setCooldown(res.sent?.resend_in ?? 0);
      setNote(
        res.verification.email_verified && !res.verification.phone_verified
          ? "Email confirmed. Now confirm your mobile number."
          : ""
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(""); setNote(""); setBusy(true);
    try {
      const res = await api.resendOtp(channel);
      setCooldown(res.sent?.resend_in ?? 60);
      setNote(`New code sent to ${res.sent?.destination || "you"}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loadFailed) {
    return (
      <AuthShell
        title="Nothing to verify"
        subtitle="We couldn't find a signup in progress."
        footer={
          <p className="font-body-sm text-slate-500 m-0">
            <Link to="/signup" className="text-emerald-400 hover:underline underline-offset-4">
              Create an account
            </Link>{" "}
            or{" "}
            <Link to="/login" className="text-emerald-400 hover:underline underline-offset-4">
              log in
            </Link>
          </p>
        }
      >
        <AuthNote>Your session may have expired. Start again and we'll send a fresh code.</AuthNote>
      </AuthShell>
    );
  }

  if (!state) {
    return (
      <AuthShell title="Loading…">
        <p className="font-body-sm text-slate-500 text-center m-0">One moment.</p>
      </AuthShell>
    );
  }

  const isEmail = channel === "email";
  const destination = isEmail ? state.user.email : state.user.phone;

  return (
    <AuthShell
      title={isEmail ? "Confirm your email" : "Confirm your mobile"}
      subtitle={`Enter the 6-digit code we sent to ${destination}.`}
      footer={
        !isEmail && (
          <button
            onClick={() => { onAuthenticated?.(state.user); navigate("/"); }}
            className="font-body-sm text-slate-500 hover:text-emerald-400 transition-colors bg-transparent border-0 cursor-pointer"
          >
            Skip for now — verify later
          </button>
        )
      }
    >
      {/* Progress: email then phone. */}
      <div className="flex items-center gap-3 mb-8">
        {[
          { key: "email", label: "Email", done: state.verification.email_verified },
          { key: "phone", label: "Mobile", done: state.verification.phone_verified },
        ].map((step) => (
          <div key={step.key} className="flex-1 flex items-center gap-2">
            <span
              className={`material-symbols-outlined text-[18px] ${
                step.done ? "text-emerald-400 icon-fill" : channel === step.key ? "text-emerald-400" : "text-slate-600"
              }`}
            >
              {step.done ? "check_circle" : "radio_button_unchecked"}
            </span>
            <span
              className={`font-label-md text-[10px] uppercase tracking-widest ${
                step.done || channel === step.key ? "text-slate-300" : "text-slate-600"
              }`}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="w-full space-y-5">
        <AuthField label="Verification code" icon="password">
          <input
            className={`${AUTH_INPUT} tracking-[0.5em] font-numeric-data`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            autoFocus
            required
          />
        </AuthField>

        <AuthError>{error}</AuthError>
        <AuthNote tone="ok">{note}</AuthNote>

        {!isEmail && (
          <AuthNote tone="warn">
            SMS isn't wired to a provider yet, so this code is printed in the backend log rather
            than texted. You can skip this step and finish it later.
          </AuthNote>
        )}

        <AuthSubmit type="submit" disabled={busy || code.length < 6}>
          {busy ? "Checking…" : "Verify"}
        </AuthSubmit>
      </form>

      <div className="mt-6 text-center">
        <button
          onClick={resend}
          disabled={busy || cooldown > 0}
          className="font-body-sm text-[12px] text-slate-500 hover:text-emerald-400 disabled:hover:text-slate-500 disabled:opacity-60 transition-colors bg-transparent border-0 cursor-pointer disabled:cursor-not-allowed"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Send a new code"}
        </button>
      </div>
    </AuthShell>
  );
}
