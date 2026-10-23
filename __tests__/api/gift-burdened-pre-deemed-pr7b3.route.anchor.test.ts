/**
 * PR-7b-3 — 증여세 계산기 부담부증여 양도세 × 의제취득일(1985.1.1.) 전 상속 자산 (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §6).
 *
 * 사용자 결정 Q-24(시가 → max(①,②,③) × 채무비율) · Q-25(기준시가 → 의제취득일 기준시가 × 채무비율) · Q-32(이 경로도 같은 규칙 ·
 * 시가에서 ①② 모두 없으면 「확인할 수 없음」 선언 · 토지 등급 칸).
 * 종전(master 4397071e7)에는 이 경로가 상속 의제 입력을 싣지 않아 사용자가 고른 산정방식 하나로 계산했고, 토지 등급 칸이 없었다.
 *
 * 시료(조사 `scratchpad/pr7b/giftcalc.md` · 양도세 계산기 PR-7a anchor와 같은 값): 토지 1983-07-26 상속(피상속인 1970) · 2023-02-16 부담부증여 ·
 * 근저당 채무 460,000,000 · 양도시 개별공시지가 총액 1,243,350,000 · 의제취득일 기준시가 칸 202,620,000 · 시가 평가면 시가 920,000,000.
 * 기대값은 조사 때 양도세 계산기 PR-7a와 증여세 body 주입이 1원까지 같았던 값이다. 세율은 mock.
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
const GIFT_DATE = "2023-02-16";
/** 토지 등급 — 218/218/200 · 1990 단가 1,100,000 · 면적 184.2㎡ */
const GRADE: Partial<BurdenedGiftTransferTaxInput> = {
  pre1990Enabled: true,
  pre1990Grade_current: "218",
  pre1990Grade_prev: "218",
  pre1990Grade_atAcq: "200",
  pre1990PricePerSqm_1990: "1100000",
  pre1990GradeMode: "number",
};

function item(bgt: Partial<BurdenedGiftTransferTaxInput>, o: { market?: boolean; category?: string; acqDate?: string } = {}): EstateItem {
  return {
    id: "x-1",
    category: o.category ?? "real_estate_land",
    name: "테스트 토지",
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
      ...bgt,
    },
  } as unknown as EstateItem;
}
const form = (it: EstateItem) =>
  ({
    giftDate: GIFT_DATE,
    donor: "father",
    donorRelation: "lineal_ascendant_adult",
    priorGifts: [],
    giftItems: [it],
    stockItems: [],
  }) as unknown as FormState;

async function run(it: EstateItem) {
  const f = form(it);
  const issue = validateStep(1, f);
  const body = buildGiftBurdenedTransferBody(it, f) as Obj;
  const res = await post(body);
  const json = (await res.json()) as { data?: { result?: Obj }; error?: unknown };
  const r = json.data?.result as Obj | undefined;
  const bg = r?.transferBurdenedGiftBreakdown as
    | { acquisitionMethodUsed?: string; preDeemed?: { basis: string; selected?: string; stdAtDeemed: number }; perAsset: { land: { acquisitionPrice: number } } }
    | undefined;
  return { issue, body, status: res.status, tax: r?.determinedTax, bg };
}

