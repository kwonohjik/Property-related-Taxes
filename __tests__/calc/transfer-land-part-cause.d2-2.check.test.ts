/**
 * D2-2 Check 후속 (2026-10-09) — sync 검사 실측 3건의 되돌리면 실패하는 고정.
 *
 * #1 [Medium] PHD 자동 ON 잔재 → 상속·증여(·신축) 호스트에서 ⑧ 통과 ↔ ⑫ 400(`landStandardPriceAtTransfer` — 화면에 없는 칸).
 *    토글은 매매 블록에만 있는데 자동 ON된 플래그는 원인을 바꿔도 남고 ④ `usesPhd`가 분리 계산을 켰다. 읽는 쪽 파생(`phdToggleCauseReachable`).
 * #2 [Medium] 증여 D2 ON → 양도 형태를 부담부증여로 → 토글이 숨는데 `hasSeperate…`가 켜져 ⑧이 입력칸 없는 `landAcquisitionPrice`를 요구.
 * #3 [Low] ⑥ D2 결과 분기는 입력 프리뷰가 pending일 때만 — 확정 프리뷰는 결과 도착 후 입력을 고쳐도 실시간.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { hasStaleSplitInput, normalizeBuildingCauseInputs } from "@/lib/calc/transfer-land-part-cause";
import { phdFlagEffective, phdPayloadActive, phdToggleCauseReachable, phdToggleReachable } from "@/lib/calc/phd-toggle-scope";
import { ownerSplitHousingNeedsBuildingStd } from "@/lib/calc/transfer-tax-split-acq-mode";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const TD = "2026-06-30";
const form = (a: AssetForm): TransferFormData =>
  ({ transferDate: TD, filingDate: "2026-08-31", assets: [a], houses: [], presaleRights: [], contractTotalPrice: "1200000000", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false }) as unknown as TransferFormData;

async function bodyOf(a: AssetForm): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(form(a));
  vi.unstubAllGlobals();
  return body;
}
const ENGINE_BASE = { isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, isOneHousehold: false, householdHousingCount: 1, residencePeriodMonths: 0 };
async function route(body: Record<string, unknown>) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ENGINE_BASE, ...body }) }));
  const j = await res.json();
  return { status: res.status, tax: j?.data?.result?.totalTax as number | undefined, result: j?.data?.result as TransferTaxResult | undefined, fieldErrors: j?.error?.fieldErrors as Record<string, string[]> | undefined };
}
const v8 = (a: AssetForm) => collectWithFields(() => validateAssetAcquisition(a, "자산1", TD));
const full = async (a: AssetForm) => route(await bodyOf(a));

/** 상속·증여·신축 주택 — 건물 취득일 2003-05-01(개별주택가격 최초 고시 전) · 자산 단위 계산 */
function host(cause: "inheritance" | "gift" | "newConstruction", over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: cause,
    acquisitionDate: "2003-05-01",
    ...(cause === "inheritance"
      ? { inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01", decedentAcquisitionDate: "1990-01-01", publishedValueAtInheritance: "700,000,000", inheritanceValuationMethod: "appraisal" }
      : cause === "gift"
        ? { fixedAcquisitionPrice: "700,000,000" }
        : { occupancyApprovalDate: "2003-05-01", fixedAcquisitionPrice: "700,000,000" }),
    actualSalePrice: "1,200,000,000",
    standardPriceAtTransfer: "1,200,000,000",
    ...over,
  } as unknown as AssetForm;
}

