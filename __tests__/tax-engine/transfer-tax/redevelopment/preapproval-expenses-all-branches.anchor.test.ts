/**
 * anchor — 인가전 필요경비 차감을 **네 분기 전부**에서 세액으로 고정 (T1-06)
 *
 * ## 왜 필요한가 — 축이 한쪽으로 쏠려 있었다
 *
 * `preApprovalNecessaryExpense`의 `preApprovalExpenses` 갈래를 죽이는 뮤테이션에 대한 반응은
 * 리뷰 시점 **1/7032**, PR #1286 이후 **3/14314**다(2026-08-26 실측). 반응하는 것은
 * `right-receive-expenses-apportion.anchor.test.ts`(신고서 **표시 자기일관성**만 본다)와
 * #1286이 심은 `preapproval-expense-either-or.anchor.test.ts`뿐이다.
 *
 * 근본 원인은 fixture 쏠림이다 — 43개 중 **42개가 `preApprovalExpenses: 0`**이라 이 항이
 * 산식에 있든 없든 대부분의 테스트가 같은 값을 낸다.
 *
 * 리뷰 실측(right+pay 분기): 총납부세액 81,103,000원 ↔ 89,881,000원 (Δ 8,778,000).
 * 인가전 양도차익 170,000,000 ↔ 200,000,000.
 *
 * ## 이 anchor가 채우는 것
 *
 * `right+pay` · `right+receive` · `apt+pay` · `apt+receive` **네 분기 모두**에서
 * `preApprovalExpenses`를 비영으로 두고 **세액과 인가전 차익**을 단언한다.
 * 표시 자기일관성이 아니라 **금액**을 본다 — 표시만 보면 산식이 빠져도 열끼리는 여전히 맞는다.
 *
 * ## 조문
 *
 * · 「소득세법 시행령」 §166①1호 후단 · §166①2호 나목 — 「법 제97조제1항제2호 및 제3호 **또는**
 *   제163조제6항에 따른 필요경비」. 택일이며(#1286 E1-02가 정정), 개산공제가 0일 때
 *   `preApprovalExpenses`가 그 자리를 차지한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

const PRE_APPROVAL_EXPENSES = 30_000_000;

type Branch = { subject: "right" | "apt"; direction: "pay" | "receive" };

function redevInfo(b: Branch, preApprovalExpenses: number): RedevelopmentInfo {
  return {
    subject: b.subject,
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: b.direction,
    settlementAmount: b.direction === "pay" ? 90_000_000 : 50_000_000,
    preApprovalExpenses,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    receiveOnlyMode: false,
    // 비과세 마스킹을 배제해 **필요경비 차감만** 관측한다.
    exemptionEligibleAtApproval: false,
  } as RedevelopmentInfo;
}

function run(b: Branch, preApprovalExpenses: number) {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: b.subject === "right" ? "right_to_move_in" : "redevelopment_apt",
    transferPrice: 520_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    // 실가 모드 — 환산이면 개산공제가 켜져 택일의 반대편이 이긴다(#1286 E1-02).
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: redevInfo(b, preApprovalExpenses),
  });
  const result = calculateTransferTax(input, mockRates);
  return { result, detail: result.redevelopmentDetail! };
}

/**
 * 분기별 **총차익 감소액**.
 *
 * · 납부(`pay`) — 인가전 차익에서 전액 차감된다 ⇒ 30,000,000.
 * · 수령(`receive`) — 「소득세법 시행령」 §166①2호 **나목**이 인가전 양도차익에
 *   `(평가액 − 청산금) / 평가액`을 곱한다. 필요경비는 그 곱하기 **전**의 인가전 차익에서
 *   빠지므로 실효 차감액도 같은 비율로 줄어든다 ⇒ 30,000,000 × 250/300 = **25,000,000**.
 *
 * ⚠️ 이 5/6은 **결함이 아니다** — `right-receive-expenses-apportion.anchor.test.ts`가
 *    「차익 자체는 옳다(실효 차감액이 이미 안분값이다). 어긋나는 것은 표시 열뿐」이라고
 *    판정해 두었다.
 *
 * 🔴 **2026-08-27 — 그 판정을 완공APT 수령에 한해 뒤집었다.** 실효 차감액이 안분값이면
 *    **나머지 몫이 어디에도 안 빠진다**. 완공APT 수령 결과에는 청산금 **분할양도** 분기가
 *    같은 신고 안에 있으므로 그 몫도 여기서 차감해야 한다. 입주권 수령은 분할양도 분기가
 *    이 신고에 없어 종전 판정이 유지된다.
 */
