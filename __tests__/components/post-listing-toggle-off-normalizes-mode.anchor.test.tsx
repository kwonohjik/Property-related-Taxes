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

/**
 * 🔄 **S3 (2026-09-10)** — 토글이 라디오 선택지가 됐다(Q-2 3안).
 * 「끄기」는 이제 «다른 방식을 고르기»다. 정규화 책임도 ToggleCard의 `onCheckedChange`에서
 * 라디오의 `onChange`(`Step2.tsx`)로 옮겼다.
 *
 * ⚠️ 정규화 대상도 줄었다 — `transferStdInputMode`는 분모 블록이 4갈래 위에 항상 있어
 *    **되돌릴 UI가 늘 존재**하므로 손대지 않는다(사용자 선택 보존).
 *    `listingStdInputMode`만 §165⑤ 전용이라 남는다.
 */
const POST_LISTING_RADIO = /취득 후 상장/;
const GENERAL_RADIO = /취득일 이전 1개월 종가평균/;

function listedEstimatedForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kospi",
    securityCode: "005930",
    securityName: "삼성전자",
    acquisitionDate: "2015-04-20",
    transferDate: "2025-06-10",
    acquisitionMode: "estimated",
    acquisitionStdMode: "monthly_avg",
    ...o,
  };
}

describe("FD — 산정 방식 전환 시 입력 방식 정규화", () => {
  it("FD-5: §165⑤에서 «벗어나면» patch에 listingStdInputMode:\"direct\"가 «동승»한다", () => {
    const onChange = vi.fn();
    render(
      <Step2
        form={listedEstimatedForm({
          acquisitionStdMode: "post_listing",
          transferStdInputMode: "daily",
          listingStdInputMode: "daily",
        })}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: GENERAL_RADIO }));

    // 🔑 한 번의 patch — 호출이 쪼개지면 stale spread 덮어쓰기가 난다
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({
      acquisitionStdMode: "monthly_avg",
      listingStdInputMode: "direct",
    });
  });

  /**
   * 🔑 **FD-5의 대조군.** 「무조건 direct를 실어 보낸다」로 구현하면 사용자가 방금
   *    고른 방식의 모드를 매번 되돌리게 된다. §165⑤로 «들어가는» 방향은 건드리지 않는다.
   */
  it("FD-6: §165⑤로 들어갈 때는 입력 방식을 건드리지 않는다", () => {
    const onChange = vi.fn();
    render(
      <Step2
        form={listedEstimatedForm({ acquisitionStdMode: "monthly_avg", transferStdInputMode: "direct" })}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: POST_LISTING_RADIO }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({ acquisitionStdMode: "post_listing" });
  });

  /**
   * 🔑 **S3 신규.** 분모 축은 «보존»된다 — 되돌릴 UI가 항상 화면에 있기 때문이다.
   *    이 단언이 없으면 「전부 direct로 되돌리기」 구현이 조용히 들어온다.
   */
  it("FD-7: 방식을 바꿔도 transferStdInputMode는 건드리지 않는다 (사용자 선택 보존)", () => {
    const onChange = vi.fn();
    render(
      <Step2
        form={listedEstimatedForm({
          acquisitionStdMode: "post_listing",
          transferStdInputMode: "daily",
        })}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: GENERAL_RADIO }));

    expect(onChange.mock.calls[0][0]).not.toHaveProperty("transferStdInputMode");
  });
});