describe("#1 PHD 잔재 — 토글이 없는 취득원인(상속·증여·신축)에서는 PHD가 아니다 (뿌리: phdToggleCauseReachable)", () => {
  it("술어 격자: 매매·미지정·이월과세·겸용은 종전 그대로 도달, 상속·증여·신축·부담부증여는 미도달", () => {
    const k = { assetKind: "housing" as const, hasSeperateLandAcquisitionDate: false };
    for (const c of ["purchase", undefined, "", "carryover_gift"]) expect(phdToggleReachable({ ...k, acquisitionCause: c }), String(c)).toBe(true);
    for (const c of ["inheritance", "gift", "newConstruction", "burdened_gift"]) expect(phdToggleReachable({ ...k, acquisitionCause: c }), c).toBe(false);
    // 겸용은 취득원인과 무관하게 자기 패널 — 건드리지 않는다
    expect(phdToggleReachable({ ...k, acquisitionCause: "inheritance", isMixedUseHouse: true })).toBe(true);
    expect(phdToggleCauseReachable({ acquisitionCause: "gift", isMixedUseHouse: true })).toBe(true);
    // 종류 축은 종전 그대로: 비주택·토지는 미도달, building은 분리취득이면 도달(매매)
    expect(phdToggleReachable({ assetKind: "land", acquisitionCause: "purchase" })).toBe(false);
    expect(phdToggleReachable({ assetKind: "building", hasSeperateLandAcquisitionDate: true, acquisitionCause: "purchase" })).toBe(true);
    expect(phdToggleReachable({ assetKind: "building", hasSeperateLandAcquisitionDate: true, acquisitionCause: "gift" })).toBe(false);
  });

  it("phdFlagEffective·phdPayloadActive: 상속·증여·신축의 잔재 플래그는 무효, 매매 원인은 종전 그대로(긍정 짝)", () => {
    for (const c of ["inheritance", "gift", "newConstruction"] as const) {
      const a = host(c, { usePreHousingDisclosure: true });
      expect(phdFlagEffective(a), c).toBe(false);
      expect(phdPayloadActive(a), c).toBe(false);
    }
    const purchase = host("gift", { acquisitionCause: "purchase", usePreHousingDisclosure: true });
    expect(phdFlagEffective(purchase)).toBe(true);
    expect(phdPayloadActive(purchase)).toBe(true);
    // 값은 지우지 않는다 — 매매로 돌아오면 복귀
    expect(host("gift", { usePreHousingDisclosure: true }).usePreHousingDisclosure).toBe(true);
  });

  it.each(["inheritance", "gift", "newConstruction"] as const)(
    "%s + PHD 잔재 → ⑧ 통과 · ④ body에 PHD·분리 입력 없음 · ⑫ 200 · 자산 단위 계산 · 세액이 플래그 없는 같은 자산과 같다",
    async (cause) => {
      const stale = host(cause, { usePreHousingDisclosure: true });
      const clean = host(cause, { usePreHousingDisclosure: false });
      expect(v8(stale).result).toBeNull();
      const b = await bodyOf(stale);
      expect(b.preHousingDisclosure).toBeUndefined();
      expect(b.landAcquisitionDate).toBeUndefined();
      expect(b.isSeparateAcquisition).toBeUndefined();
      expect(JSON.stringify(b)).toBe(JSON.stringify(await bodyOf(clean))); // 플래그가 없는 자산과 body가 바이트 동일
      const r = await route(b);
      expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
      expect(r.result?.splitDetail).toBeUndefined(); // 분리 계산이 아니라 자산 단위
      expect(r.tax).toBe((await full(clean)).tax);
    },
  );

  it("긍정 짝: 매매 + 환산 + PHD 플래그는 종전대로 PHD 경로(⑧이 3-시점 칸을 요구한다) — 매매 시드 불변", () => {
    const a = {
      ...host("gift", { acquisitionCause: "purchase" }),
      fixedAcquisitionPrice: "", useEstimatedAcquisition: true, usePreHousingDisclosure: true,
    } as unknown as AssetForm;
    expect(phdPayloadActive(a)).toBe(true);
    expect(String(v8(a).result)).toMatch(/최초 고시일|개별주택가격|3-시점|기준시가/);
  });

  it("상속 + 소유자 분리 + PHD 잔재: 건물 기준시가(나목) 요구가 ④·⑤와 같은 술어를 쓴다 — ⑧ 통과 ⇒ ⑫ 200", async () => {
    const a = host("inheritance", {
      acquisitionDate: "2018-03-02", inheritanceStartDate: "2018-03-02", inheritanceDate: "2018-03-02", selfOwns: "building_only", usePreHousingDisclosure: true,
      acquisitionArea: "200", transferArea: "200", standardPricePerSqmAtAcq: "100,000", landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
      saleSplitMode: "apportioned", standardPriceAtAcq: "300,000,000",
    });
    // PHD 잔재는 PHD가 아니므로 개별주택가격 비례 안분의 나목이 필요하다(잔재가 없는 같은 자산과 요구가 같다)
    expect(ownerSplitHousingNeedsBuildingStd(a)).toBe(ownerSplitHousingNeedsBuildingStd({ ...a, usePreHousingDisclosure: false }));
    for (const withStd of [false, true]) {
      const x = { ...a, buildingStandardPriceAtAcq: withStd ? "50,000,000" : "" } as AssetForm;
      const eight = v8(x).result;
      if (eight === null) expect((await full(x)).status, `buildingStd=${withStd}`).toBe(200);
      expect(eight === null, `buildingStd=${withStd}`).toBe(v8({ ...x, usePreHousingDisclosure: false }).result === null);
    }
  });
});

