/**
 * anchor — 조특법 §98 임대 게이트 제거(US-01) · 미임대 중과 우선(Q-11 (b)) · 기본세율 비교 고지(Q-10 (b)).
 * 사용자 결정 2026-11-08. mock 세율표(2024 누진) — 1996-06-15 취득 5억 · 8억 양도 · 2주택.
 *
 * | 시나리오 | 수정 전 총부담 | 수정 후 |
 * |---|---|---|
 * | 비조정 · 임대 OFF | 64,801,000 (§98 탈락) | 45,650,000 (20%) |
 * | 조정 2주택(명부) · 임대 OFF | 167,871,000 (§98 탈락 → 중과) | 167,871,000 (§98 적격 · 중과 우선) + 고지 |
 * | 조정 2주택(명부 없음) · 임대 OFF | 167,871,000 | 167,871,000 + 고지 |
 * | 조정 2주택 · 임대 ON | 45,650,000 (3호 배제 → 20%) | 같음 |
 * | 비조정 · 과세표준 67,500,000 | 14,850,000 | 같음 + 기본세율 산출세액 10,440,000 고지 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { evaluateUnsold98 } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { makeMockRatesWithHouseEngine, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";
import { UNSOLD_98_SURCHARGE_PRECEDENCE_NOTICE } from "@/lib/tax-engine/transfer-tax-unsold98-rate-notice";

const R98 = (rented: boolean) => ({
  type: "unsold_98",
  isNationalScale98: true,
  isOutsideSeoul98: true,
  isUnsoldConfirmed98: true,
  isNotRentalHousing98: true,
  isFirstBuyerNoOccupancy98: true,
  isResident98: true,
  rentedFor5Years98: rented,
});
const roster = {
  houses: [makeHouseInfo("h1", { acquisitionDate: new Date("1996-06-15"), regionCode: "11680" }), makeHouseInfo("h2")],
  sellingHouseId: "h1",
};
const calc = (o: object) =>
  calculateTransferTax(
    baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("1996-06-15"),
      transferDate: new Date("2026-06-01"),
      householdHousingCount: 2,
      ...o,
    } as never),
    makeMockRatesWithHouseEngine(),
  );

describe("US-01 — §98 적용 요건은 보유 5년 (임대 사실 무관)", () => {
  it("평가기: 임대 사실 없이도 적격 · RENTAL_NOT_CONFIRMED 사유 없음", () => {
    const r = evaluateUnsold98({
      transferDate: new Date("2022-08-01"),
      acquisitionDate: new Date("1996-06-15"),
      isResident: true,
      isNationalScale: true,
      isOutsideSeoul: true,
      isUnsoldConfirmed: true,
      isNotRentalHousing: true,
      isFirstBuyerNoOccupancy: true,
    });
    expect(r.isEligible).toBe(true);
    expect(r.ineligibleReasons.map((x) => x.code)).not.toContain("RENTAL_NOT_CONFIRMED");
  });

  it("비조정 · 임대 OFF → 20% · 45,650,000 (수정 전 64,801,000)", () => {
    const r = calc({ isRegulatedArea: false, reductions: [R98(false)] });
    expect(r.longTermHoldingDeduction).toBe(90_000_000);
    expect(r.taxBase).toBe(207_500_000);
    expect(r.appliedRate).toBe(0.2);
    expect(r.calculatedTax).toBe(41_500_000);
    expect(r.totalTax).toBe(45_650_000);
  });
});

describe("Q-11 (b) — 미임대 §98 주택이 중과 대상이면 중과세율", () => {
  it("조정 2주택(명부) · 임대 OFF → 58% · 장특 0 · 167,871,000 + 확인 필요 고지", () => {
    const r = calc({ isRegulatedArea: true, ...roster, reductions: [R98(false)] });
    expect(r.unsold98Detail?.isEligible).toBe(true);
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.appliedRate).toBe(0.58);
    expect(r.totalTax).toBe(167_871_000);
    expect(r.warnings).toContain(UNSOLD_98_SURCHARGE_PRECEDENCE_NOTICE);
  });

  it("조정 2주택(명부 없음) · 임대 OFF → 같은 결론", () => {
    const r = calc({ isRegulatedArea: true, reductions: [R98(false)] });
    expect(r.appliedRate).toBe(0.58);
    expect(r.totalTax).toBe(167_871_000);
    expect(r.warnings).toContain(UNSOLD_98_SURCHARGE_PRECEDENCE_NOTICE);
  });

  it("임대 ON → 소령 §167의3①3호 배제 → 20% · 45,650,000 (명부·무명부 모두)", () => {
    for (const o of [roster, {}]) {
      const r = calc({ isRegulatedArea: true, ...o, reductions: [R98(true)] });
      expect(r.appliedRate).toBe(0.2);
      expect(r.totalTax).toBe(45_650_000);
      expect(r.warnings).not.toContain(UNSOLD_98_SURCHARGE_PRECEDENCE_NOTICE);
    }
  });
});

describe("Q-10 (b) — 20% 적용 시 기본세율 산출세액을 고지만 한다 (자동 선택 없음)", () => {
  it("과세표준 67,500,000 → 20% 13,500,000 유지 · 기본세율 10,440,000 고지", () => {
    const r = calc({ isRegulatedArea: false, transferPrice: 400_000_000, acquisitionPrice: 300_000_000, reductions: [R98(true)] });
    expect(r.taxBase).toBe(67_500_000);
    expect(r.calculatedTax).toBe(13_500_000);
    expect(r.totalTax).toBe(14_850_000);
    const notice = r.warnings?.find((w) => w.includes("§98①은 선택하여"));
    expect(notice).toContain("13,500,000원");
    expect(notice).toContain("10,440,000원");
    expect(notice).not.toMatch(/유리|불리|절감/);
  });

  it("§98 미선택이면 고지 없음", () => {
    const r = calc({ isRegulatedArea: false, reductions: [] });
    expect(r.warnings ?? []).not.toEqual(expect.arrayContaining([expect.stringContaining("조세특례제한법 §98①")]));
  });
});
