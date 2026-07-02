/**
 * #3 공익수용 토지 환산취득가액 — 양도시 기준시가 min[] 특례 (소득세법 집행기준 99-164-12)
 *
 * 수용(양도) 2009.02.04 이후 + 취득가 불명(환산) 토지: 환산 분모(양도시 기준시가)를
 * min[공시지가 ㎡당, 보상 ㎡당가액, 보상산정 기초 기준시가] × 면적 으로 낮춘다(취득가액↑·차익↓).
 *
 * 순수 함수 — 게이트 미충족 시 null(현행 총액 유지, 회귀0).
 * 설계: docs/02-design/features/transfer-public-expropriation-unified.engine.design.md §4
 */

/** #3 산출근거 — Map 금지(JSON 소실), Record로 노출 */
export interface ExpropriationValuationDetail {
  /** 원/㎡ 3후보 */
  perSqmCandidates: { standard: number; compensation: number; basis: number };
  /** 적용값 = min(3) */
  chosenPerSqm: number;
  /** 양도 면적 (㎡) */
  area: number;
  /** 환산 분모(총액) = chosenPerSqm × area (floor) */
  denominator: number;
}

export interface ExpropriationValuationParams {
  useEstimatedAcquisition?: boolean;
  transferCause?: "general" | "public_expropriation";
  transferDate: Date;
  /** 양도시 기준시가 (원/㎡) */
  standardPricePerSqmAtTransfer?: number;
  /** 양도 면적 (㎡) */
  transferArea?: number;
  /** 보상가액 (원/㎡) */
  compensationPerSqm?: number;
  /** 보상산정 기초 기준시가 (원/㎡) */
  compensationBasisStdPrice?: number;
}

/** 2009.02.04 — 집행기준 99-164-12 시행 기준일 (수용=양도 시점) */
const MIN_TRANSFER_DATE = new Date("2009-02-04");

export function applyExpropriationValuation(
  p: ExpropriationValuationParams,
): { denominator: number; detail: ExpropriationValuationDetail } | null {
  const perSqm = p.standardPricePerSqmAtTransfer ?? 0;
  const comp = p.compensationPerSqm ?? 0;
  const basis = p.compensationBasisStdPrice ?? 0;
  const area = p.transferArea ?? 0;

  // 게이트 (4조건 AND) — 미충족 시 null(현행 총액 유지)
  if (
    !p.useEstimatedAcquisition ||
    p.transferCause !== "public_expropriation" ||
    p.transferDate < MIN_TRANSFER_DATE ||
    perSqm <= 0 ||
    comp <= 0 ||
    basis <= 0 ||
    area <= 0
  ) {
    return null;
  }

  const chosenPerSqm = Math.min(perSqm, comp, basis);
  // 면적 반올림 UI 일치(feedback_area_rounding_consistency) 후 곱, floor
  const area2 = parseFloat(area.toFixed(2));
  const denominator = Math.floor(chosenPerSqm * area2);

  return {
    denominator,
    detail: {
      perSqmCandidates: { standard: perSqm, compensation: comp, basis },
      chosenPerSqm,
      area: area2,
      denominator,
    },
  };
}
