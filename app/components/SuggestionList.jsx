"use client";

function confidenceLabel(confidence) {
  if (confidence === "high") return "Alta";
  if (confidence === "medium") return "Media";
  if (confidence === "low") return "Baja";
  return "Débil";
}

function badgeClasses(tone) {
  if (tone === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "info") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function confidenceClasses(confidence) {
  if (confidence === "high") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (confidence === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  if (confidence === "low") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

export default function SuggestionList({
  title,
  list,
  onAssociate,
  disabled,
  loadingForId,
  emptyMessage = "No hay registros que coincidan con esta búsqueda.",
}) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="px-1 text-xs font-semibold text-slate-700">{title}</h4>
      <div className="rounded-lg border border-slate-100 bg-white max-h-[360px] overflow-y-auto min-w-[172px] shadow-sm">
        {list.length === 0 ? (
          <div className="p-3 text-xs leading-5 text-slate-500">{emptyMessage}</div>
        ) : (
          list.map((item) => {
            const isLoading = loadingForId === item.cid;
            const isCurrent = item.linkStatus?.state === "linked_to_current";
            const isConflict = item.linkStatus?.state === "linked_to_other";
            const canLink = item.actions?.canLink !== false && !isCurrent;
            const isDisabled = disabled || !!loadingForId || !canLink;
            const actionLabel = isCurrent ? "Actual" : isConflict ? "Reasociar" : "Asociar";

            return (
              <article
                key={item.cid || item.email || item.name}
                className="border-b border-slate-100 px-3 py-3 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold leading-tight text-slate-950">
                      {item.name || item.label}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${confidenceClasses(item.confidence)}`}>
                        {confidenceLabel(item.confidence)} {typeof item.score === "number" ? `${item.score}%` : ""}
                      </span>
                      {item.linkStatus?.label && (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClasses(item.linkStatus.tone)}`}>
                          {item.linkStatus.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => onAssociate(item)}
                    disabled={isDisabled}
                    type="button"
                    title={item.actions?.disabledReason || ""}
                  >
                    {isLoading ? "Guardando" : actionLabel}
                  </button>
                </div>

                {item.email && (
                  <div className="mt-1 truncate text-[11px] font-medium text-slate-500">
                    {item.email}
                  </div>
                )}
                {item.puesto && (
                  <div className="mt-1 truncate text-[11px] text-indigo-500">
                    {item.puesto}
                  </div>
                )}
                {item.tests && (item.tests.eco || item.tests.mmpi) && (
                  <div className="mt-1 text-[11px] font-semibold text-emerald-700">
                    {[item.tests.eco ? "ECO" : null, item.tests.mmpi ? "MMPI" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
                {item.linkStatus?.state === "linked_to_other" && (
                  <div className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-2 py-1.5 text-[11px] font-medium text-rose-700">
                    Vinculado a {item.linkStatus.signiaName || "otro Signia"}
                    {item.linkStatus.signiaEmail ? ` · ${item.linkStatus.signiaEmail}` : ""}
                  </div>
                )}
                {Array.isArray(item.reasons) && item.reasons.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-[11px] leading-4 text-slate-500">
                    {item.reasons.slice(0, 3).map((reason) => (
                      <li key={reason}>• {reason}</li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
