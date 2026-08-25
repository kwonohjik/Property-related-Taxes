/**
 * `E3-01` anchor — §166 재개발 분기(subject="apt")에 **§89①3호가목 1세대1주택 비과세가 없다**
 *
 * ⚠️ **이 anchor는 수정 전 실패한다** (E3-01 미해소 상태 기준).
 *
 * ── 결함 ──────────────────────────────────────────────────────────────────────
 * `transfer-tax.ts` STEP 0.65(:237~:299)가 `calculateRedevelopmentTax`로 **조기 반환**하면서
 * STEP 1의 `checkExemption`을 건너뛴다. 그런데 재개발 분기
 * (`transfer-tax-redevelopment.ts:120` 부근)는 §95③ **12억 초과 안분
 * (`applyHighValueAllocation`)만** 구현하고, 그 전제인 **비과세 자체(12억 이하 전액)** 는
 * subject="apt" 경로에 아예 없다.
 *
 * 결과적으로 ① 12억 **이하** 구간이 전액 과세되고, ② 12억을 1원만 넘기면
 * `taxableRatio = 1 / 1,200,000,001 ≈ 8.3e-10`이 되어 세액이 0으로 떨어지는 **불연속**이 생긴다.
 * 입주권 경로(`applyOneRightExemption` — subject="right")는 전액 비과세를 구현해 두었으므로
 * 두 경로가 정반대로 비대칭이다.
 *
 * ── 근거 조문 (KoreanLaw MCP 원문 확인 2026-08-25 · 소득세법 MST 280405 · 시행령 MST 286211) ─
 *
 * · **소득세법 §89①3호 각 목 외의 부분** — 「다음 각 목의 어느 하나에 해당하는 주택(주택 및
 *   이에 딸린 토지의 **양도 당시 실지거래가액의 합계액이 12억원을 초과하는 고가주택은 제외**한다)
 *   과 이에 딸린 토지 … 의 양도로 발생하는 소득」에 대해서는 **양도소득세를 과세하지 아니한다**.
 *   ⇒ 12억원 **초과**가 제외 요건이므로 **12억원 정확히**는 비과세 대상이다(경계 포함).
 * · **소득세법 §89①3호가목** — 「1세대가 1주택을 보유하는 경우로서 대통령령으로 정하는 요건을
 *   충족하는 주택」.
 * · **소득세법 시행령 §154①** — 「법 제89조제1항제3호가목에서 "대통령령으로 정하는 요건"이란
 *   1세대가 양도일 현재 국내에 1주택을 보유하고 있는 경우로서 해당 주택의 **보유기간이 2년**
 *   … 이상인 것[취득 당시에 … **조정대상지역**에 있는 주택의 경우에는 … 보유기간이 2년 이상이고
 *   그 보유기간 중 **거주기간이 2년 이상**인 것]을 말한다」.
 * · **소득세법 시행령 §154⑧1호** — 「제1항에 따른 거주기간 또는 보유기간을 계산할 때 다음 각 호의
 *   기간을 **통산**한다. 1. 거주하거나 보유하는 중에 소실ㆍ무너짐ㆍ**노후 등으로 인하여 멸실되어
 *   재건축한 주택**인 경우에는 그 멸실된 주택과 재건축한 주택에 대한 거주기간 및 보유기간」.
 *   ⇒ 재개발·재건축으로 완공된 신축주택의 보유·거주기간은 **종전주택분과 통산**한다.
 *      엔진도 같은 모델을 쓴다 — 재개발 분기의 `acquisitionDate`는 **종전주택 취득일**이고
 *      보유월수를 거기서부터 센다(본 anchor 실측 `holdingMonths` 190 = 2007-04-09→2023-02-16).
 * · **소득세법 §95③ · 시행령 §160①** — 「제89조제1항제3호에 따라 양도소득의 비과세대상에서
 *   제외되는 **고가주택**」의 양도차익·장기보유특별공제액은 `× (양도가액 − 12억원) / 양도가액`.
 *   ⇒ 이 안분은 **12억원을 초과할 때 비로소** 적용되는 후속 규정이지, 12억 이하 비과세를
 *      대체하는 규정이 아니다. 현행 코드는 이 후속 규정만 구현했다.
 * · **소득세법 시행령 §166** — 재개발·재건축 자산의 **양도차익 계산** 규정일 뿐,
 *   §89①3호의 비과세 적용을 배제하는 규정이 아니다. 완공된 신축APT는 §89①3호가목의 「주택」이다
 *   (§89②의 「주택과 조합원입주권 또는 분양권을 함께 보유」 배제도, 본 사안은 세대가 신축주택
 *   1채만 보유하므로 해당하지 않는다).
 *
 * ── 입력 사실관계 (재개발 완공 신축APT · 1세대1주택) ─────────────────────────
 *   · 종전주택 취득 2007-04-09 · 실지거래가액 450,000,000 (환산 아님)
 *   · 관리처분계획 인가 2013-10-23 (도시 및 주거환경정비법 §74) · 권리가액 600,000,000
 *   · 청산금 **납부** 100,000,000
 *   · 완공 신축APT 양도 2023-02-16 (보유 190개월 = 15년 10개월)
 *   · 1세대1주택 (isOneHousehold=true · householdHousingCount=1) · 거주 66개월 (5년 6개월)
 *   · 취득 당시 조정대상지역 아님 (§154① 거주요건 자체가 걸리지 않으나 거주 66개월로 충족)
 *   ⇒ 보유 2년·거주 2년 요건을 모두 넘긴다. 대조군(일반주택)에서 엔진 스스로
 *      `isExempt: true · exemptReason "1세대1주택 비과세"`를 내는 것으로 확인된다.
 *
 * ── 현행 실측값 (2026-08-25 · `makeMockRates()` 기준) ────────────────────────
 *   | 양도가액        | 재개발APT `totalTax` | `isExempt` | 대조군 일반주택 `totalTax` |
 *   |-----------------|----------------------|------------|----------------------------|
 *   | 1,000,000,000   | **59,785,000**       | false      | 0 (isExempt=true)          |
 *   | 1,200,000,000   | **98,241,000**       | false      | 0 (isExempt=true)          |
 *   | 1,200,000,001   | 0                    | false      | 0 (isPartialExempt=true)   |
 *   ⇒ 12억 → 12억+1원에서 **98,241,000원이 1원 차이로 사라진다**(불연속).
 *
 * ── 기대값 (법령상 옳은 값) ──────────────────────────────────────────────────
 *   12억 **이하**: §89①3호가목 전액 비과세 ⇒ `isExempt === true` · `totalTax === 0`.
 *   12억 초과 1원: §95③·영 §160① 안분으로 과세대상 양도차익이 사실상 0 ⇒ 세액 ≈ 0.
 *   ⇒ 경계에서 세액이 **연속**이어야 한다(법령상 두 값 모두 0이므로 차이 0).
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

const HIGH_VALUE_THRESHOLD = 1_200_000_000;

/** 재개발 완공 신축APT (subject="apt") — 1세대1주택 요건 충족 */
function redevAptInput(transferPrice: number): TransferTaxInput {
  const redevelopment: RedevelopmentInfo = {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2013-10-23"),
    rightsValue: 600_000_000,
    settlementDirection: "pay",
    settlementAmount: 100_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
  };
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2007-04-09"),
    acquisitionPrice: 450_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 66,
    redevelopment,
  });
}

