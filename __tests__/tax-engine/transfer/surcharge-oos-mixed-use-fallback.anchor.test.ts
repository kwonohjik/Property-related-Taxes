/**
 * 겸용주택 자산별 fallback(`asset.surchargeFallback`) = 명부(정밀) 경로 — 위기취득 · 한시배제 보유 2년 · 감면주택 배제.
 *
 * 계획서: `docs/00-pm/surcharge-oos-remaining.plan.md` A. 단건 경로는 PR #2977(US-08 · US-38)·#2978(12의2 보유 2년)에서 고쳤고
 * 겸용 fallback만 술어에 취득일·감면 배제 표지를 넘기지 않았다. 기대값은 같은 입력에 명부(양도 행 + 다른 주택)를 실어 얻는다.
 *
 * 실측(수정 전 fallback): 위기취득 368,585,036 · 보유 1년 6개월 30억 1,283,183,922 / 60억 2,598,788,362 · §99의3 318,535,333.
 * 세율표는 mock(`makeMockRatesWithHouseEngine`) — 정본 세액이 아니다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixed } from "../_helpers/mixed-use-identity-std";
import { makeHouseInfo, makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);

/** 한시배제(2022.5.10.~2026.5.9.) 활성 변형 — 기본 mock은 유예를 끈다. */
function ratesWithSuspension() {
  const r = makeMockRatesWithHouseEngine();
  const s = r.get("transfer:surcharge:_default")!;
  r.set("transfer:surcharge:_default", {
    ...s,
    specialRules: { surcharge_suspended: true, suspended_types: ["multi_house_2", "multi_house_3plus"], suspended_until: "2026-05-09" },
  } as never);
  return r;
}

const roster = (n: number, acq: Date) => ({
  multiHouse: {
    houses: [
      makeHouseInfo("selling", { acquisitionDate: acq }),
      ...Array.from({ length: n - 1 }, (_, i) => makeHouseInfo(`h${i + 2}`, { acquisitionDate: D("2015-03-01") })),
    ],
    sellingHouseId: "selling",
    presaleRights: [],
    isOneHousehold: true,
    isRegulatedArea: true,
  } as NonNullable<MixedUseAssetInput["multiHouse"]>,
});
const fallback = (n: number) => ({ surchargeFallback: { isRegulatedArea: true, householdHousingCount: n } });

const R993 = {
  type: "new_99_3", contractDate993: D("2002-03-01"), acquisitionType993: "from_builder", firstContract993: "yes",
  region993: "outside_speculation", standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000,
  standardPriceAtTransfer993: 400_000_000, exclusiveAreaSqm993: 84,
};

function run(acq: Date, td: Date, over: Partial<MixedUseAssetInput> | Record<string, unknown>, opts: { price?: number; rates?: ReturnType<typeof makeMockRatesWithHouseEngine> } = {}) {
  return calcMixed(
    opts.price ?? 1_100_000_000,
    td,
    { ...mixedUseCase14(), isOneHouseExempt: false, buildingAcquisitionDate: acq, landAcquisitionDate: acq, ...over } as MixedUseAssetInput,
    opts.rates ?? makeMockRatesWithHouseEngine(),
  );
}

describe("겸용 fallback — 위기취득(부칙 제9270호 §14①) 세율 배제", () => {
  const ACQ = D("2010-06-01");
  const TD = D("2026-06-01");
  it("A-1: 🔴 2주택 · fallback = 명부 291,164,337 — 세율 기본(+20%p 없음) · 주택분 장특 배제 유지", () => {
    const precise = run(ACQ, TD, roster(2, ACQ));
    const fb = run(ACQ, TD, fallback(2));
    expect(precise.total.totalPayable).toBe(291_164_337);
    expect(fb.total.totalPayable).toBe(precise.total.totalPayable);
    expect(fb.total.surchargeAddon).toBeUndefined();
    expect(fb.housingPart.longTermDeductionAmount).toBe(0);
  });

  it("A-1b: 대조 — 창 밖 취득(2015-01-01)이면 fallback도 +20%p", () => {
    expect(run(D("2015-01-01"), TD, fallback(2)).total.surchargeAddon).toBe(0.2);
  });
});

describe("겸용 fallback — 12의2 한시배제의 보유 2년 요건(§95④)", () => {
  const ACQ = D("2024-09-01");
  const TD = D("2026-03-01");
  it.each([
    [3_000_000_000, 1_285_421_105],
    [6_000_000_000, 2_676_077_013],
  ])("A-2: 🔴 보유 1년 6개월 · 창 안 양도 · %i원 — fallback도 한시배제하지 않는다(§104⑦ 비교과세) = 명부 %i", (price, expected) => {
    const rates = ratesWithSuspension();
    const precise = run(ACQ, TD, roster(2, ACQ), { price, rates });
    const fb = run(ACQ, TD, fallback(2), { price, rates });
    expect(precise.total.totalPayable).toBe(expected);
    expect(fb.total.totalPayable).toBe(expected);
    expect(fb.total.surchargeAddon).toBe(0.2);
  });

  it("A-2b: 대조 — 보유 2년 이상(2023-09-01)이면 창 안에서 fallback도 한시배제", () => {
    expect(run(D("2023-09-01"), TD, fallback(2), { price: 3_000_000_000, rates: ratesWithSuspension() }).total.surchargeAddon).toBeUndefined();
  });
});

describe("겸용 fallback — 감면주택(조특법 §99의3) 중과 배제 선판정", () => {
  const ACQ = D("2003-09-01");
  const TD = D("2026-06-01");
  it("A-3: 🔴 3주택 · §99의3 적격 — fallback = 명부 179,169,333 (배제 단계 · 장특 공제 · 중과 없음)", () => {
    const precise = run(ACQ, TD, { ...roster(3, ACQ), reductions: [R993] });
    const fb = run(ACQ, TD, { ...fallback(3), reductions: [R993] });
    expect(precise.total.totalPayable).toBe(179_169_333);
    expect(fb.total.totalPayable).toBe(precise.total.totalPayable);
    expect(fb.total.surchargeAddon).toBeUndefined();
    expect(fb.housingPart.longTermDeductionAmount).toBe(precise.housingPart.longTermDeductionAmount);
    expect(fb.steps.some((s) => s.id === "surcharge-exclusion-by-reduction")).toBe(true);
  });

  it("A-3b: 대조 — 감면 미선택이면 fallback은 +30%p 그대로(423,062,208)", () => {
    const fb = run(ACQ, TD, fallback(3));
    expect(fb.total.totalPayable).toBe(423_062_208);
    expect(fb.total.surchargeAddon).toBe(0.3);
    expect(fb.steps.some((s) => s.id === "surcharge-exclusion-by-reduction")).toBe(false);
  });
});
