"use client";
import { useState, useEffect } from "react";
import AutoSimilarity from "../AutoSimilarity"; 

export default function AutoMatchView({ setView }) {
  const [data, setData] = useState({ signia: [], eva: [], path: [], loading: true });

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [sigRes, evaRes, pathRes] = await Promise.all([
          fetch("/api/signia-users?page=1&pageSize=5000"),
          fetch("/api/evaluatest-users?page=1&pageSize=5000"),
          fetch("/api/reclutamiento-users?page=1&pageSize=5000")
        ]);
        
        const [sig, eva, path] = await Promise.all([
          sigRes.json(), evaRes.json(), pathRes.json()
        ]);

        setData({
          signia: sig.users || [],
          eva: eva.users || [],
          path: path.users || [],
          loading: false
        });
      } catch (e) {
        console.error(e);
        setData((prev) => ({ ...prev, loading: false }));
      }
    };
    fetchAll();
  }, []);

  const handleMatchEva = async (sid, cid) => fetch("/api/associate", { method: "POST", body: JSON.stringify({ signiaId: sid, source: "eva", cid }) });
  const handleMatchPath = async (sid, cid) => fetch("/api/associate", { method: "POST", body: JSON.stringify({ signiaId: sid, source: "path", cid }) });

  if (data.loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#FDFDFE] text-slate-500">
        <svg className="animate-spin h-8 w-8 text-blue-500 mb-4" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20" />
          <path d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" fill="currentColor" className="opacity-80" />
        </svg>
        Preparando motor de auto-similitud...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[#FDFDFE] p-6">
      <AutoSimilarity 
        signiaUsers={data.signia} 
        evaUsers={data.eva} 
        pathUsers={data.path}
        onMatchEva={handleMatchEva}
        onMatchPath={handleMatchPath}
        onBack={() => setView('recents')}
        loading={false}
      />
    </div>
  );
}