/**
 * E1-01 anchor — 토지 출자 + **완공 신축APT** 양도 + 환산취득가 조합이
 *                §166①1호(입주권) 산식으로 오라우팅되어 §166②1호 안분·§166⑤2호 LTHD가 통째로 사라진다.
 *
 * ── 결함 ────────────────────────────────────────────────────────────────────
 * `lib/tax-engine/redevelopment.ts:181` 의 분기 조건이
 *   `originalAssetType === "land" && useEstimatedAcquisition === true`
 * 만 보고 `subject`(양도 대상)를 검사하지 않는다. 바로 위 주석(:178)은
 * 「사례 37 — 토지 출자 **입주권** + 환산취득가 분기」라고 입주권 전용임을 명시하는데
 * 조건에 그 축이 빠져 있다. 그 결과 `subject: "apt"`(관리처분계획등에 따라 취득한
 * 신축주택 양도)여도 환산 모드이기만 하면 `runLandContribEstimated`가 잡아
 * §166①1호(입주권) 구조 — 인가전 분만 LTHD, 인가후 분 LTHD 0 — 으로 계산된다.
 * 즉 **취득가액 산정 방식(실가/환산) 토글 하나가 §166 적용 항(①↔②)을 바꾼다**.
 *
 * ── 근거 조문 (KoreanLaw 원문 확인 2026-08-25, 소득세법 시행령 MST 286211) ──
 *  · 시행령 §166① : 「…기존건물과 그 부수토지를 제공(**건물 또는 토지만을 제공한 경우를 포함**한다)하고
 *      취득한 **입주자로 선정된 지위를 양도**하는 경우」 ⇒ 적용 축은 「출자 자산」이 아니라 **양도 대상**이다.
 *      토지만 출자해도 ①이 자동 적용되는 것이 아니다.
 *  · 시행령 §166②   : 「…관리처분계획등에 따라 취득한 **신축주택 및 그 부수토지를 양도**하는 경우
 *      실지거래가액에 의한 양도차익은 다음 각 호의 산식에 따라 계산한다」
 *  · 시행령 §166②1호 : 청산금납부분양도차익 = 인가후양도차익 × 납부청산금 ÷ (평가액 + 납부청산금)
 *                      기존건물분양도차익  = 인가후양도차익 × 평가액 ÷ (평가액 + 납부청산금) + 인가전양도차익
 *  · 시행령 §166③   : 「**제1항 및 제2항을 적용할 때** 기존건물과 그 부수토지의 취득가액을 확인할 수 없는
 *      경우에는 다음 산식을 적용하여 계산한 가액에 따른다」
 *      ⇒ 환산은 ①·② 안에서 **취득가액을 대체**하는 규정이지 별개의 산정 체계가 아니다.
 *        「환산이면 ①, 실가면 ②」로 갈릴 근거가 조문에 없다.
 *  · 시행령 §166⑤2호 가목 : 청산금납부분 LTHD 보유기간 = **관리처분계획등 인가일 ~ 신축주택 양도일**
 *  · 시행령 §166⑤2호 나목 : 기존건물분   LTHD 보유기간 = **기존건물 취득일 ~ 신축주택 양도일**
 *      (현행 오라우팅은 §166⑤1호 「취득일 ~ 인가일」을 적용해 인가일 이후 보유기간이 통째로 사라진다.)
 *
 * ── 입력 사실관계 (양쪽 공통) ───────────────────────────────────────────────
 *   자산 종류 재개발APT(subject="apt") · 출자 자산 토지 · 청산금 **납부** 300,000,000
 *   취득 2007-04-09 · 관리처분인가 2013-10-23 · 양도 2023-02-16
 *   양도가액 1,500,000,000 · 권리가액(§166④1호) 650,000,000 · 1세대1주택 아님(세대 2주택)
 *   [환산 모드] 취득시 개별공시지가 200,000,000 / 인가시 500,000,000
 *              → §166③ 환산취득가 = floor(650,000,000 × 200,000,000 / 500,000,000) = 260,000,000
 *              → §163⑥ 개산공제   = floor(200,000,000 × 3%)                        =   6,000,000
 *   [실가 대조군] 취득가액 266,000,000 (= 환산 260,000,000 + 개산공제 6,000,000)
 *
 * ── ⚠️ 대조군 유효성 검산 (판별력의 전제) ──────────────────────────────────
 *   실가 취득가액을 266,000,000으로 맞춘 이유는 **인가전 양도차익을 두 경로에서 동일**하게
 *   만들기 위해서다. 실측 확인(probe, 2026-08-25):
 *     · 환산: 인가전 차익 = 650,000,000 − 260,000,000 − 6,000,000 = 384,000,000
 *     · 실가: 인가전 차익 = 650,000,000 − 266,000,000             = 384,000,000  ✅ 동일
 *     · 총 양도차익도 양쪽 **934,000,000** 동일 (§166②1호 안분은 취득가액에 의존하지 않는다 —
 *       분모 분양가 = 권리가액 650,000,000 + 청산금 300,000,000 = 950,000,000)
 *   ⇒ 두 경로의 **유일한 차이는 §166 적용 항(①↔②)과 그에 따른 §166⑤ LTHD 구조**뿐이다.
 *     아래 A-3~A-6이 갈리면 그것은 순수하게 오라우팅 때문이다.
 *
 * ── 실측 (2026-08-25, mock 세율) ────────────────────────────────────────────
 *   현행 환산 경로 : total.lthd  46,080,000 (인가전 384,000,000 × 12% — 취득~인가 6년)
 *                    calculatedTax 335,936,400 · totalTax 369,530,040
 *   §166②1호 경로  : total.lthd 259,357,893
 *                      = 기존건물분 384,000,000×30% + 376,315,789×30% + 청산금납부분 173,684,211×18%
 *                    calculatedTax 246,359,684 · totalTax 270,995,652
 *   ⇒ 산출세액 **89,576,716원 과대**
 *
 * ── 반대 축 실측 (수정 방향의 반증 — 회귀 가드 C의 근거) ────────────────────
 *   같은 사실관계에서 `subject: "right"`(입주권 양도)는 환산·실가 **양쪽 모두** §166①1호로
 *   total.lthd 46,080,000 · calculatedTax 335,936,400 이 나온다(실측 일치).
 *   즉 「취득가액 산정 방식이 적용 항을 바꾸지 않는다」는 명제는 입주권 축에서는 이미 지켜지고 있고,
 *   완공APT 축에서만 깨져 있다.
 *
 * ── 🔴 이 anchor 는 수정 전 실패한다 ────────────────────────────────────────
 *   A-3·A-4·A-5·A-6·B-1·B-2·B-2b·B-3·B-3b·B-4·B-5 가 실패한다.
 *   A-1·A-2(대조군 유효성 검산)와 C-*(회귀 가드)는 수정 전후 모두 통과해야 한다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

/** §166③ 환산취득가 = floor(650,000,000 × 200,000,000 / 500,000,000) */
const CONVERTED_ACQUISITION = 260_000_000;
/** §163⑥ 개산공제 = floor(200,000,000 × 3%) */
const LUMP_SUM_DEDUCTION = 6_000_000;
/** 실가 대조군 취득가액 — 인가전 양도차익을 환산 경로와 동일하게 맞춘 값 */
const ACTUAL_ACQUISITION = CONVERTED_ACQUISITION + LUMP_SUM_DEDUCTION; // 266,000,000

