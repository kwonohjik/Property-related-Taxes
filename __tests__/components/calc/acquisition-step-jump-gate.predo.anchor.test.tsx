/**
 * @vitest-environment jsdom
 *
 * Pre-Do anchor — **취득세도 단계 점프로 필수 입력을 건너뛸 수 있다** (F-8).
 * 계획서: `docs/00-pm/validation-warnings-display.plan.md` §7 F-8.
 *
 * ## 고치기 전 상태 (실측)
 *
 * `handleNext`는 **현재 단계만** 검증한다(`AcquisitionTaxForm.tsx:158`). 마지막 단계에서는
 * 곧바로 API를 부른다. 그래서:
 *
 * 1. ①에서 취득가액을 비운 채 사이드바로 **⑥「감면 확인」으로 점프**
 * 2. 「다음」 → `validateStep(5, form)` = `null` (⑥엔 필수가 없다 — AQ-0)
 * 3. **계산이 실행되고 «0원» 결과 화면이 뜬다**(API 200 · `totalTax: 0` 실측)
 *
 * 입력이 실제로 비어 있으니 산술이 틀린 것은 아니다. 문제는 **제품이 필수라고 정한 값을
 * 건너뛰고도 완성된 결과 화면이 나온다**는 것이다.
 *
 * 🔑 형제 마법사에는 이미 있다 — 양도세 `handleSubmit`이 전 step을 재검증하고
 *    (`TransferTaxCalculator.tsx:235` 「자유 이동·필드 비우기 후 … 우회 차단」),
 *    판정은 F-2에서 같은 것을 넣었다. **취득세·주식만 빠져 있다**(주식은 별건 — 그쪽은
 *    Zod refine이 400으로 막아 조용한 오답이 되지 않는다).
 *
 * ⚠️ 「④ 중과 분기를 건너뛰면 엔진이 조용히 비조정으로 본다」는 축은 **주장하지 않는다** —
 *    수치를 재 보니 미선택·조정 모두 총세액 52,500,000으로 **차이가 0**이었다(실측).
 *    처분기한은 취득 시점 세액을 바꾸지 않는다(`feedback_numeric_impact_verify_before_bug_claim`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/calc/acquisition-tax",
  useSearchParams: () => new URLSearchParams(),
}));

const calcSpy = vi.fn(async () => ({ totalTax: 0 }) as never);
vi.mock("@/lib/calc/acquisition-tax-api", () => ({
  callAcquisitionTaxAPI: (...a: unknown[]) => calcSpy(...(a as [])),
}));
// 이력 자동저장은 Dexie를 연다 — jsdom에 IndexedDB가 없어 무관한 예외가 난다.
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: () => ({ saved: false, error: null }),
}));

import { AcquisitionTaxForm } from "@/components/calc/AcquisitionTaxForm";
import { AcquisitionSidebar } from "@/components/calc/acquisition/AcquisitionSidebar";
import {
  INITIAL_FORM,
  STEPS,
  validateStep,
  type FormState,
} from "@/components/calc/acquisition/shared";

afterEach(() => {
  cleanup();
  calcSpy.mockClear();
});

function rows(): HTMLLIElement[] {
  const nav = screen.getByRole("navigation", { name: "진행 단계" });
  return Array.from(nav.querySelectorAll("li"));
}

/** 사이드바에서 그 단계로 점프한다. */
function jumpTo(label: string) {
  const nav = screen.getByRole("navigation", { name: "진행 단계" });
  fireEvent.click(within(nav).getByRole("button", { name: new RegExp(label) }));
}

describe("AQ-0 (전제) — ①은 막고 ⑥은 안 막는다", () => {
  it("취득가액이 비면 ①만 오류, ⑥은 통과", () => {
    expect(validateStep(0, INITIAL_FORM)).toBe("취득가액을 입력하세요.");
    expect(validateStep(5, INITIAL_FORM)).toBeNull();
    // 사이드바 라벨 ↔ 단계 인덱스 가정을 못 박는다.
    expect(STEPS[0]).toBe("취득 정보");
    expect(STEPS[5]).toBe("감면 확인");
  });
});

