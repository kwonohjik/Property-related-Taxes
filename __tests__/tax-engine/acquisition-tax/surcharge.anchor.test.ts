/**
 * 취득세 중과세 Phase 1 Anchor 테스트 (29개)
 *
 * 설계 문서: acquisition-tax-upgrade.design.md §6 + phases.md Phase 1 "완료 기준"
 *
 * 검증 시나리오:
 * - 사치성 4개 (#1~#4) — G1 수정 후 올바른 산식 (basicRate + 8%p)
 * - 다주택 6개 (#5~#8, #비조정3, #비조정4) — G2 수정 후 비조정지역 포함
 * - 시가표준액 1억/2억 4개 (#11~#12, #33~#35) — v3 수도권/비수도권 이중 기준
 * - 일시적 2주택 시점별 3개 (#36~#38) — v3 시점별 처분기한
 * - 부담부증여 2개 (#14~#15) — P1-6 배우자 간 전체 무상
 * - 별장 1개 (#16) — §13⑤ 폐지 확인
 * - 무상 단서 3개 (#42~#43, #53) — v3·v4 의붓자녀·계부모·단서배제
 * - §13⑦ 사치성+법인 2개 (#39~#40) — v3 대도시 법인 중복
 * - §13의2④ 지정 전 계약 1개 (#41) — v3 계약금 증빙 비조정 간주
 * - 무상 3분기 anchor 3개 (#51~#53) — 3억 미만/비조정/단서
 */

import { describe, it, expect } from "vitest";
import { assessSurcharge } from "../../../lib/tax-engine/acquisition-surcharge/index";
import {
  getDisposalDeadlineYears,
  getDisposalDeadlineDate,
} from "../../../lib/tax-engine/acquisition-surcharge/multi-house";
import {
  isExemptFromSurcharge_LowValue,
} from "../../../lib/tax-engine/acquisition-surcharge/exclusion";

// ============================================================
// 사치성 재산 Anchor (G1 수정 — basicRate + 8%p)
// ============================================================

describe("[Anchor] 사치성 재산 중과 — §13⑤ G1 수정", () => {
  it("#1 사치성 토지 매매 10억: 기본세율 4% + 8%p = 12%", () => {
    // 설계서 anchor #1: 사치성 매매 토지 10억 → 4% → 12%
    const result = assessSurcharge({
      propertyType: "land",
      acquisitionCause: "purchase",
      acquisitionValue: 1_000_000_000,
      acquiredBy: "individual",
      isLuxuryProperty: true,
      basicRate: 0.04,
    });
    expect(result.isSurcharged).toBe(true);
    // 4% + 8%p = 12%
    expect(result.surchargeRate).toBe(0.12);
    // 세금액 anchor: 10억 × 12% = 1억 2천만
    expect(Math.floor(1_000_000_000 * result.surchargeRate!)).toBe(120_000_000);
  });

  it("#2 사치성 9억 초과 주택 매매 10억: basicRate 3% + 8%p = 11%", () => {
    // 설계서 anchor #2: 사치성 9억 초과 주택 10억 → 3% → 11%
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 1_000_000_000,
      acquiredBy: "individual",
      isLuxuryProperty: true,
      basicRate: 0.03, // 9억 초과 주택세율 3%
    });
    expect(result.isSurcharged).toBe(true);
    // 3% + 8%p = 11% (구 공식 3%×5=15% 는 틀림)
    expect(result.surchargeRate).toBe(0.11);
    // 세금액 anchor: 10억 × 11% = 1억 1천만
    expect(Math.floor(1_000_000_000 * result.surchargeRate!)).toBe(110_000_000);
  });

  it("#3 사치성 6억 이하 주택 5억: basicRate 1% + 8%p = 9%", () => {
    // 설계서 anchor #3: 사치성 6억 이하 주택 5억 → 1% → 9%
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isLuxuryProperty: true,
      basicRate: 0.01, // 6억 이하 주택세율 1%
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.09);
    // 세금액 anchor: 5억 × 9% = 4,500만
    expect(Math.floor(500_000_000 * result.surchargeRate!)).toBe(45_000_000);
  });

  it("#17 사치성 + 조정지역 3주택 매매 10억: 12% + 8%p = 20%", () => {
    // 설계서 anchor #17: 사치성 + 조정 3주택 → 12% + 8% = 20%
    // 고급주택(isLuxuryProperty) + 조정 3주택 → luxury_multi 분기
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 1_000_000_000,
      acquiredBy: "individual",
      isLuxuryProperty: true,
      luxuryType: "luxury_housing",
      basicRate: 0.03,
      isRegulatedArea: true,
      houseCountAfter: 3,
    });
    expect(result.isSurcharged).toBe(true);
    // 조정 3주택 다주택중과 12% + 사치성 8%p = 20%
    expect(result.surchargeRate).toBe(0.20);
    expect(result.appliedBranch).toBe("luxury_multi");
    // 세금액 anchor: 10억 × 20% = 2억
    expect(Math.floor(1_000_000_000 * result.surchargeRate!)).toBe(200_000_000);
  });
});

