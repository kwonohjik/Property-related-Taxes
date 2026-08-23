/**
 * anchor — F15 · ⑭ `engine-input.ts`가 §97의2① 관계요건 2필드를 침묵 strip.
 *
 * ## 결함 (코드리뷰 2026-08, CONFIRMED)
 *
 * 배관 전 구간 중 ⑭만 끊겨 있었다:
 *
 * | 지점 | 파일 | 상태 |
 * |---|---|---|
 * | ④ | `lib/calc/transfer-tax-api-carryover.ts:77-78` | `donorRelation`·`donorDeceased`를 **보낸다** |
 * | ⑫ | `lib/api/transfer-tax-schema.ts:363-364` | 두 필드를 **받는다** |
 * | ⑭ | `app/api/calc/transfer/engine-input.ts` | **버렸다** ← 결함 |
 * | 엔진 | `lib/tax-engine/transfer-tax-carryover.ts:146` | `isCarryoverRelationExcluded(...)`로 **읽는다** |
 *
 * ⑭가 `carryoverTaxation`의 키를 하나씩 **열거**하다 2개를 빠뜨렸다. `CarryoverTaxationInput`의
 * 두 필드가 optional이라 TypeScript가 잡지 못하는 전형적 명시 prop 매핑 strip이다
 * (memory `feedback_explicit_prop_mapping_strip`).
 *
 * 일반건물(GB) 경로 `general-building-route-cards.ts:151·159`는 `{ carryoverTaxation: card.carryoverTaxation }`로
 * **객체를 통째로** 넘겨 정상 작동했다 — **단건 경로에서만 배제가 죽었다**.
 *
 * ## 수정
 *
 * ⑭를 GB와 같은 축(spread)으로 바꾸고 Date 2개만 명시 변환한다. 키를 세지 않으므로
 * 누락이 구조적으로 불가능하다.
 *
 * ## 법령
 *
 * 「소득세법」 §97의2① 각 호 외의 부분 괄호 둘:
 * · 배우자 — 「양도 당시 혼인관계가 소멸된 경우를 포함하되, **사망으로** 혼인관계가 소멸된 경우는 제외」
 *   ⇒ 이혼 소멸은 이월과세 **적용**, 사별만 미적용
 * · 직계존비속 — 「**양도 당시 사망**한 경우는 제외」
 *   ⇒ 신설 법률 제20615호(2024.12.31.) 부칙 제8조 「이 법 시행 이후 **증여받는 자산**부터 적용」
 *
 * ⚠️ **연혁 게이트의 축은 「증여 등기접수일」이지 양도일이 아니다** — 부칙 제8조가 「증여받는
 *    자산」을 기준으로 삼기 때문이고, 구현도 그렇다(`carryover-donor-death.ts:53`
 *    `giftRegistryDate >= LINEAL_DEATH_EXCLUSION_CUTOFF`). F15-4가 그 축을 고정한다 —
 *    양도일이 2028-06-15(경계 **이후**)여도 증여일이 2024-12-31이면 배제가 발동하지 않는다.
 *    「양도 당시 사망」은 **묻는 사실**(donorDeceased의 의미)이지 시행시기 기준일이 아니다.
 *
 * ## 실측 (route POST 관측 — 산식 추론 아님)
 *
 * 공통 시나리오: 토지 9억 양도(2028-06-15) · 증여등기 2025-01-01 · 증여자 취득 2008-01-01
 * 취득가 1억 · 증여 당시 평가액 4억 · 증여세 5천만
 *
 * | | adoptedScenario | transferGain | determinedTax |
 * |---|---|---|---|
 * | 배제 발동(정답) | B | 500,000,000 | **161,060,000** |
 * | 배제 누락(종전) | A | 750,000,000 | **183,510,000** |
 *
 * ⇒ 종전 단건 경로는 **22,450,000 과대**였다. 이 시나리오의 안전망은 **0건**이었다
 *    (`__tests__/calc/carryover-donor-death-wiring.test.ts`가 ④⑧⑫만 보고 ⑭를 건너뛴다).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    limit: 30,
    remaining: 29,
    resetAt: Date.now() + 60_000,
  }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

// route를 먼저 import해야 스키마 모듈 순환 초기화(TDZ)가 정상 순서로 풀린다.
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildTransferEngineInput } from "@/app/api/calc/transfer/engine-input";
import { propertySchema } from "@/lib/api/transfer-tax-schema";

// ─── 시나리오 ────────────────────────────────────────────────────

/** 증여 등기접수일 — 직계존비속 괄호 시행 경계(2025-01-01) **이후** */
const GIFT_AFTER_CUTOFF = "2025-01-01";
/** 증여 등기접수일 — 경계 **직전** 하루 */
const GIFT_BEFORE_CUTOFF = "2024-12-31";

