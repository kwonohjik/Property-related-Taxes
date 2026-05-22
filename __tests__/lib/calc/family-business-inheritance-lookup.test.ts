/**
 * FB-K10-LOOKUP — 가업상속공제 양도세 prefill mediator anchor
 *
 * 검증 범위:
 *   FB-K10-1: 정상 사례 → candidate + asset 추출
 *   FB-K10-2: deduction=0 → no_family_business warning
 *   FB-K10-3: appliedRate=0 → rate_zero warning
 *   FB-K10-4: deathDate > transferDate → transfer_before_inheritance warning
 *   FB-K10-5: 가업 자산 0건 (직접입력 모드) → no_assets warning
 *   FB-K10-6: candidateToPrefill 자산 1건 선택 → marketValue/rate/date prefill
 *   FB-K10-7: 정렬 — deathDate desc + createdAt desc
 *
 * 법령 근거:
 *   - 소득세법 §97의2④ + 시행령 §163의2③
 *   - 상증법 §18의2 (가업상속공제)
 */

import { describe, it, expect } from "vitest";
import {
  filterFamilyBusinessInheritanceCandidates,
  candidateToPrefill,
} from "@/lib/calc/family-business-inheritance-lookup";
import type { CalculationRecord } from "@/lib/storage/types";

// ============================================================
// fixture
// ============================================================

function makeInheritanceRecord(
  overrides: {
    id?: string;
    title?: string;
    deathDate?: string;
    deduction?: number;
    appliedRate?: number;
    operatingYears?: number;
    usedDirectInput?: boolean;
    estateItems?: Array<{
      id: string;
      name: string;
      familyBusinessCategory?: string;
      marketValue?: number;
    }>;
    createdAt?: string;
  } = {},
): CalculationRecord {
  return {
    id: overrides.id ?? "rec-1",
    userId: "local-user",
    taxType: "inheritance",
    title: overrides.title ?? "테스트 상속",
    inputData: {
      deathDate: overrides.deathDate ?? "2024-03-15",
      estateItems: overrides.estateItems ?? [
        {
          id: "asset-fb-1",
          name: "공장부지",
          familyBusinessCategory: "business_real_estate",
          marketValue: 5_000_000_000,
        },
        {
          id: "asset-fb-2",
          name: "법인주식",
          familyBusinessCategory: "corporate_stock",
          marketValue: 3_000_000_000,
        },
      ],
    },
    resultData: {
      result: {
        deductionDetail: {
          familyBusinessDetail: {
            deduction: overrides.deduction ?? 8_000_000_000,
            appliedRate: overrides.appliedRate ?? 1.0,
            operatingYears: overrides.operatingYears ?? 25,
            usedDirectInput: overrides.usedDirectInput ?? false,
          },
        },
      },
    },
    taxLawVersion: "2024-03-15",
    linkedCalculationId: null,
    clientId: null,
    createdAt: overrides.createdAt ?? "2024-04-01T00:00:00.000Z",
    updatedAt: overrides.createdAt ?? "2024-04-01T00:00:00.000Z",
  };
}

// ============================================================
// 단위 anchor — filterFamilyBusinessInheritanceCandidates
// ============================================================