// ============================================================
// 다주택 중과 Anchor (G2 수정 — 비조정 포함)
// ============================================================

describe("[Anchor] 다주택 중과 — §13의2① G2 수정", () => {
  it("#5 비조정지역 3주택 매매 5억: 8% (§13의2① 2호)", () => {
    // 설계서 anchor #5: 비조정 3주택 → 8%
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: false,
      houseCountAfter: 3,
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.08);
    expect(result.appliedBranch).toBe("multi_house_8");
    // 세금액 anchor: 5억 × 8% = 4천만
    expect(Math.floor(500_000_000 * result.surchargeRate!)).toBe(40_000_000);
  });

  it("#6 비조정지역 4주택 매매 7억: 12% (§13의2① 3호)", () => {
    // 설계서 anchor #6: 비조정 4주택 → 12%
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 700_000_000,
      acquiredBy: "individual",
      isRegulatedArea: false,
      houseCountAfter: 4,
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.12);
    expect(result.appliedBranch).toBe("multi_house_12");
    // 세금액 anchor: 7억 × 12% = 8,400만
    expect(Math.floor(700_000_000 * result.surchargeRate!)).toBe(84_000_000);
  });

  it("#7 조정지역 2주택 매매 5억 (현행): 8%", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 2,
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.08);
    expect(result.appliedBranch).toBe("multi_house_8");
    // 세금액 anchor: 5억 × 8% = 4천만
    expect(Math.floor(500_000_000 * result.surchargeRate!)).toBe(40_000_000);
  });

  it("#8 조정지역 3주택 매매 5억 (현행): 12%", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 3,
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.12);
    expect(result.appliedBranch).toBe("multi_house_12");
    // 세금액 anchor: 5억 × 12% = 6천만
    expect(Math.floor(500_000_000 * result.surchargeRate!)).toBe(60_000_000);
  });

  it("비조정지역 2주택: 중과 없음 (§13의2① 해당 없음)", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: false,
      houseCountAfter: 2,
    });
    // 비조정 2주택은 §13의2① 어느 호에도 해당하지 않음
    expect(result.isSurcharged).toBe(false);
  });

  it("법인 주택 매매: 12% 즉시 (houseCount skip 최적화)", () => {
    // [v4 D2] 법인은 주택 수 관계없이 즉시 12%
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "corporation",
      houseCountAfter: 1, // 1주택이어도 법인은 12%
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.12);
    expect(result.appliedBranch).toBe("corp_housing");
  });
});

// ============================================================
// 시가표준액 1억/2억 이중 기준 Anchor (v3 G4)
// ============================================================

