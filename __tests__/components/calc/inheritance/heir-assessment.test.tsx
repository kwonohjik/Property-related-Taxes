/**
 * HeirAssessmentCard + FarmingEligibilitySection 부록 A UI anchor (2026-05-22)
 *
 * 법령: 시행령 §16③ + §16⑭ (KoreanLaw 검증 `20f75e2`)
 * 엔진: deriveQualifiedHeirIds / evaluateFarmingEligibilityForHeir
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { HeirAssessmentCard } from "@/components/calc/inheritance/HeirAssessmentCard";
import { FarmingEligibilitySection } from "@/components/calc/inheritance/FarmingEligibilitySection";
import type { FarmingInheritanceInput, FarmingHeirAssessment } from "@/lib/tax-engine/types/inheritance-farming.types";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

const farmingOk: FarmingInheritanceInput = {
  type: "personal",
  decedentEightYearFarming: true,
  decedentResidenceMet: true,
  heirIsAdult: true,
  heirTwoYearFarming: true,
  heirResidenceMet: true,
};

function heirAssess(over: Partial<FarmingHeirAssessment> = {}): FarmingHeirAssessment {
  return {
    heirId: "h1",
    heirIsAdult: true,
    heirTwoYearFarming: true,
    heirResidenceMet: true,
    ...over,
  };
}

describe("[FH-UI] HeirAssessmentCard 단위", () => {
  it("FH-UI-1: 자격 충족 → 'self 충족' 배지 + emerald tone", () => {
    const { container } = render(
      <HeirAssessmentCard
        farming={farmingOk}
        heir={{ id: "h1", relation: "child", name: "장남" }}
        assessment={heirAssess()}
        onUpdate={() => {}}
      />,
    );
    expect(screen.queryByText(/자격 충족/)).not.toBeNull();
    expect(container.querySelector(".bg-emerald-50\\/60")).not.toBeNull();
  });

  it("FH-UI-2: 18세 미충족 → 미충족 배지 + amber tone + reasons 노출", () => {
    const { container } = render(
      <HeirAssessmentCard
        farming={farmingOk}
        heir={{ id: "h1", relation: "child", name: "차남" }}
        assessment={heirAssess({ heirIsAdult: false })}
        onUpdate={() => {}}
      />,
    );
    expect(screen.queryAllByText(/미충족/).length).toBeGreaterThan(0);
    expect(container.querySelector(".bg-amber-50\\/60")).not.toBeNull();
    expect(screen.queryAllByText(/18세/).length).toBeGreaterThan(0);
  });

  it("FH-UI-3: 후계자 트랙 ON → 18세·2년·거주 disabled", () => {
    const { container } = render(
      <HeirAssessmentCard
        farming={farmingOk}
        heir={{ id: "h1", relation: "child" }}
        assessment={heirAssess({
          isDesignatedSuccessor: true,
          heirIsAdult: false,
          heirTwoYearFarming: false,
          heirResidenceMet: false,
        })}
        onUpdate={() => {}}
      />,
    );
    // 후계자 트랙 시 18세 등 미충족이어도 자격 충족 (disabled + 면제)
    expect(screen.queryByText(/자격 충족/)).not.toBeNull();
    const switches = container.querySelectorAll('input[type="checkbox"]');
    const disabledSwitches = Array.from(switches).filter(
      (s) => (s as HTMLInputElement).disabled,
    );
    // 18세·2년·거주 3개 disabled
    expect(disabledSwitches.length).toBeGreaterThanOrEqual(3);
  });
});

describe("[FH-INT] FarmingEligibilitySection — 부록 A 통합", () => {
  const heirs: Heir[] = [
    { id: "h1", relation: "child", name: "장남" },
    { id: "h2", relation: "child", name: "차남" },
  ];

  it("FH-INT-1: heirs.length>=2 + farming 활성 → '상속인별 자격 분리 평가' 토글 노출", () => {
    render(
      <FarmingEligibilitySection
        farming={farmingOk}
        estateItems={[]}
        heirs={heirs}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/상속인별 자격 분리 평가/)).not.toBeNull();
  });

  it("FH-INT-2: heirAssessments 미입력 → 자격자 선택 (PR-F) UI 노출", () => {
    render(
      <FarmingEligibilitySection
        farming={farmingOk}
        estateItems={[]}
        heirs={heirs}
        onChange={() => {}}
      />,
    );
    // PR-F 기존 UI 노출 확인
    expect(
      screen.queryByText(/자격 충족 상속인 선택 \(§16⑤ 본문\)/),
    ).not.toBeNull();
  });

  it("FH-INT-3: heirAssessments 입력 + 1명 자격 → '자동 자격자 도출 1명 / 2명'", () => {
    render(
      <FarmingEligibilitySection
        farming={{
          ...farmingOk,
          heirAssessments: [
            heirAssess({ heirId: "h1" }),
            heirAssess({ heirId: "h2", heirIsAdult: false }),
          ],
        }}
        estateItems={[]}
        heirs={heirs}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/자동 자격자 도출 — 1명 \/ 2명/)).not.toBeNull();
    // PR-F qualifiedHeirIds UI는 heirAssessments 활성 시 미렌더
    expect(
      screen.queryByText(/자격 충족 상속인 선택 \(§16⑤ 본문\)/),
    ).toBeNull();
  });

  it("FH-INT-4: heirAssessments 입력 + 모두 미충족 → '자격 충족 상속인 없음'", () => {
    render(
      <FarmingEligibilitySection
        farming={{
          ...farmingOk,
          heirAssessments: [
            heirAssess({ heirId: "h1", heirIsAdult: false }),
            heirAssess({ heirId: "h2", heirIsAdult: false }),
          ],
        }}
        estateItems={[]}
        heirs={heirs}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/자동 자격자 도출 — 0명 \/ 2명/)).not.toBeNull();
    expect(screen.queryByText(/자격 충족 상속인 없음/)).not.toBeNull();
  });
});
