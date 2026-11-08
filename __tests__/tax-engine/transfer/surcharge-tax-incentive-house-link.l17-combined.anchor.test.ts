/**
 * 조특법 §99·§99의3·§99의4 리뷰 L17 — 3호 미확인 ⑥ 행과 5호 「모름」 행이 함께 있고 **둘 다** 일반주택에서 빼야 중과가 꺼지는
 * 세대에서 확인 필요 고지가 하나도 안 실리던 결함(`withTaxIncentiveHouseNotices`). 3호 고지·5호 고지는 각자의 행만 뒤집어
 * 재판정해 어느 쪽 단독으로도 결론이 안 갈리면 침묵했다(「모름 = 혜택 불성립 + 확인 필요」).
 * 세액·중과 판정은 그대로이고 고지만 늘어난다. 단건 헤드라인·판정 메뉴 행 판정·엔진 leaf를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  withTaxIncentiveHouseNotices,
  TAX_INCENTIVE_RENTAL_3HO_UNCONFIRMED_NOTICE,
  TAX_INCENTIVE_HOUSE_3HO_5HO_COMBINED_NOTICE,
} from "@/lib/tax-engine/surcharge-tax-incentive-house-link";
import type { SpecialHouseExclusionInput } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { runMultiHouseSurchargeStep } from "@/lib/tax-engine/transfer-tax-judgment-steps";
import { judgeSurchargeRowSimplified } from "@/lib/tax-engine/multi-house-surcharge-narrative";
import { resolveHceGeneralHouseAcquisitionDate } from "@/lib/tax-engine/transfer-tax-precalc";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import { defaultRules, mockRegulatedHistory, suspensionNone, makeHouse, makeInput } from "../_helpers/multi-house-mock";
import { baseTransferInput } from "../_helpers/mock-rates";

const FIVE_HO_PREFIX = "확인 필요: 주택 수 제외로 선언한 감면주택이";
const has3ho = (ws: string[]) => ws.includes(TAX_INCENTIVE_RENTAL_3HO_UNCONFIRMED_NOTICE);
const n5ho = (ws: string[]) => ws.filter((w) => w.startsWith(FIVE_HO_PREFIX));
const hasCombined = (ws: string[]) => ws.includes(TAX_INCENTIVE_HOUSE_3HO_5HO_COMBINED_NOTICE);

describe("엔진 leaf — withTaxIncentiveHouseNotices", () => {
  const TD = new Date("2021-09-18");
  const SELLING = makeHouse("h1", { regionCode: "11680", acquisitionDate: new Date("2015-01-01") });
  const judge = (houses: HouseInfo[]) =>
    determineMultiHouseSurcharge(makeInput(houses, { sellingHouseId: "h1", transferDate: TD }), defaultRules, mockRegulatedHistory, suspensionNone, true);
  const base = (over: Partial<SpecialHouseExclusionInput>): SpecialHouseExclusionInput => ({
    article: "unsold_99_2",
    houseId: "h2",
    houseContractDate: new Date("2013-06-01"),
    requirementsConfirmed: true,
    ...over,
  });
  const rental = (houseId: string) => base({ article: "rental_97", houseId, houseContractDate: undefined, houseRentalStartDate: new Date("1999-06-01") });
  const unknown5 = (houseId: string) =>
    base({
      article: "unsold_98_3",
      houseId,
      houseAcquisitionDate: new Date("2009-06-01"),
      houseContractDate: undefined,
      isInherited: true,
      inheritedPresaleCompletedByHeir: "unknown",
    });
  const notices = (houses: HouseInfo[], decls: SpecialHouseExclusionInput[]) =>
    withTaxIncentiveHouseNotices(judge(houses), houses, decls, TD, "h1", judge);
  const three = [SELLING, makeHouse("h2"), makeHouse("h3")];

  it("3주택 · 3호 미확인 1 + 5호 「모름」 1 — 둘 다 뒤집어야 배제 → 3호·5호·보충 고지 모두", () => {
    const r = notices(three, [rental("h2"), unknown5("h3")]);
    expect(r.surchargeApplicable, "판정은 그대로 중과").toBe(true);
    expect(has3ho(r.warnings)).toBe(true);
    expect(n5ho(r.warnings)).toHaveLength(1);
    expect(n5ho(r.warnings)[0]).toContain("상속 당시 분양권이었고 상속인이 잔금을 내고 취득했는지 확인되지 않아");
    expect(hasCombined(r.warnings)).toBe(true);
    expect(r.warnings).toHaveLength(3);
  });
  it("대조 — 각자 단독 재판정은 이 세대에서 침묵한다(결함 경로 확인)", () => {
    const only3 = notices(three, [rental("h2")]);
    const only5 = notices(three, [unknown5("h3")]);
    expect(only3.warnings).toEqual([]);
    expect(only5.warnings).toEqual([]);
  });
  it("대조 — ⑥ 선언이 없으면 고지 없음", () => {
    expect(notices(three, []).warnings).toEqual([]);
  });
  it("단독 단건 출력은 그대로 — 2주택 3호만 → 3호 고지 한 번 · 5호만 → 5호 고지 한 번 · 보충 고지 없음", () => {
    const two = [SELLING, makeHouse("h2")];
    const a = notices(two, [rental("h2")]);
    expect(a.warnings).toEqual([TAX_INCENTIVE_RENTAL_3HO_UNCONFIRMED_NOTICE]);
    const b = notices(two, [unknown5("h2")]);
    expect(n5ho(b.warnings)).toHaveLength(1);
    expect(b.warnings).toHaveLength(1);
    expect(hasCombined(b.warnings)).toBe(false);
  });
  it("3주택 · 3호 미확인 둘(5호 없음) → 3호 고지 한 번만(합산 경로 아님) · 5호 「모름」 둘 → 5호 고지 한 번만", () => {
    const a = notices(three, [rental("h2"), rental("h3")]);
    expect(a.warnings).toEqual([TAX_INCENTIVE_RENTAL_3HO_UNCONFIRMED_NOTICE]);
    const b = notices(three, [unknown5("h2"), unknown5("h3")]);
    expect(n5ho(b.warnings)).toHaveLength(1);
    expect(b.warnings).toHaveLength(1);
  });
  it("4주택 · 3호 1 + 5호 1 — 둘을 뒤집어도 일반주택이 둘 남아 중과 유지 → 고지 없음", () => {
    const four = [...three, makeHouse("h4"), makeHouse("h5")];
    const r = notices(four, [rental("h2"), unknown5("h3")]);
    expect(r.surchargeApplicable).toBe(true);
    expect(r.warnings).toEqual([]);
  });
  it("이미 중과가 꺼진 판정 → 같은 결과 객체", () => {
    const chipped = [SELLING, makeHouse("h2", { isUnsoldHousing: true }), makeHouse("h3", { isUnsoldHousing: true })];
    const excluded = judge(chipped);
    expect(excluded.surchargeApplicable).toBe(false);
    expect(withTaxIncentiveHouseNotices(excluded, chipped, [rental("h2"), unknown5("h3")], TD, "h1", judge)).toBe(excluded);
  });
  it("3호 대상 행이 이미 5호 표시 → 3호 대상이 없어 합산 고지 없음", () => {
    const chip = [SELLING, makeHouse("h2", { isUnsoldHousing: true }), makeHouse("h3")];
    expect(notices(chip, [rental("h2"), unknown5("h3")]).warnings.includes(TAX_INCENTIVE_HOUSE_3HO_5HO_COMBINED_NOTICE)).toBe(false);
  });
});

describe("단건 헤드라인 · 판정 메뉴 행 판정이 같은 leaf를 쓴다", () => {
  const TD = new Date("2026-09-18");
  const GANGNAM = "1168010100";
  const house = (id: string, over: Record<string, unknown> = {}) => ({
    id, acquisitionDate: new Date("2015-01-01"), officialPrice: 500_000_000, region: "capital", regionCode: GANGNAM,
    isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, ...over,
  });
  const rentalDecl = { article: "rental_97", houseId: "h2", houseRentalStartDate: new Date("1999-06-01"), requirementsConfirmed: true };
  const unknown5Decl = {
    article: "new_99_3",
    houseId: "h3",
    housingKind: "original_purchase",
    houseContractDate: new Date("2001-03-01"),
    houseAcquisitionDate: new Date("2001-05-01"),
    originalOutsideMetropolitan: "yes",
    originalNationalHousing: "unknown",
    requirementsConfirmed: true,
  };
  const build = (decls: object[]): TransferTaxInput =>
    baseTransferInput({
      transferDate: TD, acquisitionDate: new Date("2015-01-01"), isOneHousehold: true, isRegulatedArea: true,
      householdHousingCount: 3, residencePeriodMonths: 0,
      houses: [house("selling"), house("h2"), house("h3")] as TransferTaxInput["houses"], sellingHouseId: "selling",
      specialHouseExclusions: decls as TransferTaxInput["specialHouseExclusions"],
    } as Partial<TransferTaxInput>);
  const rates = (i: TransferTaxInput) => parseRatesFromMap(loadFallbackTransferRates(i.transferDate));

  it("헤드라인(runMultiHouseSurchargeStep) — 합산 고지 3건 · 중과 유지 · 단독 선언은 침묵", () => {
    const i = build([rentalDecl, unknown5Decl]);
    const r = runMultiHouseSurchargeStep(i, rates(i), [], { excluded: false } as never, resolveHceGeneralHouseAcquisitionDate(i))!;
    expect(r.surchargeApplicable).toBe(true);
    expect(has3ho(r.warnings)).toBe(true);
    expect(n5ho(r.warnings)).toHaveLength(1);
    expect(hasCombined(r.warnings)).toBe(true);
    for (const only of [[rentalDecl], [unknown5Decl]]) {
      const j = build(only);
      const s = runMultiHouseSurchargeStep(j, rates(j), [], { excluded: false } as never, resolveHceGeneralHouseAcquisitionDate(j))!;
      expect(s.warnings.filter((w) => has3ho([w]) || w.startsWith(FIVE_HO_PREFIX) || hasCombined([w])), "단독은 결함 경로 — 침묵").toEqual([]);
    }
  });
  it("판정 메뉴 행 판정(judgeSurchargeRowSimplified, 양도 주택=selling) — 합산 고지", () => {
    const i = build([rentalDecl, unknown5Decl]);
    const j = judgeSurchargeRowSimplified(i, rates(i), "selling", resolveHceGeneralHouseAcquisitionDate(i))!;
    expect(j.result.surchargeApplicable).toBe(true);
    expect(has3ho(j.result.warnings)).toBe(true);
    expect(n5ho(j.result.warnings)).toHaveLength(1);
    expect(hasCombined(j.result.warnings)).toBe(true);
  });
});
