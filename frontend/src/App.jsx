// @ts-nocheck
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Suspense, lazy } from "react";

import Footer from "./components/Footer.jsx";
import Navbar from "./components/Navbar.jsx";
import WalletErrorBoundary from "./components/WalletErrorBoundary.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Bookings from "./pages/Bookings.jsx";
import Chat from "./pages/Chat.jsx";
import Admin from "./pages/Admin.jsx";
import Drafts from "./pages/Drafts.jsx";
import Explore from "./pages/Explore.jsx";
import Home from "./pages/Home.jsx";
import Inbox from "./pages/Inbox.jsx";
import LegalPage from "./pages/LegalPage.jsx";
import Login from "./pages/Login.jsx";
import NotificationCenter from "./pages/NotificationCenter.jsx";
import Profile from "./pages/Profile.jsx";
import Register from "./pages/Register.jsx";
import Search from "./pages/Search.jsx";
import Settings from "./pages/Settings.jsx";

const CreatorDashboard = lazy(() => import("./components/CreatorDashboard.jsx"));
const Wallet = lazy(() => import("./pages/Wallet.jsx"));

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="container-page flex min-h-[60vh] items-center justify-center">
        <p className="text-sm font-medium text-slate-500">Loading your workspace...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};

const App = () => {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Navbar />
      <main className={`flex-1 ${isHome ? "bg-slate-950 pb-0" : "pb-28"}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/search" element={<Search />} />
          <Route
            path="/profile/:id"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/privacy-policy" element={<LegalPage page="privacy-policy" />} />
          <Route path="/terms" element={<LegalPage page="terms" />} />
          <Route path="/terms-of-service" element={<LegalPage page="terms" />} />
          <Route path="/community-guidelines" element={<LegalPage page="community-guidelines" />} />
          <Route path="/about" element={<LegalPage page="about" />} />
          <Route path="/contact" element={<LegalPage page="contact" />} />
          <Route path="/creator-monetization-policy" element={<LegalPage page="creator-monetization-policy" />} />
          <Route path="/cookie-policy" element={<LegalPage page="cookie-policy" />} />
          <Route path="/copyright-policy" element={<LegalPage page="copyright-policy" />} />
          <Route
            path="/wallet/*"
            element={
              <ProtectedRoute>
                <Suspense
                  fallback={
                    <div className="container-page flex min-h-[60vh] items-center justify-center">
                      <p className="text-sm font-medium text-slate-500">Loading NEX Wallet...</p>
                    </div>
                  }
                >
                  <WalletErrorBoundary title="NEX Wallet unavailable">
                    <Wallet />
                  </WalletErrorBoundary>
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <NotificationCenter />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inbox"
            element={
              <ProtectedRoute>
                <Inbox />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat/:userId"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/creator-studio"
            element={
              <ProtectedRoute>
                <Suspense
                  fallback={
                    <div className="container-page flex min-h-[60vh] items-center justify-center">
                      <p className="text-sm font-medium text-slate-500">Loading Creator Studio...</p>
                    </div>
                  }
                >
                  <CreatorDashboard />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings"
            element={
              <ProtectedRoute>
                <Bookings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/booking"
            element={
              <ProtectedRoute>
                <Bookings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings-privacy"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/drafts"
            element={
              <ProtectedRoute>
                <Drafts />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!isHome && <Footer />}
    </div>
  );
};

export default App;
