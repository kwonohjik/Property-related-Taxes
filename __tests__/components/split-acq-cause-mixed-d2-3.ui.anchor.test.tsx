/**
 * D2-3 결과 4뷰 — 건물 상속·증여 + 토지 매매 표시 (2026-10-09, 표시 전용 · 세액 불변)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §12 (D2-Q1 — 토지 세율 기산 앵커 = 건물 취득일 = 상속개시일·증여일)
 *
 * 토지 파트 「세율 기산일」 보조 문구가 종전에는 D1 방향 문장(「주택 취득일이 늦어 주택 취득일부터」)이라, 건물 행의
 * 「피상속인 취득일 2000-01-01」과 나란히 놓이면 주택 취득일이 2000년인데 왜 2025년부터인지 모순으로 읽혔다.
 * 건물이 상속·증여면 상대편 날짜를 「건물 상속개시일」·「건물 증여일」로 부른다. 4뷰(카드·상세명세서·신고서·PDF)를 따로 잠근다
 * (memory 「양도세 결과뷰는 4개」). D1 방향(건물 매매·신축)은 종전 문구 그대로다 — `split-acq-cause-mixed-d1-3.ui.anchor`가 지킨다.
 */
import { describe, it, expect, afterEach } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate, type AggregateTransferInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { splitRateBasisNote, summarizeSplitGain } from "@/lib/tax-engine/transfer-tax-split-display";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSplitSection } from "@/lib/pdf/ResultPdfTransferSections";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const TRANSFER_PRICE = 900_000_000;
/** 건물 2025-05-01 상속(피상속인 2000-01-01) + 토지 2022-01-10 매매 · 2주택 · 2026-06-30 양도 */
const input = (o: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: TRANSFER_PRICE,
    transferDate: D("2026-06-30"),
    acquisitionDate: D("2025-05-01"),
    acquisitionCause: "inheritance",
    decedentAcquisitionDate: D("2000-01-01"),
    isOneHousehold: false,
    householdHousingCount: 2,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landTransferPrice: 450_000_000,
    buildingTransferPrice: 450_000_000,
    landStandardPriceAtTransfer: 450_000_000,
    buildingStandardPriceAtTransfer: 450_000_000,
    landAcquisitionPrice: 300_000_000,
    buildingAcquisitionPrice: 100_000_000,
    landAcquisitionDate: D("2022-01-10"),
    landAcquisitionCause: "purchase",
    ...o,
  });
const run = (o: Partial<TransferTaxInput> = {}) => calculateTransferTax(input(o), makeMockRates());
const INH = run();
const GIFT = run({ acquisitionCause: "gift", decedentAcquisitionDate: undefined, donorAcquisitionDate: D("2000-01-01") });
/** 토지를 상속개시 **뒤**에 매수 — 주택 max가 걸리지 않아 토지 문구는 자기 취득일(규칙 문구만) */
const LAND_AFTER = run({ landAcquisitionDate: D("2025-09-01") });

const INH_LAND_NOTE = "취득일 2022-01-10(소득세법 §104② 본문)보다 건물 상속개시일이 늦어 상속개시일부터 — 주택부수토지로서의 보유기간";
const GIFT_LAND_NOTE = "취득일 2022-01-10(소득세법 §104② 본문)보다 건물 증여일이 늦어 증여일부터 — 주택부수토지로서의 보유기간";

const FORM = {
  transferDate: "2026-06-30",
  contractTotalPrice: String(TRANSFER_PRICE),
  assets: [
    {
      acquisitionDate: "2025-05-01",
      // 폼에 남은 다른 토지일 — 신고서 토지 열이 폼이 아니라 엔진 echo를 읽는지 가른다
      landAcquisitionDate: "2021-01-01",
      residencePeriodMonthsAsset: "0",
    },
  ],
} as unknown as TransferFormData;

