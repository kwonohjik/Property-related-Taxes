/**
 * V-11 ⑬ — `callTransferTaxAPI` body가 **새 키(carryoverGiftEvent·landCarryoverPart)를 그대로 통과**시키는가 (2026-10-19 · P3 A 2026-10-20)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md §10 V-11 · ui.design.md §4 (P3 A)
 *
 * P1에서는 ④가 새 키를 만들기 전이라 `buildSplitPayload`를 감싼 스텁이 키를 얹었고, 폼의 `landAcquisitionCause: "carryover_gift"`는
 * `effectiveLandAcquisitionCause`의 캐스트를 통해 그대로 실렸다(H-4 — 그 캐스트는 손상 저장값으로 화면을 크래시시켰다).
 * P3 A부터는 **실제 폼 경로**다: 「토지는 다른 원인으로 취득」 + 원인 「이월과세(증여)」 + `landCarryover` 서브폼 → ④(`buildSplitCarryoverPayload`) →
 * ⑬ body → 실제 route(⑫⑭ + 엔진). ⑬ 조립부에 허용목록·후처리 필터가 없다는 사실은 그대로 이 경로가 확인한다.
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

/** ④가 A 폼에서 만들어야 하는 새 키 — 아래 `landCarryover` 서브폼 값의 와이어 모양. */
const NEW_KEYS = {
  carryoverGiftEvent: { giftRegistryDate: "2023-03-01", giftTaxCalculated: 20_000_000, giftTaxBase: 300_000_000, donorRelation: "lineal" },
  landCarryoverPart: { donorAcquisitionDate: "2000-01-01", donorAcquisitionPrice: 100_000_000 },
};

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 건물 매매(2021-03-01 4억) + 토지 이월과세(A — 토지 취득일 = 증여 등기접수일) — 12억 양도(토지 7억/건물 5억). */
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
    landCarryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2023-03-01",
      donorRelation: "lineal",
      donorAcquisitionDate: "2000-01-01",
      donorAcquisitionPrice: "100,000,000",
      giftTaxCalculated: "20,000,000",
      giftTaxBase: "300,000,000",
    },
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
  it("fetch body에 새 키(사건·토지 파트)가 그대로 실린다 — 허용목록·후처리 필터 없음 · A는 건물 파트를 싣지 않는다", async () => {
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
    expect(cap.body!.carryoverGiftEvent).toMatchObject(NEW_KEYS.carryoverGiftEvent);
    expect(cap.body!.landCarryoverPart).toEqual(NEW_KEYS.landCarryoverPart);
    expect(cap.body!.landAcquisitionCause).toBe("carryover_gift");
    expect(cap.body!.landAcquisitionDate).toBe("2023-03-01");
    expect(cap.body!).not.toHaveProperty("buildingCarryoverPart");
    expect(cap.body!).not.toHaveProperty("carryoverTaxation");
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

describe("P6 ⑬ body spread — 파트 환산 키(useEstimatedAcquisition·donorStandardPriceAtAcquisition)도 fetch body → route까지 통과한다", () => {
  const estForm = (): TransferFormData => {
    const f = form();
    const a = (f.assets as unknown as AssetForm[])[0];
    return {
      ...f,
      assets: [{ ...a, landCarryover: { ...a.landCarryover, partEstimated: true, donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: "30,000,000" } }],
    } as unknown as TransferFormData;
  };
  async function capture(f: TransferFormData) {
    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        cap.body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    await callTransferTaxAPI(f);
    vi.unstubAllGlobals();
    return cap.body!;
  }

  it("body 토지 파트: 환산 플래그 + 분자만(가액 키 없음) → route 200 · echo 분자·분모", async () => {
    const body = await capture(estForm());
    expect(body.landCarryoverPart).toEqual({ donorAcquisitionDate: "2000-01-01", useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: 30_000_000 });
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0,
          ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
        }),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json.error ?? {})).toBe(200);
    expect(json.data.result.splitDetail.land.carryover.estimated).toMatchObject({ donorStdPriceAtAcquisition: 30_000_000, stdPriceAtTransfer: 700_000_000 });
  });

  it("지분 0.5: 분자는 스케일하지 않는다(30,000,000 그대로) — 가액 모드의 증여자 취득가액은 지분 몫(50,000,000)", async () => {
    const f = estForm();
    const a = (f.assets as unknown as AssetForm[])[0];
    const half = { ...a, ownershipNumerator: "1", ownershipDenominator: "2" };
    expect(((await capture({ ...f, assets: [half] } as unknown as TransferFormData)).landCarryoverPart as Record<string, unknown>).donorStandardPriceAtAcquisition).toBe(30_000_000);
    const real = { ...half, landCarryover: { ...(form().assets as unknown as AssetForm[])[0].landCarryover } };
    expect(((await capture({ ...f, assets: [real] } as unknown as TransferFormData)).landCarryoverPart as Record<string, unknown>).donorAcquisitionPrice).toBe(50_000_000);
  });
});
