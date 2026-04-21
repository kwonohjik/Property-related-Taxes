/**
 * 토지 지목 판정 (§168-7)
 *
 * PDF p.1697 1단계: "사실상 현황에 의한다. 다만 사실상 현황이 불분명한 경우 공부상 등재현황."
 *
 * 입력의 landType을 PDF 카테고리 그룹(farmland/forest/pasture/housing/villa/other_land)
 * 으로 분류. 별도 `registeredLandType` 필드는 향후 확장.
 */

import type { LandCategoryGroup, LandType, NonBusinessLandInput } from "./types";
import { isFarmlandType } from "./types";

export interface LandCategoryResult {
  category: LandType;
  categoryGroup: LandCategoryGroup;
  categoryLabel: string;
  detail: string;
  legalBasis: string;
}

const LAND_TYPE_LABELS: Record<LandType, string> = {
  farmland: "농지",
  paddy: "답(논)",
  field: "전(밭)",
  orchard: "과수원",
  forest: "임야",
  pasture: "목장용지",
  vacant_lot: "나대지",
  building_site: "건물 부수 토지",
  housing_site: "주택 부수 토지",
  villa_land: "별장 부수 토지",
  other_land: "기타토지(나대지·잡종지)",
  miscellaneous: "잡종지",
  other: "기타",
};

export function getLandCategoryGroup(landType: LandType): LandCategoryGroup {
  if (isFarmlandType(landType)) return "farmland";
  if (landType === "forest") return "forest";
  if (landType === "pasture") return "pasture";
  if (landType === "housing_site" || landType === "building_site") return "housing";
  if (landType === "villa_land") return "villa";
  if (
    landType === "other_land" ||
    landType === "vacant_lot" ||
    landType === "miscellaneous"
  ) {
    return "other_land";
  }
  return "unknown";
}

export function classifyLandCategory(input: NonBusinessLandInput): LandCategoryResult {
  const category = input.landType;
  const categoryGroup = getLandCategoryGroup(category);
  const categoryLabel = LAND_TYPE_LABELS[category] ?? "기타";
  return {
    category,
    categoryGroup,
    categoryLabel,
    detail: `사실상 지목: ${categoryLabel}`,
    legalBasis: "시행령 §168조의7",
  };
}
