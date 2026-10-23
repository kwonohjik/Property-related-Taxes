/**
 * PR-7b-3b — 증여세 계산기 부담부증여 양도세 × 의제취득일(1985.1.1.) 전 상속 비주택 건물(상가) §164⑥ (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §6).
 *
 * 사용자 결정 Q-38(증여세 계산기 상가에 §164⑥ 입력 신설 · Q-27과 같은 규칙) — 8칸이 다 차면 시가 평가의 ②, 기준시가 평가의 의제취득일 기준시가.
 * 이 경로의 비주택 건물은 엔진 propertyType `building`이다. 종전(master 85a3e5742)에는 엔진이 `building`에서 §164⑥ payload를 버렸다
 * (Zod는 payload만 있으면 ②가 있다고 보는데 — 실측: building + payload → 기준시가 80,931,647 · 시가 80,721,398, commercial_building과 다름).
 *
 * 시료: 3a(`gift-burdened-pre-deemed-pr7b3.route.anchor.test.ts`)의 비주택 건물 — 1983-07-26 상속 · 2023-02-16 부담부증여 · 채무 460,000,000 ·
 * 양도시 기준시가 1,243,350,000 · 의제취득일 기준시가 칸 202,620,000 · 시가 평가면 시가 920,000,000.
 * §164⑥ 8칸은 양도세 계산기 PR-7b-1 anchor와 같은 값(취득당시 기준시가 509,090,909). 세율은 mock.
 */
import { describe, expect, it, vi } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { post } from "./_gift-burdened-pr7-harness";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Obj = Record<string, unknown>;
/** §164⑥ 8칸 + §164⑤ 준용 확인 — 취득당시 기준시가 509,090,909 */
const C164: Partial<BurdenedGiftTransferTaxInput> = {
  c164ExclusiveArea: "50",
  c164SharedArea: "20",
  c164LandArea: "100",
  c164UnitPriceAtFirst: "10000000",
  c164LandPricePerSqmAtAcq: "500000",
  c164LandPricePerSqmAtFirst: "700000",
  c164BuildingStdPriceAtAcq: "30000000",
  c164BuildingStdPriceAtFirst: "40000000",
  c164AcqBuildingStdBy164_5: true,
};
const DECLARE: Partial<BurdenedGiftTransferTaxInput> = { preDeemedClauseAUnconfirmed: true };

function item(bgt: Partial<BurdenedGiftTransferTaxInput>, o: { market?: boolean; acqDate?: string; category?: string } = {}): EstateItem {
  return {
    id: "b-1",
    category: o.category ?? "real_estate_building",
    name: "테스트 상가",
    standardPrice: 1_243_350_000,
    areaSqm: 184.2,
    ...(o.market ? { marketValue: 920_000_000 } : {}),
    leaseDeposit: 0,
    mortgageAmount: 460_000_000,
    assumedDebtForGift: 460_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: o.acqDate ?? "1983-07-26",
      standardPriceAtAcquisition: 202_620_000,
      isOneHousehold: false,
      householdHousingCount: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      isUnregistered: false,
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: "1970-01-01",
      isHousing: false,
      ...bgt,
    },
  } as unknown as EstateItem;
}
const form = (it: EstateItem) =>
  ({ giftDate: "2023-02-16", donor: "father", donorRelation: "lineal_ascendant_adult", priorGifts: [], giftItems: [it], stockItems: [] }) as unknown as FormState;

async function run(it: EstateItem) {
  const f = form(it);
  const issue = validateStep(1, f);
  const body = buildGiftBurdenedTransferBody(it, f) as Obj;
  const res = await post(body);
  const json = (await res.json()) as { data?: { result?: Obj } };
  const r = json.data?.result as Obj | undefined;
  const bg = r?.transferBurdenedGiftBreakdown as
    | { preDeemed?: { basis: string; selected?: string; stdAtDeemed: number; sec164?: number | null }; perAsset: { land: { acquisitionPrice: number }; building: { acquisitionPrice: number } } }
    | undefined;
  return { issue, body, status: res.status, tax: r?.determinedTax, bg, acq: bg ? bg.perAsset.land.acquisitionPrice + bg.perAsset.building.acquisitionPrice : undefined };
}

