/**
 * PR-7b-7a-2 — 겸용주택 × 부담부증여 × 증여자 상속·증여 취득 — §163⑨ 단서 구간(1985.1.1.~2005.4.29.)·호별 최초공시일(PHD) — **화면 경로**.
 * 계획서 `docs/02-design/features/inheritance-pre-deemed-bg-pr7b.plan.md` §6 PR-7b-7a-2 · 사용자 결정 Q-35 · Q-36(채무비율 전 합계 비교) · M-1 (a)(2026-10-24 — 호별 최초공시일).
 *
 * 시료: 주택 100㎡·상가 100㎡ · 증여일 2024-03-01 · 시가 15억 · 담보차입금 6억 · 양도시 개별주택가격 6억 · 상가 부수토지 5억 · 상가건물 1억. 세율은 mock.
 * 단서 구간 비교의 후보 금액은 채무비율을 곱하기 전이고(Q-36), 이긴 후보의 주택분·상가분에 각 채무비율을 곱한다.
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
/** 1995 상속 · PHD 없음 · 취득시 개별주택가격 3억(② 주택분) · 상가 토지 2.5억 + 건물 5천만(② 상가분) */
const Y95: Loose = {
  acquisitionDate: "1995-03-15",
  inheritanceStartDate: "1995-03-15",
  decedentAcquisitionDate: "1980-01-01",
  mixedAcqHousingPrice: "300000000",
  mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000",
};
/** PHD(§164⑦) 입력 — 최초 고시일은 시료마다 덮어쓴다 */
const PHD: Loose = {
  usePreHousingDisclosure: true,
  phdFirstDisclosureDate: "2006-04-28",
  phdFirstDisclosureHousingPrice: "250000000",
  phdLandPricePerSqmAtFirst: "1600000",
  phdLandPricePerSqmAtAcq: "1500000",
  phdBuildingStdPriceAtAcq: "40000000",
  phdBuildingStdPriceAtFirst: "45000000",
  phdBuildingStdPriceAtTransfer: "100000000",
  mixedAcqLandPricePerSqm: "1500000",
  mixedAcqCommercialBuildingPrice: "50000000",
};
/** 2006.1.15. 상속 · 그 주택의 개별주택가격 최초 공시 2006.4.28.(단서 2호 대상 — 부동산거래관리과-364와 같은 모양) */
const Y06: Loose = { acquisitionDate: "2006-01-15", inheritanceStartDate: "2006-01-15", decedentAcquisitionDate: "1990-01-01" };
/** 1995 상속 · PHD — 최초 고시일 2005-04-30 · 취득시 공시지가 80만 · 건물 2,500만 · 상가건물 3천만 */
const Y95_PHD: Loose = {
  ...Y95,
  mixedAcqHousingPrice: "",
  phdFirstDisclosureDate: "2005-04-30",
  mixedAcqLandPricePerSqm: "800000",
  phdLandPricePerSqmAtAcq: "800000",
  mixedAcqCommercialBuildingPrice: "30000000",
  phdBuildingStdPriceAtAcq: "25000000",
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

describe("PR-7b-7a-2 · 단서 구간(1985.1.1.~2005.4.29.) — 채무비율 전 자산 합계 비교", () => {
  it("[C-1] 1995 상속 · ① 3.5억씩(7억) vs ② 3억 + 3억(6억) → ① 채택 · 부분별 × 0.4 · 64,230,000 (종전 MB-18 400)", async () => {
    const r = await run(form({ ...Y95, ...RV("350000000", "350000000") }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.body.mixedUse.sec163_9Compare).toEqual({ era: "clause", cause: "inheritance" });
    expect(r.cmp?.selected).toBe("reported");
    expect(r.cmp?.reported).toEqual({ housing: 350_000_000, commercial: 350_000_000, total: 700_000_000 });
    expect(r.cmp?.standard).toEqual({ housing: 300_000_000, commercial: 300_000_000, total: 600_000_000 });
    expect(r.bg?.deemedBasis).toEqual({ housing: "reported", commercial: "reported", housingPhd: false });
    expect(r.housingAcq).toBe(139_999_999);
    expect(r.commercialAcq).toBe(139_999_999);
    expect(r.tax).toBe(64_230_000);
  });

  it("[C-2] ① 1억씩(2억) < ②(6억) → ② 채택(§164 기준시가) · 120,000,000씩 · 74,870,000", async () => {
    const r = await run(form({ ...Y95, ...RV("100000000", "100000000") }));
    expect(r.issues).toEqual([]);
    expect(r.cmp?.selected).toBe("standard");
    expect(r.bg?.deemedBasis).toEqual({ housing: "standard", commercial: "standard", housingPhd: false });
    expect(beforeRatio(r.bg, "housing")).toBe(300_000_000);
    expect(r.housingAcq).toBe(120_000_000);
    expect(r.tax).toBe(74_870_000);
  });

  it("[C-3] 1995 증여 — 같은 비교(cause=gift) · ② 채택 74,870,000", async () => {
    const r = await run(form({
      ...Y95, acquisitionCause: "gift", donorAcquisitionDate: "1980-01-01", giftDonorRelation: "lineal_ascendant", giftSameHousehold: "no",
      mixedHousingGiftValueOverride: "100000000", mixedCommercialGiftValueOverride: "100000000",
    }));
    expect(r.issues).toEqual([]);
    expect(r.cmp?.cause).toBe("gift");
    expect(r.cmp?.selected).toBe("standard");
    expect(r.tax).toBe(74_870_000);
  });

  it("[C-4] 🔑 Q-36 — 채무가 상가에만 귀속(주택 채무비율 0)이어도 채무비율 전 합계로 비교한다: ① 9.5억 > ② 2.38억 → ① · 상가분 0.5억 × 0.8 = 39,999,999 (곱한 뒤 비교였다면 ② 88,000,000)", async () => {
    const r = await run(form({ ...PHD, ...Y95_PHD, bgMortgageAttribution: "commercial", ...RV("900000000", "50000000") }));
    expect(r.issues).toEqual([]);
    expect(r.cmp?.selected).toBe("reported");
    expect(r.cmp?.reported?.total).toBe(950_000_000);
    expect(r.cmp?.standard?.total).toBe(238_048_780);
    expect(r.housingAcq).toBe(0);
    expect(r.commercialAcq).toBe(39_999_999);
    expect(r.tax).toBe(129_860_000);
    // 대조 — ① 없이 ②만이면 상가분 1.1억 × 0.8
    const s = await run(form({ ...PHD, ...Y95_PHD, bgMortgageAttribution: "commercial", ...RV("", "") }));
    expect(s.cmp?.selected).toBe("standard");
    expect(s.commercialAcq).toBe(88_000_000);
  });

  it("[C-5] 1995 · PHD · ① 비움 — ②만(주택 §164⑦ 128,048,780 · 상가 1.1억) × 0.4 · 비교 카드의 ①은 비교하지 않음", async () => {
    const r = await run(form({ ...PHD, ...Y95_PHD, ...RV("", "") }));
    expect(r.issues).toEqual([]);
    expect(r.cmp?.reported).toBeNull();
    expect(r.cmp?.standard).toEqual({ housing: 128_048_780, commercial: 110_000_000, total: 238_048_780 });
    expect(r.bg?.deemedBasis).toEqual({ housing: "standard", commercial: "standard", housingPhd: true });
    expect(r.housingAcq).toBe(51_219_512);
    expect(r.commercialAcq).toBe(44_000_000);
  });

  it("[C-6] 평가액 한 칸만 — ⑧ 빈 상가분 칸 · API 400(짝 규칙 · PR-6 Q-19)", async () => {
    const r = await run(form({ ...Y95, ...RV("350000000", "") }));
    expect(r.issues[0]?.field).toBe("mixedCommercialInheritedValueOverride");
    expect(r.issues[0]?.message).toMatch(/두 칸 모두 입력하거나 모두 비워야/);
    expect(r.status).toBe(400);
  });

  it("[C-8] PHD 없이 취득시 개별주택가격을 비우면 — ⑧이 그 칸으로(§164⑦ 토글 안내) · API 400 (종전: ⑧ 통과 → 500 · 리뷰 권고)", async () => {
    const r = await run(form({ ...Y95, ...RV("350000000", "350000000"), mixedAcqHousingPrice: "" }));
    expect(r.issues[0]?.field).toBe("mixedAcqHousingPrice");
    expect(r.issues[0]?.message).toMatch(/개별주택가격 미공시\(§164⑦\) 토글/);
    expect(r.status).toBe(400);
  });

  it("[C-7] API 직접: 비교 구간 표시(sec163_9Compare) 없이 오면 계속 막는다(MB-18 · fail closed)", async () => {
    const r = await run(form({ ...Y95, ...RV("350000000", "350000000") }), (b) => {
      delete b.mixedUse.sec163_9Compare;
    });
    expect(r.status).toBe(400);
    expect(r.fieldErrors?.["mixedUse.landAcquisitionDate"]?.[0]).toMatch(/제163조 제9항 단서/);
  });
});

describe("PR-7b-7a-2 · 호별 최초공시일(M-1 (a)) — 2005.4.30. 이후 취득 · 최초공시가 그 뒤면 PHD로 §164⑦과 비교", () => {
  it("[P-1] 2006.1.15. 상속 · 최초공시 2006.4.28. · ① 1억/3.5억 → 주택분 max(1억, §164⑦ 231,707,317) × 0.4 · 76,816,342 (종전 PHD 차단)", async () => {
    const r = await run(form({ ...PHD, ...Y06, ...RV("100000000", "350000000") }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.body.mixedUse.usePreHousingDisclosure).toBe(true);
    expect(r.body.mixedUse.sec163_9Compare).toBeUndefined();
    expect(beforeRatio(r.bg, "housing")).toBe(231_707_317);
    expect(r.bg?.deemedBasis).toEqual({ housing: "standard", commercial: "reported", housingPhd: true });
    expect(r.housingAcq).toBe(92_682_926);
    expect(r.commercialAcq).toBe(140_000_000);
    expect(r.tax).toBe(76_816_342);
  });

  it("[P-2] 🔴 짝: 같은 시료에서 PHD를 끄면 평가액만 — 주택분 1억 × 0.4 · 90,830,000", async () => {
    const r = await run(form({ ...Y06, ...RV("100000000", "350000000"), mixedAcqLandPricePerSqm: "1500000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqHousingBuildingStdPrice: "40000000" }));
    expect(r.issues).toEqual([]);
    expect(beforeRatio(r.bg, "housing")).toBe(100_000_000);
    expect(r.tax).toBe(90_830_000);
  });

  it("[P-3] ① 4억이 §164⑦보다 크면 ① — 주택분 159,999,999 · 58,910,000", async () => {
    const r = await run(form({ ...PHD, ...Y06, ...RV("400000000", "350000000") }));
    expect(r.bg?.deemedBasis?.housing).toBe("reported");
    expect(r.housingAcq).toBe(159_999_999);
    expect(r.tax).toBe(58_910_000);
  });

  it("[P-4] 최초 고시일이 상속개시일 전(2005-04-30)이면 ⑧ 최초 고시일 칸(§164⑦ 대상 아님)", async () => {
    const r = await run(form({ ...PHD, ...Y06, ...RV("100000000", "350000000"), phdFirstDisclosureDate: "2005-04-30" }));
    expect(r.issues[0]?.field).toBe("phdFirstDisclosureDate");
    expect(r.status).toBe(400);
  });

  it("[P-5] PHD 칸이 비면 ⑧ 그 칸(최초 고시 개별주택가격) — 겸용 일반 양도와 같은 검증", async () => {
    const r = await run(form({ ...PHD, ...Y06, ...RV("100000000", "350000000"), phdFirstDisclosureHousingPrice: "" }));
    expect(r.issues[0]?.field).toBe("phdFirstDisclosureHousingPrice");
    expect(r.status).toBe(400);
  });

  it("[P-6] 🔴 짝: 매매 취득 부담부증여의 PHD는 계속 막는다(MB-2)", async () => {
    const r = await run(form({ ...PHD, ...Y06, acquisitionCause: "purchase", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "700000000" }));
    expect(r.issues[0]?.field).toBe("usePreHousingDisclosure");
    expect(r.issues[0]?.message).toMatch(/개별주택가격 미공시 환산/);
    expect(r.status).toBe(400);
  });
});
