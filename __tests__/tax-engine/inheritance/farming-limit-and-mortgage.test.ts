/**
 * 영농상속공제 법령정합 보완 — 연도별 한도(G1) + 담보 시행시기(G3) + 2년영농(G4) + 총수입 라벨(G2) anchor
 *
 * 설계: docs/02-design/features/inheritance-farming-deduction-enhancement.engine.design.md
 * 한도 출처 (KoreanLaw 1차 검증 완료, 2026-06-04 — 조세심판원 적용조문 축자 인용):
 *   2억=조심2010중2776(2007.2.21) · 5억=조심2014중4319(2012.2.20)·2017중4714(2013.11.8)
 *   15억=조심2019중4355(2018.1.9) · 30억=법률 제19195호 §18의3①(2023.1.1, MST 247439 신설조문)
 *   "20억" 구간 부재 확정 (2→5→15→30). 상세 근거: lib/tax-engine/data/farming-deduction-limit.ts 주석.
 */

import { describe, expect, it } from "vitest";

import { calcFarmingDeduction } from "@/lib/tax-engine/deductions/inheritance-deductions";
import { resolveFarmingDeductionLimit } from "@/lib/tax-engine/data/farming-deduction-limit";
import { suggestFarmingAssetValue } from "@/lib/calc/inheritance-deduction-suggest";
import type { FarmingInheritanceInput } from "@/lib/tax-engine/types/inheritance-farming.types";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function personalOk(
  over: Partial<FarmingInheritanceInput> = {},
): FarmingInheritanceInput {
  return {
    type: "personal",
    decedentEightYearFarming: true,
    decedentResidenceMet: true,
    heirIsAdult: true,
    heirTwoYearFarming: true,
    heirResidenceMet: true,
    ...over,
  };
}

function farmItem(over: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "f1",
    category: "real_estate_land",
    name: "농지",
    farmingCategory: "farmland",
    marketValue: 1_000_000_000,
    ...over,
  } as EstateItem;
}

// ============================================================
// G1 — 연도별 한도 resolveFarmingDeductionLimit (경계)
// ============================================================

describe("G1 resolveFarmingDeductionLimit — 상속개시 연도별 한도 경계", () => {
  it("2023-01-01 → 30억 / 2022-12-31 → 15억", () => {
    expect(resolveFarmingDeductionLimit("2023-01-01")).toBe(3_000_000_000);
    expect(resolveFarmingDeductionLimit("2022-12-31")).toBe(1_500_000_000);
  });
  it("2016-01-01 → 15억 / 2015-12-31 → 5억", () => {
    expect(resolveFarmingDeductionLimit("2016-01-01")).toBe(1_500_000_000);
    expect(resolveFarmingDeductionLimit("2015-12-31")).toBe(500_000_000);
  });
  it("2012-01-01 → 5억 / 2011-12-31 → 2억", () => {
    expect(resolveFarmingDeductionLimit("2012-01-01")).toBe(500_000_000);
    expect(resolveFarmingDeductionLimit("2011-12-31")).toBe(200_000_000);
  });
  it("undefined → 30억 (legacy 현행)", () => {
    expect(resolveFarmingDeductionLimit()).toBe(3_000_000_000);
  });
  it("조세심판원 축자인용 실측 — 실제 재결례 상속개시일 → 한도", () => {
    // 조심2010중2776 (상속개시 2007.2.21) — §18②2호 "2억원을 한도로 한다"
    expect(resolveFarmingDeductionLimit("2007-02-21")).toBe(200_000_000);
    // 조심2014중4319 (2012.2.20) · 조심2017중4714 (2013.11.8) — "5억원을 한도로 한다"
    expect(resolveFarmingDeductionLimit("2012-02-20")).toBe(500_000_000);
    expect(resolveFarmingDeductionLimit("2013-11-08")).toBe(500_000_000);
    // 조심2019중4355 (2018.1.9) — "15억원을 한도로 한다"
    expect(resolveFarmingDeductionLimit("2018-01-09")).toBe(1_500_000_000);
  });
});

// ============================================================
// G1 — calcFarmingDeduction 한도 적용 + appliedLimit echo
// ============================================================

