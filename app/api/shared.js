import EvaService from "../../EvaService.js";
export { getSigniaPool, getPathPool, logAudit } from "../lib/serverDb.js";

let _evaInstance = global._evaSingleton;
export function getEva() {
  if (!_evaInstance) {
    console.log("[getEva] Creating new EvaService singleton instance...");
    _evaInstance = new EvaService();
    global._evaSingleton = _evaInstance;
  }
  return _evaInstance;
}

export async function waitEva(timeoutMs = 90000) {
  const eva = getEva();
  if (eva.ready) return Promise.resolve();
  
  console.log(`[waitEva] EVA not ready yet. Waiting up to ${timeoutMs}ms...`);
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (eva.ready) {
        clearInterval(checkInterval);
        console.log(`[waitEva] EVA became ready after ${Date.now() - startTime}ms`);
        resolve();
      } else if (eva.status === "error") {
        clearInterval(checkInterval);
        console.warn(`[waitEva] EVA service hit error state after ${Date.now() - startTime}ms`);
        reject(new Error("EVA service error"));
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        console.warn(`[waitEva] EVA service timeout after ${timeoutMs}ms`);
        reject(new Error("EVA service timeout"));
      }
    }, 500);
  });
}

export async function resetEva() {
  const eva = getEva();
  if (eva && typeof eva._start === "function") {
    console.log("[resetEva] Manually resetting EvaService...");
    eva.ready = false;
    eva.status = "init";
    try {
      await eva._start();
      if (!eva.ready) {
        throw new Error(`EVA reset finished without ready state. Current status: ${eva.status || "unknown"}`);
      }
      console.log("[resetEva] Reset sequence completed successfully.");
    } catch (e) {
      eva.status = "error";
      console.error("[resetEva] EVA Reset Error:", e);
      throw e;
    }
  }
}

export function label(c) {
  // Always display "MMPI-2 RF" visually
  return c == 2 ? "MMPI-2 RF" : "ECO";
}

export function pdfURL(cid, pid, code, c) {
  // The backend URI strictly uses "MMPI" safely
  const typeUri = c == 2 ? "MMPI" : "ECO";
  return `/api/path-pdf?cid=${cid}&pid=${pid}&code=${code}&type=${encodeURIComponent(typeUri)}`;
}

export async function evaStatusSingleton() {
  const eva = getEva();
  if (typeof eva.getStatus === "function") {
    return eva.getStatus();
  }
  return { ready: !!eva.ready, status: eva.status ?? "init" };
}

export async function evaLogTailSingleton() {
  const eva = getEva();
  return { logs: eva.getLogTail ? eva.getLogTail() : [], ready: !!eva.ready };
}