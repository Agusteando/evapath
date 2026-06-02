"use client";
import { useState, useEffect } from "react";
import Pagination from "../Pagination";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const FILTERS = [
  { id: "healthy", label: "Sin alertas" },
  { id: "all", label: "Todos" },
  { id: "registered", label: "Registrados" },
  { id: "unregistered", label: "No registrados" },
  { id: "linked", label: "Vinculados" },
  { id: "ready", label: "Con dictámenes" },
  { id: "incomplete", label: "Incompletos" },
  { id: "duplicates", label: "Duplicados" },
  { id: "broken", label: "Con alertas" },
];

const PROBLEM_LABELS = {
  MISSING_EMAIL: "Sin correo",
  INVALID_EMAIL: "Correo inválido",
  MISSING_NAME: "Sin nombre",
  DUPLICATE_CANDIDATE_EMAIL: "Candidato duplicado",
  NO_SIGNIA_USER: "Sin usuario",
  UNLINKED_SIGNIA_BY_EMAIL: "Usuario sin PATH",
  SIGNIA_LINK_CONFLICT: "Conflicto Signia",
  MISSING_ECO: "Falta ECO",
  MISSING_MMPI: "Falta MMPI",
  ECO_PENDING_OR_BROKEN: "ECO no listo",
  MMPI_PENDING_OR_BROKEN: "MMPI no listo",
  DUPLICATE_PRUEBAS: "Pruebas duplicadas",
  MISSING_PRUEBA_CODE: "Sin código",
  MISSING_PUESTO_ID: "Sin puesto",
  PRUEBA_CODE_MISMATCH: "Códigos distintos",
};

function StatusBadge({ row }) {
  const state = row.linkState?.state;
  const tone =
    state === "linked"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : state === "unregistered"
        ? "bg-slate-100 text-slate-600 border-slate-200"
        : state === "unlinked-by-email"
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-rose-50 text-rose-700 border-rose-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone}`}>
      {row.linkState?.label || "Sin estado"}
    </span>
  );
}

function TestBadge({ test }) {
  const tone = test?.linked
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : test?.assigned
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-slate-100 text-slate-500 border-slate-200";

  const detail = test?.linked
    ? "dictamen"
    : test?.assigned
      ? "asignada"
      : "falta";

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${tone}`}>
      <div className="font-black">{test?.label}</div>
      <div className="font-semibold opacity-80">{detail}</div>
      {test?.duplicateCount > 0 && <div className="mt-1 text-[10px] font-bold">+{test.duplicateCount} duplicada</div>}
    </div>
  );
}

function ProblemChips({ codes }) {
  if (!codes?.length) {
    return <span className="text-[11px] font-bold text-emerald-600">Sin alertas</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.slice(0, 4).map((code) => (
        <span key={code} className="rounded-md bg-slate-100 border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600">
          {PROBLEM_LABELS[code] || code}
        </span>
      ))}
      {codes.length > 4 && (
        <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500">
          +{codes.length - 4}
        </span>
      )}
    </div>
  );
}

