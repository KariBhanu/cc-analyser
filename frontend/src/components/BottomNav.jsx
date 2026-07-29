import { NavLink } from "react-router-dom";
import { NAV } from "./nav.js";

// Mobile bar from the Stitch screens: two links, a raised centre action, two more.
// NAV has five destinations but the bar only has four slots, so Statements rides
// the centre action — adding a statement is exactly what that screen does, and
// every route stays reachable on mobile.
export default function BottomNav() {
  const [dashboard, cards, bestCard, assistant] = NAV;

  const item = (n) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center w-full h-full transition-colors ${
          isActive ? "text-emerald-500" : "text-slate-500"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`material-symbols-outlined text-xl ${isActive ? "icon-fill" : ""}`}>
            {n.mobileIcon || n.icon}
          </span>
          <span className={`text-[10px] mt-1 ${isActive ? "font-bold" : ""}`}>{n.short}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <div className="md:hidden fixed bottom-0 w-full bg-[#0b1120] border-t border-slate-800 flex justify-around items-center h-16 z-50 pb-safe">
      {item(dashboard)}
      {item(cards)}
      <div className="relative w-full flex justify-center -mt-6">
        <NavLink
          to="/upload"
          aria-label="Add a statement"
          className="w-12 h-12 bg-emerald-600 text-white rounded border border-emerald-400/30 shadow-lg flex items-center justify-center hover:bg-emerald-500 transition-all"
        >
          <span className="material-symbols-outlined">add</span>
        </NavLink>
      </div>
      {item(bestCard)}
      {item(assistant)}
    </div>
  );
}
