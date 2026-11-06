/**
 * NH-13·NH-12 anchor — 겸용주택 엔진(별도 사본, `runHouseCountExclusionStep`을 타지 않는다) (계획서 N13-9·N12-7).
 *
 * 세율은 `makeMockRates`라 금액은 mock 값이다(route 시료와 금액이 다르다). 기대값은 같은 사실에서 제외를 하나만 선언한 대조의 실측값이다.
 * 2채는 `effectiveHouseCount <= 1`이라 수정 전에도 같은 결론이다(과대 방향이 없다) — 짝으로 고정한다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../_helpers/mixed-use-identity-std";
import { makeMockRates, makeHouseInfo } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const D = (s: string) => new Date(s);
const TRANSFER = D("2026-06-01");
const PRICE = 1_000_000_000;
const NO_FACTS = { generalHouseGiftedFromDecedentWithin2yr: undefined, generalHouseGiftDate: undefined, generalHouseRightAtInheritance: undefined };
const RURAL994 = (houseId: string) => ({ type: "new_99_4_rural" as const, houseId, ruralHouseAcquisitionDate: D("2015-03-01"), ruralHouseStdPrice: 100_000_000, isRegisteredHanok: false, adjacentArea994: "no" as const, meetsLocationRequirement: true });
const RURAL7 = (houseId?: string) => ({ ...(houseId ? { houseId } : {}), kind: "inherited" as const, isOutsideCapitalEupMyeon: true, decedentResidenceYears: 10, decedentSameHouseholdAtInheritance: false, parentalCareMergeInheritedHouse: false });

const X = makeHouseInfo("x", { acquisitionDate: D("1995-01-01") });
const Rinh = makeHouseInfo("r", { acquisitionDate: D("2015-03-01"), isInherited: true, inheritedDate: D("2015-03-01"), region: "non_capital", officialPrice: 100_000_000, isApartment: false } as Partial<HouseInfo>);
const Rplain = makeHouseInfo("r", { acquisitionDate: D("2015-03-01"), region: "non_capital", officialPrice: 100_000_000, isApartment: false } as Partial<HouseInfo>);

function run(others: HouseInfo[], over: Record<string, unknown> = {}) {
  const r = calcMixedUseTransferTax(PRICE, TRANSFER, {
    ...mixedUseCase14(),
    isOneHouseExempt: false,
    isOneHousehold: true,
    householdHousingCountForExclusion: others.length + 1,
    multiHouse: { houses: [makeHouseInfo("selling", { acquisitionDate: D("1997-09-12") }), ...others], sellingHouseId: "selling", presaleRights: [], isOneHousehold: true, isRegulatedArea: false },
    inheritedHouseExclusion: NO_FACTS,
    ...over,
  } as MixedUseAssetInput, makeMockRates());
  return { rule: r.calculationRoute.highValueRule, tax: r.total.transferTax, warnings: r.warnings as string[] };
}

const EXEMPT_TAX = 55_050_516;
const FULL_TAX = 179_909_072;

describe("N13-9 — 겸용: 같은 행이 조특법 §99의4와 상속 제외에 함께 걸리면 한 번만 뺀다", () => {
  it("3채(겸용 + X + R): 수정 전 55,050,516(비과세) → 대조(§99의4만·상속만)와 같은 179,909,072", () => {
    const same = run([X, Rinh], { reductions: [RURAL994("r")] });
    const ctrl994 = run([X, Rplain], { reductions: [RURAL994("r")] });
    const ctrlInh = run([X, Rinh]);
    expect(ctrl994.tax).toBe(FULL_TAX);
    expect(ctrlInh.tax).toBe(FULL_TAX);
    expect(same.tax).toBe(FULL_TAX);
    expect(same.rule).toBe("non_one_house_full_taxation");
  });
  it("상속 경고 문구에 「추가 차감하지 않음」(겹친 행)을 싣는다", () => {
    const same = run([X, Rinh], { reductions: [RURAL994("r")] });
    expect(same.warnings.some((w) => w.includes("상속주택으로 추가 차감하지 않음"))).toBe(true);
    expect(same.warnings.some((w) => w.startsWith("상속주택 주택수 제외 (§155② 일반주택 양도)"))).toBe(false);
  });
  it("2채(겸용 + R)는 수정 전후 같다 — 비과세(:401 `<= 1`)", () => {
    expect(run([Rinh], { reductions: [RURAL994("r")] }).tax).toBe(EXEMPT_TAX);
    expect(run([Rplain], { reductions: [RURAL994("r")] }).tax).toBe(EXEMPT_TAX);
    expect(run([Rinh]).tax).toBe(EXEMPT_TAX);
  });
  it("짝: 다른 행(상속 R / §99의4 C)이면 둘 다 뺀다 — 비과세 유지", () => {
    const C = makeHouseInfo("c", { acquisitionDate: D("2016-05-01"), region: "non_capital", officialPrice: 100_000_000, isApartment: false } as Partial<HouseInfo>);
    expect(run([Rinh, C], { reductions: [RURAL994("c")] }).tax).toBe(EXEMPT_TAX);
  });
});

describe("N12-7 — 겸용: 이미 주택 수에서 빠진 행을 §155⑦ 상대방으로 다시 쓰지 않는다", () => {
  const facts = (rural: ReturnType<typeof RURAL7> | undefined) => ({
    article155SpecialHouses: { ruralHouse: rural, culturalHeritageHouse: undefined, culturalHeritageHouseId: undefined, unavoidableOutsideCapitalHouse: undefined },
  });
  it("⑦+§99의4 같은 행(3채): 수정 전 55,050,516 → 179,909,072", () => {
    const same = run([X, Rplain], { reductions: [RURAL994("r")], ...facts(RURAL7("r")) });
    const ctrl7 = run([X, Rplain], facts(RURAL7("r")));
    expect(ctrl7.tax).toBe(FULL_TAX);
    expect(same.tax).toBe(FULL_TAX);
  });
  it("⑦+§155② 상속 같은 행(3채): 179,909,072", () => {
    expect(run([X, Rinh], facts(RURAL7("r"))).tax).toBe(FULL_TAX);
  });
  it("houseId 없는 ⑦ 선언은 대조하지 않는다(레거시) — 수정 전과 같은 55,050,516", () => {
    expect(run([X, Rplain], { reductions: [RURAL994("r")], ...facts(RURAL7()) }).tax).toBe(EXEMPT_TAX);
  });
  it("짝: ⑦ 선언이 다른 행을 가리키면 성립 — 비과세", () => {
    const R2 = makeHouseInfo("r2", { acquisitionDate: D("2008-01-01"), region: "non_capital", officialPrice: 100_000_000, isApartment: false } as Partial<HouseInfo>);
    expect(run([R2, Rplain], { reductions: [RURAL994("r")], ...facts(RURAL7("r2")) }).tax).toBe(EXEMPT_TAX);
  });
  it("⑥ 국가유산(culturalHeritageHouseId) + §99의4 같은 행(3채): 179,909,072", () => {
    const cultural = { article155SpecialHouses: { ruralHouse: undefined, culturalHeritageHouse: true, culturalHeritageHouseId: "r", unavoidableOutsideCapitalHouse: undefined } };
    expect(run([X, Rplain], { reductions: [RURAL994("r")], ...cultural }).tax).toBe(FULL_TAX);
  });
});
