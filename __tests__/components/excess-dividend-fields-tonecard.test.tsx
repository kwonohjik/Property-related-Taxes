/**
 * anchor: ExcessDividendFields(초과배당 §41의2) — 인라인 섹션카드 3개(①sky ②amber ③violet)
 *   → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 4호. deemed-gift dark:0 → noDark.
 *   §5 정산은 ToggleCard(섹션카드 아님) → 미변경.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ExcessDividendFields } from "@/components/calc/deemed-gift/other-forms";
import { INITIAL_DEEMED } from "@/components/calc/deemed-gift/deemed-form-state";

afterEach(cleanup);

const renderBlock = () =>
  render(<ExcessDividendFields form={{ ...INITIAL_DEEMED }} set={() => {}} />);

describe("ExcessDividendFields — 섹션카드 <ToneCard> 전환 (회귀 0)", () => {
  it("①②③ 섹션 제목이 톤별로 렌더 + 번호배지", () => {
    const { getByText } = renderBlock();
    expect(
      getByText("주주별 배당 내역 — 비례배당·초과배당금액 자동산정 (시행령 §31의2②)").className,
    ).toContain("text-sky-700");
    expect(getByText("소득세 상당액 확정 여부 — 시행규칙 §10의3").className).toContain("text-amber-700");
    expect(
      getByText("증여자와의 관계 (선택 — 입력 시 정산·구법 세액 추가 표시)").className,
    ).toContain("text-violet-700");
    ["1", "2", "3"].forEach((n) => expect(getByText(n)).toBeTruthy());
  });

  it("① 섹션카드 sky light 유지 + dark: 미도입 (noDark 회귀 0)", () => {
    const badge = renderBlock().getByText("1");
    expect(badge.className).not.toContain("dark:");
    const card = badge.parentElement?.parentElement as HTMLElement; // ToneCard 외곽
    expect(card.className).toContain("border-sky-200");
    expect(card.className).toContain("bg-sky-50/40");
    expect(card.className).not.toContain("dark:");
  });
});