/**
 * 대조군 — **세대·기간 사실관계는 동일**하고 자산 종류만 일반 주택.
 * 취득가액 550,000,000 = 종전주택 실가 450,000,000 + 납부청산금 100,000,000
 * ⇒ 양도가액 10억에서 양도차익 450,000,000으로 재개발 경로 합계와 정확히 같다.
 */
function plainHousingInput(transferPrice: number): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2007-04-09"),
    acquisitionPrice: 550_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 66,
  });
}

describe("E3-01 — 재개발 완공 신축APT §89①3호가목 1세대1주택 비과세", () => {
  const redev10 = calculateTransferTax(redevAptInput(1_000_000_000), mockRates);
  const redev12 = calculateTransferTax(redevAptInput(HIGH_VALUE_THRESHOLD), mockRates);
  const redev12plus1 = calculateTransferTax(redevAptInput(HIGH_VALUE_THRESHOLD + 1), mockRates);

  const plain10 = calculateTransferTax(plainHousingInput(1_000_000_000), mockRates);
  const plain12 = calculateTransferTax(plainHousingInput(HIGH_VALUE_THRESHOLD), mockRates);

  it("A3-1: 양도가액 10억(12억 이하) — 전액 비과세 (현행 isExempt=false · 59,785,000원 과세)", () => {
    expect(redev10.isExempt).toBe(true);
    expect(redev10.totalTax).toBe(0);
  });

  it("A3-2: 양도가액 12억(경계 — 「초과」 아님) — 전액 비과세 (현행 98,241,000원 과세)", () => {
    expect(redev12.isExempt).toBe(true);
    expect(redev12.totalTax).toBe(0);
  });

  it("A3-3: 대조군 — 동일 세대·기간 사실관계의 일반주택은 12억 이하에서 비과세다", () => {
    // 현행에서도 통과한다 — 두 경로의 **비대칭**을 고정하는 회귀 가드.
    expect(plain10.isExempt).toBe(true);
    expect(plain10.totalTax).toBe(0);
    expect(plain12.isExempt).toBe(true);
    expect(plain12.totalTax).toBe(0);
  });

  it("A3-4: 재개발 경로와 일반주택 경로의 세액이 12억 이하에서 일치한다", () => {
    expect(redev10.totalTax).toBe(plain10.totalTax);
    expect(redev12.totalTax).toBe(plain12.totalTax);
  });

  it("A3-5: 12억 경계 불연속 부재 — 12억과 12억+1원의 세액 차이가 미미하다 (현행 98,241,000 → 0)", () => {
    expect(Math.abs(redev12.totalTax - redev12plus1.totalTax)).toBeLessThanOrEqual(1_000);
  });
});
