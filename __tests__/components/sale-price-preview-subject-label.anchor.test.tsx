/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — ③-b 미리보기는 **양도 대상에 따라 이름이 다르다** (P6-c-6)
 *
 * ## 🔴 계획서의 🟠가 틀렸다 — 게이트를 넣었으면 결함이 됐다
 *
 * §35.6은 「③-b `SalePriceTotalPreviewCard`도 `!isRightSubject` 게이트가 없다」를 🟠로
 * 남겼다. 형제 카드 ③-a·③-c에는 있으니 누락처럼 보였다. **실측이 뒤집었다**:
 *
 * | 축 | 세액 반영 | 결과 화면(⑦) |
 * |---|---|---|
 * | 입주권 | ✅ 청산금 1억→0.5억에 **11,733,334원** 차이 | ✗ **없음** |
 * | 완공APT | ✅ | ✅ 「분양가」 |
 *
 * ⑦(`transfer-tax-redevelopment-transforms.ts`)이 「분양가」 step을 `subject === "apt"`로
 * 게이트한다. ⇒ **입주권에서는 이 카드가 그 값의 유일한 표시 경로다.** 감췄다면 세액을
 * 가르는 값이 화면 어디에도 없게 됐다(memory `feedback_computation_meta_discarded`).
 *
 * ## 진짜 문제는 **이름**이었다
 *
 * 「분양가액」은 §166 법문 어디에도 없다. 입주권 양도자는 분양받은 것이 없다 —
 * 조합원입주권을 판 것이고, 그 값은 **§166①2호 가목의 공제액**이다:
 *
 * > 가. [양도가액 − (기존건물과 그 부수토지의 평가액 − **지급받은 청산금**) − 법 §97①2호·3호에
 * >    따른 필요경비]
 *
 * 완공APT(§166②2호)는 「제1항제2호에 따른 가액」으로 **같은 산식을 준용**한다 —
 * 값은 같고 **이름과 근거 조문만** 갈린다. (법제처 실독 2026-09-21 · MST 286211)
 *
 * ## 무엇을 고정하는가
 *
 * | # | 주장 |
 * |---|---|
 * | SP-1 | 입주권 — 법문 용어로 적고 「분양가액」을 쓰지 않는다 |
 * | SP-2 | 완공APT — 「분양가액」 그대로 (SP-1의 긍정 짝) |
 * | SP-3 | 🔴 **입주권에서도 카드가 렌더된다** — 감추면 안 된다 |
 * | SP-4 | 값은 두 축이 **같다** (§166②2호가 ①2호를 준용) |
 * | SP-5 | 근거 조문 인용이 축마다 다르다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SalePriceTotalPreviewCard } from "@/components/calc/transfer/RedevelopmentBlockCards";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { REDEVELOPMENT } from "@/lib/tax-engine/legal-codes/transfer-house";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

/**
 * 🔴 **`legalBasis`를 직접 본다** — `label`만 단언하면 **대리 지표**다(뮤테이션 M4가
 *    SURVIVED해서 알았다). 모달이 실제로 여는 조문이 뒤바뀌어도 화면 배지 글자는 그대로라
 *    초록으로 남는다(memory `feedback_guard_uses_proxy_not_the_claim`).
 */
vi.mock("@/components/ui/law-article-modal", () => ({
  LawArticleModal: ({ legalBasis, label }: { legalBasis: string; label: string }) => (
    <button data-testid="law-modal" data-legal-basis={legalBasis}>
      {label}
    </button>
  ),
}));

const legalBasisOf = () =>
  screen.getByTestId("law-modal").getAttribute("data-legal-basis");

afterEach(cleanup);

/** 권리가액 3억 − 청산금 1억 = 2억 (probe와 같은 시료). */
function asset(subject: "right" | "apt"): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: subject === "right" ? "right_to_move_in" : "redevelopment_apt",
    redevSubject: subject,
    redevSettlementDirection: "receive",
    redevRightsValue: "300,000,000",
    redevSettlementAmount: "100,000,000",
  };
}

const cardText = () =>
  (screen.getByTestId("redev-sale-price-preview").textContent ?? "").replace(/\s+/g, " ");

