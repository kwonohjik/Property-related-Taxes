/**
 * @vitest-environment jsdom
 *
 * Pre-Do anchor (주식 양도세) — 계획서 `docs/00-pm/validation-warnings-display.plan.md` §5 AW-4.
 *
 * 판정 마법사와 **같은 결함이 여기에도 있다**는 것을 별도로 고정한다. 한쪽만 anchor하면
 * 「고쳤다」가 한 마법사에만 적용됐는지 둘 다인지 구별되지 않는다.
 *
 * 국외전출세 경로를 고른 이유는 경고 **2건이 한 화면에 동시에** 성립하는 유일한 분기라
 * (`stock-transfer-tax-validate-exit.ts:74`·`:94`) 「하나만 새어 나온다」도 잡히기 때문이다.
 *
 * 착수 후 부재 단언은 **존재 단언으로 반전됐다**. 긍정 짝(AW-4b)은 불변이다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import StockTransferTaxCalculator from "@/app/calc/stock-transfer-tax/StockTransferTaxCalculator";
import { useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import { validateStep1 } from "@/lib/calc/stock-transfer-tax-validate";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: () => ({ savedId: null }),
}));
/* jsdom에는 IndexedDB가 없다 — Dexie 접근을 통째로 끊는다(Unhandled Rejection 소음 제거). */
vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: { count: async () => 0 },
}));
vi.mock("@/lib/storage/use-user-profile", () => ({ useUserProfile: () => ({ profile: null }) }));

afterEach(() => {
  cleanup();
  useStockTransferStore.getState().reset();
});

/**
 * 국외전출세 + 거주 3년 + 비대주주 ⇒ `:74`·`:94` 경고 2건이 동시에 성립한다.
 * 필수값(종목명·출국일)은 채워 둔다 — 그래야 관측 대상이 **경고**로 좁혀진다.
 */
function exitTaxForm(): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "가나다전자",
    marketType: "exit_tax",
    etYearsResidentLast10: "3",
    etDepartureDate: "2026-04-01",
    etIsMajorShareholder: false,
  } as unknown as StockTransferFormData;
}

describe("AW-4b (긍정 짝) — validate는 국외전출세 경고 2건을 만든다", () => {
  it("거주 5년 미만 + 비대주주 → warning 2건", () => {
    const warnings = validateStep1(exitTaxForm()).filter((e) => e.severity === "warning");
    expect(warnings.map((w) => w.field).sort()).toEqual([
      "etIsMajorShareholder",
      "etYearsResidentLast10",
    ]);
  });
});

function renderExitTaxAtStep(step: number) {
  useStockTransferStore.setState({
    currentStep: step,
    formData: exitTaxForm(),
    result: null,
    error: null,
  });
  render(<StockTransferTaxCalculator />);
}

describe("AW-4 (반전) — 그 경고가 DOM에 뜬다", () => {
  it("경고 2건이 한 카드 안에 함께 뜬다", () => {
    renderExitTaxAtStep(0);
    /*
      마법사가 실제로 그려졌는지 먼저 못 박는다(빈 렌더를 통과로 읽지 않기 위해).
      ⚠️ 단계 라벨(「자산·시장·대주주」)은 StepIndicator와 사이드바에 **둘 다** 있어
         `getByText`가 strict 위반으로 터진다(실측). h1도 사이드바 h2와 같은 문구라
         **level까지** 좁혀야 유일해진다(실측 — 두 번 걸렸다).
    */
    expect(screen.getByRole("heading", { level: 1, name: "주식 양도소득세" })).toBeTruthy();

    const card = screen.getByTestId("stock-validation-warnings");
    expect(card.textContent).toMatch(/국외전출세 납세의무가 없어 세액은 0으로 산출됩니다/);
    expect(card.textContent).toMatch(/대주주인 경우 체크하세요/);
    expect(card.querySelectorAll("li")).toHaveLength(2);
  });

  /** 음성 짝 — 경고가 없으면 카드 자체가 없다(항상 떠 있는 빈 카드를 배제한다). */
  it("경고 조건이 없으면 카드가 렌더되지 않는다", () => {
    useStockTransferStore.setState({
      currentStep: 0,
      formData: { ...exitTaxForm(), etYearsResidentLast10: "12", etIsMajorShareholder: true },
      result: null,
      error: null,
    });
    render(<StockTransferTaxCalculator />);
    expect(screen.getByRole("heading", { level: 1, name: "주식 양도소득세" })).toBeTruthy();
    expect(screen.queryByTestId("stock-validation-warnings")).toBeNull();
  });

  /**
   * 🔴 **결과 화면에는 띄우지 않는다** — 다종목 모드에서 `formData`는 확정 직후 비워지므로
   *    (`calc-wizard-stock-store.ts:200-207`) 「계산 시 전제」로 띄우면 계산에 들어간 종목이
   *    아니라 **빈 편집기**를 설명하게 된다. 판정 마법사와 갈리는 유일한 지점이라 고정한다.
   */
  it("결과 화면(3)에서는 카드가 뜨지 않는다", () => {
    renderExitTaxAtStep(3);
    expect(screen.queryByTestId("stock-validation-warnings")).toBeNull();
  });
});
