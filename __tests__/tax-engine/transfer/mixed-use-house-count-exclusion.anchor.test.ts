// D4-02 anchor — 겸용주택 경로가 §89①3호 «주택수 제외» 축을 통째로 건너뛰었다
//
// 겸용주택(`assetKind === "housing" && isMixedUseHouse`)은 route에서 `calcMixedUseTransferTax`로
// 별도 dispatch되어 `calculateTransferTax`를 타지 않는다. 그래서 비과세 판정용 주택수 제외 스텝
// (`runHouseCountExclusionStep` — §99의4·§98의9 / 보유 감면주택 / §155②③)이 **한 번도 실행되지
// 않았다**. 경고조차 없었다 — 겸용 경로의 미반영 고지는 소득차감형 11 ID 전용이라
// `new_99_4_rural`·`unsold_98_9`를 포섭하지 못한다.
//
// 조문: §99의4①·§98의9①은 「그 주택을 해당 1세대의 소유주택이 **아닌 것으로 보아** 「소득세법」
//   제89조제1항제3호를 적용한다」로 **양도자산의 종류를 제한하지 않는다**.
//   자산종류 게이트도 열려 있다(`asset-kind-gate.ts`의 `NEW_UNSOLD_HOUSING_KINDS`에 "housing" 포함).
//
// 종전: `isOneHouseExempt`가 폼의 원본 주택 수만 보고 false → 주택분 12억 비과세 미적용 +
//   proratio=1 + 표1 적용 ⇒ **과다과세** (크기는 겸용 안분 비율에 종속).
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import { mixedUseCase14, CASE14_TRANSFER_DATE } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();
const PRICE = 1_000_000_000; // 12억 이하 — 주택분 전액 비과세 가능

/** §99의4 농어촌주택 — 겸용주택(2014 취득)보다 «뒤»에 취득해야 취득순서 요건이 성립한다 */
const RURAL = {
  type: "new_99_4_rural" as const,
  ruralHouseAcquisitionDate: new Date("2020-05-01"),
  ruralHouseStdPrice: 200_000_000,
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};

function run(over: Partial<MixedUseAssetInput> = {}) {
  return calcMixedUseTransferTax(
    PRICE,
    CASE14_TRANSFER_DATE,
    { ...mixedUseCase14(), isOneHouseExempt: false, ...over } as MixedUseAssetInput,
    rates,
  );
}

describe("D4-02 겸용주택 — §99의4 주택수 제외", () => {
  it("D4-02-1: 2주택 + §99의4 적격 → 제외 1채 → 1세대1주택 비과세가 적용된다", () => {
    const r = run({
      householdHousingCountForExclusion: 2,
      reductions: [RURAL] as MixedUseAssetInput["reductions"],
    });
    expect(r.new994Detail?.isEligible).toBe(true);
    expect(r.warnings.some((w) => w.includes("주택 수 제외 1채"))).toBe(true);
    // 주택분 12억 비과세 적용 ⇒ 과세 대상이 상가분으로 좁아진다
    expect(r.total.taxBase).toBeLessThan(run({ householdHousingCountForExclusion: 2 }).total.taxBase);
  });

  it("D4-02-2 대조군: 감면 미선택이면 제외 0 → 종전 동작 유지", () => {
    const r = run({ householdHousingCountForExclusion: 2 });
    expect(r.new994Detail).toBeUndefined();
    expect(r.warnings.some((w) => w.includes("주택 수 제외"))).toBe(false);
  });

  it("D4-02-3: 3주택이면 1채 제외해도 2채 → 비과세 미적용 (캡이 아니라 실제 차감)", () => {
    const three = run({
      householdHousingCountForExclusion: 3,
      reductions: [RURAL] as MixedUseAssetInput["reductions"],
    });
    const two = run({
      householdHousingCountForExclusion: 2,
      reductions: [RURAL] as MixedUseAssetInput["reductions"],
    });
    expect(three.total.taxBase).toBeGreaterThan(two.total.taxBase);
  });

  it("D4-02-4: 요건 미충족 감면은 제외되지 않는다 (과잉완화 방지)", () => {
    // 농어촌주택 취득이 겸용주택 취득보다 «앞»서면 §99의4① 취득순서 요건 불충족
    const r = run({
      householdHousingCountForExclusion: 2,
      reductions: [
        { ...RURAL, ruralHouseAcquisitionDate: new Date("1990-01-01") },
      ] as MixedUseAssetInput["reductions"],
    });
    expect(r.new994Detail?.isEligible).toBe(false);
    expect(r.warnings.some((w) => w.includes("주택 수 제외"))).toBe(false);
  });

  it("D4-02-5: 주택 수 미전달이면 호출부 판정을 그대로 신뢰한다 (하위 호환)", () => {
    const r = run({ reductions: [RURAL] as MixedUseAssetInput["reductions"] });
    expect(r.new994Detail).toBeUndefined();
    expect(r.warnings.some((w) => w.includes("주택 수 제외"))).toBe(false);
  });
});

describe("D4-02 겸용주택 — 보유 감면주택(모드 2) 제외", () => {
  it("D4-02-6: §98의7 보유 감면주택 선언 → 제외 1채", () => {
    const r = run({
      householdHousingCountForExclusion: 2,
      specialHouseExclusions: [
        {
          article: "unsold_98_7",
          houseAcquisitionDate: new Date("2012-10-15"),
          requirementsConfirmed: true,
        },
      ] as MixedUseAssetInput["specialHouseExclusions"],
    });
    expect(r.specialHouseExclusionDetail?.excludedCount).toBe(1);
    expect(r.warnings.some((w) => w.includes("주택 수 제외 1채"))).toBe(true);
  });

  it("D4-02-7: §99의4 + 보유 감면주택 동시 → 2채 제외", () => {
    const r = run({
      householdHousingCountForExclusion: 3,
      reductions: [RURAL] as MixedUseAssetInput["reductions"],
      specialHouseExclusions: [
        {
          article: "unsold_98_7",
          houseAcquisitionDate: new Date("2012-10-15"),
          requirementsConfirmed: true,
        },
      ] as MixedUseAssetInput["specialHouseExclusions"],
    });
    expect(r.warnings.some((w) => w.includes("주택 수 제외 2채"))).toBe(true);
  });
});
