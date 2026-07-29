/**
 * 영농상속공제 §18의3 + 시행령 §16 — anchor 테스트
 *
 * 법령 검증: KoreanLaw MCP 2026-05-21
 * 계획서: docs/00-pm/inheritance-farming-deduction-expansion.plan.md §6.1
 */

import { describe, expect, it } from "vitest";

import {
  calcFarmingDeduction,
  deriveQualifiedHeirIds,
  resolveEffectiveQualifiedHeirIds,
  evaluateFarmingEligibility,
  evaluateFarmingEligibilityForHeir,
} from "@/lib/tax-engine/deductions/inheritance-deductions";
import type {
  FarmingHeirAssessment,
  FarmingInheritanceInput,
} from "@/lib/tax-engine/types/inheritance-farming.types";

// ============================================================
// 헬퍼 — 기본 충족 input 생성
// ============================================================

function personalOk(over: Partial<FarmingInheritanceInput> = {}): FarmingInheritanceInput {
  return {
    type: "personal",
    decedentEightYearFarming: true,
    decedentResidenceMet: true,
    heirIsAdult: true,
    heirTwoYearFarming: true,
    heirResidenceMet: true,
    ...over,
  };
}

function corporateOk(
  over: Partial<FarmingInheritanceInput> = {},
): FarmingInheritanceInput {
  return {
    type: "corporate",
    decedentEightYearFarming: false,  // corporate는 미평가
    decedentResidenceMet: false,
    decedentCorporateMet: true,
    heirIsAdult: true,
    heirTwoYearFarming: true,
    heirResidenceMet: false,  // corporate는 미평가
    heirCorporateOfficer: true,
    ...over,
  };
}

// ============================================================
// FD-1 ~ FD-16
// ============================================================

describe("calcFarmingDeduction — 영농상속공제 §18의3", () => {
  it("FD-1: farming 미입력 + farmingAssetValue=10억 (legacy)", () => {
    const r = calcFarmingDeduction(1_000_000_000);
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.evaluated).toBe(false);
    expect(r.detail.eligible).toBe(true);
  });

  it("FD-2: farming 충족 + 자산 20억", () => {
    const r = calcFarmingDeduction(2_000_000_000, personalOk());
    expect(r.deduction).toBe(2_000_000_000);
    expect(r.detail.eligible).toBe(true);
    expect(r.detail.evaluated).toBe(true);
  });

  it("FD-3: 자산 50억 → 30억 한도 cap", () => {
    const r = calcFarmingDeduction(5_000_000_000, personalOk());
    expect(r.deduction).toBe(3_000_000_000);
    expect(r.detail.cappedDeduction).toBe(3_000_000_000);
    expect(r.detail.appliedAssetValue).toBe(5_000_000_000);
  });

  it("FD-4: 피상속인 8년 미충족 → 0", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ decedentEightYearFarming: false }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16②1호가"))).toBe(true);
  });

  it("FD-5: 피상속인 거주지 미충족 → 0", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ decedentResidenceMet: false }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16②1호나"))).toBe(true);
  });

  it("FD-6: 상속인 17세 (heirIsAdult=false) → 0", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ heirIsAdult: false }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("18세"))).toBe(true);
  });

  it("FD-7: 상속인 2년 미충족 + 피상속인 65세 미만 사망 → 충족", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ heirTwoYearFarming: false, decedentEarlyDeath: true }),
    );
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.eligible).toBe(true);
  });

  it("FD-8: hasDisqualifyingIncome=true (§16⑭) → 0", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ hasDisqualifyingIncome: true }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭"))).toBe(true);
  });

  it("FD-9: hasTaxFraudConviction=true → early return 단독 reason", () => {
    // 다른 사유들도 미충족이지만 §18의3⑥로 단독 종결
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        decedentEightYearFarming: false,
        heirIsAdult: false,
        hasTaxFraudConviction: true,
      }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.length).toBe(1);
    expect(r.detail.ineligibleReasons[0]).toContain("§18의3⑥");
  });

  it("FD-10: 법인 영농 + 모든 요건 + 자산 5억", () => {
    const r = calcFarmingDeduction(500_000_000, corporateOk());
    expect(r.deduction).toBe(500_000_000);
    expect(r.detail.eligible).toBe(true);
  });

  it("FD-11: 법인 영농 + heirCorporateOfficer=false → 0", () => {
    const r = calcFarmingDeduction(
      500_000_000,
      corporateOk({ heirCorporateOfficer: false }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16③2호나"))).toBe(true);
  });

  it("FD-12: 후계자 + 18세·2년·거주 미충족 → 충족 (피상속인 요건 충족)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        isDesignatedSuccessor: true,
        heirIsAdult: false,
        heirTwoYearFarming: false,
        heirResidenceMet: false,
      }),
    );
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.eligible).toBe(true);
  });

  it("FD-13: 후계자 + 피상속인 8년 미충족 → 0 (피상속인 요건은 별개)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        isDesignatedSuccessor: true,
        decedentEightYearFarming: false,
      }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16②1호가"))).toBe(true);
  });

  it("FD-14: 후계자 + hasDisqualifyingIncome=true (§16⑭ 후계자에도 적용)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        isDesignatedSuccessor: true,
        hasDisqualifyingIncome: true,
      }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭"))).toBe(true);
  });

  it("FD-15: farming=undefined + 자산 10억 → legacy 모드 (evaluated=false)", () => {
    const r = calcFarmingDeduction(1_000_000_000);
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.evaluated).toBe(false);
    expect(r.detail.eligible).toBe(true);
    expect(r.detail.ineligibleReasons).toEqual([]);
  });

  it("FD-16: farming 입력 + 미충족 + 자산 5억 → 공제 0, 입력값 보존", () => {
    const r = calcFarmingDeduction(
      500_000_000,
      personalOk({ decedentEightYearFarming: false }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.appliedAssetValue).toBe(500_000_000);
    expect(r.detail.cappedDeduction).toBe(0);
    expect(r.detail.ineligibleReasons.length).toBeGreaterThan(0);
  });
});

