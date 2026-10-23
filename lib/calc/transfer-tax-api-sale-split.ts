/**
 * ④ 양도가액 토지·건물 구분(`sale`) 와이어 조립 — 소득세법 §100②③ · 영 §166⑥⑧ `resolveTransferPriceSplit` 법정 서열 입력.
 *
 * 이월과세 × 증여자 신축(`transfer-tax-api-donor-built.ts`)과 일체 주택 본인 신축(`transfer-tax-api-self-built-housing.ts`)이 **같은 이 함수**를 부른다 — 복제하면
 * 한쪽만 era 게이트·모드 게이트가 갈린다. 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md §7.5.
 *
 * · 구분 기재 값은 모드가 `actual` 일 때만 싣는다 — 안분 모드로 되돌린 뒤 남은 직접 입력값이 엔진에서 구분 기재로 읽히는 길을 막는다(엔진은 모드가 아니라 값의 유무를 본다).
 * · 감정평가 값은 «appraisal»(안분 basis) 또는 «actual»(§100③ 30% 판정의 비교 대상)일 때만 싣는다.
 * · 시행령 §166⑧ 예외는 구분 기재가 있을 때만, 양도일 2025.1.1. 이후만 효력이 있다.
 * · 지분 스케일은 구분 기재 양도가액만 `transferPrice` 와 같은 축으로 한다. 기준시가·감정평가가액은 스케일하지 않는다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { saleSplitProvisoApplies } from "./sale-split-100-3-era";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const pos = (n: number): number | undefined => (n > 0 ? n : undefined);

export function buildSaleSplitWire(asset: AssetForm, transferDate: string | undefined, ownershipRatio: number) {
  const scale = (n: number) => (ownershipRatio < 1 ? applyRatio(n, ownershipRatio) : n);
  const mode = asset.saleSplitMode ?? "apportioned";
  const landPrice = pos(parseAmount(asset.landTransferPrice));
  const buildingPrice = pos(parseAmount(asset.buildingTransferPrice));
  const landApp = pos(parseAmount(asset.landAppraisalAtTransfer));
  const buildingApp = pos(parseAmount(asset.buildingAppraisalAtTransfer));
  // 공유지분 구분 기재 — 주택 구분양도 `declaredSaleWire`와 같은 규칙(계획서 `sale-split-100-3-share-scale-judgment.plan.md` PR-4):
  // 토지만 지분 몫으로 줄이고 건물은 비워 엔진이 「지분 양도가액 − 토지」로 정한다(Q-4 a — 따로 버림하면 합이 1원 모자란다).
  // §100③ 판정용 계약서 금액(100%)은 따로 싣는다(Q-1 a — 지분 몫으로 판정하면 30% 경계에서 결론이 뒤집힌다).
  const fractional = ownershipRatio < 1;
  const sendBuilding = !fractional || landPrice == null;
  return {
    // 구분 기재 — «actual» 일 때만. 안분 모드로 되돌린 뒤 남은 직접 입력값이 엔진에서 구분 기재로 읽히는 길을 막는다(엔진은 모드가 아니라 값의 유무를 본다)
    ...(mode === "actual" && landPrice != null ? { landTransferPrice: scale(landPrice) } : {}),
    ...(mode === "actual" && buildingPrice != null && sendBuilding ? { buildingTransferPrice: scale(buildingPrice) } : {}),
    ...(mode === "actual" && fractional && landPrice != null ? { contractLandTransferPrice: landPrice } : {}),
    ...(mode === "actual" && fractional && buildingPrice != null ? { contractBuildingTransferPrice: buildingPrice } : {}),
    // 감정평가 — «appraisal»(안분 basis) 또는 «actual»(§100③ 30% 판정의 비교 대상)
    ...(mode !== "apportioned" && landApp != null ? { landAppraisalAtTransfer: landApp } : {}),
    ...(mode !== "apportioned" && buildingApp != null ? { buildingAppraisalAtTransfer: buildingApp } : {}),
    // 시행령 §166⑧ 예외 — 구분 기재가 있을 때만, 양도일 2025.1.1. 이후만 효력
    ...(mode === "actual" && asset.saleSplitExemption && saleSplitProvisoApplies(transferDate)
      ? { saleSplitExemption: asset.saleSplitExemption }
      : {}),
  };
}
