/**
 * 양도일과 **같은 날** 취득한 분양권·조합원입주권 — 「양도일 현재 보유」에서 뺀 것의 확인 필요 고지 (코드 리뷰 결정 #1).
 *
 * ## 무엇을 하고 무엇을 하지 않나
 *
 * 양도일 당일·이후에 취득한 권리는 판정(§89②·§89①4호 가·나목·§104⑦ 주택 수)에서 뺀다 — 주택 명부의 D2
 * (`isOwnedAtTransfer`, 같은 날 취득 = 양도 후 취득)와 같은 술어다. 그 일은 ⑭ 매퍼(`splitPresaleRightsAtTransfer`)가 하고,
 * 이 파일은 **같은 날 권리를 보유로 세면 결론이 달라질 때만** 확인 필요를 알린다.
 *
 * ## 근거와 한계
 *
 * 같은 날 주택을 양도하고 취득하면 「양도한 후 취득한 것」으로 본다 — 재정경제부 재산세제과-836(2004.7.7.)은 중과 주택 수
 * (소득세법 §104①2의3호·시행령 §162의2⑤)에서, 서면인터넷방문상담4팀-1697(2004.10.22.)은 시행령 §155①에서 그렇게 회신했다.
 * 다만 **권리(분양권·조합원입주권)에 직접 적용한 해석은 확인하지 못했다** — 그래서 결론은 이 순서 규칙대로 두되 알린다.
 * 같은 날 취득분이 아닌 양도일 다음 날 이후 취득분은 소득세법 §89①4호 가목 문언(「양도일 현재 … 보유」)만으로 보유가 아니다.
 *
 * 🔑 판정 비교는 **결론**(비과세·부분과세 여부, 계산기는 총세액)으로 한다 — 같은 날 권리가 어느 규칙에 걸리는지 흩어진 곳마다
 *    반사실을 짜지 않고, 같은 날 권리를 보유 권리에 합쳐 같은 파이프라인을 한 번 더 돌려 결론만 대조한다.
 */
import type { TransferTaxInput, TransferTaxResult } from "../types/transfer.types";
import type { AggregateTransferResult, TransferTaxItemInput } from "../types/transfer-aggregate.types";
import type { MixedUseGainBreakdown } from "../types/transfer-mixed-use.types";
import type { OneHouseJudgment, OneHouseUndetermined } from "./types";

export const SAME_DAY_RIGHT_UNVERIFIED_ID = "same-day-right-unverified";

export const SAME_DAY_RIGHT_NOTICE =
  "양도일과 같은 날 취득한 분양권·조합원입주권은 양도 후 취득으로 보아 세대 보유 권리에서 뺐습니다. " +
  "같은 날 주택을 취득하고 양도하면 양도한 후 취득한 것으로 본 해석(재정경제부 재산세제과-836(2004.7.7.)·" +
  "서면인터넷방문상담4팀-1697(2004.10.22.) 등)을 권리에 적용한 것이며, 권리에 직접 적용한 해석은 확인하지 못했으니 " +
  "확인이 필요합니다.";

type SameDayRightFields = Pick<
  TransferTaxInput,
  "presaleRights" | "householdRightCount" | "sameDayAcquiredPresaleRights"
>;

/** 같은 날 취득 권리를 보유 권리에 합친 반사실 입력 — 같은 날 권리가 없으면 입력 그대로(같은 참조). */
export function withSameDayRightsHeld<T extends SameDayRightFields>(input: T): T {
  const sameDay = input.sameDayAcquiredPresaleRights ?? [];
  if (sameDay.length === 0) return input;
  return {
    ...input,
    presaleRights: [...(input.presaleRights ?? []), ...sameDay],
    householdRightCount:
      (input.householdRightCount ?? 0) + sameDay.filter((r) => r.type === "redevelopment_right").length,
    sameDayAcquiredPresaleRights: undefined,
  };
}

/** 판정 메뉴 — 같은 날 권리를 보유로 세면 비과세·부분과세 결론이 달라지는가. */
export function sameDayRightChangesJudgment(
  base: Pick<OneHouseJudgment, "isExempt" | "isPartialExempt">,
  alt: Pick<OneHouseJudgment, "isExempt" | "isPartialExempt">,
): boolean {
  return base.isExempt !== alt.isExempt || base.isPartialExempt !== alt.isPartialExempt;
}

export function sameDayRightUndetermined(): OneHouseUndetermined {
  return { id: SAME_DAY_RIGHT_UNVERIFIED_ID, reason: SAME_DAY_RIGHT_NOTICE };
}

/**
 * 판정 메뉴 — 같은 날 권리를 보유로 세면 결론이 달라질 때만 판정 보류(확인 필요)를 덧붙인다.
 * @param rerun 같은 날 권리를 보유로 합친 입력으로 **같은 파이프라인**을 다시 돌린 판정을 돌려주는 함수
 */
export function withSameDayRightNotice(
  input: TransferTaxInput,
  judgment: OneHouseJudgment,
  rerun: (counterfactual: TransferTaxInput) => OneHouseJudgment,
): OneHouseJudgment {
  if ((input.sameDayAcquiredPresaleRights?.length ?? 0) === 0) return judgment;
  if (!sameDayRightChangesJudgment(judgment, rerun(withSameDayRightsHeld(input)))) return judgment;
  return { ...judgment, undetermined: [...judgment.undetermined, sameDayRightUndetermined()] };
}

