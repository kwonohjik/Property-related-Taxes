/**
 * §89①4호 입주권 양도 — **혼인합가(시행령 §155⑤) 후 양도하면 배우자 쪽 주택을 「다른 주택」에서 뺀다** (M9 · 평가셋 G055)
 *
 * 서면-2015-부동산-1200(2015.08.27.): 혼인으로 2주택(A 배우자 쪽 · B 양도자 쪽)이 된 뒤 B가 재건축으로
 * 조합원입주권이 되고 새 주택 C를 취득한 상태에서, 혼인한 날부터 5년 이내·C 취득일부터 3년 이내에 입주권을
 * 양도하면 비과세. 같은 결론: 재산세제과-1410(2009.09.10. — C 없이 1주택+1입주권), 조심-2010-서-1322
 * (혼인 당시 이미 입주권). 부적용 회신(서면4팀-1387 2007 · 재산세과-4439 2008)도 있으나 적용 쪽을 따른다
 * (사용자 결정 2026-10-08). 동거봉양 합가(§155④)는 이 결정의 범위가 아니다 — 조심-2021-서-1117(2022)이
 * 입주권에 §155②④를 유추 적용할 수 없다고 봤다.
 *
 * 규칙: 아래가 모두 성립하면 혼인 전 배우자 쪽 주택 1채를 §89①4호 가·나목의 「다른 주택」에서 뺀다.
 *   ① 혼인일만 있다(동거봉양 합가일이 함께 있으면 적용하지 않는다)
 *   ② 「먼저 양도」 선언 · 혼인 후 양도 · 양도자가 혼인 전(또는 당일)부터 보유(입주권 취득일 = 종전주택 취득일)
 *   ③ 혼인한 날부터 N년 이내 양도 — N은 주택 경로와 같은 leaf(`resolveMergeExemptionYears`)
 *   ④ 혼인 전 구성: 배우자 쪽 정확히 1채 · 양도자 쪽 다른 주택 없음. 혼인 후 취득 주택(C)은 그대로 센다
 *   ⑤ 혼인 전 취득 행의 보유 쪽을 모르면 불성립 + 확인 필요(「모름=불리」)
 *
 * ## P4 양론 C6 — 동거봉양 합가는 반대 입장 재판정에서만
 *
 * `contestedRightSaleParentalCareMergeApply`가 켜지면(판정 메뉴 route의 양론 재판정 전용) 동거봉양 합가일에도
 * 같은 규칙을 적용한다 — 국심-2006-서-3136(2006.12.04. — 비과세 요건을 갖춘 종전주택의 입주권을 동거봉양
 * 합가일부터 기한 이내 양도하면 §155④ 적용). 기한은 주택 경로와 같은 leaf의 동거봉양 축이다.
 * 합가 상대(직계존속)에게서 **합가 후 상속받은** 주택(`parentalCareMergeInheritedHouse` — 합가 전부터 피상속인이
 * 보유)은 합가 당시 상대 쪽 주택이므로 상대 쪽 1채로 센다(조심-2021-서-1117 사안 — 그 결정은 반대 입장).
 */
import { isWithinDeadline } from "../civil-period";
import { resolveMergeExemptionYears } from "../data/merge-exemption-era";
import { classifyMergeHouse } from "./merge-composition";
import type { TransferTaxInput } from "../types/transfer.types";

export type RightSaleMarriageMerge =
  | { status: "applies"; kind: "marriage" | "parental_care"; excludedHouseIds: string[]; years: number }
  | { status: "fails"; confirmNotice?: string };

type Input = Pick<
  TransferTaxInput,
  | "marriageMerge"
  | "parentalCareMerge"
  | "isFirstTransferredInMerge"
  | "acquisitionDate"
  | "transferDate"
  | "houses"
  | "sellingHouseId"
  | "contestedRightSaleParentalCareMergeApply"
>;

/** 판정할 합가 — 혼인만 있으면 혼인, 양론 재판정이면 동거봉양만 있을 때 동거봉양. 둘 다 있으면 판정하지 않는다. */
function mergeToJudge(input: Input): { kind: "marriage" | "parental_care"; date: Date } | null {
  const marriageDate = input.marriageMerge?.marriageDate;
  const parentalCareDate = input.parentalCareMerge?.mergeDate;
  if (marriageDate && !parentalCareDate) return { kind: "marriage", date: marriageDate };
  if (parentalCareDate && !marriageDate && input.contestedRightSaleParentalCareMergeApply === true) {
    return { kind: "parental_care", date: parentalCareDate };
  }
  return null;
}

/** 판정할 합가가 없으면 `null` — 판정할 것이 없다. */
export function resolveRightSaleMarriageMerge(input: Input): RightSaleMarriageMerge | null {
  const merge = mergeToJudge(input);
  if (!merge) return null;
  const { kind, date: mergeDate } = merge;
  const years = resolveMergeExemptionYears(kind, input.transferDate);
  if (
    input.isFirstTransferredInMerge !== true ||
    input.transferDate < mergeDate ||
    input.acquisitionDate > mergeDate ||
    !isWithinDeadline(mergeDate, years, input.transferDate)
  ) {
    return { status: "fails" };
  }
  const counterpart: string[] = [];
  for (const h of input.houses ?? []) {
    if (h.id === input.sellingHouseId) continue;
    const side =
      kind === "parental_care" && h.parentalCareMergeInheritedHouse === true
        ? "counterpart_side"
        : classifyMergeHouse(h.acquisitionDate, mergeDate, h.mergeOrigin);
    if (side === "after_merge") continue;
    if (side === undefined) {
      return {
        status: "fails",
        confirmNotice:
          kind === "marriage"
            ? "혼인 전 보유자(양도자 쪽 / 배우자 쪽)를 고르면 혼인합가 특례를 판정합니다."
            : "합가 전 보유자(양도자 쪽 / 직계존속 쪽)를 고르면 동거봉양 합가 특례를 판정합니다.",
      };
    }
    if (side !== "counterpart_side") return { status: "fails" };
    counterpart.push(h.id);
  }
  if (counterpart.length !== 1) return { status: "fails" };
  return { status: "applies", kind, excludedHouseIds: counterpart, years };
}

/** §89①4호 가·나목이 보는 「다른 주택」 수 — 혼인합가가 성립하면 배우자 쪽 1채를 뺀다. */
export function oneRightOtherHouseCount(input: Input & Pick<TransferTaxInput, "householdHousingCount">): number {
  const merge = resolveRightSaleMarriageMerge(input);
  const excluded = merge?.status === "applies" ? merge.excludedHouseIds.length : 0;
  return Math.max(0, input.householdHousingCount - excluded);
}
