
"use client";
import { useState, useEffect } from "react";
import { filterLinkerUsers } from "../lib/userUtils";

/**
 * useGptBulk
 *
 * Manages:
 * - Single-user GPT CURP extraction and name update.
 * - Bulk GPT extraction across a filtered subset of users.
 * - Progress state and ability to stop the bulk process.
 *
 * The hook receives the full asociar list and the current filters
 * (missing category, search term, plantelId) so that bulk operations
 * act over the same subset that the UI is showing.
 */
export default function useGptBulk({
  asociar,
  filters,
  searchTerm,
  plantelFilter,
  idx,
  setIdx,
  _names,
  setNames,
  setAsociar,
  nameFieldState,
  setNameFieldState,
  nameFieldErr,
  setNameFieldErr,
}) {
  const [gptExtracting, setGptExtracting] = useState(false);
  const [gptBulk, setGptBulk] = useState(false);
  const [gptBulkIndex, setGptBulkIndex] = useState(-1);
  const [gptBulkStopped, setGptBulkStopped] = useState(false);
  const [gptBulkProgress, setGptBulkProgress] = useState({ total: 0, done: 0 });
  const [gptErr, setGptErr] = useState(null);

  // Build the same filtered list the Linker UI operates on
  const _filtered = filterLinkerUsers(asociar, {
    categoryFilter: filters,
    searchTerm,
    plantelId: plantelFilter,
  });

  const currIdx = Math.max(0, Math.min(idx, _filtered.length - 1));
  const u = _filtered[currIdx] || {};

  // Users eligible for GPT extraction (missing any name field and having CURP)
  const allExtractable = _filtered.filter(
    (user) =>
      (!user.nombres || !user.apellidoPaterno || !user.apellidoMaterno) &&
      !!user.curpAbsPath
  );

  // Bulk runner effect: automatically advances through all extractable users.
  useEffect(() => {
    if (!gptBulk || gptBulkStopped) return;

    if (!allExtractable.length) {
      setGptBulk(false);
      setGptBulkIndex(-1);
      setGptBulkProgress({ total: 0, done: 0 });
      return;
    }

    if (gptBulkIndex === -1) {
      // Initialize bulk run
      setGptBulkIndex(0);
      setGptBulkProgress({ total: allExtractable.length, done: 0 });
      return;
    }

    if (gptBulkIndex >= allExtractable.length) {
      // Bulk finished
      setGptBulk(false);
      setGptBulkIndex(-1);
      setTimeout(
        () => setGptBulkProgress({ total: 0, done: allExtractable.length }),
        800
      );
      return;
    }

    // Move Linker to the current bulk user if needed
    const nextId = allExtractable[gptBulkIndex].id;
    const foundIdx = _filtered.findIndex((z) => z.id === nextId);
    if (foundIdx !== currIdx && foundIdx !== -1) setIdx(foundIdx);

    if (!gptExtracting) {
      (async () => {
        await handleGptExtractWithRetry({
          auto: true,
          bulk: true,
          nextBulk: () => {
            setGptBulkProgress((p) => ({
              ...p,
              done: gptBulkIndex + 1,
            }));
            setGptBulkIndex((j) => j + 1);
          },
        });
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gptBulk,
    gptBulkIndex,
    allExtractable,
    currIdx,
    gptExtracting,
    gptBulkStopped,
    _filtered,
    setIdx,
  ]);

  // Single-user GPT extraction + save
  async function handleGptExtractAndSave() {
    if (!u.id) return;
    setGptExtracting(true);
    setGptErr(null);
    try {
      if (!u.curpAbsPath)
        throw new Error("No hay CURP adjunto para este usuario");

      // Call CURP GPT extraction API
      const resp = await fetch("/api/curp-gpt-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: u.curpAbsPath }),
      });
      if (!resp.ok) {
        const ex = await resp.json().catch(() => ({}));
        throw new Error(ex?.error || "Fallo la extracción GPT");
      }
      const data = await resp.json();
      const patch = {
        nombres: data.nombres ?? "",
        apellidoPaterno: data.apellidoPaterno ?? "",
        apellidoMaterno: data.apellidoMaterno ?? "",
      };

      // Update local in-memory names so UI reflects GPT response immediately
      setNames((n) => ({ ...n, ...patch }));

      // Persist names to Signia
      const saveRes = await fetch(`/api/signia-names/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!saveRes.ok) {
        const ex = await saveRes.json().catch(() => ({}));
        throw new Error(ex?.error || "Error al guardar tras extraer");
      }

      // Update asociar list so other components see the change
      setAsociar((users) =>
        users.map((user) => (user.id === u.id ? { ...user, ...patch } : user))
      );

      setNameFieldState({
        nombres: "saved",
        apellidoPaterno: "saved",
        apellidoMaterno: "saved",
      });
      setTimeout(
        () =>
          setNameFieldState({
            nombres: "idle",
            apellidoPaterno: "idle",
            apellidoMaterno: "idle",
          }),
        1000
      );
    } finally {
      setGptExtracting(false);
    }
  }

  // Retry helper for GPT extraction; moves on after 2 failures.
  async function handleGptExtractWithRetry({
    auto = false,
    bulk = false,
    nextBulk,
  } = {}) {
    let tries = 0;
    while (tries < 2) {
      try {
        await handleGptExtractAndSave();
        return;
      } catch (e) {
        tries++;
        setGptErr(
          `${e?.message || "Error"} ${
            tries === 2 ? "(Saltando usuario…)" : "(reintentando…)"
          }`
        );
      }
    }
    setTimeout(() => {
      if (bulk && typeof nextBulk === "function") nextBulk();
      if (auto && !bulk && currIdx < _filtered.length - 1)
        setIdx(currIdx + 1);
    }, 500);
  }

  // Manual trigger for GPT extraction on the current user
  async function handleGptExtractManual() {
    setGptErr(null);
    try {
      await handleGptExtractAndSave();
    } catch (e) {
      setGptErr(e?.message || "Error");
    }
  }

  const canExtractCurpGpt =
    !!u.curpAbsPath && !gptExtracting && !gptBulk && !gptBulkStopped;

  // Start bulk extraction over all extractable users in the filtered subset
  function handleBulkTrigger() {
    setGptBulkStopped(false);
    setGptBulk(true);
    setGptBulkIndex(-1);
    setGptBulkProgress({ total: allExtractable.length, done: 0 });
  }

  // Stop/pause the ongoing bulk extraction
  function handleGptBulkStop() {
    setGptBulkStopped(true);
  }

  return {
    gptExtracting,
    gptBulk,
    gptBulkIndex,
    setGptBulkIndex,
    gptBulkStopped,
    setGptBulkStopped,
    gptBulkProgress,
    setGptBulkProgress,
    gptErr,
    setGptErr,
    handleGptExtractManual,
    canExtractCurpGpt,
    handleBulkTrigger,
    handleGptBulkStop,
    allExtractable,
  };
}