describe("[Anchor] 시가표준액 저가 중과 배제 — v3 수도권/비수도권 이중 기준", () => {
  it("#11 수도권 1억 이하 주택 5채 보유자 신규 매매: 중과 배제", () => {
    // 설계서 anchor #11: 1억 이하 주택 5채 + 신규 4억 → 배제(1%)
    // 이 테스트는 신규 취득 주택의 시가표준액이 1억 이하인 경우
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 400_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 6, // 기존 5채 + 신규 1채
      wholeHouseStandardValue: 90_000_000, // 신규 주택 시가표준액 9천만 (1억 이하)
      isMetropolitanRegion: true,          // 수도권
      isUrbanRegenerationArea: false,
    });
    // 시가표준액 9천만 ≤ 1억(수도권 기준) → 중과 배제
    expect(result.isSurcharged).toBe(false);
    expect(result.exceptions.some(e => e.includes("중과 배제"))).toBe(true);
  });

  it("#12 정비구역 1억 이하 5채 + 신규 4억: 중과 (배제 안 됨)", () => {
    // 설계서 anchor #12: 정비구역 1억 이하여도 중과 배제 불가
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 400_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 6,
      wholeHouseStandardValue: 90_000_000,
      isMetropolitanRegion: true,
      isUrbanRegenerationArea: true, // 정비구역 → 배제 불가
    });
    // 정비구역 단서: 중과 배제 불가 → 다주택 중과 12% 적용
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.12);
  });

  it("#33 비수도권 시가표준액 1.5억 주택 매매 (3주택자): 중과 배제 (비수도권 2억 한도)", () => {
    // v3 F1: 비수도권 2억 한도 — 1.5억 주택은 중과 배제
    const isExempt = isExemptFromSurcharge_LowValue(
      150_000_000, // 1.5억
      false,        // 비수도권
      false         // 비정비구역
    );
    expect(isExempt).toBe(true);
  });

  it("#34 수도권 시가표준액 1.5억 주택 (3주택자): 중과 (수도권 1억 초과)", () => {
    // v3 F1: 수도권 1억 한도 — 1.5억은 초과 → 중과
    const isExempt = isExemptFromSurcharge_LowValue(
      150_000_000, // 1.5억
      true,         // 수도권
      false
    );
    expect(isExempt).toBe(false);
  });

  it("#35 비수도권 시가표준액 정확히 2억 (경계값): 중과 배제 (2억 이하)", () => {
    // v3 F1: 비수도권 2억 경계값 — 정확히 2억이면 배제
    const isExempt = isExemptFromSurcharge_LowValue(
      200_000_000, // 정확히 2억
      false,        // 비수도권
      false
    );
    expect(isExempt).toBe(true);
  });
});

// ============================================================
// 일시적 2주택 시점별 처분기한 Anchor (v3 F2)
// ============================================================

describe("[Anchor] 일시적 2주택 시점별 처분기한 — v3 §28의5 변천", () => {
  it("#36 2023.2.28 이후 잔금 (조정+조정): 처분기한 3년 단일", () => {
    // v3 F2: 2023.2.28~ 현행 → 모든 경우 3년
    const years = getDisposalDeadlineYears("2023-02-28", "regulated", "regulated");
    expect(years).toBe(3);

    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 2,
      isTemporaryTwoHouse: true,
      balanceDate: "2023-02-28",
      previousHouseRegion: "regulated",
      newHouseRegion: "regulated",
    });
    // 일시적 2주택 배제 → 기본세율
    expect(result.isSurcharged).toBe(false);
    expect(result.temporaryTwoHouseDeadlineYears).toBe(3);
  });

  it("#37 2022.5.10 잔금 (조정+조정): 처분기한 2년", () => {
    // v3 F2: 2022.5.10~2023.2.27 조정+조정 → 2년
    const years = getDisposalDeadlineYears("2022-05-10", "regulated", "regulated");
    expect(years).toBe(2);

    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 2,
      isTemporaryTwoHouse: true,
      balanceDate: "2022-05-10",
      previousHouseRegion: "regulated",
      newHouseRegion: "regulated",
    });
    expect(result.isSurcharged).toBe(false);
    expect(result.temporaryTwoHouseDeadlineYears).toBe(2);
  });

  it("#38 2022.5.9 이전 잔금 (조정+조정): 처분기한 1년", () => {
    // v3 F2: ~2022.5.9 조정+조정 → 1년
    const years = getDisposalDeadlineYears("2022-05-09", "regulated", "regulated");
    expect(years).toBe(1);

    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 2,
      isTemporaryTwoHouse: true,
      balanceDate: "2022-05-09",
      previousHouseRegion: "regulated",
      newHouseRegion: "regulated",
    });
    expect(result.isSurcharged).toBe(false);
    expect(result.temporaryTwoHouseDeadlineYears).toBe(1);
  });

  it("일시적 2주택 처분기한 날짜 계산 검증 (2023-03-15 + 3년 = 2026-03-15)", () => {
    const deadline = getDisposalDeadlineDate("2023-03-15", "regulated", "regulated");
    expect(deadline).toBe("2026-03-15");
  });

  it("비조정+비조정 조합은 모든 시점에서 3년", () => {
    expect(getDisposalDeadlineYears("2021-01-01", "non_regulated", "non_regulated")).toBe(3);
    expect(getDisposalDeadlineYears("2022-06-01", "non_regulated", "non_regulated")).toBe(3);
    expect(getDisposalDeadlineYears("2024-01-01", "non_regulated", "non_regulated")).toBe(3);
  });
});

