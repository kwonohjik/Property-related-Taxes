/**
 * house-count-divergence.ts — ① 세대 보유 주택 수 ↔ ④ 다른 보유 주택 목록 정합성 (표시 전용)
 *
 * 다주택 중과 판정은 ④ `houses[]`가 채워지면 목록 기준(effectiveHouseCount)으로 산정되고
 * ① `householdHousingCount`는 무시된다(폴백 전용). 둘 사이 정합성 검증이 없어
 * "① 5채 선언 + ④ 3채만 입력" 같은 누락이 조용히 넘어간다(silent divergence).
 *
 * 이 순수 함수는 **구조적 개수만** 비교한다 — §167의3 배제규칙은 엔진 전용이라
 * UI에서 재계산하지 않는다(single-source, feedback_ui_engine_dual_truth_avoidance).
 *
 * 계획: docs/02-design/features/transfer-surcharge-house-count-divergence.plan.md
 */

/** computeHouseCountDivergence 입력 — TransferFormData가 구조적으로 satisfy (F4: 테스트 경량화). */
export interface HouseCountDivergenceInput {
  /** 양도 대표 자산 종류 (form.assets[0].assetKind). "housing"일 때만 게이트 통과 */
  primaryKind: string;
  /** ① 세대 보유 "주택" 수 (정확 숫자 문자열) */
  householdHousingCount: string;
  /** ④ 다른 보유 주택 목록 */
  houses: { acquisitionDate?: string }[];
  /** ④ 분양권·입주권 목록 (구조 카운트 미포함 — populated 게이트에만 사용) */
  presaleRights: unknown[];
}

export interface HouseCountDivergenceResult {
  /** C-1 우선순위 안내 노출 (주택 양도 && ④ 채워짐) */
  showPrecedence: boolean;
  /** C-2 개수 불일치 힌트 노출 (위 && declared ≠ structuralCount) */
  showMismatch: boolean;
  /** ① 선언 주택 수 (정확값) */
  declared: number;
  /** ④ 기준 구조적 주택 수 = 1(양도주택) + 취득일 있는 다른 주택 수 (분양권 제외) */
  structuralCount: number;
}

/**
 * ① 선언 세대 주택 수와 ④ 목록의 구조적 주택 수를 대조한다.
 *
 * - **F1 게이트**: `primaryKind === "housing"`일 때만 노출. 입주권·분양권 양도 시
 *   `householdHousingCount`는 "주택 수"(양도 권리 미포함)라 의미 축이 어긋나 false mismatch가 난다.
 * - **F7 분양권 제외**: ①은 "주택"만 센다. 분양권은 ④ 별도 집계이고 pre-2021·3억↓는 엔진 미산입이라
 *   structuralCount에 더하면 이중 오탐 → 주택 행만 카운트(분양권은 populated 게이트에만 반영).
 */
export function computeHouseCountDivergence(
  input: HouseCountDivergenceInput,
): HouseCountDivergenceResult {
  const isHouseSale = input.primaryKind === "housing"; // F1 게이트
  const populated = input.houses.length > 0 || input.presaleRights.length > 0; // C-1: 분양권만 입력해도 노출
  const declared = parseInt(input.householdHousingCount || "1", 10); // store default "1"과 일치
  const structuralCount =
    1 + input.houses.filter((h) => h.acquisitionDate).length; // F7: 주택만(양도주택 +1). 분양권 제외
  return {
    showPrecedence: isHouseSale && populated,
    showMismatch: isHouseSale && populated && structuralCount !== declared,
    declared,
    structuralCount,
  };
}
