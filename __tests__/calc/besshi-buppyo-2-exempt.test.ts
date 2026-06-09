/**
 * 부표2 계 ⑲~㉔ 비과세·과세가액불산입 per-heir 기재 anchor.
 *
 * 인정액 단일진실 = result.exemptionDetail.itemResults(exemptAmount).
 * per-heir 귀속 = exemptions.heirAllocations. ㉘ 합계 불변(메모 행).
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { buildBuppyo2Data } from "@/lib/calc/besshi-buppyo-2-data";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  EXAMPLE_INPUT,
  EXAMPLE_HEIRS,
  EXAMPLE_ESTATE_ITEMS,
  EXAMPLE_PRIOR_GIFTS,
  HEIR_ID,
} from "../tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture";

describe("부표2 비과세·과세가액불산입 per-heir 기재 (⑲~㉔)", () => {
  const exemptions: ExemptionCheckedItem[] = [
    {
      ruleId: "inh_forest_burial", // ⑲ 금양임야 등 → 장남
      claimedAmount: 200_000_000,
      claimedAreaM2: 1500,
      heirAllocations: [{ heirId: HEIR_ID.son, amount: 200_000_000 }],
    },
    {
      ruleId: "inh_public_interest", // ㉒ 공익법인 출연 → 차남
      claimedAmount: 100_000_000,
      heirAllocations: [{ heirId: HEIR_ID.son2, amount: 100_000_000 }],
    },
  ];
  const input = { ...EXAMPLE_INPUT, exemptions };
  const result = calcInheritanceTax(input);
  const data = buildBuppyo2Data(
    result,
    EXAMPLE_HEIRS,
    EXAMPLE_ESTATE_ITEMS,
    EXAMPLE_PRIOR_GIFTS,
    exemptions,
  );
  const byId = (id: string) => data.find((d) => d.heirId === id)!;
  const recOf = (ruleId: string) =>
    result.exemptionDetail!.itemResults.find((r) => r.ruleId === ruleId)
      ?.exemptAmount ?? 0;

  it("BX-1: 금양임야 비과세 인정액 → 장남 ⑲ nonTaxableFarmland (단일진실 대조)", () => {
    const rec = recOf("inh_forest_burial");
    expect(rec).toBeGreaterThan(0);
    expect(byId(HEIR_ID.son).sectionTotal.nonTaxableFarmland).toBe(rec);
  });

  it("BX-2: 공익법인 출연 불산입 → 차남 ㉒ exclusionPublicCorp", () => {
    const rec = recOf("inh_public_interest");
    expect(rec).toBeGreaterThan(0);
    expect(byId(HEIR_ID.son2).sectionTotal.exclusionPublicCorp).toBe(rec);
  });

  it("BX-3: 비귀속 상속인은 0 (배우자 ⑲·㉒ = 0)", () => {
    const sp = byId(HEIR_ID.spouse).sectionTotal;
    expect(sp.nonTaxableFarmland).toBe(0);
    expect(sp.exclusionPublicCorp).toBe(0);
  });

  it("BX-4: ㉘ 합계 불변 (비과세·불산입은 메모 행 — ⑰+⑱+㉕ 유지)", () => {
    for (const d of data) {
      expect(d.sectionTotal.total).toBe(
        d.sectionTotal.grossEstateValue +
          d.sectionTotal.presumedAmount +
          d.sectionTotal.priorGift13,
      );
    }
  });

  it("BX-5: exemptions 미전달 시 6항목 0 (하위호환)", () => {
    const noEx = buildBuppyo2Data(
      result,
      EXAMPLE_HEIRS,
      EXAMPLE_ESTATE_ITEMS,
      EXAMPLE_PRIOR_GIFTS,
    );
    for (const d of noEx) {
      expect(d.sectionTotal.nonTaxableFarmland).toBe(0);
      expect(d.sectionTotal.exclusionPublicCorp).toBe(0);
    }
  });
});
