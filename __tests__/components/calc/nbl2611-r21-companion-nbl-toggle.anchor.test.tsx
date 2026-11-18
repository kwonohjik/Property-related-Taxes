/**
 * NBL2611-R21 (Q-9 가) — 함께 양도 토지 카드(자산 2 이후)에 주 자산과 같은 「비사업용 토지 여부 검토」 토글이 있다.
 *
 * 종전: 컴패니언 카드에 토글이 없어 공익수용 프리필이 켠 표지를 끌 수 없었다. 정밀판정을 «접으면» ④가 raw를 안 보내고 서버는 표지만 보고
 * 카드 전량에 +10%p를 붙였다(신규 발견 #16, +11,421,520). 이제 토글 해제가 표지와 정밀판정을 함께 끈다(주 자산과 같은 규칙 · 같은 컴포넌트).
 *
 * 렌더 게이트(⑤) ↔ ④ ↔ ⑧은 같은 두 필드(`isNonBusinessLand` · `nblUseDetailedJudgment`)를 읽는다 — 새 필드 없음(14지점 점검은 PR 본문).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AssetSectionExtras } from "@/components/calc/transfer/asset-sections/AssetSectionExtras";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const land = (over: Partial<AssetForm> = {}): AssetForm =>
  ({ ...makeDefaultAsset(2), assetKind: "land", isNonBusinessLand: false, nblUseDetailedJudgment: false, ...over }) as AssetForm;
const renderExtras = (a: AssetForm, assetIndex: number, onChange = vi.fn()) => {
  render(<AssetSectionExtras asset={a} assetIndex={assetIndex} onChange={onChange} transferDate="2024-06-03" />);
  return onChange;
};
const toggle = () => screen.queryByRole("switch", { name: /비사업용 토지 여부 검토/ }) ?? screen.queryByLabelText(/비사업용 토지 여부 검토/);
const hasContainer = () => screen.queryByText("토지 지목") !== null;
const plusStart = () => screen.queryByText("+ 상세 판정 시작");

describe("NBL2611-R21 · 컴패니언 토지 카드 비사업용 토글", () => {
  it("R1 컴패니언(자산 2) 토지 — 표지가 꺼져 있어도 토글이 보인다 (종전: 없음)", () => {
    renderExtras(land(), 1);
    expect(screen.getByText("비사업용 토지 여부 검토")).toBeTruthy();
    expect(toggle()).not.toBeNull();
  });

  it("R2 토글 켜기 → 표지 true · 정밀판정은 현재 상태 유지(false)", () => {
    const onChange = renderExtras(land(), 1);
    fireEvent.click(toggle()!);
    expect(onChange).toHaveBeenLastCalledWith({ isNonBusinessLand: true, nblUseDetailedJudgment: false });
  });

  it("R3 토글 끄기 → 표지와 정밀판정을 함께 끈다 (정밀판정만 켜진 채 표지가 꺼진 상태를 만들지 않는다)", () => {
    const onChange = renderExtras(land({ isNonBusinessLand: true, nblUseDetailedJudgment: true }), 1);
    fireEvent.click(toggle()!);
    expect(onChange).toHaveBeenLastCalledWith({ isNonBusinessLand: false, nblUseDetailedJudgment: false });
  });

  it("R4 「이미 판정 완료」 — 정밀판정 입력(지목)과 중복 복귀 버튼이 없다 · 라디오로 「판정 도움」을 고르면 켠다", () => {
    const onChange = renderExtras(land({ isNonBusinessLand: true, nblUseDetailedJudgment: false }), 1);
    expect(hasContainer()).toBe(false);
    expect(plusStart()).toBeNull();
    const radio = screen.getAllByRole("radio").find((el) => (el.closest("label")?.textContent ?? "").includes("판정 도움 필요"))!;
    fireEvent.click(radio);
    expect(onChange).toHaveBeenLastCalledWith({ nblUseDetailedJudgment: true });
  });

  it("R5 「판정 도움 필요」 — 정밀판정 입력이 그려진다", () => {
    renderExtras(land({ isNonBusinessLand: true, nblUseDetailedJudgment: true }), 1);
    expect(hasContainer()).toBe(true);
  });

  it("R6 자산 1(주 자산)은 여기서 토글을 그리지 않는다 — Step4 SpecialSituationSection이 같은 컴포넌트를 쓴다", () => {
    renderExtras(land(), 0);
    expect(screen.queryByText("비사업용 토지 여부 검토")).toBeNull();
  });

  it("R7 토지가 아니면 토글이 없다", () => {
    renderExtras(land({ assetKind: "housing" }), 1);
    expect(screen.queryByText("비사업용 토지 여부 검토")).toBeNull();
  });

  it("R8 주택 부수토지 카드는 토글을 새로 켜게 하지 않는다(한도 초과분은 엔진이 자동 분리) — 이미 켜져 있으면 끌 수 있다", () => {
    const { unmount } = render(<AssetSectionExtras asset={land({ landNature: "appurtenant" })} assetIndex={1} onChange={vi.fn()} transferDate="2024-06-03" />);
    expect(screen.queryByText("비사업용 토지 여부 검토")).toBeNull();
    unmount();
    renderExtras(land({ landNature: "appurtenant", isNonBusinessLand: true }), 1);
    expect(screen.getByText("비사업용 토지 여부 검토")).toBeTruthy();
  });
});
