/**
 * 재산세 비과세·감면 판정 모듈 (P2-06~07)
 *
 * 판정 우선순위:
 *   1. 비과세 (지방세법 §109) — 해당 시 과세 자체가 없음
 *   2. 감면 (지방세특례제한법) — 산출세액에서 감면율 차감
 *
 * 과세대상 판정(property-object.ts)에서 먼저 호출됨
 */

import { PROPERTY, PROPERTY_EXEMPT } from "./legal-codes";
import type {
  PropertyObjectInput,
  PropertyTaxExemption,
  PropertyTaxReduction,
} from "./types/property-object.types";

// ============================================================
// 출력 타입
// ============================================================

export interface ExemptionResult {
  /** 비과세 해당 여부 */
  isExempt: boolean;
  /** 비과세 사유 */
  exemptionType?: PropertyTaxExemption;
  /** 법령 근거 */
  legalBasis: string;
  /** 비과세 이유 설명 */
  reason: string;
}

export interface ReductionResult {
  /** 감면 해당 여부 */
  hasReduction: boolean;
  /** 감면 유형 */
  reductionType?: PropertyTaxReduction;
  /** 감면율 (0~1) */
  reductionRate: number;
  /** 법령 근거 */
  legalBasis: string;
  /** 감면 설명 */
  reason: string;
}

// ============================================================
// P2-06: checkPropertyTaxExemption — §109 비과세 8종
// ============================================================

/**
 * 재산세 비과세 판정 (지방세법 §109)
 *
 * 8가지 비과세 사유를 우선순위 순서로 확인합니다.
 * 비과세에 해당하면 세액 계산 없이 조기 반환합니다.
 *
 * @param input 과세대상 판정 입력
 * @returns ExemptionResult
 */
export function checkPropertyTaxExemption(
  input: Pick<
    PropertyObjectInput,
    "ownerType" | "landInfo" | "buildingInfo" | "houseInfo"
  > & {
    isTemporaryBuilding?: boolean;
    isBuildingToBeDemolished?: boolean;
    isReligiousNonprofitUse?: boolean;
    isMilitaryUse?: boolean;
    isForeignGovernment?: boolean;
    isGovernmentFreeUse?: boolean;  // 국가 등 1년+ 무상사용
    landUse?: string;               // 직접 입력 편의 (landInfo 없을 시)
  }
): ExemptionResult {

  // ① 국가·지방자치단체 소유 (§109①1호)
  if (input.ownerType === "government") {
    return {
      isExempt: true,
      exemptionType: "government_owned",
      legalBasis: PROPERTY.NON_TAXABLE_GOVERNMENT,
      reason: "국가·지방자치단체 소유 재산은 재산세 비과세 대상입니다.",
    };
  }

  // ② 외국정부 소유 (상호주의, §109①)
  if (input.isForeignGovernment) {
    return {
      isExempt: true,
      exemptionType: "foreign_government",
      legalBasis: PROPERTY.NON_TAXABLE_GOVERNMENT,
      reason: "외국정부 소유 재산 (상호주의 적용) 비과세 대상입니다.",
    };
  }

  // ③ 군사 목적 사용 (§109①)
  if (input.isMilitaryUse) {
    return {
      isExempt: true,
      exemptionType: "military_use",
      legalBasis: PROPERTY.NON_TAXABLE_GOVERNMENT,
      reason: "군사 목적으로 사용되는 재산은 재산세 비과세 대상입니다.",
    };
  }

  // ④ 국가 등 1년 이상 무상사용 (§109①)
  if (input.isGovernmentFreeUse) {
    return {
      isExempt: true,
      exemptionType: "government_free_use",
      legalBasis: PROPERTY.NON_TAXABLE_GOVERNMENT,
      reason: "국가·지자체 등에 1년 이상 무상으로 사용하게 한 재산은 비과세 대상입니다.",
    };
  }

  // ⑤ 도로·하천·제방·구거·유지·묘지 (공공용 토지, §109③)
  const landUse = input.landUse ?? input.landInfo?.landUse ?? "";
  const PUBLIC_LAND_USES = ["도로", "하천", "제방", "구거", "유지", "묘지", "road", "river", "cemetery"];
  if (PUBLIC_LAND_USES.some((u) => landUse.includes(u))) {
    return {
      isExempt: true,
      exemptionType: "public_use_land",
      legalBasis: PROPERTY.NON_TAXABLE_PUBLIC_LAND,
      reason: "도로·하천·제방·구거·유지·묘지 등 공공용 토지는 재산세 비과세 대상입니다.",
    };
  }

  // ⑥ 임시건축물 (존치기간 1년 미만, §109②)
  if (input.isTemporaryBuilding) {
    return {
      isExempt: true,
      exemptionType: "temporary_building",
      legalBasis: PROPERTY.NON_TAXABLE_SPECIAL,
      reason: "존치기간 1년 미만 임시건축물은 재산세 비과세 대상입니다.",
    };
  }

  // ⑦ 철거 예정 건축물 (§109②)
  if (input.isBuildingToBeDemolished) {
    return {
      isExempt: true,
      exemptionType: "building_to_be_demolished",
      legalBasis: PROPERTY.NON_TAXABLE_SPECIAL,
      reason: "철거 예정 건축물로 지방자치단체장이 확인한 경우 비과세 대상입니다.",
    };
  }

  // ⑧ 종교·제사·자선·학술·기예 용도 (§109②)
  if (input.isReligiousNonprofitUse) {
    return {
      isExempt: true,
      exemptionType: "religious_nonprofit_use",
      legalBasis: PROPERTY.NON_TAXABLE_SPECIAL,
      reason: "종교·제사·자선·학술·기예 등 공익 목적으로 사용되는 재산은 비과세 대상입니다.",
    };
  }

  return {
    isExempt: false,
    legalBasis: "",
    reason: "",
  };
}