describe("PR-7b-3 증여세 계산기 부담부증여 × 의제취득일 전 상속", () => {
  it("S-1 기준시가 평가 · 칸 202,620,000 — 의제취득일 기준시가 × 채무비율(값은 종전과 같다 · 엔진 deemed_std)", async () => {
    const r = await run(item({}));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
    expect((r.body.inheritedAcquisition as Obj).mode).toBe("pre-deemed");
    expect(r.bg?.preDeemed?.basis).toBe("deemed_std");
    expect(r.tax).toBe(80_931_647);
  });

  it("S-2 기준시가 평가 · 토지 등급만(칸 비움) — 의제취득일 기준시가 = 등급 환산(84,443,174) · ⑧ 통과", async () => {
    const r = await run(item({ ...GRADE, standardPriceAtAcquisition: 0 }));
    expect(r.issue).toBeNull();
    expect(r.body.pre1990Land).toBeDefined();
    expect((r.body.inheritedAcquisition as Obj).standardPriceAtDeemedDate).toBeUndefined();
    expect(r.bg?.preDeemed?.stdAtDeemed).toBe(84_443_174);
    expect((r.body.burdenedGiftInfo as Obj).landStdPriceAtAcquisition).toBe(84_443_174);
    expect(r.tax).toBe(92_910_511);
  });

  it("M-1 시가 평가 · ① 3억 — 산정방식 없이 3자 max(① 채택)", async () => {
    const r = await run(item({ reportedValueAtInheritance: 300_000_000 }, { market: true }));
    expect(r.issue).toBeNull();
    expect((r.body.burdenedGiftInfo as Obj).acquisitionMethod).toBeUndefined();
    expect(r.bg?.preDeemed?.selected).toBe("reported");
    expect(r.tax).toBe(61_570_000);
  });

  it("M-2 시가 평가 · ①② 없음 + 선언 — ③ 채택", async () => {
    const r = await run(item({ preDeemedClauseAUnconfirmed: true }, { market: true }));
    expect(r.issue).toBeNull();
    expect(r.bg?.preDeemed?.selected).toBe("converted");
    expect(r.tax).toBe(80_721_398);
  });

  it("M-3 시가 평가 · ①② 없음 · 선언 없음 — ⑧ 차단(Q-32)", async () => {
    const r = await run(item({}, { market: true }));
    expect(r.issue).toContain("상증법 평가액을 확인할 수 없음");
  });

  it("M-4 시가 평가 · 토지 등급(②) — 선언 없이 통과 · ② 채택", async () => {
    const r = await run(item({ ...GRADE, standardPriceAtAcquisition: 0 }, { market: true }));
    expect(r.issue).toBeNull();
    expect(r.bg?.preDeemed?.selected).toBe("sec164");
    expect(r.tax).toBe(90_239_058);
  });

  it("M-5 시가 평가 · 남은 산정방식(실지 1억)은 싣지 않는다 — ① 3억이 그대로 이긴다", async () => {
    const r = await run(item({ reportedValueAtInheritance: 300_000_000, acquisitionMethod: "actual", actualAcquisitionTotal: 100_000_000 }, { market: true }));
    expect(r.issue).toBeNull();
    const info = r.body.burdenedGiftInfo as Obj;
    expect(info.acquisitionMethod).toBeUndefined();
    expect(info.actualAcquisitionTotal).toBeUndefined();
    expect(r.tax).toBe(61_570_000);
  });

  it("A-1 아파트 · 기준시가 / 시가 ① 3억 / 시가 선언 — 토지와 같은 값", async () => {
    const apt = { category: "real_estate_apartment" };
    const std = await run(item({}, apt));
    const rep = await run(item({ reportedValueAtInheritance: 300_000_000 }, { ...apt, market: true }));
    const conv = await run(item({ preDeemedClauseAUnconfirmed: true }, { ...apt, market: true }));
    expect([std.issue, rep.issue, conv.issue]).toEqual([null, null, null]);
    expect((std.body.inheritedAcquisition as Obj).assetKind).toBe("house_apart");
    expect([std.tax, rep.tax, conv.tax]).toEqual([80_931_647, 61_570_000, 80_721_398]);
  });

  it("C-1 비주택 건물(상업용 · 부수토지 합산) · 시가 ① 3억 / 선언 / 기준시가 — 양도세 building으로 3자 max·의제취득일 기준시가", async () => {
    const bld = { category: "real_estate_building" };
    const rep = await run(item({ isHousing: false, reportedValueAtInheritance: 300_000_000 }, { ...bld, market: true }));
    const conv = await run(item({ isHousing: false, preDeemedClauseAUnconfirmed: true }, { ...bld, market: true }));
    const std = await run(item({ isHousing: false }, bld));
    expect([rep.issue, conv.issue, std.issue]).toEqual([null, null, null]);
    expect([rep.status, conv.status, std.status]).toEqual([200, 200, 200]);
    expect(rep.body.propertyType).toBe("building");
    expect([rep.bg?.preDeemed?.selected, conv.bg?.preDeemed?.selected, std.bg?.preDeemed?.basis]).toEqual(["reported", "converted", "deemed_std"]);
    // 같은 수치·mock 세율에서 토지와 같은 값(장특·세율 축이 같다)
    expect([rep.tax, conv.tax, std.tax]).toEqual([61_570_000, 80_721_398, 80_931_647]);
  });

  it("S-2b 등급 환산과 칸 값이 둘 다 있으면 등급 — 칸 값을 의제취득일 기준시가로 싣지 않는다(엔진은 보낸 값을 우선한다)", async () => {
    const r = await run(item({ ...GRADE }));
    expect(r.issue).toBeNull();
    expect((r.body.inheritedAcquisition as Obj).standardPriceAtDeemedDate).toBeUndefined();
    expect(r.bg?.preDeemed?.stdAtDeemed).toBe(84_443_174);
    expect(r.tax).toBe(92_910_511);
  });

  it("S-2c 아파트에 남은 등급 칸은 쓰지 않는다(등급은 토지 전용)", async () => {
    const r = await run(item({ ...GRADE }, { category: "real_estate_apartment" }));
    expect(r.body.pre1990Land).toBeUndefined();
    expect((r.body.inheritedAcquisition as Obj).standardPriceAtDeemedDate).toBe(202_620_000);
    expect(r.tax).toBe(80_931_647);
  });

  it("S-3 등급 칸이 차 있어도 토글을 끄면 칸 값 — pre1990Land를 싣지 않는다", async () => {
    const r = await run(item({ ...GRADE, pre1990Enabled: false }));
    expect(r.issue).toBeNull();
    expect(r.body.pre1990Land).toBeUndefined();
    expect((r.body.inheritedAcquisition as Obj).standardPriceAtDeemedDate).toBe(202_620_000);
    expect(r.tax).toBe(80_931_647);
  });

  it("S-4 기준시가 평가에 남은 ①은 싣지 않는다(⑤가 그때 칸을 보이지 않는다)", async () => {
    const r = await run(item({ reportedValueAtInheritance: 300_000_000 }));
    expect((r.body.inheritedAcquisition as Obj).reportedValue).toBeUndefined();
    expect(r.tax).toBe(80_931_647);
  });

  it("M-6 시가 평가 · 담보 승(시가 4억 < 채무 4.6억) — §159①1호 괄호라 기준시가 평가와 같다 · ①·선언 없이 통과", async () => {
    const it_ = item({});
    Object.assign(it_, { marketValue: 400_000_000 });
    const r = await run(it_);
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
    expect(r.bg?.preDeemed?.basis).toBe("deemed_std");
  });

  it("M-7 시가 평가 · 양도시 기준시가 없음 — ⑧이 ③ 분모를 요구한다", async () => {
    const it_ = item({ reportedValueAtInheritance: 300_000_000 }, { market: true });
    Object.assign(it_, { standardPrice: 0 });
    expect(validateStep(1, form(it_))).toContain("③ 환산취득가액의 분모");
  });

  it("C-2 비주택 건물 · 시가 · 남은 「실지」 산정방식 — 의제취득일 기준시가 칸은 그래도 필수(③ 분자)", () => {
    const it_ = item({ isHousing: false, acquisitionMethod: "actual", standardPriceAtAcquisition: 0, preDeemedClauseAUnconfirmed: true }, { category: "real_estate_building", market: true });
    expect(validateStep(1, form(it_))).toContain("의제취득일(1985.1.1.) 현재 기준시가를 입력하세요");
  });

  it("H-1 단독주택(건물 · 주택) — 엔진 자산 종류 house_individual", () => {
    const it_ = item({ isHousing: true }, { category: "real_estate_building" });
    const body = buildGiftBurdenedTransferBody(it_, form(it_)) as Obj;
    expect((body.inheritedAcquisition as Obj).assetKind).toBe("house_individual");
  });

  it("B-1 범위 밖: 1990 상속 — 상속 의제 입력을 싣지 않고 종전 규칙(환산 차단)", async () => {
    const it_ = item({ acquisitionMethod: "converted" }, { market: true, acqDate: "1990-07-26" });
    const r = await run(it_);
    expect(r.body.inheritedAcquisition).toBeUndefined();
    expect(r.issue).toContain("환산취득가액(K-5)을 쓸 수 없습니다");
  });

  it("B-2 범위 밖: 매매 취득 1983 — 상속 의제 입력·등급을 싣지 않는다(남은 값 무해)", async () => {
    const r = await run(item({ acquisitionCause: "purchase", reportedValueAtInheritance: 300_000_000, ...GRADE }));
    expect(r.body.inheritedAcquisition).toBeUndefined();
    expect(r.body.pre1990Land).toBeUndefined();
    expect((r.body.burdenedGiftInfo as Obj).landStdPriceAtAcquisition).toBe(202_620_000);
  });
});
