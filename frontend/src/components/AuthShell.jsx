import { useMemo } from "react";

// Frame shared by Login / Signup / Verify. Layout follows the Stitch auth screens
// (centred glass panel, brand, drifting glyphs behind) but keeps the app's
// emerald accent rather than those screens' cyan, which came from the project's
// unused light design system.

const GLYPHS = ["credit_card", "payments", "savings", "credit_score"];

function Backdrop() {
  // Positions are randomised once per mount, never per render, so the drift
  // doesn't restart every keystroke.
  const bits = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        key: i,
        glyph: GLYPHS[i % GLYPHS.length],
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 20}s`,
        duration: `${15 + Math.random() * 15}s`,
        scale: 0.5 + Math.random() * 1.1,
      })),
    []
  );

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {bits.map((b) => (
        <span
          key={b.key}
          className="drift material-symbols-outlined"
          style={{
            left: b.left,
            animationDelay: b.delay,
            animationDuration: b.duration,
            fontSize: `${24 * b.scale}px`,
          }}
        >
          {b.glyph}
        </span>
      ))}
    </div>
  );
}

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth-backdrop min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <Backdrop />

      <main className="relative z-10 w-full max-w-md">
        <div className="auth-panel rounded-xl p-8 md:p-10 flex flex-col">
          <div className="mb-8 text-center">
            <h1 className="font-headline-lg text-headline-lg text-emerald-400 tracking-tighter m-0">
              SmartCred
            </h1>
            <p className="font-body-sm text-slate-400 tracking-widest uppercase text-[10px] mt-2 m-0">
              Credit Card Rewards
            </p>
            {title && (
              <p className="font-headline-md text-headline-md text-white mt-6 m-0">{title}</p>
            )}
            {subtitle && (
              <p className="font-body-sm text-[12px] text-slate-400 mt-2 m-0">{subtitle}</p>
            )}
          </div>

          {children}

          {footer && <div className="mt-8 text-center">{footer}</div>}
        </div>

        <div className="mt-8 flex justify-center gap-8 opacity-40">
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-400 text-sm">shield</span>
            <span className="font-label-md text-[9px] text-slate-400 uppercase tracking-tighter">
              Passwords hashed
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-400 text-sm">lock</span>
            <span className="font-label-md text-[9px] text-slate-400 uppercase tracking-tighter">
              Runs on your server
            </span>
          </span>
        </div>
      </main>
    </div>
  );
}

// ── Shared form pieces ───────────────────────────────────────────────────────

export function GoogleButton({ href, label = "Continue with Google" }) {
  return (
    <a
      href={href}
      className="w-full h-12 flex items-center justify-center gap-3 bg-white hover:bg-slate-100 transition-all rounded-lg active:scale-95 no-underline"
    >
      {/* Inline mark rather than a hotlinked PNG, so it works offline. */}
      <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.8-6.8C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.1h12.6c-.3 2.1-1.6 5.2-4.7 7.3l7.7 6c4.5-4.2 6.5-10.2 6.5-17.3z" />
        <path fill="#FBBC05" d="M10.5 28.6A14.6 14.6 0 0 1 9.7 24c0-1.6.3-3.2.8-4.6l-7.9-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.2z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.6-5.8l-7.7-6c-2.1 1.4-4.8 2.4-7.9 2.4-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
      </svg>
      <span className="font-label-md text-slate-900">{label}</span>
    </a>
  );
}

export function Divider({ label }) {
  return (
    <div className="w-full flex items-center gap-4 my-8">
      <div className="h-[1px] flex-grow bg-slate-800" />
      <span className="font-label-md text-[10px] text-slate-500 uppercase tracking-[0.3em]">
        {label}
      </span>
      <div className="h-[1px] flex-grow bg-slate-800" />
    </div>
  );
}

export function AuthField({ label, icon, hint, children }) {
  return (
    <div className="space-y-2">
      <label className="font-label-md text-[10px] text-emerald-400/70 uppercase ml-1 block m-0">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px] pointer-events-none">
            {icon}
          </span>
        )}
        {children}
      </div>
      {hint && <p className="font-body-sm text-[10px] text-slate-500 ml-1 m-0">{hint}</p>}
    </div>
  );
}

export const AUTH_INPUT =
  "auth-input w-full h-12 pl-10 pr-4 rounded-lg font-body-md text-sm placeholder:text-slate-600";

export function AuthSubmit({ children, ...props }) {
  return (
    <button
      {...props}
      className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-label-md text-label-md uppercase tracking-widest rounded-lg shadow-[0_0_25px_rgba(16,185,129,0.25)] transition-all active:scale-95 mt-4 border-0 cursor-pointer disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

export function AuthError({ children }) {
  if (!children) return null;
  return (
    <p className="font-body-sm text-[12px] text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg px-4 py-3 flex items-start gap-2 m-0">
      <span className="material-symbols-outlined text-base shrink-0">error</span>
      {children}
    </p>
  );
}

export function AuthNote({ children, tone = "info" }) {
  if (!children) return null;
  const tones = {
    info: "text-slate-400 bg-slate-800/40 border-slate-700",
    warn: "text-amber-300 bg-amber-950/30 border-amber-500/30",
    ok: "text-emerald-300 bg-emerald-950/40 border-emerald-500/30",
  };
  return (
    <p className={`font-body-sm text-[11px] border rounded-lg px-4 py-3 flex items-start gap-2 m-0 ${tones[tone]}`}>
      <span className="material-symbols-outlined text-base shrink-0">
        {tone === "warn" ? "info" : tone === "ok" ? "check_circle" : "info"}
      </span>
      {children}
    </p>
  );
}