// ============================================================
// 부담부증여 Anchor (P1-6)
// ============================================================

describe("[Anchor] 부담부증여 — P1-6 배우자·직계존비속 간 전체 무상 처리", () => {
  it("#14 부담부증여 (배우자 간): giftRelation=spouse_or_lineal → 취득원인 gift로 재정의", () => {
    // 설계서 anchor #14: 부담부증여(배우자) → 전체 무상 3.5%
    // P1-6: 지법 §7④ — 배우자 간 부담부증여는 전체 증여로 봄
    // SurchargeCheckInput 레벨에서는 비조정 또는 시가표준액 3억 미만 시 gift로 처리되어도 중과 없음
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "burdened_gift",
      acquisitionValue: 300_000_000, // 채무액
      acquiredBy: "individual",
      isRegulatedArea: true,
      giftRelation: "spouse_or_lineal", // 배우자
      wholeHouseStandardValue: 200_000_000, // 시가표준액 2억 → 3억 미만 → 중과 없음
    });
    // 배우자 간 부담부증여 → gift로 재정의 → 시가표준액 2억(3억 미만) → 중과 배제
    expect(result.isSurcharged).toBe(false);
    // exceptions에 배우자 부담부증여 무상 처리 메시지 포함
    expect(result.exceptions.some(e => e.includes("증여"))).toBe(true);
  });

  it("#14-b 부담부증여 (배우자 간, 조정지역 4억): giftRelation=spouse_or_lineal + giftorIs1HHHolder → 단서 배제", () => {
    // 조정지역 시가표준액 4억 증여이지만, 증여자가 1세대 1주택자 + 배우자 관계 → 단서 배제
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "burdened_gift",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      giftRelation: "spouse_or_lineal",
      wholeHouseStandardValue: 400_000_000, // 4억 (3억 이상)
      giftorIs1HHHolder: true,
      giftorRelation: "spouse",             // 배우자가 증여자 → 단서 가목
    });
    // 배우자 간 부담부증여 → gift로 재정의 → 조정+4억이지만 단서 배제(증여자 1주택자 + 배우자)
    expect(result.isSurcharged).toBe(false);
  });

  it("#15 부담부증여 (타인 간): giftRelation=other → 유상/무상 분리 (중과 판단 계속)", () => {
    // 설계서 anchor #15: 타인 간 부담부증여 → 유상/무상 분리 (비배제)
    // assessSurcharge 단계에서는 취득원인 그대로 "burdened_gift" 유지
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "burdened_gift",
      acquisitionValue: 300_000_000,
      acquiredBy: "individual",
      isRegulatedArea: false, // 비조정 → 유상부분 중과 없음
      houseCountAfter: 1,
      giftRelation: "other",  // 타인 → 분리 처리
    });
    // 타인 간 부담부증여 → 분리 계산. 여기서는 중과 판단만 (세금 분리는 acquisition-tax-base.ts)
    // 비조정 1주택 → 중과 없음
    expect(result.isSurcharged).toBe(false);
  });
});

