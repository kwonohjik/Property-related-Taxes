/**
 * 취득세 교재 대조(「부동산 컨설팅 전문가 과정」 pp.126~157) — T6·T8 anchor
 *
 * - T6 (p4): 지분으로 취득한 주택은 전체 주택의 취득당시가액으로 1~3% 세율을 판정한다(지방세법 §11①8호 후단).
 *   과세표준은 지분 가액 그대로다(§11②). 전체가액 = 지분 가액 ÷ 지분율 — 취득 지분 시가표준액이 지분율에
 *   비례한다고 본다(사용자 결정 2026-11-28).
 * - T8 (p16): §28의4②1~3호 주택 수 제외는 전용면적 요건(60㎡·85㎡)이 있다. 면적을 모르면 적용하지 않는다
 *   (「모름」=혜택 불성립). 종전 엔진은 면적 미입력을 요건 충족으로 봤다.
 */
import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import { calculateHouseCount } from "../../../lib/tax-engine/house-count/index";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";
import type { PendingAcquisition } from "../../../lib/tax-engine/house-count/types";

function calc(input: Partial<AcquisitionTaxInput>) {
  return calcAcquisitionTax({
    propertyType: "housing",
    acquisitionCause: "purchase",
    acquiredBy: "individual",
    houseCountAfter: 1,
    isRegulatedArea: false,
    balancePaymentDate: "2026-11-01",
    ...input,
  } as AcquisitionTaxInput);
}

// ============================================================
// T6 — §11①8호 후단 지분 취득 전체가액 환산
// ============================================================

describe("T6 지분 취득 주택 — 전체 주택 가액으로 세율 판정 (§11①8호 후단)", () => {
  it("교재 p4: 4억에 50% 지분(전체 8억) → 선형보간 2.33% · 4억 × 0.0233 = 9,320,000 (종전 1% = 4,000,000)", () => {
    const r = calc({ reportedPrice: 400_000_000, acquisitionOwnershipShare: 0.5 });
    expect(r.taxBase).toBe(400_000_000);
    expect(r.appliedRate).toBe(0.0233);
    expect(r.acquisitionTax).toBe(9_320_000);
    expect(r.legalBasis).toContain("지방세법 §11①8호 후단");
    expect(r.warnings.some((w) => w.includes("800,000,000원"))).toBe(true);
  });

  it("전체 9억 초과: 5억에 50% 지분(전체 10억) → 3% = 15,000,000", () => {
    const r = calc({ reportedPrice: 500_000_000, acquisitionOwnershipShare: 0.5 });
    expect(r.appliedRate).toBe(0.03);
    expect(r.acquisitionTax).toBe(15_000_000);
  });

  it("전체 6억 이하: 2.5억에 40% 지분(전체 6.25억 → 선형보간) / 2억에 40% 지분(전체 5억 → 1%)", () => {
    expect(calc({ reportedPrice: 250_000_000, acquisitionOwnershipShare: 0.4 }).appliedRate).toBe(0.0117);
    const low = calc({ reportedPrice: 200_000_000, acquisitionOwnershipShare: 0.4 });
    expect(low.appliedRate).toBe(0.01);
    expect(low.acquisitionTax).toBe(2_000_000);
  });

  it("단독 소유(지분 1)·지분 미입력은 종전 그대로: 4억 → 1% = 4,000,000", () => {
    expect(calc({ reportedPrice: 400_000_000, acquisitionOwnershipShare: 1 }).acquisitionTax).toBe(4_000_000);
    expect(calc({ reportedPrice: 400_000_000 }).acquisitionTax).toBe(4_000_000);
  });

  it("유상거래가 아닌 원인(증여)은 §11①8호 대상이 아니다 — 3.5% 그대로", () => {
    const r = calc({
      acquisitionCause: "gift",
      reportedPrice: 0,
      marketValue: 400_000_000,
      standardValue: 300_000_000,
      contractDate: "2026-11-01",
      acquisitionOwnershipShare: 0.5,
    });
    expect(r.appliedRate).toBe(0.035);
    expect(r.legalBasis).not.toContain("지방세법 §11①8호 후단");
  });
});

// ============================================================
// T8 — §28의4② 면적 요건 미입력
// ============================================================

describe("T8 §28의4② 주택 수 제외 — 전용면적 미입력이면 적용하지 않는다", () => {
  const base = {
    houses: [
      { id: "existing", standardValue: 300_000_000, type: "apartment" as const, acquisitionDate: "2020-01-01", isMetropolitan: false },
    ],
    rights: [],
    offices: [],
    referenceDate: "2025-06-01",
  };
  const pending = (p: Partial<PendingAcquisition>): PendingAcquisition => ({
    isMetropolitan: false,
    acquisitionValue: 200_000_000,
    type: "urban_living",
    ...p,
  });

  it("1호 신축: 면적 55㎡면 제외(1주택) / 미입력이면 포함(2주택) + 경고", () => {
    expect(calculateHouseCount({ ...base, pendingAcquisition: pending({ areaSqm: 55, isHansiBenefitNewBuild: true }) }).effectiveCount).toBe(1);
    const blank = calculateHouseCount({ ...base, pendingAcquisition: pending({ isHansiBenefitNewBuild: true }) });
    expect(blank.effectiveCount).toBe(2);
    expect(blank.pendingAcquisitionIncluded).toBe(true);
    expect(blank.warnings.some((w) => w.includes("전용면적 미입력"))).toBe(true);
  });

  it("2호 임대등록: 면적 미입력이면 포함(2주택)", () => {
    expect(calculateHouseCount({ ...base, pendingAcquisition: pending({ areaSqm: 55, isHansiBenefitLeaseRegistered: true }) }).effectiveCount).toBe(1);
    const blank = calculateHouseCount({ ...base, pendingAcquisition: pending({ isHansiBenefitLeaseRegistered: true }) });
    expect(blank.effectiveCount).toBe(2);
    expect(blank.warnings.some((w) => w.includes("전용면적 미입력"))).toBe(true);
  });

  it("3호 미분양 아파트(2024.1.10.~2025.12.31.): 면적 미입력이면 포함(2주택)", () => {
    const unsold = { type: "apartment" as const, isHansiBenefitUnsoldApt: true };
    expect(calculateHouseCount({ ...base, pendingAcquisition: pending({ ...unsold, areaSqm: 84 }) }).effectiveCount).toBe(1);
    const blank = calculateHouseCount({ ...base, pendingAcquisition: pending(unsold) });
    expect(blank.effectiveCount).toBe(2);
    expect(blank.warnings.some((w) => w.includes("전용면적 미입력"))).toBe(true);
  });
});
