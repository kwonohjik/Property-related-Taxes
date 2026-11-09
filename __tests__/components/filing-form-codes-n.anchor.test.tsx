/**
 * anchor — 신고서 코드 칸(Q-27 (a)) · 함께 양도 결과 PDF ⑲ (US-51·US-67 ⑲, 2단계 그룹 N)
 *
 * 정본: 「소득세법 시행규칙」 [별지 제84호서식] <개정 2026. 3. 20.> 작성방법 국내자산 6.(1-92) ·
 * [별지 제84호서식 부표 1] <개정 2024. 3. 22.> 작성방법 12.(장특 코드 01~06) — KoreanLaw get_annexes bylSeq 008400 원문 대조.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { FILING_CODE_ROW_LABEL } from "@/components/calc/results/transfer/FilingFormTableRowDefs";
import {
  LTHD_FILING_CODE,
  SPECIAL_RATE_BASIS_CODE,
  resolveLthdFilingCode,
  resolveFilingReductionKind,
  resolveRuralSurtaxReductionBase,
} from "@/components/calc/results/transfer/filing-form-codes";
import { resolveFilingRateCode } from "@/components/calc/results/transfer/filing-rate-code";
import { buildSingleFilingHeadPdfRows } from "@/components/calc/results/transfer/filing-head-pdf-rows";
import { sumReductionEligibleIncome } from "@/components/calc/results/transfer/reduction-eligible-income";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";

const D = (s: string) => new Date(s);
const textOf = (n: unknown): string => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join(" ");
  return textOf((n as { props?: { children?: unknown } }).props?.children);
};

const R98 = {
  type: "unsold_98" as const, isNationalScale98: true, isOutsideSeoul98: true, isUnsoldConfirmed98: true,
  isNotRentalHousing98: true, isFirstBuyerNoOccupancy98: true, rentedFor5Years98: true,
};
const calc98 = (reductions: unknown[]) =>
  calculateTransferTax(
    baseTransferInput({
      transferPrice: 800_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D("1996-06-15"), transferDate: D("2022-08-01"),
      householdHousingCount: 2, reductions,
    } as never),
    makeMockRates(),
  );
const R983 = {
  type: "unsold_98_3" as const, residencyType983: "resident" as const, houseType983: "purchased" as const, contractDate983: D("2009-06-15"),
  downPaymentCompletedDate983: D("2009-06-15"), isOutsideSeoulNotDesignated983: true, isOverconcentration983: false, isUnsoldConfirmed983: true,
  isFirstContract983: true, isNotOccupiedAtContract983: true, isNotRecontract983: true,
  standardPriceAtAcquisition983: 200_000_000, standardPriceAt5Years983: 300_000_000, standardPriceAtTransfer983: 400_000_000,
};
const R986 = {
  type: "unsold_98_6" as const, hoType986: "seller_rented" as const, stdPriceSumAtBase986: 550_000_000, floorAreaSqm986: 84.5,
  isUnsoldAfterCompletion986: true, isFirstContract986: true, isNotOccupiedAfterCompletion986: true, isNotRecontract986: true,
  sellerRented2Years986: true, standardPriceAtAcquisition986: 200_000_000, standardPriceAt5Years986: 300_000_000, standardPriceAtTransfer986: 400_000_000,
};
const calcShort = (reductions: unknown[], acq: string, tr: string) =>
  calculateTransferTax(
    baseTransferInput({ transferPrice: 800_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D(acq), transferDate: D(tr), householdHousingCount: 2, reductions } as never),
    makeMockRates(),
  );
const row = (r: ReturnType<typeof calc98>, label: string) => buildRows(r, "single").find((x) => x.label === label)?.values.total;

describe("코드 매핑 표 — 별지84호 작성방법 원문", () => {
  it("③ §98 = 1-92 (국내자산 6.)", () => expect(SPECIAL_RATE_BASIS_CODE).toEqual({ unsold_98: "1-92" }));
  it("부표1 ⑯ 장특 코드 01~06 (작성방법 12.)", () =>
    expect(LTHD_FILING_CODE).toEqual({
      one_house_table2: "01", general_table1: "02", excluded: "03", rental_97_3: "04", rental_97_4: "05", unsold_98_2: "06",
    }));
});

describe("US-51 ③ 세율구분 코드 — §98 20% 특례는 1-92", () => {
  it("수정 전 「-」(rateClause undefined) → 수정 후 1-92. 세액 41,500,000·총부담 45,650,000 불변", () => {
    const r = calc98([R98]);
    expect(r.appliedRate).toBe(0.2);
    expect(r.rateClause).toBeUndefined();
    expect(r.specialRateBasis).toBe("unsold_98");
    expect(resolveFilingRateCode({ rateClause: r.rateClause, assetKind: "housing", transferDate: "2022-08-01" })).toBeUndefined(); // 수정 전 동작(표지 미전달)
    expect(row(r, "세율구분 코드")).toBe("1-92");
    expect(r.calculatedTax).toBe(41_500_000);
    expect(r.totalTax).toBe(45_650_000);
  });
  it("대조: §98 불적격이면 1-10(일반세율)", () => {
    const r = calc98([{ ...R98, isOutsideSeoul98: false }]);
    expect(r.specialRateBasis).toBeUndefined();
    expect(row(r, "세율구분 코드")).toBe("1-10");
  });
});

describe("부표1 ⑯ 장기보유특별공제 코드 · ㉑ 감면종류·감면율 · ㉒ 소득세 감면세액", () => {
  it("§98 적격 26년 보유(표1 30%) → ⑯ 02, 감면 없음이면 ㉑·㉒ 행 없음", () => {
    const r = calc98([R98]);
    expect(r.longTermHoldingDeduction).toBe(90_000_000);
    expect(resolveLthdFilingCode(r)).toBe("02");
    expect(row(r, FILING_CODE_ROW_LABEL.lthdCode)).toBe("02");
    expect(buildRows(r, "single").some((x) => x.label === FILING_CODE_ROW_LABEL.reductionKind)).toBe(false);
    expect(buildRows(r, "single").some((x) => x.label === FILING_CODE_ROW_LABEL.ruralReductionBase)).toBe(false);
  });
  it("§98의3 5년 내(보유 3년 미만) → ⑯ 03(배제), ㉑ 서울 외 미분양(§98의3) 100%, 농특세 비과세라 ㉒ 없음", () => {
    const r = calcShort([R983], "2023-01-15", "2024-07-15");
    expect(r.reductionAmount).toBe(93_110_000);
    expect(resolveLthdFilingCode(r)).toBe("03");
    expect(resolveFilingReductionKind(r)).toBe("서울 외 미분양 (§98의3) 100%");
    expect(resolveRuralSurtaxReductionBase(r)).toBeUndefined();
  });
  it("§98의6 5년 내 50% → ㉑ 준공후미분양(§98의6) 50%, ㉒ 46,555,000(×20% = 농특세 9,311,000)", () => {
    const r = calcShort([R986], "2011-09-01", "2014-01-01");
    expect(r.reductionAmount).toBe(46_555_000);
    expect(r.ruralSurtax).toBe(9_311_000);
    expect(resolveRuralSurtaxReductionBase(r)).toBe(46_555_000);
    expect(row(r, FILING_CODE_ROW_LABEL.ruralReductionBase)).toBe(46_555_000);
    expect(resolveFilingReductionKind(r)).toBe("준공후미분양 (§98의6) 50%");
  });
});

describe("화면 신고서 표 = 결과 PDF (같은 라벨·같은 값)", () => {
  it("§98의6 — 코드 행이 PDF 신고서 양식에 같은 값으로 실린다", () => {
    const r = calcShort([R986], "2011-09-01", "2014-01-01");
    const codeRows = buildSingleFilingHeadPdfRows({ result: r }, "code");
    const byLabel = (l: string) => codeRows.find((x) => x.label === l)?.value;
    expect(byLabel(FILING_CODE_ROW_LABEL.reductionKind)).toBe(String(row(r, FILING_CODE_ROW_LABEL.reductionKind)));
    expect(byLabel(FILING_CODE_ROW_LABEL.ruralReductionBase)).toBe("46,555,000");
    expect(byLabel("세율구분 코드")).toBe(String(row(r, "세율구분 코드")));
    const text = textOf(TransferSection({ r: r as never, codeRows }));
    expect(text).toContain("감면종류·감면율 (부표1 ㉑) 준공후미분양 (§98의6) 50%");
    expect(text).toContain("소득세 감면세액 (농어촌특별세 납부계산서 ㉒) 46,555,000");
    expect(text).toContain("세율구분 코드");
  });
  it("§98 적격 — PDF에도 1-92", () => {
    const r = calc98([R98]);
    const codeRows = buildSingleFilingHeadPdfRows({ result: r }, "code");
    expect(codeRows.find((x) => x.label === "세율구분 코드")?.value).toBe("1-92");
    expect(textOf(TransferSection({ r: r as never, codeRows }))).toContain("세율구분 코드 1-92");
  });
});

describe("US-67 ⑲ 함께 양도 PDF — 자산별 ⑲ 합을 어댑터 echo로 (리뷰 probe B3: 화면 368,000,000 vs PDF 0)", () => {
  const props = [
    { reductionType: "unsold_98_3", income: 400_000_000, reducibleIncome: 368_000_000 },
    { reductionType: undefined, income: 50_000_000, reducibleIncome: undefined },
  ];
  it("sumReductionEligibleIncome = Σ 자산별 ⑲ (원 단위)", () => {
    expect(sumReductionEligibleIncome(props as never)).toBe(368_000_000);
  });
  it("PDF: echo가 있으면 ⑲ = 368,000,000, 없으면(수정 전 어댑터) 0", () => {
    const base = { transferGain: 450_000_000, taxableGain: 450_000_000, longTermHoldingDeduction: 0, taxBase: 1, determinedTax: 1 };
    const before = textOf(TransferSection({ r: base as never }));
    const after = textOf(TransferSection({ r: { ...base, aggregateReductionEligibleIncome: sumReductionEligibleIncome(props as never) } as never }));
    expect(before).toMatch(/세액감면대상금액\s+0\b/);
    expect(after).toContain("세액감면대상금액 368,000,000");
  });
});
