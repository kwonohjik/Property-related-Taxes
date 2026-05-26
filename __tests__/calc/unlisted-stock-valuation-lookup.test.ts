/**
 * PR-H — 비상장주식 평가 이력 자동조회 모달 anchor (필터·변환 unit)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-history-lookup.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-history-lookup.design.md
 */

import { describe, it, expect } from "vitest";
import {
  filterUnlistedStockCandidates,
  candidateToUnlistedStockInput,
  type UnlistedStockCandidate,
} from "@/lib/calc/unlisted-stock-valuation-lookup";
import type { CalculationRecord } from "@/lib/storage/types";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// ============================================================
// 사례 6 (㈜향기) 기반 fixture — 단일 진실 (case-5a-integration.test.ts 동일 값)
// ============================================================

const case6V2Input: UnlistedStockValuationInput = {
  corpName: "㈜향기",
  businessStartDate: new Date("2000-01-01"),
  evaluationDate: new Date("2024-01-20"),
  faceValuePerShare: 5_000,
  totalShares: 50_000,
  ownedShares: 26_000,
  isRealEstateHeavy: false,
  fiscalYears: [
    { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 76_842_660 },
    { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 62_416_500 },
    { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: -5_311_910 },
  ],
  capitalChanges: [],
  netAssetValueRaw: {
    bsTotalAssets: 2_476_889_520, assetValuationDelta: 91_548_350,
    corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
    prepaidExpenses: 65_400_500, preGiftRetainedEarnings: 0,
    bsTotalLiabilities: 1_833_780_000, corporateTaxPayable: 32_627_890,
    farmingSurtax: 0, localIncomeTax: 3_262_780, dividendPayable: 0,
    retirementProvision: 445_785_000, otherProvision: 0,
    reserveExcluded: 0, allowanceExcluded: 301_770_000, deferredTaxAdjustment: 0,
  },
  isContinuousLossLastThreeYears: false,
  capitalizationRate: 0.10,
  isMaxShareholder: true,
  companySize: "large",
};

function makeRecord(
  id: string,
  taxType: "inheritance" | "gift",
  items: Array<{ id: string; v2: UnlistedStockValuationInput }>,
  options: Partial<{ clientId: string | null; createdAt: string; title: string }> = {},
): CalculationRecord {
  return {
    id,
    userId: "local-user",
    taxType,
    title: options.title ?? `${taxType}-${id}`,
    inputData: {
      [taxType === "inheritance" ? "estateItems" : "giftItems"]: items.map((it) => ({
        id: it.id,
        category: "unlisted_stock",
        unlistedStockValuationV2: {
          ...it.v2,
          // JSON round-trip 시뮬레이션: Date → ISO string
          businessStartDate: it.v2.businessStartDate.toISOString(),
          evaluationDate: it.v2.evaluationDate.toISOString(),
          fiscalYears: it.v2.fiscalYears.map((fy) => ({
            ...fy,
            fiscalYearEndDate: fy.fiscalYearEndDate.toISOString(),
          })),
          capitalChanges: it.v2.capitalChanges.map((c) => ({
            ...c,
            changeDate: c.changeDate?.toISOString(),
          })),
        },
      })),
    },
    resultData: {
      estateValuations: items.map((it) => ({
        estateItemId: it.id,
        method: "book_value",
        valuatedAmount: 340_392_000,
        breakdown: [
          { label: "1주당 평가액 ⑥", value: 10_910 },
          { label: "1주당 순자산가치 ④", value: 9_787 },
        ],
      })),
    },
    taxLawVersion: "2024-01-01",
    linkedCalculationId: null,
    clientId: options.clientId ?? null,
    createdAt: options.createdAt ?? "2024-01-21T00:00:00.000Z",
    updatedAt: options.createdAt ?? "2024-01-21T00:00:00.000Z",
  };
}

// ============================================================
// H-1 ~ H-9: 필터·후보 추출
// ============================================================

