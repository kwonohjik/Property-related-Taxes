/**
 * U-10 (비상장주식 리뷰 2026-11-28) — 상증령 §54④2호(사업개시 전·사업개시 후 3년 미만)를 사업개시일로 자동 판정.
 *
 * - §54④2호는 단서(3·5호 전용)가 걸리지 않는 무조건 사유 — 날짜로 성립하면 사용자가 고른 사유와 관계없이 순자산가치.
 * - §55③2호 「제54조제4항제2호에 해당하는 경우」 → 영업권 합산 안 함(사실 요건 — 5·6호를 골랐어도 배제).
 * - 기간: 국세기본법 §4 → 민법 초일불산입·역 계산. 2023-03-01 개시 → 만료 2026-03-01(그날까지 3년 미만).
 * - 결함(종전): 사업개시일을 판정에 쓰지 않아 칩을 켜지 않으면 가중평균 → 1주 261,372(총 1,306,860,000) 과대.
 *   「평가기준일 < 사업개시일」을 ⑧·⑫가 막아 「사업개시 전의 법인」은 입력할 수 없었다.
 * - Q-1 (a): 화면 초기값의 사업개시일(현재 연도 − 10년 1월 1일)이 입력하지 않은 값으로 2호를 일으키므로 비우고 ⑧에서 필수로 막는다.
 */
