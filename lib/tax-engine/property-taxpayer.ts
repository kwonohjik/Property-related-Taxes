/**
 * 재산세 납세의무자 확정 모듈 (P2-18~19)
 *
 * 지방세법 §107 (납세의무자)
 *
 * 기능:
 * - determineTaxpayer(): 납세의무자 우선순위 확정
 * - distributeCoOwnershipTax(): 공유재산 지분별 안분
 * - buildHouseSplitOutcome(): §107①2호 건물·토지 분리 산출세액 안분 조립
 *
 * 납세의무자 확정 우선순위 (지방세법 §107 현행 — MST 282559):
 *   §107②5호: 신탁재산 → 위탁자 (2020.12.29 개정, 구법 수탁자 아님)
 *   §107②4호: 국가 등과 연부 매매 + 무상사용 → 매수계약자
 *   §107②6호: 환지 체비지·보류지 → 사업시행자
 *   §107②7호: 외국인 항공기·선박 임차 수입 → 수입자
 *   §107②3호: 종중재산 미신고 → 공부상 소유자
 *   §107②8호: 파산재단 재산 → 공부상 소유자
 *   §107①2호: 주택 건물·부속토지 소유자 분리 → 시가표준액 큰 쪽 대표 + 안분
 *   §107① 본문: 과세기준일 현재 사실상 소유자 (원칙)
 *   §107②2호: 상속 미등기 → 행안부령 주된 상속인
 *   §107①1호: 공유재산 → 지분권자
 *   §107③: 소유권 귀속 불명 → 사용자
 *   §107②1호: 매매 미신고 사실상소유자 불명 → 공부상 소유자 (fallback)
 */

import { PROPERTY } from "./legal-codes";
import type {
  PropertyObjectInput,
  CoOwnershipShare,
  PropertyTaxpayerType,
  PropertyHeir,
} from "./types/property-object.types";
import type {
  PropertyTaxInput,
  PropertyTaxpayerInfo,
  PropertyCoOwnershipDistribution,
  PropertyHouseSplitDistribution,
} from "./types/property.types";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";

// ============================================================
// 출력 타입
// ============================================================

export interface TaxpayerResult {
  /** 납세의무자 유형 */
  type: PropertyTaxpayerType;
  /** 납세의무자 식별자 */
  name: string;
  legalBasis: string;
  warnings: string[];
}

export interface CoOwnershipDistribution {
  /** 각 공유자별 안분 결과 */
  distributions: Array<{
    ownerId: string;
    shareRatio: number;
    /** 지분 비율로 안분된 세액 (원) */
    taxAmount: number;
  }>;
  /** 안분 검증 — 합산 오차 (소수점 절사로 인한 잔여분) */
  roundingDiff: number;
}

// ============================================================
// 주된 상속자 선택 (§107②2호, 지방세법 시행규칙 §53)
// ============================================================

/**
 * 주된 상속자 선택 (지방세법 시행규칙 §53).
 * 1) 전원 지분 입력: 민법상 지분 최대자 → 동률이면 연장자(이른 생년)
 * 2) 지분 일부/전부 미입력, 또는 동률+생년 미입력: 첫 상속인 fallback (자동 균등분배 금지)
 */
function selectMainHeir(
  heirs: PropertyHeir[],
): { mainHeir: PropertyHeir; reason: string } {
  const allHaveShare = heirs.every((h) => h.shareRatio != null);
  if (!allHaveShare) {
    return { mainHeir: heirs[0], reason: "상속지분 미입력 — 첫 상속인 적용" };
  }
  const maxShare = Math.max(...heirs.map((h) => h.shareRatio as number));
  const tied = heirs.filter((h) => h.shareRatio === maxShare);
  if (tied.length === 1) {
    return { mainHeir: tied[0], reason: "상속지분 최대" };
  }
  // 동률 → 연장자(이른 생년). 동률자 전원 생년 입력 시에만.
  const allHaveBirth = tied.every((h) => h.birthDate);
  if (allHaveBirth) {
    const eldest = tied.reduce((a, b) =>
      (a.birthDate as string) <= (b.birthDate as string) ? a : b,
    );
    return { mainHeir: eldest, reason: "지분 동률 — 연장자" };
  }
  return { mainHeir: heirs[0], reason: "지분 동률·생년 미입력 — 첫 상속인 적용" };
}

