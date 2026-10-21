/**
 * P2 C 결과 4뷰 — 파트 이월과세(§97의2①) 판정·기산일·취득가액 분해·증여세 상당액·②3호 비교 (2026-10-19, 표시 전용 · 세액 불변)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §6
 *
 * 4뷰(카드 `SplitGainDetailSection` · 상세명세서 `buildStatementItems` · 신고서 `buildRows` · PDF `TransferSplitSection`)가 같은 view
 * (`splitCarryoverView`)를 읽는지 뷰마다 따로 잠근다(memory 「양도세 결과뷰는 4개」). 각 뷰에 부정형 짝을 둔다 — 이월과세 echo가 없는
 * 결과(구 이력·일반 split)는 종전 화면 그대로여야 한다. 시드는 엔진 anchor C_NEW와 같다(결정세액 300,018,000 — 토지 ②3호 배제, 건물 적용).
 */
import { describe, it, expect, afterEach } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSplitSection } from "@/lib/pdf/ResultPdfTransferSections";
import { splitCarryoverView } from "@/lib/tax-engine/transfer-tax-split-carryover-display";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const GIFT = D("2023-03-01");
const ct = (donor: string, price: number, valuation: number, giftTax: number) => ({
  giftRegistryDate: GIFT, donorAcquisitionDate: D(donor), donorAcquisitionPrice: price, useEstimatedAcquisition: false,
  giftTaxAmount: giftTax, giftDateValuation: valuation, donorRelation: "lineal" as const, exclusionDeclared: {},
});
/** C — 토지 1995-03-01 5천만 · 건물 2015-06-01 5천만 · 증여세 3천만(토지 8백만 / 건물 2천2백만 안분) · 평가 토지 2.4억 / 건물 6.6억 · 양도 12억 */
function inputC(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing", transferPrice: 1_200_000_000, transferDate: D("2025-06-30"), acquisitionPrice: 0, acquisitionDate: GIFT,
    isOneHousehold: false, householdHousingCount: 2, landAcquisitionDate: GIFT, landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
    landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000,
    landAcquisitionPrice: 240_000_000, buildingAcquisitionPrice: 660_000_000, acquisitionCause: "carryover_gift", landAcquisitionCause: "carryover_gift",
    isSeparateAcquisition: false,
    carryoverGiftEvent: { giftRegistryDate: GIFT, giftTaxCalculated: 30_000_000, giftTaxBase: 900_000_000 },
    landCarryoverTaxation: ct("1995-03-01", 50_000_000, 240_000_000, 8_000_000),
    buildingCarryoverTaxation: ct("2015-06-01", 50_000_000, 660_000_000, 22_000_000),
    ...over,
  });
}
const rates = makeMockRates();
const C = calculateTransferTax(inputC(), rates);
/** 일반 split(이월과세 아님) — 부정형 짝 */
const PLAIN = calculateTransferTax(
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_200_000_000, transferDate: D("2025-06-30"), acquisitionPrice: 0, acquisitionDate: D("2018-03-02"),
    isOneHousehold: false, householdHousingCount: 2, landAcquisitionDate: D("2008-05-10"), isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    saleSplitMode: "actual", landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000,
    landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 400_000_000,
  }),
  rates,
);
/** 구 이력 — 이월과세 echo가 없는 C 결과 스냅샷 */
function legacy(r: TransferTaxResult): TransferTaxResult {
  const sd = r.splitDetail as SplitGainResult;
  const strip = (p: SplitGainResult["land"]) => { const c = { ...p } as Record<string, unknown>; delete c.carryover; return c as unknown as SplitGainResult["land"]; };
  const { carryoverEvent: _ev, ...rest } = sd;
  void _ev;
  return { ...r, splitDetail: { ...rest, land: strip(sd.land), building: strip(sd.building) } as SplitGainResult };
}

const FORM = { transferDate: "2025-06-30", contractTotalPrice: "1200000000", assets: [{ acquisitionDate: "", residencePeriodMonthsAsset: "0" }] } as unknown as TransferFormData;

