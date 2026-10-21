/**
 * P6 — 주택 split 파트 이월과세 × 증여자 취득가액 환산(증여자 취득 당시 그 파트 기준시가) anchor (2026-10-21)
 *
 * 계획: docs/00-pm/transfer-split-part-carryover-p6.plan.md §3(결함 E-A·E-B·E-C)·§3.1(M1~M5)·§5.1·§6(Q1~Q4)
 *   · E-A 증여세 상당액 소실 · E-B 거짓 단서 비교 발동 — 증여세 상당액은 §97②2호 단서 비교 **밖**에서 swap 결정 뒤에 필요경비에 더한다(§97의2①3호).
 *   · E-C 분리 계산 침묵 탈락 — 분자는 해결자 전용 `splitCarryoverBasis`로 주입(`calcAcqStdPair` override). 증여자 같은 날 취득은 leaf S10이 막는다(Q1).
 *   · 분자 = 파트당 총액 1칸(Q2) — 지분 스케일 없음. §114조의2는 현행 유지(Q3 — 엔진 변경 없음).
 * 시드는 계획서 §3.1(8억 축 · 양도일 2025-06-30 · 비1주택). mock 세율이라 같은 시드끼리 상대 비교만 의미가 있다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { composeSplitCarryover } from "@/lib/tax-engine/transfer-split-carryover-compose";
import { calcAcqStdPair, calcApportionRatio } from "@/lib/tax-engine/transfer-tax-split-acq-price";
import { collectSplitPartCauseIssues, PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE } from "@/lib/tax-engine/transfer-split-part-cause";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { splitCarryoverAcquisitionText, splitCarryoverView } from "@/lib/tax-engine/transfer-tax-split-carryover-display";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

const AX = { "8": { land: 480_000_000, bldg: 320_000_000 }, "15": { land: 900_000_000, bldg: 600_000_000 } } as const;
type Axis = keyof typeof AX;

interface PartIn { donorDate: string; donorPrice?: number; est?: number; capex?: number }
interface Cell {
  axis: Axis;
  bldgDate: string; bldgCause: "purchase" | "carryover_gift"; bldgPrice: number;
  landDate: string; landCause: "purchase" | "carryover_gift"; landPrice: number;
  landPart?: PartIn; bldgPart?: PartIn;
  gift: { date: string; tax: number; base: number };
  oneHouse?: boolean;
  extra?: Partial<TransferTaxInput>;
}

const part = (p?: PartIn) =>
  p && {
    donorAcquisitionDate: p.donorDate,
    ...(p.est !== undefined ? { useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: p.est } : { donorAcquisitionPrice: p.donorPrice }),
    donorCapitalExpenditure: p.capex,
  };

function mk(c: Cell): TransferTaxInput {
  const a = AX[c.axis];
  const wire = composeSplitCarryover({
    carryoverGiftEvent: { giftRegistryDate: c.gift.date, giftTaxCalculated: c.gift.tax, giftTaxBase: c.gift.base, donorRelation: "lineal" },
    landCarryoverPart: part(c.landPart),
    buildingCarryoverPart: part(c.bldgPart),
    landAcquisitionPrice: c.landPrice,
    buildingAcquisitionPrice: c.bldgPrice,
  });
  return baseTransferInput({
    transferPrice: a.land + a.bldg,
    transferDate: D("2025-06-30"),
    acquisitionPrice: 0,
    acquisitionDate: D(c.bldgDate),
    acquisitionCause: c.bldgCause,
    isOneHousehold: c.oneHouse ?? false,
    householdHousingCount: c.oneHouse ? 1 : 2,
    residencePeriodMonths: 120,
    wasRegulatedAtAcquisition: false,
    landAcquisitionDate: D(c.landDate),
    landAcquisitionCause: c.landCause,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    saleSplitMode: "actual",
    landTransferPrice: a.land,
    buildingTransferPrice: a.bldg,
    landStandardPriceAtTransfer: a.land,
    buildingStandardPriceAtTransfer: a.bldg,
    landAcquisitionPrice: c.landPrice,
    buildingAcquisitionPrice: c.bldgPrice,
    isSeparateAcquisition: c.landDate !== c.bldgDate,
    ...wire,
    ...c.extra,
  });
}

const run = (c: Cell) => calculateTransferTax(mk(c), rates);

/** A1 — 건물 매매 2022-06-01 / 토지 증여 2024-06-15 · 증여자 토지 2005-01-01 */
const A1 = (landPart: PartIn, over: Partial<Cell> = {}): Cell => ({
  axis: "8", bldgDate: "2022-06-01", bldgCause: "purchase", bldgPrice: 200_000_000,
  landDate: "2024-06-15", landCause: "carryover_gift", landPrice: 300_000_000,
  landPart, gift: { date: "2024-06-15", tax: 20_000_000, base: 300_000_000 }, ...over,
});
/** B2 — 건물 증여 2024-06-15 · 증여자 건물 2015-06-01 / 토지 매매 2008-01-01 */
const Bx = (bldgPart: PartIn, over: Partial<Cell> = {}): Cell => ({
  axis: "8", bldgDate: "2024-06-15", bldgCause: "carryover_gift", bldgPrice: 200_000_000,
  landDate: "2008-01-01", landCause: "purchase", landPrice: 120_000_000,
  bldgPart, gift: { date: "2024-06-15", tax: 20_000_000, base: 200_000_000 }, ...over,
});
/** C — 통째 증여 2024-06-15 */
const Cx = (landPart: PartIn, bldgPart: PartIn, over: Partial<Cell> = {}): Cell => ({
  axis: "8", bldgDate: "2024-06-15", bldgCause: "carryover_gift", bldgPrice: 200_000_000,
  landDate: "2024-06-15", landCause: "carryover_gift", landPrice: 200_000_000,
  landPart, bldgPart, gift: { date: "2024-06-15", tax: 30_000_000, base: 400_000_000 }, ...over,
});

