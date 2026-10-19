/**
 * P2 C 결과 4뷰 — 장기보유특별공제 기산일 ≠ 세율 기산일 (2026-10-19, 표시 전용 · 세액 불변)
 *
 * 주택 토지 파트의 세율은 `max(법정 기산일, 건물 취득일)`(주택부수토지로서의 보유기간)로 판정하고 `SplitPartResult.appliedRateBasisDate`에 싣는다.
 * 장기보유특별공제는 파트 `acquisitionDate`(적용: 증여자 취득일)부터 센다. 4뷰가 둘을 한 문구로 합치면(「1995-03-01부터 보유기간·세율 기산」)
 * 엔진 세율 판정(2015-06-01)과 화면이 어긋난다 — 각각 엔진 echo를 읽는지 뷰마다 잠근다. 세율 기산일은 엔진이 파트별로 판정했을 때만(D1-3 규약).
 */
import { describe, it, expect, afterEach } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSplitSection } from "@/lib/pdf/ResultPdfTransferSections";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const GIFT = D("2023-03-01");
const ct = (donor: string, price: number, valuation: number) => ({
  giftRegistryDate: GIFT, donorAcquisitionDate: D(donor), donorAcquisitionPrice: price, useEstimatedAcquisition: false,
  giftTaxAmount: 0, giftDateValuation: valuation, donorRelation: "lineal" as const, exclusionDeclared: {},
});
/** 양쪽 적용 시료 — 증여세 0 · 증여자 취득가액 100만(토지·건물) · 평가 토지 2.4억 / 건물 6.6억 · 양도 12억 */
function inputC(transfer: string, landDonor: string, buildingDonor: string): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing", transferPrice: 1_200_000_000, transferDate: D(transfer), acquisitionPrice: 0, acquisitionDate: GIFT,
    isOneHousehold: false, householdHousingCount: 2, landAcquisitionDate: GIFT, landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
    landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000,
    landAcquisitionPrice: 240_000_000, buildingAcquisitionPrice: 660_000_000, acquisitionCause: "carryover_gift", landAcquisitionCause: "carryover_gift",
    isSeparateAcquisition: false,
    carryoverGiftEvent: { giftRegistryDate: GIFT, giftTaxCalculated: 0, giftTaxBase: 900_000_000 },
    landCarryoverTaxation: ct(landDonor, 1_000_000, 240_000_000),
    buildingCarryoverTaxation: ct(buildingDonor, 1_000_000, 660_000_000),
  });
}
const rates = makeMockRates();
const run = (t: string, l: string, b: string) => calculateTransferTax(inputC(t, l, b), rates);

/** 건물 증여자 취득일 3종 — 일반(양도 2년 이상) · 2년 미만 · 1년 미만 · 정확히 2년 경계 */
const NORMAL = run("2025-06-30", "1995-03-01", "2015-06-01");
const SHORT_LT2 = run("2025-06-30", "1995-03-01", "2024-01-10");
const SHORT_LT1 = run("2025-06-30", "1995-03-01", "2024-09-10");
const SHORT_EQ2 = run("2025-06-30", "1995-03-01", "2023-06-30");

const FORM = { transferDate: "2025-06-30", contractTotalPrice: "1200000000", assets: [{ acquisitionDate: "", residencePeriodMonthsAsset: "0" }] } as unknown as TransferFormData;
const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collect((el.props as { children?: unknown } | undefined)?.children, out);
  return out;
}
const pdf = (r: TransferTaxResult) => collect(TransferSplitSection({ r: r as unknown as Record<string, unknown> })).join("\n");
const stmt = (r: TransferTaxResult) => buildStatementItems(r, FORM, undefined, undefined, 1_200_000_000);
const rows = (r: TransferTaxResult) => buildRows(r, "split-2col", FORM, undefined, 1_200_000_000);

describe("엔진 전제 (표시 전 확인)", () => {
  it("양쪽 적용 · 토지 장특 기산 = 증여자 취득일 1995-03-01, 세율 기산 = 건물 취득일 2015-06-01", () => {
    const sd = NORMAL.splitDetail!;
    expect(sd.partRateBasisApplied).toBe(true);
    expect(sd.land.carryover?.judgment).toBe("applied");
    expect(sd.building.carryover?.judgment).toBe("applied");
    expect(sd.land.acquisitionDate).toBe("1995-03-01");
    expect(sd.land.appliedRateBasisDate).toBe("2015-06-01");
    expect(sd.building.acquisitionDate).toBe("2015-06-01");
    expect(sd.building.appliedRateBasisDate).toBe("2015-06-01");
  });
});

describe("① 카드", () => {
  const card = (r: TransferTaxResult) => render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
  it("장기보유특별공제 기산일(1995-03-01)과 세율 기산일(2015-06-01)을 따로 낸다", () => {
    card(NORMAL);
    expect(screen.getByTestId("split-card-lthd-start-land").textContent).toContain("장기보유특별공제 기산일");
    expect(screen.getByTestId("split-card-lthd-start-land").textContent).toContain("1995-03-01");
    expect(screen.getByTestId("split-card-rate-basis-land").textContent).toContain("세율 기산일");
    expect(screen.getByTestId("split-card-rate-basis-land").textContent).toContain("2015-06-01");
    expect(screen.getByTestId("split-card-rate-basis-land").textContent).toContain("주택부수토지로서의 보유기간");
    expect(screen.getByTestId("split-card-rate-basis-building").textContent).toContain("2015-06-01");
  });
  it("엔진이 파트별로 세율을 판정하지 않았으면(partRateBasisApplied 아님) 세율 기산일을 내지 않는다", () => {
    const sd = { ...(NORMAL.splitDetail as SplitGainResult), partRateBasisApplied: false };
    render(<SplitGainDetailSection splitDetail={sd} assetKind="housing" />);
    expect(screen.getByTestId("split-card-lthd-start-land").textContent).toContain("1995-03-01");
    expect(screen.queryByTestId("split-card-rate-basis-land")).toBeNull();
    expect(screen.queryByTestId("split-card-rate-basis-building")).toBeNull();
  });
});

