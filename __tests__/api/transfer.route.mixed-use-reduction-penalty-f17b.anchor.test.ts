/**
 * anchor: 겸용주택이 **조특법 감면·가산세를 실제로 계산**한다 (F17-B, 2026-08-23)
 *
 * ## 종전 결함
 *
 * 겸용 분기(`route.ts`)는 `calcMixedUseTransferTax(...)`만 부르고 `MixedUseAssetInput`에
 * 감면·가산세 필드가 **0건**이었다. `MixedUseTotalTax`에도 `reductionAmount` 키 자체가 없었다
 * (실측 `result.total` 키: aggregateIncome·basicDeduction·taxBase·taxByBasicRate·appliedRate·
 * progressiveDeduction·rateBasis·nonBusinessSurcharge·transferTax·localTax·totalPayable).
 *
 * 그런데 `UnifiedReductionPanel`은 자산 종류 게이트 없이 §77을 렌더하고 ⑧·⑫도 통과시킨다
 * ⇒ **침묵 무시**. 실측 `totalPayable` 60,853,408 → **60,853,408**(Δ 0), 무신고 가산세도 Δ 0.
 *
 * ## 법령
 *
 * · 조특법 §77①의 「토지등」은 공익사업법 §2 1호 → §3 2호로 위임되어 **건물을 명문에 담는다**.
 *   조특령 §72에 자산 종류를 좁히는 문언이 없다. 선례로 조심 2009광2620은 **주상겸용 건축물
 *   수용** 사안이다(양도시기 쟁점이라 §77 자체를 판시하진 않았다 — 「선례 부존재」로 명시).
 * · 국세기본법 §47의3④의 부적용 사유는 **한정 열거**이며 겸용주택을 담고 있지 않다.
 * · 농어촌특별세법 §5①1호 — 감면세액 × 20%. 비과세는 시행령 §4의 **열거**뿐이고
 *   §77은 「**직접 경작한 토지**」로 한정된다(같은 영 §4①1호 괄호).
 *
 * ## 차감형은 계산하지 않고 **고지**한다
 *
 * 겸용은 양도소득금액이 주택분·상가분·비사토분으로 갈려 있어, 차감형 감면을 **어느 파트에서
 * 빼는지 정한 명문이 없다**. §155⑳ 경로(F08)의 §161 안분 미결과 **같은 성질**이다.
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

/** 조특법 §77 공익수용 — 현금보상 8억(2024년 양도 ⇒ 현금 10%). */
const RED_77 = [
  {
    type: "public_expropriation",
    cashCompensation: 800_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: "2024-01-01",
  },
];
/** 차감형 대표 — 조특법 §98의3(양도소득금액 차감). */
const RED_DEFERRED = [{ type: "unsold_98_3", region: "metropolitan" }];

const PENALTY_NONE = {
  determinedTax: 0,
  reductionAmount: 0,
  priorPaidTax: 0,
  originalFiledTax: 0,
  excessRefundAmount: 0,
  interestSurcharge: 0,
  filingType: "none",
  penaltyReason: "normal",
};

/** 주거 60㎡ · 비주거 40㎡ · 바닥 50㎡ · 토지 100㎡ · 양도 15억 / 취득 3억. */
const MIXED = {
  transferPrice: 1_500_000_000,
  transferDate: "2024-03-01",
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2009-03-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 100,
    landAcquisitionDate: "2009-03-01",
    buildingAcquisitionDate: "2009-03-01",
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
    residencePeriodYears: 0,
    zoneType: "general_residential" as const,
  },
};

interface Total {
  transferTax: number;
  reductionAmount: number;
  reductionType?: string;
  determinedTax: number;
  penaltyTax: number;
  ruralSurtax: number;
  localTax: number;
  totalPayable: number;
}

