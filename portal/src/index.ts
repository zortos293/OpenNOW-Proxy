import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";

import { buildProxyUrl, config, sponsorPageUrl } from "./config.js";
import { startSponsorSyncLoop } from "./credentials/sync.js";
import {
  countActiveCredentials,
  getCredentialByGithubId,
  upsertSponsorCredential,
} from "./credentials/store.js";
import {
  buildAuthorizeUrl,
  checkActiveSponsorship,
  exchangeCodeForToken,
  fetchGitHubUser,
} from "./github/oauth.js";
import { syncPasswdFile, writePasswdFile } from "./proxy/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(__dirname, "views");

interface SessionPayload {
  githubId: number;
  githubLogin: string;
  githubName: string | null;
  avatarUrl: string | null;
}

function readView(name: string): string {
  return fs.readFileSync(path.join(viewsDir, name), "utf8");
}

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", config.portalSessionSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto
    .createHmac("sha256", config.portalSessionSecret)
    .update(body)
    .digest("base64url");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
}

function encodeOAuthState(nonce: string): string {
  const body = Buffer.from(JSON.stringify({ nonce, createdAt: Date.now() })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", config.portalSessionSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function decodeOAuthState(token: string | undefined): { nonce: string; createdAt: number } | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto
    .createHmac("sha256", config.portalSessionSecret)
    .update(body)
    .digest("base64url");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      nonce?: string;
      createdAt?: number;
    };
    if (!payload.nonce || !payload.createdAt) return null;
    if (Date.now() - payload.createdAt > 10 * 60 * 1000) return null;
    return { nonce: payload.nonce, createdAt: payload.createdAt };
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHome(): string {
  return render(readView("home.html"), {
    sponsorPageUrl: escapeHtml(sponsorPageUrl()),
    sponsorLogin: escapeHtml(config.githubSponsorLogin),
    activeCredentials: String(countActiveCredentials()),
  });
}

function renderDenied(input: {
  githubLogin: string;
  githubName: string | null;
  avatarUrl: string | null;
}): string {
  return render(readView("denied.html"), {
    githubLogin: escapeHtml(input.githubLogin),
    githubName: escapeHtml(input.githubName ?? input.githubLogin),
    avatarUrl: escapeHtml(input.avatarUrl ?? ""),
    sponsorPageUrl: escapeHtml(sponsorPageUrl()),
    sponsorLogin: escapeHtml(config.githubSponsorLogin),
  });
}

function renderDashboard(input: {
  githubLogin: string;
  githubName: string | null;
  avatarUrl: string | null;
  sponsorTier: string | null;
  proxyUrl: string;
}): string {
  return render(readView("dashboard.html"), {
    githubLogin: escapeHtml(input.githubLogin),
    githubName: escapeHtml(input.githubName ?? input.githubLogin),
    avatarUrl: escapeHtml(input.avatarUrl ?? ""),
    sponsorTier: escapeHtml(input.sponsorTier ?? "Active sponsor"),
    proxyUrl: escapeHtml(input.proxyUrl),
    proxyHost: escapeHtml(config.proxyPublicHost),
    proxyPort: String(config.proxyPort),
    sponsorLogin: escapeHtml(config.githubSponsorLogin),
  });
}

async function buildServer() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(cookie);
  await app.register(formbody);
  await app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
  });

  app.get("/health", async () => ({
    ok: true,
    activeCredentials: countActiveCredentials(),
  }));

  app.get("/", async (_request, reply) => {
    reply.type("text/html").send(renderHome());
  });

  app.get("/auth/login", async (_request, reply) => {
    const nonce = crypto.randomBytes(16).toString("hex");
    const state = encodeOAuthState(nonce);
    reply.redirect(buildAuthorizeUrl(state));
  });

  app.get("/auth/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string; error_description?: string };

    if (query.error) {
      reply.code(400).type("text/html").send(
        render(readView("error.html"), {
          message: escapeHtml(query.error_description || query.error),
        }),
      );
      return;
    }

    if (!query.code || !query.state || !decodeOAuthState(query.state)) {
      reply.code(400).type("text/html").send(
        render(readView("error.html"), {
          message: "Invalid OAuth callback.",
        }),
      );
      return;
    }

    const accessToken = await exchangeCodeForToken(query.code);
    const user = await fetchGitHubUser(accessToken);
    const sponsorship = await checkActiveSponsorship(accessToken);

    reply.setCookie("opennow_proxy_session", encodeSession({
      githubId: user.id,
      githubLogin: user.login,
      githubName: user.name,
      avatarUrl: user.avatarUrl,
    }), {
      path: "/",
      httpOnly: true,
      secure: config.portalPublicUrl.startsWith("https://"),
      sameSite: "lax",
      signed: false,
      maxAge: 60 * 60 * 24 * 7,
    });

    if (!sponsorship.isActive) {
      reply.type("text/html").send(renderDenied({
        githubLogin: user.login,
        githubName: user.name,
        avatarUrl: user.avatarUrl,
      }));
      return;
    }

    const credential = upsertSponsorCredential({
      githubId: user.id,
      githubLogin: user.login,
      sponsorTier: sponsorship.tierName,
      rotatePassword: true,
    });
    syncPasswdFile();

    reply.type("text/html").send(renderDashboard({
      githubLogin: user.login,
      githubName: user.name,
      avatarUrl: user.avatarUrl,
      sponsorTier: sponsorship.tierName,
      proxyUrl: buildProxyUrl(credential.proxyUsername, credential.proxyPassword),
    }));
  });

  app.get("/dashboard", async (request, reply) => {
    const session = decodeSession(request.cookies.opennow_proxy_session);
    if (!session) {
      reply.redirect("/auth/login");
      return;
    }

    const credential = getCredentialByGithubId(session.githubId);
    if (!credential || credential.active !== 1) {
      reply.type("text/html").send(renderDenied({
        githubLogin: session.githubLogin,
        githubName: session.githubName,
        avatarUrl: session.avatarUrl,
      }));
      return;
    }

    reply.type("text/html").send(renderDashboard({
      githubLogin: session.githubLogin,
      githubName: session.githubName,
      avatarUrl: session.avatarUrl,
      sponsorTier: credential.sponsorTier,
      proxyUrl: buildProxyUrl(credential.proxyUsername, credential.proxyPassword),
    }));
  });

  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie("opennow_proxy_session", { path: "/" });
    reply.redirect("/");
  });

  app.post("/admin/sync", async (request, reply) => {
    const adminToken = (request.headers["x-admin-token"] as string | undefined)?.trim();
    if (!adminToken || adminToken !== config.portalSessionSecret) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const { syncSponsorCredentials } = await import("./credentials/sync.js");
    const result = await syncSponsorCredentials();
    reply.send(result);
  });

  return app;
}

async function main() {
  writePasswdFile();

  startSponsorSyncLoop(config.syncIntervalHours, (result) => {
    console.log(`[sync] ${result.message}`);
  });

  const app = await buildServer();
  await app.listen({ port: config.portalPort, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
