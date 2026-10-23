/**
 * 의제취득일(1985.1.1.) 전 상속·증여 토지·주택 × 부담부증여 — §159①1호 A (계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md` §18).
 *
 * 사용자 결정(2026-10-23):
 *  · Q-24 시가 평가 → max(①,②,③) 안분 전 전체 금액 × 채무비율 (③의 양도가액 = 증여가액 · 국심2007서2099)
 *  · Q-25 기준시가 평가(§159①1호 괄호) → 의제취득일 기준시가 × 채무비율 (수원고법 2021누12905)
 *  · Q-26 결함 R — 재개발 × 부담부증여 × 상속에서 β 없는 숨은 ①이 §159 안분값을 덮던 것
 *
 * 화면 경로(폼 → ⑧ → ④ body → route ⑫⑭ → 엔진). 시료: 토지 184.2㎡ · 1983-07-26 상속 · 2023-02-16 부담부증여 · 채무 460,000,000 ·
 * 양도시 기준시가 1,243,350,000 · 의제취득일 기준시가 칸 202,620,000 · 시가 920,000,000(β 0.5). 세율은 mock.
 * 종전(master f15dbf59f) 값은 각 케이스 주석에 적었다 — 종전에는 §159가 사용자가 고른 산정방식 하나로 정해 ①②③을 쓰지 않았다.
 */
import { describe, expect, it, vi } from "vitest";

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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const LAND: Record<string, unknown> = {
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "land",
  acquisitionCause: "inheritance",
  acquisitionDate: "1983-07-26",
  inheritanceStartDate: "1983-07-26",
  decedentAcquisitionDate: "1970-01-01",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0",
  bgMortgageDebtAmount: "460000000",
  standardPriceAtTransfer: "1243350000",
  standardPriceAtAcq: "202620000",
  acquisitionArea: "184.2",
  transferArea: "184.2",
  landNature: "standalone",
};
const PRE1990 = {
  pre1990Grade_current: "218",
  pre1990Grade_prev: "218",
  pre1990Grade_atAcq: "200",
  pre1990PricePerSqm_1990: "1100000",
  pre1990PricePerSqm_atTransfer: "6750000",
  pre1990GradeMode: "number",
};
const MARKET = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920000000" };
const STANDARD = { bgValuationMode: "sangjeungbeop_standard" };

const form = (over: Record<string, unknown>): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16",
    filingDate: "2023-04-30",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    assets: [{ ...makeDefaultAsset(1), ...LAND, ...over } as AssetForm],
  }) as TransferFormData;

async function calc(over: Record<string, unknown>) {
  const r = await runCalc(form(over));
  return { ...r, bg: r.result?.transferBurdenedGiftBreakdown, ia: r.result?.inheritedAcquisitionDetail };
}

describe("기준시가 평가 — 의제취득일 기준시가 × 채무비율 (Q-25)", () => {
  it("S-1 칸 값(의제취득일 기준시가 202,620,000) × β — ①은 쓰지 않는다(숨은 ① 3억이 있어도 같다)", async () => {
    for (const extra of [{}, { publishedValueAtInheritance: "300000000" }]) {
      const r = await calc({ ...STANDARD, ...extra });
      expect(r.issues).toEqual([]);
      expect(r.status).toBe(200);
      expect(r.bg.preDeemed).toEqual({ basis: "deemed_std", stdAtDeemed: 202_620_000 });
      expect(r.bg.perAsset.land.acquisitionPrice).toBe(74_962_962);
      expect(r.result.determinedTax).toBe(80_931_647); // 종전과 같다(칸 값을 그대로 썼다)
      // 3자 max 비교가 적용되지 않으므로 상속 의제 카드·단계를 남기지 않는다
      expect(r.ia).toBeUndefined();
    }
  });

  it("S-2 토지 등급(§164④) 환산값이 의제취득일 기준시가다 — 84,443,174 × β (종전 80,931,647: 칸 값 202,620,000을 썼다)", async () => {
    const r = await calc({ ...STANDARD, ...PRE1990 });
    expect(r.status).toBe(200);
    expect(r.bg.preDeemed.stdAtDeemed).toBe(84_443_174);
    expect(r.bg.perAsset.land.acquisitionPrice).toBe(31_241_291);
    expect(r.result.determinedTax).toBe(92_910_511);
  });

  it("S-3 증여(1983)도 같다 — ① 없이 통과(⑧·⑫ 모두) (종전 ⑧ 통과 ↔ ⑫ 400)", async () => {
    const r = await calc({ ...STANDARD, acquisitionCause: "gift", inheritanceStartDate: "" });
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.determinedTax).toBe(80_931_647);
  });
});