const L_EST: PartIn = { donorDate: "2005-01-01", est: 20_000_000 };
const L_ACT: PartIn = { donorDate: "2005-01-01", donorPrice: 20_000_000 };
const CL = (o: Partial<PartIn> = {}): PartIn => ({ donorDate: "1995-03-01", ...o });
const CB = (o: Partial<PartIn> = {}): PartIn => ({ donorDate: "2015-06-01", ...o });

describe("M1~M5 — 환산 파트 결정세액 (정정안: 증여세 상당액은 단서 비교 밖 후가산)", () => {
  it("M1 A 토지만 환산(분자 2천만) → 적용 141,212,000 — 실가 2천만 대조 141,380,000", () => {
    const r = run(A1(L_EST));
    expect(r.determinedTax).toBe(141_212_000);
    expect(run(A1(L_ACT)).determinedTax).toBe(141_380_000);
    const land = r.splitDetail!.land;
    expect(land.carryover!.judgment).toBe("applied");
    expect(land.acqMode).toBe("estimated");
    expect(land.acquisitionPrice).toBe(20_000_000); // 480,000,000 × 20,000,000 ÷ 480,000,000
    expect(land.appraisalDeduction).toBe(600_000); // 분자 × 3%
    expect(land.directExpenses).toBe(20_000_000); // 증여세 상당액(단서 비교 밖 후가산)
    expect(land.swapApplied).toBe(false);
    expect(land.gain).toBe(480_000_000 - 20_000_000 - 20_000_000 - 600_000); // 항등식
  });

  it("M2 B 건물만 환산(분자 3천만) → ②3호로 미적용 221,700,000 (적용 단독 159,972,000)", () => {
    const r = run(Bx({ donorDate: "2015-06-01", est: 30_000_000 }));
    expect(r.determinedTax).toBe(221_700_000);
    const b = r.splitDetail!.building.carryover!;
    expect(b.judgment).toBe("excluded");
    expect(b.exclusionReason).toBe("tax_comparison");
    expect(b.comparison!.determinedTaxWithCarryover).toBe(159_972_000);
    expect(b.comparison!.determinedTaxWithout).toBe(221_700_000);
    expect(b.estimated).toEqual({ donorStdPriceAtAcquisition: 30_000_000 }); // 미적용 파트는 환산을 쓰지 않았다 — 분자만
  });

  it("M3 C 토지만 환산(5천만) + 건물 실가 → 토A·건B 244,170,000 (AA 170,440,000 / BB 238,500,000)", () => {
    const r = run(Cx(CL({ est: 50_000_000 }), CB({ donorPrice: 50_000_000 })));
    expect(r.determinedTax).toBe(244_170_000);
    const { land, building } = r.splitDetail!;
    expect(land.carryover!.judgment).toBe("applied");
    expect(building.carryover!.judgment).toBe("excluded");
    expect(land.appraisalDeduction).toBe(1_500_000);
    expect(land.directExpenses).toBe(15_000_000); // 증여세 30,000,000 × 2억/4억
    expect(building.carryover!.donorAcquisitionPrice).toBe(50_000_000);
    expect(building.carryover!.estimated).toBeUndefined();
  });

  it("M4 C 건물만 환산(5천만) + 토지 실가 → 토A·건B 244,800,000 (건물이 ②3호로 미적용이라 실가 대조와 같다)", () => {
    const r = run(Cx(CL({ donorPrice: 50_000_000 }), CB({ est: 50_000_000 })));
    expect(r.determinedTax).toBe(244_800_000);
    expect(r.splitDetail!.land.carryover!.judgment).toBe("applied");
    expect(r.splitDetail!.land.carryover!.estimated).toBeUndefined();
    expect(r.splitDetail!.building.carryover!.judgment).toBe("excluded");
    expect(r.splitDetail!.building.carryover!.estimated).toEqual({ donorStdPriceAtAcquisition: 50_000_000 });
  });

  it("M5 C 둘 다 환산(5천만/5천만) → 244,170,000 — 토지 적용·건물 미적용", () => {
    const r = run(Cx(CL({ est: 50_000_000 }), CB({ est: 50_000_000 })));
    expect(r.determinedTax).toBe(244_170_000);
    expect(r.splitDetail!.land.carryover!.judgment).toBe("applied");
    expect(r.splitDetail!.building.carryover!.judgment).toBe("excluded");
  });

  it("실가 파트 회귀 — 환산이 아닌 입력은 종전 값 그대로 (M5 실가 대조 244,800,000)", () => {
    const r = run(Cx(CL({ donorPrice: 50_000_000 }), CB({ donorPrice: 50_000_000 })));
    expect(r.determinedTax).toBe(244_800_000);
    const land = r.splitDetail!.land;
    expect(land.acqMode).toBe("actual");
    expect(land.carryover!.donorAcquisitionPrice).toBe(50_000_000);
    expect(land.carryover!.estimated).toBeUndefined();
    expect(land.directExpenses).toBe(15_000_000); // 실가 파트는 증여세를 `*DirectExpenses`에 합산(종전)
  });
});

