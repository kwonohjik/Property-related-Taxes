/**
 * 의제취득일(1985.1.1.) 전 상속·증여 상가 — ③ 환산취득가액의 분자 = §164⑥ 취득당시 기준시가
 * (사용자 결정 2026-10-24 A안 · 계획서 `commercial-pre-deemed-converted-numerator.plan.md`).
 *
 * 종전(master 2c12dbc49)에는 ②가 §164⑥ 값이고 ③의 분자는 「의제취득일 기준시가」 칸 값이었다 — 같은 건물·같은 1985년에 기준시가가 둘이었다.
 * 칸을 비우면 ③이 조용히 0이 됐고(G3), 양도시 기준시가를 비워도 ①② 원천이 있으면 통과해 ③이 0이 됐다(V-1).
 *
 * 화면 경로(폼 → ⑧ → ④ body → route ⑫⑭ → 엔진). 시료: 1983-07-26 상속 상가 · 2023-02-16 양도 · 양도가액(부담부증여 시가) 920,000,000 ·
 * ① 300,000,000 · 칸 200,000,000 · §164⑥ 8칸 = 509,090,909(PR-7b-1 anchor와 같은 값). 세율은 mock.
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
import { preDeemedExprFacts } from "@/lib/calc/expropriation-pre-deemed-facts";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Obj = Record<string, unknown>;
const CB: Obj = {
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "commercial_building",
  acquisitionCause: "inheritance",
  acquisitionDate: "1983-07-26",
  inheritanceStartDate: "1983-07-26",
  decedentAcquisitionDate: "1970-01-01",
  transferType: "regular",
  actualSalePrice: "920000000",
  standardPriceAtTransfer: "600000000",
  standardPriceAtAcq: "200000000",
  publishedValueAtInheritance: "300000000",
};
/** §164⑥ 8칸 + §164⑤ 준용 확인 — 취득당시 기준시가 509,090,909 */
const CB8: Obj = {
  cbExclusiveArea: "50",
  cbSharedArea: "20",
  cbLandArea: "100",
  cbUnitPriceAtFirstOrAcq: "10000000",
  cbLandPricePerSqmAtAcq: "500000",
  cbLandPricePerSqmAtFirst: "700000",
  cbBuildingStdPriceAtAcq: "30000000",
  cbBuildingStdPriceAtFirst: "40000000",
  cbAcqBuildingStdBy164_5: true,
};
const BG_MARKET: Obj = {
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0",
  bgMortgageDebtAmount: "460000000",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "920000000",
  actualSalePrice: "",
};
const BG_STANDARD: Obj = { ...BG_MARKET, bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "200000000", bgMarketValueAtTransfer: "" };
const V1_MESSAGE = /§164⑥ 취득당시 기준시가로 환산취득가액도 비교합니다/;

const asset = (over: Obj): AssetForm => ({ ...makeDefaultAsset(1), ...CB, ...over }) as AssetForm;
const form = (over: Obj): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16",
    filingDate: "2023-04-30",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    ...(over.transferType === "burdened_gift" ? {} : { contractTotalPrice: "920000000" }),
    assets: [asset(over)],
  }) as TransferFormData;

async function run(over: Obj) {
  const f = form(over);
  const issues = allIssues(f);
  const body = await captureBody(f);
  const r = await postTransfer(body);
  const res = r.result ?? {};
  const bg = res.transferBurdenedGiftBreakdown;
  return {
    issues,
    body,
    status: r.status,
    json: r.json,
    tax: res.determinedTax as number | undefined,
    pre: res.inheritedAcquisitionDetail?.preDeemedBreakdown as
      | { convertedAmount: number; sec164Amount: number | null; selectedMethod: string }
      | undefined,
    bg,
    bgAcq: bg ? (bg.perAsset.land.acquisitionPrice + bg.perAsset.building.acquisitionPrice as number) : undefined,
  };
}
const sentIa = (body: Obj) => body.inheritedAcquisition as Obj | undefined;

