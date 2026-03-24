"use client";
import { classNames } from "../lib/designTokens";

export default function StatusBadge({ status, label, className = "", ...props }) {
  let color = "slate";
  let icon = "•";

  // Infer styling intelligently based on label text to make EVA states look great automatically
  if (status === "ok" || label === "Evaluado" || label === "Aceptado") { 
    color = "emerald"; icon = "✓"; 
  }
  else if (status === "warn" || label === "Evaluando") { 
    color = "amber"; icon = "⟳"; 
  }
  else if (label === "Invitado" || label === "Postulado") { 
    color = "indigo"; icon = "✉"; 
  }
  else if (status === "edit" || status === "info") { 
    color = "blue"; icon = "ℹ"; 
  }
  else if (status === "err" || label === "Rechazado") { 
    color = "rose"; icon = "✕"; 
  }

  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };

  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold shadow-sm transition-shadow whitespace-nowrap",
        colorMap[color] || colorMap.slate,
        className
      )}
      {...props}
    >
      <span className="leading-none text-[10px]">{icon}</span>
      <span className="leading-none uppercase tracking-wide">{label}</span>
    </span>
  );
}