describe("echo — 환산 파트의 분자·분모·환산취득가액·개산공제 (거짓 «증여자 취득가액 0» 제거)", () => {
  it("M1 적용(A) 파트: estimated 4칸 + donorAcquisitionPrice 없음", () => {
    const e = run(A1(L_EST)).splitDetail!.land.carryover!;
    expect(e.donorAcquisitionPrice).toBeUndefined();
    expect(e.estimated).toEqual({
      donorStdPriceAtAcquisition: 20_000_000,
      stdPriceAtTransfer: 480_000_000,
      estimatedAcquisitionPrice: 20_000_000,
      lumpDeduction: 600_000,
    });
    expect(e.giftTaxAddedToExpense).toBe(20_000_000);
  });

  it("건물 환산 적용(A) 파트도 같다 — 분모는 건물 양도시 기준시가, 개산공제 = 분자 × 3%", () => {
    // 증여 신고가액(B 취득가액)이 양도가액에 가까워 미적용 쪽 양도차익이 작으면 적용(A)이 선택된다
    const r = run(Bx({ donorDate: "2015-06-01", est: 5_000_000 }, { bldgPrice: 300_000_000, gift: { date: "2024-06-15", tax: 20_000_000, base: 300_000_000 } }));
    const b = r.splitDetail!.building;
    expect(b.carryover!.judgment).toBe("applied");
    expect(b.acqMode).toBe("estimated");
    expect(b.carryover!.estimated).toEqual({
      donorStdPriceAtAcquisition: 5_000_000,
      stdPriceAtTransfer: 320_000_000,
      estimatedAcquisitionPrice: 5_000_000, // 320,000,000 × 5,000,000 ÷ 320,000,000
      lumpDeduction: 150_000,
    });
    expect(b.acquisitionPrice).toBe(5_000_000);
    expect(b.appraisalDeduction).toBe(150_000);
    expect(b.directExpenses).toBe(20_000_000); // 증여세 20,000,000 × 3억/3억
  });

  it("swap이 발동해도 lumpDeduction은 비교에 쓰인 산출액이다 (파트 appraisalDeduction은 0)", () => {
    const r = run(A1({ ...L_EST, capex: 30_000_000 }));
    const land = r.splitDetail!.land;
    expect(land.swapApplied).toBe(true);
    expect(land.appraisalDeduction).toBe(0);
    expect(land.carryover!.estimated!.lumpDeduction).toBe(600_000);
  });
});