// ============================================================
// FD-17 ~ FD-19: §16② 단서 (F-9, 2026-05-21)
// ============================================================

describe("§16② 단서 — 영농상속 후 최대주주 사망 (corporate 전용)", () => {
  it("FD-17: corporate + isSecondaryAfterFarmingInheritance=true → 0 + 단독 reason", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      corporateOk({ isSecondaryAfterFarmingInheritance: true }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.length).toBe(1);
    expect(r.detail.ineligibleReasons[0]).toContain("§16② 단서");
  });

  it("FD-18: personal + isSecondaryAfterFarmingInheritance=true → 단서 무시 (corporate 전용)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ isSecondaryAfterFarmingInheritance: true }),
    );
    // personal은 단서 적용 안 됨 — 다른 요건 모두 충족이라 공제 적용
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.eligible).toBe(true);
  });

  it("FD-19: corporate + 단서=true + 다른 요건 모두 미충족 → 단서 단독 종결", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      corporateOk({
        isSecondaryAfterFarmingInheritance: true,
        decedentCorporateMet: false,
        heirIsAdult: false,
        heirCorporateOfficer: false,
      }),
    );
    // 단서 early return 이므로 다른 reasons 추가 안 됨
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.length).toBe(1);
    expect(r.detail.ineligibleReasons[0]).toContain("§16② 단서");
  });

  it("FD-20: corporate + isSecondaryAfterFarmingInheritance=false → 정상 평가", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      corporateOk({ isSecondaryAfterFarmingInheritance: false }),
    );
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.eligible).toBe(true);
  });

  it("FD-21: 단서 + hasTaxFraudConviction=true → §18의3⑥ 우선 (먼저 평가)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      corporateOk({
        isSecondaryAfterFarmingInheritance: true,
        hasTaxFraudConviction: true,
      }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.length).toBe(1);
    expect(r.detail.ineligibleReasons[0]).toContain("§18의3⑥");
  });
});

// ============================================================
// evaluateFarmingEligibility 단위
// ============================================================