/**
 * 양도일은 두 케이스 모두 2028-06-15로 **고정**한다.
 * · 증여일 기준 10년 룰(§97의2③) 안에 들어온다(한도 2034~2035).
 * · 수증자 보유기간이 3년을 넘어 B 시나리오가 단기세율로 튀지 않는다
 *   (2026 양도로 잡으면 B가 40% 단기세율이 되어 비교과세 ②3호가 A를 삼키고
 *    배제 발동 여부가 세액에 나타나지 않는다 — probe 실측).
 */
const TRANSFER_DATE = "2028-06-15";

const BASE = {
  propertyType: "land" as const,
  transferPrice: 900_000_000,
  transferDate: TRANSFER_DATE,
  acquisitionPrice: 400_000_000,
  acquisitionDate: GIFT_AFTER_CUTOFF,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  acquisitionCause: "carryover_gift" as const,
};

const CT = {
  giftRegistryDate: GIFT_AFTER_CUTOFF,
  donorAcquisitionDate: "2008-01-01",
  donorAcquisitionPrice: 100_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 50_000_000,
  giftDateValuation: 400_000_000,
};

/** 엔진 실측값 — 관계요건 배제 발동(§97의2① 미적용 → 시나리오 B) */
const EXCLUDED_TAX = 161_060_000;
const EXCLUDED_GAIN = 500_000_000;
/** 엔진 실측값 — 이월과세 적용(시나리오 A 채택) */
const APPLIED_TAX = 183_510_000;
const APPLIED_GAIN = 750_000_000;

type CarryoverDetail = {
  isEligible: boolean;
  exclusionReason?: string;
  adoptedScenario: "A" | "B";
  applicablePeriodYears: 5 | 10;
};

async function run(
  ctOver: Record<string, unknown>,
  baseOver: Record<string, unknown> = {},
): Promise<{
  status: number;
  determinedTax: number;
  transferGain: number;
  detail: CarryoverDetail;
}> {
  const body = { ...BASE, ...baseOver, carryoverTaxation: { ...CT, ...ctOver } };
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  const result = json.data?.result;
  return {
    status: res.status,
    determinedTax: result?.determinedTax,
    transferGain: result?.transferGain,
    detail: result?.carryoverTaxationDetail,
  };
}

