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
    /**
     * 신고 상태는 칩 밖 상시 노출 (결정 A).
     * 🔴 G-07 B1: 2-state 토글(`isFiledOnTime`) → **3-state 라디오**(`filingStatus`)로 승격됐다.
     * 정기신고 옵션이 §69 축을, late·none 옵션이 §47의2 축을 나타낸다.
     */
    expect(screen.getByText(/신고 상태 \(상증법 §68① · §69 \/ 국세기본법 §47의2·§47의3\)/)).toBeTruthy();
    expect(screen.getByText("법정기한 내 신고 (정기신고)")).toBeTruthy();
    expect(screen.getByText("기한후신고 (국세기본법 §45의3)")).toBeTruthy();
    expect(screen.getByText("무신고")).toBeTruthy();
    // 정기신고 기본값이므로 기한후신고·과소신고 하위 칸은 아직 없다
    expect(screen.queryByText("기한후신고일")).toBeNull();
    expect(screen.queryByText("당초 신고세액")).toBeNull();
    // 입력 블록은 기본 접힘 — 입력 블록 고유 텍스트(hint) 미노출 (칩 라벨과 구분)
    expect(screen.queryByText("해외 소재 증여재산에 대해 납부한 외국 세액")).toBeNull();
    expect(screen.queryByText("조특법 과세특례 (창업·가업)")).toBeNull();
  });

  /**
   * 🔴 G-07 B1 (⑤) — 3-state가 **조건부 하위 칸**을 연다.
   *
   * 결정 3은 「3-state + 신고일」이었지만, 결정 2(과소신고 구현)가 「당초 신고세액」을
   * 수학적으로 요구한다(§47의3①의 base). 정상 신고 사용자는 라디오 하나만 보고,
   * 해당 국면에서만 칸이 열린다.
   */
  describe("G-07 B1 ⑤ 신고 상태 3-state — 조건부 하위 칸", () => {
    it("B1-UI-1: 기한후신고 → 기한후신고일 + 「미리 앎」 토글이 열린다", () => {
      renderChecklist({ filingStatus: "late" });
      expect(screen.getByText("기한후신고일")).toBeTruthy();
      expect(screen.getByText("결정할 것을 미리 알고 신고")).toBeTruthy();
      // 과소신고 축은 정기신고 전용이라 나오지 않는다
      expect(screen.queryByText("과소신고 (국세기본법 §47의3)")).toBeNull();
    });

    it("B1-UI-2: 정기신고 → 과소신고 토글이 열린다 (기한후신고 칸은 없다)", () => {
      renderChecklist({ filingStatus: "on_time" });
      expect(screen.getByText("과소신고 (국세기본법 §47의3)")).toBeTruthy();
      expect(screen.queryByText("기한후신고일")).toBeNull();
    });

    it("B1-UI-3: 🔴 과소신고 ON → 당초 신고세액 + §47의3④1호 적용제외가 열린다", () => {
      renderChecklist({ filingStatus: "on_time", isUnderReported: true });
      expect(screen.getByText("당초 신고세액")).toBeTruthy();
      expect(screen.getByText("적용제외 사유 (국세기본법 §47의3④1호)")).toBeTruthy();
      // 4사유가 모두 고를 수 있어야 한다 — 「다」목이 이 앱에서 가장 흔하다
      expect(screen.getByText(/다\. 상증법 §60②③·§66 보충적 평가액/)).toBeTruthy();
    });

    it("B1-UI-4: 무신고 → 하위 칸이 하나도 없다 (§48②2호 감면 대상이 아니다)", () => {
      renderChecklist({ filingStatus: "none" });
      expect(screen.queryByText("기한후신고일")).toBeNull();
      expect(screen.queryByText("과소신고 (국세기본법 §47의3)")).toBeNull();
    });
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
