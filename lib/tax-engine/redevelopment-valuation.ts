/**
 * 재개발/재건축 — 환산취득가 산정 (PHD 패턴, 주택 라목값 기반)
 *
 * 법령 근거 (law.go.kr 확인 2026-05-13, 시행령 mst=285631):
 *
 * ── §99①1호 라목 — 주택 기준시가 ──
 *   주택은 토지+건물 통합 단일 "개별주택공시가격" 또는 "공동주택가격"으로 공시.
 *   재개발 환산취득가 산정 시 분자/분모 모두 단일 라목값을 사용한다.
 *
 * ── §164⑦ 본문 ──
 *   "개별주택가격 및 공동주택가격이 공시되기 전에 취득한 주택의 취득당시의 기준시가는
 *    다음 산식에 의하여 계산한 가액으로 한다."
 *
 *   취득당시 라목값 P_A = floor(A × Sum_A / Sum_F)
 *     A     = 최초공시 주택가격 (단일 라목값)
 *     Sum_A = 취득당시 토지(㎡단가 × 면적) + 취득당시 건물 기준시가
 *     Sum_F = 최초공시 당시 토지(㎡단가 × 면적) + 최초공시 당시 건물 기준시가
 *
 *   ※ PHD 패턴 (transfer-tax-pre-housing-disclosure.ts:100-103 동일 산식 구조)
 *
 * ── §166③ (재개발/재건축 환산취득가 산식) ──
 *   환산취득가 = floor(권리가액 × P_A / D)
 *     D = 관리처분 인가일 라목값 (managementDisposalHousingPrice, 단일)
 *
 * ── 2단계 적용 (취득일 < 최초공시일 + PHD 필수입력 모두 만족) ──
 *   Step 1 (§164⑦ 본문): P_A = floor(A × Sum_A / Sum_F)
 *   Step 2 (§166③):     환산취득가 = floor(권리가액 × P_A / D)
 *
 * ── 1단계만 적용 (본문 미발동) ──
 *   P_A = acquisitionHousingPrice (사용자 단일 직접 입력)
 *   환산취득가 = floor(권리가액 × P_A / D)
 *
 * 정수연산: BigInt floor (safeMultiplyThenDivide).
 */

import { safeMultiplyThenDivide } from "./tax-utils";
import { REDEVELOPMENT } from "./legal-codes";
import type {
  RedevelopmentInfo,
  RedevelopmentValuationMeta,
} from "./types/transfer-redevelopment.types";

// ──────────────────────────────────────────────────────────────────────────────
// 환산취득가 산정 입력·결과
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 환산취득가 산정 입력 — PHD 패턴 (§99①1호 라목 개별주택공시가격 기반)
 *
 * 산식:
 *   환산취득가 = floor(권리가액 × P_A / D)
 *     D   = managementDisposalHousingPrice (관리처분 라목값, 단일)
 *     P_A = 본문 발동 시 floor(A × Sum_A / Sum_F) — §164⑦ 본문
 *           본문 미발동 시 acquisitionHousingPrice — 사용자 직접 입력
 *     Sum_A = landPricePerSqmAtAcq × landArea + buildingStdPriceAtAcq
 *     Sum_F = landPricePerSqmAtFirst × landArea + buildingStdPriceAtFirst
 */
export interface ConvertedAcquisitionInput {
  /** 자산 취득일 — §164⑦ 본문 분기 트리거 */
  acquisitionDate: Date;

  /** 권리가액 (= §166④ 평가액) */
  rightsValue: number;

  /** D — 관리처분 인가일 개별주택공시가격 (원, 단일 라목값) */
  managementDisposalHousingPrice: number;

  /** 본문 미발동 시 — 취득당시 개별주택공시가격 (원, 단일 라목값) */
  acquisitionHousingPrice?: number;

  /** §164⑦ 본문 트리거 — 최초공시일 */
  firstDisclosureDate?: Date;

  /** A — 최초공시 주택가격 (원, 단일 라목값). 본문 발동 시 필수. */
  firstDisclosureHousingPrice?: number;

  /** 토지면적 (㎡, 시점별 동일 가정). 본문 발동 시 필수. */
  landArea?: number;

  /** 취득시 토지 ㎡당 단가 (원/㎡). 본문 발동 시 필수. */
  landPricePerSqmAtAcq?: number;