describe("F15 — ⑭가 §97의2① 관계요건 2필드를 엔진까지 나른다", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("F15-1: 배우자 + 사망으로 혼인관계 소멸 → 이월과세 미적용", async () => {
    const r = await run({ donorRelation: "spouse", donorDeceased: true });

    expect(r.status).toBe(200);
    // 🔴 종전: donorRelation·donorDeceased가 ⑭에서 사라져 배제가 발동하지 않았다
    expect(r.detail.isEligible).toBe(false);
    expect(r.detail.exclusionReason).toBe("relation_invalid");
    expect(r.detail.adoptedScenario).toBe("B");
    expect(r.transferGain).toBe(EXCLUDED_GAIN); // 종전 750,000,000
    expect(r.determinedTax).toBe(EXCLUDED_TAX); // 종전 183,510,000 (22,450,000 과대)
  });

  it("F15-2: 배우자 + 생존 → 이월과세 적용 [대조군]", async () => {
    const r = await run({ donorRelation: "spouse", donorDeceased: false });

    expect(r.status).toBe(200);
    // 배제 축이 살아 있다는 확인 — 「무조건 배제」로 고장 나면 여기서 잡힌다.
    expect(r.detail.isEligible).toBe(true);
    expect(r.detail.exclusionReason).toBeUndefined();
    expect(r.detail.adoptedScenario).toBe("A");
    expect(r.transferGain).toBe(APPLIED_GAIN);
    expect(r.determinedTax).toBe(APPLIED_TAX);
  });

  it("F15-3: 직계존비속 + 사망 + 증여등기 2025-01-01(경계 이후) → 배제 발동", async () => {
    const r = await run({ donorRelation: "lineal", donorDeceased: true });

    expect(r.status).toBe(200);
    expect(r.detail.isEligible).toBe(false);
    expect(r.detail.exclusionReason).toBe("relation_invalid");
    expect(r.detail.applicablePeriodYears).toBe(10);
    expect(r.determinedTax).toBe(EXCLUDED_TAX); // 종전 183,510,000
  });

  it("F15-4: 직계존비속 + 사망 + 증여등기 2024-12-31(경계 직전) → 배제 미발동", async () => {
    // 🔑 양도일은 2028-06-15 — 경계(2025-01-01)를 한참 넘겼는데도 발동하지 않는다.
    //    부칙 제8조의 축이 「증여받는 자산」, 즉 **증여 등기접수일**이기 때문이다.
    const r = await run(
      { giftRegistryDate: GIFT_BEFORE_CUTOFF, donorRelation: "lineal", donorDeceased: true },
      { acquisitionDate: GIFT_BEFORE_CUTOFF },
    );

    expect(r.status).toBe(200);
    expect(r.detail.isEligible).toBe(true);
    expect(r.detail.exclusionReason).toBeUndefined();
    expect(r.detail.adoptedScenario).toBe("A");
    expect(r.determinedTax).toBe(APPLIED_TAX);
  });

  it("F15-5: 경계 쌍 — 증여일 하루 차이로 세액이 갈린다", async () => {
    // F15-3·F15-4를 **한 단언**으로 묶는다. 두 필드가 strip되면 둘이 같은 값이 되어
    // 「경계가 존재한다」는 사실 자체가 사라진다(⇒ 이 케이스가 red).
    const after = await run({ donorRelation: "lineal", donorDeceased: true });
    const before = await run(
      { giftRegistryDate: GIFT_BEFORE_CUTOFF, donorRelation: "lineal", donorDeceased: true },
      { acquisitionDate: GIFT_BEFORE_CUTOFF },
    );

    expect(after.determinedTax).not.toBe(before.determinedTax);
    expect(before.determinedTax - after.determinedTax).toBe(APPLIED_TAX - EXCLUDED_TAX);
  });

  it("F15-6: 관계가 「그 외」 → ① 본문 요건 불충족으로 미적용 (사망 무관)", async () => {
    // §97의2①은 「그 배우자 … 또는 직계존비속으로부터 증여받은」 자산만 대상이다.
    const r = await run({ donorRelation: "other" });

    expect(r.status).toBe(200);
    expect(r.detail.isEligible).toBe(false);
    expect(r.detail.exclusionReason).toBe("relation_invalid");
    expect(r.determinedTax).toBe(EXCLUDED_TAX); // 종전 183,510,000
  });

  it("F15-7: ⑭ 단위 — buildTransferEngineInput가 두 필드를 싣는다 (일자는 Date)", () => {
    const parsed = propertySchema.parse({
      ...BASE,
      carryoverTaxation: { ...CT, donorRelation: "spouse", donorDeceased: true },
    });
    const engineInput = buildTransferEngineInput(
      parsed,
      new Date(TRANSFER_DATE),
      new Date(GIFT_AFTER_CUTOFF),
      undefined,
    );

    // 🔴 종전에는 이 두 줄이 undefined였다 (열거형 매핑이 키를 빠뜨렸다)
    expect(engineInput.carryoverTaxation?.donorRelation).toBe("spouse");
    expect(engineInput.carryoverTaxation?.donorDeceased).toBe(true);

    // spread 리팩터 회귀 방어 — 기존 필드·Date 변환이 그대로 살아 있어야 한다.
    expect(engineInput.carryoverTaxation?.giftRegistryDate).toBeInstanceOf(Date);
    expect(engineInput.carryoverTaxation?.donorAcquisitionDate).toBeInstanceOf(Date);
    expect(engineInput.carryoverTaxation?.giftTaxAmount).toBe(50_000_000);
    expect(engineInput.carryoverTaxation?.giftDateValuation).toBe(400_000_000);
    expect(engineInput.carryoverTaxation?.donorAcquisitionPrice).toBe(100_000_000);
    expect(engineInput.carryoverTaxation?.useEstimatedAcquisition).toBe(false);
  });
});
