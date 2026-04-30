/**
 * 취득세 Phase 3 — 주택 수 산정 정교화 Anchor 테스트
 *
 * 설계 문서: acquisition-tax-upgrade.phases.md §1 Phase 3 "완료 기준"
 *
 * 검증 시나리오:
 * 기본 제외 (#1~#3): 시가표준액 1억 이하 수도권/비수도권 2억 제외
 * 한시 특례 취득 주택 (#4~#6): 신축/임대/미분양 카운트 제외
 * 세대 별도 인정 (#7~#9): 30세 미만 소득/동거봉양/해외출국
 * 미성년 예외 (#10): 미성년은 30세 미만 소득 조건 불가
 * 공유지분 (#11~#12): 1세대 내 공유 1주택 / 별도세대 공유 각자 1주택
 * 공동상속 (#13~#16): 5년 미경과 제외 / 주된 상속자 판정
 * 권리취득일 소급 (#17~#18): 분양권 기준일 소급 / 일반 매매는 잔금일
 * 신탁 가산 (#19): 위탁자 주택 수 가산
 * 통합 시나리오 (#20~#23): 복수 조건 조합
 */

import { describe, it, expect } from "vitest";
import { calculateHouseCount } from "../../../lib/tax-engine/house-count/index";
import { isSeparateHousehold } from "../../../lib/tax-engine/house-count/household";
import { assessMainInheritor, isExcludedBy5YearRule } from "../../../lib/tax-engine/house-count/inheritance";
import { countCoOwnedHouse } from "../../../lib/tax-engine/house-count/co-ownership";
import { getHouseCountReferenceDate } from "../../../lib/tax-engine/house-count/right-acquisition";
import { assessHansiBenefitForPendingAcquisition } from "../../../lib/tax-engine/house-count/hansi";

// ============================================================
// 기본 시가표준액 제외 Anchor
// ============================================================

describe("[Anchor] 시가표준액 저가 주택 제외", () => {
  it("#1 수도권 1억 이하 빌라 5채 + 주택 1채 → 실효 1주택", () => {
    // 설계 완료 기준: "시가표준액 1억 이하 빌라 5채 + 1주택 → 실효 1주택 → 기본세율"
    const result = calculateHouseCount({
      houses: [
        { id: "villa1", standardValue: 80_000_000, type: "villa", acquisitionDate: "2020-01-01", isMetropolitan: true },
        { id: "villa2", standardValue: 90_000_000, type: "villa", acquisitionDate: "2020-02-01", isMetropolitan: true },
        { id: "villa3", standardValue: 50_000_000, type: "villa", acquisitionDate: "2020-03-01", isMetropolitan: true },
        { id: "villa4", standardValue: 70_000_000, type: "villa", acquisitionDate: "2020-04-01", isMetropolitan: true },
        { id: "villa5", standardValue: 100_000_000, type: "villa", acquisitionDate: "2020-05-01", isMetropolitan: true }, // 정확히 1억
        { id: "apt1",   standardValue: 500_000_000, type: "apartment", acquisitionDate: "2021-01-01", isMetropolitan: true },
      ],
      rights: [],
      offices: [],
      referenceDate: "2026-04-30",
    });

    // 수도권 1억 이하 빌라 5채 모두 제외 (100,000,000 정확히 1억도 제외)
    expect(result.effectiveCount).toBe(1); // 아파트 1채만 카운트
    expect(result.excludedDetails.filter(e => e.reason === "low_value_metro")).toHaveLength(5);
    // 펜딩 없으므로 pendingAcquisitionIncluded = true (기본)
    expect(result.pendingAcquisitionIncluded).toBe(true);
  });

  it("#2 비수도권 시가표준액 1.5억 빌라 5채 + 1주택 → 실효 1주택 (비수도권 2억 한도)", () => {
    // 설계 완료 기준: "비수도권 시가표준액 1.5억 빌라 5채 + 1주택 → 실효 1주택"
    const result = calculateHouseCount({
      houses: [
        { id: "v1", standardValue: 150_000_000, type: "villa", acquisitionDate: "2020-01-01", isMetropolitan: false },
        { id: "v2", standardValue: 150_000_000, type: "villa", acquisitionDate: "2020-02-01", isMetropolitan: false },
        { id: "v3", standardValue: 150_000_000, type: "villa", acquisitionDate: "2020-03-01", isMetropolitan: false },
        { id: "v4", standardValue: 150_000_000, type: "villa", acquisitionDate: "2020-04-01", isMetropolitan: false },
        { id: "v5", standardValue: 150_000_000, type: "villa", acquisitionDate: "2020-05-01", isMetropolitan: false },
        { id: "apt", standardValue: 400_000_000, type: "apartment", acquisitionDate: "2021-01-01", isMetropolitan: false },
      ],
      rights: [],
      offices: [],
      referenceDate: "2026-04-30",
    });

    // 비수도권 2억 이하이므로 1.5억 빌라 5채 모두 제외
    expect(result.effectiveCount).toBe(1);
    expect(result.excludedDetails.filter(e => e.reason === "low_value_non_metro")).toHaveLength(5);
  });

  it("#3 수도권 1억 초과(1.1억) 빌라는 제외 안 됨", () => {
    const result = calculateHouseCount({
      houses: [
        { id: "v1", standardValue: 110_000_000, type: "villa", acquisitionDate: "2020-01-01", isMetropolitan: true },
      ],
      rights: [],
      offices: [],
      referenceDate: "2026-04-30",
    });

    expect(result.effectiveCount).toBe(1);
    expect(result.excludedDetails).toHaveLength(0);
  });
});

