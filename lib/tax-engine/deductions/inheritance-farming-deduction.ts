/**
 * 영농상속공제 자격 평가 + 공제 계산 (§18의3 + 시행령 §16)
 *
 * 원본: inheritance-deductions.ts에서 800줄 정책에 따라 분리 (2026-05-31).
 * 모든 export는 inheritance-deductions.ts가 re-export하므로 외부 import 경로 무변경.
 */

import { INH } from "../legal-codes";
import type {
  CalculationStep,
  EstateItem,
} from "../types/inheritance-gift.types";
import type {
  FarmingDeductionDetail,
  FarmingEligibilityResult,
  FarmingHeirAssessment,
  FarmingInheritanceInput,
} from "../types/inheritance-farming.types";
import { FARMING_MAX } from "../types/inheritance-farming.types";
import { checkFarmingResidenceCompliance } from "@/lib/calc/farming-residence-check";
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";

// ============================================================
// 영농 자격 평가
// ============================================================

/**
 * 영농상속공제 자격 평가 (§18의3 + 시행령 §16).
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - §16②(피상속인 8년 종사·거주), §16③(상속인 2년·18세·후계자),
 *     §16⑭(영농 부정), §18의3⑥(조세포탈)
 *
 * 평가 순서:
 *   1. §18의3⑥ 조세포탈 → early return (다른 사유 평가 차단)
 *   2. §16⑭ 영농 부정 (피상속인·상속인·후계자 모두 적용)
 *   3. 피상속인 요건 (personal §16②1호 / corporate §16②2호)
 *   4. 후계자 트랙(isDesignatedSuccessor=true) → 18세·2년·거주 면제 후 return
 *   5. 상속인 요건 §16③ (개인/법인 분기)
 */
