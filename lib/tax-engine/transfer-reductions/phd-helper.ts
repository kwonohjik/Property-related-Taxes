/**
 * 감면 조문용 PHD 환산 공통 헬퍼 (Round 10, 2026-05-06)
 *
 * 신축주택은 본질적으로 준공 후 1~2년 후 공시가격이 공시되므로,
 * 모든 신축주택 취득 당시에는 공시가격이 없음.
 * 5년간 발생분 차감 안분 산식을 적용하는 8개 조문에서 "취득시 기준시가"가 필수이므로
 * 소득세법 시행령 §164⑤(개별주택가격 미공시 취득 환산) 산식으로 환산.
 *
 * 대상 조문 (5년 안분 산식):
 *   §99·§99의3·§98의3·§98의5·§98의6·§98의7·§98의8·§99의2 (8개)
 *
 * 본 헬퍼는 기존 `transfer-tax-pre-housing-disclosure.ts`의 풀 PHD 엔진을 단순화한 wrapper.
 * 풀 엔진은 양도가액 안분·개산공제 등 종합 산출이 필요한 반면, 감면 조문용은
 * "취득시 추정 공동주택가격" (P_A_est)만 필요.
 *
 * 산식 (§164⑤):
 *   P_A_est = floor(P_F × Sum_A / Sum_F)
 *   Sum_A = 취득시 토지(공시지가/㎡ × 면적) + 취득시 건물 기준시가
 *   Sum_F = 최초공시 토지(공시지가/㎡ × 면적) + 최초공시 건물 기준시가
 *
 * 사용자 PDF 사례 26 (양도코리아 프로그램 재현):
 *   취득(2003.9.23) < 최초공시(2004.4.30) → PHD 환산 필요
 *   P_F = 540,000,000 / Sum_A · Sum_F는 토지·건물 시점별 기준시가 합계
 *   결과 X(취득시 기준시가) ≈ 547M (역산값) → §99의3 5년 안분 비율 0.4334 도출
 */

/**
 * PHD 환산 입력 (감면 조문용 단순화 7개 필드)
 */
export interface ReductionPhdInput {
  /** 최초공시 공동주택가격/개별주택가격 (원) */
  firstDisclosurePrice: number;
  /** 토지면적 (㎡) — 취득시·최초공시 동일 가정 (감면 조문은 시점별 면적 분리 미사용) */
  landAreaSqm: number;
  /** 취득시 토지 공시지가 (원/㎡) */
  landPricePerSqmAtAcquisition: number;
  /** 최초공시시 토지 공시지가 (원/㎡) */
  landPricePerSqmAtFirstDisclosure: number;
  /**
   * 취득시 건물 기준시가 (원, 총액).
   * 0/미입력 시 토지만으로 환산 (단독주택·토지만 가정).
   */
  buildingStdPriceAtAcquisition?: number;
  /**
   * 최초공시시 건물 기준시가 (원, 총액).
   * 0/미입력 시 취득시와 동일 가정 (간이 환산).
   */
  buildingStdPriceAtFirstDisclosure?: number;
}

/**
 * PHD 환산 결과 (감면 조문용 단순화)
 */
export interface ReductionPhdResult {
  /** 취득시 추정 공동주택가격 = P_A_est (원, 정수) */
  estimatedAcquisitionStdPrice: number;
  /** 취득시 토지 기준시가 합계 (원) */
  sumAtAcquisition: number;
  /** 최초공시시 토지 기준시가 합계 (원) */
  sumAtFirstDisclosure: number;
  /** 환산 비율 = Sum_A / Sum_F */
  ratio: number;
  /** 산식 단계 (UI 표시용) */
  formulaSteps: Array<{ label: string; value: number; formula?: string }>;
}

/**
 * 감면 조문용 PHD 환산 — 취득시 추정 공동주택가격 산출.
 *
 * @example
 * const r = calcReductionAcquisitionStdPrice({
 *   firstDisclosurePrice: 540_000_000,
 *   landAreaSqm: 16.36,
 *   landPricePerSqmAtAcquisition: 1_640_000,    // 2003 공시지가
 *   landPricePerSqmAtFirstDisclosure: 1_810_000, // 2004 공시지가
 *   buildingStdPriceAtAcquisition: ...,
 *   buildingStdPriceAtFirstDisclosure: ...,
 * });
 * // r.estimatedAcquisitionStdPrice ≈ 547M (PDF 사례 26 역산값)
 */
