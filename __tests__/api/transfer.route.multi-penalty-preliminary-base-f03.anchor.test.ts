/**
 * anchor: 다건 자산별 가산세 base = **예정신고 세액**(§107①) (F03)
 *
 * ## 무엇이 틀려 있었나
 *
 * `multi/route.ts`의 2-pass는 집계 1차 pass가 낸 **자산별 standalone 결정세액**을 그대로
 * 가산세 base로 주입했다. 그 값은 `skipBasicDeduction: true`로 계산된다 — 집계는 §103 기본공제를
 * **신고 단위로 따로 배분**하기 때문이다. 그래서 **기본공제가 빠진 세액**이 base가 됐다.
 *
 * 실측(아래 픽스처 · mock 세율 · 토지 2건 중 1건 무신고):
 *
 * | | base | 가산세(20%) |
 * |---|---|---|
 * | 종전 | 118,060,000 | 23,612,000 |
 * | 현행 | **117,060,000** | **23,412,000** |
 *
 * 차 **200,000**(0.85%) — 기본공제 2,500,000 × 세율 40% × 가산세율 20%.
 *
 * ## 조문
 *
 * · 「국세기본법」 §47의2① — base는 「그 신고로 납부하여야 할 세액」이고 괄호가 **예정신고를 포함**한다.
 *   같은 조 ⑤은 예정신고분에 가산세가 붙은 부분에 확정신고 가산세를 **적용하지 않는다**고 하여
 *   두 축을 분리한다 ⇒ 예정신고 무신고의 base는 **그 건의 예정신고 세액**이다.
 * · 「소득세법」 §107① — 예정신고 산출세액 = (양도차익 − 장특 − **기본공제**) × §104① 세율.
 * · 「소득세법」 §103② — 기본공제는 「먼저 양도한 자산의 양도소득금액에서부터 순서대로」.
 *   배분 순서가 **명문**이라 「자동 안분 fallback 금지」의 대상이 아니다.
 *
 * ⛔ **역안분 금지** — 집계 결정세액을 `taxBaseShare`로 되돌려 쪼개는 방식은 F03·§104⑤에서
 *    두 번 확정된 금지 항목이다. 예정신고 base에 차손통산·합산 누진을 넣는 셈이 된다.
 *
 * ## 안전망은 0건이었다
 *
 * 수정 전후로 기존 회귀는 **한 건도 움직이지 않았다**(616파일 6,770테스트). 이 축을 보는 테스트가
 * 없었다는 뜻이다.
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

import { POST } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

/** 무신고(일반) — 국세기본법 §47의2①2호 20% */
const PENALTY = {
  filingType: "none" as const,
  penaltyReason: "normal" as const,
  determinedTax: 0,
  reductionAmount: 0,
  priorPaidTax: 0,
  originalFiledTax: 0,
  excessRefundAmount: 0,
  interestSurcharge: 0,
};

const asset = (id: string, over: object = {}) => ({
  propertyId: id,
  propertyLabel: id,
  propertyType: "land" as const,
  transferDate: "2026-06-01",
  acquisitionDate: "2012-03-01",
  transferPrice: 800_000_000,
  acquisitionPrice: 300_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  residencePeriodMonths: 0,
  ...over,
});

type Agg = {
  determinedTax: number;
  penaltyTax: number;
  properties: { propertyId: string; determinedTax: number }[];
};

async function call(properties: object[], annualBasicDeductionUsed = 0) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer/multi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxYear: 2026, annualBasicDeductionUsed, properties }),
    }),
  );
  expect(res.status).toBe(200);
  return (await res.json()).data as Agg;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("F03 · 자산별 가산세 base = 예정신고 세액", () => {
  it("F03-01: 기본공제가 base에 반영된다 (23,612,000 → 23,412,000)", async () => {
    const r = await call([
      asset("a1", { filingPenaltyDetails: PENALTY }),
      asset("a2", { transferPrice: 600_000_000, acquisitionPrice: 500_000_000 }),
    ]);
    // 예정신고 세액 117,060,000 × 20%
    expect(r.penaltyTax).toBe(23_412_000);
    // 종전 값(기본공제 스킵 base)이 아니다
    expect(r.penaltyTax).not.toBe(23_612_000);
  });

  it("F03-02: 🔴 §103② 순서 — 기본공제는 **먼저 양도한 자산**이 가져간다", async () => {
    /**
     * ⚠️ **양도일만 바꾸면 안 된다** — 보유기간이 함께 움직여 장기보유특별공제가 바뀐다
     *    (첫 시도에서 −600,000이 나와 두 변수가 섞인 것을 확인했다).
     *    취득일을 같은 폭으로 옮겨 **보유기간 14년을 양쪽 다 고정**하고, 바뀌는 것은 **순서뿐**이게 한다.
     */
    const EARLY = { transferDate: "2026-03-01", acquisitionDate: "2012-03-01" };
    const LATE = { transferDate: "2026-09-01", acquisitionDate: "2012-09-01" };
    const other = { transferPrice: 600_000_000, acquisitionPrice: 500_000_000 };

    const penalizedIsLater = await call([
      asset("a1", { ...LATE, filingPenaltyDetails: PENALTY }),
      asset("a2", { ...EARLY, ...other }),
    ]);
    const penalizedIsEarlier = await call([
      asset("a1", { ...EARLY, filingPenaltyDetails: PENALTY }),
      asset("a2", { ...LATE, ...other }),
    ]);

    // 먼저 양도한 자산이 기본공제 2,500,000을 가져간다 → 세율 40% → 세액 1,000,000 차이 →
    // 가산세 20% → 200,000 차이. 늦게 양도한 쪽이 가산세 대상이면 그만큼 크다.
    expect(penalizedIsLater.penaltyTax - penalizedIsEarlier.penaltyTax).toBe(200_000);
  });

  it("F03-03: 이미 사용한 기본공제는 예정신고 base에서도 소진된 것으로 본다", async () => {
    const fresh = await call([asset("a1", { filingPenaltyDetails: PENALTY })], 0);
    const used = await call([asset("a1", { filingPenaltyDetails: PENALTY })], 2_500_000);
    expect(used.penaltyTax - fresh.penaltyTax).toBe(200_000);
  });

  it("F03-04: 집계 결정세액 자체는 이 변경으로 움직이지 않는다 (base 축만 바뀐다)", async () => {
    const withPenalty = await call([
      asset("a1", { filingPenaltyDetails: PENALTY }),
      asset("a2", { transferPrice: 600_000_000, acquisitionPrice: 500_000_000 }),
    ]);
    const without = await call([
      asset("a1"),
      asset("a2", { transferPrice: 600_000_000, acquisitionPrice: 500_000_000 }),
    ]);
    expect(withPenalty.determinedTax).toBe(without.determinedTax);
    expect(without.penaltyTax).toBe(0);
  });

  it("F03-05: ⛔ 역안분이 아니다 — base는 집계 결정세액의 지분이 아니다", async () => {
    const r = await call([
      asset("a1", { filingPenaltyDetails: PENALTY }),
      asset("a2", { transferPrice: 600_000_000, acquisitionPrice: 500_000_000 }),
    ]);
    // 집계 결정세액 × 20%였다면 이 값이 나온다 — 그 방향은 금지다(차손통산·합산 누진이 섞인다).
    const banned = Math.floor(r.determinedTax * 0.2);
    expect(r.penaltyTax).not.toBe(banned);
    expect(r.penaltyTax).toBeLessThan(banned);
  });
});
