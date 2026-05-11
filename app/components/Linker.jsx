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
import {
  classNames,
  BTN_BASE,
  BTN_SIZES,
  BTN_VARIANTS,
} from "../lib/designTokens";
import { filterLinkerUsers, EMPTY_NAMES } from "../lib/userUtils";
import { getMissingLinkType, getPrimarySearchValue } from "../lib/linkingStats";

// Simple debounce helper for internal Linker use (suggestions)
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

export default function Linker({
  asociar,
  idx,
  setIdx,
  setLinkMode,
  setAsociar,
  initialFilter = "missing",
  initialSearch = "",
}) {
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
  const [disassociating, setDisassociating] = useState(null);

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
    [asociar, filters, searchTerm, plantelFilter],
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
    setFilters(initialFilter || "missing");
    setSearchTerm(initialSearch || "");
    setIdx(0);
  }, [initialFilter, initialSearch, setIdx]);

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
  }, [
    currIdx,
    _filtered.length,
    setIdx,
    setLinkMode,
    canExtractCurpGpt,
    handleGptExtractManual,
    names,
    u,
  ]);

  // Debounced fetch functions for sidebars
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchEvaSuggestions = useCallback(
    debounce((term, exclude) => {
      fetch(
        "/api/search-eva?q=" +
          encodeURIComponent(term) +
          (exclude ? "&exclude=" + encodeURIComponent(exclude) : ""),
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => setEvaList(Array.isArray(list) ? list : []))
        .catch(() => setEvaList([]));
    }, 300),
    [],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchPathSuggestions = useCallback(
    debounce((term, exclude) => {
      fetch(
        "/api/search-path?q=" +
          encodeURIComponent(term) +
          (exclude ? "&exclude=" + encodeURIComponent(exclude) : ""),
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((list) =>
          setPathList(
            Array.isArray(list)
              ? list.map((l) => ({
                  ...l,
                  name:
                    l.name ||
                    l.N ||
                    (typeof l.label === "string"
                      ? l.label.replace(/<.+>/, "").trim()
                      : ""),
                }))
              : [],
          ),
        )
        .catch(() => setPathList([]));
    }, 300),
    [],
  );

  // Trigger sidebar search when inputs change
  useEffect(() => {
    if (!u.id || u.hasEva) {
      setEvaList([]);
      return;
    }
    const excludeEva = asociar
      .filter((z) => z.evaId && z.id !== u.id)
      .map((z) => String(z.evaId))
      .join(",");
    fetchEvaSuggestions(lkEvaSearch, excludeEva);
  }, [lkEvaSearch, u.id, u.hasEva, asociar, fetchEvaSuggestions]);

  useEffect(() => {
    if (!u.id || u.hasPath) {
      setPathList([]);
      return;
    }
    const excludePath = asociar
      .filter((z) => z.pathId && z.id !== u.id)
      .map((z) => String(z.pathId))
      .join(",");
    fetchPathSuggestions(lkPathSearch, excludePath);
  }, [lkPathSearch, u.id, u.hasPath, asociar, fetchPathSuggestions]);

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
    setNameFieldState({
      nombres: "idle",
      apellidoPaterno: "idle",
      apellidoMaterno: "idle",
    });
    setNameFieldErr({ nombres: "", apellidoPaterno: "", apellidoMaterno: "" });
    const defaultSearch = getPrimarySearchValue(u);
    setLkEvaSearch(u.hasEva ? "" : defaultSearch);
    setLkPathSearch(u.hasPath ? "" : defaultSearch);
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
      const isSearchInput =
        active &&
        (active.type === "search" || active.getAttribute("type") === "search");
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
        try {
          errText = (await resp.json()).error || errText;
        } catch {}
        setEvaSaveError(errText);
        setEvaSavingId(null);
        return;
      }
      setAsociar((prev) =>
        prev.map((user) =>
          user.id === u.id ? { ...user, evaId: +cid, hasEva: true } : user,
        ),
      );
      setEvaList([]);
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
        try {
          errText = (await resp.json()).error || errText;
        } catch {}
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
            : user,
        ),
      );
      setPathList([]);
    } catch (err) {
      setPathSaveError("Red o servidor");
    } finally {
      setPathSavingId(null);
    }
  }

  async function handleDisassociate(source) {
    if (!u.id || !["eva", "path"].includes(source)) return;
    setDisassociating(source);
    setEvaSaveError("");
    setPathSaveError("");

    try {
      const response = await fetch("/api/disassociate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signiaId: u.id, source }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "No se pudo desasociar");

      setAsociar((prev) =>
        prev.map((user) => {
          if (user.id !== u.id) return user;
          if (source === "eva") return { ...user, evaId: null, hasEva: false };
          return {
            ...user,
            pathId: null,
            hasPath: false,
            hasEco: false,
            hasMmpi: false,
            ecoPrueba: null,
            mmpiPrueba: null,
          };
        }),
      );
    } catch (error) {
      const message = error?.message || "No se pudo desasociar";
      if (source === "eva") setEvaSaveError(message);
      if (source === "path") setPathSaveError(message);
    } finally {
      setDisassociating(null);
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
        apellidoPaterno:
          field === "apellidoPaterno" ? newValue : names.apellidoPaterno,
        apellidoMaterno:
          field === "apellidoMaterno" ? newValue : names.apellidoMaterno,
      };
      const resp = await fetch(`/api/signia-names/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullPatch),
      });
      if (!resp.ok) {
        setNameFieldState((st) => ({ ...st, [field]: "error" }));
        let msg = "";
        try {
          msg = (await resp.json()).error || "Error";
        } catch {}
        setNameFieldErr((err) => ({ ...err, [field]: msg }));
        return;
      }
      setAsociar((prev) =>
        prev.map((user) =>
          user.id === u.id ? { ...user, ...fullPatch } : user,
        ),
      );
      setNameFieldState((st) => ({ ...st, [field]: "saved" }));
      setTimeout(
        () => setNameFieldState((st) => ({ ...st, [field]: "idle" })),
        1000,
      );
    } catch (e) {
      setNameFieldState((st) => ({ ...st, [field]: "error" }));
      setNameFieldErr((err) => ({ ...err, [field]: "Red o servidor" }));
    }
  }

  async function saveAllPendingChanges() {
    if (!u.id) return;
    const changes = {};
    let hasChanges = false;
    if (names.nombres !== (u.nombres ?? "")) {
      changes.nombres = names.nombres;
      hasChanges = true;
    }
    if (names.apellidoPaterno !== (u.apellidoPaterno ?? "")) {
      changes.apellidoPaterno = names.apellidoPaterno;
      hasChanges = true;
    }
    if (names.apellidoMaterno !== (u.apellidoMaterno ?? "")) {
      changes.apellidoMaterno = names.apellidoMaterno;
      hasChanges = true;
    }

    if (!hasChanges) return;
    const savingState = {};
    Object.keys(changes).forEach((field) => {
      savingState[field] = "saving";
    });
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
      setAsociar((prev) =>
        prev.map((user) =>
          user.id === u.id ? { ...user, ...fullPatch } : user,
        ),
      );
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
      <LoaderOverlay
        show={gptExtracting || gptBulk}
        text={
          gptBulk
            ? `Procesando CURP ${gptBulkProgress.done + 1} de ${gptBulkProgress.total}`
            : "Procesando CURP…"
        }
      />

      {/* Navigation & Controls */}
      <NavBar
        currIdx={currIdx}
        total={_filtered.length}
        setIdx={async (newIdx) => {
          await saveAllPendingChanges();
          setIdx(newIdx);
        }}
        setLinkMode={async () => {
          await saveAllPendingChanges();
          setLinkMode();
        }}
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

      {_filtered.length > 0 && (
        <ManualLinkingContext
          user={u}
          total={_filtered.length}
          missingType={getMissingLinkType(u)}
        />
      )}

      {/* The main filter bar with the search input */}
      <FilterBar
        FILTERS={[
          { id: "missing", label: "Cualquier faltante" },
          { id: "both", label: "Sin ambos" },
          { id: "eva", label: "Sin EVA" },
          { id: "path", label: "Sin PATH" },
          { id: "nombres", label: "Nombres" },
          { id: "eco", label: "ECO/MMPI" },
          { id: "all", label: "Todos" },
        ]}
        filters={filters}
        setFilters={setFilters}
        setIdx={setIdx}
        count={_filtered.length}
        searchTerm={searchTerm}
        setSearchTerm={(val) => {
          setSearchTerm(val);
          setIdx(0);
        }}
        planteles={plantelOptions}
        plantelFilter={plantelFilter}
        setPlantelFilter={(val) => {
          setPlantelFilter(val);
          setIdx(0);
        }}
      />

      {gptErr && (
        <div className="text-center mb-3 px-4 py-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 font-semibold text-sm">
          ⚠️ {gptErr}
        </div>
      )}

      {_filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">
            No hay usuarios para este filtro
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Cambia el filtro o vuelve al resumen de Vinculación para elegir otro
            flujo.
          </p>
          <button
            type="button"
            onClick={setLinkMode}
            className={classNames(
              BTN_BASE,
              BTN_SIZES.md,
              BTN_VARIANTS.primary,
              "mt-5",
            )}
          >
            Volver al resumen
          </button>
        </div>
      ) : (
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
              <SuggestionList
                title="Resultados"
                list={evaList}
                onAssociate={handleAssociateEva}
                disabled={gptBulk}
                loadingForId={evaSavingId}
              />
              {!!u.hasEva && (
                <div className="mt-3 pt-3 border-t border-indigo-200">
                  <StatusBadge
                    status="ok"
                    label={`EVA #${u.evaId}`}
                    className="mb-2"
                  />
                  <button
                    className="text-rose-600 hover:text-rose-700 font-bold text-xs underline"
                    onClick={() => handleDisassociate("eva")}
                    disabled={gptBulk || disassociating === "eva"}
                    type="button"
                  >
                    Desasociar EVA
                  </button>
                </div>
              )}
              {evaSaveError && (
                <div className="mt-2 text-rose-600 font-semibold text-xs bg-rose-50 rounded px-2 py-1">
                  {evaSaveError}
                </div>
              )}
            </div>
          </div>

          {/* Center: User Details */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-gradient-to-br from-white via-indigo-50/30 to-purple-50/30 rounded-2xl border-2 border-indigo-200 shadow-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-indigo-900 mb-1">
                    {u.name || (
                      <span className="text-slate-400">Sin nombre</span>
                    )}
                  </h2>
                  <p className="text-sm text-slate-600 font-mono">
                    {u.email || (
                      <span className="text-slate-400">Sin email</span>
                    )}
                  </p>
                  {u.plantelLabel && (
                    <p className="mt-1 text-xs font-semibold text-indigo-600">
                      Plantel: {u.plantelLabel}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-indigo-600">
                    {currIdx + 1}
                  </div>
                  <div className="text-xs text-slate-500">
                    de {_filtered.length}
                  </div>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border-2 border-slate-200 bg-white shadow-inner mb-4">
                <CurpPreview curpAbsPath={u.curpAbsPath} />
              </div>
              <NamesEditBlock
                names={names}
                onChange={(field, value) =>
                  setNames((n) => ({ ...n, [field]: value }))
                }
                onBlur={handleFieldBlur}
                fieldState={nameFieldState}
                fieldErr={nameFieldErr}
                curpExtract={u.curpExtract}
                fillFromCurp={fillFromCurp}
              />
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                <button
                  className={classNames(
                    BTN_BASE,
                    BTN_SIZES.sm,
                    BTN_VARIANTS.secondary,
                  )}
                  onClick={() =>
                    u.curpAbsPath &&
                    window.open(u.curpAbsPath, "_blank", "noopener")
                  }
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
              <SuggestionList
                title="Resultados"
                list={pathList}
                onAssociate={handleAssociatePath}
                disabled={gptBulk}
                loadingForId={pathSavingId}
              />
              {!!u.hasPath && (
                <div className="mt-3 pt-3 border-t border-emerald-200">
                  <StatusBadge
                    status="ok"
                    label={`PATH #${u.pathId}`}
                    className="mb-2"
                  />
                  <button
                    className="text-rose-600 hover:text-rose-700 font-bold text-xs underline"
                    onClick={() => handleDisassociate("path")}
                    disabled={gptBulk || disassociating === "path"}
                    type="button"
                  >
                    Desasociar PATH
                  </button>
                </div>
              )}
              {pathSaveError && (
                <div className="mt-2 text-rose-600 font-semibold text-xs bg-rose-50 rounded px-2 py-1">
                  {pathSaveError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ManualLinkingContext({ user, total, missingType }) {
  const labelByType = {
    both: "Vincular EVA y PATH",
    eva: "Vincular EVA",
    path: "Vincular PATH",
    complete: "Revisar expediente completo",
  };

  return (
    <section className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
            Asociación Manual
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            {labelByType[missingType] || "Resolver vinculación"}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Confirma que el expediente de Signia corresponde con el candidato de
            EVA o PATH antes de asociarlo. Después de guardar una asociación, el
            usuario sale automáticamente del filtro si ya no pertenece a ese
            pendiente.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <StatusPill label="Usuarios" value={total} />
          <StatusPill
            label="EVA"
            value={user?.hasEva ? "Listo" : "Pendiente"}
            tone={user?.hasEva ? "ok" : "warn"}
          />
          <StatusPill
            label="PATH"
            value={user?.hasPath ? "Listo" : "Pendiente"}
            tone={user?.hasPath ? "ok" : "warn"}
          />
          <StatusPill
            label="Siguiente"
            value={labelByType[missingType] || "Revisar"}
          />
        </div>
      </div>
    </section>
  );
}

function StatusPill({ label, value, tone }) {
  const toneClass =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <div className={classNames("rounded-xl border px-3 py-2", toneClass)}>
      <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-0.5 max-w-32 truncate font-bold">{value}</div>
    </div>
  );
}

function CurpPreview({ curpAbsPath }) {
  if (!curpAbsPath)
    return (
      <div className="text-gray-400 flex flex-col items-center justify-center py-16 px-4">
        Sin CURP adjunta
      </div>
    );
  if (/\.pdf(\?|$)/i.test(curpAbsPath))
    return (
      <embed
        src={curpAbsPath}
        type="application/pdf"
        className="block w-full aspect-[4/5] min-h-[280px] max-h-[400px] mx-auto"
      />
    );
  if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(curpAbsPath))
    return (
      <img
        src={curpAbsPath}
        alt="CURP"
        className="block mx-auto max-h-[400px] max-w-full object-contain"
      />
    );
  return (
    <div className="text-gray-400 py-12 text-center">
      Formato de archivo no compatible
    </div>
  );
}
