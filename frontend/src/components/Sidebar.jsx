import { NavLink } from "react-router-dom";
import { NAV } from "./nav.js";

// Desktop rail. Hidden below md, where BottomNav takes over.
export default function Sidebar({ user, onLogout }) {
  const displayName = user?.name || user?.email || "Signed in";
  const idLabel = displayName.toUpperCase();

  return (
    <aside className="hidden md:flex flex-col h-screen w-64 fixed left-0 top-0 py-stack-lg border-r border-slate-800/50 bg-[#0b1120] z-20">
      {/* Brand */}
      <div className="px-6 mb-8">
        <h1 className="font-headline-md text-headline-md font-bold text-emerald-500 tracking-tighter m-0">
          SmartCred
        </h1>
        <p className="font-label-md text-[10px] text-slate-500 uppercase tracking-widest mt-1 m-0">
          Credit Card Rewards
        </p>
      </div>

      {/* Nav (div, not <nav>, to avoid the global element styles in styles.css) */}
      <div className="flex-1 px-4 space-y-1">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded transition-colors duration-200 ${
                isActive
                  ? "text-emerald-400 font-bold bg-emerald-500/10 border-r-2 border-emerald-500"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`material-symbols-outlined text-xl ${isActive ? "icon-fill" : ""}`}>
                  {n.icon}
                </span>
                <span className="font-label-md text-label-md">{n.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div className="px-6 mt-auto">
        <NavLink
          to="/cards?new=1"
          className="block w-full text-center py-3 bg-emerald-600/20 text-emerald-400 border border-emerald-600/40 rounded font-label-md text-label-md uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all active:scale-[0.98]"
        >
          Add Card
        </NavLink>

        {/* Signed-in user */}
        <div className="mt-6 pt-6 border-t border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded border border-slate-700 bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-label-md text-sm shrink-0">
            {idLabel.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="font-label-md text-xs text-white truncate m-0">{displayName}</p>
            <button
              onClick={onLogout}
              className="font-body-sm text-[11px] text-slate-500 hover:text-red-400 transition-colors bg-transparent border-0 p-0 cursor-pointer"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
