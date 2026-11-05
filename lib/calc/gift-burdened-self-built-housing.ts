/**
 * 증여세 마법사 · 부담부증여 양도세 × 일체 주택 신축 — 「소득세법」 §114조의2 가산세 base 건물분 입력의 **적용 범위·전송·검증** 단일 소스(V-7).
 *
 * 계획서: docs/02-design/features/bg-housing-114-2-building-base.plan.md (Q-3 a 엄격화 · 2026-11-05 사용자 「칸 추가」)
 * 양도세 계산기 `lib/calc/self-built-housing-scope.ts`의 부담부증여 분기와 같은 규칙이다 — ⑤(`BurdenedGiftValuationModeSection`)·④(`gift-burdened-transfer-api.ts`)·
 * ⑧(`gift-tax-form-validate.ts`)이 이 파일 하나를 읽는다. 엔진(`bgHousingBuildingPenaltyBase` · 입력 부재 시 INVALID_INPUT)과 같은 집합이어야 막다른 길이 없다.
 *
 * · 범위: 주택(아파트·주택으로 표시한 건물) · 신축 · 시가 평가의 환산(K-5)·감정가액(K-7) · 가산세 창(신축일부터 5년 · 시행일) 열림.
 * · 증축은 증축 부분 기준(기준시가·감정가액)이 따로 있어 범위 밖이다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { calculateBuildingPenalty } from "@/lib/tax-engine/transfer-tax-building-penalty";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

export interface GiftBgSelfBuiltHousingScope {
  method: "estimated" | "appraisal";
  /** 취득 당시 토지 ㎡당 공시지가·면적·건물 기준시가 — 환산, 또는 감정 + 「구분 표시 없음」 */
  acq: boolean;
  /** 양도 당시 토지 ㎡당 공시지가·건물 기준시가 — 환산만 */
  transfer: boolean;
  /** 건물 감정가액 직접 입력 — 감정 + 감정평가서에 건물 가액이 구분 표시됨 */
  directAppraisal: boolean;
}

const pos = (n: number | undefined): n is number => typeof n === "number" && n > 0;

/**
 * @param propertyType `resolvePropertyType(item.category, bgt.isHousing)` — "housing"만 해당
 * @param method 호출부가 이미 판정한 산정방식(시가 평가 · 담보 승이 아닐 때의 converted/appraisal). 그 밖이면 null을 넘긴다.
 */
export function giftBgSelfBuiltHousingScope(
  bgt: BurdenedGiftTransferTaxInput,
  propertyType: string,
  method: "converted" | "appraisal" | null,
  transferDate: string | undefined,
): GiftBgSelfBuiltHousingScope | null {
  if (propertyType !== "housing" || !method || bgt.isSelfBuilt !== true || (bgt.buildingType ?? "new") !== "new") return null;
  const date = toOptionalDate(transferDate);
  const constructionDate = bgt.constructionDate instanceof Date ? bgt.constructionDate : toOptionalDate(bgt.constructionDate as unknown as string | undefined);
  if (!date || !constructionDate) return null;
  const penaltyMethod = method === "converted" ? "estimated" : "appraisal";
  const gate = calculateBuildingPenalty({ isSelfBuilt: true, acquisitionMethod: penaltyMethod, transferDate: date, constructionDate, buildingType: "new" } as unknown as TransferTaxInput, 1);
  if (gate === null) return null;
  const noSplit = bgt.selfBuiltHousing?.appraisalNoSplit === true;
  return penaltyMethod === "estimated"
    ? { method: penaltyMethod, acq: true, transfer: true, directAppraisal: false }
    : { method: penaltyMethod, acq: noSplit, transfer: false, directAppraisal: !noSplit };
}

/** ④ `selfBuiltHousing` 와이어(엔진 `SelfBuiltHousingInput` 모양) — 범위 밖이면 undefined. 빈 칸은 싣지 않는다(⑧이 먼저 막고, 엔진이 다시 막는다). */
export function buildGiftBgSelfBuiltHousing(bgt: BurdenedGiftTransferTaxInput, scope: GiftBgSelfBuiltHousingScope | null) {
  if (!scope) return undefined;
  const h = bgt.selfBuiltHousing ?? {};
  const wire: Record<string, number> = {};
  if (scope.directAppraisal && pos(h.buildingAppraisalValue)) wire.buildingAppraisalValue = h.buildingAppraisalValue;
  if (scope.acq) {
    if (pos(h.landPricePerSqmAtAcquisition)) wire.landPricePerSqmAtAcquisition = h.landPricePerSqmAtAcquisition;
    if (pos(h.landArea)) wire.landArea = h.landArea;
    if (pos(h.buildingStdPriceAtAcquisition)) wire.buildingStdPriceAtAcquisition = h.buildingStdPriceAtAcquisition;
  }
  if (scope.transfer) {
    if (pos(h.landPricePerSqmAtTransfer) && pos(h.landArea)) wire.landStdPriceAtTransfer = multiplyByArea(h.landPricePerSqmAtTransfer, h.landArea);
    if (pos(h.buildingStdPriceAtTransfer)) wire.buildingStdPriceAtTransfer = h.buildingStdPriceAtTransfer;
  }
  return wire;
}

/** ⑧ — 화면 순서(건물 감정가액 → 취득 당시 → 양도 당시)대로 첫 빈 칸의 메시지. 통과면 null. */
export function giftBgSelfBuiltHousingError(bgt: BurdenedGiftTransferTaxInput, scope: GiftBgSelfBuiltHousingScope | null, label: string): string | null {
  if (!scope) return null;
  const h = bgt.selfBuiltHousing ?? {};
  const head = `${label}: 신축 주택은 건물분만 가산세 대상입니다(소득세법 §114조의2①)`;
  if (scope.directAppraisal) {
    if (!pos(h.buildingAppraisalValue)) return `${head} — 감정평가서에 구분 표시된 건물 감정가액을 입력하세요. 구분 표시가 없으면 「건물 가액이 구분 표시되어 있지 않다」를 켜세요.`;
    if (pos(bgt.presumedAcquisitionTotal) && h.buildingAppraisalValue > bgt.presumedAcquisitionTotal)
      return `${label}: 건물 감정가액(${h.buildingAppraisalValue.toLocaleString()}원)이 감정가액 총액(${bgt.presumedAcquisitionTotal.toLocaleString()}원)보다 클 수 없습니다.`;
  }
  if (scope.acq) {
    if (!pos(h.landPricePerSqmAtAcquisition)) return `${head} — 취득(신축) 당시 토지의 ㎡당 개별공시지가를 입력하세요.`;
    if (!pos(h.landArea)) return `${head} — 토지 면적(㎡)을 입력하세요.`;
    if (!pos(h.buildingStdPriceAtAcquisition)) return `${head} — 취득(신축) 당시 건물 기준시가를 입력하세요 (주택공시가격에서 토지분을 빼 대신 구하지 않습니다).`;
  }
  if (scope.transfer) {
    if (!pos(h.landPricePerSqmAtTransfer)) return `${head} — 양도(증여) 당시 토지의 ㎡당 개별공시지가를 입력하세요.`;
    if (!pos(h.buildingStdPriceAtTransfer)) return `${head} — 양도(증여) 당시 건물 기준시가를 입력하세요.`;
  }
  return null;
}
