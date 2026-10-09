/**
 * D1-3 결과 4뷰 — 토지·건물 취득원인 혼합 시 「취득 원인」·「세율 기산일」 표시 (2026-10-09, 표시 전용 · 세액 불변)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §10.2 T-1 · UI 설계 §8
 *
 * 4뷰가 같은 정본(`summarizeSplitGain.mixedCause` · `splitCauseLabel` · `splitRateBasisNote`)을 읽는지 뷰마다 따로 잠근다
 * (memory 「양도세 결과뷰는 4개」). 각 뷰에 부정형 짝을 둔다 — 원인이 같거나(매매·매매) echo가 없는 구 이력이면
 * 종전 화면 그대로여야 한다.
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
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { SplitGainResult, SplitPartResult } from "@/lib/tax-engine/types/transfer-split-gain.types";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const D = (s: string) => new Date(s);
/** 건물 2018-03-02 매매 + 토지 2025-02-01 상속(피상속인 2000) · 2주택 · 2026-06-30 양도 */
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
    landAcquisitionDate: D("2025-02-01"),
    landAcquisitionCause: "inheritance",
    landDecedentAcquisitionDate: D("2000-01-01"),
    ...o,
  });
const run = (o: Partial<TransferTaxInput> = {}) => calculateTransferTax(input(o), makeMockRates());
const MIXED = run();
const SAME = run({ landAcquisitionCause: undefined, landDecedentAcquisitionDate: undefined });
/**
 * 원인 혼합이지만 건물(2025-03-01 취득)분 차손 → 파트 세율 게이트(결손)로 자산 단위 세율(건물 기산 단기) —
 * 파트 세율 기산일은 계산에 쓰이지 않았다. (2018 건물의 차손은 과세 양도차익이 0으로 잡혀 파트 판정을 거친다 — 게이트 아님)
 */
const FALLBACK = run({ acquisitionDate: D("2025-03-01"), buildingAcquisitionPrice: 600_000_000 });

const ECHO_KEYS = [
  "acquisitionCause",
  "acquisitionDate",
  "rateBasisAcquisitionDate",
  "rateBasisRule",
  "appliedRateBasisDate",
] as const;
/** 구 이력 — 파트 echo 5필드가 없는 결과 스냅샷 */
function legacy(r: TransferTaxResult): TransferTaxResult {
  const strip = (p: SplitPartResult) => {
    const c = { ...p } as Record<string, unknown>;
    for (const k of ECHO_KEYS) delete c[k];
    return c as unknown as SplitPartResult;
  };
  const sd = r.splitDetail as SplitGainResult;
  return { ...r, splitDetail: { ...sd, land: strip(sd.land), building: strip(sd.building) } };
}

const FORM = {
  transferDate: "2026-06-30",
  contractTotalPrice: "1200000000",
  assets: [
    {
      acquisitionDate: "2018-03-02",
      // 폼에 남은 다른 토지일 — 신고서 토지 열이 폼이 아니라 엔진 echo를 읽는지 가른다
      landAcquisitionDate: "2024-01-01",
      residencePeriodMonthsAsset: "0",
    },
  ],
} as unknown as TransferFormData;

