/**
 * anchor — 원조합원 재개발 자산 「취득당시 토지 ㎡당 단가」의 영 §164④ 파생. 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §18.
 *
 *   Q-1 (a) 토지 출자 §166③ 분자 — 1990.8.30. 전 취득 종전 토지는 개별공시지가가 없다(법 §99③2호 → 영 §164④). 종전: 칸을 비우면 ⑧·⑫ 차단,
 *       §164④를 손으로 계산해 넣어야만 진행(매매 1987 340,976,400) · 1990.1.1. 공시지가를 넣으면 325,218,000. 이제 §164④ 칸으로 파생 · 직접 입력 우선.
 *   Q-2 (a) 주택 출자 §164⑦ 본문의 같은 칸도 같은 파생.
 * 결정세액은 mock 세율. 파생값 = 3,000,000 × 80,000 ÷ 100,000 = 2,400,000/㎡.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cleanup, render } from "@testing-library/react";

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
import { RedevelopmentValuationSection } from "@/components/calc/transfer/RedevelopmentValuationSection";
import { deriveRedevLandSec164PerSqm, redevLandSec164Applies } from "@/lib/calc/transfer-pre1990-redev-bridge";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

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
const issueText = (r: { issue: unknown }) => (r.issue ? String((r.issue as { message?: string }).message ?? r.issue) : "");
const asset = (o: A) => ({ ...makeDefaultAsset(1), ...o }) as AssetForm;
const fields = (el: HTMLElement) => [...el.querySelectorAll("[data-field]")].map((e) => e.getAttribute("data-field"));


const NOT_INH: A = { publishedValueAtInheritance: "", inheritanceStartDate: "", decedentAcquisitionDate: "", useEstimatedAcquisition: true, redevActualAcquisitionPrice: "" };
// 토지 출자 · 매매 1987 · 분모 ㎡당 6,000,000(인가 전 양도차익이 0으로 잘리지 않는 시료)
const PUR = (o: A): A => OM({ ...NOT_INH, acquisitionCause: "purchase", acquisitionDate: "1987-06-01", redevLandPricePerSqmAtApproval: "6000000", ...o });
// 주택 출자 · 매매 1988 · §164⑦ 본문 발동(최초공시 2005-04-30)
const HOUSE = (o: A): A => OM({ ...NOT_INH, redevOriginalAssetType: "housing", acquisitionCause: "purchase", acquisitionDate: "1988-06-01", redevManagementDisposalHousingPrice: "500000000",
  redevFirstDisclosureDate: "2005-04-30", redevFirstDisclosureHousingPrice: "100000000", redevLandArea: "100", redevBuildingStdPriceAtAcq: "10000000", redevLandPricePerSqmAtFirst: "800000",
  redevBuildingStdPriceAtFirst: "15000000", ...o });
// 이월과세 · 증여 2014 · 당초 증여자 취득 1987 · 이월과세 ② 환산
const CAR = (o: A): A => OM({ ...NOT_INH, acquisitionCause: "carryover_gift", acquisitionDate: "2014-06-01", useEstimatedAcquisition: false, redevLandPricePerSqmAtApproval: "6000000",
  carryover: { giftRegistryDate: "2014-06-01", donorAcquisitionDate: "1987-06-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "", useEstimatedAcquisition: true, estimationMode: null,
    giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {}, donorRelation: "spouse", donorHouseholdHoldingStartDate: "1987-06-01" }, ...o });
// 상속 1984(의제취득일 전) · 분모 ㎡당 2,000,000 — §16 시료
const INH84 = (o: A): A => OM({ ...at("1984-06-01"), useEstimatedAcquisition: true, redevActualAcquisitionPrice: "", redevLandPricePerSqmAtApproval: "2000000", ...o });
const SEC164_MSG = "1990.8.30. 전 취득이라 개별공시지가가 없습니다";

describe("술어 — 원조합원 · 환산 · 1990.8.30. 전 · 그 칸을 분자로 쓰는 분기", () => {
  it.each([
    ["토지 출자 매매 1987", PUR(GRADE), true],
    ["완공 아파트 토지 출자 매매 1987", PUR({ ...APT, ...GRADE }), true],
    ["토지 출자 매매 1990-08-29", PUR({ ...GRADE, acquisitionDate: "1990-08-29" }), true],
    ["토지 출자 매매 1990-08-30(고시일)", PUR({ ...GRADE, acquisitionDate: "1990-08-30" }), false],
    ["토지 출자 실가", PUR({ ...GRADE, useEstimatedAcquisition: false }), false],
    ["승계 입주권", PUR({ ...GRADE, isSuccessorRightToMoveIn: true }), false],
    ["승계조합원 완공 아파트", PUR({ ...APT, ...GRADE, redevIsSuccessorMember: "yes" }), false],
    ["승계조합원 입주권(조합원 유형 「승계」)", PUR({ ...GRADE, redevIsSuccessorMember: "yes" }), false],
    ["주택 출자 §164⑦ 본문 발동 1988", HOUSE(GRADE), true],
    ["주택 출자 최초공시일 비움(본문 미발동)", HOUSE({ ...GRADE, redevFirstDisclosureDate: "" }), false],
    ["이월과세 증여자 취득 1987(증여 2014)", CAR(GRADE), true],
    ["토지", { assetKind: "land", acquisitionDate: "1987-06-01", useEstimatedAcquisition: true, ...GRADE }, false],
  ] as [string, A, boolean][])("%s → %s", (_n, o, v) => {
    expect(redevLandSec164Applies(asset(o))).toBe(v);
    expect(deriveRedevLandSec164PerSqm(asset(o))).toBe(v ? 2_400_000 : null);
  });
});

describe("Q-1 토지 출자 §166③ 분자", () => {
  it.each([
    ["입주권 매매 1987", PUR(GRADE), 340_976_400],
    ["완공 아파트 매매 1987", PUR({ ...APT, ...GRADE }), 257_676_400],
    ["이월과세 증여자 취득 1987", CAR(GRADE), 341_010_000],
  ] as [string, A, number][])("%s · 분자 빈칸 + §164④ 칸 → ⑧·⑫ 통과 · 분자 480,000,000 · 손으로 2,400,000을 넣은 세액과 같다", async (_n, a, tax) => {
    const r = await check(mk([a]));
    expect(r.issue).toBeNull();
    expect(r.body.redevelopment.landStdPriceAtAcq).toBe(480_000_000);
    expect(r.status).toBe(200);
    expect(r.res.determinedTax).toBe(tax);
    const manual = await check(mk([{ ...a, ...Object.fromEntries(Object.keys(GRADE).map((k) => [k, ""])), redevLandPricePerSqmAtAcq: "2400000" }]));
    expect(manual.res.determinedTax).toBe(tax);
  });
  it("매매는 §163⑨ ② 페이로드를 싣지 않는다(파생은 분자에만)", async () => {
    const r = await check(mk([PUR(GRADE)]));
    expect("pre1990Land" in r.body).toBe(false);
  });
  it("직접 입력이 우선 — 1990.1.1. 공시지가 3,000,000을 넣으면 그 값 · 325,218,000", async () => {
    const r = await check(mk([PUR({ ...GRADE, redevLandPricePerSqmAtAcq: "3000000" })]));
    expect(r.body.redevelopment.landStdPriceAtAcq).toBe(600_000_000);
    expect(r.res.determinedTax).toBe(325_218_000);
  });
  it.each([
    ["칸 모두 빈칸", PUR({})],
    ["1990.1.1. 공시지가만", PUR({ pre1990PricePerSqm_1990: "3000000" })],
    ["등급 범위 밖", PUR({ ...GRADE, pre1990GradeMode: "number", pre1990Grade_current: "999" })],
  ] as [string, A][])("%s → ⑧ §164④ 안내(분자 칸) · ⑫ 400", async (_n, a) => {
    const r = await check(mk([a]));
    expect(issueText(r)).toContain(SEC164_MSG);
    expect((r.issue as { field?: string }).field).toBe("redevLandPricePerSqmAtAcq");
    expect(r.status).toBe(400);
  });
  it("가드 — 매매 1995 + 남은 §164④ 칸 → 파생 안 함 · 종전 안내", async () => {
    const r = await check(mk([PUR({ ...GRADE, acquisitionDate: "1995-06-01" })]));
    expect(issueText(r)).toContain("취득당시 토지 ㎡당 단가를 입력하세요");
    expect(issueText(r)).not.toContain(SEC164_MSG);
    expect(r.body.redevelopment.landStdPriceAtAcq).toBeUndefined();
  });
  it("상속 1984 — 등급 한 번 입력으로 ② 480,000,000 · ③ 600,000,000(분자 = 같은 §164④ 값) · 257,010,000", async () => {
    const r = await check(mk([INH84(GRADE)]));
    expect(r.issue).toBeNull();
    expect(r.body.redevelopment.landStdPriceAtAcq).toBe(480_000_000);
    expect(r.body.pre1990Land?.areaSqm).toBe(200);
    expect(r.res.inheritedAcquisitionDetail.acquisitionPrice).toBe(600_000_000);
    expect(r.res.inheritedAcquisitionDetail.preDeemedBreakdown.sec164Amount).toBe(480_000_000);
    expect(r.res.determinedTax).toBe(257_010_000);
  });
});

describe("Q-2 주택 출자 §164⑦ 본문 「취득시 토지 ㎡당 단가」", () => {
  it("매매 1988 · 빈칸 + §164④ 칸 → 통과 · 손으로 2,400,000을 넣은 값과 같다", async () => {
    const r = await check(mk([HOUSE(GRADE)]));
    expect(r.issue).toBeNull();
    expect(r.body.redevelopment.landPricePerSqmAtAcq).toBe(2_400_000);
    expect(r.status).toBe(200);
    const manual = await check(mk([HOUSE({ redevLandPricePerSqmAtAcq: "2400000" })]));
    expect(r.res.determinedTax).toBe(manual.res.determinedTax);
    expect(r.res.determinedTax).toBe(324_320_526);
  });
  it("빈칸 → ⑧ §164④ 안내 · 1995 취득은 종전 안내", async () => {
    expect(issueText(await check(mk([HOUSE({})])))).toContain(SEC164_MSG);
    const late = await check(mk([HOUSE({ ...GRADE, acquisitionDate: "1995-06-01" })]));
    expect(issueText(late)).toContain("공시지가 조회) 입력 필수");
    expect(late.body.redevelopment.landPricePerSqmAtAcq).toBeUndefined();
  });
});

describe("⑤ 화면 — §164④ 칸 · 분자 칸 표시값", () => {
  const view = (o: A) => render(<RedevelopmentValuationSection asset={asset(o)} onChange={() => {}} />);
  const acqInput = (el: HTMLElement) => el.querySelector<HTMLInputElement>('[data-field="redevLandPricePerSqmAtAcq"] input');
  it.each([
    ["토지 출자 매매 1987", PUR(GRADE)],
    ["이월과세 증여자 취득 1987(② 칸과 기준일이 다르다)", CAR(GRADE)],
    ["주택 출자 매매 1988(§164⑦ 본문)", HOUSE(GRADE)],
  ] as [string, A][])("%s → §164④ 칸 열림(토글 없음) · 분자 칸에 2,400,000 표시", (_n, o) => {
    const v = view(o);
    expect(v.queryByTestId("redev-land-sec164-input")).not.toBeNull();
    expect(fields(v.container)).toContain("pre1990Grade_current");
    expect(fields(v.container)).not.toContain("pre1990Enabled");
    expect(acqInput(v.container)?.value).toBe("2,400,000");
  });
  it("상속 1984 — 칸은 취득 정보의 ② 칸이 받는다 · 여기는 안내만(환산값 표시)", () => {
    const v = view(INH84(GRADE));
    expect(v.queryByTestId("redev-land-sec164-input")).toBeNull();
    expect(v.getByTestId("redev-land-sec164-shared-note").textContent).toContain("2,400,000원/㎡");
    expect(fields(v.container)).not.toContain("pre1990Grade_current");
  });
  it("가드 — 매매 1995 · 분자 칸 빈칸 · §164④ 칸 없음", () => {
    const v = view(PUR({ ...GRADE, acquisitionDate: "1995-06-01" }));
    expect(v.queryByTestId("redev-land-sec164-input")).toBeNull();
    expect(v.queryByTestId("redev-land-sec164-shared-note")).toBeNull();
    expect(acqInput(v.container)?.value).toBe("");
  });
});