describe("AQ-1 — 전진 점프가 필수 입력을 건너뛰지 못한다", () => {
  /**
   * 🔴 착수 **전**에는 ⑥으로 점프한 뒤 「취득세 계산」을 누르면 **계산이 실행됐다**
   *    (`calcSpy` 1회 호출 — 실측). 그때 ①은 «✓취득 정보»(완료)로 표시돼 있었다.
   */
  it("①이 불완전하면 ⑥으로 점프해도 ①에 머물고 계산이 실행되지 않는다", async () => {
    render(<AcquisitionTaxForm />);
    jumpTo("감면 확인");

    expect(screen.getByText("취득가액을 입력하세요.")).toBeTruthy();
    expect(rows()[0].querySelector("[aria-current]"), "①이 현재 단계여야 함").toBeTruthy();
    // 계산 CTA는 마지막 단계에만 있다 — ①에 머물렀으므로 애초에 없다.
    expect(screen.queryByRole("button", { name: "취득세 계산" })).toBeNull();
    await waitFor(() => expect(calcSpy).not.toHaveBeenCalled());
  });

  /**
   * 긍정 짝 — **막기만 하는 게이트는 쓸모가 없다.** 필수를 채우면 같은 점프가 통해야 한다.
   * 이 짝이 없으면 「점프를 통째로 무시」해도 위 단언이 초록이라 구별력이 0이다
   * (`feedback_negative_anchor_needs_positive_twin`).
   */
  it("①을 채우면 같은 점프가 통한다", () => {
    render(<AcquisitionTaxForm />);
    fireEvent.change(screen.getByLabelText(/취득가액 \(실거래가\)/), {
      target: { value: "500000000" },
    });
    jumpTo("감면 확인");
    expect(screen.getByRole("button", { name: "취득세 계산" })).toBeTruthy();
  });
});

describe("AQ-3 — 사이드바가 어느 단계가 빠졌는지 알려 준다", () => {
  /**
   * 🔴 착수 전 취득세 사이드바는 **위치 기반**(`done/active/todo`)만 써서 오류 표식이
   *    아예 없었다. F-5에서 정한 규약(rose `!` = 차단 오류)을 따른다.
   *
   * 🔑 오케스트레이터로는 이 상태를 만들 수 없다 — 게이트가 ①을 벗어나지 못하게 하므로
   *    ①은 늘 `active`다. 그래서 사이드바를 **직접** 렌더한다(F-5 `OneHouseJudgmentSidebar`와 같은 방식).
   */
  it("①이 불완전한 채 ②에 있으면 ①에 rose «입력 필요»가 붙는다", () => {
    render(
      <AcquisitionSidebar form={INITIAL_FORM as FormState} currentStep={1} onStepClick={() => {}} />,
    );
    const mark = rows()[0].querySelector('[aria-label="입력 필요"]');
    expect(mark, "① «취득 정보»에 오류 표식이 있어야 함").toBeTruthy();
    expect(mark!.className).toContain("text-rose-600");
  });

  /**
   * 🔴 **가 본 적 없는 단계는 빨개지면 안 된다** (2026-09-25 주식과 규약 통일).
   *
   * ①에서 연부취득 토글을 켜면 그 순간 ②「물건 상세」가 무효가 된다(실측 —
   *    `"연부취득은 최소 2회차 이상 입력해야 합니다."`). 종전 규칙(무효한 단계 전부 표시)에서는
   *    사용자가 ②를 **본 적도 없는데** rose `!`가 떴다. 빈 폼 무효 단계가 ① 하나뿐이라
   *    이 함정이 오래 드러나지 않았을 뿐이다.
   */
  it("아직 가 본 적 없는 단계는 무효여도 표식이 붙지 않는다", () => {
    const form = {
      ...INITIAL_FORM,
      propertyType: "housing",
      acquisitionCause: "purchase",
      isInstallmentAcquisition: true,
      installmentContractDate: "2024-01-01",
    } as FormState;
    // 전제 — ②는 실제로 무효다(이 단언이 없으면 아래가 공허해진다).
    expect(validateStep(1, form)).toContain("연부취득은 최소 2회차");

    render(
      <AcquisitionSidebar form={form} currentStep={0} maxVisitedStep={0} onStepClick={() => {}} />,
    );
    expect(
      rows()[1].querySelector('[aria-label="입력 필요"]'),
      "② «물건 상세»는 가 본 적이 없으므로 표식이 없어야 함",
    ).toBeNull();
  });

  /** 긍정 짝 — 한 번 가 본 뒤에는(되돌아와도) 표식이 붙는다. */
  it("가 본 적 있으면 되돌아와도 표식이 붙는다", () => {
    const form = {
      ...INITIAL_FORM,
      propertyType: "housing",
      acquisitionCause: "purchase",
      isInstallmentAcquisition: true,
      installmentContractDate: "2024-01-01",
    } as FormState;
    render(
      <AcquisitionSidebar form={form} currentStep={0} maxVisitedStep={1} onStepClick={() => {}} />,
    );
    const mark = rows()[1].querySelector('[aria-label="입력 필요"]');
    expect(mark, "② «물건 상세»에 오류 표식이 있어야 함").toBeTruthy();
    expect(mark!.className).toContain("text-rose-600");
  });

  it("오류가 없는 단계에는 표식이 붙지 않는다", () => {
    render(
      <AcquisitionSidebar
        form={{ ...INITIAL_FORM, reportedPrice: "500000000" } as FormState}
        currentStep={1}
        onStepClick={() => {}}
      />,
    );
    expect(rows()[0].querySelector('[aria-label="입력 필요"]')).toBeNull();
  });
});

