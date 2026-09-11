/**
 * anchor: 납부지연가산세 **토글 ON인데 미납액이 비었다** — 상속·증여 공용 차단
 * (별건 정리 2026-09-11).
 *
 * ## 무엇이 결함이었나
 *
 * ④(`latePaymentPart`)는 빈 칸이면 키를 넣지 않고, 엔진(`calcInheritanceGiftLatePayment`)은
 * `unpaidTax <= 0`이면 `LATE_PAYMENT_ZERO`를 돌려준다. 토글을 켜 두고 금액을 비우면
 * **차단도 경고도 없이 가산세가 0원**이 된다 — 「켰는데 안 잡힌다」.
 *
 * 종전 게이트는 **금액**이 축이었다(`unpaidTax > 0 && !paymentDeadline`). 금액 자체가 비면
 * 조건이 성립하지 않아 그대로 통과했다.
 *
 * ## 모집단은 2다 — 3이 아니었다
 *
 * 착수 전에는 「상속·증여·주식 공유 갭」으로 적어 두었으나, 실측하니 **주식에는 토글이 없다**
 * (`PenaltyDetailBlock`은 칸이 항상 떠 있고 hint 가 「0이면 계산하지 않습니다」라고 명시한다 —
 * 의도된 설계). 양도는 결정세액에서 미납액을 파생하고 route 가 0을 전액으로 채운다.
 * ⇒ 이 축이 성립하는 곳은 상속·증여 **둘뿐**이다.
 *
 * ## 부정형 anchor 에는 양성 쌍둥이가 필요하다
 *
 * 「막는다」만 재면 게이트를 통째로 지워도 다른 메시지가 나와 통과할 수 있다. A-0 이
 * **결함이 실재함**(가드 없이는 0원이 된다)을 먼저 재고, 그 위에 차단을 얹는다.
 * ([[feedback_negative_anchor_needs_positive_twin]])
 */
import { describe, it, expect } from "vitest";
import {
  validateLatePaymentFields,
  buildFilingPenaltyInput,
  type FilingPenaltyFormFields,
} from "@/lib/calc/inheritance-gift-filing-penalty-input";
import { calcInheritanceGiftLatePayment } from "@/lib/tax-engine/inheritance-gift-penalty";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM as GIFT_INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import type { FormState as GiftFormState } from "@/components/calc/gift-tax-form-shared";

const BASE: FilingPenaltyFormFields = {
  lateFilingDate: "",
  priorAssessmentNotified: false,
  isUnderReported: false,
  originalFiledTax: "",
  underReportExclusion: "",
  penaltyReason: "normal",
  fraudulentPortion: "",
  corporateAdjustmentByFraud: false,
  applyLatePaymentPenalty: false,
  unpaidTax: "",
  paymentDeadline: "",
  actualPaymentDate: "",
  paidOnTimeThenRevalued: false,
};
const F = (p: Partial<FilingPenaltyFormFields>) => ({ ...BASE, ...p });

// ════════════════════════════════════════════════════
// A. 양성 쌍둥이 — 가드가 없으면 실제로 0원이 된다
// ════════════════════════════════════════════════════

describe("[LP-A] 결함 실재 — 토글 ON + 미납액 공란은 조용히 0원", () => {
  it("A-0: ④가 unpaidTax 키를 빼고, 엔진이 0을 돌려준다", () => {
    const built = buildFilingPenaltyInput(
      "on_time",
      F({ applyLatePaymentPenalty: true, unpaidTax: "", paymentDeadline: "2026-01-31" }),
    );
    // 토글 ON이라 납부지연 축 자체는 살아 있는데(기한은 실렸다) 금액만 없다.
    expect(built.filingPenalty?.paymentDeadline).toBe("2026-01-31");
    expect(built.filingPenalty?.unpaidTax).toBeUndefined();

    const res = calcInheritanceGiftLatePayment(
      built.filingPenalty!,
      new Date("2026-06-30"),
    );
    expect(res.penalty).toBe(0);
    expect(res.elapsedDays).toBe(0);
  });

  it("A-1: 금액을 채우면 같은 입력에서 가산세가 실제로 발생한다 (대조군)", () => {
    const built = buildFilingPenaltyInput(
      "on_time",
      F({
        applyLatePaymentPenalty: true,
        unpaidTax: "10000000",
        paymentDeadline: "2026-01-31",
      }),
    );
    const res = calcInheritanceGiftLatePayment(
      built.filingPenalty!,
      new Date("2026-06-30"),
    );
    expect(res.penalty).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════
// B. 공용 leaf
// ════════════════════════════════════════════════════

describe("[LP-B] validateLatePaymentFields — 공용 leaf", () => {
  it("B-1: 토글 ON + 미납액 공란 → 차단", () => {
    const err = validateLatePaymentFields(F({ applyLatePaymentPenalty: true }));
    expect(err).toContain("미납·과소납부세액을 입력하세요");
    expect(err).toContain("§47의4①1호");
  });

  it("B-2: 토글 ON + 미납액 0 → 차단 (0은 「계산하겠다」와 모순이다)", () => {
    const err = validateLatePaymentFields(
      F({ applyLatePaymentPenalty: true, unpaidTax: "0" }),
    );
    expect(err).toContain("미납·과소납부세액을 입력하세요");
  });

  it("B-3: 토글 ON + 금액만 → 기한을 요구한다", () => {
    const err = validateLatePaymentFields(
      F({ applyLatePaymentPenalty: true, unpaidTax: "10000000" }),
    );
    expect(err).toContain("법정납부기한을 입력하세요");
  });

  it("B-4: 양성 쌍둥이 — 둘 다 채우면 통과", () => {
    expect(
      validateLatePaymentFields(
        F({
          applyLatePaymentPenalty: true,
          unpaidTax: "10000000",
          paymentDeadline: "2026-01-31",
        }),
      ),
    ).toBeNull();
  });

  it("B-5: 대조군 — 토글 OFF면 두 칸이 비어도 통과", () => {
    expect(validateLatePaymentFields(F({ applyLatePaymentPenalty: false }))).toBeNull();
  });
});

// ════════════════════════════════════════════════════
// C. 증여 배선 — leaf 직접 호출이 아니라 ⑧ 진입점으로 잰다
// ════════════════════════════════════════════════════

describe("[LP-C] 증여 ⑧ 배선 — validateStep(3) 이 leaf 를 부른다", () => {
  const G = (patch: Partial<GiftFormState>): GiftFormState =>
    ({ ...GIFT_INITIAL_FORM, ...patch }) as GiftFormState;

  it("C-1: 토글 ON + 미납액 공란 → validateStep 이 차단한다", () => {
    const err = validateStep(3, G({ applyLatePaymentPenalty: true, unpaidTax: "" }));
    expect(err).toContain("미납·과소납부세액을 입력하세요");
  });

  it("C-2: 양성 쌍둥이 — 둘 다 채우면 이 축으로는 막지 않는다", () => {
    const err = validateStep(
      3,
      G({
        applyLatePaymentPenalty: true,
        unpaidTax: "10000000",
        paymentDeadline: "2026-01-31",
      }),
    );
    expect(err ?? "").not.toContain("미납·과소납부세액을 입력하세요");
    expect(err ?? "").not.toContain("법정납부기한을 입력하세요");
  });
});
