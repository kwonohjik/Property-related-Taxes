/**
 * anchor — 재개발(§166) 원조합원 × 이월과세(비부담부증여): 종전 부동산 취득가액을 「확인할 수 있는가」를 이월과세 ② 「환산취득가 사용」 한 곳이 정한다.
 * 계획서 `docs/02-design/features/redev-carryover-estimation-toggle-sync.plan.md`(사용자 결정 Q-1 a · Q-2 a · Q-3 a).
 *
 * 종전(실측): ② 환산 + ⑤ 실가 → ⑧ 통과 · 서버 400(§166③ 칸이 화면에 없음) · ② 실가 + ⑤ 환산 → 증여자 취득가액을 버리고 §166③ 환산(322,607,280) ·
 * 이월과세에서 ⑤ 실거래가는 세액에 쓰이지 않는데 ⑧ 필수 · 증여자 기준시가는 재개발에서 쓰이지 않는데 전송 · 인가 전 분 양도차익 산식이 「개산공제 N」만 적어
 * 실비·청산금 수령에서 값을 만들지 못했다. 결정세액은 mock 세율.
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

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildRedevGainFormula, buildRedevPerAssetForGrossGain } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { CarryoverGiftBlock } from "@/components/calc/transfer/CarryoverGiftBlock";
import { redevPreApprovalAcqMode } from "@/lib/calc/redev-pre-approval-acq-mode";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { directAcqRaw } from "@/lib/stores/transfer-per-asset-direct";
import { normalizeRedevCarryoverAcqMode } from "@/lib/calc/redev-carryover-acq-mode";
import { isHousingContribEstimatedBranch } from "@/components/calc/transfer/asset-sections/AssetAreaRedevelopment";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

type A = Record<string, unknown>;
const norm = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ");

const CARRYOVER: A = {
  giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000",
  useEstimatedAcquisition: false, estimationMode: "", giftTaxAmount: "4000000", donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {},
};
const mk = (assets: A[], extra: A = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, ...extra,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(f: TransferFormData): Promise<{ status: number; data: any; error?: { message?: string } }> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...cap.body, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: unknown; error?: { message?: string } };
  return { status: res.status, data: json.data, error: json.error };
}





const fmt = (n: number) => n.toLocaleString("ko-KR");
const asset = (over: A, car: A): A => ({
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01", acquisitionPrice: "",
  useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000",
  carryover: { ...CARRYOVER, giftTaxAmount: "0", donorRelation: "lineal", donorHouseholdHoldingStartDate: "2012-01-01", ...car },
  ...over,
});
const S166: A = { redevManagementDisposalHousingPrice: "500000000", redevAcquisitionHousingPrice: "20000000" };
const CEST: A = { useEstimatedAcquisition: true, estimationMode: null, donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: "20000000", donorStandardPriceAtTransfer: "500000000" };
const CACT = (p: string): A => ({ useEstimatedAcquisition: false, estimationMode: "", donorAcquisitionPrice: p });

async function check(over: A, car: A) {
  const f = mk([asset(over, car)], { contractTotalPrice: "1300000000" });
  const issue = [0, 1, 2, 3].map((st) => validateStepDetailed(st, f)).find(Boolean) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: Record<string, any> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const r = await post(f);
  return { issue, body, status: r.status, res: r.data?.result };
}

describe("이월과세 ② 환산 ON — ⑤ 라디오의 남은 실가 값과 무관하게 §166③ 환산", () => {
  it("§166③ 칸이 비면 ⑧이 그 칸(⑤에 보이는 칸)을 가리켜 막는다 — 종전엔 ⑧ 통과 · 서버 400", async () => {
    const { issue } = await check({}, CEST);
    expect(issue?.field).toBe("redevManagementDisposalHousingPrice");
  });
  it("⑤가 실가로 남아 있어도 §166③ 칸을 채우면 200 · A 322,607,280 · 증여자 기준시가는 보내지 않는다", async () => {
    const { issue, body, status, res } = await check(S166, CEST);
    expect(issue).toBeNull();
    expect([body.useEstimatedAcquisition, body.acquisitionPrice, body.standardPriceAtAcquisition, body.standardPriceAtTransfer]).toEqual([true, 0, undefined, undefined]);
    expect([status, res.determinedTax, res.carryoverTaxationDetail.scenarioA.acquisitionPrice]).toEqual([200, 322_607_280, 236_000_000]);
  });
  it("예전에 고른 환산 방식 「일반 기준시가」가 남아 있어도 증여자 기준시가는 보내지 않는다", async () => {
    const { body, res } = await check(S166, { ...CEST, estimationMode: "general" });
    expect([body.standardPriceAtAcquisition, body.standardPriceAtTransfer, res.determinedTax]).toEqual([undefined, undefined, 322_607_280]);
  });
  it("토지 출자 입주권 · 청산금 수령 · 환산(미지원 조합) — 안내는 숨은 ⑤ 라디오가 아니라 이월과세 ② 토글을 가리킨다", async () => {
    const { issue } = await check({ redevOriginalAssetType: "land", redevSettlementDirection: "receive", redevSettlementAmount: "100000000" }, CEST);
    expect(issue?.field).toBe("carryover.useEstimatedAcquisition");
    expect(issue?.message).toContain("이월과세 「환산취득가 사용」을 끄고 「증여자 취득가액」을 입력하세요");
  });
  it("토지 출자 입주권 · 완공 아파트도 같다", async () => {
    const land = await check({ redevOriginalAssetType: "land", redevLandStdPriceAtAcq: "20000000", redevLandStdPriceAtApproval: "500000000" }, CEST);
    expect([land.issue, land.status, land.res.determinedTax]).toEqual([null, 200, 322_607_280]);
    const apt = await check({ assetKind: "redevelopment_apt", redevSubject: "apt", redevCompletionDate: "2025-09-01", ...S166 }, CEST);
    expect([apt.issue, apt.status, apt.res.carryoverTaxationDetail.scenarioA.transferGain]).toEqual([null, 200, 1_063_400_000]);
  });
});

describe("이월과세 ② 실가 — 증여자 취득가액으로 계산한다(Q-2 a · 「소득세법 시행령」 제166조 제3항은 취득가액을 확인할 수 없는 경우)", () => {
  it("⑤가 환산으로 남아 있어도 증여자 100,000,000으로 — 322,607,280 → 302,370,000", async () => {
    const { body, res } = await check({ useEstimatedAcquisition: true, ...S166 }, CACT("100000000"));
    expect([body.useEstimatedAcquisition, body.carryoverTaxation.donorAcquisitionPrice]).toEqual([false, 100_000_000]);
    expect([res.carryoverTaxationDetail.adoptedScenario, res.determinedTax, res.carryoverTaxationDetail.scenarioA.acquisitionPrice]).toEqual(["A", 302_370_000, 300_000_000]);
  });
  it("증여자 300,000,000이면 A 238,530,000 < B → B 채택 299,010,000(종전엔 둘 다 322,607,280)", async () => {
    const { res } = await check({ useEstimatedAcquisition: true, ...S166 }, CACT("300000000"));
    expect([res.carryoverTaxationDetail.adoptedScenario, res.determinedTax, res.carryoverTaxationDetail.scenarioA.determinedTax]).toEqual(["B", 299_010_000, 238_530_000]);
  });
  it("⑤ 실거래가는 요구하지도 보내지도 않는다(비워도 · 400,000,000이어도 같다)", async () => {
    const empty = await check({ redevActualAcquisitionPrice: "" }, CACT("100000000"));
    expect([empty.issue, empty.body.acquisitionPrice, empty.status, empty.res.determinedTax]).toEqual([null, 0, 200, 302_370_000]);
    const stale = await check({ redevActualAcquisitionPrice: "400000000" }, CACT("100000000"));
    expect([stale.body.acquisitionPrice, stale.res.determinedTax]).toEqual([0, 302_370_000]);
  });
  it("증여자 취득가액이 비면 ⑧이 막는다(재개발 분기는 이월과세 검증을 타지 않았다)", async () => {
    const { issue } = await check({}, CACT(""));
    expect(issue?.field).toBe("carryover.donorAcquisitionPrice");
  });
});

describe("범위 밖은 그대로", () => {
  it("판정 함수 — 이월과세만 ② 토글 · 부담부증여·승계·매매는 종전", () => {
    const base = { assetKind: "right_to_move_in", acquisitionCause: "carryover_gift", transferType: "regular" };
    expect(redevPreApprovalAcqMode({ ...base, useEstimatedAcquisition: true, carryover: { useEstimatedAcquisition: false } })).toBe("carryover_donor");
    expect(redevPreApprovalAcqMode({ ...base, useEstimatedAcquisition: false, carryover: { useEstimatedAcquisition: true } })).toBe("estimated");
    expect(redevPreApprovalAcqMode({ ...base, transferType: "burdened_gift", carryover: { useEstimatedAcquisition: true } })).toBe("burdened_gift");
    expect(redevPreApprovalAcqMode({ ...base, isSuccessorRightToMoveIn: true, useEstimatedAcquisition: true, carryover: { useEstimatedAcquisition: false } })).toBe("estimated");
    expect(redevPreApprovalAcqMode({ ...base, assetKind: "redevelopment_apt", redevIsSuccessorMember: "yes", carryover: { useEstimatedAcquisition: true } })).toBe("actual");
    expect(redevPreApprovalAcqMode({ ...base, acquisitionCause: "purchase", useEstimatedAcquisition: true, carryover: { useEstimatedAcquisition: false } })).toBe("estimated");
  });
  it("정규화 사본 — 부담부증여·매매는 같은 객체(바꾸지 않는다)", () => {
    const bg = { ...makeDefaultAsset(1), ...asset({ transferType: "burdened_gift", useEstimatedAcquisition: true }, CACT("1")) } as AssetForm;
    expect(normalizeRedevCarryoverAcqMode(bg)).toBe(bg);
    const purchase = { ...makeDefaultAsset(1), ...asset({ useEstimatedAcquisition: true }, CACT("1")), acquisitionCause: "purchase" } as AssetForm;
    expect(normalizeRedevCarryoverAcqMode(purchase)).toBe(purchase);
  });
  it("① 면적 위젯·⑤ 칸이 쓰는 주택 출자 분기 판정도 ② 토글을 따른다", () => {
    const a = { ...makeDefaultAsset(1), ...asset({ redevSettlementDirection: "receive", redevSettlementAmount: "100000000" }, CEST) } as AssetForm;
    expect(isHousingContribEstimatedBranch(a)).toBe(true);
    expect(isHousingContribEstimatedBranch({ ...a, carryover: { ...a.carryover!, useEstimatedAcquisition: false } } as AssetForm)).toBe(false);
  });
  it("비재개발(주택) 이월과세 환산은 증여자 기준시가를 그대로 보낸다", async () => {
    const f = mk([{ ...asset({}, { ...CEST, estimationMode: "general" }), assetKind: "housing", redevSubject: "", acquisitionPrice: "" }], { contractTotalPrice: "1300000000" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: Record<string, any> = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => { body = JSON.parse(String(init?.body)); return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response; }));
    try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
    expect([body.useEstimatedAcquisition, body.standardPriceAtAcquisition, body.standardPriceAtTransfer]).toEqual([true, 20_000_000, 500_000_000]);
  });
});

describe("화면", () => {
  const renderRedev = (a: A) => {
    const t = norm(render(<RedevelopmentBlock asset={{ ...makeDefaultAsset(1), ...a } as AssetForm} onChange={() => {}} transferDate="2026-02-16" />).container);
    const radio = document.querySelector('[data-field="useEstimatedAcquisition"]');
    const actualField = document.querySelector('[data-field="redevActualAcquisitionPrice"]');
    const dField = document.querySelector('[data-field="redevManagementDisposalHousingPrice"]');
    cleanup();
    return { t, radio, actualField, dField };
  };
  it("② 실가 — ⑤ 라디오·실거래가 칸 없이 안내만", () => {
    const { t, radio, actualField } = renderRedev(asset({ useEstimatedAcquisition: true }, CACT("100000000")));
    expect([radio, actualField]).toEqual([null, null]);
    expect(t).toContain("이월과세 자산은 당초 증여자의 취득가액을 이월과세 「증여자 취득가액」에서 입력합니다");
  });
  it("② 환산 — ⑤ 라디오 없이 §166③ 칸(⑤가 실가로 남아 있어도)", () => {
    const { t, radio, dField } = renderRedev(asset({}, CEST));
    expect(radio).toBeNull();
    expect(dField).not.toBeNull();
    expect(t).toContain("이월과세 「환산취득가 사용」을 켰습니다");
  });
  it("매매 재개발은 종전처럼 ⑤ 라디오", () => {
    const { radio, actualField } = renderRedev({ ...asset({}, CACT("1")), acquisitionCause: "purchase" });
    expect([radio !== null, actualField !== null]).toEqual([true, true]);
  });
  it("이월과세 ② — 재개발이면 환산 방식·증여자 기준시가 대신 안내", () => {
    const a = { ...makeDefaultAsset(1), ...asset({}, CEST) } as AssetForm;
    const t = norm(render(<CarryoverGiftBlock asset={a} transferDate="2026-02-16" onChange={() => {}} />).container);
    const std = document.querySelector('[data-field="carryover.donorStandardPriceAtAcquisition"]');
    cleanup();
    expect(t).toContain("⑤ 「인가전 분 종전 부동산 취득가액」의 칸에 당초 증여자 취득일 기준 값을 입력하세요");
    expect(t).not.toContain("환산 방식 선택");
    expect(std).toBeNull();
  });
  it("사이드바 — 계산 전 취득가액에 숨은 ⑤ 실거래가를 쓰지 않는다", () => {
    expect(directAcqRaw({ ...makeDefaultAsset(1), ...asset({}, CACT("100000000")) } as AssetForm).value).toBe(0);
    expect(directAcqRaw({ ...makeDefaultAsset(1), ...asset({}, CACT("100000000")), acquisitionCause: "purchase" } as AssetForm).value).toBe(100_000_000);
  });
});

describe("인가 전 분 양도차익 산식 — 엔진의 인가 전 분 필요경비(택일 · 수령은 안분 후)로 적는다(Q-3 a)", () => {
  const PURCH = (over: A): A => ({ ...asset(over, {}), acquisitionCause: "purchase", acquisitionDate: "2012-01-01", carryover: undefined });
  const formula = async (a: A, dir: "pay" | "receive") => {
    const r = await post(mk([a], { contractTotalPrice: "1300000000" }));
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    return buildRedevGainFormula("preApproval", r.data.result.redevelopmentDetail, true, { subject: "right", settlementDirection: dir });
  };
  it("납부 · 실가 · 인가 전 필요경비 3,000,000 — 종전 「개산공제 0」(차이 3,000,000)", async () => {
    expect(await formula(PURCH({ redevPreApprovalExpenses: "3000000" }), "pay")).toBe(`${fmt(900_000_000)} − ${fmt(100_000_000)} − 필요경비 ${fmt(3_000_000)} = ${fmt(797_000_000)}`);
  });
  it("수령 · 실가 · 인가 전 필요경비 3,000,000 — 안분 후 2,666,666(칸마다 절사 — 신고서 표와 같은 2원 잔차)", async () => {
    expect(await formula(PURCH({ redevSettlementDirection: "receive", redevSettlementAmount: "100000000", redevPreApprovalExpenses: "3000000" }), "receive")).toBe(
      `${fmt(800_000_000)} − ${fmt(88_888_888)} − 필요경비(안분 후) ${fmt(2_666_666)} = ${fmt(708_444_444)}`,
    );
  });
  it("주택 출자 수령 · 환산 — 개산공제(안분 후) 533,333(종전 원액 600,000)", async () => {
    expect(await formula(PURCH({ redevSettlementDirection: "receive", redevSettlementAmount: "100000000", useEstimatedAcquisition: true, redevHousingStdPriceAtAcq: "20000000", redevHousingStdPriceAtApproval: "500000000" }), "receive")).toBe(
      `${fmt(800_000_000)} − ${fmt(32_000_000)} − 개산공제(안분 후) ${fmt(533_333)} = ${fmt(767_466_666)}`,
    );
  });
  it("납부 · 환산 — 종전과 같은 값(개산공제 600,000)", async () => {
    expect(await formula(PURCH({ useEstimatedAcquisition: true, ...S166 }), "pay")).toBe(`${fmt(900_000_000)} − ${fmt(36_000_000)} − 개산공제 ${fmt(600_000)} = ${fmt(863_400_000)}`);
  });
});

describe("다른 진입점 — 다건·컴패니언·주택 출자 수령 칸·전체 양도차익 행", () => {
  it("다건 신고(`buildPropertyPayload`)도 같은 사본 — ⑤ 환산이 남아도 ② 실가면 환산이 아니다", () => {
    const p = buildPropertyPayload(mk([asset({ useEstimatedAcquisition: true, ...S166 }, CACT("100000000"))], { contractTotalPrice: "1300000000" })) as Record<string, unknown>;
    expect(p.useEstimatedAcquisition).toBe(false);
  });
  it("컴패니언 — 이월과세 환산이어도 증여자 기준시가로 덮지 않고, ② 토글로 환산을 켠다", async () => {
    const primary = { addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000" };
    const comp = asset({ ...S166, actualSalePrice: "1,100,000,000" }, { ...CEST, estimationMode: "general" });
    const f = mk([primary, comp], { contractTotalPrice: "1300000000" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: Record<string, any> = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => { body = JSON.parse(String(init?.body)); return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response; }));
    try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
    const c = (body.companionAssets ?? [])[0] ?? {};
    expect([c.useEstimatedAcquisition, c.standardPriceAtAcquisition, c.standardPriceAtTransfer]).toEqual([true, undefined, undefined]);
  });
  it("컴패니언 — 환산 방식 칸이 비어도(재개발에서 숨는다) §166③ 환산으로 계산(종전 A 취득 0 → 311,355,000)", async () => {
    const primary = { addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000" };
    const comp = asset({ ...S166, useEstimatedAcquisition: true, redevActualAcquisitionPrice: "", actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000" }, CEST);
    const r = await post(mk([primary, comp], { contractTotalPrice: "1300000000", bundledSaleMode: "actual" }));
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    const p = r.data.aggregated.properties[1];
    expect([r.data.aggregated.totalTax, p.acquisitionPrice, p.transferGain]).toEqual([298_504_008, 236_000_000, 863_400_000]);
  });
  it("주택 출자 입주권 청산금 수령 — ② 환산이면 ⑤가 실가로 남아도 개별주택가격 2-point 칸", () => {
    const a = { ...makeDefaultAsset(1), ...asset({ redevSettlementDirection: "receive", redevSettlementAmount: "100000000" }, CEST) } as AssetForm;
    render(<RedevelopmentBlock asset={a} onChange={() => {}} transferDate="2026-02-16" />);
    const f = document.querySelector('[data-field="redevHousingStdPriceAtAcq"]');
    cleanup();
    expect(f).not.toBeNull();
  });
  it("명세서 「전체 양도차익」 행도 청산금 수령이면 「(안분 후)」", async () => {
    const r = await post(mk([{ ...asset({ redevSettlementDirection: "receive", redevSettlementAmount: "100000000", redevPreApprovalExpenses: "3000000" }, {}), acquisitionCause: "purchase", acquisitionDate: "2012-01-01", carryover: undefined }], { contractTotalPrice: "1300000000" }));
    const rows = buildRedevPerAssetForGrossGain(r.data.result.redevelopmentDetail, "right", "receive");
    expect(String(rows[0].formula)).toContain(`필요경비(안분 후) ${fmt(2_666_666)}`);
  });
});
