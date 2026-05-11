// Intentionally no static imports here.
// Next compiles instrumentation for runtimes where Node-only dependencies such as
// Puppeteer can be traced incorrectly. The auto email sync scheduler is started
// from the node-only status/API routes instead.
export async function register() {
  return;
}
