/**
 * anchor: 영농상속공제 **요건 입력 UI 가 Step4 에 붙어 있다** (2026-09-11 배선 복구).
 *
 * ## 무엇이 결함이었나
 *
 * `FarmingEligibilitySection` 은 `step4-5.tsx` 에 마운트돼 있었는데(`55e22d66`), 그 파일이
 * 「orphan 삭제」되면서(`a67b2871`) 화면에서 함께 사라졌다. 아래가 전부 살아 있는 채로
 * **⑤(UI)만 없었다**:
 *
 *   ① `FormState.farming` · ③ normalize · ④ `buildInput` 의 `farming: form.farming`
 *   ⑦ 결과뷰가 「Step4에서 영농상속공제 요건 입력을 활성화하면」이라고 **안내**
 *
 * ⇒ `form.farming` 은 영원히 `undefined` 였고, 결과 화면은 **존재하지 않는 UI 를 가리켰다**
 *   ([[feedback_ui_gate_removes_sole_input_path]]).
 *
 * ## 두 축을 짝으로 잰다
 *
 * 「화면에 뜬다」만 재면 결과뷰의 안내가 가리키는 **입력 경로**가 실제로 열렸는지 모른다.
 * F-2 가 토글을 켜 `onChange` 로 `farming` 객체가 올라오는 것까지 확인한다 — 그것이
 * ④·엔진으로 가는 유일한 문이다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { Step4 } from "@/components/calc/inheritance/Step4Deductions";
import { INITIAL_FORM } from "@/components/calc/inheritance/shared";
import type { FormState } from "@/components/calc/inheritance/shared";
import type { Step4Autos } from "@/components/calc/inheritance/steps";

afterEach(cleanup);

const NO_SUGGEST = { value: 0, reason: "", breakdown: [], isApplicable: false };
const AUTOS: Step4Autos = {
  spouse: NO_SUGGEST,
  netFin: NO_SUGGEST,
  cohabit: { ...NO_SUGGEST, securedDebt: 0 },
  farming: NO_SUGGEST,
  legatee: NO_SUGGEST,
};

const TOGGLE_TITLE = /영농상속공제 요건/;

function renderStep4(overrides: Partial<FormState> = {}) {
  const set = vi.fn();
  const form: FormState = { ...INITIAL_FORM, ...overrides };
  render(<Step4 form={form} set={set} autos={AUTOS} />);
  return set;
}

describe("[FEM] 영농 요건 입력 — Step4 배선", () => {
  it("F-1: Step4 에 요건 입력 토글이 렌더된다", () => {
    renderStep4();
    // 결과뷰가 「Step4에서 … 활성화하면」이라고 안내하는 바로 그 자리다.
    expect(
      screen.queryAllByText(TOGGLE_TITLE).length,
      "영농 요건 입력 UI 가 Step4 에 없다 — 결과뷰 안내가 가리킬 곳이 사라졌다",
    ).toBeGreaterThan(0);
  });

  it("F-2: 토글을 켜면 form.farming 이 «객체»로 올라온다 (④로 가는 유일한 문)", () => {
    const set = renderStep4();
    // ToggleCard 의 실제 인터랙션은 `role="switch"` 다 — 제목 텍스트 클릭은 아무 일도 안 한다.
    fireEvent.click(screen.getByRole("switch", { name: TOGGLE_TITLE }));

    const call = set.mock.calls.find(
      (c) => c[0] && typeof c[0] === "object" && "farming" in c[0],
    );
    expect(call, "토글을 켜도 farming 패치가 올라오지 않았다").toBeTruthy();
    expect(
      call![0].farming,
      "farming 이 undefined 면 엔진은 legacy 모드로만 돈다",
    ).toBeTruthy();
    expect(typeof call![0].farming).toBe("object");
  });

  it("F-3: 대조군 — 초기 상태의 farming 은 undefined 다 (3-state legacy)", () => {
    expect(INITIAL_FORM.farming).toBeUndefined();
  });
});
