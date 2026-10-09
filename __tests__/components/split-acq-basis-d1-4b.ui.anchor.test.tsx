/**
 * D1-4b 결과 4뷰 — 영 §163⑨ 단서 1호 「평가액 vs 영 §164④ 가액 → 채택」 표시 (2026-10-09, 표시 전용 · 세액 불변)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §11 · UI 설계 transfer-acq-cause-mixed-d1-4.ui.design.md §8
 *
 * 4뷰가 같은 정본(`splitAcqBasisView`·`summarizeSplitGain`)을 읽는지 뷰마다 따로 잠근다(memory 「양도세 결과뷰는 4개」).
 * 각 뷰에 부정형 짝을 둔다 — echo가 없는 구 이력은 종전 화면 그대로여야 한다. 입력은 **실제 엔진** 결과다(손으로 만든 echo 아님).
 */
import { describe, it, expect, afterEach } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate, type AggregateTransferInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSplitSection } from "@/lib/pdf/ResultPdfTransferSections";
type TransferFormDataLike = import("@/lib/stores/calc-wizard-store").TransferFormData;
import type { SplitGainResult, SplitPartResult } from "@/lib/tax-engine/types/transfer-split-gain.types";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const D = (s: string) => new Date(s);
/** 건물 2018-03-02 매매 + 토지 1988-05-01 상속(피상속인 1960) — 영 §163⑨ 단서 1호 구간 · ① 평가액 300,000,000 */
const input = (o: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_200_000_000,
    transferDate: D("2026-06-30"),
    acquisitionDate: D("2018-03-02"),
    acquisitionCause: "purchase",
    isOneHousehold: false,
    householdHousingCount: 2,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landTransferPrice: 700_000_000,
    buildingTransferPrice: 500_000_000,
    landStandardPriceAtTransfer: 700_000_000,
    buildingStandardPriceAtTransfer: 500_000_000,
    landAcquisitionPrice: 300_000_000,
    buildingAcquisitionPrice: 400_000_000,
    landAcquisitionDate: D("1988-05-01"),
    landAcquisitionCause: "inheritance",
    landDecedentAcquisitionDate: D("1960-01-01"),
    ...o,
  });
const run = (o: Partial<TransferTaxInput> = {}) => calculateTransferTax(input(o), makeMockRates());
/** ② 400,000,000 > ① → ② 채택 */
const SEC164 = run({ landSec164Value: 400_000_000 });
/** ② 16,000,000 < ① → ① 채택 */
const REPORTED = run({ landSec164Value: 16_000_000 });
/** 증여 · ② 채택 */
const GIFT = run({ landAcquisitionCause: "gift", landDecedentAcquisitionDate: undefined, landSec164Value: 400_000_000 });
/** 구 이력 — acquisitionBasis echo가 없는 결과 스냅샷 */
function legacy(r: TransferTaxResult): TransferTaxResult {
  const sd = r.splitDetail as SplitGainResult;
  const land = { ...sd.land } as Record<string, unknown>;
  delete land.acquisitionBasis;
  return { ...r, splitDetail: { ...sd, land: land as unknown as SplitPartResult } };
}

const FORM = {
  transferDate: "2026-06-30",
  contractTotalPrice: "1200000000",
  assets: [{ acquisitionDate: "2018-03-02", landAcquisitionDate: "1988-05-01", residencePeriodMonthsAsset: "0" }],
} as unknown as TransferFormDataLike;

describe("엔진 echo 전제", () => {
  it("② 채택 · ① 채택 · 증여 — echo가 {rule, reported, sec164, adopted}이고 취득가액은 채택값", () => {
    expect(SEC164.splitDetail!.land.acquisitionBasis).toEqual({ rule: "sec163_9_1", reported: 300_000_000, sec164: 400_000_000, adopted: "sec164" });
    expect(SEC164.splitDetail!.land.acquisitionPrice).toBe(400_000_000);
    expect(REPORTED.splitDetail!.land.acquisitionBasis!.adopted).toBe("reported");
    expect(REPORTED.splitDetail!.land.acquisitionPrice).toBe(300_000_000);
    expect(GIFT.splitDetail!.land.acquisitionBasis!.adopted).toBe("sec164");
  });
});

describe("① 단건 결과 카드 — 평가액 vs 영 §164④ 가액 → 채택", () => {
  const card = (r: TransferTaxResult) => render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);

  it("② 채택 → 두 값과 채택 이름 「영 §164④ 가액」 · 취득가액 칸은 채택값", () => {
    card(SEC164);
    expect(screen.getByTestId("split-card-acq-basis-reported").textContent).toBe("300,000,000");
    expect(screen.getByTestId("split-card-acq-basis-sec164").textContent).toBe("400,000,000");
    expect(screen.getByTestId("split-card-acq-basis-adopted").textContent).toBe("영 §164④ 가액");
    expect(screen.getByTestId("split-card-acq-land").textContent).toBe("400,000,000");
    expect(screen.getByTestId("split-card-acq-basis").textContent).toContain("소득세법 시행령 §163조 제9항 단서 1호");
  });
  it("① 채택 → 「상속개시일 평가액」 / 증여는 「증여 신고가액」", () => {
    card(REPORTED);
    expect(screen.getByTestId("split-card-acq-basis-adopted").textContent).toBe("상속개시일 평가액");
    cleanup();
    card(GIFT);
    expect(screen.getByTestId("split-card-acq-basis").textContent).toContain("증여 신고가액");
  });
  it("부정형 짝 — 구 이력(echo 없음)·비교 미적용(토지 2015 상속)은 비교 블록 없음", () => {
    card(legacy(SEC164));
    expect(screen.queryByTestId("split-card-acq-basis")).toBeNull();
    cleanup();
    card(run({ landAcquisitionDate: D("2015-03-10") }));
    expect(screen.queryByTestId("split-card-acq-basis")).toBeNull();
  });
});