import { describe, it, expect } from "vitest";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import { resolveSection54_4_2ByBusinessStart } from "@/lib/tax-engine/property-valuation/section-54-4-2-business-period";
import { unlistedStockValuationV2Schema } from "@/lib/validators/unlisted-stock-valuation-v2.schema";
import { validateUnlistedStockV2 } from "@/lib/calc/inheritance-validate-unlisted";
import { createDefaultUnlistedStockV2 } from "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card";
import { buildGiftStockBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type {
  UnlistedNetAssetOnlyReason,
  UnlistedStockValuationInput,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

const d = (s: string) => new Date(s);

/**
 * A1 사례 — 발행 10,000 · 보유 5,000 · 자산 10억 · 부채 0 · 순손익 5억·3억·0 · 대기업·최대주주 아님.
 * 순손익가치 ⑤ 350,000 · 영업권 284,309,007 · ④(영업권 포함) 128,430 · 가중평균 261,372.
 * 영업권을 빼면 ④ 100,000.
 */
function base(opts: {
  businessStartDate?: string;
  evaluationDate: string;
  reason?: UnlistedNetAssetOnlyReason;
  incomes?: [number, number, number];
}): UnlistedStockValuationInput {
  const evalYear = Number(opts.evaluationDate.slice(0, 4));
  const fyEnd = (y: number) => d(`${y}-12-31`);
  // 평가기준일 직전 3개 사업연도(12월 결산) — 평가기준일이 12-31 전이면 전년이 1년전
  const y1 = opts.evaluationDate.slice(5) === "12-31" ? evalYear : evalYear - 1;
  const [i1, i2, i3] = opts.incomes ?? [500_000_000, 300_000_000, 0];
  return {
    corpName: "㈜신설",
    businessStartDate: opts.businessStartDate ? d(opts.businessStartDate) : undefined,
    evaluationDate: d(opts.evaluationDate),
    faceValuePerShare: 5_000,
    totalShares: 10_000,
    ownedShares: 5_000,
    isRealEstateHeavy: false,
    fiscalYears: [
      { fiscalYearLabel: `${y1}`, fiscalYearEndDate: fyEnd(y1), taxableIncome: i1 },
      { fiscalYearLabel: `${y1 - 1}`, fiscalYearEndDate: fyEnd(y1 - 1), taxableIncome: i2 },
      { fiscalYearLabel: `${y1 - 2}`, fiscalYearEndDate: fyEnd(y1 - 2), taxableIncome: i3 },
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
    capitalizationRate: 0.10,
    isMaxShareholder: false,
    companySize: "large",
    netAssetOnlyReason: opts.reason,
  };
}

const item = (v2: UnlistedStockValuationInput): EstateItem =>
  ({ id: "u10", category: "unlisted_stock", name: "신설법인", unlistedStockValuationV2: v2 }) as EstateItem;

describe("U-10 헬퍼 — 만료일 당일까지 3년 미만(민법 초일불산입·역 계산)", () => {
  it("2023-03-01 개시 → 만료 2026-03-01 · 02-28·03-01 미만 · 03-02부터 3년 이상", () => {
    const at = (e: string) => resolveSection54_4_2ByBusinessStart(d("2023-03-01"), d(e));
    expect(at("2026-02-28").status).toBe("under_3y");
    expect(at("2026-03-01").status).toBe("under_3y");
    expect(at("2026-03-01").threeYearsEndDate?.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(at("2026-03-02").status).toBe("three_years_or_more");
    expect(at("2023-03-01").status).toBe("under_3y"); // 개시 당일
    expect(at("2023-02-28").status).toBe("pre_start");
  });

  it("2024-02-29 개시 → 만료 2027-02-28(해당일 없음 → 그 달 말일) · 2027-03-01부터 3년 이상", () => {
    const at = (e: string) => resolveSection54_4_2ByBusinessStart(d("2024-02-29"), d(e));
    expect(at("2027-02-28").threeYearsEndDate?.toISOString().slice(0, 10)).toBe("2027-02-28");
    expect(at("2027-02-28").status).toBe("under_3y");
    expect(at("2027-03-01").status).toBe("three_years_or_more");
  });

  it("미입력·invalid → unknown · ISO string(복원 레코드)은 정규화", () => {
    expect(resolveSection54_4_2ByBusinessStart(undefined, d("2025-06-30")).status).toBe("unknown");
    expect(resolveSection54_4_2ByBusinessStart(d("2023-03-01"), undefined).status).toBe("unknown");
    expect(resolveSection54_4_2ByBusinessStart(new Date("x"), d("2025-06-30")).status).toBe("unknown");
    expect(resolveSection54_4_2ByBusinessStart("2023-03-01T00:00:00.000Z", "2025-06-30T00:00:00.000Z").status).toBe("under_3y");
  });
});

describe("U-10 엔진 — §54④2호 자동 적용", () => {
  it("A1 사업개시 2023-03-01 · 평가기준일 2025-06-30 · 칩 없음 → 100,000 · 총 500,000,000 (종전 261,372 · 1,306,860,000)", () => {
    const r = evaluateUnlistedStockV2(base({ businessStartDate: "2023-03-01", evaluationDate: "2025-06-30" }));
    expect(r.goodwillCalculation.goodwillCalc).toBe(284_309_007);
    expect(r.goodwillCalculation.goodwillFinal).toBe(0);
    expect(r.goodwillCalculation.excludedByLaw).toBe("lt3y");
    expect(r.netAssetPerShare).toBe(100_000);
    expect(r.finalPerShareValue).toBe(100_000);
    expect(r.totalValuation).toBe(500_000_000);
    expect(r.section54_4_2ByBusinessStart?.status).toBe("under_3y");
    expect(r.section54_4_2ByBusinessStart?.threeYearsEndDate.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(r.appliedRules.some((x) => x.includes("상증령 §54 ④ 2호") && x.includes("2026-03-01"))).toBe(true);
    // Q-2 — §55③2호 단서 가·나목 미반영 고지
    expect(r.warnings.some((x) => x.includes("가·나목") && x.includes("확인 필요"))).toBe(true);
  });

  it("같은 입력에 lt3y 칩을 켠 값과 같다", () => {
    const auto = evaluateUnlistedStockV2(base({ businessStartDate: "2023-03-01", evaluationDate: "2025-06-30" }));
    const chip = evaluateUnlistedStockV2(base({ businessStartDate: "2023-03-01", evaluationDate: "2025-06-30", reason: "lt3y" }));
    expect(chip.totalValuation).toBe(500_000_000);
    expect(auto.totalValuation).toBe(chip.totalValuation);
  });

  it("A2·A4 만료일 전·전날·당일(2026-02-27·02-28·03-01) → 100,000 · 500,000,000", () => {
    for (const e of ["2026-02-27", "2026-02-28", "2026-03-01"]) {
      const r = evaluateUnlistedStockV2(base({ businessStartDate: "2023-03-01", evaluationDate: e }));
      expect(r.finalPerShareValue, e).toBe(100_000);
      expect(r.totalValuation, e).toBe(500_000_000);
    }
  });

  it("A3 만료일 다음 날(2026-03-02) → 본칙 261,372 · 1,306,860,000 (회귀 가드)", () => {
    const r = evaluateUnlistedStockV2(base({ businessStartDate: "2023-03-01", evaluationDate: "2026-03-02" }));
    expect(r.finalPerShareValue).toBe(261_372);
    expect(r.totalValuation).toBe(1_306_860_000);
    expect(r.section54_4_2ByBusinessStart).toBeUndefined();
    expect(r.warnings.some((x) => x.includes("가·나목"))).toBe(false);
  });

  it("A5 사업개시 전(개시 2025-08-01 · 평가기준일 2025-06-30 · 소득 0) → 100,000 · 500,000,000 (종전 엔진 80,000 · ⑧·⑫ 차단)", () => {
    const r = evaluateUnlistedStockV2(
      base({ businessStartDate: "2025-08-01", evaluationDate: "2025-06-30", incomes: [0, 0, 0] }),
    );
    expect(r.finalPerShareValue).toBe(100_000);
    expect(r.totalValuation).toBe(500_000_000);
    expect(r.section54_4_2ByBusinessStart?.status).toBe("pre_start");
    expect(r.appliedRules.some((x) => x.includes("사업개시 전의 법인"))).toBe(true);
  });

  it("A6 6호(remaining_3y) + 3년 미만 → 영업권 2호로 배제 · 100,000 · 500,000,000 (종전 128,430 · 642,150,000)", () => {
    const r = evaluateUnlistedStockV2(
      base({ businessStartDate: "2023-03-01", evaluationDate: "2025-06-30", reason: "remaining_3y" }),
    );
    expect(r.goodwillCalculation.excludedByLaw).toBe("lt3y");
    expect(r.totalValuation).toBe(500_000_000);
    // 3년 이상이면 6호만 — 영업권 합산 유지
    const later = evaluateUnlistedStockV2(
      base({ businessStartDate: "2023-03-01", evaluationDate: "2026-03-02", reason: "remaining_3y" }),
    );
    expect(later.finalPerShareValue).toBe(128_430);
    expect(later.totalValuation).toBe(642_150_000);
  });

  it("A7 5호(stock_holding_80) + 2026-02-27(단서 시행) + 3년 미만 → 2호 우선 100,000 · 500,000,000 (종전 261,372)", () => {
    const r = evaluateUnlistedStockV2(
      base({ businessStartDate: "2023-03-01", evaluationDate: "2026-02-27", reason: "stock_holding_80" }),
    );
    expect(r.finalPerShareValue).toBe(100_000);
    expect(r.totalValuation).toBe(500_000_000);
    const later = evaluateUnlistedStockV2(
      base({ businessStartDate: "2023-03-01", evaluationDate: "2026-03-02", reason: "stock_holding_80" }),
    );
    expect(later.finalPerShareValue).toBe(261_372);
    expect(later.totalValuation).toBe(1_306_860_000);
  });

  it("A8 3호(real_estate_80) + 2026-02-27 + 3년 미만 → 단서 판정 없이 100,000 · 500,000,000 (종전 250,000) · 영업권 라벨 §55③1호 유지", () => {
    const r = evaluateUnlistedStockV2(
      base({ businessStartDate: "2023-03-01", evaluationDate: "2026-02-27", reason: "real_estate_80" }),
    );
    expect(r.goodwillCalculation.excludedByLaw).toBe("real_estate_80");
    expect(r.finalPerShareValue).toBe(100_000);
    expect(r.totalValuation).toBe(500_000_000);
  });

  it("C5 사용자 lt3y + 사업개시일 기준 3년 이상 → 존중(휴업·폐업) + warnings 한 줄", () => {
    const r = evaluateUnlistedStockV2(
      base({ businessStartDate: "2010-01-01", evaluationDate: "2025-06-30", reason: "lt3y" }),
    );
    expect(r.finalPerShareValue).toBe(100_000);
    expect(r.section54_4_2ByBusinessStart).toBeUndefined();
    expect(r.warnings.some((x) => x.includes("기준 3년 이상") && x.includes("휴업"))).toBe(true);
  });

  it("C6 사용자 1호(liquidation) + 3년 미만 → 100,000 · 영업권 라벨 §55③1호 유지", () => {
    const r = evaluateUnlistedStockV2(
      base({ businessStartDate: "2023-03-01", evaluationDate: "2025-06-30", reason: "liquidation" }),
    );
    expect(r.goodwillCalculation.excludedByLaw).toBe("liquidation");
    expect(r.finalPerShareValue).toBe(100_000);
  });

  it("C10 자기주식 일시보유 + 3년 미만 → lt3y 칩을 켠 값과 같다(solver netAssetOnly)", () => {
    const withTreasury = (reason?: UnlistedNetAssetOnlyReason) => ({
      ...base({ businessStartDate: "2023-03-01", evaluationDate: "2025-06-30", reason }),
      treasuryStock: { shares: 1_000, purpose: "temporary_holding" as const },
    });
    const auto = evaluateUnlistedStockV2(withTreasury());
    const chip = evaluateUnlistedStockV2(withTreasury("lt3y"));
    expect(auto.finalPerShareValue).toBe(chip.finalPerShareValue);
    expect(auto.totalValuation).toBe(chip.totalValuation);
  });

  it("C12 3년 미만 + 3년 계속 결손 → 영업권 배제 라벨은 2호(lt3y) 우선", () => {
    const r = evaluateUnlistedStockV2({
      ...base({ businessStartDate: "2023-03-01", evaluationDate: "2025-06-30" }),
      isContinuousLossLastThreeYears: true,
    });
    expect(r.goodwillCalculation.excludedByLaw).toBe("lt3y");
  });

  it("C16 사업개시일 미입력 → 자동 판정 안 함(종전 본칙 261,372)", () => {
    const r = evaluateUnlistedStockV2(base({ evaluationDate: "2025-06-30" }));
    expect(r.finalPerShareValue).toBe(261_372);
    expect(r.section54_4_2ByBusinessStart).toBeUndefined();
  });
});

describe("U-10 ⑧·⑫ — 「평가기준일 < 사업개시일」 차단 제거 · 사업개시일 필수", () => {
  it("A5 사업개시 전: ⑧ null · Zod 통과 (종전 「평가기준일은 사업개시일 이후여야 합니다」·400)", () => {
    const v2 = base({ businessStartDate: "2025-08-01", evaluationDate: "2025-06-30", incomes: [0, 0, 0] });
    expect(validateUnlistedStockV2(item(v2))).toBeNull();
    expect(unlistedStockValuationV2Schema.safeParse(v2).success).toBe(true);
  });

  it("A9 화면 초기값은 사업개시일이 비어 있다 → ⑧ 「사업개시일을 입력해야 합니다」 · Zod 실패(⑧↔⑫ 정합)", () => {
    const def = createDefaultUnlistedStockV2();
    expect(def.businessStartDate).toBeUndefined();
    const filled: UnlistedStockValuationInput = {
      ...base({ evaluationDate: "2017-06-30" }),
      businessStartDate: def.businessStartDate,
    };
    expect(validateUnlistedStockV2(item(filled))).toContain("사업개시일을 입력해야 합니다");
    expect(unlistedStockValuationV2Schema.safeParse(filled).success).toBe(false);
    // 같은 입력에 실제 사업개시일을 넣으면 통과
    const entered = { ...filled, businessStartDate: d("2010-01-01") };
    expect(validateUnlistedStockV2(item(entered))).toBeNull();
    expect(evaluateUnlistedStockV2(entered).finalPerShareValue).toBe(261_372);
  });
});

describe("U-10 C20 — 부담부증여 양도세 안분 분모 C(정식평가 V2 평가액)도 따라 바뀐다", () => {
  it("A1 입력 · 실지취득가 1억 · 채무 2억 → C 500,000,000 기준 1주당 안분취득가 8,000 (종전 C 1,306,860,000 → 3,060)", () => {
    const bg = {
      id: "bg",
      name: "신설법인",
      category: "unlisted_stock",
      assumedDebtForGift: 200_000_000,
      unlistedValuationMode: "formal",
      unlistedStockValuationV2: base({ businessStartDate: "2023-03-01", evaluationDate: "2025-06-30" }),
      burdenedGiftStockTransferTax: {
        marketType: "unlisted",
        acquisitionDate: "2023-03-01",
        acquisitionMode: "actual",
        actualAcquisitionPrice: 100_000_000,
      },
    } as unknown as EstateItem;
    const body = buildGiftStockBurdenedTransferBody(bg, { giftDate: "2025-06-30" } as unknown as FormState);
    expect(body.shareCount).toBe(5_000);
    expect(body.perShareAcquisitionPrice).toBe(8_000);
  });
});
