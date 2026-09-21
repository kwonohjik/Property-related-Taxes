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
 *   `ExemptionAtApprovalCard`(RedevelopmentBlock.tsx)      RadioCardGroup — 3-state 전부
 *   `RedevelopmentRightExemptionSection`                   ToggleCard     — 2-state
 *
 * ## 🔄 두 위젯이 **다른 화면으로 갈렸다** (P6-c-1)
 *
 * `RedevelopmentRightExemptionSection`은 판정 메뉴 전용이 됐고, `ExemptionAtApprovalCard`는
 * 계산기에 남았다. **한 화면의 중복은 사라졌지만 계약은 그대로 살아 있다** — 같은 필드를
 * 두 화면이 **다른 값 체계로** 쓰기 때문이다. OFF가 `"no"`를 기록하면 세액이 3,080만원
 * 달라지는 것은 화면이 갈려도 변하지 않는다.
 *
 * ⚠️ 그래서 이 anchor는 토글을 **컴포넌트 단위로** 마운트한다. 프로덕션 경로 도달은
 *    형제 anchor(`redev-right-exemption-prop-wiring`)가 판정 메뉴 `Step3`에서 지킨다.
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
import { RedevelopmentRightExemptionSection } from "@/components/calc/transfer/RedevelopmentRightExemptionSection";
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

/** 토글 계약은 **컴포넌트의 것**이다 — 판정 메뉴가 이 컴포넌트를 마운트한다. */
function renderBlock(asset: AssetForm, onChange = vi.fn()) {
  render(<RedevelopmentRightExemptionSection asset={asset} onChange={onChange} />);
  return onChange;
}

/** 계산기 쪽(§⑥ 입력이 빠진 `RedevelopmentBlock`) — A8-04 전용. */
function renderCalcBlock(asset: AssetForm, onChange = vi.fn()) {
  render(<RedevelopmentBlock asset={asset} onChange={onChange} isOneHouseSingle />);
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

  /**
   * 🔄 **A8-04은 두 번 고쳐졌다.**
   *
   * | 시점 | 고정한 것 |
   * |---|---|
   * | 최초 | 「한 화면에 카드 2개가 동시에 뜬다」(당시 현실) |
   * | P6-c-1 | 「두 편집 위젯이 다른 화면에 있다」 |
   * | **P6-c-3** | 「**입주권**에서는 계산기에 편집기가 없다」 ← 지금 |
   *
   * 🔴 **P6-c-1의 기재가 부정확했다.** 「화면 단위로 갈렸다」고 적었지만 ③-c 카드의 렌더
   *    게이트에 `!isRightSubject`가 없어, 입주권 + 청산금 **수령** + 1세대1주택이면
   *    `ImportedRedevRightFactsCard`(읽기 전용 요약)와 이 라디오가 **한 화면에 그대로**
   *    남아 있었다. 실측으로 확인해 P6-c-3에서 게이트를 채웠다.
   */
  it("[A8-04] 입주권 — 계산기에 편집 위젯이 없다 (판정 메뉴가 소유)", () => {
    renderCalcBlock(bothCardsAsset());
    expect(screen.queryByRole("radio", { name: /선언 안 함/ })).toBeNull();
    expect(screen.queryByLabelText(TOGGLE_TITLE)).toBeNull();
    // 🔑 대신 읽기 전용 요약이 그 자리를 지킨다 — 값은 살아서 세액을 바꾼다(OH-21).
    expect(screen.getByTestId("redev-right-calc-card")).toBeTruthy();

    cleanup();

    // 판정 메뉴: ToggleCard만. 「선언 안 함」 라디오는 없다.
    renderBlock(bothCardsAsset());
    expect(toggle()).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /선언 안 함/ })).toBeNull();
  });

  /**
   * 🔴 **A8-04의 긍정 짝** (A8-05·06은 경고 카드 축이라 번호를 이어 A8-07). A8-04는 부정형이라 「게이트가 과하게 좁아 완공APT에서도 사라졌다」와
   *    구별되지 않는다. 완공APT는 판정 메뉴에 입력 경로가 **없으므로**
   *    (④ `one-house-exemption-api.ts:208`이 `assetKind === "right_to_move_in"`만 보낸다)
   *    계산기 라디오가 유일한 경로다 — 없어지면 §95② 표1 강등을 선언할 방법이 사라진다.
   */
  it("[A8-07] 완공APT — 계산기 라디오가 **남는다** (유일 입력 경로)", () => {
    renderCalcBlock(
      bothCardsAsset({ assetKind: "redevelopment_apt", redevSubject: "apt" }),
    );
    expect(screen.getByRole("radio", { name: /선언 안 함/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /미충족으로 선언/ })).toBeTruthy();
    // 입주권 전용 읽기 전용 요약은 여기 없다.
    expect(screen.queryByTestId("redev-right-calc-card")).toBeNull();
  });
});
