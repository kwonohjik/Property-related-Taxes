#!/usr/bin/env node
/**
 * 키움 OpenAPI 자격증명·출구 IP 점검.
 *
 * 키움 앱키는 **사용 IP를 키움에 등록**해야 동작한다(개발자센터에서 IP 추가·변경).
 * 노트북을 들고 이동하면 공인 IP가 바뀌어 매번 재등록해야 하므로, Tailscale exit node로
 * 출구 IP를 한 곳(집 회선)에 고정하고 그 IP 하나만 등록하는 운용을 쓴다.
 *
 * 이 스크립트는 그 운용이 실제로 성립하는지 한 번에 확인한다:
 *   1. 지금 나가는 공인 IP (= 키움에 등록해야 할 값)
 *   2. 그 IP로 토큰이 실제 발급되는지
 *
 * 사용:
 *   node scripts/check-kiwoom-auth.mjs
 *
 * exit node를 켜고 끄며 두 번 돌려 IP가 바뀌는지 확인하면 라우팅이 먹었는지 알 수 있다.
 */

import { readFileSync } from "node:fs";

/** .env.local에서 KEY=VALUE 줄만 읽는다 (주석 마커 없는 줄이 섞여 있어 셸 source는 실패한다) */
function readEnvLocal() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...readEnvLocal(), ...process.env };
const appKey = env.KIWOOM_APP_KEY;
const appSecret = env.KIWOOM_APP_SECRET;
const kiwoomEnv = (env.KIWOOM_ENV ?? "mock").toLowerCase() === "prod" ? "prod" : "mock";
const baseUrl = kiwoomEnv === "prod" ? "https://api.kiwoom.com" : "https://mockapi.kiwoom.com";

async function currentEgressIp() {
  for (const url of ["https://api.ipify.org", "https://ifconfig.me/ip"]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return (await res.text()).trim();
    } catch {
      // 다음 후보로
    }
  }
  return null;
}

const ip = await currentEgressIp();
console.log(`출구 공인 IP : ${ip ?? "확인 실패 (네트워크)"}`);
console.log(`KIWOOM_ENV   : ${kiwoomEnv}  →  ${baseUrl}`);

if (!appKey || !appSecret) {
  console.error("\n✗ KIWOOM_APP_KEY / KIWOOM_APP_SECRET 이 .env.local에 없습니다.");
  process.exit(1);
}
console.log(`자격증명     : appKey ${appKey.length}자 · secret ${appSecret.length}자`);

let res;
try {
  res = await fetch(`${baseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      secretkey: appSecret,
    }),
    signal: AbortSignal.timeout(15000),
  });
} catch (e) {
  console.error(`\n✗ 토큰 요청 자체가 실패했습니다: ${e.message}`);
  process.exit(1);
}

const json = await res.json().catch(() => ({}));
const token = json.token ?? json.access_token;

if (token) {
  console.log(`\n✓ 토큰 발급 성공 (${token.length}자) — 이 IP는 키움에 등록되어 있습니다.`);
  process.exit(0);
}

// 실패 — return_msg에 원인이 들어 있다 (return_code만으로는 판별 불가)
console.error(`\n✗ 토큰 발급 실패 (HTTP ${res.status})`);
console.error(`  return_code : ${json.return_code ?? "?"}`);
console.error(`  return_msg  : ${json.return_msg ?? "(없음)"}`);
const msg = String(json.return_msg ?? "");
if (msg.includes("8001") || msg.includes("검증에 실패")) {
  console.error(
    `\n  → 앱키·시크릿이 무효이거나, 지금 나가는 IP(${ip ?? "?"})가 키움에 등록되어 있지 않습니다.` +
      `\n    개발자센터에서 이 IP를 등록하거나, exit node를 켜고 다시 실행하세요.`,
  );
}
process.exit(1);