// ============================================================
// 별장 중과 폐지 Anchor (P1-1 별장 분기)
// ============================================================

describe("[Anchor] 별장 중과 폐지 — §13⑤ 2023.3.14 이후", () => {
  it("#16 별장 매매 (2023.3.14 이후 잔금) 10억: 중과 폐지 → 기본세율", () => {
    // 설계서 anchor #16: 별장 매매 2023.3.14 이후 잔금 → 4% (중과 폐지)
    const result = assessSurcharge({
      propertyType: "building",
      acquisitionCause: "purchase",
      acquisitionValue: 1_000_000_000,
      acquiredBy: "individual",
      isLuxuryProperty: true,
      luxuryType: "villa",          // 별장
      basicRate: 0.04,
      balanceDate: "2023-03-14",    // 2023.3.14 이후 → 중과 폐지
    });
    expect(result.isSurcharged).toBe(false);
    expect(result.appliedBranch).toBe("villa_abolished");
  });

  it("별장 매매 2023.3.13 (폐지 전): 중과 적용", () => {
    // 2023.3.14 이전 → 별장 중과 여전히 적용
    const result = assessSurcharge({
      propertyType: "building",
      acquisitionCause: "purchase",
      acquisitionValue: 1_000_000_000,
      acquiredBy: "individual",
      isLuxuryProperty: true,
      luxuryType: "villa",
      basicRate: 0.04,
      balanceDate: "2023-03-13",
    });
    expect(result.isSurcharged).toBe(true);
    // 4% + 8%p = 12%
    expect(result.surchargeRate).toBe(0.12);
  });
});

// ============================================================
// 무상취득 단서 배제 Anchor (v3 F6 — 의붓자녀·계부모)
// ============================================================

describe("[Anchor] 무상취득 단서 배제 — v3 §28의6② (계부모·의붓자녀)", () => {
  it("#42 1세대 1주택자 → 의붓자녀 증여 (조정 4억): 단서 배제, 기본세율", () => {
    // v3 F6: §28의6② 1호 다목 2 — 의붓자녀(혼인 중 배우자의 직계비속)
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "gift",
      acquisitionValue: 400_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      wholeHouseStandardValue: 400_000_000, // 4억 (3억 이상)
      giftorIs1HHHolder: true,               // 증여자(부/모)가 1세대 1주택자
      giftorRelation: "lineal_descendant_step", // 다목 2: 의붓자녀
    });
    // 1세대 1주택자 + 의붓자녀 → 단서 배제 → 기본세율
    expect(result.isSurcharged).toBe(false);
    expect(result.giftExclusionReason).toContain("의붓자녀");
  });

  it("#43 1세대 1주택자 → 계부(직계존속 배우자) 증여 (조정 4억): 단서 배제", () => {
    // v3 F6: §28의6② 1호 나목 2 — 직계존속의 배우자(계부·계모)
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "gift",
      acquisitionValue: 400_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      wholeHouseStandardValue: 400_000_000, // 4억
      giftorIs1HHHolder: true,
      giftorRelation: "lineal_ascendant_spouse", // 나목 2: 계부·계모
    });
    expect(result.isSurcharged).toBe(false);
    expect(result.giftExclusionReason).toContain("계부");
  });

  it("#53 무상취득 조정지역 시가 4억 + 1세대 1주택자 → 배우자: 단서 배제 3.5%", () => {
    // v4 M3: #53 — 단서 분기
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "gift",
      acquisitionValue: 400_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      wholeHouseStandardValue: 400_000_000, // 4억 (3억 이상)
      giftorIs1HHHolder: true,               // 증여자 1세대 1주택자
      giftorRelation: "spouse",              // 가목: 배우자
    });
    expect(result.isSurcharged).toBe(false);
    // 단서 배제 → 3.5% (§11①2 표준세율) 적용 → 중과 없음
    expect(result.giftExclusionReason).toContain("배우자");
  });
});