describe("② 상세명세서 — 취득가액 파트 태그·산식", () => {
  const items = (r: TransferTaxResult) => buildStatementItems(r, FORM, undefined, undefined, 1_200_000_000);
  const textOf = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  it("② 채택 → 「토지(영 §164④ 가액) 400,000,000」 + 산식 한 줄", () => {
    const f = textOf(items(SEC164).get("acquisitionPrice")!.formula);
    expect(f).toContain("토지(영 §164④ 가액) 400,000,000");
    expect(f).toContain("토지 취득가액 = 많은 금액(상속개시일 평가액 300,000,000, 영 §164④ 가액 400,000,000) = 400,000,000");
    expect(f).not.toContain("토지(상속개시일 평가액)");
  });
  it("① 채택 → 「토지(상속개시일 평가액) 300,000,000」", () => {
    const f = textOf(items(REPORTED).get("acquisitionPrice")!.formula);
    expect(f).toContain("토지(상속개시일 평가액) 300,000,000");
    expect(f).toContain("= 300,000,000");
  });
  it("구 이력 → 산식 한 줄 없음", () => {
    expect(textOf(items(legacy(SEC164)).get("acquisitionPrice")!.formula)).not.toContain("많은 금액");
  });
});

describe("③ 신고서 split-2col — 취득가액 칸 각주", () => {
  const acqPriceRow = (r: TransferTaxResult) => {
    expect(deriveColumns(r).mode).toBe("split-2col");
    return buildRows(r, "split-2col", FORM, undefined, 1_200_000_000).find((x) => x.roseNotes && "land" in x.roseNotes && /많은 금액/.test(x.roseNotes.land ?? ""));
  };
  it("② 채택 → 토지 열 각주에 두 값과 채택(영 §163⑨ 단서 1호)", () => {
    const row = acqPriceRow(SEC164)!;
    expect(row.roseNotes!.land).toContain("많은 금액(상속개시일 평가액 300,000,000, 영 §164④ 가액 400,000,000) = 400,000,000");
    expect(row.values.land).toBe(400_000_000);
  });
  it("구 이력 → 각주 없음", () => {
    expect(acqPriceRow(legacy(SEC164))).toBeUndefined();
  });
});

describe("④ PDF 분리 내역", () => {
  function collect(node: unknown, out: string[] = []): string[] {
    if (node === null || node === undefined || typeof node === "boolean") return out;
    if (typeof node === "string" || typeof node === "number") {
      out.push(String(node));
      return out;
    }
    if (Array.isArray(node)) {
      for (const c of node) collect(c, out);
      return out;
    }
    const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
    if (typeof el.type === "function") {
      collect((el.type as (p: unknown) => unknown)(el.props), out);
      return out;
    }
    collect((el.props as { children?: unknown } | undefined)?.children, out);
    return out;
  }
  const tokens = (r: unknown) => collect(TransferSplitSection({ r: r as Record<string, unknown> }));
  it("② 채택 → 비교 문장 행 / 구 이력 → 없음", () => {
    expect(tokens(SEC164).some((x) => x.includes("토지 취득가액 = 많은 금액(상속개시일 평가액 300,000,000, 영 §164④ 가액 400,000,000) = 400,000,000"))).toBe(true);
    expect(tokens(legacy(SEC164)).some((x) => x.includes("많은 금액"))).toBe(false);
  });
});

describe("다건 — 건별 splitDetail에도 acquisitionBasis가 흐른다(카드는 같은 SplitGainDetailSection)", () => {
  it("합산 엔진 properties[].splitDetail → 카드에 비교 행", () => {
    const agg = calculateTransferTaxAggregate(
      {
        taxYear: 2026,
        properties: [{ ...input({ landSec164Value: 400_000_000 }), propertyId: "p1", propertyLabel: "건1" }],
        annualBasicDeductionUsed: 0,
      } as unknown as AggregateTransferInput,
      makeMockRates(),
    );
    const sd = agg.properties[0].splitDetail!;
    expect(sd.land.acquisitionBasis!.adopted).toBe("sec164");
    render(<SplitGainDetailSection splitDetail={sd} assetKind="housing" />);
    expect(screen.getByTestId("split-card-acq-basis-adopted").textContent).toBe("영 §164④ 가액");
  });
});
