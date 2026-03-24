"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { BTN_BASE, BTN_SIZES, BTN_VARIANTS, classNames } from "../lib/designTokens";
import { computeNameMatchScore } from "../lib/nameMatch";

export default function AutoSimilarity({
  signiaUsers,
  evaUsers,
  pathUsers,
  onMatchEva,
  onMatchPath,
  onBack,
  loading,
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuccess, setShowSuccess] = useState(null); // 'eva' | 'path' | null
  
  // Stats
  const [stats, setStats] = useState({
    eva: 0,
    path: 0,
    skipped: 0
  });

  // 1. Filter: Users missing EITHER Eva OR Path
  const usersToMatch = useMemo(() => {
    let list = (signiaUsers || []).filter(
      (u) => !u.evaId || !u.pathId
    );

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(u => 
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [signiaUsers, searchTerm]);

  // Reset index if list changes
  useEffect(() => {
    if (currentIdx >= usersToMatch.length && usersToMatch.length > 0) {
      setCurrentIdx(0);
    }
  }, [usersToMatch.length, currentIdx]);

  const currentSignia = usersToMatch[currentIdx] || null;

  // 2. Map existing owners for "Taken" check
  const evaOwnerMap = useMemo(() => {
    const map = new Map();
    signiaUsers.forEach(u => { if(u.evaId) map.set(String(u.evaId), u); });
    return map;
  }, [signiaUsers]);

  const pathOwnerMap = useMemo(() => {
    const map = new Map();
    signiaUsers.forEach(u => { if(u.pathId) map.set(String(u.pathId), u); });
    return map;
  }, [signiaUsers]);

  // 3. Compute Matches
  const { evaMatches, pathMatches } = useMemo(() => {
    if (!currentSignia) return { evaMatches: [], pathMatches: [] };

    const signiaName = currentSignia.name || "";
    // Build full name for PATH matching (often better than username)
    const fullName = [
      currentSignia.nombres,
      currentSignia.apellidoPaterno,
      currentSignia.apellidoMaterno
    ].filter(Boolean).join(" ");
    
    const signiaEmail = currentSignia.email || "";

    // --- Match EVA ---
    let evaM = [];
    if (!currentSignia.evaId) {
       evaM = evaUsers
        .map((source) => {
            const metrics = computeNameMatchScore(
                signiaName || fullName, 
                source.nombre || "",
                signiaEmail,
                source.correo || ""
            );
            return {
                source,
                ...metrics,
                takenBy: evaOwnerMap.get(String(source.CID))
            };
        })
        .filter((m) => m.viable)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    }

    // --- Match PATH ---
    let pathM = [];
    if (!currentSignia.pathId) {
      pathM = pathUsers
        .map((source) => {
             const metrics = computeNameMatchScore(
                 fullName || signiaName, 
                 source.nombre || "",
                 signiaEmail,
                 source.email || ""
             );
             return {
                 source,
                 ...metrics,
                 takenBy: pathOwnerMap.get(String(source.id))
             };
        })
        .filter((m) => m.viable)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    }

    return { evaMatches: evaM, pathMatches: pathM };
  }, [currentSignia, evaUsers, pathUsers, evaOwnerMap, pathOwnerMap]);

  // 4. Actions
  const handleNext = useCallback(() => {
    if (currentIdx < usersToMatch.length - 1) {
      setCurrentIdx(i => i + 1);
    }
  }, [currentIdx, usersToMatch.length]);

  const handleAssociate = useCallback(async (type, match) => {
    if (!currentSignia || !match) return;
    
    // Correct ID extraction
    // EVA uses 'CID', PATH uses 'id'
    const cid = type === 'eva' ? match.source.CID : match.source.id;

    if (!cid) {
        console.error("Missing CID/ID for association:", match.source);
        alert("Error: El candidato seleccionado no tiene un ID válido.");
        return;
    }

    setProcessing(true);

    try {
        // Swap: if taken, disassociate previous owner
        if (match.takenBy) {
             await fetch('/api/disassociate', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ signiaId: match.takenBy.id, source: type })
            });
        }

        if (type === 'eva') {
            await onMatchEva(currentSignia.id, cid);
            setStats(s => ({ ...s, eva: s.eva + 1 }));
            setShowSuccess('eva');
        } else {
            await onMatchPath(currentSignia.id, cid);
            setStats(s => ({ ...s, path: s.path + 1 }));
            setShowSuccess('path');
        }

        setTimeout(() => setShowSuccess(null), 1000);

        // Auto-advance logic:
        // If the user now has BOTH (existing + new), move to next
        const hasEvaNow = currentSignia.evaId || (type === 'eva');
        const hasPathNow = currentSignia.pathId || (type === 'path');
        
        if (hasEvaNow && hasPathNow) {
            setTimeout(() => {
                handleNext();
            }, 500);
        }

    } catch (err) {
        console.error("AutoSimilarity Associate Error:", err);
        alert("Error al asociar. Revisa la consola.");
    } finally {
        setProcessing(false);
    }
  }, [currentSignia, onMatchEva, onMatchPath, handleNext]);

  // 5. Shortcuts
  useEffect(() => {
    const handleKey = (e) => {
        if (processing || !currentSignia) return;
        const key = e.key.toLowerCase();
        
        if (e.target.tagName === 'INPUT') return;

        // S = Skip
        if (key === 's') { e.preventDefault(); setStats(s=>({...s, skipped: s.skipped+1})); handleNext(); return; }
        // ESC = Back
        if (key === 'escape') { e.preventDefault(); onBack(); return; }

        // Matches
        if (key === 'e') { e.preventDefault(); if (evaMatches[0]) handleAssociate('eva', evaMatches[0]); return; }
        if (key === 'p') { e.preventDefault(); if (pathMatches[0]) handleAssociate('path', pathMatches[0]); return; }
        
        // 1-3 for Eva, 4-6 for Path
        if (['1','2','3'].includes(key)) {
            const idx = parseInt(key) - 1;
            if (evaMatches[idx]) handleAssociate('eva', evaMatches[idx]);
        }
        if (['4','5','6'].includes(key)) {
            const idx = parseInt(key) - 4;
            if (pathMatches[idx]) handleAssociate('path', pathMatches[idx]);
        }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentSignia, evaMatches, pathMatches, handleAssociate, handleNext, processing, onBack]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mb-4"></div>
        Cargando datos...
    </div>
  );

  if (!currentSignia) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in bg-white rounded-xl border border-slate-200 shadow-sm mx-auto max-w-2xl">
        <h2 className="text-3xl font-bold text-slate-800 mb-2">¡Todo listo!</h2>
        <p className="text-slate-600 mb-8 text-center max-w-md">
          {searchTerm ? "No se encontraron usuarios con ese criterio." : "Todos los usuarios visibles tienen sus enlaces de EVA y PATH completados."}
        </p>
        <div className="flex gap-3">
             {searchTerm && (
                <button onClick={() => setSearchTerm("")} className={classNames(BTN_BASE, BTN_SIZES.md, BTN_VARIANTS.secondary)}>
                    Limpiar Búsqueda
                </button>
             )}
             <button onClick={onBack} className={classNames(BTN_BASE, BTN_SIZES.md, BTN_VARIANTS.primary)}>
                Volver al Dashboard
             </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto mt-2 pb-10">
      
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm sticky top-0 z-10">
        <div>
           <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             🔗 Auto-Similitud
           </h1>
           <p className="text-xs text-slate-500 mt-1">
               Vinculación rápida EVA + PATH
           </p>
        </div>
        
        {/* Search */}
        <div className="flex-1 max-w-md mx-4 relative">
            <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
            <input 
                type="text" 
                placeholder="Buscar usuario pendiente..." 
                className="w-full pl-9 pr-4 py-2 border rounded-full focus:ring-2 focus:ring-indigo-300 outline-none text-sm bg-slate-50 focus:bg-white transition-colors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>

        <div className="text-right">
           <div className="text-2xl font-black text-slate-700">{currentIdx + 1} <span className="text-sm font-normal text-slate-400">/ {usersToMatch.length}</span></div>
           <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
              Eva: {stats.eva} | Path: {stats.path} | Skip: {stats.skipped}
           </div>
        </div>
      </div>

      <div className="text-center mb-4">
          <div className="inline-flex items-center gap-3 bg-slate-50 px-4 py-1.5 rounded-full border border-slate-200 text-xs text-slate-500 shadow-sm font-mono">
             <span>[E] Eva</span> •
             <span>[P] Path</span> •
             <span>[S] Saltar</span> •
             <span>[1-3] Eva#</span> •
             <span>[4-6] Path#</span>
          </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT: Signia User Card */}
        <div className="lg:col-span-4 bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-emerald-500"></div>
            
            <div className="mb-6 mt-2">
                <span className="bg-slate-100 text-slate-600 text-[10px] tracking-wider font-bold px-2 py-1 rounded uppercase">
                    Usuario Signia #{currentSignia.id}
                </span>
            </div>
            
            <h2 className="text-3xl font-bold text-slate-800 leading-tight mb-1">
                {currentSignia.name || <i className="text-slate-300">Sin Nombre</i>}
            </h2>
            <div className="text-sm text-slate-500 font-mono mb-6">{currentSignia.email}</div>
            
            <div className="space-y-3">
                {/* EVA Status */}
                <div className={`flex justify-between items-center p-3 rounded-xl border-2 transition-colors ${currentSignia.evaId || showSuccess === 'eva' ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-dashed border-slate-200'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${currentSignia.evaId ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>E</div>
                        <div>
                            <div className="font-bold text-slate-700 text-sm">EVA</div>
                            {currentSignia.evaId && <div className="text-[10px] text-slate-500">ID: {currentSignia.evaId}</div>}
                        </div>
                    </div>
                    {currentSignia.evaId ? <span className="text-indigo-600 font-bold text-xs">✓ LISTO</span> : <span className="text-rose-400 font-bold text-xs">PENDIENTE</span>}
                </div>

                {/* PATH Status */}
                <div className={`flex justify-between items-center p-3 rounded-xl border-2 transition-colors ${currentSignia.pathId || showSuccess === 'path' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-dashed border-slate-200'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${currentSignia.pathId ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>P</div>
                        <div>
                            <div className="font-bold text-slate-700 text-sm">PATH</div>
                            {currentSignia.pathId && <div className="text-[10px] text-slate-500">ID: {currentSignia.pathId}</div>}
                        </div>
                    </div>
                    {currentSignia.pathId ? <span className="text-emerald-600 font-bold text-xs">✓ LISTO</span> : <span className="text-rose-400 font-bold text-xs">PENDIENTE</span>}
                </div>
            </div>
        </div>

        {/* CENTER: EVA Matches */}
        <div className="lg:col-span-4 space-y-3">
             <div className="flex items-center gap-2 mb-2 pb-2 border-b border-indigo-100">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                <h3 className="font-bold text-indigo-900 uppercase text-sm">Sugerencias EVA</h3>
             </div>

             {currentSignia.evaId ? (
                <div className="h-40 flex items-center justify-center bg-indigo-50/50 border border-indigo-100 rounded-xl text-indigo-400 text-sm italic">
                   ✓ EVA ya vinculado
                </div>
             ) : evaMatches.length === 0 ? (
                <div className="h-40 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl text-slate-400 text-sm italic">
                    Sin coincidencias
                </div>
             ) : (
                evaMatches.map((m, i) => (
                    <div key={m.source.CID} className={`relative bg-white border p-3 rounded-xl shadow-sm hover:shadow-md transition-all group ${m.score > 90 ? 'border-indigo-300 ring-1 ring-indigo-50' : 'border-slate-200'}`}>
                        <div className="absolute -left-2 top-3 w-5 h-5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold flex items-center justify-center">
                            {i + 1}
                        </div>
                        <div className="pl-4">
                            <div className="flex justify-between items-start mb-1">
                                <div className="font-bold text-slate-800 text-sm leading-tight">{m.source.nombre}</div>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.score > 85 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {m.score}%
                                </span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mb-2">{m.source.correo}</div>

                            {m.takenBy && (
                                <div className="text-[10px] bg-orange-50 text-orange-700 p-1.5 rounded mb-2 border border-orange-100 flex items-center gap-2">
                                    <span>⚠️ Ocupado por:</span>
                                    <span className="font-bold truncate max-w-[100px]">{m.takenBy.name}</span>
                                </div>
                            )}

                            <button 
                                onClick={() => handleAssociate('eva', m)}
                                disabled={processing}
                                className={`w-full py-1.5 text-xs font-bold rounded shadow-sm transition-colors
                                    ${m.takenBy 
                                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-300' 
                                        : 'bg-indigo-600 text-white hover:bg-indigo-700'}
                                `}
                            >
                                {m.takenBy ? "🔄 Intercambiar" : i === 0 ? "Asociar EVA (E)" : "Asociar EVA"}
                            </button>
                        </div>
                    </div>
                ))
             )}
        </div>

        {/* RIGHT: PATH Matches */}
        <div className="lg:col-span-4 space-y-3">
             <div className="flex items-center gap-2 mb-2 pb-2 border-b border-emerald-100">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <h3 className="font-bold text-emerald-900 uppercase text-sm">Sugerencias PATH</h3>
             </div>

             {currentSignia.pathId ? (
                <div className="h-40 flex items-center justify-center bg-emerald-50/50 border border-emerald-100 rounded-xl text-emerald-400 text-sm italic">
                   ✓ PATH ya vinculado
                </div>
             ) : pathMatches.length === 0 ? (
                <div className="h-40 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl text-slate-400 text-sm italic">
                    Sin coincidencias
                </div>
             ) : (
                pathMatches.map((m, i) => (
                    <div key={m.source.id} className={`relative bg-white border p-3 rounded-xl shadow-sm hover:shadow-md transition-all group ${m.score > 90 ? 'border-emerald-300 ring-1 ring-emerald-50' : 'border-slate-200'}`}>
                         <div className="absolute -left-2 top-3 w-5 h-5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold flex items-center justify-center">
                            {i + 4}
                        </div>
                        <div className="pl-4">
                            <div className="flex justify-between items-start mb-1">
                                <div className="font-bold text-slate-800 text-sm leading-tight">{m.source.nombre}</div>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.score > 85 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {m.score}%
                                </span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mb-1">{m.source.email}</div>
                            
                            <div className="flex gap-1 mb-2">
                                {(m.source.pathLinks || []).some(l=>l.label==="ECO") && <span className="text-[9px] bg-green-50 text-green-600 border border-green-200 px-1 rounded font-bold">ECO</span>}
                                {(m.source.pathLinks || []).some(l=>l.label==="MMPI-2 RF") && <span className="text-[9px] bg-pink-50 text-pink-600 border border-pink-200 px-1 rounded font-bold">MMPI</span>}
                            </div>

                            {m.takenBy && (
                                <div className="text-[10px] bg-orange-50 text-orange-700 p-1.5 rounded mb-2 border border-orange-100 flex items-center gap-2">
                                    <span>⚠️ Ocupado por:</span>
                                    <span className="font-bold truncate max-w-[100px]">{m.takenBy.name}</span>
                                </div>
                            )}

                            <button 
                                onClick={() => handleAssociate('path', m)}
                                disabled={processing}
                                className={`w-full py-1.5 text-xs font-bold rounded shadow-sm transition-colors
                                    ${m.takenBy 
                                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-300' 
                                        : 'bg-emerald-600 text-white hover:bg-emerald-700'}
                                `}
                            >
                                {m.takenBy ? "🔄 Intercambiar" : i === 0 ? "Asociar PATH (P)" : "Asociar PATH"}
                            </button>
                        </div>
                    </div>
                ))
             )}
        </div>
      </div>
      
      {/* Navigation Footer */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-30">
          <button 
             onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
             disabled={currentIdx === 0}
             className="bg-white border border-slate-300 shadow-lg px-6 py-2 rounded-full font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
             ← Anterior
          </button>
          <button 
             onClick={() => { setStats(s=>({...s, skipped: s.skipped+1})); handleNext(); }}
             className="bg-slate-800 text-white shadow-lg px-8 py-2 rounded-full font-bold hover:bg-slate-900"
          >
             Saltar / Siguiente (S) →
          </button>
      </div>

    </div>
  );
}