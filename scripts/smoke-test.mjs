#!/usr/bin/env node

/**
 * Smoke tests for the OpenNOW forward proxy.
 *
 * Usage:
 *   node scripts/smoke-test.mjs --host 127.0.0.1 --port 3128 --user sponsor_1 --pass secret
 *
 * Optional env vars:
 *   PROXY_HOST, PROXY_PORT, PROXY_USER, PROXY_PASS
 */

const args = parseArgs(process.argv.slice(2));

const host = args.host || process.env.PROXY_HOST || "127.0.0.1";
const port = Number(args.port || process.env.PROXY_PORT || 3128);
const user = args.user || process.env.PROXY_USER || "";
const pass = args.pass || process.env.PROXY_PASS || "";

const tests = [
  {
    name: "Unauthenticated CONNECT is rejected",
    run: () => expectProxyFailure({
      targetHost: "games.geforce.com",
      targetPort: 443,
      auth: null,
    }),
  },
  {
    name: "Allowed domain CONNECT succeeds with auth",
    run: () => expectProxySuccess({
      targetHost: "games.geforce.com",
      targetPort: 443,
      auth: user && pass ? { user, pass } : null,
      skipWithoutAuth: true,
    }),
  },
  {
    name: "Allowed nvidiagrid domain CONNECT succeeds with auth",
    run: () => expectProxySuccess({
      targetHost: "prod.cloudmatchbeta.nvidiagrid.net",
      targetPort: 443,
      auth: user && pass ? { user, pass } : null,
      skipWithoutAuth: true,
    }),
  },
  {
    name: "Blocked domain CONNECT is rejected with auth",
    run: () => expectProxyFailure({
      targetHost: "google.com",
      targetPort: 443,
      auth: user && pass ? { user, pass } : null,
      skipWithoutAuth: true,
    }),
  },
];

let passed = 0;
let failed = 0;
let skipped = 0;

for (const test of tests) {
  try {
    const result = await test.run();
    if (result.skipped) {
      skipped += 1;
      console.log(`SKIP  ${test.name} (${result.reason})`);
      continue;
    }
    if (result.ok) {
      passed += 1;
      console.log(`PASS  ${test.name}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${test.name}: ${result.reason}`);
    }
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${test.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed > 0 ? 1 : 0);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--host") parsed.host = argv[++index];
    if (token === "--port") parsed.port = argv[++index];
    if (token === "--user") parsed.user = argv[++index];
    if (token === "--pass") parsed.pass = argv[++index];
  }
  return parsed;
}

function connectProxy({ targetHost, targetPort, auth }) {
  return new Promise((resolve, reject) => {
    import("node:net").then(({ connect }) => {
      const socket = connect({ host, port });
      let response = "";

      socket.setTimeout(10000);
      socket.on("connect", () => {
        const headers = [`CONNECT ${targetHost}:${targetPort} HTTP/1.1`, `Host: ${targetHost}:${targetPort}`];
        if (auth) {
          const token = Buffer.from(`${auth.user}:${auth.pass}`).toString("base64");
          headers.push(`Proxy-Authorization: Basic ${token}`);
        }
        headers.push("", "");
        socket.write(headers.join("\r\n"));
      });
      socket.on("data", (chunk) => {
        response += chunk.toString("utf8");
        if (response.includes("\r\n\r\n")) {
          socket.end();
          resolve(response);
        }
      });
      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("Timed out waiting for proxy response"));
      });
      socket.on("error", reject);
    }).catch(reject);
  });
}

async function expectProxySuccess({ targetHost, targetPort, auth, skipWithoutAuth = false }) {
  if (skipWithoutAuth && !auth) {
    return { ok: true, skipped: true, reason: "credentials not provided" };
  }

  const response = await connectProxy({ targetHost, targetPort, auth });
  const statusLine = response.split("\r\n")[0] || "";
  if (/^HTTP\/1\.[01] 200/.test(statusLine)) {
    return { ok: true };
  }
  return { ok: false, reason: statusLine || response.slice(0, 120) };
}

async function expectProxyFailure({ targetHost, targetPort, auth, skipWithoutAuth = false }) {
  if (skipWithoutAuth && !auth) {
    return { ok: true, skipped: true, reason: "credentials not provided" };
  }

  const response = await connectProxy({ targetHost, targetPort, auth });
  const statusLine = response.split("\r\n")[0] || "";
  if (/^HTTP\/1\.[01] 200/.test(statusLine)) {
    return { ok: false, reason: "proxy unexpectedly allowed the connection" };
  }
  return { ok: true };
}
