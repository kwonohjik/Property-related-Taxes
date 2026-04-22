/**
 * 8년 이상 자경농지 양도소득세 감면 Pure Engine
 *
 * 조특법 §69 기본 감면 로직과 조특령 §66 ⑤⑥의 편입일 부분감면을 담당한다.
 *   - 편입 없음: 전체 양도소득금액이 감면 대상 (기존 transfer-tax-rate-calc의 단순 로직과 동치)
 *   - 2002.1.1 이후 주거/상업/공업지역 편입: 편입일까지의 양도소득(기준시가 증가분 비율)만 감면 대상
 *   - 편입일로부터 3년 경과 후 양도: 감면 상실
 *
 * 감면세액 자체(산출세액 × 감면대상소득/과세표준, 1억원 한도)는 호출 측에서
 * 본 함수가 반환한 `reducibleIncome`을 이용해 재계산한다.
 *
 * Layer 2 원칙: DB 직접 호출 없음. 순수 함수.
 *
 * 근거 조문:
 *   - 조특법 §69 — 자경농지에 대한 양도소득세 감면
 *   - 조특령 §66 ⑤ — 주거·상업·공업지역 편입 시 편입일까지의 소득만 감면
 *   - 조특령 §66 ⑥ — 편입일 이후 3년 내 양도 요건
 *   - 조특법 §133 — 감면 종합한도 (1년 1억원)
 */

import { addYears } from "date-fns";
import { TRANSFER } from "./legal-codes";

export interface SelfFarmingReductionInput {
  /**
   * 장기보유특별공제 후 양도소득금액 (원).
   * 합산 재계산의 분자 기준값. 음수·0일 경우 감면대상 0 처리.
   */
  transferIncome: number;
  /** 본인 자경기간 (년). 조특법 §69 요건(기본 8년) 미충족 시 상속 합산 경로 고려. */
  farmingYears: number;
  /** 피상속인 경작기간 (년) — 조특령 §66 ⑪ 1호 합산용. 선택. */
  decedentFarmingYears?: number;
  /** 요건 충족 최소 자경기간 (보통 8년) — rate-table의 selfFarmingRules.conditions.minFarmingYears */
  minFarmingYears: number;
  /** 취득일 */
  acquisitionDate: Date;
  /** 양도일 */
  transferDate: Date;
  // ─── 편입일 부분감면 (조특령 §66 ⑤⑥) ─────────────────
  /** 주거·상업·공업지역 편입일. 미제공 시 전액 감면 경로. */
  incorporationDate?: Date;
  /** 편입 지역 유형 — 현재 판정은 하지 않고 표시만. (시행령상 주거/상업/공업 3종) */
  incorporationZoneType?: "residential" | "commercial" | "industrial";
  /**
   * 취득 당시 기준시가 (원).
   * 총액 또는 ㎡당 단가 모두 허용되지만 **편입·양도시 값과 동일 단위**여야 한다.
   * 분자·분모를 함께 곱셈하므로 단위 상쇄.
   */
  standardPriceAtAcquisition?: number;
  /** 편입일 당시 기준시가 (원, 취득·양도와 동일 단위) */
  standardPriceAtIncorporation?: number;
  /** 양도 당시 기준시가 (원, 취득·편입과 동일 단위) */
  standardPriceAtTransfer?: number;
}

export interface SelfFarmingReductionResult {
  /** 감면 자격 충족 여부 (자경기간 미달이거나 3년 경과 시 false) */
  qualifies: boolean;
  /**
   * 감면대상 양도소득금액 (원).
   * 합산 재계산에서 `safeMultiplyThenDivide(calculatedTax, reducibleIncome, taxBase)`의 분자.
   */
  reducibleIncome: number;
  /** 감면비율 (0~1). 편입 없으면 1.0, 편입 부분감면이면 기준시가 증가분 비율. */
  reducibleRatio: number;
  /** 감면 불가분 양도소득금액 (= transferIncome - reducibleIncome) */
  nonReducibleIncome: number;
  /** 편입일 부분감면 발동 여부 */
  partialReductionApplied: boolean;
  /** 편입일로부터 3년 경과 후 양도로 감면 상실된 경우 true */
  incorporationGraceExpired: boolean;
  /** 법적 근거 조문 */
  legalBasis: string;
  /** 산식·판단 설명 (UI 표시·디버깅용) */
  breakdown: string[];
}

/**
 * 조특법 §69 + 시행령 §66 기반 감면대상 양도소득금액 산정.
 *
 * @param input - 양도소득금액·자경기간·편입일·기준시가 3점값
 * @returns 감면 자격·비율·감면대상소득·설명 텍스트
 *
 * 공식:
 *   if !incorporationDate || incorporationDate < 2002-01-01:
 *     reducibleIncome = transferIncome  (전액 감면 경로)
 *   elif transferDate > incorporationDate + 3년:
 *     qualifies = false, reducibleIncome = 0  (감면 상실)
 *   else:
 *     ratio = (편입시 기준시가 - 취득시 기준시가) / (양도시 기준시가 - 취득시 기준시가)
 *     reducibleIncome = transferIncome × ratio
 */
