/**
 * 「소득세법 시행령」 §167의3⑨ · §167의4⑤ — 계산기 명부의 「양도일 현재도 배우자 쪽이 보유하나요」 질문 노출·응답 요구 (결정 #47).
 *
 * ⑤(질문 노출)·⑧(응답 요구)·④(전송)이 이 파일의 술어를 **함께** 읽는다(3중 패턴). 엔진은 같은 응답을
 * `lib/tax-engine/spouse-holding-at-transfer.ts`(`readSpouseHolding`)로 읽고 확인 필요 고지는 반사실 재계산으로 낸다.
 * 여기 게이트는 엔진 구간의 **보수적 상위집합**이다(주택 수 제외 전 raw 수, 조정대상지역 토글) — 묻는 쪽으로 틀리고 숨기는 쪽으로 틀리지 않는다.
 *
 * ## 질문 대상
 * - 혼인한 배우자 쪽 행(합가 전 보유자 = 「배우자 쪽」) — **필수 응답**(예/아니오/모름). 「모름」은 막지 않는다(차감 없이 계산 + 결론을 가를 때 확인 필요).
 * - 그 밖의 행(양도자 쪽 등) — 선택 응답(예/아니오, 빈칸 = 아니오). 「예」면 차감하되 해석례를 확인하지 못해 확인 필요를 고지한다.
 * - 분양권·입주권 행 — 합가 전 보유자 칸이 없어 필수로 막지 않는다. 예/아니오/모름, 기본(미응답) = 모름(차감 없음).
 *
 * 판정 메뉴는 묻지 않는다(`hideSpouseOwned`) — 중과 축 전용 사실이고, 판정 메뉴에서 넘어온 「배우자 쪽」 행은 응답 없이 도착해 ⑧이 요구한다.
 */
import { isMultiHouseSurchargeSuppressed } from "./transfer-tax-api-helpers";
import { housesOwnedAtTransfer } from "./household-house-count";
import { isOneHouseExemptionAsset } from "./housing-like-asset";
import { mergeContextOf, mergeHouseSideOf, type MergeContext } from "./merge-house-origin";
import { primaryAcquisitionDateOf } from "./transfer-tax-api-carryover";
import { toOptionalDate } from "@/lib/api/date-coerce";
import {
  marriageSubtractionWindowOpen,
  readSpouseHolding,
  type SpouseHoldingAnswer,
} from "@/lib/tax-engine/spouse-holding-at-transfer";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = Pick<
  TransferFormData,
  "marriageDate" | "parentalCareMergeDate" | "transferDate" | "houses" | "presaleRights" | "isRegulatedArea" | "assets"
>;

/** 질문이 열리는가 — 혼인 5년 안 양도 · 혼인 뒤 새 취득 없음 · 주택+권리 3 이상 · 중과가 걸리는 양도(조정대상지역, 한시배제 밖). */
export function spouseHoldingQuestionApplies(form: Form): boolean {
  const primary = form.assets?.[0];
  if (!isOneHouseExemptionAsset(primary?.assetKind)) return false;
  const marriage = toOptionalDate(form.marriageDate);
  const transfer = toOptionalDate(form.transferDate);
  if (!marriage || !transfer) return false;
  if (form.isRegulatedArea !== true) return false;
  const primaryAcquisition = primaryAcquisitionDateOf(primary);
  if (isMultiHouseSurchargeSuppressed(form.transferDate, primaryAcquisition)) return false;
  const houses = form.houses ?? [];
  const rights = form.presaleRights ?? [];
  const dates = [primaryAcquisition, ...houses.map((h) => h.acquisitionDate), ...rights.map((r) => r.acquisitionDate)]
    .map((d) => toOptionalDate(d))
    .filter((d): d is Date => d !== undefined);
  if (!marriageSubtractionWindowOpen({ marriageDate: marriage, transferDate: transfer, acquisitionDates: dates })) return false;
  return 1 + housesOwnedAtTransfer(houses, form.transferDate, primary?.assetKind).length + rights.length >= 3;
}

/** 혼인한 배우자 쪽 행의 `mergeOrigin` — 엔진 `spouseSideOriginOf`와 같은 규약(`MergeContext`는 먼저 합친 쪽이 `kind`). */
function spouseOriginOfContext(ctx: MergeContext) {
  if (ctx.kind === "marriage") return "counterpart_side" as const;
  return ctx.secondMergeDate ? ("second_merge_side" as const) : undefined;
}

export type SpouseHoldingRole = "spouse_side" | "other";

export function spouseHoldingRowRole(
  house: Pick<HouseEntry, "acquisitionDate" | "mergeOrigin">,
  form: Pick<TransferFormData, "marriageDate" | "parentalCareMergeDate">,
): SpouseHoldingRole {
  const ctx = mergeContextOf(form);
  const spouseOrigin = ctx ? spouseOriginOfContext(ctx) : undefined;
  return ctx && spouseOrigin && mergeHouseSideOf(house, ctx) === spouseOrigin ? "spouse_side" : "other";
}

/** ⑤ 표시값 — ④·⑧과 같은 읽기. 배우자 쪽 이외 행은 미응답을 「아니오」로 보여 준다(빈칸 = 아니오). */
export function spouseHoldingDisplayValue(
  row: Pick<HouseEntry, "spouseHeldAtTransfer" | "isSpouseOwned">,
  role: SpouseHoldingRole,
): SpouseHoldingAnswer | undefined {
  return readSpouseHolding(row) ?? (role === "other" ? "no" : undefined);
}

/** ⑧ — 응답이 필요한데 비어 있는 배우자 쪽 행의 인덱스. 질문이 닫혀 있으면 없다. */
export function spouseHoldingUnansweredIndexes(form: Form): number[] {
  if (!spouseHoldingQuestionApplies(form)) return [];
  const out: number[] = [];
  (form.houses ?? []).forEach((h, i) => {
    if (spouseHoldingRowRole(h, form) === "spouse_side" && readSpouseHolding(h) === undefined) out.push(i);
  });
  return out;
}
