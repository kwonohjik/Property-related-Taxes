/**
 * PR-7b-4 — 의제취득일(1985.1.1.) 전 상속·증여 종전자산 × 재개발·재건축 완공 아파트(원조합원) × 부담부증여 (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §6).
 *
 * 사용자 결정: Q-24(시가 → max(①,②,③) × 채무비율) + Q-8 a(재개발 종전자산의 ③ = §166③) · Q-25(기준시가 → 의제취득일 기준시가 × 채무비율) ·
 *   Q-14(증여는 ① 필수) · Q-30(입주권은 범위 밖).
 * 종전(master f518d4d24)에는 재개발이 범위 밖이라 ④가 상속 의제 입력을 싣지 않고 §159가 사용자가 고른 산정방식 하나로 정했다
 * (실지 1억 16,242,413 · 실지 2억 9,245,083 · 환산 13,023,566 — ①②③과 무관하게 방식별 값).
 * §166③에는 양도가액 항이 없어 ③을 증여가액 C로 바꾸지 않는다 — 안분 전 전체 금액끼리 비교하고, 채택 뒤 §159가 고른 분기
 * (①② → 실지 · ③ → 환산)를 재개발 경로가 §166으로 β 안분한다. 그래서 세액이 종전 실지·환산 분기 값과 1원까지 같다.
 *
 * 화면 경로(폼 → ⑧ → ④ body → route ⑫⑭ → 엔진). 시료(계획서 §2.1 · PR-2 ⑧↔⑫ 시료와 같은 값): 1980 상속 종전주택 · 2026-02-16 부담부증여 ·
 * 인가 2009-10-23 · 평가액 219,218,500 · 인가일·취득당시 개별주택가격 132,000,000·85,034,988 → §166③ = 141,221,534.
 * 시가 평가 = 시가 525,000,000 · 채무 210,000,000(β 0.4). 기준시가 평가 = 양도시 400,000,000 · 채무 160,000,000(β 0.4). 세율은 mock.
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
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** route body·응답 탐색용 느슨한 타입(기존 anchor와 같은 관례) */
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const REDEV: Record<string, unknown> = {
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "redevelopment_apt",
  actualSalePrice: "525,000,000",
  redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2009-10-23",
  redevRightsValue: "219,218,500",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "92,781,500",
  redevCompletionDate: "2012-09-01",
  redevManagementDisposalHousingPrice: "132,000,000",
  redevAcquisitionHousingPrice: "85,034,988",
  acquisitionCause: "inheritance",
  acquisitionDate: "1980-01-01",
  inheritanceStartDate: "1980-01-01",
  decedentAcquisitionDate: "1970-01-01",
  inheritanceAssetKind: "house_individual",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  standardPriceAtTransfer: "400,000,000",
};
const MARKET = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "525,000,000", bgMortgageDebtAmount: "210,000,000" };
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "160,000,000", standardPriceAtAcq: "50,000,000" };
const EXPENSES = { redevPreApprovalExpenses: "30,000,000", redevPostApprovalExpenses: "20,000,000", capitalExpenditure: "150,000,000", transferExpense: "10,000,000" };
const NO_166_3 = { redevAcquisitionHousingPrice: "", redevManagementDisposalHousingPrice: "" };

const form = (a: Record<string, unknown>): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16",
    filingDate: "2026-04-30",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    contractTotalPrice: "525000000",
    assets: [{ ...makeDefaultAsset(1), ...REDEV, ...a } as AssetForm],
  }) as TransferFormData;

async function run(a: Record<string, unknown>) {
  const f = form(a);
  const issues = allIssues(f);
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  const res = r.result as Loose | undefined;
  const bg = res?.transferBurdenedGiftBreakdown;
  return {
    issues,
    fields: issues.map((i: { field?: string }) => i.field),
    body,
    status: r.status,
    tax: res?.determinedTax as number | undefined,
    bg,
    acq: bg ? bg.perAsset.land.acquisitionPrice + bg.perAsset.building.acquisitionPrice : undefined,
    preApprovalAcq: res?.redevelopmentDetail?.preApproval?.apportionedAcquisition as number | undefined,
  };
}

