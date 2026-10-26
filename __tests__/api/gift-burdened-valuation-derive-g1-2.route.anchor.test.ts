/**
 * 1h-G1-2 anchor(결정 #23 B) — 증여세 부담부증여 양도세의 평가방식·양도 시 시가는 **증여세 평가에서 파생**한다.
 *
 * 「소득세법 시행령」 §159①2호 A는 상증법 §60~§66 평가액, C는 증여가액이다 — 양도 쪽 평가는 증여세 평가와 같아야 한다.
 * 종전: 평가방식 라디오 기본값이 «기준시가»라, 증여세를 시가(매매사례)로 평가해도 12억 판정·채무비율이 공시가격으로 계산됐다
 * (시가 14억·공시 9억 1주택 전액 비과세 0). 토지는 시가·환산에서 양도 시 기준시가를 ㎡당 단가로 받아 총액처럼 썼다(취득가액 200억 → 세액 0).
 *
 * 재현 시료: 아파트 · 공시 9억 · 매매사례 14억 · 보증금 3억 · 취득 2016-01-10(취득시 기준시가 5억) · 거주 60개월 · 1주택 · 증여 2025-06-01.
 * 금액은 mock 세율표 실측 — 방향만 유효하다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { giftBurdenedValuationBasis } from "@/lib/calc/gift-burdened-valuation-basis";
import { MARKET_COLLATERAL_STANDARD_ACQUISITION_NOTICE, computeSangjeungbeopValuation } from "@/lib/tax-engine/burdened-gift-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { giftForm, post, run, type Obj } from "./_gift-burdened-pr7-harness";
import { RH_ANSWERED_NO } from "../calc/_helpers/phrp-154-10-answer";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));
afterEach(() => vi.unstubAllGlobals());

const GIFT_DATE = "2025-06-01";

function apt(over: Partial<EstateItem> = {}, bgt: Partial<BurdenedGiftTransferTaxInput> = {}): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 900_000_000,
    leaseDeposit: 300_000_000,
    mortgageAmount: 0,
    assumedDebtForGift: 300_000_000,
    monthlyRent: 0,
    ...over,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2016-01-10"),
      standardPriceAtAcquisition: 500_000_000,
      isOneHousehold: true,
      rentalHousingException: RH_ANSWERED_NO,
      householdHousingCount: 1,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 60,
      isUnregistered: false,
      ...bgt,
    },
  } as EstateItem;
}
const body = (item: EstateItem) => buildGiftBurdenedTransferBody(item, giftForm(GIFT_DATE)) as Obj;
const info = (item: EstateItem) => body(item).burdenedGiftInfo as Obj;
const validate = (item: EstateItem) =>
  validateStep(1, { ...INITIAL_FORM, giftDate: GIFT_DATE, donor: "father", giftItems: [item] } as FormState);
const warnings = (r: Obj) => (r.warnings as string[] | undefined) ?? [];

describe("파생 — 평가 방법은 증여재산 평가 칸이 정한다", () => {
  it("D-1 ★ 매매사례가액이 있으면 시가 평가, ④는 그 평가액을 marketValueAtTransfer로 싣는다(옛 독립 입력은 읽지 않는다)", () => {
    const item = apt({ similarSalesValue: 1_400_000_000 }, { valuationMode: "sangjeungbeop_standard", marketValueAtTransfer: 123 });
    expect(giftBurdenedValuationBasis(item)).toMatchObject({ mode: "sangjeungbeop_market", marketValue: 1_400_000_000 });
    expect(info(item)).toMatchObject({ valuationMode: "sangjeungbeop_market", marketValueAtTransfer: 1_400_000_000 });
  });
  it("D-2 우선순위 — 시가 > 감정가액 > 매매사례가액 > 보충적 평가(엔진 resolveValuationMethod 그대로)", () => {
    const base = { similarSalesValue: 1_000_000_000, appraisedValue: 1_100_000_000, marketValue: 1_200_000_000 };
    expect(giftBurdenedValuationBasis(apt(base)).marketValue).toBe(1_200_000_000);
    expect(giftBurdenedValuationBasis(apt({ ...base, marketValue: undefined })).marketValue).toBe(1_100_000_000);
    expect(giftBurdenedValuationBasis(apt({ ...base, marketValue: undefined, appraisedValue: undefined })).marketValue).toBe(1_000_000_000);
  });
  it("D-3 부정 짝 — 시가·감정가·매매사례가가 없으면 기준시가 안분, 시가 필드는 싣지 않는다(옛 시가 기록 무시)", () => {
    const item = apt({}, { valuationMode: "sangjeungbeop_market", marketValueAtTransfer: 3_000_000_000, acquisitionMethod: "actual", actualAcquisitionTotal: 1 });
    expect(giftBurdenedValuationBasis(item).mode).toBe("sangjeungbeop_standard");
    const i = info(item);
    expect(i.valuationMode).toBe("sangjeungbeop_standard");
    expect(i.marketValueAtTransfer).toBeUndefined();
    expect(i.acquisitionMethod).toBeUndefined();
    expect(i.actualAcquisitionTotal).toBeUndefined();
  });
});

describe("재현 시료 — 시가 14억·공시 9억 1주택: 전액 비과세(공시가격 판정) → 고가주택 부분 과세", () => {
  it("R-1 ★ 종전(기준시가 판정) 0 · 비과세 → 시가 평가(실지 6억) 고가주택 546,183", async () => {
    const standardOnly = await run(body(apt()));
    expect(standardOnly.isExempt).toBe(true);
    expect(standardOnly.totalTax).toBe(0);

    const item = apt({ similarSalesValue: 1_400_000_000 }, { acquisitionMethod: "actual", actualAcquisitionTotal: 600_000_000 });
    const r = await run(body(item));
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(true);
    expect(r.exemptReason).toBe("1세대1주택 고가주택");
    expect(r.transferGain).toBe(171_428_572);
    expect(r.taxableGain).toBe(24_489_796);
    expect(r.totalTax).toBe(546_183);
  });
  it("R-2 증여세 쪽 증여가액과 같은 평가로 채무비율을 쓴다 — 3억/14억(종전 3억/9억)", async () => {
    const r = await run(body(apt({ similarSalesValue: 1_400_000_000 }, { acquisitionMethod: "actual", actualAcquisitionTotal: 600_000_000 })));
    const bg = r.transferBurdenedGiftBreakdown as { debtRatio: number; sangjeungbeopValuation: { max: number } };
    expect(bg.sangjeungbeopValuation.max).toBe(1_400_000_000);
    expect(bg.debtRatio).toBeCloseTo(300_000_000 / 1_400_000_000, 10);
  });
});

describe("⑧ — 시가 평가면 산정방식을 요구한다(저장 기록 포함)", () => {
  it("V-1 ★ 시가로 평가했는데 취득가액 산정방식이 없으면 막는다 — 옛 기록(기준시가 안분 저장)도 같다", () => {
    const stale = apt({ similarSalesValue: 1_400_000_000 }, { valuationMode: "sangjeungbeop_standard" });
    expect(validate(stale)).toContain("취득가액 산정방식");
  });
  it("V-2 산정방식을 고르면 통과한다(실지는 실지취득가액 합계 필요)", () => {
    expect(validate(apt({ similarSalesValue: 1_400_000_000 }, { acquisitionMethod: "actual" }))).toContain("실지취득가액 합계");
    expect(validate(apt({ similarSalesValue: 1_400_000_000 }, { acquisitionMethod: "actual", actualAcquisitionTotal: 600_000_000 }))).toBeNull();
    expect(validate(apt({ similarSalesValue: 1_400_000_000 }, { acquisitionMethod: "converted" }))).toBeNull();
  });
  it("V-3 부정 짝 — 기준시가 평가는 산정방식 없이 통과하고, 옛 시가 입력은 요구하지도 막지도 않는다", () => {
    expect(validate(apt())).toBeNull();
    expect(validate(apt({}, { valuationMode: "sangjeungbeop_market", marketValueAtTransfer: 0 }))).toBeNull();
  });
  it("V-4 환산(K-5)은 양도시 기준시가(공시가격) 총액이 필요하다", () => {
    expect(validate(apt({ similarSalesValue: 1_400_000_000, standardPrice: undefined }, { acquisitionMethod: "converted" }))).toContain("양도시");
  });
});

describe("토지 단위 결함 — 양도시 기준시가는 총액 한 칸이다", () => {
  const land = (bgt: Partial<BurdenedGiftTransferTaxInput>) =>
    ({
      id: "land-1",
      category: "real_estate_land",
      name: "테스트 토지",
      standardPrice: 450_000_000, // 양도시 개별공시지가 «총액»
      marketValue: 600_000_000,
      leaseDeposit: 0,
      mortgageAmount: 300_000_000,
      assumedDebtForGift: 300_000_000,
      monthlyRent: 0,
      burdenedGiftTransferTax: {
        acquisitionDate: new Date("2010-03-01"),
        standardPriceAtAcquisition: 150_000_000,
        acquisitionMethod: "converted",
        isUnregistered: false,
        ...bgt,
      },
    }) as unknown as EstateItem;

  it("L-1 ★ K-5 토지: ④가 item.standardPrice(총액)를 landStdPriceAtTransfer로 싣는다 — 옛 ㎡당 칸 값(3,000원/㎡)은 읽지 않는다", () => {
    const i = info(land({ landStdPriceAtTransfer: 3_000 }));
    expect(i.landStdPriceAtTransfer).toBe(450_000_000);
  });
  it("L-2 ★ 환산취득가액 = 양도가 3억 × 취득 1.5억 ÷ 양도 4.5억 = 100,000,000 (종전: 옛 칸 3,000을 분모로 → 15조)", async () => {
    const r = await run(body(land({ landStdPriceAtTransfer: 3_000 })));
    const bg = r.transferBurdenedGiftBreakdown as { perAsset: { land: { transferPrice: number; acquisitionPrice: number } } };
    expect(bg.perAsset.land.transferPrice).toBe(300_000_000);
    expect(bg.perAsset.land.acquisitionPrice).toBe(100_000_000);
  });
  it("L-3 ⑧: 양도시 개별공시지가 총액이 없으면 환산을 막는다(㎡당 칸을 요구하지 않는다)", () => {
    const item = land({});
    const v = validateStep(1, {
      ...INITIAL_FORM, giftDate: GIFT_DATE, donor: "father",
      giftItems: [{ ...item, standardPrice: undefined } as EstateItem],
    } as FormState);
    expect(v).toContain("개별공시지가 총액");
    expect(v).not.toContain("원/㎡");
  });
});

describe("시가 평가의 증여가액 C = 시가와 담보평가(§66) 중 큰 값 — 임대료 환산(§61⑤)은 넣지 않는다 (하위 결정 1)", () => {
  const mk = (valuationMode: BurdenedGiftInfo["valuationMode"]) =>
    ({
      valuationMode,
      marketValueAtTransfer: 500_000_000,
      lendingDepositTotal: 100_000_000,
      mortgageDebtAmount: 0,
      annualRentTotal: 72_000_000, // 임대 환산가액 6억(= 연 7,200만 ÷ 12%) + 보증금 1억
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: 400_000_000,
    }) as BurdenedGiftInfo;
  it("C-1 ★ 시가 5억 · 임대 환산 7억(보증금 1억 + 6억): 시가 평가는 5억 그대로(종전 7억 → 채무비율 1/7 대 정답 1/5)", () => {
    const v = computeSangjeungbeopValuation(0, 400_000_000, mk("sangjeungbeop_market"));
    expect(v.rental).toBeGreaterThan(500_000_000); // 값은 명세 표시용으로 그대로 산출
    expect(v.selectedMode).toBe("supplementary");
    expect(v.max).toBe(500_000_000);
  });
  it("C-2 부정 짝 — 보충적 평가(기준시가)에서는 임대 환산이 이기면 그대로 채택한다(§61⑤ ↔ §61①~④)", () => {
    const v = computeSangjeungbeopValuation(0, 400_000_000, mk("sangjeungbeop_standard"));
    expect(v.selectedMode).toBe("rental");
  });
  it("C-3 시가 평가에서도 담보평가(§66)가 시가보다 크면 담보평가가 이긴다", () => {
    const v = computeSangjeungbeopValuation(0, 0, { ...mk("sangjeungbeop_market"), mortgageDebtAmount: 600_000_000 });
    expect(v.selectedMode).toBe("mortgage");
    expect(v.max).toBe(700_000_000);
  });
});

describe("담보평가(§66)가 시가보다 크면 취득가액도 기준시가(§159①1호 괄호) + 확인 필요 (하위 결정 2 다)", () => {
  /** 시가 5억 · 채무 6억(저당) → 담보평가 6억 > 시가. 취득시 기준시가 3억 → 취득가액 = 3억 × 6억/6억. */
  const forced = (bgt: Partial<BurdenedGiftTransferTaxInput> = {}) =>
    apt(
      { similarSalesValue: 500_000_000, standardPrice: 450_000_000, leaseDeposit: 0, mortgageAmount: 600_000_000, assumedDebtForGift: 600_000_000 },
      { standardPriceAtAcquisition: 300_000_000, isOneHousehold: false, ...bgt },
    );

  it("F-1 ★ 파생: 시가 평가 + 담보가 이김 → collateralForcesStandardAcquisition, ④는 환산을 싣고 실지·산정방식 선택은 읽지 않는다", () => {
    const item = forced({ acquisitionMethod: "actual", actualAcquisitionTotal: 400_000_000 });
    expect(giftBurdenedValuationBasis(item).collateralForcesStandardAcquisition).toBe(true);
    const i = info(item);
    expect(i.acquisitionMethod).toBe("converted");
    expect(i.actualAcquisitionTotal).toBeUndefined();
  });
  it("F-2 ★ route: 취득가액은 취득시 기준시가 × 채무비율(= 3억) · 확인 필요 고지 · 사용자의 실지/환산 선택은 결과를 바꾸지 않는다", async () => {
    const a = await run(body(forced({ acquisitionMethod: "actual", actualAcquisitionTotal: 400_000_000 })));
    const b = await run(body(forced({ acquisitionMethod: "converted" })));
    const bg = a.transferBurdenedGiftBreakdown as { acquisitionMethodUsed: string; acquisitionStdForcedByCollateral?: boolean; perAsset: { building: { acquisitionPrice: number } } };
    expect(bg.acquisitionMethodUsed).toBe("standard_price");
    expect(bg.acquisitionStdForcedByCollateral).toBe(true);
    expect(bg.perAsset.building.acquisitionPrice).toBe(300_000_000);
    expect(warnings(a)).toContain(MARKET_COLLATERAL_STANDARD_ACQUISITION_NOTICE);
    expect(a.totalTax).toBe(b.totalTax);
    expect(a.transferGain).toBe(b.transferGain);
  });
  it("F-3 부정 짝 — 담보가 시가보다 작으면(채무 3억) 사용자가 고른 산정방식이 적용되고 고지는 없다", async () => {
    const item = apt({ similarSalesValue: 500_000_000, standardPrice: 450_000_000, leaseDeposit: 0, mortgageAmount: 300_000_000, assumedDebtForGift: 300_000_000 }, { isOneHousehold: false, acquisitionMethod: "actual", actualAcquisitionTotal: 400_000_000 });
    expect(giftBurdenedValuationBasis(item).collateralForcesStandardAcquisition).toBe(false);
    const r = await run(body(item));
    expect((r.transferBurdenedGiftBreakdown as { acquisitionMethodUsed: string }).acquisitionMethodUsed).toBe("actual");
    expect(warnings(r)).not.toContain(MARKET_COLLATERAL_STANDARD_ACQUISITION_NOTICE);
  });
  it("F-4 ⑧: 산정방식 선택은 요구하지 않고(⑤가 라디오를 숨김) 취득시 기준시가는 요구한다", () => {
    expect(validate(forced())).toBeNull();
    expect(validate(forced({ standardPriceAtAcquisition: 0 }))).toContain("취득시 기준시가");
  });
  it("F-5 엔진 안전망 — 취득시 기준시가 없이 이 상태로 계산을 요청하면 막는다(취득가액 0 → 양도차익 과대 방지)", async () => {
    const b = body(forced({ standardPriceAtAcquisition: 0 }));
    const res = await post(b);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
