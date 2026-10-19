/**
 * V-11 ⑬ — `callTransferTaxAPI` body가 **새 키(carryoverGiftEvent·landCarryoverPart·buildingCarryoverPart)를 그대로 통과**시키는가 (2026-10-19)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md §10 V-11
 *
 * P1은 ④(`buildSplitPayload`)가 새 키를 만들기 **전**이다 — 그 빌더는 P2~가 쓴다. 여기서는 ⑬의 조립부(`callTransferTaxAPI`의 body 리터럴)에
 * 허용목록·후처리 필터가 없어 «④가 내는 최상위 키는 fetch body까지 가고, 그 body를 ⑫⑭가 strip 없이 받아 계산한다»는 것을 확인한다.
 * `buildSplitPayload`를 감싸 새 키를 얹은 body를 캡처 → 실제 route(⑫⑭ + 엔진)에 태운다.
 */
import { describe, it, expect, vi } from "vitest";
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

/** ④ 빌더가 새 키를 낸다고 가정한 스텁 — 기존 출력에 사건 + 토지 파트를 얹는다(P2~가 `buildSplitPayload`에서 만들 모양). */
const NEW_KEYS = {
  carryoverGiftEvent: { giftRegistryDate: "2023-03-01", giftTaxCalculated: 20_000_000, giftTaxBase: 300_000_000, donorRelation: "lineal" },
  landCarryoverPart: { donorAcquisitionDate: "2000-01-01", donorAcquisitionPrice: 100_000_000 },
};
vi.mock("@/lib/calc/transfer-tax-api-split", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calc/transfer-tax-api-split")>();
  return {
    ...actual,
    buildSplitPayload: (...args: Parameters<typeof actual.buildSplitPayload>) => ({
      ...actual.buildSplitPayload(...args),
      ...NEW_KEYS,
    }),
  };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 건물 매매(2021-03-01 4억) + 토지 이월과세 자리(landAcquisitionCause carryover_gift · 토지 취득일 = 증여일) — 12억 양도(토지 7억/건물 5억). */
const asset = (): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2021-03-01",
    landAcquisitionCause: "carryover_gift",
    landCauseHost: "purchase",
    landAcquisitionDate: "2023-03-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "400,000,000",
    actualSalePrice: "1,200,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "500,000,000",
  }) as unknown as AssetForm;

const form = (): TransferFormData =>
  ({
    transferDate: "2025-06-30",
    filingDate: "2025-08-31",
    assets: [asset()],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1200000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

describe("V-11 ⑬ body spread — ④가 내는 최상위 새 키는 fetch body까지 통과한다", () => {
  it("fetch body에 새 키 3종(사건·토지 파트)이 그대로 실린다 — 허용목록·후처리 필터 없음", async () => {
    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        cap.body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    await callTransferTaxAPI(form());
    vi.unstubAllGlobals();
    expect(cap.body!.carryoverGiftEvent).toEqual(NEW_KEYS.carryoverGiftEvent);
    expect(cap.body!.landCarryoverPart).toEqual(NEW_KEYS.landCarryoverPart);
    expect(cap.body!.landAcquisitionCause).toBe("carryover_gift");
  });

  it("그 body를 실제 route(⑫⑭ + 엔진)에 태우면 strip 없이 파트 이월과세로 계산된다 — 증여자 값 치환 172,260,000 (SPCO-T1과 같은 입력)", async () => {
    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        cap.body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    await callTransferTaxAPI(form());
    vi.unstubAllGlobals();
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // 화면 밖 호출자(판정 메뉴 등)가 채우는 필수 불리언 — 이 테스트의 관심사가 아니다
          isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0,
          ...cap.body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
        }),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json.error ?? {})).toBe(200);
    expect(json.data.result.splitDetail.land.carryover.judgment).toBe("applied");
    expect(json.data.result.splitDetail.land.acquisitionDate).toBe("2000-01-01");
  });
});
