/**
 * 이월과세 × 증여자 신축 일체 주택 × 영 §164⑨ 특례 — 결과 4뷰(카드·상세명세서·신고서·PDF)와 고지 (PR-B ⑦)
 * 계획서: docs/00-pm/self-built-housing-164-9-plan.md §5.4 (본인 신축 PR-A 문구와 일관) · §9.1 «5c»
 *
 * 실제 폼 → ④ → route(POST) → 결과를 4뷰가 같은 문장 정본(`donorBuiltPenaltyView`·`donorBuiltPenaltyFilingNote`)으로 읽는지 잠근다.
 *  · 특례가 걸린 셀: 양도 당시 건물분 기준시가가 특례 금액(H_T′)에서 나왔음을 밝히는 한 줄 + 접미 + 고지 변형(「확인 필요」 1회)
 *  · 특례 불발 셀: 수치 불변이지만 특례 detail 이 있으므로 같은 줄을 싣는다(특례 카드와 같은 시점 — 본인 신축 Q-7)
 *  · 특례 없는 셀: 종전 문구 그대로(대조군)
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
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 양도가 3억 · 증여자 취득 당시 H=2억 · 양도 당시 H_T=4억(L_T 2.4억 + N_T 1.6억) — route anchor(`transfer.route.carryover-donor-built-164-9`)와 같은 셀 */
function form(extra: Partial<AssetForm>): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData());
  f.transferDate = "2026-03-01";
  f.contractTotalPrice = "300,000,000";
  f.isOneHousehold = false;
  f.householdHousingCount = "2";
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2024-05-01",
    landStandardPriceAtTransfer: "240,000,000",
    buildingStandardPriceAtTransfer: "160,000,000",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2024-05-01",
      donorAcquisitionDate: "2022-01-10",
      useEstimatedAcquisition: true,
      estimationMode: "general",
      donorStandardPriceAtAcquisition: "200,000,000",
      donorStandardPriceAtTransfer: "400,000,000",
      giftDateValuation: "800,000,000",
      giftTaxAmount: "0",
      donorRelation: "lineal",
      donorSameHousehold: "no",
      donorBuilt: true,
      donorBuiltType: "new",
      donorBuiltDate: "2022-01-10",
      donorBuiltLandPricePerSqm: "1,000,000",
      donorBuiltLandArea: "100",
      donorBuiltBuildingStdAtAcq: "60,000,000",
    },
    ...extra,
  } as AssetForm;
  return f;
}

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

const FORM = { transferDate: "2026-03-01", contractTotalPrice: "300000000", assets: [{ acquisitionDate: "", residencePeriodMonthsAsset: "0" }] } as unknown as TransferFormData;
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
const confirmCount = (s: string) => s.split("확인 필요").length - 1;

const EXPR_LINE =
  "양도 당시 주택공시가격 300,000,000은 소득세법 시행령 §164⑨ 1호 공익수용 특례에 따라 개별주택가격 400,000,000·보상액 300,000,000·보상산정 기초 기준시가 350,000,000 중 가장 작은 금액입니다.";
const AUCTION_LINE =
  "양도 당시 주택공시가격 300,000,000은 소득세법 시행령 §164⑨ 2호 공매·경락 특례에 따라 개별주택가격 400,000,000·공매·경락가액 300,000,000 중 작은 금액입니다.";
const MISS_LINE =
  "양도 당시 주택공시가격 400,000,000은 소득세법 시행령 §164⑨ 1호 공익수용 특례에 따라 개별주택가격 400,000,000·보상액 500,000,000·보상산정 기초 기준시가 500,000,000 중 가장 작은 금액입니다.";
const SPECIAL_BASIS = "건물분 기준시가는 주택공시가격(특례 적용 금액)을 토지 기준시가와 건물 기준시가의 비율로 나눈 값입니다";
const PLAIN_BASIS = "건물분 기준시가는 주택공시가격을 토지 기준시가와 건물 기준시가의 비율로 나눈 값입니다";

let EX: TransferTaxResult; // 1호 수용 — H_T′ 3억
let AU: TransferTaxResult; // 2호 공매 — H_T′ 3억
let MS: TransferTaxResult; // 1호 불발 — 보상 5억 ≥ H_T
let NO: TransferTaxResult; // 특례 없음(대조군)