describe("evaluateFarmingEligibility — 자격 평가 분리", () => {
  it("모든 요건 충족 → eligible=true, reasons=[]", () => {
    const r = evaluateFarmingEligibility(personalOk());
    expect(r.eligible).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("조세포탈 early return — §16⑭·피상속인 미충족도 함께 있어도 단독 종결", () => {
    const r = evaluateFarmingEligibility(
      personalOk({
        hasTaxFraudConviction: true,
        hasDisqualifyingIncome: true,
        decedentEightYearFarming: false,
      }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons.length).toBe(1);
    expect(r.reasons[0]).toContain("§18의3⑥");
  });

  it("후계자 트랙 — 피상속인 요건 평가 후 18세·2년·거주 건너뜀", () => {
    const r = evaluateFarmingEligibility(
      personalOk({
        isDesignatedSuccessor: true,
        heirIsAdult: false,
        heirTwoYearFarming: false,
        heirResidenceMet: false,
      }),
    );
    expect(r.eligible).toBe(true);
  });

  it("corporate 모드 — heirResidenceMet 평가 안 함", () => {
    const r = evaluateFarmingEligibility(
      corporateOk({ heirResidenceMet: false }),
    );
    expect(r.eligible).toBe(true);
  });
});

// ============================================================
// 부록 A — 상속인별 분리 자격 평가 (FH-1~6, 2026-05-22)
// KoreanLaw §16⑭ 검증 완료 `20f75e2`
// ============================================================

function heirAssess(
  over: Partial<FarmingHeirAssessment> = {},
): FarmingHeirAssessment {
  return {
    heirId: "h1",
    heirIsAdult: true,
    heirTwoYearFarming: true,
    heirResidenceMet: true,
    ...over,
  };
}

describe("부록 A — 상속인별 분리 자격 평가 (heirAssessments)", () => {
  it("FH-1: heirAssessments 미입력 → deriveQualifiedHeirIds = undefined (legacy)", () => {
    const ids = deriveQualifiedHeirIds(personalOk());
    expect(ids).toBeUndefined();
  });

  it("FH-2: 3명 상속인 중 1명만 자격 충족 → qualifiedHeirIds=['h1'] 자동 도출", () => {
    const input: FarmingInheritanceInput = {
      ...personalOk(),
      // 폼-수준 heir 필드는 무시되고 heirAssessments가 우선
      heirAssessments: [
        heirAssess({ heirId: "h1", heirIsAdult: true, heirTwoYearFarming: true, heirResidenceMet: true }),
        heirAssess({ heirId: "h2", heirIsAdult: false }), // 16세
        heirAssess({ heirId: "h3", heirTwoYearFarming: false }), // 2년 미충족 + 65세 이상
      ],
    };
    const ids = deriveQualifiedHeirIds(input);
    expect(ids).toEqual(["h1"]);
  });

  it("FH-3: 피상속인 8년 미충족 → 폼-수준 미충족 → 모든 heir [] 반환", () => {
    const input: FarmingInheritanceInput = {
      ...personalOk({ decedentEightYearFarming: false }),
      heirAssessments: [
        heirAssess({ heirId: "h1" }),
        heirAssess({ heirId: "h2" }),
      ],
    };
    const ids = deriveQualifiedHeirIds(input);
    // 피상속인 §16②1호가 미충족 → 모든 heir 자동 미충족
    expect(ids).toEqual([]);
  });

  it("FH-4: §18의3⑥ 조세포탈 → heirAssessments 무관 단독 종결", () => {
    const input: FarmingInheritanceInput = {
      ...personalOk({ hasTaxFraudConviction: true }),
      heirAssessments: [
        heirAssess({ heirId: "h1" }), // 모든 요건 충족이어도
      ],
    };
    const ids = deriveQualifiedHeirIds(input);
    expect(ids).toEqual([]);
  });

  it("FH-5: 후계자 트랙 + 다른 상속인 미충족 → 후계자만 자격자", () => {
    const input: FarmingInheritanceInput = {
      ...personalOk(),
      heirAssessments: [
        // h1: 후계자 트랙 — 18세·2년·거주 면제
        heirAssess({
          heirId: "h1",
          heirIsAdult: false,
          heirTwoYearFarming: false,
          heirResidenceMet: false,
          isDesignatedSuccessor: true,
        }),
        // h2: 일반 미충족
        heirAssess({ heirId: "h2", heirIsAdult: false }),
      ],
    };
    const ids = deriveQualifiedHeirIds(input);
    expect(ids).toEqual(["h1"]);
  });

  it("FH-6: §16⑭ 상속인별 결격소득 분리 — 결격 상속인만 미충족", () => {
    const input: FarmingInheritanceInput = {
      ...personalOk(),
      heirAssessments: [
        heirAssess({ heirId: "h1", hasDisqualifyingIncome: false }),
        heirAssess({ heirId: "h2", hasDisqualifyingIncome: true }), // §16⑭ 결격
      ],
    };
    const ids = deriveQualifiedHeirIds(input);
    expect(ids).toEqual(["h1"]);
  });
});

describe("resolveEffectiveQualifiedHeirIds — 명시 override 우선 (PR5)", () => {
  it("FH-OVR-1: heirAssessments 미입력 + qualifiedHeirIds 미입력 → undefined (legacy)", () => {
    expect(resolveEffectiveQualifiedHeirIds(personalOk())).toBeUndefined();
  });

  it("FH-OVR-2: heirAssessments 미입력 + 명시 qualifiedHeirIds → 명시값 그대로 (legacy 수동)", () => {
    const input: FarmingInheritanceInput = {
      ...personalOk(),
      qualifiedHeirIds: ["h1"],
    };
    expect(resolveEffectiveQualifiedHeirIds(input)).toEqual(["h1"]);
  });

  it("FH-OVR-3 회귀: heirAssessments 입력 + qualifiedHeirIds 미입력 → 자동도출", () => {
    const input: FarmingInheritanceInput = {
      ...personalOk(),
      heirAssessments: [
        heirAssess({ heirId: "h1", hasDisqualifyingIncome: false }),
        heirAssess({ heirId: "h2", hasDisqualifyingIncome: true }), // §16⑭ 결격
      ],
    };
    // 자동도출과 동일 (FH-6과 일치)
    expect(resolveEffectiveQualifiedHeirIds(input)).toEqual(deriveQualifiedHeirIds(input));
    expect(resolveEffectiveQualifiedHeirIds(input)).toEqual(["h1"]);
  });

  it("FH-OVR-4: heirAssessments 입력 + 명시 qualifiedHeirIds → 명시값 우선(override)", () => {
    const input: FarmingInheritanceInput = {
      ...personalOk(),
      heirAssessments: [
        heirAssess({ heirId: "h1", hasDisqualifyingIncome: false }),
        heirAssess({ heirId: "h2", hasDisqualifyingIncome: true }), // 자동도출이면 h1만
      ],
      qualifiedHeirIds: ["h2"], // 사용자가 h2를 명시 지정 (자동도출 h1과 다름)
    };
    // override — 명시값 우선 (자동도출 ["h1"] 무시)
    expect(resolveEffectiveQualifiedHeirIds(input)).toEqual(["h2"]);
  });

  it("FH-OVR-5: 명시 override가 자동도출과 다름 (경고 대상)", () => {
    const input: FarmingInheritanceInput = {
      ...personalOk(),
      heirAssessments: [heirAssess({ heirId: "h1" })],
      qualifiedHeirIds: ["h1", "h2"], // 자동도출(["h1"])보다 넓게 명시
    };
    const effective = resolveEffectiveQualifiedHeirIds(input);
    const auto = deriveQualifiedHeirIds(input);
    expect(effective).toEqual(["h1", "h2"]);
    // override ≠ 자동도출 → UI 경고 대상
    expect([...(effective ?? [])].sort()).not.toEqual([...(auto ?? [])].sort());
  });
});

describe("evaluateFarmingEligibilityForHeir — heir 단위 평가", () => {
  it("폼-수준 충족 + heir 충족 → eligible=true", () => {
    const r = evaluateFarmingEligibilityForHeir(
      personalOk(),
      heirAssess({ heirId: "h1" }),
    );
    expect(r.eligible).toBe(true);
  });

  it("폼-수준 충족 + heir 18세 미충족 → eligible=false + reason 노출", () => {
    const r = evaluateFarmingEligibilityForHeir(
      personalOk(),
      heirAssess({ heirId: "h1", heirIsAdult: false }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons.some((s) => s.includes("18세"))).toBe(true);
  });

  it("heir.hasDisqualifyingIncome=true → input.hasDisqualifyingIncome 무시되고 heir 값 우선", () => {
    const r = evaluateFarmingEligibilityForHeir(
      personalOk({ hasDisqualifyingIncome: false }), // 폼-수준 false
      heirAssess({ heirId: "h1", hasDisqualifyingIncome: true }), // heir 결격
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons.some((s) => s.includes("§16⑭"))).toBe(true);
  });
});

// ============================================================
// v4.1.1 D8 / 디자인 §7-2 — residence echo (anchor E-1·E-2·E-5)
// ============================================================

describe("calcFarmingDeduction — residence echo (옵션 C 산식 근거)", () => {
  it("E-1: type=personal + 농지 same_district → result.detail.residence.decedentMatchKind=same_district", () => {
    const farming = personalOk({
      decedentResidenceLatLng: { lat: 37.5665, lng: 126.978 },
      decedentResidenceSigunguCode: "1168000000",
      heirResidenceLatLng: { lat: 37.5665, lng: 126.978 },
      heirResidenceSigunguCode: "1168000000",
    });
    const estateItems = [
      {
        id: "a",
        category: "real_estate_land" as const,
        name: "강남 농지",
        farmingCategory: "farmland" as const,
        estateLatLng: { lat: 37.5665, lng: 126.978 },
        estateSigunguCode: "1168000000",
      },
    ];
    const r = calcFarmingDeduction(2_000_000_000, farming, estateItems);
    expect(r.detail.residence).toBeDefined();
    expect(r.detail.residence!.decedentMatchKind).toBe("same_district");
    expect(r.detail.residence!.heirMatchKind).toBe("same_district");
    expect(r.detail.residence!.decedentAutoMet).toBe(true);
    expect(r.deduction).toBe(2_000_000_000);
  });

  it("E-2: 옵션 A 책임 분배 — 자동 fail + 사용자 met=true → eligible=true (matchKind=fail echo)", () => {
    const farming = personalOk({
      decedentResidenceMet: true, // 사용자 명시 true
      heirResidenceMet: true,
      decedentResidenceLatLng: { lat: 35.1796, lng: 129.0756 },
      decedentResidenceSigunguCode: "2611000000",
      heirResidenceLatLng: { lat: 35.1796, lng: 129.0756 },
      heirResidenceSigunguCode: "2611000000",
    });
    const estateItems = [
      {
        id: "a",
        category: "real_estate_land" as const,
        name: "서울 농지",
        farmingCategory: "farmland" as const,
        estateLatLng: { lat: 37.5665, lng: 126.978 },
        estateSigunguCode: "1168000000",
      },
    ];
    const r = calcFarmingDeduction(1_000_000_000, farming, estateItems);
    expect(r.detail.eligible).toBe(true); // 사용자 명시가 우선 — 공제 적용
    expect(r.detail.residence!.decedentMatchKind).toBe("fail"); // 자동은 fail로 echo
    expect(r.deduction).toBe(1_000_000_000);
  });

  it("E-5: corporate 트랙 — residence echo 미생성 (§16②2호 거주지 요건 없음)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      corporateOk(),
      [
        {
          id: "a",
          category: "listed_stock",
          name: "영농 법인 주식",
          farmingCategory: "corporate_stock",
        },
      ],
    );
    expect(r.detail.residence).toBeUndefined();
    expect(r.deduction).toBe(1_000_000_000);
  });

  it("E-5b: estateItems 미제공 (legacy) → residence echo 미생성", () => {
    const r = calcFarmingDeduction(1_000_000_000, personalOk());
    expect(r.detail.residence).toBeUndefined();
  });

  // ============================================================
  // v4.1.1 PR-3 — adjacency resolver 자동 주입 (Phase 1-C 빈 매트릭스 골격)
  // ============================================================

  it("E-7-skeleton: adjacency resolver 주입 — 빈 매트릭스에서 same_district·within_30km 정상 동작", () => {
    // calcFarmingDeduction이 내부에서 getAdjacentSigunguCodes를 자동 주입.
    // Phase 1-C 빈 매트릭스 상태에서도 same_district·within_30km 분기 정상.
    const farming = personalOk({
      decedentResidenceLatLng: { lat: 37.5665, lng: 126.978 },
      decedentResidenceSigunguCode: "1168000000",
      heirResidenceLatLng: { lat: 37.5665, lng: 126.978 },
      heirResidenceSigunguCode: "1168000000",
    });
    const estateItems = [
      {
        id: "a",
        category: "real_estate_land" as const,
        name: "강남 농지",
        farmingCategory: "farmland" as const,
        estateLatLng: { lat: 37.5665, lng: 126.978 },
        estateSigunguCode: "1168000000",
      },
    ];
    const r = calcFarmingDeduction(1_000_000_000, farming, estateItems);
    // adjacency 매트릭스 비어있어도 same_district 분기는 우선 매칭 → 정상
    expect(r.detail.residence!.decedentMatchKind).toBe("same_district");
    // adjacency 활성 (Phase 1-C) 후 anchor E-7 본격 추가:
    // decedent 1165(서초) ↔ asset 1168(강남) → adjacent_district 매칭 예상
  });
});

// ============================================================
// FG-2 ~ FG-heir: §16⑭2호 hasDisqualifyingGrossReceipt (D-3, 2026-06-04)
// KoreanLaw 검증: 상증령 §16⑭2호 (mst 283637, 시행 2026.2.27) —
//   사업소득 총수입금액 소령§208⑤2호 기준 이상 과세기간 → 영농 미종사
// ============================================================

describe("§16⑭2호 hasDisqualifyingGrossReceipt — D-3 2호 결격 분리", () => {
  it("FG-2: hasDisqualifyingGrossReceipt=true (1호 false) → 공제 0 + §16⑭2호 reason", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        hasDisqualifyingIncome: false,
        hasDisqualifyingGrossReceipt: true,
      }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.eligible).toBe(false);
    // reason에 §16⑭2호 포함, §16⑭1호 미포함
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭2호"))).toBe(true);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭1호"))).toBe(false);
  });

  it("FG-3: 1호·2호 둘 다 false → 정상 공제 (결격 없음)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        hasDisqualifyingIncome: false,
        hasDisqualifyingGrossReceipt: false,
      }),
    );
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.eligible).toBe(true);
    expect(r.detail.ineligibleReasons.length).toBe(0);
  });

  it("FG-4: 1호·2호 둘 다 true → reason 2건 push (각각)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        hasDisqualifyingIncome: true,
        hasDisqualifyingGrossReceipt: true,
      }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭1호"))).toBe(true);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭2호"))).toBe(true);
    // 1호·2호 이유가 별도 push되어 2건 이상
    const disqReasons = r.detail.ineligibleReasons.filter((s) => s.includes("§16⑭"));
    expect(disqReasons.length).toBeGreaterThanOrEqual(2);
  });

  it("FG-heir: heirAssessment.hasDisqualifyingGrossReceipt=true → 해당 heir 결격 (2호 단독)", () => {
    // 폼-수준 1호·2호 모두 false, heir h1만 2호 결격
    const farming = personalOk({
      hasDisqualifyingIncome: false,
      hasDisqualifyingGrossReceipt: false,
      heirAssessments: [
        {
          heirId: "h1",
          heirIsAdult: true,
          heirTwoYearFarming: true,
          heirResidenceMet: true,
          hasDisqualifyingIncome: false,
          hasDisqualifyingGrossReceipt: true,  // §16⑭2호 결격
        },
      ],
    });
    // deriveQualifiedHeirIds: h1 §16⑭2호 결격 → qualified 0명
    const ids = deriveQualifiedHeirIds(farming);
    expect(ids).toEqual([]);
  });
});

