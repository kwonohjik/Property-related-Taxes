/**
 * Anchor B — R2 비과세/장특 undercount 정정 (계획서 §2-1·§7-B).
 *
 * 배경: ① "세대 보유 주택 수" 토글이 4채+를 "3"으로 캡 저장 → 엔진 exemption-judge
 * (`transfer-tax-house-exclusion-step.ts:44` `max(householdHousingCount − totalExcluded, 0)`)가
 * 실제 5채인데 `3 − 2 = 1`로 계산 → §89①3호가목 "1주택" 요건을 오충족 → 비과세/표2 오부여.
 *
 * R2: ① 위젯을 정확 숫자 입력으로 전환해 5를 엔진에 전달 → `5 − 2 = 3` → 비과세 미충족(정정).
 * 법령: 소득세법 §89①3호가목(KoreanLaw MST 280405) — "1세대가 1주택을 보유하는 경우".
 *
 * 방향은 항상 equal-or-stricter(특례 감소) — 새 유리-오류 없음. 중과 tier(3주택+)는 불변.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

// 감면주택 2채 (§98의8) — 각 excludedCount 1 → totalExcluded 2.
// §98의8①의 취득기간은 **최초 매매계약일**만을 지배한다 (D4-09) — 계약일이 판정 기준이다.
const TWO_EXCLUSIONS = [
  { article: "unsold_98_8" as const, houseContractDate: new Date("2015-06-01"), requirementsConfirmed: true },
  { article: "unsold_98_8" as const, houseContractDate: new Date("2015-06-10"), requirementsConfirmed: true },
];

// 공통: 800M(<12억) 주택, 장기보유·거주 요건 충족, 1세대, 감면주택 2채 제외.
const base = {
  transferPrice: 800_000_000,
  acquisitionPrice: 500_000_000,
  acquisitionDate: new Date("2015-07-01"),
  transferDate: new Date("2022-08-01"),
  isOneHousehold: true,
  specialHouseExclusions: TWO_EXCLUSIONS,
};

describe("R2 — 세대 주택 수 정확값 전달 시 비과세 undercount 정정 (§89①3호가목)", () => {
  it("B-1: 구(캡) householdHousingCount 3 + 배제 2 → judge 1 → 비과세 오부여(undercount 재현)", () => {
    const r = calculateTransferTax(
      baseTransferInput({ ...base, householdHousingCount: 3 }),
      makeMockRates(),
    );
    expect(r.specialHouseExclusionDetail?.excludedCount).toBe(2);
    // 3 − 2 = 1 → 1주택 의제 → 비과세 (버그: 실제 5채인데 캡으로 오부여)
    expect(r.isExempt).toBe(true);
  });

  it("B-2: 신(정확) householdHousingCount 5 + 배제 2 → judge 3 → 비과세 미충족(정정)", () => {
    const r = calculateTransferTax(
      baseTransferInput({ ...base, householdHousingCount: 5 }),
      makeMockRates(),
    );
    expect(r.specialHouseExclusionDetail?.excludedCount).toBe(2);
    // 5 − 2 = 3 → 1주택 아님 → 비과세 미충족 (정정)
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBeGreaterThan(0);
  });

  it("B-2 대조: 정확값 5의 세액이 구(캡 3)보다 큼 = 특례 감소(equal-or-stricter)", () => {
    const buggy = calculateTransferTax(
      baseTransferInput({ ...base, householdHousingCount: 3 }),
      makeMockRates(),
    );
    const fixed = calculateTransferTax(
      baseTransferInput({ ...base, householdHousingCount: 5 }),
      makeMockRates(),
    );
    expect(fixed.determinedTax).toBeGreaterThan(buggy.determinedTax);
  });

  it("B-3 회귀: householdHousingCount ≤ 3 기존 케이스는 R2 영향 없음 — judge 계산 동일", () => {
    // 배제 0 → judge = declared. declared 3 → judge 3(비과세 아님). 기존 동작 유지.
    const r = calculateTransferTax(
      baseTransferInput({
        ...base,
        householdHousingCount: 3,
        specialHouseExclusions: [],
      }),
      makeMockRates(),
    );
    expect(r.isExempt).toBe(false); // 배제 없으면 3주택 → 비과세 아님 (R2 무관)
  });
});
