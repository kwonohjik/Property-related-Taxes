/**
 * E-14d anchor — 겸용주택 경로의 「소득세법 시행령」 §155②③ 상속주택 주택 수 제외.
 *
 * [법령 — 「소득세법 시행령」 §155②, MST 286211 · 2026-09-28 법제처 실측]
 *   「상속받은 주택 … 과 그 밖의 주택(상속개시 당시 보유한 주택 … 만 해당하며, 상속개시일부터 소급하여
 *    2년 이내에 피상속인으로부터 증여받은 주택 … 은 제외한다. 이하 이 항에서 "일반주택"이라 한다)을
 *    국내에 각각 1개씩 소유하고 있는 1세대가 일반주택을 양도하는 경우에는 국내에 1개의 주택을 소유하고
 *    있는 것으로 보아 제154조제1항을 적용한다.」
 * [§155③] 「제154조제1항을 적용할 때 공동상속주택 … 외의 다른 주택을 양도하는 때에는 해당 공동상속주택은
 *    해당 거주자의 주택으로 보지 아니한다. 다만, 상속지분이 가장 큰 상속인의 경우에는 그러하지 아니하며 …」
 * [§154③] 「법 제89조제1항제3호를 적용할 때 하나의 건물이 주택과 주택외의 부분으로 복합되어 있는 경우 …
 *    그 전부를 주택으로 본다. 다만, 주택의 연면적이 주택 외의 부분의 연면적보다 적거나 같을 때에는
 *    주택외의 부분은 주택으로 보지 아니한다.」 ⇒ 겸용주택의 주택 부분은 §89①3호 적용상 「주택」이다.
 *
 * 종전: 겸용 엔진이 §99의4·보유 감면주택 제외(D4-02)와 §155①④⑤ 의제(OH-09)는 판정하면서 §155②③만
 *   건너뛰었다 ⇒ 상속주택 1채를 함께 보유한 세대의 겸용주택이 2주택으로 판정되어 비과세가 배제됐다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates, makeMockRatesWithHouseEngine, makeHouseInfo } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const D = (s: string) => new Date(s);
const TRANSFER = D("2026-06-01");
const PRICE = 1_000_000_000; // 12억 이하 — 비과세면 주택분 전액 비과세

/** 단독상속주택(§155②) — 상속개시 2015, 겸용주택(1997 신축) 보유 중 상속 */
const inheritedSole = (over: Partial<HouseInfo> = {}) =>
  makeHouseInfo("h2", {
    acquisitionDate: D("2015-03-01"),
    isInherited: true,
    inheritedDate: D("2015-03-01"),
    ...over,
  });

function multiHouse(other: HouseInfo, over: Record<string, unknown> = {}) {
  return {
    houses: [makeHouseInfo("selling", { acquisitionDate: D("1997-09-12") }), other],
    sellingHouseId: "selling",
    presaleRights: [],
    isOneHousehold: true,
    isRegulatedArea: false,
    ...over,
  } as NonNullable<MixedUseAssetInput["multiHouse"]>;
}

/** route가 `engineInput`에서 싣는 §155② 괄호 사실 — 세 키 모두 명시(미선언 = undefined). */
const NO_FACTS = {
  generalHouseGiftedFromDecedentWithin2yr: undefined,
  generalHouseGiftDate: undefined,
  generalHouseRightAtInheritance: undefined,
};

/** 2주택 세대(겸용 + 상속주택) — ④는 명부 2채라 `isOneHouseExempt: false`를 보낸다. */
function run(
  other: HouseInfo,
  over: Partial<MixedUseAssetInput> & Record<string, unknown> = {},
  price = PRICE,
  transferDate = TRANSFER,
  rates = makeMockRates(),
) {
  return calcMixedUseTransferTax(
    price,
    transferDate,
    {
      ...mixedUseCase14(),
      isOneHouseExempt: false,
      isOneHousehold: true,
      householdHousingCountForExclusion: 2,
      multiHouse: multiHouse(other),
      inheritedHouseExclusion: NO_FACTS,
      ...over,
    } as MixedUseAssetInput,
    rates,
  );
}

/** 대조군 — 같은 2주택인데 다른 주택이 상속주택이 아니다 */
const control = () => run(makeHouseInfo("h2", { acquisitionDate: D("2015-03-01") }));

