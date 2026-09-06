/**
 * anchor: Step6 「기납부세액」은 **신고 유형과 무관하게** 렌더된다 (UI 리뷰 보통).
 *
 * 종전에는 `filingType !== "correct"` 블록 안에 있었다. 그런데 지연납부가산세
 * (「국세기본법」 §47의4) 섹션은 신고 유형과 무관하게 항상 렌더되고, 미납·미달납부세액의
 * 자동 산식은 `결정세액 − 기납부세액`이다(`TransferTaxCalculator.handlePenaltyCalc` 2단계).
 *
 * ⇒ **정상신고 후 일부만 납부한** 납세자는 기납부세액을 넣을 칸이 없어 `priorPaidTax`가
 *   0으로 남고, 「가산세 계산하기」를 누를 때마다 미납세액이 **결정세액 전액**으로
 *   덮어써졌다(손으로 고쳐도 다음 클릭에 다시 지워진다).
 *
 * 실측 예: 결정세액 100,000,000 · 기납부 60,000,000 · 100일 지연
 *   · 종전: 100,000,000 × 22/100,000 × 100 = 2,200,000
 *   · 정정: 40,000,000 × 22/100,000 × 100 =   880,000  ⇒ **1,320,000 과대**
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step6 } from "@/app/calc/transfer-tax/steps/Step6";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const form = (over: Record<string, unknown> = {}): TransferFormData =>
  ({
    enablePenalty: true,
    amendmentMode: false,
    filingType: "correct",
    priorPaidTax: "",
    unpaidTax: "",
    paymentDeadline: "",
    actualPaymentDate: "",
    ...over,
  }) as unknown as TransferFormData;

const view = (over: Record<string, unknown> = {}) =>
  render(<Step6 form={form(over)} onChange={() => {}} determinedTax={100_000_000} />);

describe("Step6 — 기납부세액 노출", () => {
  it("🔑 S6-1: 정상신고(가산세 없음)에서도 기납부세액 칸이 있다", () => {
    view({ filingType: "correct" });
    expect(screen.getByText("기납부세액")).toBeTruthy();
  });

  it("S6-2: 무신고·과소신고에서도 종전대로 있다", () => {
    view({ filingType: "none" });
    expect(screen.getByText("기납부세액")).toBeTruthy();
    cleanup();
    view({ filingType: "under" });
    expect(screen.getByText("기납부세액")).toBeTruthy();
  });

  it("S6-3: 칸은 하나뿐이다 — 이동이지 복제가 아니다", () => {
    view({ filingType: "none" });
    expect(screen.getAllByText("기납부세액")).toHaveLength(1);
  });

  it("S6-4: 정상신고에서 부정행위 라디오는 종전대로 숨는다 (게이트를 통째로 없앤 게 아니다)", () => {
    view({ filingType: "correct" });
    expect(screen.queryByText("부정행위 여부")).toBeNull();
  });

  it("S6-5: 가산세 토글이 꺼져 있으면 아무것도 렌더하지 않는다", () => {
    view({ enablePenalty: false });
    expect(screen.queryByText("기납부세액")).toBeNull();
  });
});
