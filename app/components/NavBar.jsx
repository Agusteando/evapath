"use client";
import { classNames, BTN_BASE, BTN_SIZES, BTN_VARIANTS } from "../lib/designTokens";

export default function NavBar({
  currIdx,
  total,
  setIdx,
  setLinkMode,
}) {
  const pageStr = `${total ? currIdx + 1 : 0} de ${total}`;

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
          disabled={currIdx === 0}
          onClick={() => setIdx(Math.max(currIdx - 1, 0))}
          type="button"
        >
          ⟸ Anterior
        </button>
        <button
          className={classNames(BTN_BASE, BTN_SIZES.xs, BTN_VARIANTS.secondary)}
          disabled={currIdx === total - 1}
          onClick={() => setIdx(Math.min(currIdx + 1, total - 1))}
          type="button"
        >
          Siguiente ⟹
        </button>
        <button
          className={classNames(BTN_BASE, BTN_SIZES.xs, BTN_VARIANTS.ghost)}
          onClick={() => setLinkMode()}
          type="button"
        >
          Volver al listado
        </button>
      </div>
    </div>
  );
}
