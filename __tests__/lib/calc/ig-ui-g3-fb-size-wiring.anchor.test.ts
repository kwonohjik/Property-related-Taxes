/**
 * IG-035 — 기업 규모 요건 차단이 **실제로 배선돼 있다**.
 *
 * ## 왜 별도 파일인가
 *
 * `ig-ui-g3-validate.anchor.test.ts`의 G-1~G-4는 `validateFamilyBusinessEnterpriseSize`를
 * **직접** 부른다. 그래서 규칙 자체는 지키지만 「`validateInheritanceTaxInput`이 그것을
 * 부르는가」는 증명하지 못한다 — 실제로 뮤테이션 프로브에서 호출부를 통째로 지웠을 때
 * **구별력 0**이 나왔다(leaf anchor는 상위 층을 안 태운다).
 *
 * ⇒ 진입점으로 한 번 더 잰다.
 */
import { describe, it, expect } from "vitest";

import { validateInheritanceTaxInput } from "@/lib/calc/inheritance-validate";
import { EXAMPLE_INPUT } from "../../tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture";

const withFb = (fb: Record<string, unknown>) =>
  ({
    ...EXAMPLE_INPUT,
    deductionInput: { ...EXAMPLE_INPUT.deductionInput, familyBusiness: fb },
  }) as unknown as Parameters<typeof validateInheritanceTaxInput>[0];

describe("[G3-W] IG-035 — 진입점이 규모 요건 검증을 태운다", () => {
  it("W-1: 🔴 중소기업 + 자산총액 미입력 → 진입점에서 차단된다", () => {
    const msg = validateInheritanceTaxInput(withFb({ enterpriseSize: "sme" }));
    expect(msg).toContain("자산총액을 입력하세요");
  });

  it("W-2: 🔴 중견기업 + 평균매출 미입력 → 진입점에서 차단된다", () => {
    const msg = validateInheritanceTaxInput(withFb({ enterpriseSize: "medium" }));
    expect(msg).toContain("평균 매출액을 입력하세요");
  });

  it("W-3: 양성 쌍둥이 — 값을 넣으면 이 축으로는 막지 않는다", () => {
    const msg = validateInheritanceTaxInput(
      withFb({ enterpriseSize: "sme", totalAssets: 100_000_000_000 }),
    );
    expect(msg ?? "").not.toContain("자산총액을 입력하세요");
  });

  it("W-4: 양성 대조군 — 가업상속공제 입력이 없으면 이 축이 발동하지 않는다 (회귀 0)", () => {
    const msg = validateInheritanceTaxInput(EXAMPLE_INPUT);
    expect(msg ?? "").not.toContain("자산총액을 입력하세요");
  });
});