// ============================================================
// §13⑦ 사치성 + 대도시 법인 중복 Anchor (v3 F5)
// ============================================================

describe("[Anchor] §13⑦ 사치성 + 대도시 법인 중복", () => {
  it("#39 사치성 + 대도시 법인 토지 4억: 4%×3 + 4%p = 16%", () => {
    // v3 F5: §13⑦ 본문 — 주택 외: 표준세율×300% + 중과기준세율×200% = 4%×3 + 4%p = 16%
    const result = assessSurcharge({
      propertyType: "land",
      acquisitionCause: "purchase",
      acquisitionValue: 400_000_000,
      acquiredBy: "corporation",
      isLuxuryProperty: true,
      basicRate: 0.04,           // 토지 표준세율 4%
      isCorpMetroSurcharge: true, // §13② 대도시 법인 중과 해당
    });
    expect(result.isSurcharged).toBe(true);
    // 4%×3 + 4%p = 12% + 4% = 16%
    expect(result.surchargeRate).toBe(0.16);
    expect(result.appliedBranch).toBe("luxury_corp");
    // 세금액 anchor: 4억 × 16% = 6,400만
    expect(Math.floor(400_000_000 * result.surchargeRate!)).toBe(64_000_000);
  });

  it("#40 사치성 + 대도시 법인 9억 초과 주택: 3% + 12%p = 15%", () => {
    // v3 F5: §13⑦ 단서 — 주택(§11①8): 해당 세율 + 중과기준세율×600%(=12%p)
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 1_000_000_000,
      acquiredBy: "corporation",
      isLuxuryProperty: true,
      luxuryType: "luxury_housing",
      basicRate: 0.03,           // 9억 초과 주택 3%
      isCorpMetroSurcharge: true, // §13② 대도시 법인
    });
    expect(result.isSurcharged).toBe(true);
    // 3% + 12%p = 15%
    expect(result.surchargeRate).toBe(0.15);
    expect(result.appliedBranch).toBe("luxury_corp");
    // 세금액 anchor: 10억 × 15% = 1억 5천만
    expect(Math.floor(1_000_000_000 * result.surchargeRate!)).toBe(150_000_000);
  });
});

// ============================================================
// §13의2④ 지정 전 계약 보호 Anchor (v3 F4)
// ============================================================

describe("[Anchor] §13의2④ 지정 전 계약 보호", () => {
  it("#41 조정지역 지정 전 매매계약 + 계약금 증빙 → 비조정지역 취득 간주 (중과 배제)", () => {
    // v3 F4: §13의2④ — 조정지역 지정고시일 이전 계약 + 계약금 증빙 → 비조정 간주
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,            // 잔금일 현재 조정지역
      houseCountAfter: 2,               // 2주택 → 원래라면 8% 중과
      contractDateBeforeRegulation: true, // 계약일이 지정 전
      hasContractDepositProof: true,      // 계약금 증빙 보유
    });
    // §13의2④ 보호 → isRegulatedArea = false 강제 → 비조정 2주택 → 중과 미해당
    expect(result.isSurcharged).toBe(false);
    expect(result.preRegulationContractApplied).toBe(true);
    expect(result.exceptions.some(e => e.includes("지정고시일 이전"))).toBe(true);
  });

  it("계약금 증빙 없으면 §13의2④ 보호 미적용", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 2,
      contractDateBeforeRegulation: true,
      hasContractDepositProof: false,  // 증빙 없음 → 보호 미적용
    });
    // 증빙 없음 → §13의2④ 적용 안 됨 → 조정 2주택 8% 중과
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.08);
  });
});

// ============================================================
// 무상취득 3분기 흐름 Anchor (v4 M3)
// ============================================================

