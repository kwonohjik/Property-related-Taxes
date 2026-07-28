/**
 * 개별주택가격 미공시 취득 시 환산취득가액 3-시점 계산 모듈
 *
 * 주택 취득 당시 개별주택가격이 공시되지 않아 최초 공시 시점을 기준으로
 * 3-시점(취득·최초공시·양도) 기준시가를 사용해 취득시 기준시가를 역산하고
 * 환산취득가액 및 토지/건물 분리 안분값을 계산한다.
 *
 * 핵심 법령:
 *   소득세법 시행령 §164 ⑦ — 개별주택가격·공동주택가격 미공시 취득시 주택 기준시가 추정
 *     (본문 산식 P_A_est = floor(P_F × Sum_A / Sum_F). 건물분 기준시가가 없는 경우 §164⑤ 준용)
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
import { computeEstimatedDeduction } from "./tax-utils";

/**
 * 개별주택가격 미공시 취득 환산취득가 계산
 *
 * @param totalTransferPrice 총 양도가액
 * @param input 3-시점 기준시가 입력
 * @param conversionDenominatorOverride §164⑨1호 공익수용 특례 — 양도당시 개별주택가격(P_T)을 낮춘 값.
 *   제공 시 **환산취득가 산정의 분모(P_T)에만** 적용하고 양도가액 토지·건물 안분은 원 P_T를 유지한다
 *   (D16-GB 원리: 환산 분모만·안분 원값. 법령 검증 §176의2②2호·§166⑥·§164⑨). 4부분(겸용) 모드 미적용.
 * @returns 중간값·결과값 상세 (UI 표시 및 calcSplitGain 연결용)
 */
