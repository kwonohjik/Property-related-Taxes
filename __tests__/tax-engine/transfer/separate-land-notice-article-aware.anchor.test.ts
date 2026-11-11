// anchor — 별도 토지 카드 고지(NH-31 계열)의 문구가 차감을 낸 조문에 맞는다 (2026-11-11 US-34 확대 후속)
//
// 종전: `separateLandCardReductionNotice`가 어느 조문이든 «§99·§99의3 … 해당 건물 연면적의 2배 이내»로 고정돼, §98 시리즈·§98의8·§99의2에도 그 문구가 붙었다
// (§99 계열만 «딸린 토지 2배» 문언이 있다). ⑧(US-34)은 이 조합을 막지만 API 직접 호출·옛 입력은 막지 못해 이 고지가 마지막 안내다.
// 계산은 바꾸지 않는다 — 문구만 조문별로 갈린다.
import { describe, it, expect } from "vitest";
import { separateLandCardReductionNotice } from "@/lib/tax-engine/transfer-reductions/new-housing-appurtenant-land-2x";
import { housingTaxReductionIdOf } from "@/lib/tax-engine/transfer-tax-aggregate-pickers";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "./../_helpers/mock-rates";

const ITEMS = [{ propertyType: "housing" }, { propertyType: "land" }] as const;
const TWO_X = "연면적의 2배 이내";

describe("separateLandCardReductionNotice — 조문별 문구", () => {
  it("L-1: §99·§99의3 → 종전 문구(딸린 토지 2배)", () => {
    for (const id of ["new_99", "new_99_3"]) {
      const m = separateLandCardReductionNotice(ITEMS, [100, 0], [id, undefined]);
      expect(m, id).toContain("§99·§99의3 감면");
      expect(m, id).toContain(TWO_X);
    }
  });

  it("L-2: 🔴 §98 시리즈·§98의8·§99의2 → 「2배」 문구가 아니라 해당 조문명 + 한 장의 주택 카드 안내", () => {
    for (const [id, label] of [
      ["unsold_98_3", "§98의3"], ["unsold_98_5", "§98의5"], ["unsold_98_6", "§98의6"], ["unsold_98_7", "§98의7"],
      ["unsold_98_8", "§98의8"], ["unsold_99_2", "§99의2"],
    ] as const) {
      const m = separateLandCardReductionNotice(ITEMS, [100, 0], [id, undefined]);
      expect(m, id).toContain(label);
      expect(m, id).not.toContain(TWO_X);
      expect(m, id).not.toContain("§99·§99의3 감면");
      expect(m, id).toContain("한 장의 주택 카드");
      expect(m, id).toContain("확인 필요");
    }
  });

  it("L-3: 두 갈래가 함께 있으면 두 문구가 모두 붙는다", () => {
    const m = separateLandCardReductionNotice([{ propertyType: "housing" }, { propertyType: "housing" }, { propertyType: "land" }], [100, 200, 0], ["new_99_3", "unsold_98_8", undefined]);
    expect(m).toContain(TWO_X);
    expect(m).toContain("§98의8");
  });

  it("L-4: 조문 id를 안 넘기면 종전과 같다(하위 호환) · 토지 카드 없음/차감 없음은 고지 없음", () => {
    expect(separateLandCardReductionNotice(ITEMS, [100, 0])).toContain(TWO_X);
    expect(separateLandCardReductionNotice([{ propertyType: "housing" }], [100], ["unsold_98_8"])).toBeUndefined();
    expect(separateLandCardReductionNotice(ITEMS, [0, 0], ["unsold_98_8", undefined])).toBeUndefined();
  });
});

describe("5년 이내 세액감면 — 별도 토지 카드 고지 (2026-11-11 공백 메움)", () => {
  it("T-1: 🔴 세액감면(차감액 0)만 있어도 토지 카드가 있으면 고지 — §99는 2배 문구 · 그 밖은 조문명 + 산출세액 표현", () => {
    const m99 = separateLandCardReductionNotice(ITEMS, [0, 0], [undefined, undefined], ["new_99", undefined]);
    expect(m99).toContain("§99 5년 이내 세액감면");
    expect(m99).toContain(TWO_X);
    expect(m99).toContain("산출세액에서만 감면");
    for (const id of ["unsold_98_3", "unsold_98_5", "unsold_98_6", "unsold_98_7", "unsold_99_2"]) {
      const m = separateLandCardReductionNotice(ITEMS, [0, 0], [undefined, undefined], [id, undefined]);
      expect(m, id).toContain("5년 이내 세액감면");
      expect(m, id).toContain("산출세액에서만 감면");
      expect(m, id).not.toContain(TWO_X);
      expect(m, id).toContain("한 장의 주택 카드");
    }
  });

  it("T-2: 토지 카드가 없거나 세액감면 id가 없으면 고지 없음 · 차감형과 세액감면이 함께면 두 문구", () => {
    expect(separateLandCardReductionNotice([{ propertyType: "housing" }], [0], [undefined], ["unsold_99_2"])).toBeUndefined();
    expect(separateLandCardReductionNotice(ITEMS, [0, 0], [undefined, undefined], [undefined, undefined])).toBeUndefined();
    const both = separateLandCardReductionNotice([{ propertyType: "housing" }, { propertyType: "housing" }, { propertyType: "land" }], [100, 0, 0], ["unsold_98_8", undefined, undefined], [undefined, "unsold_99_2", undefined]);
    expect(both).toContain("§98의8");
    expect(both).toContain("5년 이내 세액감면");
  });

  it("T-3: `housingTaxReductionIdOf` — 주택 감면 id만 · 감면액 0·비과세·토지 대상 감면은 제외", () => {
    expect(housingTaxReductionIdOf({ reductionAmount: 1, reductionTypeApplied: "unsold_99_2" } as never)).toBe("unsold_99_2");
    expect(housingTaxReductionIdOf({ reductionAmount: 0, reductionTypeApplied: "unsold_99_2" } as never)).toBeUndefined();
    expect(housingTaxReductionIdOf({ isExempt: true, reductionAmount: 1, reductionTypeApplied: "unsold_99_2" } as never)).toBeUndefined();
    for (const id of ["self_farming", "public_expropriation", "unsold_98_4", "rental_97_3"]) {
      expect(housingTaxReductionIdOf({ reductionAmount: 1, reductionTypeApplied: id } as never), id).toBeUndefined();
    }
  });
});

