#!/usr/bin/env node
/**
 * 한국은행 ECOS 생산자물가지수(총지수) 월간 1965.01~1985.12 → lib/tax-engine/data/producer-price-index.ts 재생성
 *
 * 통계표 404Y014 「4.1.1.1. 생산자물가지수(기본분류)」 · 항목 *AA 총지수 · 2020=100 · 주기 M
 *
 * 사용: node scripts/fetch-ppi-ecos.mjs            # 공개 샘플 키(요청당 10행) — 26회 호출
 *       ECOS_API_KEY=... node scripts/fetch-ppi-ecos.mjs   # 인증키가 있으면 페이지 크기를 키운다
 *
 * 엔진은 이 스크립트를 부르지 않는다 — **커밋된 상수만** 읽는다(역사 과세테이블 규약).
 * 값이 바뀔 이유는 한국은행의 기준년 개편뿐이므로 갱신은 이 스크립트로만 한다.
 */

import { writeFileSync } from "node:fs";

const KEY = process.env.ECOS_API_KEY ?? "sample";
const PAGE = KEY === "sample" ? 10 : 100;
const FROM = "196501";
const TO = "198512";
const URL_BASE = "https://ecos.bok.or.kr/api/StatisticSearch";

const rows = [];
for (let start = 1; ; start += PAGE) {
  const url = `${URL_BASE}/${KEY}/json/kr/${start}/${start + PAGE - 1}/404Y014/M/${FROM}/${TO}/*AA`;
  const res = await fetch(url);
  const json = await res.json();
  const body = json.StatisticSearch;
  if (!body) throw new Error(`ECOS 응답 이상 (start=${start}): ${JSON.stringify(json).slice(0, 200)}`);
  rows.push(...body.row);
  if (rows.length >= body.list_total_count) break;
}

if (rows.length !== 252) throw new Error(`1965.01~1985.12는 252개월이어야 한다 — 실제 ${rows.length}`);
rows.sort((a, b) => a.TIME.localeCompare(b.TIME));
rows.forEach((r, i) => {
  const y = 1965 + Math.floor(i / 12);
  const m = (i % 12) + 1;
  if (r.TIME !== `${y}${String(m).padStart(2, "0")}`) throw new Error(`월 누락: 기대 ${y}${m} 실제 ${r.TIME}`);
});

const today = new Date().toISOString().slice(0, 10);
const lines = [];
for (let y = 1965; y <= 1985; y++) {
  const vals = rows.slice((y - 1965) * 12, (y - 1965) * 12 + 12).map((r) => r.DATA_VALUE);
  lines.push(`  ${y}: [${vals.join(", ")}],`);
}

const out = `/**
 * 생산자물가지수(총지수) 월간 1965.01~1985.12 — 한국은행 ECOS 통계표 404Y014 「4.1.1.1. 생산자물가지수(기본분류)」
 *
 * ⚠️ 자동 생성 파일 — 직접 고치지 말고 \`node scripts/fetch-ppi-ecos.mjs\`로 재생성한다. (조회일 ${today})
 *
 * 용도: 소득세법 시행령 §176의2④2호 「취득일부터 의제취득일의 직전일까지의 보유기간동안의 생산자물가상승률」
 *   — 국세청 재산46014-10094(2002.8.14.): 생산자물가상승률에 의한 의제취득일 현재의 취득가액 =
 *     취득당시 실지거래가액 × (의제취득일의 직전일이 속하는 달의 생산자물가지수) / 취득일이 속하는 달의 생산자물가지수
 *
 * ⚠️ 한계 (계획서 docs/00-pm/stock-pre-deemed-acquisition-176-2-4.plan.md §3.3 · Q-3)
 *   · 기준년이 **2020=100**이고 값이 **소수 2자리**다. 1960~70년대는 한 자릿수라 반올림 오차가 상대 0.1~0.2%까지 커진다.
 *     당시 국세청이 쓴 기준년 계열과 비율이 미세하게 다를 수 있다 — 재현 가능한 공식 출처라는 이유로 이 계열을 쓴다.
 *   · 계열은 1965년 1월부터다. 그 이전 취득분은 이 표로 계산할 수 없다(사용자 직접 입력 비율 — Q-4).
 *
 * 형식: 연도 → 1~12월 지수 (배열 인덱스 0 = 1월)
 */
export const PPI_MONTHLY_FIRST_YEAR = 1965;
export const PPI_MONTHLY_LAST_YEAR = 1985;

export const PRODUCER_PRICE_INDEX_MONTHLY: Readonly<Record<number, readonly number[]>> = {
${lines.join("\n")}
};
`;
writeFileSync(new URL("../lib/tax-engine/data/producer-price-index.ts", import.meta.url), out);
console.log(`producer-price-index.ts 생성 — ${rows.length}개월 (${rows[0].TIME}=${rows[0].DATA_VALUE} … ${rows.at(-1).TIME}=${rows.at(-1).DATA_VALUE})`);