// ============================================================
// P2-18: determineTaxpayer — 납세의무자 우선순위 확정
// ============================================================

/**
 * 납세의무자 확정 (지방세법 §107, §107의2)
 *
 * 과세기준일(6월 1일) 현재의 소유 상태를 기준으로 판정.
 *
 * @param input PropertyObjectInput
 * @returns TaxpayerResult
 */
export function determineTaxpayer(
  input: Pick<
    PropertyObjectInput,
    | "registeredOwner"
    | "actualOwner"
    | "isTrust"
    | "trustType"
    | "settlor"
    | "isInheritanceUnregistered"
    | "heirs"
    | "coOwnershipShares"
    | "isClanProperty"
    | "installmentBuyer"
    | "projectOperator"
    | "importer"
    | "isBankruptcyEstate"
    | "ownershipUnclearUser"
    | "isHouseSplit"
    | "buildingOwner"
    | "landOwner"
    | "buildingStdValue"
    | "landStdValue"
  >,
): TaxpayerResult {
  const warnings: string[] = [];

  // ── 1순위: 신탁재산 → 위탁자 (§107②5호, 2020.12.29 개정) ──
  //   구법: 수탁자 납세. 현행법: 위탁자 납세.
  //   settlor = 위탁자(신탁 설정자) 식별자.
  if (input.isTrust) {
    if (!input.settlor) {
      warnings.push(
        "신탁재산으로 표시되었으나 위탁자(settlor) 정보가 없습니다. 공부상 소유자로 처리합니다.",
      );
    } else {
      return {
        type: "truster",
        name: input.settlor,
        legalBasis: PROPERTY.TAXPAYER_TRUSTEE, // "지방세법 §107②5호"
        warnings,
      };
    }
  }

  // ── 연부 매수계약자 (§107②4호) — 국가 등과 연부매매 + 무상 사용권 ──
  if (input.installmentBuyer) {
    return {
      type: "installment_buyer",
      name: input.installmentBuyer,
      legalBasis: PROPERTY.TAXPAYER_INSTALLMENT_BUYER,
      warnings,
    };
  }

  // ── 환지 체비지·보류지 사업시행자 (§107②6호) ──
  if (input.projectOperator) {
    return {
      type: "project_operator",
      name: input.projectOperator,
      legalBasis: PROPERTY.TAXPAYER_PROJECT_OPERATOR,
      warnings,
    };
  }

  // ── 외국인 항공기·선박 임차 수입자 (§107②7호) ──
  if (input.importer) {
    return {
      type: "importer",
      name: input.importer,
      legalBasis: PROPERTY.TAXPAYER_IMPORTER,
      warnings,
    };
  }

  // ── 종중재산 미신고 → 공부상 소유자 (§107②3호) ──
  if (input.isClanProperty) {
    return {
      type: "registered_owner",
      name: input.registeredOwner,
      legalBasis: PROPERTY.TAXPAYER_CLAN,
      warnings,
    };
  }

  // ── 파산재단 재산 → 공부상 소유자 (§107②8호) ──
  if (input.isBankruptcyEstate) {
    return {
      type: "registered_owner",
      name: input.registeredOwner,
      legalBasis: PROPERTY.TAXPAYER_BANKRUPTCY,
      warnings,
    };
  }

  // ── 주택 건물·부속토지 소유자 분리 → 시가표준액 큰 쪽 대표 (§107①2호) ──
  //   ②각호 뒤·①본문 앞 (①단서이므로 사실상소유자보다 우선). 산출세액 안분은 buildHouseSplitOutcome.
  if (input.isHouseSplit) {
    if (
      !input.buildingOwner ||
      !input.landOwner ||
      !input.buildingStdValue ||
      input.buildingStdValue <= 0 ||
      !input.landStdValue ||
      input.landStdValue <= 0
    ) {
      warnings.push(
        "주택 건물·부속토지 분리(§107①2호)이나 소유자·시가표준액 정보가 부족합니다. 공부상 소유자로 처리합니다.",
      );
    } else {
      const buildingIsRep = input.buildingStdValue >= input.landStdValue;
      return {
        type: buildingIsRep ? "building_owner" : "land_owner",
        name: buildingIsRep ? input.buildingOwner : input.landOwner,
        legalBasis: PROPERTY.TAXPAYER_HOUSE_SPLIT,
        warnings,
      };
    }
  }

  // ── 2순위: 사실상 소유자 ≠ 공부상 소유자 (§107①본문) ──
  //   §107①본문: 과세기준일 현재 사실상 소유자가 납세의무자(원칙).
  //   actualOwner가 입력됐고 registeredOwner와 다를 때 사실상소유자 판정.
  if (input.actualOwner && input.actualOwner !== input.registeredOwner) {
    warnings.push(
      `공부상 소유자(${input.registeredOwner})와 사실상 소유자(${input.actualOwner})가 다릅니다. ` +
      "사실상 소유자를 납세의무자로 봅니다(지방세법 §107①본문).",
    );
    return {
      type: "actual_owner",
      name: input.actualOwner,
      legalBasis: PROPERTY.TAXPAYER_PRINCIPLE, // "지방세법 §107①"
      warnings,
    };
  }

  // ── 3순위: 상속 미등기 → 주된 상속자 (§107②2호, 시행규칙 §53) ──
  if (input.isInheritanceUnregistered) {
    const heirs = input.heirs ?? [];
    if (heirs.length === 0) {
      warnings.push(
        "상속 미등기 재산이지만 상속인 정보가 없습니다. 공부상 소유자로 처리합니다.",
      );
    } else {
      // 시행규칙 §53: 민법상 지분 최대자 → 동률이면 연장자(이른 생년).
      // 지분/생년 미입력 시 첫 상속인 fallback (자동 균등분배 금지).
      const { mainHeir, reason } = selectMainHeir(heirs);
      if (heirs.length > 1) {
        warnings.push(
          `상속인이 ${heirs.length}명입니다. 주된 상속자(${mainHeir.name})를 납세의무자로 하며(${reason}), ` +
          "나머지 상속인은 연대납세의무가 있습니다.",
        );
      }
      return {
        type: "heir_representative",
        name: mainHeir.name,
        legalBasis: PROPERTY.TAXPAYER_HEIR,
        warnings,
      };
    }
  }

  // ── 4순위: 공유재산 → 각 공유자 (§107①1호, 안분은 distributeCoOwnershipTax에서) ──
  if (input.coOwnershipShares && input.coOwnershipShares.length > 1) {
    // 대표 납세의무자: 지분 최대자
    const maxShareOwner = input.coOwnershipShares.reduce(
      (prev, curr) => (curr.shareRatio > prev.shareRatio ? curr : prev),
      input.coOwnershipShares[0],
    );
    warnings.push(
      `공유재산입니다. 납세의무자는 각 공유자이며, ` +
      `지분 최대자(${maxShareOwner.ownerId})를 대표 납세의무자로 설정합니다.`,
    );
    return {
      type: "co_owner",
      name: maxShareOwner.ownerId,
      legalBasis: PROPERTY.TAXPAYER_CO_OWNER, // "지방세법 §107①1호"
      warnings,
    };
  }

  // ── 소유권 귀속 불명 → 사용자 (§107③) ──
  if (input.ownershipUnclearUser) {
    return {
      type: "user",
      name: input.ownershipUnclearUser,
      legalBasis: PROPERTY.TAXPAYER_USER,
      warnings,
    };
  }

  // ── 기본 fallback: 공부상 소유자 (§107②1호 — 사실상소유자 불명 시) ──
  //   §107①본문은 사실상소유자가 원칙이나, actualOwner 미입력(불명) 시
  //   §107②1호에 따라 공부상 소유자를 납세의무자로 봄.
  return {
    type: "registered_owner",
    name: input.registeredOwner,
    legalBasis: PROPERTY.TAXPAYER_PRINCIPLE, // "지방세법 §107①"
    warnings,
  };
}

