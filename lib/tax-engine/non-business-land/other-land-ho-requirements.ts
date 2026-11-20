/**
 * 기타토지 §168의11① 호별 **면적 외 요건** — 엔진 입력으로 판정할 수 있는 것만 판정한다 (NBL2611-B4 · R09, Q-6 (다)).
 *
 *   · 5호 나목  「도시지역의 주거지역·상업지역 및 공업지역 안에 소재하지 아니할 것」 — `zoneType`으로 판정 (V7-DM02)
 *   · 13호      「나지」 = 제1호~제12호에 해당하지 아니하는 토지로서 어느 용도로도 사용되고 있지 아니한 토지 — 건축물(시설물)이 있으면 나지가 아니다 (V9-DM11)
 *
 * 입력으로 판정할 수 없는 요건(5호 가·다·라목, 13호 무주택·1필지·신축 가능)은 «자기 선언 — 확인 필요» 고지로만 남긴다.
 * 순수 함수 — DB를 부르지 않는다.
 */
import { NBL } from "../legal-codes";
import { NBL_RESERVE_FORCES_SELF_DECLARED_NOTICE, NBL_VACANT_LOT_SELF_DECLARED_NOTICE } from "../nbl-confirm-notices";
import { isUrbanResidentialCommercialIndustrial } from "./urban-area";
import type { JudgmentStep, NblRelatedBusinessType, ZoneType } from "./types";
import type { OtherLandUsage } from "./land-usage.types";

export interface HoRequirementResult {
  /** 호의 면적 외 요건을 충족하지 못해 호를 인정하지 않는다. */
  failStep?: JudgmentStep;
  /** 호를 인정했을 때 남기는 자기 선언 요건 고지. */
  notice?: string;
}

export function judgeHoRequirements(
  relatedType: NblRelatedBusinessType | undefined,
  o: Pick<OtherLandUsage, "hasBuilding">,
  zoneType: ZoneType,
): HoRequirementResult {
  if (relatedType === "reserve_forces") {
    if (isUrbanResidentialCommercialIndustrial(zoneType)) {
      return {
        failStep: {
          id: "other_ho_reserve_zone",
          label: "Step 3-1-1 §168의11①5호 나목 용도지역",
          status: "FAIL",
          detail: "도시지역의 주거지역·상업지역·공업지역 안에 소재 → 5호 예비군훈련장(나목: 그 지역 안에 소재하지 아니할 것) 불인정",
          legalBasis: NBL.OTHER_LAND_HO_RESERVE,
        },
      };
    }
    return { notice: NBL_RESERVE_FORCES_SELF_DECLARED_NOTICE };
  }
  if (relatedType === "vacant_lot_1household") {
    if (o.hasBuilding) {
      return {
        failStep: {
          id: "other_ho_vacant_lot_not_bare",
          label: "Step 3-1-1 §168의11①13호 나지",
          status: "FAIL",
          detail: "건축물(시설물)이 있는 토지 — 나지(어느 용도로도 사용되고 있지 아니한 토지)가 아니므로 13호 불인정",
          legalBasis: NBL.OTHER_LAND_HO_VACANT_LOT,
        },
      };
    }
    return { notice: NBL_VACANT_LOT_SELF_DECLARED_NOTICE };
  }
  return {};
}