beforeAll(async () => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  // 자산 단위 환산 토글이 켜져야 ② 양도정보의 §164⑨ 칸이 열리고 ④ 가 보상액을 싣는다(`exprCompensationSendGates`)
  EX = await resultOf(form({ useEstimatedAcquisition: true, transferCause: "public_expropriation", housingCompensationTotal: "300,000,000", housingCompensationBasisTotal: "350,000,000" }));
  AU = await resultOf(form({ useEstimatedAcquisition: true, isAuctionTransfer: true, auctionPrice: "300,000,000" }));
  MS = await resultOf(form({ useEstimatedAcquisition: true, transferCause: "public_expropriation", housingCompensationTotal: "500,000,000", housingCompensationBasisTotal: "500,000,000" }));
  NO = await resultOf(form({}));
});

describe("엔진 전제 (④ → route 실경로 — ⑤ 폼 입력이 ⑭ 를 거쳐 특례로 닿는다)", () => {
  it("수용·공매: base 75,000,000 · 가산세 3,750,000 / 불발·특례 없음: 56,250,000 · 2,812,500", () => {
    for (const r of [EX, AU]) expect(r).toMatchObject({ penaltyBase: 75_000_000, penaltyTax: 3_750_000 });
    for (const r of [MS, NO]) expect(r).toMatchObject({ penaltyBase: 56_250_000, penaltyTax: 2_812_500 });
  });
  it("echo: 수용/공매는 H_T′ 3억 · 불발은 H_T 4억 · 특례 없음은 특례 필드 없음", () => {
    const sp = (r: TransferTaxResult) => r.carryoverTaxationDetail!.donorBuiltPenalty!.housingSplit!;
    expect(sp(EX)).toMatchObject({ transferHousing: 300_000_000, transferBuilding: 120_000_000, sec164_9: { kind: "expropriation" } });
    expect(sp(AU)).toMatchObject({ transferHousing: 300_000_000, transferBuilding: 120_000_000, sec164_9: { kind: "auction" } });
    expect(sp(MS)).toMatchObject({ transferHousing: 400_000_000, transferBuilding: 160_000_000, sec164_9: { kind: "expropriation" } });
    expect(sp(NO).sec164_9).toBeUndefined();
    expect(sp(NO).transferHousing).toBeUndefined();
  });
});

describe("① 결과 카드 (CarryoverComparisonCard)", () => {
  it("수용: 건물분 산식(분모 = H_T′ 의 건물 몫) + 특례 한 줄 + 「특례 적용 금액」 설명 + 고지 변형(확인 필요 1회)", () => {
    render(<CarryoverComparisonCard detail={EX.carryoverTaxationDetail!} />);
    const card = screen.getByTestId("donor-built-penalty-card");
    const t = card.textContent!;
    expect(t).toContain("건물분 환산취득가액 75,000,000 = 건물분 양도가액 120,000,000 ×");
    const frac = card.querySelector("span.inline-flex.flex-col")!;
    expect(frac.children[0].textContent).toBe("취득 당시 건물분 기준시가 75,000,000");
    expect(frac.children[1].textContent).toBe("양도 당시 건물분 기준시가 120,000,000");
    expect(t).toContain(EXPR_LINE);
    expect(t).toContain(SPECIAL_BASIS);
    expect(t).not.toContain(PLAIN_BASIS);
    expect(screen.getByTestId("donor-built-penalty-line").textContent).toBe("가산세 3,750,000 = 75,000,000 × 5%");
    const notice = screen.getByTestId("donor-built-notice").textContent!;
    expect(notice).toContain("양도 당시 주택공시가격은 소득세법 시행령 §164⑨ 1호 공익수용 특례에 따른 금액을 같은 비율로 나누었습니다");
    expect(confirmCount(notice)).toBe(1);
  });
  it("공매: 2호 문구 · 불발: 4억 그대로 + 같은 줄(특례 카드와 같은 시점)", () => {
    render(<CarryoverComparisonCard detail={AU.carryoverTaxationDetail!} />);
    expect(screen.getByTestId("donor-built-penalty-card").textContent).toContain(AUCTION_LINE);
    expect(screen.getByTestId("donor-built-notice").textContent).toContain("소득세법 시행령 §164⑨ 2호 공매·경락 특례");
    cleanup();
    render(<CarryoverComparisonCard detail={MS.carryoverTaxationDetail!} />);
    const t = screen.getByTestId("donor-built-penalty-card").textContent!;
    expect(t).toContain(MISS_LINE);
    expect(t).toContain("양도 당시 건물분 기준시가 160,000,000");
  });
  it("특례 없음(대조군): 특례 줄·접미 없음 · 종전 설명 문장 · 종전 고지", () => {
    render(<CarryoverComparisonCard detail={NO.carryoverTaxationDetail!} />);
    const t = screen.getByTestId("donor-built-penalty-card").textContent!;
    expect(t).not.toContain("§164⑨");
    expect(t).toContain(PLAIN_BASIS);
    const notice = screen.getByTestId("donor-built-notice").textContent!;
    expect(notice).not.toContain("§164⑨");
    expect(confirmCount(notice)).toBe(1);
  });
});

