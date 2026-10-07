/**
 * 분할 매도 lot 이 «한 계산»에 담길 수 없는 기간에 걸쳤는가 — ⑧(validate)·⑫(Zod) 단일 소스
 *
 * 엔진은 분할 모드를 양도일 하나(가장 이른 매도 lot — `effectiveTransferDate`)로 잰다. 그 날짜가 대표할 수
 * 없는 축이 셋 있다:
 *
 * · **과세기간**(소득세법 §5 — 1.1.~12.31.) — 기본공제는 「해당 과세기간」마다 연 250만원(§103①)이고
 *   세율·대주주 판정 기준일(직전 사업연도 종료일)도 연도마다 다르다 ⇒ 연도가 갈리면 막는다.
 * · **예정신고 기간**(§105①) — 주식(1항 2호)은 반기, 기타자산(1항 1호)은 달마다 따로 신고한다 ⇒ 예정신고에서
 *   기간이 갈리면 막는다. 확정·수정신고는 과세기간 전체를 합치므로 통과다.
 * · **대주주 기준 변경일** — 임계표 행은 양도일로 고른다(부칙 「양도하는 분부터」). 같은 해 안에서 기준이
 *   바뀐 날(2016.4.1.·2018.4.1.·2020.4.1. 등)을 사이에 두면 판정 기준이 둘이다 ⇒ 기준값이 실제로 다를 때 막는다.
 *
 * 일자가 비었거나 형식이 덜 찬 매도 lot 은 무시한다(그 누락은 lot 단위 검증이 따로 막는다).
 */

import { resolvePreliminaryClause } from "./stock-filing-type";
import { getMajorShareholderThreshold, resolveThresholdFromDate } from "@/lib/tax-engine/stock-transfer/stock-rate-tables";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

export type SplitSalePeriodViolation =
  | { code: "tax_year"; years: number[] }
  | { code: "preliminary_period"; clause: "105-1-1" | "105-1-2"; periods: string[] }
  | { code: "major_threshold"; boundary: string };

export interface SplitSalePeriodFacts {
  saleDates: string[];
  marketType: string | undefined;
  /** 미지정 = 예정신고(3중 패턴 default — store·Step3 와 같다) */
  filingType: string | undefined;
  isVentureCompany?: boolean;
  isKOTCTrading?: boolean;
}

type ThresholdMarket = "kospi" | "kosdaq" | "konex" | "unlisted";
const THRESHOLD_MARKETS = new Set<string>(["kospi", "kosdaq", "konex", "unlisted"]);

export function judgeSplitSalePeriods(f: SplitSalePeriodFacts): SplitSalePeriodViolation[] {
  const dates = [...new Set(f.saleDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  if (dates.length < 2) return [];

  // 연도가 갈리면 나머지 축은 볼 것도 없다(과세기간마다 따로 계산한다)
  const years = [...new Set(dates.map((d) => Number(d.slice(0, 4))))];
  if (years.length > 1) return [{ code: "tax_year", years }];

  const out: SplitSalePeriodViolation[] = [];
  const clause = resolvePreliminaryClause(f.marketType);
  if ((f.filingType || "preliminary") === "preliminary" && clause !== "excluded") {
    const periodOf = (d: string) =>
      clause === "105-1-1"
        ? `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월`
        : `${d.slice(0, 4)}년 ${Number(d.slice(5, 7)) <= 6 ? "상반기" : "하반기"}`;
    const periods = [...new Set(dates.map(periodOf))];
    if (periods.length > 1) out.push({ code: "preliminary_period", clause, periods });
  }

  if (f.marketType && THRESHOLD_MARKETS.has(f.marketType)) {
    const market = f.marketType as ThresholdMarket;
    const opts = { isVentureCompany: f.isVentureCompany, isKOTCTrading: f.isKOTCTrading };
    const first = getMajorShareholderThreshold(market, new Date(dates[0]), opts);
    for (const d of dates.slice(1)) {
      const t = getMajorShareholderThreshold(market, new Date(d), opts);
      if (t.shareRatioThreshold !== first.shareRatioThreshold || t.marketCapThreshold !== first.marketCapThreshold) {
        out.push({ code: "major_threshold", boundary: resolveThresholdFromDate(market, new Date(d)) });
        break;
      }
    }
  }
  return out;
}

export function splitSalePeriodMessage(v: SplitSalePeriodViolation): string {
  switch (v.code) {
    case "tax_year":
      return (
        `매도 건이 서로 다른 연도(${v.years.join("·")})에 걸쳐 있습니다 — 양도소득 기본공제·세율·대주주 판정은 ` +
        "과세기간(1월 1일~12월 31일)마다 따로입니다. 연도별로 나눠 계산하세요 (소득세법 §5·§103①)"
      );
    case "preliminary_period":
      return (
        `예정신고는 신고기간마다 따로 합니다 — 매도 건이 서로 다른 ${v.clause === "105-1-1" ? "달" : "반기"}` +
        `(${v.periods.join("·")})에 걸쳐 있습니다. 기간별로 나눠 계산하거나, 한 해 전체를 합쳐 신고하려면 ` +
        `신고 유형을 확정신고로 바꾸세요 (소득세법 §105①${v.clause === "105-1-1" ? "1호" : "2호"})`
      );
    case "major_threshold":
      return (
        `매도 건 사이에 대주주 판정 기준이 바뀌었습니다(${v.boundary} 시행) — 그 날 전후 양도는 판정 기준이 ` +
        "달라 한 계산으로 합칠 수 없습니다. 바뀐 날 전후로 나눠 계산하세요"
      );
  }
}

/** ⑧ 폼 → 사실 (분할 모드 매도 lot 일자) */
export function splitSalePeriodFacts(
  form: Pick<StockTransferFormData, "transferLots" | "marketType" | "filingType" | "isVentureCompany" | "isKOTCTrading">,
): SplitSalePeriodFacts {
  return {
    saleDates: (form.transferLots ?? []).map((l) => l.transferDate),
    marketType: form.marketType,
    filingType: form.filingType,
    isVentureCompany: form.isVentureCompany,
    isKOTCTrading: form.isKOTCTrading,
  };
}
