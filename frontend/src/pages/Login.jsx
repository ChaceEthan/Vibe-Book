// @ts-nocheck
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { getApiErrorMessage } from "../services/api";

const Login = () => {
  const { isAuthenticated, login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const identifier = form.email.trim();
      await login({ ...form, email: identifier, identifier });
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Login failed. Please check your details."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="container-page flex min-h-[72vh] items-center justify-center py-10">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase text-brand">Welcome back</p>
          <h1 className="mt-2 text-3xl font-black text-navy">Login to VibeBook</h1>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="label">Email or phone</span>
            <input className="field" name="email" value={form.email} onChange={handleChange} autoComplete="username" required />
          </label>

          <label className="block space-y-2">
            <span className="label">Password</span>
            <input
              className="field"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </label>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          New to VibeBook?{" "}
          <Link to="/register" className="font-bold text-brand">
            Create an account
          </Link>
        </p>
      </div>
    </section>
  );
};

export default Login;
