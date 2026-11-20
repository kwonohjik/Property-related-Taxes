/**
 * 2026-11 리뷰 I-14 · 결정 Q-12 — 「원본 판정 열기」: 출처 판정 record를 이력 재개 진입점으로 연다 · 다건 편집 화면에서는 숨긴다 · 기록이 없으면 알린다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const nav = { pathname: "/calc/transfer-tax" };
const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push }) }));
const store = new Map<string, unknown>();
vi.mock("@/lib/storage/calculation-repository", () => ({ calculationRepository: { get: async (id: string) => store.get(id) ?? null } }));
const resume = vi.fn(async (..._a: unknown[]) => null);
vi.mock("@/lib/calc/history-resume-entry", () => ({ resumeCalculationRecord: (...a: unknown[]) => resume(...a) }));

import { OpenSourceJudgmentLink } from "@/components/calc/transfer/OpenSourceJudgmentLink";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";

const setSource = (id: string | undefined) =>
  useCalcWizardStore.setState({ formData: { ...useCalcWizardStore.getState().formData, sourceJudgmentId: id } });

beforeEach(() => {
  nav.pathname = "/calc/transfer-tax";
  store.clear();
  resume.mockClear();
});
afterEach(cleanup);

describe("I-14 원본 판정 열기", () => {
  it("출처 판정이 있으면 링크 · 누르면 그 record로 이력 재개", async () => {
    const rec = { id: "j1", taxType: "one_house_exemption", inputData: {} };
    store.set("j1", rec);
    setSource("j1");
    render(<OpenSourceJudgmentLink />);
    fireEvent.click(screen.getByTestId("open-source-judgment"));
    await waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
    expect(resume.mock.calls[0][0]).toBe(rec);
  });
  it("기록이 없으면 재개하지 않고 알린다", async () => {
    setSource("gone");
    render(<OpenSourceJudgmentLink />);
    fireEvent.click(screen.getByTestId("open-source-judgment"));
    await waitFor(() => expect(screen.getByTestId("open-source-judgment-missing")).toBeTruthy());
    expect(resume).not.toHaveBeenCalled();
  });
  it("Q-12 — 다건 편집 화면에서는 숨긴다 · 출처가 없어도 숨긴다", () => {
    setSource("j1");
    nav.pathname = "/calc/transfer-tax/multi";
    const a = render(<OpenSourceJudgmentLink />);
    expect(a.container.querySelector('[data-testid="open-source-judgment"]')).toBeNull();
    cleanup();
    nav.pathname = "/calc/transfer-tax";
    setSource(undefined);
    const b = render(<OpenSourceJudgmentLink />);
    expect(b.container.querySelector('[data-testid="open-source-judgment"]')).toBeNull();
  });
});
