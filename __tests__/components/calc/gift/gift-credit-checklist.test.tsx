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

/**
 * #71 — 「상증법」§4의2⑥ 단서 연대납세의무 토글 **잠금**.
 *
 * 설계서(`gift-donor-paid-tax-grossup.engine.design.md:70`)와 anchor 주석
 * (`gift-donor-paid-grossup-anchor.test.ts` C-12)이 이 잠금을 **현재형으로** 기술했지만
 * 실물은 없었다 — 「계획서가 적은 배제 결정에는 코드 게이트가 필요하다」의 실례다.
 * 이 블록이 그 게이트를 고정한다.
 *
 * 실측 세액 영향(리뷰 재현): §39 증자이익 1억 이관 · 부→성년자녀 · 신고기한 내,
 * `donorPaysGiftTax: true` 기준 —
 *   `donorHasJointLiability: false`(법령상 정답) → finalTax 5,370,986 (gross-up applied)
 *   `donorHasJointLiability: true`(단서상 불가)  → finalTax 4,850,000 (applied=false)
 *   ⇒ 차액 **520,986원 과소과세**.
 */
describe("GiftCreditChecklist — §4의2⑥ 단서 연대납세의무 토글 잠금 (#71)", () => {
  const exemptItem = (id: string) => ({
    id,
    category: "other" as const,
    name: `증자이익(§39) ${id}`,
    marketValue: 100_000_000,
    isJointLiabilityExemptGift: true as const,
  });
  const plainItem = (id: string) => ({
    id,
    category: "financial" as const,
    name: `예금 ${id}`,
    marketValue: 50_000_000,
  });
  const openParent = { donorPaysGiftTax: true };

  it("[JL-UI-1] giftItems 전부가 단서 열거 유형이면 토글이 잠긴다", () => {
    renderChecklist({ ...openParent, giftItems: [exemptItem("a"), exemptItem("b")] });
    // BaseUI Switch는 `<span role="switch">`라 native `disabled` 속성이 없다 — `aria-disabled`를 본다.
    const sw = screen.getByTestId("gift-donor-joint-liability").querySelector('[role="switch"]');
    expect(sw?.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/연대납부의무가 성립하지 않습니다/)).toBeTruthy();
  });

  // 긍정 짝 ① — 표지가 없으면 평소대로 열려 있어야 한다. 이 단언이 없으면
  //   「항상 잠그기」 구현이 위 테스트만으로 초록이 된다.
  it("[JL-UI-2] 긍정 짝 — 일반 증여만 있으면 잠기지 않는다", () => {
    renderChecklist({ ...openParent, giftItems: [plainItem("a")] });
    const sw = screen.getByTestId("gift-donor-joint-liability").querySelector('[role="switch"]');
    expect(sw?.getAttribute("aria-disabled")).not.toBe("true");
    expect(screen.queryByTestId("gift-joint-liability-mixed-warning")).toBeNull();
  });

  // 긍정 짝 ② — 혼합은 잠그지 않는다. `donorHasJointLiability`는 계산 단위 단일 boolean이고
  //   일반 증여분에 대해서는 「예」가 성립할 수 있다(리뷰의 법령 렌즈 정정).
  it("[JL-UI-3] 혼합 계산은 잠그지 않고 경고만 띄운다", () => {
    renderChecklist({ ...openParent, giftItems: [exemptItem("a"), plainItem("b")] });
    const sw = screen.getByTestId("gift-donor-joint-liability").querySelector('[role="switch"]');
    expect(sw?.getAttribute("aria-disabled")).not.toBe("true");
    expect(screen.getByTestId("gift-joint-liability-mixed-warning")).toBeTruthy();
  });

  // KM8 SURVIVED로 드러난 공백 — `items.length > 0` 가드를 지워도 전건 초록이었다.
  //   빈 배열에 `every`는 **true**라, 가드가 없으면 아무것도 입력하지 않은 화면에서
  //   토글이 잠긴다(입력을 시작하기도 전에 선택지가 사라진다).
  it("[JL-UI-5] 빈 폼에서는 잠기지 않는다 — 빈 배열의 every는 true다", () => {
    renderChecklist({ ...openParent, giftItems: [], stockItems: [] });
    const sw = screen.getByTestId("gift-donor-joint-liability").querySelector('[role="switch"]');
    expect(sw?.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("[JL-UI-4] 잠긴 상태에서는 저장된 값이 true여도 꺼진 것으로 보인다", () => {
    renderChecklist({
      ...openParent,
      donorHasJointLiability: true,
      giftItems: [exemptItem("a")],
    });
    const sw = screen
      .getByTestId("gift-donor-joint-liability")
      .querySelector('[role="switch"]');
    expect(sw?.getAttribute("aria-checked")).toBe("false");
  });
});