async function post(over: object = {}): Promise<{ total: Total; warnings: string[] }> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...MIXED, ...over }),
    }),
  );
  const json = (await res.json()) as {
    data?: { result: { total: Total; warnings: string[] } };
    error?: unknown;
  };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("F17-B · 겸용주택 감면", () => {
  it("MU-01: 🔴 §77 공익수용이 **세액을 움직인다** (종전 Δ 0)", async () => {
    const base = await post();
    const red = await post({ reductions: RED_77 });

    expect(base.total.reductionAmount).toBe(0);
    expect(base.total.totalPayable).toBe(60_853_408);

    // 현금보상 100% ⇒ 감면대상 소득 전액 · 2024년 양도 현금 10%.
    expect(red.total.reductionAmount).toBe(5_532_128);
    expect(red.total.reductionType).toBe("공익사업용 토지 수용 (§77)");
    expect(red.total.determinedTax).toBe(49_789_152);
    expect(red.total.totalPayable).toBe(55_874_492);
  });

  it("MU-02: 지방소득세 base가 **결정세액**으로 내려간다 (산출세액이 아니다)", async () => {
    const red = await post({ reductions: RED_77 });
    // 지방세법 §103의3 — 소득세 결정세액의 10%.
    expect(red.total.localTax).toBe(4_978_915);
    expect(red.total.localTax).toBe(Math.floor(red.total.determinedTax * 0.1));
  });

  it("MU-03: 농어촌특별세가 붙는다 — **세 경로 공용 판정표**", async () => {
    const red = await post({ reductions: RED_77 });
    expect(red.total.ruralSurtax).toBe(1_106_425); // 5,532,128 × 20%
  });

  it("MU-04: §77 「직접 경작한 토지」면 농특세가 빠진다 (농특세령 §4①1호 괄호)", async () => {
    const selfCultivated = await post({
      reductions: RED_77,
      isSelfCultivatedExpropriatedLand: true,
    });
    expect(selfCultivated.total.reductionAmount).toBe(5_532_128); // 감면 자체는 불변
    expect(selfCultivated.total.ruralSurtax).toBe(0);
    expect(selfCultivated.total.totalPayable).toBe(54_768_067);
  });

  it("MU-05: 🔑 차감형은 계산하지 않고 **고지**한다 (침묵 금지)", async () => {
    const deferred = await post({ reductions: RED_DEFERRED });
    expect(deferred.total.reductionAmount).toBe(0);
    expect(deferred.total.totalPayable).toBe(60_853_408);
    expect(deferred.warnings.some((w) => /차감형\)은 이 계산에 반영되지 않았습니다/.test(w))).toBe(
      true,
    );
    // 「왜」가 남아야 한다 — 「전부 안 된다」로 읽히면 오해다.
    expect(deferred.warnings.some((w) => /명문 규정이 없습니다/.test(w))).toBe(true);
  });

  it("MU-06: 대조군 — 감면을 안 고르면 종전 값 그대로다 (회귀 0)", async () => {
    const base = await post();
    expect(base.total.transferTax).toBe(55_321_280);
    expect(base.total.determinedTax).toBe(55_321_280);
    expect(base.total.ruralSurtax).toBe(0);
    expect(base.total.penaltyTax).toBe(0);
  });
});

describe("F17-B · 겸용주택 가산세", () => {
  it("MU-10: 🔴 무신고 가산세가 총세액에 반영된다 (종전 Δ 0)", async () => {
    const base = await post();
    const pen = await post({ filingPenaltyDetails: PENALTY_NONE });

    // 국세기본법 §47의2①1호 — 무신고 20% × 결정세액 55,321,280.
    expect(pen.total.penaltyTax).toBe(11_064_256);
    expect(pen.total.totalPayable - base.total.totalPayable).toBe(11_064_256);
  });

  it("MU-11: 가산세는 **지방소득세 base가 아니다**", async () => {
    const base = await post();
    const pen = await post({ filingPenaltyDetails: PENALTY_NONE });
    expect(pen.total.localTax).toBe(base.total.localTax);
  });
});
