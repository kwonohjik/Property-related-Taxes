/**
 * 이월과세 × 증여자 신축·증축 §114조의2 — 결과 4뷰(카드·상세명세서·신고서·PDF)와 경고 (PR-2 ⑦, 표시 전용 · 세액 불변)
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md §7
 *
 * 실제 폼 → ④ → route(POST) → 결과를 4뷰가 같은 문장 정본(`donorBuiltPenaltyView`)으로 읽는지 잠근다.
 *  · A 채택·가산세 적용: 5년 기산 + 건물분 산식 + 「적용했다 + 정면 해석례 미확보 — 확인 필요」
 *  · ②3호 B 채택: 가산세 없음 + 중립 안내(사용자 확정 문구) — 「같은 금액을 더했다」류 문구는 없다(R2)
 *  · donorBuilt 미입력: 어느 뷰에도 흔적이 없다(회귀 0)
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

import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE } from "@/lib/tax-engine/transfer-tax-carryover-donor-display";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const HOUSING_INPUTS: Partial<CarryoverTaxationForm> = {
  donorBuiltLandPricePerSqm: "1,000,000",
  donorBuiltLandArea: "100",
  donorBuiltBuildingStdAtAcq: "60,000,000",
};

function form(opts: { kind: "housing" | "building"; giftVal?: string; donorBuilt?: boolean }): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData());
  f.transferDate = "2026-03-01";
  f.contractTotalPrice = "1,000,000,000";
  // 1세대1주택 비과세로 흘러 가산세 비교가 사라지지 않게 2주택 보유로 둔다(엔진 anchor 와 같은 셀)
  f.isOneHousehold = false;
  f.householdHousingCount = "2";
  f.assets[0] = {
    ...f.assets[0],
    assetKind: opts.kind,
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2024-05-01",
    landStandardPriceAtTransfer: opts.kind === "housing" ? "240,000,000" : "",
    buildingStandardPriceAtTransfer: opts.kind === "housing" ? "160,000,000" : "",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2024-05-01",
      donorAcquisitionDate: "2022-01-10",
      useEstimatedAcquisition: true,
      estimationMode: "general",
      donorStandardPriceAtAcquisition: "200,000,000",
      donorStandardPriceAtTransfer: "400,000,000",
      giftDateValuation: opts.giftVal ?? "800,000,000",
      giftTaxAmount: "0",
      donorRelation: "lineal",
      donorSameHousehold: "no",
      ...(opts.donorBuilt === false ? {} : { donorBuilt: true, donorBuiltType: "new" as const, donorBuiltDate: "2022-01-10" }),
      ...(opts.kind === "housing" ? HOUSING_INPUTS : {}),
    },
  } as AssetForm;
  return f;
}

/** 실제 ④ → route */
async function resultOf(f: TransferFormData): Promise<TransferTaxResult> {
  let captured: Record<string, unknown> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(captured) }));
  const json = (await res.json()) as { data?: { result: TransferTaxResult }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.result;
}

const FORM = { transferDate: "2026-03-01", contractTotalPrice: "1000000000", assets: [{ acquisitionDate: "", residencePeriodMonthsAsset: "0" }] } as unknown as TransferFormData;
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

let A: TransferTaxResult; // 일체 주택 A 채택
let N: TransferTaxResult; // 비주택 건물 신축 A 채택
let B: TransferTaxResult; // ②3호 B 채택
let OFF: TransferTaxResult; // donorBuilt 미입력

beforeAll(async () => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  A = await resultOf(form({ kind: "housing" }));
  N = await resultOf(form({ kind: "building" }));
  B = await resultOf(form({ kind: "building", giftVal: "500,000,000" }));
  OFF = await resultOf(form({ kind: "housing", donorBuilt: false }));
});

