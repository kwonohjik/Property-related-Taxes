/**
 * P6 결과 4뷰 — 주택 split 파트 이월과세에서 증여자 취득가액을 모를 때 파트 환산(표시 전용 · 세액 불변) (2026-10-21)
 *
 * 4뷰(카드·상세명세서·신고서·PDF)가 같은 view(`splitCarryoverView`)를 읽고 «실제로 필요경비에 들어간 것»만 말하는지 실제 폼 → ④ → route 결과로 잠근다.
 * 시나리오: A 토지 환산(본문) · A 토지 환산 + 자본적지출 단서(swap) · B 건물 환산(§114조의2 확인 필요 고지) · B 건물 환산 비정수 비율(산식 = 엔진 floor).
 * 환산 파트가 아니면(실가) 고지·환산 문구가 없다(회귀 0).
 */
import { describe, it, expect, afterEach, vi, beforeAll } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSplitSection } from "@/lib/pdf/ResultPdfTransferSections";
import { splitCarryoverView, splitCarryoverNotices } from "@/lib/tax-engine/transfer-tax-split-carryover-display";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { bodyOf, routeOf } from "../calc/_helpers/split-carryover-c-form";
import { aForm, aAsset, A_LAND_CARRYOVER } from "../calc/_helpers/split-carryover-a-form";
import { bForm, bAsset, B_CARRYOVER } from "../calc/_helpers/split-carryover-b-form";

afterEach(cleanup);

const A_EST = { ...A_LAND_CARRYOVER, partEstimated: true, donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: "30,000,000" };
const B_EST = { ...B_CARRYOVER, partEstimated: true, donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: "40,000,000" };

let A: TransferTaxResult; // 토지 환산 — 본문(개산공제)
let ASWAP: TransferTaxResult; // 토지 환산 — 자본적지출·양도비 4억 > 환산취득가 + 개산공제 → 단서
let ACAPEX: TransferTaxResult; // 토지 환산 + 증여자 자본적지출 500만(본문 — 환산취득가액 + 개산공제가 더 커서 단서 아님)
let B: TransferTaxResult; // 건물 환산 — 양도시 건물 기준시가 3.1억(비정수 비율)
let REAL: TransferTaxResult; // 실가 B(환산 아님)
beforeAll(async () => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  const run = async (f: TransferFormData) => (await routeOf(POST, await bodyOf(f))).json.data.result as TransferTaxResult;
  A = await run(aForm("purchase", {}, aAsset("purchase", { landCarryover: A_EST })));
  ASWAP = await run(aForm("purchase", {}, aAsset("purchase", { landDirectExpenses: "400,000,000", landCarryover: { ...A_EST, donorCapitalExpenditure: "5,000,000" } })));
  ACAPEX = await run(aForm("purchase", {}, aAsset("purchase", { landCarryover: { ...A_EST, donorCapitalExpenditure: "5,000,000" } })));
  B = await run(bForm({}, bAsset({ buildingStandardPriceAtTransfer: "310,000,000", carryover: B_EST })));
  REAL = await run(bForm());
});

const FORM = { transferDate: "2025-06-30", contractTotalPrice: "1200000000", assets: [{ acquisitionDate: "2021-03-01", residencePeriodMonthsAsset: "0" }] } as unknown as TransferFormData;
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

describe("엔진 echo 전제", () => {
  it("A 토지 환산 — 분자·분모·환산취득가액·개산공제 echo, 가액 echo 없음", () => {
    const e = A.splitDetail!.land.carryover!;
    expect(e.judgment).toBe("applied");
    expect(e.donorAcquisitionPrice).toBeUndefined();
    expect(e.estimated).toEqual({ donorStdPriceAtAcquisition: 30_000_000, stdPriceAtTransfer: 700_000_000, estimatedAcquisitionPrice: 30_000_000, lumpDeduction: 900_000 });
  });
  it("B 건물 환산 비정수 비율 — 환산취득가액 = floor(양도가액 × 분자 ÷ 분모)", () => {
    const part = B.splitDetail!.building;
    const e = part.carryover!.estimated!;
    expect(e.stdPriceAtTransfer).toBe(310_000_000);
    // 나누어떨어지지 않는 비율이어야 «산식 = 엔진 floor» 대조가 의미가 있다
    expect((part.transferPrice * 40_000_000) % 310_000_000).not.toBe(0);
    expect(part.acquisitionPrice).toBe(Math.floor((part.transferPrice * 40_000_000) / 310_000_000));
    expect(e.estimatedAcquisitionPrice).toBe(part.acquisitionPrice);
  });
  it("단서(swap) — 자본적지출·양도비 합계가 환산취득가액 + 개산공제보다 커서 발동", () => {
    expect(ASWAP.splitDetail!.land.swapApplied).toBe(true);
    expect(A.splitDetail!.land.swapApplied).toBeFalsy();
  });
});

