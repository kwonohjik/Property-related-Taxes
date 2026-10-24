/**
 * PR-7b-7b — 겸용주택 × 부담부증여 × 증여자가 의제취득일(1985.1.1.) 전에 상속·증여로 취득 — **화면 경로**.
 * 계획서 `docs/02-design/features/inheritance-pre-deemed-bg-pr7b.plan.md` §6 PR-7b-7b · 사용자 결정 Q-31 · Q-36 · Q-37 · R-1(2026-10-24).
 *
 * 시료: 주택 100㎡·상가 100㎡ · 증여일 2024-03-01 · 양도시 개별주택가격 6억 · 상가 부수토지 5억 · 상가건물 1억 · 담보차입금 6억(구분 불분명). 세율은 mock.
 *   시가 15억 → 주택분·상가분 증여가액 7.5억씩(기준시가 비례) · 채무비율 0.4씩.
 *   ② = 주택 §164⑦ 128,048,780(최초 고시 2005-04-30 · 의제취득일 공시지가 80만 · 건물 2,500만) + 상가 (100㎡ × 80만 + 3천만) 1.1억 = 238,048,780
 *   ③ = 7.5억 × 의제취득일 기준시가 ÷ 양도시 기준시가 — 주택 160,060,974(부분별 절사 합) + 상가 137,500,000 = 297,560,974
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
  mixedAcqPerPartMode: false,
  isMixedUseHouse: true,
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000",
  mixedTransferLandPricePerSqm: "5000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferHousingBuildingStdPrice: "100000000",
  mixedIsMetropolitanArea: true,
  acquisitionCause: "inheritance",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1500000000",
  bgMortgageDebtAmount: "600000000",
  bgLendingDepositTotal: "0",
  bgDonorRelation: "lineal_descendant",
  bgHousingAppraisalDeclared: "none",
  bgMortgageAttribution: "unallocated",
  bgAcquisitionMethod: "",
};
const RV = (h: string, c: string): Loose => ({ mixedHousingInheritedValueOverride: h, mixedCommercialInheritedValueOverride: c });

const form = (over: Loose = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    assets: [{ ...makeDefaultAsset(1), ...MIXED, ...over } as AssetForm],
  }) as TransferFormData;

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
    housingAcq: result?.housingPart?.estimatedAcquisitionPrice as number | undefined,
    commercialAcq: result?.commercialPart?.estimatedAcquisitionPrice as number | undefined,
    cmp: result?.sec163_9Comparison as Loose | undefined,
    bg: result?.burdenedGift as Loose | undefined,
  };
}

const beforeRatio = (bg: Loose | undefined, side: "housing" | "commercial") =>
  (bg?.perPart?.[`${side}Land`]?.acquisitionBeforeRatio ?? 0) + (bg?.perPart?.[`${side}Building`]?.acquisitionBeforeRatio ?? 0);

/** 1983 상속 · PHD(§164⑦ — 의제취득일 기준) */
const Y83: Loose = {
  acquisitionDate: "1983-03-15",
  inheritanceStartDate: "1983-03-15",
  decedentAcquisitionDate: "1970-01-01",
  usePreHousingDisclosure: true,
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "250000000",
  phdLandPricePerSqmAtFirst: "1600000",
  phdLandPricePerSqmAtAcq: "800000",
  phdBuildingStdPriceAtAcq: "25000000",
  phdBuildingStdPriceAtFirst: "45000000",
  phdBuildingStdPriceAtTransfer: "100000000",
  mixedAcqLandPricePerSqm: "800000",
  mixedAcqCommercialBuildingPrice: "30000000",
};
const GIFT: Loose = { acquisitionCause: "gift", inheritanceStartDate: "", decedentAcquisitionDate: "", donorAcquisitionDate: "1970-01-01", giftDonorRelation: "lineal_ascendant", giftSameHousehold: "no" };
const GV = (h: string, c: string): Loose => ({ mixedHousingGiftValueOverride: h, mixedCommercialGiftValueOverride: c });
const STD: Loose = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgHousingAppraisalDeclared: "" };
const tot = (h: number, c: number) => ({ housing: h, commercial: c, total: h + c });
const STD_TOT = tot(128_048_780, 110_000_000);
const CONV_TOT = tot(160_060_974, 137_500_000);

