/**
 * PR-7b-7a-1 — 겸용주택 × 부담부증여 × 증여자 상속·증여 취득(1985.1.1. 이후) — **화면 경로**(폼 → ⑧ → ④ body → route ⑫⑭ → 엔진).
 * 계획서 `docs/02-design/features/inheritance-pre-deemed-bg-pr7b.plan.md` §6 PR-7b-7a · 사용자 결정 Q-35(상속·증여 전체 지원).
 *
 * 시료(엔진 anchor F1의 화면 폼): 주택 100㎡·상가 100㎡ · 증여일 2024-03-01 · 시가 15억 · 담보차입금 6억(구분 불분명) ·
 * 양도시 개별주택가격 6억 · 상가 부수토지 5억 · 상가건물 1억 · 취득시 개별주택가격 3억 · 상가 부수토지 2.5억 · 상가건물 5천만. 세율은 mock.
 * 상속·증여 평가액은 주택분·상가분 3.5억씩(합계 7억) — 실지취득가액 7억 매매와 같은 금액이 되어야 한다(소령 §163⑨: 평가액 = 취득 당시 실지거래가액).
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

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MIXED: Loose = {
  addressJibun: "서울 강남구 테스트동 8-8",
  assetKind: "housing",
  acquisitionCause: "purchase",
  mixedAcqPerPartMode: false,
  acquisitionDate: "2010-03-15",
  isMixedUseHouse: true,
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000",
  mixedTransferLandPricePerSqm: "5000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferHousingBuildingStdPrice: "100000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000",
  mixedIsMetropolitanArea: true,
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1500000000",
  bgMortgageDebtAmount: "600000000",
  bgLendingDepositTotal: "0",
  bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "actual",
  bgActualAcquisitionTotal: "700000000",
  bgHousingAppraisalDeclared: "none",
  bgMortgageAttribution: "unallocated",
};
const INH: Loose = {
  acquisitionCause: "inheritance",
  inheritanceStartDate: "2010-03-15",
  decedentAcquisitionDate: "2000-01-01",
  bgAcquisitionMethod: "",
  bgActualAcquisitionTotal: "",
  mixedHousingInheritedValueOverride: "350000000",
  mixedCommercialInheritedValueOverride: "350000000",
};
const GIFT: Loose = {
  acquisitionCause: "gift",
  donorAcquisitionDate: "2000-01-01",
  giftDonorRelation: "lineal_ascendant",
  giftSameHousehold: "no",
  bgAcquisitionMethod: "",
  bgActualAcquisitionTotal: "",
  mixedHousingGiftValueOverride: "350000000",
  mixedCommercialGiftValueOverride: "350000000",
};
const STD: Loose = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "", bgActualAcquisitionTotal: "", bgHousingAppraisalDeclared: "" };
const CAPEX: Loose = { capitalExpenditure: "50000000", transferExpense: "10000000" };
/** 1995 상속 — §163⑨ 단서 구간(1985.1.1.~2005.4.29.) */
const Y1995: Loose = { acquisitionDate: "1995-03-15", inheritanceStartDate: "1995-03-15", decedentAcquisitionDate: "1980-01-01" };

const form = (over: Loose = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    assets: [{ ...makeDefaultAsset(1), ...MIXED, ...over } as AssetForm],
  }) as TransferFormData;

/** 세대 사실 확인(이 시료와 무관한 두 문항)을 뺀 ⑧ 이슈 */
const ownIssues = (f: TransferFormData) =>
  allIssues(f).filter((i: Loose) => !/다른 보유 주택이 없는지|분양권·입주권이 없는지/.test(i.message));

async function run(f: TransferFormData, patch?: (b: Loose) => void) {
  const issues = ownIssues(f);
  const body = (await captureBody(f)) as Loose;
  patch?.(body);
  const r = await postTransfer(body);
  const result = r.json?.data?.result;
  return {
    issues,
    body,
    status: r.status,
    fieldErrors: r.json?.error?.fieldErrors as Record<string, string[]> | undefined,
    tax: result?.total?.determinedTax as number | undefined,
    bg: result?.burdenedGift as Loose | undefined,
  };
}