describe("전제 — 엔진 echo(D2-1)와 파트 세율 판정", () => {
  it("상속: 토지 매매 own 2022-01-10 → 적용 2025-05-01(건물 취득일) · 건물 상속 decedent 2000-01-01 · mixedCause · rateBasisShown", () => {
    const sd = INH.splitDetail!;
    expect(sd.land).toMatchObject({ acquisitionCause: "purchase", rateBasisRule: "own", rateBasisAcquisitionDate: "2022-01-10", appliedRateBasisDate: "2025-05-01" });
    expect(sd.building).toMatchObject({ acquisitionCause: "inheritance", rateBasisRule: "decedent", appliedRateBasisDate: "2000-01-01" });
    expect(summarizeSplitGain(sd)).toMatchObject({ mixedCause: true, rateBasisShown: true });
  });
  it("증여: 건물 기산도 증여일(단순 증여는 통산 없음)", () => {
    expect(GIFT.splitDetail!.building).toMatchObject({ acquisitionCause: "gift", rateBasisRule: "own", appliedRateBasisDate: "2025-05-01" });
    expect(GIFT.splitDetail!.land.appliedRateBasisDate).toBe("2025-05-01");
  });
});

describe("splitRateBasisNote — 상대편 날짜 이름은 건물 파트 원인으로", () => {
  const land = INH.splitDetail!.land;
  it.each([
    ["inheritance", INH_LAND_NOTE],
    ["gift", GIFT_LAND_NOTE],
  ] as const)("건물 %s → 「건물 …」", (cause, text) => {
    expect(splitRateBasisNote(land, cause)).toBe(text);
  });
  // 부정형 짝 — D1 방향(건물 매매·신축)·구 이력(원인 echo 없음)은 종전 문구
  it.each([["purchase"], ["newConstruction"], [undefined]] as const)("건물 %s → 종전 「주택 취득일」", (cause) => {
    expect(splitRateBasisNote(land, cause)).toBe(
      "취득일 2022-01-10(소득세법 §104② 본문)보다 주택 취득일이 늦어 주택 취득일부터 — 주택부수토지로서의 보유기간",
    );
  });
  it("max가 걸리지 않은 파트(법정 = 적용)는 규칙 문구만 — 원인과 무관", () => {
    expect(splitRateBasisNote(INH.splitDetail!.building, "inheritance")).toBe("피상속인 취득일 — 소득세법 §104②1호");
    expect(splitRateBasisNote(LAND_AFTER.splitDetail!.land, "inheritance")).toBe("취득일 — 소득세법 §104② 본문");
  });
});

describe("① 단건 결과 카드 — SplitGainDetailSection", () => {
  const card = (r: TransferTaxResult) => render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);

  it("상속: 원인 매매·상속 · 토지 기산 2025-05-01 + 「건물 상속개시일」 · 건물 피상속인 취득일 2000-01-01", () => {
    card(INH);
    expect(screen.getByTestId("split-card-cause-land").textContent).toBe("매매");
    expect(screen.getByTestId("split-card-cause-building").textContent).toBe("상속");
    const land = screen.getByTestId("split-card-rate-basis-land").textContent!;
    expect(land).toContain("2025-05-01");
    expect(land).toContain(INH_LAND_NOTE);
    expect(land).not.toContain("주택 취득일");
    const b = screen.getByTestId("split-card-rate-basis-building").textContent!;
    expect(b).toContain("2000-01-01");
    expect(b).toContain("피상속인 취득일 — 소득세법 §104②1호");
  });
  it("증여: 「건물 증여일」", () => {
    card(GIFT);
    expect(screen.getByTestId("split-card-cause-building").textContent).toBe("증여");
    expect(screen.getByTestId("split-card-rate-basis-land").textContent).toContain(GIFT_LAND_NOTE);
  });
});

