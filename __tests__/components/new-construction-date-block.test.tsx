/**
 * anchor: NewConstructionDateBlock — 인라인 amber 섹션카드 5개 → <ToneCard noDark> 전환(회귀 0).
 *   색상 ToneCard 점진 채택 첫 파일럿(계획 §4.1 P4 점진 이월분).
 *   noDark: 원래 light 전용 → dark 변형 미도입, 양 모드 회귀 0.
 * + computeEarliestDate 순수함수(영 §162①4호, 기존 무테스트).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  NewConstructionDateBlock,
  computeEarliestDate,
} from "@/components/calc/transfer/NewConstructionDateBlock";

afterEach(cleanup);

describe("computeEarliestDate (영 §162①4호 — 가장 이른 날)", () => {
  it("4시점 중 최소 날짜 반환", () => {
    expect(computeEarliestDate("2020-05-10", "2020-03-01", "", "2020-06-15")).toBe("2020-03-01");
  });
  it("빈 값 무시", () => {
    expect(computeEarliestDate("2021-01-01", "", "", "")).toBe("2021-01-01");
  });
  it("모두 빈 값이면 undefined", () => {
    expect(computeEarliestDate("", "", "", "")).toBeUndefined();
  });
  it("길이 10 아닌 값 무시", () => {
    expect(computeEarliestDate("2020", "2019-12-31", "", "")).toBe("2019-12-31");
  });
});

describe("NewConstructionDateBlock — ToneCard 전환 (회귀 0)", () => {
  const noop = () => {};
  const renderBlock = (occ = "") =>
    render(
      <NewConstructionDateBlock
        occupancyApprovalDate={occ}
        onOccupancyApprovalDateChange={noop}
        approvalCertificateDate=""
        onApprovalCertificateDateChange={noop}
        temporaryApprovalDate=""
        onTemporaryApprovalDateChange={noop}
        actualUseDate=""
        onActualUseDateChange={noop}
      />,
    );

  it("§ + ①②③④ 섹션 배지·제목 렌더", () => {
    const { getByText } = renderBlock();
    ["§", "①", "②", "③", "④"].forEach((n) => expect(getByText(n)).toBeTruthy());
    expect(getByText("사용승인일 (필수)").className).toContain("text-amber-700");
  });

  it("섹션카드가 amber light 클래스 유지 + dark: 미도입 (noDark 회귀 0)", () => {
    const badge = renderBlock().getByText("①");
    expect(badge.className).toContain("bg-amber-200");
    expect(badge.className).not.toContain("dark:");
    const card = badge.parentElement?.parentElement as HTMLElement; // ToneCard 외곽
    expect(card.className).toContain("border-amber-200");
    expect(card.className).toContain("bg-amber-50/40");
    expect(card.className).not.toContain("dark:");
  });

  it("입력 없으면 자동판정 안내 문구", () => {
    expect(renderBlock().getByText(/사용승인일을 입력하면/)).toBeTruthy();
  });
  it("입력 있으면 가장 이른 날 표시", () => {
    expect(renderBlock("2020-01-01").getByText("2020-01-01")).toBeTruthy();
  });
});
