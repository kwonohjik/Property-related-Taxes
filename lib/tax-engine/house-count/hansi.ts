/**
 * 취득 주택 자체 한시 특례 카운트 제외 모듈 (P3-1.5)
 *
 * 지방세법 시행령 §28의4② — 취득 주택 자체가 한시 특례 대상이면 취득 후에도 카운트에서 제외:
 *
 * 1호: 2024.1.10~2027.12.31 신축 60㎡·3억(수도권 6억) 이하
 *      다가구·연립·다세대·도시형생활주택
 * 2호: 2024.1.10~2027.12.31 유상승계 + 임대사업자 등록 + 60㎡·3억(6억) 이하
 * 3호: 2024.1.10~2025.12.31 수도권 외 미분양 아파트 (85㎡·6억 이하)
 *
 * 다가구주택 60㎡ 판정:
 *   건축물대장에 호수별 전용면적 구분 기재된 경우만 60㎡ 기준 적용
 *   (그렇지 않으면 전체 연면적 기준)
 *
 * 핵심 효과:
 *   취득 주택 자체가 한시 특례 → 취득 후 주택 수에서 미포함
 *   예: 보유 3주택 + 한시 특례 신축 취득 → 4주택이 아닌 3주택 산정
 */

import { ACQUISITION, ACQUISITION_CONST } from "../legal-codes";
import type { PendingAcquisition, ExcludedItem } from "./types";

// ============================================================
// 취득 주택 한시 특례 판정
// ============================================================

export interface HansiBenefitResult {
  /** 취득 주택이 한시 특례 대상인지 */
  isHansiBenefit: boolean;
  /** 한시 특례 유형 */
  benefitType?: "new_build" | "lease_registered" | "unsold_apt";
  /** 제외 항목 정보 */
  excludedItem?: ExcludedItem;
  /** 법적 근거 */
  legalBasis?: string;
  /** 설명 */
  description?: string;
  /** 경고 메시지 */
  warnings: string[];
}

/**
 * [P3-1.5] 취득 주택 자체 한시 특례 판정
 *
 * §28의4②: 취득 주택이 한시 특례 대상이면 취득 후에도 주택 수에서 제외
 *
 * @param pending 취득 대상 주택 정보
 * @param acquisitionDate 취득일 (잔금지급일, YYYY-MM-DD)
 */
