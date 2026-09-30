/**
 * E2E 케이스 입력(`e2e/_helpers/validation-field-jump-cases.ts`)이 정말 그 키의 오류를 내는가.
 *
 * E2E는 「목록 항목을 누르면 그 칸에 커서」를 보는데, 입력이 기대 오류를 내지 않으면
 * 항목을 못 찾아 30초 타임아웃으로 엉뚱하게 터진다. 여기서 먼저 이름으로 실패시킨다.
 * 3단계 케이스는 「세금 계산하기」가 0~2단계를 먼저 재검증하므로 **0~2단계 무오류**도 고정한다.
 */
import { describe, it, expect } from "vitest";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { FIELD_JUMP_CASES, validBase } from "../../../e2e/_helpers/validation-field-jump-cases";

describe("field-jump E2E 케이스 입력", () => {
  it("바탕 폼은 0~3단계 무오류", () => {
    for (const s of [0, 1, 2, 3]) expect(collectStepIssues(s, validBase() as unknown as TransferFormData), `step ${s}`).toEqual([]);
  });

  it.each(FIELD_JUMP_CASES.map((c) => [c.field, c] as const))("%s", (_f, c) => {
    const form = c.form() as unknown as TransferFormData;
    const hit = collectStepIssues(c.step, form).find((it) => c.message.test(it.message));
    expect(hit, `메시지 ${c.message} 없음`).toBeDefined();
    expect(hit!.field).toBe(c.field);
    expect(hit!.assetIndex).toBe(c.assetIndex);
    if (c.step === 3) {
      for (const s of [0, 1, 2]) expect(collectStepIssues(s, form), `step ${s} 무오류여야 3단계에 닿는다`).toEqual([]);
    }
  });
});
