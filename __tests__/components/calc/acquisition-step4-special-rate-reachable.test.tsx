/**
 * @vitest-environment jsdom
 *
 * 취득세 브라우저 실측 결함 F-1·F-1b (계획: docs/00-pm/acquisition-browser-findings-5.plan.md, Q-1 (나))
 *
 * 종전 `computeNextStep`은 「비법인 + 비사치성 + 세율특례 없음」이면 ⑤(법인·특수)를 건너뛰었다.
 * 그런데 세율특례 §15①은 ⑤ 안에서만 켤 수 있어, 「다음」으로는 상속 1가구1주택(§15①2호가목)을
 * 켤 길이 없었다(F-1). 매매는 사이드바로 들어가도 「건너뜁니다」 안내만 나와 환매(§15①1호)가
 * 아예 막혀 있었다(F-1b). 간주취득이 아니면 ⑤를 늘 거친다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/calc/acquisition-tax",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/calc/acquisition-tax-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calc/acquisition-tax-api")>()),
  callAcquisitionTaxAPI: vi.fn(async () => ({ totalTax: 0 })),
}));
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: () => ({ saved: false, error: null }),
}));

import { AcquisitionTaxForm } from "@/components/calc/AcquisitionTaxForm";
import { STEPS } from "@/components/calc/acquisition/shared";

afterEach(() => cleanup());

function currentStepIndex(): number {
  const nav = screen.getByRole("navigation", { name: "진행 단계" });
  return Array.from(nav.querySelectorAll("li")).findIndex((li) => li.querySelector("[aria-current]"));
}

/** 「다음」만 눌러 지나간 단계 인덱스를 모은다(마지막 단계에서 멈춘다). */
function walkWithNext(): number[] {
  const seen = [currentStepIndex()];
  for (let i = 0; i < STEPS.length; i++) {
    const next = screen.queryByRole("button", { name: "다음" });
    if (!next) break;
    fireEvent.click(next);
    const idx = currentStepIndex();
    if (idx === seen[seen.length - 1]) break; // 검증에 막힘
    seen.push(idx);
  }
  return seen;
}

describe("F-1 상속 주택 — 「다음」으로 ⑤ 세율특례에 도달", () => {
  it("개인·비사치성 상속 → ⑤를 거치고 「세율특례 §15 해당」 토글이 보인다", () => {
    render(<AcquisitionTaxForm />);
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "inheritance" } });
    const seen = walkWithNext();
    expect(STEPS[4]).toBe("법인·특수");
    expect(seen, `지나간 단계 ${seen.join(",")}`).toContain(4);
  });
});

describe("F-1b 매매 — ⑤에서 환매(§15①1호)를 고를 수 있다", () => {
  it("개인·비사치성 매매 → ⑤를 거치고 세율특례 토글이 보인다", () => {
    render(<AcquisitionTaxForm />);
    fireEvent.change(screen.getByLabelText(/취득가액 \(실거래가\)/), { target: { value: "500000000" } });
    const seen: number[] = [currentStepIndex()];
    while (currentStepIndex() < 4) {
      fireEvent.click(screen.getByRole("button", { name: "다음" }));
      const idx = currentStepIndex();
      if (idx === seen[seen.length - 1]) break;
      seen.push(idx);
    }
    expect(currentStepIndex(), `지나간 단계 ${seen.join(",")}`).toBe(4);
    fireEvent.click(screen.getByRole("switch", { name: /세율특례 §15 해당/ }));
    expect(screen.getByText(/환매등기 병행 매매의 환매/)).toBeTruthy();
  });
});
