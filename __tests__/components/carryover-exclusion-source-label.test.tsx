/**
 * 이월과세 적용배제 배너 — 사유별 **출처**를 구분해 적는다 (2026-09-05 · 코드리뷰 Q19)
 *
 * ## 종전 결함
 *
 * 배너가 사유와 무관하게 **전부 「사용자 선언」**이라 적었다. 기간 초과·관계 요건은 엔진이
 * 날짜·관계로 **자동 판정**하는데도 사용자가 그렇게 선언한 것처럼 보였다.
 *
 * ## ⚠️ 리뷰의 사실 오류를 코드로 정정했다
 *
 * 리뷰는 `family_business`를 「엔진 자동」이라 했으나 실제로는 **사용자 플래그**다
 * (`transfer-tax-carryover-eligibility.ts:73` — `exclusionDeclared.isFamilyBusinessInheritedAsset`).
 * 표를 코드로 확인하지 않고 고쳤다면 반대로 틀렸을 것이다.
 *
 * 🟠 `one_house_exemption`만 출처를 가릴 수 없다 — 선언(:85)과 엔진 자동
 * (`transfer-tax-carryover.ts:502`) 두 경로가 같은 값 하나를 공유하고 detail에 echo가 없다.
 * 지어내지 않고 둘 다 적는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import type { CarryoverTaxationDetail } from "@/lib/tax-engine/types/transfer-carryover.types";

afterEach(cleanup);

const scenario = {
  acquisitionPrice: 300_000_000,
  transferGain: 200_000_000,
  longTermHoldingDeduction: 0,
  taxBase: 200_000_000,
  determinedTax: 50_000_000,
} as unknown as CarryoverTaxationDetail["scenarioA"];

function detail(
  exclusionReason: CarryoverTaxationDetail["exclusionReason"],
): CarryoverTaxationDetail {
  return {
    isEligible: false,
    applicablePeriodYears: 10,
    exclusionReason,
    scenarioA: scenario,
    scenarioB: scenario as unknown as CarryoverTaxationDetail["scenarioB"],
    adoptedScenario: "B",
    comparisonExclusion: false,
  } as CarryoverTaxationDetail;
}

function bannerText(reason: CarryoverTaxationDetail["exclusionReason"]): string {
  render(<CarryoverComparisonCard detail={detail(reason)} />);
  const el = screen.getByText(/이월과세 적용배제 —/);
  return el.textContent ?? "";
}

describe("적용배제 배너 — 출처 표기", () => {
  it("🔴 기간 초과는 「엔진 자동 판정」 (종전에는 「사용자 선언」이라 적었다)", () => {
    expect(bannerText("period_exceeded")).toContain("엔진 자동 판정");
  });

  it("🔴 관계 요건 미충족도 「엔진 자동 판정」", () => {
    expect(bannerText("relation_invalid")).toContain("엔진 자동 판정");
  });

  it("수용(② 1호)은 「사용자 선언」 — 대조군", () => {
    const t = bannerText("expropriation");
    expect(t).toContain("사용자 선언");
    expect(t).not.toContain("엔진 자동");
  });

  it("🔑 가업상속공제는 **사용자 선언**이다 (리뷰가 「엔진 자동」이라 한 것을 정정)", () => {
    const t = bannerText("family_business");
    expect(t).toContain("사용자 선언");
    expect(t).not.toContain("엔진 자동");
  });

  it("🟠 1세대1주택 비과세는 출처를 가릴 수 없어 둘 다 적는다", () => {
    const t = bannerText("one_house_exemption");
    expect(t).toContain("사용자 선언");
    expect(t).toContain("엔진 자동 판정");
  });
});
