/**
 * anchor — 재개발(§166) 원조합원 × 이월과세(비부담부증여) 잔여 묶음. 계획서 `docs/02-design/features/redev-carryover-residue-bundle.plan.md`.
 *
 *   A-1 저장된 이월과세 환산 방식 phd/apd — ④가 `preHousingDisclosure`를 싣지 않는다(종전 ⑧ 통과 · 400 · 그 칸은 #2736부터 화면에 없다). 세액 불변.
 *   A-2 ⑫ 주 자산 — 「환산취득가 사용」을 끄면 증여자 취득가액 필수(⑧과 같은 규칙 · 종전 화면 밖 호출이 A 인가 전 분 취득가액 0으로 200).
 *   B-1 단건 명세서 인가 전 분 — 이월과세 A 채택이면 「증여자 취득가액」·「증여자 취득 당시 기준시가」(종전 「실제 취득가액 (실가 모드)」·「취득 당시」).
 *   B-2 함께 양도 명세서 자산별 취득가액 — §166 분할 합을 「환산취득가」로 적지 않는다(종전 「증여자 취득 당시 환산취득가 236,000,000」 — 청산금 200,000,000 포함).
 * 결정세액은 mock 세율.
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
import { carryoverPhdMode } from "@/lib/calc/phd-toggle-scope";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildGbAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
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
const ACT = (p: string): A => ({ useEstimatedAcquisition: false, donorAcquisitionPrice: p });
/** 이월과세 패널 PHD 칸(예전에 고른 환산 방식 phd/apd가 남긴 값) — 증여자 2012는 최초공시 후라 ⑫ PHD 검증이 400을 낸다 */
const PHDF: A = {
  phdHousingType: "individual", phdFirstDisclosureDate: "2005-04-30", phdFirstDisclosureHousingPrice: "100000000", acquisitionArea: "100",
  phdLandPricePerSqmAtAcq: "500000", phdBuildingStdPriceAtAcq: "10000000", phdLandPricePerSqmAtFirst: "800000", phdBuildingStdPriceAtFirst: "15000000",
  phdTransferHousingPrice: "500000000", phdLandPricePerSqmAtTransfer: "3000000", phdBuildingStdPriceAtTransfer: "20000000",
};
const APT: A = { assetKind: "redevelopment_apt", redevSubject: "apt", redevCompletionDate: "2025-09-01" };
const LAND: A = { addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000", fixedSalePrice: "200,000,000" };

describe("A-1 저장된 환산 방식 phd/apd — 재개발 이월과세는 `preHousingDisclosure`를 싣지 않는다", () => {
  it.each([["phd", {}], ["apd", { phdHousingType: "apartment" }]] as const)("입주권 · %s + PHD 칸 → 200 · 322,607,280(방식 미선택과 같다) — 종전 400", async (mode, extra) => {
    const r = await check(mk([asset({ ...PHDF, ...extra }, { estimationMode: mode })]));
    expect(r.body.preHousingDisclosure).toBeUndefined();
    expect([r.issue, r.status, r.res?.determinedTax]).toEqual([null, 200, 322_607_280]);
  });
  it("완공 아파트 phd도 같다", async () => {
    const r = await check(mk([asset({ ...APT, ...PHDF }, { estimationMode: "phd" })]));
    expect([r.body.preHousingDisclosure, r.status]).toEqual([undefined, 200]);
  });
  it("대조 — 재개발이 아닌 주택 이월과세 phd는 그대로 싣는다 · 승계조합원은 범위 밖(종전 그대로)", () => {
    const car = { acquisitionCause: "carryover_gift", carryover: { useEstimatedAcquisition: true, estimationMode: "phd" } } as const;
    expect(carryoverPhdMode({ ...car, assetKind: "housing" } as never)).toBe(true);
    expect(carryoverPhdMode({ ...car, assetKind: "right_to_move_in" } as never)).toBe(false);
    expect(carryoverPhdMode({ ...car, assetKind: "redevelopment_apt", redevIsSuccessorMember: "yes" } as never)).toBe(true);
  });
});

describe("A-2 ⑫ 주 자산 — 재개발 이월과세 「환산취득가 사용」 OFF면 증여자 취득가액 필수(⑧과 같다)", () => {
  const drop = async (over: A, car: A) => {
    const { body } = await check(mk([asset(over, car)]));
    const carryoverTaxation = { ...body.carryoverTaxation };
    delete carryoverTaxation.donorAcquisitionPrice;
    return postBody({ ...body, carryoverTaxation });
  };
  it("⑧은 이미 막는다 — 화면 경로는 바뀌지 않는다", async () => {
    const r = await check(mk([asset({}, ACT(""))]));
    expect(r.issue?.field).toBe("carryover.donorAcquisitionPrice");
  });
  it("화면 밖 body에서 증여자 취득가액을 빼면 400 — 종전 200(A 인가 전 분 취득가액 0 · 334,290,000)", async () => {
    const r = await drop({}, ACT("100000000"));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("carryoverTaxation.donorAcquisitionPrice");
  });
  it("완공 아파트도 400", async () => {
    expect((await drop(APT, ACT("100000000"))).status).toBe(400);
  });
  it("대조 — 증여자 취득가액이 있으면 200 · 302,370,000 / 「환산취득가 사용」이면 증여자 취득가액 없이 200 · 322,607,280", async () => {
    const a = await check(mk([asset({}, ACT("100000000"))]));
    expect([a.status, a.res.determinedTax]).toEqual([200, 302_370_000]);
    const e = await drop({}, {});
    expect([e.status, e.data?.result?.determinedTax]).toEqual([200, 322_607_280]);
  });
  it("대조 — 승계조합원 · 부담부증여 body는 이 규칙 밖", async () => {
    const { body } = await check(mk([asset({}, ACT("100000000"))]));
    const carryoverTaxation = { ...body.carryoverTaxation };
    delete carryoverTaxation.donorAcquisitionPrice;
    const succ = await postBody({ ...body, carryoverTaxation, redevelopment: { ...body.redevelopment, isSuccessorMember: true } });
    expect(JSON.stringify(succ.error ?? {})).not.toContain("carryoverTaxation.donorAcquisitionPrice");
    const bg = await postBody({ ...body, carryoverTaxation, transferType: "burdened_gift" });
    expect(JSON.stringify(bg.error ?? {})).not.toContain("재개발 이월과세 — 「환산취득가 사용」을 쓰지 않으면");
  });
  it("컴패니언도 증여자 취득가액이 비면 400(종전부터 — 같은 문구 규칙)", async () => {
    const { body } = await check(mk([LAND, asset({ actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000" }, ACT("100000000"))], { bundledSaleMode: "actual" }));
    const c = { ...body.companionAssets[0], carryoverTaxation: { ...body.companionAssets[0].carryoverTaxation } };
    delete c.carryoverTaxation.donorAcquisitionPrice;
    const r = await postBody({ ...body, companionAssets: [c] });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("donorAcquisitionPrice");
  });
});

describe("B-1 단건 명세서 인가 전 분 — 이월과세 A 채택이면 증여자 기준임을 적는다(값 불변)", () => {
  const acqRows = async (over: A, car: A) => {
    const f = mk([asset(over, car)]);
    const r = await check(f);
    const items = buildStatementItems(r.res, f, f.assets[0], undefined, undefined);
    return { r, rows: (items.get("acquisitionPrice")?.perAsset ?? []).map((x) => `${x.label} | ${x.formula} | ${x.value}`) };
  };
  it("② 환산 · A 채택(322,607,280) — 「§166③ — 권리가액 × 증여자 취득 당시 기준시가」 · 36,000,000", async () => {
    const { r, rows } = await acqRows({}, {});
    expect(r.res.carryoverTaxationDetail.adoptedScenario).toBe("A");
    expect(rows[0]).toContain("= 36,000,000 (§166③ — 권리가액 × 증여자 취득 당시 기준시가 ÷ 관리처분계획 인가일 직전 기준시가");
  });
  it("② 실가 100,000,000 · A 채택(302,370,000) — 「증여자 취득가액 = 100,000,000 (이월과세 — 「소득세법」 §97의2①1호)」", async () => {
    const { r, rows } = await acqRows({}, ACT("100000000"));
    expect([r.res.carryoverTaxationDetail.adoptedScenario, r.res.determinedTax]).toEqual(["A", 302_370_000]);
    expect(rows[0]).toContain("증여자 취득가액 = 100,000,000 (이월과세 — 「소득세법」 §97의2①1호)");
  });
  it("토지 출자 · A 채택 — 인가 전 분 라벨 「권리가액 × 증여자 취득 당시 기준시가」", async () => {
    const { r, rows } = await acqRows({ redevOriginalAssetType: "land", redevLandStdPriceAtAcq: "20000000", redevLandStdPriceAtApproval: "500000000" }, {});
    expect(r.res.carryoverTaxationDetail.adoptedScenario).toBe("A");
    expect(rows[0]).toContain("§166③ — 권리가액 × 증여자 취득 당시 기준시가 / 관리처분 직전 기준시가");
  });
  it("대조 — B 채택(증여자 300,000,000 · 299,010,000)은 종전 문구 · 매매 자산도 종전 문구", async () => {
    const b = await acqRows({}, ACT("300000000"));
    expect(b.r.res.carryoverTaxationDetail.adoptedScenario).toBe("B");
    expect(b.rows[0]).toContain("실제 취득가액 = 300,000,000 (실가 모드)");
    const p = await acqRows({ acquisitionCause: "purchase", acquisitionDate: "2012-01-01", carryover: undefined, useEstimatedAcquisition: true }, {});
    expect(p.rows[0]).toContain("(§166③ — 권리가액 × 취득 당시 기준시가");
    expect(p.rows[0]).not.toContain("증여자");
  });
});

describe("B-2 함께 양도 명세서 자산별 취득가액 — §166 분할 합을 「환산취득가」로 적지 않는다", () => {
  const row = async (assets: A[], idx: number) => {
    const r = await check(mk(assets, { bundledSaleMode: "actual" }));
    const p = r.data.aggregated.properties[idx];
    return { p, text: buildGbAcquisitionFormula(p, undefined, undefined) ?? "" };
  };
  const comp = (car: A) => asset({ actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000" }, car);
  it("컴패니언 입주권 ② 환산(A 채택) — 236,000,000 = 인가 전 분 §166③ 환산 36,000,000 포함 · 「환산취득가」 아님", async () => {
    const { p, text } = await row([LAND, comp({})], 1);
    expect([p.carryoverTaxationDetail.adoptedScenario, p.acquisitionPrice]).toEqual(["A", 236_000_000]);
    expect(text).toBe("증여자 취득 당시 기준 취득가액 236,000,000 — §166 분할 합(인가 전 분 §166③ 환산 36,000,000 포함) · 이월과세 §97의2① (증여자 취득가액 승계)");
  });
  it("주 자산 입주권 ② 실가 100,000,000 — 인가 전 분 증여자 취득가액 100,000,000 포함", async () => {
    const { p, text } = await row([comp(ACT("100000000")), LAND], 0);
    expect(p.carryoverTaxationDetail.adoptedScenario).toBe("A");
    expect(text).toContain(`증여자 취득 당시 기준 취득가액 ${p.acquisitionPrice.toLocaleString("ko-KR")} — §166 분할 합(인가 전 분 증여자 취득가액 100,000,000 포함)`);
  });
});
