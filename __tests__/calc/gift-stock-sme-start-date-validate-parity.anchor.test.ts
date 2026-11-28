/**
 * U-04·U-10 증여 ⑧↔⑫ 정합 — 증여 ⑧(validateStep)이 상속 ⑧과 같은 술어·문구로 두 조건을 막는다.
 *   (1) 최대주주 + 배제 사유 9호(small_medium_enterprise) + 일반기업(large) — 상장·비상장 V2
 *   (2) 비상장 V2 정식평가 사업개시일 미입력
 * 종전: 화면 통과 → /api/calc/gift(giftTaxInputSchema·giftSimultaneousRequestSchema) 400.
 * 본 건(step 1)과 동시증여 추가 건(step 3 루프) 둘 다.
 */
import { describe, it, expect } from "vitest";
import { validateStep, INITIAL_FORM, type FormState, type GiftSubFormState } from "@/components/calc/gift-tax-form-shared";
import { buildGiftTaxInput } from "@/lib/calc/gift-api";
import { giftTaxInputSchema } from "@/lib/validators/property-valuation-input";
import { giftSimultaneousRequestSchema } from "@/lib/validators/property-valuation-input";
import { SME_REASON_LARGE_SIZE_MESSAGE } from "@/lib/tax-engine/property-valuation/max-shareholder-premium-era";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

const d = (s: string) => new Date(s);

const V2: UnlistedStockValuationInput = {
  corpName: "㈜가업",
  businessStartDate: d("2000-01-01"),
  evaluationDate: d("2025-06-30"),
  faceValuePerShare: 5_000,
  totalShares: 10_000,
  ownedShares: 5_000,
  isRealEstateHeavy: false,
  fiscalYears: [
    { fiscalYearLabel: "2024", fiscalYearEndDate: d("2024-12-31"), taxableIncome: 500_000_000 },
    { fiscalYearLabel: "2023", fiscalYearEndDate: d("2023-12-31"), taxableIncome: 300_000_000 },
    { fiscalYearLabel: "2022", fiscalYearEndDate: d("2022-12-31"), taxableIncome: 0 },
  ],
  capitalChanges: [],
  netAssetValueRaw: {
    bsTotalAssets: 1_000_000_000, assetValuationDelta: 0,
    corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
    prepaidExpenses: 0, preGiftRetainedEarnings: 0,
    bsTotalLiabilities: 0, corporateTaxPayable: 0,
    farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0,
    retirementProvision: 0, otherProvision: 0,
    reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
  },
  isContinuousLossLastThreeYears: false,
  capitalizationRate: 0.1,
  isMaxShareholder: true,
  companySize: "medium",
};

const unlisted = (v2: Partial<UnlistedStockValuationInput>): EstateItem =>
  ({
    id: "u",
    category: "unlisted_stock",
    name: "비상장",
    unlistedValuationMode: "formal",
    unlistedStockValuationV2: { ...V2, ...v2 },
  }) as unknown as EstateItem;

const listed = (over: Partial<EstateItem>): EstateItem =>
  ({
    id: "ls",
    category: "listed_stock",
    name: "상장주식",
    listedStockAvgPrice: 50_000,
    listedStockShares: 10_000,
    isMaxShareholder: true,
    companySize: "medium",
    ...over,
  }) as EstateItem;

const START_MSG = `비상장주식 "비상장" — 사업개시일을 입력해야 합니다.`;

function form(stockItems: EstateItem[], over: Partial<FormState> = {}): FormState {
  return { ...INITIAL_FORM, giftDate: "2025-06-30", donor: "father", stockItems, ...over };
}

function sub(stockItems: EstateItem[]): GiftSubFormState {
  const { simultaneousGiftForms: _omit, ...base } = INITIAL_FORM;
  return { ...base, giftDate: "2025-06-30", donor: "grandparent", stockItems };
}

