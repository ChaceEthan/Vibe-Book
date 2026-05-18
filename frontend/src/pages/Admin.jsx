// @ts-nocheck
import { ShieldCheck, Star, Trash2, UserX } from "lucide-react";
import { useEffect, useState } from "react";

import SafeAvatar from "../components/SafeAvatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { adminApi } from "../services/api";

const Admin = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadAdmin = async () => {
    setLoading(true);
    setError("");

    try {
      const [statsResponse, usersResponse] = await Promise.all([adminApi.stats(), adminApi.users()]);
      setStats(statsResponse.data || {});
      setUsers(Array.isArray(usersResponse.data?.users) ? usersResponse.data.users : []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmin();
  }, []);

  const runAction = async (action, successMessage) => {
    setStatus("");
    setError("");

    try {
      await action();
      setStatus(successMessage);
      await loadAdmin();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Admin action failed.");
    }
  };

  if (user?.role !== "admin" && user?.accountRole !== "admin") {
    return (
      <section className="container-page py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">Admin access required.</div>
      </section>
    );
  }

  return (
    <section className="container-page py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase text-brand">Admin</p>
        <h1 className="mt-2 text-3xl font-black text-navy">Control Center</h1>
      </div>

      {status && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Total users", stats?.totalUsers || 0],
          ["Total posts", stats?.totalPosts || stats?.totalUploads || 0],
          ["Total requests", stats?.totalBookings || 0],
          ["Engagement", `${stats?.engagementRate || 0}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <p className="truncate text-xs font-semibold uppercase text-slate-500">{label}</p>
            <p className="mt-2 truncate text-2xl font-black text-navy">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-lg font-black text-navy">Users</h2>
        </div>
        {loading ? (
          <div className="m-4 h-40 animate-pulse rounded-lg bg-slate-200" />
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map((item) => (
              <article key={item._id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <SafeAvatar user={item} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="truncate font-black text-navy">{item.name}</h3>
                      {item.isVerified && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black uppercase text-sky-700">Verified</span>}
                    </div>
                    <p className="truncate text-xs text-slate-500">{item.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button
                    type="button"
                    className="btn-secondary gap-2"
                    onClick={() => runAction(() => adminApi.verifyUser(item._id), "Creator verified.")}
                    disabled={Boolean(item.isVerified)}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {item.isVerified ? "Verified" : "Verify"}
                  </button>
                  <button type="button" className="btn-secondary gap-2" onClick={() => runAction(() => adminApi.featureProfile(item._id, true), "Profile featured.")}>
                    <Star className="h-4 w-4" />
                    Feature
                  </button>
                  <button
                    type="button"
                    className="btn-secondary gap-2"
                    onClick={() => runAction(() => (item.isBlocked ? adminApi.unblockUser(item._id) : adminApi.blockUser(item._id)), item.isBlocked ? "User unblocked." : "User blocked.")}
                  >
                    {item.isBlocked ? <ShieldCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                    {item.isBlocked ? "Unblock" : "Block"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary gap-2 text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => runAction(() => adminApi.deleteUser(item._id), "User deleted.")}
                    disabled={Boolean(item.protected || item.role === "admin" || item.accountRole === "admin")}
                    title={item.protected || item.role === "admin" || item.accountRole === "admin" ? "Protected admin users cannot be deleted" : "Delete user"}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default Admin;