// ============================================================
// 취득 주택 한시 특례 카운트 제외 Anchor
// ============================================================

describe("[Anchor] 취득 주택 한시 특례 카운트 제외 (§28의4②)", () => {
  it("#4 2024년 신축 55㎡·2억 도시형생활주택 취득 + 보유 1주택 → 1주택 산정", () => {
    // 설계 완료 기준: "2024년 신축 55㎡·2억 도시형생활주택 취득 + 보유 1주택 → 1주택으로 산정"
    const result = calculateHouseCount({
      houses: [
        { id: "existing", standardValue: 300_000_000, type: "apartment", acquisitionDate: "2020-01-01", isMetropolitan: false },
      ],
      rights: [],
      offices: [],
      pendingAcquisition: {
        isMetropolitan: false,
        acquisitionValue: 200_000_000,  // 2억 (비수도권 3억 이하)
        areaSqm: 55,                    // 55㎡ (60㎡ 이하)
        type: "urban_living",
        isHansiBenefitNewBuild: true,
      },
      referenceDate: "2025-06-01", // 한시 기간 내
    });

    // 취득 주택이 한시 특례 → 카운트 제외 → 실효 1주택 (보유 기존 1채)
    expect(result.effectiveCount).toBe(1);
    expect(result.pendingAcquisitionIncluded).toBe(false);
    expect(result.hansiBenefitDetails).toHaveLength(1);
    expect(result.hansiBenefitDetails![0].type).toBe("new_build");
  });

  it("#5 취득 주택이 한시 특례 미분양 아파트 → 보유 3주택 + 신규 = 3주택 산정", () => {
    // 설계 완료 기준: "취득 주택이 한시 특례 미분양 아파트 → 보유 3주택 + 신규 1주택 = 3주택 산정"
    const result = calculateHouseCount({
      houses: [
        { id: "h1", standardValue: 500_000_000, type: "apartment", acquisitionDate: "2018-01-01", isMetropolitan: false },
        { id: "h2", standardValue: 400_000_000, type: "apartment", acquisitionDate: "2019-01-01", isMetropolitan: false },
        { id: "h3", standardValue: 300_000_000, type: "apartment", acquisitionDate: "2020-01-01", isMetropolitan: false },
      ],
      rights: [],
      offices: [],
      pendingAcquisition: {
        isMetropolitan: false,
        acquisitionValue: 500_000_000,  // 5억 (6억 이하)
        areaSqm: 80,                    // 80㎡ (85㎡ 이하)
        type: "apartment",
        isHansiBenefitUnsoldApt: true,
      },
      referenceDate: "2025-06-01", // 2025.12.31 이내
    });

    // 취득 주택 카운트 제외 → 3주택 (보유 3채만 산정)
    expect(result.effectiveCount).toBe(3);
    expect(result.pendingAcquisitionIncluded).toBe(false);
    expect(result.hansiBenefitDetails![0].type).toBe("unsold_apt");
  });

  it("#6 한시 특례 기간 외 신축 → 제외 미적용 (4주택 산정)", () => {
    const result = calculateHouseCount({
      houses: [
        { id: "h1", standardValue: 300_000_000, type: "apartment", acquisitionDate: "2018-01-01", isMetropolitan: false },
        { id: "h2", standardValue: 300_000_000, type: "apartment", acquisitionDate: "2019-01-01", isMetropolitan: false },
        { id: "h3", standardValue: 300_000_000, type: "apartment", acquisitionDate: "2020-01-01", isMetropolitan: false },
      ],
      rights: [],
      offices: [],
      pendingAcquisition: {
        isMetropolitan: false,
        acquisitionValue: 200_000_000,
        areaSqm: 55,
        type: "urban_living",
        isHansiBenefitNewBuild: true,
      },
      referenceDate: "2028-06-01", // 2027.12.31 이후 → 한시 기간 외
    });

    // 한시 기간 외 → 취득 주택 카운트 포함 → 4주택
    expect(result.effectiveCount).toBe(4);
    expect(result.pendingAcquisitionIncluded).toBe(true);
    expect(result.warnings.some(w => w.includes("2027.12.31"))).toBe(true);
  });
});