describe("PR-7b-4 재개발 완공 아파트 × 의제취득일 전 × 부담부증여 · 시가 평가 (3자 max · ③ = §166③)", () => {
  it("M-1 ① 2억 > ③ 141,221,534 → ① 채택 × 0.4 = 8천만 · 9,245,083 (종전 실지 2억과 같다) · 산정방식 미전송 · §166③ 칸 전송", async () => {
    const r = await run({ ...MARKET, publishedValueAtInheritance: "200,000,000" });
    expect(r.issues).toEqual([]);
    expect(r.body.burdenedGiftInfo.acquisitionMethod).toBeUndefined();
    expect(r.body.useEstimatedAcquisition).toBe(true);
    expect(r.body.inheritedAcquisition).toMatchObject({ mode: "pre-deemed", reportedValue: 200_000_000 });
    expect(r.bg.preDeemed).toMatchObject({ basis: "three_way", reported: 200_000_000, converted: 141_221_534, selected: "reported", wholeAcquisition: 200_000_000 });
    expect(r.acq).toBe(80_000_000);
    expect(r.preApprovalAcq).toBe(80_000_000);
    expect(r.tax).toBe(9_245_083);
  });

  it("M-2 ① 1억 < ③ → ③(§166③) 채택 · 재개발 경로가 평가액 × β로 §166③ = 56,488,613 · 13,023,566 (종전 환산과 같다)", async () => {
    const r = await run({ ...MARKET, publishedValueAtInheritance: "100,000,000" });
    expect(r.issues).toEqual([]);
    expect(r.bg.preDeemed.selected).toBe("converted");
    expect(r.bg.acquisitionMethodUsed).toBe("converted");
    expect(r.preApprovalAcq).toBe(56_488_613);
    expect(r.tax).toBe(13_023_566);
  });

  it("M-3 ① 없이 「확인할 수 없음」 선언 → ③ · 13,023,566", async () => {
    const r = await run({ ...MARKET, preDeemedClauseAUnconfirmed: true });
    expect(r.issues).toEqual([]);
    expect(r.bg.preDeemed).toMatchObject({ reported: null, selected: "converted" });
    expect(r.tax).toBe(13_023_566);
  });

  it("M-4 ①도 선언도 없으면 ⑧ E-1 차단", async () => {
    const r = await run({ ...MARKET });
    expect(r.fields).toContain("preDeemedClauseAUnconfirmed");
  });

  it("M-5 §166③ 칸이 비면 ①이 있어도 ⑧·⑫ 모두 막는다(③은 늘 비교 후보)", async () => {
    const r = await run({ ...MARKET, publishedValueAtInheritance: "200,000,000", ...NO_166_3 });
    expect(r.fields).toContain("redevManagementDisposalHousingPrice");
    expect(r.status).toBe(400);
  });

  it("M-6 경비 — ③ 채택은 종전 환산과, ① 채택은 종전 실지와 1원까지 같다(3,759,728 · 481,644)", async () => {
    const conv = await run({ ...MARKET, preDeemedClauseAUnconfirmed: true, ...EXPENSES });
    const purchaseConv = await run({ ...MARKET, acquisitionCause: "purchase", bgAcquisitionMethod: "converted", ...EXPENSES });
    const rep = await run({ ...MARKET, publishedValueAtInheritance: "200,000,000", ...EXPENSES });
    const purchaseActual = await run({ ...MARKET, acquisitionCause: "purchase", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200,000,000", ...EXPENSES });
    expect([conv.issues, rep.issues]).toEqual([[], []]);
    expect(conv.tax).toBe(3_759_728);
    expect(conv.tax).toBe(purchaseConv.tax);
    expect(rep.tax).toBe(481_644);
    expect(rep.tax).toBe(purchaseActual.tax);
  });

  it("M-7 남은 실지취득가액(1억)·산정방식은 읽지 않는다 — ① 2억 채택 9,245,083", async () => {
    const r = await run({ ...MARKET, publishedValueAtInheritance: "200,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100,000,000" });
    expect(r.issues).toEqual([]);
    expect(r.body.burdenedGiftInfo.acquisitionMethod).toBeUndefined();
    expect(r.tax).toBe(9_245_083);
  });

  it("G-1 증여 · ① 없음 → ⑧ 증여 신고가액 요구(Q-14) / G-2 ① 2억 → 9,245,083", async () => {
    const gift = { acquisitionCause: "gift", donorAcquisitionDate: "1970-01-01", giftDonorRelation: "spouse", giftSameHousehold: "no", inheritanceStartDate: "" };
    const none = await run({ ...MARKET, ...gift });
    expect(none.fields).toContain("fixedAcquisitionPrice");
    const rep = await run({ ...MARKET, ...gift, fixedAcquisitionPrice: "200,000,000" });
    expect(rep.issues).toEqual([]);
    expect(rep.bg.preDeemed.selected).toBe("reported");
    expect(rep.tax).toBe(9_245_083);
  });
});

describe("PR-7b-4 · 기준시가 평가 (의제취득일 기준시가 × 채무비율)", () => {
  it("S-1 칸 5천만 → deemed_std · 2천만 · 10,824,283 · E-1 선언을 요구하지 않는다(종전 같은 값 — E-1 요구)", async () => {
    const r = await run({ ...STD });
    expect(r.issues).toEqual([]);
    expect(r.body.inheritedAcquisition).toMatchObject({ mode: "pre-deemed", standardPriceAtDeemedDate: 50_000_000 });
    expect(r.bg.preDeemed).toEqual({ basis: "deemed_std", stdAtDeemed: 50_000_000 });
    expect(r.acq).toBe(20_000_000);
    expect(r.tax).toBe(10_824_283);
  });

  it("S-2 칸 7천만 → 2,800만 · 9,439,963", async () => {
    const r = await run({ ...STD, standardPriceAtAcq: "70,000,000" });
    expect(r.issues).toEqual([]);
    expect(r.acq).toBe(28_000_000);
    expect(r.tax).toBe(9_439_963);
  });

  it("S-3 칸이 비면 ⑧이 의제취득일 기준시가를 요구하고 엔진도 400", async () => {
    const r = await run({ ...STD, standardPriceAtAcq: "" });
    expect(r.fields).toContain("standardPriceAtAcq");
    expect(r.status).toBe(400);
  });

  it("S-4 시가 평가 · 담보 승(채무 > 시가) → §159①1호 괄호 — 의제취득일 기준시가 × 1 · §166③ 칸 미전송", async () => {
    const r = await run({ ...MARKET, bgMortgageDebtAmount: "600,000,000", publishedValueAtInheritance: "200,000,000", standardPriceAtAcq: "50,000,000" });
    expect(r.issues).toEqual([]);
    expect(r.body.useEstimatedAcquisition).toBe(false);
    expect(r.bg.preDeemed).toEqual({ basis: "deemed_std", stdAtDeemed: 50_000_000 });
    expect(r.acq).toBe(50_000_000);
  });
});

describe("PR-7b-4 · 범위 밖은 종전 그대로", () => {
  it("B-1 입주권(Q-30) — 상속 의제 입력을 싣지 않고 K-4 실지 · 25,188,413", async () => {
    const r = await run({ ...MARKET, assetKind: "right_to_move_in", redevSubject: "right", preDeemedClauseAUnconfirmed: true, bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100,000,000" });
    expect(r.body.inheritedAcquisition).toBeUndefined();
    expect(r.bg.preDeemed).toBeUndefined();
    expect(r.tax).toBe(25_188_413);
  });

  it("B-2 1990 상속 — 범위 밖 · 고른 환산 13,023,566 (상속은 환산을 막는 ⑧ 그대로)", async () => {
    const r = await run({ ...MARKET, acquisitionDate: "1990-01-01", inheritanceStartDate: "1990-01-01", publishedValueAtInheritance: "200,000,000", bgAcquisitionMethod: "converted" });
    expect(r.body.inheritedAcquisition).toBeUndefined();
    expect(r.fields).toContain("bgAcquisitionMethod");
    expect(r.tax).toBe(13_023_566);
  });

  it("B-3 승계조합원 — §166 밖이라 범위 밖(상속 의제 입력 미전송)", async () => {
    const r = await run({ ...MARKET, redevIsSuccessorMember: "yes", publishedValueAtInheritance: "200,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100,000,000" });
    expect(r.body.inheritedAcquisition).toBeUndefined();
  });
});

describe("PR-7b-4 · 리뷰 게이트 반영 (F-1 컴패니언 · F-2 입주권 엔진 가드 · 경계)", () => {
  /** 주 자산 = 매매 주택(실지 1억) · 컴패니언 = 재개발 — 같은 묶음에서 의제 컴패니언과 매매 컴패니언(K-4·K-5)을 나란히 잰다 */
  const HOUSING = {
    addressJibun: "서울 A 1", assetKind: "housing", actualSalePrice: "300,000,000", acquisitionCause: "purchase", acquisitionDate: "2000-01-01",
    transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "300,000,000",
    bgMortgageDebtAmount: "120,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100,000,000", standardPriceAtTransfer: "200,000,000",
  };
  async function bundle(rd: Record<string, unknown>) {
    const f = Object.assign(createDefaultTransferFormData(), {
      transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "825000000",
      assets: [
        { ...makeDefaultAsset(1), ...HOUSING } as AssetForm,
        { ...makeDefaultAsset(2), ...REDEV, ...MARKET, addressJibun: "서울 B 2", ...rd } as AssetForm,
      ],
    }) as TransferFormData;
    const fields = allIssues(f).map((i: { field?: string }) => i.field);
    const body = (await captureBody(f)) as Loose;
    const r = await postTransfer(body);
    const comp = r.json?.data?.aggregated?.properties?.[1];
    return { fields, status: r.status, companion: body.companionAssets?.[0], total: r.json?.data?.aggregated?.determinedTax, compTax: comp?.determinedTax };
  }

  it("C-1 컴패니언 · ① 2억 — ⑧ 통과 → 200(종전 400 막다른 길) · 매매 K-4 실지 2억 컴패니언과 같다(9,245,083 · 묶음 26,042,413)", async () => {
    const pd = await bundle({ publishedValueAtInheritance: "200,000,000" });
    const buy = await bundle({ acquisitionCause: "purchase", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200,000,000" });
    expect(pd.fields).toEqual([]);
    expect(pd.status).toBe(200);
    expect(pd.companion.inheritedAcquisition).toMatchObject({ mode: "pre-deemed", reportedValue: 200_000_000 });
    expect(pd.companion.useEstimatedAcquisition).toBe(true);
    expect([pd.compTax, pd.total]).toEqual([9_245_083, 26_042_413]);
    expect([pd.compTax, pd.total]).toEqual([buy.compTax, buy.total]);
  });

  it("C-2 컴패니언 · ① 1억 → ③ §166③ — 매매 K-5 컴패니언과 같다(13,023,566 · 묶음 31,552,700) · ③ 후보가 실린다(useEstimatedAcquisition)", async () => {
    const pd = await bundle({ publishedValueAtInheritance: "100,000,000" });
    const buy = await bundle({ acquisitionCause: "purchase", bgAcquisitionMethod: "converted" });
    expect(pd.fields).toEqual([]);
    expect([pd.compTax, pd.total]).toEqual([13_023_566, 31_552_700]);
    expect([pd.compTax, pd.total]).toEqual([buy.compTax, buy.total]);
  });

  it("C-3 컴패니언 · ①·선언 없음 → ⑧ E-1 / 컴패니언 · 비의제(1990 상속) 재개발은 상속 의제 입력을 싣지 않는다(종전)", async () => {
    expect((await bundle({})).fields).toContain("preDeemedClauseAUnconfirmed");
    const out = await bundle({ acquisitionDate: "1990-01-01", inheritanceStartDate: "1990-01-01", publishedValueAtInheritance: "200,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200,000,000" });
    expect(out.companion.inheritedAcquisition).toBeUndefined();
    expect(out.companion.useEstimatedAcquisition).toBeUndefined();
  });

  it("F-2 입주권 · API에 의제 입력(① 3억)을 직접 실어도 엔진이 3자 max로 받지 않는다 — K-4 25,188,413 그대로", async () => {
    const f = form({ ...MARKET, assetKind: "right_to_move_in", redevSubject: "right", preDeemedClauseAUnconfirmed: true, bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100,000,000" });
    const body = (await captureBody(f)) as Loose;
    const ia = { mode: "pre-deemed", inheritanceStartDate: "1980-01-01", assetKind: "house_individual", reportedValue: 300_000_000 };
    for (const extra of [{ inheritedAcquisition: ia }, { inheritedAcquisition: ia, useEstimatedAcquisition: true }]) {
      const r = await postTransfer({ ...body, ...extra });
      expect(r.status).toBe(200);
      expect(r.result?.transferBurdenedGiftBreakdown?.preDeemed).toBeUndefined();
      expect(r.result?.determinedTax).toBe(25_188_413);
    }
  });

  it("F-2b 승계조합원 · 의제 입력 + 산정방식 없음 → ⑫ 400 산정방식(§166 밖 — 면제 아님)", async () => {
    const f = form({ ...MARKET, redevIsSuccessorMember: "yes", acquisitionPrice: "100,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100,000,000" });
    const body = (await captureBody(f)) as Loose;
    const r = await postTransfer({
      ...body,
      inheritedAcquisition: { mode: "pre-deemed", inheritanceStartDate: "1980-01-01", assetKind: "house_individual", reportedValue: 200_000_000 },
      burdenedGiftInfo: { ...body.burdenedGiftInfo, acquisitionMethod: undefined },
    });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json?.error?.fieldErrors ?? {})).toContain("burdenedGiftInfo.acquisitionMethod");
  });

  it("T-1 동점 ① = ③(141,221,534) → ①(실지 의제) 채택", async () => {
    const r = await run({ ...MARKET, publishedValueAtInheritance: "141,221,534" });
    expect(r.issues).toEqual([]);
    expect(r.bg.preDeemed).toMatchObject({ reported: 141_221_534, converted: 141_221_534, selected: "reported" });
    expect(r.bg.acquisitionMethodUsed).toBe("actual");
  });

  it("G-3 증여 · ① 1억 < ③ → ③(§166③) 채택 13,023,566", async () => {
    const r = await run({ ...MARKET, acquisitionCause: "gift", donorAcquisitionDate: "1970-01-01", giftDonorRelation: "spouse", giftSameHousehold: "no", inheritanceStartDate: "", fixedAcquisitionPrice: "100,000,000" });
    expect(r.issues).toEqual([]);
    expect(r.bg.preDeemed.selected).toBe("converted");
    expect(r.tax).toBe(13_023_566);
  });
});
