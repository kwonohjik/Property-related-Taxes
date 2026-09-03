/**
 * anchor: 부동산 양도세 — 「부정행위로 인한 과소신고분」 **폼 → ④ → ⑫ → 엔진 배선**
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Track C)
 *
 * 국세기본법 §47조의3①1호는 「가목 + 나목을 합한 금액」인데, 부동산 엔진도 **전액에 단일
 * 비율**을 곱하고 있었다(주식과 같은 뿌리 — 두 세목이 같은 penalty 모듈을 쓴다).
 *
 * ⚠️ **빈 문자열이면 body 에 키를 넣지 않는다**(미입력 = 전액 부정 = 종전 동작).
 *    0 은 「부정행위분이 없다」는 유효한 선언이라 **0도 보낸다**. 이 둘을 섞으면
 *    「0을 입력했는데 전액 40%가 붙는」 침묵 오류가 된다.
 *
 * ⚠️ ⑫ Zod 는 여기서 직접 검증하지 않는다 — `filingPenaltyDetailsSchema` 를 import 하면
 *    **순환 import(TDZ)** 로 터진다(`transfer-tax-schema-sub` ↔ `transfer-tax-schema-reductions`,
 *    실측 `TypeError: Cannot read properties of undefined (reading 'optional')`).
 *
 * 🔴 **G-14 정정 (2026-09)** — 종전 이 자리에는 「⑭ 는 스프레드라 자동 전달되고, 그 경로는
 *    route 를 태우는 `__tests__/api/transfer.route.*` 계열이 덮는다」고 적혀 있었다.
 *    **사실이 아니었다**: `grep -rn "fraudulentPortion" __tests__/api/` 가 **0건**이었고,
 *    ⑫ 스키마에서 그 키를 지워 조용히 strip 되게 해도 1,172파일 11,293테스트가 전건 통과했다.
 *    키가 strip 되면 엔진이 「미입력 = 전액 부정」으로 보아 21,000,000원(2.1배) 불리한 세액이
 *    나온다. ⇒ ⑫⑭ 는 이제 **`__tests__/api/transfer.route.penalty-b6-plumbing.anchor.test.ts`**
 *    가 route 를 관통해 덮는다. 이 파일은 ④ payload 규약과 엔진 leaf 만 담당한다.
 */

import { describe, it, expect } from "vitest";
import { buildPenaltyAmendmentPayload } from "@/lib/calc/transfer-tax-api-body-blocks";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { calculateFilingPenalty } from "@/lib/tax-engine/transfer-tax-penalty";

function form(o: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    enablePenalty: true,
    filingType: "under",
    penaltyReason: "fraudulent",
    priorPaidTax: "0",
    originalFiledTax: "0",
    excessRefundAmount: "0",
    interestSurcharge: "0",
    ...o,
  };
}

/** ④ payload 에서 filingPenaltyDetails 만 뽑는다 */
function penaltyBlock(f: TransferFormData): Record<string, unknown> | undefined {
  const payload = buildPenaltyAmendmentPayload(f) as Record<string, unknown>;
  return payload.filingPenaltyDetails as Record<string, unknown> | undefined;
}

describe("TF-1 ④ payload 게이트", () => {
  it("TF-1-1: 미입력이면 키 자체가 없다 — 종전 동작(전액 부정)", () => {
    const block = penaltyBlock(form({ fraudulentPortion: "" }));
    expect(block).toBeDefined();
    expect(block!.fraudulentPortion).toBeUndefined();
  });

  it("TF-1-2: 값을 넣으면 숫자로 실린다", () => {
    expect(penaltyBlock(form({ fraudulentPortion: "30000000" }))!.fraudulentPortion).toBe(
      30_000_000,
    );
  });

  it("TF-1-3: **0 도 실린다** — 「부정행위분 없음」 선언", () => {
    expect(penaltyBlock(form({ fraudulentPortion: "0" }))!.fraudulentPortion).toBe(0);
  });
});

describe("TF-3 엔진 — 결정세액 100,000,000 격자", () => {
  const base = {
    determinedTax: 100_000_000,
    reductionAmount: 0,
    priorPaidTax: 0,
    originalFiledTax: 0,
    excessRefundAmount: 0,
    interestSurcharge: 0,
    filingType: "under" as const,
    penaltyReason: "fraudulent" as const,
  };

  it("TF-3-1: 부정분 30,000,000 → 19,000,000 (30,000,000×40% + 70,000,000×10%)", () => {
    expect(calculateFilingPenalty({ ...base, fraudulentPortion: 30_000_000 }).filingPenalty).toBe(
      19_000_000,
    );
  });

  it("TF-3-2: 미입력 → 40,000,000 (종전과 동일 — 기존 신고서 세액 불변)", () => {
    expect(calculateFilingPenalty(base).filingPenalty).toBe(40_000_000);
  });
});
