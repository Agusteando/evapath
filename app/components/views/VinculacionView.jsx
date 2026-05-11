"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BTN_BASE,
  BTN_SIZES,
  BTN_VARIANTS,
  SPINNER,
  classNames,
} from "../../lib/designTokens";
import {
  getPrimarySearchValue,
  getVinculacionStats,
  hasEvaLink,
  hasPathLink,
} from "../../lib/linkingStats";

function LoadingState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#FDFDFE] text-slate-500">
      <svg
        className="animate-spin h-8 w-8 text-blue-500 mb-4"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          className="opacity-20"
        />
        <path
          d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
          fill="currentColor"
          className="opacity-80"
        />
      </svg>
      Cargando resumen de vinculación...
    </div>
  );
}

function formatCount(value) {
  if (value === null || value === undefined) return "—";
  return Number(value || 0).toLocaleString("es-MX");
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatTimeUntil(value, nowValue) {
  if (!value) return "—";
  const target = new Date(value).getTime();
  const now = nowValue instanceof Date ? nowValue.getTime() : Date.now();
  if (Number.isNaN(target)) return "—";

  const diffMs = target - now;
  if (diffMs <= 0) return "Ahora";

  const totalMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function getAutoSyncStatusLabel(status) {
  if (!status) return "Sin leer";
  if (!status.enabled) return "Desactivado";
  if (status.running || status.status === "running") return "Ejecutando";
  if (status.lastSuccess === true) return "Última corrida OK";
  if (status.lastSuccess === false) return "Última corrida con error";
  return "Pendiente";
}

function getDisplayName(user = {}) {
  return (
    user.fullName ||
    [user.nombres, user.apellidoPaterno, user.apellidoMaterno]
      .filter(Boolean)
      .join(" ") ||
    user.name ||
    "Sin nombre"
  ).trim();
}

function getPlantelLabel(user = {}) {
  return user.plantelLabel || user.plantelName || "—";
}

function getMissingLabel(user = {}) {
  const missing = [];
  if (!hasEvaLink(user)) missing.push("EVA");
  if (!hasPathLink(user)) missing.push("PATH");
  return missing.length ? `Sin ${missing.join(" y ")}` : "Completo";
}

function resolveSearch(user = {}) {
  return getPrimarySearchValue(user) || user.email || getDisplayName(user);
}

function getUserKey(user = {}, index = 0, scope = "user") {
  return `${scope}-${user.id ?? user.signiaId ?? user.email ?? getDisplayName(user)}-${index}`;
}

function dedupeUsers(rows = []) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = row?.id != null ? `id:${row.id}` : `fallback:${row?.email || getDisplayName(row)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    if (!existing.curpPath && row?.curpPath) {
      map.set(key, { ...existing, curpPath: row.curpPath, curpStatus: row.curpStatus });
    }
  }
  return Array.from(map.values());
}

function StatChip({ label, value, emphasis = false }) {
  return (
    <div
      className={classNames(
        "rounded-xl border bg-white px-4 py-3 shadow-sm",
        emphasis ? "border-slate-300" : "border-slate-200",
      )}
    >
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums text-slate-950">
        {formatCount(value)}
      </div>
    </div>
  );
}

function AutoSyncStatusBar({ status, loading, error, now }) {
  const statusLabel = error
    ? "No disponible"
    : loading && !status
      ? "Cargando"
      : getAutoSyncStatusLabel(status);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
            Auto email-match
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-700">
            Próximo auto: {formatTimeUntil(status?.nextRunAt, now)}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:min-w-[520px]">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Última ejecución</span>
            <div className="font-bold text-slate-900">{formatDateTime(status?.lastExecutedAt)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Estado</span>
            <div
              className={classNames(
                "font-bold",
                error || status?.lastSuccess === false ? "text-rose-700" : "text-slate-900",
              )}
            >
              {statusLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserIdentity({ user }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-bold text-slate-900">
        {getDisplayName(user)}
      </div>
      <div className="truncate text-xs text-slate-500">
        {user.email || "Sin email"}
      </div>
    </div>
  );
}

function EmptyList({ label }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
      {label}
    </div>
  );
}

function SummaryPendingCard({ title, count, users, actionLabel, onOpen }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">
            {title}
          </h2>
          <div className="mt-1 text-4xl font-black tabular-nums text-slate-950">
            {formatCount(count)}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          disabled={!count}
          className={classNames(BTN_BASE, BTN_SIZES.sm, BTN_VARIANTS.secondary)}
        >
          {actionLabel}
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {users.length ? (
          users.slice(0, 5).map((user, index) => (
            <div
              key={getUserKey(user, index, title)}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <UserIdentity user={user} />
              <span className="shrink-0 text-[11px] font-semibold text-slate-500">
                {getPlantelLabel(user)}
              </span>
            </div>
          ))
        ) : (
          <EmptyList label="Sin pendientes" />
        )}
      </div>
    </section>
  );
}

function formatCandidateTarget(label, candidate) {
  if (!candidate) return null;
  const score = candidate.score ? ` · ${candidate.score}%` : "";
  const name = candidate.name ? ` · ${candidate.name}` : "";
  return `${label} #${candidate.id}${score}${name}`;
}

function MatchTargetSummary({ match }) {
  const parts = [];
  const eva = formatCandidateTarget("EVA", match.evaCandidate);
  const path = formatCandidateTarget("PATH", match.pathCandidate);
  if (eva) parts.push(eva);
  if (path) parts.push(path);
  return parts.join(" · ") || "—";
}

function EmailMatchPanel({
  preview,
  loading,
  error,
  selectedIds,
  setSelectedIds,
  syncing,
  onApplySelected,
  onReview,
  onReviewUser,
}) {
  const matches = Array.isArray(preview?.matches) ? preview.matches : [];
  const selectedCount = selectedIds.size;
  const evaEmailCount = preview?.evaReady === false ? null : preview?.evaSet ?? 0;
  const bothEmailCount = preview?.evaReady === false ? null : preview?.bothSet ?? 0;
  const breakdown = preview?.breakdown || {};

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(matches.map((match) => String(match.signiaId))));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide text-slate-900">
              Coincidencias directas por email
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatChip label="Sin EVA → EVA" value={evaEmailCount} />
              <StatChip label="Sin PATH → PATH" value={preview?.pathSet ?? 0} />
              <StatChip
                label="Sin ambos → EVA + PATH"
                value={bothEmailCount}
                emphasis
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={onApplySelected}
              disabled={loading || syncing || selectedCount === 0}
              className={classNames(BTN_BASE, BTN_SIZES.md, BTN_VARIANTS.primary)}
            >
              {syncing && (
                <svg className={SPINNER} viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
                    fill="currentColor"
                  />
                </svg>
              )}
              Aceptar seleccionadas ({formatCount(selectedCount)})
            </button>
            <button
              type="button"
              onClick={onReview}
              disabled={loading}
              className={classNames(BTN_BASE, BTN_SIZES.md, BTN_VARIANTS.secondary)}
            >
              Revisar antes de aplicar
            </button>
          </div>
        </div>

        {preview?.evaReady === false && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            EVA está en estado {preview.evaStatus || "desconocido"}; las coincidencias EVA pueden estar incompletas.
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold text-slate-700">
            {loading
              ? "Calculando coincidencias..."
              : `${formatCount(matches.length)} registros listos por email`}
          </div>
          {!loading && (
            <div className="text-xs font-semibold text-slate-500">
              Sin ambos con EVA: {formatCount(preview?.evaReady === false ? null : breakdown.missingBothWithEva ?? 0)} · Sin ambos con PATH: {formatCount(breakdown.missingBothWithPath ?? 0)}
            </div>
          )}
          {!!matches.length && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-bold text-blue-700 hover:text-blue-800"
              >
                Seleccionar todo
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Limpiar selección
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            Calculando por email en EVA y PATH...
          </div>
        ) : matches.length ? (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="max-h-[420px] overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-3 py-3" />
                    <th className="px-3 py-3">Nombre</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Estado actual</th>
                    <th className="px-3 py-3">Coincidencia encontrada</th>
                    <th className="px-3 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {matches.map((match, index) => {
                    const id = String(match.signiaId);
                    return (
                      <tr key={`email-match-${id}-${match.targets?.join("-") || "target"}-${index}`} className="hover:bg-slate-50">
                        <td className="px-3 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(id)}
                            onChange={() => toggleSelected(id)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            aria-label={`Seleccionar ${match.name}`}
                          />
                        </td>
                        <td className="px-3 py-3 align-top font-semibold text-slate-900">
                          {match.name || "Sin nombre"}
                        </td>
                        <td className="px-3 py-3 align-top text-slate-600">
                          {match.email || "—"}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-100">
                            {match.currentStatus || "Pendiente"}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-top text-slate-700">
                          {MatchTargetSummary({ match })}
                        </td>
                        <td className="px-3 py-3 align-top text-right">
                          <button
                            type="button"
                            onClick={() => onReviewUser(match)}
                            className="text-xs font-bold text-blue-700 hover:text-blue-800"
                          >
                            Revisar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyList label="No hay coincidencias directas por email" />
        )}
      </div>
    </section>
  );
}


function NameMatchPanel({
  preview,
  loading,
  error,
  selectedIds,
  setSelectedIds,
  syncing,
  result,
  onApplySelected,
  onReview,
  onReviewUser,
}) {
  const matches = Array.isArray(preview?.matches) ? preview.matches : [];
  const selectedCount = selectedIds.size;
  const minScore = preview?.minScore || 95;
  const evaNameCount = preview?.evaReady === false ? null : preview?.evaSet ?? 0;
  const bothNameCount = preview?.evaReady === false ? null : preview?.bothSet ?? 0;
  const breakdown = preview?.breakdown || {};

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(matches.map((match) => String(match.signiaId))));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide text-slate-900">
              Coincidencias por nombre {minScore}%+
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatChip label="Sin EVA → EVA" value={evaNameCount} />
              <StatChip label="Sin PATH → PATH" value={preview?.pathSet ?? 0} />
              <StatChip
                label="Sin ambos → EVA + PATH"
                value={bothNameCount}
                emphasis
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={onApplySelected}
              disabled={loading || syncing || selectedCount === 0}
              className={classNames(BTN_BASE, BTN_SIZES.md, BTN_VARIANTS.primary)}
            >
              {syncing && (
                <svg className={SPINNER} viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
                    fill="currentColor"
                  />
                </svg>
              )}
              Aceptar seleccionadas ({formatCount(selectedCount)})
            </button>
            <button
              type="button"
              onClick={onReview}
              disabled={loading}
              className={classNames(BTN_BASE, BTN_SIZES.md, BTN_VARIANTS.secondary)}
            >
              Abrir Auto-Similitud
            </button>
          </div>
        </div>

        {preview?.evaReady === false && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            EVA está en estado {preview.evaStatus || "desconocido"}; las coincidencias EVA por nombre pueden estar incompletas.
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}
        {result && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {result}
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold text-slate-700">
            {loading
              ? "Calculando coincidencias por nombre..."
              : `${formatCount(matches.length)} registros listos por nombre`}
          </div>
          {!loading && (
            <div className="text-xs font-semibold text-slate-500">
              Sin ambos con EVA: {formatCount(preview?.evaReady === false ? null : breakdown.missingBothWithEva ?? 0)} · Sin ambos con PATH: {formatCount(breakdown.missingBothWithPath ?? 0)}
            </div>
          )}
          {!!matches.length && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-bold text-blue-700 hover:text-blue-800"
              >
                Seleccionar todo
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Limpiar selección
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            Calculando nombres en EVA y PATH...
          </div>
        ) : matches.length ? (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="max-h-[420px] overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-3 py-3" />
                    <th className="px-3 py-3">Nombre Signia</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Estado actual</th>
                    <th className="px-3 py-3">Coincidencia encontrada</th>
                    <th className="px-3 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {matches.map((match, index) => {
                    const id = String(match.signiaId);
                    return (
                      <tr key={`name-match-${id}-${match.targets?.join("-") || "target"}-${index}`} className="hover:bg-slate-50">
                        <td className="px-3 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(id)}
                            onChange={() => toggleSelected(id)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            aria-label={`Seleccionar ${match.name}`}
                          />
                        </td>
                        <td className="px-3 py-3 align-top font-semibold text-slate-900">
                          {match.name || "Sin nombre"}
                        </td>
                        <td className="px-3 py-3 align-top text-slate-600">
                          {match.email || "—"}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-100">
                            {match.currentStatus || "Pendiente"}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-top text-slate-700">
                          {MatchTargetSummary({ match })}
                        </td>
                        <td className="px-3 py-3 align-top text-right">
                          <button
                            type="button"
                            onClick={() => onReviewUser(match)}
                            className="text-xs font-bold text-blue-700 hover:text-blue-800"
                          >
                            Revisar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyList label="No hay coincidencias por nombre 95%+ listas para aplicar" />
        )}
      </div>
    </section>
  );
}

function PendingTable({ title, users, actionLabel, onAction, motive }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">
            {title}
          </h2>
          <div className="mt-0.5 text-xs font-semibold text-slate-500">
            {formatCount(users.length)} pendientes
          </div>
        </div>
        <button
          type="button"
          onClick={() => onAction()}
          disabled={!users.length}
          className={classNames(BTN_BASE, BTN_SIZES.sm, BTN_VARIANTS.secondary)}
        >
          Ver lista
        </button>
      </div>
      <div className="p-4">
        {users.length ? (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="max-h-[380px] overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Nombre</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Motivo</th>
                    <th className="px-3 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {users.map((user, index) => (
                    <tr key={getUserKey(user, index, title)} className="hover:bg-slate-50">
                      <td className="px-3 py-3 align-top">
                        <UserIdentity user={user} />
                      </td>
                      <td className="px-3 py-3 align-top text-slate-600">
                        {user.email || "—"}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-600">
                        {motive || getMissingLabel(user)}
                      </td>
                      <td className="px-3 py-3 align-top text-right">
                        <button
                          type="button"
                          onClick={() => onAction(user)}
                          className="text-xs font-bold text-blue-700 hover:text-blue-800"
                        >
                          {actionLabel}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyList label="Sin pendientes" />
        )}
      </div>
    </section>
  );
}

