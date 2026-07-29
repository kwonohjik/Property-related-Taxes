/**
 * anchor: PriorGiftHistoryModal의 CandidateCard(사전증여 회차 카드) → <ToneCard noDark> 전환(회귀 0).
 *   색상 ToneCard 점진 채택 11호.
 *
 * CandidateCard는 내부(비-export) 서브컴포넌트라 직접 렌더 대신 **class-equivalence**로 검증
 * (P2 ForeignStock/ExitTax SectionBox 전환과 동일 방식 — tone-card.test.tsx 선례).
 * 전환 전 인라인: `rounded-lg border border-violet-200 bg-violet-50/40 p-4 space-y-2`.
 * CandidateCard의 실제 invocation `<ToneCard tone="violet" className="p-4" noDark>`(헤더 없는 순수 박스,
 * bodyClassName 기본 space-y-2)가 그 클래스 집합을 그대로 산출함을 단언(Tailwind class→색 결정적 → 회귀 0).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

describe("PriorGiftHistoryModal CandidateCard <ToneCard> 전환 회귀 0 (11호)", () => {
  it("violet 순수 박스 + p-4 override + noDark = 전환 전 인라인과 1:1", () => {
    const { container, queryByText } = render(
      <ToneCard tone="violet" className="p-4" noDark>
        본문
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    // p-4 override 적용 + 기본 p-3 제거
    expect(box.className).toContain("p-4");
    expect(box.className).not.toContain("p-3");
    // 기본 bodyClassName space-y-2 유지 (원본과 동일)
    expect(box.className).toContain("space-y-2");
    // 톤 외곽 (전환 전 인라인 light 클래스와 동일)
    expect(box.className).toContain("rounded-lg");
    expect(box.className).toContain("border-violet-200");
    expect(box.className).toContain("bg-violet-50/40");
    // noDark → dark 변형 미도입 (원래 light 전용 → 양 모드 회귀 0)
    expect(box.className).not.toContain("dark:");
    // 헤더 없음 (순수 박스 — 번호배지·제목 없음)
    expect(container.querySelector("span.rounded-full")).toBeNull();
    expect(queryByText("본문")).toBeTruthy();
  });
});