describe("엔진 echo 전제 (표시 전 확인)", () => {
  it("C 시드: 결정세액 300,018,000 · 토지 배제(tax_comparison) · 건물 적용 · 사건 echo", () => {
    expect(C.determinedTax).toBe(300_018_000);
    const sd = C.splitDetail!;
    expect(sd.land.carryover).toMatchObject({ judgment: "excluded", exclusionReason: "tax_comparison", giftTaxApportioned: 8_000_000 });
    expect(sd.building.carryover).toMatchObject({ judgment: "applied", giftTaxApportioned: 22_000_000 });
    expect(sd.carryoverEvent).toMatchObject({ giftRegistryDate: "2023-03-01", giftTaxCalculated: 30_000_000, giftTaxBase: 900_000_000, applicablePeriodYears: 10 });
    expect(splitCarryoverView(PLAIN.splitDetail)).toBeUndefined();
  });
});

/**
 * SPCO-T9b — 두 파트가 서로를 가린다(안정 구성 {BA, AB} 둘): 양도 2024-12-31 · 증여자 토지 2022-07-01(3천만)·건물 2022-09-01(4.5억) · 증여세 0.
 * 조합 BB 178,500,000 · BA 280,740,000 · AB 304,500,000 · AA 265,410,000 — 순차 고정점 BA.
 * (종전 시드 SPCO-T9[양도 2023-09-30 · 건물 6.6억]의 순서 의존은 G-3 경로가 건물 차손을 0으로 자른 결함이 만든 값이었다 — 2026-10-19 P2 A1로 사라짐.)
 */
const T9 = calculateTransferTax(
  inputC({
    transferDate: D("2024-12-31"),
    carryoverGiftEvent: { giftRegistryDate: GIFT, giftTaxCalculated: 0, giftTaxBase: 900_000_000 },
    landCarryoverTaxation: ct("2022-07-01", 30_000_000, 240_000_000, 0),
    buildingCarryoverTaxation: ct("2022-09-01", 450_000_000, 660_000_000, 0),
  }),
  rates,
);

describe("「확인 필요」 — 안정 구성이 둘일 때 순서 의존 고지는 표지가 있을 때만", () => {
  it("엔진 echo: T9은 orderDependent, C 시드는 표지 없음", () => {
    expect(T9.determinedTax).toBe(280_740_000);
    expect(T9.splitDetail!.carryoverEvent!.orderDependent).toBe(true);
    expect(C.splitDetail!.carryoverEvent!.orderDependent).toBeUndefined();
  });
  it("카드: T9에만 순서 고지(2건), C 시드는 1건 — P5부터 세대 사실 미질문 고지는 없다(C·B는 묻는다)", () => {
    render(<SplitGainDetailSection splitDetail={T9.splitDetail!} assetKind="housing" />);
    expect(screen.getByTestId("split-carryover-notice-1").textContent).toContain("조합이 둘 이상 성립합니다");
    expect(screen.queryByTestId("split-carryover-notice-2")).toBeNull();
    cleanup();
    render(<SplitGainDetailSection splitDetail={C.splitDetail!} assetKind="housing" />);
    expect(screen.queryByTestId("split-carryover-notice-1")).toBeNull();
    expect(screen.getByTestId("split-carryover-notice-0").textContent).toContain("②3호 비교");
  });
});

