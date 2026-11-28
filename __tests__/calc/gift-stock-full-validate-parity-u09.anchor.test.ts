/**
 * U-09 — 증여 ⑧이 상속 ⑧과 같은 비상장 V2·상장 평가조서 검증을 부른다(⑧↔⑫ 정합 + Zod에 없는 규칙).
 * 동시증여 추가 건 N≥2 특례 귀속 미설정도 ⑩과 같이 막는다.
 */
import { describe, it, expect } from "vitest";
import { validateStep, INITIAL_FORM, type FormState, type GiftSubFormState } from "@/components/calc/gift-tax-form-shared";
import { buildGiftTaxInput } from "@/lib/calc/gift-api";
import { giftTaxInputSchema } from "@/lib/validators/property-valuation-input";
import { giftSimultaneousRequestSchema } from "@/lib/validators/property-valuation-input";
import { validateUnlistedStockV2 } from "@/lib/calc/inheritance-validate-unlisted";
import { validateListedStockBesshi } from "@/lib/calc/inheritance-validate";
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


const cash = { id: "m", category: "cash", name: "현금", marketValue: 100_000_000 } as EstateItem;

describe("U-09 증여 ⑧ 본 건 — 상속 ⑧과 같은 V2·상장 평가조서 검증", () => {
  it("전제: 정상 V2·상장은 ⑧·⑫ 모두 통과 (구별력)", () => {
    const f = form([unlisted({}), listed({})]);
    expect(validateStep(1, f)).toBeNull();
    expect(zodMessages(f)).toEqual([]);
  });

  it("🔑 (a) 유상증자 변동일 미입력 → ⑧ 차단 (종전: ⑧ 통과 → ⑫ 400 changeDate)", () => {
    const item = unlisted({
      capitalChanges: [
        { changeType: "paid_in", changeDate: undefined, sharesIssued: 1_000, pricePerShare: 10_000 },
      ],
    });
    const f = form([item]);
    expect(zodMessages(f).length).toBeGreaterThan(0);
    const inh = validateUnlistedStockV2(item, { evaluationDateFallback: "2025-06-30" });
    expect(inh).not.toBeNull();
    expect(validateStep(1, f)).toBe(inh);
  });

  it("🔑 (b) 비상장 최대주주 + §53⑧2호 전부매각 + 매매계약일 공란 → ⑧ 차단 (종전: 차단 없이 할증)", () => {
    const item = unlisted({ companySize: "large", premiumExclusionReason: "all_sold_within_6m" });
    const f = form([item]);
    expect(validateStep(1, f)).toBe(`비상장주식 "비상장" §53⑧2호 — 매매계약일을 입력해야 합니다.`);
  });

  it("🔑 (b′) 상장 최대주주 + §53⑧2호 전부매각 + 매매계약일 공란 → ⑧ 차단 (상속 ⑧과 같은 문구)", () => {
    const item = listed({ companySize: "large", premiumExclusionReason: "all_sold_within_6m" });
    const f = form([item]);
    const inh = validateListedStockBesshi(item);
    expect(inh).toBe(`자산 "상장주식" §53⑧2호 — 매매계약일 입력 필요`);
    expect(validateStep(1, f)).toBe(inh);
  });

  it("🔑 (c) 상장 최대주주 + 기업 규모 미입력 → ⑧ 차단", () => {
    const item = listed({ companySize: undefined });
    expect(validateStep(1, form([item]))).toBe(`자산 "상장주식" §63③ — 기업 규모 (중소·중견·대기업) 입력 필요`);
  });

  it("평가기준일 미입력 V2는 증여일을 fallback으로 쓴다 — 변동일 > 증여일이면 차단, 이하면 통과", () => {
    const mk = (date: string) =>
      unlisted({
        evaluationDate: undefined,
        capitalChanges: [
          { changeType: "paid_in", changeDate: d(date), sharesIssued: 1_000, pricePerShare: 10_000 },
        ],
      });
    expect(validateStep(1, form([mk("2025-07-01")]))).not.toBeNull();
    expect(validateStep(1, form([mk("2025-06-01")]))).toBeNull();
  });
});

describe("U-09 증여 ⑧ 동시증여 추가 건", () => {
  it("🔑 추가 건 유상증자 변동일 미입력 → ⑧ 차단 (⑫도 400)", () => {
    const item = unlisted({
      capitalChanges: [
        { changeType: "paid_in", changeDate: undefined, sharesIssued: 1_000, pricePerShare: 10_000 },
      ],
    });
    const s = sub([item]);
    const f = form([], { giftItems: [cash], simultaneousGiftForms: [s] });
    expect(zodSimMessages(f, s).length).toBeGreaterThan(0);
    expect(validateStep(3, f)).toMatch(/^동시증여 건 1: 비상장주식 "비상장" — 유상증자/);
  });

  it("🔑 추가 건 N≥2 + 특례 + 귀속 미설정 → ⑧ 차단 (종전: ⑧ 통과 → ⑩ 400)", () => {
    const s = { ...sub([listed({}), listed({ id: "ls2", name: "상장2" })]), specialTreatment: "family_business" } as GiftSubFormState;
    const f = form([], { giftItems: [cash], simultaneousGiftForms: [s] });
    expect(zodSimMessages(f, s).length).toBeGreaterThan(0);
    expect(validateStep(3, f)).toMatch(/^동시증여 건 1: 가업승계 특례 적용 시 모든 자산의 특례 귀속 여부를 선택하세요/);
  });
});
