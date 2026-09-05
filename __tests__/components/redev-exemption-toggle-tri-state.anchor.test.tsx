/**
 * `redevExemptionEligibleAtApproval` 3-state 필드 ↔ 2-state 토글 계약 (A8)
 *
 * ## 문제
 *
 * 이 필드는 **3-state**(`"" | "yes" | "no"`)이고 세 값이 엔진에서 **각각 다른 뜻**이다
 * (`calc-wizard-asset-redev.ts:198-204` · `transfer-tax-api-redev.ts:107-112`):
 *
 *   `""`    → `undefined` : 자동 판정 (사용자 미선언)
 *   `"yes"` → `true`      : 요건 충족 선언
 *   `"no"`  → `false`     : 요건 미충족 선언
 *
 * 그런데 이 필드를 편집하는 위젯이 **두 개**이고 값 체계가 서로 다르다:
 *
 *   `ExemptionAtApprovalCard`(RedevelopmentBlock.tsx:598)  RadioCardGroup — 3-state 전부
 *   `RedevelopmentRightExemptionSection`(:123)             ToggleCard     — 2-state
 *
 * 종전 토글은 OFF에 `"no"`를 기록했다. `""`도 OFF로 **표시**되므로 **같은 시각 상태가
 * 두 저장값에 대응**했고, 그 둘은 세액이 다르다.
 *
 * ## 세액 영향 (실측, `mock-rates` · 입주권 5.2억 · 1세대1주택 · 거주 120개월)
 *
 *   `undefined`("") → LTHD 112,000,000 · 산출세액 108,260,000 · 지방소득세 10,826,000
 *   `false`("no")   → LTHD  42,000,000 · 산출세액 136,260,000 · 지방소득세 13,626,000
 *
 * 차이 **+30,800,000원**. 원인은 `redevelopment-lthd.ts:119-122` — `=== false`일 때만
 * `isOneHouseSingle`을 강제 `false`로 내려 LTHD 표2(최대 80%)를 표1(최대 30%)로 강등한다.
 * `undefined`는 강등하지 않는다.
 *
 * ⇒ 토글을 켰다 끄기만 해도 세액이 3천만원 늘었다. 사례 36 토글은 §89①4호 가목
 *   **자기선언**(ON = 선언함)이지 인가일 기준 미충족의 적극적 선언이 아니므로,
 *   OFF에 `"no"`를 기록하는 것은 법 근거 없는 불리 적용이다
 *   (memory `feedback_no_unfavorable_application_without_legal_basis`).
 *
 * ## 계약
 *
 * 토글은 필드의 **두 상태만** 쓴다 — ON → `"yes"`, OFF → `""`.
 * `"no"`는 3-state를 온전히 표현하는 `ExemptionAtApprovalCard`의 RadioCardGroup 전용이다.
 *
 * ⛔ OFF에 `"no"`를 되돌려 넣지 말 것. 위 실측대로 세액이 바뀐다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// RTL cleanup은 프로젝트 규약상 수동 등록 (memory feedback_rtl_manual_cleanup_required)
afterEach(() => cleanup());

const TOGGLE_TITLE = "인가일 현재 §89①3호 가목 요건 충족 (자기선언)";

/**
 * ToggleCard의 Switch는 `role`을 두지 않고 `aria-label` + `aria-checked`만 노출한다
 * (`components/ui/switch.tsx` — Base UI `Switch.Root` 기본 렌더). role 쿼리는 잡지 못한다.
 */
function toggle(): HTMLElement {
  return screen.getByLabelText(TOGGLE_TITLE);
}

/**
 * 두 카드가 **동시에** 뜨는 자산 — A8 중복의 실재 조건.
 *
 *   `RedevelopmentRightExemptionSection`  ← `isRightSubject`(RedevelopmentBlock.tsx:120)
 *   `ExemptionAtApprovalCard`             ← `redevIsSuccessorMember !== "yes"`
 *                                           `&& redevSettlementDirection === "receive"`
 *                                           `&& isOneHouseSingle` (:211)
 *
 * 청산금 방향 라디오(:186-192)는 `redevSubject`와 무관하게 열리므로 입주권에서도
 * "수령"을 고를 수 있다 — 두 가드는 배타가 아니다.
 */
function bothCardsAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "right_to_move_in",
    redevSubject: "right",
    // 2026-08-26(U1-03): 종전에는 `transferPrice` prop으로 넘겼다. 12억 초과 안내는
    // 이제 자산이 들고 있는 값을 직접 읽는다 — prop 축이 하나 줄었다.
    actualSalePrice: "520000000",
    redevSettlementDirection: "receive",
    acquisitionDate: "2002-04-09",
    redevApprovalDate: "2018-10-23",
    ...over,
  };
}

function renderBlock(asset: AssetForm, onChange = vi.fn()) {
  render(
    <RedevelopmentBlock
      asset={asset}
      onChange={onChange}
      isOneHouseSingle
      wasRegulatedAtAcquisition={false}
    />,
  );
  return onChange;
}

describe("A8 — 입주권 비과세 자기선언 토글의 3-state 계약", () => {
  it("[A8-01] 토글 OFF → 빈문자열(자동 판정). `\"no\"`를 쓰지 않는다", () => {
    // ON 상태에서 시작해야 OFF 전이를 관찰할 수 있다.
    const onChange = renderBlock(bothCardsAsset({ redevExemptionEligibleAtApproval: "yes" }));

    fireEvent.click(toggle());

    expect(onChange).toHaveBeenCalledWith({ redevExemptionEligibleAtApproval: "" });
  });

  it("[A8-02] 토글 ON → \"yes\" (자기선언)", () => {
    const onChange = renderBlock(bothCardsAsset({ redevExemptionEligibleAtApproval: "" }));

    fireEvent.click(toggle());

    expect(onChange).toHaveBeenCalledWith({ redevExemptionEligibleAtApproval: "yes" });
  });

  it("[A8-03] 빈문자열과 \"no\"는 토글에서 똑같이 OFF로 보인다 — 그래서 OFF가 \"no\"를 쓰면 안 된다", () => {
    renderBlock(bothCardsAsset({ redevExemptionEligibleAtApproval: "" }));
    const offByEmpty = toggle();
    expect(offByEmpty).toHaveAttribute("aria-checked", "false");

    cleanup();

    renderBlock(bothCardsAsset({ redevExemptionEligibleAtApproval: "no" }));
    const offByNo = toggle();
    expect(offByNo).toHaveAttribute("aria-checked", "false");
  });

  /**
   * C-1 (b) rose 경고 카드는 ToggleCard **바깥**에 있다
   * (`RedevelopmentRightExemptionSection.tsx:201`). OFF가 `""`를 기록하게 되면서
   * 경고 조건이 빈값을 포함한 채로는 **토글을 끈 뒤에도 경고가 남는다**.
   * `:60-66`에서 빈값을 제외해 종전의 "OFF면 경고 없음" 동작을 보존한다.
   */
  const WARNING_HEADING = /비과세 요건 미충족 가능성/;

  it("[A8-05] 토글 OFF(빈값) + 보유월수 미달 → 경고 카드 없음", () => {
    renderBlock(
      bothCardsAsset({
        redevExemptionEligibleAtApproval: "",
        redevPriorHouseHoldingMonths: "12",
      }),
    );

    expect(screen.queryByText(WARNING_HEADING)).toBeNull();
  });

  it("[A8-06] 토글 ON + 보유월수 미달 → 경고 카드 표시 (검증 기능 보존)", () => {
    renderBlock(
      bothCardsAsset({
        redevExemptionEligibleAtApproval: "yes",
        redevPriorHouseHoldingMonths: "12",
      }),
    );

    expect(screen.getByText(WARNING_HEADING)).toBeTruthy();
  });

  it("[A8-04] 현행 중복 실재 — 같은 필드를 편집하는 카드 2개가 동시에 렌더된다", () => {
    renderBlock(bothCardsAsset());

    // 사례 36 카드 (ToggleCard)
    expect(toggle()).toBeTruthy();
    // 사례 46·47 카드 (RadioCardGroup — `<label>` + `<input type="radio">`).
    // "선언 안 함" 옵션은 그 카드에만 있다 (2026-09-05 · Q16에서 "자동 판정"에서 개명 —
    // 그 옵션은 자동값을 쓰는 것이 아니라 **아무것도 선언하지 않는** 상태다).
    expect(screen.getByRole("radio", { name: /선언 안 함/ })).toBeTruthy();
  });
});
