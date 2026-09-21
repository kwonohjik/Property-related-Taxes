/**
 * anchor(⑦) — 「평가액 ± 청산금」 도출 step은 **양도 대상에 따라 이름이 다르다** (P6-c-7)
 *
 * ## 🔴 종전에는 입주권에서 아예 찍히지 않았다
 *
 * `transfer-tax-redevelopment-transforms.ts`가 이 step을 `subject === "apt"`로 게이트했다.
 * 「분양가」는 완공APT의 실무 명칭이라 이름이 맞지 않아 막아 둔 것으로 보이나, 그 결과
 * **입주권 결과 화면에는 그 값의 도출이 아예 없었다**.
 *
 * 실측(청산금 **수령** · 권리가액 3억 · 청산금 1억 → 2억):
 *
 * | 축 | 200,000,000 등장 | 도출 step |
 * |---|---|---|
 * | 입주권 | 2회 — 「의제 양도가액 …」(나목) · 「안분 취득가 …」(가목) | ✗ |
 * | 완공APT | 3회 | ✅ 「분양가」 |
 *
 * 🔑 나머지 2회는 **중복이 아니다** — 각각 §166①2호 나목·가목의 **계산**이고, 이 step만이
 *    그 값이 **어디서 나왔는지**를 말한다. 그래서 step을 지우는 게 아니라 **이름을 갈랐다**.
 *
 * ## 법문 (법제처 MST 286211 · 2026-09-21 실독)
 *
 * - §166①**1호**(청산금 **납부**): 「… − (기존건물과 그 부수토지의 평가액 ＋ **납부한 청산금**) − …」
 * - §166①**2호 가목**(청산금 **수령**): 「… − (기존건물과 그 부수토지의 평가액 − **지급받은 청산금**) − …」
 *
 * 「분양가액」이라는 말은 §166 어디에도 없다. 완공APT는 실무 명칭이라 유지하고, 입주권은
 * 그 값을 **공제항으로 쓰는 호**를 가리킨다.
 *
 * ## 무엇을 고정하는가
 *
 * | # | 주장 |
 * |---|---|
 * | RS-1 | 입주권 — step이 **존재하고** 법문 용어로 적는다 |
 * | RS-2 | 완공APT — 「분양가」 그대로 (RS-1의 긍정 짝) |
 * | RS-3 | 금액은 두 축이 같다 (§166②2호가 ①2호를 준용) |
 * | RS-4 | 근거 조문이 축·방향마다 다르다 |
 * | RS-5 | 납부 방향이면 부호와 문구가 함께 바뀐다 |
 *
 * ⚠️ 종전에 이 step을 단언하는 테스트는 **저장소에 0건**이었다 — 안전망 없이 있었다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { REDEVELOPMENT } from "@/lib/tax-engine/legal-codes/transfer-house";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

const RIGHTS = 300_000_000;
const SETTLE = 100_000_000;

function run(subject: "right" | "apt", direction: "pay" | "receive" = "receive") {
  const redevelopment: RedevelopmentInfo = {
    subject,
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-10-23"),
    rightsValue: RIGHTS,
    settlementDirection: direction,
    settlementAmount: SETTLE,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    exemptionEligibleAtApproval: false,
  };
  return calculateTransferTax(
    baseTransferInput({
      propertyType: subject === "right" ? "right_to_move_in" : "redevelopment_apt",
      transferPrice: 520_000_000,
      transferDate: new Date("2023-03-02"),
      acquisitionDate: new Date("2002-04-09"),
      acquisitionPrice: 100_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      redevelopment,
    }) as TransferTaxInput,
    mockRates,
  );
}

/** 「평가액 ± 청산금」 도출 step — 두 축의 라벨을 모두 받아들인다. */
function derivationStep(subject: "right" | "apt", direction: "pay" | "receive" = "receive") {
  const label = subject === "right" ? "평가액 ± 청산금 (§166① 공제액)" : "분양가";
  return run(subject, direction).steps?.find((s) => s.label === label);
}

describe("RS-1·2 도출 step — 축마다 이름이 다르다", () => {
  /** 🔴 종전에는 이 step이 입주권에서 **아예 없었다**. */
  it("[RS-1] 입주권 — step이 존재하고 법문 용어로 적는다", () => {
    const step = derivationStep("right");
    expect(step).toBeTruthy();
    expect(step!.formula).toContain("기존건물·부수토지 평가액");
    expect(step!.formula).toContain("지급받은 청산금");
    expect(step!.formula).not.toContain("권리가액");
  });

  /** 🔴 RS-1의 **긍정 짝**. 없으면 「「분양가」를 통째로 지웠다」와 구별되지 않는다. */
  it("[RS-2] 완공APT — 「분양가」 그대로", () => {
    const step = derivationStep("apt");
    expect(step).toBeTruthy();
    expect(step!.formula).toContain("권리가액");
    expect(step!.formula).not.toContain("지급받은 청산금");
  });
});

describe("RS-3 금액은 두 축이 같다 (§166②2호 준용)", () => {
  it("[RS-3] 평가액 3억 − 수령청산금 1억 = 2억", () => {
    expect(derivationStep("right")!.amount).toBe(200_000_000);
    expect(derivationStep("apt")!.amount).toBe(200_000_000);
  });
});

describe("RS-4 근거 조문이 축·방향마다 다르다", () => {
  /** 🔑 상수를 쓴다 — 리터럴을 적으면 조문이 드리프트해도 초록이다. */
  it("[RS-4a] 입주권 + 수령 → §166①2호", () => {
    expect(derivationStep("right", "receive")!.legalBasis).toBe(REDEVELOPMENT.RIGHT_RECEIVE);
  });

  it("[RS-4b] 입주권 + 납부 → §166①1호", () => {
    expect(derivationStep("right", "pay")!.legalBasis).toBe(REDEVELOPMENT.RIGHT_PAY);
  });

  it("[RS-4c] 완공APT → §166④ (평가액 정의) 유지", () => {
    expect(derivationStep("apt")!.legalBasis).toBe(REDEVELOPMENT.EVALUATION);
  });
});

describe("RS-5 납부 방향이면 부호와 문구가 함께 바뀐다", () => {
  /**
   * 🔴 §166①1호는 「평가액 **＋** 납부한 청산금」이다. 부호만 바꾸고 문구를 「지급받은」으로
   *    두면 **법문과 반대**를 적게 된다.
   */
  it("[RS-5] 입주권 + 납부 → 「＋ 납부한 청산금」", () => {
    const step = derivationStep("right", "pay");
    expect(step!.formula).toContain("+");
    expect(step!.formula).toContain("납부한 청산금");
    expect(step!.formula).not.toContain("지급받은");
    expect(step!.amount).toBe(RIGHTS + SETTLE);
  });
});
