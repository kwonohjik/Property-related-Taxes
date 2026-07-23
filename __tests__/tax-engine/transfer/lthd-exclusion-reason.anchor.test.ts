/**
 * anchor: 장특공제 배제 사유 echo (lthdExclusionReason) — §95② 본문 괄호.
 *
 * 배경: 다주택 중과 등으로 장특 배제 시 step 산식이 "보유 0년×2% = 0% (30% 한도)"로
 * 오도 표시되던 버그. 배제 경로(L-0·L-0a·L-1)가 사유를 echo하고 산식이 배제 문구로 대체됨.
 * 공제율 미달(보유 3년 미만 등) 0원은 배제가 아니므로 undefined 유지.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRatesWithHouseEngine, makeMockRates } from "../_helpers/mock-rates";

const findStep = (r: ReturnType<typeof calculateTransferTax>, label: string) =>
  r.steps.find((s) => s.label.includes(label));

describe("장특공제 배제 사유 echo (§95② 본문 괄호)", () => {
  it("R1: 조정대상지역 2주택 중과(유예 없음) → multi_house_surcharge + 산식 배제 문구", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        isRegulatedArea: true,
        householdHousingCount: 2,
        isOneHousehold: false,
      }),
      makeMockRatesWithHouseEngine(),
    );
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.lthdExclusionReason).toBe("multi_house_surcharge");
    const step = findStep(r, "장기보유특별공제");
    expect(step?.formula).toContain("다주택 중과 대상 — 장기보유특별공제 배제");
    expect(step?.formula).not.toContain("×2%"); // 오도 산식 제거
  });

  it("R2: 미등기 양도 → unregistered + 산식 배제 문구", () => {
    // 1세대1주택 비과세 조기 반환 회피 — 2주택 과세 케이스
    const r = calculateTransferTax(
      baseTransferInput({ isUnregistered: true, isOneHousehold: false, householdHousingCount: 2 }),
      makeMockRates(),
    );
    expect(r.lthdExclusionReason).toBe("unregistered");
    expect(findStep(r, "장기보유특별공제")?.formula).toContain("미등기 양도자산");
  });

  it("R3(회귀): 비중과 일반 케이스(비조정 2주택) → undefined + 기존 산식 유지", () => {
    const r = calculateTransferTax(
      baseTransferInput({ isOneHousehold: false, householdHousingCount: 2 }),
      makeMockRates(),
    );
    expect(r.lthdExclusionReason).toBeUndefined();
    expect(findStep(r, "장기보유특별공제")?.formula).toContain("×2%");
  });

  it("R4(회귀): 보유 3년 미만(공제율 미달 0원)은 배제 아님 — undefined", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        acquisitionDate: new Date("2022-01-01"),
        transferDate: new Date("2024-06-01"), // 보유 2년 5개월 — 표1 3년 미만 0%
      }),
      makeMockRates(),
    );
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.lthdExclusionReason).toBeUndefined();
  });

  it("R5(회귀): 중과 유예 기간 내(양도일 2024·suspended mock) → 배제 없음", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        isRegulatedArea: true,
        householdHousingCount: 2,
        isOneHousehold: false,
      }),
      makeMockRates(), // 기본 mock: surcharge_suspended true
    );
    expect(r.lthdExclusionReason).toBeUndefined();
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
  });
});
