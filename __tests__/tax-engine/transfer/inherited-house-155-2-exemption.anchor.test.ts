/**
 * Pre-Do 앵커 — 상속주택(§155②) 일반주택 양도 1세대1주택 비과세 (Tier 2-A1)
 *
 * 계획서: docs/02-design/features/transfer-155-2-4-5-exemption-gap.plan.md Tier 2-A1 · §5-A.
 * 갭: 현행 checkExemption은 상속주택을 비과세 주택수에서 제외하지 않음 → 상속주택+일반주택 2주택 시 과세.
 * 세법: §155② 피상속인 1주택 상속 + 일반주택 각 1채 소유 세대가 일반주택 양도 시 1세대1주택으로 봄(처분기한 없음).
 *       단 일반주택이 상속개시 2년 내 피상속인 증여분이면 제외.
 * 설계: transfer-tax.ts totalExcluded에 houses[] 상속주택(isInherited, sellingId 제외) 카운트 추가.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const mockRates = makeMockRates();

// 세대 2주택 — 양도주택(일반, selling) + 상속주택(inherited). 일반주택 양도, §154① 충족.
function inheritedInput(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    houses: [
      makeHouseInfo("selling", {}), // 양도주택(일반, isInherited=false)
      makeHouseInfo("inherited", { isInherited: true, inheritedDate: new Date("2023-01-01") }),
    ],
    sellingHouseId: "selling",
    transferPrice: 500_000_000, // < 12억
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2018-01-01"), // 일반주택 취득 (보유 2년↑)
    transferDate: new Date("2025-06-01"),
    ...over,
  });
}

describe("§155② 상속주택 일반주택 양도 비과세 (2-A1 앵커)", () => {
  it("★ 피상속인 1주택 상속 + 일반주택 양도 → 비과세 (RED→GREEN)", () => {
    const r = calculateTransferTax(inheritedInput(), mockRates);
    expect(r.isExempt).toBe(true);
  });

  it("2년내 피상속인 증여분 일반주택 → §155② 미적용 과세", () => {
    const r = calculateTransferTax(
      inheritedInput({ generalHouseGiftedFromDecedentWithin2yr: true }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("상속주택 2채+ (피상속인 2주택, 2-A2 영역) → 경감 보류 과세 (무근거 비과세 방지)", () => {
    const r = calculateTransferTax(
      inheritedInput({
        householdHousingCount: 3,
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("inh1", { isInherited: true, inheritedDate: new Date("2023-01-01") }),
          makeHouseInfo("inh2", { isInherited: true, inheritedDate: new Date("2023-01-01") }),
        ],
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("회귀: 상속주택 없이 순수 2주택 → 과세 불변", () => {
    const r = calculateTransferTax(
      inheritedInput({
        houses: [makeHouseInfo("selling", {}), makeHouseInfo("other", {})],
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });
});
