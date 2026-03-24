
"use client";
import { classNames, BTN_BASE, BTN_SIZES, BTN_VARIANTS, SPINNER } from "../lib/designTokens";

export default function NavBar({
  currIdx,
  total,
  setIdx,
  setLinkMode,
  gptExtracting,
  gptBulk,
  gptBulkStopped,
  canExtractCurpGpt,
  handleGptExtractManual,
  handleBulkTrigger,
  handleGptBulkStop,
  gptBulkProgress,
  allExtractable
}) {
  const pageStr = `${total ? currIdx + 1 : 0} de ${total}`;
  const extractNamesTooltip = canExtractCurpGpt
    ? "Extrae o rellena automáticamente los nombres desde la CURP adjunta usando GPT."
    : "Todos los campos están presentes. Puedes extraer de nuevo si deseas corregir.";

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-2 px-3 py-2 mb-2 bg-gradient-to-r from-indigo-100/40 to-white rounded-xl border-2 border-indigo-100">
      <div className="flex items-center gap-3">
        <span className="text-xl font-extrabold tracking-tight text-indigo-800">🏷️ Asociar usuario</span>
        <span className="ml-3 text-xs bg-indigo-100 text-indigo-700 rounded px-2 py-1 font-bold">
          Progreso {pageStr}
        </span>
      </div>
      <div className="flex flex-col md:flex-row gap-1 md:gap-3 flex-wrap items-center">
        <button
          className={classNames(BTN_BASE, BTN_SIZES.xs, BTN_VARIANTS.secondary)}
          disabled={currIdx === 0 || gptExtracting || gptBulk}
          onClick={() => setIdx(Math.max(currIdx - 1, 0))}
        >
          ⟸ Anterior
        </button>
        <button
          className={classNames(BTN_BASE, BTN_SIZES.xs, BTN_VARIANTS.secondary)}
          disabled={currIdx === total - 1 || gptExtracting || gptBulk}
          onClick={() => setIdx(Math.min(currIdx + 1, total - 1))}
        >
          Siguiente ⟹
        </button>
        <button
          className={classNames(BTN_BASE, BTN_SIZES.xs, BTN_VARIANTS.ghost)}
          onClick={() => setLinkMode()}
          disabled={gptExtracting || gptBulk}
        >
          Volver al listado
        </button>
        <button
          className={classNames(
            BTN_BASE,
            BTN_SIZES.sm,
            BTN_VARIANTS.secondary,
            canExtractCurpGpt && "hover:bg-blue-50 hover:text-blue-800"
          )}
          disabled={!canExtractCurpGpt}
          title={extractNamesTooltip}
          onClick={handleGptExtractManual}
          aria-label="Extrae automáticamente nombres desde CURP usando GPT"
        >
          {gptExtracting ? (
            <svg className={SPINNER} viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" />
            </svg>
          ) : (
            <span>🤖</span>
          )}
          <span>Extraer nombres desde CURP</span>
        </button>
        {gptBulk ? (
          <button
            className={classNames(BTN_BASE, BTN_SIZES.sm, BTN_VARIANTS.danger)}
            onClick={handleGptBulkStop}
            disabled={gptExtracting}
          >
            🛑 Detener extracción TODOS
          </button>
        ) : (
          <button
            className={classNames(BTN_BASE, BTN_SIZES.sm, BTN_VARIANTS.primary)}
            disabled={gptBulk || allExtractable.length === 0}
            onClick={handleBulkTrigger}
          >
            🤖 Extraer TODOS con GPT
          </button>
        )}
        {gptBulk && (
          <span className="text-xs font-mono text-indigo-700 ml-1">
            {`Progreso: ${gptBulkProgress.done} / ${gptBulkProgress.total}`}
          </span>
        )}
      </div>
    </div>
  );
}
