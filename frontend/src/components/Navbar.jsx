// @ts-nocheck
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";

const navLinkClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-semibold transition ${
    isActive ? "bg-brand/10 text-brand" : "text-slate-600 hover:bg-slate-100 hover:text-navy"
  }`;

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated, logout } = useAuth();
  const { language, languages, setLanguage, t } = useLanguage();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    setIsOpen(false);
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <nav className="container-page flex min-h-16 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3" onClick={() => setIsOpen(false)}>
          <img src="/logo.png" alt="VibeBook logo" className="h-10 w-10 rounded-lg object-cover" />
          <span className="text-lg font-black text-navy">VibeBook</span>
        </Link>

        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 md:hidden"
          onClick={() => setIsOpen((value) => !value)}
        >
          Menu
        </button>

        <div
          className={`absolute left-0 right-0 top-16 border-b border-slate-200 bg-white px-4 py-4 shadow-soft md:static md:block md:border-0 md:bg-transparent md:p-0 md:shadow-none ${
            isOpen ? "block" : "hidden"
          }`}
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <NavLink to="/" className={navLinkClass} onClick={() => setIsOpen(false)}>
              {t("home")}
            </NavLink>
            <NavLink to="/search" className={navLinkClass} onClick={() => setIsOpen(false)}>
              Search
            </NavLink>
            <NavLink to="/dashboard" className={navLinkClass} onClick={() => setIsOpen(false)}>
              {t("dashboard")}
            </NavLink>
            {isAuthenticated && (
              <>
                <NavLink to="/inbox" className={navLinkClass} onClick={() => setIsOpen(false)}>
                  Inbox
                </NavLink>
                <NavLink to="/drafts" className={navLinkClass} onClick={() => setIsOpen(false)}>
                  Drafts
                </NavLink>
              </>
            )}

            <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3 md:ml-4 md:mt-0 md:flex-row md:border-0 md:pt-0">
              <select
                className="field py-2"
                aria-label={t("language")}
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
                <button type="button" className="btn-secondary py-2" onClick={handleLogout}>
                  Logout
                </button>
              ) : (
                <>
                  <Link to="/login" className="btn-secondary py-2" onClick={() => setIsOpen(false)}>
                    Login
                  </Link>
                  <Link to="/register" className="btn-primary py-2" onClick={() => setIsOpen(false)}>
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
