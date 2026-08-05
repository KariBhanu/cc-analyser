import { NavLink } from "react-router-dom";
import { NAV } from "./nav.js";

// Every primary destination stays directly reachable on mobile. Short labels
// keep six items usable on narrow screens; statement creation is available on
// the Statements page itself.
export default function BottomNav() {
  return (
    <div className="md:hidden fixed bottom-0 w-full bg-[#0b1120] border-t border-slate-800 flex items-center h-16 z-50 pb-safe px-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex flex-1 min-w-0 flex-col items-center justify-center h-full transition-colors ${
              isActive ? "text-emerald-500" : "text-slate-500"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`material-symbols-outlined text-xl ${isActive ? "icon-fill" : ""}`}>
                {item.mobileIcon || item.icon}
              </span>
              <span className={`text-[9px] mt-1 truncate max-w-full ${isActive ? "font-bold" : ""}`}>
                {item.short}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}
