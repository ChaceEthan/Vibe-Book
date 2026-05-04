// @ts-nocheck
import { useEffect, useState } from "react";

import { messageApi } from "../services/api";

const Drafts = () => {
  const [drafts, setDrafts] = useState([]);
  const [form, setForm] = useState({ recipientId: "", subject: "", message: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadDrafts = async () => {
    setLoading(true);
    setError("");

    try {
      const { data } = await messageApi.getDrafts();
      setDrafts(Array.isArray(data?.drafts) ? data.drafts : []);
    } catch (requestError) {
      setDrafts([]);
      setError(requestError.response?.data?.message || "Unable to load drafts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrafts();
  }, []);

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    setError("");

    try {
      await messageApi.saveDraft({
        recipientId: form.recipientId.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setForm({ recipientId: "", subject: "", message: "" });
      setStatus("Draft saved.");
      await loadDrafts();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to save draft.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="container-page py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase text-brand">Drafts</p>
        <h1 className="mt-2 text-3xl font-black text-navy">Saved Messages</h1>
      </div>

      {status && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          {loading ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-200" />
          ) : drafts.length ? (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div key={draft._id} className="field">
                  <p className="font-bold text-navy">{draft.subject || "Untitled draft"}</p>
                  <p className="mt-1 text-xs text-slate-500">To {draft.recipient?.name || draft.recipient?._id || "recipient"}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{draft.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-4 text-sm text-slate-600">No drafts yet.</p>
          )}
        </div>

        <form className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <label className="space-y-2">
              <span className="label">Recipient user ID</span>
              <input className="field" name="recipientId" value={form.recipientId} onChange={handleChange} required />
            </label>
            <label className="space-y-2">
              <span className="label">Subject</span>
              <input className="field" name="subject" value={form.subject} onChange={handleChange} />
            </label>
            <label className="space-y-2">
              <span className="label">Message</span>
              <textarea className="field min-h-32 resize-y" name="message" value={form.message} onChange={handleChange} required />
            </label>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save draft"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default Drafts;
