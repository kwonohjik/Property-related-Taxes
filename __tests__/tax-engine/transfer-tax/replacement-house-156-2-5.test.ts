/**
 * 대체주택 비과세 특례 (§156의2⑤) — 사례 43 + 케이스 매트릭스 RH-1~6
 *
 * 설계: docs/02-design/features/transfer-replacement-house-156-2-5.engine.design.md
 * 엔진: transfer-tax-exemption.ts checkExemption() E-5 분기.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

// 사례 43 기준 대체주택 입력 빌더 (over = 입력 override, rh = replacementHouse override)
function rhInput(
  over: Partial<TransferTaxInput> = {},
  rh: Partial<NonNullable<TransferTaxInput["replacementHouse"]>> = {},
): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 320_000_000, // 대체주택 양도가 3.2억
    transferDate: new Date("2026-02-23"),
    acquisitionDate: new Date("2017-04-13"), // 대체주택 취득
    acquisitionPrice: 250_000_000,
    expenses: 20_000_000,
    isOneHousehold: true,
    householdHousingCount: 2, // 신축주택(완성) + 대체주택
    residencePeriodMonths: 106,
    replacementHouse: {
      businessApprovalDate: new Date("2015-05-16"),
      completionDate: new Date("2023-04-17"),
      replacementResidenceMonths: 106,
      willResideNewHouse: true,
      ...rh,
    },
    ...over,
  });
}

describe("대체주택 비과세 §156의2⑤ — 케이스 매트릭스 RH-1~6", () => {
  it("★ RH-1 사례 43 — 전액 비과세 (3.2억 < 12억): isExempt=true, 세액 0", () => {
    const r = calculateTransferTax(rhInput(), mockRates);
    expect(r.isExempt).toBe(true);
    expect(r.calculatedTax).toBe(0);
  });

  it("RH-2 12억 초과 (15억) — 부분과세(12억 안분): 대체주택 없을 때보다 세액 대폭↓·>0", () => {
    const withRh = calculateTransferTax(rhInput({ transferPrice: 1_500_000_000 }), mockRates);
    const withoutRh = calculateTransferTax(
      rhInput({ transferPrice: 1_500_000_000, replacementHouse: undefined }),
      mockRates,
    );
    expect(withRh.isExempt).toBe(false);
    expect(withRh.calculatedTax).toBeGreaterThan(0);
    // 12억 안분 과세분(양도차익×3/15)만 과세 → 전액 과세보다 대폭 낮음
    expect(withRh.calculatedTax).toBeLessThan(withoutRh.calculatedTax);
  });

  it("RH-3 ④ 기한 초과 (완성 2023.04.17 + 3년 후 2026.05 양도) — 요건 미충족 → 과세", () => {
    const r = calculateTransferTax(rhInput({ transferDate: new Date("2026-05-01") }), mockRates);
    expect(r.isExempt).toBe(false);
  });

  it("RH-4 ① 인가 전 취득 (대체주택 2015.01 < 인가 2015.05.16) — 요건 미충족 → 과세", () => {
    const r = calculateTransferTax(rhInput({ acquisitionDate: new Date("2015-01-01") }), mockRates);
    expect(r.isExempt).toBe(false);
  });

  it("RH-5 ③ 신축주택 거주 자기선언 false — 요건 미충족 → 과세", () => {
    const r = calculateTransferTax(rhInput({}, { willResideNewHouse: false }), mockRates);
    expect(r.isExempt).toBe(false);
  });

  it("RH-6a 신법 3년 (완성 2020.06, 양도 2023.03 ≥ 2023.01.12) — 3년내 → 비과세", () => {
    const r = calculateTransferTax(
      rhInput({ transferPrice: 800_000_000, transferDate: new Date("2023-03-01") }, { completionDate: new Date("2020-06-01") }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("RH-6b 구법 2년 (완성 2020.06, 양도 2022.12 < 2023.01.12) — 2년 초과 → 과세", () => {
    const r = calculateTransferTax(
      rhInput({ transferPrice: 800_000_000, transferDate: new Date("2022-12-01") }, { completionDate: new Date("2020-06-01") }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });
});