describe("시가 평가 — ①②③ 중 큰 금액 × 채무비율 (Q-24)", () => {
  it("M-1 ① 3억 > ③ 149,925,925 → ① 채택 · 실제 필요경비 경로 (종전 K-5 80,721,398 / K-4 실지 1억 88,170,000)", async () => {
    const r = await calc({ ...MARKET, publishedValueAtInheritance: "300000000", bgAcquisitionMethod: "converted" });
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.bg.preDeemed).toMatchObject({ basis: "three_way", selected: "reported", reported: 300_000_000, converted: 149_925_925, wholeAcquisition: 300_000_000 });
    expect(r.bg.acquisitionMethodUsed).toBe("actual");
    expect(r.bg.perAsset.land.acquisitionPrice).toBe(150_000_000);
    expect(r.result.determinedTax).toBe(61_570_000);
    // 상속 의제 카드는 ③을 증여가액으로 환산한 물건 전체 값이다(종전: 채무 합계 placeholder로 환산해 ①②와 스케일이 섞였다 — §14.4)
    expect(r.ia.preDeemedBreakdown).toMatchObject({ selectedMethod: "reported", convertedAmount: 149_925_925 });
  });

  it("M-2 ① 없음 + 「확인할 수 없음」 선언 → ③ 채택 (사용자가 고른 산정방식은 쓰지 않는다)", async () => {
    for (const method of ["actual", "appraisal", "converted", ""]) {
      const r = await calc({ ...MARKET, preDeemedClauseAUnconfirmed: true, bgAcquisitionMethod: method, bgActualAcquisitionLand: "100000000" });
      expect(r.issues).toEqual([]);
      expect(r.status).toBe(200);
      expect(r.bg.acquisitionMethodUsed).toBe("converted");
      expect(r.bg.perAsset.land.acquisitionPrice).toBe(74_962_962);
      expect(r.result.determinedTax).toBe(80_721_398);
      // ④가 산정방식·방식별 금액을 싣지 않는다
      const info = r.body.burdenedGiftInfo as Record<string, unknown>;
      expect(info.acquisitionMethod).toBeUndefined();
      expect(info.actualLandAcquisitionPrice).toBeUndefined();
    }
  });

  it("M-3 ② 등급 84,443,174 > ③ 62,482,583 → ② 채택", async () => {
    const r = await calc({ ...MARKET, ...PRE1990 });
    expect(r.status).toBe(200);
    expect(r.bg.preDeemed).toMatchObject({ selected: "sec164", sec164: 84_443_174, converted: 62_482_583 });
    expect(r.bg.perAsset.land.acquisitionPrice).toBe(42_221_587);
    expect(r.result.determinedTax).toBe(90_239_058);
  });

  it("M-4 ① 없이 선언도 없으면 ⑧ E-1이 막는다", async () => {
    const r = await calc({ ...MARKET });
    expect(r.issues.map((i) => i.field)).toContain("preDeemedClauseAUnconfirmed");
  });

  it("M-5 증여(1983) — ① 증여 신고가액 필수(Q-14), 2억 > ③ → ① 채택", async () => {
    const blocked = await calc({ ...MARKET, acquisitionCause: "gift", inheritanceStartDate: "" });
    expect(blocked.issues.map((i) => i.field)).toContain("fixedAcquisitionPrice");
    const r = await calc({ ...MARKET, acquisitionCause: "gift", inheritanceStartDate: "", fixedAcquisitionPrice: "200000000" });
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.bg.preDeemed.selected).toBe("reported");
    expect(r.result.determinedTax).toBe(74_870_000);
  });

  it("M-6 ③ 채택 + 자본적지출이 ③·개산공제보다 크면 §97②2호 단서(실제 경비)", async () => {
    const r = await calc({ ...MARKET, preDeemedClauseAUnconfirmed: true, capitalExpenditure: "300000000" });
    expect(r.status).toBe(200);
    expect(r.bg.acquisitionMethodUsed).toBe("converted");
    expect(r.bg.necessaryExpenseSwap.chosen).toBe("direct");
  });
});

