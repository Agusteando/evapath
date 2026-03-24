// EvaService.js
// Minification/Next.js-safe server-only implementation.

const moment = require("moment");

function mask(value, { start = 2, end = 2, fallback = "(undefined)" } = {}) {
  if (!value) return fallback;
  const s = String(value);
  if (s.length <= start + end) return "*".repeat(s.length);
  return s.slice(0, start) + "*".repeat(s.length - start - end) + s.slice(-end);
}

// Helper to wait without using page.waitForTimeout
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class EvaService {
  constructor() {
    if (typeof window !== "undefined") {
      throw new Error("EvaService must run on the server (Node.js), not the browser.");
    }
    if (process?.env?.NEXT_RUNTIME === "edge") {
      throw new Error("EvaService requires the Node.js runtime (not Edge).");
    }
    if (!process?.versions?.node) {
      throw new Error("EvaService requires Node.js.");
    }

    const envEmail = process.env["EVA_EMAIL"];
    const envPassword = process.env["EVA_PASSWORD"];
    const envEmpresasBaseUrl = process.env["EVA_EMPRESAS_BASE_URL"];
    const envApiEmpresasBaseUrl = process.env["EVA_API_EMPRESAS_BASE_URL"];

    console.log("[EvaService DEBUG] Environment check:", {
      EVA_EMAIL: mask(envEmail, { start: 3, end: 3 }),
      EVA_PASSWORD: envPassword ? `${envPassword.length} chars` : "(undefined)",
      EVA_EMPRESAS_BASE_URL: envEmpresasBaseUrl || "(undefined)",
      EVA_API_EMPRESAS_BASE_URL: envApiEmpresasBaseUrl || "(undefined)",
      NODE_ENV: process.env["NODE_ENV"] || "(undefined)",
      NEXT_RUNTIME: process.env["NEXT_RUNTIME"] || "(undefined)",
    });

    this.ready        = false;
    this.status       = "init";
    this.results      = [];
    this.cache        = {};
    this.accessToken  = "";
    this.refreshToken = "";
    this.antiguedad   = 3;

    this.email              = envEmail;
    this.password           = envPassword;
    this.empresasBaseUrl    = envEmpresasBaseUrl;
    this.apiEmpresasBaseUrl = envApiEmpresasBaseUrl;

    this.browser = null;
    this.page = null;
    
    // Concurrency lock for safe auto-recovery without cascade failure
    this._reconnectPromise = null;

    this.logs = [];
    this._loggedSample = false;
    this._log("EvaService constructed");

    console.log("[EvaService DEBUG] Kicking off setImmediate _start()...");
    setImmediate(() => this._start());
  }

  _log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    this.logs.push(line);
    if (this.logs.length > 200) this.logs.shift();
    console.log(`[EvaService LOG] ${line}`);
    if (msg.startsWith("status=")) {
      this.status = msg.split("=")[1];
      console.log(`[EvaService DEBUG] Status updated to: ${this.status}`);
    }
  }
  
  getLogTail() { return this.logs.slice(-80); }

  getUsers() {
    if (!this.ready && !this._reconnectPromise) {
      this._log("getUsers called before ready (status=" + this.status + ")");
      console.error("[EvaService DEBUG] Cannot get users. Service is not ready.");
      throw new Error("Service not ready");
    }
    const mapped = this.results.map((u) => ({
      CID:    u.CID,
      JID:    u.JID,
      nombre: u.N,
      puesto: u.puesto ?? "",
      correo: u.M,
      estado: u.D,
      fechaProceso: u.PD, // Map the PD field for date
      link:   `/api/users/${u.CID}/report`
    }));
    if (!this._loggedSample && mapped.length) {
      this._loggedSample = true;
      console.log(
        "DEBUG: Sample EVA user object from EvaService.getUsers():\n",
        JSON.stringify(mapped[0], null, 2)
      );
    }
    return mapped;
  }

  getStatus() {
    return { ready: this.ready, status: this.status, users: this.results.length };
  }

  async _start() {
    try {
      this._log("status=init");
      this._log("Launching Puppeteer");
      await this.init();
      this._log("Puppeteer ready, logging in...");
      await this.login();
      this._log("Login ok, fetching candidates (precargar)...");
      await this.precargar();
      this.ready = true;
      this.status = "ready";
      this._log("EvaService READY. Candidates cached: " + this.results.length);
      console.log("[EvaService DEBUG] Full initialization sequence completed successfully.");
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      this._log("status=error EvaService FATAL ERROR: " + msg);
      console.error("[EvaService DEBUG] Initialization failed catastrophically:", err);
      this.ready = false;
      this.status = "error";
    }
  }

  /**
   * Safely reconnects to EVA when tokens expire or connection drops.
   * Utilizes the failed token identifier to prevent a "Concurrency Cascade Teardown".
   * If 10 requests fail simultaneously with the same old token, only ONE request 
   * performs the teardown. The others wait, see the new token, and safely bypass.
   */
  async reconnect(failedToken) {
    // If the token has already been successfully refreshed by a concurrent request,
    // we bypass teardown and immediately resume the retries.
    if (failedToken && this.accessToken && this.accessToken !== failedToken) {
      this._log("status=recovered reconnect: Token already refreshed by concurrent request. Bypassing teardown.");
      console.log("[EvaService DEBUG] Token mismatch during reconnect. Bypass engaged.");
      return;
    }

    if (this._reconnectPromise) {
      this._log("reconnect: Sequence already in progress. Awaiting existing promise...");
      console.log("[EvaService DEBUG] Paused execution to wait for existing reconnect promise.");
      return this._reconnectPromise;
    }

    this._reconnectPromise = (async () => {
      this._log("status=reconnecting Token stale or connection lost. Executing full reconnect...");
      console.log("[EvaService DEBUG] Starting full teardown and reconnect sequence.");
      this.ready = false;
      
      try {
        await this.close(); 
        await delay(1000); 
        
        await this.init();
        await this.login();
        
        this.ready = true;
        this.status = "ready";
        this._log("reconnect: Successfully recovered EVA connection and generated new token.");
      } catch (err) {
        this.status = "error";
        this._log("status=error reconnect: Failed to recover EVA connection: " + (err.message || err));
        console.error("[EvaService DEBUG] Reconnect sequence completely failed:", err);
        throw err;
      } finally {
        this._reconnectPromise = null;
      }
    })();

    return this._reconnectPromise;
  }

  async init() {
    const puppeteer = require("puppeteer");

    this._log("puppeteer.launch starting...");
    console.log("[EvaService DEBUG] Spawning headless Chrome process...");
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        "--ignore-certificate-errors",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--unlimited-storage",
        "--disable-dev-shm-usage",
        "--disable-crash-reporter",
        "--disable-breakpad",
      ],
    });
    this._log("Puppeteer browser launched, creating newPage...");
    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0 Safari/537.36"
    );
    this.page.setDefaultTimeout(45000);
    this._log("Puppeteer page ready. Next: login...");
  }

  async login() {
    this._log(
      "login() using env -> email=" +
        mask(this.email, { start: 3, end: 3 }) +
        " baseUrl=" +
        (this.empresasBaseUrl || "(undefined)")
    );

    if (!this.empresasBaseUrl || !this.email || !this.password) {
      throw new Error(
        "Missing required environment variables. Expect EVA_EMPRESAS_BASE_URL, EVA_EMAIL, EVA_PASSWORD"
      );
    }

    // Clear stale tokens
    this.accessToken = "";
    this.refreshToken = "";

    this._log("Navigating to Evaluatest login page...");
    console.log(`[EvaService DEBUG] Navigating to ${this.empresasBaseUrl}`);
    await this.page.goto(this.empresasBaseUrl, {
      waitUntil: ["domcontentloaded", "networkidle2"],
      timeout: 30000,
    });

    // Wait for page to settle using standard Promise
    this._log("Waiting for page to settle...");
    await delay(1500);

    try {
      this._log("Waiting for email input field...");
      await this.page.waitForSelector('input[name="Email"]', { timeout: 15000, visible: true });
    } catch (err) {
      this._log("Could not find Email input. Current URL: " + this.page.url());
      console.error("[EvaService DEBUG] Could not find Email input on DOM. DOM Dump:", await this.page.content().catch(() => "failed to dump DOM"));
      if (this.page.url().includes("/login")) {
        throw new Error("Failed to load Evaluatest login fields.");
      }
    }
    
    this._log("Typing email...");
    await this.page.type('input[name="Email"]', this.email, { delay: 50 });
    
    this._log("Typing password...");
    await this.page.type('input[name="Password"]', this.password, { delay: 50 });

    this._log("Looking for submit button...");
    await this.page.waitForSelector('button[type="submit"]', { timeout: 15000, visible: true });
    
    // Set up response listener BEFORE clicking submit
    this._log("Setting up authorization response listener...");
    const authPromise = this.page.waitForResponse(
      (resp) => {
        try {
          const url = resp.url();
          return typeof url === "string" && url.includes("/api/authorization") && resp.status() === 200;
        } catch (_) {
          return false;
        }
      },
      { timeout: 15000 }
    );

    this._log("Clicking submit button...");
    await this.page.click('button[type="submit"]');

    try {
      this._log("Waiting for /api/authorization response...");
      const response = await authPromise;
      const dataObj = await response.json();
      
      console.log("[EvaService DEBUG] Raw network auth payload intercepted:", Object.keys(dataObj));
      
      if (!dataObj || !dataObj.access_token) {
        throw new Error("No access token in response");
      }
      
      this.accessToken  = dataObj.access_token;
      this.refreshToken = dataObj.refresh_token || "";
      this._log("Got accessToken from network (length: " + this.accessToken.length + ")");
      return this.accessToken;
      
    } catch (networkError) {
      this._log("Network login failed: " + networkError.message + ", trying localStorage...");
      console.warn("[EvaService DEBUG] Network interception failed, falling back to LocalStorage scraping.");
      
      // Wait for localStorage to be populated
      await delay(2000);
      
      try {
        const dataObj = await this.page.evaluate(() => {
          try {
            const raw = localStorage.getItem("authorization");
            return raw ? JSON.parse(raw) : {};
          } catch (e) {
            return {};
          }
        });
        
        if (!dataObj || !dataObj.access_token) {
          throw new Error("No access token in localStorage");
        }
        
        this.accessToken  = dataObj.access_token;
        this.refreshToken = dataObj.refresh_token || "";
        this._log("Got accessToken from localStorage (length: " + this.accessToken.length + ")");
        return this.accessToken;
        
      } catch (storageError) {
        this._log("localStorage extraction failed: " + storageError.message);
        
        // Last attempt: check if we're on a different page (successful login redirect)
        const currentUrl = this.page.url();
        this._log("Current URL after login attempt: " + currentUrl);
        
        if (currentUrl !== this.empresasBaseUrl && !currentUrl.includes("/login")) {
          this._log("Login appears successful (redirected), checking localStorage again...");
          await delay(1000);
          
          const lastAttempt = await this.page.evaluate(() => {
            const raw = localStorage.getItem("authorization");
            return raw ? JSON.parse(raw) : {};
          });
          
          if (lastAttempt && lastAttempt.access_token) {
            this.accessToken = lastAttempt.access_token;
            this.refreshToken = lastAttempt.refresh_token || "";
            this._log("Got accessToken on final attempt (length: " + this.accessToken.length + ")");
            return this.accessToken;
          }
        }
        
        console.error("[EvaService DEBUG] Exhausted all methods to fetch access token.");
        throw new Error("Failed to get access token after all attempts");
      }
    }
  }

  /**
   * Resilient, auto-retrying HTTP client wrapped around native Node HTTP.
   * Capable of detecting 401 Unauthorized or disconnected states and 
   * automatically executing a fast-reconnect before attempting the request again.
   */
  async get(apiPath, useApi = false, headers = {}) {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      const tokenUsed = this.accessToken;

      try {
        // 1. Concurrency block: Pause if a reconnect is actively happening
        if (this._reconnectPromise) {
          this._log(`GET paused. Waiting for active EVA reconnect to finish...`);
          await this._reconnectPromise;
        }

        const currentToken = this.accessToken;
        const base = useApi ? this.apiEmpresasBaseUrl : this.empresasBaseUrl;
        
        if (!base) {
          throw new Error("Base URL is not set. Check EVA_API_EMPRESAS_BASE_URL / EVA_EMPRESAS_BASE_URL");
        }
        if (!currentToken) {
          throw new Error("No access token available. Did login() succeed?");
        }
        
        // 2. Validate session context safely
        if (!this.page || this.page.isClosed()) {
          throw new Error("Puppeteer page is closed or null");
        }

        // Clean slash formatting for safe URL concatenation
        const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
        const cleanPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
        const url = `${cleanBase}${cleanPath}`;
        
        this._log(`GET ${url} (attempt ${attempts})`);
        console.log(`[EvaService DEBUG] Dispatching Node HTTP GET to: ${url}`);

        // Get dynamic cookies safely generated by the active session
        let cookieString = "";
        try {
          const cookies = await this.page.cookies();
          cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        } catch (e) {
          throw new Error("Puppeteer page context error: " + e.message);
        }

        const https = require('https');
        const http = require('http');
        
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        
        // 3. Execute request payload
        const data = await new Promise((resolve, reject) => {
          const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
              'accept': 'application/json,text/plain,*/*',
              'authorization': `Bearer ${currentToken}`,
              'content-type': 'application/json',
              'cookie': cookieString,
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              ...headers
            },
            rejectUnauthorized: false 
          };

          const req = client.request(options, (res) => {
            let chunkData = '';
            
            res.on('data', (chunk) => {
              chunkData += chunk;
            });
            
            res.on('end', () => {
              // Properly capture failing HTTP codes for downstream evaluation
              if (res.statusCode === 401) {
                console.warn(`[EvaService DEBUG] 401 Unauthorized encountered on ${url}`);
                reject(new Error(`HTTP 401 Unauthorized for ${url} -> ${chunkData.slice(0, 256)}`));
                return;
              }
              if (res.statusCode < 200 || res.statusCode >= 300) {
                console.warn(`[EvaService DEBUG] Non-2xx HTTP code (${res.statusCode}) on ${url}`);
                const errMsg = `HTTP ${res.statusCode} ${res.statusMessage} for ${url}`;
                reject(new Error(`${errMsg} -> ${chunkData.slice(0, 256)}`));
                return;
              }
              
              const contentType = res.headers['content-type'] || '';
              if (contentType.includes('application/json')) {
                try {
                  resolve(JSON.parse(chunkData));
                } catch (e) {
                  this._log("Failed to parse JSON response: " + e.message);
                  resolve(chunkData);
                }
              } else {
                resolve(chunkData);
              }
            });
          });

          req.on('error', (err) => reject(err));
          
          req.setTimeout(35000, () => {
            req.destroy();
            console.error(`[EvaService DEBUG] HTTP request to ${url} timed out.`);
            reject(new Error(`HTTP GET Timeout after 35000ms for ${url}`));
          });

          req.end();
        });

        console.log(`[EvaService DEBUG] Node HTTP GET success for: ${url} (payload size: ${JSON.stringify(data).length})`);
        // If promise resolves, request was completely successful
        return data; 

      } catch (err) {
        const msg = err.message || String(err);
        console.warn(`[EvaService DEBUG] GET threw an error: ${msg}`);
        
        // Diagnostics matching standard EVA rejections and disconnected puppeteer contexts
        const isAuthError = msg.includes("HTTP 401") || msg.includes("Authorization has been denied");
        const isConnectionError = msg.includes("Target closed") || msg.includes("Session closed") || msg.includes("Puppeteer page is closed") || msg.includes("No access token") || msg.includes("context error");
        
        if ((isAuthError || isConnectionError) && attempts < maxAttempts) {
          this._log(`GET recoverable error (${isAuthError ? "AUTH_ERROR" : "CONN_ERROR"}) on attempt ${attempts}. Triggering auto-reconnect sequence...`);
          try {
            await this.reconnect(tokenUsed);
          } catch (reconnectErr) {
            this._log("Auto-reconnect failed inside GET catch block: " + (reconnectErr.message || reconnectErr));
            await delay(2000); // Backoff before next iteration
          }
          continue;
        }
        
        this._log(`GET critical error on attempt ${attempts}: ${msg}`);
        
        if (attempts >= maxAttempts) {
          throw err;
        }
      }
    }
  }

  async precargar() {
    this._log("precargar: fetching main dashboard to discover all entities...");
    console.log("[EvaService DEBUG] Initiating candidate extraction sequence (precargar).");
    
    let entityIds = [];
    try {
      const dashboard = await this.get("EnterpriseDashBoard/Dashboard", true);
      
      if (dashboard && Array.isArray(dashboard.E)) {
        entityIds = dashboard.E.map(e => e.EI).filter(id => id);
        this._log(`precargar: discovered ${entityIds.length} entities from dashboard`);
      } else {
        this._log("precargar: dashboard response unexpected format, using fallback IDs");
        console.warn("[EvaService DEBUG] Dashboard response missing expected 'E' array. Using hardcoded fallback IDs.");
        entityIds = [11031, 7176, 7382, 7380, 7381, 26856];
      }
    } catch (err) {
      this._log("precargar: failed to get dashboard, using fallback IDs: " + err.message);
      entityIds = [11031, 7176, 7382, 7380, 7381, 26856];
    }

    this._log(`precargar: fetching details for ${entityIds.length} entities...`);
    const entities = [];
    for (const id of entityIds) {
      try {
        const ent = await this.get(`EnterpriseDashBoard/Entity/Detail/${id}/false`, true);
        if (ent && ent.SF && Array.isArray(ent.SF.JPF)) {
          entities.push(ent);
          this._log(`Entity ${id}: found ${ent.SF.JPF.length} job positions`);
        } else {
          this._log(`Entity ${id} malformed (no JPF array), skipping`);
        }
      } catch (err) {
        this._log(`Entity ${id} failed: ${err && err.message ? err.message : err}`);
      }
    }

    this._log(`precargar: fetching candidates from ${entities.length} entities...`);
    const candidates = [];
    let totalJobs = 0;
    
    for (const e of entities) {
      if (!e?.SF?.JPF) continue;
      totalJobs += e.SF.JPF.length;
      
      for (const jpf of e.SF.JPF) {
        try {
          const c = await this.get(
            `EnterpriseDashboardCandidates/Dashboard/${jpf.JPI}`,
            true,
            { idempotencykey: Buffer.from(String(jpf.JPI)).toString("base64") }
          );
          if (c && typeof c === "object" && Array.isArray(c.JPCM)) {
            candidates.push({ ...c, JP: jpf });
            this._log(`Job ${jpf.JPI}: found ${c.JPCM.length} candidates`);
          } else {
            this._log(`JPF ${jpf.JPI} malformed or empty, skipping`);
          }
        } catch (err) {
          this._log(`JPF ${jpf.JPI} failed: ${err && err.message ? err.message : err}`);
        }
      }
    }

    this._log(`precargar: processed ${totalJobs} job positions, got ${candidates.length} candidate groups`);

    let loggedCandidates = 0;
    this.results = candidates
      .filter(Boolean)
      .flatMap((c) =>
        (c.JPCM || []).map((t) => {
          if (loggedCandidates < 3) {
            console.log("EVA RAW CANDIDATE OBJECT (t):\n" + JSON.stringify(t, null, 2));
            console.log("Parent JP (c.JP):\n" + JSON.stringify(c.JP, null, 2));
            loggedCandidates += 1;
          }
          return {
            ...t,
            N: t.N,
            puesto: c.JP?.N ?? "",
            JID: c.JP?.JPI,
          };
        })
      );
    this._log(`precargar: total candidates extracted: ${this.results.length}`);
    console.log(`[EvaService DEBUG] Total mapped candidates: ${this.results.length}`);

    const cutoff = moment().subtract(this.antiguedad, "months");
    this.cache = this.results
      .filter((r) => {
        const d = moment(r.PD, "YYYY-MM-DD", true);
        return d.isValid() && d.isAfter(cutoff);
      })
      .reduce((acc, r) => {
        acc[`${r.N} *${r.puesto}*`] = r;
        return acc;
      }, {});
    this._log(`precargar done, cache built with ${Object.keys(this.cache).length} recent candidates`);
  }

  async downloadPDF(cid) {
    console.log(`[EvaService DEBUG] Download PDF requested for CID: ${cid}`);
    if (!this.ready && !this._reconnectPromise) {
      console.error("[EvaService DEBUG] Cannot download PDF. Service is not ready.");
      throw new Error("Service not ready");
    }
    const user = this.results.find((u) => String(u.CID) === String(cid));
    if (!user) {
      this._log("downloadPDF: CID " + cid + " not found in results");
      throw new Error("CID not found");
    }
    
    // IMPORTANT: URL format is /report/{JID}/vacant/{CID}/candidate/es/language
    const path = `api/v1/report/${user.JID}/vacant/${user.CID}/candidate/es/language`;
    this._log("downloadPDF: fetching " + path + " for user " + user.N);
    
    let base64 = await this.get(path, true);
    
    // Retry once if payload is empty (EVA can occasionally return empty OK structures)
    if (!base64) {
      this._log("downloadPDF: first attempt returned empty payload, waiting and retrying...");
      console.log("[EvaService DEBUG] Empty base64 block received on first attempt, retrying...");
      await delay(500);
      base64 = await this.get(path, true);
    }
    
    if (typeof base64 !== "string" || !base64) {
      this._log("downloadPDF: Invalid response - not a base64 string. Type: " + typeof base64);
      console.error(`[EvaService DEBUG] Invalid PDF response type: ${typeof base64}`);
      throw new Error("Invalid PDF payload");
    }
    
    this._log("downloadPDF: successfully retrieved PDF (length: " + base64.length + " chars)");
    console.log(`[EvaService DEBUG] Buffer generated from base64 (size: ${base64.length})`);
    return Buffer.from(base64, "base64");
  }

  async close() {
    console.log("[EvaService DEBUG] Triggering puppeteer teardown.");
    try {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
      this._log("Puppeteer session successfully closed");
    } catch (e) {
      this._log("Error gracefully closing puppeteer session: " + (e?.message || e));
      console.error("[EvaService DEBUG] Close error:", e);
    }
  }
}

module.exports = EvaService;