describe("① 카드", () => {
  it("본문 — 환산취득가액 산식(양도가액 × 분자 ÷ 분모 = 값) · 개산공제 산식 · 증여자 취득가액 문구 없음", () => {
    render(<SplitGainDetailSection splitDetail={A.splitDetail!} assetKind="housing" />);
    const est = screen.getByTestId("split-carryover-land-estimated").textContent!;
    expect(est).toContain("토지 양도가액 700,000,000");
    expect(est).toContain("증여자 취득 당시 기준시가 30,000,000");
    expect(est).toContain("양도 당시 기준시가 700,000,000");
    expect(screen.getByTestId("split-carryover-land-estimated-acq").textContent).toBe("30,000,000");
    expect(est).toContain("개산공제 = 증여자 취득 당시 기준시가 30,000,000 × 3% = 900,000");
    const card = screen.getByTestId("split-carryover-land").textContent!;
    expect(card).toContain("취득가액 [환산취득가액]");
    expect(card).not.toContain("[증여자 취득가액]");
    // 환산 비-swap — 증여자 자본적지출이 필요경비에 가산됐다는 거짓 행이 없다
    expect(card).not.toContain("필요경비 가산 [증여자 자본적지출");
  });
  it("단서 — 취득가액 차감 안 됨 + 자본적지출·양도비 합계(수증자 + 증여자)를 필요경비로 적용", () => {
    render(<SplitGainDetailSection splitDetail={ASWAP.splitDetail!} assetKind="housing" />);
    const card = screen.getByTestId("split-carryover-land").textContent!;
    expect(card).toContain("차감 안 됨");
    expect(screen.getByTestId("split-carryover-land-estimated").textContent).toContain(
      "자본적지출·양도비 합계 405,000,000(수증자 자본적지출·양도비 400,000,000 + 증여자 자본적지출 5,000,000)",
    );
    expect(screen.getByTestId("split-carryover-land-estimated").textContent).not.toContain("개산공제 = ");
  });
  it("본문 + 증여자 자본적지출 — 필요경비에 넣지 않았다고 말한다(가산 행·가산 문구 없음)", () => {
    expect(ACAPEX.splitDetail!.land.swapApplied).toBeFalsy();
    expect(ACAPEX.splitDetail!.land.carryover!.donorCapexAdded).toBe(5_000_000);
    render(<SplitGainDetailSection splitDetail={ACAPEX.splitDetail!} assetKind="housing" />);
    const card = screen.getByTestId("split-carryover-land").textContent!;
    expect(card).not.toContain("필요경비 가산 [증여자 자본적지출");
    expect(card).toContain("증여자 자본적지출 5,000,000은(는) 환산취득가액을 쓰므로 필요경비에 넣지 않았습니다");
    cleanup();
    const it = buildStatementItems(ACAPEX, FORM, undefined, undefined, 1_200_000_000);
    const x = text(it.get("necessaryExpense")?.formula ?? it.get("expenses")?.formula);
    expect(x).toContain("증여자 자본적지출 5,000,000은(는) 환산취득가액을 쓰므로 필요경비에 넣지 않았습니다");
    expect(x).not.toContain("수증자 자본적지출·양도비 0 + 증여자 자본적지출");
    expect(x).not.toContain("+ 증여자 자본적지출 5,000,000");
    const fRows = buildRows(ACAPEX, "split-2col", FORM, undefined, 1_200_000_000);
    expect(fRows.find((r) => r.label === "필요경비")!.roseNotes!.land).toContain("필요경비에 넣지 않았습니다");
    expect(pdf(ACAPEX)).toContain("필요경비에 넣지 않았습니다");
  });
  it("환산이 아니면 환산 블록이 없다(회귀 0)", () => {
    render(<SplitGainDetailSection splitDetail={REAL.splitDetail!} assetKind="housing" />);
    expect(screen.queryByTestId("split-carryover-building-estimated")).toBeNull();
    expect(screen.getByTestId("split-carryover-building").textContent).toContain("취득가액 [증여자 취득가액]");
  });
  it("§114조의2 확인 필요 — 건물 파트 환산에만 뜬다(토지 환산·실가 건물에는 없다)", () => {
    render(<SplitGainDetailSection splitDetail={B.splitDetail!} assetKind="housing" />);
    const notices = Array.from(document.querySelectorAll('[data-testid^="split-carryover-notice-"]')).map((e) => e.textContent!).join("\n");
    expect(notices).toContain("소득세법 §114조의2");
    expect(notices).toContain("증여자가 그 건물을 신축·증축한 뒤 5년 이내에 양도하는 경우");
    // PR-3 — 종전 «양도자 본인 신축만 붙인다» 고지는 입력 경로가 생겨 교체됐다(증여자 신축·증축 정보가 없으면 입력 안내)
    expect(notices).toContain("«증여자 신축·증축» 정보가 입력되지 않아 가산세는 붙이지 않았습니다");
    expect(notices).not.toContain("양도자 본인이 신축·증축한 건물만 가산세를 붙입니다");
    cleanup();
    for (const r of [A, REAL]) {
      render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
      expect(document.body.textContent).not.toContain("§114조의2");
      cleanup();
    }
  });
});

