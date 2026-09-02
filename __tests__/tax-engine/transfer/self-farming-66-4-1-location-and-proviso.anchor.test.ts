// D7-06 · D7-07 · D7-08 anchor — 조특령 §66④1호(배제)와 법 §69①단서+영 §66⑦(부분감면)은 «별개»다
//
// ## 조문 실측 (법제처 DRF)
//
// **영 §66④1호** — 법 §69① **본문**의 「대통령령으로 정하는 토지」 위임:
//   「**양도일 현재 특별시·광역시(광역시에 있는 군을 제외한다) 또는 시**{도농복합형태의 시의
//    읍·면 지역 및 행정시의 읍·면 지역은 제외한다}**에 있는 농지중** … 주거지역·상업지역 및
//    공업지역안에 있는 농지로서 이들 지역에 **편입된 날부터 3년이 지난 농지**.
//    **다만, 다음 각 목의 어느 하나에 해당하는 경우는 제외한다.** 가/나/다 …」
//
// **법 §69① 단서 + 영 §66⑦** — 편입일까지 발생한 소득만 감면(기준시가 비율 안분).
//   소재지 요건이 **없다**.
//
// **영 §66⑤** = 양도일 현재의 농지 기준 · **영 §66⑥** = 교환·분합·대토 경작기간 통산.
//   ⇒ 코드가 인용하던 「§66 ⑤⑥」은 이 맥락과 무관했다 (D7-06).
//
// ## 2002-01-01 기준선은 부분감면(②)에만 걸린다
//
// §69① 단서는 **법률 제6538호**(시행 2002-01-01)로 신설. 같은 법 **부칙 제28조①**:
//   「이 법 시행 당시 … 주거지역·상업지역 또는 공업지역에 **편입**되거나 … 농지의 양도에
//    대한 양도소득세의 면제에 관하여는 **제69조제1항 단서의 개정규정에 불구하고** 종전의
//    규정에 의한다」 — **단서만** 배제한다.
// 영 §66④1호는 본문 위임이라 대상이 아니고, 조특령 제정(대통령령 제15976호) 이후 **278개
// 부칙 전수 probe에서 이 3년 배제의 적용례·경과조치가 0건**이다. 인접 규정인 축사용지
// (영 §66의2③1호·대통령령 제23039호 부칙 §2①)·어업용 토지·자경산지(제28636호 부칙 §15①·§16①)는
// 3년 배제 **신설 시** 「이 영 시행일을 편입된 날로 본다」 부칙을 뒀는데 자경농지에는 없다.
//
// ## 종전 동작의 결함
//
// · 3년 배제를 **소재지·단서 없이** 무조건 적용 → 군·읍·면 소재 농지가 법 근거 없이 감면 상실 (D7-07)
// · pre-2002 편입이면 3년 배제까지 건너뛰고 전액 감면으로 조기반환 → 과다감면 (D7-08)
import { describe, it, expect } from "vitest";
import {
  calculateSelfFarmingReduction,
  type SelfFarmingReductionInput,
} from "@/lib/tax-engine/self-farming-reduction";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-store";

/** 30년 자경 · 취득 1975 · 양도 2026-05-01 */
function base(over: Partial<SelfFarmingReductionInput> = {}): SelfFarmingReductionInput {
  return {
    transferIncome: 500_000_000,
    farmingYears: 30,
    minFarmingYears: 8,
    acquisitionDate: new Date("1975-05-24"),
    transferDate: new Date("2026-05-01"),
    ...over,
  };
}

/** 편입 2018-05-01 (양도 2026-05-01 기준 3년 경과) + 기준시가 3점 */
const INCORP_2018 = {
  incorporationDate: new Date("2018-05-01"),
  incorporationZoneType: "residential" as const,
  standardPriceAtAcquisition: 1_000,
  standardPriceAtIncorporation: 3_000,
  standardPriceAtTransfer: 4_000,
};

