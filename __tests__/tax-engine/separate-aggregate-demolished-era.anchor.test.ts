/**
 * 재산세 별도합산 철거ㆍ멸실 유예기간 — 과세기준일 시행본 연혁 + 민법 만료일 (지방세법 시행령 §103의2 1호).
 *
 * 결함 2건(2026-11-25 실측):
 *  1. 연혁 — 유예기간이 과세기준일과 무관하게 12개월 고정이었다. 영 §103의2는 과세기준일 현재 시행본으로 정해진다:
 *     2016.6.1. 전 규정 없음(2016.1.1. 시행본 부칙 제2조 «이 영 시행 이후 최초로 납세의무가 성립하는 분부터») ·
 *     2016.6.1.~2026.5.31. 6개월 · 2026.6.1.~ 1년(제36043호 부칙 제13조).
 *  2. 날짜 — `setUTCMonth(+N)` 월말 오버플로(2.29. + 12개월 = 3.1.). 민법 §157·§160 만료일은 2.28.(`isWithinPeriodMonths`).
 *
 * 화면은 targetDate를 보내지 않아 항상 올해(2026.6.1.) → 1년 → 불변. 직접 API의 과거 연도·엔진 taxBaseDate 지정에서만 달라진다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateSeparateAggregateTax,
  isSeparateAggregateLand,
} from "../../lib/tax-engine/separate-aggregate-land";
import type { SeparateAggregateLandItem } from "../../lib/tax-engine/separate-aggregate-land";
import { PROPERTY_SEPARATE } from "../../lib/tax-engine/legal-codes";

function land(demolishedDate: string, taxBaseDate: string): SeparateAggregateLandItem {
  return {
    id: "L1",
    jurisdictionCode: "11680",
    landArea: 300,
    officialLandPrice: 1_000_000,
    zoningDistrict: "commercial",
    buildingFloorArea: 100, // 상업 3배 → 기준면적 300㎡ = 토지 전체
    demolished: true,
    // PSA-E2 — 철거 요건 칸을 명시(과세기준일 시행본이 요구하는 칸 전부 — 허가 받음 · 건축 외 용도 아님 · 건축물)
    demolishedKind: "building",
    demolishedPermit: "yes",
    demolishedOtherUse: "no",
    demolishedDate,
    taxBaseDate,
  };
}
const separate = (d: string, base: string) => isSeparateAggregateLand(land(d, base)).isSeparateAggregate;

describe("§103의2 1호 — 과세기준일 시행본 연혁 (6개월 / 1년)", () => {
  it("과세기준일 2025.6.1.(6개월): 철거 2024.12.1. 안 · 2024.11.30. 밖", () => {
    expect(separate("2024-12-01", "2025-06-01")).toBe(true);
    expect(separate("2024-11-30", "2025-06-01")).toBe(false);
  });

  it("과세기준일 2026.6.1.(1년): 철거 2025.6.1. 안 · 2025.5.31. 밖", () => {
    expect(separate("2025-06-01", "2026-06-01")).toBe(true);
    expect(separate("2025-05-31", "2026-06-01")).toBe(false);
  });

  it("경계 시행본: 2026.5.31.(6개월)과 2026.6.1.(1년) — 철거 2025.10.1.", () => {
    // 6개월 만료 2026.3.31. → 2026.5.31.은 밖 / 1년 만료 2026.10.1. → 2026.6.1.은 안
    expect(separate("2025-10-01", "2026-05-31")).toBe(false);
    expect(separate("2025-10-01", "2026-06-01")).toBe(true);
  });

  it("2016.6.1. 전 과세기준일: 규정 없음 → 종합합산 + 확인 필요 고지, 2016.6.1.은 6개월", () => {
    const before = isSeparateAggregateLand(land("2015-12-01", "2016-05-31"));
    expect(before.isSeparateAggregate).toBe(false);
    expect(before.excessArea).toBe(300);
    expect(before.demolishedGraceApplied).toBe(false);
    expect(before.legalBasis).toBe(PROPERTY_SEPARATE.SUBJECT);
    expect(before.warnings.join("")).toContain("확인 필요");
    // 2016.6.1. 첫 과세기준일 — 철거 2015.12.1.은 6개월 만료일 당일 → 안
    expect(separate("2015-12-01", "2016-06-01")).toBe(true);
    expect(separate("2015-11-30", "2016-06-01")).toBe(false);
  });
});

describe("§103의2 1호 — 민법 §157·§160 만료일(월말 오버플로 없음)", () => {
  it("6개월: 철거 2024.8.31. → 만료 2025.2.28. (구 setUTCMonth는 3.3.)", () => {
    expect(separate("2024-08-31", "2025-02-28")).toBe(true);
    expect(separate("2024-08-31", "2025-03-01")).toBe(false);
  });

  it("1년: 철거 2028.2.29. → 만료 2029.2.28. (구 setUTCMonth는 2029.3.1.)", () => {
    expect(separate("2028-02-29", "2029-02-28")).toBe(true);
    expect(separate("2028-02-29", "2029-03-01")).toBe(false);
  });
});

describe("재산세 실측 — 별도합산 ↔ 종합합산 이관", () => {
  const run = (year: number, d: string) =>
    calculateSeparateAggregateTax({ taxpayerId: "t", targetYear: year, landList: [land(d, `${year}-06-01`)] });

  it("2025년: 철거 2024.12.1. → 별도합산 과세표준 210,000,000 · 산출 430,000 / 2024.11.30. → 전량 종합합산 이관", () => {
    const inside = run(2025, "2024-12-01");
    expect(inside.taxBase).toBe(210_000_000);
    expect(inside.grossTax).toBe(430_000);
    const outside = run(2025, "2024-11-30");
    expect(outside.taxBase).toBe(0);
    expect(outside.grossTax).toBe(0);
    expect(outside.totalExcessOfficialValue).toBe(300_000_000);
  });

  it("2026년: 철거 2025.6.1. → 430,000 / 2025.5.31. → 전량 종합합산 이관", () => {
    expect(run(2026, "2025-06-01").grossTax).toBe(430_000);
    const outside = run(2026, "2025-05-31");
    expect(outside.grossTax).toBe(0);
    expect(outside.totalExcessOfficialValue).toBe(300_000_000);
  });
});
