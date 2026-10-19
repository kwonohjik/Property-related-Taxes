/**
 * 구주택 멸실·신축 통산 — 자산 단위 세율로 후퇴한 경우 결과 4뷰(카드·상세명세서·신고서·PDF)가 통산 구간·「환산」 표기를 내지 않는다.
 *
 * 게이트는 `splitRebuildShown`(partRateBasisApplied === true) 한 곳이다 — 통산 echo(`rateHoldingAggregation`)가 있어도 4뷰는 같은 판정을 읽는다.
 * 입력은 엔진 결과를 그대로 먹인다(손으로 만든 echo 아님). 시드·세액은 엔진 anchor `appurtenant-land-rebuild-fallback.anchor.test.ts`와 같다.
 */
import { describe, it, expect, afterEach } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { splitRebuildShown } from "@/lib/tax-engine/transfer-tax-split-display";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSplitSection } from "@/lib/pdf/ResultPdfTransferSections";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);
const D = (s: string) => new Date(s);
const rates = makeMockRates();
const REBUILD = { startMode: "since_land" as const, footprintUnchanged: true, demolitionDate: D("2023-05-31") };

const seed = (o: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_000_000_000, transferDate: D("2025-09-01"), acquisitionPrice: 450_000_000, acquisitionCause: "purchase",
    acquisitionDate: D("2025-01-01"), isOneHousehold: false, householdHousingCount: 2, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 300_000_000,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 250_000_000, landAcquisitionDate: D("2022-01-01"), landRebuildPriorHouse: REBUILD, ...o,
  });
const LOSS: Partial<TransferTaxInput> = { buildingAcqMode: "estimated", standardPricePerSqmAtAcquisition: 1_000_000, acquisitionArea: 200, standardPriceAtAcquisition: 500_000_000, buildingStandardPriceAtAcquisition: 300_000_000 };

const FORM = { transferDate: "2025-09-01", contractTotalPrice: "1000000000", assets: [{ acquisitionDate: "2025-01-01", landAcquisitionDate: "2022-01-01", residencePeriodMonthsAsset: "0" }] } as unknown as TransferFormData;

function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collect((el.props as { children?: unknown } | undefined)?.children, out);
  return out;
}

/** 4뷰가 낸 모든 문구를 하나로 모은다 — 통산 문구가 어느 뷰에서도 새지 않는지 본다. */
function allViewText(r: TransferTaxResult): { card: string; statement: string; filing: string; pdf: string } {
  render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
  const card = document.body.textContent ?? "";
  // 뷰가 실제로 그려졌는지 — 빈 화면이면 아래 부재 단언이 공허하다
  expect(card).toContain("토지/건물 분리 양도차익");
  cleanup();
  const statement = buildStatementItems(r, FORM, undefined, undefined, 1_000_000_000).get("calculatedTax")?.note ?? "";
  const filing = JSON.stringify(buildRows(r, "split-2col", FORM, undefined, 1_000_000_000).map((x) => x.roseNotes ?? null));
  const pdf = collect(TransferSplitSection({ r: r as unknown as Record<string, unknown> })).join("|");
  return { card, statement, filing, pdf };
}
const MARKERS = ["구주택 부수토지 기간", "세율 판정 보유기간", "환산 기산일", "환산 20", "통산"];

describe("정상 적용(대조군) — 4뷰에 통산 구간·환산이 나온다", () => {
  it("파트별 세율 판정을 거치면 4뷰 모두 구간 줄이 있다", () => {
    const r = calculateTransferTax(seed(), rates);
    expect(splitRebuildShown(r.splitDetail!)).toBe(true);
    const v = allViewText(r);
    expect(v.card).toContain("구주택 부수토지 기간 2022-01-01~2023-05-31");
    expect(v.statement).toContain("세율 판정용 환산 기산일");
    expect(v.filing).toContain("25개월");
    expect(v.pdf).toContain("세율 판정용 환산 기산일");
  });
});

