/**
 * anchor — 함께 양도 컴패니언의 **감정가액 개산공제(소득세법 시행령 §163⑥)** 배선 (④⑫⑭).
 *
 * 「소득세법」 §97②2호 본문은 취득가액을 §97①1호나목(매매사례·감정·환산)으로 하면 필요경비를
 * 「그 가액 + 대통령령으로 정하는 금액(개산공제)」으로 정한다. 엔진은 `acquisitionMethod === "appraisal"`일 때만
 * 감정 분기를 타는데, 컴패니언은 ④·⑫·⑭ 어디에도 이 표시가 없어 감정가액이 실가로 읽혔다
 * — ⑧이 필수로 받은 취득시 기준시가가 쓰이지 않아 **개산공제 0**(실측: 첫 자산 6,000,000 vs 컴패니언 0).
 *
 * 시나리오: 함께 양도(다른 물건 2건) · 계약총액 10억 50/50 안분 · 감정가액 3억 · 취득시 기준시가 2억
 *   ⇒ 개산공제 2억 × 3% = 6,000,000 · 양도차익 5억 − 3억 − 6,000,000 = 194,000,000.
 * 실행 골격은 `companion-self-built-penalty.anchor.test.ts`와 같다(④ 실제 변환 → route POST).
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const plain = (id: number, extra: Record<string, unknown>): AssetForm =>
  ({
    ...makeDefaultAsset(id),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    transferType: "regular",
    acquisitionDate: "2021-06-01",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
    standardPriceAtAcq: "200000000",
    standardPriceAtTransfer: "1000000001",
    ...extra,
  }) as AssetForm;

const form = (assets: AssetForm[]): TransferFormData =>
  ({
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets,
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1000000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

const APPRAISAL = { isAppraisalAcquisition: true, fixedAcquisitionPrice: "300000000" };

type Prop = { transferGain: number; necessaryExpense: number };
interface BundledData {
  aggregated?: { properties?: Prop[] };
}

const SCALARS = {
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  annualBasicDeductionUsed: 0,
};
const HOUSEHOLD = { isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 };

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...SCALARS, ...body, ...HOUSEHOLD }),
    }),
  );
  const json = (await res.json()) as { data?: BundledData };
  return { status: res.status, data: json.data };
}

/** ④ 실제 변환으로 body를 만든 뒤 route에 그대로 보낸다. */
async function run(f: TransferFormData) {
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
  const r = await post(cap.body!);
  return { ...r, body: cap.body! };
}

const props = (d: BundledData | undefined) => d?.aggregated?.properties ?? [];
const companionOf = (body: Record<string, unknown>) => (body.companionAssets as Record<string, unknown>[])[0];

describe("컴패니언 감정가액 — 개산공제(§163⑥) ④⑫⑭ 배선", () => {
  it("[CA-1] 컴패니언 감정가액도 첫 자산과 같은 개산공제 6,000,000 · 양도차익 194,000,000", async () => {
    const r = await run(form([plain(1, APPRAISAL), plain(2, APPRAISAL)]));
    expect(r.status).toBe(200);
    expect(companionOf(r.body).acquisitionMethod).toBe("appraisal");
    const [first, second] = props(r.data);
    expect(first.necessaryExpense).toBe(6_000_000);
    expect(second.necessaryExpense).toBe(6_000_000);
    expect(second.transferGain).toBe(194_000_000);
  });

  it("[CA-2] 토지 컴패니언도 같다 — 자산 종류가 아니라 산정방식이 개산공제를 정한다", async () => {
    const r = await run(form([plain(1, APPRAISAL), plain(2, { ...APPRAISAL, assetKind: "land" })]));
    expect(r.status).toBe(200);
    expect(props(r.data)[1].transferGain).toBe(194_000_000);
  });

  it("[CA-3] 함께 양도 묶음 안의 지분 50% 자산 — 감정가액·개산공제 모두 지분분(150,000,000 · 3,000,000)", async () => {
    const r = await run(form([plain(1, APPRAISAL), plain(2, { ...APPRAISAL, ownershipNumerator: "50" })]));
    expect(r.status).toBe(200);
    expect(companionOf(r.body).fixedAcquisitionPrice).toBe(150_000_000);
    expect(companionOf(r.body).ownershipRatio).toBe(0.5);
    const second = props(r.data)[1];
    expect(second.necessaryExpense).toBe(3_000_000);
    // 양도가액 333,333,333(기준시가 2 : 1 안분) − 150,000,000 − 3,000,000
    expect(second.transferGain).toBe(180_333_333);
  });

  it("[CA-4] 실가 컴패니언은 표시를 싣지 않는다 — 개산공제 없음(종전 거동 유지)", async () => {
    const r = await run(form([plain(1, APPRAISAL), plain(2, { fixedAcquisitionPrice: "300000000" })]));
    expect(r.status).toBe(200);
    expect(companionOf(r.body).acquisitionMethod).toBeUndefined();
    expect(props(r.data)[1].necessaryExpense).toBe(0);
    expect(props(r.data)[1].transferGain).toBe(200_000_000);
  });

  it("[CA-5] 환산 플래그가 함께 남은 stale 상태는 환산으로 읽는다 — 취득가액 칸을 싣지 않는 ④ 규칙과 같다", async () => {
    const r = await run(form([plain(1, APPRAISAL), plain(2, { ...APPRAISAL, useEstimatedAcquisition: true })]));
    expect(companionOf(r.body).acquisitionMethod).toBeUndefined();
    expect(companionOf(r.body).fixedAcquisitionPrice).toBeUndefined();
  });

  it("[CA-6] 겸용주택 컴패니언은 파트 카드 경로라 싣지 않는다", async () => {
    const r = await run(form([plain(1, APPRAISAL), plain(2, { ...APPRAISAL, isMixedUseHouse: true })]));
    expect(companionOf(r.body).acquisitionMethod).toBeUndefined();
  });

  it("[CA-7] 대조군 — 표시를 지우고 보내면 개산공제 0이 재현된다(⑭가 이 표시에만 반응함을 고정)", async () => {
    const r = await run(form([plain(1, APPRAISAL), plain(2, APPRAISAL)]));
    const stripped = await post({
      ...r.body,
      companionAssets: (r.body.companionAssets as Record<string, unknown>[]).map((c) => ({
        ...c,
        acquisitionMethod: undefined,
      })),
    });
    expect(props(stripped.data)[1].necessaryExpense).toBe(0);
    expect(props(stripped.data)[1].transferGain).toBe(200_000_000);
  });
});