describe("[H-1~H-9] filterUnlistedStockCandidates", () => {
  it("H-1: 동일 법인 1건 매칭 (상속)", () => {
    const records = [makeRecord("r1", "inheritance", [{ id: "stock-1", v2: case6V2Input }])];
    const result = filterUnlistedStockCandidates(records, null, "㈜향기", []);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].corpName).toBe("㈜향기");
    expect(result.candidates[0].calculationId).toBe("r1-stock-1");
    expect(result.candidates[0].sourceTaxType).toBe("inheritance");
    expect(result.candidates[0].totalValuation).toBe(340_392_000);
    expect(result.candidates[0].finalPerShareValue).toBe(10_910);
  });

  it("H-2: 동일 + 다른 법인 혼재 → corpName 필터", () => {
    const corpB = { ...case6V2Input, corpName: "㈜B" };
    const records = [
      makeRecord("r1", "inheritance", [{ id: "s1", v2: case6V2Input }]),
      makeRecord("r2", "inheritance", [{ id: "s2", v2: case6V2Input }]),
      makeRecord("r3", "inheritance", [{ id: "s3", v2: corpB }]),
    ];
    const result = filterUnlistedStockCandidates(records, null, "㈜향기", []);
    expect(result.candidates).toHaveLength(2);
    expect(result.warnings.filter((w) => w.reason === "different_corp")).toHaveLength(1);
  });

  it("H-3: corpName 누락 → warnings.corp_missing", () => {
    const empty = { ...case6V2Input, corpName: "" };
    const records = [makeRecord("r1", "inheritance", [{ id: "s1", v2: empty }])];
    const result = filterUnlistedStockCandidates(records, null, undefined, []);
    expect(result.candidates).toHaveLength(0);
    expect(result.warnings.filter((w) => w.reason === "corp_missing")).toHaveLength(1);
  });

  it("H-4: result 누락 → 카드는 표시 (finalPerShareValue=0)", () => {
    const records = [makeRecord("r1", "inheritance", [{ id: "s1", v2: case6V2Input }])];
    records[0].resultData = {}; // result 비움
    const result = filterUnlistedStockCandidates(records, null, undefined, []);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].finalPerShareValue).toBe(0);
    expect(result.candidates[0].totalValuation).toBe(0);
  });

  it("H-5: excludeCalculationIds → warnings.excluded", () => {
    const records = [makeRecord("r1", "inheritance", [{ id: "s1", v2: case6V2Input }])];
    const result = filterUnlistedStockCandidates(records, null, undefined, ["r1-s1"]);
    expect(result.candidates).toHaveLength(0);
    expect(result.warnings.filter((w) => w.reason === "excluded")).toHaveLength(1);
  });

  it("H-6: 다른 의뢰인 격리 → warnings.different_client", () => {
    const records = [
      makeRecord("r1", "inheritance", [{ id: "s1", v2: case6V2Input }], { clientId: "client-A" }),
    ];
    const result = filterUnlistedStockCandidates(records, "client-B", undefined, []);
    expect(result.candidates).toHaveLength(0);
    expect(result.warnings.filter((w) => w.reason === "different_client")).toHaveLength(1);
  });

  it("H-7: 상속·증여 cross 조회 (Q6 A안)", () => {
    const records = [
      makeRecord("r1", "inheritance", [{ id: "s1", v2: case6V2Input }]),
      makeRecord("r2", "gift", [{ id: "s2", v2: case6V2Input }]),
    ];
    const result = filterUnlistedStockCandidates(records, null, "㈜향기", []);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.sourceTaxType).sort()).toEqual(["gift", "inheritance"]);
  });

  it("H-8: 빈 records → []", () => {
    const result = filterUnlistedStockCandidates([], null, undefined, []);
    expect(result.candidates).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("H-9: 정렬 evaluationDate desc", () => {
    const v2_2024 = { ...case6V2Input, evaluationDate: new Date("2024-01-20") };
    const v2_2023 = { ...case6V2Input, evaluationDate: new Date("2023-06-15") };
    const v2_2022 = { ...case6V2Input, evaluationDate: new Date("2022-12-31") };
    const records = [
      makeRecord("r2023", "inheritance", [{ id: "s1", v2: v2_2023 }]),
      makeRecord("r2024", "inheritance", [{ id: "s1", v2: v2_2024 }]),
      makeRecord("r2022", "inheritance", [{ id: "s1", v2: v2_2022 }]),
    ];
    const result = filterUnlistedStockCandidates(records, null, undefined, []);
    expect(result.candidates.map((c) => c.evaluationDate)).toEqual([
      "2024-01-20",
      "2023-06-15",
      "2022-12-31",
    ]);
  });
});

// ============================================================
// H-10 ~ H-15: candidateToUnlistedStockInput 변환
// ============================================================