// ============================================================
// 세대 별도 인정 Anchor
// ============================================================

describe("[Anchor] 세대 별도 인정 4종 (§28의3②)", () => {
  it("#7 30세 미만 자녀 소득 충족 + 미성년 아님 → 별도 세대 인정", () => {
    // 설계 완료 기준: "30세 미만 자녀 소득 충족 + 미성년 아님 → 별도 세대 인정"
    const result = isSeparateHousehold({
      members: [{
        relation: "child",
        age: 25,
        isMinor: false,
        income12Months: 30_000_000,  // 3천만원 (기준중위소득 40% 이상)
        medianIncome: 30_000_000,     // 기준중위소득 (12개월)
        hasIndependentLivelihood: true,
      }],
    });

    expect(result.isSeparate).toBe(true);
    expect(result.reason).toBe("under30_income");
  });

  it("#8 65세 이상 직계존속 동거봉양 합가 → 별도 세대 인정", () => {
    const result = isSeparateHousehold({
      members: [{
        relation: "parent",
        age: 70,
        isElderlyCohabitation: true,
      }],
    });

    expect(result.isSeparate).toBe(true);
    expect(result.reason).toBe("over65_cohabitation");
  });

  it("#9 90일 이상 해외 출국 → 별도 세대 인정", () => {
    const result = isSeparateHousehold({
      members: [{
        relation: "self",
        age: 40,
        overseasMoreThan90Days: true,
      }],
    });

    expect(result.isSeparate).toBe(true);
    expect(result.reason).toBe("overseas_90days");
  });

  it("#10 미성년(18세) 자녀는 30세 미만 소득 조건 불충족 — 별도 세대 인정 불가 [v4 D7]", () => {
    // 설계 v4 D7: 미성년 예외 — 만 19세 미만은 소득 조건 있어도 별도 세대 인정 불가
    const result = isSeparateHousehold({
      members: [{
        relation: "child",
        age: 18,
        isMinor: true,   // 미성년 플래그
        income12Months: 30_000_000,
        medianIncome: 30_000_000,
        hasIndependentLivelihood: true,
      }],
    });

    // 미성년이므로 별도 세대 인정 불가
    expect(result.isSeparate).toBe(false);
  });
});

// ============================================================
// 공유지분 Anchor
// ============================================================