export default function PathSearchView() {
  const [data, setData] = useState({ users: [], loading: true, lastPage: 1, total: 0, stats: {} });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("healthy");
  const [actionState, setActionState] = useState({ loading: false, message: "", error: "" });

  const fetchData = async () => {
    setData((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(
        `/api/path-health?page=${page}&pageSize=${pageSize}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo cargar PATH.");
      setData({ ...json, loading: false });
    } catch (e) {
      setActionState({ loading: false, message: "", error: e.message });
      setData((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize, q, status]);

  const runAction = async (url, payload, successMessage) => {
    setActionState({ loading: true, message: "", error: "" });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo completar la acción.");
      const unresolved = json.unresolved?.length ? ` Observaciones: ${json.unresolved.join(" ")}` : "";
      const bulkDetail = json.mode === "bulk" ? ` (${json.repaired?.length || 0}/${json.attempted || 0} grupos revisados)` : "";
      setActionState({ loading: false, message: `${successMessage}${bulkDetail}.${unresolved}`, error: "" });
      await fetchData();
    } catch (e) {
      setActionState({ loading: false, message: "", error: e.message });
    }
  };

  const repairCandidate = (row) => {
    runAction(
      "/api/path-health/repair",
      { candidatoId: row.id },
      `PATH #${row.id} revisado y reparado de forma segura`,
    );
  };

  const resendLink = (row) => {
    runAction(
      "/api/path-health/resend",
      { candidatoId: row.id },
      `Enlace reenviado a ${row.email}`,
    );
  };

  const bulkCleanup = () => {
    runAction(
      "/api/path-health/repair",
      { mode: "bulk", limit: 250 },
      "Reparación inteligente de PATH completada",
    );
  };

  const stats = data.stats || {};

  return (
    <div className="flex flex-col h-full bg-[#FDFDFE] flex-1 overflow-hidden relative">
      <div className="px-8 py-8 border-b border-slate-200 bg-white shadow-sm z-10 relative">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Directorio PATH</h1>
            <p className="text-sm text-slate-500 mt-1">
              Directorio de resultados psicométricos, vinculación Signia y estado de pruebas ECO / MMPI.
            </p>
          </div>
          <button
            onClick={bulkCleanup}
            disabled={actionState.loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {actionState.loading ? "Procesando..." : "Reparar PATH"}
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="font-black text-slate-800">Vista PATH:</span> por defecto se ocultan candidatos con alertas para mantener limpio el directorio. Usa “Todos” o “Con alertas” para revisar y reparar casos operativos.
          </div>
          <div className="shrink-0 font-bold text-slate-500">
            {data.total ?? 0} visibles · {stats.total ?? 0} totales
          </div>
        </div>
      </div>

      <div className="px-8 py-4 border-b border-slate-200 bg-slate-50/50 space-y-4">
        {(actionState.message || actionState.error) && (
          <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${actionState.error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {actionState.error || actionState.message}
          </div>
        )}

        <div className="flex flex-col xl:flex-row gap-4 xl:items-center xl:justify-between">
          <div className="relative w-full max-w-lg">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              type="search"
              placeholder="Buscar en PATH por nombre, correo o ID..."
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => { setStatus(filter.id); setPage(1); }}
                className={`rounded-lg border px-3 py-2 text-xs font-black transition ${status === filter.id ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500 hover:text-slate-800"}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#FDFDFE]">
        <table className="w-full text-left text-sm min-w-[1180px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold sticky top-0 z-10">
            <tr>
              <th className="px-8 py-3.5 tracking-wide">Candidato</th>
              <th className="px-6 py-3.5 tracking-wide w-56">Registro</th>
              <th className="px-6 py-3.5 tracking-wide w-64">Pruebas</th>
              <th className="px-6 py-3.5 tracking-wide w-56">Alertas</th>
              <th className="px-6 py-3.5 tracking-wide text-center w-40">Reportes</th>
              <th className="px-6 py-3.5 tracking-wide text-right w-72">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.loading ? (
              <tr><td colSpan="6" className="px-8 py-12 text-center text-slate-400">
                <svg className="animate-spin h-6 w-6 text-emerald-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20"/><path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" className="opacity-80"/></svg>
                Revisando salud de PATH...
              </td></tr>
            ) : data.users.length === 0 ? (
              <tr><td colSpan="6" className="px-8 py-12 text-center text-slate-500">
                <div className="text-4xl mb-3">🔍</div>
                <div className="font-semibold text-slate-700">No se encontraron candidatos</div>
              </td></tr>
            ) : (
              data.users.map((u) => {
                const eco = u.pathLinks?.find((x) => x.label === "ECO");
                const mmpi = u.pathLinks?.find((x) => x.label === "MMPI-2 RF");
                return (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors group align-top">
                    <td className="px-8 py-4">
                      <div className="flex items-start gap-3.5">
                        <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-200 shadow-sm">
                          {getInitials(u.nombre)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 truncate">{u.nombre}</div>
                          <div className="text-slate-500 text-xs font-mono mt-0.5 truncate">{u.email || "Sin correo"}</div>
                          <div className="text-[11px] text-slate-400 font-bold mt-1">PATH #{u.id}</div>
                          {u.duplicateCandidateIds?.length > 0 && (
                            <div className="text-[11px] text-rose-600 font-bold mt-1">
                              Duplicados: {u.duplicateCandidateIds.join(", ")}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge row={u} />
                      {u.linkState?.user && (
                        <div className="mt-2 text-xs text-slate-500">
                          <div className="font-semibold text-slate-700 truncate">{u.linkState.user.name || "Usuario Signia"}</div>
                          <div className="font-mono truncate">{u.linkState.user.email}</div>
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="grid grid-cols-2 gap-2">
                        <TestBadge test={u.pruebaStatus?.eco} />
                        <TestBadge test={u.pruebaStatus?.mmpi} />
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500 font-semibold">
                        Código: {u.pruebaStatus?.canonicalCode || "sin código"} · Puesto: {u.pruebaStatus?.canonicalPuestoId || "sin puesto"}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <ProblemChips codes={u.problemCodes} />

                    </td>

                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-2">
                        {eco ? (
                          <a href={eco.url} target="_blank" rel="noreferrer" className="inline-flex w-28 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700">
                            VER ECO
                          </a>
                        ) : <span className="w-28 text-slate-400 font-bold text-[10px] bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">ECO PENDIENTE</span>}

                        {mmpi ? (
                          <a href={mmpi.url} target="_blank" rel="noreferrer" className="inline-flex w-28 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700">
                            VER MMPI
                          </a>
                        ) : <span className="w-28 text-slate-400 font-bold text-[10px] bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">MMPI PENDIENTE</span>}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end gap-2">
                        <button
                          onClick={() => repairCandidate(u)}
                          disabled={actionState.loading || !u.canSafeRepair}
                          className="inline-flex w-36 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          Reparar
                        </button>
                        <button
                          onClick={() => resendLink(u)}
                          disabled={actionState.loading || !u.canResend}
                          className="inline-flex w-36 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          Reenviar link
                        </button>
                        {u.inviteLink && (
                          <a href={u.inviteLink} target="_blank" rel="noreferrer" className="w-36 truncate text-center text-[11px] font-semibold text-blue-600 hover:underline">
                            Abrir invitación
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} setPage={setPage} lastPage={data.lastPage} pageSize={pageSize} setPageSize={setPageSize} total={data.total} />
    </div>
  );
}
