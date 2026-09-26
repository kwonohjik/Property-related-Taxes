/**
 * anchor (A3 · OH-09) — 겸용주택의 1세대1주택 비과세 **주택 수 축**이 명부 도출 §155①(일시적 2주택)을
 * 일반 경로와 **같은 정본**(`resolveDeemedOneHouseBy155` — 타이밍 1년·처분기한 포함)으로 판정한다.
 *
 * 법령: 소득세법 시행령 §155①(MST 286211) — 일시적 2주택은 「1세대1주택으로 보아 제154조제1항을 적용」
 *   (신고·선택 요건 없는 강행 의제) · §154③ — 겸용주택의 주택 부분도 §89①3호 주택이다.
 *
 * 결함: ④ `buildMixedUsePayload`가 `isOneHouseExempt`를 UI가 사라진 토글(`temporaryTwoHouseSpecial`)로
 *   만들어, 명부에서 §155①이 도출돼도 겸용 경로만 「다주택 전액 과세」(non_one_house_full_taxation)였다.
 *   반대로 저장분에 남은 토글 true는 타이밍 검증 없이 비과세를 열었다.
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
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildMixedUsePayload } from "@/lib/calc/transfer-tax-api-mixed-use";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

/** 리뷰 실패 시나리오 — 건물 2018-06-01 취득 · 2026-06-01 10억 양도 · 명부 2024-05-30 취득 1채 */
const MIXED = {
  transferPrice: 1_000_000_000,
  transferDate: "2026-06-01",
  acquisitionPrice: 400_000_000,
  acquisitionDate: "2018-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 60,
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 100,
    landAcquisitionDate: "2018-06-01",
    buildingAcquisitionDate: "2018-06-01",
    transferStandardPrice: {
      housingPrice: 300_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 2_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 150_000_000,
      commercialBuildingPrice: 50_000_000,
      landPricePerSqm: 1_000_000,
    },
    residencePeriodYears: 5,
    zoneType: "general_residential" as const,
    // ④가 이제 주택 수 축만 싣는다(2채 → false). §155①은 엔진이 temporaryTwoHouse로 판정한다.
    isOneHouseExempt: false,
  },
};

type RouteResult = {
  calculationRoute: { highValueRule: string };
  housingPart: { isExempt: boolean };
  total: { totalPayable: number };
};

async function post(over: object = {}): Promise<RouteResult> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...MIXED, ...over }),
    }),
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as { data: { result: RouteResult } };
  return json.data.result;
}
const rule = (r: RouteResult) => r.calculationRoute.highValueRule;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("OH-09 겸용 × §155① — 일반 경로와 같은 정본", () => {
  it("🔴 명부 도출 일시적 2주택(1년 경과·3년 내) → 주택분 12억 이하 비과세", async () => {
    const r = await post({
      temporaryTwoHouse: { previousAcquisitionDate: "2018-06-01", newAcquisitionDate: "2024-05-30" },
    });
    expect(rule(r)).toBe("below_threshold_exempt");
    expect(r.housingPart.isExempt).toBe(true);
  });

  it("부정 짝 — 신규 주택을 1년 안에 취득(2018-12-01) → §155① 불성립 → 전액 과세", async () => {
    const r = await post({
      temporaryTwoHouse: { previousAcquisitionDate: "2018-06-01", newAcquisitionDate: "2018-12-01" },
    });
    expect(rule(r)).toBe("non_one_house_full_taxation");
  });

  it("부정 짝 — 처분기한 3년 초과(신규 2022-01-01) → 불성립", async () => {
    const r = await post({
      temporaryTwoHouse: { previousAcquisitionDate: "2018-06-01", newAcquisitionDate: "2022-01-01" },
    });
    expect(rule(r)).toBe("non_one_house_full_taxation");
  });

  it("대조군 — §155① 입력 없음(2주택) → 전액 과세", async () => {
    expect(rule(await post())).toBe("non_one_house_full_taxation");
  });

  it("비과세 세액이 실제로 줄어든다 — 표시만 바뀌는 게 아니다", async () => {
    const on = await post({
      temporaryTwoHouse: { previousAcquisitionDate: "2018-06-01", newAcquisitionDate: "2024-05-30" },
    });
    const off = await post();
    expect(on.total.totalPayable).toBeLessThan(off.total.totalPayable);
  });
});

describe("OH-09 ④ — isOneHouseExempt는 폐기된 토글을 읽지 않는다", () => {
  function mixedForm() {
    const form = createDefaultTransferFormData();
    form.transferDate = "2026-06-01";
    form.isOneHousehold = true;
    form.assets[0] = { ...form.assets[0], assetKind: "housing", isMixedUseHouse: true, acquisitionDate: "2018-06-01" };
    return form;
  }

  it("🔴 저장분에 남은 temporaryTwoHouseSpecial=true + 2주택 → 주택 수 축만(false) — 타이밍은 엔진이 본다", () => {
    const form = mixedForm();
    form.householdHousingCount = "2";
    form.temporaryTwoHouseSpecial = true;
    expect(buildMixedUsePayload(form.assets[0], form)?.isOneHouseExempt).toBe(false);
  });

  it("긍정 짝 — 1주택 1세대 → true", () => {
    const form = mixedForm();
    form.householdHousingCount = "1";
    expect(buildMixedUsePayload(form.assets[0], form)?.isOneHouseExempt).toBe(true);
  });

  it("🔴 명부가 정본 — 스칼라 \"1\"이어도 명부에 다른 주택 1채가 있으면 2주택(false)", () => {
    const form = mixedForm();
    form.householdHousingCount = "1";
    form.houses = [{ ...(form.houses[0] ?? {}), id: "h1", acquisitionDate: "2024-05-30" } as never];
    expect(buildMixedUsePayload(form.assets[0], form)?.isOneHouseExempt).toBe(false);
  });
});
