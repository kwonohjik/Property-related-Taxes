#!/usr/bin/env node
/**
 * Supabase 마이그레이션 적용 여부 검증 — supabase/migrations/**.sql 의 「최종 상태」와
 * 실제 DB를 대조한다.
 *
 * 왜 필요한가: 이 저장소는 supabase/config.toml 이 없어 `supabase db push` 경로가 아니고,
 * 마이그레이션을 SQL Editor에서 손으로 적용해 왔다. 그래서 **3건이 약 3개월간 누락**돼
 * 있었다(2026-08-28 발견 — drop_regulated_areas · add_stock_transfer_tax_type ·
 * add_stock_valuation_tax_type). 앱이 읽는 테이블은 tax_rates 하나뿐이라 아무도
 * 눈치채지 못했다. 이 스크립트가 그 침묵을 깬다.
 *
 * 기대값은 **SQL 파일에서 파싱**한다(하드코딩 금지 — 이중 소스가 되면 스크립트 자신이
 * 드리프트한다). 파일명 순서 = 적용 순서로 보고 CREATE/DROP을 누적한다.
 *
 * 의존성 0 (fetch + fs만) — CI에서 `npm ci` 없이 `node scripts/verify-supabase-migrations.mjs`.
 *
 * 사용:
 *   npm run verify:supabase                    # .env.local 사용
 *   node --env-file=.env.local scripts/verify-supabase-migrations.mjs
 *
 * 환경변수:
 *   NEXT_PUBLIC_SUPABASE_URL       (필수)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  (필수)
 *   SUPABASE_SERVICE_ROLE_KEY      (선택 — 없으면 CHECK 제약 검증만 건너뛴다.
 *                                   테이블·컬럼·RPC·RLS는 anon 키만으로 검증된다)
 *
 * ⚠️ 알려진 한계: 컬럼 기대값은 CREATE TABLE 문에서만 뽑는다. 앞으로
 *   `ALTER TABLE ... ADD COLUMN` 마이그레이션이 생기면 그 컬럼은 검증 범위 밖이다
 *   (현재 그런 마이그레이션은 0건). 생기면 파서를 함께 확장할 것.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

let failed = 0;
let skipped = 0;
const ok = (m, d = "") => console.log(`  ✓ ${m}${d ? ` — ${d}` : ""}`);
const bad = (m, d = "") => { failed++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ""}`); };
const skip = (m, why) => { skipped++; console.log(`  ⊘ ${m} — 건너뜀: ${why}`); };

// ── 마이그레이션 SQL 파싱 ──────────────────────────────────────────────
function parseMigrations() {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  const tables = new Map(); // name → 컬럼명[] (최종 존재해야 할 테이블)
  const dropped = new Set(); // DROP 되어 **없어야** 할 테이블
  let taxTypeValues = null; // calculations.tax_type 의 최종 허용 목록

  for (const f of files) {
    const sql = readFileSync(join(MIG_DIR, f), "utf8");

    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      const cols = m[2]
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("--"))
        .filter((l) => !/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i.test(l))
        .map((l) => l.split(/\s+/)[0])
        .filter((c) => /^\w+$/.test(c));
      tables.set(m[1], cols);
    }
    for (const m of sql.matchAll(/DROP TABLE (?:IF EXISTS )?(\w+)/g)) {
      tables.delete(m[1]);
      dropped.add(m[1]);
    }

    // 인라인(CREATE TABLE 내부)·ALTER 양쪽 모두 같은 형태로 잡힌다. 마지막 것이 최종.
    for (const m of sql.matchAll(/CONSTRAINT chk_calculations_tax_type\s*\n?\s*CHECK \(tax_type IN \(([\s\S]*?)\)\)/g)) {
      taxTypeValues = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    }
  }
  return { files, tables, dropped, taxTypeValues };
}

// ── PostgREST 얇은 래퍼 ────────────────────────────────────────────────
async function rest(path, { key = ANON, method = "GET", body } = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* 본문 없음 */ }
  return { status: res.status, json };
}