describe("D7-07 §66④1호 — 소재지 요건", () => {
  it("D7-07-1: 시 소재 + 3년 경과 → 감면대상 토지에서 제외 (감면 0)", () => {
    const r = calculateSelfFarmingReduction(
      base({ ...INCORP_2018, incorporationLocationType: "metro_or_city" }),
    );
    expect(r.qualifies).toBe(false);
    expect(r.reducibleIncome).toBe(0);
    expect(r.incorporationGraceExpired).toBe(true);
  });

  it("D7-07-2: 군·읍·면 소재 + 3년 경과 → 배제되지 않는다 (§66⑦ 부분감면으로 간다)", () => {
    const r = calculateSelfFarmingReduction(
      base({ ...INCORP_2018, incorporationLocationType: "gun_or_eup_myeon" }),
    );
    expect(r.qualifies).toBe(true);
    expect(r.incorporationGraceExpired).toBe(false);
    expect(r.partialReductionApplied).toBe(true);
    // ratio = (3000 − 1000) / (4000 − 1000) = 2/3
    expect(r.reducibleRatio).toBeCloseTo(2 / 3, 6);
    expect(r.reducibleIncome).toBe(Math.floor(500_000_000 * (2 / 3)));
    expect(r.breakdown.some((b) => b.includes("특별시·광역시(군 제외)·시가 아니므로"))).toBe(true);
  });

  it("D7-07-3: 3년이 지나지 않았으면 소재지를 묻지 않는다 (배제가 성립할 수 없다)", () => {
    const r = calculateSelfFarmingReduction(
      base({ ...INCORP_2018, transferDate: new Date("2021-04-30") }),
    );
    expect(r.qualifies).toBe(true);
    expect(r.partialReductionApplied).toBe(true);
  });

  it("D7-07-4: 3년 경과인데 소재지 미입력 → 판정 불가 (자동 fallback 금지)", () => {
    const r = calculateSelfFarmingReduction(base({ ...INCORP_2018 }));
    expect(r.qualifies).toBe(false);
    expect(r.reducibleIncome).toBe(0);
    expect(r.incorporationGraceExpired).toBe(false); // 배제된 것이 아니라 «판정 불가»다
    expect(r.breakdown.some((b) => b.includes("판정할 수 없습니다"))).toBe(true);
  });

  it("D7-07-5: 단서 가·나·다목 해당 → 시 소재 + 3년 경과여도 배제되지 않는다", () => {
    const r = calculateSelfFarmingReduction(
      base({
        ...INCORP_2018,
        incorporationLocationType: "metro_or_city",
        hasIncorporationProvisoException: true,
      }),
    );
    expect(r.qualifies).toBe(true);
    expect(r.incorporationGraceExpired).toBe(false);
    expect(r.partialReductionApplied).toBe(true);
    expect(r.breakdown.some((b) => b.includes("단서(가·나·다목"))).toBe(true);
  });

  it("D7-07-6 경계: 편입일 + 3년 당일은 «경과»가 아니다", () => {
    const at = (d: string) =>
      calculateSelfFarmingReduction(
        base({
          ...INCORP_2018,
          incorporationLocationType: "metro_or_city",
          transferDate: new Date(d),
        }),
      ).qualifies;
    expect(at("2021-05-01")).toBe(true); // 3년 당일 — 배제 없음
    expect(at("2021-05-02")).toBe(false); // 하루 지나면 배제
  });
});

describe("D7-08 2002-01-01 기준선은 부분감면에만 걸린다", () => {
  const INCORP_1999 = {
    incorporationDate: new Date("1999-06-30"),
    standardPriceAtAcquisition: 1_000,
    standardPriceAtIncorporation: 2_000,
    standardPriceAtTransfer: 4_000,
  };

  it("D7-08-1: pre-2002 편입 + 군·읍·면 → 전액 감면 (법률 제6538호 부칙 §28①)", () => {
    const r = calculateSelfFarmingReduction(
      base({ ...INCORP_1999, incorporationLocationType: "gun_or_eup_myeon" }),
    );
    expect(r.qualifies).toBe(true);
    expect(r.reducibleIncome).toBe(500_000_000);
    expect(r.reducibleRatio).toBe(1);
    expect(r.partialReductionApplied).toBe(false);
    expect(r.breakdown.some((b) => b.includes("부칙 §28①"))).toBe(true);
  });

  it("D7-08-2: pre-2002 편입이어도 «시 소재 + 3년 경과»면 §66④1호로 제외된다", () => {
    // 종전에는 pre-2002 분기가 3년 배제를 통째로 건너뛰어 전액 감면(과다)이었다.
    const r = calculateSelfFarmingReduction(
      base({ ...INCORP_1999, incorporationLocationType: "metro_or_city" }),
    );
    expect(r.qualifies).toBe(false);
    expect(r.reducibleIncome).toBe(0);
    expect(r.incorporationGraceExpired).toBe(true);
  });

  it("D7-08-3: 편입 자체가 없으면 두 규정 다 걸리지 않는다 (전액 감면)", () => {
    const r = calculateSelfFarmingReduction(base());
    expect(r.qualifies).toBe(true);
    expect(r.reducibleIncome).toBe(500_000_000);
    expect(r.reducibleRatio).toBe(1);
  });
});