describe("결함 R — 재개발 × 부담부증여 × 상속: 숨은 ①이 §159 안분값을 덮지 않는다 (Q-26)", () => {
  const apt = (over: Record<string, unknown>) =>
    Object.assign(createDefaultTransferFormData(), {
      transferDate: "2026-02-16",
      filingDate: "2026-04-30",
      totalTransferExpense: "0",
      isOneHousehold: false,
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
      assets: [
        {
          ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "redevelopment_apt", acquisitionCause: "inheritance",
          acquisitionDate: "2000-07-26", inheritanceStartDate: "2000-07-26", decedentAcquisitionDate: "1970-01-01",
          transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant",
          standardPriceAtTransfer: "1,500,000,000", standardPriceAtAcq: "100,000,000",
          redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "500,000,000",
          redevSettlementDirection: "pay", redevSettlementAmount: "200,000,000", redevPreApprovalExpenses: "10,000,000", redevPostApprovalExpenses: "5,000,000",
          redevCompletionDate: "2021-09-01", redevManagementDisposalHousingPrice: "400,000,000", redevAcquisitionHousingPrice: "300,000,000",
          redevActualAcquisitionPrice: "", useEstimatedAcquisition: false, ...over,
        } as AssetForm,
      ],
    }) as TransferFormData;

  it("R-1 일반 양도에서 넣은 ① 2억이 숨은 채 남아도 인가 전 취득가액은 β 안분값(4천만)이다 (종전 2억 · 결정세액 69,332,857)", async () => {
    const plain = await runCalc(apt({}));
    const hidden = await runCalc(apt({ publishedValueAtInheritance: "200000000" }));
    expect(hidden.status).toBe(200);
    expect(hidden.body.inheritedAcquisition).toBeUndefined(); // ④가 싣지 않는다
    expect(hidden.result.redevelopmentDetail.preApproval.apportionedAcquisition).toBe(40_000_000);
    expect(hidden.result.determinedTax).toBe(112_975_428);
    expect(hidden.result.determinedTax).toBe(plain.result.determinedTax);
  });

  it("R-2 의제취득일 전(1983) 재개발 · 기준시가 평가 — 상속 의제 입력을 싣고(PR-7b-4) 의제취득일 기준시가 × β = 4천만(남은 ① 2억이 실려도 기준시가 평가는 쓰지 않는다)", async () => {
    const over = { acquisitionDate: "1983-07-26", inheritanceStartDate: "1983-07-26", publishedValueAtInheritance: "200000000" };
    const r = await runCalc(apt(over));
    expect(r.status).toBe(200);
    // 종전(PR-7b-4 전)에는 재개발이 범위 밖이라 싣지 않았다. ④는 토지·주택(PR-7a)처럼 ①도 싣지만 기준시가 평가(Q-25)의 엔진은 deemed_std라 쓰지 않는다
    expect(r.body.inheritedAcquisition).toMatchObject({ mode: "pre-deemed", standardPriceAtDeemedDate: 100_000_000, reportedValue: 200_000_000 });
    expect(r.result.transferBurdenedGiftBreakdown.preDeemed).toEqual({ basis: "deemed_std", stdAtDeemed: 100_000_000 });
    expect(r.result.redevelopmentDetail.preApproval.apportionedAcquisition).toBe(40_000_000);
  });
});

describe("결함 R — API 직접 호출(④를 거치지 않음)", () => {
  it("R-3 body에 상속 의제(①2억)를 직접 실어도 엔진이 §159 안분값을 덮지 않는다", async () => {
    const f = Object.assign(createDefaultTransferFormData(), {
      transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
      assets: [{
        ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "redevelopment_apt", acquisitionCause: "inheritance",
        acquisitionDate: "2000-07-26", inheritanceStartDate: "2000-07-26", decedentAcquisitionDate: "1970-01-01",
        transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant",
        standardPriceAtTransfer: "1,500,000,000", standardPriceAtAcq: "100,000,000",
        redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "500,000,000",
        redevSettlementDirection: "pay", redevSettlementAmount: "200,000,000", redevPreApprovalExpenses: "10,000,000", redevPostApprovalExpenses: "5,000,000",
        redevCompletionDate: "2021-09-01", redevManagementDisposalHousingPrice: "400,000,000", redevAcquisitionHousingPrice: "300,000,000",
        redevActualAcquisitionPrice: "", useEstimatedAcquisition: false,
      } as AssetForm],
    }) as TransferFormData;
    const body = await captureBody(f);
    const injected = await postTransfer({
      ...body,
      inheritedAcquisition: {
        mode: "post-deemed", inheritanceStartDate: "2000-07-26", assetKind: "house_individual", reportedValue: 200_000_000,
        reportedMethod: "supplementary", useSupplementaryHelper: true, publishedValueAtInheritance: 200_000_000,
      },
    });
    expect(injected.status).toBe(200);
    expect(injected.result.redevelopmentDetail.preApproval.apportionedAcquisition).toBe(40_000_000);
    expect(injected.result.determinedTax).toBe(112_975_428);
  });
});

describe("주택 — 건물 슬롯", () => {
  it("H-1 1983 상속 단독주택 · 시가 · ① 3억 → ① × 0.5 = 150,000,000 (건물 슬롯)", async () => {
    const r = await calc({ ...MARKET, assetKind: "housing", inheritanceAssetKind: "house_individual", publishedValueAtInheritance: "300000000", householdNoOtherHousesConfirmed: true });
    expect(r.status).toBe(200);
    expect(r.bg.preDeemed.selected).toBe("reported");
    expect(r.bg.perAsset.building.acquisitionPrice).toBe(150_000_000);
    expect(r.bg.perAsset.land.acquisitionPrice).toBe(0);
  });
});

describe("공유지분 — ①은 지분분, ③은 지분분 증여가액으로 환산", () => {
  it("W-1 1/2 지분 · 채무 2.3억(지분 인수분) · ① 3억(물건 전체) → ① 1.5억 vs ③ 74,962,962 → 1.5억 × 0.5 = 75,000,000", async () => {
    const r = await calc({
      ...MARKET,
      publishedValueAtInheritance: "300000000",
      bgMortgageDebtAmount: "230000000",
      ownershipNumerator: "1",
      ownershipDenominator: "2",
    });
    expect(r.status).toBe(200);
    expect(r.bg.debtRatio).toBe(0.5);
    expect(r.bg.preDeemed).toMatchObject({ selected: "reported", reported: 150_000_000, converted: 74_962_962 });
    expect(r.bg.perAsset.land.acquisitionPrice).toBe(75_000_000);
  });
});
