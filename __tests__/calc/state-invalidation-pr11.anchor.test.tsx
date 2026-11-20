/**
 * PR-11 anchor (2026-11 리뷰 D-15 · D-16 · D-27) — store 밖 경로(이력 재개 · 판정→계산기 넘기기 · 결과 단계 AI 답)가 「입력이 바뀌면 결과를 비운다」 규약을 지킨다.
 * D-74(백업 merge 출처 판정 id 재매핑)는 `__tests__/lib/storage/backup.test.ts`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { resumeCalculationRecord } from "@/lib/calc/history-resume-entry";
import { useOneHouseJudgmentStore } from "@/lib/stores/one-house-judgment-store";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import { applyOneHouseFactsToTransferForm } from "@/lib/calc/one-house-judgment-handoff";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { OneHouseAiReviewCard } from "@/components/calc/one-house/OneHouseAiReviewCard";
import type { CalculationRecord } from "@/lib/storage";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";

afterEach(cleanup);

describe("D-15 이력 재개가 다주택 중과 슬롯도 비운다", () => {
  it("중과 결과가 남은 채 1주택 판정 record를 재개하면 중과 결과가 비워진다", async () => {
    useOneHouseJudgmentStore.setState({
      surcharge: { ...useOneHouseJudgmentStore.getState().surcharge, result: { headline: "stale" } as never },
    });
    const router = { push: vi.fn() } as never;
    await resumeCalculationRecord(
      { taxType: "one_house_exemption", inputData: createInitialOneHouseJudgmentForm() } as unknown as CalculationRecord,
      router,
    );
    expect(useOneHouseJudgmentStore.getState().surcharge.result).toBeNull();
  });
});

describe("D-16 판정 → 계산기 넘기기가 계산기의 이전 결과를 비운다", () => {
  it("이전 물건의 결과가 있으면 넘긴 뒤 null", async () => {
    useCalcWizardStore.setState({ result: { totalTax: 123 } as never });
    await applyOneHouseFactsToTransferForm(createInitialOneHouseJudgmentForm());
    expect(useCalcWizardStore.getState().result).toBeNull();
  });
});

describe("D-27 결과 단계 AI 검토 카드 — 바로 답하는 칸 대신 단계 이동", () => {
  const review = {
    facts: [],
    issues: [],
    notes: [],
    sourceCitations: [],
    lawLookups: [],
    questions: [{ path: "transferDate", field: ONE_HOUSE_FIELD_CATALOG.find((f) => f.path === "transferDate"), question: "양도 예정일은?", reason: "-" }],
  } as never;
  it("onAnswer가 없으면 답 칸을 그리지 않고 「단계에서 입력」 버튼만", () => {
    render(
      <OneHouseAiReviewCard review={review} form={createInitialOneHouseJudgmentForm()} stepNames={["①", "②", "③", "④"]} onGoToStep={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /단계에서 입력/ })).toBeTruthy();
  });
  it("대조 — onAnswer가 있으면(결과 전 단계) 바로 답 칸을 그린다", () => {
    render(
      <OneHouseAiReviewCard review={review} form={createInitialOneHouseJudgmentForm()} onAnswer={() => {}} stepNames={["①", "②", "③", "④"]} onGoToStep={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: /단계에서 입력/ })).toBeNull();
  });
});
