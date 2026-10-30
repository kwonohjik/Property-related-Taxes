/**
 * anchor — 증여·상속 승계 입주권(이월과세·부담부증여 아님)의 취득가액 축. 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` Q-2 (a).
 *
 *   §163⑨ 평가액(증여 신고가액·상속개시일 평가액)이 취득가액 정본이다 — ④가 §163⑨ 페이로드로 그 값을 쓰고 승계 칸은 덮였다.
 *   F-1 추가분담금이 조용히 빠졌다(매매 −21,000,000 ↔ 증여·상속 0) → ⑧이 거절한다(근거 확인 전).
 *   F-2 승계취득가액은 계산에 안 쓰이는데 ⑧ 필수였다 → ⑤가 숨기고 ⑧도 요구하지 않는다.
 *   F-3 평가액 빈칸이면 승계가액이 취득가액이 됐다(상속 100M → 472,935,000) → ⑧이 평가액을 요구한다.
 *   남은 승계 산정 방식 플래그(매매사례·감정·환산)는 라디오를 숨기므로 ④가 끈다.
 * 결정세액은 mock 세율.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NextRequest } from "next/server";

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
import { SuccessorRightAcquisitionBlock } from "@/components/calc/transfer/SuccessorRightAcquisitionBlock";
import { isDeemedValueSuccessorRight, successorRightEstimationMode } from "@/lib/calc/transfer-successor-right";
import { directAcqRaw } from "@/lib/stores/transfer-per-asset-direct";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type A = Record<string, unknown>;
const mk = (assets: A[], extra: A = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "1300000000", ...extra,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function postBody(body: Record<string, any>): Promise<{ status: number; data: any; error?: any }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: unknown; error?: unknown };
  return { status: res.status, data: json.data, error: json.error };
}

async function check(f: TransferFormData) {
  const issue = [0, 1, 2, 3].map((st) => validateStepDetailed(st, f)).find(Boolean) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: Record<string, any> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const r = await postBody(body);
  return { issue, body, ...r, res: r.data?.result };
}

const asset = (over: A): A => ({
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular", acquisitionPrice: "", useEstimatedAcquisition: false,
  isSuccessorRightToMoveIn: true, redevApprovalDate: "2020-01-10", successorRightAcqPrice: "", successorRightAddedContribution: "",
  ...over,
});
const GIFT: A = { acquisitionCause: "gift", acquisitionDate: "2023-06-01", donorAcquisitionDate: "2021-01-01", fixedAcquisitionPrice: "300000000" };
const INH: A = { acquisitionCause: "inheritance", acquisitionDate: "2023-06-01", inheritanceStartDate: "2023-06-01", decedentAcquisitionDate: "2021-01-01", publishedValueAtInheritance: "300000000" };
const PUR: A = { acquisitionCause: "purchase", acquisitionDate: "2023-06-01", successorRightAcqPrice: "300000000" };
const LAND: A = { addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000", fixedSalePrice: "200,000,000" };
const single = (over: A) => mk([asset(over)]);
const bundle = (over: A) => mk([LAND, asset({ actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000", ...over })], { bundledSaleMode: "actual" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const companionTax = (r: { data: any }) => r.data?.aggregated?.totalDeterminedTax ?? r.data?.aggregated?.determinedTax;
const CAUSES: [string, A][] = [["증여", GIFT], ["상속", INH]];

describe.each(CAUSES)("%s 승계 입주권 — 주 자산", (_n, C) => {
  it("F-2 승계취득가액 빈칸 → ⑧ 통과 · 383,010,000(평가액 300,000,000)", async () => {
    const r = await check(single(C));
    expect(r.issue).toBeNull();
    expect(r.res.determinedTax).toBe(383_010_000);
  });
  it("남은 승계취득가액(900,000,000)은 ④가 싣지 않는다 — 취득가액은 평가액", async () => {
    const r = await check(single({ ...C, successorRightAcqPrice: "900000000" }));
    expect(r.body.acquisitionPrice).toBe(300_000_000);
    expect(r.res.determinedTax).toBe(383_010_000);
  });
  it("F-1 추가분담금 > 0 → ⑧이 거절한다(종전 조용히 빠짐)", async () => {
    const r = await check(single({ ...C, successorRightAddedContribution: "50000000" }));
    expect(r.issue?.field).toBe("successorRightAddedContribution");
    expect(String(r.issue?.message)).toContain("상속·증여로 받은 조합원입주권은 취득 후 납입한 추가분담금을 현재 버전에서 계산에 반영하지 못합니다");
  });
  it("남은 승계 산정 방식 플래그(매매사례·감정·환산)는 읽지 않는다", async () => {
    for (const f of [{ isSalesCaseAcquisition: true, similarSalesValue: "100000000" }, { isAppraisalAcquisition: true }, { useEstimatedAcquisition: true, successorRightStdPaidAtAcq: "100000000", successorRightStdPaidAtTransfer: "500000000" }]) {
      const r = await check(single({ ...C, ...f }));
      expect(r.issue).toBeNull();
      expect(r.res.determinedTax).toBe(383_010_000);
    }
  });
  it("산정 방식 술어는 실지거래가액", () => {
    expect(successorRightEstimationMode({ ...makeDefaultAsset(1), ...asset({ ...C, isSalesCaseAcquisition: true }) } as AssetForm)).toBe("actual");
  });
  it("⑥ 사이드바 취득가액 = 평가액", () => {
    expect(directAcqRaw({ ...makeDefaultAsset(1), ...asset({ ...C, successorRightAcqPrice: "900000000" }) } as AssetForm).value).toBe(300_000_000);
  });
});

describe("F-3 평가액 빈칸 — ⑧이 요구한다(종전 승계가액이 취득가액)", () => {
  it("상속 공시가격 빈칸 + 승계 100,000,000 → 상속개시일 평가액 요구", async () => {
    const r = await check(single({ ...INH, publishedValueAtInheritance: "", successorRightAcqPrice: "100000000" }));
    expect(r.issue?.field).toBe("publishedValueAtInheritance");
  });
  it("증여 신고가액 빈칸 → 증여 신고가액 요구", async () => {
    const r = await check(single({ ...GIFT, fixedAcquisitionPrice: "", successorRightAcqPrice: "300000000" }));
    expect(r.issue?.field).toBe("fixedAcquisitionPrice");
  });
});

describe.each(CAUSES)("%s 승계 입주권 — 함께 양도", (_n, C) => {
  it("승계취득가액 빈칸 → ⑧ 통과 · 200 · 남은 승계취득가액·플래그와 세액 같다", async () => {
    const r = await check(bundle(C));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
    const stale = await check(bundle({ ...C, successorRightAcqPrice: "900000000", isSalesCaseAcquisition: true, similarSalesValue: "100000000" }));
    expect(stale.issue).toBeNull();
    expect(companionTax(stale)).toBe(companionTax(r));
  });
  it("추가분담금 > 0 → ⑧ 거절", async () => {
    expect((await check(bundle({ ...C, successorRightAddedContribution: "50000000" }))).issue?.field).toBe("successorRightAddedContribution");
  });
});

describe("⑤ 승계 블록", () => {
  const fields = (a: A) => {
    const { container } = render(<SuccessorRightAcquisitionBlock asset={{ ...makeDefaultAsset(1), ...asset(a) } as AssetForm} onChange={() => {}} />);
    return {
      fields: Array.from(container.querySelectorAll("[data-field]")).map((e) => e.getAttribute("data-field")),
      radios: container.querySelectorAll('input[type="radio"]').length,
      note: container.querySelector('[data-testid="deemed-successor-right-note"]')?.textContent ?? null,
    };
  };
  it.each(CAUSES)("%s — 산정 방식·승계취득가액을 숨기고 안내와 추가분담금 칸만", (_n, C) => {
    const f = fields(C);
    expect(f.fields).not.toContain("successorRightAcqPrice");
    expect(f.fields).toContain("successorRightAddedContribution");
    expect(f.radios).toBe(0);
    expect(f.note).toContain("§163⑨");
  });
  it("매매는 종전대로 산정 방식·승계취득가액이 있다", () => {
    const f = fields(PUR);
    expect(f.fields).toContain("successorRightAcqPrice");
    expect(f.radios).toBeGreaterThan(0);
    expect(f.note).toBeNull();
  });
});

describe("가드 — 매매·이월과세·부담부증여는 그대로", () => {
  it("매매 — 승계취득가액 필수 · 추가분담금 반영(362,010,000)", async () => {
    expect((await check(single({ ...PUR, successorRightAcqPrice: "" }))).issue?.field).toBe("successorRightAcqPrice");
    const r = await check(single({ ...PUR, successorRightAddedContribution: "50000000" }));
    expect(r.issue).toBeNull();
    expect(r.res.determinedTax).toBe(362_010_000);
  });
  it("술어 — 부담부증여·이월과세·매매는 대상 아님", () => {
    const d = (a: A) => isDeemedValueSuccessorRight({ ...makeDefaultAsset(1), ...asset(a) } as AssetForm);
    expect(d(GIFT)).toBe(true);
    expect(d(INH)).toBe(true);
    expect(d({ ...GIFT, transferType: "burdened_gift" })).toBe(false);
    expect(d({ ...GIFT, acquisitionCause: "carryover_gift" })).toBe(false);
    expect(d(PUR)).toBe(false);
    expect(d({ ...GIFT, isSuccessorRightToMoveIn: false })).toBe(false);
  });
});
