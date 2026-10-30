/**
 * anchor — 재개발(§166) 원조합원 × 이월과세(비부담부증여): 「소득세법 시행령」 제164조 제7항(공시되기 전에 취득한 주택) 판정과 「취득당시」 칸 조회 기준일을
 * 당초 증여자 취득일로 본다(「소득세법」 제97조의2 제1항 제1호 — 엔진 A와 같은 날짜).
 * 계획서 `docs/02-design/features/redev-carryover-phd-donor-date.plan.md`(사용자 결정 Q-1 a · Q-2 a · Q-3 a).
 *
 * 종전(실측 §1.2): ⑤·⑧·④·⑫가 증여 등기일로 판정 — 공시 전 증여자 · 공시 후 증여면 화면이 §164⑦ 칸을 숨기고 그때 공시되지 않은
 * 「취득당시 개별주택공시가격」으로 A를 계산했다(300,849,600). 결정세액은 mock 세율.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
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
// 조회 칸은 기준일(prop)만 본다 — 외부 조회 API는 이 anchor의 범위가 아니다(계획서 V-1).
vi.mock("@/components/calc/inputs/StandardPriceInput", () => ({
  StandardPriceInput: (p: { "data-field"?: string; referenceDate?: string; hint?: string }) => (
    <div data-probe={p["data-field"]} data-ref={p.referenceDate ?? ""} data-hint={p.hint ?? ""} />
  ),
}));
vi.mock("@/components/calc/inputs/LandPriceLookupField", () => ({
  LandPriceLookupField: (p: { "data-field"?: string; referenceDate?: string; hint?: string }) => (
    <div data-probe={p["data-field"]} data-ref={p.referenceDate ?? ""} data-hint={p.hint ?? ""} />
  ),
}));
vi.mock("@/components/calc/building-std-price/BuildingStdPriceModalButton", () => ({
  BuildingStdPriceModalButton: (p: { prefill?: { acquisitionDate?: string; acqLandPricePerSqm?: string } }) => (
    <div data-probe="bsp-modal" data-ref={p.prefill?.acquisitionDate ?? ""} data-acq-land={p.prefill?.acqLandPricePerSqm ?? ""} />
  ),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { redevPreApprovalAcquisitionDate } from "@/lib/calc/redev-carryover-acq-mode";
import { isRedevPhdSectionActive, isRedevPhdTriggered } from "@/lib/calc/redev-phd-trigger";
import { RedevelopmentValuationSection } from "@/components/calc/transfer/RedevelopmentValuationSection";
import { refineRedevelopment166_3Inputs } from "@/lib/api/transfer-tax-schema-redev-166-3-refines";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

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

const DONOR2000: A = { donorAcquisitionDate: "2000-03-01", donorHouseholdHoldingStartDate: "2000-03-01" };
const asset = (over: A, car: A): A => ({
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01", acquisitionPrice: "",
  useEstimatedAcquisition: false, redevActualAcquisitionPrice: "",
  redevManagementDisposalHousingPrice: "500000000", redevAcquisitionHousingPrice: "20000000", redevFirstDisclosureDate: "2005-04-30",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "", useEstimatedAcquisition: true, estimationMode: null,
    giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {}, donorRelation: "lineal", donorHouseholdHoldingStartDate: "2012-01-01", ...car,
  },
  ...over,
});
/** §164⑦ 칸 — 최초공시 주택가격 100,000,000 · 면적 100㎡ · 공시지가 500,000/800,000 · 건물 10,000,000/15,000,000 → 환산 개별주택가격 63,157,894 · 인가 전 분 113,684,209 */
const PHD: A = {
  redevFirstDisclosureHousingPrice: "100000000", redevLandArea: "100",
  redevLandPricePerSqmAtAcq: "500000", redevBuildingStdPriceAtAcq: "10000000", redevLandPricePerSqmAtFirst: "800000", redevBuildingStdPriceAtFirst: "15000000",
};
const APT: A = { assetKind: "redevelopment_apt", redevSubject: "apt", redevCompletionDate: "2025-09-01" };
const co = (r: { res?: { carryoverTaxationDetail?: { adoptedScenario?: string; scenarioA?: { acquisitionPrice?: number } } } }) =>
  [r.res?.carryoverTaxationDetail?.adoptedScenario, r.res?.carryoverTaxationDetail?.scenarioA?.acquisitionPrice];