const acqOf = (bg: Loose | undefined) =>
  ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"].map((k) => bg?.perPart?.[k]?.acquisitionPrice);

describe("PR-7b-7a-1 · 겸용 부담부증여 × 증여자 상속·증여 취득 — 화면 경로", () => {
  it("[S-0] 기준값: 매매 · 실지취득가액 7억 → 69,094,001 · 경비 있으면 62,345,201", async () => {
    const a = await run(form());
    expect(a.issues).toEqual([]);
    expect(a.status).toBe(200);
    expect(a.tax).toBe(69_094_001);
    const b = await run(form(CAPEX));
    expect(b.tax).toBe(62_345_201);
  });

  it("[S-1] 2010 상속 · 시가 · 평가액 3.5억씩 — 종전 ⑧ 취득원인 차단 → ⑧ 통과 · 200 · 69,094,001(실지 7억 매매와 같다) · deemedCause=inheritance", async () => {
    const r = await run(form(INH));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.tax).toBe(69_094_001);
    expect(r.bg?.acquisitionMethodUsed).toBe("actual");
    expect(r.bg?.deemedCause).toBe("inheritance");
    // 평가액 × 부분별 채무비율(6억/15억 = 0.4) — 주택 3.5억을 취득시 토지 2.5억 : 건물 5천만으로 나눈 뒤 × 0.4
    expect(acqOf(r.bg)).toEqual([116_666_666, 23_333_333, 116_666_666, 23_333_333]);
    // ④ — 평가액 두 칸을 싣고 산정방식·총액은 싣지 않는다
    expect(r.body.mixedUse.housingInheritedValue).toBe(350_000_000);
    expect(r.body.mixedUse.commercialInheritedValue).toBe(350_000_000);
    expect(r.body.burdenedGiftInfo.acquisitionMethod).toBeUndefined();
    expect(r.body.burdenedGiftInfo.actualAcquisitionTotal).toBeUndefined();
  });

  it("[S-2] 숨은 산정방식(환산)·실지 총액 값이 남아 있어도 싣지 않는다 — 같은 69,094,001 (stale 가드)", async () => {
    const r = await run(form({ ...INH, bgAcquisitionMethod: "converted", bgActualAcquisitionTotal: "900000000" }));
    expect(r.issues).toEqual([]);
    expect(r.body.burdenedGiftInfo.acquisitionMethod).toBeUndefined();
    expect(r.body.burdenedGiftInfo.actualAcquisitionTotal).toBeUndefined();
    expect(r.body.mixedUse.useActualAcquisition).toBe(false);
    expect(r.body.mixedUse.acquisitionActualTotalPrice).toBeUndefined();
    expect(r.tax).toBe(69_094_001);
  });

  it("[S-2b] 숨은 「실지」·총액 9억이 남아 있어도 겸용 취득 플래그·총액을 싣지 않는다 — 같은 69,094,001", async () => {
    const r = await run(form({ ...INH, bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "900000000" }));
    expect(r.issues).toEqual([]);
    expect(r.body.burdenedGiftInfo.acquisitionMethod).toBeUndefined();
    expect(r.body.burdenedGiftInfo.actualAcquisitionTotal).toBeUndefined();
    expect(r.body.mixedUse.useActualAcquisition).toBe(false);
    expect(r.body.mixedUse.acquisitionActualTotalPrice).toBeUndefined();
    expect(r.tax).toBe(69_094_001);
  });

  it("[S-3] 경비(자본적지출 5천만·양도비 1천만) — 실제 필요경비 × 부분별 채무비율 → 62,345,201(매매 실지와 같다)", async () => {
    const r = await run(form({ ...INH, ...CAPEX }));
    expect(r.issues).toEqual([]);
    expect(r.tax).toBe(62_345_201);
  });

  it("[S-4] 2010 증여 · 시가 → 69,094,001 · deemedCause=gift · 증여 평가액 칸을 싣는다", async () => {
    const r = await run(form(GIFT));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.tax).toBe(69_094_001);
    expect(r.bg?.deemedCause).toBe("gift");
    expect(r.body.mixedUse.housingInheritedValue).toBe(350_000_000);
  });

  it("[S-5] 평가액 미입력 — ⑧이 비어 있는 칸(상속 주택분 / 증여는 한 칸만 비면 상가분)으로 · API는 400(엔진 MB-11)", async () => {
    const r = await run(form({ ...INH, mixedHousingInheritedValueOverride: "", mixedCommercialInheritedValueOverride: "" }));
    expect(r.issues[0]?.field).toBe("mixedHousingInheritedValueOverride");
    expect(r.status).toBe(400);
    expect(r.fieldErrors?.["mixedUse.housingInheritedValue"]?.[0]).toMatch(/주택분·상가분 상증법 평가액/);
    const g = await run(form({ ...GIFT, mixedCommercialGiftValueOverride: "" }));
    expect(g.issues[0]?.field).toBe("mixedCommercialGiftValueOverride");
    expect(g.status).toBe(400);
  });

  it("[S-6] 2010 상속 · 기준시가 평가 → 60,939,200(매매 기준시가와 같다 — §159①1호 괄호) · 평가액은 싣지 않는다(숨은 값)", async () => {
    const r = await run(form({ ...INH, ...STD }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.tax).toBe(60_939_200);
    expect(r.bg?.acquisitionMethodUsed).toBe("standard_price");
    expect(r.bg?.deemedCause).toBeUndefined();
    expect(r.body.mixedUse.housingInheritedValue).toBeUndefined();
    const p = await run(form(STD));
    expect(p.tax).toBe(60_939_200);
  });

  it("[S-7] 1995 상속 · 시가 — §163⑨ 단서 구간은 계속 막는다(MB-18 · PR-7b-7a-2) · ⑧ 취득일 칸 · API 400", async () => {
    const r = await run(form({ ...INH, ...Y1995 }));
    expect(r.issues[0]?.field).toBe("acquisitionDate");
    expect(r.issues[0]?.message).toMatch(/제163조 제9항 단서/);
    expect(r.status).toBe(400);
  });

  it("[S-8] 1995 상속 · 기준시가 — 단서와 무관(§159①1호 괄호) → 200 · 56,516,000", async () => {
    const r = await run(form({ ...INH, ...Y1995, ...STD }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.tax).toBe(56_516_000);
  });

  it("[S-9] 1983 상속 — 의제취득일 전은 계속 막는다(MB-16 · PR-7b-7b) · ⑧이 「확인할 수 없음」 선언(겸용 화면에 없는 칸)을 먼저 요구하지 않는다", async () => {
    const r = await run(form({ ...INH, acquisitionDate: "1983-03-15", inheritanceStartDate: "1983-03-15", decedentAcquisitionDate: "1970-01-01" }));
    expect(r.issues[0]?.message).toMatch(/1985\.1\.1\. 전/);
    expect(r.status).toBe(400);
  });

  it("[S-10] ⑫ API 직접: 상속 취득에 매매사례가액 방식을 실으면 400(MB-8) — 산정방식 면제는 «없을 때»만이다", async () => {
    const r = await run(form(INH), (b) => {
      b.burdenedGiftInfo.acquisitionMethod = "salesCase";
      b.burdenedGiftInfo.presumedAcquisitionTotal = 500_000_000;
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.fieldErrors)).toMatch(/실지취득가액」으로 선택하세요/);
  });

  it("[S-12] ⑫ API 직접: 겸용 판정(propertyType)과 어긋난 body(겸용 플래그만 있고 propertyType=housing)는 산정방식 면제를 받지 않는다 — collector 트리거와 같은 조건", async () => {
    const r = await run(form(INH), (b) => {
      b.propertyType = "housing";
      delete b.burdenedGiftInfo.debtAttribution;
      delete b.burdenedGiftInfo.housingAppraisal;
    });
    expect(r.status).toBe(400);
    expect(r.fieldErrors?.["burdenedGiftInfo.acquisitionMethod"]?.[0]).toMatch(/취득가액 산정방식/);
  });

  it("[S-11] 이월과세·신축 취득은 계속 취득원인 칸으로 막는다", async () => {
    const r = await run(form({ acquisitionCause: "carryover_gift" }));
    expect(r.issues[0]?.field).toBe("acquisitionCause");
  });
});
