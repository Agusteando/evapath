"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import LoaderOverlay from "./LoaderOverlay";
import StatusBadge from "./StatusBadge";
import SuggestionList from "./SuggestionList";
import NamesEditBlock from "./NamesEditBlock";
import NavBar from "./NavBar";
import FilterBar from "./FilterBar";
import UserStatsBar from "./UserStatsBar";
import useGptBulk from "../hooks/useGptBulk";
import { classNames, BTN_BASE, BTN_SIZES, BTN_VARIANTS } from "../lib/designTokens";
import { filterLinkerUsers, EMPTY_NAMES } from "../lib/userUtils";

// Simple debounce helper for internal Linker use (suggestions)
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

export default function Linker({ asociar, idx, setIdx, setLinkMode, setAsociar }) {
  const [filters, setFilters] = useState("missing");
  const [searchTerm, setSearchTerm] = useState("");
  const [plantelFilter, setPlantelFilter] = useState("");

  // Suggestion lists state
  const [evaList, setEvaList] = useState([]);
  const [pathList, setPathList] = useState([]);
  
  // Suggestion Search inputs (Sidebar)
  const [lkEvaSearch, setLkEvaSearch] = useState("");
  const [lkPathSearch, setLkPathSearch] = useState("");

  const [_names, _setNames] = useState(EMPTY_NAMES);
  const [nameFieldState, setNameFieldState] = useState({
    nombres: "idle",
    apellidoPaterno: "idle",
    apellidoMaterno: "idle",
  });
  const [nameFieldErr, setNameFieldErr] = useState({
    nombres: "",
    apellidoPaterno: "",
    apellidoMaterno: "",
  });

  const [evaSavingId, setEvaSavingId] = useState(null);
  const [evaSaveError, setEvaSaveError] = useState("");
  const [pathSavingId, setPathSavingId] = useState(null);
  const [pathSaveError, setPathSaveError] = useState("");

  const {
    gptExtracting,
    gptBulk,
    gptBulkStopped,
    gptBulkProgress,
    gptErr,
    handleGptExtractManual,
    canExtractCurpGpt,
    handleBulkTrigger,
    handleGptBulkStop,
    allExtractable,
  } = useGptBulk({
    asociar,
    filters,
    searchTerm,
    plantelFilter,
    idx,
    setIdx,
    _names,
    setNames: _setNames,
    setAsociar,
    nameFieldState,
    setNameFieldState,
    nameFieldErr,
    setNameFieldErr,
  });

  const _filtered = useMemo(
    () =>
      filterLinkerUsers(asociar, {
        categoryFilter: filters,
        searchTerm,
        plantelId: plantelFilter,
      }),
    [asociar, filters, searchTerm, plantelFilter]
  );

  const maxIdx = Math.max(0, _filtered.length - 1);
  const currIdx = Math.max(0, Math.min(idx, maxIdx));
  const u = _filtered[currIdx] || {};

  const names = _names;
  const setNames = _setNames;

  const plantelOptions = useMemo(() => {
    const map = new Map();
    (asociar || []).forEach((user) => {
      if (!user.plantelId) return;
      const id = String(user.plantelId);
      if (!map.has(id)) {
        map.set(id, user.plantelLabel || user.plantelName || id);
      }
    });
    return Array.from(map, ([id, label]) => ({ id, label }));
  }, [asociar]);

  useEffect(() => {
    const handleKeyDown = async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowRight") {
        e.preventDefault();
        if (currIdx < _filtered.length - 1) {
          await saveAllPendingChanges();
          setIdx(currIdx + 1);
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowLeft") {
        e.preventDefault();
        if (currIdx > 0) {
          await saveAllPendingChanges();
          setIdx(currIdx - 1);
        }
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "g" || e.key === "G") &&
        canExtractCurpGpt
      ) {
        e.preventDefault();
        handleGptExtractManual();
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (document.activeElement?.tagName === "INPUT") {
          document.activeElement.blur();
        } else {
          await saveAllPendingChanges();
          setLinkMode();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currIdx, _filtered.length, setIdx, setLinkMode, canExtractCurpGpt, handleGptExtractManual, names, u]);

  // Debounced fetch functions for sidebars
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchEvaSuggestions = useCallback(
    debounce((term, exclude) => {
      fetch("/api/search-eva?q=" + encodeURIComponent(term) + (exclude ? "&exclude=" + encodeURIComponent(exclude) : ""))
        .then((r) => r.ok ? r.json() : [])
        .then((list) => setEvaList(Array.isArray(list) ? list : []))
        .catch(() => setEvaList([]));
    }, 300), 
    []
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchPathSuggestions = useCallback(
    debounce((term, exclude) => {
      fetch("/api/search-path?q=" + encodeURIComponent(term) + (exclude ? "&exclude=" + encodeURIComponent(exclude) : ""))
        .then((r) => r.ok ? r.json() : [])
        .then((list) =>
          setPathList(
            Array.isArray(list) ? list.map((l) => ({
              ...l,
              name: l.name || l.N || (typeof l.label === "string" ? l.label.replace(/<.+>/, "").trim() : ""),
            })) : []
          )
        )
        .catch(() => setPathList([]));
    }, 300),
    []
  );

  // Trigger sidebar search when inputs change
  useEffect(() => {
    if (!u.id) return;
    const excludeEva = asociar.filter((z) => z.evaId && z.id !== u.id).map((z) => String(z.evaId)).join(",");
    fetchEvaSuggestions(lkEvaSearch, excludeEva);
  }, [lkEvaSearch, u.id, asociar, fetchEvaSuggestions]);

  useEffect(() => {
    if (!u.id) return;
    const excludePath = asociar.filter((z) => z.pathId && z.id !== u.id).map((z) => String(z.pathId)).join(",");
    fetchPathSuggestions(lkPathSearch, excludePath);
  }, [lkPathSearch, u.id, asociar, fetchPathSuggestions]);


  useEffect(() => {
    if (currIdx > maxIdx && maxIdx >= 0) setIdx(0);
  }, [filters, searchTerm, plantelFilter, maxIdx, currIdx, setIdx]);

  // --- FOCUS LOGIC FIX ---
  // When user changes (u.id), we reset local names and usually want to focus "nombres".
  // BUT if the user triggered this change via the Search Input (FilterBar), we MUST NOT steal focus.
  useEffect(() => {
    setNames({
      nombres: u.nombres ?? "",
      apellidoPaterno: u.apellidoPaterno ?? "",
      apellidoMaterno: u.apellidoMaterno ?? "",
    });
    setNameFieldState({ nombres: "idle", apellidoPaterno: "idle", apellidoMaterno: "idle" });
    setNameFieldErr({ nombres: "", apellidoPaterno: "", apellidoMaterno: "" });
    setLkEvaSearch("");
    setLkPathSearch("");
    setEvaSaveError("");
    setPathSaveError("");
    setEvaSavingId(null);
    setPathSavingId(null);
    setEvaList([]); 
    setPathList([]);

    setTimeout(() => {
      // Check what is currently focused
      const active = document.activeElement;
      
      // If the user is typing in a search box (type="search"), DO NOT steal focus.
      const isSearchInput = active && (active.type === 'search' || active.getAttribute('type') === 'search');
      if (isSearchInput) return;

      const nombresInput = document.getElementById("nombres");
      if (nombresInput) {
        nombresInput.focus();
        nombresInput.select();
      }
    }, 100);
  }, [u.id, setNames]);

  async function handleAssociateEva(cid) {
    if (!u.id) return;
    setEvaSavingId(cid);
    setEvaSaveError("");
    try {
      const resp = await fetch("/api/associate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signiaId: u.id, source: "eva", cid }),
      });
      if (!resp.ok) {
        let errText = "Error al asociar EVA";
        try { errText = (await resp.json()).error || errText; } catch {}
        setEvaSaveError(errText);
        setEvaSavingId(null);
        return;
      }
      setAsociar((prev) =>
        prev.map((user) =>
          user.id === u.id ? { ...user, evaId: +cid, hasEva: true } : user
        )
      );
    } catch (err) {
      setEvaSaveError("Red o servidor");
    } finally {
      setEvaSavingId(null);
    }
  }

  async function handleAssociatePath(cid) {
    if (!u.id) return;
    setPathSavingId(cid);
    setPathSaveError("");
    try {
      const resp = await fetch("/api/associate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signiaId: u.id, source: "path", cid }),
      });
      if (!resp.ok) {
        let errText = "Error al asociar PATH";
        try { errText = (await resp.json()).error || errText; } catch {}
        setPathSaveError(errText);
        setPathSavingId(null);
        return;
      }
      setAsociar((prev) =>
        prev.map((user) =>
          user.id === u.id
            ? {
                ...user,
                pathId: +cid,
                hasPath: true,
                hasEco: false,
                hasMmpi: false,
                ecoPrueba: null,
                mmpiPrueba: null,
              }
            : user
        )
      );
    } catch (err) {
      setPathSaveError("Red o servidor");
    } finally {
      setPathSavingId(null);
    }
  }

  async function handleFieldBlur(field, newValue) {
    if (!u.id) return;
    if ((u[field] ?? "") === newValue) return;

    setNameFieldState((st) => ({ ...st, [field]: "saving" }));
    setNameFieldErr((err) => ({ ...err, [field]: "" }));
    try {
      const fullPatch = {
        nombres: field === "nombres" ? newValue : names.nombres,
        apellidoPaterno: field === "apellidoPaterno" ? newValue : names.apellidoPaterno,
        apellidoMaterno: field === "apellidoMaterno" ? newValue : names.apellidoMaterno,
      };
      const resp = await fetch(`/api/signia-names/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullPatch),
      });
      if (!resp.ok) {
        setNameFieldState((st) => ({ ...st, [field]: "error" }));
        let msg = "";
        try { msg = (await resp.json()).error || "Error"; } catch {}
        setNameFieldErr((err) => ({ ...err, [field]: msg }));
        return;
      }
      setAsociar((prev) =>
        prev.map((user) => (user.id === u.id ? { ...user, ...fullPatch } : user))
      );
      setNameFieldState((st) => ({ ...st, [field]: "saved" }));
      setTimeout(() => setNameFieldState((st) => ({ ...st, [field]: "idle" })), 1000);
    } catch (e) {
      setNameFieldState((st) => ({ ...st, [field]: "error" }));
      setNameFieldErr((err) => ({ ...err, [field]: "Red o servidor" }));
    }
  }

  async function saveAllPendingChanges() {
    if (!u.id) return;
    const changes = {};
    let hasChanges = false;
    if (names.nombres !== (u.nombres ?? "")) { changes.nombres = names.nombres; hasChanges = true; }
    if (names.apellidoPaterno !== (u.apellidoPaterno ?? "")) { changes.apellidoPaterno = names.apellidoPaterno; hasChanges = true; }
    if (names.apellidoMaterno !== (u.apellidoMaterno ?? "")) { changes.apellidoMaterno = names.apellidoMaterno; hasChanges = true; }

    if (!hasChanges) return;
    const savingState = {};
    Object.keys(changes).forEach((field) => { savingState[field] = "saving"; });
    setNameFieldState((st) => ({ ...st, ...savingState }));

    try {
      const fullPatch = {
        nombres: names.nombres,
        apellidoPaterno: names.apellidoPaterno,
        apellidoMaterno: names.apellidoMaterno,
      };
      const resp = await fetch(`/api/signia-names/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullPatch),
      });
      if (!resp.ok) throw new Error("Failed to save");
      setAsociar((prev) => prev.map((user) => (user.id === u.id ? { ...user, ...fullPatch } : user)));
    } catch (e) {
      console.error("Error saving pending changes:", e);
    }
  }

  function fillFromCurp() {
    if (!u.curpExtract) return;
    setNames((n) => ({
      nombres: n.nombres || u.curpExtract.nombres || "",
      apellidoPaterno: n.apellidoPaterno || u.curpExtract.apellidoPaterno || "",
      apellidoMaterno: n.apellidoMaterno || u.curpExtract.apellidoMaterno || "",
    }));
  }

  return (
    <div className="w-full max-w-7xl mx-auto mt-2 pb-10 relative">
      <LoaderOverlay show={gptExtracting || gptBulk} text={gptBulk ? `Procesando CURP ${gptBulkProgress.done + 1} de ${gptBulkProgress.total}` : "Procesando CURP…"} />

      {/* Navigation & Controls */}
      <NavBar
        currIdx={currIdx}
        total={_filtered.length}
        setIdx={async (newIdx) => { await saveAllPendingChanges(); setIdx(newIdx); }}
        setLinkMode={async () => { await saveAllPendingChanges(); setLinkMode(); }}
        gptExtracting={gptExtracting}
        gptBulk={gptBulk}
        gptBulkStopped={gptBulkStopped}
        canExtractCurpGpt={canExtractCurpGpt}
        handleGptExtractManual={handleGptExtractManual}
        handleBulkTrigger={handleBulkTrigger}
        handleGptBulkStop={handleGptBulkStop}
        gptBulkProgress={gptBulkProgress}
        allExtractable={allExtractable}
      />

      {/* The main filter bar with the search input */}
      <FilterBar
        FILTERS={[
          { id: "missing", label: "Cualquiera faltante" },
          { id: "nombres", label: "Sólo nombres" },
          { id: "eva", label: "Sólo EVA" },
          { id: "eco", label: "Sólo ECO/MMPI" },
          { id: "all", label: "Todos" },
        ]}
        filters={filters}
        setFilters={setFilters}
        setIdx={setIdx}
        count={_filtered.length}
        searchTerm={searchTerm}
        setSearchTerm={(val) => { setSearchTerm(val); setIdx(0); }}
        planteles={plantelOptions}
        plantelFilter={plantelFilter}
        setPlantelFilter={(val) => { setPlantelFilter(val); setIdx(0); }}
      />

      {gptErr && (
        <div className="text-center mb-3 px-4 py-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 font-semibold text-sm">
          ⚠️ {gptErr}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* EVA Column */}
        <div className="lg:col-span-3 space-y-3">
          <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl border-2 border-indigo-100 p-4 shadow-md">
            <h3 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
              Buscar en EVA
            </h3>
            <input
              className="block w-full mb-3 rounded-lg border border-indigo-200 bg-white placeholder:text-gray-400 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition"
              placeholder="Nombre o email..."
              value={lkEvaSearch}
              onChange={(e) => setLkEvaSearch(e.target.value)}
              disabled={gptBulk}
            />
            <SuggestionList title="Resultados" list={evaList} onAssociate={handleAssociateEva} disabled={gptBulk} loadingForId={evaSavingId} />
            {!!u.hasEva && (
              <div className="mt-3 pt-3 border-t border-indigo-200">
                <StatusBadge status="ok" label={`EVA #${u.evaId}`} className="mb-2" />
                <button
                  className="text-rose-600 hover:text-rose-700 font-bold text-xs underline"
                  onClick={() => setAsociar((a) => a.map((user) => user.id === u.id ? { ...user, evaId: null, hasEva: false } : user))}
                  disabled={gptBulk}
                  type="button"
                >
                  Desasociar EVA
                </button>
              </div>
            )}
            {evaSaveError && <div className="mt-2 text-rose-600 font-semibold text-xs bg-rose-50 rounded px-2 py-1">{evaSaveError}</div>}
          </div>
        </div>

        {/* Center: User Details */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-gradient-to-br from-white via-indigo-50/30 to-purple-50/30 rounded-2xl border-2 border-indigo-200 shadow-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-indigo-900 mb-1">{u.name || <span className="text-slate-400">Sin nombre</span>}</h2>
                <p className="text-sm text-slate-600 font-mono">{u.email || <span className="text-slate-400">Sin email</span>}</p>
                {u.plantelLabel && <p className="mt-1 text-xs font-semibold text-indigo-600">Plantel: {u.plantelLabel}</p>}
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-indigo-600">{currIdx + 1}</div>
                <div className="text-xs text-slate-500">de {_filtered.length}</div>
              </div>
            </div>
            <div className="rounded-xl overflow-hidden border-2 border-slate-200 bg-white shadow-inner mb-4">
              <CurpPreview curpAbsPath={u.curpAbsPath} />
            </div>
            <NamesEditBlock
              names={names}
              onChange={(field, value) => setNames((n) => ({ ...n, [field]: value }))}
              onBlur={handleFieldBlur}
              fieldState={nameFieldState}
              fieldErr={nameFieldErr}
              curpExtract={u.curpExtract}
              fillFromCurp={fillFromCurp}
            />
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              <button
                className={classNames(BTN_BASE, BTN_SIZES.sm, BTN_VARIANTS.secondary)}
                onClick={() => u.curpAbsPath && window.open(u.curpAbsPath, "_blank", "noopener")}
                disabled={!u.curpAbsPath}
                type="button"
              >
                Ver CURP completo
              </button>
            </div>
          </div>
          <UserStatsBar user={u} names={names} />
        </div>

        {/* PATH Column */}
        <div className="lg:col-span-3 space-y-3">
          <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl border-2 border-emerald-100 p-4 shadow-md">
            <h3 className="text-sm font-bold text-emerald-900 mb-3 flex items-center gap-2">
              Buscar en PATH
            </h3>
            <input
              className="block w-full mb-3 rounded-lg border border-emerald-200 bg-white placeholder:text-gray-400 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition"
              placeholder="Nombre o email..."
              value={lkPathSearch}
              onChange={(e) => setLkPathSearch(e.target.value)}
              disabled={gptBulk}
            />
            <SuggestionList title="Resultados" list={pathList} onAssociate={handleAssociatePath} disabled={gptBulk} loadingForId={pathSavingId} />
            {!!u.hasPath && (
              <div className="mt-3 pt-3 border-t border-emerald-200">
                <StatusBadge status="ok" label={`PATH #${u.pathId}`} className="mb-2" />
                <button
                  className="text-rose-600 hover:text-rose-700 font-bold text-xs underline"
                  onClick={() => setAsociar((a) => a.map((user) => user.id === u.id ? { ...user, pathId: null, hasPath: false, hasEco: false, hasMmpi: false, ecoPrueba: null, mmpiPrueba: null } : user))}
                  disabled={gptBulk}
                  type="button"
                >
                  Desasociar PATH
                </button>
              </div>
            )}
            {pathSaveError && <div className="mt-2 text-rose-600 font-semibold text-xs bg-rose-50 rounded px-2 py-1">{pathSaveError}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CurpPreview({ curpAbsPath }) {
  if (!curpAbsPath) return <div className="text-gray-400 flex flex-col items-center justify-center py-16 px-4">Sin CURP adjunta</div>;
  if (/\.pdf(\?|$)/i.test(curpAbsPath)) return <embed src={curpAbsPath} type="application/pdf" className="block w-full aspect-[4/5] min-h-[280px] max-h-[400px] mx-auto" />;
  if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(curpAbsPath)) return <img src={curpAbsPath} alt="CURP" className="block mx-auto max-h-[400px] max-w-full object-contain" />;
  return <div className="text-gray-400 py-12 text-center">Formato de archivo no compatible</div>;
}