// ============================================================
// P-2 — §16⑭ 결격소득은 소득세법 영농(personal)에만 적용 (corporate 제외)
// 법령: 상증령 §16④/⑭은 §16②1호가목·§16③1호가목(소득세법 영농)에만 걸린다.
//   법인세법 영농(§16②2호·§16③2호)은 "경영/기업 종사" 요건 — 결격소득 대상 아님.
// ============================================================

describe("P-2: §16⑭ 결격소득 corporate 트랙 미적용", () => {
  it("P2-1: corporate + hasDisqualifyingIncome=true → 여전히 적격 (§16⑭ 미적용)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      corporateOk({ hasDisqualifyingIncome: true }),
    );
    expect(r.detail.eligible).toBe(true);
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭"))).toBe(false);
  });

  it("P2-2: corporate + hasDisqualifyingGrossReceipt=true (2026 이후) → 여전히 적격", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      corporateOk({ hasDisqualifyingGrossReceipt: true }),
      undefined,
      "2026-03-01",
    );
    expect(r.detail.eligible).toBe(true);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭"))).toBe(false);
  });

  it("P2-3 (회귀): personal + hasDisqualifyingIncome=true → 여전히 결격", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ hasDisqualifyingIncome: true }),
    );
    expect(r.detail.eligible).toBe(false);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭1호"))).toBe(true);
  });
});

