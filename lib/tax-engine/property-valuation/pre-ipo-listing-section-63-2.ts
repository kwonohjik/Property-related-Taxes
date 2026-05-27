/**
 * §63② 기업공개·상장신청 준비 중 법인 평가 — 비상장주식 1주당 최종평가액 override 옵션 (PR-L / PR-L2)
 *
 * 법령 (KoreanLaw MCP 검증 2026-05-27, 상증법 mst=276123 / 상증령 mst=283637):
 *   법 §63②: 제1항제1호에도 불구하고 각 호 주식은 대통령령 방법으로 평가.
 *     1호 = 기업공개 목적 유가증권 신고(미신고 시 거래소 상장신청) 법인의 주식. (PR-L, exchange_listing)
 *     2호 = §63①1호나목 주식 중 증권시장 거래 위해 거래소에 상장신청을 한 법인의 주식. (PR-L2, association_registration)
 *   영 §57①: 1호 기간 = 유가증권신고(미신고 시 상장신청) 직전 6개월(증여 3개월)부터 거래소 최초 상장 전까지.
 *            평가 = MAX(1호 공모가격, §63①1호가목 / 없으면 나목 §54 보충적평가).
 *   영 §57②: 2호 기간 = 유가증권신고(미신고 시 등록신청) 직전 6개월(증여 3개월)부터 한국금융투자협회 등록 전까지.
 *            평가 = MAX(§57①1호 공모가격, §63①1호나목 §54 보충적평가). → 비상장은 §57①과 동일 산식.
 *   법 §63③: "§1①1호 및 §2에 따라 평가한 가액"에 최대주주 할증 → §63② 결과에도 §63③ 할증.
 *     ∴ 평가 순서 = §54 보충적평가 → §63② MAX override → §63③ 할증.
 *
 * ★ PR-L2 D-1 drift: 법 §63②2호 "거래소 상장신청" ↔ 령 §57② "협회 등록" terminal 시장 불일치(원인 판정 불가).
 *   → appliedRules·warnings·UI에 양쪽 병기, 단정 금지. 윈도우·MAX·할증 로직은 1호·2호 동일(문자열만 분기).
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
  /** 윈도우 anchor — 유가증권 신고일(미신고 시 §63②1호 거래소 상장신청일 / §63②2호 등록신청일, §57①②) */
  securitiesFilingDate: Date;
  /** 6개월(상속) vs 3개월(증여) — §57①②. 폼이 상속/증여 명시 주입(자동 추론 금지). */
  taxKind: "inheritance" | "gift";
  /** terminal 시점 — §63②1호 거래소 최초 상장일 / §63②2호 협회 등록일 (미입력 = terminal 전으로 간주) */
  listingDate?: Date;
  /**
   * PR-L2 (§63②): 준비 유형 판별자. 미입력 → "exchange_listing"(§63②1호, PR-L 하위호환).
   *   exchange_listing        = §63②1호 거래소 상장(IPO) — 령 §57① (terminal: 거래소 상장 전)
   *   association_registration = §63②2호 거래소 상장신청·협회 등록(K-OTC) — 령 §57② (terminal: 협회 등록 전)
   * ★ 윈도우·MAX·할증 로직 동일 — 본 판별자는 warnings·appliedRules·라벨 문자열만 분기(numeric 0).
   * ★ D-1: 법 §63②2호 "거래소 상장신청" ↔ 령 §57② "협회 등록" 불일치 → 양쪽 병기, 단정 금지.
   */
  preparationType?: "exchange_listing" | "association_registration";
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
  /** 준비 유형 echo (ptype 해소값 — undefined 입력 시 "exchange_listing") */
  preparationType: "exchange_listing" | "association_registration";
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
  // PR-L2: 준비 유형 해소 (undefined → exchange_listing, PR-L 하위호환). 윈도우·MAX 로직과 무관.
  const ptype = input.preparationType ?? "exchange_listing";
  const isAssoc = ptype === "association_registration";
  const clauseLabel = isAssoc ? "§63②2호" : "§63②1호"; // 령 §57②/§57①
  const terminalLabel = isAssoc ? "협회 등록 전" : "거래소 상장 전";

  const windowMonths: 6 | 3 = input.taxKind === "gift" ? 3 : 6; // §57①②

  // 기간 판정: [신고일 − Nmo, terminal 전). 신고일 이전 N개월 lookback 포함.
  const windowStart = subMonths(input.securitiesFilingDate, windowMonths);
  const beforeTerminal = !input.listingDate || evaluationDate < input.listingDate; // terminal(상장/등록) 전까지
  const withinWindow = evaluationDate >= windowStart && beforeTerminal;

  const applied = withinWindow && input.publicOfferingPrice > 0;

  // §57①② "큰 가액" — supplementaryPerShareValue는 §54 모든 분기(본칙/순자산단독/단서) 결과 포섭.
  const appliedValue = applied
    ? Math.max(input.publicOfferingPrice, supplementaryPerShareValue)
    : supplementaryPerShareValue; // 미적용 시 현행 §54 유지

  if (!withinWindow) {
    warnings.push(
      `평가기준일이 [유가증권신고일 − ${windowMonths}개월, ${terminalLabel}) 윈도우 밖 — ${clauseLabel} 미적용, §54 보충적평가 유지.`,
    );
  } else if (input.publicOfferingPrice <= 0) {
    warnings.push(`공모가격이 미입력(0 이하) — ${clauseLabel} 미적용, §54 보충적평가 유지.`);
  }

  return {
    applied,
    withinWindow,
    publicOfferingPrice: input.publicOfferingPrice,
    supplementaryValue: supplementaryPerShareValue,
    appliedValue,
    windowMonths,
    preparationType: ptype,
    warnings,
  };
}
