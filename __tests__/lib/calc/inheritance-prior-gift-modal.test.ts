/**
 * ANCHOR-M1~M4 — PR 1 상속세 모드 모달 활성화 (옵션 B 전수 조회).
 *
 * 계획서: docs/00-pm/inheritance-prior-gift-modal-activation.plan.md
 */

import { describe, it, expect } from "vitest";
import {
  filterInheritancePriorGiftCandidates,
  filterPriorGiftCandidates,
} from "@/lib/calc/prior-gift-lookup";
import type { CalculationRecord } from "@/lib/storage/types";

function buildRecord(overrides: Partial<CalculationRecord>): CalculationRecord {
  return {
    id: "calc_default",
    userId: "user_1",
    taxType: "gift",
    title: "샘플 증여",
    clientId: null,
    createdAt: "2022-05-21T00:00:00Z",
    updatedAt: "2022-05-21T00:00:00Z",
    taxLawVersion: "2022-05-21",
    inputData: {
      giftDate: "2022-05-21",
      donor: "father",
      donorRelation: "lineal_descendant",
    },
    resultData: {
      result: {
        grossGiftValue: 500_000_000,
        taxBase: 450_000_000,
        computedTax: 80_000_000,
        finalTax: 75_000_000,
        additionalGenerationSkipSurcharge: 0,
      },
    },
    ...overrides,
  } as CalculationRecord;
}

describe("ANCHOR-M — 상속세 모드 후보 추출 (옵션 B 전수 조회)", () => {
  it("ANCHOR-M1: 10년 이내 모든 사전증여 후보 반환 (clientId 격리 없음)", () => {
    const records: CalculationRecord[] = [
      buildRecord({ id: "calc_1", clientId: null }),
      buildRecord({ id: "calc_2", clientId: "client_A" }),
      buildRecord({ id: "calc_3", clientId: "client_B" }),
    ];
    const { candidates } = filterInheritancePriorGiftCandidates(
      records,
      "2026-05-21",
      [],
    );
    // 옵션 B — clientId 무관 모두 노출
    expect(candidates.length).toBe(3);
  });

  it("ANCHOR-M2: excludeCalculationIds 차단", () => {
    const records = [
      buildRecord({ id: "calc_1" }),
      buildRecord({ id: "calc_2" }),
    ];
    const { candidates, warnings } = filterInheritancePriorGiftCandidates(
      records,
      "2026-05-21",
      ["calc_1"],
    );
    expect(candidates.find((c) => c.calculationId === "calc_1")).toBeUndefined();
    expect(warnings.find((w) => w.reason === "excluded")).toBeDefined();
  });

  it("ANCHOR-M3: 10년 도과 cutoff (모달 검색 폭 최대)", () => {
    const records = [
      buildRecord({
        id: "calc_old",
        inputData: { giftDate: "2015-05-20", donor: "father" }, // 11년 전
      }),
    ];
    const { candidates, warnings } = filterInheritancePriorGiftCandidates(
      records,
      "2026-05-21",
      [],
    );
    expect(candidates.length).toBe(0);
    expect(warnings.find((w) => w.reason === "exceed_10y")).toBeDefined();
  });

  it("ANCHOR-M4 (회귀): 증여세 모드 filterPriorGiftCandidates 무변화", () => {
    const records = [
      buildRecord({ id: "calc_1", clientId: null }),
      buildRecord({ id: "calc_2", clientId: "client_A" }),
    ];
    const { candidates } = filterPriorGiftCandidates(
      records,
      "2026-05-21",
      null, // 의뢰인 본인
      [],
    );
    // 증여세 모드 — clientId 격리 작동 (null인 calc_1만 통과)
    expect(candidates.length).toBe(1);
    expect(candidates[0].calculationId).toBe("calc_1");
  });

  it("ANCHOR-M5: 미래 증여일 (sanity 차단)", () => {
    const records = [
      buildRecord({
        id: "calc_future",
        inputData: { giftDate: "2027-01-01", donor: "father" },
      }),
    ];
    const { candidates, warnings } = filterInheritancePriorGiftCandidates(
      records,
      "2026-05-21",
      [],
    );
    expect(candidates.length).toBe(0);
    expect(warnings.find((w) => w.reason === "future_date")).toBeDefined();
  });
});
