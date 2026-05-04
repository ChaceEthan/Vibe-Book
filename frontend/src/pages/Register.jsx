import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import {
  CATEGORY_BY_ROLE,
  GENDER_OPTIONS,
  PROFILE_CATEGORIES,
  TALENT_ROLES,
  TALENT_TYPES,
} from "../constants/profile";
import { useAuth } from "../context/AuthContext.jsx";

const initialForm = {
  name: "",
  email: "",
  password: "",
  role: "dancer",
  type: "single",
  gender: "",
  category: "Modern Dance",
  price: "",
  phone: "",
  whatsappNumber: "",
  location: "",
  acceptedTerms: false,
};

const Register = () => {
  const { isAuthenticated, register } = useAuth();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setForm((current) => {
      if (name === "role") {
        const nextCategory = CATEGORY_BY_ROLE[value] || current.category;
        return {
          ...current,
          role: value,
          type: value === "crew" ? "crew" : current.type,
          category: nextCategory,
        };
      }

      return { ...current, [name]: type === "checkbox" ? checked : value };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await register({
        ...form,
        referralCode: searchParams.get("ref") || "",
        price: form.price ? Number(form.price) : 0,
      });
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Registration failed. Please review your details.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="container-page py-10">
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase text-brand">Create profile</p>
          <h1 className="mt-2 text-3xl font-black text-navy">Join VibeBook</h1>
          <p className="mt-2 text-sm text-slate-600">Set up a profile so clients can discover and contact you.</p>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="space-y-2 md:col-span-2">
            <span className="label">Name</span>
            <input className="field" name="name" value={form.name} onChange={handleChange} required />
          </label>

          <label className="space-y-2">
            <span className="label">Email</span>
            <input className="field" type="email" name="email" value={form.email} onChange={handleChange} required />
          </label>

          <label className="space-y-2">
            <span className="label">Password</span>
            <input
              className="field"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              minLength={6}
              required
            />
          </label>

          <label className="space-y-2">
            <span className="label">Role</span>
            <select className="field" name="role" value={form.role} onChange={handleChange}>
              {TALENT_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="label">Type</span>
            <select className="field" name="type" value={form.type} onChange={handleChange}>
              {TALENT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="label">Gender</span>
            <select className="field" name="gender" value={form.gender} onChange={handleChange}>
              <option value="">Select gender</option>
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="label">Category</span>
            <select className="field" name="category" value={form.category} onChange={handleChange}>
              {PROFILE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="label">Price</span>
            <input className="field" type="number" min="0" name="price" value={form.price} onChange={handleChange} />
          </label>

          <label className="space-y-2">
            <span className="label">Phone</span>
            <input className="field" name="phone" value={form.phone} onChange={handleChange} />
          </label>

          <label className="space-y-2">
            <span className="label">WhatsApp</span>
            <input className="field" name="whatsappNumber" value={form.whatsappNumber} onChange={handleChange} />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="label">Location</span>
            <input className="field" name="location" value={form.location} onChange={handleChange} />
          </label>

          <label className="flex items-start gap-3 rounded-lg bg-surface p-4 md:col-span-2">
            <input
              className="mt-1 h-4 w-4 accent-brand"
              type="checkbox"
              name="acceptedTerms"
              checked={form.acceptedTerms}
              onChange={handleChange}
              required
            />
            <span className="text-sm text-slate-600">I confirm that my profile information is accurate.</span>
          </label>

          <div className="md:col-span-2">
            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? "Creating account..." : "Register"}
            </button>
          </div>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="font-bold text-brand">
            Login
          </Link>
        </p>
      </div>
    </section>
  );
};

export default Register;
