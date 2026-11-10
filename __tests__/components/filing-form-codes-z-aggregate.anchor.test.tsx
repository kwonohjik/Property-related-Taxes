/**
 * anchor — 다건·일괄(집계) 신고서 표·PDF의 ③ 1-92 · ⑯ 장특 코드 · ㉑ 감면종류·감면율 · ㉒ 소득세 감면세액 (2단계 N #3081 남은 것, 그룹 Z)
 *
 * 정본: 「소득세법 시행규칙」 [별지 제84호서식] 작성방법 국내자산 6.(1-92) · [부표 1] 작성방법 12.(⑯) · 16.(㉑) · 농특세 납부계산서 ㉒
 * (코드 매핑은 단건과 같은 단일 소스 `filing-form-codes.ts`를 재사용 — 원문 대조는 #3081).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { deriveColumns } from "@/components/calc/results/transfer/FilingFormTableColumns";
import { FILING_CODE_ROW_LABEL } from "@/components/calc/results/transfer/FilingFormTableRowDefs";
import { buildFilingCodePdfRows } from "@/components/calc/results/transfer/filing-head-pdf-rows";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const D = (s: string) => new Date(s);
const rates = makeMockRates();
const textOf = (n: unknown): string => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join(" ");
  return textOf((n as { props?: { children?: unknown } }).props?.children);
};

const R98 = {
  type: "unsold_98", isNationalScale98: true, isOutsideSeoul98: true, isUnsoldConfirmed98: true,
  isNotRentalHousing98: true, isFirstBuyerNoOccupancy98: true, rentedFor5Years98: true,
};
const R985 = {
  type: "unsold_98_5", contractDate985: D("2010-06-15"), priceReductionRatePct985: 15,
  isNonCapitalUnsoldAtCutoff985: true, isFirstContract985: true, isNotOccupiedAtContract985: true, isNotRecontract985: true,
  standardPriceAtAcquisition985: 200_000_000, standardPriceAt5Years985: 300_000_000, standardPriceAtTransfer985: 400_000_000,
};
const R986 = {
  type: "unsold_98_6", hoType986: "seller_rented", stdPriceSumAtBase986: 550_000_000, floorAreaSqm986: 84.5,
  isUnsoldAfterCompletion986: true, isFirstContract986: true, isNotOccupiedAfterCompletion986: true, isNotRecontract986: true,
  sellerRented2Years986: true, standardPriceAtAcquisition986: 200_000_000, standardPriceAt5Years986: 300_000_000, standardPriceAtTransfer986: 400_000_000,
};

const house = (id: string, red: unknown[], acq: string, tr: string) =>
  ({
    ...baseTransferInput({
      transferPrice: 800_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D(acq), transferDate: D(tr),
      householdHousingCount: 2, isOneHousehold: false, reductions: red,
    } as never),
    propertyId: id, propertyLabel: id,
  }) as never;
const plain = (id: string, tr: string) =>
  ({
    ...baseTransferInput({
      propertyType: "land", transferPrice: 200_000_000, acquisitionPrice: 150_000_000, acquisitionDate: D("2005-01-01"),
      transferDate: D(tr), householdHousingCount: 0,
    } as never),
    propertyId: id, propertyLabel: id,
  }) as never;
const agg = (props: unknown[], year: number): Any =>
  calculateTransferTaxAggregate({ taxYear: year, annualBasicDeductionUsed: 0, properties: props } as never, rates);

const meta = (a: Any) => ({ properties: a.properties, aggregated: a });
const rowsOf = (a: Any) => {
  const adapted = aggregateToFilingResult(a);
  const aggregate = meta(a);
  const { mode } = deriveColumns(adapted, aggregate);
  return buildRows(adapted, mode, undefined, undefined, undefined, undefined, undefined, aggregate);
};
const cell = (a: Any, label: string, col: string) => rowsOf(a).find((r) => r.label === label)?.values[col as never];
const codePdf = (a: Any) => buildFilingCodePdfRows({ result: aggregateToFilingResult(a), aggregate: meta(a) });

describe("집계 ③·⑯ — §98 20% 자산 (단건과 같은 값)", () => {
  const single = calculateTransferTax(
    baseTransferInput({
      transferPrice: 800_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D("1996-06-15"), transferDate: D("2022-08-01"),
      householdHousingCount: 2, isOneHousehold: false, reductions: [R98],
    } as never),
    rates,
  ) as Any;
  const a = agg([house("H1", [R98], "1996-06-15", "2022-08-01"), plain("L1", "2022-08-01")], 2022);

  it("단건: ③ 1-92 · 장특 90,000,000(표1 30%)", () => {
    expect(single.specialRateBasis).toBe("unsold_98");
    expect(single.longTermHoldingDeduction).toBe(90_000_000);
  });
  it("집계 자산 열: ③ 1-92 · ⑯ 02 (자산 breakdown에 specialRateBasis echo)", () => {
    expect(a.properties[0].specialRateBasis).toBe("unsold_98");
    expect(cell(a, "세율구분 코드", "H1")).toBe("1-92");
    expect(cell(a, FILING_CODE_ROW_LABEL.lthdCode, "H1")).toBe("02");
  });
  it("대조군: 감면 없는 표는 ㉑·㉒ 행이 없고, §98 아닌 자산은 1-92가 아니다", () => {
    expect(rowsOf(a).some((r) => r.label === FILING_CODE_ROW_LABEL.reductionKind)).toBe(false);
    expect(rowsOf(a).some((r) => r.label === FILING_CODE_ROW_LABEL.ruralReductionBase)).toBe(false);
    expect(cell(a, "세율구분 코드", "L1")).not.toBe("1-92");
  });
  it("PDF 코드 행 = 화면 행", () => {
    const pdf = codePdf(a);
    expect(pdf.some((x) => x.label.startsWith("세율구분 코드") && x.value === "1-92")).toBe(true);
    expect(pdf.some((x) => x.label.startsWith(FILING_CODE_ROW_LABEL.lthdCode) && x.value === "02")).toBe(true);
  });
});

describe("집계 ㉑ — §98의5 80% (농특세 비과세 → ㉒ 없음)", () => {
  const a = agg([house("H5", [R985], "2010-07-01", "2014-06-01"), plain("L1", "2014-06-01")], 2014);
  it("㉑ 수도권 외 미분양 (§98의5) 80%", () => {
    expect(a.properties[0].reductionType).toBe("unsold_98_5");
    expect(cell(a, FILING_CODE_ROW_LABEL.reductionKind, "H5")).toBe("수도권 외 미분양 (§98의5) 80%");
    expect(cell(a, FILING_CODE_ROW_LABEL.reductionKind, "L1") ?? null).toBeNull();
  });
  it("㉒: 농특세 비과세(§98의5)라 echo 없음 · 행 없음 · 농특세 0", () => {
    expect(a.ruralSurtax).toBe(0);
    expect(a.ruralSurtaxReductionBase).toBeUndefined();
    expect(rowsOf(a).some((r) => r.label === FILING_CODE_ROW_LABEL.ruralReductionBase)).toBe(false);
  });
});

describe("집계 ㉒ — §98의6 1호 5년 이내 50% (농특세 과세)", () => {
  const a = agg([house("H6", [R986], "2011-09-01", "2014-01-01"), plain("L1", "2014-01-01")], 2014);
  const single = calculateTransferTax(
    baseTransferInput({
      transferPrice: 800_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D("2011-09-01"), transferDate: D("2014-01-01"),
      householdHousingCount: 2, isOneHousehold: false, reductions: [R986],
    } as never),
    rates,
  ) as Any;
  it("㉒ echo × 20% = 집계 농특세, 행·PDF에 같은 값", () => {
    expect(a.ruralSurtax).toBeGreaterThan(0);
    expect(Math.floor(a.ruralSurtaxReductionBase * 0.2)).toBe(a.ruralSurtax);
    expect(cell(a, FILING_CODE_ROW_LABEL.ruralReductionBase, "total")).toBe(a.ruralSurtaxReductionBase);
    expect(codePdf(a).find((x) => x.label.startsWith(FILING_CODE_ROW_LABEL.ruralReductionBase))?.value).toBe(a.ruralSurtaxReductionBase.toLocaleString("ko-KR"));
    expect(cell(a, FILING_CODE_ROW_LABEL.reductionKind, "H6")).toBe("준공후미분양 (§98의6) 50%");
  });
  it("자산 1건이면 단건과 같은 ㉒·농특세 (단건 경로 대조)", () => {
    const one = agg([house("H6", [R986], "2011-09-01", "2014-01-01")], 2014);
    expect(single.ruralSurtax).toBe(one.ruralSurtax);
    expect(one.ruralSurtaxReductionBase).toBe(single.reductionAmount);
  });
  it("다건 PDF(합산 신고서 양식)에도 ㉑·㉒·③ 행이 실린다", () => {
    const text = textOf(TransferMultiSection({ r: a as never, codeRows: codePdf(a) }));
    expect(text).toContain(FILING_CODE_ROW_LABEL.ruralReductionBase);
    expect(text).toContain("준공후미분양 (§98의6) 50%");
    expect(text).toContain("세율구분 코드");
  });
  it("codeRows 없으면(옛 저장 결과) 코드 행은 그려지지 않는다", () => {
    expect(textOf(TransferMultiSection({ r: a as never }))).not.toContain("부표1 ㉑");
  });
});
