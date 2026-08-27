/**
 * Pre-Do anchor: 이력 게이트가 **일반건물(GB)을 수정신고·경정청구 대상으로 통과**시킨다
 * (계획서 `docs/00-pm/transfer-amendment-remaining-cases.plan.md` Phase 0 · A-2)
 *
 * ## 결함
 *
 * `classifyAmendableTransfer`(`transfer-amendment-entry.ts:51-55`)는 `mode==="bundled"`에서
 * `assets.length > 1`을 요구한다. GB는 route가 `mode:"bundled"`로 응답하지만 **물건이 1개**라
 * 탈락한다. 게이트 주석(`:26-27`)이 이를 **「자연 배제」**라고 스스로 적고 있다 —
 * 즉 **법적 판단이 아니라 §166⑥ 가드의 부수 효과**다.
 *
 * ## 법령 — 배제 근거 부존재
 *
 * 국세기본법 §45①·§45의2①의 요건은 「**과세표준신고서를 법정신고기한까지 제출한 자**」 + 기한이며,
 * 본문에도 각 호에도 **자산 종류·평가 방법·양도 유형을 가르는 문언이 없다**.
 * (KoreanLaw 실측, MST 288571)
 *
 * ## 판별자
 *
 * `aggregated.generalBuildingValuationDetail` — GB **3경로 전부**가 이 키를 세팅한다:
 * `general-building-fractional.ts:364` · `general-building-route-helper.ts:258` ·
 * `general-building-route-actual.ts:679`.
 * `mode==="bundled"` 단독으로는 §166⑥ 일괄과 구분되지 않으므로 이 키가 정본이다.
 *
 * ⚠️ **전용 반환값을 쓴다.** 기존 값(`"single"`·`"bundled"`)을 재사용하면
 * `classifyLoadableTransfer`(`transfer-multi-load-entry.ts:20-24`)로 누수된다 —
 * 그쪽은 allow-list(`single`|`multi`)라 **신규 값은 자동 배제**되지만, 기존 값이면 통과한다.
 */
import { describe, it, expect } from "vitest";
import {
  classifyAmendableTransfer,
  extractOriginalDeterminedTax,
} from "@/lib/calc/transfer-amendment-entry";
import { classifyLoadableTransfer } from "@/lib/calc/transfer-multi-load-entry";
import type { CalculationRecord } from "@/lib/storage/types";

function rec(partial: Partial<CalculationRecord>): CalculationRecord {
  return { id: "r1", taxType: "transfer", ...partial } as unknown as CalculationRecord;
}

/** GB record — route가 실제로 내는 모양(단일 물건 + GB 판별 키). */
function gbRecord(over: { determinedTax?: number; burdenedGift?: boolean } = {}): CalculationRecord {
  return rec({
    resultData: {
      mode: "bundled",
      apportionment: { apportioned: [] },
      aggregated: {
        determinedTax: over.determinedTax ?? 204_930_000,
        generalBuildingValuationDetail: { assetCards: [] },
      },
      ...(over.burdenedGift ? { transferBurdenedGiftBreakdown: { giftTax: { finalTax: 1 } } } : {}),
    },
    inputData: { assets: [{}], transferDate: "2024-03-01" },
  });
}

describe("A-2 · 일반건물 이력 게이트 (국세기본법 §45·§45의2)", () => {
  it("GBG-01: 🔴 GB 환산·실가 record가 정정 대상으로 통과한다", () => {
    // 종전에는 assets.length===1이라 null이었다 — 「자연 배제」.
    expect(classifyAmendableTransfer(gbRecord())).not.toBeNull();
  });

  it("GBG-02: 🔴 GB 부담부증여(사례 34)도 통과한다 — 배제 근거 조문 부존재", () => {
    expect(classifyAmendableTransfer(gbRecord({ burdenedGift: true }))).not.toBeNull();
  });

  it("GBG-03: 🔑 당초 결정세액은 `aggregated.determinedTax`(양도세분 단독)에서 나온다", () => {
    // 증여세(transferBurdenedGiftBreakdown.giftTax)를 섞으면 안 된다 — 별개 세목.
    expect(extractOriginalDeterminedTax(gbRecord({ determinedTax: 204_930_000 }))).toBe(204_930_000);
    expect(extractOriginalDeterminedTax(gbRecord({ determinedTax: 204_930_000, burdenedGift: true })))
      .toBe(204_930_000);
  });

  it("GBG-04: 🔴 다건 불러오기로 **누수되지 않는다** — GB는 다건 경로 미지원", () => {
    // 기존 값 재사용 금지의 실증. allow-list라 전용 값이면 자동 null이 된다.
    expect(classifyLoadableTransfer(gbRecord())).toBeNull();
    expect(classifyLoadableTransfer(gbRecord({ burdenedGift: true }))).toBeNull();
  });

  it("GBG-05: 대조군 — §166⑥ 일괄(GB 키 없음·assets>1)은 종전대로 `bundled`", () => {
    expect(
      classifyAmendableTransfer(
        rec({
          resultData: { mode: "bundled", aggregated: { determinedTax: 1 } },
          inputData: { assets: [{}, {}] },
        }),
      ),
    ).toBe("bundled");
  });
});