describe("E-A — 증여세 상당액 소실 (환산 파트에서도 입력이 세액을 바꾼다)", () => {
  const withGiftTax = (tax: number) => A1(L_EST, { gift: { date: "2024-06-15", tax, base: 300_000_000 } });

  it("증여세 0과 2천만이 다르다 (146,812,000 vs 141,212,000) — 후가산 전에는 둘이 같았다", () => {
    const zero = run(withGiftTax(0));
    const some = run(withGiftTax(20_000_000));
    expect(zero.determinedTax).toBe(146_812_000);
    expect(some.determinedTax).toBe(141_212_000);
    expect(zero.determinedTax).not.toBe(some.determinedTax);
    expect(zero.splitDetail!.land.directExpenses).toBe(0);
    expect(some.splitDetail!.land.directExpenses).toBe(20_000_000);
    expect(zero.splitDetail!.land.carryover!.giftTaxAddedToExpense).toBe(0);
  });

  it("증여세 상당액은 그 파트 양도차익(증여세 산입 전, 개산공제 반영)이 한도다 (영 §163의2② 후단)", () => {
    // 한도 = 480,000,000 − 20,000,000 − 600,000 = 459,400,000. 증여 신고가액(B 취득가액)이 양도가액보다 커서 미적용 쪽 양도차익이 0이면 동률 A — 한도로 자른 값이 산입된다.
    const capped = run(A1(L_EST, { landPrice: 600_000_000, gift: { date: "2024-06-15", tax: 700_000_000, base: 700_000_000 } }));
    const e = capped.splitDetail!.land.carryover!;
    expect(e.judgment).toBe("applied");
    expect(e.giftTaxApportioned).toBe(600_000_000);
    expect(e.giftTaxLimitCap).toBe(459_400_000);
    expect(e.giftTaxLimitApplied).toBe(true);
    expect(e.giftTaxAddedToExpense).toBe(459_400_000);
    expect(capped.splitDetail!.land.gain).toBe(0);
  });

  it("한도는 환산 파트에서도 증여세 산입 전 양도차익이다 — 미적용(B)으로 갈린 파트의 echo에도 같은 값이 실린다", () => {
    expect(run(A1(L_EST)).splitDetail!.land.carryover!.giftTaxLimitCap).toBe(459_400_000);
    expect(run(Bx({ donorDate: "2015-06-01", est: 30_000_000 })).splitDetail!.building.carryover!.giftTaxLimitCap).toBeGreaterThan(0);
  });
});

