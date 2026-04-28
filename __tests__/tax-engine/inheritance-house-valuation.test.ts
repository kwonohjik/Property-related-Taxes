/**
 * 상속 주택 환산취득가 — 개별주택가격 미공시 + 1990 이전 토지 통합 처리 테스트
 *
 * Excel 13번 케이스 anchor 포함:
 *   상속개시일 1985-01-01, 양도일 2023-02-19, 양도가 920,000,000원
 *   토지 184.2㎡, 1990 이전 등급가액 환산
 */

import { describe, it, expect } from "vitest";
import { calculateInheritanceHouseValuation } from "../../lib/tax-engine/inheritance-house-valuation";
import { EXCEL_13_INHERITED_HOUSE_PRE_DISCLOSURE } from "./_helpers/inheritance-fixture";

// ──────────────────────────────────────────────────────────────────
// 1. Excel 13번 anchor — override 모드 (원단위 일치)
// ──────────────────────────────────────────────────────────────────
describe("Excel 13번 케이스 — 상속주택 환산가액 anchor", () => {
  const fx = EXCEL_13_INHERITED_HOUSE_PRE_DISCLOSURE;

  const input = {
    inheritanceDate: fx.inheritanceDate,
    transferDate: fx.transferDate,
    landArea: fx.landArea,
    landPricePerSqmAtTransfer: fx.landPricePerSqmAtTransfer,
    landPricePerSqmAtFirstDisclosure: fx.landPricePerSqmAtFirstDisclosure,
    housePriceAtTransfer: fx.housePriceAtTransfer,
    housePriceAtFirstDisclosure: fx.housePriceAtFirstDisclosure,
    housePriceAtInheritanceOverride: fx.housePriceAtInheritanceOverride,
    pre1990: fx.pre1990,
  };

  it("토지 환산단가 598,517원/㎡ 일치", () => {
    const r = calculateInheritanceHouseValuation(input);
    // 토지 기준시가 / 면적으로 역산
    expect(r.pre1990Result?.pricePerSqmAtAcquisition).toBe(fx.expected.landPricePerSqmAtInheritance);
  });

  it("상속개시일 토지 기준시가 110,246,831원 일치", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.landStdAtInheritance).toBe(fx.expected.landStdAtInheritance);
  });

  it("상속개시일 합계 기준시가 148,382,411원 일치 (Excel C37)", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.totalStdPriceAtInheritance).toBe(fx.expected.totalStdAtInheritance);
  });

  it("양도시 토지 기준시가 1,243,350,000원 일치", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.landStdAtTransfer).toBe(fx.expected.landStdAtTransfer);
  });

  it("양도시 합계 기준시가 1,269,486,250원 일치 (Excel C36)", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.totalStdPriceAtTransfer).toBe(fx.expected.totalStdAtTransfer);
  });

  it("주택가격 override 모드로 동작", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.estimationMethod).toBe("user_override");
    expect(r.housePriceAtInheritanceUsed).toBe(fx.housePriceAtInheritanceOverride);
  });

  it("pre1990Result가 존재하고 케이스 분류가 설정됨", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.pre1990Result).toBeDefined();
    expect(r.pre1990Result?.caseType).toBeDefined();
  });

  it("warnings 없음 (정상 입력)", () => {
    const r = calculateInheritanceHouseValuation(input);
    // pre1990 경고는 무시, 입력 자체 경고만 없어야 함
    const inputErrors = r.warnings.filter(w => w.includes("입력 오류"));
    expect(inputErrors).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. 1990-08-30 이후 상속 + 직접 입력 모드
// ──────────────────────────────────────────────────────────────────
describe("1990-08-30 이후 상속 — 개별공시지가 직접 입력", () => {
  const input = {
    inheritanceDate: new Date("1995-06-15"),
    transferDate: new Date("2023-05-10"),
    landArea: 100,
    landPricePerSqmAtTransfer: 5_000_000,
    landPricePerSqmAtFirstDisclosure: 1_200_000,
    landPricePerSqmAtInheritance: 800_000,
    housePriceAtTransfer: 300_000_000,
    housePriceAtFirstDisclosure: 180_000_000,
    housePriceAtInheritanceOverride: 100_000_000,
  };

  it("pre1990Result가 undefined (등급가액 환산 미실행)", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.pre1990Result).toBeUndefined();
  });

  it("토지 기준시가 = 100㎡ × 800,000 = 80,000,000", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.landStdAtInheritance).toBe(80_000_000);
  });

  it("합계 기준시가 = 80,000,000 + 100,000,000 = 180,000,000", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.totalStdPriceAtInheritance).toBe(180_000_000);
  });

  it("양도시 합계 = 500,000,000 + 300,000,000 = 800,000,000", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.totalStdPriceAtTransfer).toBe(800_000_000);
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. 1990-08-30 이전 + 주택가격 자동 추정 (PHD 토지 비율)
// ──────────────────────────────────────────────────────────────────
describe("1990-08-30 이전 + 주택가격 자동 추정 (estimationMethod=estimated_phd)", () => {
  const input = {
    inheritanceDate: new Date("1985-01-01"),
    transferDate: new Date("2023-02-19"),
    landArea: 184.2,
    landPricePerSqmAtTransfer: 6_750_000,
    landPricePerSqmAtFirstDisclosure: 1_560_000,
    housePriceAtTransfer: 26_136_250,
    housePriceAtFirstDisclosure: 42_630_000,
    // housePriceAtInheritanceOverride 없음 → 자동 추정
    pre1990: {
      pricePerSqm_1990: 1_100_000,
      grade_1990_0830: { gradeValue: 185_000 },
      gradePrev_1990_0830: { gradeValue: 98_400 },
      gradeAtAcquisition: { gradeValue: 77_100 },
    },
  };

  it("추정 방식이 estimated_phd", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.estimationMethod).toBe("estimated_phd");
  });

  it("추정값 = floor(42,630,000 × landStdA / landStdF)", () => {
    const r = calculateInheritanceHouseValuation(input);
    // landStdA = floor(184.2 × 598,517) = 110,246,831
    // landStdF = floor(184.2 × 1,560,000) = 287,352,000
    // estimated = floor(42,630,000 × 110,246,831 / 287,352,000)
    const expected = Math.floor(42_630_000 * 110_246_831 / 287_352_000);
    expect(r.housePriceAtInheritanceUsed).toBe(expected);
  });

  it("합계 기준시가 = landStdA + 추정 주택가격", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.totalStdPriceAtInheritance).toBe(r.landStdAtInheritance + r.housePriceAtInheritanceUsed);
  });
});

