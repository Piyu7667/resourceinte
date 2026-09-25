import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Activity, BarChart3, Boxes, ChevronRight, CircleHelp, Database, FileText, Gauge, LogIn, Menu, Plus, Settings2, ShieldCheck, Sparkles, X, Zap } from "lucide-react";
import { useState } from "react";

export type DashboardView = "overview" | "inventory" | "demands" | "analysis" | "whatif" | "report" | "adddata" | "settings" | "help";

const navItems: { id: DashboardView; label: string; icon: typeof Gauge; hint: string }[] = [
  { id: "overview", label: "Overview", icon: Gauge, hint: "Live command center" },
  { id: "inventory", label: "Resource inventory", icon: Boxes, hint: "Uploaded resources" },
  { id: "demands", label: "Demand intelligence", icon: Activity, hint: "Uploaded demands" },
  { id: "analysis", label: "Daily analysis", icon: Sparkles, hint: "Run intelligence" },
  { id: "whatif", label: "What-if simulator", icon: Zap, hint: "Test a decision" },
  { id: "report", label: "Daily report", icon: FileText, hint: "Executive briefing" },
  { id: "adddata", label: "Add your data", icon: Plus, hint: "Import a record" },
];

export default function DashboardLayout({ children, activeView, onNavigate, demoUser, onDemoLogout, onRequestLogout, resourceCount = 0, online = true }: { children: React.ReactNode; activeView: DashboardView; onNavigate: (view: DashboardView) => void; demoUser?: { name: string; email: string }; onDemoLogout?: () => void; onRequestLogout?: () => void; resourceCount?: number; online?: boolean }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayUser = user || demoUser;
  const initials = displayUser?.name?.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase() || "RS";
  const orgLabel = resourceCount > 0 ? "Your workspace" : "No data yet";
  const orgSub = resourceCount > 0 ? `${resourceCount} resource${resourceCount === 1 ? "" : "s"} loaded` : "Upload data to begin";

  const navigate = (view: DashboardView) => {
    onNavigate(view);
    setMobileOpen(false);
  };

  const sidebar = (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark"><Database size={18} strokeWidth={2.5} /></div>
        <div><div className="brand-name">RE<span>:</span>SOURCE</div><div className="brand-tag">INTELLIGENCE LAYER</div></div>
      </div>
      <div className="org-switcher">
        <div className="org-avatar">{resourceCount > 0 ? "W" : "?"}</div><div className="org-copy"><strong>{orgLabel}</strong><span>{orgSub}</span></div><ChevronRight size={15} className="muted-icon" />
      </div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="sidebar-nav">
        {navItems.map(item => { const Icon = item.icon; const active = activeView === item.id; return <button key={item.id} className={`nav-item ${active ? "active" : ""}`} onClick={() => navigate(item.id)}><Icon size={17} /><span>{item.label}</span>{active && <span className="nav-active-dot" />}</button>; })}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-note"><div className="note-icon"><ShieldCheck size={15} /></div><div><strong>Data protected</strong><span>Private workspace · RBAC ready</span></div></div>
      <div className="sidebar-footer-nav"><button className={`nav-item ${activeView === "settings" ? "active" : ""}`} onClick={() => navigate("settings")}><Settings2 size={17} /><span>Settings</span></button><button className={`nav-item ${activeView === "help" ? "active" : ""}`} onClick={() => navigate("help")}><CircleHelp size={17} /><span>Help center</span></button></div>
      <div className="user-card">
        <div className="user-avatar">{initials}</div><div className="user-copy"><strong>{displayUser?.name || "Demo operator"}</strong><span>{displayUser?.email || "—"}</span></div>
        {displayUser ? <button className="user-menu" aria-label="Sign out" title="Sign out" onClick={() => onRequestLogout ? onRequestLogout() : user ? logout() : onDemoLogout?.()}>⎋</button> : <button className="login-mini" onClick={() => startLogin()} title="Sign in"><LogIn size={15} /></button>}
      </div>
    </aside>
  );

  return <div className="app-frame"><div className="mobile-topbar"><button className="icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button><div className="mobile-brand"><div className="brand-mark small"><Database size={15} /></div><span>RE<span>:</span>SOURCE</span></div><div className="live-dot" /></div>{mobileOpen && <div className="mobile-overlay" onClick={() => setMobileOpen(false)}><div className="mobile-drawer" onClick={event => event.stopPropagation()}><button className="drawer-close" onClick={() => setMobileOpen(false)}><X size={18} /></button>{sidebar}</div></div>}<div className="desktop-sidebar">{sidebar}</div><main className="app-main"><header className="topbar"><div><div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>{navItems.find(item => item.id === activeView)?.label}</strong></div><div className="topbar-title">Decision center <span className="live-pill"><span /> LIVE DATA</span></div></div><div className="topbar-actions"><div className="connection"><span className={online ? "pulse-dot" : "pulse-dot offline"} /> {online ? "Intelligence engine online" : "Connecting…"}</div><button className="topbar-icon" onClick={() => navigate("report")} title="Open daily report" aria-label="Open daily report"><BarChart3 size={17} /></button><div className="topbar-avatar">{initials}</div></div></header>{children}</main></div>;
}
