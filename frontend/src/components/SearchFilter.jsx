// @ts-nocheck
import { useEffect, useState } from "react";

import { GENDER_OPTIONS, PROFILE_CATEGORIES } from "../constants/profile";
import { RWANDA_PROVINCES, getDistrictsForProvince } from "../constants/rwanda";

const defaultFilters = {
  gender: "",
  category: "",
  province: "",
  district: "",
};

const SearchFilter = ({ initialFilters = defaultFilters, onSearch }) => {
  const [filters, setFilters] = useState({ ...defaultFilters, ...initialFilters });

  useEffect(() => {
    setFilters({ ...defaultFilters, ...initialFilters });
  }, [initialFilters]);

  const updateField = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSearch(filters);
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
    onSearch(defaultFilters);
  };

  const districtOptions = getDistrictsForProvince(filters.province);

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
      <div className="grid gap-4 md:grid-cols-5">
        <label className="space-y-2">
          <span className="label">Gender</span>
          <select className="field" value={filters.gender} onChange={(event) => updateField("gender", event.target.value)}>
            <option value="">Any gender</option>
            {GENDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="label">Category</span>
          <select className="field" value={filters.category} onChange={(event) => updateField("category", event.target.value)}>
            <option value="">Any category</option>
            {PROFILE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="label">Province</span>
          <select
            className="field"
            value={filters.province}
            onChange={(event) => {
              updateField("province", event.target.value);
              updateField("district", "");
            }}
          >
            <option value="">Select province</option>
            {RWANDA_PROVINCES.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="label">District</span>
          <select
            className="field"
            value={filters.district}
            disabled={!filters.province}
            onChange={(event) => updateField("district", event.target.value)}
          >
            <option value="">Any district</option>
            {districtOptions.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary flex-1">
            Search
          </button>
          <button type="button" className="btn-secondary px-4" onClick={clearFilters}>
            Clear
          </button>
        </div>
      </div>
    </form>
  );
};

export default SearchFilter;
