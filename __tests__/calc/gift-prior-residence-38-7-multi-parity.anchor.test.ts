/**
 * anchor(⑬·⑫·⑭ 다건) — 증여 전 동일세대 거주 개월의 다건 경로 (결정 #38-7)
 *
 * 증여 사실 한 벌(`mapGiftHouseholdBasis`)이 단건 `engine-input.ts`·다건 `multi/route.ts` 두 곳에서 쓰인다 — 새 키를 한쪽만 매핑하면 다건에서 침묵 strip되어
 * 같은 입력이 단건 125,246,000 · 다건 484,588,500이 된다(#38-3 선례). 다건 ④(`buildPropertyPayload`)·⑫·⑭가 단건과 같은 세액을 내는지 고정한다.
 *
 * 기대값은 단건 route 결과와의 동일성이다 — 두 route가 같은 엔진을 쓰므로 어긋나면 배관 결함이다. 절댓값은 계산기 anchor(`gift-prior-residence-38-7`)와 같다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { handoff } from "./_one-house-pr6a-routes";
import { buildMultiBody, postMulti, runMulti, runSingle } from "./_helpers/single-multi-route-parity";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** 그 밖의 친족 증여(이월과세 밖) · 계속 같은 세대 · 조정대상지역 취득 · 증여 후 거주 12개월 · 18억 양도(12억 초과). */
const giftAsset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    residenceInputMode: "direct",
    residencePeriods: [],
    assetKind: "housing",
    addressJibun: "서울특별시 종로구 청운동 1-1",
    acquisitionCause: "gift",
    acquisitionDate: "2022-06-01",
    fixedAcquisitionPrice: "600000000",
    residencePeriodMonthsAsset: "12",
    donorAcquisitionDate: "2018-01-01",
    giftDonorRelation: "other",
    giftSameHousehold: "yes",
    giftHouseholdHoldingStartDate: "2019-03-01",
    ...over,
  }) as AssetForm;

function calcForm(assetOver: Partial<AssetForm> = {}): TransferFormData {
  const j = {
    ...createInitialOneHouseJudgmentForm(),
    assets: [giftAsset()],
    transferDate: "2025-07-01",
    contractTotalPrice: "1800000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: true,
    houses: [],
    presaleRights: [],
  } as unknown as OneHouseJudgmentFormData;
  const f = handoff(j);
  return { ...f, assets: [{ ...f.assets[0], ...assetOver } as AssetForm, ...f.assets.slice(1)] } as TransferFormData;
}

describe("다건 — 증여 전 동일세대 거주 개월이 단건과 같은 사실로 닿는다", () => {
  it("[PM-1] ④ — 다건 페이로드가 개월을 싣는다 · 미답은 싣지 않는다(짝)", () => {
    expect(buildPropertyPayload(calcForm({ giftPriorHouseholdResidenceMonths: "12" }))).toMatchObject({
      giftSameHouseholdContinuous: true,
      giftPriorHouseholdResidenceMonths: 12,
    });
    expect(buildPropertyPayload(calcForm({ giftPriorHouseholdResidenceMonths: "" }))).not.toHaveProperty("giftPriorHouseholdResidenceMonths");
  });

  it("[PM-2] ⑫⑭ — 같은 입력이 단건·다건에서 같은 세액이다: 12개월 125,246,000 · 미답 484,588,500(과세 → 부분 비과세 방향)", async () => {
    const yes = calcForm({ giftPriorHouseholdResidenceMonths: "12" });
    const single = await runSingle(yes);
    const multi = await runMulti([yes]);
    expect(single.status).toBe(200);
    expect(multi.status, JSON.stringify(multi.json).slice(0, 300)).toBe(200);
    expect(single.totalTax).toBe(125_246_000); // 거주 24개월 통산 → 표2 대상: 보유 3년 × 4% = 12%(결정 #38-9)
    expect(multi.totalTax).toBe(single.totalTax);

    const none = calcForm({ giftPriorHouseholdResidenceMonths: "" });
    expect((await runSingle(none)).totalTax).toBe(484_588_500);
    expect((await runMulti([none])).totalTax).toBe(484_588_500);
  }, 60_000);

  it("[PM-3] ⑭ — 다건 본문에서 개월을 지우면 통산이 빠진다(침묵 strip이 아니라 사실 부재의 결과) · 다시 넣으면 돌아온다(짝)", async () => {
    const body = await buildMultiBody([calcForm({ giftPriorHouseholdResidenceMonths: "12" })]);
    const p0 = (body.properties as Record<string, unknown>[])[0];
    expect(p0.giftPriorHouseholdResidenceMonths).toBe(12);
    const withMonths = await postMulti(body);
    expect(withMonths.totalTax).toBe(125_246_000);
    delete p0.giftPriorHouseholdResidenceMonths;
    expect((await postMulti(body)).totalTax).toBe(484_588_500);
  }, 60_000);

  it("[PM-4] ⑫ — 다건도 상한(39개월) 초과와 「예」가 아닌데 보낸 개월을 거절한다", async () => {
    const body = await buildMultiBody([calcForm({ giftPriorHouseholdResidenceMonths: "12" })]);
    const p0 = (body.properties as Record<string, unknown>[])[0];
    p0.giftPriorHouseholdResidenceMonths = 40;
    expect((await postMulti(body)).status).toBe(400);
    p0.giftPriorHouseholdResidenceMonths = 39;
    expect((await postMulti(body)).status).toBe(200);
    p0.giftSameHouseholdContinuous = false;
    delete p0.giftHouseholdHoldingStartDate;
    expect((await postMulti(body)).status).toBe(400);
  }, 60_000);
});
