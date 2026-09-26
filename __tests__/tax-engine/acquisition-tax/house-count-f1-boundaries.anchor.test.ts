/**
 * anchor: 취득세 주택 수 산정 — 기간·시행일 경계 ±1일 (F1 · OH-03·24·25·26·27 + 신규 부칙)
 *
 * 기간 계산: 지방세기본법 §23 → 민법 §157(초일 불산입, 0시 시작이면 산입)·§160②(응당일 전날 만료).
 *  - §28의4⑥3호 「상속개시일부터 5년이 **지나지 않은**」 — 상속개시일 불산입 → 만료일 = 5년 뒤 응당일.
 *    응당일 당일은 아직 5년이 지나지 않았다 → 제외(plan §1 B 유형 `isWithinPeriod`).
 *  - 대통령령 제30939호 부칙 제3조 「이 영 시행 이후 5년 동안」 — 시행일(2020-08-12) 0시부터 기산(초일 산입)
 *    → 2025-08-11까지. (그 날짜 경계를 정면으로 다룬 해석례는 확인 필요 — 민법 문언 독해)
 *  - 대통령령 제30939호 부칙 제2조 — §28의4① 후단(권리취득일 소급)은 2020-08-12 이후 권리 취득분부터.
 */

import { describe, it, expect } from "vitest";
import { calculateHouseCount } from "@/lib/tax-engine/house-count/index";
import { isExcludedBy5YearRule } from "@/lib/tax-engine/house-count/inheritance";
import { getHouseCountReferenceDate } from "@/lib/tax-engine/house-count/right-acquisition";

describe("§28의4⑥3호 상속 5년 — 응당일 경계", () => {
  it("B-01: 🔴 상속 2021-06-01 · 산정일 2026-06-01(응당일) → 아직 5년 미경과 → 제외", () => {
    expect(isExcludedBy5YearRule("2021-06-01", "2026-06-01")).toBe(true);
  });
  it("B-02: 긍정 짝 — 산정일 2026-06-02 → 5년 경과 → 산입", () => {
    expect(isExcludedBy5YearRule("2021-06-01", "2026-06-02")).toBe(false);
  });
  it("B-03: 산정일 2026-05-31 → 제외", () => {
    expect(isExcludedBy5YearRule("2021-06-01", "2026-05-31")).toBe(true);
  });
});

describe("대통령령 제30939호 부칙 제3조 — 2020.8.12. 전 상속분은 시행 후 5년(2025-08-11)까지 제외", () => {
  it("B-04: 🔴 2019-01-01 상속 · 산정일 2024-06-01(개시일 기준 5년 경과) → 부칙 특례로 제외", () => {
    expect(isExcludedBy5YearRule("2019-01-01", "2024-06-01")).toBe(true);
  });
  it("B-05: 🔴 2015-01-01 상속 · 산정일 2025-08-11 → 제외", () => {
    expect(isExcludedBy5YearRule("2015-01-01", "2025-08-11")).toBe(true);
  });
  it("B-06: 긍정 짝 — 산정일 2025-08-12 → 산입", () => {
    expect(isExcludedBy5YearRule("2015-01-01", "2025-08-12")).toBe(false);
  });
  it("B-07: 부칙은 2020.8.12. 전 상속분만 — 2020-08-12 상속은 본칙(5년 응당일 2025-08-12까지 제외, 08-13 산입)", () => {
    expect(isExcludedBy5YearRule("2020-08-12", "2025-08-12")).toBe(true);
    expect(isExcludedBy5YearRule("2020-08-12", "2025-08-13")).toBe(false);
  });
  it("B-08: 전 경로 — 2019 상속 주택(5억)은 2024-06-01 산정 시 제외", () => {
    const r = calculateHouseCount({
      houses: [{ id: "h", standardValue: 500_000_000, type: "housing", acquisitionDate: "2019-01-01", isMetropolitan: true, inheritanceDate: "2019-01-01" }],
      rights: [],
      offices: [],
      referenceDate: "2024-06-01",
    });
    expect(r.effectiveCount).toBe(0);
    expect(r.excludedDetails[0].reason).toBe("inheritance_under_5yr");
  });
});

