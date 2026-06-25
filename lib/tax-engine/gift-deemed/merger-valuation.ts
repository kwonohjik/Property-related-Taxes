/** 합병 §38 — 합병후 1주당 평가가액 산정(§28⑤) + 대주주 판정(§28② echo) + 분할합병(§28⑦). */
import { safeMultiplyThenDivide } from "../tax-utils";
import { computeMergerSimpleAvg, isSmallShareholder } from "./capital-helpers";
import type { MergerInput } from "./types";

/**
 * §28⑦ 분할합병 — 분할사업부문 합병직전 1주당 평가가액(과대평가측 베이스).
 * - net_asset_ratio(2016.2.4 이전, 상증칙 §10의2): 분할법인 분할직전 1주평가 × (분할사업부문 순자산 ÷ 분할법인 순자산)
 * - supplementary(2016.2.5~): §63①1나 보충평가액 = overvaluedSharePrice 직접
 * 분할합병이 아니면 overvaluedSharePrice 그대로.
 */
export function resolveSplitOvervalued(input: MergerInput): number {
  if (input.isSplitMerger && input.splitValuationMode === "net_asset_ratio") {
    return safeMultiplyThenDivide(
      input.splitCompanyPreSharePrice ?? 0,
      input.splitBusinessNetAsset ?? 0,
      input.splitCompanyNetAsset ?? 0,
    );
  }
  return input.overvaluedSharePrice;
}

/**
 * ㉮ 합병후 1주당 평가가액 (§28⑤).
 * - direct(기본): 사용자 입력 mergedSharePrice (회귀 보존)
 * - auto: 단순평균액 = (과대평가 1주평가×주식수 + 과소평가 1주평가×주식수) ÷ 합병후 주식수
 *   상장(isListed) + 종가평균(listedPostAvgPrice) 입력 시 Min(종가평균, 단순평균액).
 * 반환: { mergedSharePrice, computedSimpleAvg? } — computedSimpleAvg는 auto echo용.
 */
export function resolveMergedPrice(input: MergerInput): { mergedSharePrice: number; computedSimpleAvg?: number } {
  if ((input.caseType ?? "stock") === "non_stock" || (input.mergedPriceMode ?? "direct") !== "auto") {
    return { mergedSharePrice: input.mergedSharePrice ?? 0 };
  }
  const simpleAvg = computeMergerSimpleAvg(
    input.overvaluedSharePrice,
    input.preMergerShares ?? 0,
    input.underSharePrice ?? 0,
    input.underPreShares ?? 0,
    input.postMergerTotalShares ?? 0,
  );
  const mergedSharePrice =
    input.isListed && (input.listedPostAvgPrice ?? 0) > 0 ? Math.min(input.listedPostAvgPrice!, simpleAvg) : simpleAvg;
  return { mergedSharePrice, computedSimpleAvg: simpleAvg };
}

/**
 * §28② 대주주 판정 echo — 지분 1% 이상 OR 액면가액 3억 이상.
 * (= !소액주주, De Morgan). 입력 없으면 undefined(판정 불가 — 차단 아님).
 */
export function resolveMajorShareholderEcho(input: MergerInput): boolean | undefined {
  if (input.shareholderTotalShares === undefined && input.faceValueSum === undefined) return undefined;
  return !isSmallShareholder({
    ownedShares: input.shareholderOwnedShares ?? 0,
    totalShares: input.shareholderTotalShares ?? 0,
    faceValueSum: input.faceValueSum ?? 0,
  });
}