describe("[Anchor] 공유지분 주택 수 카운트 (§28의4④)", () => {
  it("#11 부부 공동명의 1주택 (1세대) → 1주택 카운트", () => {
    // 설계 완료 기준: "부부 공동명의 1주택 (1세대) → 1주택 카운트"
    const result = countCoOwnedHouse({
      ownershipShare: 0.5,
      coOwnersAllInHousehold: true, // 1세대 내 공유
    });

    expect(result.countForTaxpayer).toBe(1);
    expect(result.reason).toContain("1세대 내 공유");
  });

  it("#12 부부 공동명의 1주택 (별도세대) → 부부 각 1주택", () => {
    // 설계 완료 기준: "부부 공동명의 1주택 (별도세대) → 부부 각 1주택"
    const result = countCoOwnedHouse({
      ownershipShare: 0.5,
      coOwnersAllInHousehold: false, // 별도세대 공유
    });

    expect(result.countForTaxpayer).toBe(1); // 납세자 입장에서 1주택
    expect(result.reason).toContain("별도세대와 공유");
  });
});

// ============================================================
// 공동상속 Anchor
// ============================================================

describe("[Anchor] 공동상속 주택 수 산정 (§28의4⑤·⑥3호)", () => {
  it("#13 공동상속 5년 미경과 → 주택 수에서 제외", () => {
    // 설계 완료 기준: "공동상속 (지분 50%+50%, 본인 거주, 5년 미경과) → 주택 수에서 제외"
    const isExcluded = isExcludedBy5YearRule("2023-01-01", "2026-04-30");
    expect(isExcluded).toBe(true); // 3년 경과 → 5년 미만
  });

  it("#14 공동상속 5년 경과 → 주된 상속자 판정으로 카운트", () => {
    // 설계 완료 기준: "공동상속 (지분 50%+50%, 본인 거주, 5년 경과) → 본인이 주된 상속자로 카운트"
    const isExcluded = isExcludedBy5YearRule("2018-01-01", "2026-04-30");
    expect(isExcluded).toBe(false); // 8년 경과 → 5년 이상

    // 동순위(50%+50%) + 거주자 → 주된 상속자
    const mainResult = assessMainInheritor({
      shareOfTaxpayer: 0.5,
      maxShareInInheritors: 0.5,
      tieInMaxShare: true,
      isResident: true, // 거주자
      isOldest: false,
    });
    expect(mainResult.isMainInheritor).toBe(true);
  });

  it("#15 동순위 + 비거주자 + 최연장자 아님 → 주된 상속자 아님 → 카운트 제외", () => {
    const mainResult = assessMainInheritor({
      shareOfTaxpayer: 0.5,
      maxShareInInheritors: 0.5,
      tieInMaxShare: true,
      isResident: false,  // 비거주자
      isOldest: false,    // 최연장자 아님
    });
    expect(mainResult.isMainInheritor).toBe(false);
  });

  it("#16 단독 최대 지분 → 주된 상속자 → 카운트 포함", () => {
    const mainResult = assessMainInheritor({
      shareOfTaxpayer: 0.6,
      maxShareInInheritors: 0.4,
      tieInMaxShare: false,
      isResident: false,
      isOldest: false,
    });
    expect(mainResult.isMainInheritor).toBe(true);
  });
});

// ============================================================
// 권리취득일 소급 Anchor
// ============================================================

describe("[Anchor] 권리취득일 소급 산정 (§28의4①)", () => {
  it("#17 2023년 분양권 + 2024년 주택 매수 + 2026년 등기 → 2023년 기준 산정", () => {
    // 설계 완료 기준: "2023년 분양권 + 2024년 주택 매수 + 2026년 등기 → 2023년 기준 산정"
    const result = getHouseCountReferenceDate({
      acquiredViaRight: true,
      rightAcquisitionDate: "2023-06-15", // 2023년 분양권 취득
      balancePaymentDate: "2026-05-01",    // 2026년 잔금
    });

    expect(result.referenceDate).toBe("2023-06-15");
    expect(result.isRightAcquisitionSoGup).toBe(true);
  });

  it("#18 일반 매매는 잔금일 기준", () => {
    const result = getHouseCountReferenceDate({
      acquiredViaRight: false,
      balancePaymentDate: "2026-05-01",
    });

    expect(result.referenceDate).toBe("2026-05-01");
    expect(result.isRightAcquisitionSoGup).toBe(false);
  });
});