describe("① 단건 결과 카드 — SplitGainDetailSection", () => {
  const card = (r: TransferTaxResult) => render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);

  it("원인 혼합 → 「취득 원인」 상속·매매 + 「세율 기산일」 적용값(주택 max) + 규칙 문구", () => {
    card(MIXED);
    expect(screen.getByTestId("split-card-cause-land").textContent).toBe("상속");
    expect(screen.getByTestId("split-card-cause-building").textContent).toBe("매매");
    const land = screen.getByTestId("split-card-rate-basis-land").textContent!;
    expect(land).toContain("2018-03-02");
    expect(land).toContain("피상속인 취득일 2000-01-01(소득세법 §104②1호)보다 주택 취득일이 늦어");
    expect(screen.getByTestId("split-card-rate-basis-building").textContent).toContain("2018-03-02");
    expect(screen.getByText("보유연수 (장기보유특별공제)")).toBeTruthy();
  });

  it("원인 혼합 + 자산 단위 세율(건물 차손) → 원인 행은 있고 세율 기산일 행은 없다", () => {
    expect(FALLBACK.splitDetail!.building.gain).toBeLessThan(0);
    expect(FALLBACK.splitDetail!.partRateBasisApplied).toBe(false);
    card(FALLBACK);
    expect(screen.getByTestId("split-card-cause-land").textContent).toBe("상속");
    expect(screen.queryByTestId("split-card-rate-basis-land")).toBeNull();
  });

  it.each([
    ["원인 같음(매매·매매)", SAME],
    ["구 이력(echo 없음)", legacy(MIXED)],
  ])("%s → 행 없음 · 보유연수 라벨 종전", (_, r) => {
    card(r);
    expect(screen.queryByTestId("split-card-cause-land")).toBeNull();
    expect(screen.queryByTestId("split-card-rate-basis-land")).toBeNull();
    expect(screen.getByText("보유연수")).toBeTruthy();
  });
});

describe("② 상세명세서 — 산출세액 ※ 한 줄 · 취득가액 파트 태그", () => {
  const items = (r: TransferTaxResult) => buildStatementItems(r, FORM, undefined, undefined, 1_200_000_000);
  const textOf = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

  // 명세서 화면은 일자 그룹을 렌더하지 않는다(`DetailedStatementConfig.ts` STATEMENT_GROUPS) — 세율이 있는 산출세액 행의 ※ 주석에 단다.
  it("원인 혼합 → 산출세액 ※에 파트별 원인·취득일·세율 기산일", () => {
    const f = items(MIXED).get("calculatedTax")!.note!;
    expect(f).toContain("토지 상속 2025-02-01 · 세율 기산일 2018-03-02");
    expect(f).toContain("건물 매매 2018-03-02 · 세율 기산일 2018-03-02 (취득일 — 소득세법 §104② 본문)");
  });
  it("원인 혼합 + 자산 단위 세율 → ※에 원인·취득일만(세율 기산일 없음)", () => {
    const f = items(FALLBACK).get("calculatedTax")!.note!;
    expect(f).toContain("토지 상속 2025-02-01");
    expect(f).not.toContain("세율 기산일");
  });
  it("원인 혼합 → 취득가액 파트 태그가 입력 화면 어휘 「토지(상속개시일 평가액)」", () => {
    const f = textOf(items(MIXED).get("acquisitionPrice")!.formula);
    expect(f).toContain("토지(상속개시일 평가액) 300,000,000");
    expect(f).toContain("건물(실거래가) 400,000,000");
  });
  it("자산 전체 상속(토지·건물 같은 원인) → 파트 태그 종전 「토지(실거래가)」 — 원인 혼합일 때만 어휘를 바꾼다", () => {
    // 토지 취득일 = 건물 취득일(같은 상속개시일). 날짜가 다르면 D2 Y8(overlay 부재 + 건물 상속 + 분리 입력)이 던진다 — 계획서 §12 D2-Q5.
    const r = run({
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: D("2000-01-01"),
      landAcquisitionDate: D("2018-03-02"),
      landAcquisitionCause: undefined,
      landDecedentAcquisitionDate: undefined,
    });
    expect(r.splitDetail!.land.acquisitionCause).toBe("inheritance");
    expect(textOf(items(r).get("acquisitionPrice")!.formula)).toContain("토지(실거래가) 300,000,000");
  });
  it.each([
    ["원인 같음", SAME],
    ["구 이력", legacy(MIXED)],
  ])("%s → 종전 문구", (_, r) => {
    // 원인 행 자체가 붙지 않는다 — ※는 종전 값(shortTermNote) 그대로
    expect(items(r).get("calculatedTax")!.note).toBe(r.shortTermNote);
    expect(textOf(items(r).get("acquisitionPrice")!.formula)).toContain("토지(실거래가) 300,000,000");
  });
});