describe("PR-7b-7b · 시가 평가 — ①평가액·②의제취득일 기준시가·③환산취득가액 자산 합계 비교 → 이긴 후보 × 부분별 채무비율(Q-36)", () => {
  it("[D-1] 1983 상속 · ① 3.5억씩(7억) > ③ 297,560,974 > ② 238,048,780 → ① · 부분별 × 0.4 · 64,230,001 (종전 MB-16 400)", async () => {
    const r = await run(form({ ...Y83, ...RV("350000000", "350000000") }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.body.mixedUse.sec163_9Compare).toEqual({ era: "pre_deemed", cause: "inheritance" });
    expect(r.cmp).toMatchObject({ era: "pre_deemed", selected: "reported", reported: tot(350_000_000, 350_000_000), standard: STD_TOT, converted: CONV_TOT });
    expect(r.bg?.deemedBasis).toEqual({ housing: "reported", commercial: "reported", housingPhd: true });
    expect(r.bg?.acquisitionStdAtDeemedDate).toBe(true);
    expect(r.housingAcq).toBe(139_999_999);
    expect(r.commercialAcq).toBe(139_999_999);
    expect(r.tax).toBe(64_230_001);
  });

  it("[D-2] ① 비움 → ③ 채택 — 주택 160,060,974 · 상가 137,500,000을 채무비율 전에 비교 → × 0.4 · 개산공제 · 106,933,328 (종전 MB-16 400)", async () => {
    const r = await run(form({ ...Y83, ...RV("", "") }));
    expect(r.issues).toEqual([]);
    expect(r.cmp).toMatchObject({ selected: "converted", reported: null, standard: STD_TOT, converted: CONV_TOT });
    expect(r.bg?.acquisitionMethodUsed).toBe("converted");
    expect(r.bg?.deemedBasis).toEqual({ housing: "converted", commercial: "converted", housingPhd: true });
    expect(beforeRatio(r.bg, "housing")).toBe(160_060_974);
    expect(beforeRatio(r.bg, "commercial")).toBe(137_500_000);
    expect(r.housingAcq).toBe(64_024_389);
    expect(r.commercialAcq).toBe(55_000_000);
    expect(r.bg?.perPart?.housingLand?.estimatedDeductionRate).toBeGreaterThan(0);
    expect(r.tax).toBe(106_933_328);
  });

  it("[D-3] ① 5천만씩(1억) < ② < ③ → ③ (D-2와 같은 세액)", async () => {
    const r = await run(form({ ...Y83, ...RV("50000000", "50000000") }));
    expect(r.cmp).toMatchObject({ selected: "converted", reported: tot(50_000_000, 50_000_000) });
    expect(r.tax).toBe(106_933_328);
  });

  it("[D-4] 증여 · ① 비움 → ⑧ 증여 신고가액 칸 · API 400(Q-14·Q-16)", async () => {
    const r = await run(form({ ...Y83, ...GIFT, ...GV("", "") }));
    expect(r.issues[0]?.field).toBe("mixedHousingGiftValueOverride");
    expect(r.status).toBe(400);
  });

  it("[D-5] 증여 · ① 5천만씩 → ③ · cause gift · 106,933,328", async () => {
    const r = await run(form({ ...Y83, ...GIFT, ...GV("50000000", "50000000") }));
    expect(r.issues).toEqual([]);
    expect(r.cmp).toMatchObject({ cause: "gift", selected: "converted" });
    expect(r.bg?.deemedCause).toBe("gift");
    expect(r.tax).toBe(106_933_328);
  });

  it("[D-6] PHD를 끄면(직접 입력 개별주택가격) — ⑧ §164⑦ 토글로 · API 400(Q-37 · R-1과 같은 근거)", async () => {
    const r = await run(form({ ...Y83, usePreHousingDisclosure: false, mixedAcqHousingPrice: "100000000", ...RV("350000000", "350000000") }));
    expect(r.issues[0]?.field).toBe("usePreHousingDisclosure");
    expect(r.issues[0]?.message).toMatch(/의제취득일\(1985\.1\.1\.\) 전에 상속·증여받은 주택분의 의제취득일 기준시가는 §164⑦ 환산가액/);
    expect(r.status).toBe(400);
  });

  it("[D-7] API 직접: 비교 구간 표시 없이 오면 계속 막는다(MB-16 · fail closed)", async () => {
    const r = await run(form({ ...Y83, ...RV("350000000", "350000000") }), (b) => {
      delete b.mixedUse.sec163_9Compare;
    });
    expect(r.status).toBe(400);
    expect(r.fieldErrors?.["mixedUse.landAcquisitionDate"]?.[0]).toMatch(/비교 구간 표시가 없어/);
  });

  it("[D-8] 평가액 한 칸만 — ⑧ 빈 칸 · 400(짝 규칙)", async () => {
    const r = await run(form({ ...Y83, ...RV("350000000", "") }));
    expect(r.issues[0]?.field).toBe("mixedCommercialInheritedValueOverride");
    expect(r.status).toBe(400);
  });

  it("[D-11] PHD 토글만 켜고 레거시 환산 플래그가 없어도(부담부증여 토글은 그 플래그를 켜지 않는다) 같은 세액", async () => {
    const r = await run(form({ ...Y83, useEstimatedAcquisition: false, ...RV("", "") }));
    expect(r.issues).toEqual([]);
    expect(r.tax).toBe(106_933_328);
  });

  it("[D-12] ③ 채택 + 공통 자본적지출 5천만·양도비 1천만 — 환산+개산공제가 실제 경비보다 커 본문 유지(§97②2호 단서 판정 echo)", async () => {
    const r = await run(form({ ...Y83, ...RV("", ""), capitalExpenditure: "50000000", transferExpense: "10000000" }));
    expect(r.issues).toEqual([]);
    expect(r.cmp?.selected).toBe("converted");
    expect(r.bg?.necessaryExpenseSwap?.chosen).toBe("estimated");
    expect(r.tax).toBe(106_933_328); // 본문 유지 — 실제 경비는 쓰지 않아 D-2와 같다
  });

  it("[D-12'] ③ 채택 + 공통 자본적지출 5억 — 실제 경비가 더 커 나목(취득가액 0 · 경비 × 채무비율 — §97②2호 단서)", async () => {
    const r = await run(form({ ...Y83, ...RV("", ""), capitalExpenditure: "500000000" }));
    expect(r.issues).toEqual([]);
    expect(r.cmp?.selected).toBe("converted");
    expect(r.bg?.necessaryExpenseSwap?.chosen).toBe("direct");
    expect(r.housingAcq).toBe(0);
    expect(r.bg?.perPart?.housingLand?.acquisitionBeforeSwap).toBeGreaterThan(0);
    expect(r.tax).toBe(85_510_001);
  });

  it("[D-13] ① 채택 + 같은 경비 — 실제 경비 × 채무비율(개산공제 아님)", async () => {
    const r = await run(form({ ...Y83, ...RV("350000000", "350000000"), capitalExpenditure: "50000000", transferExpense: "10000000" }));
    expect(r.cmp?.selected).toBe("reported");
    expect(r.bg?.perPart?.housingLand?.estimatedDeductionRate).toBeUndefined();
    expect(r.tax).toBe(57_846_001);
  });
});

describe("PR-7b-7b · 기준시가 평가 — 의제취득일 기준시가(주택분 §164⑦ · Q-37) × 부분별 채무비율", () => {
  it("[D-9] 1983 상속 · PHD → 주택 128,048,780 × 0.5 · 상가 1.1억 × 0.5 · 106,733,366 (종전 MB-16 400)", async () => {
    const r = await run(form({ ...Y83, ...STD, ...RV("", "") }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.body.mixedUse.sec163_9Compare).toBeUndefined();
    expect(r.bg?.acquisitionMethodUsed).toBe("standard_price");
    expect(r.bg?.acquisitionStdAtDeemedDate).toBe(true);
    expect(r.housingAcq).toBe(64_024_389);
    expect(r.commercialAcq).toBe(55_000_000);
    expect(r.tax).toBe(106_733_366);
  });

  it("[D-9'] PHD 없음 → ⑧ §164⑦ 토글로 · 400(종전 MB-2·MB-16)", async () => {
    const r = await run(form({ ...Y83, ...STD, usePreHousingDisclosure: false, mixedAcqHousingPrice: "100000000", ...RV("", "") }));
    expect(r.issues[0]?.field).toBe("usePreHousingDisclosure");
    expect(r.status).toBe(400);
  });
});

describe("PR-7b-7b · 리뷰 F-1·F-2 — 토지·건물 취득일 섞임 · 비교 표시 위조", () => {
  it("[F-1] 토지만 1983 · 건물 1990(시가) → ⑧·API 모두 「취득일 중 한쪽만 1985.1.1. 전」 400 (종전 MB-16 「비교 구간 표시가 없어」 — 고칠 칸이 없는 문구)", async () => {
    const r = await run(form({ ...Y83, acquisitionDate: "1990-03-15", inheritanceStartDate: "1990-03-15", landAcquisitionDate: "1983-03-15", hasSeperateLandAcquisitionDate: true, ...RV("350000000", "350000000") }));
    expect(r.issues[0]?.message).toMatch(/토지·건물 취득일 중 한쪽만 1985\.1\.1\. 전/);
    expect(r.status).toBe(400);
  });

  it("[F-1'] 같은 시료 · 기준시가 평가도 막는다(종전: 200 · 1990 건물까지 의제취득일 라벨)", async () => {
    const r = await run(form({ ...Y83, ...STD, acquisitionDate: "1990-03-15", inheritanceStartDate: "1990-03-15", landAcquisitionDate: "1983-03-15", hasSeperateLandAcquisitionDate: true, ...RV("", "") }));
    expect(r.issues[0]?.message).toMatch(/토지·건물 취득일 중 한쪽만 1985\.1\.1\. 전/);
    expect(r.status).toBe(400);
  });

  it("[F-2] API 직접: 2010 상속에 비교 표시 pre_deemed를 위조하면 400 (리뷰 실측: 위조 시 ③ 채택 83,041,521 ↔ 정상 138,820,000)", async () => {
    const r = await run(form({ ...Y83, acquisitionDate: "2010-03-15", inheritanceStartDate: "2010-03-15", decedentAcquisitionDate: "2000-01-01", usePreHousingDisclosure: false, ...RV("50000000", "50000000") }), (b) => {
      b.mixedUse.sec163_9Compare = { era: "pre_deemed", cause: "inheritance" };
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.fieldErrors)).toMatch(/토지·건물 취득일이 모두 1985\.1\.1\. 전일 때만/);
  });
});

describe("PR-7b-7b · 범위 밖 — 1985 전 매매는 계속 막는다", () => {
  it("[D-10] 1983 매매 · 실지 7억 → MB-16(매매 문구) · 400", async () => {
    const r = await run(form({ ...Y83, acquisitionCause: "purchase", usePreHousingDisclosure: false, mixedAcqHousingPrice: "100000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "700000000", ...RV("", "") }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.fieldErrors)).toMatch(/매매 취득에 이를 반영하지 않아/);
    expect(r.issues.map((i: Loose) => i.message).join()).toMatch(/매매 취득에 이를 반영하지 않아/);
  });
});
