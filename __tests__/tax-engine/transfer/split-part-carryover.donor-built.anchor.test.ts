/**
 * 주택 split 파트 이월과세(P6) 건물 파트 × 증여자 신축·증축 §114조의2 가산세 anchor (PR-3, 2026-10-22)
 *
 * 계획: docs/00-pm/carryover-donor-built-114-2.plan.md §5.2(P6 두 셀) · §4 M4 · V-3
 *   · A 채택(건물 파트 환산취득가액) → 건물 파트 환산취득가액(증축은 증축 부분)의 5%. 토지 파트는 base에 섞이지 않는다(D4).
 *   · ②3호 B 채택·배제 → 가산세 없음(R2) — 총 납부세액이 현행과 같다.
 *   · 시드는 probe p3(8억 축 · 양도일 2025-06-30 · 건물 증여 2024-06-15 · 증여자 건물 취득·신축일 2021-08-01 · 토지 매매 2008-01-01 1.2억).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { composeSplitCarryover } from "@/lib/tax-engine/transfer-split-carryover-compose";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

interface DB {
  buildingType: "new" | "extension";
  constructionDate: string;
  extensionFloorArea?: number;
  extensionStdPriceAtAcquisition?: number;
}
interface Cell {
  /** 건물 파트 환산 분자 — 증여자 취득 당시 건물 기준시가 */
  std: number;
  giftVal: number;
  donorDate?: string;
  /** undefined = donorBuilt 미입력(현행) */
  db?: DB;
  /** 건물 파트 실가 입력(환산 아님) */
  actualPrice?: number;
  landPrice?: number;
  /** 토지 파트도 이월과세(C) — 토지 환산 분자 */
  landEstStd?: number;
  landDb?: DB;
  landDonorDate?: string;
  giftTax?: number;
  relation?: "spouse" | "lineal" | "other";
  extra?: Partial<TransferTaxInput>;
}

function mk(c: Cell): TransferTaxInput {
  const bldgPart = {
    donorAcquisitionDate: c.donorDate ?? "2021-08-01",
    ...(c.actualPrice !== undefined
      ? { donorAcquisitionPrice: c.actualPrice }
      : { useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: c.std }),
    ...(c.db ? { donorBuilt: c.db } : {}),
  };
  const landCarry = c.landEstStd !== undefined;
  const wire = composeSplitCarryover({
    carryoverGiftEvent: { giftRegistryDate: "2024-06-15", giftTaxCalculated: c.giftTax ?? 0, giftTaxBase: c.giftVal + (landCarry ? 200_000_000 : 0), donorRelation: c.relation ?? "lineal" },
    landCarryoverPart: landCarry
      ? { donorAcquisitionDate: c.landDonorDate ?? "2005-01-01", useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: c.landEstStd, ...(c.landDb ? { donorBuilt: c.landDb } : {}) }
      : undefined,
    buildingCarryoverPart: bldgPart,
    landAcquisitionPrice: landCarry ? 200_000_000 : (c.landPrice ?? 120_000_000),
    buildingAcquisitionPrice: c.giftVal,
  } as never);
  return baseTransferInput({
    transferPrice: 800_000_000,
    transferDate: D("2025-06-30"),
    acquisitionPrice: 0,
    acquisitionDate: D("2024-06-15"),
    acquisitionCause: "carryover_gift",
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 120,
    wasRegulatedAtAcquisition: false,
    landAcquisitionDate: D(landCarry ? "2024-06-15" : "2008-01-01"),
    landAcquisitionCause: landCarry ? "carryover_gift" : "purchase",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    saleSplitMode: "actual",
    landTransferPrice: 480_000_000,
    buildingTransferPrice: 320_000_000,
    landStandardPriceAtTransfer: 480_000_000,
    buildingStandardPriceAtTransfer: 320_000_000,
    landAcquisitionPrice: landCarry ? 200_000_000 : (c.landPrice ?? 120_000_000),
    buildingAcquisitionPrice: c.giftVal,
    isSeparateAcquisition: !landCarry,
    ...wire,
    ...c.extra,
  } as never);
}

const run = (c: Cell) => calculateTransferTax(mk(c), rates);
const NEW_DB: DB = { buildingType: "new", constructionDate: "2021-08-01" };