// ============================================================
// 신탁 가산 Anchor
// ============================================================

describe("[Anchor] 신탁재산 위탁자 카운트 가산 (§13의3 1호)", () => {
  it("#19 보유 1주택 + 신탁 2주택 → 실효 3주택", () => {
    const result = calculateHouseCount({
      houses: [
        { id: "own", standardValue: 500_000_000, type: "apartment", acquisitionDate: "2020-01-01", isMetropolitan: true },
      ],
      rights: [],
      offices: [],
      trustedHouseCount: 2, // 위탁자 명의 신탁 주택 2채
      referenceDate: "2026-04-30",
    });

    expect(result.effectiveCount).toBe(3);
    expect(result.trustedHouseCount).toBe(2);
  });
});

// ============================================================
// 통합 시나리오 Anchor
// ============================================================

describe("[Anchor] 통합 시나리오", () => {
  it("#20 1억 이하 빌라 5채 + 보유 1주택 + 취득 1주택 → 실효 2주택 (기본세율 x)", () => {
    // 빌라 5채 모두 제외 → 기존 1주택 + 취득 1주택 = 2주택 → 중과 대상
    const result = calculateHouseCount({
      houses: [
        // 수도권 1억 이하 빌라 5채
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `villa${i}`,
          standardValue: 80_000_000,
          type: "villa" as const,
          acquisitionDate: "2020-01-01",
          isMetropolitan: true,
        })),
        // 실제 보유 주택 1채
        { id: "apt", standardValue: 500_000_000, type: "apartment" as const, acquisitionDate: "2021-01-01", isMetropolitan: true },
      ],
      rights: [],
      offices: [],
      pendingAcquisition: {
        isMetropolitan: true,
        acquisitionValue: 800_000_000,
        type: "apartment",
      },
      referenceDate: "2026-04-30",
    });

    // 빌라 5채 제외 → 기존 1채 + 취득 1채 = 실효 2주택
    expect(result.effectiveCount).toBe(2);
    expect(result.excludedDetails.filter(e => e.reason === "low_value_metro")).toHaveLength(5);
    expect(result.pendingAcquisitionIncluded).toBe(true);
  });

  it("#21 입주권 1개 + 보유 2주택 + 취득 1주택 → 4주택 산정", () => {
    // 입주권도 주택 수에 포함 (제외 사유 없음)
    const result = calculateHouseCount({
      houses: [
        { id: "h1", standardValue: 500_000_000, type: "apartment", acquisitionDate: "2019-01-01", isMetropolitan: true },
        { id: "h2", standardValue: 400_000_000, type: "apartment", acquisitionDate: "2020-01-01", isMetropolitan: true },
      ],
      rights: [
        { id: "r1", type: "redevelopment_right", rightAcquisitionDate: "2021-05-01" },
      ],
      offices: [],
      pendingAcquisition: {
        isMetropolitan: true,
        acquisitionValue: 800_000_000,
      },
      referenceDate: "2026-04-30",
    });

    // 주택 2 + 입주권 1 + 취득 1 = 4주택
    expect(result.effectiveCount).toBe(4);
  });

  it("#22 오피스텔 1억 이하 1개 + 주택 1채 + 취득 1주택 → 2주택 (오피스텔 제외)", () => {
    const result = calculateHouseCount({
      houses: [
        { id: "h1", standardValue: 400_000_000, type: "apartment", acquisitionDate: "2020-01-01", isMetropolitan: true },
      ],
      rights: [],
      offices: [
        { id: "off1", standardValue: 80_000_000 }, // 1억 이하 → 제외
      ],
      pendingAcquisition: {
        isMetropolitan: true,
        acquisitionValue: 600_000_000,
      },
      referenceDate: "2026-04-30",
    });

    // 오피스텔 제외 → 주택 1 + 취득 1 = 2주택
    expect(result.effectiveCount).toBe(2);
    expect(result.excludedDetails.filter(e => e.reason === "low_value_office")).toHaveLength(1);
  });

  it("#23 상속 5년 미경과 주택 2채 + 보유 1주택 + 취득 1주택 → 2주택 산정", () => {
    // 상속 5년 미경과 2채 제외 → 보유 1채 + 취득 1채 = 2주택
    const result = calculateHouseCount({
      houses: [
        { id: "inh1", standardValue: 300_000_000, type: "apartment", acquisitionDate: "2022-01-01", isMetropolitan: true, inheritanceDate: "2022-01-01" },
        { id: "inh2", standardValue: 200_000_000, type: "villa", acquisitionDate: "2023-06-01", isMetropolitan: true, inheritanceDate: "2023-06-01" },
        { id: "own",  standardValue: 600_000_000, type: "apartment", acquisitionDate: "2018-01-01", isMetropolitan: true },
      ],
      rights: [],
      offices: [],
      pendingAcquisition: {
        isMetropolitan: true,
        acquisitionValue: 700_000_000,
      },
      referenceDate: "2026-04-30",
    });

    // 상속 5년 미경과 2채 제외 → 보유 1채 + 취득 1채 = 2주택
    expect(result.effectiveCount).toBe(2);
    expect(result.excludedDetails.filter(e => e.reason === "inheritance_under_5yr")).toHaveLength(2);
  });
});