describe("E-14d §155② 단독상속주택 — 겸용주택(일반주택) 양도", () => {
  it("E14D-1 주택 ≤ 상가: 상속주택 제외 → 1주택 → 주택분 12억 이하 비과세", () => {
    const c = control();
    expect(c.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    const r = run(inheritedSole());
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
    expect(r.housingPart.incomeAmount).toBe(0);
    expect(r.total.taxBase).toBeLessThan(c.total.taxBase);
    // ⑦ 결과 고지 — 단일 소스 step 문구(§155② 일반주택 양도)
    expect(r.warnings.some((w) => w.includes("§155② 일반주택 양도"))).toBe(true);
  });

  it("E14D-2 주택 > 상가: 비과세 성립 → §154③ 본문으로 상가분까지 주택(전체 12억 이하)", () => {
    const swap = { residentialFloorArea: 333.06, nonResidentialFloorArea: 91.78 };
    const c = run(makeHouseInfo("h2", { acquisitionDate: D("2015-03-01") }), swap);
    expect(c.commercialPart.deemedHouseBy154_3Main).toBeUndefined();
    const r = run(inheritedSole(), swap);
    expect(r.commercialPart.deemedHouseBy154_3Main).toBe(true);
    expect(r.housingPart.incomeAmount).toBe(0);
    expect(r.commercialPart.incomeAmount).toBe(0);
  });

  it("E14D-3 비1세대 — §155②는 「1세대가」 요건 ⇒ 제외하지 않는다", () => {
    const r = run(inheritedSole(), {
      isOneHousehold: false,
      multiHouse: multiHouse(inheritedSole(), { isOneHousehold: false }),
    });
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
  });

  it("E14D-4 사실 미전달(`inheritedHouseExclusion` undefined — 컴패니언 경로) → 종전 동작", () => {
    const r = run(inheritedSole(), { inheritedHouseExclusion: undefined });
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    expect(r.total.transferTax).toBe(control().total.transferTax);
  });
});

describe("E-14d §155② 괄호 — 연혁(부칙) 게이트", () => {
  /** 겸용주택을 2016 취득(= 일반주택 취득일 ≥ 2013-02-15 → 「상속개시 당시 보유」 한정 적용) */
  const late = { landAcquisitionDate: D("2016-01-01"), buildingAcquisitionDate: D("2016-01-01") };

  it("E14D-5 상속개시(2015) 후 취득한 겸용주택 → 일반주택 아님 → 제외 없음 · 사유 고지", () => {
    const r = run(inheritedSole(), late);
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    expect(r.warnings.some((w) => w.includes("§155② 괄호"))).toBe(true);
  });

  it("E14D-5b 긍정 짝 — 상속개시(2017)가 겸용주택 취득(2016) 뒤 → 보유 ⇒ 제외", () => {
    const r = run(inheritedSole({ inheritedDate: D("2017-01-01") }), late);
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
  });

  it("E14D-5c 긍정 짝 — 상속개시 당시 보유 조합원입주권 신축주택 선언 ⇒ 제외", () => {
    const r = run(inheritedSole(), {
      ...late,
      inheritedHouseExclusion: { ...NO_FACTS, generalHouseRightAtInheritance: "redevelopment_right" },
    });
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
  });

  it("E14D-5d 기준일은 **건물(주택) 취득일** — 토지 2010(상속 전)·건물 2016(상속 후) → 보유 아님", () => {
    // §154① 보유 기산·§99의4 「취득 전 보유」와 같은 기준일이고, ④의 UI 게이트(`assets[0].acquisitionDate`
    // = 겸용 `buildingAcquisitionDate`)와도 같다. 토지 취득일로 보면 2013-02-15 전이라 한정이 풀린다.
    const r = run(inheritedSole(), {
      landAcquisitionDate: D("2010-01-01"),
      buildingAcquisitionDate: D("2016-01-01"),
    });
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
  });

  it("E14D-6 소급 2년 내 피상속인 증여(2019 — 2018-02-13 이후) → ② 풀 배제", () => {
    const r = run(inheritedSole(), {
      inheritedHouseExclusion: {
        ...NO_FACTS,
        generalHouseGiftedFromDecedentWithin2yr: true,
        generalHouseGiftDate: D("2019-01-01"),
      },
    });
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
  });

  it("E14D-6b 긍정 짝 — 증여일 2017(제28637호 부칙 제16조 전) → 증여 제외 미적용 ⇒ 제외", () => {
    const r = run(inheritedSole(), {
      inheritedHouseExclusion: {
        ...NO_FACTS,
        generalHouseGiftedFromDecedentWithin2yr: true,
        generalHouseGiftDate: D("2017-06-01"),
      },
    });
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
  });
});

describe("E-14d §155③ 공동상속주택 소수지분", () => {
  const co = (largest: boolean) =>
    inheritedSole({ isCoInherited: true, isLargestCoInheritedShareholder: largest });

  it("E14D-7 소수지분 → 주택으로 보지 않는다 → 비과세", () => {
    expect(run(co(false)).calculationRoute.highValueRule).toBe("below_threshold_exempt");
  });
  it("E14D-7b 부정 짝 — 최대지분자(③ 단서) → 산입 → 과세", () => {
    expect(run(co(true)).calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
  });
  it("E14D-7c L-11 — 증여 게이트는 ② 풀만 비운다 → ③ 소수지분은 여전히 제외", () => {
    const r = run(co(false), {
      inheritedHouseExclusion: {
        ...NO_FACTS,
        generalHouseGiftedFromDecedentWithin2yr: true,
        generalHouseGiftDate: D("2019-01-01"),
      },
    });
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
  });
});

describe("E-14d 중과 — 영 §167의10①15호(상속주택 + 일반주택 1세대1주택 의제)", () => {
  const BIG = 3_000_000_000; // 주택분 12억 초과 → 과세분이 남아 중과 여부가 세액을 가른다
  const regulated = (other: HouseInfo) =>
    ({ multiHouse: multiHouse(other, { isRegulatedArea: true }) }) as Partial<MixedUseAssetInput>;

  it("E14D-8 대조군 — 일반 2주택(조정지역) → multi_house_2 중과", () => {
    const c = run(
      makeHouseInfo("h2", { acquisitionDate: D("2015-03-01") }),
      regulated(makeHouseInfo("h2", { acquisitionDate: D("2015-03-01") })),
      BIG,
      TRANSFER,
      makeMockRatesWithHouseEngine(),
    );
    expect(c.multiHouseSurcharge?.surchargeApplicable).toBe(true);
  });

  it("E14D-8b 상속주택 + 겸용주택 → 15호 배제(inherited_general_house) · 비과세+고가 안분", () => {
    const r = run(inheritedSole(), regulated(inheritedSole()), BIG, TRANSFER, makeMockRatesWithHouseEngine());
    expect(r.multiHouseSurcharge).toBeDefined();
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(false);
    expect(r.multiHouseSurcharge?.exclusionReasons.map((x) => x.type)).toContain("inherited_general_house");
    expect(r.calculationRoute.highValueRule).toBe("above_threshold_prorated");
    expect(r.housingPart.longTermDeductionAmount).toBeGreaterThan(0);
  });
});
