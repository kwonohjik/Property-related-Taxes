/**
 * SC-6-d — 「안분 법인세 상당액」 echo가 엔진 leaf와 **같은 값**을 보인다.
 *
 * 종전에는 이 칸이 영 §34의5④2호가목 산식(공제·감면 차감 → min(거래이익, 소득금액) → 나눗셈)을
 * 손으로 다시 적고 있었다. 두 구현의 차액은 실측 0원이었지만 — 결함은 «틀린 값»이 아니라
 * **장래 드리프트에 대한 안전망 0**이었다. 엔진 산식이 바뀌어도 이 칸만 옛 값으로 남고
 * vitest·E2E 어디도 빨개지지 않는다(단언 0건 · data-testid 0건이었다).
 *
 * ⇒ UI가 엔진 leaf `apportionCorporateTax`를 직접 부르도록 되돌렸고, 이 파일이 그 배선을 고정한다.
 *   단언은 **엔진 호출 결과와의 동치**로 쓴다 — 리터럴만 박으면 「UI가 여전히 손산식을 쓰는데
 *   우연히 같은 값」인 경우를 구별하지 못한다(그게 바로 종전 상태였다).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { SpecificCorpFields } from "@/components/calc/deemed-gift/other-forms";
import { INITIAL_DEEMED } from "@/components/calc/deemed-gift/deemed-form-state";
import { apportionCorporateTax } from "@/lib/tax-engine/gift-deemed/specific-corp";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";

afterEach(cleanup);

/** auto 안분 모드 + 4개 입력칸을 채운 상태 */
function renderAuto(over: Record<string, unknown> = {}) {
  const form = {
    ...INITIAL_DEEMED,
    scMode: "single" as const,
    scCorporateTaxMode: "auto" as const,
    scTransactionType: "gratuitous" as const,
    scTransactionBenefit: "3000000000",
    scCorpTaxAssessed: "780000000",
    scCorpTaxLandTransfer: "0",
    scCorpTaxDeduction: "0",
    scCorpIncome: "4000000000",
    ...over,
  };
  render(<SpecificCorpFields form={form} set={() => {}} />);
  return form;
}

const engineValue = (benefit: number, assessed: number, income: number, land = 0, credit = 0) =>
  apportionCorporateTax({
    transactionBenefit: benefit,
    annualIncome: income,
    corporateTaxComputed: assessed,
    corporateTaxOnLandTransfer: land,
    corporateTaxCredit: credit,
  } as SpecificCorpInput);

describe("SC-6-d — 안분 법인세 echo ↔ 엔진 leaf 단일 진실", () => {
  it("[E-0] echo 칸이 렌더되고 엔진 값과 같다 (585,000,000)", () => {
    renderAuto();
    const echo = screen.getByTestId("sc-corp-tax-echo");
    const expected = engineValue(3_000_000_000, 780_000_000, 4_000_000_000);
    expect(expected).toBe(585_000_000); // 전제 — 교재 사례2의 안분값
    expect(echo.textContent).toBe(expected.toLocaleString());
  });

  it("[E-1] min(거래이익, 소득금액) 상한 — 거래이익이 소득금액을 넘으면 비율이 1로 막힌다", () => {
    // 엔진의 `Math.min(transactionBenefit, annualIncome)`을 지우면 여기서 갈린다.
    cleanup();
    renderAuto({ scTransactionBenefit: "9000000000" }); // 90억 > 소득 40억
    const expected = engineValue(9_000_000_000, 780_000_000, 4_000_000_000);
    expect(expected).toBe(780_000_000); // 전액 — 비율 1
    expect(screen.getByTestId("sc-corp-tax-echo").textContent).toBe(expected.toLocaleString());
  });

  it("[E-2] §55의2 토지등 양도소득 법인세액·공제감면이 산출세액에서 차감된다", () => {
    // 영 §34의5④2호가목의 괄호는 확인적 문구가 아니라 실질 차감이다(§55① 본문이 「합한 금액」).
    cleanup();
    renderAuto({ scCorpTaxLandTransfer: "80000000", scCorpTaxDeduction: "100000000" });
    const expected = engineValue(3_000_000_000, 780_000_000, 4_000_000_000, 80_000_000, 100_000_000);
    expect(expected).toBe(450_000_000); // (780 − 80 − 100) × 30억/40억
    expect(screen.getByTestId("sc-corp-tax-echo").textContent).toBe(expected.toLocaleString());
  });

  it("[E-3] 음성 짝 — direct 모드에서는 echo 칸 자체가 없다", () => {
    cleanup();
    render(
      <SpecificCorpFields
        form={{ ...INITIAL_DEEMED, scMode: "single", scCorporateTaxMode: "direct" } as never}
        set={() => {}}
      />,
    );
    expect(screen.queryByTestId("sc-corp-tax-echo")).toBeNull();
  });
});
