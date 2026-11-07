import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, ArrowRight, BarChart3, Building2, ClipboardList, Download, Home, LogOut,
  Menu, Moon, ShieldCheck, Sun, Users, X,
} from "lucide-react";
import { useAuth } from "./auth";
import {
  AdminPage, AreasPage, AuthPage, CitizenPage, DashboardPage, HouseholdPage,
  LandingPage, NotFoundPage, ReportsPage, SettingsPage,
} from "./pages";

const navigation = [
  { to: "/dashboard", label: "Population overview", icon: BarChart3 },
  { to: "/citizen", label: "Citizen portal", icon: Home },
  { to: "/areas", label: "Area statistics", icon: Activity },
];

function Guard({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="app-loading"><div className="spinner" />Loading your secure session…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

function AdminGuard({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading"><div className="spinner" />Loading your secure session…</div>;
  if (!user || user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

function Layout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(localStorage.getItem("smart-census-theme") === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("smart-census-theme", next ? "dark" : "light");
  };
  const doSignOut = () => {
    signOut();
    navigate("/");
  };

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <Link to="/" className="brand-lockup" onClick={() => setSidebarOpen(false)}>
          <div className="brand-mark"><Activity size={21} strokeWidth={2.5} /></div>
          <span>smart<span className="brand-light">census</span><small>COMMUNITY INSIGHTS</small></span>
          <button type="button" className="icon-btn sidebar-close" aria-label="Close navigation" onClick={(event) => { event.preventDefault(); setSidebarOpen(false); }}><X size={18} /></button>
        </Link>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="side-nav">
          {navigation.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} onClick={() => setSidebarOpen(false)} className={`nav-link ${location.pathname === to ? "active" : ""}`}>
              <Icon size={18} />{label}
            </Link>
          ))}
          {user?.role === "admin" && (
            <>
              <div className="nav-caption admin-caption">ADMINISTRATION</div>
              <Link to="/admin" onClick={() => setSidebarOpen(false)} className={`nav-link ${location.pathname === "/admin" ? "active" : ""}`}><ShieldCheck size={18} />Admin workspace</Link>
              <Link to="/reports" onClick={() => setSidebarOpen(false)} className={`nav-link ${location.pathname === "/reports" ? "active" : ""}`}><ClipboardList size={18} />Reports &amp; export</Link>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={16} /><span>Your household details stay private.</span></div>
          {user ? <div className="user-mini">
            <div className="avatar">{user.phone.slice(-2)}</div>
            <div className="user-mini-info"><b>{user.role === "admin" ? "Administrator" : "Citizen account"}</b><span>{user.phone}</span></div>
            <button className="icon-btn" onClick={doSignOut} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button>
          </div> : <Link className="button button-primary button-full" to="/login">Sign in to your account</Link>}
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="breadcrumbs"><span>Smart Census</span><span className="crumb-slash">/</span><b>{navigation.find((item) => item.to === location.pathname)?.label ?? (location.pathname.startsWith("/households") ? "Household details" : location.pathname.slice(1).replace("-", " ") || "Overview")}</b></div>
          <div className="topbar-actions">
            <span className="live-status"><i /> Live data</span>
            <button className="icon-btn theme-toggle" onClick={toggleTheme} title="Toggle color theme" aria-label="Toggle color theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <Link className="top-avatar" to={user ? "/settings" : "/login"} title={user ? "Profile settings" : "Sign in"}>{user?.phone.slice(-2) ?? "SC"}</Link>
          </div>
        </header>
        <main className="content"><Outlet /></main>
        <footer className="app-footer"><span>Smart Census is an independent community platform, not an official government census.</span><span>Privacy-first · Aggregated public statistics</span></footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage register />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/areas" element={<AreasPage />} />
        <Route element={<Guard><Outlet /></Guard>}>
          <Route path="/citizen" element={<CitizenPage />} />
          <Route path="/households/new" element={<HouseholdPage />} />
          <Route path="/households/:id" element={<HouseholdPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route element={<AdminGuard><Outlet /></AdminGuard>}>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/reports" element={<ReportsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function PublicLandingLink() {
  return <Link to="/dashboard" className="button button-outline"><Building2 size={16} /> View dashboard <ArrowRight size={16} /></Link>;
}

export function PublicActionLink() {
  return <Link to="/register" className="button button-primary"><Users size={16} /> Register your household</Link>;
}

export function ReportIcon() {
  return <Download size={17} />;
}
