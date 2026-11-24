/**
 * NBL-STATE-HISTORY-E3-④ UI — 화면 경로 route 관통: **폼(AssetForm) → ⑧ 전 단계 이슈 → ④ 본문 가로채기 → 실제 route POST(⑫⑭) → 엔진 → 세액**.
 * 엔진 route anchor(`nbl-state-history-e3-4-route.anchor.test.ts`)는 raw를 직접 덮어써 ④·⑧을 우회한다 — 이 파일은 ④·⑧을 **거친다**(UI 계획서 §11.1 · R-8: 같은 표 `E3E_ALL_ROWS`).
 *
 * 입력 변환: 표의 raw(`e3eRowRaw`)를 AssetForm에 얹고, 세대 주택 소유 행이 있으면 질문 «있습니다»(+행) · 없으면 «없습니다»로 답한다(술어가 거짓인 행도 같다 — ④가 `[]`로 막는지 본다).
 * 단언: ⑧ 이슈 0건 · ④ 와이어 행 = (술어 참이면 표의 행, 아니면 `[]`) · route 200 · 판정·일수·세액이 표의 오라클과 같다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
import { allIssues, captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { E3E_ALL_ROWS, e3eRowRaw, e3eTax, type E3eRow } from "../tax-engine/_helpers/nbl-state-history-e3-4-table";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { vacantLotHousePeriodsReadOf } from "@/lib/calc/nbl-vacant-lot-household-scope";
import { NBL_STATE_AT_TRANSFER_VACANT_LOT_HOUSE_PERIODS_APPLIED_NOTICE, NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function assetOf(r: E3eRow, over: Partial<AssetForm> = {}): AssetForm {
  const raw = e3eRowRaw(r, { houseRows: false }) as Loose;
  delete raw.transferDate;
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "purchase",
    transferArea: r.area ?? "600",
    addressJibun: "서울 강남구 테스트동 1",
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "1000000000",
    isNonBusinessLand: true,
    ...raw,
    // 화면에는 이력 질문 «미선택 = 이력 OFF»가 없다(⑧ #1이 막는다) — 표의 `""`(이력 OFF)는 «바뀐 적 없습니다»(`unchanged`)로 답한 것과 같은 현행 경로다.
    nblOtherStateHistoryMode: raw.nblOtherStateHistoryMode === "" ? "unchanged" : raw.nblOtherStateHistoryMode,
    // 세대 주택 소유 기간 질문 — 행이 있으면 «있습니다»(+행), 없으면 «없습니다»
    nblOtherHouseholdHouseStatus: r.houseRows && r.houseRows.length > 0 ? "owned" : "none",
    nblOtherHouseholdHousePeriods: (r.houseRows ?? []).map(([startDate, endDate]) => ({ startDate, endDate: endDate ?? "" })),
    ...over,
  } as AssetForm;
}
function formOf(r: E3eRow, over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = r.transfer ?? "2024-01-01";
  f.filingDate = "2025-12-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [assetOf(r, over)];
  return f;
}
async function run(r: E3eRow, over: Partial<AssetForm> = {}) {
  const form = formOf(r, over);
  const issues = allIssues(form);
  const body = await captureBody(form);
  const res = await postTransfer(body);
  return { form, issues, body, ...res, nbl: res.result?.nonBusinessLandJudgmentDetail as Loose | undefined, raw: body.nonBusinessLandRaw as Loose };
}

describe("E3e UI route 관통 — 표 전 행: 폼 → ⑧ → ④ → ⑫⑭ → 엔진 → 세액", () => {
  it.each(E3E_ALL_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, r: E3eRow) => {
    const res = await run(r);
    // ⑧ — 질문에 답했고 행이 정상이므로 이슈 0건(술어가 거짓인 행도 요구·차단 없음)
    expect(res.issues, `${r.id} ⑧ 이슈`).toEqual([]);
    // ④ — 술어 참이면 표의 행, 아니면 [] (질문 상태는 서버로 가지 않는다)
    const read = vacantLotHousePeriodsReadOf(res.form.assets[0]);
    const expectedRows = read && r.houseRows ? r.houseRows.map(([startDate, endDate]) => ({ startDate, ...(endDate ? { endDate } : {}) })) : [];
    expect(res.raw.nblOtherHouseholdHousePeriods, `${r.id} ④ 행`).toEqual(expectedRows);
    expect(res.raw).not.toHaveProperty("nblOtherHouseholdHouseStatus");
    // route — 판정·일수·세액
    expect(res.status, JSON.stringify(res.json).slice(0, 400)).toBe(200);
    expect(res.nbl?.isNonBusinessLand, `${r.id} 판정`).toBe(r.expect.nonBusiness);
    expect(res.nbl?.effectiveBusinessDays, `${r.id} 사업용 일수`).toBe(r.expect.eff);
    const ap = res.nbl?.areaProportioning;
    if (!ap || ap.nonBusinessRatio === 0 || ap.nonBusinessRatio === 1) expect(res.result?.calculatedTax, `${r.id} 세액`).toBe(e3eTax(r.expect.nonBusiness));
  });
});

describe("화면 경로 요점", () => {
  const row = (id: string) => E3E_ALL_ROWS.find((r) => r.id === id)!;

  it("H2 → 13호 + 꼬리 건물 + 신축으로 끝 — 세액이 N(253,960,000) → B(198,210,000)로 내려간다(과거 나지 구간 13호 인정)", async () => {
    const res = await run(row("H2"));
    expect(res.issues).toEqual([]);
    expect(res.nbl?.isNonBusinessLand).toBe(false);
    expect(res.result?.calculatedTax).toBe(198_210_000);
    expect(res.nbl?.warnings).toContain(NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE);
  });

  it("W2 → 세대 주택 소유 행이 화면 경로로 닿아 B(198,210,000) → N(253,960,000)이다 · 이력 OFF 경로 echo(`usage_periods` + vacantLot)가 결과에 실린다", async () => {
    const res = await run(row("W2"));
    expect(res.result?.calculatedTax).toBe(253_960_000);
    expect(res.nbl?.periodEvaluation?.basis).toBe("usage_periods");
    expect(res.nbl?.periodEvaluation?.vacantLot).toMatchObject({ scope: "whole_period", houseOwnedDays: 1461 });
    expect(res.nbl?.warnings).toContain(NBL_STATE_AT_TRANSFER_VACANT_LOT_HOUSE_PERIODS_APPLIED_NOTICE);
  });

  it("질문 «없습니다»는 행 없음과 같다 — W2 입력에서 질문만 none이면 현행 B(행을 싣지 않는다)", async () => {
    const res = await run(row("W2"), { nblOtherHouseholdHouseStatus: "none" });
    expect(res.raw.nblOtherHouseholdHousePeriods).toEqual([]);
    expect(res.nbl?.isNonBusinessLand).toBe(false);
    expect(res.result?.calculatedTax).toBe(198_210_000);
  });

  it("질문 미선택 → ⑧ HH-1이 계산 전에 막는다(구 저장 세션 — ③이 `none`을 채우지 않는다)", async () => {
    const f = formOf(row("W2"), { nblOtherHouseholdHouseStatus: "" });
    const issues = allIssues(f);
    expect(issues.map((i) => i.field)).toEqual(["nblOtherHouseholdHouseStatus"]);
  });

  it("stale 결함 행 + 술어 거짓(꼬리 건물 + 이력 OFF — W8) → ⑧ 요구 없음 · ④ [] · route 200 (막다른 길 없음, UM-7)", async () => {
    const res = await run(row("W8"), { nblOtherHouseholdHouseStatus: "owned", nblOtherHouseholdHousePeriods: [{ startDate: "", endDate: "" }, { startDate: "2020-01-01", endDate: "2019-01-01" }] });
    expect(res.issues).toEqual([]);
    expect(res.raw.nblOtherHouseholdHousePeriods).toEqual([]);
    expect(res.status).toBe(200);
  });

  it("호 전환 왕복 — 13호 → 다목 호 → 13호: 행은 store에 남고 ④는 호에 따라 싣고 비운다", async () => {
    const r = row("W2");
    const away = await run(r, { nblOtherRelatedBusinessType: "fish_farm_licensed" });
    expect(away.raw.nblOtherHouseholdHousePeriods).toEqual([]);
    expect(away.issues).toEqual([]);
    const back = await run(r);
    expect(back.raw.nblOtherHouseholdHousePeriods).toEqual([{ startDate: "2020-01-01" }]);
  });
});
