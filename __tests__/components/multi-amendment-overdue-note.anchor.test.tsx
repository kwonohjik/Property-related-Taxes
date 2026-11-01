/**
 * 다건 신고서 단위 수정신고·경정청구 — 자산 화면의 가산세 안내·입력을 실제 계산에 맞춘다.
 *
 * 종전 결함: 자산 화면이 「가산세 자동 적용」을 표시하고 Step6 입력을 받았지만 요청에서 빠져 세액에 들어가지 않았다
 * (시료 225,423,000 vs 249,973,614). 다건 수정신고·경정청구 진입은 저장 폼 마이그레이션도 건너뛰었다.
 *
 * 계획서: docs/02-design/features/multi-amendment-overdue-note.plan.md
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { Step6 } from "@/app/calc/transfer-tax/steps/Step6";
import { AggregateSettingsPanel } from "@/components/calc/transfer/AggregateSettingsPanel";
import {
  aggregatePenaltyNotice,
  collectWizardStepIssues,
  filingUnitCorrectionOf,
} from "@/lib/calc/filing-unit-correction";
import { enterMultiAmendment, enterRefundClaim } from "@/lib/calc/transfer-amendment-entry";
import { useCalcWizardStore, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { useMultiTransferStore, type MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { CalculationRecord } from "@/lib/storage/types";

afterEach(() => cleanup());

const AMEND_STEP = "신고서 단위 수정신고 중입니다. 가산세는 공통 설정의 수정신고 항목에서 입력합니다.";
const REFUND_STEP = "신고서 단위 경정청구 중입니다. 이 화면의 가산세 입력은 경정청구 계산에 쓰이지 않습니다.";

const defaultFormData = useCalcWizardStore.getState().formData;

const form = (over: Partial<TransferFormData> = {}): TransferFormData => ({
  ...defaultFormData,
  assets: [makeDefaultAsset(1)],
  enablePenalty: true,
  filingType: "none",
  ...over,
});

describe("신고서 단위 상태 판정", () => {
  const amend = { amendmentMode: true, correctionKind: "amend" } as const;
  it("임베드 + 수정신고·경정청구", () => {
    expect(filingUnitCorrectionOf(true, amend)).toBe("amend");
    expect(filingUnitCorrectionOf(true, { amendmentMode: true, correctionKind: "refund_claim" })).toBe("refund_claim");
  });
  it("일반 다건은 없음", () => {
    expect(filingUnitCorrectionOf(true, { amendmentMode: false, correctionKind: "amend" })).toBeNull();
  });
  it("단건 화면은 지난 다건 세션을 읽지 않는다", () => {
    expect(filingUnitCorrectionOf(false, amend)).toBeNull();
  });
});

describe("Step6", () => {
  const show = (f: TransferFormData, c?: "amend" | "refund_claim" | null) =>
    render(<Step6 form={f} onChange={() => {}} determinedTax={null} filingUnitCorrection={c} />);

  it("수정신고: 입력칸 대신 안내", () => {
    show(form(), "amend");
    expect(screen.getByText(AMEND_STEP)).toBeInTheDocument();
    expect(screen.queryByText("가산세 계산하기")).toBeNull();
    expect(screen.queryByText("신고불성실가산세")).toBeNull();
  });
  it("경정청구: 입력칸 대신 안내", () => {
    show(form(), "refund_claim");
    expect(screen.getByText(REFUND_STEP)).toBeInTheDocument();
    expect(screen.queryByText("가산세 계산하기")).toBeNull();
  });
  it("일반: 입력칸 그대로", () => {
    show(form(), null);
    expect(screen.getByText("가산세 계산하기")).toBeInTheDocument();
    expect(screen.queryByText(AMEND_STEP)).toBeNull();
  });
  it("자산 폼 자체가 수정신고면 AmendmentBlock이 먼저다", () => {
    show(form({ amendmentMode: true }), "amend");
    expect(screen.queryByText(AMEND_STEP)).toBeNull();
    expect(screen.getAllByText(/당초 결정세액/).length).toBeGreaterThan(0);
  });
});

describe("마법사 검증 — 숨긴 칸으로 막지 않는다", () => {
  const blank = form({ paymentDeadline: "2024-03-31", unpaidTaxMode: "manual", unpaidTax: "" });
  const hasUnpaid = (c: "amend" | "refund_claim" | null, f = blank) =>
    collectWizardStepIssues(3, f, c).some((i) => i.field === "unpaidTax");

  it("일반은 미납세액을 요구한다", () => expect(hasUnpaid(null)).toBe(true));
  it("수정신고·경정청구는 요구하지 않는다", () => {
    expect(hasUnpaid("amend")).toBe(false);
    expect(hasUnpaid("refund_claim")).toBe(false);
  });
  it("자산 폼 자체가 수정신고면 그 단계 검증은 유지", () => {
    const own = form({ amendmentMode: true, originalDeterminedTax: "" });
    expect(collectWizardStepIssues(3, own, "amend").some((i) => i.field === "originalDeterminedTax")).toBe(true);
  });
  it("다른 단계 검증은 그대로", () => {
    const f = form({ contractTotalPrice: "" });
    expect(collectWizardStepIssues(0, f, "amend").some((i) => i.field === "contractTotalPrice")).toBe(true);
  });
});

describe("공통 설정 문구", () => {
  it("상태대로", () => {
    expect(aggregatePenaltyNotice({ amendmentMode: false, correctionKind: "amend" })).toContain("각 자산 편집 마법사 마지막 단계에서 입력합니다");
    expect(aggregatePenaltyNotice({ amendmentMode: true, correctionKind: "amend" })).toContain("아래 수정신고 항목에서 입력합니다");
    expect(aggregatePenaltyNotice({ amendmentMode: true, correctionKind: "refund_claim" })).toBe("경정청구 계산에는 자산별 가산세 입력이 쓰이지 않습니다.");
  });
  it("패널에 도달한다", () => {
    const multi = { ...useMultiTransferStore.getState().form, amendmentMode: true, correctionKind: "amend" } as MultiTransferFormData;
    render(<AggregateSettingsPanel form={multi} onChange={() => {}} />);
    expect(screen.getByText(/아래 수정신고 항목에서 입력합니다/)).toBeInTheDocument();
    expect(screen.queryByText(/각 자산 편집 마법사/)).toBeNull();
  });
});

describe("다건 수정신고·경정청구 진입 — 편집과 같이 저장 폼을 마이그레이션한다", () => {
  const record = (): CalculationRecord =>
    ({
      id: "r",
      userId: "local-user",
      taxType: "transfer",
      title: "t",
      // 구 스키마(assets 없음) + 후속 추가 필드 없음
      inputData: { __multiTransfer: true, taxYear: 2024, properties: [{ propertyId: "p", propertyLabel: "양도 1번", completionPercent: 100, form: { transferDate: "2024-01-26" } }] },
      resultData: { determinedTax: 1, totalTax: 1, properties: [{ propertyId: "p" }] },
      clientId: null,
    }) as unknown as CalculationRecord;
  const router = { push: vi.fn() } as never;

  it.each([
    ["수정신고", () => enterMultiAmendment(record(), router), "amend"],
    ["경정청구", () => enterRefundClaim(record(), router), "refund_claim"],
  ] as const)("%s", async (_n, enter, kind) => {
    useMultiTransferStore.getState().setForm({ amendmentMode: false, properties: [] });
    enter();
    await vi.waitFor(() => expect(useMultiTransferStore.getState().form.amendmentMode).toBe(true));
    const f = useMultiTransferStore.getState().form;
    expect(f.correctionKind).toBe(kind);
    const pf = f.properties[0].form;
    expect(Array.isArray(pf.assets)).toBe(true);
    expect(pf.isOneHousehold).toBe(defaultFormData.isOneHousehold);
  });
});

describe("배선", () => {
  const src = (f: string) => readFileSync(f, "utf8");
  const CALC = "app/calc/transfer-tax/TransferTaxCalculator.tsx";

  it("계산기: 임베드 상태를 Step1·Step6에 넘기고 검증·버튼에 쓴다", () => {
    const s = src(CALC);
    expect(s).toMatch(/filingUnitCorrectionOf\(isEmbeddedInMulti, s\.form\)/);
    expect(s).toMatch(/<Step1[^>]*filingUnitCorrection=\{filingUnitCorrection\}/);
    expect(s).toMatch(/<Step6[^>]*filingUnitCorrection=\{filingUnitCorrection\}/);
    expect(s).toMatch(/isLastStep && formData\.enablePenalty && !filingUnitCorrection/);
    expect(s).not.toMatch(/[^.]collectStepIssues\(/);
  });
  it("Step1: 신고서 단위 상태를 안내에 반영한다", () => {
    expect(src("app/calc/transfer-tax/steps/Step1.tsx")).toMatch(/filingOverdueNote\(\{ \.\.\.form, amendmentMode: form\.amendmentMode \|\| !!filingUnitCorrection \}\)/);
  });
});
