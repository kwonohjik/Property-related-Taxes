/**
 * 업종별 기준공장면적률 조회 — 「공장입지 기준고시」 [별표 1]
 *
 * 「지방세법 시행규칙」 §50 [별표6]의 분모다:
 *   공장입지기준면적 = 공장건축물 연면적 × 100 ÷ **업종별 기준공장면적률**
 *
 * ## 🔴 버전 게이트가 이 모듈의 핵심이다
 *
 * 2026-02-25 개정(산업통상부고시 제2026-016호)은 **「제11차 한국표준산업분류」 반영**이다
 * (제개정이유 실측: "업종명, 분류번호 등 반영"). 즉 **분류번호 체계가 10차 → 11차로 교체**됐다.
 *
 * 그 이전 시점에는 **2018-162호(KSIC 10차)**가 적용법이므로 이 표를 쓰면 안 된다.
 * 같은 5자리 코드가 다른 업종을 가리킬 수 있어, 그대로 쓰면 **면적률이 조용히 틀어져**
 * 기준면적이 어긋나고 초과분 판정이 뒤집힌다.
 *
 * ⇒ `lookupFactoryAreaRate`는 기준일이 시행일보다 이르면 **결과를 주지 않는다**.
 * 호출부는 그때 사용자에게 직접입력을 요구해야 한다(추정 금지 · 자동 fallback 금지).
 *
 * 10차 데이터셋을 확보하면 여기에 버전을 추가해 그 구간도 자동화할 수 있다.
 */

import { FACTORY_AREA_RATE_ROWS } from "./factory-area-rates.generated";

/**
 * 현행 「공장입지 기준고시」 [별표 1] 시행일 — 2026-02-25.
 * 부칙: "이 고시는 공포한 날부터 시행한다"(제2026-016호, 공포 2026-02-25).
 */
export const FACTORY_AREA_RATE_EFFECTIVE_DATE = new Date("2026-02-25");

/** 「공장입지 기준고시」 §4 — 지식산업센터는 별표1이 아니라 이 값을 쓴다. */
export const KNOWLEDGE_INDUSTRY_CENTER_RATE_PERCENT = 40;

export interface FactoryAreaRateEntry {
  /** KSIC 세세분류 코드 (5자리) */
  code: string;
  /** 업종명 (세세분류) */
  name: string;
  /** 기준공장면적률 (%) */
  ratePercent: number;
}

const ENTRIES: readonly FactoryAreaRateEntry[] = FACTORY_AREA_RATE_ROWS.map(
  ([code, name, ratePercent]) => ({ code, name, ratePercent }),
);

const BY_CODE = new Map(ENTRIES.map((e) => [e.code, e]));

/** 전체 목록 (표시·검색용). 코드 오름차순. */
export function allFactoryAreaRates(): readonly FactoryAreaRateEntry[] {
  return ENTRIES;
}

/**
 * 기준일에 현행 별표1을 적용할 수 있는지.
 *
 * @param basisDate 양도일(양도세) 또는 과세기준일(재산세)
 */
export function isCurrentFactoryAreaRateApplicable(basisDate: Date | undefined): boolean {
  if (!basisDate) return false;
  return basisDate.getTime() >= FACTORY_AREA_RATE_EFFECTIVE_DATE.getTime();
}

/**
 * KSIC 코드로 기준공장면적률을 조회한다.
 *
 * @returns 기준일이 현행 고시 시행일보다 이르면 **undefined** — 호출부가 직접입력을 요구해야 한다.
 *   코드 미등재도 undefined(추정 금지).
 */
export function lookupFactoryAreaRate(
  code: string,
  basisDate: Date | undefined,
): FactoryAreaRateEntry | undefined {
  if (!isCurrentFactoryAreaRateApplicable(basisDate)) return undefined;
  return BY_CODE.get(code.trim());
}

/**
 * 업종명·코드 부분일치 검색 (자동완성용).
 *
 * ⚠️ 검색 자체는 기준일과 무관하게 동작한다 — 목록을 보여주는 것까지 막으면 사용자가
 * 자기 업종의 코드조차 확인할 수 없다. **값을 채우는 시점**에 `lookupFactoryAreaRate`가
 * 게이트를 건다.
 */
export function searchFactoryAreaRates(query: string, limit = 20): readonly FactoryAreaRateEntry[] {
  const q = query.replace(/\s+/g, "").toLowerCase();
  if (!q) return [];
  const hits: FactoryAreaRateEntry[] = [];
  for (const e of ENTRIES) {
    if (e.code.includes(q) || e.name.replace(/\s+/g, "").toLowerCase().includes(q)) {
      hits.push(e);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}