describe("② 상세명세서", () => {
  it("산출세액 ※: 장기보유특별공제 기산일과 세율 기산일이 분리되어 있다", () => {
    const note = stmt(NORMAL).get("calculatedTax")!.note!;
    expect(note).toContain("장기보유특별공제 기산일: 토지 증여자 취득일 1995-03-01 / 건물 증여자 취득일 2015-06-01");
    expect(note).toContain("세율 기산일: 토지 2015-06-01");
    expect(note).not.toContain("보유기간·세율 기산");
  });
  it("보유기간 행은 장기보유특별공제 보유기간임을 밝힌다 · 취득가액 행 판정 각주도 둘을 가른다", () => {
    const hold = stmt(NORMAL).get("holdingPeriod")!;
    expect(text(hold.formula)).toContain("장기보유특별공제 기산일");
    expect(text(hold.formula)).toContain("세율 기산일과 다를 수 있습니다");
    expect(text(stmt(NORMAL).get("acquisitionDate")!.formula)).toContain("장기보유특별공제 기산일");
    expect(text(stmt(NORMAL).get("acquisitionPrice")!.formula)).toContain("장기보유특별공제 기산 증여자 취득일 1995-03-01 · 세율 기산 2015-06-01");
  });
  it("세율 미판정이면 세율 기산일 문구가 없다", () => {
    const r = { ...NORMAL, splitDetail: { ...(NORMAL.splitDetail as SplitGainResult), partRateBasisApplied: false } } as TransferTaxResult;
    const note = stmt(r).get("calculatedTax")!.note ?? "";
    expect(note).toContain("장기보유특별공제 기산일");
    expect(note).not.toContain("이월과세(§97의2①) 장기보유특별공제 기산일: 토지 증여자 취득일 1995-03-01 / 건물 증여자 취득일 2015-06-01 · 세율 기산일");
    expect(text(stmt(r).get("acquisitionPrice")!.formula)).not.toContain("세율 기산 2015-06-01");
  });
});

describe("③ 신고서", () => {
  it("취득일자 칸 = 장특 기산일, 각주에 세율 기산을 따로 · 보유기간 각주는 장특 보유기간", () => {
    const r = rows(NORMAL);
    const acq = r.find((x) => x.label === "취득일자" || x.label.startsWith("취득일"))!;
    expect(acq.values.land).toBe("1995-03-01");
    expect(acq.roseNotes!.land).toContain("장기보유특별공제 기산 증여자 취득일 1995-03-01");
    expect(acq.roseNotes!.land).toContain("세율 기산 2015-06-01");
    expect(acq.roseNotes!.land).not.toContain("보유기간·세율 기산");
    const hold = r.find((x) => x.label === "보유기간")!;
    expect(hold.roseNotes!.land).toContain("장기보유특별공제 보유기간");
    expect(String(hold.values.land)).toMatch(/^30년/);
  });
});

describe("④ PDF", () => {
  it("판정 행이 장특 기산과 세율 기산을 가른다", () => {
    const t = pdf(NORMAL);
    expect(t).toContain("토지 이월과세 적용 (증여자 기준) · 장기보유특별공제 기산 증여자 취득일 1995-03-01 · 세율 기산 2015-06-01");
    expect(t).not.toContain("보유기간·세율 기산");
  });
});

describe("단기 경계 — 건물 증여자 취득일이 양도일 2년 안쪽/경계: 표시 세율 기산일 = 엔진 appliedRateBasisDate, 세액은 엔진값 그대로", () => {
  it.each([
    ["2년 미만(2024-01-10)", SHORT_LT2, "2024-01-10", 591_480_000],
    ["1년 미만(2024-09-10)", SHORT_LT1, "2024-09-10", 690_060_000],
    ["정확히 2년(2023-06-30)", SHORT_EQ2, "2023-06-30", 378_096_000],
  ])("%s", (_, r, bldDonor, tax) => {
    const sd = r.splitDetail!;
    // 토지 장특 기산은 증여자 취득일 그대로, 세율 기산은 엔진 echo(= 건물 취득일로 끌어올린 값)
    expect(sd.land.acquisitionDate).toBe("1995-03-01");
    expect(sd.land.appliedRateBasisDate).toBe(bldDonor);
    expect(r.determinedTax).toBe(tax);
    render(<SplitGainDetailSection splitDetail={sd} assetKind="housing" />);
    expect(screen.getByTestId("split-card-rate-basis-land").textContent).toContain(bldDonor);
    expect(screen.getByTestId("split-card-lthd-start-land").textContent).toContain("1995-03-01");
    cleanup();
    expect(stmt(r).get("calculatedTax")!.note!).toContain(`세율 기산일: 토지 ${bldDonor}`);
    const acq = rows(r).find((x) => x.label === "취득일자" || x.label.startsWith("취득일"))!;
    expect(acq.roseNotes!.land).toContain(`세율 기산 ${bldDonor}`);
    expect(pdf(r)).toContain(`세율 기산 ${bldDonor}`);
  });
});