describe("E-B — 거짓 단서 비교 (증여세 상당액이 §97②2호 단서 나목에 섞이지 않는다)", () => {
  it("증여자 자본적지출 1,500만: 환산취득+개산공제 20.6M 이하라 swap 미발동 → 141,212,000 (증여세가 섞였다면 142,780,000)", () => {
    const r = run(A1({ ...L_EST, capex: 15_000_000 }));
    expect(r.determinedTax).toBe(141_212_000);
    const land = r.splitDetail!.land;
    expect(land.swapApplied).toBe(false);
    expect(land.directExpenses).toBe(20_000_000); // 증여자 자본적지출은 본문 갈래에서 차감하지 않는다 — 증여세만
  });

  it("자본적지출 2,100만 > 20.6M → 단서 swap 발동, 증여세는 swap 뒤에 별도 산입 (141,100,000)", () => {
    const r = run(A1({ ...L_EST, capex: 21_000_000 }));
    expect(r.determinedTax).toBe(141_100_000);
    const land = r.splitDetail!.land;
    expect(land.swapApplied).toBe(true);
    expect(land.directExpenses).toBe(41_000_000); // 자본적지출 21M + 증여세 20M
    expect(land.gain).toBe(480_000_000 - 0 - 41_000_000 - 0); // swap이면 취득가액·개산공제 미차감
  });

  it("자본적지출 3,000만 → 138,580,000", () => {
    expect(run(A1({ ...L_EST, capex: 30_000_000 })).determinedTax).toBe(138_580_000);
  });
});

describe("E-C·Q1 — 증여자가 토지·건물을 같은 날 취득한 주택의 파트 환산은 막고 안내한다", () => {
  it.each([
    ["A: 증여자 토지 취득일 = 수증자 건물 취득일(호스트 acquisitionDate)", A1({ donorDate: "2022-06-01", est: 20_000_000 })],
    ["B: 증여자 건물 취득일 = 토지 취득일", Bx({ donorDate: "2008-01-01", est: 30_000_000 })],
    ["C: 증여자 토지 취득일 = 증여자 건물 취득일 (둘 다 환산)", Cx(CL({ donorDate: "2005-03-01", est: 50_000_000 }), CB({ donorDate: "2005-03-01", est: 50_000_000 }))],
    ["C: 한 파트만 환산이어도 막는다 (토지 환산 + 건물 실가)", Cx(CL({ donorDate: "2005-03-01", est: 50_000_000 }), CB({ donorDate: "2005-03-01", donorPrice: 50_000_000 }))],
  ])("%s → 엔진 throw", (_, cell) => {
    expect(() => run(cell)).toThrow(PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE);
  });

  it("메시지 취지 — 자산 전체 이월과세(개별주택가격 환산 지원)로 안내하고 조문을 단다", () => {
    expect(PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE).toContain("같은 날 취득한 주택은 파트 환산을 쓸 수 없습니다");
    expect(PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE).toContain("자산 전체 이월과세(개별주택가격 환산 지원)");
    expect(PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE).toContain("소득세법 §97조의2");
  });

  it("환산 파트가 없으면 걸리지 않는다 — 같은 날 실가 입력은 현행 그대로 계산된다 (회귀 0)", () => {
    expect(() => run(A1({ donorDate: "2022-06-01", donorPrice: 20_000_000 }))).not.toThrow();
    expect(() => run(Cx(CL({ donorDate: "2005-03-01", donorPrice: 50_000_000 }), CB({ donorDate: "2005-03-01", donorPrice: 50_000_000 })))).not.toThrow();
  });

  it("날짜가 하루라도 다르면 걸리지 않는다", () => {
    expect(() => run(A1({ donorDate: "2022-05-31", est: 20_000_000 }))).not.toThrow();
    expect(() => run(Cx(CL({ donorDate: "2005-03-01", est: 50_000_000 }), CB({ donorDate: "2005-03-02", est: 50_000_000 })))).not.toThrow();
  });
});