function zodMessages(f: FormState): string[] {
  const r = giftTaxInputSchema.safeParse(buildGiftTaxInput(f));
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

function zodSimMessages(f: FormState, s: GiftSubFormState): string[] {
  const body = { ...buildGiftTaxInput(f), simultaneousGiftForms: [buildGiftTaxInput(s as FormState)] };
  const r = giftSimultaneousRequestSchema.safeParse(body);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe("증여 ⑧ 본 건 — ⑫와 같은 차단", () => {
  it("전제: 정상 V2·상장은 ⑧·⑫ 모두 통과 (구별력)", () => {
    const f = form([unlisted({}), listed({})]);
    expect(validateStep(1, f)).toBeNull();
    expect(zodMessages(f)).toEqual([]);
  });

  it("🔑 비상장 V2 9호 + 일반기업 → ⑧ 차단(문구 = ⑫)", () => {
    const f = form([unlisted({ companySize: "large", premiumExclusionReason: "small_medium_enterprise" })]);
    expect(zodMessages(f)).toContain(SME_REASON_LARGE_SIZE_MESSAGE);
    expect(validateStep(1, f)).toBe(`비상장주식 "비상장" — ${SME_REASON_LARGE_SIZE_MESSAGE}`);
  });

  it("🔑 상장 9호 + 대기업 → ⑧ 차단(문구 = ⑫)", () => {
    const f = form([listed({ companySize: "large", premiumExclusionReason: "small_medium_enterprise" })]);
    expect(zodMessages(f)).toContain(SME_REASON_LARGE_SIZE_MESSAGE);
    expect(validateStep(1, f)).toBe(`자산 "상장주식" — ${SME_REASON_LARGE_SIZE_MESSAGE}`);
  });

  it("🔑 비상장 V2 사업개시일 미입력 → ⑧ 차단 (⑫도 400)", () => {
    const f = form([unlisted({ businessStartDate: undefined })]);
    expect(zodMessages(f).length).toBeGreaterThan(0);
    expect(validateStep(1, f)).toBe(START_MSG);
  });

  it("간편평가 모드에 숨은 V2(사업개시일 없음)는 ④가 걷어내므로 ⑧도 막지 않는다 (⑫ 통과와 같다)", () => {
    const hidden = {
      ...unlisted({ businessStartDate: undefined }),
      unlistedValuationMode: "simple",
      unlistedStockData: { totalShares: 10_000, ownedShares: 5_000, netAssetValue: 1_000_000_000 },
    } as unknown as EstateItem;
    const f = form([hidden]);
    expect(zodMessages(f)).toEqual([]);
    expect(validateStep(1, f)).toBeNull();
  });
});

describe("증여 ⑧ 동시증여 추가 건 — ⑫와 같은 차단", () => {
  const cash = { id: "m", category: "cash", name: "현금", marketValue: 100_000_000 } as EstateItem;

  it("전제: 정상 추가 건은 ⑧·⑫ 통과", () => {
    const s = sub([unlisted({})]);
    const f = form([], { giftItems: [cash], simultaneousGiftForms: [s] });
    expect(validateStep(3, f)).toBeNull();
    expect(zodSimMessages(f, s)).toEqual([]);
  });

  it("🔑 추가 건 9호 + 일반기업 → ⑧ 차단", () => {
    const s = sub([unlisted({ companySize: "large", premiumExclusionReason: "small_medium_enterprise" })]);
    const f = form([], { giftItems: [cash], simultaneousGiftForms: [s] });
    expect(zodSimMessages(f, s)).toContain(SME_REASON_LARGE_SIZE_MESSAGE);
    expect(validateStep(3, f)).toBe(`동시증여 건 1: 비상장주식 "비상장" — ${SME_REASON_LARGE_SIZE_MESSAGE}`);
  });

  it("🔑 추가 건 사업개시일 미입력 → ⑧ 차단", () => {
    const s = sub([unlisted({ businessStartDate: undefined })]);
    const f = form([], { giftItems: [cash], simultaneousGiftForms: [s] });
    expect(zodSimMessages(f, s).length).toBeGreaterThan(0);
    expect(validateStep(3, f)).toBe(`동시증여 건 1: ${START_MSG}`);
  });
});
