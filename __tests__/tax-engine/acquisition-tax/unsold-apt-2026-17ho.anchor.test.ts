/**
 * 2026년 이후 비수도권 미분양 아파트 — 지방세법 시행령 §28의2 17호 · §28의4⑥1호바목 anchor
 *
 * 교재 「부동산 컨설팅 전문가 과정」 p15:
 *   2026.01.01.~2027.12.31. 중에 최초 매매로 취득한 비수도권 미분양 아파트
 *   (아파트 · 취득가액 6억원 이하 · 전용 85㎡ 이하)는 취득세 중과세율 적용 배제.
 *
 * - 취득하는 주택: §28의2 17호 「중과세 대상으로 보지 않는다」. 구 §28의4②3호(2024.1.10.~2025.12.31.)처럼
 *   주택 수에서만 빼는 것이 아니라 §13의2① 중과(법인 포함) 자체를 배제한다.
 * - 보유 중인 주택: §28의4⑥1호바목 — 소유주택 수에서 제외.
 * - 종료일 2027.12.31.: 사용자 결정(2026-11-27, 「법 개정됨」). 같은 날 법령 DB 최신본(제36736호)의
 *   17호 본문은 2026.12.31.이다. 개정 공포본이 DB에 반영되면 대조한다.
 * - 면적·수도권 여부를 모르면 적용하지 않는다(「모름」=혜택 불성립).
 */
import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import { calculateHouseCount } from "../../../lib/tax-engine/house-count/index";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

const UNSOLD: Partial<AcquisitionTaxInput> = {
  propertyType: "housing",
  acquisitionCause: "purchase",
  acquiredBy: "individual",
  reportedPrice: 500_000_000,
  standardValue: 400_000_000,
  areaSqm: 84,
  isMetropolitanRegion: false,
  isRegulatedArea: false,
  houseCountAfter: 4,
  isHansiBenefitUnsoldApt: true,
  balancePaymentDate: "2026-03-01",
};

function run(overrides: Partial<AcquisitionTaxInput> = {}) {
  return calcAcquisitionTax({ ...UNSOLD, ...overrides } as AcquisitionTaxInput);
}

