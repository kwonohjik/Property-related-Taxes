/**
 * 재산세 납세의무자 확정 모듈 (P2-18~19)
 *
 * 지방세법 §107 (납세의무자)
 *
 * 기능:
 * - determineTaxpayer(): 납세의무자 우선순위 확정
 * - distributeCoOwnershipTax(): 공유재산 지분별 안분
 *
 * 납세의무자 확정 우선순위 (지방세법 §107 현행 — MST 282559):
 *   §107① 본문: 과세기준일 현재 사실상 소유자 (원칙)
 *   §107①1호: 공유재산 → 지분권자
 *   §107②2호: 상속 미등기 → 행안부령 주된 상속인
 *   §107②5호: 신탁재산 → 위탁자 (2020.12.29 개정, 구법 수탁자 아님)
 *   §107③: 소유권 귀속 불명 → 사용자
 *   §107②1호: 매매 미신고 사실상소유자 불명 → 공부상 소유자 (fallback)
 */

import { PROPERTY } from "./legal-codes";
import type {
  PropertyObjectInput,
  CoOwnershipShare,
  PropertyTaxpayerType,
} from "./types/property-object.types";
import type {
  PropertyTaxpayerInfo,
  PropertyCoOwnershipDistribution,
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

  // ── 3순위: 상속 미등기 → 주된 상속인 (§107②2호) ──
  if (input.isInheritanceUnregistered) {
    const heirs = input.heirs ?? [];
    if (heirs.length === 0) {
      warnings.push(
        "상속 미등기 재산이지만 상속인 정보가 없습니다. 공부상 소유자로 처리합니다.",
      );
    } else {
      // 상속인이 여럿이면 첫 번째를 주된 상속인으로 처리 (법 상 연대납세의무)
      // TODO(M-03): heirs에 상속분(shareRatio) 정보 추가 시 → 지분 최대자를 주된 상속인으로 선택
      const mainHeir = heirs[0];
      if (heirs.length > 1) {
        warnings.push(
          `상속인이 ${heirs.length}명입니다. 주된 상속인(${mainHeir})을 납세의무자로 하며, ` +
          "나머지 상속인은 연대납세의무가 있습니다.",
        );
      }
      return {
        type: "heir_representative",
        name: mainHeir,
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
