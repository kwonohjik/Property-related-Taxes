/**
 * PR-12 anchor (2026-11 리뷰 D-20 · 결정 Q-6) — E-4(1주택 본칙) 「적용된 특례」에는 결론을 바꾼 완화만 올린다.
 *
 * 형제 경로(§155 의제 D-3 · 겸용 MP-3)는 이미 그렇다. 상생임대는 §154① 거주(비과세) 또는 고가주택의 §159의4 표2 거주 제한(장특) 중
 * 실제로 가른 쪽만 — 표2만 가른 행은 라벨로 구분(Q-6). E-3 확장은 별건.
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const judge = (over: Partial<TransferTaxInput>) =>
  checkExemption(
    baseTransferInput({ propertyType: "housing", isOneHousehold: true, householdHousingCount: 1, ...over }) as OneHouseJudgeInput,
    rules,
    D("2021-01-01"),
  );
const ids = (j: ReturnType<typeof judge>) => (j.appliedExceptions ?? []).map((e) => e.id);
const winWin = { winWinContractDate: D("2022-03-01"), increaseRatePct: 4, priorLeaseMonths: 18, winWinLeaseMonths: 24 };
// 2020 취득 · 2024 양도 · 9억 · 마포(취득 당시 조정)
const base = { acquisitionDate: D("2020-03-01"), transferDate: D("2024-06-01"), transferPrice: 900_000_000, acquisitionPrice: 500_000_000 };

describe("상생임대", () => {
  it("비조정 1주택 — 거주요건이 없어 결정적이지 않다 → 행 없음 · 비과세", () => {
    const j = judge({ ...base, isRegulatedArea: false, wasRegulatedAtAcquisition: false, residencePeriodMonths: 0, winWinRentalHouse: winWin });
    expect(j.isExempt).toBe(true);
    expect(ids(j)).not.toContain("155-3-1-win-win-rental");
  });
  it("짝 — 취득 당시 조정 · 거주 0 → 거주 제한 면제가 결론을 가른다 → 행 있음", () => {
    const j = judge({ ...base, wasRegulatedAtAcquisition: true, residencePeriodMonths: 0, winWinRentalHouse: winWin });
    expect(j.isExempt).toBe(true);
    expect(ids(j)).toContain("155-3-1-win-win-rental");
  });
  it("고가주택(15억) · 비조정 · 거주 0 — 표2 거주 제한만 가른다 → 표2 라벨 행(Q-6)", () => {
    const j = judge({ ...base, transferPrice: 1_500_000_000, wasRegulatedAtAcquisition: false, residencePeriodMonths: 0, winWinRentalHouse: winWin });
    expect(j.isPartialExempt).toBe(true);
    expect(ids(j)).toEqual(["155-3-1-win-win-rental-table2"]);
  });
});

describe("장기저당 · §154① 단서", () => {
  const ltm = {
    contractDate: D("2021-01-01"), borrowerAgeAtContract: 65, contractYears: 10, maturityLumpSumRepayment: true,
    transferredBeforeMaturity: false, isTransferredHouseMortgaged: true,
  } as unknown as TransferTaxInput["longTermMortgageHouse"];
  it("거주 60개월 + 장기저당 — 면제 없이도 충족 → 행 없음", () => {
    const j = judge({ ...base, wasRegulatedAtAcquisition: true, residencePeriodMonths: 60, longTermMortgageHouse: ltm });
    expect(j.isExempt).toBe(true);
    expect(ids(j)).not.toContain("155-2-1-long-term-mortgage-residence");
  });
  it("짝 — 거주 0 + 장기저당 → 면제가 결론을 가른다 → 행 있음", () => {
    const j = judge({ ...base, wasRegulatedAtAcquisition: true, residencePeriodMonths: 0, longTermMortgageHouse: ltm });
    expect(j.isExempt).toBe(true);
    expect(ids(j)).toContain("155-2-1-long-term-mortgage-residence");
  });
  it("비조정 + 3호(부득이) — 본칙만으로 충족(보유 2년) → 비과세 사유에 단서 라벨 없음", () => {
    const j = judge({
      ...base, wasRegulatedAtAcquisition: false, residencePeriodMonths: 14,
      oneHouseExemptionProviso: { reason: "unavoidable" } as never,
    });
    expect(j.isExempt).toBe(true);
    expect(j.exemptReason).toBe("1세대1주택 비과세");
    expect(ids(j).some((i) => i.startsWith("154-1-proviso"))).toBe(false);
  });
});