describe("건물 파트 결손 후퇴 — echo가 있어도 4뷰에 구간 줄·환산이 없다", () => {
  const r = calculateTransferTax(seed(LOSS), rates);
  it("전제: 통산 echo 있음 · 플래그 false · 게이트 닫힘 · 카드 testid 없음", () => {
    expect(r.splitDetail?.land.rateHoldingAggregation).toBeDefined();
    expect(r.splitDetail?.partRateBasisApplied).toBe(false);
    expect(splitRebuildShown(r.splitDetail!)).toBe(false);
    render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
    expect(screen.queryByTestId("split-card-rate-holding")).toBeNull();
  });
  it("카드·상세명세서·신고서·PDF 어디에도 통산 문구·환산 표기가 없다", () => {
    const v = allViewText(r);
    for (const [view, text] of Object.entries(v)) for (const m of MARKERS) expect(text, `${view} ← ${m}`).not.toContain(m);
  });
  it("대체 고지는 엔진 warnings에 1건만 — 결과 화면의 경고 영역이 읽는 값", () => {
    expect((r.warnings ?? []).filter((w) => w.includes("반영되지 않았습니다"))).toHaveLength(1);
  });
});

describe("다건 최종 플래그 — 자산 breakdown의 splitDetail이 후퇴를 반영하면 4뷰가 같은 게이트를 읽는다", () => {
  it("다건 결손 후퇴 자산: 최종 플래그 false → 카드·PDF·명세서 모두 구간·환산 없음", () => {
    const item = { ...seed(LOSS), propertyId: "a", propertyLabel: "a" } as unknown as TransferTaxItemInput;
    const a = calculateTransferTaxAggregate({ taxYear: 2025, properties: [item], annualBasicDeductionUsed: 0 }, rates);
    const sd = (a.properties[0] as unknown as { splitDetail: NonNullable<TransferTaxResult["splitDetail"]> }).splitDetail;
    expect(sd.partRateBasisApplied).toBe(false);
    expect(sd.land.rateHoldingAggregation).toBeDefined();
    expect(splitRebuildShown(sd)).toBe(false);
    const r = { ...calculateTransferTax(seed(LOSS), rates), splitDetail: sd } as TransferTaxResult;
    const v = allViewText(r);
    for (const [view, text] of Object.entries(v)) for (const m of MARKERS) expect(text, `${view} ← ${m}`).not.toContain(m);
  });
});

describe("§155⑳ 장기임대 거주주택 특례 — 파트별 세율 판정을 거치지 않는 모델: echo가 있어도 4뷰에 구간 줄·환산이 없다", () => {
  const T = "2022-06-01";
  const yearsBefore = (y: number, m = 2): string => {
    const x = new Date(T);
    x.setUTCFullYear(x.getUTCFullYear() - y);
    x.setUTCMonth(x.getUTCMonth() - m);
    return x.toISOString().slice(0, 10);
  };
  const rental = {
    applyException: true, scenario: "A" as const,
    rentalUnits: [{ businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general" as const, rentalAcquisitionType: "purchase" as const, isApartment: false, region: "non-metro" as const, isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true }],
  };
  const r = calculateTransferTax(
    seed({
      transferPrice: 1_300_000_000, transferDate: D(T), acquisitionPrice: 300_000_000, landTransferPrice: 1_040_000_000, buildingTransferPrice: 260_000_000,
      landStandardPriceAtTransfer: 1_040_000_000, buildingStandardPriceAtTransfer: 260_000_000, landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 100_000_000,
      acquisitionDate: D(yearsBefore(5)), landAcquisitionDate: D(yearsBefore(20)), buildingFootprintArea: 60, acquisitionArea: 300, appurtenantLandZone: "non_urban",
      residencePeriodMonths: 24, isOneHousehold: true, householdHousingCount: 1, rentalHousingException: rental,
      landRebuildPriorHouse: { ...REBUILD, demolitionDate: D(yearsBefore(6)) },
    }),
    rates,
  );
  it("전제: §155⑳ 적용 · 통산 echo 있음 · 게이트 닫힘", () => {
    expect(r.rentalHousingExceptionDetail).toBeDefined();
    expect(r.splitDetail?.land.rateHoldingAggregation).toBeDefined();
    expect(splitRebuildShown(r.splitDetail!)).toBe(false);
  });
  it("카드·상세명세서·신고서·PDF 어디에도 통산 문구·환산 표기가 없다", () => {
    const v = allViewText(r);
    for (const [view, text] of Object.entries(v)) for (const m of MARKERS) expect(text, `${view} ← ${m}`).not.toContain(m);
  });
});