describe("#2 부담부증여로 바꾸면 D2 잔재가 stale — 입력칸 없는 ⑧ 차단이 없다", () => {
  const d2Gift = (over: Partial<AssetForm> = {}): AssetForm =>
    host("gift", {
      acquisitionDate: "2025-05-01", landAcquisitionCause: "purchase", landCauseHost: "gift", hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2025-01-10", landAcqMode: "actual", buildingAcqMode: "actual", fixedAcquisitionPrice: "",
      saleSplitMode: "actual", landTransferPrice: "700,000,000", buildingTransferPrice: "500,000,000",
      landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000", ...over,
    });

  it("증여 D2 ON(가액 비움) → 부담부증여: 술어가 stale로 읽고 ⑧이 landAcquisitionPrice로 막지 않는다", () => {
    const burdened = d2Gift({ transferType: "burdened_gift" });
    expect(hasStaleSplitInput(burdened)).toBe(true);
    expect(normalizeBuildingCauseInputs(burdened).hasSeperateLandAcquisitionDate).toBe(false);
    const r = v8(burdened);
    expect(r.result === null || r.fieldOf(r.result) !== "landAcquisitionPrice").toBe(true);
    // 긍정 짝: 부담부증여가 아니면(D2 유효) 같은 가액 비움은 ⑧이 가액 칸으로 안내한다
    const live = v8(d2Gift());
    expect(live.fieldOf(live.result!)).toMatch(/landAcquisitionPrice|buildingAcquisitionPrice/);
  });

  it("부담부증여 자체 경로의 분리 입력(호스트 태그·purchase overlay 없음)은 보호된다 — 같은 객체", () => {
    for (const over of [
      { landAcquisitionCause: "inheritance" as const, landCauseHost: "" as const }, // D1 잔재
      { landAcquisitionCause: "" as const, landCauseHost: "" as const },
      { landAcquisitionCause: "purchase" as const, landCauseHost: "" as const }, // overlay만 있고 태그 없음
      { landAcquisitionCause: "" as const, landCauseHost: "gift" as const }, // 태그만 있고 overlay 없음
    ]) {
      const a = d2Gift({ transferType: "burdened_gift", ...over });
      expect(hasStaleSplitInput(a), JSON.stringify(over)).toBe(false);
      expect(normalizeBuildingCauseInputs(a)).toBe(a);
    }
  });
});

describe("#3 ⑥ 결과 분기는 pending일 때만", () => {
  const d2 = (over: Partial<AssetForm> = {}): AssetForm =>
    host("inheritance", {
      acquisitionDate: "2025-05-01", inheritanceStartDate: "2025-05-01", inheritanceDate: "2025-05-01",
      landAcquisitionCause: "purchase", landCauseHost: "inheritance", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2025-01-10",
      landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000", buildingAcquisitionPrice: "400,000,000",
      saleSplitMode: "actual", landTransferPrice: "700,000,000", buildingTransferPrice: "500,000,000",
      landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000", acquisitionArea: "200", transferArea: "200", standardPricePerSqmAtAcq: "100,000", ...over,
    });
  const row = (a: AssetForm, res: TransferTaxResult | null) => computeTransferPerAssetSummary(form(a), res ? ({ mode: "single", result: res } as never) : null).rows[0];

  it("실가·평가액(확정 프리뷰): 결과 도착 후 건물 평가액을 고치면 사이드바가 실시간 프리뷰를 따른다 — 옛 엔진 값에 머물지 않는다", async () => {
    const a = d2();
    const r = await full(a);
    expect(r.status).toBe(200);
    expect(row(a, r.result!).acqPrice).toBe(700_000_000);
    const edited = d2({ buildingAcquisitionPrice: "450,000,000" });
    expect(row(edited, r.result!).acqPrice).toBe(750_000_000); // 옛 결과(700,000,000)가 아니라 입력 프리뷰
    expect(row(edited, r.result!).acqPending).toBe(false);
  });

  it("긍정 짝: 토지 환산(pending)은 결과 도착 후 엔진 값으로 풀린다", async () => {
    const a = d2({ landAcqMode: "estimated", landAcquisitionPrice: "" });
    expect(row(a, null).acqPending).toBe(true);
    const r = await full(a);
    expect(r.status).toBe(200);
    const post = row(a, r.result!);
    expect(post.acqPending).toBe(false);
    expect(post.acqPrice).toBeGreaterThan(0);
  });
});