describe("D7-06 조문 인용", () => {
  it("D7-06-1: 편입 상수는 §66④1호·§66⑦를 가리킨다 (§66⑤⑥이 아니다)", () => {
    expect(TRANSFER.REDUCTION_SELF_FARMING_INCORP).toBe("조특법 시행령 §66④1호·§66⑦");
    expect(TRANSFER.REDUCTION_SELF_FARMING_INCORP).not.toContain("⑤");
    expect(TRANSFER.REDUCTION_SELF_FARMING_INCORP).not.toContain("⑥");
  });

  it("D7-06-2: 배제 결과의 legalBasis에 그 상수가 실린다", () => {
    const r = calculateSelfFarmingReduction(
      base({ ...INCORP_2018, incorporationLocationType: "metro_or_city" }),
    );
    expect(r.legalBasis).toContain("§66④1호");
  });
});

describe("④⑫⑬ 배관 — 소재지·단서가 엔진까지 침묵 소실되지 않는다", () => {
  const REDUCTION = {
    type: "self_farming" as const,
    farmingYears: 30,
    incorporationDate: new Date("2018-05-01"),
    incorporationZoneType: "residential" as const,
    standardPriceAtIncorporation: 3_000,
    standardPriceAtAcquisition: 1_000,
    standardPriceAtTransfer: 4_000,
  };

  function run(over: Record<string, unknown>) {
    return calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        transferPrice: 1_000_000_000,
        acquisitionPrice: 400_000_000,
        acquisitionDate: new Date("1975-05-24"),
        transferDate: new Date("2026-05-01"),
        reductions: [{ ...REDUCTION, ...over }],
      }),
      makeMockRates(),
    );
  }

  it("PL-1 ⑬: 시 소재 → 감면 0 / 군·읍·면 소재 → 감면 발생", () => {
    const city = run({ incorporationLocationType: "metro_or_city" });
    const gun = run({ incorporationLocationType: "gun_or_eup_myeon" });
    expect(city.reductionAmount).toBe(0);
    expect(gun.reductionAmount).toBeGreaterThan(0);
    expect(gun.determinedTax).toBeLessThan(city.determinedTax);
  });

  it("PL-2 ⑬: 단서 예외 토글도 엔진까지 도달한다", () => {
    const off = run({ incorporationLocationType: "metro_or_city" });
    const on = run({
      incorporationLocationType: "metro_or_city",
      hasIncorporationProvisoException: true,
    });
    expect(off.reductionAmount).toBe(0);
    expect(on.reductionAmount).toBeGreaterThan(0);
  });

  it("PL-3 ④: toEngineReductions가 두 필드를 실어 보낸다 (토글 ON일 때만)", () => {
    const form = (over: Record<string, unknown> = {}): AssetReductionForm =>
      ({
        type: "self_farming",
        farmingYears: "30",
        useSelfFarmingIncorporation: true,
        selfFarmingIncorporationDate: "2018-05-01",
        selfFarmingIncorporationZone: "residential",
        selfFarmingIncorporationLocation: "gun_or_eup_myeon",
        selfFarmingIncorporationProvisoException: true,
        selfFarmingStandardPriceAtIncorporation: "3000",
        selfFarmingStandardPriceAtAcquisition: "1000",
        selfFarmingStandardPriceAtTransfer: "4000",
        ...over,
      }) as AssetReductionForm;

    const [on] = toEngineReductions([form()], "purchase") as Array<Record<string, unknown>>;
    expect(on.incorporationLocationType).toBe("gun_or_eup_myeon");
    expect(on.hasIncorporationProvisoException).toBe(true);

    // 편입 토글 OFF면 편입 축 전체가 빠진다 (기존 규약)
    const [off] = toEngineReductions(
      [form({ useSelfFarmingIncorporation: false })],
      "purchase",
    ) as Array<Record<string, unknown>>;
    expect(off.incorporationLocationType).toBeUndefined();
    expect(off.hasIncorporationProvisoException).toBeUndefined();
  });

  it("PL-4 ⑫: Zod가 두 필드를 stripping하지 않는다", () => {
    const parsed = reductionSchema.parse({
      type: "self_farming",
      farmingYears: 30,
      incorporationDate: "2018-05-01",
      incorporationLocationType: "metro_or_city",
      hasIncorporationProvisoException: true,
    }) as Record<string, unknown>;
    expect(parsed.incorporationLocationType).toBe("metro_or_city");
    expect(parsed.hasIncorporationProvisoException).toBe(true);
  });
});
