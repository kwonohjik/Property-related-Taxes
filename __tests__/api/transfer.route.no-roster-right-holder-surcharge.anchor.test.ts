/**
 * anchor: 명부(`houses[]`) 없이 조합원입주권·분양권만 보낸 1주택 세대 — 권리를 중과 주택 수에 넣는다 (2026-11-23)
 *
 * 🔴 종전: 명부가 없으면 원시 플래그(세대 주택 수 ≥ 2)만 봐 `presaleRights`가 중과 주택 수에 들어가지 않았다
 *    (영 §167의10① 본문 · §167의3① 본문 「조합원입주권 또는 분양권」 산입). 강남 주택 1 + 2022년 입주권 1:
 *    명부 없음 719,535,000 · 양도 행만 실은 같은 body 1,427,435,000(2주택 중과) — −707,900,000 과소.
 *    화면 경로 ④(`buildHousesPayload`)는 권리가 있으면 양도 행을 싣으므로 직접 API만 닿는 갈래였다.
 *
 * 엔진 anchor가 아니라 route에 body만 준다 — ⑫ Zod가 `presaleRights`를 strip하지 않는지까지 본다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

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

const GANGNAM = "1168010100";
/** 강남 조정대상지역 · 2014 취득 · 2026-06-01 양도(한시 배제 종료 뒤) · 세대 주택 1 · **houses 미전송** */
const BASE = {
  propertyType: "housing" as const,
  transferPrice: 3_000_000_000,
  acquisitionPrice: 700_000_000,
  acquisitionDate: "2014-03-15",
  acquisitionCause: "purchase" as const,
  transferDate: "2026-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  isRegulatedArea: true,
  regionCode: GANGNAM,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};
const RIGHT = {
  id: "r1",
  type: "redevelopment_right" as const,
  memberOrigin: "successor" as const,
  acquisitionDate: "2022-06-01",
  region: "capital" as const,
  regionCode: GANGNAM,
};
const PRESALE = { id: "p1", type: "presale_right" as const, acquisitionDate: "2022-06-01", region: "capital" as const, regionCode: GANGNAM };
/** 화면 경로 ④가 다른 주택 없이 권리만 있을 때 싣는 양도 행과 같은 사실 */
const SELLING = {
  id: "selling",
  region: "capital" as const,
  regionCode: GANGNAM,
  acquisitionDate: "2014-03-15",
  officialPrice: 0,
  isInherited: false,
  isLongTermRental: false,
};

interface RouteResult {
  determinedTax: number;
  surchargeType?: string;
  surchargeRate?: number;
  longTermHoldingDeduction: number;
  multiHouseSurchargeDetail?: { effectiveHouseCount: number };
  warnings?: string[];
}

async function post(over: object = {}): Promise<RouteResult> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...BASE, ...over }),
    }),
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { result: RouteResult } }).data.result;
}

const NO_ROSTER_NOTICE = "다른 보유 주택 목록이 입력되지 않아";

describe("명부 없는 권리 보유 1주택 세대 — 권리를 중과 주택 수에 산입", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
  });

  it("대조군 — 권리 없음: 중과 없음 · 결정세액 404,895,000(종전과 같다)", async () => {
    const r = await post();
    expect(r.surchargeRate ?? 0).toBe(0);
    expect(r.determinedTax).toBe(404_895_000);
  });

  it("입주권 1 · 명부 없음 → 2주택 중과(+20%p · 장특 0) 1,427,435,000 — 양도 행을 실은 body와 같다", async () => {
    const noRoster = await post({ presaleRights: [RIGHT] });
    const withSelling = await post({ presaleRights: [RIGHT], houses: [SELLING], sellingHouseId: "selling" });
    expect(noRoster.surchargeRate).toBe(0.2);
    expect(noRoster.longTermHoldingDeduction).toBe(0);
    expect(noRoster.determinedTax).toBe(1_427_435_000);
    expect(noRoster.determinedTax).toBe(withSelling.determinedTax);
    // 다른 주택이 없어 모르는 사실이 없다 — 「목록 미입력」 확인 필요 고지는 뜨지 않는다
    expect((noRoster.warnings ?? []).some((w) => w.includes(NO_ROSTER_NOTICE))).toBe(false);
  });

  it("분양권 1(2021.1.1. 뒤 취득) · 명부 없음 → 같은 2주택 중과 1,427,435,000", async () => {
    const r = await post({ presaleRights: [PRESALE] });
    expect(r.surchargeRate).toBe(0.2);
    expect(r.determinedTax).toBe(1_427_435_000);
  });

  it("세대 주택 수 2 이상은 원시 플래그 + 「확인 필요」 고지(다른 주택의 사실을 모른다)", async () => {
    const r = await post({ householdHousingCount: 2, presaleRights: [RIGHT] });
    expect((r.warnings ?? []).some((w) => w.includes(NO_ROSTER_NOTICE))).toBe(true);
  });
});

