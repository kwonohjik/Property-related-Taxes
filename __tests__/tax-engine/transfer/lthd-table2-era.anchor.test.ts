/**
 * anchor — OH-31 · 「소득세법」 §95② 표2(1세대1주택 장기보유특별공제) 연혁 (Q-4: 2009~2020 소급)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.7 · §6.1 Q-4.
 *
 * | 양도일 | 표2 공제율 | 표2 대상 거주요건 | 근거 |
 * |---|---|---|---|
 * | < 2009-01-01 | (미지원 — 현행 식 fallback + 고지) | — | Q-4 결정 |
 * | 2009-01-01 ~ 2019-12-31 | 보유 3년 이상 연 8%, 10년 이상 80% | 없음 | 법률 제9270호 부칙 제2조② (MST 90470) |
 * | 2020-01-01 ~ 2020-12-31 | 같음 | 거주 2년 | 시행령 §159의3, 대통령령 제29242호 부칙 제1조 단서·제3조 |
 * | ≥ 2021-01-01 | 보유 4%(40%) + 거주 4%(40%) | 거주 2년 | 법률 제17477호 부칙 제1조·제2조 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calcLongTermRate } from "@/lib/tax-engine/transfer-tax-mixed-use-inheritance";
import { resolveLthdTable2Era } from "@/lib/tax-engine/data/lthd-table2-era";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const d = (s: string) => new Date(s);

/** 1세대1주택 · 비조정 · 취득 2010-01-01 · 10억(취득 5억) — 고가주택 부분과세라 장특이 계산된다 */
const oneHouse = (transfer: string, residenceMonths: number, acq = "2010-01-01"): TransferTaxInput =>
  baseTransferInput({
    householdHousingCount: 1,
    transferPrice: 1_000_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: d(acq),
    transferDate: d(transfer),
    residencePeriodMonths: residenceMonths,
  });
const rateOf = (i: TransferTaxInput) => calculateTransferTax(i, mockRates).longTermHoldingRate;

describe("leaf — resolveLthdTable2Era", () => {
  it("경계 ±1일", () => {
    expect(resolveLthdTable2Era(d("2008-12-31"))).toBe("unsupported");
    expect(resolveLthdTable2Era(d("2009-01-01"))).toBe("holding_8pct");
    expect(resolveLthdTable2Era(d("2019-12-31"))).toBe("holding_8pct");
    expect(resolveLthdTable2Era(d("2020-01-01"))).toBe("holding_8pct_residence_2y");
    expect(resolveLthdTable2Era(d("2020-12-31"))).toBe("holding_8pct_residence_2y");
    expect(resolveLthdTable2Era(d("2021-01-01"))).toBe("holding_residence_split");
  });
  it("calcLongTermRate(표2) — 2020 양도 연 8%·80% 한도, 거주 무관", () => {
    expect(calcLongTermRate(3, 0, true, false, d("2020-06-01"))).toBe(0.24);
    expect(calcLongTermRate(9, 5, true, false, d("2020-06-01"))).toBe(0.72);
    expect(calcLongTermRate(12, 0, true, false, d("2020-06-01"))).toBe(0.8);
    expect(calcLongTermRate(2, 5, true, false, d("2020-06-01"))).toBe(0);
  });
  it("calcLongTermRate(표2) — 2021 이후는 현행 보유 4% + 거주 4%", () => {
    expect(calcLongTermRate(10, 5, true, false, d("2021-01-01"))).toBeCloseTo(0.6, 10);
  });
});

describe("OH-31 통합", () => {
  it("★ 리뷰 L1: 2020-06-01 양도 · 보유 10년 · 거주 5년 → 표2 80% (현행 식 60% 아님)", () => {
    expect(rateOf(oneHouse("2020-06-01", 60))).toBe(0.8);
  });
  it("2020-12-31 → 80% / 2021-01-01 → 60% (보유 40% + 거주 20%)", () => {
    expect(rateOf(oneHouse("2020-12-31", 60))).toBe(0.8);
    expect(rateOf(oneHouse("2021-01-01", 60))).toBeCloseTo(0.6, 10);
  });
  it("★ 거주 0개월: 2019-12-31 → 표2 80%(거주요건 없음) / 2020-01-01 → 표1 20%", () => {
    expect(rateOf(oneHouse("2019-12-31", 0))).toBe(0.8);
    expect(rateOf(oneHouse("2020-01-01", 0))).toBe(0.2);
  });
  it("표2 산식 문구도 연 8% 단일축으로 적는다(2020 양도)", () => {
    const r = calculateTransferTax(oneHouse("2020-06-01", 60), mockRates);
    const f = r.steps.find((s) => s.label === "장기보유특별공제")?.formula ?? "";
    expect(f).toContain("×8%");
    expect(f).not.toContain("거주 5년×4%");
  });
  it("2009-01-01 이전 양도는 표2 연혁 미지원 고지 / 2009-01-01은 고지 없음", () => {
    const w = (t: string) =>
      (calculateTransferTax(oneHouse(t, 60, "1998-01-01"), mockRates).warnings ?? []).join("\n");
    expect(w("2008-12-31")).toContain("2009년 1월 1일 전에 양도");
    expect(w("2009-01-01")).not.toContain("2009년 1월 1일 전에 양도");
  });
});
