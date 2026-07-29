/**
 * 개별주택가격 미공시 취득 환산 (Pre-Housing-Disclosure, PHD) 타입 정의
 *
 * 소득세법 시행령 §164⑤ 기반.
 * 800줄 정책 준수를 위해 `transfer.types.ts`에서 분리. 하위 호환을 위해 본체에서 재수출됨.
 */

/**
 * 개별주택가격 미공시 취득 시 환산취득가액 3-시점 계산 입력
 *
 * 주택 취득 당시 개별주택가격이 공시되지 않아 최초 공시 시점을 기준으로
 * 3-시점(취득·최초공시·양도) 기준시가를 사용해 취득시 기준시가를 역산한 뒤
 * 환산취득가액을 계산한다. 소득세법 시행령 §164 ⑤.
 *
 * 핵심 공식:
 *   Sum_A = landPricePerSqmAtAcquisition × landArea + buildingStdPriceAtAcquisition
 *   Sum_F = landPricePerSqmAtFirstDisclosure × landArea + buildingStdPriceAtFirstDisclosure
 *   P_A_est = Math.floor(firstDisclosureHousingPrice × Sum_A / Sum_F)
 *   totalEstAcq = Math.floor(totalTransfer × P_A_est / transferHousingPrice)
 */
export interface PreHousingDisclosureInput {
  /** 최초 고시일 (개별주택가격이 처음 고시된 날, 사용자 직접 입력) */
  firstDisclosureDate: Date;
  /** 최초 고시 개별주택가격 P_F (원) */
  firstDisclosureHousingPrice: number;
  /** 토지 면적 (㎡) — 시점별 분리 미사용 시(겸용주택 단일면적·일반 PHD) 3시점 모두 이 값 사용 */
  landArea: number;

  /**
   * 시점별 토지면적 override (선택). 겸용주택 + 보유 중 일부 용도변경 케이스에서만 사용.
   * 미제공 시 `landArea` 단일값을 3시점 모두에 적용 (backward compat).
   * 제공 시 해당 시점의 토지기준시가 산출에 우선 적용.
   */
  landAreaAtAcquisition?: number;
  landAreaAtFirstDisclosure?: number;
  landAreaAtTransfer?: number;

  /** 취득당시 토지 단위 공시지가 (원/㎡) — 자동추천 연도에서 조회 */
  landPricePerSqmAtAcquisition: number;
  /** 취득당시 건물 기준시가 (원) — 국세청 건물기준시가 */
  buildingStdPriceAtAcquisition: number;

  /** 최초공시일 토지 단위 공시지가 (원/㎡) — 자동추천 연도에서 조회 */
  landPricePerSqmAtFirstDisclosure: number;
  /** 최초공시일 건물 기준시가 (원) — 국세청 건물기준시가 */
  buildingStdPriceAtFirstDisclosure: number;

  /** 양도시 개별주택가격 P_T (원) — 양도시 현재 공시가격 */
  transferHousingPrice: number;
  /** 양도시 토지 단위 공시지가 (원/㎡) */
  landPricePerSqmAtTransfer: number;
  /** 양도시 건물 기준시가 (원) */
  buildingStdPriceAtTransfer: number;

  /**
   * Case A 4부분 안분 모드 (겸용주택 + 보유 중 일부 용도변경 + 최초공시일 < 용도변경일).
   * 취득시·최초공시 시점에 건물 전체가 주택이었지만 양도시 일부가 상가로 변경된 경우.
   *
   * 아래 commercial 4필드 + housingLandArea*·commercialLandArea* 모두 충족 시에만 4부분 안분 활성화.
   * 미입력 시 기존 단일 안분(2부분) 유지.
   */
  /** 취득시 상가건물 기준시가 (홈택스, 양도시 상가 면적 부분에 해당하는 취득 당시 가격) */
  commercialBuildingStdPriceAtAcq?: number;
  /** 최초공시일 상가건물 기준시가 (홈택스) */
  commercialBuildingStdPriceAtFirstDisclosure?: number;
  /** 양도시 상가건물 기준시가 (홈택스) */
  commercialBuildingStdPriceAtTransfer?: number;
  /** 주택부수토지 면적 (㎡) — 양도시 기준 (시점별 동일 가정 — 분필 없음) */
  housingLandArea?: number;
  /** 상가부수토지 면적 (㎡) — 양도시 기준 */
  commercialLandArea?: number;
  /** 양도시 개별주택가격이 적용되는 주택건물 부분 기준시가 (= buildingStdPriceAtTransfer 와 동일하지만 명시적 필드) */
  housingBuildingStdPriceAtTransfer?: number;
  /** 총 양도가액 (1,300,000,000) — 4부분 안분 시 사용 */
  totalTransferPriceForFourPart?: number;
  /**
   * 공유지분율 (0 < r ≤ 1, 미전달 시 1). **개산공제(소득령 §163⑥) base 축소 전용**.
   *
   * 기준시가·면적은 물건 전체(100%) 값을 유지한다 — 환산 산식에서 분자·분모로 함께 나타나 상쇄되고,
   * §166⑥ 안분 비율도 100% 스케일을 전제하기 때문이다. 호출부가 `TransferTaxInput.ownershipRatio`를
   * 그대로 내려준다(서브엔진 재판정 금지).
   *
   * 설계: docs/02-design/features/transfer-fractional-lump-sum-deduction.engine.design.md §2.1
   */
  ownershipRatio?: number;
  /**
   * 미등기양도자산 여부(소득세법 §104③) — §163⑥ 개산공제율 3/100 → **3/1000** 전환.
   * 호출부가 `TransferTaxInput.isUnregistered`를 그대로 내려준다(서브엔진 재판정 금지).
   * 율 산출은 `estimatedDeductionRate()` 단일 경유.
   */
  isUnregistered?: boolean;
}