// ============================================================
// 단위 함수 — 한시 특례 상세 테스트
// ============================================================

describe("[Anchor] 한시 특례 판정 — assessHansiBenefitForPendingAcquisition", () => {
  it("수도권 6억 이하 신축 60㎡ → 한시 특례 해당", () => {
    const result = assessHansiBenefitForPendingAcquisition(
      {
        isMetropolitan: true,
        acquisitionValue: 550_000_000, // 5.5억 (수도권 6억 이하)
        areaSqm: 59,
        type: "urban_living",
        isHansiBenefitNewBuild: true,
      },
      "2025-06-01"
    );

    expect(result.isHansiBenefit).toBe(true);
    expect(result.benefitType).toBe("new_build");
  });

  it("수도권 6억 초과 신축 → 한시 특례 미해당", () => {
    const result = assessHansiBenefitForPendingAcquisition(
      {
        isMetropolitan: true,
        acquisitionValue: 700_000_000, // 7억 (수도권 6억 초과)
        areaSqm: 55,
        type: "urban_living",
        isHansiBenefitNewBuild: true,
      },
      "2025-06-01"
    );

    expect(result.isHansiBenefit).toBe(false);
    // 취득가 초과 경고: "600,000,000원을 초과하여 카운트 제외 미적용"
    expect(result.warnings.some(w => w.includes("초과하여 카운트 제외 미적용"))).toBe(true);
  });

  it("비수도권 3억 이하 신축 60㎡ → 한시 특례 해당", () => {
    const result = assessHansiBenefitForPendingAcquisition(
      {
        isMetropolitan: false,
        acquisitionValue: 250_000_000, // 2.5억 (비수도권 3억 이하)
        areaSqm: 55,
        type: "villa",
        isHansiBenefitNewBuild: true,
      },
      "2025-06-01"
    );

    expect(result.isHansiBenefit).toBe(true);
  });

  it("면적 60㎡ 초과 → 한시 특례 미해당", () => {
    const result = assessHansiBenefitForPendingAcquisition(
      {
        isMetropolitan: false,
        acquisitionValue: 200_000_000,
        areaSqm: 65, // 60㎡ 초과
        type: "villa",
        isHansiBenefitNewBuild: true,
      },
      "2025-06-01"
    );

    expect(result.isHansiBenefit).toBe(false);
    expect(result.warnings.some(w => w.includes("60㎡를 초과"))).toBe(true);
  });
});

// ============================================================
// 경계값 테스트
// ============================================================

