/**
 * anchor — 신고서 표 「보유 기간분 장특」·「거주 기간분 장특」이 §97의3 특례 적용 1세대1주택에서
 * 엔진 sub-step(임대기간 분 특례 공제는 보유분, 거주분은 그 밖의 양도차익 × 거주율)을 그대로 읽는다.
 * 종전: 총액 401,142,856을 표2 비율 40%/48%로 나눠 보유 334,285,714 · 거주 66,857,142.
 * 엔진 단위 고정: `__tests__/tax-engine/transfer/rental-97-lthd-step-formula.anchor.test.ts` LS-5.
 */
import { describe, it, expect } from "vitest";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(s);
const R973 = {
  type: "rental_97_3",
  registrationDate: D("2016-01-01"),
  rentalStartDate: D("2016-01-01"),
  isTaxRegistered: true,
  taxRegistrationDate: D("2016-01-01"),
  isNationalHousingScale: true,
  officialPriceAtStart: 400_000_000,
  region: "capital",
  isPrivateConstructionRental: false,
  rentalContinuesToTransfer: true,
  rentIncreaseViolated: false,
};

function result(residencePeriodMonths: number): TransferTaxResult {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 2_000_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: D("2006-01-01"),
      transferDate: D("2026-06-01"),
      residencePeriodMonths,
      standardPriceAtAcquisition: 300_000_000,
      standardPriceAtTransfer: 1_000_000_000,
      reductions: [R973],
    } as Any),
    makeMockRates(),
  );
}
const cell = (rows: { label: string; values: Record<string, unknown> }[], label: string) =>
  rows.find((r) => r.label === label)?.values.total ?? null;

describe("신고서 표 — §97의3 특례 × 표2 1세대1주택의 보유·거주 기간분", () => {
  it("FF-1 거주 2년 — 거주분 6,857,142 · 보유분 394,285,714 · 합 = 장특 총액", () => {
    const r = result(24);
    const rows = buildRows(r, "single", createDefaultTransferFormData());
    expect(cell(rows, "장기보유특별공제")).toBe(401_142_856);
    expect(cell(rows, " 보유 기간분 장특")).toBe(394_285_714);
    expect(cell(rows, " 거주 기간분 장특")).toBe(6_857_142);
  });

  it("FF-2 대조 — 특례 미적용(표2 80%)은 종전 표2 분해(각 240,000,000)", () => {
    const r = result(120);
    const rows = buildRows(r, "single", createDefaultTransferFormData());
    expect(cell(rows, " 보유 기간분 장특")).toBe(240_000_000);
    expect(cell(rows, " 거주 기간분 장특")).toBe(240_000_000);
  });
});