// ──────────────────────────────────────────────────────────────────
// 4. landPricePerSqmAtInheritance override (1990 이전이지만 직접 입력)
// ──────────────────────────────────────────────────────────────────
describe("landPricePerSqmAtInheritance override — pre1990보다 우선", () => {
  const input = {
    inheritanceDate: new Date("1983-07-26"),
    transferDate: new Date("2023-02-19"),
    landArea: 100,
    landPricePerSqmAtTransfer: 5_000_000,
    landPricePerSqmAtFirstDisclosure: 1_000_000,
    housePriceAtTransfer: 200_000_000,
    housePriceAtFirstDisclosure: 80_000_000,
    housePriceAtInheritanceOverride: 30_000_000,
    landPricePerSqmAtInheritance: 500_000,  // 직접 입력 (pre1990 무시)
    pre1990: {
      pricePerSqm_1990: 1_100_000,
      grade_1990_0830: { gradeValue: 185_000 },
      gradePrev_1990_0830: { gradeValue: 98_400 },
      gradeAtAcquisition: { gradeValue: 77_100 },
    },
  };

  it("pre1990Result가 undefined (직접 입력 우선 → 등급가액 환산 미실행)", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.pre1990Result).toBeUndefined();
  });

  it("토지 기준시가 = 100 × 500,000 = 50,000,000", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.landStdAtInheritance).toBe(50_000_000);
  });

  it("경고 메시지에 'direct input' 또는 '직접 입력값을 우선' 포함", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.warnings.some((w) => w.includes("직접 입력값을 우선"))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// 5. 경계값 — 면적/주택가격 최솟값, 소수 면적
// ──────────────────────────────────────────────────────────────────
describe("경계값 테스트", () => {
  it("면적 0 이하 시 오류", () => {
    expect(() =>
      calculateInheritanceHouseValuation({
        inheritanceDate: new Date("1995-01-01"),
        transferDate: new Date("2023-01-01"),
        landArea: 0,
        landPricePerSqmAtTransfer: 1_000_000,
        landPricePerSqmAtFirstDisclosure: 500_000,
        landPricePerSqmAtInheritance: 300_000,
        housePriceAtTransfer: 100_000_000,
        housePriceAtFirstDisclosure: 60_000_000,
      })
    ).toThrow();
  });

  it("1990-08-30 이후 + landPricePerSqmAtInheritance 미제공 시 오류", () => {
    expect(() =>
      calculateInheritanceHouseValuation({
        inheritanceDate: new Date("1995-01-01"),
        transferDate: new Date("2023-01-01"),
        landArea: 100,
        landPricePerSqmAtTransfer: 1_000_000,
        landPricePerSqmAtFirstDisclosure: 500_000,
        housePriceAtTransfer: 100_000_000,
        housePriceAtFirstDisclosure: 60_000_000,
        // landPricePerSqmAtInheritance 미제공, pre1990도 없음
      })
    ).toThrow();
  });

  it("소수 면적(184.2㎡) 정수 연산 — 결과가 정수", () => {
    const r = calculateInheritanceHouseValuation({
      inheritanceDate: new Date("1985-01-01"),
      transferDate: new Date("2023-02-19"),
      landArea: 184.2,
      landPricePerSqmAtTransfer: 6_750_000,
      landPricePerSqmAtFirstDisclosure: 1_560_000,
      landPricePerSqmAtInheritance: 598_517,
      housePriceAtTransfer: 26_136_250,
      housePriceAtFirstDisclosure: 42_630_000,
      housePriceAtInheritanceOverride: 38_135_580,
    });
    expect(Number.isInteger(r.landStdAtInheritance)).toBe(true);
    expect(Number.isInteger(r.totalStdPriceAtInheritance)).toBe(true);
    expect(Number.isInteger(r.totalStdPriceAtTransfer)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// 6. formula / legalBasis 형식 검증
// ──────────────────────────────────────────────────────────────────
describe("출력 형식 검증", () => {
  const fx = EXCEL_13_INHERITED_HOUSE_PRE_DISCLOSURE;
  const input = {
    inheritanceDate: fx.inheritanceDate,
    transferDate: fx.transferDate,
    landArea: fx.landArea,
    landPricePerSqmAtTransfer: fx.landPricePerSqmAtTransfer,
    landPricePerSqmAtFirstDisclosure: fx.landPricePerSqmAtFirstDisclosure,
    housePriceAtTransfer: fx.housePriceAtTransfer,
    housePriceAtFirstDisclosure: fx.housePriceAtFirstDisclosure,
    housePriceAtInheritanceOverride: fx.housePriceAtInheritanceOverride,
    pre1990: fx.pre1990,
  };

  it("formula는 비어있지 않음", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.formula.length).toBeGreaterThan(10);
  });

  it("formula에 변수약어(P_F, Sum_A) 없음 (한국어 원칙)", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.formula).not.toMatch(/P_[A-Z]/);
    expect(r.formula).not.toMatch(/Sum_[A-Z]/);
  });

  it("legalBasis에 §176조의2④ 포함", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.legalBasis).toContain("§176조의2④");
  });

  it("1990 이전 케이스의 legalBasis에 §80⑥ 포함", () => {
    const r = calculateInheritanceHouseValuation(input);
    expect(r.legalBasis).toContain("§80⑥");
  });
});