function buildInput(opts: {
  mode: "estimated" | "actual";
  subject: "apt" | "right";
}): TransferTaxInput {
  const redevelopment: RedevelopmentInfo = {
    subject: opts.subject,
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2013-10-23"),
    rightsValue: 650_000_000,
    settlementDirection: "pay",
    settlementAmount: 300_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "land",
    acquisitionRounding: "floor",
    ...(opts.mode === "estimated"
      ? { landStdPriceAtAcq: 200_000_000, landStdPriceAtApproval: 500_000_000 }
      : {}),
  };

  return baseTransferInput({
    propertyType: opts.subject === "apt" ? "redevelopment_apt" : "right_to_move_in",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2007-04-09"),
    acquisitionPrice: opts.mode === "estimated" ? 0 : ACTUAL_ACQUISITION,
    expenses: 0,
    useEstimatedAcquisition: opts.mode === "estimated",
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment,
  });
}

describe("E1-01 — 토지 출자 + 완공APT 양도 + 환산취득가는 §166②1호로 계산돼야 한다", () => {
  const estimated = calculateTransferTax(
    buildInput({ mode: "estimated", subject: "apt" }),
    mockRates,
  );
  const actual = calculateTransferTax(
    buildInput({ mode: "actual", subject: "apt" }),
    mockRates,
  );

  // ── A. 대조군 방식 — 취득가액 산정 방식(§166③)은 적용 항(①↔②)을 바꾸지 못한다 ──
  //    §166③ 「제1항 및 제2항을 적용할 때 … 취득가액을 확인할 수 없는 경우」

  it("[A-1] 대조군 유효성 — 총 양도차익이 두 경로에서 동일하다 (934,000,000)", () => {
    // 검산: §166②1호 안분 분모(분양가 950,000,000)는 취득가액에 의존하지 않는다.
    expect(estimated.transferGain).toBe(934_000_000);
    expect(actual.transferGain).toBe(934_000_000);
  });

  it("[A-2] 대조군 유효성 — 인가전 양도차익이 두 경로에서 동일하다 (384,000,000)", () => {
    // 이것이 성립해야 A-3~A-6의 차이가 오직 §166 적용 항 때문임이 확정된다.
    expect(estimated.redevelopmentDetail!.preApproval.gain).toBe(384_000_000);
    expect(actual.redevelopmentDetail!.preApproval.gain).toBe(384_000_000);
  });

  it("[A-3 ★] 환산 모드와 실가 모드의 장기보유특별공제가 일치한다", () => {
    // 현행: 46,080,000(환산·§166①1호) vs 259,357,893(실가·§166②1호)
    expect(estimated.longTermHoldingDeduction).toBe(actual.longTermHoldingDeduction);
  });

  it("[A-4 ★] 환산 모드와 실가 모드의 산출세액이 일치한다", () => {
    // 현행: 335,936,400(환산) vs 246,359,684(실가) — 89,576,716원 과대
    expect(estimated.calculatedTax).toBe(actual.calculatedTax);
  });

  it("[A-5 ★] 환산 경로 total.lthd = 259,357,893 (§166⑤2호 가목·나목)", () => {
    // 기존건물분(취득일 2007-04-09 ~ 양도일 2023-02-16, 만 15년 → 30%)
    //   = floor(384,000,000 × 30%) + floor(376,315,789 × 30%) = 115,200,000 + 112,894,736
    // 청산금납부분(인가일 2013-10-23 ~ 양도일 2023-02-16, 만 9년 → 18%)
    //   = floor(173,684,211 × 18%) = 31,263,157
    expect(estimated.redevelopmentDetail!.total.lthd).toBe(259_357_893);
  });

  it("[A-6 ★] 환산 경로 산출세액 = 246,359,684 / 세액합계 = 270,995,652", () => {
    expect(estimated.calculatedTax).toBe(246_359_684);
    expect(estimated.totalTax).toBe(270_995_652);
  });

  // ── B. 구조 직접 관측 — §166②1호 3분할 + §166⑤2호 기산일 ────────────────

  it("[B-1 ★] 기존건물분(인가후) 양도차익 = 376,315,789 (§166②1호)", () => {
    // = floor(인가후양도차익 550,000,000 × 평가액 650,000,000 / 분양가 950,000,000)
    // 현행 오라우팅에서는 이 분기가 통째로 0이다.
    expect(estimated.redevelopmentDetail!.postApprovalExistingHouse.gain).toBe(376_315_789);
  });

  it("[B-2 ★] 기존건물분 LTHD = 112,894,736 (§166⑤2호 나목 — 취득일~신축주택 양도일)", () => {
    expect(estimated.redevelopmentDetail!.postApprovalExistingHouse.lthd).toBe(112_894_736);
  });

  it("[B-2b ★] 기존건물분 LTHD 율 = 30% (만 15년, §95② 표1 상한)", () => {
    expect(estimated.redevelopmentDetail!.postApprovalExistingHouse.lthdRate).toBeCloseTo(0.30, 5);
  });

  it("[B-3 ★] 청산금납부분 LTHD = 31,263,157 (§166⑤2호 가목 — 인가일~양도일)", () => {
    // 현행: settlement.lthd = 0 (§166①1호 인가후양도차익엔 LTHD 대상이 없다)
    expect(estimated.redevelopmentDetail!.settlement.lthd).toBe(31_263_157);
  });

  it("[B-3b ★] 청산금납부분 LTHD 율 = 18% (2013-10-23~2023-02-16, 만 9년)", () => {
    expect(estimated.redevelopmentDetail!.settlement.lthdRate).toBeCloseTo(0.18, 5);
  });

  it("[B-4 ★] 기존건물분 LTHD 종기 = 신축주택 양도일 2023-02-16 (§166⑤2호 나목)", () => {
    // 현행은 §166⑤1호(취득일~인가일)를 적용해 2013-10-23로 끝난다.
    const pre = estimated.redevelopmentDetail!.preApproval;
    expect(pre.branchAcqDate?.toISOString().slice(0, 10)).toBe("2007-04-09");
    expect(pre.branchTransferDate?.toISOString().slice(0, 10)).toBe("2023-02-16");
  });

  it("[B-5 ★] 분양가(§166②1호 안분 분모) = 950,000,000 = 평가액 + 납부 청산금", () => {
    // 현행 §166①1호 경로에는 분양가 개념 자체가 없어 undefined 다.
    expect(estimated.redevelopmentDetail!.salePriceTotal).toBe(950_000_000);
  });

  // ── C. 회귀 가드 — 입주권(subject="right") 양도는 §166①1호를 유지해야 한다 ──
  //    과잉 차단 방지: 사례 37 경로(토지 출자 입주권 + 환산)를 깨뜨리지 말 것.

  it("[C-1] 입주권 양도는 환산·실가 양쪽 모두 §166①1호 — LTHD 46,080,000 동일", () => {
    const rightEstimated = calculateTransferTax(
      buildInput({ mode: "estimated", subject: "right" }),
      mockRates,
    );
    const rightActual = calculateTransferTax(
      buildInput({ mode: "actual", subject: "right" }),
      mockRates,
    );
    expect(rightEstimated.longTermHoldingDeduction).toBe(46_080_000);
    expect(rightActual.longTermHoldingDeduction).toBe(46_080_000);
    expect(rightEstimated.calculatedTax).toBe(rightActual.calculatedTax);
  });

  it("[C-2] 입주권 양도는 인가후 기존건물분·청산금분 LTHD가 없다 (§166⑤1호만 적용)", () => {
    const rightEstimated = calculateTransferTax(
      buildInput({ mode: "estimated", subject: "right" }),
      mockRates,
    );
    const detail = rightEstimated.redevelopmentDetail!;
    expect(detail.postApprovalExistingHouse.lthd).toBe(0);
    expect(detail.settlement.lthd).toBe(0);
    // §166⑤1호 — 인가전양도차익 LTHD 종기 = 관리처분계획등 인가일
    expect(detail.preApproval.branchTransferDate?.toISOString().slice(0, 10)).toBe("2013-10-23");
  });
});