async function main() {
  if (!URL_ || !ANON) {
    console.error("✗ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 필요합니다.");
    process.exit(1);
  }
  const { files, tables, dropped, taxTypeValues } = parseMigrations();
  console.log(`마이그레이션 ${files.length}개 파싱 → 기대 테이블 ${tables.size}종\n`);

  // 1. 도달성
  console.log("[1] 프로젝트 도달성");
  const health = await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: ANON } }).catch((e) => e);
  if (health instanceof Error) bad("REST 도달", `${health.message} (pause 시 NXDOMAIN)`);
  else if (health.ok) ok("REST 도달", `HTTP ${health.status}`);
  else bad("REST 도달", `HTTP ${health.status}`);
  if (failed) { console.log("\n도달 불가 — 이후 검사 불가."); process.exit(1); }

  // 2. 테이블 집합 · 컬럼
  //   OpenAPI 루트(/rest/v1/)는 secret 키 전용이라 anon으로는 못 쓴다 — 대신 select 프로브로 판별한다:
  //     200      = 테이블·컬럼 전부 존재
  //     PGRST205 = 테이블이 스키마 캐시에 없음 (미생성)
  //     42703    = 컬럼 없음 (메시지가 컬럼명을 알려준다)
  console.log("\n[2] 테이블 집합 · 컬럼");
  for (const [t, cols] of tables) {
    const { status, json } = await rest(`/rest/v1/${t}?select=${cols.join(",")}&limit=0`);
    if (status === 200) ok(`${t}`, `${cols.length}컬럼`);
    else if (json?.code === "PGRST205") bad(`${t} 존재`, "마이그레이션은 만들었으나 DB에 없음");
    else if (json?.code === "42703") bad(`${t} 컬럼`, json.message);
    else bad(`${t} 판별 불가`, `HTTP ${status} ${json?.code ?? ""} ${json?.message ?? ""}`);
  }
  // DROP 된 테이블이 아직 살아 있는가 (마이그레이션 8이 실제로 이 형태로 누락됐었다)
  for (const t of dropped) {
    const { status, json } = await rest(`/rest/v1/${t}?select=*&limit=0`);
    if (json?.code === "PGRST205") ok(`${t} 삭제됨`);
    else if (status === 200) bad(`${t} 잔존`, "마이그레이션이 DROP 했는데 DB에 남아 있음");
    else bad(`${t} 판별 불가`, `HTTP ${status} ${json?.code ?? ""}`);
  }

  // 3. calculations.tax_type CHECK — service_role 필요
  console.log("\n[3] calculations.tax_type CHECK 허용값");
  if (!taxTypeValues) {
    skip("CHECK 파싱", "마이그레이션에서 chk_calculations_tax_type 을 찾지 못함");
  } else if (!SVC) {
    skip(`CHECK ${taxTypeValues.length}개 값`, "SUPABASE_SERVICE_ROLE_KEY 미설정 (RLS가 anon 쓰기를 막아 판별 불가)");
  } else {
    // 존재하지 않는 uuid로 insert → 항상 실패한다(데이터 미기록).
    //   23503 FK 위반  = CHECK 통과 ⇒ 값 허용됨
    //   23514 CHECK 위반 = 값 거부됨 ⇒ 마이그레이션 미적용
    const probe = async (taxType) => {
      const { json } = await rest("/rest/v1/calculations", {
        key: SVC, method: "POST",
        body: { user_id: "00000000-0000-0000-0000-000000000000", tax_type: taxType,
                input_data: {}, result_data: {}, tax_law_version: "migration-audit-probe" },
      });
      return json?.code ?? "(코드없음)";
    };
    for (const v of taxTypeValues) {
      const code = await probe(v);
      if (code === "23503") ok(`'${v}' 허용`);
      else if (code === "23514") bad(`'${v}' 거부됨`, "해당 마이그레이션 미적용");
      else bad(`'${v}' 판별 불가`, `코드 ${code}`);
    }
    // 대조군 — 제약이 통째로 사라진 경우를 잡는다(전부 통과로 오독 방지).
    const ctrl = await probe("__migration_audit_control__");
    if (ctrl === "23514") ok("대조군 거부됨", "CHECK 제약 살아 있음");
    else bad("대조군이 거부되지 않음", `코드 ${ctrl} — CHECK 제약이 없어졌을 수 있음`);
  }

  // 4. RPC
  console.log("\n[4] preload_tax_rates() RPC");
  const rpc = await rest("/rest/v1/rpc/preload_tax_rates", {
    method: "POST", body: { p_tax_types: ["transfer"], p_target_date: "2026-01-01" },
  });
  if (rpc.status === 200) ok("실행 가능", `${Array.isArray(rpc.json) ? rpc.json.length : "?"}행`);
  else bad("실행 실패", `HTTP ${rpc.status} ${rpc.json?.code ?? ""}`);

  // 5. RLS
  console.log("\n[5] RLS 정책");
  const r = await rest("/rest/v1/tax_rates?select=id&limit=1");
  if (r.status === 200) ok("anon SELECT 허용");
  else bad("anon SELECT 차단됨", `HTTP ${r.status}`);
  const w = await rest("/rest/v1/tax_rates", {
    method: "POST",
    body: { tax_type: "transfer", category: "special", sub_category: "__rls_probe__",
            effective_date: "2099-01-01", is_active: false },
  });
  if (w.json?.code === "42501") ok("anon INSERT 차단");
  else {
    bad("anon INSERT 미차단", `HTTP ${w.status} ${w.json?.code ?? ""} — RLS 확인 필요`);
    if (w.status === 201 && SVC) {
      await rest("/rest/v1/tax_rates?sub_category=eq.__rls_probe__", { key: SVC, method: "DELETE" });
      console.log("    (기록된 probe 행 삭제함)");
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  if (skipped) console.log(`⊘ 건너뛴 검사 ${skipped}건 — 위 사유 참조 (부분 검증)`);
  if (failed) { console.log(`✗ 실패 ${failed}건 — 미적용 마이그레이션이 있습니다.`); process.exit(1); }
  console.log("✓ 전건 통과 — 마이그레이션이 DB에 모두 반영돼 있습니다.");
}

main().catch((e) => { console.error("치명적 오류:", e); process.exit(1); });