describe("[경계값] 상속 5년 경계 + 시가표준액 경계", () => {
  it("상속 정확히 5년 → 제외 안 됨 (5년 = 5년 이상 = 포함)", () => {
    // differenceInYears("2026-04-30", "2021-04-30") = 5 → 5년 경과 → 포함
    const isExcluded = isExcludedBy5YearRule("2021-04-30", "2026-04-30");
    expect(isExcluded).toBe(false); // 5년 경과 = 포함
  });

  it("상속 4년 364일 → 제외 됨 (5년 미경과)", () => {
    const isExcluded = isExcludedBy5YearRule("2021-05-01", "2026-04-30");
    expect(isExcluded).toBe(true); // 4년 364일 = 5년 미경과 = 제외
  });

  it("수도권 정확히 1억 → 제외 됨 (1억 이하 제외)", () => {
    const result = calculateHouseCount({
      houses: [
        { id: "v", standardValue: 100_000_000, type: "villa", acquisitionDate: "2020-01-01", isMetropolitan: true },
      ],
      rights: [],
      offices: [],
      referenceDate: "2026-04-30",
    });
    expect(result.effectiveCount).toBe(0);
    expect(result.excludedDetails[0].reason).toBe("low_value_metro");
  });

  it("수도권 1억 1원 → 제외 안 됨", () => {
    const result = calculateHouseCount({
      houses: [
        { id: "v", standardValue: 100_000_001, type: "villa", acquisitionDate: "2020-01-01", isMetropolitan: true },
      ],
      rights: [],
      offices: [],
      referenceDate: "2026-04-30",
    });
    expect(result.effectiveCount).toBe(1);
    expect(result.excludedDetails).toHaveLength(0);
  });

  it("오피스텔 정확히 1억 → 제외 됨 (1억 이하 제외)", () => {
    const result = calculateHouseCount({
      houses: [],
      rights: [],
      offices: [{ id: "off", standardValue: 100_000_000 }],
      referenceDate: "2026-04-30",
    });
    expect(result.effectiveCount).toBe(0);
    expect(result.excludedDetails[0].reason).toBe("low_value_office");
  });

  it("오피스텔 1억 1원 → 카운트 포함 (1억 초과)", () => {
    const result = calculateHouseCount({
      houses: [],
      rights: [],
      offices: [{ id: "off", standardValue: 100_000_001 }],
      referenceDate: "2026-04-30",
    });
    expect(result.effectiveCount).toBe(1);
  });

  it("30세 정확히 (under30 아님) → 별도 세대 인정 불가", () => {
    const result = isSeparateHousehold({
      members: [{
        relation: "child",
        age: 30, // 정확히 30세 = 30 미만 아님
        isMinor: false,
        income12Months: 30_000_000,
        medianIncome: 30_000_000,
        hasIndependentLivelihood: true,
      }],
    });
    expect(result.isSeparate).toBe(false); // age < 30 조건 미충족
  });

  it("혼인 전 분양권 (2026.12.31 경계 — 한시 종료일) → 제외 됨", () => {
    const result = calculateHouseCount({
      houses: [],
      rights: [
        {
          id: "r1",
          type: "subscription_right",
          rightAcquisitionDate: "2023-01-01",
          isPreMarriageSubscriptionRight: true,
        },
      ],
      offices: [],
      referenceDate: "2026-12-31", // 한시 종료일 (포함)
    });
    expect(result.effectiveCount).toBe(0); // 제외
    expect(result.excludedDetails[0].reason).toBe("pre_marriage_subscription_right");
  });

  it("혼인 전 분양권 (2027.01.01 이후 — 한시 종료 후) → 제외 안 됨", () => {
    const result = calculateHouseCount({
      houses: [],
      rights: [
        {
          id: "r1",
          type: "subscription_right",
          rightAcquisitionDate: "2023-01-01",
          isPreMarriageSubscriptionRight: true,
        },
      ],
      offices: [],
      referenceDate: "2027-01-01", // 한시 종료 후
    });
    expect(result.effectiveCount).toBe(1); // 포함 (한시 종료)
  });
});
