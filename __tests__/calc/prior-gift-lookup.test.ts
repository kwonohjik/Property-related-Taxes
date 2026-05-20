/**
 * 증여세 사전증여 이력 조회 — 순수 함수 anchor
 *
 * Design §6.1 (PGL-1 ~ PGL-15)
 * Plan §6.1
 */

import { describe, it, expect } from "vitest";
import {
  filterPriorGiftCandidates,
  candidateToPriorGift,
  type PriorGiftCandidate,
} from "@/lib/calc/prior-gift-lookup";
import type { CalculationRecord } from "@/lib/storage/types";

// ============================================================
// fixture 헬퍼
// ============================================================

function makeGiftRecord(opts: {
  id?: string;
  giftDate: string;
  donor?: unknown;
  donorRelation?: string;
  isGenerationSkip?: boolean;
  priorGifts?: unknown[];
  result?: Partial<{
    grossGiftValue: number;
    finalTax: number;
    taxBase: number;
    computedTax: number;
    additionalGenerationSkipSurcharge: number;
  }> | null;
  createdAt?: string;
  title?: string;
}): CalculationRecord {
  const donor = "donor" in opts ? opts.donor : "father";
  const {
    id = `id-${opts.giftDate}`,
    giftDate,
    donorRelation = "lineal_descendant",
    isGenerationSkip = false,
    priorGifts = [],
    result = {
      grossGiftValue: 350_000_000,
      finalTax: 48_500_000,
      taxBase: 300_000_000,
      computedTax: 50_000_000,
      additionalGenerationSkipSurcharge: 0,
    },
    createdAt = `${giftDate}T00:00:00.000Z`,
    title = `증여세 ${giftDate}`,
  } = opts;

  return {
    id,
    userId: "local-user" as never,
    taxType: "gift",
    title,
    inputData: {
      giftDate,
      donor,
      donorRelation,
      isGenerationSkip,
      priorGifts,
    },
    resultData:
      result === null
        ? ({} as Record<string, unknown>)
        : { success: true, result },
    taxLawVersion: giftDate,
    linkedCalculationId: null,
    clientId: null,
    createdAt,
    updatedAt: createdAt,
  };
}

const CURRENT = "2026-05-20";

// ============================================================
// PGL-1 ~ PGL-15
// ============================================================

