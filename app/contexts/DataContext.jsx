"use client"
import React, { createContext, useContext, useState, useCallback, useEffect } from "react"

const DataContext = createContext(undefined)

export function DataProvider({ children }) {
  const [eva, setEva] = useState({ users: [], stats: {}, loading: true, ready: false, status: "init", error: null, page: 1, pageSize: 20, total: 0, lastPage: 1 })
  const [signia, setSignia] = useState({ users: [], stats: {}, loading: true, error: null, page: 1, pageSize: 20, total: 0, lastPage: 1 })
  const [path, setPath] = useState({ users: [], stats: {}, loading: true, error: null, page: 1, pageSize: 20, total: 0, lastPage: 1 })

  const [evaToken, setEvaToken] = useState(0)
  const [signiaToken, setSigniaToken] = useState(0)
  const [pathToken, setPathToken] = useState(0)

  const fetchEva = useCallback(async (params = {}) => {
    setEva(prev => ({ ...prev, loading: true, error: null }))
    try {
      const raw = await fetch("/api/eva-status", { cache: "no-store" })
      const status = await raw.json()
      if (!status.ready) {
        setEva(prev => ({ ...prev, loading: true, ready: false, status: status.status || "init", error: null }))
        return
      }
      
      // Build query string with pagination and search params
      const queryParams = new URLSearchParams({
        page: String(params.page ?? 1),
        pageSize: String(params.pageSize ?? 20),
        q: params.q ?? "",
        filter: params.filter ?? ""
      });
      
      const usersRaw = await fetch(`/api/evaluatest-users?${queryParams.toString()}`, { cache: "no-store" })
      const usersJson = await usersRaw.json()
      if (usersJson.loading) {
        setEva(prev => ({ ...prev, loading: true, ready: false, status: "loading", error: null }))
        return
      }
      setEva({
        users: usersJson.users,
        stats: usersJson.stats || {},
        loading: false,
        ready: true,
        status: status.status,
        error: null,
        page: usersJson.page,
        pageSize: usersJson.pageSize,
        total: usersJson.total,
        lastPage: usersJson.lastPage
      })
    } catch (err) {
      setEva({ 
        users: [], 
        stats: {}, 
        loading: false, 
        ready: false, 
        status: "error", 
        error: String(err?.message || err),
        page: 1,
        pageSize: 20,
        total: 0,
        lastPage: 1
      })
    }
  }, [])

  const fetchSignia = useCallback(async (params = {}) => {
    setSignia(prev => ({ ...prev, loading: true, error: null }))
    const url = `/api/signia-users?page=${params.page ?? 1}&pageSize=${params.pageSize ?? 20}&q=${encodeURIComponent(params.q ?? "")}${params.onlyMissing ? "&onlyMissing=1" : ""}`
    try {
      const raw = await fetch(url, { cache: "no-store" })
      const json = await raw.json()
      setSignia({
        users: json.users,
        stats: json.signiaStats || {
          evaMatched: 0, evaUnmatched: 0, evaPct: "0.0",
          pathMatched: 0, pathUnmatched: 0, pathPct: "0.0",
          total: json.total ?? 0
        },
        loading: false,
        error: null,
        page: json.page,
        pageSize: json.pageSize,
        total: json.total,
        lastPage: json.lastPage
      })
    } catch (err) {
      setSignia(prev => ({ ...prev, loading: false, error: String(err?.message || err) }))
    }
  }, [])

  const fetchPath = useCallback(async (params = {}) => {
    setPath(prev => ({ ...prev, loading: true, error: null }))
    const url = `/api/reclutamiento-users?page=${params.page ?? 1}&pageSize=${params.pageSize ?? 20}&q=${encodeURIComponent(params.q ?? "")}`
    try {
      const raw = await fetch(url, { cache: "no-store" })
      const json = await raw.json()
      setPath({
        users: json.users,
        stats: {},
        loading: false,
        error: null,
        page: json.page,
        pageSize: json.pageSize,
        total: json.total,
        lastPage: json.lastPage
      })
    } catch (err) {
      setPath(prev => ({ ...prev, loading: false, error: String(err?.message || err) }))
    }
  }, [])

  // Poll EVA status until ready
  useEffect(() => {
    let pollInterval = null
    
    if (!eva.ready && eva.status !== "error") {
      console.log("[DataContext] Starting EVA status polling, current status:", eva.status)
      pollInterval = setInterval(async () => {
        try {
          const raw = await fetch("/api/eva-status", { cache: "no-store" })
          const status = await raw.json()
          console.log("[DataContext] EVA poll result:", status)
          
          if (status.ready && !eva.ready) {
            console.log("[DataContext] EVA became ready! Fetching data...")
            clearInterval(pollInterval)
            await fetchEva()
          } else if (status.status === "error") {
            console.log("[DataContext] EVA error detected, stopping poll")
            clearInterval(pollInterval)
            setEva(prev => ({ ...prev, status: "error", loading: false }))
          }
        } catch (err) {
          console.error("[DataContext] Poll error:", err)
        }
      }, 3000) // Poll every 3 seconds
    }
    
    return () => {
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [eva.ready, eva.status, fetchEva])

  const forceEva = () => { setEvaToken(t => t+1); fetchEva(); }
  const forceSignia = () => { setSigniaToken(t => t+1); fetchSignia(); }
  const forcePath = () => { setPathToken(t => t+1); fetchPath(); }

  return (
    <DataContext.Provider value={{
      eva, signia, path,
      evaToken, signiaToken, pathToken,
      fetchEva, fetchSignia, fetchPath,
      forceEva, forceSignia, forcePath
    }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  return useContext(DataContext)
}