describe("leaf S10 — 사실 → 이슈 (⑧이 같은 facts로 호출한다)", () => {
  const base = {
    isSplitable: true, hasLandAcquisitionDate: true, hasLandDecedentAcquisitionDate: false, landAcquisitionCause: "carryover_gift", landMode: "actual" as const,
    hasLandCarryover: true, carryoverGiftDate: "2024-06-15",
  };
  it("A: 토지 환산 + 증여자 토지 취득일 = 건물 취득일 → landCarryoverPart 앵커", () => {
    const issues = collectSplitPartCauseIssues({
      ...base, buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2022-06-01",
      landCarryoverEstimated: true, landDonorAcquisitionDate: "2022-06-01",
    });
    expect(issues.filter((i) => i.message === PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE).map((i) => i.field)).toEqual(["landCarryoverPart"]);
  });
  it("B: 건물 환산 + 증여자 건물 취득일 = 토지 취득일 → buildingCarryoverPart 앵커", () => {
    const issues = collectSplitPartCauseIssues({
      isSplitable: true, hasLandAcquisitionDate: true, hasLandDecedentAcquisitionDate: false, landAcquisitionCause: "purchase", landMode: "actual", landAcquisitionDate: "2008-01-01",
      buildingAcquisitionCause: "carryover_gift", buildingAcquisitionDate: "2024-06-15", hasBuildingCarryover: true, carryoverGiftDate: "2024-06-15",
      buildingCarryoverEstimated: true, buildingDonorAcquisitionDate: "2008-01-01",
    });
    expect(issues.filter((i) => i.message === PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE).map((i) => i.field)).toEqual(["buildingCarryoverPart"]);
  });
  it("환산 플래그가 없거나 거짓이면 같은 날이어도 걸리지 않는다", () => {
    for (const est of [undefined, false]) {
      const issues = collectSplitPartCauseIssues({
        ...base, buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2022-06-01",
        landCarryoverEstimated: est, landDonorAcquisitionDate: "2022-06-01",
      });
      expect(issues.some((i) => i.message === PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE)).toBe(false);
    }
  });
  it("증여자 취득일 사실이 없으면(생략) 걸리지 않는다 — 모름은 차단 근거가 아니다", () => {
    const issues = collectSplitPartCauseIssues({
      ...base, buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2022-06-01", landCarryoverEstimated: true,
    });
    expect(issues.some((i) => i.message === PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE)).toBe(false);
  });
});

describe("②2호(P5) 4셀 — 환산 파트에서도 같다 (비과세 상태 변화는 환산 여부와 무관)", () => {
  const OH = { oneHouse: true } as const;
  it.each([
    ["A1 106,500,000", A1({ donorDate: "2005-01-01", est: 100_000_000 }, OH), 106_500_000],
    ["B2 221,700,000", Bx({ donorDate: "2015-06-01", est: 100_000_000 }, OH), 221_700_000],
    ["C2 238,500,000 (토지·건물 둘 다 환산)", Cx(CL({ est: 50_000_000 }), CB({ est: 50_000_000 }), OH), 238_500_000],
    ["C2 238,500,000 (토지만 환산)", Cx(CL({ est: 50_000_000 }), CB({ donorPrice: 50_000_000 }), OH), 238_500_000],
    ["C2 238,500,000 (건물만 환산)", Cx(CL({ donorPrice: 50_000_000 }), CB({ est: 50_000_000 }), OH), 238_500_000],
    [
      "X2 4,557,600 (15억 · 토지만 환산)",
      {
        axis: "15", bldgDate: "2022-06-01", bldgCause: "purchase", bldgPrice: 590_000_000,
        landDate: "2024-06-15", landCause: "carryover_gift", landPrice: 890_000_000,
        landPart: { donorDate: "2005-01-01", est: 1_000_000 }, gift: { date: "2024-06-15", tax: 20_000_000, base: 890_000_000 }, oneHouse: true,
      } as Cell,
      4_557_600,
    ],
  ])("%s", (_, cell, tax) => {
    const r = run(cell);
    expect(r.determinedTax).toBe(tax);
    expect(r.splitDetail!.carryoverEvent!.oneHouseExclusion).toBe(true);
    for (const e of [r.splitDetail!.land.carryover, r.splitDetail!.building.carryover]) {
      if (!e) continue;
      expect(e.judgment).toBe("excluded");
      expect(e.exclusionReason).toBe("one_house_exemption");
      expect(e.giftTaxAddedToExpense).toBe(0);
    }
  });
});