describe("합산 엔진 — 주택 카드에 차감형 감면 + 별도 토지 카드", () => {
  const rates = makeMockRates();
  const R992 = { type: "unsold_99_2", houseType992: "new_or_unsold", contractDate992: new Date("2013-05-01"), acquisitionPrice992: 500_000_000, exclusiveAreaSqm992: 80,
    meetsHouseTypeRequirement992: true, isNotExcludedSelfBuilt992: true, isNotRecontract992: true, hasConfirmationSeal992: true,
    standardPriceAtAcquisition992: 200_000_000, standardPriceAt5Years992: 300_000_000, standardPriceAtTransfer992: 400_000_000 };
  const R988 = { type: "unsold_98_8", contractDate988: new Date("2015-05-01"), acquisitionPrice988: 500_000_000, exclusiveAreaSqm988: 80,
    rentalContractDate988: new Date("2015-09-01"), rentalStartDate988: new Date("2015-09-01"), rentalEndDate988: new Date("2021-12-31"),
    businessRegistrationDate988: new Date("2015-08-01"), rentalRegistrationDate988: new Date("2015-08-01"),
    isUnsoldAfterCompletion988: true, isFirstContract988: true, isNotRecontract988: true,
    standardPriceAtAcquisition988: 200_000_000, standardPriceAt5Years988: 300_000_000, standardPriceAtTransfer988: 400_000_000 };

  function warningsOf(red: unknown, acq: string, tr: string, withLand = true): string[] {
    const common = { transferDate: new Date(tr), acquisitionDate: new Date(acq), householdHousingCount: 2, isOneHousehold: false, residencePeriodMonths: 0, expenses: 0 } as Record<string, unknown>;
    const house = baseTransferInput({ ...common, propertyType: "housing", transferPrice: 600_000_000, acquisitionPrice: 200_000_000, reductions: [red] } as never) as unknown as Record<string, unknown>;
    const land = baseTransferInput({ ...common, propertyType: "land", transferPrice: 300_000_000, acquisitionPrice: 100_000_000, householdHousingCount: 0 } as never) as unknown as Record<string, unknown>;
    const r = calculateTransferTaxAggregate({ taxYear: Number(tr.slice(0, 4)), annualBasicDeductionUsed: 0,
      properties: [{ ...house, propertyId: "H", propertyLabel: "H" }, ...(withLand ? [{ ...land, propertyId: "L", propertyLabel: "L" }] : [])] } as never, rates) as unknown as { warnings?: string[] };
    return (r.warnings ?? []).filter((w) => w.includes("별도 토지 카드가 있습니다"));
  }

  it("E-1: 🔴 §99의2 5년 후 — «§99의2» 문구, «2배» 문구 없음", () => {
    const w = warningsOf(R992, "2013-06-01", "2019-06-01");
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("§99의2");
    expect(w[0]).not.toContain(TWO_X);
  });

  it("E-3: 🔴 §99의2 5년 이내 세액감면 — 종전에는 고지가 없었다(실측: 한 장 카드 0 · 분리 62,681,442)", () => {
    const w = warningsOf(R992, "2013-06-01", "2016-06-01");
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("§99의2");
    expect(w[0]).toContain("5년 이내 세액감면");
    expect(w[0]).not.toContain(TWO_X);
  });

  it("E-4: 대조 — 별도 토지 카드가 없으면 같은 감면도 고지 없음", () => {
    expect(warningsOf(R992, "2013-06-01", "2016-06-01", false)).toEqual([]);
  });

  it("E-2: 🔴 §98의8 — «§98의8» 문구, «2배» 문구 없음", () => {
    const w = warningsOf(R988, "2015-06-01", "2022-06-01");
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("§98의8");
    expect(w[0]).not.toContain(TWO_X);
  });
});
