/**
 * 주택 수 제외 11종 + 한시 특례 판정 모듈 (P3-1)
 *
 * 지방세법 시행령 §28의4⑥ + §28의2 매핑:
 *   제외 11종은 보유 주택·입주권·분양권·오피스텔에 적용
 *   (취득 대상 주택에는 §28의4② 한시 특례 별도 적용)
 *
 * 제외 항목 번호 기준:
 *   1. 시가표준액 한도 (수도권 1억 / 비수도권 2억 — 2025.1.2. 전 취득 주택은 전국 1억)
 *   2. 노인복지주택
 *   3. 문화유산·천연기념물
 *   4. 농어촌 주택
 *   5. 수도권 외 미분양 아파트 (한시)
 *   6. 멸실 목적 미분양 시공자 취득 (3년)
 *   7. 채권변제(경매·공매) 취득
 *   8. 공공지원민간임대주택
 *   9. 인구감소지역 임대주택
 *  10. 사원임대용 주택
 *  11. 상속 5년 미경과 (§28의4⑥3호)
 *  12. 혼인 전 분양권 (§28의4⑥10호, 2026.12.31까지)
 *  13. 한시 특례 신축 (§28의4⑥11호)
 *  14. 시가표준액 1억 이하 오피스텔
 */

import { ACQUISITION, ACQUISITION_CONST } from "../legal-codes";
import { isExcludedBy5YearRule } from "./inheritance";
import { getLowValueHouseLimit, describeLowValueHouseLimit } from "../acquisition-surcharge/low-value-limit";
import type {
  OwnedHouseInfo,
  RightAsset,
  OfficeAsset,
  ExcludedItem,
  ExclusionReason,
} from "./types";

// ============================================================
// 시가표준액 저가 주택 제외 판정
// ============================================================

/**
 * [P1-4 + P3-1] 시가표준액 1억/2억 이하 주택 수 제외 판정 (§28의4⑥1호가목 → §28의2 1호)
 *
 * 수도권 1억 이하 / 수도권 외 2억 이하. 단, 정비구역(재개발·재건축·소규모정비) 소재 주택은 제외 불가.
 * 수도권 외 2억은 **취득하는 주택**의 취득일이 2025.1.2. 이후일 때만 — 그 전은 전국 1억
 * (대통령령 제35477호 부칙 제2조, `getLowValueHouseLimit`).
 *
 * @param standardValue 시가표준액 (원)
 * @param isMetropolitan 수도권 여부
 * @param isUrbanRegenerationArea 정비구역 소재 여부
 * @param taxableHouseAcquisitionDate 취득하는 주택의 취득일 (YYYY-MM-DD)
 */
export function isExcludedByLowValue(
  standardValue: number,
  isMetropolitan: boolean,
  isUrbanRegenerationArea: boolean | undefined,
  taxableHouseAcquisitionDate: string
): boolean {
  // 정비구역은 제외 불가 (§28의2 1호 단서)
  if (isUrbanRegenerationArea) return false;

  return standardValue <= getLowValueHouseLimit(isMetropolitan, taxableHouseAcquisitionDate);
}

/**
 * 법률 제17473호 부칙 제3조·제7조 — 조합원입주권·주택분양권·오피스텔(§13의3 2~4호)은
 * 2020.8.12. 이후 취득분만 주택 수에 넣는다(제3조). 그 전에 매매계약(오피스텔 분양계약 포함)을
 * 체결했으면 취득일이 그 이후여도 넣지 않는다(제7조).
 */
function isBeforeRightOfficeCounting(
  acquisitionDate: string | undefined,
  contractDate: string | undefined
): boolean {
  const from = ACQUISITION_CONST.HOUSE_COUNT_RIGHT_OFFICE_FROM;
  return (!!acquisitionDate && acquisitionDate < from) || (!!contractDate && contractDate < from);
}

function preRightOfficeCountingItem(
  assetId: string | undefined,
  assetType: "right" | "office",
  acquisitionDate: string | undefined,
  contractDate: string | undefined
): ExcludedItem {
  const which = contractDate && contractDate < ACQUISITION_CONST.HOUSE_COUNT_RIGHT_OFFICE_FROM
    ? `매매·분양계약일(${contractDate})`
    : `취득일(${acquisitionDate})`;
  return {
    assetId,
    assetType,
    reason: "pre_2020_08_12_right_office",
    legalBasis: ACQUISITION.HOUSE_COUNT_RIGHT_OFFICE_APPLICATION,
    description: `${which}이 2020.8.12. 전 → 입주권·분양권·오피스텔 주택 수 가산 미적용 (${ACQUISITION.HOUSE_COUNT_RIGHT_OFFICE_APPLICATION})`,
  };
}

