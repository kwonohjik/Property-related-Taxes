/**
 * MIG · MAP — `acquisitionStdMode` 축의 **양 끝**을 고정한다 (S3)
 *
 * 설계서 `docs/02-design/features/stock-listed-conversion-mode-axis.ui.design.md` §4-1.
 *
 *   MIG  구 boolean 3개 → enum      (③ normalize — 세션 복원·이력 재진입)
 *   MAP  enum → 구 boolean 3개      (④ API 변환 — 엔진 input은 boolean을 유지한다)
 *
 * ## 왜 순서가 계약인가
 *
 * 게이트(⑧ G-5 · ⑫ refine)가 생기기 **전**에 저장된 폼에는 두 플래그가 함께 켜져 있을 수
 * 있다. 그때 엔진이 실제로 택하던 분기는 if-체인의 **선두**였다:
 *
 *   `stock-acquisition-basis.ts:128` acquiredBeforeListing   ← 선두
 *   `:165` tradingHaltAtTransfer → `:212` unlisted → `:257` tradingHaltAtAcquisition → `:303` 일반
 *
 * 역산 순서를 뒤집으면 **과거 계산 결과가 조용히 바뀐다**. `MIG-5`가 그 지점이다.
 */

import { describe, it, expect } from "vitest";
import {
  createInitialStockFormData,
  deriveAcquisitionStdMode,
  normalizeStockFormData,
  type AcquisitionStdMode,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";

// ============================================================
// MIG — 구 boolean → enum (③)
// ============================================================

describe("MIG — 구 boolean 3개 → acquisitionStdMode 역산", () => {
  it("MIG-1: 셋 다 false → monthly_avg", () => {
    expect(
      deriveAcquisitionStdMode({
        acquiredBeforeListing: false,
        tradingHaltAtTransfer: false,
        tradingHaltAtAcquisition: false,
      }),
    ).toBe("monthly_avg");
  });

  it("MIG-2: acquiredBeforeListing → post_listing", () => {
    expect(deriveAcquisitionStdMode({ acquiredBeforeListing: true })).toBe("post_listing");
  });

  it("MIG-3: tradingHaltAtTransfer → halt_transfer", () => {
    expect(deriveAcquisitionStdMode({ tradingHaltAtTransfer: true })).toBe("halt_transfer");
  });

  it("MIG-4: tradingHaltAtAcquisition → halt_acquisition", () => {
    expect(deriveAcquisitionStdMode({ tradingHaltAtAcquisition: true })).toBe("halt_acquisition");
  });

  /**
   * 🔴 **이 anchor가 순서를 지킨다.**
   *
   * 게이트 이전의 stale 폼에는 두 플래그가 함께 켜져 있을 수 있다. 엔진 if-체인은
   * `acquiredBeforeListing`을 **선두**로 두므로(`stock-acquisition-basis.ts:128`),
   * 그 조합에서 엔진이 택하던 것은 **post_listing**이다.
   *
   * 뮤테이션: `deriveAcquisitionStdMode`에서 두 if를 맞바꾸면 이 건만 실패해야 한다.
   */
  it("MIG-5: **이중 플래그**(post_listing + halt_transfer) → post_listing (엔진 선두 우선)", () => {
    expect(
      deriveAcquisitionStdMode({
        acquiredBeforeListing: true,
        tradingHaltAtTransfer: true,
        tradingHaltAtAcquisition: true,
      }),
    ).toBe("post_listing");
  });

  it("MIG-6: normalize가 구 폼(enum 없음)을 역산한다", () => {
    const stale = {
      ...createInitialStockFormData(),
      acquiredBeforeListing: true,
    } as unknown;
    // enum 필드를 제거해 «구 폼»을 만든다
    delete (stale as Record<string, unknown>).acquisitionStdMode;
    expect(normalizeStockFormData(stale).acquisitionStdMode).toBe("post_listing");
  });

  it("MIG-7: normalize가 이미 있는 enum을 그대로 쓴다 (역산이 덮어쓰지 않는다)", () => {
    const form = {
      ...createInitialStockFormData(),
      acquisitionStdMode: "halt_acquisition" as const,
      // 구 boolean이 «모순되게» 남아 있어도 enum이 이긴다
      acquiredBeforeListing: true,
    } as unknown;
    expect(normalizeStockFormData(form).acquisitionStdMode).toBe("halt_acquisition");
  });

  it("MIG-8: 알 수 없는 값은 역산으로 떨어진다 (조용한 통과 금지)", () => {
    const form = {
      ...createInitialStockFormData(),
      acquisitionStdMode: "not_a_mode",
      tradingHaltAtTransfer: true,
    } as unknown;
    expect(normalizeStockFormData(form).acquisitionStdMode).toBe("halt_transfer");
  });
});

// ============================================================
// MAP — enum → 구 boolean 3개 (④)
// ============================================================

const ALL_MODES: readonly AcquisitionStdMode[] = [
  "monthly_avg",
  "halt_acquisition",
  "post_listing",
  "halt_transfer",
];

/** 상장 + 환산 폼 — ④가 세 boolean을 싣는 최소 조건 */
function listedEstimatedForm(mode: AcquisitionStdMode): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    // 거래정지 축을 재는 픽스처 — 코스닥이어야 한다(영 §165③ 우회는 코스닥·코넥스 전용).
    // 종전 "kospi"는 우연한 선택이었고 법령상 불가능한 상태를 재고 있었다.
    // 시장 게이트 자체는 __tests__/calc/stock-kospi-halt-scope.anchor.test.ts 가 지킨다.
    marketType: "kosdaq",
    acquisitionMode: "estimated",
    acquisitionStdMode: mode,
    shareCount: "1000",
    transferActualInputMode: "per_share",
    perShareTransferPrice: "10000",
  } as StockTransferFormData;
}