describe("§28의2 17호 — 취득하는 비수도권 미분양 아파트는 중과 배제", () => {
  it("비조정 4주택째 5억·84㎡ 2026-03-01: 12%가 아니라 1% = 5,000,000", () => {
    const r = run();
    expect(r.isSurcharged).toBe(false);
    expect(r.appliedRate).toBe(0.01);
    expect(r.acquisitionTax).toBe(5_000_000);
    expect(r.legalBasis.join(" ")).toContain("§28의2 17호");
  });

  it("법인도 §13의2①1호 12% 대신 기본세율 (§28의2 본문은 §13의2① 전체에 걸린다)", () => {
    const r = run({ acquiredBy: "corporation", houseCountAfter: 1 });
    expect(r.isSurcharged).toBe(false);
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("기간 경계: 2026-01-01·2027-12-31은 배제 / 2028-01-01은 4주택 12%", () => {
    expect(run({ balancePaymentDate: "2026-01-01" }).acquisitionTax).toBe(5_000_000);
    expect(run({ balancePaymentDate: "2027-12-31" }).acquisitionTax).toBe(5_000_000);
    const after = run({ balancePaymentDate: "2028-01-01" });
    expect(after.isSurcharged).toBe(true);
    expect(after.acquisitionTax).toBe(60_000_000);
  });

  it("[짝] 2025-12-31 취득은 구 §28의4②3호 — 주택 수에서만 빠져 4주택째가 3주택 → 비조정 8%", () => {
    const r = run({
      balancePaymentDate: "2025-12-31",
      houseCountInput: {
        houses: [
          { id: "h1", standardValue: 500_000_000, type: "apartment", acquisitionDate: "2018-01-01", isMetropolitan: false },
          { id: "h2", standardValue: 500_000_000, type: "apartment", acquisitionDate: "2019-01-01", isMetropolitan: false },
          { id: "h3", standardValue: 500_000_000, type: "apartment", acquisitionDate: "2020-01-01", isMetropolitan: false },
        ],
        rights: [],
        offices: [],
        pendingAcquisition: {
          isMetropolitan: false,
          acquisitionValue: 500_000_000,
          areaSqm: 84,
          isHansiBenefitUnsoldApt: true,
        },
      } as AcquisitionTaxInput["houseCountInput"],
    });
    expect(r.appliedRate).toBe(0.08);
    expect(r.acquisitionTax).toBe(40_000_000);
  });

  it("요건 미충족: 85㎡ 초과 / 6억 초과 / 수도권 → 중과 유지(4주택 12%)", () => {
    expect(run({ areaSqm: 85.01 }).acquisitionTax).toBe(60_000_000);
    expect(run({ reportedPrice: 600_000_001 }).isSurcharged).toBe(true);
    expect(run({ isMetropolitanRegion: true }).isSurcharged).toBe(true);
  });

  it("경계: 85㎡·6억 정확히는 배제", () => {
    const r = run({ areaSqm: 85, reportedPrice: 600_000_000 });
    expect(r.isSurcharged).toBe(false);
    expect(r.acquisitionTax).toBe(6_000_000);
  });

  it("면적·수도권 여부를 모르면 적용하지 않는다 + 경고", () => {
    const noArea = run({ areaSqm: undefined });
    expect(noArea.isSurcharged).toBe(true);
    expect(noArea.warnings.join(" ")).toContain("전용면적");
    const noMetro = run({ isMetropolitanRegion: undefined });
    expect(noMetro.isSurcharged).toBe(true);
    expect(noMetro.warnings.join(" ")).toContain("수도권");
  });

  it("증여(§13의2② 무상)에는 적용하지 않는다 — 17호는 유상승계취득 한정", () => {
    const r = run({
      acquisitionCause: "gift",
      reportedPrice: 0,
      marketValue: 500_000_000,
      isRegulatedArea: true,
      houseCountAfter: 2,
    });
    expect(r.isSurcharged).toBe(true);
    expect(r.appliedRate).toBe(0.12);
  });

  it("[짝] 토글을 켜지 않으면 4주택 12%", () => {
    expect(run({ isHansiBenefitUnsoldApt: false }).acquisitionTax).toBe(60_000_000);
  });
});

describe("§28의4⑥1호바목 — 보유 중인 17호 미분양 아파트는 주택 수에서 제외", () => {
  const base = (unsoldAcqDate: string) =>
    calculateHouseCount({
      houses: [
        { id: "h1", standardValue: 500_000_000, type: "apartment", acquisitionDate: "2018-01-01", isMetropolitan: false },
        { id: "u1", standardValue: 400_000_000, type: "apartment", acquisitionDate: unsoldAcqDate, isMetropolitan: false, isHansiBenefitUnsoldApt: true },
      ],
      rights: [],
      offices: [],
      referenceDate: "2027-06-01",
    });

  it("2026-03-01·2027-12-31 취득분은 제외", () => {
    for (const d of ["2026-03-01", "2027-12-31"]) {
      const r = base(d);
      const ex = r.excludedDetails.find((e) => e.assetId === "u1");
      expect(ex?.legalBasis).toContain("§28의4⑥1호바목");
    }
  });

  it("[짝] 2028-01-01 취득분은 제외하지 않는다", () => {
    const r = base("2028-01-01");
    expect(r.excludedDetails.find((e) => e.assetId === "u1")).toBeUndefined();
  });

  it("[짝] 2025-12-31 이전 취득분은 종전대로 §28의4② 3호 근거로 제외", () => {
    const r = base("2025-06-01");
    expect(r.excludedDetails.find((e) => e.assetId === "u1")?.legalBasis).toContain("§28의4② 3호");
  });
});