export function calculateSelfFarmingReduction(
  input: SelfFarmingReductionInput,
): SelfFarmingReductionResult {
  const breakdown: string[] = [];

  const effectiveFarmingYears =
    input.farmingYears + (input.decedentFarmingYears ?? 0);
  const meetsFarmingRequirement = effectiveFarmingYears >= input.minFarmingYears;

  if (!meetsFarmingRequirement) {
    return {
      qualifies: false,
      reducibleIncome: 0,
      reducibleRatio: 0,
      nonReducibleIncome: Math.max(0, input.transferIncome),
      partialReductionApplied: false,
      incorporationGraceExpired: false,
      legalBasis: TRANSFER.REDUCTION_SELF_FARMING,
      breakdown: [
        `자경기간 ${input.farmingYears}년` +
          (input.decedentFarmingYears
            ? ` + 피상속인 ${input.decedentFarmingYears}년 = 합계 ${effectiveFarmingYears}년`
            : "") +
          ` < 요건 ${input.minFarmingYears}년 → 감면 불가`,
      ],
    };
  }

  const transferIncome = Math.max(0, input.transferIncome);

  // 2002.1.1 기준선 — 그 이전 편입은 기존 전액감면 경로 (조특령 §66 부칙)
  const POLICY_START = new Date("2002-01-01");

  // 편입일 미제공 또는 2002.1.1 이전 편입: 전액 감면
  if (!input.incorporationDate || input.incorporationDate < POLICY_START) {
    breakdown.push(
      input.incorporationDate
        ? `편입일(${input.incorporationDate.toISOString().slice(0, 10)})이 2002-01-01 이전 → 부분감면 규정 미적용, 전액 감면`
        : "편입일 없음 → 편입 미발생, 전액 감면",
    );
    return {
      qualifies: true,
      reducibleIncome: transferIncome,
      reducibleRatio: 1,
      nonReducibleIncome: 0,
      partialReductionApplied: false,
      incorporationGraceExpired: false,
      legalBasis: TRANSFER.REDUCTION_SELF_FARMING,
      breakdown,
    };
  }

  // 편입일부터 3년 경과 후 양도 → 감면 상실 (조특령 §66 ⑥)
  const graceDeadline = addYears(input.incorporationDate, 3);
  if (input.transferDate > graceDeadline) {
    breakdown.push(
      `편입일 ${input.incorporationDate.toISOString().slice(0, 10)}부터 3년 경과일(${graceDeadline
        .toISOString()
        .slice(0, 10)}) 이후 양도 → 감면 상실 (조특령 §66 ⑥)`,
    );
    return {
      qualifies: false,
      reducibleIncome: 0,
      reducibleRatio: 0,
      nonReducibleIncome: transferIncome,
      partialReductionApplied: false,
      incorporationGraceExpired: true,
      legalBasis: `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`,
      breakdown,
    };
  }

  // 편입일 부분감면 — 기준시가 3점값 필요
  const stdAcq = input.standardPriceAtAcquisition ?? 0;
  const stdIncorp = input.standardPriceAtIncorporation ?? 0;
  const stdTransfer = input.standardPriceAtTransfer ?? 0;

  if (stdAcq <= 0 || stdIncorp <= 0 || stdTransfer <= 0) {
    // 기준시가 3점 중 하나라도 누락이면 재현 불가 — 보수적으로 감면 없음 처리 + 경고
    breakdown.push(
      "기준시가 3점값(취득·편입·양도) 중 누락 — 편입일 부분감면 비율 산정 불가. 전체 감면 0 처리.",
    );
    return {
      qualifies: false,
      reducibleIncome: 0,
      reducibleRatio: 0,
      nonReducibleIncome: transferIncome,
      partialReductionApplied: true,
      incorporationGraceExpired: false,
      legalBasis: `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`,
      breakdown,
    };
  }

  const denom = stdTransfer - stdAcq;
  if (denom <= 0) {
    // 양도시 기준시가 ≤ 취득시 기준시가 (기준시가 하락) → 감면대상 비율 0 처리 (가치 증가 없음)
    breakdown.push(
      `양도시 기준시가(${stdTransfer.toLocaleString()}) ≤ 취득시 기준시가(${stdAcq.toLocaleString()}) → 감면대상 비율 0`,
    );
    return {
      qualifies: true,
      reducibleIncome: 0,
      reducibleRatio: 0,
      nonReducibleIncome: transferIncome,
      partialReductionApplied: true,
      incorporationGraceExpired: false,
      legalBasis: `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`,
      breakdown,
    };
  }

  const numerator = Math.max(0, stdIncorp - stdAcq);
  const rawRatio = numerator / denom;
  // 기준시가 하락 후 회복 등 예외적 상황에서 비율 > 1이 되는 경우 1로 capping
  const ratio = Math.min(1, Math.max(0, rawRatio));

  // 감면대상 소득 (원 단위 절사)
  const reducibleIncome = Math.floor(transferIncome * ratio);
  const nonReducibleIncome = transferIncome - reducibleIncome;

  breakdown.push(
    `편입일까지 비율 = (편입기준시가 ${stdIncorp.toLocaleString()} - 취득기준시가 ${stdAcq.toLocaleString()}) / (양도기준시가 ${stdTransfer.toLocaleString()} - 취득기준시가 ${stdAcq.toLocaleString()})`,
    `감면비율 = ${numerator.toLocaleString()} / ${denom.toLocaleString()} = ${(ratio * 100).toFixed(4)}%`,
    `감면대상 양도소득금액 = ${transferIncome.toLocaleString()} × ${(ratio * 100).toFixed(4)}% = ${reducibleIncome.toLocaleString()}원`,
  );

  return {
    qualifies: true,
    reducibleIncome,
    reducibleRatio: ratio,
    nonReducibleIncome,
    partialReductionApplied: true,
    incorporationGraceExpired: false,
    legalBasis: `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`,
    breakdown,
  };
}