function flags(mode: AcquisitionStdMode) {
  const body = buildStockTransferApiBody(listedEstimatedForm(mode)) as Record<string, unknown>;
  return {
    post: body.acquiredBeforeListing,
    haltT: body.tradingHaltAtTransfer,
    haltA: body.tradingHaltAtAcquisition,
  };
}

describe("MAP — acquisitionStdMode → 엔진 boolean 3개 (④ 펼침)", () => {
  it("MAP-1: monthly_avg → 셋 다 false", () => {
    expect(flags("monthly_avg")).toEqual({ post: false, haltT: false, haltA: false });
  });

  it("MAP-2: halt_acquisition → tradingHaltAtAcquisition만", () => {
    expect(flags("halt_acquisition")).toEqual({ post: false, haltT: false, haltA: true });
  });

  it("MAP-3: post_listing → acquiredBeforeListing만", () => {
    expect(flags("post_listing")).toEqual({ post: true, haltT: false, haltA: false });
  });

  it("MAP-4: halt_transfer → tradingHaltAtTransfer만", () => {
    expect(flags("halt_transfer")).toEqual({ post: false, haltT: true, haltA: false });
  });

  /**
   * 🔑 **축 통합의 핵심 이득을 계약으로 고정한다.**
   *
   * 종전에는 boolean 3개를 각자 켤 수 있어 「양도일 정지 × 취득 후 상장」 같은 **법령상
   * 양립 불가** 조합이 만들어졌고, ⑧·⑫가 런타임으로 막아야 했다.
   * enum 하나에서 펼치면 켜지는 boolean이 **언제나 0개 또는 1개**다.
   *
   * 뮤테이션: ④의 매핑 중 하나를 `||`로 느슨하게 만들면 이 건이 실패해야 한다.
   */
  it("MAP-5: 어떤 값을 골라도 켜지는 boolean은 **1개 이하**다 (불가 조합 생성 불가)", () => {
    for (const mode of ALL_MODES) {
      const f = flags(mode);
      const on = [f.post, f.haltT, f.haltA].filter(Boolean).length;
      expect(on).toBeLessThanOrEqual(1);
    }
  });

  it("MAP-6: MIG와 MAP은 서로의 역이다 (왕복 불변)", () => {
    for (const mode of ALL_MODES) {
      const f = flags(mode);
      expect(
        deriveAcquisitionStdMode({
          acquiredBeforeListing: f.post,
          tradingHaltAtTransfer: f.haltT,
          tradingHaltAtAcquisition: f.haltA,
        }),
      ).toBe(mode);
    }
  });
});