describe("G1 calcFarmingDeduction — 연도별 한도 cap + appliedLimit", () => {
  it("FE-char: deathDate 미전달 + 50억 → 30억 (현행 동결, FD-3 회귀)", () => {
    const r = calcFarmingDeduction(5_000_000_000, personalOk());
    expect(r.deduction).toBe(3_000_000_000);
    expect(r.detail.appliedLimit).toBe(3_000_000_000);
  });
  it("FE-1: 2024 + 50억 → 30억", () => {
    const r = calcFarmingDeduction(5_000_000_000, personalOk(), undefined, "2024-06-01");
    expect(r.deduction).toBe(3_000_000_000);
    expect(r.detail.appliedLimit).toBe(3_000_000_000);
  });
  it("FE-2: 2020 + 50억 → 15억", () => {
    const r = calcFarmingDeduction(5_000_000_000, personalOk(), undefined, "2020-06-01");
    expect(r.deduction).toBe(1_500_000_000);
    expect(r.detail.appliedLimit).toBe(1_500_000_000);
  });
  it("FE-3: 2014 + 10억 → 5억", () => {
    const r = calcFarmingDeduction(1_000_000_000, personalOk(), undefined, "2014-06-01");
    expect(r.deduction).toBe(500_000_000);
    expect(r.detail.appliedLimit).toBe(500_000_000);
  });
  it("FE-5: deathDate 미전달 + 10억(한도 미달) → 10억 + appliedLimit 30억 echo", () => {
    const r = calcFarmingDeduction(1_000_000_000, personalOk());
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.appliedLimit).toBe(3_000_000_000);
  });
  it("FE-미충족: 2020 + 자격 미충족 → 공제 0, appliedLimit 15억 echo 보존", () => {
    const r = calcFarmingDeduction(
      5_000_000_000,
      personalOk({ decedentEightYearFarming: false }),
      undefined,
      "2020-06-01",
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.appliedLimit).toBe(1_500_000_000);
  });
});

// ============================================================
// G3 — 담보채무 시행시기 게이트 (suggestFarmingAssetValue)
// ============================================================

describe("G3 담보 시행시기 게이트 — 2026.2.27 부칙5", () => {
  it("FM-char: deathDate 미전달 + 저당 2억 → 차감 8억 (legacy)", () => {
    const r = suggestFarmingAssetValue([farmItem({ mortgageAmount: 200_000_000 })]);
    expect(r.value).toBe(800_000_000);
  });
  it("FM-1: 2026-03(시행 후) + 저당 2억 → 차감 8억", () => {
    const r = suggestFarmingAssetValue(
      [farmItem({ mortgageAmount: 200_000_000 })],
      undefined,
      "2026-03-01",
    );
    expect(r.value).toBe(800_000_000);
  });
  it("FM-2: 2025-12(시행 전) + 저당 2억 → 미차감 10억", () => {
    const r = suggestFarmingAssetValue(
      [farmItem({ mortgageAmount: 200_000_000 })],
      undefined,
      "2025-12-01",
    );
    expect(r.value).toBe(1_000_000_000);
  });
  it("FM-경계: 2026-02-27 정확 → 차감 8억", () => {
    const r = suggestFarmingAssetValue(
      [farmItem({ mortgageAmount: 200_000_000 })],
      undefined,
      "2026-02-27",
    );
    expect(r.value).toBe(800_000_000);
  });
});

// ============================================================
// G4 — 2년영농 필터 (suggestFarmingAssetValue)
// ============================================================

describe("G4 2년 영농사용 필터 — §16⑤1호 본문", () => {
  it("FU-1: farmingUsedTwoYears=false → 제외 (value 0, isApplicable false)", () => {
    const r = suggestFarmingAssetValue([farmItem({ farmingUsedTwoYears: false })]);
    expect(r.value).toBe(0);
    expect(r.isApplicable).toBe(false);
  });
  it("FU-2: undefined(default) → 포함", () => {
    const r = suggestFarmingAssetValue([farmItem()]);
    expect(r.value).toBe(1_000_000_000);
    expect(r.isApplicable).toBe(true);
  });
  it("FU-혼합: 2건 중 1건 false → 1건만 합산", () => {
    const r = suggestFarmingAssetValue([
      farmItem({ id: "f1", marketValue: 1_000_000_000 }),
      farmItem({ id: "f2", marketValue: 500_000_000, farmingUsedTwoYears: false }),
    ]);
    expect(r.value).toBe(1_000_000_000);
  });
});

// ============================================================
// G2 — 총수입금액 라벨 (numeric 무영향, reason 문자열만)
// ============================================================

describe("G2 §16⑭ 총수입금액 라벨 — numeric 무영향", () => {
  it("FG-1: hasDisqualifyingIncome=true → 공제 0 + reason '1호 또는 2호'", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ hasDisqualifyingIncome: true }),
    );
    expect(r.deduction).toBe(0);
    expect(
      r.detail.ineligibleReasons.some((s) => s.includes("1호") && s.includes("2호")),
    ).toBe(true);
  });
});
