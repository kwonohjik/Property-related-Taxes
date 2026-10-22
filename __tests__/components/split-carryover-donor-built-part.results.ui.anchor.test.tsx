/**
 * split 건물 파트 이월과세 × 증여자 신축·증축 §114조의2 — 결과 4뷰(카드·상세명세서·신고서·PDF)와 경고 (PR-3 ⑦, 표시 전용 · 세액 불변)
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-3)
 *
 * 실제 폼 → ④ → route(POST) → 결과를 4뷰가 같은 문장 정본(`donorBuiltPenaltyView` / `resultDonorBuiltEcho`)으로 읽는지 잠근다.
 *  · A 채택·가산세 적용: 5년 기산 + 가산세 산식 + 「적용했다 + 정면 해석례 미확보 — 확인 필요」
 *  · ②3호 B 채택: 가산세 없음 + 중립 안내(사용자 확정 문구) — 「같은 금액을 더했다」류 문구는 없다(R2)
 *  · donorBuilt 미입력(건물 환산 A): 입력 안내 고지 — 종전 «양도자 본인 신축만 붙인다» 문구는 없다
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
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";
import { DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE, DONOR_BUILT_SPLIT_UNDECLARED_NOTICE } from "@/lib/tax-engine/transfer-tax-carryover-donor-display";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { bodyOf, routeOf } from "../calc/_helpers/split-carryover-c-form";
import { bForm, bAsset, B_CARRYOVER } from "../calc/_helpers/split-carryover-b-form";

afterEach(cleanup);

const DB = { donorBuilt: true, donorBuiltType: "new" as const, donorBuiltDate: "2021-01-01" };
const EST = (std: string, withDb = true) => ({ ...B_CARRYOVER, partEstimated: true, donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: std, ...(withDb ? DB : {}) });

let A: TransferTaxResult; // A 채택 — 가산세 적용
let NB: TransferTaxResult; // ②3호 B 채택 — 가산세 없음
let UD: TransferTaxResult; // A 채택이지만 donorBuilt 미입력
let REAL: TransferTaxResult; // 실가 B(환산 아님)
beforeAll(async () => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  const run = async (f: TransferFormData) => (await routeOf(POST, await bodyOf(f))).json.data.result as TransferTaxResult;
  A = await run(bForm({}, bAsset({ carryover: EST("40,000,000") })));
  NB = await run(bForm({}, bAsset({ carryover: EST("900,000,000") })));
  UD = await run(bForm({}, bAsset({ carryover: EST("40,000,000", false) })));
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
const pdfText = (r: TransferTaxResult) => collect(TransferSection({ r: r as unknown as Record<string, unknown> })).join("\n");
const echoOf = (r: TransferTaxResult) => r.splitDetail!.building.carryover!.donorBuiltPenalty;

describe("엔진 echo 전제 (④ → route 실경로)", () => {
  it("A 채택: 가산세 = 건물 파트 환산취득가액 × 5% · 경고에 고지", () => {
    const b = A.splitDetail!.building;
    expect(b.carryover!.judgment).toBe("applied");
    expect(A.penaltyBase).toBe(b.acquisitionPrice);
    expect(A.penaltyTax).toBe(Math.floor(b.acquisitionPrice * 0.05));
    expect(A.penaltyTax).toBeGreaterThan(0);
    expect(echoOf(A)).toMatchObject({ applied: true, base: b.acquisitionPrice, penalty: A.penaltyTax, fifthAnniversary: "2026-01-01" });
    expect((A.warnings ?? []).join("\n")).toContain("정면 해석례는 확인하지 못했습니다 — 확인 필요");
  });
  it("②3호 B 채택: 가산세 0 · 경고에 중립 안내(확정 문구)", () => {
    expect(NB.splitDetail!.building.carryover!.judgment).toBe("excluded");
    expect(NB.penaltyTax).toBe(0);
    expect(echoOf(NB)).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
    expect(NB.warnings).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
  });
  it("미입력: echo 없음 · 가산세 0 (donorBuilt 만 가산세를 만든다)", () => {
    expect(UD.splitDetail!.building.carryover!.judgment).toBe("applied");
    expect(echoOf(UD)).toBeUndefined();
    expect(UD.penaltyTax).toBe(0);
    expect(UD.determinedTax).toBe(A.determinedTax); // ②3호 비교는 가산세 前 결정세액 — 입력 유무와 무관
  });
});

describe("① 카드 (SplitGainDetailSection → SplitCarryoverComparisonCard)", () => {
  it("A 채택: 가산세 카드(5년 기산·산식·고지) 한 번 + 「확인 필요」 목록에는 입력 안내가 없다", () => {
    render(<SplitGainDetailSection splitDetail={A.splitDetail!} assetKind="housing" />);
    const card = screen.getByTestId("donor-built-penalty-card");
    expect(card.getAttribute("data-applied")).toBe("true");
    expect(screen.getByTestId("donor-built-window").textContent).toBe("증여자 신축 취득일 2021-01-01부터 5년이 되는 날(2026-01-01)까지 양도하는 경우입니다.");
    expect(screen.getByTestId("donor-built-penalty-line").textContent).toBe(`가산세 ${A.penaltyTax.toLocaleString()} = ${A.penaltyBase.toLocaleString()} × 5%`);
    expect(screen.getByTestId("donor-built-notice").textContent).toContain("정면 해석례는 확인하지 못했습니다 — 확인 필요");
    const notices = Array.from(document.querySelectorAll('[data-testid^="split-carryover-notice-"]')).map((e) => e.textContent!).join("\n");
    expect(notices).not.toContain(DONOR_BUILT_SPLIT_UNDECLARED_NOTICE);
    expect(notices).not.toContain("양도자 본인이 신축·증축한 건물만 가산세를 붙입니다");
  });
  it("②3호 B 채택: 중립 안내만 · 「더했다」류 문구 없음 (R2)", () => {
    render(<SplitGainDetailSection splitDetail={NB.splitDetail!} assetKind="housing" />);
    const card = screen.getByTestId("donor-built-penalty-card");
    expect(card.getAttribute("data-applied")).toBe("false");
    expect(screen.getByTestId("donor-built-notice").textContent).toBe(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    expect(card.textContent).not.toMatch(/같은 금액|더했/);
  });
  it("미입력(건물 환산 A): 카드 없음 + 입력 안내 고지 / 환산 아님: 어느 쪽도 없음", () => {
    render(<SplitGainDetailSection splitDetail={UD.splitDetail!} assetKind="housing" />);
    expect(screen.queryByTestId("donor-built-penalty-card")).toBeNull();
    const notices = Array.from(document.querySelectorAll('[data-testid^="split-carryover-notice-"]')).map((e) => e.textContent!).join("\n");
    expect(notices).toContain(DONOR_BUILT_SPLIT_UNDECLARED_NOTICE);
    cleanup();
    render(<SplitGainDetailSection splitDetail={REAL.splitDetail!} assetKind="housing" />);
    expect(screen.queryByTestId("donor-built-penalty-card")).toBeNull();
    expect(document.body.textContent).not.toContain("§114조의2");
  });
});

describe("② 상세명세서", () => {
  const items = (r: TransferTaxResult) => buildStatementItems(r, FORM, undefined, undefined, 1_200_000_000);
  it("가산세액 항목: 증여자 신축·증축 + 가산세 기준액 산식 · B 채택은 가산세 없음", () => {
    const f = text(items(A).get("penaltyTax")!.formula);
    expect(f).toContain(`§114조의2 증여자 신축·증축 환산취득가액 가산세 ${A.penaltyTax.toLocaleString()}`);
    expect(f).toContain(`가산세 ${A.penaltyTax.toLocaleString()} = ${A.penaltyBase.toLocaleString()} × 5%`);
    expect(text(items(NB).get("penaltyTax")!.formula)).toContain("가산세 없음");
  });
});

describe("③ 신고서", () => {
  const penaltyRow = (r: TransferTaxResult) => {
    const mode = deriveColumns(r).mode;
    return buildRows(r, mode, FORM, undefined, 1_200_000_000).find((x) => x.label.includes("가산세"))!;
  };
  it("가산세액 칸 값은 엔진 합계 그대로 + 각주가 증여자 신축 가산세를 설명한다", () => {
    const row = penaltyRow(A);
    expect(row.values.total).toBe(A.penaltyTax);
    expect(row.roseNotes!.total).toContain(`증여자 신축 건물 가산세 ${A.penaltyTax.toLocaleString()} (= 건물분 환산취득가액 ${A.penaltyBase.toLocaleString()} × 5%)`);
  });
  it("B 채택·미입력은 각주가 없다", () => {
    expect(penaltyRow(NB).roseNotes?.total).toBeUndefined();
    expect(penaltyRow(UD).roseNotes?.total).toBeUndefined();
  });
});

describe("④ PDF", () => {
  it("A 채택: 산식 + 고지 / B 채택: 중립 안내 / 미입력: 증여자 신축 가산세 문구 없음(입력 안내만)", () => {
    const a = pdfText(A);
    expect(a).toContain(`가산세 ${A.penaltyTax.toLocaleString()} = ${A.penaltyBase.toLocaleString()} × 5%`);
    expect(a).toContain("정면 해석례는 확인하지 못했습니다 — 확인 필요");
    expect(pdfText(NB)).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    const u = pdfText(UD);
    expect(u).toContain(DONOR_BUILT_SPLIT_UNDECLARED_NOTICE);
    expect(u).not.toContain("증여자 신축·증축 환산취득가액 가산세");
  });
});
