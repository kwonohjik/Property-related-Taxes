/**
 * anchor: 입력이 바뀌면 「가산세 계산하기」의 결정세액이 무효화된다 — UI 리뷰 高.
 *
 * `calcDeterminedTax`는 `TransferTaxCalculator`의 로컬 state로 「가산세 계산하기」가 채우는데
 * 종전에는 **어디서도 비워지지 않았다**(`handleReset`조차 `penaltyResult`만 비웠다). 그래서
 *   ① 가산세 계산 → 앞 단계로 돌아가 양도가액·필요경비 수정 → 기납부세액 입력, 또는
 *   ② 「초기화」 후 완전히 새 건을 입력 → 기납부세액 입력
 * 하면 `Step6`의 `handlePriorPaidChange`가 **옛 계산의 결정세액**으로
 * `unpaidTax = max(0, 결정세액 − 기납부세액)`을 자동 기입했다.
 *
 * ⭐ 그 값은 표시용이 아니다 — `transfer-tax-api-body-blocks.ts:164`가
 *   `delayedPaymentDetails.unpaidTax`로 **엔진에 그대로 보낸다**. 지연납부가산세가 틀린
 *   금액으로 산출되고 화면에는 경고도 없다.
 */
import { describe, it, expect } from "vitest";
import {
  PENALTY_ONLY_KEYS,
  patchInvalidatesDeterminedTax,
} from "@/app/calc/transfer-tax/transfer-penalty-invalidation";

describe("결정세액 무효화 판정", () => {
  it("🔑 I-1: 과세표준을 바꾸는 패치는 무효화한다 (자산·감면·보유상황)", () => {
    expect(patchInvalidatesDeterminedTax({ assets: [] })).toBe(true);
    expect(patchInvalidatesDeterminedTax({ transferDate: "2024-06-01" })).toBe(true);
    expect(patchInvalidatesDeterminedTax({ bundledSaleMode: true })).toBe(true);
  });

  it("🔑 I-2: 가산세 전용 필드만이면 무효화하지 않는다 (기납부세액 입력이 결정세액을 지우면 안 된다)", () => {
    expect(patchInvalidatesDeterminedTax({ priorPaidTax: "1000000" })).toBe(false);
    expect(patchInvalidatesDeterminedTax({ unpaidTax: "0", filingType: "under" })).toBe(false);
    expect(patchInvalidatesDeterminedTax({ amendmentMode: true })).toBe(false);
  });

  it("I-3: 섞여 있으면 무효화한다 (안전측)", () => {
    expect(patchInvalidatesDeterminedTax({ priorPaidTax: "1000000", assets: [] })).toBe(true);
  });

  it("I-4: 빈 패치는 아무것도 바꾸지 않으므로 무효화하지 않는다", () => {
    expect(patchInvalidatesDeterminedTax({})).toBe(false);
  });

  /**
   * 🔑 목록은 **좁을수록 안전**하다 — 여기 없는 키는 전부 「영향 있음」으로 걸린다.
   * 반대로 과세표준 필드가 실수로 목록에 들어가면 그 필드를 고쳐도 옛 결정세액이 살아남는다.
   */
  it("I-5: 과세표준 필드가 가산세 전용 목록에 섞이지 않았다", () => {
    for (const forbidden of [
      "assets",
      "transferDate",
      "filingDate",
      "contractTotalPrice",
      "bundledSaleMode",
    ]) {
      expect(PENALTY_ONLY_KEYS.has(forbidden), `${forbidden}이 목록에 있으면 안 된다`).toBe(false);
    }
  });
});
