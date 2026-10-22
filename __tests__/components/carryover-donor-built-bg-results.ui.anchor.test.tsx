/**
 * 부담부증여 × 이월과세 × 당초 증여자 신축·증축 §114조의2 — 결과 4뷰(카드·상세명세서·신고서·PDF)와 경고 (PR-4 ⑦, 표시 전용 · 세액 불변)
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-4)
 *
 * 실제 폼 → ④ → route(POST) → 결과를 4뷰가 같은 문장 정본(`donorBuiltPenaltyView` / `resultDonorBuiltEcho`)으로 읽는지 잠근다.
 *  · A 채택·가산세 적용: 5년 기산 + 「채무비율 안분 후」 기준액 + 「적용했다 + 정면 해석례 미확보 — 확인 필요」
 *  · ②3호 B 채택: 가산세 없음 + 중립 안내(사용자 확정 문구)
 *  · donorBuilt 미입력: 어느 뷰에도 흔적이 없다(회귀 0)
 */
import { describe, it, expect, afterEach, vi, beforeAll } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";
import { DONOR_BUILT_ZERO_BASE_NOTICE, DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE } from "@/lib/tax-engine/transfer-tax-carryover-donor-display";
import { bgAsset, bgForm, bodyOf } from "../calc/_helpers/carryover-donor-built-bg-form";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function run(f: TransferFormData): Promise<TransferTaxResult> {
  const body = await bodyOf(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const json = (await res.json()) as { data?: { result: TransferTaxResult }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.result;
}

let A7: TransferTaxResult; // K-7 감정가액 · A 채택
let A5: TransferTaxResult; // K-5 환산 · A 채택
let NB: TransferTaxResult; // ②3호 B 채택
let OFF: TransferTaxResult; // donorBuilt 미입력

beforeAll(async () => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  A7 = await run(bgForm(bgAsset("appraisal")));
  A5 = await run(bgForm(bgAsset("converted")));
  NB = await run(bgForm(bgAsset("appraisal", {}, { bgCoDonorPresumedAcquisitionTotal: "790,000,000" })));
  OFF = await run(bgForm(bgAsset("appraisal", { donorBuilt: false })));
});

const FORM = { transferDate: "2026-02-16", contractTotalPrice: "800000000", assets: [{ acquisitionDate: "", residencePeriodMonthsAsset: "0" }] } as unknown as TransferFormData;
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

describe("엔진 echo 전제 (④ → route 실경로)", () => {
  it("A 채택: K-7 6,250,000 · K-5 4,687,500 · 경고에 고지", () => {
    expect(A7.penaltyTax).toBe(6_250_000);
    expect(A5.penaltyTax).toBe(4_687_500);
    expect(A7.carryoverTaxationDetail!.donorBuiltPenalty).toMatchObject({ applied: true, burdenedGift: { method: "appraisal" } });
    expect((A7.warnings ?? []).join("\n")).toContain("정면 해석례는 확인하지 못했습니다 — 확인 필요");
  });
  it("B 채택: 가산세 0 · 경고에 중립 안내 / 미입력: echo·경고 없음", () => {
    expect(NB.carryoverTaxationDetail!.adoptedScenario).toBe("B");
    expect(NB.penaltyTax).toBe(0);
    expect(NB.warnings).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    expect(OFF.carryoverTaxationDetail!.donorBuiltPenalty).toBeUndefined();
    expect((OFF.warnings ?? []).join("\n")).not.toContain("증여자 신축");
  });
});

describe("① 결과 카드 (CarryoverComparisonCard)", () => {
  it("A 채택·K-7: 5년 기산 + 채무비율 안분 후 건물 감정가액 기준액 + 가산세 산식 + 고지", () => {
    render(<CarryoverComparisonCard detail={A7.carryoverTaxationDetail!} />);
    const card = screen.getByTestId("donor-built-penalty-card");
    expect(card.getAttribute("data-applied")).toBe("true");
    expect(screen.getByTestId("donor-built-window").textContent).toBe("증여자 신축 취득일 2022-01-10부터 5년이 되는 날(2027-01-10)까지 양도하는 경우입니다.");
    expect(card.textContent).toContain("가산세 기준액 = 당초 증여자 건물 감정가액 중 채무비율 안분 후 금액 125,000,000");
    expect(screen.getByTestId("donor-built-penalty-line").textContent).toBe("가산세 6,250,000 = 125,000,000 × 5%");
    expect(screen.getByTestId("donor-built-notice").textContent).toContain("정면 해석례는 확인하지 못했습니다 — 확인 필요");
  });
  it("A 채택·K-5: 환산취득가액 기준액", () => {
    render(<CarryoverComparisonCard detail={A5.carryoverTaxationDetail!} />);
    expect(screen.getByTestId("donor-built-penalty-card").textContent).toContain("가산세 기준액 = 당초 증여자 건물 환산취득가액 중 채무비율 안분 후 금액 93,750,000");
  });
  it("B 채택: 중립 안내만 · 「더했다」류 문구 없음 (R2) / 미입력: 카드 없음", () => {
    render(<CarryoverComparisonCard detail={NB.carryoverTaxationDetail!} />);
    expect(screen.getByTestId("donor-built-notice").textContent).toBe(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    expect(screen.getByTestId("donor-built-penalty-card").textContent).not.toMatch(/같은 금액|더했/);
    cleanup();
    render(<CarryoverComparisonCard detail={OFF.carryoverTaxationDetail!} />);
    expect(screen.queryByTestId("donor-built-penalty-card")).toBeNull();
  });
  it("가산세 기준액이 0원이면 zero_base 고지", () => {
    const detail = { ...A7.carryoverTaxationDetail!, donorBuiltPenalty: { applied: false, notAppliedReason: "zero_base" as const, buildingType: "new" as const, constructionDate: "2022-01-10" } };
    render(<CarryoverComparisonCard detail={detail} />);
    expect(screen.getByTestId("donor-built-notice").textContent).toBe(DONOR_BUILT_ZERO_BASE_NOTICE);
  });
});

describe("② 상세명세서", () => {
  it("가산세액 항목: 증여자 신축·증축 + 안분 후 기준액 · B 채택은 가산세 없음", () => {
    const f = text(buildStatementItems(A7, FORM, undefined, undefined, 800_000_000).get("penaltyTax")!.formula);
    expect(f).toContain("§114조의2 증여자 신축·증축");
    expect(f).toContain("가산세 기준액 = 당초 증여자 건물 감정가액 중 채무비율 안분 후 금액 125,000,000");
    expect(text(buildStatementItems(NB, FORM, undefined, undefined, 800_000_000).get("penaltyTax")!.formula)).toContain("가산세 없음");
  });
});

describe("③ 신고서", () => {
  const penaltyRow = (r: TransferTaxResult) => buildRows(r, deriveColumns(r).mode, FORM, undefined, 800_000_000).find((x) => x.label.includes("가산세"))!;
  it("가산세액 칸 = 엔진 합계 + 각주가 채무비율 안분 후 기준액을 설명한다 / B 채택·미입력은 각주 없음", () => {
    expect(penaltyRow(A7).values.total).toBe(6_250_000);
    expect(penaltyRow(A7).roseNotes!.total).toContain("증여자 신축 건물 가산세 6,250,000 (= 채무비율 안분 후 건물 감정가액 125,000,000 × 5%)");
    expect(penaltyRow(A5).roseNotes!.total).toContain("(= 채무비율 안분 후 건물 환산취득가액 93,750,000 × 5%)");
    expect(penaltyRow(NB).roseNotes?.total).toBeUndefined();
    expect(penaltyRow(OFF).roseNotes?.total).toBeUndefined();
  });
});

describe("④ PDF", () => {
  it("A 채택: 산식 + 고지 / B 채택: 중립 안내 / 미입력: 문구 없음", () => {
    const a = pdfText(A7);
    expect(a).toContain("가산세 기준액 = 당초 증여자 건물 감정가액 중 채무비율 안분 후 금액 125,000,000");
    expect(a).toContain("정면 해석례는 확인하지 못했습니다 — 확인 필요");
    expect(pdfText(NB)).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    expect(pdfText(OFF)).not.toContain("증여자 신축");
  });
});
