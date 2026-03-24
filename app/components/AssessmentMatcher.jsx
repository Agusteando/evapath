
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { BTN_BASE, BTN_SIZES, BTN_VARIANTS, classNames } from "../lib/designTokens";
import { computeNameMatchScore } from "../lib/nameMatch";

/**
 * AssessmentMatcher
 *
 * Interactive, approval-based auto-matching pipeline for ECO / MMPI tests:
 * - Works only on Signia users missing at least one of ECO / MMPI.
 * - Uses strict per-word matching with ≥2/3 coverage and high per-word similarity.
 * - Shows at most 5 viable PATH candidates; you can accept one or skip.
 */
export default function AssessmentMatcher({
  signiaUsers,
  pathUsers,
  onAssignPath,
  onBack,
}) {
  const [localSignia, setLocalSignia] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [stats, setStats] = useState({ accepted: 0, skipped: 0 });

  // Initialize local Signia view with ECO/MMPI presence flags
  useEffect(() => {
    const enriched = (signiaUsers || []).map((u) => {
      const links = u.pathLinks || [];
      const hasEco = links.some((l) => l.label === "ECO");
      const hasMmpi = links.some((l) => l.label === "MMPI-2 RF");
      return { ...u, hasEco, hasMmpi };
    });
    setLocalSignia(enriched);
    setCurrentIdx(0);
    setStats({ accepted: 0, skipped: 0 });
  }, [signiaUsers]);

  // PATH users enriched with ECO/MMPI presence
  const pathWithTests = useMemo(() => {
    const list = (pathUsers || []).map((p) => {
      const links = p.pathLinks || [];
      const hasEco = links.some((l) => l.label === "ECO");
      const hasMmpi = links.some((l) => l.label === "MMPI-2 RF");
      return { ...p, hasEco, hasMmpi };
    });
    const filtered = list.filter((p) => p.hasEco || p.hasMmpi);
    console.log("[AssessmentMatcher] PATH users with tests:", filtered.length);
    return filtered;
  }, [pathUsers]);

  // Signia users missing at least one of ECO / MMPI
  const signiaCandidates = useMemo(() => {
    const list = localSignia.filter((u) => !u.hasEco || !u.hasMmpi);
    console.log("[AssessmentMatcher] Signia users missing ECO/MMPI:", list.length);
    return list;
  }, [localSignia]);

  const currentSignia =
    signiaCandidates.length > 0 && currentIdx < signiaCandidates.length
      ? signiaCandidates[currentIdx]
      : null;

  // Compute viable matches for current Signia user using strict per-word logic
  const matches = useMemo(() => {
    if (!currentSignia) return [];

    const missingEco = !currentSignia.hasEco;
    const missingMmpi = !currentSignia.hasMmpi;

    const signiaName = currentSignia.name || "";
    const signiaEmail = currentSignia.email || "";

    console.log("[AssessmentMatcher] Matching for Signia user", {
      id: currentSignia.id,
      name: signiaName,
      email: signiaEmail,
      missingEco,
      missingMmpi,
    });

    const results = pathWithTests
      .filter((p) => {
        // Candidate must provide at least one missing test
        return (missingEco && p.hasEco) || (missingMmpi && p.hasMmpi);
      })
      .map((p) => {
        const candidateName = p.nombre || "";
        const candidateEmail = p.email || "";
        const metrics = computeNameMatchScore(
          signiaName,
          candidateName,
          signiaEmail,
          candidateEmail
        );
        return {
          signia: currentSignia,
          candidate: p,
          ...metrics,
        };
      })
      // Keep only viable candidates based on strict coverage/per-word thresholds
      .filter((m) => m.viable)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    console.log(
      "[AssessmentMatcher] Viable matches:",
      results.map((m, idx) => ({
        rank: idx + 1,
        name: m.candidate.nombre,
        email: m.candidate.email,
        score: m.score,
        coverageA: m.coverageA,
        matchedCount: m.matchedCount,
        avgWordSim: m.avgWordSim,
        globalSim: m.globalSim,
        emailScore: m.emailScore,
      }))
    );

    return results;
  }, [currentSignia, pathWithTests]);

  const bestMatch = matches[0];

  // Clamp index if candidates shrink due to accepted matches
  useEffect(() => {
    if (currentIdx >= signiaCandidates.length && signiaCandidates.length > 0) {
      setCurrentIdx(signiaCandidates.length - 1);
    }
  }, [currentIdx, signiaCandidates.length]);

  // Keyboard shortcuts: A (accept best), S (skip), 1-5 (choose), ESC (back)
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (!currentSignia || processing) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      if ((e.key === "a" || e.key === "A" || e.key === "Enter") && bestMatch) {
        e.preventDefault();
        await handleAccept(bestMatch);
      }

      if (e.key === "s" || e.key === "S" || e.key === " ") {
        e.preventDefault();
        handleSkip();
      }

      if (e.key >= "1" && e.key <= "5") {
        const idx = parseInt(e.key, 10) - 1;
        if (matches[idx]) {
          e.preventDefault();
          await handleAccept(matches[idx]);
        }
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [bestMatch, matches, currentSignia, processing, onBack]);

  async function handleAccept(match) {
    if (!match || !currentSignia) return;
    setProcessing(true);
    try {
      const pathCandidate = match.candidate;

      await onAssignPath(currentSignia.id, pathCandidate.id);

      setStats((s) => ({ ...s, accepted: s.accepted + 1 }));
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 800);

      // Optimistically update local Signia view
      setLocalSignia((prev) => {
        const updated = prev.map((u) =>
          u.id === currentSignia.id
            ? {
                ...u,
                pathId: pathCandidate.id,
                pathLinks: pathCandidate.pathLinks || [],
                hasEco: pathCandidate.hasEco,
                hasMmpi: pathCandidate.hasMmpi,
              }
            : u
        );
        return updated;
      });

      if (currentIdx < signiaCandidates.length - 1) {
        setCurrentIdx((i) => i + 1);
      }
    } catch (err) {
      console.error("[AssessmentMatcher] Error accepting match:", err);
      alert("Error al asociar ECO/MMPI con PATH");
    } finally {
      setProcessing(false);
    }
  }

  function handleSkip() {
    setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
    if (currentIdx < signiaCandidates.length - 1) {
      setCurrentIdx((i) => i + 1);
    }
  }

  if (!signiaUsers?.length || !pathUsers?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <svg
          className="animate-spin h-16 w-16 text-indigo-600 mb-4"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">
          Cargando datos de ECO / MMPI...
        </h2>
        <p className="text-sm text-slate-600">
          Esto puede tardar unos segundos mientras se carga Signia y PATH.
        </p>
      </div>
    );
  }

  if (!signiaCandidates.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <svg
          className="w-20 h-20 text-emerald-500 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">
          ¡No hay usuarios pendientes!
        </h2>
        <p className="text-slate-600 mb-6 text-center max-w-md">
          Todos los usuarios de Signia tienen asignadas pruebas ECO y MMPI, o
          no hay candidatos disponibles en PATH con dichas pruebas.
        </p>
        <button
          type="button"
          className={classNames(BTN_BASE, BTN_SIZES.md, BTN_VARIANTS.primary)}
          onClick={onBack}
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  if (!currentSignia) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">
          Proceso completado
        </h2>
        <p className="text-slate-600 mb-4">
          No hay más usuarios pendientes de ECO/MMPI.
        </p>
        <button
          type="button"
          className={classNames(BTN_BASE, BTN_SIZES.md, BTN_VARIANTS.primary)}
          onClick={onBack}
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  const missingEco = !currentSignia.hasEco;
  const missingMmpi = !currentSignia.hasMmpi;

  return (
    <div className="w-full max-w-6xl mx-auto mt-2 pb-10">
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-emerald-500 text-white rounded-full p-6 shadow-2xl animate-ping">
            <svg
              className="w-12 h-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-4 bg-gradient-to-r from-emerald-50 via-blue-50 to-purple-50 rounded-xl border-2 border-emerald-200 p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-emerald-900">
                🤖 Auto-asociación ECO / MMPI
              </h1>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-md">
                Aprobación manual
              </span>
            </div>
            <p className="text-sm text-slate-700">
              Mostrando sólo usuarios de Signia que aún no tienen ECO o MMPI.
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black text-emerald-600">
              {currentIdx + 1} / {signiaCandidates.length}
            </div>
            <div className="text-xs text-slate-500">
              ✓ {stats.accepted} aceptados • ⏭ {stats.skipped} saltados
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="mb-4 text-center">
        <div className="inline-flex flex-wrap items-center gap-3 bg-gradient-to-r from-purple-50 via-pink-50 to-orange-50 rounded-full px-5 py-2 text-xs text-slate-600 border border-purple-100 shadow-sm justify-center">
          <span className="font-semibold text-purple-700">⌨️ Atajos:</span>
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-white rounded border border-slate-300 font-mono">
              A
            </kbd>
            <span>Aceptar mejor opción</span>
          </div>
          <span className="text-slate-300">•</span>
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-white rounded border border-slate-300 font-mono">
              S
            </kbd>
            <span>Saltar</span>
          </div>
          <span className="text-slate-300">•</span>
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-white rounded border border-slate-300 font-mono">
              1–5
            </kbd>
            <span>Elegir candidato</span>
          </div>
          <span className="text-slate-300">•</span>
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-white rounded border border-slate-300 font-mono">
              ESC
            </kbd>
            <span>Salir</span>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: current Signia user */}
        <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border-2 border-emerald-200 shadow-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-emerald-100 rounded-full p-3">
              <svg
                className="w-8 h-8 text-emerald-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-700 uppercase tracking-wide">
                Usuario Signia
              </h3>
              <p className="text-xs text-slate-500">
                Falta ECO, MMPI o ambas pruebas
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-inner border border-emerald-100">
            <h2 className="text-xl font-bold text-slate-900 mb-1">
              {currentSignia.name || "Sin nombre"}
            </h2>
            <p className="text-sm text-slate-600 font-mono mb-2">
              {currentSignia.email || "Sin email"}
            </p>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className={classNames(
                  "px-2 py-0.5 rounded-full text-[11px] font-bold",
                  currentSignia.hasEco
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-400"
                    : "bg-amber-50 text-amber-800 border border-amber-300"
                )}
              >
                ECO: {currentSignia.hasEco ? "OK" : "FALTA"}
              </span>
              <span
                className={classNames(
                  "px-2 py-0.5 rounded-full text-[11px] font-bold",
                  currentSignia.hasMmpi
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-400"
                    : "bg-amber-50 text-amber-800 border border-amber-300"
                )}
              >
                MMPI: {currentSignia.hasMmpi ? "OK" : "FALTA"}
              </span>
            </div>
            {currentSignia.fechaIngresoISO && (
              <p className="text-xs text-slate-500">
                Ingreso:{" "}
                {new Date(
                  currentSignia.fechaIngresoISO
                ).toLocaleDateString("es-ES")}
              </p>
            )}
          </div>
        </div>

        {/* Right: PATH candidates with ECO/MMPI */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">
            📊 ¿Es esta la persona correcta?
          </h3>

          {matches.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
              <p className="text-amber-800 font-semibold mb-2">
                No se encontraron candidatos adecuados en PATH
              </p>
              <p className="text-sm text-amber-600 mb-4">
                No hay coincidencias con pruebas ECO/MMPI para este usuario
                bajo las reglas estrictas de nombres.
              </p>
              <button
                type="button"
                className={classNames(
                  BTN_BASE,
                  BTN_SIZES.md,
                  BTN_VARIANTS.warning
                )}
                onClick={handleSkip}
                disabled={processing}
              >
                ⏭️ Saltar usuario
              </button>
            </div>
          ) : (
            matches.map((match, idx) => {
              const candidate = match.candidate;
              const providesEco = missingEco && candidate.hasEco;
              const providesMmpi = missingMmpi && candidate.hasMmpi;

              return (
                <div
                  key={candidate.id || idx}
                  className={classNames(
                    "bg-white rounded-xl border-2 p-4 shadow-md transition-all hover:shadow-lg",
                    idx === 0 && match.score >= 70
                      ? "border-emerald-400 bg-gradient-to-br from-emerald-50 to-white ring-2 ring-emerald-300"
                      : match.score >= 50
                      ? "border-blue-300 hover:border-blue-400"
                      : "border-slate-200 opacity-90"
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-500">
                          #{idx + 1}
                        </span>
                        <h4 className="text-base font-bold text-slate-900">
                          {candidate.nombre || "Sin nombre"}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-600 font-mono">
                        {candidate.email || "Sin email"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        {providesEco && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-400 font-semibold">
                            ECO ✓
                          </span>
                        )}
                        {providesMmpi && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-400 font-semibold">
                            MMPI ✓
                          </span>
                        )}
                        {!providesEco && !providesMmpi && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300 font-semibold">
                            Ya tiene todas las pruebas
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={classNames(
                          "text-2xl font-black mb-1",
                          match.score >= 80
                            ? "text-emerald-600"
                            : match.score >= 60
                            ? "text-blue-600"
                            : "text-slate-400"
                        )}
                      >
                        {match.score}%
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">
                        {match.score >= 85
                          ? "Excelente"
                          : match.score >= 70
                          ? "Muy buena"
                          : match.score >= 60
                          ? "Aceptable"
                          : "Baja"}
                      </div>
                    </div>
                  </div>

                  {idx === 0 && match.score >= 60 && (
                    <div className="mt-3">
                      <button
                        type="button"
                        className={classNames(
                          BTN_BASE,
                          BTN_SIZES.sm,
                          match.score >= 80
                            ? BTN_VARIANTS.success
                            : BTN_VARIANTS.primary,
                          "w-full"
                        )}
                        onClick={() => handleAccept(match)}
                        disabled={processing}
                      >
                        {processing
                          ? "Procesando..."
                          : `✓ Sí, es esta persona (A)`}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          <button
            type="button"
            className={classNames(
              BTN_BASE,
              BTN_SIZES.md,
              BTN_VARIANTS.ghost,
              "w-full"
            )}
            onClick={handleSkip}
            disabled={processing}
          >
            ⏭️ Saltar este usuario (S)
          </button>
        </div>
      </div>
    </div>
  );
}