describe("③ 신고서 split-2col — 토지 취득일 = echo · 세율 기산일 각주", () => {
  const acqRow = (r: TransferTaxResult) => {
    expect(deriveColumns(r).mode).toBe("split-2col");
    return buildRows(r, "split-2col", FORM, undefined, 1_200_000_000).find((x) => x.values.building === "2018-03-02")!;
  };

  it("원인 혼합 → 토지 열은 엔진이 쓴 상속개시일(폼에 남은 2024-01-01이 아니다)", () => {
    expect(acqRow(MIXED).values.land).toBe("2025-02-01");
  });
  it("원인 같음·구 이력 → 종전대로 폼(이월과세 증여자 취득일 override가 토지 열에 이어지는 종전 동작 보존)", () => {
    expect(acqRow(SAME).values.land).toBe("2024-01-01");
    expect(acqRow(legacy(MIXED)).values.land).toBe("2024-01-01");
  });
  it("원인 혼합 + 자산 단위 세율 → 각주는 원인만", () => {
    const r = FALLBACK;
    const row = buildRows(r, "split-2col", FORM, undefined, 1_200_000_000).find((x) => x.values.land === "2025-02-01")!;
    expect(row.roseNotes!.land).toBe("상속");
    expect(row.roseNotes!.building).toBe("매매");
  });
  it("원인 혼합 → 취득일 칸 각주(원인 · 세율 판정 기산일) / 같음·구 이력 → 각주 없음", () => {
    const notes = acqRow(MIXED).roseNotes!;
    expect(notes.land).toContain("상속 · 세율 판정 기산일 2018-03-02");
    expect(notes.building).toContain("매매 · 세율 판정 기산일 2018-03-02");
    expect(acqRow(SAME).roseNotes?.land).toBeUndefined();
    expect(acqRow(legacy(MIXED)).roseNotes?.land).toBeUndefined();
  });
});

describe("④ PDF 분리 내역 — 화면과 같은 행", () => {
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
  const row = (t: string[], label: string) => {
    const i = t.indexOf(label);
    return i >= 0 ? [t[i + 1], t[i + 2]] : undefined;
  };

  it("원인 혼합 → 취득 원인·세율 기산일 행 + 규칙 문구", () => {
    const t = tokens(MIXED);
    expect(row(t, "취득 원인")).toEqual(["상속", "매매"]);
    expect(row(t, "세율 기산일 (소득세법 §104②)")).toEqual(["2018-03-02", "2018-03-02"]);
    expect(t.some((x) => x.startsWith("토지 세율 기산일: 피상속인 취득일 2000-01-01"))).toBe(true);
  });
  it("원인 혼합 + 자산 단위 세율 → 원인 행만", () => {
    const t = tokens(FALLBACK);
    expect(row(t, "취득 원인")).toEqual(["상속", "매매"]);
    expect(t).not.toContain("세율 기산일 (소득세법 §104②)");
    expect(t.some((x) => x.includes("세율 기산일:"))).toBe(false);
  });
  it.each([
    ["원인 같음", SAME],
    ["구 이력", legacy(MIXED)],
  ])("%s → 행 없음", (_, r) => {
    const t = tokens(r);
    expect(t).not.toContain("취득 원인");
    expect(t).not.toContain("세율 기산일 (소득세법 §104②)");
  });
});

describe("다건 — 건별 splitDetail에도 echo가 흐른다(카드는 같은 SplitGainDetailSection)", () => {
  it("합산 엔진 properties[].splitDetail → 카드에 원인 행", () => {
    const agg = calculateTransferTaxAggregate(
      {
        taxYear: 2026,
        properties: [{ ...input(), propertyId: "p1", propertyLabel: "건1" }],
        annualBasicDeductionUsed: 0,
      } as unknown as AggregateTransferInput,
      makeMockRates(),
    );
    const sd = agg.properties[0].splitDetail!;
    expect(sd.land.acquisitionCause).toBe("inheritance");
    expect(sd.land.appliedRateBasisDate).toBe("2018-03-02");
    render(<SplitGainDetailSection splitDetail={sd} assetKind="housing" />);
    expect(screen.getByTestId("split-card-cause-land").textContent).toBe("상속");
  });
});