describe("FB-K10-LOOKUP — 가업상속공제 양도세 prefill mediator", () => {
  it("FB-K10-1: 정상 사례 → candidate 1건 + 가업자산 2건 추출", () => {
    const { candidates, warnings } = filterFamilyBusinessInheritanceCandidates(
      [makeInheritanceRecord()],
      "2026-05-22",
    );
    expect(candidates).toHaveLength(1);
    expect(warnings).toHaveLength(0);
    const c = candidates[0];
    expect(c.deathDate).toBe("2024-03-15");
    expect(c.appliedRate).toBe(1.0);
    expect(c.deduction).toBe(8_000_000_000);
    expect(c.operatingYears).toBe(25);
    expect(c.usedDirectInput).toBe(false);
    expect(c.familyBusinessAssets).toHaveLength(2);
    expect(c.familyBusinessAssets[0].name).toBe("공장부지");
    expect(c.familyBusinessAssets[0].marketValue).toBe(5_000_000_000);
    expect(c.familyBusinessAssets[1].category).toBe("corporate_stock");
  });

  it("FB-K10-2: deduction=0 → no_family_business warning + candidate 0", () => {
    const { candidates, warnings } = filterFamilyBusinessInheritanceCandidates(
      [makeInheritanceRecord({ deduction: 0 })],
      "2026-05-22",
    );
    expect(candidates).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toBe("no_family_business");
  });

  it("FB-K10-3: appliedRate=0 → rate_zero warning (분모 0 가드)", () => {
    const { candidates, warnings } = filterFamilyBusinessInheritanceCandidates(
      [makeInheritanceRecord({ deduction: 1_000_000_000, appliedRate: 0 })],
      "2026-05-22",
    );
    expect(candidates).toHaveLength(0);
    expect(warnings[0].reason).toBe("rate_zero");
  });

  it("FB-K10-4: deathDate > transferDate → transfer_before_inheritance warning", () => {
    const { candidates, warnings } = filterFamilyBusinessInheritanceCandidates(
      [makeInheritanceRecord({ deathDate: "2027-01-01" })],
      "2026-05-22",
    );
    expect(candidates).toHaveLength(0);
    expect(warnings[0].reason).toBe("transfer_before_inheritance");
  });

  it("FB-K10-5: 가업 자산 0건 (직접입력 모드) → no_assets warning", () => {
    const { candidates, warnings } = filterFamilyBusinessInheritanceCandidates(
      [
        makeInheritanceRecord({
          usedDirectInput: true,
          estateItems: [
            { id: "asset-1", name: "주택", marketValue: 1_000_000_000 }, // familyBusinessCategory 없음
          ],
        }),
      ],
      "2026-05-22",
    );
    expect(candidates).toHaveLength(0);
    expect(warnings[0].reason).toBe("no_assets");
  });

  it("FB-K10-6: candidateToPrefill — 자산 1건 선택 → prefill payload", () => {
    const { candidates } = filterFamilyBusinessInheritanceCandidates(
      [makeInheritanceRecord()],
      "2026-05-22",
    );
    const prefill = candidateToPrefill(candidates[0], "asset-fb-2");
    expect(prefill).not.toBeNull();
    expect(prefill!.decedentAcquisitionPrice).toBe(0); // 사용자 별도 입력 필요
    expect(prefill!.inheritanceMarketValue).toBe(3_000_000_000);
    expect(prefill!.fbDeductionAppliedRate).toBe(1.0);
    expect(prefill!.inheritanceDate).toBe("2024-03-15");
    expect(prefill!.sourceCalculationId).toBe("rec-1");
    expect(prefill!.sourceItemId).toBe("asset-fb-2");
  });

  it("FB-K10-6b: candidateToPrefill — 존재하지 않는 itemId → null", () => {
    const { candidates } = filterFamilyBusinessInheritanceCandidates(
      [makeInheritanceRecord()],
      "2026-05-22",
    );
    expect(candidateToPrefill(candidates[0], "nonexistent")).toBeNull();
  });

  it("FB-K10-7: 정렬 — deathDate desc + createdAt desc", () => {
    const { candidates } = filterFamilyBusinessInheritanceCandidates(
      [
        makeInheritanceRecord({ id: "rec-a", deathDate: "2022-01-01", createdAt: "2024-01-01T00:00:00.000Z" }),
        makeInheritanceRecord({ id: "rec-b", deathDate: "2024-06-01", createdAt: "2024-08-01T00:00:00.000Z" }),
        makeInheritanceRecord({ id: "rec-c", deathDate: "2024-06-01", createdAt: "2024-10-01T00:00:00.000Z" }),
      ],
      "2026-05-22",
    );
    expect(candidates).toHaveLength(3);
    expect(candidates[0].calculationId).toBe("rec-c"); // 같은 deathDate에서 createdAt 더 최근
    expect(candidates[1].calculationId).toBe("rec-b");
    expect(candidates[2].calculationId).toBe("rec-a");
  });

  it("FB-K10-8: taxType !== inheritance → silent skip (warning 없음)", () => {
    const giftRecord = { ...makeInheritanceRecord(), taxType: "gift" as const };
    const { candidates, warnings } = filterFamilyBusinessInheritanceCandidates(
      [giftRecord],
      "2026-05-22",
    );
    expect(candidates).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("FB-K10-9: familyBusinessDetail 누락 → result_missing warning", () => {
    const rec = makeInheritanceRecord();
    (rec.resultData as Record<string, unknown>).result = { deductionDetail: {} };
    const { candidates, warnings } = filterFamilyBusinessInheritanceCandidates(
      [rec],
      "2026-05-22",
    );
    expect(candidates).toHaveLength(0);
    expect(warnings[0].reason).toBe("result_missing");
  });

  it("FB-K10-10: deathDate 누락 → death_date_missing warning", () => {
    const rec = makeInheritanceRecord();
    delete (rec.inputData as Record<string, unknown>).deathDate;
    const { warnings } = filterFamilyBusinessInheritanceCandidates([rec], "2026-05-22");
    expect(warnings[0].reason).toBe("death_date_missing");
  });
});