describe("지분 0.5 — 분자는 물건 전체 값(스케일 금지), 개산공제만 지분 반영", () => {
  const share = (landPart: PartIn): Cell => ({
    axis: "8", bldgDate: "2022-06-01", bldgCause: "purchase", bldgPrice: 100_000_000,
    landDate: "2024-06-15", landCause: "carryover_gift", landPrice: 200_000_000,
    landPart, gift: { date: "2024-06-15", tax: 20_000_000, base: 300_000_000 },
    extra: { ownershipRatio: 0.5, transferPrice: 400_000_000, landTransferPrice: 240_000_000, buildingTransferPrice: 160_000_000 },
  });
  it("환산취득가액 = 240,000,000 × 20,000,000 ÷ 480,000,000 = 10,000,000 · 개산공제 = 20,000,000 × 50% × 3% = 300,000", () => {
    const r = run(share(L_EST));
    const land = r.splitDetail!.land;
    expect(land.carryover!.judgment).toBe("applied");
    expect(land.acquisitionPrice).toBe(10_000_000);
    expect(land.appraisalDeduction).toBe(300_000);
    expect(land.stdPriceAtAcq).toBe(20_000_000); // 물건 전체(100%) 값 — 지분 스케일 없음
    expect(land.carryover!.judgment).toBe("applied");
    expect(land.carryover!.estimated).toMatchObject({ donorStdPriceAtAcquisition: 20_000_000, stdPriceAtTransfer: 480_000_000, lumpDeduction: 300_000 });
  });
  it("분자를 지분으로 미리 줄여 보내면 환산취득가가 반으로 준다 — 스케일은 엔진 몫이 아니다 (대조)", () => {
    const half = run(share({ donorDate: "2005-01-01", est: 10_000_000 })).splitDetail!.land;
    expect(half.acquisitionPrice).toBe(5_000_000);
  });
});

describe("분모 부재 / 분자 부재 — 조용히 0으로 메우지 않는다", () => {
  it("환산 파트의 양도시 기준시가가 없으면 엔진이 던진다 (취득시 비율로 대신 나누지 않는다)", () => {
    // 양도시 감정평가가액 양쪽이 있으면 안분 basis는 그쪽이라(부가령 §64①1호 단서) 양도가액 구분이 통과하고 환산 분모 차단에 도달한다
    const extra = { landStandardPriceAtTransfer: undefined, landAppraisalAtTransfer: 480_000_000, buildingAppraisalAtTransfer: 320_000_000 };
    expect(() => run(A1(L_EST, { extra }))).toThrow("양도시 토지 기준시가가 필요합니다");
  });
  it("분자가 0이거나 없으면 해결자가 던진다 (직접 호출 방어선 — 환산취득가 0 침묵 방지)", () => {
    const input = mk(A1(L_EST));
    for (const v of [0, undefined]) {
      const bad = { ...input, landCarryoverTaxation: { ...input.landCarryoverTaxation!, donorStandardPriceAtAcquisition: v } };
      expect(() => calculateTransferTax(bad, rates)).toThrow("증여자 취득 당시 그 파트 기준시가(양수)가 필요합니다");
    }
  });
});

describe("합성기(⑭) — 와이어의 환산 키가 엔진 input에 도달한다", () => {
  it("환산 파트: useEstimatedAcquisition=true · 분자 전달 · donorAcquisitionPrice 비움", () => {
    const wire = composeSplitCarryover({
      carryoverGiftEvent: { giftRegistryDate: "2024-06-15", giftTaxCalculated: 20_000_000, giftTaxBase: 300_000_000, donorRelation: "lineal" },
      landCarryoverPart: { donorAcquisitionDate: "2005-01-01", useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: 20_000_000 },
      landAcquisitionPrice: 300_000_000,
    });
    expect(wire.landCarryoverTaxation).toMatchObject({ useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: 20_000_000 });
    expect(wire.landCarryoverTaxation!.donorAcquisitionPrice).toBeUndefined();
  });
  it("실가 파트: useEstimatedAcquisition=false · 분자 키 없음 (P1~P5 payload 그대로)", () => {
    const wire = composeSplitCarryover({
      carryoverGiftEvent: { giftRegistryDate: "2024-06-15", giftTaxCalculated: 20_000_000, giftTaxBase: 300_000_000, donorRelation: "lineal" },
      landCarryoverPart: { donorAcquisitionDate: "2005-01-01", donorAcquisitionPrice: 20_000_000 },
      landAcquisitionPrice: 300_000_000,
    });
    expect(wire.landCarryoverTaxation).toMatchObject({ useEstimatedAcquisition: false, donorAcquisitionPrice: 20_000_000 });
    expect("donorStandardPriceAtAcquisition" in wire.landCarryoverTaxation!).toBe(false);
  });
});

