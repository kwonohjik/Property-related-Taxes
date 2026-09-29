/**
 * 상속세·증여세·증여의제 — 엔진이 필요로 하는데 ⑫가 비워 두게 두던 값 (2026-09-30 Zod↔엔진 필수 점검).
 *
 * 비우면 400이 아니라 200 + 다른 세액이었다. ⑧은 모두 이미 요구한다(합병 직접 모드는 ⑧도 뚫려 있었다).
 * - #1 사전증여 상속인 여부 → 합산기간 5년으로 읽음 (1,248,875,000 → 812,860,000)
 * - #2 가업상속 규모 요건 입력 → 0으로 읽어 요건 충족 (2,218,875,000 → 86,330,000)
 * - #3·#4·#5 가산세 날짜·당초 신고세액·납부기한 (상속·증여 공용 스키마)
 * - #8 금융재산 §63④ 예입원금 → 재산가액 0
 * - #13 비상장 자본금 변동일 → 그 행을 건너뜀
 * - #14·#15 증여 사전증여 증여자·동일인 합산 과세표준·산출세액
 * - 합병 주식교부 합병 전 주식수 (화면 도달 — 직접 모드) → ㉯ 0
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as INH } from "@/app/api/calc/inheritance/route";
import { POST as GIFT } from "@/app/api/calc/gift/route";
import { POST as DEEMED } from "@/app/api/calc/gift-deemed/route";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { INITIAL_DEEMED } from "@/components/calc/deemed-gift/deemed-form-state";

type Handler = (req: NextRequest) => Promise<Response>;
async function post(h: Handler, body: unknown) {
  const res = await h(
    new NextRequest("http://localhost/api/calc/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}
const paths = (json: { issues?: { path: string[] }[] }) => (json.issues ?? []).map((i) => i.path.join("."));
async function expectRejected(h: Handler, body: unknown, path: string) {
  const r = await post(h, body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
  expect(paths(r.json)).toContain(path);
}
async function finalTax(h: Handler, body: unknown): Promise<number> {
  const r = await post(h, body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  return r.json.result.finalTax;
}
const without = (o: Record<string, unknown>, ...keys: string[]) => {
  const c = { ...o };
  for (const k of keys) delete c[k];
  return c;
};

const H = { id: "h1", relation: "child", name: "자녀", birthDate: "1980-01-01" };
const INH_BASE = {
  decedentType: "resident",
  deathDate: "2024-06-01",
  estateItems: [{ id: "e1", category: "cash", name: "현금", marketValue: 3e9 }],
  preGiftsWithin10Years: [] as unknown[],
  heirs: [H],
  deductionInput: { heirs: [H] },
  creditInput: { isFiledOnTime: true },
};

describe("상속세", () => {
  it("#1 🟢 isHeir true 1,248,875,000 / 🔴 생략 400 (종전 5년으로 읽어 812,860,000)", async () => {
    const g = { giftDate: "2017-06-01", giftAmount: 1e9, giftTaxPaid: 0, doneeId: "h1", beneficiaryType: "heir" };
    expect(await finalTax(INH, { ...INH_BASE, preGiftsWithin10Years: [{ ...g, isHeir: true }] })).toBe(1_248_875_000);
    await expectRejected(INH, { ...INH_BASE, preGiftsWithin10Years: [g] }, "preGiftsWithin10Years.0.isHeir");
  });

  it("#2 🟢 중소기업 자산총액 6천억 → 2,218,875,000 / 🔴 생략 400 (종전 0으로 읽어 86,330,000)", async () => {
    const fb = {
      businessType: "individual",
      operatingYears: 30,
      enterpriseSize: "sme",
      isEligibleIndustry: true,
      decedentCEORequirementMet: true,
      heirIsAdult: true,
      heirTwoYearEngagement: true,
      heirOfficerByFilingDeadline: true,
      heirCEOWithinTwoYears: true,
      unrelatedAssetsAcknowledged: true,
      postManagementAcknowledged: true,
    };
    const body = (familyBusiness: unknown) => ({
      ...INH_BASE,
      estateItems: [
        { id: "e1", category: "cash", name: "현금", marketValue: 1e9 },
        {
          id: "e2",
          category: "real_estate_building",
          name: "사업장",
          marketValue: 5e9,
          isFamilyBusinessAsset: true,
          familyBusinessCategory: "business_real_estate",
        },
      ],
      deductionInput: { heirs: [H], familyBusiness },
    });
    expect(await finalTax(INH, body({ ...fb, totalAssets: 6e11 }))).toBe(2_218_875_000);
    await expectRejected(INH, body(fb), "deductionInput.familyBusiness.totalAssets");
  });

  it.each([
    ["#3 기한후신고일", { filingStatus: "late", statutoryDeadline: "2024-12-31" }, "filingPenalty.actualFilingDate"],
    ["#3b 법정신고기한", { filingStatus: "late", actualFilingDate: "2025-01-15" }, "filingPenalty.statutoryDeadline"],
    ["#4 당초 신고세액", { filingStatus: "on_time", isUnderReported: true }, "filingPenalty.originalFiledTax"],
    ["#5 납부기한", { filingStatus: "on_time", unpaidTax: 1e8, actualPaymentDate: "2025-06-30" }, "filingPenalty.paymentDeadline"],
  ])("%s 🔴 생략 400", async (_n, filingPenalty, path) => {
    await expectRejected(INH, { ...INH_BASE, creditInput: { isFiledOnTime: false }, filingPenalty }, path);
  });

  it("#3~5 🟢 모두 있으면 200", async () => {
    const r = await post(INH, {
      ...INH_BASE,
      creditInput: { isFiledOnTime: false },
      filingPenalty: { filingStatus: "late", statutoryDeadline: "2024-12-31", actualFilingDate: "2025-01-15", unpaidTax: 1e8, paymentDeadline: "2024-12-31", actualPaymentDate: "2025-06-30" },
    });
    expect(r.status).toBe(200);
  });

  it("#8 🟢 예입원금 있음 812,860,000 / 🔴 생략 400 (종전 재산가액 0 → 세액 0)", async () => {
    const f = { id: "f1", category: "financial", name: "예금", savingsValuationMode: "manual", savingsPrincipal: 3e9 };
    expect(await finalTax(INH, { ...INH_BASE, estateItems: [f] })).toBeGreaterThan(0);
    await expectRejected(INH, { ...INH_BASE, estateItems: [without(f, "savingsPrincipal")] }, "estateItems.0.savingsPrincipal");
    await expectRejected(
      INH,
      { ...INH_BASE, estateItems: [{ ...f, savingsValuationMode: "auto", savingsAnnualRate: 3 }] },
      "estateItems.0.savingsStartDate",
    );
  });
});

describe("증여세 사전증여 (§47② 합산)", () => {
  // `gift.route.filing-penalty-g07b1.anchor.test.ts` BASE와 같은 모양
  const GIFT_BASE = {
    giftDate: "2025-01-01",
    donorRelation: "lineal_descendant",
    donor: "mother",
    giftItems: [{ id: "g1", category: "real_estate_apartment", name: "재산", marketValue: 1e9 }],
    priorGiftsWithin10Years: [] as unknown[],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_descendant" },
    creditInput: { isFiledOnTime: true },
  };
  const P = { giftDate: "2020-01-01", isHeir: true, giftAmount: 5e8, giftTaxPaid: 8e7, donor: "mother", giftTaxBase: 4.5e8, computedTax: 8e7 };
  it("🟢 모두 있으면 200", async () => {
    const r = await post(GIFT, { ...GIFT_BASE, priorGiftsWithin10Years: [P] });
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  });
  it.each([
    ["#15 증여자 (종전 합산 누락)", "donor"],
    ["#14 합산과세표준 (종전 공제 한도 축소)", "giftTaxBase"],
    ["#14 산출세액", "computedTax"],
  ])("%s 🔴 생략 400", async (_n, key) => {
    await expectRejected(GIFT, { ...GIFT_BASE, priorGiftsWithin10Years: [without(P, key)] }, `priorGiftsWithin10Years.0.${key}`);
  });
  it("🟢 다른 증여자 그룹 회차는 합산과세표준을 요구하지 않는다", async () => {
    const r = await post(GIFT, {
      ...GIFT_BASE,
      priorGiftsWithin10Years: [without({ ...P, donor: "grandparent" }, "giftTaxBase", "computedTax")],
    });
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  });
});

describe("증여의제 — 합병 주식교부 합병 전 주식수", () => {
  const MERGER = {
    type: "merger",
    caseType: "stock",
    mergedPriceMode: "direct",
    overvaluedSharePrice: 17500,
    exchangedShares: 100000,
    majorShares: 20000,
    mergedSharePrice: 45000,
    preMergerShares: 200000,
  };
  it("🟢 합병 전 주식수 있음 → 200 · 0 / 🔴 0·생략 → 400 (종전 900,000,000)", async () => {
    const ok = await post(DEEMED, MERGER);
    expect(ok.status).toBe(200);
    expect(ok.json.result.deemedGiftValue).toBe(0);
    await expectRejected(DEEMED, { ...MERGER, preMergerShares: 0 }, "preMergerShares");
    await expectRejected(DEEMED, without(MERGER, "preMergerShares"), "preMergerShares");
  });
  it("UI 🔴 ⑧ 직접 평가 모드도 합병 전 주식수를 요구한다 (종전 자동 모드에서만)", () => {
    const form = {
      ...INITIAL_DEEMED,
      giftDate: "2025-06-01",
      type: "merger",
      mrgCaseType: "stock",
      mrgMergedPriceMode: "direct",
      mrgOvervaluedPrice: "17,500",
      mrgExchangedShares: "100,000",
      mrgMajorShares: "20,000",
      mrgMergedPrice: "45,000",
      mrgPreShares: "",
    } as typeof INITIAL_DEEMED;
    expect(validateDeemedInput(form)).toMatch(/합병 전 주식수/);
    expect(validateDeemedInput({ ...form, mrgPreShares: "200,000" }) ?? "").not.toMatch(/합병 전 주식수/);
  });
});

describe("#13 비상장 자본금 변동일 (상증규 §17의3⑤ · 엔진은 변동일 없는 행을 건너뛴다)", () => {
  it("🔴 변동일 없는 행 → Zod 실패 · 🟢 있으면 통과", async () => {
    const { unlistedCapitalChangeSchema } = await import("@/lib/validators/unlisted-stock-valuation-v2.schema");
    const row = { changeType: "free_issue", sharesIssued: 50000 };
    const bad = unlistedCapitalChangeSchema.safeParse(row);
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.path.join("."))).toContain("changeDate");
    expect(unlistedCapitalChangeSchema.safeParse({ ...row, changeDate: "2023-06-30" }).success).toBe(true);
  });
});