describe("② 상세명세서", () => {
  const items = (r: TransferTaxResult) => buildStatementItems(r, FORM, undefined, undefined, 1_200_000_000);
  it("취득가액: 이월과세 환산 태그 + 환산취득가액 산식 · 필요경비: 증여세 상당액과 개산공제를 따로", () => {
    const f = text(items(A).get("acquisitionPrice")!.formula);
    expect(f).toContain("토지(이월과세 — 증여자 취득 당시 기준시가 환산)");
    expect(f).toContain("토지 환산취득가액 = 토지 양도가액 700,000,000 × (증여자 취득 당시 기준시가 30,000,000) ÷ (양도 당시 기준시가 700,000,000) = 30,000,000");
    expect(f).not.toContain("증여자 취득가액 0");
    const x = text(items(A).get("necessaryExpense")?.formula ?? items(A).get("expenses")?.formula);
    expect(x).toContain("토지 증여세 상당액 20,000,000 (§97의2①3호)");
    expect(x).toContain("토지 개산공제 900,000 (증여자 취득 당시 기준시가 30,000,000 × 3%)");
    expect(x).not.toContain("토지 자본적지출·양도비 20,000,000");
    expect(x).not.toMatch(/자본적지출·양도비 0(?![\d,])/); // 비-swap 환산 파트는 자본적지출·양도비 항목 자체가 없다(증여세 상당액만 직접경비)
  });
  it("단서 필요경비: 자본적지출·양도비 합계 + 증여세 상당액 별도", () => {
    const x = text(items(ASWAP).get("necessaryExpense")?.formula ?? items(ASWAP).get("expenses")?.formula);
    expect(x).toContain("토지 자본적지출·양도비 405,000,000 (§97②2호 단서");
    expect(x).toContain("토지 증여세 상당액 20,000,000 (§97의2①3호)");
  });
  it("§114조의2 확인 필요: 건물 환산 상세명세서 산출세액 각주에 있다", () => {
    const all = [...items(B).values()].map((i) => text(i.formula) + text(i.value) + text(i.note ?? "")).join("\n");
    expect(all).toContain("§114조의2");
    const none = [...items(A).values()].map((i) => text(i.formula) + text(i.note ?? "")).join("\n");
    expect(none).not.toContain("§114조의2");
  });
});

describe("③ 신고서 split-2col", () => {
  it("취득가액 각주 = 환산취득가액 산식 · 필요경비 각주 = 개산공제·증여세 상당액(증여자 자본적지출 가산 문구 없음)", () => {
    const r = buildRows(A, "split-2col", FORM, undefined, 1_200_000_000);
    const acqPrice = r.find((x) => x.label === "취득가액")!;
    expect(acqPrice.roseNotes!.land).toContain("토지 환산취득가액 = 토지 양도가액 700,000,000 × (증여자 취득 당시 기준시가 30,000,000) ÷ (양도 당시 기준시가 700,000,000) = 30,000,000");
    const exp = r.find((x) => x.label === "필요경비")!;
    expect(exp.roseNotes!.land).toContain("토지 개산공제 = 증여자 취득 당시 기준시가 30,000,000 × 3% = 900,000");
    expect(exp.roseNotes!.land).toContain("필요경비에 증여세 상당액 20,000,000 가산");
    expect(exp.roseNotes!.land).not.toContain("증여자 자본적지출");
  });
});

describe("④ PDF", () => {
  it("환산취득가액 산식 · 개산공제 · 건물 환산이면 §114조의2 확인 필요", () => {
    const t = pdf(A);
    expect(t).toContain("토지 환산취득가액 = 토지 양도가액 700,000,000 × (증여자 취득 당시 기준시가 30,000,000) ÷ (양도 당시 기준시가 700,000,000) = 30,000,000");
    expect(t).toContain("토지 개산공제 = 증여자 취득 당시 기준시가 30,000,000 × 3% = 900,000");
    expect(t).not.toContain("§114조의2");
    expect(pdf(B)).toContain("§114조의2");
    expect(pdf(REAL)).not.toContain("§114조의2");
  });
});

describe("view 단위", () => {
  it("환산 파트의 분자·분모·환산취득가액·개산공제·swap이 view에 그대로 실린다 — 재계산 없음", () => {
    const v = splitCarryoverView(ASWAP.splitDetail!)!;
    const land = v.parts.find((p) => p.key === "land")!;
    expect(land.estimated).toMatchObject({ donorStdPriceAtAcquisition: 30_000_000, stdPriceAtTransfer: 700_000_000 });
    expect(land.swapApplied).toBe(true);
    expect(land.transferPrice).toBe(700_000_000);
    expect(land.donorAcquisitionPrice).toBeUndefined();
    expect(splitCarryoverNotices(v).join("")).not.toContain("§114조의2");
  });
});
