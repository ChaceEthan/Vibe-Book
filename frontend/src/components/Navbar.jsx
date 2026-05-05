// @ts-nocheck
import {
  Compass,
  Home,
  LogIn,
  LogOut,
  MessageCircle,
  Plus,
  User,
} from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import Upload from "./Upload.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { messageApi } from "../services/api";

const navClass = ({ isActive }) =>
  `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold transition ${
    isActive ? "text-brand" : "text-slate-500"
  }`;

const Navbar = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { isAuthenticated, logout } = useAuth();
  const { language, languages, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const navItems = useMemo(
    () => [
      { to: "/", label: "Home", icon: Home },
      { to: "/search", label: "Explore", icon: Compass },
      { to: isAuthenticated ? "/inbox" : "/login", label: "Chat", icon: MessageCircle, badge: unreadCount },
      { to: isAuthenticated ? "/dashboard" : "/login", label: "Profile", icon: User },
    ],
    [isAuthenticated, unreadCount]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return undefined;
    }

    let active = true;
    const loadUnreadCount = async () => {
      try {
        const { data } = await messageApi.getUnreadCount();
        if (active) {
          setUnreadCount(Number(data?.unreadCount || 0));
        }
      } catch {
        if (active) {
          setUnreadCount(0);
        }
      }
    };

    loadUnreadCount();
    const timer = setInterval(loadUnreadCount, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isAuthenticated]);

  const openUpload = () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    setUploadOpen(true);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <nav className="container-page flex min-h-16 items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <img src="/logo.png" alt="VibeBook logo" className="h-10 w-10 rounded-lg object-cover" />
            <span className="truncate text-lg font-black text-navy">VibeBook</span>
          </Link>

          <div className="flex items-center gap-2">
            <select
              className="hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 sm:block"
              aria-label="Language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            {isAuthenticated ? (
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={handleLogout} aria-label="Logout">
                <LogOut className="h-5 w-5" />
              </button>
            ) : (
              <Link to="/login" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Login">
                <LogIn className="h-5 w-5" />
              </Link>
            )}
          </div>
        </nav>
      </header>

      <Upload open={uploadOpen} onClose={() => setUploadOpen(false)} />

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end gap-1">
          {navItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.label} to={item.to} className={navClass}>
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          <button
            type="button"
            className="-mt-8 flex flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold text-navy"
            onClick={openUpload}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-navy shadow-lg ring-4 ring-white">
              <Plus className="h-8 w-8" />
            </span>
            <span>Upload</span>
          </button>

          {navItems.slice(2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.label} to={item.to} className={navClass}>
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {item.badge ? (
                    <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default Navbar;