  /** 취득시 건물 기준시가 (원, 총액). 본문 발동 시 필수. */
  buildingStdPriceAtAcq?: number;

  /** 최초공시 당시 토지 ㎡당 단가 (원/㎡). 본문 발동 시 필수. */
  landPricePerSqmAtFirst?: number;

  /** 최초공시 당시 건물 기준시가 (원, 총액). 본문 발동 시 필수. */
  buildingStdPriceAtFirst?: number;
}

/** 환산취득가 산정 결과 */
export interface ConvertedAcquisitionResult {
  /** 환산취득가 (원, 정수) */
  acquisitionPrice: number;
  /** UI 배지·anchor 검증용 메타 */
  meta: RedevelopmentValuationMeta;
}

// ──────────────────────────────────────────────────────────────────────────────
// 본문 함수
// ──────────────────────────────────────────────────────────────────────────────

/**
 * §166③ 환산취득가 산정 (재개발/재건축 전용 — 주택 라목값 기반).
 *
 * 분기:
 *  1. acquisitionDate ≥ firstDisclosureDate 또는 firstDisclosureDate 미입력 또는 PHD 필수필드 미입력
 *     → 본문 미발동: P_A = acquisitionHousingPrice (사용자 단일 직접 입력)
 *     → method = "estimated_post_disclosure_decree_166_3"
 *  2. acquisitionDate < firstDisclosureDate + PHD 필수필드(A/landArea/단가×2/건물×2) 모두 입력
 *     → 본문 발동 (PHD 패턴): P_A = floor(A × Sum_A / Sum_F)
 *     → method = "estimated_pre_disclosure_decree_164_7"
 *
 * 정수연산: BigInt floor (safeMultiplyThenDivide).
 *
 * @example 사례 44 (본문 미발동, 단일 라목값 직접 입력)
 *   → P_A = 85_034_988, D = 132_000_000
 *   → 환산취득가 = floor(219_218_500 × 85_034_988 / 132_000_000) = 141_221_534
 */
