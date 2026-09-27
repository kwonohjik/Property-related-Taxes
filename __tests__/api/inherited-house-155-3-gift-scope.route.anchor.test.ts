/**
 * route anchor (L-11) — 「소급 2년 내 피상속인 증여주택 제외」가 §155② 단독상속 풀에만 걸리는 것이
 * **단건 계산기 route · 판정 메뉴 route · 중과 15호 경로** 모두에 도달한다(`feedback_leaf_anchor_skips_zod_layer`).
 *
 * 법령·해석: 엔진 anchor `__tests__/tax-engine/transfer/inherited-house-155-3-gift-scope.anchor.test.ts` 머리 주석
 * (「소득세법 시행령」 §155② 괄호 「이하 이 항에서」 · §155③ 괄호 없음 · 법규과-1841 2022.6.21.).
 * 중과: 영 §167의10①15호 ① 요소는 비과세와 같은 세대 주택 수로 본다(E-14 #1818 — `resolveSurchargeDeemedOneHouse`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { POST as POST_SINGLE } from "@/app/api/calc/transfer/route";
import { POST as POST_JUDGE } from "@/app/api/calc/one-house-exemption/route";

const post = async (handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) => {
  const res = await handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data;
};

const row = (id: string, acq: string, extra: Record<string, unknown> = {}) => ({
  id,
  region: "capital",
  acquisitionDate: acq,
  officialPrice: 300_000_000,
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...extra,
});
const SOLE = { isInherited: true, inheritedDate: "2019-06-01" };
const CO_MINOR = { ...SOLE, isCoInherited: true, isLargestCoInheritedShareholder: false };

/** 비조정 일반주택 8억 양도 2023-06-01 · 명부 = 양도 주택 + 상속주택 1채 · 일반주택은 2018-03-01 피상속인 증여 */
const body = (inh: Record<string, unknown>, gifted = true) => ({
  propertyType: "housing",
  transferPrice: 800_000_000,
  acquisitionPrice: 400_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  annualBasicDeductionUsed: 0,
  reductions: [],
  acquisitionDate: "2018-03-01",
  transferDate: "2023-06-01",
  householdHousingCount: 2,
  residencePeriodMonths: 0,
  sellingHouseId: "selling",
  houses: [row("selling", "2018-03-01"), row("inh", "2019-06-01", inh)],
  ...(gifted ? { generalHouseGiftedFromDecedentWithin2yr: true, generalHouseGiftDate: "2018-03-01" } : {}),
});

describe("L-11 — 비과세 (단건 route · 판정 메뉴 route)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("🔴 ③ 소수지분 + 증여 → 비과세 (종전: 과세)", async () => {
    const s = await post(POST_SINGLE, "http://l/api/calc/transfer", body(CO_MINOR));
    expect(s.result.isExempt).toBe(true);
    expect(s.result.totalTax).toBe(0);
    const j = await post(POST_JUDGE, "http://l/api/calc/one-house-exemption", body(CO_MINOR));
    expect(j.judgment.isExempt).toBe(true);
  });

  it("② 쌍둥이 — 단독상속 + 증여 → 과세 (두 route 같은 결론)", async () => {
    const s = await post(POST_SINGLE, "http://l/api/calc/transfer", body(SOLE));
    expect(s.result.isExempt).toBe(false);
    const j = await post(POST_JUDGE, "http://l/api/calc/one-house-exemption", body(SOLE));
    expect(j.judgment.isExempt).toBe(false);
  });
});

/**
 * 12억 초과 + 조정 양도 — E-14 E14-4와 같은 바닥(강남 양도 주택 2015 · 상속주택 2019 · 양도 2026-09-18 · 20억).
 * · ③ 소수지분은 중과 주택 수에서 원래 빠진다(영 §167의3②2호 — `multi-house-surcharge-count.ts` 배제 1.5).
 *   그래서 ③ 쌍둥이의 세액 차이는 **비과세(12억 이하분)** 축에서만 난다: 제외 성립 204,355,800.
 * · ② 단독상속 + 증여는 ② 불성립 → 2주택 중과 1,141,178,500 (#1818 anchor 실측값과 같다).
 */
describe("L-11 — 12억 초과 조정 양도 (단건 route)", () => {
  const GANGNAM = "1168010100";
  const TRANSFER_DATE = "2026-09-18";
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockImplementation(
      async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
    );
  });
  const surchargeBody = (inh: Record<string, unknown>, gifted: boolean) => ({
    ...body(inh, gifted),
    transferPrice: 2_000_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: "2015-01-01",
    transferDate: TRANSFER_DATE,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    regionCode: GANGNAM,
    houses: [
      row("selling", "2015-01-01", { regionCode: GANGNAM }),
      row("inh", "2019-06-01", { regionCode: GANGNAM, ...inh }),
    ],
  });
  const verdict = async (inh: Record<string, unknown>, gifted: boolean) => {
    const d = await post(POST_SINGLE, "http://l/api/calc/transfer", surchargeBody(inh, gifted));
    const mh = d.result.multiHouseSurchargeEvaluation as
      | { exclusionReasons: { type: string }[]; surchargeType: string }
      | undefined;
    return {
      totalTax: d.result.totalTax as number,
      reasons: (mh?.exclusionReasons ?? []).map((x) => x.type).join(","),
      surchargeType: mh?.surchargeType,
    };
  };

  it("대조군 — ③ 소수지분 · 증여 아님 → 고가주택 비과세 안분 204,355,800 (중과 없음)", async () => {
    expect(await verdict(CO_MINOR, false)).toEqual({
      totalTax: 204_355_800,
      reasons: "",
      surchargeType: "none",
    });
  });

  it("🔴 ③ 소수지분 + 증여 → 대조군과 같은 204,355,800", async () => {
    expect(await verdict(CO_MINOR, true)).toEqual({
      totalTax: 204_355_800,
      reasons: "",
      surchargeType: "none",
    });
  });

  it("② 쌍둥이 — 단독상속 + 증여 → ② 불성립 → 2주택 중과 1,141,178,500", async () => {
    expect(await verdict(SOLE, true)).toEqual({
      totalTax: 1_141_178_500,
      reasons: "",
      surchargeType: "multi_house_2",
    });
  });
});
