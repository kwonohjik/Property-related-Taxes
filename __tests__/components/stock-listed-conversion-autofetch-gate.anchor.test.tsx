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

  it("AG-1: 「취득 후 상장」 OFF면 키움 자동조회 버튼이 없다 (Phase 4에서 뒤집힌다)", () => {
    render(<Step2 form={listedEstimatedForm()} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /키움 자동조회/ })).toBeNull();
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
   * 취득일 축은 아직 «존재하지 않는다». Phase 5가 신설하면 이 단언이 실패한다.
   *
   * 🔑 이름(`/취득일 키움 자동조회/`)으로 없음을 단언하면 «이름이 달라도 통과»해 구별력이 0이다.
   *    자동조회 버튼의 **개수**로 센다 — Phase 5 이후에는 2개가 되므로 반드시 울린다.
   */
  it("AG-5: 자동조회 버튼은 현재 1개뿐이다 — 취득일 축 부재 (Phase 5에서 뒤집힌다)", () => {
    render(
      <Step2
        form={listedEstimatedForm({ acquiredBeforeListing: true, transferStdInputMode: "daily" })}
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByRole("button", { name: /키움 자동조회/ })).toHaveLength(1);
  });
});
