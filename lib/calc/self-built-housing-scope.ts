/**
 * 일체 주택 **본인 신축** × 「소득세법」 §114조의2 환산·감정가액 5% 가산세 — base 를 **건물분**으로 구하는 입력 축의 **적용 범위** 단일 소스.
 *
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§7.4 · §9 PR-2 · 사용자 확정 Q-3·Q-4·Q-5·Q-10~12)
 *
 * ⑤(카드 노출)·⑧(필수 검증)·④(전송)이 **같은 이 함수**를 읽는다 — 어느 한쪽만 다르면 «화면에 없는 칸을 요구»(dead-end)하거나
 * «화면에 없는 stale 값이 전송»된다(`donor-built-scope.ts`·`extension-appraisal-penalty.ts` 선례). 숨은 입력 = 미전송 = 미요구.
 *
 * 엔진 거울: `transfer-tax-self-built-housing-penalty.ts` 의 `unreachableReason`(정적 거부) + `selfBuiltHousingGateOpen`(5년·시행일) + `splitActive`(건물 파트가 이미 축).
 *   · 정적 거부 — 비주택·부담부증여·매매 외 취득·본인 신축 아님·겸용·증축·PHD  → 모두 null
 *   · 게이트 — 신축일부터 5년 이내(당일 포함) ∧ 환산은 양도일 ≥ 2018-01-01, 감정은 ≥ 2020-01-01. 실지거래가·매매사례는 조문 대상이 아니다
 *   · 분리 — 토지·건물 취득일 분리·소유자 분리·배율 초과분 분리는 `isSplitPayloadActive` 가 참 → null (그 카드(S3-1·#17)가 같은 칸을 받는다 — `data-field` 중복 방지)
 *   · 엔진이 던지는 공익수용·공매 특례(영 §164⑨ — 환산 분모가 바뀐다)와는 결합하지 않는다 → null
 *
 * 증축은 Q-4 확정으로 제외한다(기준시가 비례 안분이면 수학적으로 같은 값 — 현행 증축부분 한정 base 유지).
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { calculateBuildingPenalty } from "@/lib/tax-engine/transfer-tax-building-penalty";
import { isAuctionEligibleAssetKind } from "@/lib/tax-engine/expropriation-scope";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { selfBuiltActive } from "./self-built-scope";
import { primaryAcquisitionModeFlags } from "./transfer-tax-api-primary-context";
import { isSplitPayloadActive } from "./transfer-tax-api-split";
import { usesPhdGate } from "./transfer-lump-sum-base-gate";

export interface SelfBuiltHousingScopeCtx {
  /** 양도일(YYYY-MM-DD) — 5년·시행일 게이트와 배율 초과분 분리 판정에 필요 */
  transferDate?: string;
  /** 함께 양도하는 두 번째 이후 자산 — PHD 는 첫 자산에만 닿는다 */
  isNonPrimary?: boolean;
}

export interface SelfBuiltHousingScope {
  method: "estimated" | "appraisal";
  /** (가) 취득 당시 토지 ㎡당 공시지가·건물 기준시가 — 환산, 또는 감정 + 「구분 표시 없음」 */
  acq: boolean;
  /** (나) 양도 당시 토지·건물 기준시가 + 양도가액 구분 — 환산만 */
  sale: boolean;
  /** 건물 감정가액 직접 입력 — 감정 + 감정서에 건물 가액이 구분 표시됨 */
  directAppraisal: boolean;
}

/** 감정평가서에 건물 가액이 구분 표시되어 있지 않다(= 취득 당시 기준시가 비율로 나눈다) — ⑤·⑧·④가 같은 기본값(false = 직접 입력)을 읽는다. */
export function selfBuiltAppraisalNoSplit(asset: Pick<AssetForm, "selfBuiltAppraisalNoSplit"> | undefined): boolean {
  return asset?.selfBuiltAppraisalNoSplit === true;
}

/** 가산세 창(5년·시행일)이 열렸는가 — 엔진과 같은 단일 소스 `calculateBuildingPenalty`. 완공일·양도일이 비면 거짓. */
function gateOpen(asset: AssetForm, transferDate: string | undefined, method: "estimated" | "appraisal"): boolean {
  const date = toOptionalDate(transferDate);
  const constructionDate = toOptionalDate(asset.constructionDate);
  if (!date || !constructionDate) return false;
  const input = { isSelfBuilt: true, acquisitionMethod: method, transferDate: date, constructionDate, buildingType: "new" } as unknown as TransferTaxInput;
  return calculateBuildingPenalty(input, 1) !== null;
}

/**
 * 이 자산에서 «건물분 가산세 base» 입력을 받는가 — 받으면 어느 칸을 받는지. 범위 밖이면 null(칸 없음 · 요구 없음 · 미전송).
 * 본인 신축 토글이 켜져 있어야 의미가 있으므로 `selfBuiltActive` 를 먼저 본다.
 */
export function selfBuiltHousingScope(asset: AssetForm | undefined, ctx: SelfBuiltHousingScopeCtx = {}): SelfBuiltHousingScope | null {
  if (!asset || asset.assetKind !== "housing" || !selfBuiltActive(asset)) return null;
  if (asset.isMixedUseHouse === true || asset.transferType === "burdened_gift") return null;
  // 증축 제외(Q-4) · 구분 미선택은 ⑧의 «구분 선택» 요구가 먼저다
  if (asset.buildingType !== "new") return null;
  // 환산·감정은 상호 배타 — 둘 다 켜진 잔재는 ④가 방식을 한쪽으로 읽을 수 없어 범위 밖으로 둔다
  if (asset.useEstimatedAcquisition === true && asset.isAppraisalAcquisition === true) return null;
  const flags = primaryAcquisitionModeFlags(asset);
  const method = flags.isAppraisal ? "appraisal" : flags.isEstimated ? "estimated" : null;
  if (!method) return null;
  // 영 §164⑨ 공익수용(1호)·공매(2호) — 환산 분모가 바뀌어 엔진이 결합을 거부한다. 화면에서도 이 입력을 열지 않는다.
  if (asset.transferCause === "public_expropriation") return null;
  if (asset.isAuctionTransfer === true && isAuctionEligibleAssetKind(asset.assetKind)) return null;
  if (!gateOpen(asset, ctx.transferDate, method)) return null;
  const isNonPrimary = ctx.isNonPrimary === true;
  if (isSplitPayloadActive(asset, false, { transferDate: ctx.transferDate, isNonPrimary })) return null;
  if (usesPhdGate(asset, isNonPrimary)) return null;

  const noSplit = selfBuiltAppraisalNoSplit(asset);
  return method === "estimated"
    ? { method, acq: true, sale: true, directAppraisal: false }
    : { method, acq: noSplit, sale: false, directAppraisal: !noSplit };
}
