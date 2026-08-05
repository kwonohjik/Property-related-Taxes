/**
 * 「공장입지 기준고시」 [별표 1] 업종별 기준공장면적률 데이터 생성기
 *
 * 산출물: `lib/tax-engine/data/factory-area-rates.generated.ts`
 *
 * ## 왜 스크립트로 두는가
 *
 * 480행을 손으로 옮기면 오타를 검증할 방법이 없다. 법제처 API에서 받아 파싱하고,
 * 재고시(현재 3년 재검토 주기 · 직전 개정 2026-02-25)마다 다시 돌린다.
 *
 * ## 조회 방법 주의
 *
 * KoreanLaw MCP `get_admin_rule`은 응답을 **50,000자에서 절단**한다(480행 중 ~303행만 온다).
 * 법제처 Open API `target=admrul`을 직접 호출해야 전문(419KB)을 받는다.
 *
 * ## 표 파싱 — 줄바꿈으로 감긴 업종명을 이어붙인다
 *
 * 표는 고정폭이라 긴 업종명이 다음 줄로 넘어간다. 코드 칸이 빈 줄은 **이전 행의 연속**이다:
 *
 * ```
 * │2721│측정,  시험, 항해, 제어 및 기타 │27211 │레이더,  항행용 무선 기기 및 측량   │15    │
 * │    │정밀 기기 제조업                │      │기구 제조업                         │      │
 * ```
 *
 * 이어붙이지 않으면 "레이더, 항행용 무선 기기 및 측량"에서 끊겨 자동완성 검색이 새어나간다.
 *
 * 실행: `KOREAN_LAW_OC=<OC> npx tsx scripts/generate-factory-area-rates.ts`
 */

import { writeFileSync } from "node:fs";

/** 「공장입지 기준고시」 행정규칙일련번호 (법제처) */
const ADMRUL_ID = "2100000274928";

interface Row {
  code: string;
  name: string;
  ratePercent: number;
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") return void out.push(value);
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((v) => collectStrings(v, out));
  }
}

/** 표 한 줄을 `│` 기준 칸으로 쪼갠다. 테두리 줄(`├──┼`)은 undefined. */
function splitCells(line: string): string[] | undefined {
  if (!line.includes("│")) return undefined;
  const cells = line.split("│");
  // 앞뒤 빈 조각 제거
  return cells.slice(1, -1);
}

const norm = (s: string) => s.replace(/[　\s]+/g, " ").trim();

function parseRows(text: string): Row[] {
  const lines = text.split("\n");
  const rows: Row[] = [];
  for (const line of lines) {
    const cells = splitCells(line);
    if (!cells || cells.length < 5) continue;

    const code = norm(cells[2]);
    const name = norm(cells[3]);
    const rate = norm(cells[4]);

    if (/^\d{5}$/.test(code)) {
      const ratePercent = Number(rate);
      if (!Number.isFinite(ratePercent) || ratePercent <= 0) continue;
      rows.push({ code, name, ratePercent });
      continue;
    }
    // 코드 칸이 비었고 이름 칸에 글자가 있으면 **직전 행의 연속**이다
    if (code === "" && name !== "" && rows.length > 0) {
      const prev = rows[rows.length - 1];
      prev.name = `${prev.name}${name}`.replace(/\s+/g, " ").trim();
    }
  }
  return rows;
}

async function main() {
  const oc = process.env.KOREAN_LAW_OC;
  if (!oc) throw new Error("KOREAN_LAW_OC 환경변수가 필요합니다 (.env.local)");

  const url = `https://www.law.go.kr/DRF/lawService.do?OC=${oc}&target=admrul&ID=${ADMRUL_ID}&type=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`법제처 API 응답 ${res.status}`);
  const json = (await res.json()) as unknown;

  const strings: string[] = [];
  collectStrings(json, strings);
  const text = strings.join("\n");

  const rows = parseRows(text);
  const unique = new Map<string, Row>();
  for (const r of rows) if (!unique.has(r.code)) unique.set(r.code, r);
  const sorted = [...unique.values()].sort((a, b) => a.code.localeCompare(b.code));

  if (sorted.length < 400) {
    throw new Error(`파싱 행 수가 비정상적으로 적습니다(${sorted.length}) — 표 형식이 바뀌었을 수 있습니다.`);
  }

  const body = sorted.map((r) => `  ["${r.code}", "${r.name}", ${r.ratePercent}],`).join("\n");
  const out = `/**
 * 「공장입지 기준고시」 [별표 1] 업종별 기준공장면적률 — **자동 생성 파일**
 *
 * ⚠️ 직접 수정하지 말 것. \`scripts/generate-factory-area-rates.ts\`가 법제처 API에서
 * 받아 생성한다. 고시 재고시 시 스크립트를 다시 돌릴 것.
 *
 * 출처: 산업통상부 「공장입지 기준고시」(행정규칙일련번호 ${ADMRUL_ID})
 * 근거: 「산업집적활성화 및 공장설립에 관한 법률」 §8 · 같은 고시 §3① [별표1]
 * 소비: 「지방세법 시행규칙」 §50 [별표6] — 공장입지기준면적 = 연면적 × 100 ÷ 기준공장면적률
 *
 * 🔴 **이 데이터는 KSIC 11차 기준이다**(2026-02-25 개정 — 제11차 한국표준산업분류 반영).
 * 그 이전 양도·과세분에는 2018-162호(KSIC 10차)가 적용법이므로 **이 표를 쓰면 안 된다**.
 * 버전 게이트는 \`factory-area-rates.ts\`의 \`FACTORY_AREA_RATE_EFFECTIVE_DATE\`가 담당한다.
 *
 * 행 수: ${sorted.length} · 생성: 스크립트 실행 시점
 */

/** [KSIC 세세분류 코드, 업종명, 기준공장면적률(%)] */
export const FACTORY_AREA_RATE_ROWS: ReadonlyArray<readonly [string, string, number]> = [
${body}
];
`;
  const path = "lib/tax-engine/data/factory-area-rates.generated.ts";
  writeFileSync(path, out, "utf-8");
  console.log(`✓ ${path} — ${sorted.length}행 생성`);
  const rates = [...new Set(sorted.map((r) => r.ratePercent))].sort((a, b) => a - b);
  console.log(`  면적률 종류: ${rates.join("·")}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
