/**
 * anchor — 증여받은 자산의 §163⑨ 취득가액 의제 문구. 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §13.
 *
 *   엔진 산식이 증여에도 「(상속세 신고가액)」·「보충적평가액」이었고(결과 카드 산식·배지 「보충적평가액 (공시가격)」·단계 이름 「상속 취득가액 의제」),
 *   증여는 화면이 평가방법을 묻지 않아 ④가 `reportedMethod: "supplementary"`를 채운다 — 방법 이름은 근거가 없다.
 *   문구만 바꾼다 — 결정세액 불변.
 * 결정세액은 mock 세율.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { render, screen } from "@testing-library/react";

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
import { calculateInheritanceAcquisitionPrice } from "@/lib/tax-engine/inheritance-acquisition-price";
import { InheritedAcquisitionDetailCard } from "@/components/calc/results/transfer/InheritedAcquisitionDetailCard";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";

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

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const POST_IN = { inheritanceDate: d("2015-01-01"), assetKind: "house_apart" as const, reportedValue: 300_000_000, reportedMethod: "supplementary" as const };
const PRE_IN = { inheritanceDate: d("1984-06-01"), assetKind: "land" as const, reportedValue: 300_000_000 };

describe("엔진 leaf — 문구만 바뀐다", () => {
  it("의제취득일 이후 증여 — 「증여세 신고가액」 · 방법 이름·§61 없음 · 값 같음 · isGift echo", () => {
    const r = calculateInheritanceAcquisitionPrice({ ...POST_IN, isGift: true });
    expect(r.formula).toBe("증여세 신고가액(증여일 현재 상증법 평가액) 300,000,000 적용");
    expect(r.legalBasis).toBe(TRANSFER.INHERITED_AFTER_DEEMED);
    expect(r.acquisitionPrice).toBe(300_000_000);
    expect(r.isGift).toBe(true);
  });
  it("증여에 남은 평가방법(감정평가)이 와도 방법 이름을 쓰지 않는다", () => {
    const r = calculateInheritanceAcquisitionPrice({ ...POST_IN, reportedMethod: "appraisal", isGift: true });
    expect(r.formula).not.toMatch(/감정|상속세/);
  });
  it("상속은 종전 그대로(가드)", () => {
    const r = calculateInheritanceAcquisitionPrice(POST_IN);
    expect(r.formula).toBe("보충적평가액 300,000,000원 (상속세 신고가액) 적용");
    expect(r.legalBasis).toBe(`${TRANSFER.INHERITED_AFTER_DEEMED} · ${TRANSFER.INHERITANCE_VALUATION_PRINCIPLE}`);
    expect(r.isGift).toBeUndefined();
  });
  it("의제취득일 전 — ① 이름만 증여세/상속세로 갈린다", () => {
    expect(calculateInheritanceAcquisitionPrice({ ...PRE_IN, isGift: true }).formula).toContain("① 상증법 평가액(증여세 신고가액): 300,000,000");
    expect(calculateInheritanceAcquisitionPrice(PRE_IN).formula).toContain("① 상증법 평가액(상속세 신고가액): 300,000,000");
  });
});

const H: A = { addressJibun: "서울 강남구 테스트동 5-1", assetKind: "housing", actualSalePrice: "900,000,000", fixedSalePrice: "900,000,000", transferType: "regular", acquisitionPrice: "", useEstimatedAcquisition: false, giftSameHouseholdAtTransfer: "no" };
const L: A = { addressJibun: "서울 강남구 테스트동 6-1", assetKind: "land", landNature: "standalone", actualSalePrice: "900,000,000", fixedSalePrice: "900,000,000", transferType: "regular", acquisitionArea: "300", transferArea: "300" };
const G = (dt: string): A => ({ acquisitionCause: "gift", acquisitionDate: dt, donorAcquisitionDate: "1980-01-01", giftDonorRelation: "lineal", fixedAcquisitionPrice: "300000000" });
const I = (dt: string): A => ({ acquisitionCause: "inheritance", acquisitionDate: dt, inheritanceStartDate: dt, decedentAcquisitionDate: "1980-01-01", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stepOf = (res: any) => (res.steps ?? []).find((s: { label: string }) => /취득가액 의제/.test(s.label));

describe("화면 경로(④→⑫→엔진) — 증여 문구 · 세액 불변", () => {
  it.each([
    ["증여 입주권", asset(GIFT), 383_010_000, "증여세 신고가액(증여일 현재 상증법 평가액) 300,000,000 적용"],
    ["증여 주택 2015", { ...H, ...G("2015-01-01") }, 290_610_000, "증여세 신고가액(증여일 현재 상증법 평가액) 300,000,000 적용"],
    ["증여 토지 1984", { ...L, ...G("1984-06-01") }, 257_010_000, "① 상증법 평가액(증여세 신고가액): 300,000,000"],
  ] as [string, A, number, string][])("%s", async (_n, a, tax, text) => {
    const r = await check(mk([a]));
    expect(r.status).toBe(200);
    expect(r.res.determinedTax).toBe(tax);
    expect(r.res.inheritedAcquisitionDetail.formula).toContain(text);
    expect(r.res.inheritedAcquisitionDetail.formula).not.toContain("상속세");
    expect(r.res.inheritedAcquisitionDetail.isGift).toBe(true);
    expect(stepOf(r.res).label).toBe("증여 취득가액 의제");
  });
  it("상속 주택 2015 — 종전 문구(가드) · 290,610,000", async () => {
    const r = await check(mk([{ ...H, ...I("2015-01-01") }]));
    expect(r.res.determinedTax).toBe(290_610_000);
    expect(r.res.inheritedAcquisitionDetail.formula).toBe("보충적평가액 300,000,000원 (상속세 신고가액) 적용");
    expect(r.res.inheritedAcquisitionDetail.isGift).toBeUndefined();
    expect(stepOf(r.res).label).toBe("상속 취득가액 의제");
  });
});

describe("⑦ 결과 카드 — 증여(의제취득일 이후)는 평가방법 배지를 숨긴다", () => {
  const base = { acquisitionPrice: 300_000_000, method: "supplementary" as const, legalBasis: TRANSFER.INHERITED_AFTER_DEEMED, formula: "f" };
  it("증여 — 「보충적평가액 (공시가격)」 없음", () => {
    render(<InheritedAcquisitionDetailCard detail={{ ...base, isGift: true }} />);
    expect(screen.queryByText("보충적평가액 (공시가격)")).toBeNull();
  });
  it("상속 — 배지 있음(가드)", () => {
    render(<InheritedAcquisitionDetailCard detail={base} />);
    expect(screen.getByText("보충적평가액 (공시가격)")).toBeTruthy();
  });
  it("증여 · 의제취득일 전 — 3자 max 배지는 남긴다", () => {
    render(<InheritedAcquisitionDetailCard detail={{ ...base, method: "pre_deemed_max", isGift: true, preDeemedBreakdown: { reportedAmount: 300_000_000, convertedAmount: 0, sec164Amount: null, selectedMethod: "reported" } }} />);
    expect(screen.getByText(/의제취득일 전 상속·증여 — 상증법 평가액/)).toBeTruthy();
  });
});