// ============================================================
// P2-19: distributeCoOwnershipTax — 공유재산 지분별 안분
// ============================================================

/**
 * 공유재산 세액 안분 (지방세법 §107③)
 *
 * 공유자별로 지분 비율에 따라 세액을 안분합니다.
 * 원 단위 절사로 인한 잔여분은 마지막 공유자에게 귀속합니다.
 *
 * @param totalTax 총 산출세액 (원, 정수)
 * @param shares 공유자별 지분 목록
 * @throws TaxCalculationError 지분 합계가 1을 초과하는 경우
 */
export function distributeCoOwnershipTax(
  totalTax: number,
  shares: CoOwnershipShare[],
): CoOwnershipDistribution {
  if (shares.length === 0) {
    return { distributions: [], roundingDiff: 0 };
  }

  // 지분 합계 검증
  const totalShare = shares.reduce((sum, s) => sum + s.shareRatio, 0);
  if (totalShare > 1 + 1e-9) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `공유 지분 합계(${totalShare.toFixed(4)})가 1을 초과합니다. 지분 입력을 확인하세요.`,
    );
  }

  let distributed = 0;
  const distributions = shares.map((share, idx) => {
    const isLast = idx === shares.length - 1;
    // 마지막 공유자 → 잔여 세액 전부 (절사 오차 처리)
    const taxAmount = isLast
      ? totalTax - distributed
      : Math.floor(totalTax * share.shareRatio);
    distributed += isLast ? 0 : taxAmount;
    return {
      ownerId: share.ownerId,
      shareRatio: share.shareRatio,
      taxAmount,
    };
  });

  const sumDistributed = distributions.reduce((s, d) => s + d.taxAmount, 0);
  const roundingDiff = totalTax - sumDistributed;

  return { distributions, roundingDiff };
}