/**
 * 개별주택가격 미공시 취득 시 환산취득가액 계산 중간/결과값
 * UI에서 단계별 산식 표시용
 */
export interface PreHousingDisclosureResult {
  /** 취득시 기준시가 합계 Sum_A = landPricePerSqm × area + buildingStd */
  sumAtAcquisition: number;
  /** 최초공시일 기준시가 합계 Sum_F = landPricePerSqm × area + buildingStd */
  sumAtFirstDisclosure: number;
  /** 양도시 기준시가 합계 Sum_T = landPricePerSqm × area + buildingStd */
  sumAtTransfer: number;

  /** 추정 취득시 개별주택가격 P_A_est = floor(P_F × Sum_A / Sum_F) */
  estimatedHousingPriceAtAcquisition: number;

  /** 취득시 토지 기준시가 (= landPricePerSqm × area) */
  landStdAtAcquisition: number;
  /** 취득시 건물 기준시가 */
  buildingStdAtAcquisition: number;
  /** 최초공시 토지 기준시가 (= landPricePerSqmAtFirstDisclosure × area) */
  landStdAtFirstDisclosure: number;
  /** 최초공시 건물 기준시가 */
  buildingStdAtFirstDisclosure: number;
  /** 양도시 토지 기준시가 (= landPricePerSqm × area) */
  landStdAtTransfer: number;
  /** 양도시 건물 기준시가 */
  buildingStdAtTransfer: number;

  /** 주택 공시가액 안분 — 취득시 토지 성분 (= floor(P_A_est × landStdAtAcq / Sum_A)) */
  landHousingAtAcquisition: number;
  /** 주택 공시가액 안분 — 취득시 건물 성분 */
  buildingHousingAtAcquisition: number;
  /** 주택 공시가액 안분 — 양도시 토지 성분 */
  landHousingAtTransfer: number;
  /** 주택 공시가액 안분 — 양도시 건물 성분 */
  buildingHousingAtTransfer: number;

  /** 안분 비율 (양도시 기준시가 비율) — 양도가액 분리 */
  transferApportionRatio: { land: number; building: number };
  /** 안분 비율 (취득시 기준시가 비율) — 취득가액·개산공제 분리 */
  acquisitionApportionRatio: { land: number; building: number };

  /** 총 환산취득가 = floor(totalTransfer × P_A_est / P_T) */
  totalEstimatedAcquisitionPrice: number;
  /** 토지 양도가액 */
  landTransferPrice: number;
  /** 건물 양도가액 */
  buildingTransferPrice: number;
  /** 토지 환산취득가 */
  landAcquisitionPrice: number;
  /** 건물 환산취득가 */
  buildingAcquisitionPrice: number;
  /** 토지 개산공제 = floor(landHousingAtAcquisition × 3%) */
  landLumpDeduction: number;
  /** 건물 개산공제 = floor(buildingHousingAtAcquisition × 3%) */
  buildingLumpDeduction: number;

  /** 입력값 echo — UI에서 산식 분해 표시용 */
  inputs: {
    /** 총 양도가액 (계약서 합계) */
    totalTransferPrice: number;
    /** 토지 면적 (㎡) — 단일면적 모드에서 3시점에 모두 적용된 값 */
    landArea: number;
    /** 시점별 면적 (겸용주택+용도변경 케이스). 단일면적 모드면 모두 landArea와 동일 */
    landAreaAtAcquisition: number;
    landAreaAtFirstDisclosure: number;
    landAreaAtTransfer: number;
    /** 취득시 토지 단위공시지가 (원/㎡) */
    landPricePerSqmAtAcquisition: number;
    /** 취득시 건물 기준시가 (원) */
    buildingStdPriceAtAcquisition: number;
    /** 최초공시일 토지 단위공시지가 (원/㎡) */
    landPricePerSqmAtFirstDisclosure: number;
    /** 최초공시일 건물 기준시가 (원) */
    buildingStdPriceAtFirstDisclosure: number;
    /** 최초 고시 개별주택가격 P_F */
    firstDisclosureHousingPrice: number;
    /** 양도시 토지 단위공시지가 (원/㎡) */
    landPricePerSqmAtTransfer: number;
    /** 양도시 건물 기준시가 (원) */
    buildingStdPriceAtTransfer: number;
    /** 양도시 개별주택가격 P_T */
    transferHousingPrice: number;
  };

