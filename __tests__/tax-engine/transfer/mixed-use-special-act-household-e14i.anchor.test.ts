/**
 * E-14i anchor — 겸용주택 D4-02 조특법 주택 수 제외 분기의 **1세대 게이트**.
 *
 * [법령 — 2026-09-29 법제처 실독]
 *   「소득세법」 §89①3호가목(MST 280405): 「1세대가 1주택을 보유하는 경우로서 대통령령으로 정하는 요건을 충족하는 주택」
 *   「소득세법 시행령」 §154①(MST 286211): 「…"대통령령으로 정하는 요건"이란 1세대가 양도일 … 현재 국내에 1주택을 보유하고
 *     있는 경우로서 …」
 *   「조세특례제한법」 §99의4①·§98의9①(MST 284389): 「…그 농어촌주택등(준공후미분양주택)을 해당 1세대의 소유주택이 아닌 것으로
 *     보아 「소득세법」 제89조제1항제3호를 적용한다」 · §98의7②: 「「소득세법」 제89조제1항제3호를 적용할 때 제1항을 적용받는
 *     미분양주택은 해당 거주자의 소유주택으로 보지 아니한다」
 *   ⇒ 조특법 조문은 **주택 수**에서 뺄 뿐이고, §89①3호의 「1세대」 요건은 그대로 남는다.
 *
 * 종전: 겸용 엔진(`judgeMixedUseOneHouseExemption`)의 `houseCountOk`가 제외가 1채 이상이면 「제외 후 1채 이하」만 보고
 *   1세대 여부를 보지 않았다 ⇒ `isOneHousehold=false`인데 `below_threshold_exempt`. 단건은 `checkExemptionCore`의
 *   `!input.isOneHousehold` 게이트, 겸용 상속 제외(E-14d)는 `isOneHouseholdForHouseCount` 게이트가 이미 막고 있었다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import { mixedUseCase14, CASE14_TRANSFER_DATE } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();
const PRICE = 1_000_000_000; // 12억 이하 — 비과세면 주택분 전액 비과세

/** §99의4 농어촌주택 — 겸용주택(사례14 건물 취득)보다 뒤에 취득(취득순서 요건 성립). D4-02 anchor와 같은 값. */
const RURAL = {
  type: "new_99_4_rural" as const,
  ruralHouseAcquisitionDate: new Date("2020-05-01"),
  ruralHouseStdPrice: 200_000_000,
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};

/** §98의7 보유 감면주택(모드 2) — D4-02-6과 같은 값 */
const UNSOLD_98_7 = [
  { article: "unsold_98_7", houseAcquisitionDate: new Date("2012-10-15"), requirementsConfirmed: true },
] as MixedUseAssetInput["specialHouseExclusions"];

/** 2주택 세대(겸용 + 조특법 주택) — ④는 명부 2채라 `isOneHouseExempt: false`를 보낸다. */
function run(over: Partial<MixedUseAssetInput>) {
  return calcMixedUseTransferTax(
    PRICE,
    CASE14_TRANSFER_DATE,
    {
      ...mixedUseCase14(),
      isOneHouseExempt: false,
      householdHousingCountForExclusion: 2,
      ...over,
    } as MixedUseAssetInput,
    rates,
  );
}

describe("E-14i 겸용 D4-02 조특법 주택 수 제외 — 1세대 게이트", () => {
  it("E14I-1 §99의4 적격 2주택 + 비1세대 → 비과세 아님(전액 과세)", () => {
    const r = run({ isOneHousehold: false, reductions: [RURAL] as MixedUseAssetInput["reductions"] });
    // 제외 판정 자체(적격)는 그대로 — 1세대 요건만 걸린다
    expect(r.new994Detail?.isEligible).toBe(true);
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    // 제외가 없는 2주택 대조군과 같은 세액(조특법 제외가 비1세대에 아무 효과도 내지 않는다)
    const control = run({ isOneHousehold: false });
    expect(r.total.determinedTax).toBe(control.total.determinedTax);
  });

  it("E14I-1+ 긍정 짝: 같은 사실 + 1세대 → 12억 이하 비과세", () => {
    const r = run({ isOneHousehold: true, reductions: [RURAL] as MixedUseAssetInput["reductions"] });
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
    expect(r.housingPart.incomeAmount).toBe(0);
  });

  it("E14I-2 §98의7 보유 감면주택 제외 + 비1세대 → 비과세 아님", () => {
    const r = run({ isOneHousehold: false, specialHouseExclusions: UNSOLD_98_7 });
    expect(r.specialHouseExclusionDetail?.excludedCount).toBe(1);
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
  });

  it("E14I-2+ 긍정 짝: §98의7 + 1세대 → 12억 이하 비과세", () => {
    const r = run({ isOneHousehold: true, specialHouseExclusions: UNSOLD_98_7 });
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
  });

  it("E14I-3 명부가 있으면 `multiHouse.isOneHousehold`가 우선 — 상속 제외(E-14d)와 같은 변수(route는 두 값을 같은 소스로 싣는다)", () => {
    const multiHouse = {
      houses: [],
      sellingHouseId: "selling",
      presaleRights: [],
      isOneHousehold: false,
      isRegulatedArea: false,
    } as unknown as NonNullable<MixedUseAssetInput["multiHouse"]>;
    const r = run({
      isOneHousehold: true,
      multiHouse,
      reductions: [RURAL] as MixedUseAssetInput["reductions"],
    });
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
  });

  it("E14I-5 `isOneHousehold` 미주입(엔진 직접 호출) → 1세대로 보지 않는다 — 상속 제외(E-14d)의 `?? false`와 같다", () => {
    const r = run({ reductions: [RURAL] as MixedUseAssetInput["reductions"] });
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
  });

  it("E14I-4 주택 > 상가 + 비1세대 → §154③ 본문(상가분 주택 취급)도 열리지 않는다", () => {
    const swap = { residentialFloorArea: 333.06, nonResidentialFloorArea: 91.78 };
    const r = run({ ...swap, isOneHousehold: false, reductions: [RURAL] as MixedUseAssetInput["reductions"] });
    expect(r.commercialPart.deemedHouseBy154_3Main).toBeUndefined();
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    const twin = run({ ...swap, isOneHousehold: true, reductions: [RURAL] as MixedUseAssetInput["reductions"] });
    expect(twin.commercialPart.deemedHouseBy154_3Main).toBe(true);
  });
});