// ============================================================
// 엔진 통합 헬퍼 — 납세의무자 결과 + 공유 안분 (본세·고지액 2기준)
// ============================================================

/**
 * calculatePropertyTax 결과에 부착할 납세의무자 필드 조립.
 * taxpayerResult 미입력 시 빈 객체({})를 반환 → 결과에 taxpayer 미포함(계산 불변).
 * co_owner + 지분 2인 이상이면 본세(determinedTax)·고지액(totalPayable) 두 기준으로 안분.
 *
 * @param taxpayerResult determineTaxpayer 결과 (없으면 판정 생략)
 * @param shares         공유 지분 목록
 * @param determinedTax  세부담상한 적용 후 본세 (원)
 * @param totalPayable   부가세 포함 고지액 (원)
 */
export function buildTaxpayerOutcome(
  taxpayerResult: TaxpayerResult | undefined,
  shares: CoOwnershipShare[] | undefined,
  determinedTax: number,
  totalPayable: number,
): {
  taxpayer?: PropertyTaxpayerInfo;
  coOwnershipDistribution?: PropertyCoOwnershipDistribution;
} {
  if (!taxpayerResult) return {};

  const taxpayer: PropertyTaxpayerInfo = {
    type: taxpayerResult.type,
    name: taxpayerResult.name,
    legalBasis: taxpayerResult.legalBasis,
    warnings: taxpayerResult.warnings,
  };

  // 공유재산이 아니거나 단독 지분이면 안분 없음
  if (taxpayerResult.type !== "co_owner" || !shares || shares.length <= 1) {
    return { taxpayer };
  }

  // 본세·고지액 두 기준으로 각각 안분 (floor 잔액은 각각 마지막 공유자 흡수)
  const byTax = distributeCoOwnershipTax(determinedTax, shares);
  const byTotal = distributeCoOwnershipTax(totalPayable, shares);

  const distributions = byTax.distributions.map((d, i) => ({
    ownerId: d.ownerId,
    shareRatio: d.shareRatio,
    taxAmount: d.taxAmount,
    totalAmount: byTotal.distributions[i].taxAmount,
  }));

  return {
    taxpayer,
    coOwnershipDistribution: { distributions, roundingDiff: byTax.roundingDiff },
  };
}

// ============================================================
// 엔진 통합 헬퍼 — 주택 건물·부속토지 분리 산출세액 안분 (§107①2호)
// ============================================================

/**
 * §107①2호 건물·부속토지 소유자 분리 산출세액 안분 조립.
 * 대표(building_owner/land_owner)일 때만 안분. 건축물·부속토지 시가표준액 비율로
 * 본세(determinedTax)·고지액(totalPayable) 2기준 안분.
 *
 * 고가주택 세액×시가표준액 > MAX_SAFE 가능 → BigInt 전체 연산(곱·나눗셈 완결 후 Number).
 * floor 잔액은 토지분(determinedTax − buildingTax)이 흡수.
 */
