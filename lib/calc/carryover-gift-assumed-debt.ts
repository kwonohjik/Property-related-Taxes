/**
 * 영 §163의2②2호 분자 「해당 자산가액(증여세가 과세된 증여세 과세가액)」 — 당초 증여 때 인수한 채무(④·⑧ 공용 leaf).
 *
 * 「상속세 및 증여세법」 제47조 제1항의 과세가액은 증여재산가액에서 수증자가 인수한 채무를 뺀 금액이다. 그래서 당초 증여 때 그 자산에 담보된
 * 채무를 인수한 것이 인정됐다면 분자는 평가액 − 인수채무다. 계획서 `docs/00-pm/carryover-gift-tax-numerator-net.plan.md` §2 · Q-2 a · Q-3 a.
 *
 * 토글(`giftDebtAssumed`)은 **증여 사건** 서브폼의 값이고, 금액(`giftAssumedDebt`)은 **그 파트** 서브폼의 값이다(파트마다 받는다 — 자동 안분 금지).
 * 토글이 꺼져 있으면(옛 이력 포함) 0 — 종전 세액 그대로다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { anyPartCarryover } from "@/lib/calc/transfer-land-part-cause";
import { effectiveSelfOwns, isLandBuildingSplitable } from "@/lib/calc/self-owns-scope";
import { carryoverPhdMode } from "@/lib/calc/phd-toggle-scope";
import { hasPre1990LandEstimation } from "@/lib/calc/transfer-pre1990-land-gate";
import { depreciationSupport } from "@/lib/calc/depreciation-scope";
import { buildSameAdjustmentPeriodInput } from "@/lib/calc/transfer-same-adjustment-period-input";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";
import { isParcelMode } from "@/lib/stores/transfer-per-asset-direct";
import { DEBT_PIECES_REASON } from "@/lib/tax-engine/carryover-debt-pieces-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

export function carryoverAssumedDebt(
  event: Pick<CarryoverTaxationForm, "giftDebtAssumed"> | undefined,
  part: Pick<CarryoverTaxationForm, "giftAssumedDebt"> | undefined,
): number {
  return event?.giftDebtAssumed ? parseAmount(part?.giftAssumedDebt ?? "") : 0;
}

/** 분자 = 평가액 − 인수채무(음수면 0 — ⑧이 채무 > 평가액을 먼저 막는다). */
export function carryoverGiftTaxedValue(valuation: number, debt: number): number {
  return Math.max(0, valuation - debt);
}

// ─── 이월과세 × 당초 증여 채무 부분(매입분) — 범위 술어 (⑤ 노출 · ④ 전송 · ⑧ 필수·차단이 읽는 **하나**) ───

/**
 * - `none`: 이월과세 취득이 아니다(해당 없음).
 * - `apply`: 시나리오 A에서 증여분·매입분으로 나눈다(E1).
 * - `numerator_only`: 일반건물·파트 이월과세 — 자기 위치의 토글을 쓰고 증여세 상당액 안분의 분자에서만 뺀다(V-7). 새 와이어 키는 가지 않는다.
 * - `unsupported`: 조각 규칙을 적용할 수 없는 입력 — `reason`은 ⑤ 안내·⑧ 메시지가 같이 쓴다(와이어 술어 `carryoverDebtPiecesUnsupportedReason`과 같은 문자열 상수).
 */
export type PurchasedPartScope =
  | { kind: "none" }
  | { kind: "apply" }
  | { kind: "numerator_only" }
  | { kind: "unsupported"; reason: string };

const APPLY_KINDS = new Set<AssetForm["assetKind"]>(["housing", "land", "building", "commercial_building"]);

/**
 * 폼 기준 판정 — 와이어 쪽 술어(`lib/tax-engine/carryover-debt-pieces-scope.ts`)와 같은 사유 상수를 쓴다.
 * 두 술어는 입력 모양이 달라(AssetForm ↔ 와이어 키) 별개 함수이므로 ⑧↔⑫ 격자 anchor로 정합을 잠근다.
 * `opts.isNonPrimary`: 함께 양도 둘째 이후 자산 — 파트 이월과세(C) 잔재를 꺼진 것으로 읽는다(`anyPartCarryover` 옵션).
 */
export function carryoverPurchasedPartScope(asset: AssetForm, opts?: { isNonPrimary?: boolean }): PurchasedPartScope {
  if (asset.acquisitionCause !== "carryover_gift") return { kind: "none" };
  if (asset.assetKind === "general_building") return { kind: "numerator_only" };
  if (anyPartCarryover(asset, opts)) return { kind: "numerator_only" };
  const no = (reason: string): PurchasedPartScope => ({ kind: "unsupported", reason });
  if (asset.transferType === "burdened_gift") return no(DEBT_PIECES_REASON.burdenedGift);
  if (!APPLY_KINDS.has(asset.assetKind) || asset.isMixedUseHouse) return no(DEBT_PIECES_REASON.propertyType);
  if ((effectiveSelfOwns(asset) ?? "both") !== "both" || (isLandBuildingSplitable(asset.assetKind) && asset.hasSeperateLandAcquisitionDate))
    return no(DEBT_PIECES_REASON.ownerSplit);
  if (carryoverPhdMode(asset) || hasPre1990LandEstimation(asset) || isParcelMode(asset)) return no(DEBT_PIECES_REASON.donorEstimation);
  if (asset.carryover?.donorBuilt) return no(DEBT_PIECES_REASON.donorBuilt);
  if ((asset.reductions?.length ?? 0) > 0) return no(DEBT_PIECES_REASON.reductions);
  if (isUsageConversionActive(asset) || buildSameAdjustmentPeriodInput(asset) !== undefined || (asset.manualHoldingPeriodOverride ?? undefined) !== undefined)
    return no(DEBT_PIECES_REASON.acquisitionFacts);
  if (asset.assetKind === "land" && asset.nblUseDetailedJudgment) return no(DEBT_PIECES_REASON.nblDetails);
  if (asset.assetKind === "land" && asset.landNature === "appurtenant") return no(DEBT_PIECES_REASON.appurtenant);
  if (depreciationSupport(asset).status === "ok" && parseAmount(asset.depreciationAmount ?? "") > 0) return no(DEBT_PIECES_REASON.depreciation);
  return { kind: "apply" };
}

/** ④가 보내는 값 — scope = apply ∧ 토글 ON ∧ 채무 > 0일 때만 > 0. 그 밖(OFF·공백·0·numerator_only·unsupported)은 0 = 조각 없음. */
export function carryoverPurchasedPartDebt(asset: AssetForm, opts?: { isNonPrimary?: boolean }): number {
  if (carryoverPurchasedPartScope(asset, opts).kind !== "apply") return 0;
  return carryoverAssumedDebt(asset.carryover, asset.carryover);
}
