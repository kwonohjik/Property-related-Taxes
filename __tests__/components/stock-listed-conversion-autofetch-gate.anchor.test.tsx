/**
 * @vitest-environment jsdom
 *
 * P-0 대조군 — 상장 환산 블록의 키움 자동조회 «도달 가능성»
 *
 * 계획서: docs/00-pm/stock-listed-conversion-1month-kiwoom-autofetch.plan.md (Phase 0 → Phase 4)
 *
 * ## 왜 Step2에서 시작하는가
 *
 * `KiwoomAutoFetchButton`을 직접 렌더하면 「버튼이 동작하는가」만 보고
 * **「사용자가 그 버튼에 도달할 수 있는가」**를 놓친다. 진입점이 결함보다 아래면
 * 통과가 도달을 뜻하지 않는다([[feedback_leaf_anchor_skips_zod_layer]]의 UI 판).
 *
 * ## 이 파일이 고정하는 «현재» 동작 — 바뀌어야 할 것이다
 *
 * 자동조회 버튼은 두 겹의 게이트 안에 있다:
 *   ① `PostListingValuationCard`의 `<ToggleCard checked={acquiredBeforeListing}>`
 *      — `ToggleCard.tsx:303`이 `{checked && children}`이라 OFF면 children이 아예 없다
 *   ② 그 안에서 `transferStdInputMode === "daily"` (기본값은 `"direct"`)
 *
 * ⇒ 일반 §163⑨ 환산 사용자(취득 후 상장이 아닌 사람)에게는 **도달 경로가 없다**.
 *    「취득 후 상장」을 켜는 것은 우회가 아니다 — 그 토글은 계산 경로를 §165⑤로 바꾼다.
 *
 * 🔴 **AG-1·AG-2는 트립와이어다.** Phase 4가 버튼을 게이트 밖으로 옮기면 «실패해야 한다».
 *    실패하면 지우지 말고 «반대 방향 단언으로 대체»할 것 — 그때 이 파일의 목적은
 *    「버튼이 일반 블록에서 보인다」를 지키는 것으로 바뀐다.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

/** 일반 상장 환산 진입 조건 — 상장 + 환산 모드 + 거래정지·취득후상장 아님 */
function listedEstimatedForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kospi",
    securityCode: "005930",
    securityName: "삼성전자",
    acquisitionDate: "2015-04-20",
    transferDate: "2025-06-10",
    acquisitionMode: "estimated",
    tradingHaltAtTransfer: false,
    tradingHaltAtAcquisition: false,
    acquiredBeforeListing: false,
    ...o,
  };
}

