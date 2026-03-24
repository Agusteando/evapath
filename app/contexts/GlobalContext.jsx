"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

const GlobalContext = createContext(null);

export function GlobalProvider({ children }) {
  const [evaStatus, setEvaStatus] = useState({ ready: false, status: "init" });

  const checkEva = async () => {
    try {
      const res = await fetch("/api/eva-status");
      const data = await res.json();
      setEvaStatus(data);
    } catch (e) {
      console.error("Failed to fetch EVA status", e);
    }
  };

  useEffect(() => {
    checkEva();
    const interval = setInterval(checkEva, 5000); // Background polling
    return () => clearInterval(interval);
  }, []);

  return (
    <GlobalContext.Provider value={{ evaStatus, checkEva }}>
      {children}
    </GlobalContext.Provider>
  );
}

export const useGlobal = () => useContext(GlobalContext);