describe("P6 건물 파트 — 계획서 §5.2 두 셀", () => {
  it("A 채택(분자 1억 · 증여 신고가 3.15억): 현행 170,997,200 → 가산세 5,000,000 + 지방소득세 500,000 = 176,497,200", () => {
    const before = run({ std: 100_000_000, giftVal: 315_000_000 });
    const after = run({ std: 100_000_000, giftVal: 315_000_000, db: NEW_DB });
    expect(before.splitDetail!.building.carryover!.judgment).toBe("applied");
    expect(before.totalTax).toBe(170_997_200);
    expect(before.penaltyTax).toBe(0);
    expect(after.splitDetail!.building.carryover!.judgment).toBe("applied");
    expect(after.penaltyTax).toBe(5_000_000);
    expect(after.penaltyBase).toBe(100_000_000); // 건물 파트 환산취득가액만 — 토지(1.2억)는 base에 섞이지 않는다
    expect(after.totalTax).toBe(176_497_200);
    expect(after.determinedTax).toBe(before.determinedTax); // ②3호 비교는 가산세 前 결정세액 — 불변
  });

  it("A 채택 echo: 건물 파트 carryover.donorBuiltPenalty = 적용 · base 1억 · 가산세 5백만 · 5년 되는 날", () => {
    const e = run({ std: 100_000_000, giftVal: 315_000_000, db: NEW_DB }).splitDetail!.building.carryover!.donorBuiltPenalty!;
    expect(e).toMatchObject({ applied: true, buildingType: "new", constructionDate: "2021-08-01", fifthAnniversary: "2026-08-01", base: 100_000_000, penalty: 5_000_000 });
  });

  it("B 채택(분자 2.5억 · 증여 신고가 2억): 총 납부 243,870,000 변화 0 · echo scenario_b", () => {
    const before = run({ std: 250_000_000, giftVal: 200_000_000 });
    const after = run({ std: 250_000_000, giftVal: 200_000_000, db: NEW_DB });
    expect(before.splitDetail!.building.carryover!.judgment).toBe("excluded");
    expect(before.totalTax).toBe(243_870_000);
    expect(after.totalTax).toBe(243_870_000);
    expect(after.penaltyTax).toBe(0);
    expect(after.splitDetail!.building.carryover!.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
  });
});

describe("5년 경계 · 증축 85㎡ 경계", () => {
  // 신축일 2021-08-01 → 5년 되는 날 2026-08-01. 양도일만 움직인다(증여자 취득일을 바꾸면 ②3호 채택이 B로 뒤집힌다).
  it("양도일 = 신축일+5년 당일 → 가산세 발동", () => {
    const r = run({ std: 100_000_000, giftVal: 315_000_000, db: NEW_DB, extra: { transferDate: D("2026-08-01") } });
    expect(r.splitDetail!.building.carryover!.judgment).toBe("applied");
    expect(r.penaltyTax).toBe(5_000_000);
  });
  it("양도일 = 신축일+5년 +1일 → 가산세 없음 · echo outside_penalty_window", () => {
    const r = run({ std: 100_000_000, giftVal: 315_000_000, db: NEW_DB, extra: { transferDate: D("2026-08-02") } });
    expect(r.splitDetail!.building.carryover!.judgment).toBe("applied");
    expect(r.penaltyTax).toBe(0);
    expect(r.splitDetail!.building.carryover!.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "outside_penalty_window", fifthAnniversary: "2026-08-01" });
  });
  it("증축 85.00㎡ → 가산세 없음 / 85.01㎡ → 증축 부분 환산취득가액(2천만)의 5% = 1,000,000", () => {
    const ext = (area: number): DB => ({ buildingType: "extension", constructionDate: "2021-08-01", extensionFloorArea: area, extensionStdPriceAtAcquisition: 20_000_000 });
    expect(run({ std: 100_000_000, giftVal: 315_000_000, db: ext(85) }).penaltyTax).toBe(0);
    const r = run({ std: 100_000_000, giftVal: 315_000_000, db: ext(85.01) });
    expect(r.penaltyTax).toBe(1_000_000); // 건물 양도가액 3.2억 × 2천만 ÷ 3.2억 = 2천만 → 5%
    expect(r.penaltyBase).toBe(20_000_000);
    expect(r.splitDetail!.building.carryover!.donorBuiltPenalty).toMatchObject({
      applied: true,
      base: 20_000_000,
      penalty: 1_000_000,
      formula: { multiplicand: 320_000_000, numerator: 20_000_000, denominator: 320_000_000 },
    });
  });
});

describe("손실(산출세액 0)에도 가산세 — 법 §114조의2②", () => {
  it("토지 양도차손으로 전체 결정세액 0이어도 가산세가 붙는다", () => {
    const base: Cell = { std: 100_000_000, giftVal: 315_000_000, landPrice: 900_000_000 };
    const before = run(base);
    const after = run({ ...base, db: NEW_DB });
    expect(before.determinedTax).toBe(0);
    expect(before.penaltyTax).toBe(0);
    expect(after.determinedTax).toBe(0);
    expect(after.penaltyTax).toBe(5_000_000);
  });
  it("손실 경로의 증축도 증축 부분 환산취득가액(2천만)의 5% — 원본 입력이 아니라 채택 입력의 증축 사실을 읽는다 (V-3)", () => {
    const ext: DB = { buildingType: "extension", constructionDate: "2021-08-01", extensionFloorArea: 90, extensionStdPriceAtAcquisition: 20_000_000 };
    const r = run({ std: 100_000_000, giftVal: 315_000_000, landPrice: 900_000_000, db: ext });
    expect(r.determinedTax).toBe(0);
    expect(r.penaltyTax).toBe(1_000_000);
    expect(r.penaltyBase).toBe(20_000_000);
  });
});

