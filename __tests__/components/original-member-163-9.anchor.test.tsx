/**
 * anchor — 원조합원(재개발·재건축 종전자산) 상속·증여의 §163⑨. 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §14·§15.
 *
 *   Q-1 (a) 원조합원 입주권(종전 주택)도 완공 아파트처럼 ②(§164⑦·공동주택 §164⑥)를 비교한다 — 인가 전 상속·증여받은 것은 기존건물이다
 *       (영 §166① 취득가액 → 법 §97①1호가목 → 영 §163⑨ 단서 2호). 종전: 2000 상속 ② 7.2억을 채워도 ④가 안 실어 317,490,000(①만).
 *   Q-2 (a) 원조합원 상속·증여(의제취득일 이후)는 ① 평가액 또는 ②가 필수 — 종전: 비우면 「종전 부동산 실거래가」로 계산
 *       (입주권 상속 413,535,000 ↔ 334,290,000 · 완공 아파트 291,310,000 ↔ 232,510,000 · 컴패니언 400,035,000 ↔ 283,050,000).
 * 결정세액은 mock 세율.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { render } from "@testing-library/react";

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
import type { z } from "zod";
import { PostDeemedInputs } from "@/components/calc/transfer/inheritance/PostDeemedInputs";
import { PreDeemedInputs } from "@/components/calc/transfer/inheritance/PreDeemedInputs";
import { GiftHouseStdPriceSection } from "@/components/calc/transfer/GiftHouseStdPriceSection";
import { preDeemedShowsHouseValuation } from "@/lib/calc/pre-deemed-auto-std-price";
import { originalMemberClauseARequiredError } from "@/lib/calc/transfer-tax-validate-clause-a";
import { refineOriginalMemberDeemedPrimary } from "@/lib/api/transfer-tax-schema-original-member-deemed";
import { refineOriginalMemberDeemedCompanion } from "@/lib/api/transfer-tax-schema-original-member-deemed";

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
const LAND: A = { addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000", fixedSalePrice: "200,000,000" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const companionTax = (r: { data: any }) => r.data?.aggregated?.totalDeterminedTax ?? r.data?.aggregated?.determinedTax;


const OM = (over: A): A => ({
  addressJibun: "서울 강남구 테스트동 7-1", assetKind: "right_to_move_in", redevSubject: "right", redevApprovalLawBasis: "urban_renovation_art_74", redevOriginalAssetType: "housing",
  redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01", redevRightsValue: "500000000", redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no",
  isSuccessorRightToMoveIn: false, useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000", redevSettlementAmount: "100000000",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular",
  acquisitionCause: "inheritance", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "1980-01-01",
  ...over,
});
const at = (dt: string): A => ({ acquisitionDate: dt, inheritanceStartDate: dt });
const APT: A = { assetKind: "redevelopment_apt", redevSubject: "apt" };
const IND: A = { inheritanceAssetKind: "house_individual", inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "3000000", inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValHousePriceAtFirst: "900000000", inhHouseValLandPricePerSqmAtInheritance: "800000" };
const GIFT_OM = (o: A): A => ({ acquisitionCause: "gift", donorAcquisitionDate: "1980-01-01", giftDonorRelation: "lineal", giftSameHouseholdAtTransfer: "no", publishedValueAtInheritance: "", inheritanceStartDate: "", ...o });
const pair = (o: A) => mk([LAND, OM({ actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000", ...o })], { bundledSaleMode: "actual" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const field = (r: { error?: any }, key: string) => (r.error?.fieldErrors?.[key] ?? []).join(" ");
const issueText = (r: { issue: unknown }) => (r.issue ? String((r.issue as { message?: string }).message ?? r.issue) : "");
const Q2_MSG = "종전 부동산 실거래가로는 계산하지 않습니다";

describe("Q-1 원조합원 입주권 — ② §164⑦·⑥ (완공 아파트와 같게)", () => {
  it("상속 2000 + ② 단독주택 → ④가 싣고 720,000,000 채택 · 165,060,000(종전 317,490,000)", async () => {
    const r = await check(mk([OM({ ...at("2000-06-01"), ...IND })]));
    expect(r.issue).toBeNull();
    expect(r.body.inheritedHouseValuation).toBeDefined();
    expect(r.body.inheritedAcquisition.assetKind).toBe("house_individual");
    expect(r.res.inheritedAcquisitionDetail.acquisitionPrice).toBe(720_000_000);
    expect(r.res.determinedTax).toBe(165_060_000);
  });
  it("공동주택 「없었음」 → §164⑥ · 165,060,000", async () => {
    const r = await check(mk([OM({ ...at("2000-06-01"), ...IND, inheritanceAssetKind: "house_apart", inhApartNtsPriceExisted: "no", inhApartFirstPriceAgency: "nts", inhApartFirstPriceDate: "2006-01-01" })]));
    expect(r.body.inheritedAcquisition.apartNtsPriceExisted).toBe(false);
    expect(r.res.inheritedAcquisitionDetail.formula).toContain("§164⑥");
    expect(r.res.determinedTax).toBe(165_060_000);
  });
  it("② 일부만 → ⑧ 「모두 입력하거나 모두 비워두세요」", async () => {
    const r = await check(mk([OM({ ...at("2000-06-01"), inheritanceAssetKind: "house_individual", inhHouseValLandArea: "100" })]));
    expect(issueText(r)).toContain("§164⑤~⑦ 취득당시 기준시가는");
  });
  it("⑤ — 2000 상속 원조합원 입주권에 주택 ② 칸이 뜬다 · 승계 입주권은 안 뜬다", () => {
    const om = { ...makeDefaultAsset(1), ...OM({ ...at("2000-06-01"), inheritanceAssetKind: "house_individual" }) } as AssetForm;
    const a = render(<PostDeemedInputs asset={om} onChange={() => {}} transferDate="2026-02-16" />);
    expect(a.container.querySelector('[data-field="inhHouseValLandArea"]')).not.toBeNull();
    a.unmount();
    const succ = { ...om, isSuccessorRightToMoveIn: true } as AssetForm;
    const b = render(<PostDeemedInputs asset={succ} onChange={() => {}} transferDate="2026-02-16" />);
    expect(b.container.querySelector('[data-field="inhHouseValLandArea"]')).toBeNull();
  });
  it("⑤ 의제취득일 전(1984) 상속 · 2000 증여 — 주택 ② 칸이 뜬다(승계는 안 뜬다) · 의제 전 자동 기준시가도 주택으로 본다", () => {
    const has = (el: HTMLElement) => el.querySelector('[data-field="inhHouseValLandArea"]') !== null;
    const pre = { ...makeDefaultAsset(1), ...OM({ ...at("1984-06-01"), inheritanceAssetKind: "house_individual" }) } as AssetForm;
    const a = render(<PreDeemedInputs asset={pre} onChange={() => {}} transferDate="2026-02-16" />);
    expect(has(a.container)).toBe(true);
    a.unmount();
    const b = render(<PreDeemedInputs asset={{ ...pre, isSuccessorRightToMoveIn: true } as AssetForm} onChange={() => {}} transferDate="2026-02-16" />);
    expect(has(b.container)).toBe(false);
    b.unmount();
    expect(preDeemedShowsHouseValuation(pre)).toBe(true);
    expect(preDeemedShowsHouseValuation({ ...pre, isSuccessorRightToMoveIn: true } as AssetForm)).toBe(false);
    const gift = { ...makeDefaultAsset(1), ...OM(GIFT_OM({ acquisitionDate: "2000-06-01", fixedAcquisitionPrice: "300000000", inheritanceAssetKind: "house_individual" })) } as AssetForm;
    const c = render(<GiftHouseStdPriceSection asset={gift} onChange={() => {}} transferDate="2026-02-16" />);
    expect(has(c.container)).toBe(true);
    c.unmount();
    const d = render(<GiftHouseStdPriceSection asset={{ ...gift, isSuccessorRightToMoveIn: true } as AssetForm} onChange={() => {}} transferDate="2026-02-16" />);
    expect(has(d.container)).toBe(false);
  });
  it.each([
    ["완공 아파트 2000 + ②(가드 · 86,143,333)", OM({ ...at("2000-06-01"), ...APT, ...IND }), true, 86_143_333],
    ["입주권 2010 + 남은 ② 칸(공시 후 · 334,290,000)", OM({ ...at("2010-06-01"), ...IND }), false, 334_290_000],
    ["종전 토지 입주권 2000 + 남은 ② 칸(주택 아님 · 317,490,000)", OM({ ...at("2000-06-01"), ...IND, redevOriginalAssetType: "land" }), false, 317_490_000],
  ] as [string, A, boolean, number][])("%s", async (_n, a, sent, tax) => {
    const r = await check(mk([a]));
    expect(r.issue).toBeNull();
    expect("inheritedHouseValuation" in r.body).toBe(sent);
    expect(r.res.determinedTax).toBe(tax);
  });
  it("승계 입주권 2000 + 남은 ② 칸 — 싣지 않는다(#2772 축)", async () => {
    const r = await check(mk([asset({ acquisitionCause: "inheritance", acquisitionDate: "2000-03-01", inheritanceStartDate: "2000-03-01", decedentAcquisitionDate: "1998-01-01", publishedValueAtInheritance: "300000000", redevApprovalDate: "1999-01-01", ...IND })]));
    expect(r.issue).toBeNull();
    expect("inheritedHouseValuation" in r.body).toBe(false);
    expect(r.status).toBe(200);
  });
});

describe("Q-2 원조합원 상속·증여 — ① 평가액 또는 ② 필수", () => {
  it.each([
    ["입주권 상속 ① 빈칸(종전 413,535,000)", OM({ ...at("2010-06-01"), publishedValueAtInheritance: "" }), "상속개시일 평가액(상속세 신고가액)을 입력하세요"],
    ["완공 아파트 상속 ① 빈칸(종전 291,310,000)", OM({ ...at("2010-06-01"), ...APT, publishedValueAtInheritance: "" }), "상속개시일 평가액(상속세 신고가액)을 입력하세요"],
    ["입주권 증여 신고가액 빈칸(종전 413,535,000)", OM(GIFT_OM({ acquisitionDate: "2010-06-01", fixedAcquisitionPrice: "" })), "증여 신고가액(증여일 현재 평가액)을 입력하세요"],
  ] as [string, A, string][])("%s → ⑧ · ⑫ 400", async (_n, a, msg) => {
    const r = await check(mk([a]));
    expect(issueText(r)).toContain(msg);
    expect(r.status).toBe(400);
    expect(field(r, "inheritedAcquisition.reportedValue")).toContain(Q2_MSG);
  });
  it("① 빈칸이어도 ②가 있으면 통과 · 165,060,000", async () => {
    const r = await check(mk([OM({ ...at("2000-06-01"), ...IND, publishedValueAtInheritance: "" })]));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
    expect(r.res.determinedTax).toBe(165_060_000);
  });
  it.each([
    ["입주권 상속 ① 3억", OM(at("2010-06-01")), 334_290_000],
    ["입주권 증여 3억", OM(GIFT_OM({ acquisitionDate: "2010-06-01", fixedAcquisitionPrice: "300000000" })), 334_290_000],
  ] as [string, A, number][])("가드 — %s → 200 · %d", async (_n, a, tax) => {
    const r = await check(mk([a]));
    expect(r.issue).toBeNull();
    expect(r.res.determinedTax).toBe(tax);
  });
  it("의제취득일 전(1984) ① 빈칸 — 이 규칙이 아니다(§166③ 3자 max 기존 규칙)", async () => {
    const r = await check(mk([OM({ ...at("1984-06-01"), publishedValueAtInheritance: "" })]));
    expect(issueText(r)).not.toContain(Q2_MSG);
    expect(field(r, "inheritedAcquisition.reportedValue")).not.toContain(Q2_MSG);
  });
  it("컴패니언 상속 ① 빈칸 → ⑧ · ⑫ 400(종전 400,035,000) · ① 3억 200 · 283,050,000", async () => {
    const bad = await check(pair({ ...at("2010-06-01"), publishedValueAtInheritance: "" }));
    expect(issueText(bad)).toContain("상속개시일 평가액(상속세 신고가액)을 입력하세요");
    expect(field(bad, "companionAssets.0.inheritanceValuation.publishedValueAtInheritance")).toContain(Q2_MSG);
    const ok = await check(pair(at("2010-06-01")));
    expect(ok.status).toBe(200);
    expect(companionTax(ok)).toBe(283_050_000);
  });
  it("컴패니언 증여 빈칸 → ⑫ 400 · 3억 → 200 · 283,050,000", async () => {
    const bad = await check(pair(GIFT_OM({ acquisitionDate: "2010-06-01", fixedAcquisitionPrice: "" })));
    expect(field(bad, "companionAssets.0.fixedAcquisitionPrice")).toContain(Q2_MSG);
    const ok = await check(pair(GIFT_OM({ acquisitionDate: "2010-06-01", fixedAcquisitionPrice: "300000000" })));
    expect(ok.status).toBe(200);
    expect(companionTax(ok)).toBe(283_050_000);
  });
  it("leaf — 승계·부담부증여·이월과세·매매·재개발 아님은 대상이 아니다", () => {
    const base = { ...makeDefaultAsset(1), ...OM({ ...at("2010-06-01"), publishedValueAtInheritance: "" }) } as AssetForm;
    expect(originalMemberClauseARequiredError(base, "자산")).toContain(Q2_MSG);
    expect(originalMemberClauseARequiredError({ ...base, acquisitionDate: "1984-12-31", inheritanceStartDate: "1984-12-31" } as AssetForm, "자산")).toBeNull();
    expect(originalMemberClauseARequiredError({ ...base, acquisitionDate: "1985-01-01", inheritanceStartDate: "1985-01-01" } as AssetForm, "자산")).toContain(Q2_MSG);
    for (const over of [{ isSuccessorRightToMoveIn: true }, { redevIsSuccessorMember: "yes" }, { transferType: "burdened_gift" }, { acquisitionCause: "carryover_gift" }, { acquisitionCause: "purchase" }, { assetKind: "housing" }] as Partial<AssetForm>[]) {
      expect(originalMemberClauseARequiredError({ ...base, ...over } as AssetForm, "자산")).toBeNull();
    }
    const run = (d: Record<string, unknown>) => {
      const issues: unknown[] = [];
      refineOriginalMemberDeemedPrimary(d, { addIssue: (x: unknown) => issues.push(x) } as unknown as z.RefinementCtx);
      return issues.length;
    };
    const p = { propertyType: "right_to_move_in", redevelopment: { isSuccessorMember: false }, acquisitionCause: "inheritance", acquisitionDate: "2010-06-01" };
    expect(run(p)).toBe(1);
    expect(run({ ...p, inheritedAcquisition: { reportedValue: 1 } })).toBe(0);
    expect(run({ ...p, inheritedHouseValuation: {} })).toBe(0);
    expect(run({ ...p, redevelopment: { isSuccessorMember: true } })).toBe(0);
    expect(run({ ...p, isSuccessorRightToMoveIn: true })).toBe(0);
    expect(run({ ...p, transferType: "burdened_gift" })).toBe(0);
    expect(run({ ...p, burdenedGiftInfo: {} })).toBe(0);
    expect(run({ ...p, acquisitionDate: "1984-12-31" })).toBe(0);
    expect(run({ ...p, acquisitionDate: "1985-01-01" })).toBe(1);
    expect(run({ ...p, propertyType: "housing" })).toBe(0);
    expect(run({ ...p, redevelopment: null })).toBe(0);
    expect(run({ ...p, acquisitionCause: "gift" })).toBe(1);
    const runC = (c: Record<string, unknown>) => {
      const issues: unknown[] = [];
      refineOriginalMemberDeemedCompanion(c, { addIssue: (x: unknown) => issues.push(x) } as unknown as z.RefinementCtx, ["companionAssets", 0]);
      return issues.length;
    };
    const c = { assetKind: "redevelopment_apt", redevelopment: {}, acquisitionCause: "inheritance", inheritanceValuation: { inheritanceDate: "2010-06-01", publishedValueAtInheritance: 0 } };
    expect(runC(c)).toBe(1);
    expect(runC({ ...c, inheritanceValuation: { inheritanceDate: "2010-06-01", publishedValueAtInheritance: 1 } })).toBe(0);
    expect(runC({ ...c, inheritedHouseValuation: {} })).toBe(0);
    expect(runC({ ...c, inheritanceValuation: { inheritanceDate: "1984-06-01", publishedValueAtInheritance: 0 } })).toBe(0);
  });
});
