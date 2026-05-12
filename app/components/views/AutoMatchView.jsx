"use client";
import { useState, useEffect } from "react";
import AutoSimilarity from "../AutoSimilarity";

export default function AutoMatchView({ setView }) {
  const [data, setData] = useState({
    signia: [],
    eva: [],
    path: [],
    loading: true,
    error: "",
  });

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [sigRes, evaRes, pathRes] = await Promise.all([
          fetch("/api/signia-users?page=1&pageSize=5000"),
          fetch("/api/evaluatest-users?page=1&pageSize=5000"),
          fetch("/api/reclutamiento-users?page=1&pageSize=5000"),
        ]);

        const [sig, eva, path] = await Promise.all([
          sigRes.json(),
          evaRes.json(),
          pathRes.json(),
        ]);

        if (!sigRes.ok)
          throw new Error(
            sig?.error || "No se pudieron cargar usuarios Signia",
          );
        if (!pathRes.ok)
          throw new Error(path?.error || "No se pudieron cargar usuarios PATH");

        setData({
          signia: sig.users || [],
          eva: eva.users || [],
          path: path.users || [],
          loading: false,
          error:
            eva?.loading || eva?.ready === false
              ? "EVA todavía está inicializando; las sugerencias EVA pueden aparecer vacías."
              : "",
        });
      } catch (e) {
        console.error(e);
        setData((prev) => ({
          ...prev,
          loading: false,
          error: e?.message || "No se pudieron cargar los datos.",
        }));
      }
    };
    fetchAll();
  }, []);

  async function postAssociation(sid, source, cid) {
    const response = await fetch("/api/associate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signiaId: sid, source, cid }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        payload?.error || `No se pudo asociar ${source.toUpperCase()}`,
      );
    return payload;
  }

  async function handleMatchEva(sid, cid) {
    await postAssociation(sid, "eva", cid);
    setData((prev) => ({
      ...prev,
      signia: prev.signia.map((user) =>
        user.id === sid ? { ...user, evaId: +cid, hasEva: true } : user,
      ),
    }));
  }

  async function handleMatchPath(sid, cid) {
    await postAssociation(sid, "path", cid);
    setData((prev) => ({
      ...prev,
      signia: prev.signia.map((user) =>
        user.id === sid ? { ...user, pathId: +cid, hasPath: true } : user,
      ),
    }));
  }



  if (data.loading) {
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
        Preparando motor de auto-similitud...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[#FDFDFE] p-6">
      {data.error && (
        <div className="mx-auto mb-4 max-w-7xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {data.error}
        </div>
      )}
      <AutoSimilarity
        signiaUsers={data.signia}
        evaUsers={data.eva}
        pathUsers={data.path}
        onMatchEva={handleMatchEva}
        onMatchPath={handleMatchPath}
        onBack={() => setView("vinculacion")}
        loading={false}
      />
    </div>
  );
}