export function calcPreHousingDisclosureGain(
  totalTransferPrice: number,
  input: PreHousingDisclosureInput,
  conversionDenominatorOverride?: number,
): PreHousingDisclosureResult {
  const {
    landArea,
    landAreaAtAcquisition,
    landAreaAtFirstDisclosure,
    landAreaAtTransfer,
    landPricePerSqmAtAcquisition,
    buildingStdPriceAtAcquisition,
    landPricePerSqmAtFirstDisclosure,
    buildingStdPriceAtFirstDisclosure,
    firstDisclosureHousingPrice,
    transferHousingPrice,
    landPricePerSqmAtTransfer,
    buildingStdPriceAtTransfer,
    // Case A 4부분 안분 (겸용주택 + 일부 용도변경(주택→상가) + 최초공시 < 용도변경)
    commercialBuildingStdPriceAtAcq,
    commercialBuildingStdPriceAtFirstDisclosure,
    commercialBuildingStdPriceAtTransfer,
    housingLandArea,
    commercialLandArea,
    housingBuildingStdPriceAtTransfer,
    totalTransferPriceForFourPart,
  } = input;

  // 4부분 모드 활성화 — Case A 한정 (모든 commercial 입력 + housing/commercialLandArea + 총양도가액)
  const fourPartActive =
    commercialBuildingStdPriceAtAcq !== undefined &&
    commercialBuildingStdPriceAtFirstDisclosure !== undefined &&
    commercialBuildingStdPriceAtTransfer !== undefined &&
    housingLandArea !== undefined && housingLandArea > 0 &&
    commercialLandArea !== undefined && commercialLandArea > 0 &&
    totalTransferPriceForFourPart !== undefined && totalTransferPriceForFourPart > 0;

  // 시점별 면적 — 4부분 모드에서는 housingLandArea + commercialLandArea = 전체 토지면적.
  // 비4부분 모드에서는 기존 단일 landArea / override 사용.
  const areaAtAcq = fourPartActive
    ? (housingLandArea! + commercialLandArea!)
    : (landAreaAtAcquisition ?? landArea);
  const areaAtFirst = fourPartActive
    ? (housingLandArea! + commercialLandArea!)
    : (landAreaAtFirstDisclosure ?? landArea);
  const areaAtTransfer = fourPartActive
    ? (housingLandArea! + commercialLandArea!)
    : (landAreaAtTransfer ?? landArea);

  // ── Step 1: 각 시점 토지·건물 기준시가 산출 ──
  const landStdAtAcquisition = landPricePerSqmAtAcquisition * areaAtAcq;
  const landStdAtFirstDisclosure = landPricePerSqmAtFirstDisclosure * areaAtFirst;
  const landStdAtTransfer = landPricePerSqmAtTransfer * areaAtTransfer;

  // 4부분 모드: 건물 합계 = 주택건물 + 상가건물 (사용자는 buildingStdPriceAt* 에 주택건물만 입력).
  // 비4부분: 기존 단일 건물 기준시가 그대로.
  const sumAtAcquisition = fourPartActive
    ? landStdAtAcquisition + buildingStdPriceAtAcquisition + commercialBuildingStdPriceAtAcq!
    : landStdAtAcquisition + buildingStdPriceAtAcquisition;
  const sumAtFirstDisclosure = fourPartActive
    ? landStdAtFirstDisclosure + buildingStdPriceAtFirstDisclosure + commercialBuildingStdPriceAtFirstDisclosure!
    : landStdAtFirstDisclosure + buildingStdPriceAtFirstDisclosure;
  const sumAtTransfer = fourPartActive
    ? landStdAtTransfer + buildingStdPriceAtTransfer + commercialBuildingStdPriceAtTransfer!
    : landStdAtTransfer + buildingStdPriceAtTransfer;

  // ── Step 2: P_A_est — 취득시 개별주택가격 추정 (§164⑦ 본문) ──
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
  // §164⑨1호 공익수용 특례 — 환산 분모(양도당시 개별주택가격)만 낮춘다. 안분(Step 3~4)은 원 P_T 유지
  // (D16-GB 원리). 4부분(겸용) 모드는 자체 분모(sumAtTransferShare)를 쓰므로 미적용(P7).
  const P_T_conv =
    !fourPartActive && conversionDenominatorOverride !== undefined && conversionDenominatorOverride > 0
      ? conversionDenominatorOverride
      : P_T;
  const totalEstimatedAcquisitionPrice = P_T_conv > 0
    ? Math.floor(totalTransferPrice * P_A_est / P_T_conv)
    : 0;

  const landAcquisitionPrice = P_A_est > 0
    ? Math.floor(totalEstimatedAcquisitionPrice * landHousingAtAcquisition / P_A_est)
    : 0;
  const buildingAcquisitionPrice = totalEstimatedAcquisitionPrice - landAcquisitionPrice;

  // ── Step 7: 개산공제 (§163⑥) — 취득시 안분 성분 기준 ──
  // 공유지분 축소(§163⑥ base) — 기준시가 입력은 물건 전체(100%)로 유지하고 여기서만 적용한다.
  //
  // ⚠️ **성분별 독립 floor가 정본이다. 잔액 흡수를 넣지 말 것.**
  //    §166⑥은 토지·건물을 구분해 **각각의 양도차익**을 산출하고, §163⑥은 그 각 자산의
  //    취득당시 기준시가에 율을 곱한다 — "라목 총액 기준 법정액 하나"를 강제하는 문언이 없다.
  //    잔액 흡수를 시도했다가 Excel 정본 anchor(D-7-2 건물 개산공제 4,454,759)와 1원 어긋나
  //    14건이 깨졌다(2026-07-28). 재시도 방지용 기록.
  const landLumpDeduction = computeEstimatedDeduction(
    landHousingAtAcquisition,
    0.03,
    input.ownershipRatio,
  );
  const buildingLumpDeduction = computeEstimatedDeduction(
    buildingHousingAtAcquisition,
    0.03,
    input.ownershipRatio,
  );

  // ── Step 8: 안분 비율 계산 (UI 표시용) ──
  const transferApportionRatio = {
    land: P_T > 0 ? landHousingAtTransfer / P_T : 0,
    building: P_T > 0 ? buildingHousingAtTransfer / P_T : 0,
  };
  const acquisitionApportionRatio = {
    land: P_A_est > 0 ? landHousingAtAcquisition / P_A_est : 0,
    building: P_A_est > 0 ? buildingHousingAtAcquisition / P_A_est : 0,
  };

  // ── Case A 4부분 안분 결과 빌드 ──
  // 위 fourPartActive 분기에서 sumAtAcquisition·sumAtFirstDisclosure·sumAtTransfer 가 4부분 합계로 계산됨.
  // P_A_est 도 이미 4부분 sums 기준으로 계산됨.
  let fourPartApportionment: PreHousingDisclosureResult["fourPartApportionment"] = undefined;
  if (fourPartActive) {
    const houseLand = housingLandArea!;
    const commLand = commercialLandArea!;

    // 4부분 시점별 토지/건물 기준시가 (엑셀 Row 40~42)
    const housingLandStdAtAcq = landPricePerSqmAtAcquisition * houseLand;
    const commercialLandStdAtAcq = landPricePerSqmAtAcquisition * commLand;
    const housingBuildingStdAtAcq = buildingStdPriceAtAcquisition;        // 사용자 입력 = 취득시 주택건물
    const commercialBuildingStdAtAcq = commercialBuildingStdPriceAtAcq!;  // 취득시 상가건물

    const housingLandStdAtFirst = landPricePerSqmAtFirstDisclosure * houseLand;
    const commercialLandStdAtFirst = landPricePerSqmAtFirstDisclosure * commLand;
    const housingBuildingStdAtFirst = buildingStdPriceAtFirstDisclosure;
    const commercialBuildingStdAtFirst = commercialBuildingStdPriceAtFirstDisclosure!;

    const housingLandStdAtTransfer = landPricePerSqmAtTransfer * houseLand;
    const commercialLandStdAtTransfer = landPricePerSqmAtTransfer * commLand;
    // 양도시 주택건물은 housingBuildingStdPriceAtTransfer 명시 입력 우선, 없으면 buildingStdPriceAtTransfer 그대로
    const housingBuildingStdAtTransfer = housingBuildingStdPriceAtTransfer ?? buildingStdPriceAtTransfer;
    const commercialBuildingStdAtTransfer = commercialBuildingStdPriceAtTransfer!;

    // 4부분 합산기준시가 (각 시점)
    const sumAtAcq4 = housingLandStdAtAcq + housingBuildingStdAtAcq + commercialLandStdAtAcq + commercialBuildingStdAtAcq;
    const sumAtFirst4 = housingLandStdAtFirst + housingBuildingStdAtFirst + commercialLandStdAtFirst + commercialBuildingStdAtFirst;
    const sumAtTransfer4 = housingLandStdAtTransfer + housingBuildingStdAtTransfer + commercialLandStdAtTransfer + commercialBuildingStdAtTransfer;

    // 양도시 주택공시가 안분 (D34/E34) — 주택건물·주택분토지 비율로 P_T 분리
    const sumHousingAtTransfer = housingLandStdAtTransfer + housingBuildingStdAtTransfer;
    const housingLandStdShare = sumHousingAtTransfer > 0
      ? Math.floor(transferHousingPrice * housingLandStdAtTransfer / sumHousingAtTransfer)
      : 0;
    const housingBuildingStdShare = transferHousingPrice - housingLandStdShare;
    // 양도시 안분 후 4부분 합계 (H34) = D34 + E34 + F40 + G40
    const sumAtTransferShare = housingLandStdShare + housingBuildingStdShare + commercialLandStdAtTransfer + commercialBuildingStdAtTransfer;

    // 양도가액 4부분 안분 (Row 10) — 총 양도가액 × (각 부분 / H34)
    const totalTransfer4 = totalTransferPriceForFourPart!;
    const housingLandTransferPrice = sumAtTransferShare > 0
      ? Math.floor(totalTransfer4 * housingLandStdShare / sumAtTransferShare) : 0;
    const housingBuildingTransferPrice = sumAtTransferShare > 0
      ? Math.floor(totalTransfer4 * housingBuildingStdShare / sumAtTransferShare) : 0;
    const commercialLandTransferPrice = sumAtTransferShare > 0
      ? Math.floor(totalTransfer4 * commercialLandStdAtTransfer / sumAtTransferShare) : 0;
    const commercialBuildingTransferPrice = totalTransfer4 - housingLandTransferPrice - housingBuildingTransferPrice - commercialLandTransferPrice;

    // 환산취득가액 (C11) = INT(C10 × C35 / H34) — C35 = P_A_est, H34 = sumAtTransferShare
    const totalEstAcq = sumAtTransferShare > 0
      ? Math.floor(totalTransfer4 * P_A_est / sumAtTransferShare)
      : 0;

    // 취득시 4부분 P_A_est 안분 (Row 35, D35~G35) — 개산공제 base
    const housingLandAcqShare = sumAtAcq4 > 0
      ? Math.floor(P_A_est * housingLandStdAtAcq / sumAtAcq4) : 0;
    const housingBuildingAcqShare = sumAtAcq4 > 0
      ? Math.floor(P_A_est * housingBuildingStdAtAcq / sumAtAcq4) : 0;
    const commercialLandAcqShare = sumAtAcq4 > 0
      ? Math.floor(P_A_est * commercialLandStdAtAcq / sumAtAcq4) : 0;
    const commercialBuildingAcqShare = P_A_est - housingLandAcqShare - housingBuildingAcqShare - commercialLandAcqShare;

    // 환산취득가액 4부분 안분 (Row 11, D11~G11) — Excel: 소수 보존 후 마지막 G11에서 잔여 처리
    const housingLandAcqPrice = P_A_est > 0 ? totalEstAcq * housingLandAcqShare / P_A_est : 0;
    const housingBuildingAcqPrice = P_A_est > 0 ? totalEstAcq * housingBuildingAcqShare / P_A_est : 0;
    const commercialLandAcqPrice = P_A_est > 0 ? totalEstAcq * commercialLandAcqShare / P_A_est : 0;
    const commercialBuildingAcqPrice = totalEstAcq - housingLandAcqPrice - housingBuildingAcqPrice - commercialLandAcqPrice;

    // 개산공제 4부분 (Row 12) = INT(D35~G35 × 3%)
    // 성분별 독립 floor — Step 7과 같은 이유로 잔액 흡수하지 않는다.
    const housingLandLumpDed = computeEstimatedDeduction(housingLandAcqShare, 0.03, input.ownershipRatio);
    const housingBuildingLumpDed = computeEstimatedDeduction(housingBuildingAcqShare, 0.03, input.ownershipRatio);
    const commercialLandLumpDed = computeEstimatedDeduction(commercialLandAcqShare, 0.03, input.ownershipRatio);
    const commercialBuildingLumpDed = computeEstimatedDeduction(commercialBuildingAcqShare, 0.03, input.ownershipRatio);

    // 양도차익 4부분 (Row 13) — 소수점 이하 절사 (사용자 요청)
    const housingLandGain = Math.floor(housingLandTransferPrice - housingLandAcqPrice - housingLandLumpDed);
    const housingBuildingGain = Math.floor(housingBuildingTransferPrice - housingBuildingAcqPrice - housingBuildingLumpDed);
    const commercialLandGain = Math.floor(commercialLandTransferPrice - commercialLandAcqPrice - commercialLandLumpDed);
    const commercialBuildingGain = Math.floor(commercialBuildingTransferPrice - commercialBuildingAcqPrice - commercialBuildingLumpDed);

    // 주택/상가 합계
    const housingTransferPriceSum = housingLandTransferPrice + housingBuildingTransferPrice;
    const housingAcqPriceSum = Math.floor(housingLandAcqPrice + housingBuildingAcqPrice);
    const housingLumpDedSum = housingLandLumpDed + housingBuildingLumpDed;
    const housingGainSum = housingLandGain + housingBuildingGain;
    const commercialTransferPriceSum = commercialLandTransferPrice + commercialBuildingTransferPrice;
    const commercialAcqPriceSum = Math.floor(commercialLandAcqPrice + commercialBuildingAcqPrice);
    const commercialLumpDedSum = commercialLandLumpDed + commercialBuildingLumpDed;
    const commercialGainSum = commercialLandGain + commercialBuildingGain;

    fourPartApportionment = {
      housingLandStdAtAcq, housingBuildingStdAtAcq, commercialLandStdAtAcq, commercialBuildingStdAtAcq,
      housingLandStdAtFirst, housingBuildingStdAtFirst, commercialLandStdAtFirst, commercialBuildingStdAtFirst,
      housingLandStdAtTransfer, housingBuildingStdAtTransfer, commercialLandStdAtTransfer, commercialBuildingStdAtTransfer,
      sumAtAcq4, sumAtFirst4, sumAtTransfer4,
      housingLandStdShare, housingBuildingStdShare, sumAtTransferShare,
      housingLandTransferPrice, housingBuildingTransferPrice, commercialLandTransferPrice, commercialBuildingTransferPrice,
      totalEstAcq,
      housingLandAcqPrice, housingBuildingAcqPrice, commercialLandAcqPrice, commercialBuildingAcqPrice,
      housingLandAcqShare, housingBuildingAcqShare, commercialLandAcqShare, commercialBuildingAcqShare,
      housingLandLumpDed, housingBuildingLumpDed, commercialLandLumpDed, commercialBuildingLumpDed,
      housingLandGain, housingBuildingGain, commercialLandGain, commercialBuildingGain,
      housingTransferPriceSum, housingAcqPriceSum, housingLumpDedSum, housingGainSum,
      commercialTransferPriceSum, commercialAcqPriceSum, commercialLumpDedSum, commercialGainSum,
    };
  }

  return {
    sumAtAcquisition,
    sumAtFirstDisclosure,
    sumAtTransfer,
    estimatedHousingPriceAtAcquisition: P_A_est,
    landStdAtAcquisition,
    buildingStdAtAcquisition: buildingStdPriceAtAcquisition,
    landStdAtFirstDisclosure,
    buildingStdAtFirstDisclosure: buildingStdPriceAtFirstDisclosure,
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
      landAreaAtAcquisition: areaAtAcq,
      landAreaAtFirstDisclosure: areaAtFirst,
      landAreaAtTransfer: areaAtTransfer,
      landPricePerSqmAtAcquisition,
      buildingStdPriceAtAcquisition,
      landPricePerSqmAtFirstDisclosure,
      buildingStdPriceAtFirstDisclosure,
      firstDisclosureHousingPrice,
      landPricePerSqmAtTransfer,
      buildingStdPriceAtTransfer,
      transferHousingPrice: P_T,
    },
    fourPartApportionment,
  };
}
