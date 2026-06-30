import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Cards from "./pages/Cards.jsx";
import Upload from "./pages/Upload.jsx";
import BestCard from "./pages/BestCard.jsx";

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  const navigate = useNavigate();

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  async function logout() {
    await api.logout();
    setUser(null);
    navigate("/");
  }

  if (user === undefined) return <div className="center">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <>
      <nav>
        <strong>💳 cc-analyser</strong>
        <Link to="/">Dashboard</Link>
        <Link to="/cards">Cards</Link>
        <Link to="/upload">Add statement</Link>
        <Link to="/best-card">Best card</Link>
        <span className="spacer" />
        <span className="muted">{user.name || user.email}</span>
        <button className="ghost" onClick={logout}>Logout</button>
      </nav>
      <div className="container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/best-card" element={<BestCard />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </>
  );
}