describe("판정 기준일 leaf — 범위 안이면 당초 증여자 취득일", () => {
  it("이월과세 원조합원 입주권·완공 아파트 → 증여자 취득일 · 매매·부담부증여·승계 → 자산 취득일", () => {
    const base = { acquisitionDate: "2023-06-01", acquisitionCause: "carryover_gift", carryover: { donorAcquisitionDate: "2000-03-01" } };
    expect(redevPreApprovalAcquisitionDate({ ...base, assetKind: "right_to_move_in" })).toBe("2000-03-01");
    expect(redevPreApprovalAcquisitionDate({ ...base, assetKind: "redevelopment_apt" })).toBe("2000-03-01");
    expect(redevPreApprovalAcquisitionDate({ ...base, assetKind: "right_to_move_in", acquisitionCause: "purchase" })).toBe("2023-06-01");
    expect(redevPreApprovalAcquisitionDate({ ...base, assetKind: "redevelopment_apt", transferType: "burdened_gift" })).toBe("2023-06-01");
    expect(redevPreApprovalAcquisitionDate({ ...base, assetKind: "redevelopment_apt", redevIsSuccessorMember: "yes" })).toBe("2023-06-01");
    expect(redevPreApprovalAcquisitionDate({ ...base, assetKind: "right_to_move_in", carryover: { donorAcquisitionDate: "" } })).toBeUndefined();
  });
  it("§164⑦ 트리거·결과 계산서 게이트(저장 input_data)도 같은 날짜 — 증여자 2000은 발동 · 2012는 미발동", () => {
    const a = asset({}, DONOR2000);
    expect(isRedevPhdTriggered(a as never)).toBe(true);
    expect(isRedevPhdSectionActive(a as never)).toBe(true);
    expect(isRedevPhdTriggered(asset({}, {}) as never)).toBe(false);
  });
});

describe("계획서 §1.2 — ⑧ → ④ → route (증여자 2000-03-01 · 증여 2023-06-01 · 최초공시 2005-04-30)", () => {
  it("P2 §164⑦ 칸 없이 「취득당시」 칸만 — ⑧이 §164⑦ 칸을 요구한다(종전 A 300,849,600 · Q-3 a)", async () => {
    const { issue } = await check(mk([asset({}, DONOR2000)]));
    expect(issue?.field).toBe("redevFirstDisclosureHousingPrice");
  });
  it("P3 §164⑦ 칸 · 「취득당시」 칸 비움 — ⑧ 통과 · ⑫ 통과 · B 299,010,000(A 취득가액 313,684,209)", async () => {
    const r = await check(mk([asset({ ...PHD, redevAcquisitionHousingPrice: "" }, DONOR2000)]));
    expect(r.issue).toBeNull();
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect([r.res.determinedTax, ...co(r)]).toEqual([299_010_000, "B", 313_684_209]);
  });
  it("P1 §164⑦ 칸 + 「취득당시」 칸 — 같은 값(§164⑦이 우선)", async () => {
    const r = await check(mk([asset(PHD, DONOR2000)]));
    expect([r.issue, r.res.determinedTax, ...co(r)]).toEqual([null, 299_010_000, "B", 313_684_209]);
  });
  it("P4 건물 기준시가 두 칸 비움 — ④가 0으로 실어 §164⑦ 적용(종전 「취득당시」 칸으로 대체 300,849,600) · A 취득가액 312,500,000", async () => {
    const r = await check(mk([asset({ ...PHD, redevBuildingStdPriceAtAcq: "", redevBuildingStdPriceAtFirst: "" }, DONOR2000)]));
    expect([r.body.redevelopment.buildingStdPriceAtAcq, r.body.redevelopment.buildingStdPriceAtFirst]).toEqual([0, 0]);
    expect([r.issue, r.res.determinedTax, ...co(r)]).toEqual([null, 299_010_000, "B", 312_500_000]);
  });
  it("P6 완공 아파트 — 같은 판정 · B 299,010,000(A 취득가액 313,684,209)", async () => {
    const r = await check(mk([asset({ ...APT, ...PHD, redevAcquisitionHousingPrice: "" }, DONOR2000)]));
    expect([r.issue, r.status, r.res.determinedTax, ...co(r)]).toEqual([null, 200, 299_010_000, "B", 313_684_209]);
  });
  it("P5 대조 — 공시 후 증여자(2012)는 그대로 322,607,280 · 「취득당시」 칸이 비면 ⑧ 문구가 증여자 취득일 기준임을 밝힌다", async () => {
    const r = await check(mk([asset(PHD, {})]));
    expect([r.issue, r.res.determinedTax, ...co(r)]).toEqual([null, 322_607_280, "A", 236_000_000]);
    const e = await check(mk([asset({ redevAcquisitionHousingPrice: "" }, {})]));
    expect(e.issue?.field).toBe("redevAcquisitionHousingPrice");
    expect(e.issue?.message).toContain("이월과세는 당초 증여자 취득일 기준");
  });
  it("P7 대조 — ② 실가(증여자 취득가액 100,000,000)는 §164⑦과 무관 · B 299,010,000", async () => {
    const r = await check(mk([asset(PHD, { ...DONOR2000, useEstimatedAcquisition: false, donorAcquisitionPrice: "100000000" })]));
    expect([r.issue, r.res.determinedTax, ...co(r)]).toEqual([null, 299_010_000, "B", 300_000_000]);
  });
  it("P8 대조 — 이월과세가 아닌 매매(2000)는 자산 취득일로 판정 · 277,629,790", async () => {
    const r = await check(mk([asset({ ...PHD, redevAcquisitionHousingPrice: "", acquisitionCause: "purchase", acquisitionDate: "2000-03-01", carryover: undefined, useEstimatedAcquisition: true }, {})]));
    expect([r.issue, r.res.determinedTax, r.res.redevelopmentDetail.preApproval.apportionedAcquisition]).toEqual([null, 277_629_790, 113_684_209]);
  });
});

