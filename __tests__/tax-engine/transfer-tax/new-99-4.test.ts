// §99의4 농어촌·고향주택 — evaluator 단위 anchor (A-1~A-9)
// 케이스 인벤토리: docs/02-design/features/transfer-99-4-rural-hometown.engine.design.md §2
import { describe, it, expect } from "vitest";
import { evaluateNew994 } from "@/lib/tax-engine/transfer-reductions/new-99-4";
import type { New994EvaluationInput } from "@/lib/tax-engine/transfer-reductions/types";

function base(overrides?: Partial<New994EvaluationInput>): New994EvaluationInput {
  return {
    id: "new_99_4_rural",
    generalHouseAcquisitionDate: new Date("2010-01-01"),
    transferDate: new Date("2024-06-01"),
    ruralHouseAcquisitionDate: new Date("2015-03-01"),
    ruralHouseStdPrice: 200_000_000,
    isRegisteredHanok: false,
    isAdjacentArea: false,
    meetsLocationRequirement: true,
    ...overrides,
  };
}

function codesOf(r: ReturnType<typeof evaluateNew994>): string[] {
  return r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code);
}

describe("§99의4 evaluateNew994", () => {
  it("A-1: 적격 (시한 내·가액 2억·소재지✓·연접✗·취득순서✓·9년 보유) → exclusion 1·추징경고 없음", () => {
    const r = evaluateNew994(base());
    expect(r.isEligible).toBe(true);
    if (r.isEligible) {
      expect(r.houseCountExclusion).toBe(1);
      expect(r.ruralHoldingYears).toBe(9);
      expect(r.clawbackWarning).toBe(false);
      expect(r.surchargeNotAffected).toBe(true);
    }
  });

  it("A-2: 가액 3.5억 → 불적용 / 등록 한옥 토글 → 적용 (한도 3억/4억 전환)", () => {
    const over = evaluateNew994(base({ ruralHouseStdPrice: 350_000_000 }));
    expect(over.isEligible).toBe(false);
    expect(codesOf(over)).toContain("STD_PRICE_EXCEEDED");

    const hanok = evaluateNew994(base({ ruralHouseStdPrice: 350_000_000, isRegisteredHanok: true }));
    expect(hanok.isEligible).toBe(true);
  });

  it("A-3: 연접 토글 ON → 불적용 (③)", () => {
    const r = evaluateNew994(base({ isAdjacentArea: true }));
    expect(r.isEligible).toBe(false);
    expect(codesOf(r)).toContain("ADJACENT_AREA");
  });

  it("A-4: 농어촌 취득일 ≤ 일반주택 취득일 → 불적용 (취득순서)", () => {
    const r = evaluateNew994(base({ ruralHouseAcquisitionDate: new Date("2009-06-01") }));
    expect(r.isEligible).toBe(false);
    expect(codesOf(r)).toContain("ACQUISITION_ORDER");
  });

  it("A-5: 시한 — rural 2003.7.31 취득 → 불적용 / hometown 2008.12.31 취득 → 불적용 (id별 시기)", () => {
    const rural = evaluateNew994(base({
      generalHouseAcquisitionDate: new Date("2000-01-01"),
      ruralHouseAcquisitionDate: new Date("2003-07-31"),
    }));
    expect(rural.isEligible).toBe(false);
    expect(codesOf(rural)).toContain("OUT_OF_PERIOD");

    // rural이면 2008.12.31은 시한 내 — hometown은 2009.1.1부터라 시한 외
    const hometown = evaluateNew994(base({
      id: "new_99_4_hometown",
      generalHouseAcquisitionDate: new Date("2000-01-01"),
      ruralHouseAcquisitionDate: new Date("2008-12-31"),
      meetsHometownRequirement: true,
    }));
    expect(hometown.isEligible).toBe(false);
    expect(codesOf(hometown)).toContain("OUT_OF_PERIOD");

    const ruralSameDate = evaluateNew994(base({
      generalHouseAcquisitionDate: new Date("2000-01-01"),
      ruralHouseAcquisitionDate: new Date("2008-12-31"),
    }));
    expect(ruralSameDate.isEligible).toBe(true);
  });

  it("A-6: 농어촌 보유 3년 미만 → 적용 + 추징 경고 (④ 선적용·⑥)", () => {
    const r = evaluateNew994(base({ ruralHouseAcquisitionDate: new Date("2023-01-01") }));
    expect(r.isEligible).toBe(true);
    if (r.isEligible) {
      expect(r.ruralHoldingYears).toBeLessThan(3);
      expect(r.clawbackWarning).toBe(true);
    }
  });

  it("A-7: 소재지 토글 미확인 → 불적용", () => {
    const r = evaluateNew994(base({ meetsLocationRequirement: false }));
    expect(r.isEligible).toBe(false);
    expect(codesOf(r)).toContain("LOCATION_UNCONFIRMED");
  });

  it("A-8: hometown 고향요건 토글 미확인 → 불적용 (rural에는 미적용)", () => {
    const hometown = evaluateNew994(base({ id: "new_99_4_hometown" }));
    expect(hometown.isEligible).toBe(false);
    expect(codesOf(hometown)).toContain("HOMETOWN_UNCONFIRMED");

    const rural = evaluateNew994(base()); // rural은 고향요건 없음
    expect(rural.isEligible).toBe(true);
  });

  it("A-9: 가액 정확히 3억 → 적용 (초과만 배제 — 경계 포함)", () => {
    const r = evaluateNew994(base({ ruralHouseStdPrice: 300_000_000 }));
    expect(r.isEligible).toBe(true);
  });

  it("필수 입력 미입력 → 불적용 사유 (자동 fallback 금지)", () => {
    const r = evaluateNew994(base({ ruralHouseAcquisitionDate: undefined, ruralHouseStdPrice: undefined }));
    expect(r.isEligible).toBe(false);
    expect(codesOf(r)).toEqual(expect.arrayContaining(["MISSING_RURAL_ACQ_DATE", "MISSING_STD_PRICE"]));
  });
});
