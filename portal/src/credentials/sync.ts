import { deactivateAllExcept, upsertSponsorCredential } from "./store.js";
import { listActiveMaintainerSponsors } from "../github/oauth.js";
import { syncPasswdFile } from "../proxy/users.js";

export interface SyncResult {
  activeSponsors: number;
  activeCredentials: number;
  deactivated: number;
  skipped: boolean;
  message: string;
}

export async function syncSponsorCredentials(): Promise<SyncResult> {
  const sponsors = await listActiveMaintainerSponsors();

  if (sponsors.length === 0) {
    return {
      activeSponsors: 0,
      activeCredentials: 0,
      deactivated: 0,
      skipped: true,
      message: "Maintainer sponsor sync skipped (no GITHUB_TOKEN or no sponsors returned).",
    };
  }

  for (const sponsor of sponsors) {
    upsertSponsorCredential({
      githubId: sponsor.githubId,
      githubLogin: sponsor.login,
      sponsorTier: null,
      rotatePassword: false,
    });
  }

  const beforeDeactivate = sponsors.map((sponsor) => sponsor.githubId);
  deactivateAllExcept(beforeDeactivate);
  syncPasswdFile();

  return {
    activeSponsors: sponsors.length,
    activeCredentials: sponsors.length,
    deactivated: 0,
    skipped: false,
    message: `Synced ${sponsors.length} active sponsor credential(s).`,
  };
}

export function startSponsorSyncLoop(intervalHours: number, onResult: (result: SyncResult) => void): NodeJS.Timeout {
  const intervalMs = Math.max(intervalHours, 1) * 60 * 60 * 1000;

  const run = async () => {
    try {
      const result = await syncSponsorCredentials();
      onResult(result);
    } catch (error) {
      onResult({
        activeSponsors: 0,
        activeCredentials: 0,
        deactivated: 0,
        skipped: true,
        message: error instanceof Error ? error.message : "Unknown sponsor sync error",
      });
    }
  };

  void run();
  return setInterval(() => {
    void run();
  }, intervalMs);
}
