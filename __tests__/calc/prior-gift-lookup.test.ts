/**
 * 증여세 사전증여 이력 조회 — 순수 함수 anchor
 *
 * 수증자 매칭 = clientId 정확 일치 (v3 정책).
 *   - 일반 납세자 모드: currentClientId === null → record.clientId === null만 노출
 *   - 세무사 모드: currentClientId === "client-X" → record.clientId === "client-X"만 노출
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
  clientId?: string | null;
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
  const clientId = "clientId" in opts ? opts.clientId! : null;
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
    clientId,
    createdAt,
    updatedAt: createdAt,
  };
}

const CURRENT = "2026-05-20";

// ============================================================
// PGL-1 ~ PGL-15 (v3: clientId 매칭)
// ============================================================

describe("filterPriorGiftCandidates — clientId 매칭 anchor", () => {
  it("PGL-1: 10년 경계 + 본인(clientId=null) → 후보 포함", () => {
    const records = [makeGiftRecord({ giftDate: "2016-05-21" })];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      null,
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
      null,
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "exceed_10y")).toBeDefined();
  });

  it("PGL-3: 세무사 모드 — 같은 의뢰인 clientId 일치 → 후보 포함", () => {
    const records = [makeGiftRecord({ giftDate: "2021-05-10", clientId: "client-A" })];
    const { candidates } = filterPriorGiftCandidates(records, CURRENT, "client-A", []);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].clientId).toBe("client-A");
  });

  it("PGL-4: 세무사 모드 — 다른 의뢰인 → 제외 + warnings.different_client", () => {
    const records = [makeGiftRecord({ giftDate: "2021-05-10", clientId: "client-B" })];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      "client-A",
      [],
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "different_client")).toBeDefined();
  });

  it("PGL-5: priorGifts.length > 0 → 포함 + hasInnerPriorGifts=true", () => {
    const records = [
      makeGiftRecord({
        giftDate: "2021-05-10",
        priorGifts: [{ giftDate: "2018-01-01", giftAmount: 100_000_000 }],
      }),
    ];
    const { candidates } = filterPriorGiftCandidates(records, CURRENT, null, []);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].hasInnerPriorGifts).toBe(true);
  });

  it("PGL-6: excludeCalculationIds → 제외 + warnings.excluded", () => {
    const records = [makeGiftRecord({ id: "abc", giftDate: "2021-05-10" })];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      null,
      ["abc"],
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.find((w) => w.reason === "excluded")).toBeDefined();
  });

  it("PGL-7: candidateToPriorGift — 9필드 + sourceCalculationId 매핑 정확", () => {
    const c: PriorGiftCandidate = {
      calculationId: "abc",
      giftDate: "2021-05-10",
      clientId: null,
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

  it("PGL-7b: 부표 1 표시 메타 — candidateToPriorGift가 propertyCategory/Name 그대로 전달", () => {
    const c: PriorGiftCandidate = {
      calculationId: "rec-1",
      giftDate: "2022-07-20",
      clientId: null,
      donor: "father",
      donorRelation: "lineal_descendant",
      grossGiftValue: 500_000_000,
      finalTax: 0,
      taxBase: 0,
      computedTax: 0,
      additionalGenerationSkipSurcharge: 0,
      wasGenerationSkip: false,
      hasInnerPriorGifts: false,
      createdAt: "2022-07-20T00:00:00.000Z",
      title: "증여세 2022-07-20",
      propertyCategory: "real_estate_apartment",
      propertyName: "성북동 다세대주택",
    };
    const pg = candidateToPriorGift(c);
    expect(pg.propertyCategory).toBe("real_estate_apartment");
    expect(pg.propertyName).toBe("성북동 다세대주택");
    // propertyLocation은 EstateItem에 소재지 필드가 없어 prefill 불가 — 사용자 명시 입력 요구
    expect(pg.propertyLocation).toBeUndefined();
  });

  it("PGL-7c: filterCandidates가 inputData.giftItems[0]에서 propertyCategory/Name prefill", () => {
    const record: CalculationRecord = {
      id: "rec-prefill",
      userId: "local-user" as never,
      taxType: "gift",
      title: "현금 증여",
      inputData: {
        giftDate: "2022-07-20",
        donor: "father",
        donorRelation: "lineal_descendant",
        isGenerationSkip: false,
        priorGifts: [],
        // 신규: giftItems 자동 prefill 소스
        giftItems: [{ category: "cash", name: "현금 증여재산" }],
      },
      resultData: {
        success: true,
        result: {
          grossGiftValue: 500_000_000,
          finalTax: 0,
          taxBase: 0,
          computedTax: 0,
          additionalGenerationSkipSurcharge: 0,
        },
      },
      taxLawVersion: "2022-07-20",
      linkedCalculationId: null,
      clientId: null,
      createdAt: "2022-07-20T00:00:00.000Z",
      updatedAt: "2022-07-20T00:00:00.000Z",
    };
    const { candidates } = filterPriorGiftCandidates([record], CURRENT, null, []);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].propertyCategory).toBe("cash");
    expect(candidates[0].propertyName).toBe("현금 증여재산");
    // 변환 시 PriorGift에도 전달
    const pg = candidateToPriorGift(candidates[0]);
    expect(pg.propertyCategory).toBe("cash");
    expect(pg.propertyName).toBe("현금 증여재산");
  });

  it("PGL-8: inputData.giftDate ISO string 비교 정확", () => {
    const records = [makeGiftRecord({ giftDate: "2020-12-31" })];
    const { candidates } = filterPriorGiftCandidates(records, "2021-01-01", null, []);
    expect(candidates).toHaveLength(1);
  });

  it("PGL-9: resultData.result 누락 → warnings.result_missing", () => {
    const records = [makeGiftRecord({ giftDate: "2021-05-10", result: null })];
    expect(() =>
      filterPriorGiftCandidates(records, CURRENT, null, []),
    ).not.toThrow();
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      null,
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
      null,
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
      null,
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
      null,
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
    const { candidates } = filterPriorGiftCandidates(records, CURRENT, null, []);
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
    const { candidates } = filterPriorGiftCandidates(records, CURRENT, null, []);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].additionalGenerationSkipSurcharge).toBe(0);
  });

  it("PGL-15: 일반 납세자 모드(null)는 본인 이력만, 의뢰인 이력 제외", () => {
    const records: CalculationRecord[] = [
      makeGiftRecord({ id: "self", giftDate: "2021-05-10", clientId: null }),
      makeGiftRecord({ id: "client-a", giftDate: "2020-01-01", clientId: "client-A" }),
      {
        ...makeGiftRecord({ giftDate: "2019-01-01" }),
        taxType: "inheritance",
        id: "inh-1",
      },
    ];
    const { candidates, warnings } = filterPriorGiftCandidates(
      records,
      CURRENT,
      null,
      [],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].calculationId).toBe("self");
    expect(warnings.find((w) => w.reason === "different_client")).toBeDefined();
    // inheritance silent skip
    expect(warnings.find((w) => w.calculationId === "inh-1")).toBeUndefined();
  });
});