/** 계산기 결론 비교 — 비과세·부분과세 여부 또는 총세액(§104⑦ 주택 수 산입 포함)이 다른가. */
function resultsDiffer(a: TransferTaxResult, b: TransferTaxResult): boolean {
  return a.isExempt !== b.isExempt || a.isPartialExempt !== b.isPartialExempt || a.totalTax !== b.totalTax;
}

/**
 * 계산기 — 같은 날 권리를 보유로 세면 비과세 여부 또는 총세액이 달라질 때만 경고를 싣는다(§104⑦ 주택 수 산입 포함).
 * @param recalc 같은 날 권리를 보유로 합친 입력으로 계산기 엔진을 다시 돌린 결과를 돌려주는 함수
 */
export function withSameDayRightWarning(
  input: TransferTaxInput,
  result: TransferTaxResult,
  recalc: (counterfactual: TransferTaxInput) => TransferTaxResult,
): TransferTaxResult {
  if ((input.sameDayAcquiredPresaleRights?.length ?? 0) === 0) return result;
  if (!resultsDiffer(result, recalc(withSameDayRightsHeld(input)))) return result;
  return { ...result, warnings: [...(result.warnings ?? []), SAME_DAY_RIGHT_NOTICE] };
}

/**
 * 다건 계산기 — 자산별로 같은 날 권리를 보유로 세면 그 자산의 결론이 달라지는 자산이 하나라도 있는가.
 * 다건 결과에는 자산별 경고 칸이 없어 호출부가 결과 최상위 `warnings`에 한 번 싣는다.
 * @param calc 자산 하나를 단독으로 계산하는 함수(양도일 세율 적용)
 */
export function anySameDayRightChangesConclusion(
  properties: readonly TransferTaxInput[],
  calc: (input: TransferTaxInput) => TransferTaxResult,
): boolean {
  return properties.some(
    (p) => (p.sameDayAcquiredPresaleRights?.length ?? 0) > 0 && resultsDiffer(calc(p), calc(withSameDayRightsHeld(p))),
  );
}

/**
 * 겸용주택 계산기 — 같은 날 권리를 보유로 세면 주택분 비과세 여부 또는 총 납부세액이 달라질 때만 경고를 싣는다.
 * 겸용 결과는 자기 `warnings`를 갖는다. 같은 날 권리가 없으면 결과를 그대로 돌려준다.
 * @param recalc 같은 날 권리를 보유로 합친 입력으로 겸용 엔진을 다시 돌린 결과를 돌려주는 함수
 */
export function mixedUseWithSameDayRightWarning(
  input: TransferTaxInput,
  result: MixedUseGainBreakdown,
  recalc: (counterfactual: TransferTaxInput) => MixedUseGainBreakdown,
): MixedUseGainBreakdown {
  if ((input.sameDayAcquiredPresaleRights?.length ?? 0) === 0) return result;
  const alt = recalc(withSameDayRightsHeld(input));
  const differ =
    result.housingPart.isExempt !== alt.housingPart.isExempt || result.total.totalPayable !== alt.total.totalPayable;
  return differ ? { ...result, warnings: [...result.warnings, SAME_DAY_RIGHT_NOTICE] } : result;
}

/**
 * 일괄양도(함께 양도) 자산 목록 — 같은 날 권리를 세대 보유 권리에 합친 반사실 목록.
 * 주 자산(같은 날 권리 목록을 가진 item)은 보유 권리·입주권 수를 함께 옮기고, 세대 단위로 `presaleRights`를 상속받은
 * 컴패니언·겸용 파트 item(주 자산 입력과 같은 참조)은 보유 권리 목록만 바꾼다. 다른 item은 그대로다.
 */
export function withSameDayRightsHeldOnItems(
  input: TransferTaxInput,
  items: readonly TransferTaxItemInput[],
): TransferTaxItemInput[] {
  const held = withSameDayRightsHeld(input);
  return items.map((item) => {
    if ((item.sameDayAcquiredPresaleRights?.length ?? 0) > 0) return withSameDayRightsHeld(item);
    if (item.presaleRights === input.presaleRights) return { ...item, presaleRights: held.presaleRights };
    return item;
  });
}

/**
 * 일괄양도 계산기 — 자산 중 하나라도 같은 날 권리를 보유로 세면 비과세 여부가 달라지거나 총세액이 달라질 때만 경고를 싣는다.
 * 일괄양도 결과는 신고서 단위 `warnings`를 갖는다.
 * @param items 계산에 넣은 자산 목록
 * @param recalc 같은 날 권리를 보유로 합친 자산 목록으로 집계 엔진을 다시 돌린 결과를 돌려주는 함수
 */
export function aggregateWithSameDayRightWarning(
  input: TransferTaxInput,
  result: AggregateTransferResult,
  items: readonly TransferTaxItemInput[],
  recalc: (heldItems: TransferTaxItemInput[]) => AggregateTransferResult,
): AggregateTransferResult {
  if ((input.sameDayAcquiredPresaleRights?.length ?? 0) === 0) return result;
  const alt = recalc(withSameDayRightsHeldOnItems(input, items));
  const differ =
    result.totalTax !== alt.totalTax ||
    result.properties.some((p, i) => p.isExempt !== alt.properties[i]?.isExempt);
  return differ ? { ...result, warnings: [...result.warnings, SAME_DAY_RIGHT_NOTICE] } : result;
}