function CriticalTable({ users, onAction }) {
  return (
    <section className="rounded-2xl border border-rose-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-rose-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-rose-900">
            Pendientes críticos: sin EVA y sin PATH
          </h2>
          <div className="mt-0.5 text-xs font-semibold text-rose-600">
            {formatCount(users.length)} usuarios sin ambos enlaces
          </div>
        </div>
        <button
          type="button"
          onClick={() => onAction()}
          disabled={!users.length}
          className={classNames(BTN_BASE, BTN_SIZES.sm, BTN_VARIANTS.danger)}
        >
          Priorizar
        </button>
      </div>
      <div className="p-4">
        {users.length ? (
          <div className="overflow-hidden rounded-xl border border-rose-100">
            <div className="max-h-[360px] overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 z-10 bg-rose-50 text-left text-[11px] font-black uppercase tracking-wide text-rose-700">
                  <tr>
                    <th className="px-3 py-3">Nombre</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Datos disponibles</th>
                    <th className="px-3 py-3 text-right">Mejor siguiente acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {users.map((user, index) => {
                    const dataPoints = [
                      user.email ? "Email" : null,
                      user.hasCurp ? "CURP" : null,
                      getPlantelLabel(user) !== "—" ? "Plantel" : null,
                      user.missingNames ? null : "Nombre completo",
                    ].filter(Boolean);
                    return (
                      <tr key={getUserKey(user, index, "critical")} className="hover:bg-rose-50/40">
                        <td className="px-3 py-3 align-top">
                          <UserIdentity user={user} />
                        </td>
                        <td className="px-3 py-3 align-top text-slate-600">
                          {user.email || "—"}
                        </td>
                        <td className="px-3 py-3 align-top text-slate-600">
                          {dataPoints.length ? dataPoints.join(" · ") : "Mínimos"}
                        </td>
                        <td className="px-3 py-3 align-top text-right">
                          <button
                            type="button"
                            onClick={() => onAction(user)}
                            className="text-xs font-bold text-rose-700 hover:text-rose-800"
                          >
                            Revisar usuario
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyList label="Sin críticos" />
        )}
      </div>
    </section>
  );
}

function CompactWorkflowCard({ title, count, actionLabel, onOpen }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">
            {title}
          </h2>
          <div className="mt-2 text-3xl font-black tabular-nums text-slate-950">
            {formatCount(count)}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          disabled={!count}
          className={classNames(BTN_BASE, BTN_SIZES.md, BTN_VARIANTS.secondary)}
        >
          {actionLabel}
        </button>
      </div>
    </section>
  );
}

export default function VinculacionView({ openManual, openAuto }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(true);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkResult, setBulkResult] = useState("");
  const [selectedMatchIds, setSelectedMatchIds] = useState(() => new Set());
  const [namePreview, setNamePreview] = useState(null);
  const [nameLoading, setNameLoading] = useState(true);
  const [nameSyncing, setNameSyncing] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameResult, setNameResult] = useState("");
  const [selectedNameMatchIds, setSelectedNameMatchIds] = useState(() => new Set());
  const [autoSyncStatus, setAutoSyncStatus] = useState(null);
  const [autoSyncLoading, setAutoSyncLoading] = useState(true);
  const [autoSyncError, setAutoSyncError] = useState("");
  const [now, setNow] = useState(() => new Date());

  const stats = useMemo(() => getVinculacionStats(users), [users]);
  const missingEva = useMemo(() => users.filter((user) => !hasEvaLink(user)), [users]);
  const missingPath = useMemo(() => users.filter((user) => !hasPathLink(user)), [users]);
  const missingBoth = useMemo(
    () => users.filter((user) => !hasEvaLink(user) && !hasPathLink(user)),
    [users],
  );
  const unresolvedLinkCount = Math.max(
    0,
    stats.withoutEva +
      stats.withoutPath -
      (bulkPreview?.evaSet || 0) -
      (bulkPreview?.pathSet || 0) -
      (namePreview?.evaSet || 0) -
      (namePreview?.pathSet || 0),
  );

  async function fetchSummary({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/signia-missing");
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo cargar el resumen de Signia.");
      }
      setUsers(dedupeUsers(Array.isArray(data) ? data : []));
    } catch (error) {
      setLoadError(error?.message || "No se pudo cargar el resumen.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function fetchBulkPreview() {
    setBulkLoading(true);
    setBulkError("");
    try {
      const response = await fetch("/api/bulk-sync");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo calcular la coincidencia por email.");
      }
      setBulkPreview(data);
      setSelectedMatchIds(new Set((data.matches || []).map((match) => String(match.signiaId))));
    } catch (error) {
      setBulkError(error?.message || "No se pudo calcular la coincidencia por email.");
      setSelectedMatchIds(new Set());
    } finally {
      setBulkLoading(false);
    }
  }

  async function fetchNamePreview() {
    setNameLoading(true);
    setNameError("");
    try {
      const response = await fetch("/api/bulk-name-sync");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo calcular la coincidencia por nombre.");
      }
      setNamePreview(data);
      setSelectedNameMatchIds(new Set((data.matches || []).map((match) => String(match.signiaId))));
    } catch (error) {
      setNameError(error?.message || "No se pudo calcular la coincidencia por nombre.");
      setSelectedNameMatchIds(new Set());
    } finally {
      setNameLoading(false);
    }
  }

  async function fetchAutoSyncStatus({ silent = false } = {}) {
    if (!silent) setAutoSyncLoading(true);
    setAutoSyncError("");
    try {
      const response = await fetch("/api/auto-email-sync/status", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo leer el estado del auto email-match.");
      }
      setAutoSyncStatus(data);
      setNow(new Date(data.serverNow || Date.now()));
    } catch (error) {
      setAutoSyncError(error?.message || "No se pudo leer el estado del auto email-match.");
    } finally {
      if (!silent) setAutoSyncLoading(false);
    }
  }

  async function applySelectedBulkSync() {
    if (!selectedMatchIds.size) return;
    setBulkSyncing(true);
    setBulkError("");
    setBulkResult("");
    try {
      const response = await fetch("/api/bulk-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signiaIds: Array.from(selectedMatchIds) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudieron aplicar las coincidencias por email.");
      }
      setBulkResult(
        `${formatCount(data.records || data.usersUpdated || 0)} usuarios actualizados por coincidencia directa.`,
      );
      await Promise.all([
        fetchSummary({ silent: true }),
        fetchBulkPreview(),
        fetchNamePreview(),
      ]);
    } catch (error) {
      setBulkError(error?.message || "No se pudieron aplicar las coincidencias por email.");
    } finally {
      setBulkSyncing(false);
    }
  }

  async function applySelectedNameSync() {
    if (!selectedNameMatchIds.size) return;
    setNameSyncing(true);
    setNameError("");
    setNameResult("");
    try {
      const response = await fetch("/api/bulk-name-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signiaIds: Array.from(selectedNameMatchIds) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudieron aplicar las coincidencias por nombre.");
      }
      setNameResult(
        `${formatCount(data.records || data.usersUpdated || 0)} usuarios actualizados por coincidencia de nombre ${data.minScore || 95}%+.`,
      );
      await Promise.all([
        fetchSummary({ silent: true }),
        fetchBulkPreview(),
        fetchNamePreview(),
      ]);
    } catch (error) {
      setNameError(error?.message || "No se pudieron aplicar las coincidencias por nombre.");
    } finally {
      setNameSyncing(false);
    }
  }

  function openManualForUser(filter, user) {
    openManual(filter, user ? resolveSearch(user) : "");
  }

  function openManualForMatch(match) {
    const filter = match?.missingEva && match?.missingPath ? "both" : match?.missingEva ? "eva" : "path";
    openManual(filter, match?.email || match?.name || "");
  }

  useEffect(() => {
    fetchSummary();
    fetchBulkPreview();
    fetchNamePreview();
    fetchAutoSyncStatus();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchAutoSyncStatus({ silent: true });
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div className="flex-1 overflow-auto bg-[#FDFDFE] p-4 sm:p-6">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
                Vinculación
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
                Resumen EVA / PATH
              </h1>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-10">
              <StatChip label="Total Signia" value={stats.total} emphasis />
              <StatChip label="Vinculados EVA" value={stats.withEva} />
              <StatChip label="Vinculados PATH" value={stats.withPath} />
              <StatChip label="Sin EVA" value={stats.withoutEva} />
              <StatChip label="Sin PATH" value={stats.withoutPath} />
              <StatChip label="Sin ambos" value={stats.withoutBoth} emphasis />
              <StatChip
                label="Email EVA"
                value={bulkPreview?.evaReady === false ? null : bulkPreview?.evaSet ?? 0}
              />
              <StatChip label="Email PATH" value={bulkPreview?.pathSet ?? 0} />
              <StatChip
                label="Nombre EVA"
                value={namePreview?.evaReady === false ? null : namePreview?.evaSet ?? 0}
              />
              <StatChip label="Nombre PATH" value={namePreview?.pathSet ?? 0} />
            </div>
          </div>
        </header>

        <AutoSyncStatusBar
          status={autoSyncStatus}
          loading={autoSyncLoading}
          error={autoSyncError}
          now={now}
        />

        {loadError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {loadError}
          </div>
        )}
        {bulkResult && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {bulkResult}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SummaryPendingCard
            title="Sin EVA"
            count={stats.withoutEva}
            users={missingEva}
            actionLabel="Ver / revisar lista"
            onOpen={() => openManual("eva")}
          />
          <SummaryPendingCard
            title="Sin PATH"
            count={stats.withoutPath}
            users={missingPath}
            actionLabel="Ver / revisar lista"
            onOpen={() => openManual("path")}
          />
          <SummaryPendingCard
            title="Sin EVA y PATH"
            count={stats.withoutBoth}
            users={missingBoth}
            actionLabel="Priorizar"
            onOpen={() => openManual("both")}
          />
        </section>

        <EmailMatchPanel
          preview={bulkPreview}
          loading={bulkLoading}
          error={bulkError}
          selectedIds={selectedMatchIds}
          setSelectedIds={setSelectedMatchIds}
          syncing={bulkSyncing}
          onApplySelected={applySelectedBulkSync}
          onReview={() => openManual("missing")}
          onReviewUser={openManualForMatch}
        />

        <NameMatchPanel
          preview={namePreview}
          loading={nameLoading}
          error={nameError}
          selectedIds={selectedNameMatchIds}
          setSelectedIds={setSelectedNameMatchIds}
          syncing={nameSyncing}
          result={nameResult}
          onApplySelected={applySelectedNameSync}
          onReview={openAuto}
          onReviewUser={openManualForMatch}
        />

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <PendingTable
            title="Pendientes EVA"
            users={missingEva}
            actionLabel="Vincular EVA"
            motive="Sin EVA"
            onAction={(user) => openManualForUser("eva", user)}
          />
          <PendingTable
            title="Pendientes PATH"
            users={missingPath}
            actionLabel="Vincular PATH"
            motive="Sin PATH"
            onAction={(user) => openManualForUser("path", user)}
          />
        </section>

        <CriticalTable users={missingBoth} onAction={(user) => openManualForUser("both", user)} />

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CompactWorkflowCard
            title="Asociación manual"
            count={stats.withoutEva + stats.withoutPath}
            actionLabel="Abrir"
            onOpen={() => openManual("missing")}
          />
          <CompactWorkflowCard
            title="Auto-similitud"
            count={unresolvedLinkCount}
            actionLabel="Abrir"
            onOpen={openAuto}
          />
        </section>
      </div>
    </div>
  );
}
