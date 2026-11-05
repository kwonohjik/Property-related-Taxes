/**
 * NH-09 — 겸용주택 경로가 조특법 §99·§99의3 선택 주택에 소득세법 시행령 §167의3①5호(3주택 이상)·§167의10①2호(2주택) 중과 배제를
 * 자동으로 주입하지 않던 결함. 단건 경로(STEP 0.45 `resolveSurchargeExclusionByReduction`)는 적격이면 양도 주택에
 * `isTaxSpecialExemption`을 주입해 중과를 배제하는데, 겸용(`calcMixedUseTransferTax`)은 감면 선택을 «차감형은 계산하지 않고 고지»로만
 * 다뤄 중과가 그대로 걸렸다.
 *
 * 기대값은 «같은 사실에서 양도 주택에 5호 수동 토글(`isTaxSpecialExemption`)을 켠 대조»와 같아야 한다(리뷰 case14 222,176,600 계열).
 *
 * ⚠️ NH-33(겸용 경로는 §99·§99의3 양도소득금액 차감 자체를 반영하지 않음 — Q-14 미결)은 이 PR 범위 밖이라 그대로다.
 *    그래서 단건 경로 값(차감 반영)과는 같아지지 않는 것이 정상이다 — 이 anchor는 수동 토글 대조와 감면 미선택 대조만 쓴다.
 *
 * 세율표는 mock(`makeMockRatesWithHouseEngine`) — 정본 세액이 아니다.
 */
