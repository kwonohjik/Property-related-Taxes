import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GiftCreditChecklist } from "@/components/calc/gift/GiftCreditChecklist";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";

afterEach(cleanup);

function renderChecklist(overrides: Partial<FormState> = {}) {
  const form: FormState = { ...INITIAL_FORM, ...overrides };
  const set = vi.fn();
  return { form, set, ...render(<GiftCreditChecklist form={form} set={set} />) };
}

describe("GiftCreditChecklist — Step4 칩 컴팩트", () => {
  it("기본(빈 폼): 칩 패널·신고세액공제 노출, 입력 블록은 접힘", () => {
    renderChecklist();
    // 칩 패널 + 2그룹 헤더
    expect(screen.getByText("공제·세액공제 항목 선택")).toBeTruthy();
    expect(screen.getByText(/상증법 §53의2·§55/)).toBeTruthy();
    expect(screen.getByText(/§59·§30의5·6·§70/)).toBeTruthy();
    // 신고세액공제는 칩 밖 상시 노출 (결정 A)
    expect(screen.getByText("법정신고기한 내 신고 (§69 신고세액공제 3%)")).toBeTruthy();
    // 입력 블록은 기본 접힘 — 입력 블록 고유 텍스트(hint) 미노출 (칩 라벨과 구분)
    expect(screen.queryByText("해외 소재 증여재산에 대해 납부한 외국 세액")).toBeNull();
    expect(screen.queryByText("조특법 과세특례 (창업·가업)")).toBeNull();
  });

  it("혼인·출산 칩: 비-직계존속이면 미노출 / 직계존속이면 노출", () => {
    renderChecklist({ donorRelation: "spouse" });
    expect(screen.queryByText("혼인·출산 공제 (§53의2)")).toBeNull();
    cleanup();
    renderChecklist({ donorRelation: "lineal_ascendant_adult" });
    expect(screen.getByText("혼인·출산 공제 (§53의2)")).toBeTruthy();
  });

  it("칩 클릭 → 입력 블록 펼침", () => {
    renderChecklist();
    // 외국납부 칩 클릭
    fireEvent.click(screen.getByRole("button", { name: /외국납부세액 \(§59\)/ }));
    // 입력 블록 고유 hint 노출
    expect(screen.getByText("해외 소재 증여재산에 대해 납부한 외국 세액")).toBeTruthy();
  });

  it("[C1] specialTreatment 값 있으면 조특 섹션 자동 노출(접힘 불가)", () => {
    renderChecklist({ specialTreatment: "family_business" });
    expect(screen.getByText(/조특법 과세특례 \(창업·가업\)/)).toBeTruthy();
    // 가업 영위기간 입력도 노출
    expect(screen.getByText("부모 가업 영위기간 (§30의6①)")).toBeTruthy();
  });

  it("[C1] 분납 enabled면 분납 섹션 자동 노출", () => {
    renderChecklist({ splitPaymentEnabled: true });
    expect(screen.getByText("분납 신청 (상증법 §70②)")).toBeTruthy();
  });
});