describe("일반 양도 — ③의 분자가 §164⑥ 값이다", () => {
  it("N-1 양도시 6억 · 칸 2억 · 8칸 → ③ 780,606,060(920M × 509,090,909 ÷ 6억) 채택 · 14,492,364 (종전 ③ 306,666,666 · ② 채택 · 88,411,818)", async () => {
    const r = await run(CB8);
    expect(r.issues).toEqual([]);
    expect(sentIa(r.body)?.standardPriceAtDeemedDate).toBeUndefined(); // ④는 칸 값을 싣지 않는다 — 엔진이 같은 자동값을 주입
    expect(r.pre).toMatchObject({ convertedAmount: 780_606_060, sec164Amount: 509_090_909, selectedMethod: "converted" });
    expect(r.tax).toBe(14_492_364);
  });

  it("N-2 N-1 + 자본적지출 3억 → ③ 채택 · 개산공제(509,090,909 × 3%) · 14,492,364 (종전 ② 채택 · 실제 경비 · 12,272,727 — Q-1=C와 §97②2호 단서의 결과)", async () => {
    const r = await run({ ...CB8, capitalExpenditure: "300000000" });
    expect(r.issues).toEqual([]);
    expect(r.pre?.selectedMethod).toBe("converted");
    expect(r.tax).toBe(14_492_364);
  });

  it("N-3 칸을 비워도 ③이 계산된다 — 양도시 4억 → ③ 1,170,909,090 · 0 (종전 ③ 0 침묵 소실 · ② 채택 · 88,411,818)", async () => {
    const r = await run({ ...CB8, standardPriceAtAcq: "", standardPriceAtTransfer: "400000000" });
    expect(r.issues).toEqual([]);
    expect(r.pre).toMatchObject({ convertedAmount: 1_170_909_090, selectedMethod: "converted" });
    expect(r.tax).toBe(0);
  });

  it("N-4 증여 상가도 같다 — ① 3억 · 8칸 · 양도시 6억 → ③ 780,606,060 채택", async () => {
    const r = await run({
      ...CB8,
      acquisitionCause: "gift",
      inheritanceStartDate: "",
      donorAcquisitionDate: "1975-01-01",
      publishedValueAtInheritance: "",
      fixedAcquisitionPrice: "300000000",
    });
    expect(r.issues).toEqual([]);
    expect(r.pre).toMatchObject({ convertedAmount: 780_606_060, selectedMethod: "converted" });
  });

  it("N-5 직접 입력 토글을 켜면 칸 값이 ③의 분자다(주택·토지와 같은 규약) — ③ 306,666,666 · ② 채택 · 88,411,818", async () => {
    const r = await run({ ...CB8, useStandardPriceAtAcqOverride: true });
    expect(r.issues).toEqual([]);
    expect(sentIa(r.body)?.standardPriceAtDeemedDate).toBe(200_000_000);
    expect(r.pre).toMatchObject({ convertedAmount: 306_666_666, selectedMethod: "sec164" });
    expect(r.tax).toBe(88_411_818);
  });

  it("N-6 API로 칸 값과 §164⑥을 함께 보내면 칸 값이 분자다(보낸 분자 우선) · 칸 값을 빼면 §164⑥", async () => {
    const body = await captureBody(form(CB8));
    const withStd = await postTransfer({ ...body, inheritedAcquisition: { ...sentIa(body), standardPriceAtDeemedDate: 200_000_000 } });
    expect(withStd.result?.inheritedAcquisitionDetail?.preDeemedBreakdown?.convertedAmount).toBe(306_666_666);
    const without = await postTransfer(body);
    expect(without.result?.inheritedAcquisitionDetail?.preDeemedBreakdown?.convertedAmount).toBe(780_606_060);
  });
});

describe("공유지분", () => {
  it("W-1 API 직접 지분 1/2 — ③ = 지분 양도가액 920,000,000 × 509,090,909 ÷ 6억 = 780,606,060(분자·분모 모두 물건 전체라 비율만 곱한다) · ② = 509,090,909 × 1/2 = 254,545,454 — 둘 다 지분 몫", async () => {
    const body = await captureBody(form(CB8));
    const r = await postTransfer({ ...body, ownershipRatio: 0.5 });
    expect(r.status).toBe(200);
    expect(r.result?.inheritedAcquisitionDetail?.preDeemedBreakdown).toMatchObject({ convertedAmount: 780_606_060, sec164Amount: 254_545_454, selectedMethod: "converted" });
  });
});