describe("filterPriorGiftCandidates — anchor", () => {
  it("PGL-1: 10년 경계 (2016-05-21 vs 2026-05-20) — same_group 후보 포함", () => {
    const records = [makeGiftRecord({ giftDate: "2016-05-21", donor: "father" })];
    const { candidates, warnings } = filterPriorGiftCandidates(records, CURRENT, "father", []);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].matchType).toBe("same_group");
    expect(warnings).toHaveLength(0);
  });

  it("PGL-2: 10년 초과 (2015-05-19 vs 2026-05-20) — 제외", () => {
    const records = [makeGiftRecord({ giftDate: "2015-05-19", donor: "father" })];
    const { candidates, warnings } = filterPriorGiftCandidates(records, CURRENT, "father", []);
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "exceed_10y")).toBeDefined();
  });

  it("PGL-3: mother → father 동일 §47② 그룹", () => {
    const records = [makeGiftRecord({ giftDate: "2021-05-10", donor: "mother" })];
    const { candidates } = filterPriorGiftCandidates(records, CURRENT, "father", []);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].matchType).toBe("same_group");
  });

  it("PGL-4: father vs grandparent — other 그룹", () => {
    const records = [makeGiftRecord({ giftDate: "2021-05-10", donor: "grandparent" })];
    const { candidates } = filterPriorGiftCandidates(records, CURRENT, "father", []);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].matchType).toBe("other");
  });

  it("PGL-5: priorGifts.length > 0 — 포함 + hasInnerPriorGifts=true", () => {
    const records = [
      makeGiftRecord({
        giftDate: "2021-05-10",
        donor: "father",
        priorGifts: [{ giftDate: "2018-01-01", giftAmount: 100_000_000 }],
      }),
    ];
    const { candidates } = filterPriorGiftCandidates(records, CURRENT, "father", []);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].hasInnerPriorGifts).toBe(true);
  });

  it("PGL-6: excludeCalculationIds 포함 — 제외 + warnings.excluded", () => {
    const records = [
      makeGiftRecord({ id: "abc", giftDate: "2021-05-10", donor: "father" }),
    ];
    const { candidates, warnings } = filterPriorGiftCandidates(records, CURRENT, "father", ["abc"]);
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "excluded")).toBeDefined();
  });

  it("PGL-7: candidateToPriorGift — 9필드 + sourceCalculationId 매핑 정확", () => {
    const c: PriorGiftCandidate = {
      calculationId: "abc",
      giftDate: "2021-05-10",
      donor: "father",
      donorRelation: "lineal_descendant",
      grossGiftValue: 350_000_000,
      finalTax: 48_500_000,
      taxBase: 300_000_000,
      computedTax: 50_000_000,
      additionalGenerationSkipSurcharge: 0,
      wasGenerationSkip: false,
      hasInnerPriorGifts: false,
      matchType: "same_group",
      createdAt: "2021-05-10T00:00:00.000Z",
      title: "증여세 2021-05-10",
    };
    const pg = candidateToPriorGift(c);
    expect(pg.giftDate).toBe("2021-05-10");
    expect(pg.donor).toBe("father");
    expect(pg.doneeRelation).toBe("lineal_descendant");
    expect(pg.giftAmount).toBe(350_000_000);
    expect(pg.giftTaxPaid).toBe(48_500_000);
    expect(pg.giftTaxBase).toBe(300_000_000);
    expect(pg.computedTax).toBe(50_000_000);
    expect(pg.additionalGenerationSkipSurcharge).toBe(0);
    expect(pg.wasGenerationSkip).toBe(false);
    expect(pg.sourceCalculationId).toBe("abc");
    expect(pg.isHeir).toBe(true); // default
    // 추론 불가 필드는 미설정
    expect(pg.doneeId).toBeUndefined();
    expect(pg.beneficiaryType).toBeUndefined();
  });

  it("PGL-8: inputData.giftDate ISO string 비교 정확", () => {
    const records = [
      makeGiftRecord({ giftDate: "2020-12-31", donor: "father" }),
    ];
    const { candidates } = filterPriorGiftCandidates(records, "2021-01-01", "father", []);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].giftDate).toBe("2020-12-31");
  });

  it("PGL-9: resultData.result 누락 손상 레코드 — warnings.result_missing, throw 없음", () => {
    const records = [makeGiftRecord({ giftDate: "2021-05-10", donor: "father", result: null })];
    expect(() => filterPriorGiftCandidates(records, CURRENT, "father", [])).not.toThrow();
    const { candidates, warnings } = filterPriorGiftCandidates(records, CURRENT, "father", []);
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "result_missing")).toBeDefined();
  });

  it("PGL-10: donor undefined — warnings.donor_missing", () => {
    const records = [makeGiftRecord({ giftDate: "2021-05-10", donor: undefined })];
    const { candidates, warnings } = filterPriorGiftCandidates(records, CURRENT, "father", []);
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "donor_missing")).toBeDefined();
  });

  it("PGL-11: donor 비-enum 문자열 (legacy 손상) — warnings.donor_missing", () => {
    const records = [makeGiftRecord({ giftDate: "2021-05-10", donor: "stranger" })];
    const { candidates, warnings } = filterPriorGiftCandidates(records, CURRENT, "father", []);
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "donor_missing")).toBeDefined();
  });

  it("PGL-12: 미래 일자 — warnings.future_date", () => {
    const records = [makeGiftRecord({ giftDate: "2027-01-01", donor: "father" })];
    const { candidates, warnings } = filterPriorGiftCandidates(records, CURRENT, "father", []);
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "future_date")).toBeDefined();
  });

  it("PGL-13: 2건 — giftDate desc 정렬 (최근 우선)", () => {
    const records = [
      makeGiftRecord({ id: "old", giftDate: "2019-03-22", donor: "father" }),
      makeGiftRecord({ id: "new", giftDate: "2021-05-10", donor: "father" }),
    ];
    const { candidates } = filterPriorGiftCandidates(records, CURRENT, "father", []);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].calculationId).toBe("new");
    expect(candidates[1].calculationId).toBe("old");
  });

  it("PGL-14: additionalGenerationSkipSurcharge undefined → 0", () => {
    const records = [
      makeGiftRecord({
        giftDate: "2021-05-10",
        donor: "grandparent",
        result: {
          grossGiftValue: 100_000_000,
          finalTax: 9_700_000,
          taxBase: 50_000_000,
          computedTax: 5_000_000,
          // additionalGenerationSkipSurcharge 누락
        },
      }),
    ];
    const { candidates } = filterPriorGiftCandidates(records, CURRENT, "grandparent", []);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].additionalGenerationSkipSurcharge).toBe(0);
  });

  it("PGL-15: finalTax undefined → 0, taxType=inheritance 레코드 silent skip", () => {
    const records: CalculationRecord[] = [
      makeGiftRecord({
        giftDate: "2021-05-10",
        donor: "father",
        result: {
          grossGiftValue: 100_000_000,
          taxBase: 50_000_000,
          computedTax: 5_000_000,
          // finalTax 누락
        },
      }),
      {
        ...makeGiftRecord({ giftDate: "2020-01-01" }),
        taxType: "inheritance",
        id: "inh-1",
      },
    ];
    const { candidates, warnings } = filterPriorGiftCandidates(records, CURRENT, "father", []);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].finalTax).toBe(0);
    // inheritance 레코드는 silent skip — warnings에도 없음
    expect(warnings.find((w) => w.calculationId === "inh-1")).toBeUndefined();
  });
});