describe("① 카드 — SplitGainDetailSection", () => {
  const card = (r: TransferTaxResult) => render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
  it("파트별 판정·기산일·분해·안분 산식(숫자 옆 변수명)·②3호 비교와 확인 필요", () => {
    card(C);
    expect(screen.getByTestId("split-carryover-land").getAttribute("data-judgment")).toBe("excluded");
    expect(screen.getByTestId("split-carryover-building").getAttribute("data-judgment")).toBe("applied");
    expect(screen.getByTestId("split-card-lthd-start-building").textContent).toContain("2015-06-01");
    expect(screen.getByTestId("split-card-lthd-start-land").textContent).toContain("2023-03-01");
    // 증여세 상당액 안분 — 산출세액 × 해당 자산가액 ÷ 과세가액 (변수명 라벨 + 숫자)
    const ap = screen.getByTestId("split-carryover-building-apportion").textContent!;
    expect(ap).toContain("증여세 산출세액 30,000,000");
    expect(ap).toContain("건물 증여 신고가액 660,000,000");
    expect(ap).toContain("증여세 과세가액 900,000,000");
    expect(screen.getByTestId("split-carryover-building-apportioned").textContent).toBe("22,000,000");
    // 비교 두 값 + 채택(토지는 미적용 채택)
    const cmp = screen.getByTestId("split-carryover-land-comparison").textContent!;
    expect(cmp).toContain("295,566,000");
    expect(cmp).toContain("300,018,000");
    expect(cmp).toContain("✓ 채택");
    expect(screen.getByTestId("split-carryover-notice-0").textContent).toContain("확인 필요");
    expect(screen.getByTestId("split-carryover-notice-0").textContent).toContain("정면으로 다룬 해석례");
  });
  it.each([
    ["일반 split", PLAIN],
    ["구 이력(echo 없음)", legacy(C)],
  ])("%s → 카드 없음", (_, r) => {
    card(r);
    expect(screen.queryByTestId("split-carryover-card")).toBeNull();
  });
});

describe("② 상세명세서 — 취득가액·필요경비·취득일자·보유기간 행", () => {
  const items = (r: TransferTaxResult) => buildStatementItems(r, FORM, undefined, undefined, 1_200_000_000);
  const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  it("취득가액 태그가 채택값 이름 · 판정 각주 · 취득가액 분해", () => {
    const f = text(items(C).get("acquisitionPrice")!.formula);
    expect(f).toContain("토지(증여 신고가액)");
    expect(f).toContain("건물(이월과세 — 증여자 취득가액)");
    expect(f).toContain("건물 이월과세 적용 (증여자 기준)");
    expect(f).toContain("신고 전체 결정세액 적용 295,566,000 / 미적용 300,018,000");
  });
  it("필요경비: 증여세 상당액 안분 산식 + 건물 증여세 상당액 가산", () => {
    const f = text(items(C).get("necessaryExpense")?.formula ?? items(C).get("expenses")?.formula);
    expect(f).toContain("증여세 산출세액 30,000,000 × (건물 증여 신고가액 660,000,000) ÷ (증여세 과세가액 900,000,000) = 22,000,000");
    expect(f).toContain("증여세 상당액 22,000,000");
  });
  it("취득일자·보유기간: 파트별 기산일", () => {
    const acq = items(C).get("acquisitionDate")!;
    expect(acq.value).toContain("2023");
    expect(text(acq.formula)).toContain("토지 증여 등기접수일 2023-03-01 (이월과세 미적용)");
    expect(text(acq.formula)).toContain("건물 증여자 취득일 2015-06-01");
    expect(text(items(C).get("holdingPeriod")!.value)).toMatch(/토지 .*\/ 건물 /);
  });
  it("산출세액 행 ※: 파트별 장기보유특별공제 기산일 + 세율 기산일(일자 그룹은 렌더하지 않는다)", () => {
    const note = items(C).get("calculatedTax")!.note!;
    expect(note).toContain("이월과세(§97의2①) 장기보유특별공제 기산일: 토지 증여 등기접수일 2023-03-01 (이월과세 미적용) / 건물 증여자 취득일 2015-06-01");
    expect(note).toContain("세율 기산일: 토지 2023-03-01");
  });
  it("「확인 필요」 고지: 비교 단위·동일세대 + 순서 의존은 표지가 있을 때만 (신고서에는 싣지 않는다)", () => {
    const note = items(C).get("calculatedTax")!.note!;
    expect(note).toContain("확인 필요 — ②3호 비교(적용·미적용)는 토지·건물을 각각 별개 자산으로 보고 파트별로 했습니다");
    expect(note).not.toContain("계속 같은 세대였는지는 묻지 않았고"); // P5 — 세대 사실을 묻는다
    expect(note).not.toContain("조합이 둘 이상 성립합니다");
    expect(items(T9).get("calculatedTax")!.note!).toContain("조합이 둘 이상 성립합니다");
    // 설계서 §6 — 신고서는 채택 주석만 둔다(고지 문구 없음)
    const filing = buildRows(C, "split-2col", FORM, undefined, 1_200_000_000);
    const filingText = filing.map((r) => JSON.stringify(r.roseNotes ?? {}) + JSON.stringify(r.values)).join("|");
    expect(filingText).not.toContain("확인 필요");
  });
  it.each([["일반 split", PLAIN], ["구 이력", legacy(C)]])("%s → 종전 문구(이월과세 문구 없음)", (_, r) => {
    const all = [...items(r).values()].map((x) => text(x.formula) + text(x.note ?? "") + text(x.value)).join("|");
    // 파트 이월과세 echo가 만드는 문구만 본다 — «취득 원인» 라벨(「이월과세(증여)」)은 D1-3 종전 행이다.
    expect(all).not.toMatch(/이월과세 (적용|미적용)|증여자 취득가액|증여세 산출세액|증여자 취득일 \d|확인 필요/);
  });
});

