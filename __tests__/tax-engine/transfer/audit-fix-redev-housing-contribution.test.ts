/**
 * 감사 결함 회귀 테스트
 * ref: lib/tax-engine/redevelopment-housing-contribution.ts:155 (group redev-2, confirmed/high)
 *
 * 결함: calcRedevHousingContribReceiveEstimated (환산모드 단독주택 출자 입주권)의
 *       §166①2호 나목 인가전 양도차익 base가 개산공제(§163⑥)에 더해 실제
 *       인가전 필요경비(preApprovalExpenses)까지 이중 차감 → 양도차익 과소·세액 과소.
 *
 * 법령 근거 (독립 도출):
 *   - §97②2호: 환산취득가 사용 시 필요경비 = 환산취득가 + 개산공제. 실제 필요경비
 *              별도 가산 불가(가목·나목 택일=max, 합산 아님). 조심2016서2576(기각).
 *   - §166③  : 환산취득가 = 권리가액 × 취득당시PHD / 인가당시PHD
 *   - §163⑥  : 개산공제 = floor(취득당시PHD × 3%)
 *   - §166①2호 나목: 인가전 양도차익
 *              = floor((권리가액 − 환산취득가 − 개산공제) × (평가액 − 수령청산금) / 평가액)
 *              ⇒ 인가전 실제 필요경비는 개산공제에 흡수 — 별도 차감 금지.
 *
 * 기대값(사례 39 fixture 기반, 통계식으로 statute에서 직접 도출):
 *   convertedAcquisition = floor(300M × 120M / 200M) = 180,000,000
 *   estimatedDeduction   = floor(120M × 3%)          =   3,600,000
 *   salePriceTotal       = 300M − 50M                = 250,000,000
 *   preApprovalGainBase  = 300M − 180M − 3.6M        = 116,400,000  (pae 미차감)
 *   preApprovalGain      = floor(116.4M × 250M/300M) =  97,000,000
 *   ⇒ preApprovalGain 은 preApprovalExpenses 값과 무관(불변)해야 한다.
 */

import { describe, it, expect } from "vitest";
import { calcRedevHousingContribReceiveEstimated } from "@/lib/tax-engine/redevelopment-housing-contribution";

// 사례 39 기반 fixture — preApprovalExpenses 만 변수화
function run(preApprovalExpenses: number) {
  return calcRedevHousingContribReceiveEstimated({
    acquisitionDate: new Date("2008-04-09"),
    approvalDate: new Date("2013-10-23"),
    rightsValue: 300_000_000,
    transferPrice: 320_000_000,
    settlementReceived: 50_000_000,
    housingStdPriceAtAcq: 120_000_000, // §166③ 분자
    housingStdPriceAtApproval: 200_000_000, // §166③ 분모
    preApprovalExpenses,
    postApprovalExpenses: 0,
  });
}

describe("audit redev-2 — 환산모드 인가전 양도차익 개산공제·실제필요경비 이중차감 제거", () => {
  it("sub-value anchors — §166③ 환산취득가 / §163⑥ 개산공제 / salePriceTotal", () => {
    const r = run(0);
    expect(r.convertedAcquisition).toBe(180_000_000); // §166③
    expect(r.estimatedDeduction).toBe(3_600_000); // §163⑥
    expect(r.salePriceTotal).toBe(250_000_000);
  });

  it("preApprovalGain = 97,000,000 (인가전 필요경비 10,000,000 입력해도 불변 — §97②2호)", () => {
    // 정당한 값: (300M − 180M − 3.6M) × 250M/300M = floor(97,000,000)
    // 실제 필요경비는 개산공제에 흡수되어 나목에서 별도 차감되지 않는다.
    const r = run(10_000_000);
    expect(r.preApprovalGain).toBe(97_000_000);
  });

  it("preApprovalGain 은 preApprovalExpenses 에 대해 불변 (0 == 10M == 30M)", () => {
    const g0 = run(0).preApprovalGain;
    const g10 = run(10_000_000).preApprovalGain;
    const g30 = run(30_000_000).preApprovalGain;
    expect(g0).toBe(97_000_000);
    expect(g10).toBe(g0);
    expect(g30).toBe(g0);
  });

  it("preApprovalLTHD·totalLTHD 도 preApprovalExpenses 에 불변 (표1 10% — 2008~2013 만 5년)", () => {
    // LTHD = floor(97M × 10%) = 9,700,000 (인가후 분 0)
    const r0 = run(0);
    const r10 = run(10_000_000);
    expect(r0.lthdRate).toBe(0.1);
    expect(r0.preApprovalLTHD).toBe(9_700_000);
    expect(r10.preApprovalLTHD).toBe(9_700_000);
    expect(r10.totalLTHD).toBe(9_700_000);
  });
});