describe("대통령령 제30939호 부칙 제2조 — 권리취득일 소급은 2020.8.12. 이후 권리부터", () => {
  it("B-09: 🔴 권리 2020-08-11 취득 → 소급하지 않고 주택 취득일(잔금일) 기준", () => {
    const r = getHouseCountReferenceDate({
      acquiredViaRight: true,
      rightAcquisitionDate: "2020-08-11",
      balancePaymentDate: "2024-06-01",
    });
    expect(r.isRightAcquisitionSoGup).toBe(false);
    expect(r.referenceDate).toBe("2024-06-01");
  });
  it("B-10: 긍정 짝 — 권리 2020-08-12 취득 → 권리취득일로 소급", () => {
    const r = getHouseCountReferenceDate({
      acquiredViaRight: true,
      rightAcquisitionDate: "2020-08-12",
      balancePaymentDate: "2024-06-01",
    });
    expect(r.isRightAcquisitionSoGup).toBe(true);
    expect(r.referenceDate).toBe("2020-08-12");
  });
});

describe("OH-25·26 — 소급 기준일·기준일 뒤 취득", () => {
  const pending = { isMetropolitan: true, acquisitionValue: 500_000_000, acquiredViaRight: true, rightAcquisitionDate: "2023-03-01" };

  it("B-11: 🔴 무관한 다른 권리(2021-01-01)가 기준일을 끌어당기지 않는다", () => {
    const r = calculateHouseCount({
      houses: [],
      rights: [{ id: "r", type: "subscription_right", rightAcquisitionDate: "2021-01-01" }],
      offices: [],
      pendingAcquisition: pending,
      referenceDate: "2025-06-01",
    });
    expect(r.referenceDate).toBe("2023-03-01");
    expect(r.effectiveCount).toBe(2);
  });

  it("B-12: 🔴 기준일 다음날 취득한 권리 → 제외", () => {
    const r = calculateHouseCount({
      houses: [],
      rights: [{ id: "r", type: "subscription_right", rightAcquisitionDate: "2023-03-02" }],
      offices: [],
      pendingAcquisition: pending,
      referenceDate: "2025-06-01",
    });
    expect(r.effectiveCount).toBe(1);
    expect(r.excludedDetails[0].reason).toBe("acquired_after_reference_date");
  });

  it("B-13: 기준일 당일 취득 → 산입하되 §28의4③(동시 취득 순서 선택) 안내", () => {
    const r = calculateHouseCount({
      houses: [{ id: "h", standardValue: 500_000_000, type: "housing", acquisitionDate: "2023-03-01", isMetropolitan: true }],
      rights: [],
      offices: [],
      pendingAcquisition: pending,
      referenceDate: "2025-06-01",
    });
    expect(r.effectiveCount).toBe(2);
    expect(r.warnings.some((w) => w.includes("§28의4③"))).toBe(true);
  });
});

describe("OH-27 — 보유주택 저가 한도는 취득하는 주택의 취득일로 연혁 판정", () => {
  const held = { id: "h", standardValue: 150_000_000, type: "housing" as const, acquisitionDate: "2015-01-01", isMetropolitan: false };
  it("B-14: 🔴 2025-01-01 취득 → 1억 → 산입", () => {
    const r = calculateHouseCount({ houses: [held], rights: [], offices: [], referenceDate: "2025-01-01" });
    expect(r.effectiveCount).toBe(1);
  });
  it("B-15: 긍정 짝 — 2025-01-02 취득 → 2억 → 제외", () => {
    const r = calculateHouseCount({ houses: [held], rights: [], offices: [], referenceDate: "2025-01-02" });
    expect(r.effectiveCount).toBe(0);
    expect(r.excludedDetails[0].reason).toBe("low_value_non_metro");
  });
  it("B-16: 수도권 1억 경계는 연혁과 무관 — 2024 취득도 정확히 1억이면 제외", () => {
    const r = calculateHouseCount({
      houses: [{ ...held, standardValue: 100_000_000, isMetropolitan: true }],
      rights: [],
      offices: [],
      referenceDate: "2024-06-01",
    });
    expect(r.effectiveCount).toBe(0);
  });
});
