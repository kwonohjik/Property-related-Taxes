/**
 * §155④⑤ 합가 관련 「확인 필요」 고지 — `transfer-tax.ts`(STEP 1 뒤)가 부르는 한 입구.
 *
 * 두 갈래를 한 곳에 모아 두 파일 줄 수를 늘리지 않는다:
 *   1) 합가 전 구성을 몰라 단일 합가가 불성립한 경우 — 기존 문구(`resolveMergeCompositionConfirmNotice`).
 *   2) 목록 입력 칸이 없는 화면(증여세 마법사)의 **3주택 합가** — 일시적 2주택 중첩·혼인과 동거봉양 이중 합가를
 *      판정하지 않고 계산했다는 고지 (결정 #25 C · #26 B · 1h-G1-4·G1-9).
 */
import { isWithinDeadline } from "../civil-period";
import { resolveMergeExemptionYears } from "../data/merge-exemption-era";
import { MULTI_HOUSE } from "../legal-codes";
import type { TransferTaxInput } from "../types/transfer.types";
import {
  doubleMergeOrderOf,
  resolveMergeCompositionConfirmNotice,
  type MergeDeemingReqInput,
} from "./merge-deeming";

/**
 * 증여세 마법사 3주택 합가 고지 문구 — 비과세뿐 아니라 다주택 중과 배제도 판정하지 않았음을 함께 적는다.
 * 「소득세법 시행령」 §167의3①13호(3주택 이상 중과 배제 — 제155조에 따라 1세대 1주택으로 보는 주택).
 */
export const NO_ROSTER_THREE_HOUSE_MERGE_NOTICE =
  "§155 합가 특례(3주택) — 확인 필요: 증여세 계산 화면에는 세대 보유 주택 목록 입력 칸이 없어, 3주택이 된 합가 특례" +
  "(일시적 2주택과 합가의 중첩 · 혼인과 동거봉양의 이중 합가)를 판정하지 않고 계산했습니다. " +
  `비과세뿐 아니라 다주택 중과 배제(${MULTI_HOUSE.HOUSE_COUNT_RULE}①13호)도 판정하지 않았습니다. ` +
  "양도소득세 계산기(부담부증여)에서 세대 보유 주택 목록을 입력하면 판정합니다.";

/**
 * 3주택 합가 특례의 **합가 요건**(먼저 양도 · 합가 후 양도 · 양도 주택을 합가일 이전에 취득 · 기한 내)이 모두 서는가.
 * 합가 전 보유 구성·§155① 처분기한은 이 화면에서 알 수 없어 보지 않는다 — 알 수 있는 요건이 다 서야 「구성만 알면
 * 결론이 달라진다」가 성립한다(결론을 가를 때만 고지).
 */
export function threeHouseMergeRequirementsHold(input: MergeDeemingReqInput): boolean {
  if (input.householdHousingCount !== 3 || (input.inheritedHouseExclusionCount ?? 0) > 0) return false;
  if (input.isFirstTransferredInMerge !== true) return false;
  const marriageDate = input.marriageMerge?.marriageDate;
  const parentalDate = input.parentalCareMerge?.mergeDate;
  if (!marriageDate && !parentalDate) return false;
  const order = doubleMergeOrderOf(input);
  // 이중 합가는 먼저 합친 날이 기한의 기산점·양도 주택 취득 상한이고 양도는 나중에 합친 날 이후다(`matchDoubleMergeApartFromWindow`).
  const kind = order ? order.first : marriageDate ? "marriage" : "parental_care";
  const firstDate = order ? order.firstDate : (marriageDate ?? parentalDate)!;
  const lastDate = order ? order.secondDate : firstDate;
  if (input.transferDate < lastDate || input.acquisitionDate > firstDate) return false;
  return isWithinDeadline(firstDate, resolveMergeExemptionYears(kind, input.transferDate), input.transferDate);
}

/**
 * 합가 「확인 필요」 고지 모음 — 호출부는 이미 「비과세·부분 비과세가 아님」을 확인한 뒤 부른다.
 *
 * @param meetsHoldingResidence §154① 보유·거주 요건 충족 여부 — 합가 외 요건이 막으면 구성을 알아도 과세라 고지하지 않는다.
 */
export function mergeConfirmWarnings(
  input: MergeDeemingReqInput & Pick<TransferTaxInput, "isOneHousehold">,
  meetsHoldingResidence: boolean,
): string[] {
  if (!meetsHoldingResidence) return [];
  const out: string[] = [];
  const single = resolveMergeCompositionConfirmNotice(input);
  if (single) out.push(`§155④⑤ 합가 특례 — 확인 필요: ${single}`);
  // 1세대가 아니면 구성과 무관하게 과세다 — 고지하지 않는다(결정 #26 조건).
  if (input.noMergeRosterInputPath === true && input.isOneHousehold && threeHouseMergeRequirementsHold(input)) {
    out.push(NO_ROSTER_THREE_HOUSE_MERGE_NOTICE);
  }
  return out;
}
