/**
 * anchor: §39 증자 **다주주(cap-table) 모드 — 주권상장법인 단서 미반영 안내** (안 C)
 *
 * 계획서: docs/00-pm/capital-increase-captable-listed-proviso.plan.md v1.2 §6
 *
 * 안 C의 요지: 다주주 모드는 「상증령」§29②1가·3나 단서를 반영하지 못한다(equity-delta 모델의
 * zero-sum 항등식이 외생 시장가를 넣으면 깨진다). 그래서 **조용히 틀린 값을 내는 대신
 * 명시적으로 안내**하고 단일 모드로 유도한다.
 *
 * ⚠️ **차단(validate)은 하지 않는다** — 다주주 모드는 상장 여부를 입력받지 않으므로 상장임을
 *    판정할 방법이 없고, 비상장 다주주 사용을 막아서도 안 된다(자동 판정 금지 정책).
 *    ⇒ 이 anchor는 「안내가 **항상** 보이고, **차단은 없다**」를 함께 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CapitalIncreaseAllocationFields } from "../../components/calc/deemed-gift/capital-forms";
import { INITIAL_DEEMED, type DeemedFormState } from "../../components/calc/deemed-gift/shared";
import { validateDeemedInput } from "../../lib/calc/gift-deemed-validate";

afterEach(cleanup);

function allocForm(over: Partial<DeemedFormState> = {}): DeemedFormState {
  return {
    ...INITIAL_DEEMED,
    type: "capital_increase_allocation",
    giftDate: "2026-03-02",
    ciAllocPrePrice: "20,000",
    ciAllocNewPrice: "10,000",
    ciAllocRows: [
      { id: "sh-1", name: "A", preShares: "60,000", entitledShares: "60,000", subscribedShares: "0", reallocatedShares: "", relatedTo: ["sh-2"], allocationMethod: "normal" },
      { id: "sh-2", name: "B", preShares: "40,000", entitledShares: "40,000", subscribedShares: "100,000", reallocatedShares: "60,000", relatedTo: ["sh-1"], allocationMethod: "normal" },
    ],
    ...over,
  };
}

describe("cap-table 다주주 모드 — 상장 단서 미반영 안내", () => {
  it("NC-1: 안내 카드가 노출된다 (§29②1가·3나 단서 · 단일 모드 유도)", () => {
    render(<CapitalIncreaseAllocationFields form={allocForm()} set={() => {}} />);
    expect(screen.getByText(/주권상장법인이라면 이 모드를 쓰지 마세요/)).toBeInTheDocument();
    expect(screen.getByText(/§29②1가·3나 단서/)).toBeInTheDocument();
    expect(screen.getByText(/단일 모드/)).toBeInTheDocument();
  });

  it("NC-2 ⭐: 안내일 뿐 **차단하지 않는다** — 비상장 다주주 사용을 막으면 안 된다", () => {
    // 상장 여부를 물어도(NC-3) validate는 이 사유로 막지 않는다 — 안 C의 「차단 없음」 원칙.
    expect(validateDeemedInput(allocForm())).toBeNull();
  });

  /**
   * 🔧 **NC-3 갱신 (안 D1 · 계획서 v1.7 §13)**
   *
   * 종전 NC-3은 「상장 토글을 **두지 않는다** (있으면 반영되는 줄 오해한다)」였다.
   * 그 취지는 **평가 산식 단서**(「상증령」§29②1가·3나 — ㉯를 종가평균 Min/Max로)가
   * 반영되는 줄 오해시키지 말라는 것이다. 그 취지는 **그대로 유효**하다.
   *
   * 다만 그 결정이 **상장 플래그 자체의 부재**로 번져, 「상증법」§39① 괄호의
   * 「**주권상장법인이**」 요건을 공모 배정 제외에서 검사할 수 없게 만들었다
   * ⇒ 비상장 + 공모 배정이 **무조건 제외**되어 **과소과세**(anchor CL-3).
   *
   * ⇒ 두 축을 분리한다. **공모 제외 판정 전용 토글은 둔다**(㉯에 접촉하지 않음 — CL-1·CL-2가 고정).
   *   **평가 단서를 반영하는 입력**(종가평균·종목코드)은 **여전히 두지 않는다**.
   */
  it("NC-3 ⭐: 평가 단서 입력은 여전히 없다 — 종가평균·종목코드 미노출", () => {
    render(<CapitalIncreaseAllocationFields form={allocForm()} set={() => {}} />);
    expect(screen.queryByTestId("ci-alloc-stock-code")).not.toBeInTheDocument();
    expect(screen.queryByText(/종가평균을 입력/)).not.toBeInTheDocument();
    // 단일 모드의 「주권상장법인등」 토글(평가 단서용)은 이 모드에 없다
    expect(screen.queryByRole("switch", { name: /주권상장법인등/ })).not.toBeInTheDocument();
  });

  it("NC-4 ⭐: 공모 배정 제외 판정용 상장 토글은 **있다** (사라지면 오제외가 부활한다)", () => {
    render(<CapitalIncreaseAllocationFields form={allocForm()} set={() => {}} />);
    const toggle = screen.getByRole("switch", { name: /주권상장법인 \(공모 배정 제외 판정용\)/ });
    expect(toggle).toBeInTheDocument();
    // 오해 차단 문구가 토글에 붙어 있어야 한다 — 「이걸 켜면 평가액도 바뀌겠지」를 막는다
    expect(screen.getByText(/평가가액 단서\(§29②1가·3나\)는 이 항목을 켜도 반영되지 않습니다/)).toBeInTheDocument();
  });
});