describe("SP-1·2 이름이 축마다 다르다", () => {
  it("[SP-1] 입주권 — 법문 용어로 적고 「분양가액」을 쓰지 않는다", () => {
    render(<SalePriceTotalPreviewCard asset={asset("right")} />);
    const t = cardText();
    expect(t).toContain("§166①2호 가목 공제액");
    expect(t).toContain("지급받은 청산금");
    expect(t).not.toContain("분양가액");
  });

  /** 🔴 SP-1의 **긍정 짝**. 없으면 「「분양가액」을 통째로 지웠다」와 구별되지 않는다. */
  it("[SP-2] 완공APT — 「분양가액」 그대로", () => {
    render(<SalePriceTotalPreviewCard asset={asset("apt")} />);
    const t = cardText();
    expect(t).toContain("분양가액");
    expect(t).not.toContain("§166①2호 가목 공제액");
  });
});

describe("SP-3 입주권에서도 렌더된다 — 감추면 안 된다", () => {
  /**
   * 🔴 계획서 🟠대로 `!isRightSubject`를 넣었다면 이 단언이 깨진다. ⑦이 입주권에서
   *    「분양가」 step을 찍지 않으므로 이 카드가 **유일한 표시 경로**다.
   */
  it("[SP-3] 입주권 카드가 존재하고 값을 보여 준다", () => {
    render(<SalePriceTotalPreviewCard asset={asset("right")} />);
    expect(screen.getByTestId("redev-sale-price-preview")).toBeTruthy();
    expect(cardText()).toContain("200,000,000");
  });
});

describe("SP-4 값은 두 축이 같다 (§166②2호 준용)", () => {
  it("[SP-4] 같은 입력에 같은 결과", () => {
    render(<SalePriceTotalPreviewCard asset={asset("right")} />);
    const rightValue = cardText().includes("200,000,000");
    cleanup();
    render(<SalePriceTotalPreviewCard asset={asset("apt")} />);
    const aptValue = cardText().includes("200,000,000");
    expect(rightValue).toBe(true);
    expect(aptValue).toBe(true);
  });
});

describe("SP-5 근거 조문이 축마다 다르다", () => {
  /** 🔑 상수를 쓴다 — 문자열 리터럴을 여기 적으면 조문이 드리프트해도 초록이다. */
  it("[SP-5a] 입주권 → §166①2호", () => {
    render(<SalePriceTotalPreviewCard asset={asset("right")} />);
    expect(REDEVELOPMENT.RIGHT_RECEIVE).toBe("소득세법 시행령 §166 ① 2호");
    expect(legalBasisOf()).toBe(REDEVELOPMENT.RIGHT_RECEIVE);
  });

  it("[SP-5b] 완공APT → §166②2호", () => {
    render(<SalePriceTotalPreviewCard asset={asset("apt")} />);
    expect(REDEVELOPMENT.APT_RECEIVE).toBe("소득세법 시행령 §166 ② 2호");
    expect(legalBasisOf()).toBe(REDEVELOPMENT.APT_RECEIVE);
  });
});

describe("SP-6 축 판정은 ④·엔진과 **같은 술어**를 쓴다", () => {
  /**
   * 🔴 두 술어가 **갈리는 시료**다 — 뮤테이션 M5(손술어 `assetKind === "right_to_move_in"`로
   *    갈아타기)가 SURVIVED해서 추가했다. 종전 시료는 둘이 항상 일치해 구별력이 0이었다.
   *
   * `resolveRedevSubject`는 `redevSubject`를 **우선**한다(`redev-field-scope.ts`) —
   * ④ `buildRedevelopmentPayload`와 엔진 `redevInfo.subject`가 그 값을 쓰므로, 화면이
   * 손술어로 갈라지면 **엔진은 완공APT로 계산하는데 화면은 입주권 이름**을 적는다.
   */
  it("[SP-6] `redevSubject:\"apt\"` + `assetKind:\"right_to_move_in\"` → 완공APT로 읽는다", () => {
    render(
      <SalePriceTotalPreviewCard
        asset={{ ...asset("right"), redevSubject: "apt" }}
      />,
    );
    const t = cardText();
    expect(t).toContain("분양가액");
    expect(t).not.toContain("§166①2호 가목 공제액");
    expect(legalBasisOf()).toBe(REDEVELOPMENT.APT_RECEIVE);
  });
});
