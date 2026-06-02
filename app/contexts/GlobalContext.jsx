"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

const GlobalContext = createContext(null);

export function GlobalProvider({ children }) {
  const [evaStatus, setEvaStatus] = useState({ ready: false, status: "init" });

  const checkEva = async () => {
    try {
      const res = await fetch("/api/eva-status", { cache: "no-store" });
      const data = await res.json();
      setEvaStatus(data);
      return data;
    } catch (e) {
      console.error("Failed to fetch EVA status", e);
      return null;
    }
  };

  const refreshEva = async () => {
    const res = await fetch("/api/eva-refresh", {
      method: "POST",
      cache: "no-store",
    });

    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }

    if (!res.ok || data.ok === false) {
      throw new Error(data.error || data.msg || "No se pudo actualizar EVA");
    }

    const status = await checkEva();
    return status || data;
  };

  useEffect(() => {
    checkEva();
    const interval = setInterval(checkEva, 5000); // Background polling
    return () => clearInterval(interval);
  }, []);

  return (
    <GlobalContext.Provider value={{ evaStatus, checkEva, refreshEva }}>
      {children}
    </GlobalContext.Provider>
  );
}

export const useGlobal = () => useContext(GlobalContext);