export function computeConvertedAcquisitionPrice(
  input: ConvertedAcquisitionInput,
): ConvertedAcquisitionResult {
  const {
    acquisitionDate,
    rightsValue,
    managementDisposalHousingPrice,
    acquisitionHousingPrice,
    firstDisclosureDate,
    firstDisclosureHousingPrice,
    landArea,
    landPricePerSqmAtAcq,
    buildingStdPriceAtAcq,
    landPricePerSqmAtFirst,
    buildingStdPriceAtFirst,
  } = input;

  const denominator = managementDisposalHousingPrice;

  // 입력 검증 — D 0 방어
  if (denominator <= 0) {
    return {
      acquisitionPrice: 0,
      meta: {
        method: "estimated_post_disclosure_decree_166_3",
        numerator: 0,
        denominator: 0,
        rationale: "관리처분 인가일 개별주택공시가격(D)이 0 또는 미입력 — 환산 불가 (검증 단계에서 차단)",
      },
    };
  }

  // §164⑦ 본문 트리거: 취득일 < 최초공시일
  const isPreDisclosure =
    firstDisclosureDate != null && acquisitionDate.getTime() < firstDisclosureDate.getTime();

  // 본문 적용 가능성 — PHD 필수필드(A·landArea·단가×2·건물×2) 모두 양수
  const canApplyPreDisclosureMain =
    isPreDisclosure &&
    firstDisclosureHousingPrice != null && firstDisclosureHousingPrice > 0 &&
    landArea != null && landArea > 0 &&
    landPricePerSqmAtAcq != null && landPricePerSqmAtAcq > 0 &&
    buildingStdPriceAtAcq != null && buildingStdPriceAtAcq >= 0 &&
    landPricePerSqmAtFirst != null && landPricePerSqmAtFirst > 0 &&
    buildingStdPriceAtFirst != null && buildingStdPriceAtFirst >= 0;

  let P_A: number;
  let preDisclosureStep1: RedevelopmentValuationMeta["preDisclosureStep1"];

  if (canApplyPreDisclosureMain) {
    // ── 본문 발동 — PHD 패턴 ──
    // Sum_A = landPricePerSqmAtAcq × landArea + buildingStdPriceAtAcq
    // Sum_F = landPricePerSqmAtFirst × landArea + buildingStdPriceAtFirst
    // P_A   = floor(A × Sum_A / Sum_F)
    const sumAtAcq = landPricePerSqmAtAcq! * landArea! + buildingStdPriceAtAcq!;
    const sumAtFirst = landPricePerSqmAtFirst! * landArea! + buildingStdPriceAtFirst!;

    if (sumAtFirst <= 0) {
      // 방어 — Sum_F 0인 케이스 (이론상 도달 안 함, validate에서 차단)
      P_A = acquisitionHousingPrice ?? 0;
    } else {
      P_A = safeMultiplyThenDivide(firstDisclosureHousingPrice!, sumAtAcq, sumAtFirst);
      preDisclosureStep1 = {
        firstDisclosureHousingPrice: firstDisclosureHousingPrice!,
        landArea: landArea!,
        landPricePerSqmAtAcq: landPricePerSqmAtAcq!,
        buildingStdPriceAtAcq: buildingStdPriceAtAcq!,
        landPricePerSqmAtFirst: landPricePerSqmAtFirst!,
        buildingStdPriceAtFirst: buildingStdPriceAtFirst!,
        sumAtAcq,
        sumAtFirst,
        computedAcquisitionHousingPrice: P_A,
      };
    }
  } else {
    // ── 본문 미발동 — 사용자 단일 직접 입력 (사례 44 회귀 경로) ──
    P_A = acquisitionHousingPrice ?? 0;
  }

  // §166③: 환산취득가 = floor(권리가액 × P_A / D)
  const acquisitionPrice = safeMultiplyThenDivide(rightsValue, P_A, denominator);

  const method = canApplyPreDisclosureMain
    ? ("estimated_pre_disclosure_decree_164_7" as const)
    : ("estimated_post_disclosure_decree_166_3" as const);

  const rationale = buildRationale({
    isPreDisclosure,
    canApplyPreDisclosureMain,
    acquisitionDate,
    firstDisclosureDate,
    method,
  });

  return {
    acquisitionPrice,
    meta: {
      method,
      numerator: P_A,
      denominator,
      rationale,
      ...(preDisclosureStep1 ? { preDisclosureStep1 } : {}),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 — rationale 문자열 구성 (UI 배지 표시용)
// ──────────────────────────────────────────────────────────────────────────────

interface BuildRationaleArgs {
  isPreDisclosure: boolean;
  canApplyPreDisclosureMain: boolean;
  acquisitionDate: Date;
  firstDisclosureDate?: Date;
  method: RedevelopmentValuationMeta["method"];
}

function buildRationale(args: BuildRationaleArgs): string {
  const { isPreDisclosure, canApplyPreDisclosureMain, acquisitionDate, firstDisclosureDate, method } = args;
  const acqDateStr = formatDate(acquisitionDate);

  if (canApplyPreDisclosureMain && firstDisclosureDate) {
    const disclosureStr = formatDate(firstDisclosureDate);
    return `취득일 ${acqDateStr} < 최초공시일 ${disclosureStr} → ${REDEVELOPMENT.PRE_DISCLOSURE_PROVISO} 본문 발동, PHD 패턴 2단계 산식 (Step 1: P_A = floor(A × Sum_A / Sum_F), Step 2: 환산취득가 = floor(권리가액 × P_A / D)) (method=${method})`;
  }

  if (isPreDisclosure && firstDisclosureDate) {
    const disclosureStr = formatDate(firstDisclosureDate);
    return `취득일 ${acqDateStr} < 최초공시일 ${disclosureStr} 이나 본문 필수입력(A·landArea·단가×2·건물×2) 중 일부 미입력 → 본문 미적용, 본문 미발동 경로(단일 라목값 직접 입력) 사용 (method=${method})`;
  }

  if (firstDisclosureDate) {
    const disclosureStr = formatDate(firstDisclosureDate);
    return `취득일 ${acqDateStr} ≥ 최초공시일 ${disclosureStr} → ${REDEVELOPMENT.PRE_DISCLOSURE_PROVISO} 본문 미발동, 단일 라목값 직접 입력 (method=${method})`;
  }

  return `최초공시일 미입력 → ${REDEVELOPMENT.PRE_DISCLOSURE_PROVISO} 본문 미발동, 단일 라목값 직접 입력 (method=${method})`;
}

/** Date → "YYYY-MM-DD" */
function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// 편의 함수 — RedevelopmentInfo 에서 환산 입력 추출
// ──────────────────────────────────────────────────────────────────────────────

/**
 * RedevelopmentInfo + 자산 acquisitionDate 로부터 환산취득가 산정.
 *
 * 환산 모드 (managementDisposalHousingPrice 입력) 시만 호출.
 * 실가 모드는 본 함수 호출 없이 actualAcquisitionPrice 직접 사용.
 *
 * @returns 환산 결과 또는 null (환산 입력 불충분)
 */
export function computeRedevelopmentValuation(
  info: RedevelopmentInfo,
  acquisitionDate: Date,
): ConvertedAcquisitionResult | null {
  /**
   * ── 토지 출자 §166③ 환산 (2026-08-25 신설 — E1-01) ──────────────────────────
   *
   * 종전자산이 **토지**면 §166③의 분자·분모가 주택 라목값(공동주택·개별주택가격)이 아니라
   * **개별공시지가**다. 그래서 아래 주택 경로(`managementDisposalHousingPrice` 필요)는 토지
   * 입력으로는 절대 발동하지 않고 `null`을 반환했다.
   *
   * 🔴 그 결과 `runRedevelopment`가 「토지 + 환산」을 통째로 별도 분기(`runLandContribEstimated`)로
   *    빼돌렸고, 그 분기가 §166**①**1호(입주권) 구조를 강제해 **완공 신축주택 양도(subject="apt")
   *    까지 §166①로 계산**됐다. 즉 취득가액 산정 방식(실가/환산) 토글 하나가 §166 적용 항을 바꿨다
   *    (실측 산출세액 89,576,716원 과대 — §166⑤2호 LTHD가 통째로 사라진다).
   *
   * §166③은 「**제1항 및 제2항을 적용할 때** … 취득가액을 확인할 수 없는 경우」의 **취득가액 대체
   * 규정**이지 ①·②의 선택축이 아니다. ⇒ 여기서 토지 환산취득가를 산출해 주면
   * `computeRedevelopmentSplit`이 subject에 따라 ①(입주권) / ②(신축주택)로 정상 라우팅한다.
   *
   * `numerator`에 취득당시 개별공시지가를 실으면 상위 Step B의 §163⑥ 개산공제(토지 3%)가 그대로
   * 따라온다 — `redevelopment-land-contribution.ts`와 같은 값이다(양쪽 다
   * `estimatedDeductionRate(isUnregistered)` 단일 경유).
   */
  if (info.originalAssetType === "land") {
    const acqLandPrice = info.landStdPriceAtAcq ?? 0;
    const approvalLandPrice = info.landStdPriceAtApproval ?? 0;
    if (acqLandPrice <= 0 || approvalLandPrice <= 0) return null;
    return {
      acquisitionPrice: safeMultiplyThenDivide(info.rightsValue, acqLandPrice, approvalLandPrice),
      meta: {
        method: "estimated_post_disclosure_decree_166_3",
        numerator: acqLandPrice,
        denominator: approvalLandPrice,
        rationale:
          `§166③ 토지 출자 환산 — 평가액 ${info.rightsValue.toLocaleString()} × ` +
          `(취득당시 개별공시지가 ${acqLandPrice.toLocaleString()} ÷ ` +
          `인가당시 개별공시지가 ${approvalLandPrice.toLocaleString()})`,
      },
    };
  }

  if (
    info.managementDisposalHousingPrice == null ||
    info.managementDisposalHousingPrice <= 0
  ) {
    return null;
  }

  return computeConvertedAcquisitionPrice({
    acquisitionDate,
    rightsValue: info.rightsValue,
    managementDisposalHousingPrice: info.managementDisposalHousingPrice,
    acquisitionHousingPrice: info.acquisitionHousingPrice,
    firstDisclosureDate: info.firstDisclosureDate,
    firstDisclosureHousingPrice: info.firstDisclosureHousingPrice,
    landArea: info.landArea,
    landPricePerSqmAtAcq: info.landPricePerSqmAtAcq,
    buildingStdPriceAtAcq: info.buildingStdPriceAtAcq,
    landPricePerSqmAtFirst: info.landPricePerSqmAtFirst,
    buildingStdPriceAtFirst: info.buildingStdPriceAtFirst,
  });
}
