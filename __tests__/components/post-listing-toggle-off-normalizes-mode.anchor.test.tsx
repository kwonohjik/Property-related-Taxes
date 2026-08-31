/**
 * @vitest-environment jsdom
 *
 * 「취득 후 상장」 토글을 «끄면» 입력 방식도 direct로 되돌린다
 *
 * 계획서: docs/00-pm/stock-transfer-std-input-mode-dead-end.plan.md (FD-5·6)
 *
 * ## 왜 필요한가
 *
 * `transferStdInputMode`의 라디오는 이 토글의 children 안에만 있다
 * (`PostListingValuationCard.tsx:117` · `ToggleCard.tsx:303`이 `{checked && children}`).
 * 토글을 끄면 라디오가 사라지므로 **daily로 남은 값은 되돌릴 방법이 없다**.
 *
 * ⇒ 끄는 순간 함께 정규화한다. `normalize`(FD-4)는 «이미 저장된» 폼을 담당하고,
 *   이 anchor는 «지금 화면에서 끄는» 경로를 담당한다.
 *
 * ⚠️ **patch는 한 번에 보낸다.** 두 번 나눠 부르면 뒤 호출이 앞의 spread를 덮어쓴다
 *    ([[feedback_multikey_patch_stale_spread_overwrite]]).
 *
 * 🔑 Step2에서 시작한다 — 카드를 직접 렌더하면 「그 토글이 화면에 실재하는가」를 놓친다
 *    ([[feedback_leaf_anchor_skips_zod_layer]]의 UI 판).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

const POST_LISTING_TOGGLE = /취득 후 상장/;

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
    ...o,
  };
}

describe("FD — 취득후상장 토글 OFF 시 입력 방식 정규화", () => {
  it("FD-5: 토글을 끄면 patch에 transferStdInputMode:\"direct\"가 «동승»한다", () => {
    const onChange = vi.fn();
    render(
      <Step2
        form={listedEstimatedForm({ acquiredBeforeListing: true, transferStdInputMode: "daily" })}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: POST_LISTING_TOGGLE }));

    // 🔑 한 번의 patch — 호출이 쪼개지면 stale spread 덮어쓰기가 난다
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({
      acquiredBeforeListing: false,
      transferStdInputMode: "direct",
    });
  });

  /**
   * 🔑 **FD-5의 대조군.** 「무조건 direct를 실어 보낸다」로 구현하면 사용자가 방금
   *    켠 카드의 모드를 매번 되돌리게 된다. 켜는 방향은 건드리지 않아야 한다.
   */
  it("FD-6: 토글을 켤 때는 입력 방식을 건드리지 않는다", () => {
    const onChange = vi.fn();
    render(
      <Step2
        form={listedEstimatedForm({ acquiredBeforeListing: false, transferStdInputMode: "direct" })}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: POST_LISTING_TOGGLE }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({ acquiredBeforeListing: true });
  });
});