/**
 * 세대 주택 2 + 권리 — fallback이 권리를 더해 주택과 권리의 합 3(법 §104⑦4호)으로 중과한다 (사용자 결정 2026-11-23 1안).
 *
 * 🔴 종전: 권리를 세지 않아 2주택 중과 1,427,435,000. 같은 세대를 명부 [양도 · 강남 9억] + 권리로 보내면 1,657,185,000(−229,750,000).
 *    다른 주택이 지방 저가(영 §167의4②1호)라 수에서 빠지는지는 모른다 — 모르는 사실은 불리하게 두고 고지한다.
 */
describe("명부 없는 세대 주택 2 + 권리 — 권리를 더해 합 3 이상 중과", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
  });
  const TWO = { householdHousingCount: 2 };
  const H2 = { ...SELLING, id: "h2", acquisitionDate: "2018-06-01", officialPrice: 900_000_000 };

  it("대조군 — 권리 없음: 2주택 중과 1,427,435,000(종전과 같다)", async () => {
    const r = await post(TWO);
    expect(r.surchargeRate).toBe(0.2);
    expect(r.determinedTax).toBe(1_427_435_000);
  });

  it("입주권 1 → +30%p 1,657,185,000 — 명부 [양도 · 강남 9억] + 입주권과 같다 · 고지가 권리 수와 §167의4를 밝힌다", async () => {
    const noRoster = await post({ ...TWO, presaleRights: [RIGHT] });
    const roster = await post({ ...TWO, presaleRights: [RIGHT], houses: [SELLING, H2], sellingHouseId: "selling" });
    expect(noRoster.surchargeRate).toBe(0.3);
    expect(noRoster.determinedTax).toBe(1_657_185_000);
    expect(noRoster.determinedTax).toBe(roster.determinedTax);
    const notice = (noRoster.warnings ?? []).find((w) => w.includes(NO_ROSTER_NOTICE));
    expect(notice).toContain("조합원입주권·분양권 1개를 더한 3개");
    expect(notice).toContain("소득세법 시행령 §167의4②");
  });

  it("분양권 1(2021.1.1. 뒤 취득) → 같은 1,657,185,000", async () => {
    const r = await post({ ...TWO, presaleRights: [PRESALE] });
    expect(r.determinedTax).toBe(1_657_185_000);
  });

  it("2021.1.1. 전 취득 분양권은 산입하지 않는다(법률 제17477호 부칙 제4조) — 2주택 1,427,435,000 · 고지는 주택만 문안", async () => {
    const r = await post({ ...TWO, presaleRights: [{ ...PRESALE, acquisitionDate: "2020-06-01" }] });
    expect(r.determinedTax).toBe(1_427_435_000);
    const notice = (r.warnings ?? []).find((w) => w.includes(NO_ROSTER_NOTICE));
    expect(notice).toContain("1세대 2주택 중과");
  });

  it("지방 가액 3억 이하 입주권은 산입하지 않는다(영 §167의4②1호) — 2주택 1,427,435,000", async () => {
    const r = await post({
      ...TWO,
      presaleRights: [{ ...RIGHT, region: "non_capital", regionCode: "4311110100", rightValue: 200_000_000 }],
    });
    expect(r.determinedTax).toBe(1_427_435_000);
  });

  it("세대 주택 3 + 입주권 1 — 이미 최고 단계라 세액은 같다(1,657,185,000)", async () => {
    const base = await post({ householdHousingCount: 3 });
    const withRight = await post({ householdHousingCount: 3, presaleRights: [RIGHT] });
    expect(withRight.determinedTax).toBe(base.determinedTax);
    expect(withRight.determinedTax).toBe(1_657_185_000);
  });
});
