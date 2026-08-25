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
 * ## 축이 **둘**이다 — 「양도 대상인가」와 「원시 플래그로 추정할 것인가」 (2026-08-25)
 *
 * 계획서 `docs/00-pm/transfer-right-to-move-in-surcharge-scope.plan.md`.
 *
 * | 집합 | 원소 | 걸리는 곳 |
 * |---|---|---|
 * | `SURCHARGE_SUBJECT_PROPERTY_TYPES` | housing · redevelopment_apt · mixed-use-house | **정밀·fallback 공통 전제** |
 * | `SURCHARGE_FALLBACK_PROPERTY_TYPES`(module-private) | housing · redevelopment_apt | 정밀 판정이 없을 때만 |
 *
 * 🔑 **둘을 합치면 안 된다.** 겸용주택은 ④가 `assetKind === "housing"` 기준으로 `houses[]`를
 *    보내므로(`lib/calc/transfer-tax-api.ts:78,240`) **정밀 경로에 도달한다** — 대상 집합에서 빼면
 *    현행 중과가 사라진다. 반대로 fallback 집합에 넣으면 원시 플래그만으로 중과가 **새로** 걸린다.
 *    ⇒ 대상에는 넣고 fallback에는 넣지 않는다(겸용 fallback 미포함은 **별건**).
 */

import { isSurchargeSuspended } from "./tax-utils";
import type { MultiHouseSurchargeResult } from "./types/multi-house-surcharge.types";

/**
 * `tax-utils.ts`의 `SurchargeSpecialRules`는 **미export**다 — 새 export를 만들어
 * 표면을 넓히는 대신 시그니처에서 파생한다(정의가 바뀌면 여기도 자동으로 따라온다).
 */
type SurchargeSpecialRulesArg = Parameters<typeof isSurchargeSuspended>[0];

/**
 * §104⑦의 **양도 대상**이 되는 자산 종류 — 「다음 각 호의 어느 하나에 해당하는 **주택**
 * (이에 딸린 토지를 포함한다)을 **양도하는 경우**」.
 *
 * 조합원입주권(§94①2호**가**목)·분양권(§94①2호**나**목)은 **여기 없다**. ⑦ 각 호에서 둘은
 * 「1세대가 1주택과 **조합원입주권 또는 분양권**을 1개 보유한 경우의 **해당 주택**」처럼
 * **주택 수를 세는 요소**로만 등장하고, 세율을 더할 대상은 언제나 「해당 **주택**」이다.
 *
 * ⚠️ 이 집합은 **`lib/calc/housing-like-asset.ts`의 `HOUSING_LIKE_ASSET_KINDS`와 다르다.**
 *    그쪽은 ④⑤ **주택 수 입력 경로**의 축이라 입주권·분양권을 포함해야 한다 — 입주권 양도자도
 *    세대 주택 수를 센다. 두 집합을 합치면 이 정정이 입력 경로를 끊는다(anchor HL-06).
 */
export const SURCHARGE_SUBJECT_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  "housing",
  "redevelopment_apt",
  "mixed-use-house",
]);

/**
 * `houses[]` 정밀 판정이 **없을 때만** 원시 플래그(조정지역·주택수)로 중과를 추정할 자산 종류.
 *
 * `SURCHARGE_SUBJECT_PROPERTY_TYPES`의 부분집합이며 `mixed-use-house`가 빠져 있다 — 겸용주택은
 * 자체 분기가 주택분·상가분을 나눠 계산하므로 세대 주택수 플래그만으로 중과를 걸지 않는다.
 * **현행 동작 보존**이고 판단을 바꾸지 않는다(별건).
 *
 * ⚠️ 이 집합을 넓히면 **세율과 장특공제가 동시에** 움직인다 — §95②이 §104⑦ 각 호 자산을
 *    장특공제에서 제외하므로 한쪽만 열면 「세율은 중과인데 장특은 그대로」라는 위법 상태가 된다.
 */
const SURCHARGE_FALLBACK_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  "housing",
  "redevelopment_apt",
]);

export interface SurchargeApplicationInput {
  propertyType: string;
  isRegulatedArea?: boolean;
  householdHousingCount: number;
  transferDate: Date;
}

export interface SurchargeApplication {
  /** 중과 대상 케이스인가 (유예 여부와 무관) — **§95② 장특공제 배제 축** */
  isSurchargeCase: boolean;
  /** 한시배제(유예) 중인가 — 영 §167의3①12의2 가목 등 */
  isSuspended: boolean;
  /** 실제로 중과가 걸리는가 = `isSurchargeCase && !isSuspended` */
  isSurchargeApplied: boolean;
  /**
   * **세율 가산 축** — `isSurchargeApplied`와 다르다.
   *
   * 위기취득 배제(`rateSurchargeStatutoryExcluded`)는 **세율만** 빼고 `surchargeType`은 남긴다
   * (`multi-house-surcharge.ts:320` — 「세율만 배제: surchargeType은 유지 → §95② 장기보유
   * 특별공제 배제 판정 보존」). 그래서 두 축을 각각 노출한다. 종전에는 `calcTax`가 이 값을
   * **자기 안에서 따로 만들어** leaf를 우회했고, 자산 게이트가 세율 축에 닿지 못했다.
   */
  isRateSurchargeApplied: boolean;
  /** 세율 가산에 쓸 중과 유형. 양도 대상 자산이 아니면 `"none"`. */
  effectiveSurchargeType: "none" | "multi_house_2" | "multi_house_3plus";
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
  /**
   * 🔑 **자산 게이트는 함수 최상단의 단일 전제다.**
   *
   * 정밀 판정(`multiHouseSurchargeResult`)은 `houses[]`만 보고 「세대에 중과 대상이 있는가」를
   * 답할 뿐 **양도 대상이 무엇인지 모른다** — ④는 입주권 양도에도 `houses[]`를 싣는다
   * (`transfer-tax-api-houses.ts:30`). 그래서 게이트를 fallback 분기 안에만 두면 정밀 경로가
   * 그대로 뚫린다(실측: 입주권 정밀 경로 세율 0.68).
   *
   * 아래 네 값이 **함께** 닫혀야 한다. 지점마다 `&&`를 붙이는 방식은 이 파일이 고치고 있는
   * 결함의 발생 기전 그 자체다.
   */
  const isSubjectAsset = SURCHARGE_SUBJECT_PROPERTY_TYPES.has(input.propertyType);

  const isSurchargeCase =
    isSubjectAsset &&
    (multiHouseSurchargeResult
      ? multiHouseSurchargeResult.surchargeType !== "none"
      : SURCHARGE_FALLBACK_PROPERTY_TYPES.has(input.propertyType) &&
        input.isRegulatedArea === true &&
        input.householdHousingCount >= 2);

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
    isRateSurchargeApplied:
      isSubjectAsset &&
      (multiHouseSurchargeResult
        ? multiHouseSurchargeResult.surchargeApplicable
        : isSurchargeCase && !isSuspended),
    // fallback은 **원시 주택수**(`effectiveHouseCount` 아님)를 쓴다 — 종전 `calcTax` 동작 보존.
    effectiveSurchargeType: !isSubjectAsset
      ? "none"
      : (multiHouseSurchargeResult?.surchargeType ??
        (input.householdHousingCount >= 3 ? "multi_house_3plus" : "multi_house_2")),
    effectiveHouseCount,
    surchargeTypeKey,
  };
}