export function assessHansiBenefitForPendingAcquisition(
  pending: PendingAcquisition | undefined,
  acquisitionDate: string
): HansiBenefitResult {
  if (!pending) {
    return { isHansiBenefit: false, warnings: [] };
  }

  const warnings: string[] = [];

  // ── 1호: 신축 한시 특례 (§28의4② 1호) ──
  // 2024.1.10~2027.12.31 취득한 신축
  // 조건: 60㎡ 이하 + 3억(수도권 6억) 이하 + 다가구·연립·다세대·도시형생활주택
  if (pending.isHansiBenefitNewBuild) {
    // 기간 요건
    if (
      acquisitionDate >= ACQUISITION_CONST.HANSI_START_DATE &&
      acquisitionDate <= ACQUISITION_CONST.HANSI_NEW_BUILD_END
    ) {
      // 면적 요건: 다가구 건축물대장 구분 기재 여부 확인
      const maxArea = ACQUISITION_CONST.HANSI_NEW_BUILD_MAX_AREA;
      const areaOk = pending.areaSqm !== undefined
        ? (pending.type === "multi_household" && !pending.isMultiHouseholdWithUnitArea)
          // 다가구 + 호별 구분 없으면 전체 연면적 기준 (60㎡ 기준 미적용 → 보수적으로 제외 불가)
          ? false
          : (pending.areaSqm <= maxArea)
        : true; // 면적 미입력 시 조건 충족으로 간주 (경고 추가)

      if (pending.areaSqm === undefined) {
        warnings.push("한시 특례 신축 — 전용면적 미입력. 입력 시 60㎡ 이하 요건이 자동 검증됩니다.");
      }

      // 가격 요건
      const priceLimit = pending.isMetropolitan
        ? ACQUISITION_CONST.HANSI_PRICE_LIMIT_METRO      // 수도권 6억
        : ACQUISITION_CONST.HANSI_PRICE_LIMIT_NON_METRO; // 비수도권 3억
      const priceOk = pending.acquisitionValue <= priceLimit;

      if (areaOk && priceOk) {
        return {
          isHansiBenefit: true,
          benefitType: "new_build",
          excludedItem: {
            assetType: "pending",
            reason: "pending_hansi_new_build",
            legalBasis: ACQUISITION.HOUSE_COUNT_HANSI_NEW_BUILD,
            description: `한시 특례 신축 — 취득일(${acquisitionDate}) + 면적 ${pending.areaSqm ?? "미입력"}㎡ ≤ 60㎡ + 취득가 ${pending.acquisitionValue.toLocaleString()} ≤ ${priceLimit.toLocaleString()}원(${pending.isMetropolitan ? "수도권" : "비수도권"}) → 취득 주택 카운트 제외`,
          },
          legalBasis: ACQUISITION.HOUSE_COUNT_HANSI_NEW_BUILD,
          description: `한시 특례 신축 주택 (§28의4② 1호) — 취득 후에도 주택 수에서 미포함`,
          warnings,
        };
      }

      // 조건 미충족 시 경고
      if (!areaOk) {
        warnings.push(`한시 특례 신축 — 전용면적(${pending.areaSqm}㎡)이 60㎡를 초과하여 카운트 제외 미적용.`);
      }
      if (!priceOk) {
        warnings.push(`한시 특례 신축 — 취득가(${pending.acquisitionValue.toLocaleString()}가 ${priceLimit.toLocaleString()}원을 초과하여 카운트 제외 미적용.`);
      }
    } else {
      warnings.push(`한시 특례 신축 — 취득일(${acquisitionDate})이 한시 기간(2024.1.10~2027.12.31) 외 → 적용 불가.`);
    }
  }

  // ── 2호: 임대등록 한시 특례 (§28의4② 2호) ──
  // 2024.1.10~2027.12.31 유상승계 + 임대사업자 등록
  if (pending.isHansiBenefitLeaseRegistered) {
    if (
      acquisitionDate >= ACQUISITION_CONST.HANSI_START_DATE &&
      acquisitionDate <= ACQUISITION_CONST.HANSI_LEASE_END
    ) {
      const priceLimit = pending.isMetropolitan
        ? ACQUISITION_CONST.HANSI_PRICE_LIMIT_METRO
        : ACQUISITION_CONST.HANSI_PRICE_LIMIT_NON_METRO;
      const areaOk = pending.areaSqm !== undefined
        ? pending.areaSqm <= ACQUISITION_CONST.HANSI_NEW_BUILD_MAX_AREA
        : true;
      const priceOk = pending.acquisitionValue <= priceLimit;

      if (areaOk && priceOk) {
        return {
          isHansiBenefit: true,
          benefitType: "lease_registered",
          excludedItem: {
            assetType: "pending",
            reason: "pending_hansi_lease",
            legalBasis: ACQUISITION.HOUSE_COUNT_HANSI_LEASE,
            description: `한시 특례 임대등록 — 유상승계 + 임대사업자 등록 + 취득일(${acquisitionDate}) → 취득 주택 카운트 제외`,
          },
          legalBasis: ACQUISITION.HOUSE_COUNT_HANSI_LEASE,
          description: `한시 특례 임대등록 주택 (§28의4② 2호) — 취득 후에도 주택 수에서 미포함`,
          warnings,
        };
      }
    }
  }

  // ── 3호: 미분양 아파트 한시 특례 (§28의4② 3호) ──
  // 2024.1.10~2025.12.31 수도권 외 85㎡·6억 이하 미분양 아파트
  if (pending.isHansiBenefitUnsoldApt) {
    if (
      acquisitionDate >= ACQUISITION_CONST.HANSI_START_DATE &&
      acquisitionDate <= ACQUISITION_CONST.HANSI_UNSOLD_END
    ) {
      // 수도권 제외 (비수도권만)
      if (!pending.isMetropolitan) {
        const areaOk = pending.areaSqm !== undefined
          ? pending.areaSqm <= ACQUISITION_CONST.HANSI_UNSOLD_MAX_AREA
          : true;
        const priceOk = pending.acquisitionValue <= ACQUISITION_CONST.HANSI_UNSOLD_PRICE_LIMIT;

        if (areaOk && priceOk) {
          return {
            isHansiBenefit: true,
            benefitType: "unsold_apt",
            excludedItem: {
              assetType: "pending",
              reason: "pending_hansi_unsold",
              legalBasis: ACQUISITION.HOUSE_COUNT_HANSI_UNSOLD,
              description: `한시 특례 미분양 아파트 — 비수도권 85㎡·6억 이하 + 취득일(${acquisitionDate}) → 취득 주택 카운트 제외`,
            },
            legalBasis: ACQUISITION.HOUSE_COUNT_HANSI_UNSOLD,
            description: `한시 특례 미분양 아파트 (§28의4② 3호) — 취득 후에도 주택 수에서 미포함`,
            warnings,
          };
        }

        if (!areaOk) {
          warnings.push(`한시 미분양 아파트 — 면적(${pending.areaSqm}㎡)이 85㎡를 초과 → 적용 불가.`);
        }
        if (!priceOk) {
          warnings.push(`한시 미분양 아파트 — 취득가(${pending.acquisitionValue.toLocaleString()}가 6억원 초과 → 적용 불가.`);
        }
      } else {
        warnings.push("한시 미분양 아파트 특례 — 수도권 주택은 적용 불가 (비수도권 한정).");
      }
    } else {
      warnings.push(`한시 미분양 아파트 — 취득일(${acquisitionDate})이 한시 기간(2024.1.10~2025.12.31) 외 → 적용 불가.`);
    }
  }

  return { isHansiBenefit: false, warnings };
}
