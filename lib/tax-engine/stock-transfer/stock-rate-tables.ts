/**
 * 주식 양도소득세 — 세율표 + 대주주 임계 시기별 매트릭스
 *
 * 법령: 소득세법 시행령 §157 (상장 대주주 임계) / §167의8 (비상장 대주주 임계)
 *       / §104①11 (세율)
 * 임계 변경 시 row 추가만으로 대응 가능한 구조.
 */

import {
  STOCK_MAJOR_MARKET_CAP_2024,
} from "@/lib/tax-engine/legal-codes/stock";

// ============================================================
// 대주주 임계 이력 (시기별 — 코스피·코스닥·코넥스 분리)
// ============================================================

export interface MajorShareholderThreshold {
  /** 적용 시작일 (이상) */
  from: Date;
  /** 지분율 임계 (0.01 = 1%) */
  shareRatioThreshold: number;
  /** 시총 임계 (원) */
  marketCapThreshold: number;
  /**
   * 적용 규칙 출처 (UI 라벨링용 — Phase B 신설, 2026-05-19).
   * - "§157": 상장 (kospi/kosdaq/konex)
   * - "§167의8①2호": 비상장 일반
   * - "§167의8①2호_벤처": 비상장 벤처기업 (시총 임계 40억 적용)
   *
   * 매트릭스 상수 정의 시점엔 undefined, `getMajorShareholderThreshold()` 반환 시 동적 부착.
   */
  ruleSource?: "§157" | "§167의8①2호" | "§167의8①2호_벤처";
  /**
   * 비상장 벤처기업 임계 적용 여부 (UI 배지 분기용 — Phase B 신설, 2026-05-19).
   * `getMajorShareholderThreshold(unlisted, _, { isVentureCompany: true })` 호출 시 true.
   */
  isVentureRule?: boolean;
}