export function calcReductionAcquisitionStdPrice(
  input: ReductionPhdInput,
): ReductionPhdResult {
  const {
    firstDisclosurePrice,
    landAreaSqm,
    landPricePerSqmAtAcquisition,
    landPricePerSqmAtFirstDisclosure,
    buildingStdPriceAtAcquisition = 0,
    buildingStdPriceAtFirstDisclosure = 0,
  } = input;

  // 토지 기준시가 = 공시지가 × 면적
  const landStdAtAcquisition = Math.floor(landPricePerSqmAtAcquisition * landAreaSqm);
  const landStdAtFirstDisclosure = Math.floor(landPricePerSqmAtFirstDisclosure * landAreaSqm);

  // 건물 fallback: 최초공시 미입력 시 취득시와 동일 가정 (간이)
  const buildingAtFirst = buildingStdPriceAtFirstDisclosure > 0
    ? buildingStdPriceAtFirstDisclosure
    : buildingStdPriceAtAcquisition;

  const sumAtAcquisition = landStdAtAcquisition + buildingStdPriceAtAcquisition;
  const sumAtFirstDisclosure = landStdAtFirstDisclosure + buildingAtFirst;

  // P_A_est 산출 (§164⑤)
  const ratio = sumAtFirstDisclosure > 0 ? sumAtAcquisition / sumAtFirstDisclosure : 0;
  const estimatedAcquisitionStdPrice = sumAtFirstDisclosure > 0
    ? Math.floor(firstDisclosurePrice * sumAtAcquisition / sumAtFirstDisclosure)
    : 0;

  const formulaSteps: ReductionPhdResult["formulaSteps"] = [
    {
      label: "취득시 토지 기준시가",
      value: landStdAtAcquisition,
      formula: `공시지가 ${landPricePerSqmAtAcquisition.toLocaleString()}/㎡ × 면적 ${landAreaSqm}㎡ = ${landStdAtAcquisition.toLocaleString()}`,
    },
    {
      label: "최초공시 토지 기준시가",
      value: landStdAtFirstDisclosure,
      formula: `공시지가 ${landPricePerSqmAtFirstDisclosure.toLocaleString()}/㎡ × 면적 ${landAreaSqm}㎡ = ${landStdAtFirstDisclosure.toLocaleString()}`,
    },
    {
      label: "취득시 합계 (Sum_A)",
      value: sumAtAcquisition,
      formula: `토지 ${landStdAtAcquisition.toLocaleString()} + 건물 ${buildingStdPriceAtAcquisition.toLocaleString()}`,
    },
    {
      label: "최초공시 합계 (Sum_F)",
      value: sumAtFirstDisclosure,
      formula: `토지 ${landStdAtFirstDisclosure.toLocaleString()} + 건물 ${buildingAtFirst.toLocaleString()}`,
    },
    {
      label: "환산 비율 (Sum_A / Sum_F)",
      value: ratio,
      formula: `${sumAtAcquisition.toLocaleString()} / ${sumAtFirstDisclosure.toLocaleString()} = ${(ratio * 100).toFixed(4)}%`,
    },
    {
      label: "취득시 추정 공동주택가격 (P_A_est)",
      value: estimatedAcquisitionStdPrice,
      formula: `최초공시 ${firstDisclosurePrice.toLocaleString()} × ${(ratio * 100).toFixed(4)}% = ${estimatedAcquisitionStdPrice.toLocaleString()}`,
    },
  ];

  return {
    estimatedAcquisitionStdPrice,
    sumAtAcquisition,
    sumAtFirstDisclosure,
    ratio,
    formulaSteps,
  };
}

/**
 * 입력 유효성 검사 — 환산이 가능한 최소 데이터가 있는지.
 * 취득시 양도일이 최초공시일 이전 + 토지 정보 있음 → 환산 가능.
 */
export function canCalcReductionPhd(input: Partial<ReductionPhdInput>): boolean {
  return !!(
    input.firstDisclosurePrice && input.firstDisclosurePrice > 0 &&
    input.landAreaSqm && input.landAreaSqm > 0 &&
    input.landPricePerSqmAtAcquisition && input.landPricePerSqmAtAcquisition > 0 &&
    input.landPricePerSqmAtFirstDisclosure && input.landPricePerSqmAtFirstDisclosure > 0
  );
}
