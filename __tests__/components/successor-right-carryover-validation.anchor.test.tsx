/**
 * anchor — 승계 입주권 × 이월과세(비부담부증여) 검증. 계획서 `docs/02-design/features/successor-right-carryover-validation.plan.md`(Q-1~Q-4 a).
 *
 *   G-1 이월과세 승계 입주권은 취득일 칸이 화면에 없다 — ⑧이 ④와 같은 leaf(원값 → 증여 등기일)로 읽는다(종전 「승계취득일을 입력하세요」 막다른 길).
 *   G-2 승계취득가액은 이월과세 계산에 쓰이지 않는다 — ⑤가 숨기고 ⑧도 요구하지 않는다 · 추가분담금 > 0은 ⑧이 거절한다(이월과세 계산에 들어가지 않는다).
 *   G-3·G-4 ⑧이 `validateCarryoverAsset` 전체를 건다 — 종전 주 자산 ⑧ 통과 → ⑫ 400, 함께 양도 환산 기준시가 빈칸 → A 취득가액 0(463,035,000).
 *   Q-3 승계 입주권의 이월과세 환산 방식은 general만. §5 남은 승계 산정 방식 플래그는 ④가 끈다(매매사례 잔재 472,935,000 → 299,010,000이던 경로).
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
import { carryoverEstimationModeSupported } from "@/lib/calc/phd-toggle-scope";
import { isCarryoverSuccessorRight, successorRightEstimationMode } from "@/lib/calc/transfer-successor-right";
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
const SUCC: A = { isSuccessorRightToMoveIn: true, redevApprovalDate: "2020-01-10", successorRightAcqPrice: "400000000", successorRightAddedContribution: "0" };
const CAR: A = { donorAcquisitionDate: "2021-01-01", donorHouseholdHoldingStartDate: "", useEstimatedAcquisition: false, donorAcquisitionPrice: "100000000" };
const GEN: A = { donorAcquisitionDate: "2021-01-01", donorHouseholdHoldingStartDate: "", useEstimatedAcquisition: true, donorAcquisitionPrice: "", estimationMode: "general", donorStandardPriceAtAcquisition: "100000000", donorStandardPriceAtTransfer: "500000000" };
const LAND: A = { addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000", fixedSalePrice: "200,000,000" };
const succ = (over: A = {}, car: A = {}) => asset({ ...SUCC, ...over }, { ...CAR, ...car });
const single = (over: A = {}, car: A = {}) => mk([succ(over, car)]);
const bundle = (over: A = {}, car: A = {}) => mk([LAND, succ({ actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000", ...over }, car)], { bundledSaleMode: "actual" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const companionTax = (r: { data: any }) => r.data?.aggregated?.totalDeterminedTax ?? r.data?.aggregated?.determinedTax;

describe("G-1 취득일 — 칸이 없는 이월과세 승계 입주권", () => {
  it("주 자산 · 취득일 빈칸 → ⑧ 통과 · ④ 증여 등기일 · 472,935,000(취득일을 채운 것과 같다)", async () => {
    const r = await check(single({ acquisitionDate: "" }));
    expect(r.issue).toBeNull();
    expect(r.body.acquisitionDate).toBe("2023-06-01");
    expect(r.res.determinedTax).toBe(472_935_000);
    expect((await check(single())).res.determinedTax).toBe(472_935_000);
  });
  it("함께 양도 · 취득일 빈칸 → ⑧ 통과 · 200", async () => {
    const r = await check(bundle({ acquisitionDate: "" }));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
  });
  it("인가일 비교도 증여 등기일로 한다 — 인가일이 증여 등기일 뒤면 「조합원 유형」 안내", async () => {
    expect((await check(single({ acquisitionDate: "", redevApprovalDate: "2024-01-10" }))).issue?.field).toBe("isSuccessorRightToMoveIn");
  });
  it("매매 승계 입주권 취득일 빈칸은 종전대로 막는다", async () => {
    expect((await check(single({ acquisitionCause: "purchase", acquisitionDate: "" }))).issue?.field).toBe("acquisitionDate");
  });
});

describe("G-2 승계취득가액·추가분담금 (Q-4 a)", () => {
  it("승계취득가액 빈칸 → ⑧ 통과 · 세액 불변(계산에 쓰이지 않는다)", async () => {
    const r = await check(single({ successorRightAcqPrice: "" }));
    expect(r.issue).toBeNull();
    expect(r.res.determinedTax).toBe(472_935_000);
  });
  it("추가분담금 > 0 → ⑧이 거절한다", async () => {
    const r = await check(single({ successorRightAddedContribution: "50000000" }));
    expect(r.issue?.field).toBe("successorRightAddedContribution");
    expect(String(r.issue?.message)).toContain("추가분담금을 현재 버전에서 계산에 반영하지 못합니다");
  });
  it("매매 승계 입주권은 종전대로 승계취득가액을 요구하고 추가분담금을 받는다", async () => {
    expect((await check(single({ acquisitionCause: "purchase", acquisitionDate: "2023-06-01", successorRightAcqPrice: "" }))).issue?.field).toBe("successorRightAcqPrice");
    expect((await check(single({ acquisitionCause: "purchase", acquisitionDate: "2023-06-01", successorRightAddedContribution: "50000000" }))).issue).toBeNull();
  });
  it("⑤ — 이월과세는 산정 방식·승계취득가액 칸을 숨기고 안내와 추가분담금 칸만 둔다", () => {
    const fields = (a: A) => Array.from(render(<SuccessorRightAcquisitionBlock asset={{ ...makeDefaultAsset(1), ...a } as AssetForm} onChange={() => {}} />).container.querySelectorAll("[data-field]")).map((e) => e.getAttribute("data-field"));
    const car = fields(succ());
    expect(car).not.toContain("successorRightAcqPrice");
    expect(car).toContain("successorRightAddedContribution");
    const pur = fields(succ({ acquisitionCause: "purchase" }));
    expect(pur).toContain("successorRightAcqPrice");
  });
  it("⑤ 안내 문구", () => {
    const { container } = render(<SuccessorRightAcquisitionBlock asset={{ ...makeDefaultAsset(1), ...succ() } as AssetForm} onChange={() => {}} />);
    expect(container.querySelector('[data-testid="carryover-successor-right-note"]')?.textContent).toContain("승계취득가액은 쓰지 않습니다");
  });
});

const DEFECTS = [
  ["증여 등기일 빈칸", { giftRegistryDate: "" }, "carryover.giftRegistryDate"],
  ["증여자 취득일 ≥ 증여 등기일", { donorAcquisitionDate: "2023-07-01" }, "carryover.donorAcquisitionDate"],
  ["사망 · 관계 빈칸", { donorRelation: "", donorDeceased: true }, "carryover.donorRelation"],
  ["평가액 빈칸", { giftDateValuation: "" }, "carryover.giftDateValuation"],
  ["가업상속공제", { exclusionDeclared: { isFamilyBusinessInheritedAsset: true } }, undefined],
  ["증여자 취득가액 빈칸(② 실가)", { donorAcquisitionPrice: "" }, "carryover.donorAcquisitionPrice"],
  ["② 환산 · 방식 미선택", { useEstimatedAcquisition: true, donorAcquisitionPrice: "", estimationMode: null }, "carryover.estimationMode"],
  ["② 환산 · general 기준시가 빈칸", { useEstimatedAcquisition: true, donorAcquisitionPrice: "", estimationMode: "general" }, "carryover.donorStandardPriceAtAcquisition"],
  ["② 환산 · phd", { useEstimatedAcquisition: true, donorAcquisitionPrice: "", estimationMode: "phd" }, "carryover.estimationMode"],
] as const;

describe("G-3 주 자산 — ⑧이 ⑫보다 먼저 막는다(종전 ⑧ 통과 → ⑫ 400)", () => {
  it.each(DEFECTS)("%s → ⑧ 차단", async (_n, car, field) => {
    const r = await check(single({}, car));
    expect(r.issue).not.toBeNull();
    expect(r.issue?.field).toBe(field);
  });
  it("phd 문구 — 「이 자산의 이월과세는 일반 기준시가 환산만」", async () => {
    expect(String((await check(single({}, { useEstimatedAcquisition: true, donorAcquisitionPrice: "", estimationMode: "phd" }))).issue?.message)).toContain("이 자산의 이월과세는 「일반 기준시가 환산」만 지원합니다");
  });
  it("정상 ② 환산(general) → 통과 · 400,485,000", async () => {
    const r = await check(single({}, GEN));
    expect(r.issue).toBeNull();
    expect(r.res.determinedTax).toBe(400_485_000);
  });
});

describe("G-4 함께 양도 — 환산 기준시가 빈칸이 A 취득가액 0으로 계산되지 않는다", () => {
  it("② 환산 · general 기준시가 빈칸 → ⑧ 차단(종전 200 · 463,035,000)", async () => {
    const r = await check(bundle({}, { ...GEN, donorStandardPriceAtAcquisition: "", donorStandardPriceAtTransfer: "" }));
    expect(r.issue?.field).toBe("carryover.donorStandardPriceAtAcquisition");
    expect(companionTax(r)).toBe(463_035_000);
  });
  it.each([["phd"], ["apd"]] as const)("② 환산 · %s → ⑧ 차단(함께 양도 general만)", async (mode) => {
    expect((await check(bundle({}, { ...GEN, estimationMode: mode }))).issue?.field).toBe("carryover.estimationMode");
  });
  it("평가액 빈칸 → ⑧ 차단(종전 ⑫ 400)", async () => {
    expect((await check(bundle({}, { giftDateValuation: "" }))).issue?.field).toBe("carryover.giftDateValuation");
  });
  it("정상 ② 환산(general) → 통과 · 364,950,000", async () => {
    const r = await check(bundle({}, GEN));
    expect(r.issue).toBeNull();
    expect(companionTax(r)).toBe(364_950_000);
  });
});

describe("Q-3 환산 방식 · §5 남은 승계 산정 방식 플래그", () => {
  it("입주권은 general만 · 주택은 phd도 연다", () => {
    expect(carryoverEstimationModeSupported("right_to_move_in", "phd")).toBe(false);
    expect(carryoverEstimationModeSupported("right_to_move_in", "apd")).toBe(false);
    expect(carryoverEstimationModeSupported("right_to_move_in", "general")).toBe(true);
    expect(carryoverEstimationModeSupported("housing", "phd")).toBe(true);
  });
  it.each([
    ["매매사례 잔재", { isSalesCaseAcquisition: true, similarSalesValue: "500000000" }],
    ["감정 잔재", { isAppraisalAcquisition: true, fixedAcquisitionPrice: "500000000" }],
    ["환산 잔재", { useEstimatedAcquisition: true }],
  ] as const)("주 자산 %s → ⑧ 통과 · 472,935,000 (종전 매매사례·감정 299,010,000 · 환산 ⑫ 400)", async (_n, over) => {
    const r = await check(single(over));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
    expect(r.res.determinedTax).toBe(472_935_000);
  });
  it("함께 양도 매매사례 잔재 → ⑧ 통과(종전 「첫 번째 자산에서만」 — 고칠 라디오가 없다)", async () => {
    const r = await check(bundle({ isSalesCaseAcquisition: true, similarSalesValue: "500000000" }));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
  });
  it("산정 방식 술어 — 이월과세는 actual · 매매는 잔재대로", () => {
    expect(successorRightEstimationMode(succ({ isSalesCaseAcquisition: true }) as never)).toBe("actual");
    expect(successorRightEstimationMode(succ({ acquisitionCause: "purchase", isSalesCaseAcquisition: true }) as never)).toBe("salesCase");
  });
  it("사이드바 취득가액 — 이월과세는 숨은 승계취득가액을 보이지 않는다(계산 후 확정)", () => {
    expect(directAcqRaw({ ...makeDefaultAsset(1), ...succ() } as AssetForm).value).toBe(0);
    expect(directAcqRaw({ ...makeDefaultAsset(1), ...succ({ acquisitionCause: "purchase" }) } as AssetForm).value).toBe(400_000_000);
  });
  it("부담부증여 승계 입주권은 이 범위 밖", () => {
    expect(isCarryoverSuccessorRight(succ({ transferType: "burdened_gift" }) as never)).toBe(false);
    expect(isCarryoverSuccessorRight(succ() as never)).toBe(true);
  });
});