// ============================================================
// P-4 — §16⑭2호(2026.2.27 신설)는 시행일 이후 상속개시분부터 적용 (부칙 경과규정)
// 부칙: "영 시행일 이후 상속이 개시되는 분부터 적용" (KACTA 세무사신문·법령 부칙 확인).
//   구(舊) 상속에 소급 결격 금지. undefined=적용(legacy·엔진은 항상 deathDate 보유, G3 컨벤션).
// ============================================================

describe("P-4: §16⑭2호 2026.2.27 시행일 게이팅", () => {
  it("P4-1: 2호=true + 상속 2025-06-01(시행 전) → 적격 (2호 미적용)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        hasDisqualifyingIncome: false,
        hasDisqualifyingGrossReceipt: true,
      }),
      undefined,
      "2025-06-01",
    );
    expect(r.detail.eligible).toBe(true);
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭2호"))).toBe(false);
  });

  it("P4-2: 2호=true + 상속 2026-02-27(시행일) → 결격", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        hasDisqualifyingIncome: false,
        hasDisqualifyingGrossReceipt: true,
      }),
      undefined,
      "2026-02-27",
    );
    expect(r.detail.eligible).toBe(false);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭2호"))).toBe(true);
  });

  it("P4-3 (회귀): 1호=true + 상속 2025-06-01(시행 전) → 결격 (1호는 게이팅 없음)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        hasDisqualifyingIncome: true,
        hasDisqualifyingGrossReceipt: false,
      }),
      undefined,
      "2025-06-01",
    );
    expect(r.detail.eligible).toBe(false);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭1호"))).toBe(true);
  });

  it("P4-4: 자동도출 — 시행 전 상속은 2호 결격 heir도 자격자 포함", () => {
    const farming = personalOk({
      hasDisqualifyingIncome: false,
      hasDisqualifyingGrossReceipt: false,
      heirAssessments: [
        {
          heirId: "h1",
          heirIsAdult: true,
          heirTwoYearFarming: true,
          heirResidenceMet: true,
          hasDisqualifyingIncome: false,
          hasDisqualifyingGrossReceipt: true, // 2호 결격이나 시행 전이면 무효
        },
      ],
    });
    // 시행 전(2025-06-01): 2호 게이팅 → h1 적격
    expect(deriveQualifiedHeirIds(farming, "2025-06-01")).toEqual(["h1"]);
    // 시행 후(2026-03-01): 2호 적용 → h1 결격
    expect(deriveQualifiedHeirIds(farming, "2026-03-01")).toEqual([]);
    // resolveEffectiveQualifiedHeirIds도 동일 게이팅 전파
    expect(resolveEffectiveQualifiedHeirIds(farming, "2025-06-01")).toEqual(["h1"]);
  });
});
