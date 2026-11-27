/**
 * §15① 세율특례 취득의 부가세(지방교육세·농어촌특별세) anchor
 *
 * 결함(2026-11-27 교재 「증여나 상속으로 주택을 취득한 경우 총 부담세율」 대조로 발견):
 *   상속 1세대1주택(§15①2호 가목) 표 = 취득세 0.8% + 지방교육세 0.16% + 농특세 비과세 = 0.96%.
 *   엔진은 85㎡ 이하 0.80%(교육세 0원), 85㎡ 초과 1.00%(교육세 0원 + 농특세 0.2%)였다.
 *
 * 원인: §15① 특례세율(표준세율 − 2%)이 부가세 산정의 「표준세율」 자리에 그대로 넘어갔다.
 *
 * 법령(KoreanLaw MCP 2026-11-27 조회):
 * - 지방세법 §151①1호 본문: 「제11조제1항제1호부터 제7호까지와 제12조의 세율 … 에서 1천분의 20을 뺀
 *   세율을 적용하여 산출한 금액(제11조제1항제8호의 경우에는 해당 세율에 100분의 50을 곱한 세율을
 *   적용하여 산출한 금액)의 100분의 20」 — 기준은 §11·§12 세율이지 §15① 특례세율이 아니다.
 * - 농어촌특별세법 §4 10호의4: 「「지방세법」 제15조제1항제1호부터 제3호까지의 규정에 따른 취득세」는
 *   농어촌특별세를 부과하지 아니한다 — 환매·상속(1가구1주택·감면농지)·적격합병.
 */
import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

const BASE = {
  acquiredBy: "individual",
  reportedPrice: 0,
  balancePaymentDate: "2026-04-01",
  isRegulatedArea: false,
  houseCountAfter: 1,
} as const;

function run(overrides: Partial<AcquisitionTaxInput>) {
  return calcAcquisitionTax({ ...BASE, ...overrides } as AcquisitionTaxInput);
}

describe("§15①2호 가목 상속 1가구1주택 — 교재 총 부담세율 0.96%", () => {
  const inherit = (areaSqm: number) =>
    run({
      propertyType: "housing",
      acquisitionCause: "inheritance",
      standardValue: 500_000_000,
      areaSqm,
      specialRateType: "inheritance_one_house",
      isOneHouseHousehold: true,
    });

  it("85㎡ 이하: 취득세 0.8% + 지방교육세 (2.8%−2%)×20% = 0.16% + 농특세 0 = 4,800,000", () => {
    const r = inherit(84);
    expect(r.acquisitionTax).toBe(4_000_000);
    expect(r.localEducationTax).toBe(800_000);
    expect(r.ruralSpecialTax).toBe(0);
    expect(r.totalTax).toBe(4_800_000);
  });

  it("85㎡ 초과: 농특세법 §4 10호의4 비과세 → 면적과 무관하게 4,800,000", () => {
    const r = inherit(100);
    expect(r.acquisitionTax).toBe(4_000_000);
    expect(r.localEducationTax).toBe(800_000);
    expect(r.ruralSpecialTax).toBe(0);
    expect(r.totalTax).toBe(4_800_000);
  });

  it("[짝] 특례 미적용 상속 85㎡ 초과는 농특세 0.2% 그대로 (비과세가 일반 상속으로 새지 않는다)", () => {
    const r = run({
      propertyType: "housing",
      acquisitionCause: "inheritance",
      standardValue: 500_000_000,
      areaSqm: 100,
    });
    expect(r.acquisitionTax).toBe(14_000_000);
    expect(r.localEducationTax).toBe(800_000);
    expect(r.ruralSpecialTax).toBe(1_000_000);
    expect(r.totalTax).toBe(15_800_000);
  });
});

describe("§15①1호 환매 — 농특세 비과세 + 교육세는 §11 세율 기준", () => {
  it("유상거래 주택 5억 100㎡: 취득세 1%×50% · 교육세 1%×50%×20% = 500,000 · 농특세 0", () => {
    const r = run({
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      areaSqm: 100,
      specialRateType: "redemption",
    });
    expect(r.acquisitionTax).toBe(2_500_000);
    // §151①1호 본문 괄호: §11①8호 세율(1%) × 50% × 20% — 특례로 줄어든 본세 기준이 아니다
    expect(r.localEducationTax).toBe(500_000);
    expect(r.ruralSpecialTax).toBe(0);
    expect(r.totalTax).toBe(3_000_000);
  });

  it("토지 5억: 취득세 (4%−2%) · 교육세 (4%−2%)×20% = 2,000,000 · 농특세 0", () => {
    const r = run({
      propertyType: "land",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      specialRateType: "redemption",
    });
    expect(r.acquisitionTax).toBe(10_000_000);
    expect(r.localEducationTax).toBe(2_000_000);
    expect(r.ruralSpecialTax).toBe(0);
    expect(r.totalTax).toBe(12_000_000);
  });
});

describe("§15①3호 적격합병 — 농특세 비과세 + 교육세는 §11 세율 기준", () => {
  it("법인 토지 5억: 취득세 2% · 교육세 2,000,000 · 농특세 0", () => {
    const r = run({
      propertyType: "land",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      acquiredBy: "corporation",
      specialRateType: "corp_merger",
    });
    expect(r.acquisitionTax).toBe(10_000_000);
    expect(r.localEducationTax).toBe(2_000_000);
    expect(r.ruralSpecialTax).toBe(0);
  });
});

describe("§15①4호~7호 — 교육세는 §11 세율 기준 · 농특세 §4 10호의4 범위 밖", () => {
  it("4호 공유물분할 토지 5억: 교육세 (4%−2%)×20% = 2,000,000 · 농특세는 이 비과세 대상이 아니다", () => {
    const r = run({
      propertyType: "land",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      specialRateType: "co_ownership_split",
    });
    expect(r.acquisitionTax).toBe(10_000_000);
    expect(r.localEducationTax).toBe(2_000_000);
    expect(r.ruralSpecialTax).toBeGreaterThan(0);
  });

  it("5호 건축물 이전(원시 2.8%) 건물 5억: 취득세 0.8% · 교육세 (2.8%−2%)×20% = 800,000", () => {
    const r = run({
      propertyType: "building",
      acquisitionCause: "new_construction",
      constructionCost: 500_000_000,
      usageApprovalDate: "2026-04-01",
      specialRateType: "building_relocation",
    });
    expect(r.acquisitionTax).toBe(4_000_000);
    expect(r.localEducationTax).toBe(800_000);
    expect(r.ruralSpecialTax).toBeGreaterThan(0);
  });

  it("6호 재산분할(무상 3.5%) 주택 5억: 취득세 1.5% · 교육세 (3.5%−2%)×20% = 1,500,000", () => {
    const r = run({
      propertyType: "housing",
      acquisitionCause: "gift",
      marketValue: 500_000_000,
      standardValue: 500_000_000,
      areaSqm: 84,
      specialRateType: "divorce_division",
    });
    expect(r.acquisitionTax).toBe(7_500_000);
    expect(r.localEducationTax).toBe(1_500_000);
  });

  it("7호 입목(유상 4%) 5억: 취득세 2% · 교육세 (4%−2%)×20% = 2,000,000", () => {
    const r = run({
      propertyType: "standing_tree",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      specialRateType: "timber",
    });
    expect(r.acquisitionTax).toBe(10_000_000);
    expect(r.localEducationTax).toBe(2_000_000);
    expect(r.ruralSpecialTax).toBeGreaterThan(0);
  });
});
