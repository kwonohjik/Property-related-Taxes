/**
 * anchor(화면 경로 ⑧→④→⑫⑭→엔진) — 계산기 쪽 §155⑳ **세대 구성 회수 금지** 규칙의 안전망.
 *
 * 계획서 `docs/00-pm/rental-155-20-merge-temp-composition.plan.md` PR-1 · 사용자 결정 2026-10-25 Q-1 (a).
 * 규칙: `transfer-tax.ts` STEP 1 — 세대 구성 불성립이어도 판정 엔진이 임대주택을 센 채 다른 특례로 낸 비과세는 거두지 않는다
 * (composition-revoke Q-1 · D12 #2519·#2522).
 *
 * 🔑 시료에 기대지 않는다. 이 규칙을 화면에서 건드리던 시료(§98 행 · 합가 + 임대 행이 일시적 2주택 신규 주택)는 각각 Q-4 (c)와
 *    PR-2(구성 판정 정정)로 **세대 구성 성립**이 된다. 그래서 구성 판정 함수만 `exceeded`로 바꿔 끼우고(`inject.on`) 나머지
 *    화면 경로는 실제로 돌린다. mutation P-0(계산기에서 구성 불성립이면 비과세를 거두기)에 기존 테스트 31,758건이 전부 통과했다(계획서 §1.3).
 *
 * 시료(계획서 §1.2 M1): 거주주택 2008-01-01 취득 · 거주 2019-06~2024-06 · 2024-06-01 양도 · 비조정 · 혼인 2022-01-01(각자 1주택) ·
 *   그 밖의 주택 h3 2015-01-01(배우자 쪽) · 임대 행 r1 2023-01-01(「장기임대」 · 일시적 2주택 신규 주택). 판정 엔진은
 *   「일시적 2주택·혼인 합가 중첩(§155①·⑤)」으로 비과세를 낸다.
 *
 * | # | 입력 | 기대 | P-1(구성 회수) |
 * |---|---|---|---|
 * | RG-1 | A 10억 · 구성 주입 | 0 = ⑳ 미선언 짝 · 세대 구성 불성립 고지 | 60,621,000 |
 * | RG-2 | A 15억 · 구성 주입 | 14,124,000 = 미선언 짝 | 146,366,000 |
 * | RG-3 | B 10억 · 구성 주입 | 50,171,000 — 영 §154⑩ 안분(#2532) | 60,621,000 |
 * | RG-4 | 주입 끔(짝) | RG-1~3과 같은 세액 | — |
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

const inject = vi.hoisted(() => ({ on: false }));
const INJECTED_REASON = "주입된 세대 구성 불성립(안전망 시료)";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/tax-engine/transfer-tax-rental-residence-composition", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/transfer-tax-rental-residence-composition")>();
  return {
    ...actual,
    resolveRentalResidenceComposition: (...args: Parameters<typeof actual.resolveRentalResidenceComposition>) =>
      inject.on
        ? { status: "exceeded" as const, otherHouseCount: 1, reason: INJECTED_REASON }
        : actual.resolveRentalResidenceComposition(...args),
  };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { runCalc, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  inject.on = false;
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

const NC = { region: "non_capital", regionCode: "4682025021", officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general" };
const unit = () => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2023-02-01",
  rentalRegistrationDate: "2023-02-01",
  standardPriceAtRentalStart: "250,000,000",
  rentalInputMode: "direct" as const,
  rentalMonths: "16",
  requirementsConfirmed: true,
});
const A = () => ({ applyException: true, scenario: "A", rentalUnits: [unit()], priorRentalExemptionHistory: "none" });
const B = () => ({
  ...A(),
  scenario: "B",
  priorResidenceTransferDate: "2020-01-01",
  postRegistrationResidenceMonths: "30",
  standardPriceAtAcquisitionForPhrp: "100,000,000",
  standardPriceAtPriorTransfer: "200,000,000",
  standardPriceAtTransferForPhrp: "300,000,000",
});
const calc = (rhe: object | null, price = "1000000000") =>
  runCalc(
    redevAptForm({
      kind: "housing",
      price,
      count: "3",
      houses: [
        houseRow("r1", "2023-01-01", { ...NC, isLongTermRental: rhe !== null } as never),
        houseRow("h3", "2015-01-01", { ...NC, mergeOrigin: "counterpart_side" } as never),
      ],
      assetOver: rhe ? { rentalHousingException: rhe } : {},
      formOver: { marriageDate: "2022-01-01", isFirstTransferredInMerge: true } as never,
    }),
  );
const injected = async (rhe: object | null, price?: string) => {
  inject.on = true;
  try {
    return await calc(rhe, price);
  } finally {
    inject.on = false;
  }
};
const w = (r: Awaited<ReturnType<typeof calc>>) => (r.result.warnings ?? []) as string[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const labels = (r: Awaited<ReturnType<typeof calc>>) => ((r.result.steps ?? []) as any[]).map((s) => s.label as string);

describe("§155⑳ 세대 구성 불성립(주입) × 다른 특례 비과세 — 계산기는 거두지 않는다", () => {
  it("RG-1 ★ A 10억 → 0 = ⑳ 미선언 짝 · 불성립 사유는 고지로만 남는다", async () => {
    const r = await injected(A());
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
    expect(r.result.exemptReason).toBe("일시적 2주택·혼인 합가 중첩 (§155①·⑤) 1세대1주택 비과세");
    expect(w(r).some((x) => x.includes(INJECTED_REASON))).toBe(true);
    expect((await calc(null)).result.totalTax).toBe(0);
  });

  it("RG-2 ★ A 15억(고가주택) → 14,124,000 = ⑳ 미선언 짝", async () => {
    const r = await injected(A(), "1500000000");
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(14_124_000);
    expect((await calc(null, "1500000000")).result.totalTax).toBe(14_124_000);
  });

  it("RG-3 ★ B 10억 → 50,171,000 — ⑳ 대신 영 §154⑩ 직전거주주택 양도일 후 기간분 안분(#2532)", async () => {
    const r = await injected(B());
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(50_171_000);
    expect(labels(r)).toContain("직전거주주택보유주택 — 영 §154⑩ 안분");
  });

  it("RG-4 (짝) 주입을 끄면 같은 세액 — 구성 판정 결과와 무관하게 세액이 같아야 한다", async () => {
    expect((await calc(A())).result.totalTax).toBe(0);
    expect((await calc(A(), "1500000000")).result.totalTax).toBe(14_124_000);
    expect((await calc(B())).result.totalTax).toBe(50_171_000);
  });
});
