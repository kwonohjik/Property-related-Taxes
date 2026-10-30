/**
 * anchor — 토지를 출자한 원조합원의 종전 토지 상속·증여 §163⑨ 단서 1호(§164④). 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §16·§17.
 *
 *   Q-1 (a) 1990.8.30. 전 상속·증여받은 종전 토지(입주권·완공 아파트)도 토지처럼 ②(§164④)와 큰 금액 — 종전: 화면에 칸이 없어
 *       입주권 1988 상속 315,810,000(①만) · 직접 호출로만 262,890,000.
 *   Q-2 (a) 토지를 출자한 완공 아파트는 주택 §164⑦ 축이 아니다 — 종전: 주택 ② 칸이 떠서 2000 상속에 §164⑦ 720,000,000 채택
 *       (232,510,000 → 86,143,333). ⑫는 출자 자산과 어긋난 ② 채널을 막는다.
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
import { PostDeemedInputs } from "@/components/calc/transfer/inheritance/PostDeemedInputs";
import { PreDeemedInputs } from "@/components/calc/transfer/inheritance/PreDeemedInputs";
import { GiftLandStdPriceSection } from "@/components/calc/transfer/GiftLandStdPriceSection";
import { isSec163_9HouseAsset } from "@/lib/calc/transfer-163-9-base-date";
import { isSec163_9LandAsset } from "@/lib/calc/transfer-163-9-base-date";
import { sec164LandFieldsAlwaysOpen } from "@/lib/calc/transfer-163-9-base-date";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type A = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any>;
const mk = (assets: A[]) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "1300000000",
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;

async function postBody(body: Body): Promise<{ status: number; data: Body; error?: Body }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: Body; error?: Body };
  return { status: res.status, data: json.data ?? {}, error: json.error };
}

async function check(f: TransferFormData) {
  const issue = [0, 1, 2, 3].map((st) => validateStepDetailed(st, f)).find(Boolean) ?? null;
  let body: Body = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const r = await postBody(body);
  return { issue, body, ...r, res: r.data?.result };
}

// 원조합원 · 토지 출자 · 인가 2015-03-01 · 권리가액 5억 · 청산금 납부 1억 · 양도 13억 · 평가액 3억 · 종전 토지 면적 200㎡
const OM = (over: A): A => ({
  addressJibun: "서울 강남구 테스트동 7-1", assetKind: "right_to_move_in", redevSubject: "right", redevApprovalLawBasis: "urban_renovation_art_74", redevOriginalAssetType: "land",
  redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01", redevRightsValue: "500000000", redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no",
  isSuccessorRightToMoveIn: false, useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000", redevSettlementAmount: "100000000", redevLandArea: "200",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular",
  acquisitionCause: "inheritance", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "1980-01-01",
  ...over,
});
const at = (dt: string): A => ({ acquisitionDate: dt, inheritanceStartDate: dt });
const APT: A = { assetKind: "redevelopment_apt", redevSubject: "apt" };
// ② §164④ = 1990.1.1. ㎡당 3,000,000 × 200㎡ × 80,000 ÷ 100,000 = 480,000,000
const GRADE: A = { pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "80000", pre1990PricePerSqm_1990: "3000000" };
const GIFT = (o: A): A => ({ acquisitionCause: "gift", donorAcquisitionDate: "1980-01-01", giftDonorRelation: "lineal", giftSameHouseholdAtTransfer: "no", publishedValueAtInheritance: "", inheritanceStartDate: "", fixedAcquisitionPrice: "300000000", ...o });
const IND: A = { inheritanceAssetKind: "house_individual", inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "3000000", inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValHousePriceAtFirst: "900000000", inhHouseValLandPricePerSqmAtInheritance: "800000" };
const issueText = (r: { issue: unknown }) => (r.issue ? String((r.issue as { message?: string }).message ?? r.issue) : "");
const field = (r: { error?: Body }, key: string) => (r.error?.fieldErrors?.[key] ?? []).join(" ");
const asset = (o: A) => ({ ...makeDefaultAsset(1), ...o }) as AssetForm;
const fields = (el: HTMLElement) => [...el.querySelectorAll("[data-field]")].map((e) => e.getAttribute("data-field"));

describe("술어 — 토지 출자 원조합원은 토지 축 · 주택 축 아님", () => {
  it.each([
    ["입주권 토지 출자", OM({}), true, false],
    ["완공 아파트 토지 출자", OM(APT), true, false],
    ["완공 아파트 주택 출자", OM({ ...APT, redevOriginalAssetType: "housing" }), false, true],
    ["입주권 주택 출자", OM({ redevOriginalAssetType: "housing" }), false, true],
    ["승계 입주권(토지 출자 값 남음)", OM({ isSuccessorRightToMoveIn: true }), false, false],
    ["승계조합원 완공 아파트(토지 출자 값 남음)", OM({ ...APT, redevIsSuccessorMember: "yes" }), false, true],
    ["토지", { assetKind: "land" }, true, false],
  ] as [string, A, boolean, boolean][])("%s → 토지 %s · 주택 %s", (_n, o, land, house) => {
    expect(isSec163_9LandAsset(asset(o))).toBe(land);
    expect(isSec163_9HouseAsset(asset(o))).toBe(house);
  });
  it("§164④ 칸은 토지 출자 원조합원이면 의제취득일 전 상속도 늘 열린다(토지 자산은 토글)", () => {
    expect(sec164LandFieldsAlwaysOpen(asset(OM(at("1984-06-01"))))).toBe(true);
    expect(sec164LandFieldsAlwaysOpen(asset({ assetKind: "land", acquisitionCause: "inheritance", ...at("1984-06-01") }))).toBe(false);
    expect(sec164LandFieldsAlwaysOpen(asset(OM({ ...at("1984-06-01"), acquisitionCause: "purchase" })))).toBe(false);
  });
});

describe("Q-1 토지 출자 원조합원 — 1990.8.30. 전 상속·증여 §164④ ②", () => {
  it.each([
    ["입주권 · 상속 1988(종전 315,810,000)", OM({ ...at("1988-06-01"), ...GRADE }), 262_890_000],
    ["완공 아파트 · 상속 1988(종전 232,510,000)", OM({ ...at("1988-06-01"), ...APT, ...GRADE }), 179_590_000],
    ["입주권 · 증여 1988(종전 315,810,000)", OM(GIFT({ acquisitionDate: "1988-06-01", ...GRADE })), 262_890_000],
    ["입주권 · 상속 1984 의제취득일 전 실가(3자 max · 종전 315,810,000)", OM({ ...at("1984-06-01"), ...GRADE }), 262_890_000],
  ] as [string, A, number][])("%s → ④ pre1990Land(면적 = 종전 토지 200㎡) · 480,000,000 채택 · %d", async (_n, a, tax) => {
    const r = await check(mk([a]));
    expect(r.issue).toBeNull();
    expect(r.body.pre1990Land?.areaSqm).toBe(200);
    expect(r.body.inheritedAcquisition.assetKind).toBe("land");
    // 엔진 자산 종류가 토지면 면적도 종전 토지 면적이다(취득 당시 면적 칸이 없는 자산 · 의제취득일 전 페이로드는 면적을 싣지 않는다)
    expect(r.body.inheritedAcquisition.landAreaM2).toBe(r.body.inheritedAcquisition.mode === "post-deemed" ? 200 : undefined);
    expect(r.status).toBe(200);
    expect(r.res.inheritedAcquisitionDetail.acquisitionPrice).toBe(480_000_000);
    expect(r.res.determinedTax).toBe(tax);
  });
  it("① 빈칸 + ② → ⑧·⑫ 통과(#2778 Q-2 ② 인정) · 262,890,000", async () => {
    const r = await check(mk([OM({ ...at("1988-06-01"), ...GRADE, publishedValueAtInheritance: "" })]));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
    expect(r.res.determinedTax).toBe(262_890_000);
  });
  it("② 일부만 → ⑧ 「모두 입력하거나 모두 비워두세요」(종전 토지 면적은 일반 칸이라 신호 아님)", async () => {
    const r = await check(mk([OM({ ...at("1988-06-01"), pre1990Grade_current: "100000" })]));
    expect(issueText(r)).toContain("§164④");
    expect(issueText(r)).toContain("모두");
    const area = await check(mk([OM(at("1988-06-01"))]));
    expect(area.issue).toBeNull();
  });
  it.each([
    ["입주권 · 상속 2010 + 남은 ② 칸(공시 후)", OM({ ...at("2010-06-01"), ...GRADE }), false, 334_290_000],
    ["입주권 · 상속 1988 ② 비움", OM(at("1988-06-01")), false, 315_810_000],
    ["승계 입주권 · 상속 1988 + 남은 ② 칸", OM({ ...at("1988-06-01"), ...GRADE, isSuccessorRightToMoveIn: true, redevApprovalDate: "1987-01-01" }), false, null],
  ] as [string, A, boolean, number | null][])("가드 — %s", async (_n, a, sent, tax) => {
    const r = await check(mk([a]));
    expect("pre1990Land" in r.body).toBe(sent);
    if (tax !== null) expect(r.res.determinedTax).toBe(tax);
  });
});

describe("Q-2 토지 출자 완공 아파트 — 주택 §164⑦ 축이 아니다", () => {
  it("2000 상속 + 남은 주택 ② 칸 → 싣지 않는다 · 232,510,000(종전 86,143,333)", async () => {
    const r = await check(mk([OM({ ...at("2000-06-01"), ...APT, ...IND })]));
    expect(r.issue).toBeNull();
    expect("inheritedHouseValuation" in r.body).toBe(false);
    expect(r.body.inheritedAcquisition.assetKind).toBe("land");
    expect(r.res.determinedTax).toBe(232_510_000);
  });
  it("가드 — 주택 출자 완공 아파트 2000 + 주택 ② → 86,143,333", async () => {
    const r = await check(mk([OM({ ...at("2000-06-01"), ...APT, ...IND, redevOriginalAssetType: "housing" })]));
    expect(r.body.inheritedAcquisition.assetKind).toBe("house_individual");
    expect(r.res.determinedTax).toBe(86_143_333);
  });
  it.each([
    ["토지 출자 + inheritedHouseValuation", OM({ ...at("2000-06-01"), ...APT, ...IND, redevOriginalAssetType: "housing" }), (b: Body) => ({ ...b, redevelopment: { ...b.redevelopment, originalAssetType: "land" } }), "inheritedHouseValuation"],
    ["토지 출자 + inheritedAcquisition.assetKind 주택", OM({ ...at("1988-06-01"), ...GRADE }), (b: Body) => ({ ...b, inheritedAcquisition: { ...b.inheritedAcquisition, assetKind: "house_apart" } }), "inheritedAcquisition.assetKind"],
    ["주택 출자 + pre1990Land", OM({ ...at("1988-06-01"), ...GRADE, redevOriginalAssetType: "housing" }), (b: Body) => ({ ...b, pre1990Land: { acquisitionDate: "1988-06-01", transferDate: "2026-02-16", areaSqm: 200, pricePerSqm_1990: 3_000_000, grade_1990_0830: { gradeValue: 100000 }, gradePrev_1990_0830: { gradeValue: 100000 }, gradeAtAcquisition: { gradeValue: 80000 } } }), "pre1990Land"],
    ["주택 출자 + inheritedAcquisition.assetKind land", OM({ ...at("1988-06-01"), redevOriginalAssetType: "housing" }), (b: Body) => ({ ...b, inheritedAcquisition: { ...b.inheritedAcquisition, assetKind: "land" } }), "inheritedAcquisition.assetKind"],
  ] as [string, A, (b: Body) => Body, string][])("⑫ 직접 호출 — %s → 400", async (_n, a, mut, key) => {
    const ok = await check(mk([a]));
    expect(ok.status).toBe(200);
    const r = await postBody(mut(ok.body));
    expect(r.status).toBe(400);
    expect(field(r, key)).toContain("출자한 원조합원");
  });
});

describe("⑤ 화면 — 토지 출자 원조합원에 §164④ 칸 · 주택 칸 없음", () => {
  const has = (el: HTMLElement, f: string) => fields(el).includes(f);
  it.each([
    ["입주권 상속 1988", OM(at("1988-06-01"))],
    ["완공 아파트 상속 1988", OM({ ...at("1988-06-01"), ...APT })],
  ] as [string, A][])("PostDeemedInputs %s — 등급 칸 있음 · 주택 칸 없음", (_n, o) => {
    const v = render(<PostDeemedInputs asset={asset(o)} onChange={() => {}} transferDate="2026-02-16" />);
    expect(has(v.container, "pre1990Grade_current")).toBe(true);
    expect(has(v.container, "inhHouseValLandArea")).toBe(false);
    v.unmount();
  });
  it("PostDeemedInputs 완공 아파트 상속 2000 — 주택 칸 없음(종전 주택 칸 있음)", () => {
    const a = render(<PostDeemedInputs asset={asset(OM({ ...at("2000-06-01"), ...APT }))} onChange={() => {}} transferDate="2026-02-16" />);
    expect(has(a.container, "inhHouseValLandArea")).toBe(false);
    a.unmount();
    const b = render(<PostDeemedInputs asset={asset(OM({ ...at("2000-06-01"), ...APT, redevOriginalAssetType: "housing" }))} onChange={() => {}} transferDate="2026-02-16" />);
    expect(has(b.container, "inhHouseValLandArea")).toBe(true);
    b.unmount();
  });
  it("PreDeemedInputs 상속 1984 — 등급 칸이 토글 없이 열린다 · 등급 계산이 ③ 분자를 덮지 않는다(남은 켜짐 래치여도)", () => {
    const onChange = vi.fn();
    const v = render(<PreDeemedInputs asset={asset(OM({ ...at("1984-06-01"), ...GRADE, pre1990Enabled: true }))} onChange={onChange} transferDate="2026-02-16" />);
    expect(has(v.container, "pre1990Grade_current")).toBe(true);
    expect(has(v.container, "pre1990Enabled")).toBe(false);
    expect(onChange.mock.calls.some(([p]) => "standardPriceAtAcq" in p)).toBe(false);
    v.unmount();
  });
  it("GiftLandStdPriceSection — 토지 출자 원조합원 증여 1988 렌더 · 승계 입주권은 안 함", () => {
    const g = asset(OM(GIFT({ acquisitionDate: "1988-06-01" })));
    const a = render(<GiftLandStdPriceSection asset={g} onChange={() => {}} transferDate="2026-02-16" />);
    expect(has(a.container, "pre1990Grade_current")).toBe(true);
    a.unmount();
    const b = render(<GiftLandStdPriceSection asset={{ ...g, isSuccessorRightToMoveIn: true } as AssetForm} onChange={() => {}} transferDate="2026-02-16" />);
    expect(b.container.innerHTML).toBe("");
  });
});

describe("컴패니언 — ② 운반 없음(범위 밖) · ⑧이 ①을 요구해 ⑫ 400 막다른 길을 막는다", () => {
  const LAND: A = { addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000", fixedSalePrice: "200,000,000" };
  const pair = (o: A) => Object.assign(mk([LAND, { ...o, actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000" }]), { bundledSaleMode: "actual" }) as TransferFormData;
  const total = (r: { data: Body }) => r.data?.aggregated?.totalDeterminedTax ?? r.data?.aggregated?.determinedTax;
  it.each([
    ["토지 출자 1988 ① 빈칸 + ②(종전: ⑧ 통과 ↔ ⑫ 400)", OM({ ...at("1988-06-01"), ...GRADE, publishedValueAtInheritance: "" })],
    ["주택 출자 2000 ① 빈칸 + ②(#2778부터 같은 막다른 길)", OM({ ...at("2000-06-01"), ...IND, redevOriginalAssetType: "housing", publishedValueAtInheritance: "" })],
  ] as [string, A][])("%s → ⑧ 「함께 양도하는 자산은 §164 기준시가로 대신 계산하지 않습니다」", async (_n, o) => {
    const r = await check(pair(o));
    expect(issueText(r)).toContain("함께 양도하는 자산은 §164 기준시가로 대신 계산하지 않습니다");
  });
  it("묶음 주 자산이 토지 출자 원조합원 — primaryInheritanceValuation 면적 = 종전 토지 · 264,570,000(master와 같음)", async () => {
    const f = Object.assign(mk([{ ...OM(at("1988-06-01")), actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000" }, LAND]), { bundledSaleMode: "actual" }) as TransferFormData;
    const r = await check(f);
    expect(r.issue).toBeNull();
    expect(r.body.primaryInheritanceValuation.assetKind).toBe("land");
    expect(r.body.primaryInheritanceValuation.landAreaM2).toBe(200);
    expect(total(r)).toBe(264_570_000);
  });
  it.each([
    ["토지 출자 1988 ①", OM(at("1988-06-01")), 264_570_000],
    ["토지 출자 2010 ①", OM(at("2010-06-01")), 283_050_000],
    ["토지 출자 완공 아파트 2010 ①", OM({ ...at("2010-06-01"), ...APT }), 205_070_000],
  ] as [string, A, number][])("가드(master와 같은 세액 · 엔진 자산 종류 land + 종전 토지 면적) — %s → %d", async (_n, o, tax) => {
    const r = await check(pair(o));
    expect(r.issue).toBeNull();
    expect(r.body.companionAssets[0].inheritanceValuation.assetKind).toBe("land");
    expect(r.body.companionAssets[0].inheritanceValuation.landAreaM2).toBe(200);
    expect(total(r)).toBe(tax);
  });
});