// ============================================================
// 한시 특례 판정 (보유 주택 적용 — §28의4⑥11호)
// ============================================================

/**
 * [P3-1] 보유 주택이 한시 특례 신축 주택인지 판정
 *
 * §28의4⑥11호 준용:
 * 2024.1.10~2027.12.31 취득한 60㎡·3억(수도권 6억) 이하
 * 다가구·연립·다세대·도시형생활주택 → 주택 수 제외
 *
 * @param house 보유 주택 정보
 * @param referenceDate 산정 기준일 (YYYY-MM-DD)
 */
export function isExcludedByHansiNewBuild(
  house: OwnedHouseInfo,
  referenceDate: string
): boolean {
  if (!house.isHansiBenefitNewBuild) return false;

  // 한시 기간: 2024.1.10 ~ 2027.12.31
  const acqDate = house.acquisitionDate;
  if (acqDate < ACQUISITION_CONST.HANSI_START_DATE) return false;
  if (acqDate > ACQUISITION_CONST.HANSI_NEW_BUILD_END) return false;

  // 기준일 기준으로도 유효 (한시 기간 내 취득이면 이후에도 제외 유지)
  void referenceDate; // 취득일 기준으로 판정 (기준일 미사용)
  return true;
}

// ============================================================
// 보유 주택 제외 판정 (11종 통합)
// ============================================================

/**
 * [P3-1] 보유 주택 개별 항목의 제외 사유 판정
 *
 * @param house 보유 주택 정보
 * @param referenceDate 주택 수 산정 기준일 (YYYY-MM-DD)
 * @returns 제외 사유 목록 (빈 배열이면 카운트 포함)
 */
