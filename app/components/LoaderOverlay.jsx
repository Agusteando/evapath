
"use client";

export default function LoaderOverlay({
  show,
  visible,
  text,
  status,
  error,
  onRefresh,
  disabled,
}) {
  const isVisible = typeof show === "boolean" ? show : !!visible;
  if (!isVisible) return null;

  let title = "Procesando…";
  let description = text ?? "Esto puede tardar unos segundos…";

  // If a status is provided (EVA global loader), adapt messaging
  if (status) {
    if (status === "init" || status === "loading") {
      title = "Inicializando servicio EVA…";
      description =
        text ??
        "Conectando con Evaluatest y precargando candidatos. Esto puede tardar varios segundos.";
    } else if (status === "ready") {
      title = "Cargando información…";
      description = text ?? "Recuperando datos actualizados.";
    } else if (status === "error") {
      title = "Error en servicio EVA";
      description =
        text ??
        "Ocurrió un problema al conectar con Evaluatest. Puedes intentar actualizar nuevamente.";
    }
  } else if (text) {
    // Legacy CURP/GPT use: keep original wording
    title = "Procesando CURP con GPT…";
    description = text;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white/95 rounded-xl shadow-2xl px-8 py-8 min-w-[320px] flex flex-col items-center">
        <svg className="h-10 w-10 mb-4 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20" />
          <path
            d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
            fill="currentColor"
            className="opacity-80"
          />
        </svg>
        <span className="font-bold text-gray-900 text-lg mb-2 text-center">{title}</span>
        <span className="block text-xs text-gray-500 text-center max-w-xs">{description}</span>
        {error && (
          <span className="mt-2 text-xs text-rose-600 text-center max-w-xs">
            {error}
          </span>
        )}
        {onRefresh && (
          <button
            type="button"
            className="mt-4 inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
            onClick={onRefresh}
            disabled={disabled}
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
