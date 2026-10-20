/**
 * 상속인이 아닌 사람(수유자)이 유증·사인증여로 받은 주택 — 1세대1주택 상속 특례에서 상속주택으로 보지 않는다 (2026-10-20)
 * 계획서: docs/00-pm/nbl-bequest-non-heir.plan.md §4-4
 *
 * 「법정상속인이 아닌 자가 … 유증으로 취득한 주택은 … 상속받은 주택에 해당하지 아니함」(부동산거래관리과-307 — §155②).
 * §155③ 공동상속주택은 직접 해석이 없어 같은 기준으로 판정하고 확인 필요를 밝힌다.
 * 다주택 중과(§167의3①7호 등)는 이번 범위가 아니어서 명부 행의 `isInherited`를 그대로 읽는다.
 *
 * 단건 계산기 route와 판정 메뉴 route 둘 다 본다(⑫⑭ — `feedback_leaf_anchor_skips_zod_layer`).
 * 시료는 `inherited-house-155-3-gift-scope.route.anchor.test.ts`와 같은 바닥(비조정 일반주택 8억 · 명부 = 양도 주택 + 상속주택 1채).
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

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { POST as POST_SINGLE } from "@/app/api/calc/transfer/route";
import { POST as POST_JUDGE } from "@/app/api/calc/one-house-exemption/route";

const post = async (handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) => {
  const res = await handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
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
const NON_HEIR = { nonHeirBequest: true };

/** 비조정 일반주택 8억 양도 2023-06-01 · 2018-03-01 매수 · 명부 = 양도 주택 + 상속주택 1채(2019-06-01 상속) */
const body = (inh: Record<string, unknown>) => ({
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
});

type Unmet = { id: string; reasons: string[] };

describe("수유자 상속주택 — §155②③ 주택 수 제외 (단건 route · 판정 메뉴 route)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it.each([
    ["§155② 단독상속", SOLE],
    ["§155③ 공동상속(소수지분)", CO_MINOR],
  ] as const)("%s — 상속인이면 비과세 · 수유자면 2주택 과세 (두 route 같은 결론)", async (_name, inh) => {
    const heirSingle = await post(POST_SINGLE, "http://l/api/calc/transfer", body(inh));
    expect([heirSingle.result.isExempt, heirSingle.result.totalTax]).toEqual([true, 0]);
    const heirJudge = await post(POST_JUDGE, "http://l/api/calc/one-house-exemption", body(inh));
    expect(heirJudge.judgment.isExempt).toBe(true);

    const nonHeirSingle = await post(POST_SINGLE, "http://l/api/calc/transfer", body({ ...inh, ...NON_HEIR }));
    expect([nonHeirSingle.result.isExempt, nonHeirSingle.result.totalTax]).toEqual([false, 128_766_000]);
    const nonHeirJudge = await post(POST_JUDGE, "http://l/api/calc/one-house-exemption", body({ ...inh, ...NON_HEIR }));
    expect(nonHeirJudge.judgment.isExempt).toBe(false);
  });

  it("수유자 행은 일반 주택과 같은 결론 — 상속 표시를 끈 행과 세액이 같다", async () => {
    const nonHeir = await post(POST_SINGLE, "http://l/api/calc/transfer", body({ ...SOLE, ...NON_HEIR }));
    const plain = await post(POST_SINGLE, "http://l/api/calc/transfer", body({}));
    expect([nonHeir.result.totalTax, plain.result.totalTax]).toEqual([128_766_000, 128_766_000]);
  });

  it("판정 메뉴 불성립 사유 — 수유자라 상속주택으로 보지 않았다는 이유와 근거 해석 · 확인 필요", async () => {
    const j = await post(POST_JUDGE, "http://l/api/calc/one-house-exemption", body({ ...SOLE, ...NON_HEIR }));
    const unmet = (j.judgment.unmetExceptions ?? []) as Unmet[];
    const inherited = unmet.find((u) => u.id === "155-2-inherited-house");
    expect(inherited?.reasons[0]).toBe(
      "상속인이 아닌 사람이 유증·사인증여로 받은 주택 1채는 상속주택으로 보지 않아 주택 수에서 빼지 않았습니다" +
        "(부동산거래관리과-307 — 법정상속인이 아닌 자가 유증으로 취득한 주택은 상속받은 주택이 아님). " +
        "공동상속주택(§155③)과 조합원입주권·분양권 특례(§156의2⑦ · §156의3⑤)에는 직접 해석이 없어 같은 기준으로 판정했습니다 — 확인이 필요합니다.",
    );
    // 상속인 시료(비과세)에는 이 사유가 없다
    const heir = await post(POST_JUDGE, "http://l/api/calc/one-house-exemption", body(SOLE));
    const heirReasons = ((heir.judgment.unmetExceptions ?? []) as Unmet[]).flatMap((u) => u.reasons).join("\n");
    expect(heirReasons).not.toContain("상속인이 아닌 사람");
  });
});
