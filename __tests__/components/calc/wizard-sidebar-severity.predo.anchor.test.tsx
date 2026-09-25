/**
 * @vitest-environment jsdom
 *
 * Pre-Do anchor — **사이드바 표식의 색이 심각도를 말한다** (F-5).
 * 계획서: `docs/00-pm/validation-warnings-display.plan.md` §7 F-5.
 *
 * ## 고치기 전 상태 (실측)
 *
 * 같은 화면 안에서 amber가 **두 뜻**이다:
 *
 * | 위치 | 오류 | 경고 |
 * |---|---|---|
 * | 배너 `OneHouseJudgmentCalculator.tsx:255` | rose | — |
 * | F-1 `ValidationWarnings` (ToneCard amber) | — | **amber** |
 * | 사이드바 `WizardSidebar.tsx:48` | **amber** ← | (없음) |
 * | StepIndicator `StepIndicator.tsx:34` | **amber** ← | (없음) |
 *
 * 배너 관례는 이미 red=오류 / amber=경고로 일관된다. 어긋나는 쪽은 chrome이다.
 * ⇒ 오류를 rose로 내리고 amber를 **경고 전용**으로 비운 뒤, 경고 표식을 넣는다.
 *
 * 🔑 유닛에서만 관측되는 것: **어떤 심각도가 어떤 색·라벨로 나오는가.**
 *    경고 문구 자체는 `validation-warnings-display.predo.anchor.test.tsx`가 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OneHouseJudgmentSidebar } from "@/components/calc/one-house/OneHouseJudgmentSidebar";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { validateStepByIndex } from "@/lib/calc/one-house-exemption-validate";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

const house = (acquisitionDate: string) => ({
  id: "h1",
  region: "capital",
  acquisitionDate,
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
});

/** 화면0 «세대»에 **경고만** — `validateStep1`은 오류를 아예 만들지 않는다(실측). */
function formWarningOnly(): OneHouseJudgmentFormData {
  return { ...createInitialOneHouseJudgmentForm(), isOneHousehold: false };
}

/** 초기 폼 — 화면1 «양도 대상 주택»에 **오류만** 3건. */
function formErrorOnly(): OneHouseJudgmentFormData {
  return createInitialOneHouseJudgmentForm();
}

/**
 * 화면2 «보유 주택·권리»에 **오류와 경고가 함께**.
 * · 취득일 없는 명부 1행 → 오류
 * · §155⑳ 임대주택 이중 계상(특례 선언 + 명부 있음) → 경고
 */
function formBoth(): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    houses: [house("")],
    assets: [
      {
        ...f.assets[0],
        rentalHousingException: {
          ...f.assets[0].rentalHousingException,
          applyException: true,
          rentalUnits: [makeDefaultRentalUnit()],
        },
      },
    ],
  } as OneHouseJudgmentFormData;
}

/** 사이드바를 결과 단계에서 렌더 — 입력 3화면이 모두 표식 평가 대상이 된다. */
function rows(form: OneHouseJudgmentFormData): HTMLLIElement[] {
  render(<OneHouseJudgmentSidebar form={form} currentStep={3} onStepClick={() => {}} />);
  const nav = screen.getByRole("navigation", { name: "진행 단계" });
  return Array.from(nav.querySelectorAll("li"));
}

const count = (form: OneHouseJudgmentFormData, step: number, sev: "error" | "warning") =>
  validateStepByIndex(form, step).filter((e) => e.severity === sev).length;

describe("SB-0 (전제) — 세 시료가 실제로 세 갈래다", () => {
  it("경고만 / 오류만 / 둘 다 가 데이터로 갈린다", () => {
    expect([count(formWarningOnly(), 0, "error"), count(formWarningOnly(), 0, "warning")]).toEqual([0, 1]);
    expect([count(formErrorOnly(), 1, "error"), count(formErrorOnly(), 1, "warning")]).toEqual([3, 0]);

    const both = formBoth();
    expect(count(both, 2, "error")).toBeGreaterThan(0);
    expect(count(both, 2, "warning")).toBeGreaterThan(0);
  });
});

describe("SB-1 — 경고만 있는 단계", () => {
  /**
   * 🔴 착수 **전**에는 이 행이 «✓세대»였다 — 표식이 없던 게 아니라 **«완료»로 떴다**(실측).
   *    경고가 미해소인 단계에 초록 체크가 붙는 것이라 «없음»보다 나쁘다.
   *    게다가 사용자가 화면1에 있는 동안 화면0의 경고는 **어디에도 보이지 않는다**
   *    (F-1 배너는 현재 화면 것만 띄운다). 그 둘이 F-5가 메우는 구멍이다.
   */
  it("amber «확인 필요» 표식이 붙는다", () => {
    const r = rows(formWarningOnly());
    const mark = r[0].querySelector('[aria-label="확인 필요"]');
    expect(mark).toBeTruthy();
    expect(mark!.className).toContain("text-amber-500");
    // 오류가 아니므로 «입력 필요»는 아니다.
    expect(r[0].querySelector('[aria-label="입력 필요"]')).toBeNull();
  });
});

describe("SB-2 — 오류가 있는 단계", () => {
  /** 🔴 착수 전에는 이 글리프가 **amber**였다 — 바로 아래 오류 배너는 rose인데. */
  it("rose «입력 필요» 표식이 붙는다", () => {
    const mark = rows(formErrorOnly())[1].querySelector('[aria-label="입력 필요"]');
    expect(mark).toBeTruthy();
    expect(mark!.className).toContain("text-rose-600");
    expect(mark!.className).not.toContain("amber");
  });
});

describe("SB-3 — 오류와 경고가 한 단계에 함께", () => {
  /**
   * 우선순위 규칙: **오류가 이긴다.** 차단 사유가 비차단 주의에 가려지면 안 된다.
   * 이 단언이 없으면 삼항 순서를 뒤집어도 아무도 모른다(뮤테이션 M-B로 구별력 실측).
   */
  it("«입력 필요»만 뜨고 «확인 필요»는 뜨지 않는다", () => {
    const r = rows(formBoth());
    expect(r[2].querySelector('[aria-label="입력 필요"]')).toBeTruthy();
    expect(r[2].querySelector('[aria-label="확인 필요"]')).toBeNull();
  });
});

describe("SB-4 — StepIndicator도 같은 규약을 쓴다", () => {
  /**
   * 양도세는 사이드바와 StepIndicator를 **둘 다** 쓴다. 한쪽만 rose로 내리면
   * 같은 마법사가 같은 상태를 두 색으로 말하게 된다.
   */
  it("attention 원이 rose다", () => {
    render(<StepIndicator steps={["가", "나"]} current={1} stepStatus={["attention", "neutral"]} />);
    const circle = screen.getByTestId("step-circle-0");
    expect(circle.getAttribute("data-status")).toBe("attention");
    expect(circle.className).toContain("rose");
    expect(circle.className).not.toContain("amber");
  });
});
