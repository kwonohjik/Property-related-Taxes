/**
 * 다주택 중과(§104⑦) **적용 여부 술어** — 세율·장특공제·재개발 분기 **공용 단일 소스**.
 *
 * ## 왜 뽑았나 (2026-08-25)
 *
 * 같은 판정이 **두 곳에 복제**돼 있었고 재개발 분기가 세 번째를 요구했다:
 *
 * | 위치 | 쓰임 |
 * |---|---|
 * | `transfer-tax.ts` STEP 4 앞 | `calcLongTermHoldingDeduction`의 `isSurcharge`(§95② 배제) |
 * | `transfer-tax-rate-calc.ts` `calcTax` | 세율 가산(§104⑦) |
 * | `transfer-tax-redevelopment.ts` (신규) | 재개발 분기의 §95② 배제 |
 *
 * 복제본마다 `propertyType` 열거가 따로 있어 **`redevelopment_apt`가 두 곳 모두에서 빠져 있었다**
 * — 재개발 신축주택에 중과가 통째로 미적용됐다(실측 Δ 59,823,642원 과소).
 * 셋으로 늘리면 다음 자산 종류에서 같은 일이 반복된다
 * (memory `feedback_shared_predicate_argument_parity` — 술어 공유 ≠ 단일 소스).
 *
 * ## 대상 자산 (법령)
 *
 * 「소득세법」 §104⑦은 「다음 각 호의 어느 하나에 해당하는 **주택**(이에 딸린 토지를 포함한다)을
 * 양도하는 경우」로 정하고 **취득 경위를 묻지 않는다**. 위임된 요건 조항 양쪽이
 * 재개발 신축주택을 **판정 대상으로 전제**한다:
 *
 * > 「소득세법 시행령」 §167의3①12의2 · §167의10①12의2 —
 * > 「법 제95조제4항에 따른 보유기간이 2년(**재개발사업, 재건축사업 또는 소규모재건축사업등을
 * > 시행하는 정비사업조합의 조합원이 해당 조합에 기존건물과 그 부수토지를 제공하고
 * > 관리처분계획등에 따라 취득한 신축주택 및 그 부수토지를 양도하는 경우의 보유기간은
 * > 기존건물과 그 부수토지의 취득일부터 기산한다**) 이상인 주택으로서 …」
 *
 * 배제 대상이라면 그 기산 규칙을 둘 이유가 없다. §167의3① 1~13호의 배제 열거에
 * 「재개발로 취득한 주택」은 **없다**.
 *
 * ⚠️ **`right_to_move_in`(조합원입주권)이 이 집합에 있는 것은 별도 쟁점이다.**
 *    §104⑦은 「주택」만 대상이고 조합원입주권은 §94①2호가목의 **권리**다. 승계조합원 입주권이
 *    일반 경로로 내려오면 30%p가 붙는 것을 실측했다(세율 0.7). **현행 동작을 그대로 옮겼을 뿐**
 *    이 파일에서 판단을 바꾸지 않는다 — 별건 계획서에서 다룬다(과대과세 축이라 방향이 반대다).
 */

import { isSurchargeSuspended } from "./tax-utils";
import type { MultiHouseSurchargeResult } from "./types/multi-house-surcharge.types";

/**
 * `tax-utils.ts`의 `SurchargeSpecialRules`는 **미export**다 — 새 export를 만들어
 * 표면을 넓히는 대신 시그니처에서 파생한다(정의가 바뀌면 여기도 자동으로 따라온다).
 */
type SurchargeSpecialRulesArg = Parameters<typeof isSurchargeSuspended>[0];

/**
 * `houses[]` 정밀 판정이 없을 때(fallback) 중과 축에 오르는 자산 종류.
 *
 * ⚠️ 이 집합을 넓히면 **세율과 장특공제가 동시에** 움직인다 — §95②이 §104⑦ 각 호 자산을
 *    장특공제에서 제외하므로 한쪽만 열면 「세율은 중과인데 장특은 그대로」라는 위법 상태가 된다.
 */
export const SURCHARGE_FALLBACK_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  "housing",
  "right_to_move_in",
  "presale_right",
  "redevelopment_apt",
]);

export interface SurchargeApplicationInput {
  propertyType: string;
  isRegulatedArea?: boolean;
  householdHousingCount: number;
  transferDate: Date;
}

export interface SurchargeApplication {
  /** 중과 대상 케이스인가 (유예 여부와 무관) */
  isSurchargeCase: boolean;
  /** 한시배제(유예) 중인가 — 영 §167의3①12의2 가목 등 */
  isSuspended: boolean;
  /** 실제로 중과가 걸리는가 = `isSurchargeCase && !isSuspended` */
  isSurchargeApplied: boolean;
  effectiveHouseCount: number;
  surchargeTypeKey: "multi_house_2" | "multi_house_3plus";
}

/**
 * 정밀 판정(`houses[]` 기반 `determineMultiHouseSurcharge`)이 있으면 **그대로 쓰고**,
 * 없으면 원시 플래그(자산종류·조정지역·주택수)로 fallback한다.
 *
 * 🔑 fallback은 **근사**다 — 유예·배제·주택수 제외를 전부 반영하지 못한다.
 *    그래서 정밀 판정이 있으면 재판정하지 않는다.
 */
export function resolveSurchargeApplication(
  input: SurchargeApplicationInput,
  multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined,
  surchargeSpecialRules: SurchargeSpecialRulesArg,
): SurchargeApplication {
  const isSurchargeCase = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.surchargeType !== "none"
    : SURCHARGE_FALLBACK_PROPERTY_TYPES.has(input.propertyType) &&
      input.isRegulatedArea === true &&
      input.householdHousingCount >= 2;

  const effectiveHouseCount = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.effectiveHouseCount
    : input.householdHousingCount;

  const surchargeTypeKey = effectiveHouseCount >= 3 ? "multi_house_3plus" : "multi_house_2";

  const isSuspended = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.isSurchargeSuspended
    : isSurchargeCase
      ? isSurchargeSuspended(surchargeSpecialRules, input.transferDate, surchargeTypeKey)
      : false;

  return {
    isSurchargeCase,
    isSuspended,
    isSurchargeApplied: isSurchargeCase && !isSuspended,
    effectiveHouseCount,
    surchargeTypeKey,
  };
}
