/**
 * UI anchor: 기본통칙 95-0…1 적용 토지분 — 결과 카드(SplitGainDetailSection)·신고서 split-2col이 엔진 echo를 그대로 읽는다.
 *
 * ① 일반 경로 — 토지 13년 · 건물 4년 · 거주 2년(20억 · 2022): 토지분 = max(표1 26%, 표2 24%) = 26% — 카드가 파트별 공제율과 통칙 고지를 낸다
 * ② §155⑳ 경로 — 종전에는 이 경로가 파트 echo를 채우지 않아 카드가 0%로 표시했다. 지금은 파트별 공제율·공제액을 읽는다.
 * ③ 통칙이 끼지 않는 시료(토지 = 건물 연수)에는 고지가 없다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);
const rates = makeMockRates();
const D = (s: string) => new Date(s);
const NOTE = '[data-testid="split-card-appurtenant-lthd-note"]';

const rentalA: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"),
      rentalCategory: "long_general" as const, rentalAcquisitionType: "purchase" as const, isApartment: false,
      region: "non-metro" as const, isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
    },
  ],
};
function house(over: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing", transferPrice: 2_000_000_000, acquisitionPrice: 300_000_000,
    landTransferPrice: 1_600_000_000, buildingTransferPrice: 400_000_000,
    landStandardPriceAtTransfer: 1_600_000_000, buildingStandardPriceAtTransfer: 400_000_000,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 100_000_000,
    acquisitionDate: D("2018-03-01"), landAcquisitionDate: D("2008-07-01"), transferDate: D("2022-06-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 60, acquisitionArea: 300, appurtenantLandZone: "non_urban" as const,
    residencePeriodMonths: 24, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    ...over,
  } as Partial<TransferTaxInput>);
}
const cells = (c: HTMLElement) => Array.from(c.querySelectorAll("span")).map((e) => e.textContent ?? "");

describe("결과 카드 — 파트별 장특공제율·고지", () => {
  it("§155⑳ A2(건물 4년 · 토지 13년): 카드가 파트별 공제율 26% · 24%와 통칙 고지를 읽는다 (종전 0%)", () => {
    const r = calculateTransferTax(house({ rentalHousingException: rentalA }), rates);
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    const { container } = render(createElement(SplitGainDetailSection, { splitDetail: r.splitDetail! }));
    const t = cells(container);
    const i = t.indexOf("장특공제율");
    expect(t.slice(i + 1, i + 3)).toEqual(["26%", "24%"]);
    const note = container.querySelector(NOTE)!;
    expect(note.textContent).toContain("기본통칙 95-0…1");
    expect(note.textContent).toContain("표1(토지 전체 보유기간 13년 → 26%)");
    expect(note.textContent).toContain("표2(주택 부수토지로서의 보유기간 4년 → 24%)");
    expect(note.textContent).not.toMatch(/유리|불리|절세|절감/);
  });

  it("일반 경로(특례 off) — 같은 파트 값과 같은 고지", () => {
    const r = calculateTransferTax(house({}), rates);
    const { container } = render(createElement(SplitGainDetailSection, { splitDetail: r.splitDetail! }));
    const t = cells(container);
    const i = t.indexOf("장특공제율");
    expect(t.slice(i + 1, i + 3)).toEqual(["26%", "24%"]);
    expect(container.querySelector(NOTE)).not.toBeNull();
  });

  it("통칙이 끼지 않는 시료(토지 = 건물 같은 날 취득) — 고지 없음", () => {
    const r = calculateTransferTax(house({ landAcquisitionDate: D("2018-03-01"), rentalHousingException: rentalA }), rates);
    const { container } = render(createElement(SplitGainDetailSection, { splitDetail: r.splitDetail! }));
    expect(container.querySelector(NOTE)).toBeNull();
  });
});

describe("신고서 split-2col — §155⑳ 결과도 파트별 보유분·거주분을 엔진 echo로 읽는다", () => {
  it("토지 보유 26%(전부 보유분) · 거주 0 / 건물 보유 16% · 거주 8%", () => {
    const r = calculateTransferTax(house({ rentalHousingException: rentalA }), rates);
    const form = { transferDate: "2022-06-01", contractTotalPrice: "2000000000", assets: [{ residencePeriodMonthsAsset: "24" }] } as unknown as TransferFormData;
    const rows = buildRows(r, deriveColumns(r).mode, form, undefined, 2_000_000_000);
    const g = (l: string, c: string) => Number(rows.find((x) => x.label.trim() === l)?.values[c] ?? NaN);
    const landDed = Math.floor((1_400_000_000 * 26) / 100); // 364,000,000 — 표1 전부 보유분
    const bldHold = Math.floor((300_000_000 * 16) / 100); // 48,000,000
    const bldRes = Math.floor((300_000_000 * 8) / 100); // 24,000,000
    expect(g("보유 기간분 장특", "land")).toBe(landDed);
    expect(g("거주 기간분 장특", "land")).toBe(0);
    expect(g("보유 기간분 장특", "building")).toBe(bldHold);
    expect(g("거주 기간분 장특", "building")).toBe(bldRes);
    expect(g("보유 기간분 장특", "total") + g("거주 기간분 장특", "total")).toBe(r.longTermHoldingDeduction);
  });
});