export function getExclusionReasonsForHouse(
  house: OwnedHouseInfo,
  referenceDate: string,
  taxableHouseAcquisitionDate: string
): ExcludedItem[] {
  const excluded: ExcludedItem[] = [];

  // 1. 시가표준액 한도 (수도권 1억 / 수도권 외 2억 — 2025.1.2. 전 취득은 전국 1억)
  if (
    isExcludedByLowValue(
      house.standardValue,
      house.isMetropolitan,
      house.isUrbanRegenerationArea,
      taxableHouseAcquisitionDate
    )
  ) {
    const limit = getLowValueHouseLimit(house.isMetropolitan, taxableHouseAcquisitionDate);
    const reason: ExclusionReason = house.isMetropolitan ? "low_value_metro" : "low_value_non_metro";
    excluded.push({
      assetId: house.id,
      assetType: "house",
      reason,
      legalBasis: ACQUISITION.HOUSE_COUNT_LOW_VALUE,
      description: `시가표준액 ${house.standardValue.toLocaleString()} ≤ ${limit.toLocaleString()}원(${describeLowValueHouseLimit(house.isMetropolitan, taxableHouseAcquisitionDate)} 기준) → 주택 수 제외`,
    });
    return excluded; // 저가 기준 해당 시 다른 제외 사유와 중복 검사 불필요
  }

  // 2. 노인복지주택
  if (house.isElderHousing) {
    excluded.push({
      assetId: house.id,
      assetType: "house",
      reason: "elder_housing",
      legalBasis: ACQUISITION.HOUSE_COUNT_ELDER_HOUSING,
      description: "노인복지주택 → 주택 수 제외",
    });
    return excluded;
  }

  // 3. 문화유산·천연기념물
  if (house.isCulturalHeritage) {
    excluded.push({
      assetId: house.id,
      assetType: "house",
      reason: "cultural_heritage",
      legalBasis: ACQUISITION.HOUSE_COUNT_CULTURAL_HERITAGE,
      description: "문화유산·천연기념물 주택 → 주택 수 제외",
    });
    return excluded;
  }

  // 4. 농어촌 주택
  if (house.isFarmlandRural) {
    excluded.push({
      assetId: house.id,
      assetType: "house",
      reason: "farmland_rural",
      legalBasis: ACQUISITION.HOUSE_COUNT_FARMLAND_RURAL,
      description: `농어촌 주택 (대지 ${ACQUISITION_CONST.FARMLAND_RURAL_MAX_LAND_AREA}㎡·연면적 ${ACQUISITION_CONST.FARMLAND_RURAL_MAX_FLOOR_AREA}㎡·${ACQUISITION_CONST.FARMLAND_RURAL_MAX_VALUE.toLocaleString()} 이내) → 주택 수 제외`,
    });
    return excluded;
  }

  // 5. 수도권 외 미분양 아파트
  if (house.isUnsoldAptNonMetro) {
    excluded.push({
      assetId: house.id,
      assetType: "house",
      reason: "unsold_apt_non_metro",
      legalBasis: ACQUISITION.HOUSE_COUNT_UNSOLD_APT,
      description: "수도권 외 미분양 아파트 한시 (85㎡·6억 이하) → 주택 수 제외",
    });
    return excluded;
  }

  // 6. 멸실 목적 미분양 시공자 취득 (3년)
  if (house.isUnsoldFromConstructor) {
    excluded.push({
      assetId: house.id,
      assetType: "house",
      reason: "unsold_constructor",
      legalBasis: ACQUISITION.HOUSE_COUNT_DEMOLITION,
      description: "멸실 목적 미분양 시공자 취득 (3년 한정) → 주택 수 제외",
    });
    return excluded;
  }

  // 7. 채권변제(경매·공매) 취득 (3년 내 처분 조건)
  if (house.isCreditorAcquisition) {
    excluded.push({
      assetId: house.id,
      assetType: "house",
      reason: "creditor_acquisition",
      legalBasis: ACQUISITION.SURCHARGE_EXCLUSION,
      description: "채권변제(경매·공매) 취득 → 주택 수 제외",
    });
    return excluded;
  }

  // 8. 공공지원민간임대주택 (임대사업자 등록)
  if (house.isPublicSupportedLeaseRegistered) {
    excluded.push({
      assetId: house.id,
      assetType: "house",
      reason: "public_supported_lease",
      legalBasis: ACQUISITION.SURCHARGE_EXCLUSION,
      description: "공공지원민간임대주택 (임대사업자 등록) → 주택 수 제외",
    });
    return excluded;
  }

  // 9. 인구감소지역 임대주택 (60일 내 등록)
  if (house.isPopulationDeclineLease) {
    excluded.push({
      assetId: house.id,
      assetType: "house",
      reason: "population_decline_lease",
      legalBasis: ACQUISITION.SURCHARGE_EXCLUSION,
      description: "인구감소지역 임대주택 (60일 내 임대사업자 등록) → 주택 수 제외",
    });
    return excluded;
  }

  // 10. 사원임대용 주택 (60㎡ 이하 공동주택)
  if (house.isStaffRentalHousing) {
    excluded.push({
      assetId: house.id,
      assetType: "house",
      reason: "staff_rental",
      legalBasis: ACQUISITION.SURCHARGE_EXCLUSION,
      description: "사원임대용 주택 (60㎡ 이하 공동주택, 1년 내 직접 사용) → 주택 수 제외",
    });
    return excluded;
  }

  // 11. 상속 5년 미경과 (§28의4⑥3호)
  if (house.inheritanceDate && isExcludedBy5YearRule(house.inheritanceDate, referenceDate)) {
    // 공동상속의 경우 주된 상속자이더라도 5년 미경과이면 제외
    excluded.push({
      assetId: house.id,
      assetType: "house",
      reason: "inheritance_under_5yr",
      legalBasis: ACQUISITION.HOUSE_COUNT_INHERITANCE_5YR,
      description: `상속개시일(${house.inheritanceDate})부터 5년 미경과 → 주택 수 제외 (${ACQUISITION.HOUSE_COUNT_INHERITANCE_5YR})`,
    });
    return excluded;
  }

  // 한시 특례 신축 보유 주택 (§28의4⑥11호)
  if (isExcludedByHansiNewBuild(house, referenceDate)) {
    excluded.push({
      assetId: house.id,
      assetType: "house",
      reason: "hansi_new_build",
      legalBasis: ACQUISITION.HOUSE_COUNT_HANSI_EXCLUSION,
      description: `한시 특례 신축 주택(취득일 ${house.acquisitionDate}) — 2024.1.10~2027.12.31 60㎡·3억(수도권 6억) 이하 → 주택 수 제외`,
    });
    return excluded;
  }

  // 한시 특례 임대등록 (§28의4⑥11호 준용)
  if (house.isHansiBenefitLeaseRegistered) {
    const acqDate = house.acquisitionDate;
    if (acqDate >= ACQUISITION_CONST.HANSI_START_DATE && acqDate <= ACQUISITION_CONST.HANSI_LEASE_END) {
      excluded.push({
        assetId: house.id,
        assetType: "house",
        reason: "hansi_lease_registered",
        legalBasis: ACQUISITION.HOUSE_COUNT_HANSI_LEASE,
        description: `한시 특례 임대등록 주택 — 2024.1.10~2027.12.31 유상승계 + 임대사업자 등록 → 주택 수 제외`,
      });
      return excluded;
    }
  }

  // 한시 특례 미분양 아파트 (§28의4⑥11호 준용)
  if (house.isHansiBenefitUnsoldApt) {
    const acqDate = house.acquisitionDate;
    if (acqDate >= ACQUISITION_CONST.HANSI_START_DATE && acqDate <= ACQUISITION_CONST.HANSI_UNSOLD_END) {
      excluded.push({
        assetId: house.id,
        assetType: "house",
        reason: "hansi_unsold_apt",
        legalBasis: ACQUISITION.HOUSE_COUNT_HANSI_UNSOLD,
        description: `한시 특례 미분양 아파트 — 2024.1.10~2025.12.31 수도권 외 85㎡·6억 이하 → 주택 수 제외`,
      });
      return excluded;
    }
  }

  return excluded;
}

