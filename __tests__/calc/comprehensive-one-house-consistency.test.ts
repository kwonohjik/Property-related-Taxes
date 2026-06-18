/**
 * 종부세 1세대1주택자 토글 ↔ 일반주택 수 정합성 검증 (⑧).
 *
 * 버그: 토글 ON + §8④ 의제 미지정 일반주택 2채 → 엔진이 토글값만으로 12억 공제·
 *   세액공제를 적용(comprehensive-tax.ts:373) → 과소세액 침묵 산출. validate로 차단.
 */
import { describe, it, expect } from "vitest";
import { validateOneHouseConsistency } from "@/lib/calc/comprehensive-api";
import type { ComprehensiveFormData } from "@/lib/stores/comprehensive-wizard-store";

function fd(over: Partial<ComprehensiveFormData>): ComprehensiveFormData {
  return {
    taxpayerType: "individual",
    isOneHouseOwner: false,
    isJointOwnershipSpecialCase: false,
    properties: [],
    ...over,
  } as ComprehensiveFormData;
}

function prop(exclusionType = "none", section8para4Type = "none") {
  return { exclusionType, section8para4Type } as ComprehensiveFormData["properties"][number];
}

describe("validateOneHouseConsistency", () => {
  it("토글 OFF면 일반주택 2채여도 통과", () => {
    expect(validateOneHouseConsistency(fd({ properties: [prop(), prop()] }))).toBeNull();
  });

  it("★ 버그 시나리오: 1세대1주택 ON + 일반주택 2채(§8④ 미지정) → 차단", () => {
    const e = validateOneHouseConsistency(
      fd({ isOneHouseOwner: true, properties: [prop(), prop()] }),
    );
    expect(e).not.toBeNull();
    expect(e).toContain("1세대 1주택자");
    expect(e).toContain("2채");
  });

  it("1세대1주택 ON + 일반주택 1채 → 통과", () => {
    expect(
      validateOneHouseConsistency(fd({ isOneHouseOwner: true, properties: [prop()] })),
    ).toBeNull();
  });

  it("1세대1주택 ON + 일반 1채 + §8④ 지방저가주택 1채 → 통과(의제 성립 가능)", () => {
    expect(
      validateOneHouseConsistency(
        fd({
          isOneHouseOwner: true,
          properties: [prop(), prop("none", "regional_low_price")],
        }),
      ),
    ).toBeNull();
  });

  it("1세대1주택 ON + 일반 1채 + 합산배제 임대주택 1채 → 통과", () => {
    expect(
      validateOneHouseConsistency(
        fd({
          isOneHouseOwner: true,
          properties: [prop(), prop("private_construction_rental", "none")],
        }),
      ),
    ).toBeNull();
  });

  it("부부 공동명의 1주택자 특례 ON + 일반 2채 → 차단(특례 라벨)", () => {
    const e = validateOneHouseConsistency(
      fd({ isJointOwnershipSpecialCase: true, properties: [prop(), prop()] }),
    );
    expect(e).not.toBeNull();
    expect(e).toContain("부부 공동명의");
  });

  it("법인이면 토글이 켜져 있어도 통과(엔진 strip)", () => {
    expect(
      validateOneHouseConsistency(
        fd({
          taxpayerType: "corporate",
          isOneHouseOwner: true,
          properties: [prop(), prop()],
        }),
      ),
    ).toBeNull();
  });

  it("일반주택 3채면 채수가 메시지에 반영", () => {
    const e = validateOneHouseConsistency(
      fd({ isOneHouseOwner: true, properties: [prop(), prop(), prop()] }),
    );
    expect(e).toContain("3채");
  });
});
