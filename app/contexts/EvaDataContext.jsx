
"use client"
import React, { createContext, useContext, useState, useEffect, useCallback } from "react"

const EvaDataContext = createContext(undefined)

export function EvaDataProvider({ children }) {
  const [evaUsers, setEvaUsers] = useState([])
  const [evaReady, setEvaReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])
  const [status, setStatus] = useState("init")
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  const fetchEva = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const statusRes = await fetch("/api/eva-status", { cache: "no-store" })
      // Always parse as JSON; fallback if empty or bad
      let statusJson = {}
      try {
        statusJson = await statusRes.json()
      } catch (er) {
        setError("EVA error: Respuesta de estado no válida")
        setEvaReady(false)
        setLoading(false)
        return
      }
      setStatus(statusJson.status || "init")
      setEvaReady(!!statusJson.ready)

      // If not ready, don't fetch users yet; will retry
      if (!statusJson.ready) {
        setEvaUsers([])
        setLoading(false)
        return
      }

      const usersRes = await fetch("/api/evaluatest-users", { cache: "no-store" })
      // If not ready, clients returns {loading:true, users:[]} with 202
      let usersJson = {}
      try {
        usersJson = await usersRes.json()
      } catch (e) {
        setError("EVA error: Respuesta de usuarios no válida")
        setEvaUsers([])
        setEvaReady(false)
        setLoading(false)
        return
      }
      if (usersJson.loading) {
        setEvaUsers([])
        setLoading(true)
        setEvaReady(false)
        return
      }
      setEvaUsers(usersJson.users || [])
      setEvaReady(true)
      setLoading(false)
      setError(null)
    } catch (e) {
      setEvaUsers([])
      setError("EVA error loading: " + (e.message || e))
      setEvaReady(false)
      setLoading(false)
    }
  }, [])

  // On mount OR if error with no users, will try again shortly
  useEffect(() => {
    fetchEva()
  }, [fetchEva, retryCount])

  // If error and !evaReady, retry up to X times with delay
  useEffect(() => {
    if (error && !evaReady && retryCount < 6) {
      const t = setTimeout(() => setRetryCount(retryCount + 1), 2300 + 800 * retryCount)
      return () => clearTimeout(t)
    }
    // after retries, user must manual refresh
  }, [error, evaReady, retryCount])

  return (
    <EvaDataContext.Provider
      value={{
        evaUsers,
        evaReady,
        loading,
        logs,
        status,
        error,
        refresh: () => {
          setRetryCount(0) // reset exponential backoff
          fetchEva()
        }
      }}
    >
      {children}
    </EvaDataContext.Provider>
  )
}

/** Hook to use EVA context */
export function useEvaData() {
  return useContext(EvaDataContext)
}