describe("해결자 전용 내부 입력 — 외부에서 들어온 값은 쓰이지 않는다 (R-4)", () => {
  it("실가 A 파트 입력에 splitCarryoverBasis를 실어도 세액이 같다 (시나리오 입력이 비우고 재구성)", () => {
    const base = run(A1(L_ACT)).determinedTax;
    const tampered = calculateTransferTax(
      { ...mk(A1(L_ACT)), splitCarryoverBasis: { land: { stdAtAcq: 999_999_999, giftTaxExpense: 777_777_777 } } },
      rates,
    );
    expect(tampered.determinedTax).toBe(base);
  });
});

describe("calcAcqStdPair — 분자 override (E-C: 비례 안분·㎡당 공시지가 × 면적을 건너뛴다)", () => {
  const housingSameDay = (basis?: TransferTaxInput["splitCarryoverBasis"]): TransferTaxInput =>
    baseTransferInput({
      propertyType: "housing",
      isSeparateAcquisition: false, // 비-별개: 종전엔 총액·나목이 없으면 쌍 전체 null
      standardPricePerSqmAtAcquisition: 0,
      acquisitionArea: 0,
      splitCarryoverBasis: basis,
    });
  it("override가 없으면 종전대로 null", () => {
    expect(calcAcqStdPair(housingSameDay())).toBeNull();
  });
  it("land override: 그 파트는 분자를 쓰고 안분 내역(stdSplit)이 없다", () => {
    const pair = calcAcqStdPair(housingSameDay({ land: { stdAtAcq: 20_000_000 } }));
    expect(pair).toEqual({ land: 20_000_000, building: null, buildingDerived: false });
    expect(pair!.stdSplit).toBeUndefined();
  });
  it("building override도 같다", () => {
    expect(calcAcqStdPair(housingSameDay({ building: { stdAtAcq: 30_000_000 } }))).toEqual({ land: null, building: 30_000_000, buildingDerived: false });
  });
  it("override가 있으면 취득시 비율은 만들지 않는다 (증여자 시점 값과 수증자 시점 값을 섞은 비율 금지)", () => {
    const input = { ...housingSameDay({ land: { stdAtAcq: 20_000_000 } }), buildingStandardPriceAtAcquisition: 80_000_000 };
    expect(calcAcqStdPair(input)).toEqual({ land: 20_000_000, building: 80_000_000, buildingDerived: false });
    expect(calcApportionRatio(input)).toBeNull();
  });
});

describe("표시 view — 환산 파트에 «증여자 취득가액 0» 거짓 표시가 없다 (표시 문구 개편은 UI 단계)", () => {
  it("M1 적용 파트: donorAcquisitionPrice 없음 · estimated 전달 · 환산취득가액 문구", () => {
    const v = splitCarryoverView(run(A1(L_EST)).splitDetail)!;
    const land = v.parts.find((p) => p.key === "land")!;
    expect(land.donorAcquisitionPrice).toBeUndefined();
    expect(land.estimated!.donorStdPriceAtAcquisition).toBe(20_000_000);
    const text = splitCarryoverAcquisitionText(land);
    expect(text).toContain("환산취득가액 20,000,000");
    expect(text).toContain("증여자 취득 당시 기준시가 20,000,000");
    expect(text).toContain("증여세 상당액 20,000,000");
    expect(text).not.toContain("증여자 취득가액 0");
  });
  it("실가 파트 문구는 종전 그대로", () => {
    const land = splitCarryoverView(run(A1(L_ACT)).splitDetail)!.parts.find((p) => p.key === "land")!;
    expect(land.estimated).toBeUndefined();
    expect(splitCarryoverAcquisitionText(land)).toBe("토지 증여자 취득가액 20,000,000 (필요경비에 증여세 상당액 20,000,000 가산)");
  });
});