// ============================================================
// P2-07: checkPropertyTaxReduction — 지특법 감면 6종
// ============================================================

/**
 * 재산세 감면 판정 (지방세특례제한법)
 *
 * 감면은 비과세와 달리 산출세액에서 감면율만큼 차감합니다.
 * 복수 감면 사유가 있을 경우 납세자에게 가장 유리한 1건 선택 (§127② 준용).
 *
 * @returns ReductionResult (reductionRate: 0이면 감면 없음)
 */
export function checkPropertyTaxReduction(
  input: Pick<PropertyObjectInput, "ownerType" | "objectType"> & {
    isPublicRentalHousing?: boolean;       // 공공임대주택 (50~100% 감면)
    isLongTermRentalHousing?: boolean;     // 장기임대주택 (25~50% 감면)
    isSmallBusinessFactory?: boolean;      // 중소기업 공장 (35% 감면)
    isCulturalHeritage?: boolean;          // 문화재 (50% 감면)
    isDisabledPersonResidence?: boolean;   // 장애인 거주용 주택 (50% 감면)
    isMultiChildFamily?: boolean;          // 다자녀 가구 주택 (5~50% 감면)
    multiChildCount?: number;              // 자녀 수 (다자녀 감면율 결정)
  }
): ReductionResult {

  const candidates: ReductionResult[] = [];

  // ① 공공임대주택 — 전용면적·임대 기간에 따라 25~100%
  if (input.isPublicRentalHousing) {
    candidates.push({
      hasReduction: true,
      reductionType: "public_rental_housing",
      reductionRate: 0.50,
      legalBasis: PROPERTY_EXEMPT.PUBLIC_RENTAL_HOUSING,
      reason: "공공임대주택 재산세 50% 감면",
    });
  }

  // ② 장기임대주택 — 임대 등록 요건 충족 시 25~50%
  if (input.isLongTermRentalHousing) {
    candidates.push({
      hasReduction: true,
      reductionType: "long_term_rental_housing",
      reductionRate: 0.25,
      legalBasis: PROPERTY_EXEMPT.LONG_TERM_RENTAL_HOUSING,
      reason: "장기임대주택 재산세 25% 감면",
    });
  }

  // ③ 중소기업 공장 — 35% 감면
  if (input.isSmallBusinessFactory && input.objectType === "building") {
    candidates.push({
      hasReduction: true,
      reductionType: "small_business_factory",
      reductionRate: 0.35,
      legalBasis: PROPERTY_EXEMPT.SMALL_BUSINESS_FACTORY,
      reason: "중소기업 공장 재산세 35% 감면",
    });
  }

  // ④ 문화재 — 50% 감면
  if (input.isCulturalHeritage) {
    candidates.push({
      hasReduction: true,
      reductionType: "cultural_heritage",
      reductionRate: 0.50,
      legalBasis: PROPERTY_EXEMPT.CULTURAL_HERITAGE,
      reason: "국가·시도 지정 문화재 재산세 50% 감면",
    });
  }

  // ⑤ 장애인 거주용 주택 — 50% 감면
  if (input.isDisabledPersonResidence && input.objectType === "house") {
    candidates.push({
      hasReduction: true,
      reductionType: "disabled_person_residence",
      reductionRate: 0.50,
      legalBasis: PROPERTY_EXEMPT.DISABLED_PERSON_RESIDENCE,
      reason: "장애인 거주용 주택 재산세 50% 감면",
    });
  }

  // ⑥ 다자녀 가구 — 자녀 수에 따라 5~50%
  if (input.isMultiChildFamily && input.objectType === "house") {
    const count = input.multiChildCount ?? 2;
    const reductionRate = count >= 3 ? 0.50 : count >= 2 ? 0.25 : 0.05;
    candidates.push({
      hasReduction: true,
      reductionType: "multi_child_family",
      reductionRate,
      legalBasis: PROPERTY_EXEMPT.MULTI_CHILD_FAMILY,
      reason: `다자녀(${count}명) 가구 주택 재산세 ${reductionRate * 100}% 감면`,
    });
  }

  if (candidates.length === 0) {
    return {
      hasReduction: false,
      reductionRate: 0,
      legalBasis: "",
      reason: "",
    };
  }

  // 납세자 유리한 1건 선택 (감면율 최대)
  return candidates.reduce((best, cur) =>
    cur.reductionRate > best.reductionRate ? cur : best
  );
}