describe("[H-10~H-15] candidateToUnlistedStockInput", () => {
  function makeCandidate(overrides?: Partial<UnlistedStockValuationInput>): UnlistedStockCandidate {
    const fullInput = { ...case6V2Input, ...overrides };
    return {
      calculationId: "r1-s1",
      recordId: "r1",
      itemId: "s1",
      clientId: null,
      corpName: fullInput.corpName,
      evaluationDate: fullInput.evaluationDate.toISOString().slice(0, 10),
      totalShares: fullInput.totalShares,
      faceValuePerShare: fullInput.faceValuePerShare,
      finalPerShareValue: 10_910,
      totalValuation: 340_392_000,
      sourceTaxType: "inheritance",
      createdAt: "2024-01-21T00:00:00.000Z",
      title: "test",
      fullInput,
    };
  }

  it("H-10: Q1 B안 — 법인 정보만 prefill (evaluationDate·ownedShares·isMaxShareholder 제외)", () => {
    const c = makeCandidate();
    const partial = candidateToUnlistedStockInput(c);
    // 포함
    expect(partial.corpName).toBe("㈜향기");
    expect(partial.businessStartDate).toEqual(new Date("2000-01-01"));
    expect(partial.faceValuePerShare).toBe(5_000);
    expect(partial.totalShares).toBe(50_000);
    expect(partial.fiscalYears).toBeDefined();
    expect(partial.netAssetValueRaw).toBeDefined();
    expect(partial.companySize).toBe("large");
    // 제외 (Q1 B안 + Q7 A안)
    expect(partial.evaluationDate).toBeUndefined();
    expect(partial.ownedShares).toBeUndefined();
    expect(partial.isMaxShareholder).toBeUndefined();
  });

  it("H-11: capitalChanges 복사", () => {
    const c = makeCandidate({
      capitalChanges: [
        { changeType: "paid_in", changeDate: new Date("2023-06-30"), sharesIssued: 5_000, pricePerShare: 5_000 },
      ],
    });
    const partial = candidateToUnlistedStockInput(c);
    expect(partial.capitalChanges).toHaveLength(1);
    expect(partial.capitalChanges?.[0].sharesIssued).toBe(5_000);
  });

  it("H-12: evaluationDeltaRows (PR-N) 복사", () => {
    const c = makeCandidate({
      netAssetValueRaw: {
        ...case6V2Input.netAssetValueRaw,
        evaluationDeltaRows: [
          { rowId: "row-1", category: "asset", accountName: "토지", evaluationAmount: 100_000_000, bookAmount: 80_000_000 },
        ],
      },
    });
    const partial = candidateToUnlistedStockInput(c);
    expect(partial.netAssetValueRaw?.evaluationDeltaRows).toHaveLength(1);
    expect(partial.netAssetValueRaw?.evaluationDeltaRows?.[0].accountName).toBe("토지");
  });

  it("H-13: netAssetOnlyReason 보존", () => {
    const c = makeCandidate({ netAssetOnlyReason: "liquidation" });
    const partial = candidateToUnlistedStockInput(c);
    expect(partial.netAssetOnlyReason).toBe("liquidation");
  });

  it("H-14: 보험사업 3필드 (PR-M) 보존", () => {
    const c = makeCandidate({
      netAssetValueRaw: {
        ...case6V2Input.netAssetValueRaw,
        insuranceReservePolicy: 100_000_000,
        insuranceExtraordinaryReserve: 50_000_000,
        insuranceSurrenderReserve: 30_000_000,
      },
    });
    const partial = candidateToUnlistedStockInput(c);
    expect(partial.netAssetValueRaw?.insuranceReservePolicy).toBe(100_000_000);
    expect(partial.netAssetValueRaw?.insuranceExtraordinaryReserve).toBe(50_000_000);
    expect(partial.netAssetValueRaw?.insuranceSurrenderReserve).toBe(30_000_000);
  });

  it("H-15: Date round-trip — filterUnlistedStockCandidates → fullInput.businessStartDate는 Date 인스턴스", () => {
    const records = [makeRecord("r1", "inheritance", [{ id: "s1", v2: case6V2Input }])];
    const result = filterUnlistedStockCandidates(records, null, "㈜향기", []);
    const c = result.candidates[0];
    expect(c.fullInput.businessStartDate).toBeInstanceOf(Date);
    expect(c.fullInput.evaluationDate).toBeInstanceOf(Date);
    expect(c.fullInput.fiscalYears[0].fiscalYearEndDate).toBeInstanceOf(Date);
  });
});

// makeRecord 헬퍼는 H-15에서 한 번 더 import 필요 — 위에서 정의됨