  /**
   * Case A 4부분 안분 결과 (겸용주택 + 보유 중 일부 용도변경(주택→상가) + 최초공시일 < 용도변경일).
   * 입력에 commercialBuildingStdPriceAt* + housing/commercialLandArea + totalTransferPriceForFourPart 모두 충족 시 산출.
   * 미사용 시 undefined.
   *
   * 엑셀 행 매핑 — 4컬럼: D=주택분토지, E=주택건물, F=상가분토지, G=상가건물.
   */
  fourPartApportionment?: {
    /** 4부분 시점별 기준시가 (Row 41~42, 40) */
    housingLandStdAtAcq: number;             // D41 (주택부수토지 단가 × 주택부수토지면적)
    housingBuildingStdAtAcq: number;         // E41 (취득시 주택건물 기준시가)
    commercialLandStdAtAcq: number;          // F41 (상가부수토지 단가 × 상가부수토지면적)
    commercialBuildingStdAtAcq: number;      // G41 (취득시 상가건물 기준시가)
    housingLandStdAtFirst: number;           // D42
    housingBuildingStdAtFirst: number;       // E42
    commercialLandStdAtFirst: number;        // F42
    commercialBuildingStdAtFirst: number;    // G42
    housingLandStdAtTransfer: number;        // D40
    housingBuildingStdAtTransfer: number;    // E40
    commercialLandStdAtTransfer: number;     // F40
    commercialBuildingStdAtTransfer: number; // G40

    /** 4부분 합산기준시가 (각 시점별) */
    sumAtAcq4: number;       // C41 = D41+E41+F41+G41
    sumAtFirst4: number;     // C42
    sumAtTransfer4: number;  // C40

    /** 양도시 주택공시가 안분 — 토지(D34)/건물(E34). 상가는 F40/G40 그대로 사용 (F34=F40, G34=G40) */
    housingLandStdShare: number;     // D34 = INT(P_T × D40 / (D40+E40))
    housingBuildingStdShare: number; // E34 = P_T - D34
    sumAtTransferShare: number;      // H34 = D34 + E34 + F40 + G40

    /** 양도가액 4부분 안분 (Row 10) */
    housingLandTransferPrice: number;        // D10
    housingBuildingTransferPrice: number;    // E10
    commercialLandTransferPrice: number;     // F10
    commercialBuildingTransferPrice: number; // G10

    /** 환산취득가액 합계 (C11) + 4부분 (Row 11). 4부분은 INT 미적용 (Excel 원본 그대로 — 양도차익 계산에 소수 사용) */
    totalEstAcq: number;                  // C11 = INT(C10 × C35 / H34)
    housingLandAcqPrice: number;          // D11 (소수 포함)
    housingBuildingAcqPrice: number;      // E11 (소수)
    commercialLandAcqPrice: number;       // F11 (소수)
    commercialBuildingAcqPrice: number;   // G11 (소수, C11-D11-E11-F11)

    /** 개산공제 4부분 (Row 12) — 취득시 안분 성분 × 3%, 각 INT */
    housingLandLumpDed: number;        // D12 = INT(D35 × 3%)
    housingBuildingLumpDed: number;    // E12 = INT(E35 × 3%)
    commercialLandLumpDed: number;     // F12 = INT(F35 × 3%)
    commercialBuildingLumpDed: number; // G12 = INT(G35 × 3%)

    /** 취득시 4부분 P_A_est 안분 (Row 35) — 개산공제 base */
    housingLandAcqShare: number;        // D35 = INT(P_A_est × D41/C41)
    housingBuildingAcqShare: number;    // E35
    commercialLandAcqShare: number;     // F35
    commercialBuildingAcqShare: number; // G35 (= P_A_est - D35-E35-F35)

    /** 양도차익 4부분 (Row 13) = 양도가액 - 환산취득가 - 개산공제 */
    housingLandGain: number;        // D13
    housingBuildingGain: number;    // E13
    commercialLandGain: number;     // F13
    commercialBuildingGain: number; // G13

    /** 주택부분 합계 (D+E) */
    housingTransferPriceSum: number;
    housingAcqPriceSum: number;
    housingLumpDedSum: number;
    housingGainSum: number;

    /** 상가부분 합계 (F+G) */
    commercialTransferPriceSum: number;
    commercialAcqPriceSum: number;
    commercialLumpDedSum: number;
    commercialGainSum: number;
  };
}
