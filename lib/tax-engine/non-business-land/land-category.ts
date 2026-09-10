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
  if (landType === "housing_site") return "housing";
  // A-BS-1 정정(2026-08-05) — 건물(비주택) 부수토지는 「지방세법 시행령」 §101①2호 소관이다.
  // 종전에는 housing으로 묶여 「소득세법 시행령」 §168의12(주택) 배율이 적용됐다(22개 조합 중 19개 상이).
  if (landType === "building_site") return "building_site";
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

/**
 * 그 지목이 **양도일 의제(§168의14②)를 실제로 소비하는가**.
 *
 * 의제일은 §168의6 **기간기준에만** 작용한다(법문 「해당 날을 양도일로 보아 제168조의6을
 * 적용한다」). 그런데 지목별 judge 중 `getPeriodJudgmentDate`를 부르는 것은
 * 농지·임야·목장·별장·기타토지뿐이고, **주택부수토지·건물부수토지는 부르지 않는다** —
 * 이 둘의 판정축은 §168의12·「지방세법 시행령」 §101①2호의 **배율 × 정착면적**이라
 * 기간을 앞당길 대상 자체가 없기 때문이다.
 *
 * 🔴 이 술어가 없던 동안 `assemble()`은 지목을 보지 않고 `deemedTransfer`를 실었고,
 *    결과 카드가 「…을 양도일로 보아 기간기준(§168의6)을 판정했습니다」라고 **단정**했다.
 *    적용되지 않은 의제를 적용했다고 말한 것이다(F-1).
 *
 * ⚠️ **제외 지목을 열거한다**(소비 지목 열거가 아니라). 잘못 실으면 표시 1줄이 틀리지만
 *    잘못 지우면 실제로 소비하는 지목의 근거가 사라진다 — 보수적 방향은 「덜 지우는」 쪽이다.
 *
 * ⑤ 렌더 게이트와 ⑧ 검증도 이 술어에 위임한다(`lib/calc/nbl-deemed-transfer-scope.ts`).
 * 게이트를 한 곳에서만 바꾸면 같은 병이 재발한다(R11).
 */
export function consumesPeriodJudgmentDate(landType: LandType | "" | undefined): boolean {
  if (!landType) return false;
  const group = getLandCategoryGroup(landType);
  return group !== "housing" && group !== "building_site";
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
