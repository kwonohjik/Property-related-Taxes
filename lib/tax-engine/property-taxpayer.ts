/**
 * 재산세 납세의무자 확정 모듈 (P2-18~19)
 *
 * 지방세법 §107 (납세의무자), §107의2 (신탁재산)
 *
 * 기능:
 * - determineTaxpayer(): 납세의무자 우선순위 확정
 * - distributeCoOwnershipTax(): 공유재산 지분별 안분
 *
 * 납세의무자 확정 우선순위 (지방세법 §107):
 *   1. 신탁재산 → 수탁자 (§107의2)
 *   2. 사실상 소유자 ≠ 공부상 소유자 → 사실상 소유자 (§107① 단서)
 *   3. 상속 미등기 → 주된 상속인 (§107②) — §107③보다 우선 적용
 *   4. 공유재산 → 공유자별 안분 (§107③)
 *   5. 건설 중 건축물 → 건축주 (시행령)
 *   6. 나머지 → 공부상 소유자 (§107① 원칙)
 */

import { PROPERTY } from "./legal-codes";
import type {
  PropertyObjectInput,
  CoOwnershipShare,
  PropertyTaxpayerType,
} from "./types/property-object.types";
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
    | "ownerType"
    | "isTrust"
    | "trustType"
    | "isInheritanceUnregistered"
    | "heirs"
    | "coOwnershipShares"
  >,
): TaxpayerResult {
  const warnings: string[] = [];

  // ── 1순위: 신탁재산 → 수탁자 (§107의2) ──
  if (input.isTrust) {
    if (!input.actualOwner) {
      warnings.push("신탁재산으로 표시되었으나 수탁자 정보가 없습니다. 공부상 소유자로 처리합니다.");
    } else {
      return {
        type: "trustee",
        name: input.actualOwner,
        legalBasis: PROPERTY.TAXPAYER_TRUSTEE,
        warnings,
      };
    }
  }

  // ── 2순위: 사실상 소유자 (§107① 단서) ──
  if (input.actualOwner && input.actualOwner !== input.registeredOwner) {
    warnings.push(
      `공부상 소유자(${input.registeredOwner})와 사실상 소유자(${input.actualOwner})가 다릅니다. ` +
      "사실상 소유자를 납세의무자로 봅니다.",
    );
    return {
      type: "actual_owner",
      name: input.actualOwner,
      legalBasis: PROPERTY.TAXPAYER_PRINCIPLE,
      warnings,
    };
  }

  // ── 3순위: 상속 미등기 → 주된 상속인 (§107②) — §107③보다 우선 ──
  if (input.isInheritanceUnregistered) {
    const heirs = input.heirs ?? [];
    if (heirs.length === 0) {
      warnings.push("상속 미등기 재산이지만 상속인 정보가 없습니다. 공부상 소유자로 처리합니다.");
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

  // ── 4순위: 공유재산 → 공유자 (§107③, 안분은 distributeCoOwnershipTax에서) ──
  if (input.coOwnershipShares && input.coOwnershipShares.length > 1) {
    // 공유의 경우 대표 납세의무자로 지분 최대자
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
      legalBasis: PROPERTY.TAXPAYER_CO_OWNER,
      warnings,
    };
  }

  // ── 6순위 (기본): 공부상 소유자 (§107① 원칙) ──
  return {
    type: "registered_owner",
    name: input.registeredOwner,
    legalBasis: PROPERTY.TAXPAYER_PRINCIPLE,
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
