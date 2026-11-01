/**
 * anchor — 의제취득일 전 «매수» 재개발 원조합원 화면 경로 (PR-3 경로 C · ④⑤⑥⑦⑧⑫⑭)
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §12.2
 *
 * 시료: 토지 출자 입주권 · 권리가액 5억 · 1984.6. 매수. ① = §166③ = 5억 × 취득시 ㎡당 2,400,000(§164④ 등급 환산) ÷ 인가시 ㎡당 3,000,000 = 4억.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/calc/transfer-tax" }));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { PreDeemedPurchaseCard } from "@/components/calc/transfer/PreDeemedPurchaseCard";
import { PreDeemedPurchaseResultCard } from "@/components/calc/results/transfer/PreDeemedPurchaseResultCard";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

type A = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any>;
const mk = (assets: A[]) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "1300000000",
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;

async function check(f: TransferFormData) {
  const issue = [0, 1, 2, 3].map((st) => validateStepDetailed(st, f)).find(Boolean) ?? null;
  let body: Body = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: Body; error?: Body };
  return { issue, body, status: res.status, data: json.data ?? {}, res: json.data?.result as Body, error: json.error };
}

const RIGHT = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 7-1", assetKind: "right_to_move_in", redevSubject: "right", redevApprovalLawBasis: "urban_renovation_art_74", redevOriginalAssetType: "land",
  redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01", redevRightsValue: "500000000", redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no",
  isSuccessorRightToMoveIn: false, useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000", redevSettlementAmount: "100000000", redevLandArea: "200",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "purchase", acquisitionDate: "1985-01-01",
  preDeemedOriginalAcquisitionDate: "1984-06-01", ...o,
});
const EST: A = {
  useEstimatedAcquisition: true, redevActualAcquisitionPrice: "", redevLandPricePerSqmAtApproval: "3000000",
  pre1990Enabled: true, pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "80000", pre1990PricePerSqm_1990: "3000000",
};

describe("⑧ → ④ → ⑫ → ⑭ → 엔진", () => {
  it("실가 1억 — ② 101,411,574 · 요청에 실제 취득일 · ① 미산정", async () => {
    const r = await check(mk([RIGHT()]));
    expect(r.issue).toBeNull();
    expect(r.body.preDeemedPurchase).toEqual({ originalAcquisitionDate: "1984-06-01" });
    expect(r.status).toBe(200);
    expect(r.res.preDeemedPurchaseDetail.clause2Amount).toBe(101_411_574);
    expect(r.res.preDeemedPurchaseDetail.clause1Amount).toBeUndefined();
  });
  it("환산 + 함께 견줄 실가 5억 — ① 4억 < ② 507,057,874 → ②", async () => {
    const r = await check(mk([RIGHT({ ...EST, preDeemedActualPrice: "500,000,000" })]));
    expect(r.issue).toBeNull();
    expect(r.body.preDeemedPurchase.actualPrice).toBe(500_000_000);
    const d = r.res.preDeemedPurchaseDetail;
    expect(d.clause1Amount).toBe(400_000_000);
    expect(d.clause1Method).toBe("redevelopment166_3");
    expect(d.clause2Amount).toBe(507_057_874);
    expect(d.selected).toBe("clause2");
  });
  it("환산 + 함께 견줄 실가 1억 — ① 4억 > ② → ①", async () => {
    const r = await check(mk([RIGHT({ ...EST, preDeemedActualPrice: "100,000,000" })]));
    expect(r.res.preDeemedPurchaseDetail.selected).toBe("clause1");
    expect(r.res.preDeemedPurchaseDetail.clause1Amount).toBe(400_000_000);
  });
  it("실제 취득일 빈칸(옛 저장값) → ⑧ 차단", async () => {
    const r = await check(mk([RIGHT({ preDeemedOriginalAcquisitionDate: "" })]));
    expect(String((r.issue as { message?: string }).message)).toContain("실제 취득일을 입력하세요");
  });
  it("승계조합원 완공 APT — 실제 취득일을 요구하지도 보내지도 않는다", async () => {
    const r = await check(mk([RIGHT({ assetKind: "redevelopment_apt", redevSubject: "apt", redevIsSuccessorMember: "yes", fixedAcquisitionPrice: "100,000,000" })]));
    expect(r.body.preDeemedPurchase).toBeUndefined();
  });
  it("숨은 감정 플래그 · 실가 라디오 — 함께 견줄 실가 칸의 옛 값을 보내지 않는다", async () => {
    const r = await check(mk([RIGHT({ isAppraisalAcquisition: true, preDeemedActualPrice: "500,000,000" })]));
    expect(r.body.preDeemedPurchase.actualPrice).toBeUndefined();
  });
});

describe("⑤ 카드", () => {
  const a = (o: A) => ({ ...makeDefaultAsset(1), ...RIGHT(o) }) as AssetForm;
  it("실가 — ⑤ 실거래가 안내 · 견줄 실가 칸 없음", () => {
    render(<PreDeemedPurchaseCard asset={a({})} onAssetChange={() => {}} />);
    expect(screen.getByTestId("pre-deemed-purchase-actual-note").textContent).toContain("위 ⑤");
    expect(screen.queryByTestId("pre-deemed-purchase-actual-price")).toBeNull();
    expect(screen.getByTestId("pre-deemed-purchase-card").textContent).toContain("§166③ 환산취득가액");
  });
  it("환산 — 견줄 실가 칸", () => {
    render(<PreDeemedPurchaseCard asset={a(EST)} onAssetChange={() => {}} />);
    expect(screen.getByTestId("pre-deemed-purchase-actual-price")).toBeTruthy();
  });
});

describe("⑥ 사이드바 · ⑦ 결과 카드", () => {
  it("계산 전 취득가액 「계산 후 확정」 · 계산 후 §166 분해 합(② 단일 금액이 아니다)", async () => {
    const f = mk([RIGHT()]);
    const before = computeTransferPerAssetSummary(f, null).rows[0];
    expect(before.acqPending).toBe(true);
    const r = await check(f);
    const after = computeTransferPerAssetSummary(f, { mode: "single", result: r.res } as never).rows[0];
    expect(after.acqPending).toBe(false);
    // 인가전 분 ② 101,411,574 + 납부 청산금 100,000,000
    expect(after.acqPrice).toBe(201_411_574);
  });
  it("결과 카드 — ① 라벨 §166③ · ① 채택 필요경비 문구", async () => {
    const r = await check(mk([RIGHT({ ...EST, preDeemedActualPrice: "100,000,000" })]));
    render(<PreDeemedPurchaseResultCard detail={r.res.preDeemedPurchaseDetail} />);
    const t = screen.getByTestId("pre-deemed-purchase-result-card").textContent ?? "";
    expect(t).toContain("§166③ 환산취득가액");
    expect(t).toContain("인가전 분 필요경비는 개산공제");
  });
});
