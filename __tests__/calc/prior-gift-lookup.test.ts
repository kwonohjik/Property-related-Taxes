/**
 * 증여세 사전증여 이력 조회 — 순수 함수 anchor
 *
 * 동일인 매칭 = 이름 + 생년월일 정확 일치 (v2 정책).
 * §47 그룹 매칭은 정보 표시용으로만 사용.
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

const DEFAULT_NAME = "홍길동";
const DEFAULT_BIRTH = "1960-01-15";

function makeGiftRecord(opts: {
  id?: string;
  giftDate: string;
  donor?: unknown;
  donorName?: string | undefined;
  donorBirthDate?: string | undefined;
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
  const donorName = "donorName" in opts ? opts.donorName : DEFAULT_NAME;
  const donorBirthDate =
    "donorBirthDate" in opts ? opts.donorBirthDate : DEFAULT_BIRTH;
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
      donorName,
      donorBirthDate,
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
// PGL-1 ~ PGL-17 (v2: 이름+생년월일 동일인 매칭)
// ============================================================

describe("filterPriorGiftCandidates — 동일인(이름+생년월일) 매칭 anchor", () => {
  it("PGL-1: 10년 경계 + 이름·생년월일 일치 → 후보 포함", () => {
    const records = [makeGiftRecord({ giftDate: "2016-05-21" })];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });

  it("PGL-2: 10년 초과 → warnings.exceed_10y", () => {
    const records = [makeGiftRecord({ giftDate: "2015-05-19" })];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "exceed_10y")).toBeDefined();
  });

  it("PGL-3: 이름 일치 + 생년월일 다름 → 제외 + warnings.different_person", () => {
    const records = [
      makeGiftRecord({ giftDate: "2021-05-10", donorBirthDate: "1965-03-20" }),
    ];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "different_person")).toBeDefined();
  });

  it("PGL-4: 이름 다름 → 제외 + warnings.different_person", () => {
    const records = [
      makeGiftRecord({ giftDate: "2021-05-10", donorName: "김철수" }),
    ];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "different_person")).toBeDefined();
  });

  it("PGL-5: priorGifts.length > 0 → 포함 + hasInnerPriorGifts=true", () => {
    const records = [
      makeGiftRecord({
        giftDate: "2021-05-10",
        priorGifts: [{ giftDate: "2018-01-01", giftAmount: 100_000_000 }],
      }),
    ];
    const { candidates } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].hasInnerPriorGifts).toBe(true);
  });

  it("PGL-6: excludeCalculationIds → 제외 + warnings.excluded", () => {
    const records = [makeGiftRecord({ id: "abc", giftDate: "2021-05-10" })];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      ["abc"],
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "excluded")).toBeDefined();
  });

  it("PGL-7: candidateToPriorGift — 9필드 + sourceCalculationId 매핑 정확", () => {
    const c: PriorGiftCandidate = {
      calculationId: "abc",
      giftDate: "2021-05-10",
      donorName: DEFAULT_NAME,
      donorBirthDate: DEFAULT_BIRTH,
      donor: "father",
      donorRelation: "lineal_descendant",
      grossGiftValue: 350_000_000,
      finalTax: 48_500_000,
      taxBase: 300_000_000,
      computedTax: 50_000_000,
      additionalGenerationSkipSurcharge: 0,
      wasGenerationSkip: false,
      hasInnerPriorGifts: false,
      createdAt: "2021-05-10T00:00:00.000Z",
      title: "증여세 2021-05-10",
    };
    const pg = candidateToPriorGift(c);
    expect(pg.giftDate).toBe("2021-05-10");
    expect(pg.donor).toBe("father");
    expect(pg.giftAmount).toBe(350_000_000);
    expect(pg.giftTaxPaid).toBe(48_500_000);
    expect(pg.giftTaxBase).toBe(300_000_000);
    expect(pg.computedTax).toBe(50_000_000);
    expect(pg.sourceCalculationId).toBe("abc");
  });

  it("PGL-8: inputData.giftDate ISO string 비교 정확", () => {
    const records = [makeGiftRecord({ giftDate: "2020-12-31" })];
    const { candidates } = filterPriorGiftCandidates(
      records,
      "2021-01-01",
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(1);
  });

  it("PGL-9: resultData.result 누락 → warnings.result_missing", () => {
    const records = [makeGiftRecord({ giftDate: "2021-05-10", result: null })];
    expect(() =>
      filterPriorGiftCandidates(records, CURRENT, DEFAULT_NAME, DEFAULT_BIRTH, []),
    ).not.toThrow();
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "result_missing")).toBeDefined();
  });

  it("PGL-10: donor 관계 undefined → warnings.donor_missing", () => {
    const records = [makeGiftRecord({ giftDate: "2021-05-10", donor: undefined })];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "donor_missing")).toBeDefined();
  });

  it("PGL-11: donor 비-enum 문자열 → warnings.donor_missing", () => {
    const records = [makeGiftRecord({ giftDate: "2021-05-10", donor: "stranger" })];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "donor_missing")).toBeDefined();
  });

  it("PGL-12: 미래 일자 → warnings.future_date", () => {
    const records = [makeGiftRecord({ giftDate: "2027-01-01" })];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "future_date")).toBeDefined();
  });

  it("PGL-13: 2건 — giftDate desc 정렬", () => {
    const records = [
      makeGiftRecord({ id: "old", giftDate: "2019-03-22" }),
      makeGiftRecord({ id: "new", giftDate: "2021-05-10" }),
    ];
    const { candidates } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
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
        },
      }),
    ];
    const { candidates } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].additionalGenerationSkipSurcharge).toBe(0);
  });

  it("PGL-15: finalTax undefined → 0, inheritance silent skip", () => {
    const records: CalculationRecord[] = [
      makeGiftRecord({
        giftDate: "2021-05-10",
        result: {
          grossGiftValue: 100_000_000,
          taxBase: 50_000_000,
          computedTax: 5_000_000,
        },
      }),
      {
        ...makeGiftRecord({ giftDate: "2020-01-01" }),
        taxType: "inheritance",
        id: "inh-1",
      },
    ];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].finalTax).toBe(0);
    expect(warnings.find((w) => w.calculationId === "inh-1")).toBeUndefined();
  });

  it("PGL-16: donorName 누락 (legacy) → warnings.donor_identity_missing", () => {
    const records = [
      makeGiftRecord({ giftDate: "2021-05-10", donorName: undefined }),
    ];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(
      warnings.find((w) => w.reason === "donor_identity_missing"),
    ).toBeDefined();
  });

  it("PGL-17: donorBirthDate 누락 (legacy) → warnings.donor_identity_missing", () => {
    const records = [
      makeGiftRecord({ giftDate: "2021-05-10", donorBirthDate: undefined }),
    ];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME,
      DEFAULT_BIRTH,
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(
      warnings.find((w) => w.reason === "donor_identity_missing"),
    ).toBeDefined();
  });

  it("PGL-18: 부 vs 모 — 다른 인물(생년월일 다름)이므로 제외 (§47 그룹과 무관)", () => {
    // 사용자 결정: §47② 부·모 동일인이라도 물리적 다른 인물은 모달 후보에서 제외
    const records = [
      makeGiftRecord({
        giftDate: "2021-05-10",
        donor: "mother",
        donorName: "김영희",
        donorBirthDate: "1962-07-08",
      }),
    ];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      DEFAULT_NAME, // "홍길동" — 부
      DEFAULT_BIRTH, // "1960-01-15"
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "different_person")).toBeDefined();
  });
});
