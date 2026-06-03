/**
 * H-3 anchor — 가업상속인 1명 자동선택 store 미반영 → §15③2호가 18세 판정 침묵 실패 수정 검증
 *
 * 버그: 단독 자연인 상속인(birthDate 보유, age<18) + familyBusiness.heirId=undefined
 *       → heirs.find(h=>h.id===undefined) 항상 undefined → heirBirthDate=undefined
 *       → resolveFamilyBusinessRequirements가 legacy boolean heirIsAdult=false 사용
 *       → §15③2호가 18세 판정 침묵 미충족
 *
 * 수정: resolveFamilyBusinessHeirId(heirs, explicitHeirId) 헬퍼가
 *       자연인 1명일 때 heirId=undefined → 자동선택 fallback 적용.
 *       UI display fallback(FamilyBusinessHeirSelector.effectiveHeirId)·
 *       API 변환(buildInput)·엔진 조립(inheritance-deductions.ts) 3중 동일 규칙.
 *
 * 법령: 상증령 §15③2호가 — 상속개시일 현재 만 18세 이상.
 */
import { describe, it, expect } from "vitest";
import {
  resolveFamilyBusinessRequirements,
  resolveFamilyBusinessHeirId,
} from "@/lib/tax-engine/deductions/family-business-autoderive";
import type {
  FamilyBusinessInheritanceInput,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const DEATH_DATE = "2024-05-10"; // 신고기한: 2024-11-30

/** 전 요건 충족 base (heirIsAdult=false: birthDate 자동판정 경로에서 검증) */
function baseFb(over: Partial<FamilyBusinessInheritanceInput> = {}): FamilyBusinessInheritanceInput {
  return {
    businessType: "individual",
    operatingYears: 20,
    enterpriseSize: "sme",
    isEligibleIndustry: true,
    decedentCEORequirementMet: true,
    heirIsAdult: false,           // legacy boolean — 자동판정 경로 테스트
    heirTwoYearEngagement: true,
    heirOfficerByFilingDeadline: true,
    heirCEOWithinTwoYears: true,
    unrelatedAssetsAcknowledged: true,
    postManagementAcknowledged: true,
    ...over,
  };
}

// ── 헬퍼 단위 테스트 ──────────────────────────────────────────────────────────

describe("resolveFamilyBusinessHeirId — 단위 테스트", () => {
  const heirs: Pick<Heir, "id" | "relation">[] = [
    { id: "heir-1", relation: "child" },
  ];

  it("H3-U1: explicitHeirId 있으면 그대로 반환", () => {
    expect(resolveFamilyBusinessHeirId(heirs, "heir-1")).toBe("heir-1");
  });

  it("H3-U2: explicitHeirId=undefined + 자연인 1명 → 자동선택 fallback", () => {
    expect(resolveFamilyBusinessHeirId(heirs, undefined)).toBe("heir-1");
  });

  it("H3-U3: explicitHeirId=undefined + 자연인 2명 → undefined (미선택 유지)", () => {
    const twoHeirs = [
      { id: "heir-1", relation: "child" as const },
      { id: "heir-2", relation: "spouse" as const },
    ];
    expect(resolveFamilyBusinessHeirId(twoHeirs, undefined)).toBeUndefined();
  });

  it("H3-U4: 자연인 0명(모두 corporate) → undefined", () => {
    const corporateOnly = [{ id: "corp-1", relation: "corporate" as const }];
    expect(resolveFamilyBusinessHeirId(corporateOnly, undefined)).toBeUndefined();
  });

  it("H3-U5: corporate + 자연인 1명 → 자연인 자동선택", () => {
    const mixed = [
      { id: "corp-1", relation: "corporate" as const },
      { id: "heir-1", relation: "child" as const },
    ];
    expect(resolveFamilyBusinessHeirId(mixed, undefined)).toBe("heir-1");
  });
});

// ── 버그 재현 (수정 전 동작 확인) ─────────────────────────────────────────────

describe("H-3 버그 재현 — 수정 전 동작 (heirBirthDate=undefined 경로)", () => {
  it("H3-BUG: heirId=undefined → heirs.find 실패 → birthDate=undefined → legacy boolean=false (침묵 실패)", () => {
    const fb = baseFb({ heirId: undefined });
    const heirs = [
      { id: "heir-1", relation: "child" as const, birthDate: "2006-05-10" },
    ];

    // 수정 전 코드 재현: heirs.find(h=>h.id===undefined) → undefined
    const oldHeirBirthDate =
      heirs.find((h) => h.id === fb.heirId)?.birthDate ?? fb.heirBirthDate;
    expect(oldHeirBirthDate).toBeUndefined(); // 버그: birthDate를 찾지 못함

    const resolved = resolveFamilyBusinessRequirements(fb, oldHeirBirthDate, DEATH_DATE);
    expect(resolved.resolvedInput.heirIsAdult).toBe(false); // 18세인데도 false (침묵 실패)
    expect(resolved.source.heirIsAdult).toBe("legacy");     // legacy로 떨어짐
  });
});

// ── 수정 후 동작 검증 ─────────────────────────────────────────────────────────

describe("H-3 수정 후 — resolveFamilyBusinessHeirId fallback 적용", () => {
  it("H3-FIX-1: heirId=undefined + 자연인 1명(만18세) → 헬퍼 자동선택 → birthDate 도출 → heirIsAdult=true", () => {
    const fb = baseFb({ heirId: undefined });
    const heirs: Heir[] = [
      { id: "heir-1", relation: "child", birthDate: "2006-05-10" }, // 상속개시일 기준 만18세 정확히
    ];

    // 수정 후 코드: resolveFamilyBusinessHeirId로 fallback
    const resolvedHeirId = resolveFamilyBusinessHeirId(heirs, fb.heirId);
    expect(resolvedHeirId).toBe("heir-1"); // 자동선택됨

    const heirBirthDate =
      heirs.find((h) => h.id === resolvedHeirId)?.birthDate ?? fb.heirBirthDate;
    expect(heirBirthDate).toBe("2006-05-10"); // birthDate 정상 도출

    const resolved = resolveFamilyBusinessRequirements(fb, heirBirthDate, DEATH_DATE);
    expect(resolved.resolvedInput.heirIsAdult).toBe(true); // 18세 자동 판정 성공
    expect(resolved.source.heirIsAdult).toBe("auto");      // 자동판정 경로
  });

  it("H3-FIX-2: 만17세(생일 다음날 상속개시) → 자동선택 됐지만 18세 미만 → heirIsAdult=false (정상 미충족)", () => {
    const fb = baseFb({ heirId: undefined });
    const heirs: Heir[] = [
      { id: "heir-1", relation: "child", birthDate: "2006-05-11" }, // 만17세 (생일 +1일 → 미충족)
    ];

    const resolvedHeirId = resolveFamilyBusinessHeirId(heirs, fb.heirId);
    expect(resolvedHeirId).toBe("heir-1");

    const heirBirthDate =
      heirs.find((h) => h.id === resolvedHeirId)?.birthDate ?? fb.heirBirthDate;
    const resolved = resolveFamilyBusinessRequirements(fb, heirBirthDate, DEATH_DATE);
    expect(resolved.resolvedInput.heirIsAdult).toBe(false); // 17세 → 정상 미충족
    expect(resolved.source.heirIsAdult).toBe("auto");       // 자동판정 경로 (정상 false)
  });

  it("H3-FIX-3: heirId=undefined + 자연인 2명 → 자동선택 불가(undefined) → legacy boolean fallback", () => {
    const fb = baseFb({ heirId: undefined, heirIsAdult: true }); // legacy boolean=true
    const heirs: Heir[] = [
      { id: "heir-1", relation: "child", birthDate: "2006-05-10" },
      { id: "heir-2", relation: "spouse", birthDate: "1980-01-01" },
    ];

    const resolvedHeirId = resolveFamilyBusinessHeirId(heirs, fb.heirId);
    expect(resolvedHeirId).toBeUndefined(); // 2명 → 자동선택 불가

    const heirBirthDate =
      heirs.find((h) => h.id === resolvedHeirId)?.birthDate ?? fb.heirBirthDate;
    const resolved = resolveFamilyBusinessRequirements(fb, heirBirthDate, DEATH_DATE);
    expect(resolved.resolvedInput.heirIsAdult).toBe(true); // legacy boolean=true 사용
    expect(resolved.source.heirIsAdult).toBe("legacy");    // 레거시 경로 (2명 → 선택 필요)
  });

  it("H3-FIX-4: explicitHeirId 명시 + corporate 포함 → 명시값 우선", () => {
    const fb = baseFb({ heirId: "heir-1" });
    const heirs: Heir[] = [
      { id: "corp-1", relation: "corporate" },
      { id: "heir-1", relation: "child", birthDate: "2006-05-10" },
    ];

    const resolvedHeirId = resolveFamilyBusinessHeirId(heirs, fb.heirId);
    expect(resolvedHeirId).toBe("heir-1"); // 명시값 그대로

    const heirBirthDate =
      heirs.find((h) => h.id === resolvedHeirId)?.birthDate ?? fb.heirBirthDate;
    const resolved = resolveFamilyBusinessRequirements(fb, heirBirthDate, DEATH_DATE);
    expect(resolved.resolvedInput.heirIsAdult).toBe(true);
    expect(resolved.source.heirIsAdult).toBe("auto");
  });

  it("H3-FIX-5: heirId=undefined + corporate 1명만 → undefined → legacy boolean", () => {
    const fb = baseFb({ heirId: undefined, heirIsAdult: false });
    const heirs: Heir[] = [
      { id: "corp-1", relation: "corporate" },
    ];

    const resolvedHeirId = resolveFamilyBusinessHeirId(heirs, fb.heirId);
    expect(resolvedHeirId).toBeUndefined(); // corporate만 있어서 자연인 없음

    const heirBirthDate =
      heirs.find((h) => h.id === resolvedHeirId)?.birthDate ?? fb.heirBirthDate;
    const resolved = resolveFamilyBusinessRequirements(fb, heirBirthDate, DEATH_DATE);
    expect(resolved.resolvedInput.heirIsAdult).toBe(false);
    expect(resolved.source.heirIsAdult).toBe("legacy");
  });
});