// ============================================================
// 입주권·분양권 제외 판정
// ============================================================

/**
 * [P3-1] 입주권·분양권 제외 사유 판정
 *
 * @param right 입주권·분양권 정보
 * @param referenceDate 주택 수 산정 기준일 (YYYY-MM-DD)
 */
export function getExclusionReasonsForRight(
  right: RightAsset,
  referenceDate: string
): ExcludedItem[] {
  const excluded: ExcludedItem[] = [];

  // 2020.8.12. 전 취득·계약 (법률 제17473호 부칙 제3조·제7조)
  if (isBeforeRightOfficeCounting(right.rightAcquisitionDate, right.contractDate)) {
    excluded.push(
      preRightOfficeCountingItem(right.id, "right", right.rightAcquisitionDate, right.contractDate)
    );
    return excluded;
  }

  // 상속 5년 미경과 (§28의4⑥3호)
  if (right.inheritanceDate && isExcludedBy5YearRule(right.inheritanceDate, referenceDate)) {
    excluded.push({
      assetId: right.id,
      assetType: "right",
      reason: "inheritance_under_5yr",
      legalBasis: ACQUISITION.HOUSE_COUNT_INHERITANCE_5YR,
      description: `상속 입주권·분양권 — 상속개시일(${right.inheritanceDate})부터 5년 미경과 → 주택 수 제외`,
    });
    return excluded;
  }

  // 혼인 전 분양권 (§28의4⑥10호, 2026.12.31까지 한시)
  if (right.isPreMarriageSubscriptionRight && right.type === "subscription_right") {
    // 한시 기간 판단: referenceDate ≤ 2026.12.31
    if (referenceDate <= ACQUISITION_CONST.PRE_MARRIAGE_RIGHT_HANSI_END) {
      excluded.push({
        assetId: right.id,
        assetType: "right",
        reason: "pre_marriage_subscription_right",
        legalBasis: ACQUISITION.HOUSE_COUNT_PRE_MARRIAGE_RIGHT,
        description: `혼인 전 배우자 분양권 — 2026.12.31까지 한시 적용 → 주택 수 제외 (${ACQUISITION.HOUSE_COUNT_PRE_MARRIAGE_RIGHT})`,
      });
      return excluded;
    }
  }

  return excluded;
}

// ============================================================
// 오피스텔 제외 판정
// ============================================================

/**
 * [P3-1] 주거형 오피스텔 — 시가표준액 1억 이하 제외
 *
 * 시가표준액 1억 초과만 주택 수 카운트.
 * 시가표준액 1억 이하 오피스텔은 카운트에서 제외.
 *
 * @param office 오피스텔 정보
 * @param referenceDate 주택 수 산정 기준일 (YYYY-MM-DD)
 */
export function getExclusionReasonsForOffice(
  office: OfficeAsset,
  referenceDate: string
): ExcludedItem[] {
  const excluded: ExcludedItem[] = [];

  // 2020.8.12. 전 취득·계약 (법률 제17473호 부칙 제3조·제7조)
  if (isBeforeRightOfficeCounting(office.acquisitionDate, office.contractDate)) {
    excluded.push(
      preRightOfficeCountingItem(office.id, "office", office.acquisitionDate, office.contractDate)
    );
    return excluded;
  }

  // 상속 5년 미경과 (§28의4⑥3호 준용)
  if (office.inheritanceDate && isExcludedBy5YearRule(office.inheritanceDate, referenceDate)) {
    excluded.push({
      assetId: office.id,
      assetType: "office",
      reason: "inheritance_under_5yr",
      legalBasis: ACQUISITION.HOUSE_COUNT_INHERITANCE_5YR,
      description: `상속 오피스텔 — 상속개시일(${office.inheritanceDate})부터 5년 미경과 → 주택 수 제외`,
    });
    return excluded;
  }

  // 시가표준액 1억 이하 오피스텔 → 카운트 제외
  if (office.standardValue <= ACQUISITION_CONST.OFFICE_COUNT_MIN_STD_VALUE) {
    excluded.push({
      assetId: office.id,
      assetType: "office",
      reason: "low_value_office",
      legalBasis: ACQUISITION.HOUSE_COUNT_LOW_VALUE,
      description: `주거형 오피스텔 시가표준액 ${office.standardValue.toLocaleString()} ≤ 1억원 → 주택 수 카운트 제외`,
    });
    return excluded;
  }

  return excluded;
}