/** 코스피 대주주 임계 이력 (코넥스 공통 적용 없음 — 코스닥·코넥스 별도) */
export const KOSPI_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  // 2024.1.1.~ (현행) — 시행령 §157 개정
  { from: new Date("2024-01-01"), shareRatioThreshold: 0.01, marketCapThreshold: 5_000_000_000 },
  // 2020.4.1.~ 2023.12.31.
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 1_000_000_000 },
  // 2018.4.1.~ 2020.3.31.
  { from: new Date("2018-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 1_500_000_000 },
  // 2017.~ 2018.3.31.
  { from: new Date("2017-01-01"), shareRatioThreshold: 0.01, marketCapThreshold: 2_500_000_000 },
  // 2016.4.1.~ 2016.12.31. (F-01 — 교재 §3장 이미지 48 ⑤, KoreanLaw 미검증)
  { from: new Date("2016-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 2_500_000_000 },
  /**
   * 2014.1.1.~ 2016.3.31. — 지분율 3%→2% · 시총 100억→50억 확대.
   *
   * 🔑 `from`이 공포일(2013.2.15.)도 시행일(2013.7.1.)도 아닌 **2014-01-01**이다.
   *    대통령령 제24356호 부칙 §22②: 「제157조제4항제1호 및 제2호의 개정규정(주식양도차익
   *    과세대상인 대주주 범위를 **확대하는 부분만** 해당한다)은 **2013년 7월 1일이 속하는
   *    사업연도 종료일 후 양도하는 분부터** 적용한다.」
   *    ⇒ 역년 사업연도면 종료일 2013-12-31, 그 **후** 양도분 = 2014-01-01 이후.
   *    (부칙 §22①의 「이 영 시행 후 양도하는 분」은 **특수관계인 범위** 축이라 임계표와 무관.)
   */
  { from: new Date("2014-01-01"), shareRatioThreshold: 0.02, marketCapThreshold: 5_000_000_000 },
  // 1999.~ 2013.12.31.
  { from: new Date("1999-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
  // ~1998 (임의 시작일)
  { from: new Date("1900-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
];

/**
 * 코스닥 대주주 임계 이력
 *
 * ⚠️ 2013-08-29 행은 제24356호가 아닌 **다른 개정** 축이라 위 부칙 §22② 정정 대상이 아니다.
 *    (KOSPI만 2013-01-01 → 2014-01-01로 옮겼다.)
 */
export const KOSDAQ_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  // 2024.1.1.~ (현행)
  { from: new Date("2024-01-01"), shareRatioThreshold: 0.02, marketCapThreshold: 5_000_000_000 },
  // 2020.4.1.~
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 1_000_000_000 },
  // 2018.4.1.~
  { from: new Date("2018-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 1_500_000_000 },
  // 2017.~
  { from: new Date("2017-01-01"), shareRatioThreshold: 0.02, marketCapThreshold: 2_000_000_000 },
  // 2016.4.1.~ 2016.12.31. (F-02 — 교재 §3장 이미지 48 ⑤, KoreanLaw 미검증)
  { from: new Date("2016-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 2_000_000_000 },
  // 2013.8.29.~ 2016.3.31. (구간 단축)
  { from: new Date("2013-08-29"), shareRatioThreshold: 0.02, marketCapThreshold: 4_000_000_000 },
  // 2000.~
  { from: new Date("2000-01-01"), shareRatioThreshold: 0.03, marketCapThreshold: 10_000_000_000 },
  // 1999.~
  { from: new Date("1999-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
  // ~1998
  { from: new Date("1900-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
];

/** 코넥스 대주주 임계 이력 (2020.4.1. 시장 개설 이후) */
export const KONEX_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  // 2024.1.1.~ (현행) — §157 시총 50억 통일
  { from: new Date("2024-01-01"), shareRatioThreshold: 0.04, marketCapThreshold: STOCK_MAJOR_MARKET_CAP_2024 },
  // 2020.4.1.~
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.04, marketCapThreshold: 1_000_000_000 },
  // 코넥스 최초 (2013.7.1. 개설)
  { from: new Date("2013-07-01"), shareRatioThreshold: 0.04, marketCapThreshold: 1_000_000_000 },
];

// ============================================================
// 비상장 대주주 임계 이력 (시기별 — §167의8①2호)
// ============================================================

/**
 * 비상장(주권비상장법인) 대주주 임계 이력
 *
 * 법령: 소득세법 시행령 §167의8①2호
 *   가목: 지분율 기준 (주주 1인 및 기타주주 합산)
 *   나목: 시가총액 기준
 *
 * 검증 상태:
 * - 현행(2024.1.1.~): §167의8①2호 가목 4% / 나목 10억 — KoreanLaw MCP 조문 직접 확인 (2026-05-17)
 * - 2020.4.1.~ 2023.12.31.: 4% / 10억 — 현행과 동일 (연혁 API 미지원, 조문 연속성 추정)
 * - 2018.4.1.~ 2020.3.31.: 4% / 15억 — §157 코스닥 개정 패턴 병행 참고 (법제처 연혁 미확인)
 * - 2017.1.1.~ 2018.3.31.: 4% / 25억 — 동일 (법제처 연혁 미확인)
 * - 2013.1.1.~ 2016.12.31.: 2% / 30억 — 동일 (법제처 연혁 미확인)
 * - ~2012.12.31.: 2% / Infinity — fallback (법제처 연혁 미확인)
 *
 * ⚠️ 주의: §157(상장)의 2024.1.1.~ 50억 통일과 달리, §167의8(비상장)은 10억 유지.
 * ⚠️ 2017.1.1.~2023.12.31. 임계는 법제처 연혁 API 미확인 — 실무 필요 시 재검증.
 */
export const UNLISTED_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  // 2020.4.1.~ 현재 (현행 §167의8①2호 KoreanLaw MCP 직접 확인 — 2026-05-17 F-6)
  // 가목: 지분율 4% / 나목: 시총 10억원
  //   (§178①에 따라 거래되는 벤처기업 주식은 40억원 — `getMajorShareholderThreshold` 분기)
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.04, marketCapThreshold: 1_000_000_000 },
  // 2018.4.1.~ 2020.3.31. (시총 25억→15억 완화 — WebSearch 검증 2026-05-17 F-6)
  { from: new Date("2018-04-01"), shareRatioThreshold: 0.04, marketCapThreshold: 1_500_000_000 },
  // 2017.1.1.~ 2018.3.31. (시총 50억→25억 완화 — WebSearch 검증 2026-05-17 F-6)
  { from: new Date("2017-01-01"), shareRatioThreshold: 0.04, marketCapThreshold: 2_500_000_000 },
  // 2016.4.1.~ 2016.12.31. (F-03 — 교재 §3장 이미지 48 ⑤ 비상장 2%/50억, KoreanLaw 미검증)
  // 2016.1.1.~3.31. 구간은 교재 미명시 → 추정 금지, 현행 행(4%/50억) 유지
  { from: new Date("2016-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 5_000_000_000 },
  // 2013.1.1.~ 2016.3.31. (구간 단축, 시총 50억 추정·법제처 부칙 미확인)
  // F-6 정정 (2026-05-17): 지분율 0.02 → 0.04 — 비상장은 §157 코스닥 2% 패턴 잘못 차용 정정
  { from: new Date("2013-01-01"), shareRatioThreshold: 0.04, marketCapThreshold: 5_000_000_000 },
  // ~2012.12.31. fallback (법제처 부칙 미확인)
  // F-6 정정 (2026-05-17): 지분율 0.02 → 0.05 — §94①3 나목 일반 5% 보수적 fallback
  { from: new Date("1900-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
];

/**
 * 시장 타입 + **양도일**로 대주주 임계 조회 — 시기별 가장 최근 적용 임계를 반환.
 *
 * 🔑 **인자는 「양도일」이지 「직전 사업연도 종료일」이 아니다** (리뷰 2026-08-28 #2 정정).
 *
 * §157에는 성격이 다른 두 날짜가 섞여 있다:
 *   ① **보유현황 측정 시점** = 직전 사업연도 종료일 — 지분율·시총을 **얼마로 볼지**(§157①·④)
 *   ② **개정본 적용 시기** = 어느 임계 금액이 유효한지 — 조문이 아니라 **부칙**이 정하고,
 *      부칙은 한결같이 「**양도하는 분부터**」다(제34061호 §2·제30395호 §2②·제24356호 §22②).
 *
 * 이 함수가 고르는 것은 ②다. 종전에는 ①을 넘겨받아, 표의 `from`이 시행일(4-1 등)인데
 * 역년 사업연도의 직전 종료일은 12-31뿐이라 **4-1 행이 다음 해 12-31에서야 매칭**됐다.
 *
 * Phase B 확장 (2026-05-19):
 * - 비상장 벤처기업 시총 임계 40억 적용
 * - 반환 객체에 `ruleSource`·`isVentureRule` 동적 부착
 *
 * 🔴 2026-08-28 정정(리뷰 #14 — **세액 변경**) — 40억 예외에 「**거래 방법**」 요건이 빠져 있었다.
 *   options 타입이 `{ isVentureCompany?: boolean }` 하나뿐이라 `isKOTCTrading` 을 **받을 통로
 *   자체가 없었다**(그 필드는 같은 input 에 있고 `stock-classification.ts` 가 이미 쓴다).
 *
 *   법문(소득세법 시행령 lawId 003956 §167의8①2호 **나목 본문 괄호** — 「단서」가 아니다):
 *     「… 시가총액이 10억원(**「자본시장과 금융투자업에 관한 법률 시행령」 제178조제1항에
 *      따라 거래되는** 「벤처기업육성에 관한 특별법」 제2조제1항에 따른 벤처기업의 주식등의
 *      경우에는 40억원으로 한다) 이상인 경우」
 *   ⇒ 40억은 **거래 방법 × 벤처기업**의 곱이다.
 *
 *   실측: 비상장·지분율 0.1%·시총 15억·비중소·벤처 ON·K-OTC OFF(장외 개인간)
 *     현재 임계 40억 → unlisted_non_major 20% → finalTax 79,500,000
 *     정상 임계 10억 → unlisted_major     25% → finalTax 84,375,000  ⇒ 4,875,000 과소
 *     (중소기업이면 10% → 39,750,000 vs 84,375,000 = 44,625,000 과소)
 *
 * 🔑 **대칭 확인** — `isKOTCTrading: true` 이면 조특법 §14①7호로 비과세(0)라, 40억 분기가
 *    세액을 실제로 가르는 구간은 정확히 「K-OTC 가 **아닌** 경우」 — 즉 법문이 40억을 주지
 *    않기로 한 구간뿐이다. 감경 예외를 법문대로 좁히는 것이므로 「근거 없는 불리 적용」이
 *    아니다.
 */
export function getMajorShareholderThreshold(
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted",
  transferDate: Date,
  options?: { isVentureCompany?: boolean; isKOTCTrading?: boolean },
): MajorShareholderThreshold {
  let thresholds: MajorShareholderThreshold[];
  if (marketType === "kospi") {
    thresholds = KOSPI_MAJOR_THRESHOLDS;
  } else if (marketType === "kosdaq") {
    thresholds = KOSDAQ_MAJOR_THRESHOLDS;
  } else if (marketType === "konex") {
    thresholds = KONEX_MAJOR_THRESHOLDS;
  } else {
    // unlisted — §167의8①2호
    thresholds = UNLISTED_MAJOR_THRESHOLDS;
  }

  // 최신 from 순 정렬 후 transferDate >= from인 첫 번째 (그 날을 **포함**한 이후 양도분)
  const sorted = [...thresholds].sort((a, b) => b.from.getTime() - a.from.getTime());
  const match = sorted.find((t) => transferDate >= t.from) ?? sorted[sorted.length - 1];

  // 비상장 벤처기업 분기 (§167의8①2호 나목 **본문 괄호**)
  //   요건 3개의 곱: 비상장 × 자본시장법령 §178①에 따라 거래 × 벤처기업
  if (marketType === "unlisted" && options?.isVentureCompany && options?.isKOTCTrading) {
    return {
      ...match,
      marketCapThreshold: 4_000_000_000, // 시총 40억
      ruleSource: "§167의8①2호_벤처",
      isVentureRule: true,
    };
  }

  // 일반 분기 — ruleSource·isVentureRule 동적 부착
  return {
    ...match,
    ruleSource: marketType === "unlisted" ? "§167의8①2호" : "§157",
    isVentureRule: false,
  };
}

/**
 * 시장 타입 + **양도일**로 해당 임계의 적용 시작일(from)을 ISO 문자열로 반환.
 * `buildAppliedThreshold`가 화면 표시용 `fromDate` 산출에 쓴다.
 *
 * ⚠️ `getMajorShareholderThreshold`와 **반드시 같은 날짜**를 받아야 한다 — 다른 날짜로
 *    조회하면 「임계 50억인데 fromDate는 2020-04-01(그 행의 시총은 10억)」 같은 모순이
 *    화면에 그대로 나간다(종전 실측).
 */
export function resolveThresholdFromDate(
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted",
  transferDate: Date,
): string {
  const table =
    marketType === "kospi" ? KOSPI_MAJOR_THRESHOLDS :
    marketType === "kosdaq" ? KOSDAQ_MAJOR_THRESHOLDS :
    marketType === "konex" ? KONEX_MAJOR_THRESHOLDS :
    UNLISTED_MAJOR_THRESHOLDS;
  const sorted = [...table].sort((a, b) => b.from.getTime() - a.from.getTime());
  const match = sorted.find((t) => transferDate >= t.from) ?? sorted[sorted.length - 1];
  return match.from.toISOString().slice(0, 10);
}

// ============================================================
// 누진세율 (§104①11 가목 2) + §55 기타자산)
// ============================================================

/** §104①11 가목 2) 주식 대주주 누진세율 2구간 */
export const STOCK_MAJOR_PROGRESSIVE_BRACKETS = [
  { max: 300_000_000, rate: 0.20, deduction: 0 },
  { max: undefined, rate: 0.25, deduction: 15_000_000 },
] as const;

/** §55 기타자산 누진세율 8단계 (부동산 양도세와 동일 구간) */
export const BASIC_PROGRESSIVE_BRACKETS = [
  { max: 14_000_000, rate: 0.06, deduction: 0 },
  { max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
  { max: 88_000_000, rate: 0.24, deduction: 5_760_000 },
  { max: 150_000_000, rate: 0.35, deduction: 15_440_000 },
  { max: 300_000_000, rate: 0.38, deduction: 19_940_000 },
  { max: 500_000_000, rate: 0.40, deduction: 25_940_000 },
  { max: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { max: undefined, rate: 0.45, deduction: 65_940_000 },
] as const;

/**
 * 「소득세법」 §104①**9호** — **비사업용 토지 과다소유법인 주식** 세율표 (16~55%).
 *
 * [대상] 시행령 **§167조의7**(「비사업용 토지 과다소유법인 주식의 범위」):
 *   「법 §94①4호 **다목 또는 라목**에 해당하는 주식등으로서 해당 법인의 **자산총액 중
 *    「법인세법」 §55조의2②에 따른 비사업용토지의 가액이 차지하는 비율이 100분의 50 이상**인
 *    법인의 주식등」
 *
 * ⭐ **법정 표는 기본표에서 `rate`만 +10%p이고 `deduction`은 그대로다.**
 *   `tax₉ = tax_기본 + 0.1 × base = base × (r + 0.1) − d` 이므로 `d' = d`가 **수학적 필연**이다.
 *   8구간 전부 법문 수치로 검산했다(예: 3억 구간 `3억 × 50% − 1억2,406만 = 25,940,000`
 *   = 기본표 40% 구간 공제). ⇒ **파생**해서 드리프트를 원천 차단한다.
 *   법정 표 8구간 전수는 `__tests__/.../nbl-heavy-corp-brackets.anchor.test.ts`가 고정한다 —
 *   기본표가 개정되면 그 anchor가 빨개져 **법문 재확인을 강제**한다.
 *
 * ⚠️ **`rate + 0.1`을 그대로 쓰면 안 된다** — `0.06 + 0.1 === 0.16000000000000003`이다.
 *   세율은 소수 2자리이므로 **정수(퍼센트포인트) 경유**로 오염을 없앤다
 *   (루트 정책 「부동소수 누적 금지」).
 */
export const NBL_HEAVY_CORP_BRACKETS = BASIC_PROGRESSIVE_BRACKETS.map((b) => ({
  max: b.max,
  rate: Math.round(b.rate * 100 + 10) / 100,
  deduction: b.deduction,
})) as readonly { max?: number; rate: number; deduction: number }[];