describe("대조군 — 바뀌지 않는다", () => {
  it("C-1 8칸 없음 → 칸 값이 분자 · ③ 306,666,666 · 143,113,333 · ④가 칸 값을 싣는다", async () => {
    const r = await run({});
    expect(r.issues).toEqual([]);
    expect(sentIa(r.body)?.standardPriceAtDeemedDate).toBe(200_000_000);
    expect(r.pre).toMatchObject({ convertedAmount: 306_666_666, selectedMethod: "converted" });
    expect(r.tax).toBe(143_113_333);
  });

  it("C-2 1995 상속(의제취득일 이후) — ③ 비교가 없다 · ② 509,090,909 · 88,411,818", async () => {
    const r = await run({ ...CB8, acquisitionDate: "1995-07-26", inheritanceStartDate: "1995-07-26" });
    expect(r.issues).toEqual([]);
    expect(r.pre).toBeUndefined();
    expect(r.tax).toBe(88_411_818);
  });

  it("C-3 비주택 건물(building) — 이 화면에는 §164⑥ 입력이 없어 칸 값 그대로(③ 306,666,666)", async () => {
    const r = await run({ ...CB8, assetKind: "building" });
    expect(r.issues).toEqual([]);
    expect(r.body.commercialInheritanceValuation).toBeUndefined();
    expect(r.pre?.convertedAmount).toBe(306_666_666);
  });
});

describe("부담부증여", () => {
  it("B-1 시가 평가 · 양도시 6억 · 칸 2억 · 8칸 → ③ 780,606,060 채택 × 0.5 = 390,303,030 · 4,881,363 (종전 ② × 0.5 = 254,545,454 · 34,021,364)", async () => {
    const r = await run({ ...BG_MARKET, ...CB8 });
    expect(r.issues).toEqual([]);
    expect(r.bg?.preDeemed).toMatchObject({ selected: "converted", converted: 780_606_060, sec164: 509_090_909, stdAtDeemed: 509_090_909 });
    expect(r.bgAcq).toBe(390_303_030);
    expect(r.tax).toBe(4_881_363);
  });

  it("B-4 시가 평가 · 직접 입력 토글 ON — ③ 분자 칸 값 306,666,666 · ② 채택 × 0.5 = 254,545,454 · echo 의제취득일 기준시가도 칸 값 200,000,000 (리뷰 R-1 — 고치기 전에는 echo·개산공제 base가 §164⑥ 509,090,909로 ③과 갈렸다)", async () => {
    const r = await run({ ...BG_MARKET, ...CB8, useStandardPriceAtAcqOverride: true });
    expect(r.issues).toEqual([]);
    expect(r.bg?.preDeemed).toMatchObject({ selected: "sec164", converted: 306_666_666, stdAtDeemed: 200_000_000 });
    expect(r.bgAcq).toBe(254_545_454);
    expect(r.tax).toBe(34_021_364);
  });

  it("B-2 기준시가 평가 — 종전과 같다(Q-27 · 양도시 4억 · §164⑥ 509,090,909 × 0.5 = 254,545,454 · 종전 실측 같은 값)", async () => {
    const r = await run({ ...BG_STANDARD, ...CB8, standardPriceAtTransfer: "400000000" });
    expect(r.issues).toEqual([]);
    expect(r.bg?.preDeemed).toMatchObject({ basis: "deemed_std", stdAtDeemed: 509_090_909 });
    expect(r.bgAcq).toBe(254_545_454);
  });

  it("B-3 기준시가 평가는 ③이 없어 양도시 기준시가 가드(V-1)를 걸지 않는다 — ⑧·⑫ 모두", async () => {
    expect(allIssues(form({ ...BG_STANDARD, ...CB8, standardPriceAtTransfer: "" })).some((i) => V1_MESSAGE.test(i.message))).toBe(false);
    const f = form({ ...BG_STANDARD, ...CB8 });
    const body = await captureBody(f);
    const ia = { ...sentIa(body) };
    delete ia.standardPriceAtTransfer;
    const r = await postTransfer({ ...body, inheritedAcquisition: ia, standardPriceAtTransfer: undefined });
    expect(JSON.stringify(r.json)).not.toMatch(V1_MESSAGE);
  });
});