describe("③ 신고서 split-2col — 파트별 기산일 칸 + 취득가액·필요경비 각주", () => {
  const rows = (r: TransferTaxResult) => {
    expect(deriveColumns(r).mode).toBe("split-2col");
    return buildRows(r, "split-2col", FORM, undefined, 1_200_000_000);
  };
  it("취득일자: 토지 = 증여 등기접수일 · 건물 = 증여자 취득일, 합계 열 = 증여 등기접수일 · 보유기간도 그 날부터", () => {
    const r = rows(C);
    const acq = r.find((x) => x.label === "취득일자" || x.label.startsWith("취득일"))!;
    expect(acq.values.total).toBe("2023-03-01");
    expect(acq.values.land).toBe("2023-03-01");
    expect(acq.values.building).toBe("2015-06-01");
    const hold = r.find((x) => x.label === "보유기간")!;
    expect(String(hold.values.building)).toMatch(/^10년/);
    expect(String(hold.values.land)).toMatch(/^2년/);
  });
  it("취득가액·필요경비 각주", () => {
    const r = rows(C);
    const acqPrice = r.find((x) => x.label === "취득가액")!;
    expect(acqPrice.roseNotes!.building).toContain("건물 증여자 취득가액 50,000,000");
    expect(acqPrice.roseNotes!.land).toContain("토지 증여 신고가액 240,000,000");
    const exp = r.find((x) => x.label === "필요경비")!;
    expect(exp.roseNotes!.building).toContain("증여세 산출세액 30,000,000 × (건물 증여 신고가액 660,000,000) ÷ (증여세 과세가액 900,000,000) = 22,000,000");
  });
  it.each([["일반 split", PLAIN], ["구 이력", legacy(C)]])("%s → 각주 없음", (_, r) => {
    const acqPrice = rows(r).find((x) => x.label === "취득가액")!;
    expect(acqPrice.roseNotes?.building).toBeUndefined();
  });
});

describe("④ PDF 분리 내역", () => {
  function collect(node: unknown, out: string[] = []): string[] {
    if (node === null || node === undefined || typeof node === "boolean") return out;
    if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
    if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
    const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
    if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
    collect((el.props as { children?: unknown } | undefined)?.children, out);
    return out;
  }
  const tokens = (r: unknown) => collect(TransferSplitSection({ r: r as Record<string, unknown> })).join("\n");
  it("판정·분해·안분 산식·확인 필요", () => {
    const t = tokens(C);
    expect(t).toContain("건물 이월과세 적용 (증여자 기준)");
    expect(t).toContain("토지 이월과세 미적용 (수증자 기준)");
    expect(t).toContain("증여세 산출세액 30,000,000 × (건물 증여 신고가액 660,000,000) ÷ (증여세 과세가액 900,000,000) = 22,000,000");
    expect(t).toContain("확인 필요 —");
  });
  it.each([["일반 split", PLAIN], ["구 이력", legacy(C)]])("%s → 이월과세 문구 없음", (_, r) => {
    expect(tokens(r)).not.toMatch(/이월과세 (적용|미적용)|증여자 취득가액|증여세 산출세액|확인 필요/);
  });
});