/**
 * AQ-4 — 표식 «범위»를 **오케스트레이터를 거쳐** 확인한다.
 *
 * 🔑 위 AQ-3 계열은 사이드바를 직접 렌더하며 `maxVisitedStep`을 명시로 준다. 그래서
 *    **오케스트레이터가 실제로 추적하는지**는 못 본다 — 실측으로 확인했다: `setMaxVisitedStep`
 *    호출을 통째로 지워도 AQ-3 7건이 전부 초록이었다(SURVIVED).
 *    `visitedUpTo`에 `currentStep` 하한이 있어 「지나온 단계」는 추적 없이도 표시되기 때문이다.
 *    추적이 실제로 일하는 자리는 **되돌아온 뒤**뿐이다.
 *
 * 주식은 E2E `SJE-3`가 이 축을 지킨다. 취득세에는 대응 E2E가 없어 여기서 고정한다.
 */
describe("AQ-4 — 되돌아와도 «가 본» 단계는 표식을 유지한다", () => {
  /** ①을 채우고 「다음」으로 ②에 갔다가 사이드바로 ①에 되돌아온다. */
  function goToStep1AndBack() {
    render(<AcquisitionTaxForm />);
    fireEvent.change(screen.getByLabelText(/취득가액 \(실거래가\)/), {
      target: { value: "500000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    // ②에 도착했는지 — 이 단언이 없으면 아래가 공허해진다.
    expect(rows()[1].querySelector("[aria-current]"), "②가 현재 단계여야 함").toBeTruthy();

    // ①로 되돌아간다(후진은 막지 않는다).
    jumpTo("취득 정보");
    expect(rows()[0].querySelector("[aria-current]"), "①로 돌아와야 함").toBeTruthy();
  }

  it("②를 무효로 만들면 ①로 돌아와도 ②에 표식이 남는다", () => {
    goToStep1AndBack();

    // ①에서 연부취득을 켜면 ②「물건 상세」가 무효가 된다(회차 미입력).
    fireEvent.click(screen.getByRole("switch", { name: /연부취득/ }));

    const mark = rows()[1].querySelector('[aria-label="입력 필요"]');
    expect(mark, "가 본 적 있는 ②에는 표식이 붙어야 함").toBeTruthy();
    expect(mark!.className).toContain("text-rose-600");
  });
});