export function evaluateFarmingEligibility(
  input: FarmingInheritanceInput,
): FarmingEligibilityResult {
  const reasons: string[] = [];

  // 1. §18의3⑥ 조세포탈·회계부정 — 우선 배제 (단독 사유로 종결)
  if (input.hasTaxFraudConviction) {
    reasons.push("§18의3⑥ — 조세포탈·회계부정 형 확정 (공제 배제)");
    return { eligible: false, reasons };
  }

  // 1-b. §16② 단서 — 영농상속 후 최대주주 사망 상속 (corporate 전용, F-9 2026-05-21)
  // KoreanLaw MCP 검증: 시행령 §16② 단서 — "제2호에 해당하는 경우로서 영농상속이 이루어진 후에
  // 영농상속 당시 최대주주등에 해당하는 사람(영농상속을 받은 상속인은 제외한다)의 사망으로 상속이
  // 개시되는 경우는 적용하지 아니한다."
  if (
    input.type === "corporate" &&
    input.isSecondaryAfterFarmingInheritance === true
  ) {
    reasons.push(
      "§16② 단서 — 영농상속 후 최대주주 사망에 의한 상속 (적용 배제)",
    );
    return { eligible: false, reasons };
  }

  // 2. §16⑭ 영농 부정 — 피상속인·상속인·후계자 모두 적용
  if (input.hasDisqualifyingIncome) {
    reasons.push(
      "§16⑭ — 사업소득+총급여 3,700만 이상 과세기간 존재 (직접 종사 부정)",
    );
  }

  // 3. 피상속인 요건 §16②
  if (input.type === "personal") {
    if (!input.decedentEightYearFarming) {
      reasons.push("§16②1호가 — 피상속인 8년 직접 영농 종사 미충족");
    }
    if (!input.decedentResidenceMet) {
      reasons.push("§16②1호나 — 피상속인 거주지 미충족");
    }
  } else {
    if (!input.decedentCorporateMet) {
      reasons.push("§16②2호 — 피상속인 법인 8년 경영 + 최대주주 50%+ 미충족");
    }
  }

  // 4. 후계자 트랙 — 18세·2년·거주 요건 면제
  if (input.isDesignatedSuccessor === true) {
    return { eligible: reasons.length === 0, reasons };
  }

  // 5. 상속인 요건 §16③
  if (!input.heirIsAdult) {
    reasons.push("§16③ — 상속인 18세 이상 미충족");
  }
  const skip2Year = input.decedentEarlyDeath === true;
  if (!skip2Year && !input.heirTwoYearFarming) {
    reasons.push(
      input.type === "personal"
        ? "§16③1호가 — 상속인 2년 직접 영농 종사 미충족 (피상속인 65세 미만 사망 시 면제)"
        : "§16③2호가 — 상속인 2년 법인 종사 미충족",
    );
  }
  if (input.type === "personal" && !input.heirResidenceMet) {
    reasons.push("§16③1호나 — 상속인 거주지 미충족");
  }
  if (input.type === "corporate" && !input.heirCorporateOfficer) {
    reasons.push(
      "§16③2호나 — 상속인 신고기한 내 임원 + 2년 내 대표이사 미충족",
    );
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * 상속인별 자격 평가 (부록 A, FH-1~6, 2026-05-22).
 *
 * 법령 근거 (KoreanLaw MCP 검증 `20f75e2`):
 *   - §16③ "상속인이 ... 요건을 충족하는 경우" — 상속인 단위 평가
 *   - §16⑭ "피상속인 또는 상속인" — 상속인별 결격소득 분리
 *
 * 흐름:
 *   1. 폼-수준 사유 (피상속인 8년·거주·법인 + §18의3⑥ + §16② 단서 + 피상속인 §16⑭) 전체 평가
 *      → 미충족이면 해당 heir 자동 미충족 (전체 자격 영향)
 *   2. 폼-수준 충족이면 heir-수준 사유 (18세·2년·거주·임원·후계자 트랙·결격소득) 평가
 *
 * @param input    폼-수준 FarmingInheritanceInput
 * @param assessment 상속인별 평가 (heirAssessments 항목)
 */
export function evaluateFarmingEligibilityForHeir(
  input: FarmingInheritanceInput,
  assessment: FarmingHeirAssessment,
): FarmingEligibilityResult {
  // 폼-수준 사유 (피상속인 + §18의3⑥ + §16② 단서)를 동일 적용
  // — heir.hasDisqualifyingIncome로 §16⑭ 평가 분리 (input.hasDisqualifyingIncome은 무시)
  // — heir.isDesignatedSuccessor·heir.heirIsAdult·heirTwoYearFarming·heirResidenceMet·heirCorporateOfficer로 §16③ 평가 분리
  const heirInput: FarmingInheritanceInput = {
    ...input,
    hasDisqualifyingIncome: assessment.hasDisqualifyingIncome,
    heirIsAdult: assessment.heirIsAdult,
    heirTwoYearFarming: assessment.heirTwoYearFarming,
    heirResidenceMet: assessment.heirResidenceMet,
    heirCorporateOfficer: assessment.heirCorporateOfficer,
    isDesignatedSuccessor: assessment.isDesignatedSuccessor,
  };
  return evaluateFarmingEligibility(heirInput);
}

/**
 * heirAssessments 입력 시 자격 충족 상속인 ID 자동 도출 (부록 A, FH-1~6).
 *
 * @returns 자격 충족 상속인 ID 목록.
 *   - heirAssessments 미입력 시 undefined 반환 (legacy 폼-수준 평가 사용 신호)
 *   - 폼-수준 사유(피상속인 등) 미충족 시 [] 반환 (모든 heir 미충족)
 *   - 그 외 각 heir 평가 → eligible=true만 합산
 */
export function deriveQualifiedHeirIds(
  input: FarmingInheritanceInput,
): string[] | undefined {
  const assessments = input.heirAssessments;
  if (assessments === undefined) return undefined;
  return assessments
    .filter((a) => evaluateFarmingEligibilityForHeir(input, a).eligible)
    .map((a) => a.heirId);
}

/**
 * 영농상속재산가액 산정에 실제 적용할 자격자 ID 목록 (PR5 — 명시 override 우선).
 *
 * 우선순위 (시행령 §16⑤ 본문 — 제3항 요건 갖춘 상속인이 받는 가액):
 *   1. heirAssessments 미입력(부록 A 미사용) → 폼-수준 명시 qualifiedHeirIds 그대로 (legacy)
 *   2. heirAssessments 입력 + qualifiedHeirIds 명시값 존재 → **명시값 우선(override)**
 *      (사용자가 자동도출과 다르게 지정 — §16③ 요건과 다를 수 있으므로 UI 경고 배지)
 *   3. heirAssessments 입력 + qualifiedHeirIds 미입력 → deriveQualifiedHeirIds(자동도출)
 */
export function resolveEffectiveQualifiedHeirIds(
  input: FarmingInheritanceInput,
): string[] | undefined {
  if (input.heirAssessments === undefined) return input.qualifiedHeirIds;
  if (input.qualifiedHeirIds !== undefined) return input.qualifiedHeirIds;
  return deriveQualifiedHeirIds(input);
}

// ============================================================
// 영농상속공제 계산
// ============================================================

/**
 * 영농상속공제 (§18의3)
 * 농지·초지·산림지·어선·어업권·농업용 건축물·염전 + 법인 영농 주식, 최대 30억 (§18의3①)
 *
 * farming 미입력 시 legacy 호환 (evaluated=false, eligible=true 가정).
 */
export function calcFarmingDeduction(
  farmingAssetValue: number,
  farming?: FarmingInheritanceInput,
  estateItems?: EstateItem[],
): {
  deduction: number;
  breakdown: CalculationStep[];
  detail: FarmingDeductionDetail;
} {
  const evalResult: FarmingEligibilityResult = farming
    ? evaluateFarmingEligibility(farming)
    : { eligible: true, reasons: [] };
  const evaluated = farming !== undefined;
  const safeAssetValue = Math.max(0, farmingAssetValue);

  // 부록 A — heirAssessments 입력 시 자격자 N명 / 전체 M명 메타 계산
  const totalHeirCount = farming?.heirAssessments?.length;
  const qualifiedHeirCount =
    farming?.heirAssessments !== undefined
      ? (deriveQualifiedHeirIds(farming) ?? []).length
      : undefined;

  // v4.1.1 D8/14지점 ⑦ — type="personal"일 때만 거주지 OR echo 생성 (corporate 트랙은 §16②2호 거주지 요건 없음)
  const residence =
    farming?.type === "personal" && estateItems
      ? (() => {
          // v4.1.1 PR-3 — adjacency resolver 자동 주입. Phase 1-C 매트릭스 데이터 주입 전까지
          // resolver는 빈 배열 반환 → adjacent_district 분기 비활성, within_30km로 fallback
          const r = checkFarmingResidenceCompliance(estateItems, farming, {
            adjacentSigunguCodes: getAdjacentSigunguCodes,
          });
          return {
            decedentMatchKind: r.decedentMatchKind,
            heirMatchKind: r.heirMatchKind,
            decedentAutoMet: r.decedentAutoMet,
            heirAutoMet: r.heirAutoMet,
            decedentMinDistanceKm: r.decedentMinDistanceKm,
            heirMinDistanceKm: r.heirMinDistanceKm,
          };
        })()
      : undefined;

  // 자격 미충족 — 공제 0 + 사용자 입력값은 detail에 보존
  if (!evalResult.eligible) {
    return {
      deduction: 0,
      breakdown: [
        { label: "영농자산가액 (입력)", amount: safeAssetValue },
        {
          label: "영농상속공제 (자격 미충족)",
          amount: 0,
          lawRef: INH.FARMING_DEDUCTION,
          note: evalResult.reasons.join(" / "),
        },
      ],
      detail: {
        eligible: false,
        evaluated,
        ineligibleReasons: evalResult.reasons,
        appliedAssetValue: safeAssetValue,
        cappedDeduction: 0,
        qualifiedHeirCount,
        totalHeirCount,
        residence,
      },
    };
  }

  if (safeAssetValue <= 0) {
    return {
      deduction: 0,
      breakdown: [],
      detail: {
        eligible: true,
        evaluated,
        ineligibleReasons: [],
        appliedAssetValue: 0,
        cappedDeduction: 0,
        qualifiedHeirCount,
        totalHeirCount,
        residence,
      },
    };
  }

  const capped = Math.min(safeAssetValue, FARMING_MAX);
  return {
    deduction: capped,
    breakdown: [
      { label: "영농자산가액", amount: safeAssetValue },
      {
        label: "영농상속공제 (최대 30억)",
        amount: capped,
        lawRef: INH.FARMING_DEDUCTION,
      },
    ],
    detail: {
      eligible: true,
      evaluated,
      ineligibleReasons: [],
      appliedAssetValue: safeAssetValue,
      cappedDeduction: capped,
      qualifiedHeirCount,
      totalHeirCount,
      residence,
    },
  };
}
