/**
 * 기타토지 §168의11① 호별 **면적 외 요건** — 엔진 입력으로 판정할 수 있는 것만 판정한다 (NBL2611-B4 · R09, NBL2611-V7-S · R18, Q-6 (다)).
 *
 *   · 3호      「토지의 조성이 완료된 날부터 2년이 경과한 토지를 제외한다」 — [조성 완료일, +2년)만 사업용 기간 (`businessPeriods`)
 *   · 5호 나목  「도시지역의 주거지역·상업지역 및 공업지역 안에 소재하지 아니할 것」 — `zoneType`으로 판정 (V7-DM02)
 *   · 13호      「나지」 = 제1호~제12호에 해당하지 아니하는 토지로서 어느 용도로도 사용되고 있지 아니한 토지 — 건축물(시설물)이 있으면 나지가 아니다 (V9-DM11)
 *   · 14호      위임 규칙(소득세법 시행규칙 §83조의4)에 14호를 정한 항이 없다 → 사업용으로 인정하지 않는다 + 확인 필요 (Q-5 (나))
 *
 * 입력으로 판정할 수 없는 요건은 «자기 선언 — 확인 필요» 고지로만 남긴다 — 고지 문구는 `other-land-ho-meta.ts` 표의 `selfDeclaredNotice`다.
 * 순수 함수 — DB를 부르지 않는다.
 */
import { NBL } from "../legal-codes";
import { addYears } from "../utc-date";
import { TaxCalculationError, TaxErrorCode } from "../tax-errors";
import { isUrbanResidentialCommercialIndustrial } from "./urban-area";
import { OTHER_LAND_HO_META } from "./other-land-ho-meta";
import type { DateInterval, JudgmentStep, NblRelatedBusinessType, ZoneType } from "./types";
import type { OtherLandUsage } from "./land-usage.types";

export interface HoRequirementResult {
  /** 호의 면적 외 요건을 충족하지 못해 호를 인정하지 않는다. */
  failStep?: JudgmentStep;
  /** 호를 인정했을 때 남기는 자기 선언 요건 고지. */
  notice?: string;
  /** 호를 인정하지 않을 때 남기는 «확인 필요» 고지 (14호). */
  failNotice?: string;
  /** 호가 사업용으로 인정되는 기간 — 없으면 소유기간 전체(`fullPeriod`). 3호만 있다. */
  businessPeriods?: DateInterval[];
}

/** 14호 — 위임 규칙 항이 없어 인정하지 않는다는 사실과 «확인 필요». 14호를 인정한 상급심·국세청 해석을 확보하지 못했다. */
export const NBL_ETC14_NOT_RECOGNIZED_NOTICE =
  `${NBL.OTHER_LAND_HO_ETC14}(제1호~제13호와 유사한 토지)는 「재정경제부령으로 정하는 토지」인데 소득세법 시행규칙 제83조의4에 14호를 정한 항이 없어 ` +
  `사업용으로 인정하지 않았습니다 — 14호를 인정한 상급심 판결·국세청 해석을 확보하지 못했습니다. 14호에 해당한다고 보는 경우 확인 필요.`;

export function judgeHoRequirements(
  relatedType: NblRelatedBusinessType | undefined,
  o: Pick<OtherLandUsage, "hasBuilding" | "privateInvestmentCompletionDate">,
  zoneType: ZoneType,
): HoRequirementResult {
  if (relatedType === undefined || relatedType === "none") return {};
  const notice = OTHER_LAND_HO_META[relatedType].selfDeclaredNotice;

  if (relatedType === "etc_14호") {
    return {
      failStep: {
        id: "other_ho_etc14_unrecognized",
        label: "Step 3-1-1 §168의11①14호 위임 부령",
        status: "FAIL",
        detail: "14호는 「재정경제부령으로 정하는 토지」인데 소득세법 시행규칙 제83조의4에 14호를 정한 항이 없음 → 14호 사업용 불인정 (확인 필요)",
        legalBasis: NBL.OTHER_LAND_HO_ETC14,
      },
      failNotice: NBL_ETC14_NOT_RECOGNIZED_NOTICE,
    };
  }
  if (relatedType === "private_investment_land") {
    const completed = o.privateInvestmentCompletionDate;
    // ⑧·⑫가 먼저 막는다 — 직접 호출의 마지막 안전망. 조성 완료일 없이 2년 단서를 판정할 수 없고, 추정하면 사업용이 조용히 늘거나 준다.
    if (!completed) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        OTHER_LAND_HO_META.private_investment_land.requiredInput.message,
      );
    }
    return { notice, businessPeriods: [{ start: completed, end: addYears(completed, 2) }] };
  }
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
    return { notice };
  }
  if (relatedType === "vacant_lot_1household" && o.hasBuilding) {
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
  return { notice };
}