describe("② 상세명세서 — 같은 문장 정본", () => {
  it("수용: 가산세 산식 줄에 특례 한 줄이 들어간다 · 특례 없음은 없다", () => {
    const ex = text(buildStatementItems(EX, FORM, undefined, undefined, 300_000_000).get("penaltyTax")!.formula);
    expect(ex).toContain("§114조의2 증여자 신축·증축 환산취득가액 가산세 3,750,000");
    expect(ex).toContain("건물분 환산취득가액 75,000,000 = 건물분 양도가액 120,000,000 × (취득 당시 건물분 기준시가 75,000,000) ÷ (양도 당시 건물분 기준시가 120,000,000)");
    expect(ex).toContain(EXPR_LINE);
    const no = text(buildStatementItems(NO, FORM, undefined, undefined, 300_000_000).get("penaltyTax")!.formula);
    expect(no).not.toContain("§164⑨");
  });
});

describe("③ 신고서 각주", () => {
  const note = (r: TransferTaxResult) => {
    const mode = deriveColumns(r).mode;
    return buildRows(r, mode, FORM, undefined, 300_000_000).find((x) => x.label.includes("가산세"))!.roseNotes!.total!;
  };
  it("수용·공매·불발은 환산식 뒤 «· 특례 적용» 접미 · 특례 없음은 종전 각주 그대로", () => {
    expect(note(EX)).toContain("증여자 신축 건물 가산세 3,750,000 (= 건물분 환산취득가액 75,000,000 × 5%) · 소득세법 시행령 §164⑨ 1호 공익수용 특례 적용");
    expect(note(AU)).toContain("(= 건물분 환산취득가액 75,000,000 × 5%) · 소득세법 시행령 §164⑨ 2호 공매·경락 특례 적용");
    expect(note(MS)).toContain("(= 건물분 환산취득가액 56,250,000 × 5%) · 소득세법 시행령 §164⑨ 1호 공익수용 특례 적용");
    const no = note(NO);
    expect(no).toContain("증여자 신축 건물 가산세 2,812,500 (= 건물분 환산취득가액 56,250,000 × 5%)");
    expect(no).not.toContain("§164⑨");
  });
});

describe("④ PDF + 경고 목록", () => {
  it("수용: 특례 한 줄 + 변형 고지 / 특례 없음: 문구 없음", () => {
    const ex = pdfText(EX);
    expect(ex).toContain(EXPR_LINE);
    expect(ex).toContain("특례 적용 금액을 토지·건물로 나누는 정면 해석례는 확인하지 못했습니다 — 확인 필요");
    expect(pdfText(NO)).not.toContain("§164⑨");
  });
  it("result.warnings 의 증여자 신축 고지는 한 건 · 확인 필요 1회", () => {
    for (const r of [EX, AU, MS, NO]) {
      const ws = (r.warnings ?? []).filter((w) => w.includes("증여자가 신축·증축한 건물에"));
      expect(ws).toHaveLength(1);
      expect(confirmCount(ws[0])).toBe(1);
    }
  });
});
