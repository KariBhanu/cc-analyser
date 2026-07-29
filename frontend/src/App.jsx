import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Verify from "./pages/Verify.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Cards from "./pages/Cards.jsx";
import Upload from "./pages/Upload.jsx";
import BestCard from "./pages/BestCard.jsx";
import Assistant from "./pages/Assistant.jsx";
import Sidebar from "./components/Sidebar.jsx";
import TopBar from "./components/TopBar.jsx";
import BottomNav from "./components/BottomNav.jsx";

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  async function logout() {
    await api.logout();
    setUser(null);
    navigate("/");
  }

  if (user === undefined) return <div className="center">Loading…</div>;

  // Signed out: only the auth screens exist. /verify is reachable here because
  // the server holds the half-finished signup in the session.
  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify" element={<Verify onAuthenticated={setUser} />} />
        <Route path="/login" element={<Login onLogin={setUser} />} />
        <Route path="*" element={<Login onLogin={setUser} />} />
      </Routes>
    );
  }

  // Phone verification isn't a login gate (SMS is a console stub), so a signed-in
  // user can finish it later. That screen is full-bleed, so render it outside the
  // shell rather than nested inside <main>.
  const phonePending = !user.phone_verified && Boolean(user.phone);
  if (location.pathname === "/verify") {
    return phonePending
      ? <Verify onAuthenticated={setUser} />
      : <Navigate to="/" replace />;
  }

  // Shell mirrors the Stitch screens: fixed rail on desktop, sticky TopBar on every
  // page, raised bottom bar on mobile (hence the pb-24 so content clears it).
  return (
    <div className="min-h-screen bg-background text-slate-200 font-body-md">
      <Sidebar user={user} onLogout={logout} />
      <div className="flex flex-col min-h-screen md:ml-64">
        <TopBar user={user} />
        {phonePending && (
          <div className="bg-amber-950/40 border-b border-amber-500/30 px-container-padding py-2 flex items-center gap-2 flex-wrap">
            <span className="material-symbols-outlined text-amber-400 text-base">info</span>
            <span className="font-body-sm text-[12px] text-amber-200">
              Your mobile number isn't confirmed yet.
            </span>
            <Link
              to="/verify"
              className="font-label-md text-[10px] uppercase tracking-widest text-amber-300 hover:text-amber-100 underline underline-offset-4"
            >
              Confirm now
            </Link>
          </div>
        )}
        <main className="flex-1 w-full max-w-max-width-desktop mx-auto p-container-padding pb-24 md:pb-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/cards" element={<Cards />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/best-card" element={<BestCard />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
