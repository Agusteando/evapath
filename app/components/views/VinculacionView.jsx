"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BTN_BASE,
  BTN_SIZES,
  BTN_VARIANTS,
  SPINNER,
  classNames,
} from "../../lib/designTokens";
import { getVinculacionStats } from "../../lib/linkingStats";

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

function StatCard({ label, value, description, actionLabel, tone, onClick }) {
  const toneClasses = {
    amber:
      "border-amber-200 bg-amber-50/70 text-amber-900 hover:border-amber-300 hover:bg-amber-50",
    emerald:
      "border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:border-emerald-300 hover:bg-emerald-50",
    rose: "border-rose-200 bg-rose-50/70 text-rose-900 hover:border-rose-300 hover:bg-rose-50",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "group rounded-2xl border p-5 text-left shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        toneClasses[tone] || toneClasses.amber,
      )}
    >
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-5xl font-black tracking-tight text-slate-950">
        {value}
      </div>
      <p className="mt-3 min-h-10 text-sm leading-5 text-slate-600">
        {description}
      </p>
      <div className="mt-5 flex items-center justify-between text-sm font-bold text-slate-800">
        <span>{actionLabel}</span>
        <span className="transition-transform group-hover:translate-x-1">
          →
        </span>
      </div>
    </button>
  );
}

function BulkEmailMatchPanel({
  preview,
  loading,
  error,
  syncing,
  onPreview,
  onSync,
}) {
  const hasPreview = Boolean(preview);
  const total = preview?.records ?? 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Coincidencias masivas por email
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Antes de vincular manualmente, revisa cuántos registros pendientes
            tienen una coincidencia directa por email en EVA o PATH. La consulta
            no cambia datos; sólo calcula la oportunidad.
          </p>
        </div>
        <button
          type="button"
          onClick={onPreview}
          disabled={loading || syncing}
          className={classNames(
            BTN_BASE,
            BTN_SIZES.md,
            BTN_VARIANTS.secondary,
            "shrink-0",
          )}
        >
          {loading && (
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
          Calcular coincidencias por email
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {hasPreview && (
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Registros
              </div>
              <div className="mt-1 text-3xl font-black text-slate-900">
                {total}
              </div>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                EVA
              </div>
              <div className="mt-1 text-3xl font-black text-slate-900">
                {preview.evaSet ?? 0}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                PATH
              </div>
              <div className="mt-1 text-3xl font-black text-slate-900">
                {preview.pathSet ?? 0}
              </div>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Ambos
              </div>
              <div className="mt-1 text-3xl font-black text-slate-900">
                {preview.bothSet ?? 0}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onSync}
            disabled={syncing || loading || total === 0}
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
            Aplicar coincidencias por email
          </button>
        </div>
      )}

      {preview?.evaReady === false && (
        <p className="mt-3 text-xs font-semibold text-amber-700">
          EVA todavía no está listo; el conteo de EVA puede estar incompleto.
          Estado actual: {preview.evaStatus || "desconocido"}.
        </p>
      )}
    </section>
  );
}

export default function VinculacionView({ openManual, openAuto }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [bulkError, setBulkError] = useState("");

  const stats = useMemo(() => getVinculacionStats(users), [users]);

  async function fetchSummary() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/signia-missing");
      if (!response.ok)
        throw new Error("No se pudo cargar el resumen de Signia.");
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      setLoadError(error?.message || "No se pudo cargar el resumen.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchBulkPreview() {
    setBulkLoading(true);
    setBulkError("");
    try {
      const response = await fetch("/api/bulk-sync");
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          data?.error || "No se pudo calcular la coincidencia por email.",
        );
      setBulkPreview(data);
    } catch (error) {
      setBulkError(
        error?.message || "No se pudo calcular la coincidencia por email.",
      );
    } finally {
      setBulkLoading(false);
    }
  }

  async function applyBulkSync() {
    setBulkSyncing(true);
    setBulkError("");
    try {
      const response = await fetch("/api/bulk-sync", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          data?.error || "No se pudieron aplicar las coincidencias por email.",
        );
      setBulkPreview({
        ...data,
        records:
          data.records ??
          data.usersUpdated ??
          (data.evaSet || 0) + (data.pathSet || 0),
      });
      await fetchSummary();
    } catch (error) {
      setBulkError(
        error?.message || "No se pudieron aplicar las coincidencias por email.",
      );
    } finally {
      setBulkSyncing(false);
    }
  }

  useEffect(() => {
    fetchSummary();
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div className="flex-1 overflow-auto bg-[#FDFDFE] p-6">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
                Vinculación
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                Pendientes de asociación Signia
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Revisa primero los faltantes principales y entra directo al
                flujo que corresponde. Los conteos usan los enlaces actuales de
                Signia para EVA y PATH.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Total Signia
              </div>
              <div className="text-3xl font-black text-slate-950">
                {stats.total}
              </div>
              <div className="text-xs text-slate-500">
                {stats.complete} completos
              </div>
            </div>
          </div>
        </header>

        {loadError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {loadError}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <StatCard
            label="Sin EVA"
            value={stats.withoutEva}
            description="Usuarios de Signia que aún no tienen evaluación EVA vinculada."
            actionLabel="Abrir asociación manual para EVA"
            tone="amber"
            onClick={() => openManual("eva")}
          />
          <StatCard
            label="Sin PATH"
            value={stats.withoutPath}
            description="Usuarios de Signia que aún no tienen expediente PATH vinculado."
            actionLabel="Abrir asociación manual para PATH"
            tone="emerald"
            onClick={() => openManual("path")}
          />
          <StatCard
            label="Sin ambos"
            value={stats.withoutBoth}
            description="Usuarios sin EVA ni PATH; conviene resolverlos como primer bloque."
            actionLabel="Abrir pendientes críticos"
            tone="rose"
            onClick={() => openManual("both")}
          />
        </section>

        <BulkEmailMatchPanel
          preview={bulkPreview}
          loading={bulkLoading}
          error={bulkError}
          syncing={bulkSyncing}
          onPreview={fetchBulkPreview}
          onSync={applyBulkSync}
        />

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">
              Asociación Manual
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Úsala cuando necesites revisar expediente, CURP, nombres y
              candidatos antes de confirmar un enlace.
            </p>
            <button
              type="button"
              onClick={() => openManual("missing")}
              className={classNames(
                BTN_BASE,
                BTN_SIZES.md,
                BTN_VARIANTS.secondary,
                "mt-4",
              )}
            >
              Abrir revisión manual
            </button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Auto-Similitud</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Úsala para recorrer sugerencias de similitud de nombre y email
              cuando no hay coincidencia directa por email.
            </p>
            <button
              type="button"
              onClick={openAuto}
              className={classNames(
                BTN_BASE,
                BTN_SIZES.md,
                BTN_VARIANTS.secondary,
                "mt-4",
              )}
            >
              Abrir auto-similitud
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