import { describe, expect, it } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixed } from "../_helpers/mixed-use-identity-std";
import { makeHouseInfo, makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const rates = makeMockRatesWithHouseEngine();
const TD = D("2026-06-01"); // 2026.5.9. 유예 종료 후
const PRICE = 1_100_000_000;

const mh = (n: number, sellingOver: Record<string, unknown> = {}, isRegulatedArea = true) => ({
  houses: [
    makeHouseInfo("selling", sellingOver as never),
    ...Array.from({ length: n - 1 }, (_, i) => makeHouseInfo(`h${i + 2}`, { acquisitionDate: D("2015-03-01") })),
  ],
  sellingHouseId: "selling",
  presaleRights: [],
  isOneHousehold: true,
  isRegulatedArea,
});

const r993 = () => ({
  type: "new_99_3",
  contractDate993: D("2002-03-01"),
  acquisitionType993: "from_builder",
  region993: "outside_speculation",
  standardPriceAtAcquisition993: 100_000_000,
  standardPriceAt5Years: 200_000_000,
  standardPriceAtTransfer993: 400_000_000,
  exclusiveAreaSqm993: 84,
});
const r99 = (over: Record<string, unknown> = {}) => ({
  type: "new_99",
  contractDate99: D("1998-06-01"),
  acquisitionType99: "from_builder",
  isNationalHousing99: false,
  standardPriceAtAcquisition99: 100_000_000,
  standardPriceAt5Years99: 160_000_000,
  standardPriceAtTransfer99: 250_000_000,
  exclusiveAreaSqm99: 84,
  ...over,
});

/** 한시 유예(2022.5.10.~2026.5.9.) 활성 변형 — 기본 mock은 유예가 꺼져 있다(`multi-house-grace-period.test.ts`와 같은 방식). */
function ratesWithSuspensionActive() {
  const r = makeMockRatesWithHouseEngine();
  const surcharge = r.get("transfer:surcharge:_default")!;
  r.set("transfer:surcharge:_default", {
    ...surcharge,
    specialRules: { surcharge_suspended: true, suspended_types: ["multi_house_2", "multi_house_3plus"], suspended_until: "2026-05-09" },
  });
  return r;
}

function run(over: Record<string, unknown>, opts: { price?: number; date?: Date; rates?: typeof rates } = {}) {
  return calcMixed(
    opts.price ?? PRICE,
    opts.date ?? TD,
    {
      ...mixedUseCase14(),
      isOneHouseExempt: false,
      buildingAcquisitionDate: D("2003-09-01"),
      landAcquisitionDate: D("2003-09-01"),
      ...over,
    } as unknown as MixedUseAssetInput,
    opts.rates ?? rates,
  );
}
const payable = (r: { total: { totalPayable: number } }) => r.total.totalPayable;

describe("NH-09 겸용 × §99의3 — 3주택 조정: 중과 배제 자동 주입", () => {
  it("A1 §99의3 선택 = 양도 주택 5호 수동 토글 대조 = 222,176,600 / 중과 없음 / 감면 미선택은 423,062,208", () => {
    const control = run({ multiHouse: mh(3) });
    const selected = run({ multiHouse: mh(3), reductions: [r993()] });
    const manual = run({ multiHouse: mh(3, { isTaxSpecialExemption: true }), reductions: [r993()] });
    expect(payable(control)).toBe(423_062_208);
    expect(payable(manual)).toBe(222_176_600);
    expect(payable(selected)).toBe(payable(manual));
    expect(selected.multiHouseSurcharge?.surchargeType).toBe("none");
    expect(selected.multiHouseSurcharge?.exclusionReasons.map((e) => e.type)).toContain("tax_special_exemption");
  });

  it("A2 2주택 조정(소령 §167의10①2호)도 같다 — 수동 토글 대조와 일치", () => {
    const selected = run({ multiHouse: mh(2), reductions: [r993()] });
    const manual = run({ multiHouse: mh(2, { isTaxSpecialExemption: true }), reductions: [r993()] });
    const control = run({ multiHouse: mh(2) });
    expect(payable(selected)).toBe(payable(manual));
    expect(payable(selected)).toBeLessThan(payable(control));
    expect(selected.multiHouseSurcharge?.surchargeType).toBe("none");
  });

  it("A3 §99 + 양도가액 30억(F-46 사례, 1998 계약 84㎡ — 고가주택 면적 요건 미달): 수동 토글 대조 = 702,072,863", () => {
    const base = { buildingAcquisitionDate: D("1999-01-01"), landAcquisitionDate: D("1999-01-01") };
    const selected = run({ ...base, multiHouse: mh(3), reductions: [r99()] }, { price: 3_000_000_000 });
    const manual = run(
      { ...base, multiHouse: mh(3, { isTaxSpecialExemption: true }), reductions: [r99()] },
      { price: 3_000_000_000 },
    );
    expect(payable(manual)).toBe(702_072_863);
    expect(payable(selected)).toBe(payable(manual));
    expect(selected.multiHouseSurcharge?.surchargeType).toBe("none");
  });
});

describe("NH-09 결과 표시 — 단건과 같은 step·고지", () => {
  it("B1 중과 배제 step이 남고, 차감 미반영 고지와 별도로 «중과 배제만 반영» 고지가 남는다", () => {
    const r = run({ multiHouse: mh(3), reductions: [r993()] });
    const step = r.steps.find((s) => s.id === "surcharge-exclusion-by-reduction");
    expect(step?.title).toBe("감면주택 다주택 중과 배제");
    expect(step?.legalBasis).toContain("§167의3①5호");
    expect(r.warnings.some((w) => w.includes("중과 배제") && w.includes("§99의3"))).toBe(true);
  });

  it("B2 감면 미선택이면 step·고지가 없다", () => {
    const r = run({ multiHouse: mh(3) });
    expect(r.steps.some((s) => s.id === "surcharge-exclusion-by-reduction")).toBe(false);
    expect(r.warnings.some((w) => w.includes("중과 배제"))).toBe(false);
  });
});

describe("NH-09 짝 — 감면 불성립이면 중과 유지(= 감면 미선택 대조)", () => {
  it("C1 고가주택(§99 1998 계약 · 170㎡ · 6억 초과): 감면 불성립 → 중과 유지", () => {
    const base = { buildingAcquisitionDate: D("1999-01-01"), landAcquisitionDate: D("1999-01-01") };
    const selected = run({ ...base, multiHouse: mh(3), reductions: [r99({ exclusiveAreaSqm99: 170 })] }, { price: 3_000_000_000 });
    const control = run({ ...base, multiHouse: mh(3) }, { price: 3_000_000_000 });
    expect(payable(selected)).toBe(payable(control));
    expect(selected.multiHouseSurcharge?.surchargeType).toBe("multi_house_3plus");
    expect(selected.steps.some((s) => s.id === "surcharge-exclusion-by-reduction")).toBe(false);
  });

  it("C2 계약일이 감면 기간 밖(§99의3 2005 계약): 불성립 → 중과 유지", () => {
    const out = { ...r993(), contractDate993: D("2005-03-01") };
    const selected = run({ multiHouse: mh(3), reductions: [out] });
    const control = run({ multiHouse: mh(3) });
    expect(payable(selected)).toBe(payable(control));
    expect(selected.multiHouseSurcharge?.surchargeType).toBe("multi_house_3plus");
  });

  it("C3 판정 가액 = §89 겸용 고가주택 판정과 같은 소스 — 주택 연면적이 더 크면(§154③ 본문) 건물 전체 가액, 아니면 주택분", () => {
    // §99 1998 계약 170㎡: 고가주택 = 6억 초과(소령 §156 — 2002.9.30. 이전 기준). 전체 11억 · 주택분 ≈ 6.3억이라 둘 다 초과 → 가액 축이 갈리게
    // 주택분이 6억 이하가 되도록 주택 기준시가를 낮춘다(주택분 ≈ 3억대, 전체 11억).
    const lowHousingStd = {
      transferStandardPrice: { housingPrice: 200_000_000, commercialBuildingPrice: 300_000_000, landPricePerSqm: 2_000_000 },
      acquisitionStandardPrice: { housingPrice: 100_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 500_000 },
      buildingFootprintArea: 100,
      totalLandArea: 200,
      buildingAcquisitionDate: D("1999-01-01"),
      landAcquisitionDate: D("1999-01-01"),
    };
    const red = [r99({ exclusiveAreaSqm99: 170 })];
    // 주택 연면적 < 상가: 주택분으로 판정 → 6억 이하 → 적격 → 중과 배제
    const small = run({ ...lowHousingStd, residentialFloorArea: 60, nonResidentialFloorArea: 140, multiHouse: mh(3), reductions: red });
    expect(small.multiHouseSurcharge?.surchargeType).toBe("none");
    // 주택 연면적 > 상가: 건물 전체 11억으로 판정 → 6억 초과 → 불성립 → 중과 유지
    const whole = run({ ...lowHousingStd, residentialFloorArea: 140, nonResidentialFloorArea: 60, multiHouse: mh(3), reductions: red });
    expect(whole.multiHouseSurcharge?.surchargeType).toBe("multi_house_3plus");
  });

  it("C4 비조정지역: 감면을 선택해도 중과 판정은 없다 — step·고지도 없다(중과 배제할 중과가 없다)", () => {
    const selected = run({ multiHouse: mh(3, {}, false), reductions: [r993()] });
    const control = run({ multiHouse: mh(3, {}, false) });
    expect(payable(selected)).toBe(payable(control));
  });

  it("C5 1주택(다른 보유 주택 없음): 불변", () => {
    const selected = run({ multiHouse: mh(1), reductions: [r993()] });
    const control = run({ multiHouse: mh(1) });
    expect(payable(selected)).toBe(payable(control));
  });

  it("C6 2022.5.10.~2026.5.9. 유예 구간 양도: 중과가 이미 유예라 감면 선택과 무관하게 같다", () => {
    const d = D("2023-06-01");
    const suspended = ratesWithSuspensionActive();
    const selected = run({ multiHouse: mh(3), reductions: [r993()] }, { date: d, rates: suspended });
    const control = run({ multiHouse: mh(3) }, { date: d, rates: suspended });
    expect(control.multiHouseSurcharge?.isSurchargeSuspended).toBe(true);
    expect(payable(selected)).toBe(payable(control));
  });
});

describe("NH-09 입력 배선 — 단건 STEP 0.45와 같은 날짜 인자", () => {
  const noContract = () => {
    const { contractDate99: _omit, ...rest } = r99();
    void _omit;
    return rest;
  };

  it("D1 자산-수준 매매계약일(assetContractDate)이 감면 시한 기준일로 전달된다 — 취득일이 시한 밖이어도 계약일이 안이면 적격", () => {
    const base = { multiHouse: mh(3), reductions: [noContract()], buildingAcquisitionDate: D("2000-01-01"), landAcquisitionDate: D("2000-01-01") };
    const withContract = run({ ...base, assetContractDate: D("1998-12-01") });
    const without = run(base);
    expect(withContract.multiHouseSurcharge?.surchargeType).toBe("none");
    expect(without.multiHouseSurcharge?.surchargeType).toBe("multi_house_3plus");
  });

  it("D2 감면 취득일은 건물 취득일(주택 부분 취득일)이다 — 토지 취득일이 시한 밖이어도 건물이 안이면 적격", () => {
    const r = run({
      multiHouse: mh(3),
      reductions: [noContract()],
      landAcquisitionDate: D("1997-01-01"),
      buildingAcquisitionDate: D("1999-01-01"),
      acquisitionStandardPrice: { housingPrice: 100_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 500_000, landPricePerSqmAtBuildingAcq: 500_000 },
    });
    expect(r.multiHouseSurcharge?.surchargeType).toBe("none");
  });
});
