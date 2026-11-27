/**
 * @vitest-environment jsdom
 *
 * 국외전출세 2027 U3 — 별지 제84호(세율구분별 열 표)·별지 제104호(신고 대상 종목 필터)·지방소득세 주석
 *
 * 근거: 계획 `stock-transfer-exit-tax-2027.ui.plan.md` §12 V-6·V-7·V-12 · UQ-7 (a) 재결정.
 * 엔진 시료: 코스닥 H1(양도차익 4억) + 국외주식 F1(9.2억, 2호 나목) → 구분 2개.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxHolding, ExitTaxInput } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { createEmptyExitTaxHolding } from "@/lib/stores/calc-wizard-stock-types";
import { selectHoldingReportTargets, hasHoldingReportTargets } from "@/lib/calc/exit-tax-holding-report-targets";

vi.mock("@/components/calc/results/useStockFilingHeaderMeta", () => ({
  useStockFilingHeaderMeta: () => ({}),
}));

import { ExitTaxFilingFormSection } from "@/components/calc/results/ExitTaxFilingFormSection";
import { ExitTaxHoldingReportSection } from "@/components/calc/results/ExitTaxHoldingReportSection";

afterEach(cleanup);

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const h1: ExitTaxHolding = {
  id: "h1", stockName: "H1", marketType: "kosdaq", shareCount: 10_000, acquisitionDate: utc(2015, 1, 1),
  perShareAcquisitionPrice: 10_000, departureDayValuationMode: "market_price", departureDayMarketPrice: 50_000,
};
const f1: ExitTaxHolding = {
  id: "f1", stockName: "F1", marketType: "foreign_stock", isListedForeignCorp: true, shareCount: 1_000,
  acquisitionDate: utc(2018, 1, 1), perShareAcquisitionPrice: 480_000,
  departureDayValuationMode: "market_price", departureDayMarketPrice: 1_400_000,
};
/** 5억 이하 → 제외(foreign_total_le_500m) */
const f2: ExitTaxHolding = { ...f1, id: "f2", stockName: "F2", shareCount: 10, perShareAcquisitionPrice: 100, departureDayMarketPrice: 200 };
const base = (holdings: ExitTaxHolding[], over: Partial<ExitTaxInput> = {}): ExitTaxInput => ({
  marketType: "exit_tax", yearsResidentLast10: 10, departureDate: utc(2027, 1, 1), isMajorShareholder: true,
  holdings, deferralRequested: false, deferralReason: "none", foreignTaxExclusionReason: "none",
  hasFiledHoldingsReport: true, reenteredWithin5Years: false, ...over,
});
const form = (id: string, name: string) => ({ ...createEmptyExitTaxHolding(), id, stockName: name, shareCount: "10" });
const txt = (id: string) => screen.getByTestId(id).textContent;

describe("BT 별지 제84호 — 세율구분별 열 표(구분 ≥2)", () => {
  const result = calculateExitTax(
    base([h1, f1], {
      hasFiledHoldingsReport: false, totalFaceValue: 1_000_000,
      basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 },
    }),
  );

  it("BT-1 열: 합계·국내분 소계·구분 2열·국외분 소계 / ③ 코드 1-94·2-94", () => {
    render(<ExitTaxFilingFormSection result={result} departureDate="2027-01-01" />);
    for (const k of ["total", "domestic", "clause1", "clause2b", "foreign"]) screen.getByTestId(`col-head-${k}`);
    expect(screen.queryByTestId("col-head-clause2a")).toBeNull();
    expect(txt("row-3-rate-code-clause1")).toBe("1-94");
    expect(txt("row-3-rate-code-clause2b")).toBe("2-94");
  });

  it("BT-2 ④⑦⑧⑩ 구분별 값 = 엔진 bucketDetails, 합계 열 = 결과 필드", () => {
    render(<ExitTaxFilingFormSection result={result} departureDate="2027-01-01" />);
    expect(txt("row-4-transfer-income-clause1")).toBe("400,000,000");
    expect(txt("row-4-transfer-income-clause2b")).toBe("920,000,000");
    expect(txt("row-4-transfer-income-total")).toBe("1,320,000,000");
    expect(txt("row-7-basic-deduction-clause1")).toBe("2,500,000");
    expect(txt("row-7-basic-deduction-clause2b")).toBe("0");
    expect(txt("row-8-tax-base-clause1")).toBe("397,500,000");
    expect(txt("row-8-tax-base-total")).toBe("1,317,500,000");
    expect(txt("row-10-calculated-tax-clause1")).toBe("84,375,000");
    expect(txt("row-10-calculated-tax-clause2b")).toBe("184,000,000");
    expect(txt("row-10-calculated-tax-total")).toBe("268,375,000");
  });

  it("BT-3 ⑨ 세율 — 1호 25%(누진공제), 2호 나목 20%", () => {
    render(<ExitTaxFilingFormSection result={result} departureDate="2027-01-01" />);
    expect(txt("row-9-rate-clause1")).toBe("25% (누진공제 15,000,000)");
    expect(txt("row-9-rate-clause2b")).toBe("20%");
  });

  it("BT-4 소계 열 = 구분 값의 합 / 자기일관성 ⑩ 합계 = 구분 ⑩ 합", () => {
    render(<ExitTaxFilingFormSection result={result} departureDate="2027-01-01" />);
    expect(txt("row-10-calculated-tax-domestic")).toBe("84,375,000");
    expect(txt("row-10-calculated-tax-foreign")).toBe("184,000,000");
    const n = (id: string) => Number(txt(id)!.replace(/,/g, ""));
    expect(n("row-10-calculated-tax-clause1") + n("row-10-calculated-tax-clause2b")).toBe(n("row-10-calculated-tax-total"));
    expect(n("row-7-basic-deduction-clause1") + n("row-7-basic-deduction-clause2b")).toBe(n("row-7-basic-deduction-total"));
  });

  it("BT-5 ⑯ 기장불성실 등(보유현황 미신고 가산세 20,000)·⑱ 납부할 세액 = 결과 finalTax", () => {
    render(<ExitTaxFilingFormSection result={result} departureDate="2027-01-01" />);
    expect(txt("row-16-penalty-bookkeeping-total")).toBe("20,000");
    expect(txt("row-18-payable-total")).toBe("268,395,000");
    expect(result.finalTax).toBe(268_395_000);
    expect(screen.queryByTestId("row-12-foreign-tax-credit")).toBeNull(); // 값 없는 공제 행은 만들지 않는다
  });

  it("BT-6 F1 — 2호 포함이면 지방소득세 주석이 표 직독 주값 + 참고값 + 확인 필요", () => {
    render(<ExitTaxFilingFormSection result={result} departureDate="2027-01-01" />);
    const note = txt("exit-local-tax-note")!;
    expect(note).toContain("29,937,500");
    expect(note).toContain("26,837,500");
    expect(note).toContain("확인 필요");
  });

  it("BT-7 귀속연도 = 출국일 연도", () => {
    render(<ExitTaxFilingFormSection result={result} departureDate="2027-01-01" />);
    expect(screen.getByText(/2027 년 귀속/)).toBeTruthy();
  });
});

