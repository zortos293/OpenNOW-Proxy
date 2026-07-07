import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";

import { buildProxyUrl, config } from "./config.js";
import {
  countActiveCredentials,
  createCredential,
  deleteCredential,
  listAllCredentials,
  provisionClientCredential,
  validateClientId,
} from "./credentials/store.js";
import { syncPasswdFile, writePasswdFile } from "./proxy/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(__dirname, "views");

interface AdminSession {
  username: string;
}

function readView(name: string): string {
  return fs.readFileSync(path.join(viewsDir, name), "utf8");
}

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function encodeSession(payload: AdminSession): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", config.portalSessionSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function decodeSession(token: string | undefined): AdminSession | null {
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
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdminSession;
  } catch {
    return null;
  }
}

function renderLogin(error = ""): string {
  return render(readView("admin-login.html"), {
    error: error ? `<p class="error">${escapeHtml(error)}</p>` : "",
  });
}

function renderPanel(input: { message?: string; error?: string }): string {
  const users = listAllCredentials();
  const rows = users.length === 0
    ? `<tr><td colspan="4">No proxy users yet. Create one below.</td></tr>`
    : users
        .map((user) => {
          const proxyUrl = buildProxyUrl(user.username, user.password);
          return `<tr>
            <td><code>${escapeHtml(user.username)}</code></td>
            <td><code>${escapeHtml(user.password)}</code></td>
            <td><input readonly value="${escapeHtml(proxyUrl)}" onclick="this.select()" /></td>
            <td>
              <form method="post" action="/admin/users/${escapeHtml(user.id)}/delete" style="display:inline">
                <button type="submit" class="danger">Delete</button>
              </form>
            </td>
          </tr>`;
        })
        .join("");

  return render(readView("admin-panel.html"), {
    activeUsers: String(users.length),
    proxyHost: escapeHtml(config.proxyPublicHost),
    proxyPort: String(config.proxyPort),
    rows,
    message: input.message ? `<p class="message">${escapeHtml(input.message)}</p>` : "",
    error: input.error ? `<p class="error">${escapeHtml(input.error)}</p>` : "",
  });
}

function setAdminCookie(reply: import("fastify").FastifyReply, username: string): void {
  reply.setCookie("opennow_admin_session", encodeSession({ username }), {
    path: "/",
    httpOnly: true,
    secure: config.portalPublicUrl.startsWith("https://"),
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
}

function requireAdmin(request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply): AdminSession | null {
  const session = decodeSession(request.cookies.opennow_admin_session);
  if (!session) {
    reply.redirect("/admin/login");
    return null;
  }
  return session;
}

async function buildServer() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(cookie);
  await app.register(formbody);
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
  });

  app.get("/health", async () => ({
    ok: true,
    activeUsers: countActiveCredentials(),
  }));

  app.post("/api/public/proxy", {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: "1 minute",
      },
    },
  }, async (request, reply) => {
    if (!config.clientProvisionEnabled) {
      reply.code(503).send({ message: "Community proxy provisioning is disabled." });
      return;
    }

    const body = request.body as { clientId?: string };
    const clientId = body.clientId?.trim() ?? "";
    const clientIdError = validateClientId(clientId);
    if (clientIdError) {
      reply.code(400).send({ message: clientIdError });
      return;
    }

    try {
      const record = provisionClientCredential(clientId);
      syncPasswdFile();
      reply.send({
        proxyUrl: buildProxyUrl(record.username, record.password),
        username: record.username,
        password: record.password,
      });
    } catch (error) {
      reply.code(429).send({
        message: error instanceof Error ? error.message : "Community proxy provisioning failed.",
      });
    }
  });

  app.get("/", async (_request, reply) => {
    reply.redirect("/admin");
  });

  app.get("/admin", async (request, reply) => {
    if (!decodeSession(request.cookies.opennow_admin_session)) {
      reply.redirect("/admin/login");
      return;
    }
    reply.type("text/html").send(renderPanel({}));
  });

  app.get("/admin/login", async (request, reply) => {
    if (decodeSession(request.cookies.opennow_admin_session)) {
      reply.redirect("/admin");
      return;
    }
    reply.type("text/html").send(renderLogin());
  });

  app.post("/admin/login", async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (username !== config.adminUsername || password !== config.adminPassword) {
      reply.code(401).type("text/html").send(renderLogin("Invalid admin username or password."));
      return;
    }

    setAdminCookie(reply, username);
    reply.redirect("/admin");
  });

  app.post("/admin/logout", async (_request, reply) => {
    reply.clearCookie("opennow_admin_session", { path: "/" });
    reply.redirect("/admin/login");
  });

  app.post("/admin/users", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const body = request.body as { username?: string; password?: string };
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    try {
      createCredential(username, password);
      syncPasswdFile();
      reply.type("text/html").send(renderPanel({ message: `Created user "${username}".` }));
    } catch (error) {
      reply.type("text/html").send(
        renderPanel({
          error: error instanceof Error ? error.message : "Failed to create user.",
        }),
      );
    }
  });

  app.post("/admin/users/:id/delete", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const { id } = request.params as { id: string };
    if (deleteCredential(id)) {
      syncPasswdFile();
      reply.type("text/html").send(renderPanel({ message: "User deleted." }));
      return;
    }

    reply.type("text/html").send(renderPanel({ error: "User not found." }));
  });

  return app;
}

async function main() {
  writePasswdFile();
  const app = await buildServer();
  await app.listen({ port: config.portalPort, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
