/**
 * anchor: §118의16④ 이자상당액 — **일수·이자율은 짝이다** (한쪽만 입력 시 차단)
 *
 * 제보 —「납부유예 이자상당액 입력 경로도 확인해줘」→「응 넣어」
 *
 * ## 실측 갭
 *
 * 엔진은 `days > 0 && rate > 0`일 때만 산출한다(`exit-tax.ts:414`). 종전에는 한쪽만 넣어도
 * 아무도 막지 않아 **그 값이 body 까지 실려 가서 조용히 무시**됐다:
 *
 * ```
 * [일수만] body days=365 rate=undefined  →  서식 31-E3: (행 없음)
 * ```
 *
 * 사용자는 365를 입력했는데 서식에도 결과 카드에도 흔적이 없다. 이 저장소가 금지해 온
 * 「혼합 전수입력」 패턴이다(memory `feedback_silent_omission_full_input_enforcement`).
 *
 * ## ⚠️ Zod(⑫)에는 넣지 않는다 — 의도된 비대칭
 *
 * 종전 저장 이력에는 한쪽만 있는 레코드가 있을 수 있다(그때는 통과했으므로). Zod 까지 막으면
 * **이력 복원 → 계산 실패**가 되어 사용자가 화면에서 고칠 기회를 잃는다. ⑧ validate 는 폼
 * 화면에서 필드별 메시지로 돌려주므로 여기가 맞는 자리다.
 *
 * 🔑 이것은 「UI 통과 ↔ validate 차단」 모순이 **아니다** — UI 가 두 칸을 나란히 제시하고
 *   validate 가 그 짝을 요구하는 것은 정상적인 필수 관계다.
 */

import { describe, it, expect } from "vitest";
import { validateStep3ExitTax } from "@/lib/calc/stock-transfer-tax-validate-exit";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

function form(over: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "exit_tax",
    etDeferralRequested: true,
    ...over,
  } as StockTransferFormData;
}

const interestErrors = (f: StockTransferFormData) =>
  validateStep3ExitTax(f).filter((e) => e.field.startsWith("etDeferralInterest"));

describe("§118의16④ 이자상당액 — 일수·이자율 짝 강제", () => {
  it("DI-1: 둘 다 비우면 통과한다 (선택 입력 — 미산출 안내로 떨어진다)", () => {
    expect(interestErrors(form())).toHaveLength(0);
  });

  it("DI-2: 둘 다 채우면 통과한다", () => {
    expect(
      interestErrors(
        form({ etDeferralInterestDays: "365", etDeferralInterestDailyRate: "0.000022" }),
      ),
    ).toHaveLength(0);
  });

  it("DI-3: 일수만 넣으면 **이자율**을 가리키는 오류가 난다", () => {
    const errs = interestErrors(form({ etDeferralInterestDays: "365" }));
    expect(errs).toHaveLength(1);
    expect(errs[0].field).toBe("etDeferralInterestDailyRate");
    expect(errs[0].severity).toBe("error");
  });

  it("DI-4: 이자율만 넣으면 **일수**를 가리키는 오류가 난다", () => {
    const errs = interestErrors(form({ etDeferralInterestDailyRate: "0.000022" }));
    expect(errs).toHaveLength(1);
    expect(errs[0].field).toBe("etDeferralInterestDays");
  });

  it("DI-5: 납부유예 미신청이면 짝 규칙을 적용하지 않는다 (칸 자체가 화면에 없다)", () => {
    expect(
      interestErrors(form({ etDeferralRequested: false, etDeferralInterestDays: "365" })),
    ).toHaveLength(0);
  });
});