describe("LT F1 — 25행 표(구분 1개) 지방소득세 주석", () => {
  it("LT-1 2호 단일 구분 → 표 직독 주석 + 참고값 + 확인 필요", () => {
    const r = calculateExitTax(base([f1]));
    expect(r.bucketDetails).toHaveLength(1);
    render(<ExitTaxFilingFormSection result={r} departureDate="2027-01-01" />);
    const note = txt("exit-local-tax-note")!;
    expect(note).toContain("21,437,500");
    expect(note).toContain("18,350,000");
    expect(note).toContain("확인 필요");
    expect(screen.queryByText(/지방소득세: 산출세액 × 10%, 10원 미만 절사/)).toBeNull();
  });

  it("LT-2 1호만(2026 경로와 같은 구조) → 종전 주석 그대로, 2호 주석 없음", () => {
    const r = calculateExitTax(base([h1], { departureDate: utc(2026, 6, 1) }));
    render(<ExitTaxFilingFormSection result={r} departureDate="2026-06-01" />);
    expect(screen.getByText("* 지방소득세: 산출세액 × 10%, 10원 미만 절사 (지방세법 §103의3).")).toBeTruthy();
    expect(screen.queryByTestId("exit-local-tax-note")).toBeNull();
  });
});

describe("HR 별지 제104호 — 신고 대상 종목 필터", () => {
  const mixed = calculateExitTax(base([h1, f2]));
  const holdings = [form("h1", "H1"), form("f2", "F2")];

  it("HR-1 엔진 판정 — f2 제외(5억 이하)", () => {
    expect(mixed.holdingDetails.find((d) => d.id === "f2")?.scope).toBe("excluded");
    expect(selectHoldingReportTargets(holdings, mixed.holdingDetails).map((h) => h.id)).toEqual(["h1"]);
  });

  it("HR-2 서식 행에서 제외 종목이 빠진다", () => {
    render(<ExitTaxHoldingReportSection holdings={holdings} departureDate="2027-01-01" holdingDetails={mixed.holdingDetails} />);
    const tbody = screen.getByTestId("table-data-tbody");
    expect(within(tbody).getByText("H1")).toBeTruthy();
    expect(within(tbody).queryByText("F2")).toBeNull();
    expect(screen.getByTestId("exit-tax-holding-report-toggle").textContent).toContain("1건");
  });

  it("HR-3 전부 제외 → 서식 대신 안내 · availableIds 조건 false", () => {
    const only = calculateExitTax(base([f2]));
    const hs = [form("f2", "F2")];
    expect(hasHoldingReportTargets(hs, only.holdingDetails)).toBe(false);
    render(<ExitTaxHoldingReportSection holdings={hs} departureDate="2027-01-01" holdingDetails={only.holdingDetails} />);
    expect(screen.getByTestId("exit-tax-holding-report-none")).toBeTruthy();
    expect(screen.queryByTestId("exit-tax-holding-report-toggle")).toBeNull();
  });

  it("HR-4 2026 이전 출국 국내 종목만(scope 없음 포함) — 행·가용 여부 불변", () => {
    const r = calculateExitTax(base([h1], { departureDate: utc(2026, 6, 1) }));
    const hs = [form("h1", "H1")];
    expect(selectHoldingReportTargets(hs, r.holdingDetails)).toBe(hs);
    expect(selectHoldingReportTargets(hs, undefined)).toBe(hs);
    expect(selectHoldingReportTargets(hs, [])).toBe(hs);
    expect(hasHoldingReportTargets(hs, undefined)).toBe(true);
  });

  it("HR-5 종목 미입력 — 종전처럼 빈 서식(가용)", () => {
    expect(hasHoldingReportTargets([], undefined)).toBe(true);
    render(<ExitTaxHoldingReportSection holdings={[]} departureDate="" />);
    expect(screen.getByTestId("exit-tax-holding-report-toggle").textContent).toContain("0건");
  });

  it("HR-6 제외 종목은 제84호 합계에도 없다(400,000,000만)", () => {
    expect(mixed.totalTransferGain).toBe(400_000_000);
  });
});