describe("[Anchor] 무상취득 중과 3분기 흐름 — §13의2②", () => {
  it("#51 무상취득 비조정 시가 5억 (3억 이상): 기본세율 (비조정이므로)", () => {
    // v4 M3: 비조정은 중과 X
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "gift",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: false,           // 비조정
      wholeHouseStandardValue: 500_000_000, // 5억 (3억 이상이지만 비조정)
    });
    // 분기 2: 비조정지역 → 중과 미적용
    expect(result.isSurcharged).toBe(false);
  });

  it("#52 무상취득 조정 시가 2.5억 (3억 미만): 기본세율", () => {
    // v4 M3: 3억 미만 분기
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "gift",
      acquisitionValue: 250_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      wholeHouseStandardValue: 250_000_000, // 2.5억 (3억 미만)
    });
    // 분기 1: 시가표준액 3억 미만 → 중과 미적용
    expect(result.isSurcharged).toBe(false);
  });

  it("#9 조정지역 전체 시가 4억 증여 + 단서 없음: 12% 중과", () => {
    // 설계서 anchor #9: 조정지역 시가표준액 4억 증여 → 12%
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "gift",
      acquisitionValue: 400_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      wholeHouseStandardValue: 400_000_000, // 4억 (3억 이상)
      giftorIs1HHHolder: false, // 증여자 1세대 1주택자 아님 → 단서 미적용
    });
    // 분기 4: 조정지역 + 4억 + 단서 미배제 → 12%
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.12);
    expect(result.appliedBranch).toBe("gift_12");
    // 세금액 anchor: 4억 × 12% = 4,800만
    expect(Math.floor(400_000_000 * result.surchargeRate!)).toBe(48_000_000);
  });

  it("#10 조정지역 시가 2.5억 증여: 기본세율 (3억 미만)", () => {
    // 설계서 anchor #10: 조정 시가표준액 2.5억 증여 → 3.5%
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "gift",
      acquisitionValue: 250_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      wholeHouseStandardValue: 250_000_000, // 2.5억
    });
    // 3억 미만 → 중과 없음 → 기본세율(3.5%) 적용
    expect(result.isSurcharged).toBe(false);
  });
});

// ============================================================
// 사치성 + 6~9억 선형보간 Anchor
// ============================================================

describe("[Anchor] 사치성 재산 — 6~9억 선형보간 기본세율 + 8%p", () => {
  it("#4 사치성 6~9억 주택 8억: 약 2.333% + 8%p = 10.333%", () => {
    // 설계서 anchor #4: 8억 선형보간 2.333% → 사치성 단독: 2.333% + 8% = 10.333%
    // 선형보간: (8억×2 - 9억) / 300억 = 700억 / 300억 = 0.023333...
    const linearRate = (800_000_000 * 2 - 900_000_000) / 3_000_000_000;
    // = 700_000_000 / 3_000_000_000 ≈ 0.23333...% → 0.0023333...
    // 실제 세율: 위 계산은 보간 후 값
    // 지방세법 §11①8: (취득가 × 2 / 10억 - 3) / 100 = (16-3)/100 = 0.13/100... 다시 계산
    // §11①8 산식: 세율(%) = (취득가액 × 2 - 9억) × 10 / 300 = (8억×2-9억)×10/(300만원 단위)
    // 정확 산식: basicRate = (taxBase*2 - 900_000_000) / 30_000_000_000
    //   → (1_600_000_000 - 900_000_000) / 30_000_000_000 = 700_000_000 / 30_000_000_000
    //   ≈ 0.023333...%? 아니, 소수 그대로: 0.023333/10 = 0.0023333... → 이상
    // §11①8 표준: 8억 → {1% + (8억-6억)/(9억-6억) * (3%-1%)} = {1% + 2/3 * 2%} = {1% + 1.333%} = 2.333%
    const basicRate = 0.01 + (800_000_000 - 600_000_000) / (900_000_000 - 600_000_000) * 0.02;
    expect(basicRate).toBeCloseTo(0.02333, 4);

    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 800_000_000,
      acquiredBy: "individual",
      isLuxuryProperty: true,
      luxuryType: "luxury_housing",
      basicRate,
    });
    expect(result.isSurcharged).toBe(true);
    // basicRate + 8%p = 2.333% + 8% = 10.333%
    expect(result.surchargeRate).toBeCloseTo(0.10333, 4);
  });
});
