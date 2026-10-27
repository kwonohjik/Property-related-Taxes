/**
 * anchor ⑦ — 이월과세 비교 카드 A 열의 「증여분 · 매입분」 두 블록 (계획서 Q-4 a · UI 설계서 §7.3)
 *
 * 엔진 echo `scenarioA.purchasedPartSplit`이 있으면 A 열이 조각 두 블록 + 한국어 풀어쓰기 산식 + 방법 고지를 그린다.
 * 결정세액은 신고 전체 값(`determinedTaxA/B`)이다 — 증여분 카드의 단독 값(211,020,000)을 보이면 합계와 달라 오해를 부른다(엔진 설계서 §2.6).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { detailWith, SPLIT, GIFT_PIECE, PURCHASED_PIECE } from "./_helpers/carryover-debt-pieces-fixture";

afterEach(cleanup);
const draw = (d: ReturnType<typeof detailWith>) => render(<CarryoverComparisonCard detail={d} />);
const txt = (id: string) => screen.getByTestId(id).textContent ?? "";

describe("⑦ A 열 — 조각 두 블록", () => {
  it("C-1 증여분 · 매입분 블록과 행 값(양도가액·취득가액·취득일·보유기간·양도차익)", () => {
    draw(detailWith(SPLIT));
    const gift = within(screen.getByTestId("carryover-piece-gift"));
    expect(gift.getByTestId("carryover-piece-gift-transfer-price").textContent).toContain("900,000,000");
    expect(gift.getByTestId("carryover-piece-gift-acquisition-price").textContent).toContain("60,000,000");
    expect(gift.getByTestId("carryover-piece-gift-acquisition-date").textContent).toContain("2000-06-01");
    expect(gift.getByTestId("carryover-piece-gift-holding-years").textContent).toContain("25년");
    expect(gift.getByTestId("carryover-piece-gift-transfer-gain").textContent).toContain("840,000,000");
    const buy = within(screen.getByTestId("carryover-piece-purchased"));
    expect(buy.getByTestId("carryover-piece-purchased-transfer-price").textContent).toContain("600,000,000");
    expect(buy.getByTestId("carryover-piece-purchased-acquisition-price").textContent).toContain("400,000,000");
    expect(buy.getByTestId("carryover-piece-purchased-acquisition-date").textContent).toContain("2023-06-01");
    expect(buy.getByTestId("carryover-piece-purchased-holding-years").textContent).toContain("2년");
    expect(buy.getByTestId("carryover-piece-purchased-transfer-gain").textContent).toContain("200,000,000");
  });

  it("C-2 ★ 결정세액은 신고 전체 값 — A 293,970,000 · B 173,060,000 (단독 카드 값 211,020,000·174,060,000을 보이지 않는다)", () => {
    const { container } = draw(detailWith(SPLIT));
    const text = container.textContent ?? "";
    expect(text).toContain("293,970,000");
    expect(text).toContain("173,060,000");
    expect(text).not.toContain("211,020,000");
    expect(text).not.toContain("174,060,000");
  });

  it("C-3 산식은 한국어 풀어쓰기 — 숫자마다 변수명 라벨 · floor·약어 없음", () => {
    draw(detailWith(SPLIT));
    const f = txt("carryover-piece-formula");
    expect(f).toContain("증여분 양도가액");
    expect(f).toContain("양도가액 1,500,000,000");
    expect(f).toContain("증여 당시 평가액 1,000,000,000");
    expect(f).toContain("인수한 채무 400,000,000");
    expect(f).toContain("당초 증여자 취득가액 100,000,000");
    expect(f).toContain("매입분 양도가액");
    expect(f).toContain("증여분 양도가액 900,000,000");
    expect(f).not.toMatch(/floor|Math\./);
  });

  it("C-4 방법 고지 한 줄(법령에 정한 방법이 없다 — 확인 필요)", () => {
    draw(detailWith(SPLIT));
    const n = txt("carryover-piece-method-notice");
    expect(n).toContain("법령에 정해져 있지 않아");
    expect(n).toContain("확인 필요");
  });

  it("C-5 echo 없음 → 조각 블록 없음 · 현행 3줄(취득가액·보유기간·양도차익) 그대로 (회귀 0)", () => {
    const { container } = draw(detailWith(undefined));
    expect(screen.queryByTestId("carryover-piece-gift")).toBeNull();
    expect(screen.queryByTestId("carryover-piece-purchased")).toBeNull();
    expect(container.textContent).toContain("211,020,000");
    expect(container.textContent).toContain("당초 증여자 취득가");
  });

  it("C-6 r = 1 (증여분 없음) → 증여분 블록 대신 한 줄 안내 · 매입분 블록만", () => {
    draw(detailWith({ ...SPLIT, gift: undefined, debtAmount: 1_000_000_000, purchased: { ...PURCHASED_PIECE, propertyId: "primary", transferPrice: 1_500_000_000, acquisitionPrice: 1_000_000_000, transferGain: 500_000_000 } }));
    expect(screen.queryByTestId("carryover-piece-gift")).toBeNull();
    expect(txt("carryover-piece-gift-none")).toContain("증여분 없음");
    expect(txt("carryover-piece-purchased-transfer-price")).toContain("1,500,000,000");
  });

  it("C-7 단기 보유 조각은 세율 구분 행 · 2년 이상은 행 없음", () => {
    draw(detailWith({ ...SPLIT, purchased: { ...PURCHASED_PIECE, holdingPeriodYears: 0, appliedRate: 0.7 } }));
    expect(txt("carryover-piece-purchased-rate")).toContain("70%");
    expect(screen.queryByTestId("carryover-piece-gift-rate")).toBeNull();
  });

  it("C-8 B 채택이어도 A 열은 조각 두 블록을 그린다(채택 배지만 B)", () => {
    draw(detailWith(SPLIT, { adoptedScenario: "B", comparisonExclusion: true }));
    expect(screen.getByTestId("carryover-piece-gift")).toBeTruthy();
    expect(screen.getByTestId("carryover-piece-purchased")).toBeTruthy();
  });

  it("C-9 증여세 상당액·증여자 자본적지출 가산은 증여분 몫으로 표시", () => {
    const d = detailWith(SPLIT);
    d.scenarioA.giftTaxAddedToExpense = 20_000_000;
    d.scenarioA.donorCapexAddedToExpense = 30_000_000;
    const { container } = draw(d);
    expect(container.textContent).toMatch(/증여세 상당액 가산[^+]*\(증여분\)/);
    expect(container.textContent).toMatch(/당초 증여자 자본적지출[^+]*\(증여분\)/);
  });

  it("C-10 신고 전체 판정 근거 문단은 「A·B 금액은 이 자산만 떼어낸 값」이라 말하지 않는다(echo는 이미 신고 전체 값)", () => {
    const { container } = draw(detailWith(SPLIT));
    expect(container.textContent).not.toContain("이 자산만 떼어낸 값");
    expect(container.textContent).toContain("판정 근거");
  });
});

describe("⑦ 보조 — 픽스처 불변식", () => {
  it("조각 양도가액 합 = 조각 전 양도가액 · 매입분 취득가액 = 채무", () => {
    expect(GIFT_PIECE.transferPrice + PURCHASED_PIECE.transferPrice).toBe(SPLIT.transferPrice);
    expect(PURCHASED_PIECE.acquisitionPrice).toBe(SPLIT.debtAmount);
  });
});