describe("AG — 상장 환산 블록의 자동조회 도달 가능성 (Phase 4 대조군)", () => {
  it("AG-0: 일반 §163⑨ 환산 블록 자체는 렌더된다 (대조군의 대조군)", () => {
    render(<Step2 form={listedEstimatedForm()} onChange={() => {}} />);
    // 라벨의 「직전」은 Phase 3에서 「이전」으로 정정된다 — 여기서는 블록 존재만 본다.
    expect(screen.getByText(/환산취득가 \(시행령 §163⑨\)/)).toBeTruthy();
  });

  /**
   * ⭐ **Phase 4에서 «대체»된 단언이다.**
   *
   * 종전(Phase 0): 「취득 후 상장 OFF면 버튼이 «없다»」 — 결함을 고정하는 트립와이어였다.
   * 지금: 일반 §163⑨ 환산 사용자에게 버튼이 **보인다**. 이것이 이 트랙의 목적이다.
   *
   * ⇒ 이 단언이 `toBeNull()`로 되돌아가면 도달 경로가 다시 사라진 것이다
   *   ([[feedback_ui_gate_removes_sole_input_path]]).
   */
  it("AG-1: 「취득 후 상장」 OFF여도 «양도일» 자동조회 버튼이 보인다 (일반 §163⑨ 경로)", () => {
    render(<Step2 form={listedEstimatedForm()} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /양도일 키움 자동조회/ })).toBeTruthy();
  });

  /**
   * ⭐ **Phase 5에서 신설된 축.** 분자(§99①3 취득시 기준시가)도 같은 산식이라
   *    같은 버튼을 `axis="acquisition"`으로 재사용한다.
   */
  it("AG-1c: «취득일» 자동조회 버튼도 같은 블록에 있다 (분자 축)", () => {
    render(<Step2 form={listedEstimatedForm()} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /취득일 키움 자동조회/ })).toBeTruthy();
  });

  it("AG-1d: 취득일 거래정지 토글 ON이면 분자 입력과 함께 취득일 버튼도 사라진다", () => {
    render(
      <Step2 form={listedEstimatedForm({ tradingHaltAtAcquisition: true })} onChange={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: /취득일 키움 자동조회/ })).toBeNull();
    // 분모 축은 남는다 (비대칭 — §165③은 취득측 기준시가만 대체한다)
    expect(screen.getByRole("button", { name: /양도일 키움 자동조회/ })).toBeTruthy();
  });

  it("AG-1b: 양도일 거래정지 토글 ON이면 환산 블록 자체가 닫혀 두 버튼 모두 사라진다", () => {
    render(
      <Step2 form={listedEstimatedForm({ tradingHaltAtTransfer: true })} onChange={() => {}} />,
    );
    expect(screen.queryAllByRole("button", { name: /키움 자동조회/ })).toHaveLength(0);
  });

  it("AG-2: 「취득 후 상장」 OFF면 입력 방식(direct/daily) 라디오도 없다", () => {
    render(<Step2 form={listedEstimatedForm()} onChange={() => {}} />);
    expect(screen.queryByText("일자별 입력 (자동 평균 산정)")).toBeNull();
  });

  /**
   * 게이트 ①만 열어도 부족하다는 것을 고정한다 — 기본 모드가 `direct`이기 때문이다.
   * 이 단언은 Phase 4 이후에도 «참»으로 남을 수 있다(버튼이 게이트 밖으로 나가면
   * 이 조건에서도 보이게 되므로 그때 대체한다).
   */
  it("AG-3: 「취득 후 상장」 ON + direct 모드에서도 버튼은 없다 (게이트 ② 존재 증명)", () => {
    render(
      <Step2
        form={listedEstimatedForm({ acquiredBeforeListing: true, transferStdInputMode: "direct" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /키움 자동조회/ })).toBeNull();
  });

  /**
   * ⭐ **AG-4는 위 세 부정 단언의 «구별력 증명»이다.** 같은 셀렉터가 여기서는 실제로 찾는다.
   *    이것이 없으면 AG-1·AG-3이 「셀렉터가 틀려서」 통과하는지 구분할 수 없다
   *    ([[feedback_negative_assertion_needs_mutation_probe]]).
   */
  it("AG-4: 「취득 후 상장」 ON + daily 모드에서만 버튼이 보인다 (현재 유일 경로 · 셀렉터 대조군)", () => {
    render(
      <Step2
        form={listedEstimatedForm({ acquiredBeforeListing: true, transferStdInputMode: "daily" })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /키움 자동조회/ })).toBeTruthy();
    // AG-2 셀렉터의 대조군 — 게이트 ①이 열리면 이 라디오 라벨이 실재한다
    expect(screen.getByText("일자별 입력 (자동 평균 산정)")).toBeTruthy();
  });

  /**
   * ⭐ **Phase 5에서 «대체»된 단언이다.** 종전에는 「버튼이 1개뿐 = 취득일 축 부재」를
   *    고정하는 트립와이어였고, 예정대로 울렸다. 지금은 두 축이 모두 있음을 고정한다.
   */
  it("AG-5: 일반 §163⑨ 경로에는 자동조회 버튼이 «2개»다 — 분모·분자 두 축 (Phase 5)", () => {
    render(<Step2 form={listedEstimatedForm()} onChange={() => {}} />);
    expect(screen.getAllByRole("button", { name: /키움 자동조회/ })).toHaveLength(2);
  });

  it("AG-5b: 「취득 후 상장」 경로(§165⑤)는 종전 그대로 1개다 (축이 다르다)", () => {
    render(
      <Step2
        form={listedEstimatedForm({ acquiredBeforeListing: true, transferStdInputMode: "daily" })}
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByRole("button", { name: /키움 자동조회/ })).toHaveLength(1);
  });
});