describe("V-1 — 양도시 기준시가가 없으면 ③이 조용히 0이 되던 것을 막는다", () => {
  it("V-1 일반 양도 · ① + 8칸 · 양도시 비움 → ⑧ standardPriceAtTransfer (종전 통과 · ③ 0 · 88,411,818)", async () => {
    const r = await run({ ...CB8, standardPriceAtTransfer: "" });
    expect(r.issues.map((i) => i.field)).toEqual(["standardPriceAtTransfer"]);
    expect(r.issues[0].message).toMatch(V1_MESSAGE);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toMatch(V1_MESSAGE);
  });

  it("V-2 부담부증여 시가 · 양도시 비움 → ⑧·⑫ 같은 가드 (종전 통과 · 34,021,364)", async () => {
    const r = await run({ ...BG_MARKET, ...CB8, standardPriceAtTransfer: "" });
    expect(r.issues.map((i) => i.field)).toEqual(["standardPriceAtTransfer"]);
    expect(r.status).toBe(400);
  });

  it("V-3 ⑫ API 직접 — 양도시 기준시가를 지우면 400 · 경로 inheritedAcquisition.standardPriceAtTransfer", async () => {
    const body = await captureBody(form(CB8));
    const ia = { ...sentIa(body) };
    delete ia.standardPriceAtTransfer;
    const r = await postTransfer({ ...body, inheritedAcquisition: ia, standardPriceAtTransfer: undefined });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("inheritedAcquisition.standardPriceAtTransfer");
  });

  it("V-4 8칸이 없으면 이 가드는 걸지 않는다(①만 · 양도시 비움 — 종전과 같다)", async () => {
    const r = await run({ standardPriceAtTransfer: "" });
    expect(r.issues.some((i) => V1_MESSAGE.test(i.message))).toBe(false);
  });
});

describe("함께 양도 카드 · 공익수용", () => {
  const land = {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 2-2",
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-01-01",
    transferType: "regular",
    actualSalePrice: "500000000",
    fixedAcquisitionPrice: "300000000",
    acquisitionArea: "100",
    transferArea: "100",
    landNature: "standalone",
    standardPriceAtTransfer: "400000000",
  } as unknown as AssetForm;
  const bundle = (over: Obj) =>
    Object.assign(createDefaultTransferFormData(), {
      transferDate: "2023-02-16",
      filingDate: "2023-04-30",
      householdHousingCount: "0",
      isOneHousehold: false,
      contractTotalPrice: "1420000000",
      assets: [land, { ...makeDefaultAsset(2), ...CB, ...CB8, ...over } as unknown as AssetForm],
    }) as TransferFormData;

  it("K-1 함께 양도 상가 — 자동값이면 ③ 722,909,090(안분 양도가액 × 509,090,909 ÷ 6억) · 직접 입력이면 284,000,000(칸 2억)", async () => {
    const auto = bundle({});
    expect(allIssues(auto)).toEqual([]);
    const autoBody = await captureBody(auto);
    const c = (autoBody.companionAssets as Obj[])[0];
    expect((c.inheritedAcquisition as Obj).standardPriceAtDeemedDate).toBeUndefined();
    expect(c.commercialInheritanceValuation).toBeDefined();
    expect(JSON.stringify((await postTransfer(autoBody)).json)).toContain('"convertedAmount":722909090');
    const manual = await captureBody(bundle({ useStandardPriceAtAcqOverride: true }));
    expect(JSON.stringify((await postTransfer(manual)).json)).toContain('"convertedAmount":284000000');
  });

  it("K-2 ⑫ 함께 양도 상가 — 양도시 기준시가를 지우면 400(컴패니언 경로)", async () => {
    const body = await captureBody(bundle({}));
    const comps = (body.companionAssets as Obj[]).map((c) => {
      const ia = { ...(c.inheritedAcquisition as Obj) };
      delete ia.standardPriceAtTransfer;
      return { ...c, inheritedAcquisition: ia, standardPriceAtTransfer: undefined };
    });
    const r = await postTransfer({ ...body, companionAssets: comps });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toMatch(V1_MESSAGE);
  });

  it("E-1 공익수용 ③ 후보 — 칸을 비우고 8칸만 채워도 ③이 계산되므로 후보다(④가 칸 값을 빼도 질문이 닫히지 않는다)", () => {
    expect(preDeemedExprFacts(asset({ ...CB8, standardPriceAtAcq: "" }), "2023-02-16", false)).toMatchObject({ preDeemedConversion: true });
    expect(preDeemedExprFacts(asset({ ...CB8 }), "2023-02-16", false)).toMatchObject({ preDeemedConversion: true });
    expect(preDeemedExprFacts(asset({ standardPriceAtAcq: "" }), "2023-02-16", false)).toMatchObject({ preDeemedConversion: false });
  });
});