export function buildHouseSplitOutcome(
  taxpayerResult: TaxpayerResult | undefined,
  buildingOwner: string | undefined,
  landOwner: string | undefined,
  buildingStdValue: number | undefined,
  landStdValue: number | undefined,
  determinedTax: number,
  totalPayable: number,
): {
  taxpayer?: PropertyTaxpayerInfo;
  houseSplitDistribution?: PropertyHouseSplitDistribution;
} {
  if (!taxpayerResult) return {};

  const taxpayer: PropertyTaxpayerInfo = {
    type: taxpayerResult.type,
    name: taxpayerResult.name,
    legalBasis: taxpayerResult.legalBasis,
    warnings: taxpayerResult.warnings,
  };

  const isHouseSplitType =
    taxpayerResult.type === "building_owner" || taxpayerResult.type === "land_owner";
  if (
    !isHouseSplitType ||
    !buildingOwner ||
    !landOwner ||
    !buildingStdValue ||
    buildingStdValue <= 0 ||
    !landStdValue ||
    landStdValue <= 0
  ) {
    return { taxpayer };
  }

  const sum = buildingStdValue + landStdValue;
  // BigInt 전체 연산 — 곱·나눗셈 완결 후 Number (feedback_safemul_decimal_apportion_precision)
  const buildingTaxAmount = Number(
    (BigInt(determinedTax) * BigInt(buildingStdValue)) / BigInt(sum),
  );
  const landTaxAmount = determinedTax - buildingTaxAmount; // 잔액 흡수
  const buildingTotalAmount = Number(
    (BigInt(totalPayable) * BigInt(buildingStdValue)) / BigInt(sum),
  );
  const landTotalAmount = totalPayable - buildingTotalAmount;

  return {
    taxpayer,
    houseSplitDistribution: {
      buildingOwner,
      buildingStdValue,
      buildingTaxAmount,
      buildingTotalAmount,
      landOwner,
      landStdValue,
      landTaxAmount,
      landTotalAmount,
      buildingRatio: buildingStdValue / sum,
    },
  };
}

// ============================================================
// 엔진 오케스트레이션 헬퍼 (calculatePropertyTax 800줄 정책 — 위임)
// ============================================================

/**
 * Step 0: taxpayerInfo 입력 시 납세의무자 판정.
 * house_split 시 건축물 시가표준액 = housingBuildingValue 재사용 → buildingStdValue 주입.
 */
export function resolveTaxpayer(
  input: Pick<PropertyTaxInput, "taxpayerInfo" | "housingBuildingValue">,
): TaxpayerResult | undefined {
  if (!input.taxpayerInfo) return undefined;
  return determineTaxpayer({
    ...input.taxpayerInfo,
    buildingStdValue: input.taxpayerInfo.isHouseSplit ? input.housingBuildingValue : undefined,
  });
}

/**
 * 결과 부착 선택: house_split(building/land_owner)이면 산출세액 안분(buildHouseSplitOutcome),
 * 그 외(공유 등)는 공유 안분(buildTaxpayerOutcome). 주택 main return 경로 전용.
 */
export function selectTaxpayerOutcome(
  taxpayerResult: TaxpayerResult | undefined,
  input: Pick<PropertyTaxInput, "taxpayerInfo" | "housingBuildingValue">,
  coShares: CoOwnershipShare[] | undefined,
  determinedTax: number,
  totalPayable: number,
): {
  taxpayer?: PropertyTaxpayerInfo;
  coOwnershipDistribution?: PropertyCoOwnershipDistribution;
  houseSplitDistribution?: PropertyHouseSplitDistribution;
} {
  if (taxpayerResult?.type === "building_owner" || taxpayerResult?.type === "land_owner") {
    return buildHouseSplitOutcome(
      taxpayerResult,
      input.taxpayerInfo?.buildingOwner,
      input.taxpayerInfo?.landOwner,
      input.housingBuildingValue,
      input.taxpayerInfo?.landStdValue,
      determinedTax,
      totalPayable,
    );
  }
  return buildTaxpayerOutcome(taxpayerResult, coShares, determinedTax, totalPayable);
}
