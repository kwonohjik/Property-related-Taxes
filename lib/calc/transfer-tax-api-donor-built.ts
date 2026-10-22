/**
 * ④ 이월과세 `carryoverTaxation.donorBuilt`(증여자 신축·증축, 소득세법 §114조의2) 페이로드 빌드.
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md §3.2·§6 (PR-2)
 *
 * · 전송 게이트는 ⑤·⑧과 **같은 술어**(`donorBuiltActive`) — 범위 밖에서 켜 둔 stale 값은 보내지 않는다.
 * · 일체 주택의 양도 당시 토지·건물 기준시가와 양도가액 구분(Q-6 b)은 **새 폼 칸이 아니라 기존 자산 수준 칸**을 읽어
 *   `donorBuilt.housing`에 **중첩**으로 싣는다. 최상위에 실으면 토지·건물 분리 계산(`calcSplitGain`)과 섞인다.
 * · 지분 스케일: 구분 기재 양도가액만 `transferPrice`와 같은 축으로 스케일한다. 기준시가·감정평가가액·취득 당시 입력은 스케일하지 않는다
 *   (환산 산식에서 분자·분모로 약분되고, 감정은 비율로만 소비된다 — `transfer-tax-api-split.ts`의 규약과 같다).
 * · 비어 있는 필수 칸은 0으로 보내 ⑫가 거부하게 한다(⑧이 먼저 막는다) — 조용히 지어내지 않는다.
 * 순환 import 를 피하려고 `transfer-tax-api-carryover.ts`와 분리했다(`transfer-tax-api-split.ts`가 그쪽을 import 한다).
 */
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { saleSplitProvisoApplies } from "./sale-split-100-3-era";
import { resolveLandStdAtTransfer } from "./transfer-tax-split-acq-mode";
import { donorBuiltActive, donorBuiltNeedsHousingSplit, type DonorBuiltScopeCtx } from "./donor-built-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const pos = (n: number): number | undefined => (n > 0 ? n : undefined);

function buildHousing(asset: AssetForm, ctx: DonorBuiltScopeCtx, ownershipRatio: number) {
  const c = asset.carryover!;
  const scale = (n: number) => (ownershipRatio < 1 ? applyRatio(n, ownershipRatio) : n);
  const mode = asset.saleSplitMode ?? "apportioned";
  const landPrice = pos(parseAmount(asset.landTransferPrice));
  const buildingPrice = pos(parseAmount(asset.buildingTransferPrice));
  const landApp = pos(parseAmount(asset.landAppraisalAtTransfer));
  const buildingApp = pos(parseAmount(asset.buildingAppraisalAtTransfer));
  const sale = {
    // 구분 기재 — «actual» 일 때만. 안분 모드로 되돌린 뒤 남은 직접 입력값이 엔진에서 구분 기재로 읽히는 길을 막는다(엔진은 모드가 아니라 값의 유무를 본다)
    ...(mode === "actual" && landPrice != null ? { landTransferPrice: scale(landPrice) } : {}),
    ...(mode === "actual" && buildingPrice != null ? { buildingTransferPrice: scale(buildingPrice) } : {}),
    // 감정평가 — «appraisal»(안분 basis) 또는 «actual»(§100③ 30% 판정의 비교 대상)
    ...(mode !== "apportioned" && landApp != null ? { landAppraisalAtTransfer: landApp } : {}),
    ...(mode !== "apportioned" && buildingApp != null ? { buildingAppraisalAtTransfer: buildingApp } : {}),
    // 시행령 §166⑧ 예외 — 구분 기재가 있을 때만, 양도일 2025.1.1. 이후만 효력
    ...(mode === "actual" && asset.saleSplitExemption && saleSplitProvisoApplies(ctx.transferDate)
      ? { saleSplitExemption: asset.saleSplitExemption }
      : {}),
  };
  return {
    landPricePerSqmAtAcquisition: parseAmount(c.donorBuiltLandPricePerSqm),
    landArea: parseDecimal(c.donorBuiltLandArea),
    buildingStdPriceAtAcquisition: parseAmount(c.donorBuiltBuildingStdAtAcq),
    landStdPriceAtTransfer: resolveLandStdAtTransfer(asset) ?? 0,
    buildingStdPriceAtTransfer: parseAmount(asset.buildingStandardPriceAtTransfer),
    ...(Object.keys(sale).length > 0 ? { sale } : {}),
  };
}

/** `donorBuilt` 와이어 객체 — 범위 밖이거나 토글 OFF 면 undefined */
export function buildDonorBuiltPayload(asset: AssetForm, ctx: DonorBuiltScopeCtx, ownershipRatio: number) {
  if (!donorBuiltActive(asset, ctx)) return undefined;
  const c = asset.carryover!;
  const isExtension = c.donorBuiltType === "extension";
  return {
    // 미선택("")이면 ⑫ enum 이 거부한다 — ⑧이 먼저 막으므로 정상 경로에서는 닿지 않는다
    buildingType: c.donorBuiltType as "new" | "extension",
    constructionDate: c.donorBuiltDate,
    ...(isExtension
      ? {
          extensionFloorArea: pos(parseDecimal(c.donorBuiltExtensionArea)),
          extensionStdPriceAtAcquisition: pos(parseAmount(c.donorBuiltExtensionStdPrice)),
        }
      : {}),
    ...(donorBuiltNeedsHousingSplit(asset) ? { housing: buildHousing(asset, ctx, ownershipRatio) } : {}),
  };
}

/** `buildCarryoverPayload` 가 만든 `carryoverTaxation` 에 `donorBuilt` 를 얹는다 — 주 자산·컴패니언 ④가 같은 함수를 쓴다. */
export function withDonorBuilt<T extends object>(
  carryoverTaxation: T,
  asset: AssetForm,
  ctx: DonorBuiltScopeCtx,
  ownershipRatio: number,
): T {
  const donorBuilt = buildDonorBuiltPayload(asset, ctx, ownershipRatio);
  return donorBuilt ? { ...carryoverTaxation, donorBuilt } : carryoverTaxation;
}
