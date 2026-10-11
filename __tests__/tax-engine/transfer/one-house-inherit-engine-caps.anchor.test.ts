/**
 * 상속주택 제외 엔진 축 anchor (PR3a)
 *
 * (1) G6-10 — 결정 #10(§155② 단서를 연혁 없이 적용): 2010.2.18. 전 양도분도 동일세대 단독상속은 상속주택 특례 대상이 아니다.
 *     조세심판관합동회의 조심2009서2497 · 대법원 2009두9772. 평가셋 음성 짝(T001-era 등)이 M2 축(신도시 거주 2년)에 가려 이 축이
 *     뒤집혀도 통과하던 안전망 공백을 엔진 직접 anchor로 메운다(「양도일 < 2010-02-18 이면 동일세대 해제」 뮤테이션이 이 파일에서 죽는다).
 * (2) S01-2 — 계산기 경로도 ②③ 동시 제외 + ①을 불허한다(판정 메뉴와 같은 정본 술어).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

function eraInput(sameHousehold: boolean): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    sellingHouseId: "selling",
    transferPrice: 300_000_000,
    acquisitionPrice: 200_000_000,
    acquisitionDate: D("2002-11-20"),
    transferDate: D("2009-04-30"), // 2010.2.18. 단서 신설 전 양도분
    residencePeriodMonths: 24,
    houses: [
      makeHouseInfo("selling", {}),
      makeHouseInfo("inh", {
        isInherited: true,
        inheritedDate: D("2003-01-29"),
        decedentSameHouseholdAtInheritance: sameHousehold,
      }),
    ],
  });
}

describe("G6-10 — 결정 #10: 2010.2.18. 전 양도분에도 §155② 단서(동일세대 상속) 적용", () => {
  it("동일세대 단독상속 → 상속주택 제외 0 · 과세", () => {
    const r = calculateTransferTax(eraInput(true), mockRates);
    expect(r.isExempt).toBe(false);
  });
  it("긍정 짝 — 별도세대 단독상속 → 제외 1 · 비과세", () => {
    const r = calculateTransferTax(eraInput(false), mockRates);
    expect(r.isExempt).toBe(true);
  });
});

describe("S01-2 — 계산기 경로: ② + ③ + ① 세 특례 불허", () => {
  const input = (houses: ReturnType<typeof makeHouseInfo>[]): TransferTaxInput =>
    baseTransferInput({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: houses.length,
      sellingHouseId: "selling",
      transferPrice: 800_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: D("2001-09-01"),
      transferDate: D("2023-02-28"),
      residencePeriodMonths: 24,
      temporaryTwoHouse: { previousAcquisitionDate: D("2001-09-01"), newAcquisitionDate: D("2020-12-01") },
      houses,
    });
  const selling = makeHouseInfo("selling", { acquisitionDate: D("2001-09-01") });
  const newHouse = makeHouseInfo("new", { acquisitionDate: D("2020-12-01") });
  const sole = makeHouseInfo("sole", { isInherited: true, inheritedDate: D("2021-06-01"), acquisitionDate: D("2000-01-01") });
  const co = makeHouseInfo("co", {
    isInherited: true,
    isCoInherited: true,
    isLargestCoInheritedShareholder: false,
    inheritedDate: D("2022-04-18"),
    acquisitionDate: D("2000-01-01"),
  });

  it("①+②+③ → 과세(일시적 2주택 불성립)", () => {
    expect(calculateTransferTax(input([selling, newHouse, sole, co]), mockRates).isExempt).toBe(false);
  });
  it.each([
    ["①+②", [selling, newHouse, sole]],
    ["①+③", [selling, newHouse, co]],
  ])("긍정 짝 %s → 비과세 유지", (_l, hs) => {
    expect(calculateTransferTax(input(hs), mockRates).isExempt).toBe(true);
  });
});