describe("② 상세명세서 — 산출세액 ※ · 취득가액 파트 태그", () => {
  const items = (r: TransferTaxResult) => buildStatementItems(r, FORM, undefined, undefined, TRANSFER_PRICE);
  const textOf = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

  it("상속: ※에 파트별 원인·취득일·세율 기산일(토지 「건물 상속개시일」)", () => {
    const f = items(INH).get("calculatedTax")!.note!;
    expect(f).toContain(`토지 매매 2022-01-10 · 세율 기산일 2025-05-01 (${INH_LAND_NOTE})`);
    expect(f).toContain("건물 상속 2025-05-01 · 세율 기산일 2000-01-01 (피상속인 취득일 — 소득세법 §104②1호)");
  });
  it.each([
    ["상속", INH, "건물(상속개시일 평가액) 100,000,000"],
    ["증여", GIFT, "건물(증여 신고가액) 100,000,000"],
  ])("%s: 취득가액 태그 — 토지 「실거래가」 · 건물은 입력 화면 어휘", (_, r, tag) => {
    const f = textOf(items(r).get("acquisitionPrice")!.formula);
    expect(f).toContain("토지(실거래가) 300,000,000");
    expect(f).toContain(tag);
  });
});

describe("③ 신고서 split-2col — 건물 열 = 상속개시일(폼) · 토지 열 = echo · 각주", () => {
  const acqRow = (r: TransferTaxResult) => {
    expect(deriveColumns(r).mode).toBe("split-2col");
    return buildRows(r, "split-2col", FORM, undefined, TRANSFER_PRICE).find((x) => x.values.building === "2025-05-01")!;
  };
  it("토지 열은 엔진이 쓴 매수일(폼에 남은 2021-01-01이 아니다)", () => {
    expect(acqRow(INH).values.land).toBe("2022-01-10");
  });
  it("상속: 취득일 칸 각주 — 토지 「건물 상속개시일」 · 건물 피상속인 취득일", () => {
    const n = acqRow(INH).roseNotes!;
    expect(n.land).toBe(`매매 · 세율 판정 기산일 2025-05-01 (${INH_LAND_NOTE})`);
    expect(n.building).toBe("상속 · 세율 판정 기산일 2000-01-01 (피상속인 취득일 — 소득세법 §104②1호)");
  });
  it("증여: 토지 각주 「건물 증여일」", () => {
    expect(acqRow(GIFT).roseNotes!.land).toBe(`매매 · 세율 판정 기산일 2025-05-01 (${GIFT_LAND_NOTE})`);
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

  it("상속: 원인·세율 기산일 행 + 토지 문구 「건물 상속개시일」", () => {
    const t = tokens(INH);
    expect(row(t, "취득 원인")).toEqual(["매매", "상속"]);
    expect(row(t, "세율 기산일 (소득세법 §104②)")).toEqual(["2025-05-01", "2000-01-01"]);
    expect(t).toContain(`토지 세율 기산일: ${INH_LAND_NOTE}`);
    expect(t.some((x) => x.includes("주택 취득일"))).toBe(false);
  });
  it("증여: 토지 문구 「건물 증여일」", () => {
    expect(tokens(GIFT)).toContain(`토지 세율 기산일: ${GIFT_LAND_NOTE}`);
  });
});

describe("다건 — 건별 splitDetail 카드도 같은 문구", () => {
  it("합산 엔진 properties[].splitDetail → 카드 토지 문구 「건물 상속개시일」", () => {
    const agg = calculateTransferTaxAggregate(
      {
        taxYear: 2026,
        properties: [{ ...input(), propertyId: "p1", propertyLabel: "건1" }],
        annualBasicDeductionUsed: 0,
      } as unknown as AggregateTransferInput,
      makeMockRates(),
    );
    const sd = agg.properties[0].splitDetail!;
    render(<SplitGainDetailSection splitDetail={sd} assetKind="housing" />);
    expect(screen.getByTestId("split-card-rate-basis-land").textContent).toContain(INH_LAND_NOTE);
  });
});
