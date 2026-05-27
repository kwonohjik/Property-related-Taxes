/**
 * §63②1호 기업공개 준비 중 법인 평가 — 비상장주식 1주당 최종평가액 override 옵션 (PR-L)
 *
 * 법령 (KoreanLaw MCP 검증 2026-05-27, 상증법 mst=276123 / 상증령 mst=283637):
 *   법 §63②: 제1항제1호에도 불구하고 각 호 주식은 대통령령 방법으로 평가.
 *     1호 = 기업공개 목적 유가증권 신고(미신고 시 거래소 상장신청) 법인의 주식.
 *   영 §57①: 1호 기간 = 유가증권신고(미신고 시 상장신청) 직전 6개월(증여세는 3개월)부터
 *            거래소 최초 상장 전까지. 평가 = MAX(1호 공모가격, 2호 §63①1호가목 / 없으면 나목 §54 보충적평가).
 *   법 §63③: "§1①1호 및 §2에 따라 평가한 가액"에 최대주주 할증 → §63② 결과에도 §63③ 할증.
 *     ∴ 평가 순서 = §54 보충적평가 → §63② MAX override → §63③ 할증.
 *
 * ★ 비상장(상장 시세=가목 없음)이므로 §57①2호 = 나목 = §54 보충적평가. appliedValue = MAX(공모가, §54).
 * ★ 윈도우 [신고일−Nmo, 상장 전)은 신고일 이전 N개월 lookback 포함 — 평가기준일이 신고일보다 앞서도
 *   (사망 후 회사가 IPO 신고) 윈도우 내일 수 있음. evaluationDate < securitiesFilingDate를 미적용으로 처리 금지.
 *
 * 날짜는 orchestrator가 toDate/toOptionalDate로 정규화 후 전달 (JSON 경유 string silent-false 방어).
 *
 * Plan:   docs/00-pm/inheritance-unlisted-stock-pre-ipo-listing-section-63-2.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-pre-ipo-listing-section-63-2.engine.design.md
 */

import { subMonths } from "date-fns";

export interface PreIpoListingInput {
  /** §57①1호 자본시장법상 금융위 기준 공모가격 (1주당) */
  publicOfferingPrice: number;
  /** 윈도우 anchor — 유가증권 신고일(미신고 시 거래소 상장신청일, §57① 단서) */
  securitiesFilingDate: Date;
  /** 6개월(상속) vs 3개월(증여) — §57①. 폼이 상속/증여 명시 주입(자동 추론 금지). */
  taxKind: "inheritance" | "gift";
  /** 거래소 최초 상장일 (미입력 = 상장 전으로 간주) */
  listingDate?: Date;
}

export interface PreIpoListingResult {
  /** withinWindow && 공모가>0 시 true → finalPerShareValue 교체 */
  applied: boolean;
  /** 평가기준일 ∈ [신고일−Nmo, 상장 전) */
  withinWindow: boolean;
  publicOfferingPrice: number;
  /** §54 보충적평가 (= 입력 supplementaryPerShareValue, 모든 §54 분기 포섭) */
  supplementaryValue: number;
  /** MAX(공모가, 보충적) — applied 시 finalPerShareValue 교체 */
  appliedValue: number;
  windowMonths: 6 | 3;
  warnings: string[];
}

/**
 * §63②1호 기업공개 준비 중 평가 적용 판정 + MAX 산출.
 *
 * @param input                       §63②1호 입력 (날짜는 정규화된 Date)
 * @param supplementaryPerShareValue  §54 보충적평가 1주당 가액 (orchestrator finalPerShareValue, override 전)
 * @param evaluationDate              평가기준일 (V2 최상위 input.evaluationDate 재사용)
 * @returns 적용 결과. applied=true일 때만 orchestrator가 finalPerShareValue 교체.
 */
export function applyPreIpoListing(
  input: PreIpoListingInput,
  supplementaryPerShareValue: number,
  evaluationDate: Date,
): PreIpoListingResult {
  const warnings: string[] = [];
  const windowMonths: 6 | 3 = input.taxKind === "gift" ? 3 : 6; // §57①

  // 기간 판정: [신고일 − Nmo, 상장 전). 신고일 이전 N개월 lookback 포함.
  const windowStart = subMonths(input.securitiesFilingDate, windowMonths);
  const beforeListing = !input.listingDate || evaluationDate < input.listingDate; // 상장 전까지
  const withinWindow = evaluationDate >= windowStart && beforeListing;

  const applied = withinWindow && input.publicOfferingPrice > 0;

  // §57① "큰 가액" — supplementaryPerShareValue는 §54 모든 분기(본칙/순자산단독/단서) 결과 포섭.
  const appliedValue = applied
    ? Math.max(input.publicOfferingPrice, supplementaryPerShareValue)
    : supplementaryPerShareValue; // 미적용 시 현행 §54 유지

  if (!withinWindow) {
    warnings.push(
      `평가기준일이 [유가증권신고일 − ${windowMonths}개월, 거래소 상장 전) 윈도우 밖 — §63②1호 미적용, §54 보충적평가 유지.`,
    );
  } else if (input.publicOfferingPrice <= 0) {
    warnings.push("공모가격이 미입력(0 이하) — §63②1호 미적용, §54 보충적평가 유지.");
  }

  return {
    applied,
    withinWindow,
    publicOfferingPrice: input.publicOfferingPrice,
    supplementaryValue: supplementaryPerShareValue,
    appliedValue,
    windowMonths,
    warnings,
  };
}
