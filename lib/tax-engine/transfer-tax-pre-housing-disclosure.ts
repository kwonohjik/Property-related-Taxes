/**
 * 개별주택가격 미공시 취득 시 환산취득가액 3-시점 계산 모듈
 *
 * 주택 취득 당시 개별주택가격이 공시되지 않아 최초 공시 시점을 기준으로
 * 3-시점(취득·최초공시·양도) 기준시가를 사용해 취득시 기준시가를 역산하고
 * 환산취득가액 및 토지/건물 분리 안분값을 계산한다.
 *
 * 핵심 법령:
 *   소득세법 시행령 §164 ⑤ — 개별주택가격 미공시 취득시 기준시가 추정
 *   소득세법 시행령 §166 ⑥ — 한 계약으로 일괄 양도 시 기준시가 비율 안분
 *   소득세법 시행령 §163 ⑥ — 개산공제 = 취득시 기준시가(안분 성분) × 3%
 *
 * 알고리즘 (Excel 검증 완료):
 *   1. Sum_A = landPricePerSqm_acq × area + buildingStd_acq
 *   2. Sum_F = landPricePerSqm_first × area + buildingStd_first
 *   3. P_A_est = floor(P_F × Sum_A / Sum_F)
 *   4. Sum_T = landPricePerSqm_trn × area + buildingStd_trn
 *   5. landHousingAtTransfer = floor(P_T × (landStdAtTransfer / Sum_T))
 *   6. landTransferPrice = floor(totalTransfer × landHousingAtTransfer / P_T)
 *   7. totalEstAcq = floor(totalTransfer × P_A_est / P_T)
 *   8. landHousingAtAcq = floor(P_A_est × landStdAtAcq / Sum_A)
 *   9. landAcqPrice = floor(totalEstAcq × landHousingAtAcq / P_A_est)
 *  10. landLumpDed = floor(landHousingAtAcq × 3%)
 */

import type { PreHousingDisclosureInput, PreHousingDisclosureResult } from "./types/transfer.types";

/**
 * 개별주택가격 미공시 취득 환산취득가 계산
 *
 * @param totalTransferPrice 총 양도가액
 * @param input 3-시점 기준시가 입력
 * @returns 중간값·결과값 상세 (UI 표시 및 calcSplitGain 연결용)
 */
export function calcPreHousingDisclosureGain(
  totalTransferPrice: number,
  input: PreHousingDisclosureInput,
): PreHousingDisclosureResult {
  const {
    landArea,
    landPricePerSqmAtAcquisition,
    buildingStdPriceAtAcquisition,
    landPricePerSqmAtFirstDisclosure,
    buildingStdPriceAtFirstDisclosure,
    firstDisclosureHousingPrice,
    transferHousingPrice,
    landPricePerSqmAtTransfer,
    buildingStdPriceAtTransfer,
  } = input;

  // ── Step 1: 각 시점 기준시가 산출 ──
  const landStdAtAcquisition = landPricePerSqmAtAcquisition * landArea;
  const landStdAtFirstDisclosure = landPricePerSqmAtFirstDisclosure * landArea;
  const landStdAtTransfer = landPricePerSqmAtTransfer * landArea;

  const sumAtAcquisition = landStdAtAcquisition + buildingStdPriceAtAcquisition;
  const sumAtFirstDisclosure = landStdAtFirstDisclosure + buildingStdPriceAtFirstDisclosure;
  const sumAtTransfer = landStdAtTransfer + buildingStdPriceAtTransfer;

  // ── Step 2: P_A_est — 취득시 개별주택가격 추정 (§164⑤) ──
  const P_A_est = sumAtFirstDisclosure > 0
    ? Math.floor(firstDisclosureHousingPrice * sumAtAcquisition / sumAtFirstDisclosure)
    : 0;

  const P_T = transferHousingPrice;

  // ── Step 3: 주택 공시가액 안분 — 양도시 (§166⑥) ──
  const landHousingAtTransfer = sumAtTransfer > 0
    ? Math.floor(P_T * landStdAtTransfer / sumAtTransfer)
    : 0;
  const buildingHousingAtTransfer = P_T - landHousingAtTransfer;

  // ── Step 4: 양도가액 분리 ──
  const landTransferPrice = P_T > 0
    ? Math.floor(totalTransferPrice * landHousingAtTransfer / P_T)
    : 0;
  const buildingTransferPrice = totalTransferPrice - landTransferPrice;

  // ── Step 5: 주택 공시가액 안분 — 취득시 ──
  const landHousingAtAcquisition = P_A_est > 0 && sumAtAcquisition > 0
    ? Math.floor(P_A_est * landStdAtAcquisition / sumAtAcquisition)
    : 0;
  const buildingHousingAtAcquisition = P_A_est - landHousingAtAcquisition;

  // ── Step 6: 총 환산취득가 · 취득가액 분리 ──
  const totalEstimatedAcquisitionPrice = P_T > 0
    ? Math.floor(totalTransferPrice * P_A_est / P_T)
    : 0;

  const landAcquisitionPrice = P_A_est > 0
    ? Math.floor(totalEstimatedAcquisitionPrice * landHousingAtAcquisition / P_A_est)
    : 0;
  const buildingAcquisitionPrice = totalEstimatedAcquisitionPrice - landAcquisitionPrice;

  // ── Step 7: 개산공제 (§163⑥) — 취득시 안분 성분 기준 ──
  const landLumpDeduction = Math.floor(landHousingAtAcquisition * 0.03);
  const buildingLumpDeduction = Math.floor(buildingHousingAtAcquisition * 0.03);

  // ── Step 8: 안분 비율 계산 (UI 표시용) ──
  const transferApportionRatio = {
    land: P_T > 0 ? landHousingAtTransfer / P_T : 0,
    building: P_T > 0 ? buildingHousingAtTransfer / P_T : 0,
  };
  const acquisitionApportionRatio = {
    land: P_A_est > 0 ? landHousingAtAcquisition / P_A_est : 0,
    building: P_A_est > 0 ? buildingHousingAtAcquisition / P_A_est : 0,
  };

  return {
    sumAtAcquisition,
    sumAtFirstDisclosure,
    sumAtTransfer,
    estimatedHousingPriceAtAcquisition: P_A_est,
    landStdAtAcquisition,
    buildingStdAtAcquisition: buildingStdPriceAtAcquisition,
    landStdAtTransfer,
    buildingStdAtTransfer: buildingStdPriceAtTransfer,
    landHousingAtAcquisition,
    buildingHousingAtAcquisition,
    landHousingAtTransfer,
    buildingHousingAtTransfer,
    transferApportionRatio,
    acquisitionApportionRatio,
    totalEstimatedAcquisitionPrice,
    landTransferPrice,
    buildingTransferPrice,
    landAcquisitionPrice,
    buildingAcquisitionPrice,
    landLumpDeduction,
    buildingLumpDeduction,
    inputs: {
      totalTransferPrice,
      landArea,
      landPricePerSqmAtAcquisition,
      buildingStdPriceAtAcquisition,
      landPricePerSqmAtFirstDisclosure,
      buildingStdPriceAtFirstDisclosure,
      firstDisclosureHousingPrice,
      landPricePerSqmAtTransfer,
      buildingStdPriceAtTransfer,
      transferHousingPrice: P_T,
    },
  };
}
