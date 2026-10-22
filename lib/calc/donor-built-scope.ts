/**
 * 이월과세 × **증여자가 신축·증축한 건물**(소득세법 §114조의2) 입력 축의 **적용 범위** 단일 소스.
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-2)
 *
 * ⑤(토글 노출)·⑧(필수 검증)·④(전송)이 **같은 술어**를 쓴다 — 어느 한쪽만 다르면 «화면에 없는 칸을 요구»(dead-end)하거나
 * «화면에 없는 stale 값이 전송»된다(`self-built-scope.ts` 선례). 이 술어는 엔진이 거부하는 조합(`assertDonorBuiltInput`)과 ⑫
 * (`refineDonorBuiltOuter`)의 거부 조합을 **UI에서 미리 비노출**로 만든 것이다:
 *   · 환산 OFF(실가 승계)·개별주택가격 미공시·공동주택 최초고시 전 환산(phd/apd) · 일반 기준시가 환산(`general`)만 허용
 *   · 주택·건물만 — 토지·상가·일반건물·분양권·입주권·재개발은 제외 / 겸용주택 제외
 *   · 부담부증여 · 토지·건물 분리 계산(분리 취득·소유자 분리·파트 이월과세·배율 초과분 분리) 제외
 */
import { isSplitPayloadActive } from "./transfer-tax-api-split";
import { partCarryover } from "./transfer-land-part-cause";
import { parseAmount } from "./number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export interface DonorBuiltScopeCtx {
  /** 양도일(YYYY-MM-DD) — 배율 초과분 분리 판정에 필요 */
  transferDate?: string;
  /** 함께 양도하는 두 번째 이후 자산 */
  isNonPrimary?: boolean;
}

/** 이 자산에서 «증여자 신축·증축» 질문을 묻는가 — ⑤ 노출 · ⑧ 요구 · ④ 전송이 이 하나를 읽는다. */
export function donorBuiltApplicable(asset: AssetForm | undefined, ctx: DonorBuiltScopeCtx = {}): boolean {
  const c = asset?.carryover;
  if (!asset || !c || asset.acquisitionCause !== "carryover_gift") return false;
  if (c.useEstimatedAcquisition !== true || c.estimationMode !== "general") return false;
  if (asset.assetKind !== "housing" && asset.assetKind !== "building") return false;
  if (asset.assetKind === "housing" && asset.isMixedUseHouse === true) return false;
  if (asset.transferType === "burdened_gift") return false;
  const part = partCarryover(asset, { isNonPrimary: ctx.isNonPrimary });
  if (part.land || part.building) return false;
  return !isSplitPayloadActive(asset, false, { transferDate: ctx.transferDate, isNonPrimary: ctx.isNonPrimary });
}

/** 토글이 켜져 **계산에 실리는가** = 적용 범위 안 + 토글 ON. stale(범위 밖에서 켜 둔 값)은 false. */
export function donorBuiltActive(asset: AssetForm | undefined, ctx: DonorBuiltScopeCtx = {}): boolean {
  return donorBuiltApplicable(asset, ctx) && asset?.carryover?.donorBuilt === true;
}

/** 일체 주택(토지+건물 결합 공시)이라 건물분 안분 입력이 필요한가 — 비주택 건물은 건물 단독이라 불필요. */
export function donorBuiltNeedsHousingSplit(asset: AssetForm | undefined): boolean {
  return asset?.assetKind === "housing";
}

/** 증여자 취득 당시 토지 기준시가 L = ㎡당 개별공시지가 × 면적 입력이 모두 양수인가 — 표시 보조 */
export function donorBuiltLandInputsFilled(c: NonNullable<AssetForm["carryover"]>): boolean {
  return parseAmount(c.donorBuiltLandPricePerSqm) > 0 && parseFloat(c.donorBuiltLandArea) > 0;
}
