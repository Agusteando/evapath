
"use client";
import StatusBadge from "./StatusBadge";

export default function UserStatsBar({ user, names }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-1 mt-4 px-3 py-4 bg-gradient-to-b from-indigo-50 via-white to-slate-50 border rounded-xl shadow-sm">
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge status={user.hasEva ? "ok" : "warn"} label="EVA" />
        <StatusBadge status={user.hasPath ? "ok" : "warn"} label="PATH" />
        <StatusBadge status={user.hasCurp ? "ok" : "warn"} label="CURP" />
        <StatusBadge status={names.nombres ? "ok" : "warn"} label="Nombres" />
        <StatusBadge status={names.apellidoPaterno ? "ok" : "warn"} label="Paterno" />
        <StatusBadge status={names.apellidoMaterno ? "ok" : "warn"} label="Materno" />
        <StatusBadge status={user.hasEco ? "ok" : "warn"} label="ECO" />
        <StatusBadge status={user.hasMmpi ? "ok" : "warn"} label="MMPI" />
      </div>
    </div>
  );
}