describe("PR-7b-3b 증여세 계산기 비주택 건물 §164⑥ × 의제취득일 전 상속", () => {
  it("K-1 기준시가 평가 · 8칸 — 의제취득일 기준시가 = §164⑥ 509,090,909 (propertyType building 그대로 · 종전 칸 값 202,620,000 · 80,931,647)", async () => {
    const r = await run(item(C164));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
    expect(r.body.propertyType).toBe("building");
    expect(r.body.commercialInheritanceValuation).toBeDefined();
    expect(r.bg?.preDeemed?.basis).toBe("deemed_std");
    expect(r.bg?.preDeemed?.stdAtDeemed).toBe(509_090_909);
    expect(r.acq).toBe(188_347_463);
    expect(r.tax).toBe(49_866_562);
  });

  it("K-2 기준시가 평가 · 칸 비움 + 8칸 — ⑧ 통과(원천 = §164⑥ · 계산기 S-2b와 같다)", async () => {
    const r = await run(item({ ...C164, standardPriceAtAcquisition: 0 }));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
    expect(r.bg?.preDeemed?.stdAtDeemed).toBe(509_090_909);
    expect(r.tax).toBe(49_866_562);
  });

  it("K-3 기준시가 평가 · 칸도 8칸도 없음 — ⑧이 의제취득일 기준시가를 요구하고 §164⑥ 경로를 알린다", () => {
    const it_ = item({ standardPriceAtAcquisition: 0 });
    const issue = validateStep(1, form(it_));
    expect(issue).toContain("의제취득일(1985.1.1.) 현재 기준시가를 입력하세요");
    expect(issue).toContain("§164⑥ 8개 항목");
  });

  it("M-1 시가 평가 · 8칸(① 없음 · 선언 없음) — ②가 있어 선언이 필요 없다 · ② 509,090,909 채택 × 0.5 = 254,545,454", async () => {
    const r = await run(item(C164, { market: true }));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
    expect(r.bg?.preDeemed?.selected).toBe("sec164");
    expect(r.bg?.preDeemed?.sec164).toBe(509_090_909);
    expect(r.acq).toBe(254_545_454);
    expect(r.tax).toBe(34_021_364);
  });

  it("M-2 시가 평가 · ① 6억 + 8칸 — ① 채택 × 0.5 = 300,000,000", async () => {
    const r = await run(item({ ...C164, reportedValueAtInheritance: 600_000_000 }, { market: true }));
    expect(r.issue).toBeNull();
    expect(r.bg?.preDeemed?.selected).toBe("reported");
    expect(r.acq).toBe(300_000_000);
  });

  it("M-3 시가 평가 · 칸 비움 + 8칸 — 칸은 ③ 분자라 여전히 필수(⑧)", () => {
    const issue = validateStep(1, form(item({ ...C164, standardPriceAtAcquisition: 0 }, { market: true })));
    expect(issue).toContain("의제취득일(1985.1.1.) 현재 기준시가를 입력하세요");
    expect(issue).not.toContain("§164⑥ 8개 항목");
  });

  it("M-4 시가 평가 · 8칸 없이 선언 — 종전(3a C-1)과 같은 ③ 채택", async () => {
    const r = await run(item(DECLARE, { market: true }));
    expect(r.issue).toBeNull();
    expect(r.body.commercialInheritanceValuation).toBeUndefined();
    expect(r.bg?.preDeemed?.selected).toBe("converted");
    expect(r.tax).toBe(80_721_398);
  });

  it("M-5 시가 평가 · ①·8칸·선언 모두 없음 — ⑧ 선언 요구 문구에 ② §164⑥이 들어간다", () => {
    const issue = validateStep(1, form(item({}, { market: true })));
    expect(issue).toContain("상증법 평가액을 확인할 수 없음");
    expect(issue).toContain("·② §164⑥ 취득당시 기준시가·");
  });

  it("M-6 시가 평가 · 담보 승(시가 4억 < 채무 4.6억) · 칸 비움 + 8칸 — §159①1호 괄호라 기준시가 평가와 같다 · §164⑥ 509,090,909 × 채무비율 1 (리뷰 게이트 권고)", async () => {
    const it_ = item({ ...C164, standardPriceAtAcquisition: 0 });
    Object.assign(it_, { marketValue: 400_000_000 });
    const r = await run(it_);
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
    expect(r.bg?.preDeemed?.basis).toBe("deemed_std");
    expect(r.bg?.preDeemed?.stdAtDeemed).toBe(509_090_909);
    expect(r.acq).toBe(509_090_909);
  });

  it("P-1 8칸 중 하나가 비면 ⑧ 차단 — 「1개 항목이 비었습니다」 · payload 미전송", () => {
    const it_ = item({ ...C164, c164LandPricePerSqmAtFirst: "" });
    expect(validateStep(1, form(it_))).toContain("§164⑥ 취득당시 기준시가 1개 항목이 비었습니다");
    expect((buildGiftBurdenedTransferBody(it_, form(it_)) as Obj).commercialInheritanceValuation).toBeUndefined();
  });

  it("P-2 8칸이 다 찼는데 §164⑤ 준용 확인이 없으면 ⑧ 차단(계산기 `cbAcqBuildingStdBy164_5`와 같다)", () => {
    const it_ = item({ ...C164, c164AcqBuildingStdBy164_5: undefined });
    expect(validateStep(1, form(it_))).toContain("§164⑤ 준용으로 산정해야 합니다");
  });

  it("B-1 주택 건물 — 남은 §164⑥ 값을 싣지 않는다(②는 §164⑦ — 이 화면에 없음)", () => {
    const it_ = item({ ...C164, isHousing: true });
    expect((buildGiftBurdenedTransferBody(it_, form(it_)) as Obj).commercialInheritanceValuation).toBeUndefined();
  });

  it("B-2 범위 밖(1990 상속) — 남은 §164⑥ 값을 싣지 않고 ⑧도 보지 않는다", () => {
    const it_ = item({ ...C164, c164LandPricePerSqmAtFirst: "", acquisitionMethod: "actual" }, { acqDate: "1990-07-26" });
    expect((buildGiftBurdenedTransferBody(it_, form(it_)) as Obj).commercialInheritanceValuation).toBeUndefined();
    expect(validateStep(1, form(it_)) ?? "").not.toContain("§164⑥");
  });

  it("B-3 토지 — 남은 §164⑥ 값을 싣지 않는다", () => {
    const it_ = item(C164, { category: "real_estate_land" });
    expect((buildGiftBurdenedTransferBody(it_, form(it_)) as Obj).commercialInheritanceValuation).toBeUndefined();
  });
});
