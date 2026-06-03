/**
 * H-5 anchor — sessionStorage round-trip 후 validateUnlistedStockV2 Date 직렬화 버그
 *
 * 버그: JSON.parse(JSON.stringify(form)) 시 Date 객체가 ISO 문자열로 변환됨.
 *   validateUnlistedStockV2는 `instanceof Date` 검사 → string은 false → 진행 불가.
 *
 * 수정 1차 (근본): normalizeRestoredFormDates — 복원 시점 Date 객체 복원
 * 수정 2차 (방어): validateUnlistedStockV2 — toOptionalDate로 instanceof Date 대체
 *
 * 수정 범위:
 *   - components/calc/inheritance/normalize-restored-form-dates.ts (신규)
 *   - components/calc/InheritanceTaxForm.tsx — 복원 시점 정규화 적용
 *   - lib/calc/inheritance-validate.ts — toOptionalDate로 방어 완화
 */

import { describe, it, expect } from "vitest";
import { validateUnlistedStockV2 } from "@/lib/calc/inheritance-validate";
import { normalizeRestoredFormDates } from "@/components/calc/inheritance/normalize-restored-form-dates";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type {
  UnlistedNetAssetCalculation,
  FiscalYearAdjustment,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

const EMPTY_NET_ASSET: UnlistedNetAssetCalculation = {
  bsTotalAssets: 0,
  assetValuationDelta: 0,
  corpTaxReservedAmount: 0,
  paidInCapitalIncrease: 0,
  otherEarnedRights: 0,
  prepaidExpenses: 0,
  preGiftRetainedEarnings: 0,
  bsTotalLiabilities: 0,
  corporateTaxPayable: 0,
  farmingSurtax: 0,
  localIncomeTax: 0,
  dividendPayable: 0,
  retirementProvision: 0,
  otherProvision: 0,
  reserveExcluded: 0,
  allowanceExcluded: 0,
  deferredTaxAdjustment: 0,
};

function emptyFY(label: string, endDate: Date): FiscalYearAdjustment {
  return { fiscalYearLabel: label, fiscalYearEndDate: endDate, taxableIncome: 0 };
}

/** Date 객체를 가진 정상 V2 비상장주식 EstateItem */
function makeV2Item(): EstateItem {
  return {
    id: "test-v2-stock",
    category: "unlisted_stock",
    name: "테스트V2비상장",
    unlistedStockValuationV2: {
      corpName: "테스트법인",
      businessStartDate: new Date("2010-01-01"),
      evaluationDate: new Date("2024-01-20"),
      faceValuePerShare: 5_000,
      totalShares: 10_000,
      ownedShares: 5_000,
      isRealEstateHeavy: false,
      fiscalYears: [
        emptyFY("2023", new Date("2023-12-31")),
        emptyFY("2022", new Date("2022-12-31")),
        emptyFY("2021", new Date("2021-12-31")),
      ],
      capitalChanges: [
        {
          changeType: "paid_in",
          changeDate: new Date("2022-03-15"),
          sharesIssued: 1_000,
          pricePerShare: 10_000,
        },
      ],
      netAssetValueRaw: { ...EMPTY_NET_ASSET },
      isContinuousLossLastThreeYears: false,
      capitalizationRate: 0.10,
      isMaxShareholder: false,
      companySize: "large",
    } as EstateItem["unlistedStockValuationV2"],
  };
}

/** JSON round-trip 시뮬레이션 (sessionStorage 복원 시 동일 현상) */
function jsonRoundTrip<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

// ============================================================
// H-5: round-trip 전·후 동작 차이 실증 + 수정 검증
// ============================================================

describe("[H-5] sessionStorage round-trip 후 validateUnlistedStockV2 Date 직렬화", () => {
  it("① 정상 입력(Date 객체) → validate 통과 (null)", () => {
    const item = makeV2Item();
    expect(item.unlistedStockValuationV2?.fiscalYears[0].fiscalYearEndDate).toBeInstanceOf(Date);
    const err = validateUnlistedStockV2(item, { evaluationDateFallback: "2024-01-20" });
    expect(err).toBeNull();
  });

  it("② round-trip 후 → Date 필드가 string으로 변환됨 [버그 원인 확인]", () => {
    const item = jsonRoundTrip(makeV2Item());
    expect(typeof item.unlistedStockValuationV2?.fiscalYears[0].fiscalYearEndDate).toBe("string");
    expect(typeof item.unlistedStockValuationV2?.businessStartDate).toBe("string");
    expect(typeof item.unlistedStockValuationV2?.capitalChanges[0].changeDate).toBe("string");
  });

  it("③ 2차 방어 — round-trip 후에도 validate가 toOptionalDate로 string ISO 처리 → 통과 (null)", () => {
    // validateUnlistedStockV2에 instanceof Date 대신 toOptionalDate 적용 후 검증
    const item = jsonRoundTrip(makeV2Item());
    const err = validateUnlistedStockV2(item, { evaluationDateFallback: "2024-01-20" });
    // 수정 후: null (통과)
    expect(err).toBeNull();
  });

  it("④ 1차 근본 수정 — normalizeRestoredFormDates가 Date 필드를 Date 객체로 복원", () => {
    const rawParsed = jsonRoundTrip({
      deathDate: "2024-01-20",
      estateItems: [makeV2Item()],
      stockItems: [] as EstateItem[],
    });
    // 정규화 전: string
    expect(typeof rawParsed.estateItems[0].unlistedStockValuationV2?.fiscalYears[0].fiscalYearEndDate).toBe("string");

    // 정규화 후: Date 객체
    const normalized = normalizeRestoredFormDates(rawParsed);
    const v2 = normalized.estateItems[0]?.unlistedStockValuationV2;
    expect(v2?.fiscalYears[0].fiscalYearEndDate).toBeInstanceOf(Date);
    expect(v2?.fiscalYears[1].fiscalYearEndDate).toBeInstanceOf(Date);
    expect(v2?.fiscalYears[2].fiscalYearEndDate).toBeInstanceOf(Date);
    expect(v2?.businessStartDate).toBeInstanceOf(Date);
    expect(v2?.evaluationDate).toBeInstanceOf(Date);
    expect(v2?.capitalChanges[0].changeDate).toBeInstanceOf(Date);
  });

  it("⑤ 1차 근본 수정 + validate — 정규화 후 validate 통과 (null)", () => {
    const rawParsed = jsonRoundTrip({
      deathDate: "2024-01-20",
      estateItems: [makeV2Item()],
      stockItems: [] as EstateItem[],
    });
    const normalized = normalizeRestoredFormDates(rawParsed);
    const err = validateUnlistedStockV2(normalized.estateItems[0], { evaluationDateFallback: "2024-01-20" });
    expect(err).toBeNull();
  });

  it("⑥ normalizeRestoredFormDates — capitalChanges.changeDate undefined 보존", () => {
    const item = makeV2Item();
    // changeDate를 undefined로
    if (item.unlistedStockValuationV2) {
      item.unlistedStockValuationV2.capitalChanges = [
        { changeType: "free_issue", changeDate: undefined, sharesIssued: 500 },
      ];
    }
    // round-trip 후 undefined → null (JSON) → toOptionalDate(null) → undefined
    const rawParsed = jsonRoundTrip({ estateItems: [item], stockItems: [] as EstateItem[] });
    const normalized = normalizeRestoredFormDates(rawParsed);
    const changeDate = normalized.estateItems[0]?.unlistedStockValuationV2?.capitalChanges[0].changeDate;
    // undefined 또는 null (toOptionalDate(null) = undefined)
    expect(changeDate == null).toBe(true);
  });

  it("⑦ V1(simple) 비상장주식 — normalizeRestoredFormDates 영향 없음", () => {
    const v1Item: EstateItem = {
      id: "v1-stock",
      category: "unlisted_stock",
      name: "V1비상장",
      unlistedValuationMode: "simple",
      unlistedStockData: {
        totalShares: 10_000,
        ownedShares: 5_000,
        weightedNetIncome: 100_000_000,
        netAssetValue: 5_000_000_000,
        capitalizationRate: 0.1,
      },
    };
    const rawParsed = jsonRoundTrip({ estateItems: [v1Item], stockItems: [] as EstateItem[] });
    const normalized = normalizeRestoredFormDates(rawParsed);
    // V1은 unlistedStockValuationV2 없음 → 영향 없이 그대로
    expect(normalized.estateItems[0].unlistedStockValuationV2).toBeUndefined();
    expect(normalized.estateItems[0].unlistedStockData?.totalShares).toBe(10_000);
  });

  it("⑧ fiscalYearStartDate optional — 입력 시 정규화, 미입력 시 undefined 보존", () => {
    const item = makeV2Item();
    if (item.unlistedStockValuationV2) {
      // fiscalYears[0]에만 startDate 추가
      item.unlistedStockValuationV2.fiscalYears[0].fiscalYearStartDate = new Date("2023-01-01");
    }
    const rawParsed = jsonRoundTrip({ estateItems: [item], stockItems: [] as EstateItem[] });
    const normalized = normalizeRestoredFormDates(rawParsed);
    const v2 = normalized.estateItems[0]?.unlistedStockValuationV2;
    // [0]은 Date 객체로 복원
    expect(v2?.fiscalYears[0].fiscalYearStartDate).toBeInstanceOf(Date);
    // [1][2]는 undefined 유지
    expect(v2?.fiscalYears[1].fiscalYearStartDate).toBeUndefined();
    expect(v2?.fiscalYears[2].fiscalYearStartDate).toBeUndefined();
  });
});
