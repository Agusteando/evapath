export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AUTO_EMAIL_SYNC_DISABLED === "1") return;

  const { startAutoEmailSyncJob } = await import("./app/lib/autoEmailSyncJob.js");
  startAutoEmailSyncJob();
}
