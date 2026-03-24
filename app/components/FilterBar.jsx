"use client";
import { useState, useEffect } from "react";
import { classNames, BTN_BASE, BTN_SIZES, BTN_VARIANTS } from "../lib/designTokens";

/**
 * FilterBar
 * 
 * Includes a debounced search input to prevent focus loss during high-frequency 
 * re-renders of the parent Linker component.
 */
export default function FilterBar({
  FILTERS,
  filters,
  setFilters,
  setIdx,
  count,
  searchTerm,
  setSearchTerm,
  planteles,
  plantelFilter,
  setPlantelFilter,
}) {
  // Local state for the input value to keep the UI responsive and maintain focus
  const [localSearch, setLocalSearch] = useState(searchTerm);

  // Sync local state if parent prop changes externally (e.g. clear button)
  useEffect(() => {
    setLocalSearch(searchTerm);
  }, [searchTerm]);

  // Debounce the update back to the parent
  useEffect(() => {
    const handler = setTimeout(() => {
      // Only call parent if value is different to avoid loops
      if (localSearch !== searchTerm) {
        setSearchTerm(localSearch);
      }
    }, 300); // 300ms delay

    return () => clearTimeout(handler);
  }, [localSearch, searchTerm, setSearchTerm]);

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-2 px-3">
      {/* Missing-category filters + count */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={classNames(
              BTN_BASE,
              BTN_SIZES.xs,
              filters === f.id ? BTN_VARIANTS.primary : BTN_VARIANTS.secondary
            )}
            type="button"
            onClick={() => {
              setFilters(f.id);
              setIdx(0);
            }}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-1 text-[13px] text-slate-500">
          {count} usuario(s)
        </span>
      </div>

      {/* Search + plantel filters */}
      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
        <input
          type="search"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Buscar por nombre, email, CURP…"
          className="flex-1 md:flex-none md:min-w-[14rem] rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
        />
        <select
          value={plantelFilter}
          onChange={(e) => setPlantelFilter(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
        >
          <option value="">Todos los planteles</option>
          {(planteles || []).map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}