describe("⑫ — 화면 밖(route 직접 호출)·컴패니언도 증여자 취득일", () => {
  it("주 자산 body에서 「취득당시」 칸을 빼도 §164⑦ 칸이 있으면 200 — 증여 등기일로 보면 400이었다", async () => {
    const { body } = await check(mk([asset(PHD, DONOR2000)]));
    const redevelopment = { ...body.redevelopment };
    delete redevelopment.acquisitionHousingPrice;
    const r = await postBody({ ...body, redevelopment });
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(r.data.result.determinedTax).toBe(299_010_000);
  });
  it("주 자산 body — 증여자 2012(공시 후)면 같은 body가 400(「취득당시」 칸 필수)", async () => {
    const { body } = await check(mk([asset(PHD, {})]));
    const redevelopment = { ...body.redevelopment };
    delete redevelopment.acquisitionHousingPrice;
    const r = await postBody({ ...body, redevelopment });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("redevelopment.acquisitionHousingPrice");
  });
  it("컴패니언 — 토지(주) + 입주권 이월과세(증여자 2000) · 「취득당시」 칸 비움 · §164⑦ 칸 → ⑧ 통과 · 200 · A 취득가액 313,684,209(B 채택)", async () => {
    const primary = { addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000", fixedSalePrice: "200,000,000" };
    const comp = asset({ ...PHD, redevAcquisitionHousingPrice: "", actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000" }, DONOR2000);
    const r = await check(mk([primary, comp], { bundledSaleMode: "actual" }));
    expect(r.issue).toBeNull();
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    const p1 = r.data.aggregated.properties[1];
    expect([p1.carryoverTaxationDetail.adoptedScenario, p1.carryoverTaxationDetail.scenarioA.acquisitionPrice]).toEqual(["B", 313_684_209]);
  });
});

describe("⑫ 직접 — 부담부증여는 범위 밖(증여 등기일 그대로 · 계획서 V-7)", () => {
  const issues = (data: Record<string, unknown>) => {
    const out: string[] = [];
    refineRedevelopment166_3Inputs(data as never, { addIssue: (i: { path: (string | number)[] }) => out.push(i.path.join(".")) } as never);
    return out;
  };
  const rd = { subject: "right", originalAssetType: "housing", managementDisposalHousingPrice: 500_000_000, firstDisclosureDate: "2005-04-30", firstDisclosureHousingPrice: 100_000_000, landArea: 100, landPricePerSqmAtAcq: 500_000, buildingStdPriceAtAcq: 10_000_000, landPricePerSqmAtFirst: 800_000, buildingStdPriceAtFirst: 15_000_000 };
  const base = { redevelopment: rd, useEstimatedAcquisition: true, acquisitionDate: "2023-06-01", carryoverTaxation: { donorAcquisitionDate: "2000-03-01" } };
  it("이월과세 · 부담부증여 아님 → 증여자 취득일 · 「취득당시」 칸 없어도 통과", () => {
    expect(issues(base)).toEqual([]);
  });
  it("주 자산 부담부증여(`transferType`) · 컴패니언 부담부증여(`burdenedGiftInfo`) → 증여 등기일 · 「취득당시」 칸 요구", () => {
    expect(issues({ ...base, transferType: "burdened_gift" })).toEqual(["redevelopment.acquisitionHousingPrice"]);
    expect(issues({ ...base, burdenedGiftInfo: {} })).toEqual(["redevelopment.acquisitionHousingPrice"]);
  });
});

describe("⑤ 화면 — §164⑦ 블록과 「취득당시」 칸 조회 기준일(Q-2 a)", () => {
  const probe = (field: string) => document.querySelector(`[data-probe="${field}"]`);
  it("증여자 2000 · 증여 2023 → §164⑦ 블록 · 취득시 공시지가 조회·계산서 prefill 기준일은 증여자 취득일 · hint에 그 날짜", () => {
    render(<RedevelopmentValuationSection asset={{ ...makeDefaultAsset(1), ...asset(PHD, DONOR2000) } as AssetForm} onChange={() => {}} />);
    expect(probe("redevAcquisitionHousingPrice")).toBeNull();
    expect(probe("redevFirstDisclosureHousingPrice")).not.toBeNull();
    expect(probe("redevLandPricePerSqmAtAcq")?.getAttribute("data-ref")).toBe("2000-03-01");
    expect(probe("redevLandPricePerSqmAtAcq")?.getAttribute("data-hint")).toContain("당초 증여자 취득일(2000-03-01)");
    expect(probe("bsp-modal")?.getAttribute("data-ref")).toBe("2000-03-01");
    // 2000년 이하 취득은 계산서 모달에 취득시 공시지가를 미리 채우지 않는다(`prefillAcqLandPrice` — 2001.1.1 현재 공시지가 트랙) — 증여 등기일(2023)로 보면 채웠다.
    expect(probe("bsp-modal")?.getAttribute("data-acq-land")).toBe("");
  });
  it("증여자 2012(공시 후) → 「취득당시 개별주택공시가격」 조회 기준일이 증여 등기일이 아니라 증여자 취득일", () => {
    render(<RedevelopmentValuationSection asset={{ ...makeDefaultAsset(1), ...asset({}, {}) } as AssetForm} onChange={() => {}} />);
    expect(probe("redevAcquisitionHousingPrice")?.getAttribute("data-ref")).toBe("2012-01-01");
    expect(probe("redevAcquisitionHousingPrice")?.getAttribute("data-hint")).toContain("당초 증여자 취득일(2012-01-01)");
  });
  it("토지 출자 입주권 — 「취득당시 토지 ㎡당 단가」 조회 기준일도 증여자 취득일", () => {
    render(<RedevelopmentValuationSection asset={{ ...makeDefaultAsset(1), ...asset({ redevOriginalAssetType: "land" }, {}) } as AssetForm} onChange={() => {}} />);
    expect(probe("redevLandPricePerSqmAtAcq")?.getAttribute("data-ref")).toBe("2012-01-01");
    expect(probe("redevLandPricePerSqmAtAcq")?.getAttribute("data-hint")).toContain("당초 증여자 취득일(2012-01-01)");
  });
  it("미리보기 — 같은 화면에서 증여자 취득일만 2012 → 2000으로 고치면 §164⑦ 환산(113,684,209)으로 다시 그린다", () => {
    const at = (car: A) => ({ ...makeDefaultAsset(1), ...asset(PHD, car) }) as AssetForm;
    const { container, rerender } = render(<RedevelopmentValuationSection asset={at({})} onChange={() => {}} />);
    expect(container.textContent).toContain("= 36,000,000");
    rerender(<RedevelopmentValuationSection asset={at(DONOR2000)} onChange={() => {}} />);
    expect(container.textContent).toContain("= 113,684,209");
  });
  it("대조 — 매매 자산은 자산 취득일 · hint에 이월과세 문구 없음", () => {
    render(<RedevelopmentValuationSection asset={{ ...makeDefaultAsset(1), ...asset({ acquisitionCause: "purchase", acquisitionDate: "2012-05-01", useEstimatedAcquisition: true }, {}) } as AssetForm} onChange={() => {}} />);
    expect(probe("redevAcquisitionHousingPrice")?.getAttribute("data-ref")).toBe("2012-05-01");
    expect(probe("redevAcquisitionHousingPrice")?.getAttribute("data-hint")).not.toContain("이월과세");
  });
});