describe("토지 파트 base 미혼입 · 입력 거부", () => {
  // C 통째 증여(토지·건물 모두 환산 입력) — 증여자 취득일 토지 2021-01-01 / 건물 2021-08-01 (같은 날이면 leaf S10이 막는다), 증여세 3천만/과세가액 4억.
  const runC = (landEstStd: number, std: number) =>
    run({
      std, giftVal: 200_000_000, landEstStd, db: NEW_DB, landDonorDate: "2021-01-01", giftTax: 30_000_000,
      extra: { landAcquisitionDate: D("2024-06-15"), landAcquisitionCause: "carryover_gift" },
    });
  it("C: 건물 파트 적용 · 토지 파트 미적용 → base는 건물 파트 환산취득가액(2천만)뿐 — 토지 파트 값(2억)은 섞이지 않는다", () => {
    const r = runC(20_000_000, 20_000_000);
    expect(r.splitDetail!.land.carryover!.judgment).toBe("excluded");
    expect(r.splitDetail!.building.carryover!.judgment).toBe("applied");
    expect(r.penaltyBase).toBe(20_000_000);
    expect(r.penaltyBase).toBe(r.splitDetail!.building.acquisitionPrice);
    expect(r.penaltyTax).toBe(1_000_000);
  });
  it("C: 토지 파트만 적용 · 건물 파트 미적용(②3호 B) → 가산세 없음 (토지 환산취득가액은 가산세 대상이 아니다)", () => {
    const r = runC(20_000_000, 50_000_000);
    expect(r.splitDetail!.land.carryover!.judgment).toBe("applied");
    expect(r.splitDetail!.building.carryover!.judgment).toBe("excluded");
    expect(r.penaltyTax).toBe(0);
    expect(r.splitDetail!.building.carryover!.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
  });
  it("토지 파트 donorBuilt → 거부", () => {
    expect(() => run({ std: 100_000_000, giftVal: 200_000_000, landEstStd: 150_000_000, landDb: NEW_DB })).toThrow(/토지 파트/);
  });
  it("건물 파트가 실가 입력인데 donorBuilt → 거부(환산 아닌 승계에는 가산세 대상이 아니다)", () => {
    expect(() => run({ std: 0, actualPrice: 50_000_000, giftVal: 315_000_000, db: NEW_DB })).toThrow(/환산취득가액으로 계산할 때만/);
  });
  it("신축일이 증여자 취득일 전 / 증여 등기접수일 후 → 거부", () => {
    expect(() => run({ std: 100_000_000, giftVal: 315_000_000, db: { buildingType: "new", constructionDate: "2021-07-31" } })).toThrow(/신축·증축일/);
    expect(() => run({ std: 100_000_000, giftVal: 315_000_000, db: { buildingType: "new", constructionDate: "2024-06-16" } })).toThrow(/신축·증축일/);
  });
  it("증축인데 증축 부분 기준시가·바닥면적 누락 → 거부", () => {
    expect(() => run({ std: 100_000_000, giftVal: 315_000_000, db: { buildingType: "extension", constructionDate: "2021-08-01", extensionFloorArea: 90 } })).toThrow(/증축 부분/);
    expect(() => run({ std: 100_000_000, giftVal: 315_000_000, db: { buildingType: "extension", constructionDate: "2021-08-01", extensionStdPriceAtAcquisition: 20_000_000 } })).toThrow(/바닥면적/);
  });
  it("이월과세 자체가 배제된 파트(관계 «그 외»)는 echo 가 carryover_excluded — scenario_b 와 구분된다", () => {
    const r = run({ std: 100_000_000, giftVal: 315_000_000, db: NEW_DB, relation: "other" });
    expect(r.splitDetail!.building.carryover!.judgment).toBe("excluded");
    expect(r.splitDetail!.building.carryover!.exclusionReason).not.toBe("tax_comparison");
    expect(r.penaltyTax).toBe(0);
    expect(r.splitDetail!.building.carryover!.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "carryover_excluded" });
  });
  it("증축인데 건물 파트 양도 당시 기준시가(환산 분모)가 없으면 가산세 계산 전에 거부된다", () => {
    expect(() =>
      run({
        std: 100_000_000, giftVal: 315_000_000,
        db: { buildingType: "extension", constructionDate: "2021-08-01", extensionFloorArea: 90, extensionStdPriceAtAcquisition: 20_000_000 },
        extra: { buildingStandardPriceAtTransfer: 0 },
      }),
    ).toThrow(/양도시 건물 기준시가가 필요합니다/);
  });
  it("donorBuilt 부재 → echo 없음 · 가산세 0 (현행 회귀 0)", () => {
    const r = run({ std: 100_000_000, giftVal: 315_000_000 });
    expect(r.splitDetail!.building.carryover!.donorBuiltPenalty).toBeUndefined();
    expect(r.penaltyTax).toBe(0);
  });
});