describe("엔진 echo 전제 (④ → route 실경로)", () => {
  it("일체 주택 A 채택: 건물분 base 187,500,000 · 가산세 9,375,000 · 경고에 고지", () => {
    expect(A.penaltyBase).toBe(187_500_000);
    expect(A.penaltyTax).toBe(9_375_000);
    expect(A.carryoverTaxationDetail!.donorBuiltPenalty).toMatchObject({ applied: true, formula: { multiplicand: 400_000_000, numerator: 75_000_000, denominator: 160_000_000 } });
    expect((A.warnings ?? []).join("\n")).toContain("정면 해석례는 확인하지 못했습니다 — 확인 필요");
  });
  it("B 채택: 가산세 0 · 경고에 중립 안내(확정 문구)", () => {
    expect(B.penaltyTax).toBe(0);
    expect(B.carryoverTaxationDetail!.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
    expect(B.warnings).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
  });
  it("donorBuilt 미입력: echo·경고 모두 없다", () => {
    expect(OFF.carryoverTaxationDetail!.donorBuiltPenalty).toBeUndefined();
    expect((OFF.warnings ?? []).join("\n")).not.toContain("증여자 신축");
  });
});

describe("① 결과 카드 (CarryoverComparisonCard)", () => {
  it("A 채택·일체 주택: 5년 기산 + 건물분 안분 산식 + 가산세 산식 + 고지", () => {
    render(<CarryoverComparisonCard detail={A.carryoverTaxationDetail!} />);
    const card = screen.getByTestId("donor-built-penalty-card");
    expect(card.getAttribute("data-applied")).toBe("true");
    expect(screen.getByTestId("donor-built-window").textContent).toBe("증여자 신축 취득일 2022-01-10부터 5년이 되는 날(2027-01-10)까지 양도하는 경우입니다.");
    const t = card.textContent!;
    // 결과뷰는 `FormulaText`가 «× (분자) ÷ (분모)»를 분수(Frac)로 그린다 — 분자·분모가 각각 한 덩어리로 있어야 한다
    expect(t).toContain("건물분 환산취득가액 187,500,000 = 건물분 양도가액 400,000,000 ×");
    const frac = card.querySelector("span.inline-flex.flex-col")!;
    expect(frac.children[0].textContent).toBe("취득 당시 건물분 기준시가 75,000,000");
    expect(frac.children[1].textContent).toBe("양도 당시 건물분 기준시가 160,000,000");
    expect(t).toContain("건물분 기준시가는 주택공시가격을 토지 기준시가와 건물 기준시가의 비율로 나눈 값입니다 — 토지분은 가산세 대상에서 제외합니다");
    expect(screen.getByTestId("donor-built-penalty-line").textContent).toBe("가산세 9,375,000 = 187,500,000 × 5%");
    expect(screen.getByTestId("donor-built-notice").textContent).toContain("적용했습니다");
    expect(screen.getByTestId("donor-built-notice").textContent).toContain("정면 해석례는 확인하지 못했습니다 — 확인 필요");
  });
  it("A 채택·비주택 신축: 증여자 환산취득가액 전체가 기준액", () => {
    render(<CarryoverComparisonCard detail={N.carryoverTaxationDetail!} />);
    expect(screen.getByTestId("donor-built-penalty-card").textContent).toContain("가산세 기준액 = 증여자 환산취득가액 500,000,000 (건물)");
    expect(screen.getByTestId("donor-built-penalty-line").textContent).toBe("가산세 25,000,000 = 500,000,000 × 5%");
  });
  it("B 채택: 중립 안내만 · 「더했다」류 문구 없음 (R2)", () => {
    render(<CarryoverComparisonCard detail={B.carryoverTaxationDetail!} />);
    const card = screen.getByTestId("donor-built-penalty-card");
    expect(card.getAttribute("data-applied")).toBe("false");
    expect(screen.getByTestId("donor-built-notice").textContent).toBe(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    expect(card.textContent).not.toMatch(/같은 금액|더했/);
    expect(screen.queryByTestId("donor-built-penalty-line")).toBeNull();
  });
  it("미입력: 카드 없음 (긍정 짝)", () => {
    render(<CarryoverComparisonCard detail={OFF.carryoverTaxationDetail!} />);
    expect(screen.queryByTestId("donor-built-penalty-card")).toBeNull();
  });
});

describe("② 상세명세서", () => {
  it("가산세액 항목: 증여자 신축·증축 + 건물분 산식 · B 채택은 가산세 없음", () => {
    const f = text(buildStatementItems(A, FORM, undefined, undefined, 1_000_000_000).get("penaltyTax")!.formula);
    expect(f).toContain("§114조의2 증여자 신축·증축 환산취득가액 가산세 9,375,000");
    expect(f).toContain("건물분 환산취득가액 187,500,000 = 건물분 양도가액 400,000,000 × (취득 당시 건물분 기준시가 75,000,000) ÷ (양도 당시 건물분 기준시가 160,000,000)");
    expect(text(buildStatementItems(B, FORM, undefined, undefined, 1_000_000_000).get("penaltyTax")!.formula)).toContain("가산세 없음");
  });
  it("미입력(현행): 종전 문구 그대로", () => {
    const f = text(buildStatementItems(N, FORM, undefined, undefined, 1_000_000_000).get("penaltyTax")!.formula);
    expect(f).toContain("증여자 신축·증축");
    const off = text(buildStatementItems(OFF, FORM, undefined, undefined, 1_000_000_000).get("penaltyTax")!.formula);
    expect(off).not.toContain("증여자 신축");
  });
});

describe("③ 신고서", () => {
  const penaltyRow = (r: TransferTaxResult) => {
    const mode = deriveColumns(r).mode;
    return buildRows(r, mode, FORM, undefined, 1_000_000_000).find((x) => x.label.includes("가산세"))!;
  };
  it("가산세액 칸 값은 엔진 합계 그대로 + 각주가 증여자 신축 가산세를 설명한다", () => {
    const row = penaltyRow(A);
    expect(row.values.total).toBe(9_375_000);
    expect(row.roseNotes!.total).toContain("증여자 신축 건물 가산세 9,375,000 (= 건물분 환산취득가액 187,500,000 × 5%)");
  });
  it("B 채택·미입력은 각주가 없다", () => {
    expect(penaltyRow(B).roseNotes?.total).toBeUndefined();
    expect(penaltyRow(OFF).roseNotes?.total).toBeUndefined();
  });
});

describe("④ PDF", () => {
  it("A 채택: 산식 + 고지 / B 채택: 중립 안내 / 미입력: 문구 없음", () => {
    const a = pdfText(A);
    expect(a).toContain("건물분 환산취득가액 187,500,000 = 건물분 양도가액 400,000,000 × (취득 당시 건물분 기준시가 75,000,000) ÷ (양도 당시 건물분 기준시가 160,000,000)");
    expect(a).toContain("정면 해석례는 확인하지 못했습니다 — 확인 필요");
    expect(pdfText(B)).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    expect(pdfText(OFF)).not.toContain("증여자 신축");
  });
});