const BRANCHES: { label: string; b: Branch; totalGainDelta: number }[] = [
  { label: "입주권 + 청산금 납부", b: { subject: "right", direction: "pay" }, totalGainDelta: 30_000_000 },
  { label: "입주권 + 청산금 수령", b: { subject: "right", direction: "receive" }, totalGainDelta: 25_000_000 },
  { label: "완공APT + 청산금 납부", b: { subject: "apt", direction: "pay" }, totalGainDelta: 30_000_000 },
  // 🔴 2026-08-27 정정 — 25,000,000 → 30,000,000 (**세액 변경**).
  //    종전에는 나목 안분분(25,000,000)만 반영되고 **나머지 5,000,000이 어디에도 차감되지
  //    않았다**(과대과세). 완공APT 수령 결과에는 **청산금 분할양도 분기(settlement)** 가
  //    같은 신고 안에 있으므로 그 몫의 필요경비도 여기서 빼야 한다
  //    (§88·§95① · 법규재산2012-358 · 명문 부존재 ⇒ 불리 적용 금지).
  //
  //    ⚠️ **입주권(right) 수령은 25,000,000 그대로다** — §166①2호는 가목+나목뿐이고
  //       분할양도 분기가 이 신고에 **없다**(별도 신고 · 사례 46). 잔여 몫은 그쪽에서 쓰인다.
  //       두 분기의 차이가 이 정정의 경계다.
  { label: "완공APT + 청산금 수령", b: { subject: "apt", direction: "receive" }, totalGainDelta: 30_000_000 },
];

describe("T1-06 · 인가전 필요경비 차감 — 네 분기 전부", () => {
  for (const { label, b, totalGainDelta } of BRANCHES) {
    it(`T1-06 [${label}]: 🔑 총 양도차익이 ${totalGainDelta.toLocaleString()}원 줄어든다`, () => {
      const zero = run(b, 0).detail.total.gain;
      const withExpense = run(b, PRE_APPROVAL_EXPENSES).detail.total.gain;
      // 종전: 42/43 fixture가 값 0이라 이 항이 빠져도 대부분이 같은 값을 냈다.
      expect(zero - withExpense).toBe(totalGainDelta);
    });

    it(`T1-06 [${label}]: 세액이 실제로 줄어든다 (표시가 아니라 금액을 본다)`, () => {
      const zero = run(b, 0).result.totalTax;
      const withExpense = run(b, PRE_APPROVAL_EXPENSES).result.totalTax;
      expect(withExpense).toBeLessThan(zero);
    });
  }

  /**
   * 🔑 **수령 분기는 필요경비를 안분한다** — 인가전 분과 청산금 분에 분양가 비율로 나뉜다
   * (`right-receive-expenses-apportion.anchor.test.ts`가 신고서 표시 측을 담당한다).
   *
   * 실측(권리가액 300,000,000 · 수령청산금 50,000,000 → 분양가 250,000,000):
   * 인가전 분 귀속 = 30,000,000 × 250/300 = **25,000,000**, 나머지 5,000,000은 청산금 분.
   *
   * 이 테스트가 있어야 위 「총액 1회」 단언이 **안분을 안 해서 맞은 것인지**
   * **안분하고도 총액이 맞는 것인지**를 구별할 수 있다.
   */
  it("T1-06 [안분]: 수령 분기는 인가전 분에 5/6만 귀속된다 (납부 분기는 전액)", () => {
    const pay = { subject: "right" as const, direction: "pay" as const };
    const receive = { subject: "right" as const, direction: "receive" as const };

    const payDelta =
      run(pay, 0).detail.preApproval.gain - run(pay, PRE_APPROVAL_EXPENSES).detail.preApproval.gain;
    const receiveDelta =
      run(receive, 0).detail.preApproval.gain -
      run(receive, PRE_APPROVAL_EXPENSES).detail.preApproval.gain;

    expect(payDelta).toBe(PRE_APPROVAL_EXPENSES);
    expect(receiveDelta).toBe(25_000_000);
    expect(receiveDelta).toBeLessThan(payDelta);
  });
});
