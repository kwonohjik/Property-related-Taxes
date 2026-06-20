/**
 * 부담부증여(burdened gift) 자산-수준 validation.
 *
 * transfer-tax-validate.ts 800줄 정책으로 분리 (2026-05-12 Phase 3 후속).
 *
 * 책임:
 *  (1) propertyType 지원 범위 (housing·land·building·general_building·commercial_building)
 *  (2) 평가 모드 선택 필수
 *  (3) 인수 채무 입력 필수 (보증금 + 차입금 ≥ 1)
 *  (4) 시가 모드 — 양도시·취득시 시가 평가액 필수, B/C > 1 차단 (상증법 §47③)
 *  (5) Phase 3 — donorRelation 필수 (silent default 회피)
 *  (6) Phase 3 — 사전증여 행 부분 입력 차단 (silent drop 회피)
 *
 * 기준시가 모드 B/C > 1 검사는 엔진 `assertBurdenedGiftEligible()`에서 fail-fast.
 *
 * 호환성: 레거시 `acquisitionCause === "burdened_gift"`는 normalize에서 transferType로 이전.
 *
 * @returns 차단 메시지 (검증 실패 시) | null (통과)
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const SUPPORTED_KINDS = [
  "housing",
  "land",
  "building",
  "general_building",
  "commercial_building",
];

export function validateBurdenedGiftAsset(
  asset: AssetForm,
  label: string,
): string | null {
  const isBurdenedGift =
    asset.transferType === "burdened_gift" ||
    asset.acquisitionCause === "burdened_gift";
  if (!isBurdenedGift) return null;

  // (1) F-3 (2026-05-12): commercial_building 확장
  if (!SUPPORTED_KINDS.includes(asset.assetKind)) {
    return `${label}: 부담부증여는 주택·토지·건물·일반건물·상업용건물·오피스텔 자산에서만 지원됩니다 (현재: ${asset.assetKind}).`;
  }

  // (2) 평가 모드 선택 필수
  if (!asset.bgValuationMode) {
    return `${label}: 부담부증여 평가 유형(상증법 기준시가·시가)을 선택하세요.`;
  }

  // (3) 인수 채무 입력 필수
  const lending = parseAmount(asset.bgLendingDepositTotal) || 0;
  const mortgage = parseAmount(asset.bgMortgageDebtAmount) || 0;
  const assumedDebt = lending + mortgage;
  if (assumedDebt <= 0) {
    return `${label}: 부담부증여 인수 채무액(임대보증금 + 담보차입금)을 입력하세요.`;
  }

  // (4) 시가 모드 — 양도시 시가 + 취득가액 산정방식(K-4/K-5) + B/C>1 차단 (§100①·§159①1호 본문)
  if (asset.bgValuationMode === "sangjeungbeop_market") {
    if (!parseAmount(asset.bgMarketValueAtTransfer)) {
      return `${label}: 부담부증여 시가 모드 — 양도시 시가 평가액을 입력하세요.`;
    }
    // 취득가액 산정방식별 필수 입력 (H-5: bgMarketValueAtAcquisition 무조건 차단 제거)
    const acqMethod = asset.bgAcquisitionMethod || "";
    if (acqMethod === "actual") {
      // K-4 실지취득가액 안분 — 자산별 실지취득가 필수 (자동 안분 fallback 금지)
      if (asset.assetKind === "general_building") {
        if (
          !parseAmount(asset.bgActualAcquisitionLand) &&
          !parseAmount(asset.bgActualAcquisitionBuilding)
        ) {
          return `${label}: 부담부증여 실지취득가액 안분 — 토지 또는 건물의 실지취득가액을 입력하세요 (§97①1호가목).`;
        }
      } else if (asset.assetKind === "land") {
        if (!parseAmount(asset.bgActualAcquisitionLand)) {
          return `${label}: 부담부증여 실지취득가액 안분 — 토지 실지취득가액을 입력하세요.`;
        }
      } else if (!parseAmount(asset.bgActualAcquisitionTotal)) {
        return `${label}: 부담부증여 실지취득가액 안분 — 실지취득가액을 입력하세요.`;
      }
    } else if (acqMethod === "converted") {
      // K-5 환산취득가액 — 취득·양도시 기준시가 필수. general_building은 (5-b)에서 별도 검사.
      if (asset.assetKind !== "general_building" && asset.assetKind !== "land") {
        if (
          !parseAmount(asset.standardPriceAtTransfer) ||
          !parseAmount(asset.standardPriceAtAcq)
        ) {
          return `${label}: 부담부증여 환산취득가액 — 양도시·취득시 기준시가를 입력하세요 (소령 §176의2②2호).`;
        }
      }
    } else {
      // 미지정: 취득가액 산정방식 선택 강제 (시가 모드 입력 미완성 — collectStepIssues 단계 차단)
      return `${label}: 부담부증여 시가 모드 — 취득가액 산정방식(실지취득가액·환산취득가액)을 선택하세요 (소득세법 §100①).`;
    }
    // B/C > 1 차단 (C = bgMarketValueAtTransfer)
    const giftValuationMarket = parseAmount(asset.bgMarketValueAtTransfer) || 0;
    if (giftValuationMarket > 0 && assumedDebt > giftValuationMarket) {
      return `${label}: 채무액(${assumedDebt.toLocaleString()}원)이 증여가액(${giftValuationMarket.toLocaleString()}원)을 초과합니다. 부담부증여로는 성립하지 않습니다(상증법 §47③ 검토 필요). 양도 형태를 "일반 양도"로 변경하거나 평가액·채무액을 재확인하세요.`;
    }
  }
  // 기준시가 모드의 B/C > 1 검사는 엔진에서 fail-fast (giftValuation = Max(보충적·담보·임대) 산정 후).

  // (5) Phase 3 — donorRelation 필수
  if (!asset.bgDonorRelation) {
    return `${label}: 부담부증여 — 증여자-수증자 관계를 선택하세요 (상증법 §53 증여재산공제 산정).`;
  }

  // (5-b) 일반건물(general_building) 부담부증여 — §159①1호 환산용 취득시 기준시가 필수
  // §159①1호 단서(양도가액을 §99 기준시가로 산정 시 취득가액도 기준시가)에 따라
  // 사용자가 실거래가를 입력했더라도 취득시 기준시가가 산식 입력으로 필요.
  if (asset.assetKind === "general_building") {
    if (!parseAmount(asset.gbAcqLandPricePerSqm)) {
      return `${label}: 부담부증여 — 취득시 토지 ㎡당 공시지가를 입력하세요 (소령 §159①1호 환산).`;
    }
    if (!parseAmount(asset.gbAcqBuildingValue)) {
      return `${label}: 부담부증여 — 취득시 건물 기준시가를 입력하세요 (소령 §159①1호 환산).`;
    }
  }

  // (6) Phase 3 — 사전증여 행별 부분 입력 검증
  const priorGifts = asset.bgPriorGifts ?? [];
  for (let i = 0; i < priorGifts.length; i++) {
    const row = priorGifts[i];
    const hasDate = !!row.giftDate;
    const amount = parseAmount(row.giftAmount) || 0;
    if (hasDate && amount <= 0) {
      return `${label}: 사전증여 #${i + 1} — 증여일이 입력되었으나 증여재산가액이 0입니다. 가액을 입력하거나 행을 삭제하세요.`;
    }
    if (!hasDate && amount > 0) {
      return `${label}: 사전증여 #${i + 1} — 증여재산가액이 입력되었으나 증여일이 비어있습니다.`;
    }
    // §58 Phase A — 유효 사전증여 행은 당시 산출세액·과세표준 입력 필수 (미입력 시 공제 누락·이중과세)
    if (hasDate && amount > 0) {
      if ((parseAmount(row.computedTax) || 0) <= 0) {
        return `${label}: 사전증여 #${i + 1} — §58 기납부세액공제 적용을 위해 당시 산출세액을 입력하세요.`;
      }
      if ((parseAmount(row.giftTaxBase) || 0) <= 0) {
        return `${label}: 사전증여 #${i + 1} — §58 한도 산정을 위해 당시 과세표준을 입력하세요.`;
      }
    }
  }

  return null;
}
