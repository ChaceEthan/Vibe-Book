// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import ProfileCard from "../components/ProfileCard.jsx";
import SearchFilter from "../components/SearchFilter.jsx";
import { userApi } from "../services/api";

const getErrorMessage = (error) => {
  return error.response?.data?.message || "Unable to load profiles. Please try again.";
};

const Search = () => {
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeProvince, setActiveProvince] = useState("");

  const initialFilters = useMemo(
    () => ({
      gender: searchParams.get("gender") || "",
      category: searchParams.get("category") || "",
      province: searchParams.get("province") || "",
      district: searchParams.get("district") || "",
    }),
    [searchParams]
  );

  const fetchUsers = useCallback(async (filters = initialFilters) => {
    setLoading(true);
    setError("");

    setActiveProvince(filters.province);

    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== undefined && value !== "")
      );
      const { data } = await userApi.search(params);
      const nextUsers = Array.isArray(data?.users) ? data.users : [];
      setUsers(nextUsers);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [initialFilters]);

  useEffect(() => {
    fetchUsers(initialFilters);
  }, [fetchUsers, initialFilters]);

  return (
    <section className="container-page py-10">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-brand">Search</p>
          <h1 className="mt-2 text-3xl font-black text-navy">Find talent for your next event</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Browse performers and crews by province, district, category, and gender.
          </p>
        </div>
        <p className="text-sm font-semibold text-slate-500">{users.length} profiles found</p>
      </div>

      <SearchFilter initialFilters={initialFilters} onSearch={fetchUsers} />

      {error && <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="grid gap-5 py-8 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-80 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <ProfileCard key={user._id} user={user} />
          ))}
        </div>
      )}

      {!loading && !users.length && !error && (
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-8 text-center shadow-soft">
          <h2 className="text-lg font-bold text-navy">No profiles found</h2>
          <p className="mt-2 text-sm text-slate-600">Try a broader category, district, or province.</p>
        </div>
      )}
    </section>
  );
};

export default Search;
