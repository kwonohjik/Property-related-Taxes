/**
 * anchor — 재개발(§166) 원조합원 × 이월과세(비부담부증여) 검증 범위. 계획서 `docs/02-design/features/redev-carryover-validation-scope.plan.md`.
 *
 *   F-1 이월과세 재개발 자산은 취득일 칸이 화면에 없다 — ⑧이 ④와 같은 leaf(원값 → 증여 등기일)로 취득일을 읽는다(종전 「취득일을 입력하세요」 막다른 길).
 *   F-2 ⑧ 재개발 분기도 증여 사건 칸(가업상속·날짜·관계·평가액 / 음수·채무·세대)을 본다(종전 통과 → 200 · 이월과세 미적용·B 취득가액 0 등).
 *       ⑫ 주 자산 재개발에도 `carryoverTaxation` 필수 + `refineCarryoverTaxation(…, rejectOtherRelation=false)`(종전 `ownValuation`이라 건너뜀).
 *   F-3 함께 양도 — ⑧이 같은 칸을 먼저 막는다(종전 ⑧ 통과 → ⑫ 400).
 * 승계조합원·승계 입주권·부담부증여는 범위 밖(종전 그대로). 결정세액은 mock 세율.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const asset = (over: A, car: A): A => ({
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01", acquisitionPrice: "",
  useEstimatedAcquisition: false, redevActualAcquisitionPrice: "",
  redevManagementDisposalHousingPrice: "500000000", redevAcquisitionHousingPrice: "20000000",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "", useEstimatedAcquisition: true, estimationMode: null,
    giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {}, donorRelation: "lineal", donorHouseholdHoldingStartDate: "2012-01-01", ...car,
  },
  ...over,
});
const ACT: A = { useEstimatedAcquisition: false, donorAcquisitionPrice: "100000000" };
const APT: A = { assetKind: "redevelopment_apt", redevSubject: "apt", redevCompletionDate: "2025-09-01" };
const LAND: A = { addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000", fixedSalePrice: "200,000,000" };
const bundle = (over: A, car: A) => mk([LAND, asset({ actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000", ...over }, car)], { bundledSaleMode: "actual" });

describe("F-1 취득일 — 칸이 없는 이월과세 재개발 자산", () => {
  it.each([
    ["입주권 · ② 환산", {}, {}, 322_607_280],
    ["입주권 · ② 실가", {}, ACT, 302_370_000],
    ["완공 아파트 · ② 환산", APT, {}, 299_010_000],
  ] as const)("%s · 취득일 빈칸 → ⑧ 통과 · ④ 증여 등기일 · 취득일을 채운 것과 같은 세액(종전 「취득일을 입력하세요」)", async (_n, over, car, tax) => {
    const r = await check(mk([asset({ ...over, acquisitionDate: "" }, car)]));
    expect(r.issue).toBeNull();
    expect(r.body.acquisitionDate).toBe("2023-06-01");
    expect(r.status).toBe(200);
    expect(r.res.determinedTax).toBe(tax);
    expect((await check(mk([asset(over, car)]))).res.determinedTax).toBe(tax);
  });
  it("함께 양도 · 취득일 빈칸 → ⑧ 통과 · 200", async () => {
    const r = await check(bundle({ acquisitionDate: "" }, {}));
    expect(r.issue).toBeNull();
    expect(r.body.companionAssets[0].acquisitionDate).toBe("2023-06-01");
    expect(r.status).toBe(200);
  });
  it("증여 등기일이 인가일 뒤 · 취득일 빈칸 → 인가일 비교도 증여 등기일로 한다(redevApprovalDate)", async () => {
    const r = await check(mk([asset({ acquisitionDate: "" }, { giftRegistryDate: "2024-06-01" })]));
    expect(r.issue?.field).toBe("redevApprovalDate");
  });
  it("매매 재개발 취득일 빈칸은 종전대로 막는다", async () => {
    const r = await check(mk([asset({ acquisitionCause: "purchase", acquisitionDate: "", redevActualAcquisitionPrice: "100000000" }, {})]));
    expect(r.issue?.field).toBe("acquisitionDate");
  });
});

const DEFECTS = [
  ["D1 증여 등기일 빈칸", { giftRegistryDate: "" }, "carryover.giftRegistryDate"],
  ["D2 증여자 취득일 빈칸", { donorAcquisitionDate: "", donorHouseholdHoldingStartDate: "" }, "carryover.donorAcquisitionDate"],
  ["D3 증여자 취득일 ≥ 증여 등기일", { donorAcquisitionDate: "2023-07-01", donorHouseholdHoldingStartDate: "" }, "carryover.donorAcquisitionDate"],
  ["D5 관계 그 외", { donorRelation: "other" }, "acquisitionCause"],
  ["D6 사망 · 관계 빈칸", { donorRelation: "", donorDeceased: true }, "carryover.donorRelation"],
  ["D7 증여 당시 평가액 빈칸", { giftDateValuation: "" }, "carryover.giftDateValuation"],
  ["D8 가업상속공제", { exclusionDeclared: { isFamilyBusinessInheritedAsset: true } }, undefined],
  ["D9 인수채무 토글(재개발 미지원)", { giftDebtAssumed: true, giftAssumedDebt: "50000000" }, "carryover.giftDebtAssumed"],
  ["D13 증여세 상당액 음수", { giftTaxAmount: "-1" }, "carryover.giftTaxAmount"],
] as const;

describe("F-2 ⑧ 주 자산 — 증여 사건 칸", () => {
  it.each(DEFECTS)("입주권 · %s → ⑧ 차단", async (_n, car, field) => {
    const r = await check(mk([asset({}, car)]));
    expect(r.issue).not.toBeNull();
    expect(r.issue?.field).toBe(field);
  });
  it.each(DEFECTS)("완공 아파트 · %s → ⑧ 차단", async (_n, car, field) => {
    const r = await check(mk([asset(APT, car)]));
    expect(r.issue?.field).toBe(field);
  });
  it("D8 문구 — 가업상속공제 미지원", async () => {
    expect(String((await check(mk([asset({}, { exclusionDeclared: { isFamilyBusinessInheritedAsset: true } })]))).issue?.message)).toContain("가업상속공제 적용 자산은 현재 버전에서 지원하지 않습니다");
  });
  it("D11 완공 아파트 · 같은 세대 질문 빈칸 → ⑧ 차단(입주권은 질문이 없어 통과)", async () => {
    expect((await check(mk([asset(APT, { donorSameHousehold: "" })]))).issue?.field).toBe("carryover.donorSameHousehold");
    expect((await check(mk([asset({}, { donorSameHousehold: "" })]))).issue).toBeNull();
  });
  it("증여 사건 칸이 먼저 — 평가액 빈칸 + 증여자 취득가액 빈칸(② 실가)은 평가액부터", async () => {
    expect((await check(mk([asset({}, { useEstimatedAcquisition: false, donorAcquisitionPrice: "", giftDateValuation: "" })]))).issue?.field).toBe("carryover.giftDateValuation");
  });
  it("음수·채무가 증여자 취득가액 다음 — 증여자 취득가액 빈칸 + 증여세 음수는 증여자 취득가액부터", async () => {
    expect((await check(mk([asset({}, { useEstimatedAcquisition: false, donorAcquisitionPrice: "", giftTaxAmount: "-1" })]))).issue?.field).toBe("carryover.donorAcquisitionPrice");
  });
  it.each([["입주권 · ② 환산", {}, {}, 322_607_280], ["입주권 · ② 실가", {}, ACT, 302_370_000], ["완공 아파트 · ② 실가", APT, ACT, 299_010_000]] as const)(
    "정상 입력 %s → 통과 · 세액 불변", async (_n, over, car, tax) => {
      const r = await check(mk([asset(over, car)]));
      expect(r.issue).toBeNull();
      expect(r.res.determinedTax).toBe(tax);
    });
});

describe("F-2 ⑫ 주 자산 재개발 — 화면 밖 body", () => {
  async function valid() {
    return (await check(mk([asset({}, {})]))).body;
  }
  it("carryoverTaxation 없음 → 400 (종전 200 · 이월과세 미적용 411,465,000)", async () => {
    const { carryoverTaxation: _ct, ...rest } = await valid();
    void _ct;
    const r = await postBody(rest);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain('"carryoverTaxation"');
  });
  it.each([
    ["증여 당시 평가액 0 (종전 B 취득가액 0 · 427,935,000)", { giftDateValuation: 0 }, "carryoverTaxation.giftDateValuation"],
    ["증여자 취득일 ≥ 증여 등기일", { donorAcquisitionDate: "2023-07-01" }, "carryoverTaxation.donorAcquisitionDate"],
    ["사망 · 관계 없음", { donorDeceased: true, donorRelation: undefined }, "carryoverTaxation.donorRelation"],
    ["가업상속공제", { exclusionDeclared: { isFamilyBusinessInheritedAsset: true } }, "carryoverTaxation.exclusionDeclared"],
  ] as const)("%s → 400", async (_n, patch, path) => {
    const b = await valid();
    const r = await postBody({ ...b, carryoverTaxation: { ...b.carryoverTaxation, ...patch } });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain(path);
  });
  it("관계 「그 외」 → 200 · B 299,010,000 (주 자산은 엔진이 미적용으로 판정 — 비재개발 주 자산과 같다)", async () => {
    const b = await valid();
    const r = await postBody({ ...b, carryoverTaxation: { ...b.carryoverTaxation, donorRelation: "other" } });
    expect(r.status).toBe(200);
    expect(r.data.result.determinedTax).toBe(299_010_000);
  });
  it("승계조합원 body는 이 블록 밖 — 증여 당시 평가액 0이어도 그 경로로 막지 않는다", async () => {
    const b = await valid();
    const r = await postBody({ ...b, redevelopment: { ...b.redevelopment, isSuccessorMember: true }, carryoverTaxation: { ...b.carryoverTaxation, giftDateValuation: 0 } });
    expect(JSON.stringify(r.error ?? {})).not.toContain("carryoverTaxation.giftDateValuation");
  });
});

describe("F-3 함께 양도 — ⑧이 먼저 막는다(종전 ⑧ 통과 → ⑫ 400)", () => {
  it.each([
    ["증여 당시 평가액 빈칸", { giftDateValuation: "" }, "carryover.giftDateValuation"],
    ["관계 그 외", { donorRelation: "other" }, "acquisitionCause"],
    ["증여 등기일 빈칸", { giftRegistryDate: "" }, "carryover.giftRegistryDate"],
  ] as const)("입주권 · %s", async (_n, car, field) => {
    const r = await check(bundle({}, car));
    expect(r.issue?.field).toBe(field);
  });
  it("정상 입력은 통과 · 200", async () => {
    const r = await check(bundle({}, {}));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
  });
});

/** 부담부증여 입주권 × 이월과세 — 시료는 `bg-redev-carryover-acquisition-echo.anchor.test.tsx`의 RIGHT와 같다(증여 사건은 BG 블록이 받는다). */
const BG_RIGHT = (car: A): A => ({
  addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
  bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "400000000", bgMortgageDebtAmount: "80000000", bgDonorRelation: "lineal_descendant", standardPriceAtTransfer: "320000000", standardPriceAtAcq: "180000000",
  bgActualAcquisitionLand: "300000000", bgCoDonorPresumedAcquisitionLand: "250000000", bgCoDonorLandStdPriceAtAcq: "150000000", bgCoDonorBuildingStdPriceAtAcq: "0", bgCoDonorActualAcquisitionLand: "100000000",
  assetKind: "right_to_move_in", redevSubject: "right", isSuccessorRightToMoveIn: false, redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000",
    useEstimatedAcquisition: false, estimationMode: "", giftTaxAmount: "4000000", donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {}, ...car,
  },
});

describe("부담부증여는 범위 밖(종전 그대로)", () => {
  it("증여 당시 평가액 빈칸이어도 ⑧ 통과 · 200 (증여 사건 칸 규칙을 걸지 않는다)", async () => {
    const r = await check(mk([BG_RIGHT({ giftDateValuation: "" })]));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
  });
  it("⑫ — 평가액 0 · carryoverTaxation 없음 모두 200 (이 블록 밖)", async () => {
    const b = (await check(mk([BG_RIGHT({})]))).body;
    expect((await postBody({ ...b, carryoverTaxation: { ...b.carryoverTaxation, giftDateValuation: 0 } })).status).toBe(200);
    const { carryoverTaxation: _ct, ...rest } = b;
    void _ct;
    expect((await postBody(rest)).status).toBe(200);
  });
});
