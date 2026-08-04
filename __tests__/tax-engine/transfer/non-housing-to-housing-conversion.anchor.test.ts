/**
 * Pre-Do anchor — 비주택 → 주택 용도변경 (「소득세법」 §95⑤·⑥ / 「소득세법 시행령」 §154⑤ 단서).
 *
 * 계획서: docs/02-design/features/non-housing-to-housing-conversion.plan.md
 * 엔진설계: docs/02-design/features/non-housing-to-housing-conversion.engine.design.md (I-4 ∩ I-11 ∩ I-14)
 *
 * 참조 사례: 『2026 양도·상속·증여세 이론 및 계산실무』 사례 30 (533~538p)
 *   오피스텔을 업무용으로 취득(2018-02-10) → 주거용 전환(2022-11-25) → 양도(2026-01-27)
 *
 * ⚠️ 교재 지문 vs 화면 불일치 — anchor는 거주 3년으로 고정한다.
 *   533p 지문은 "2년 11개월", 536p 화면 입력은 3년, 537p 계산도 3년 × 4% = 12%.
 *   역산 검증: 57,132,800 ÷ 178,540,000 = 32% = 보유 20% + 거주 12% → 거주 3년 확정.
 *   2년 11개월이면 8%(표2 거주 "2년 이상 3년 미만")여서 총 28%가 되어 PDF 화면 수치와 어긋난다.
 *   ⇒ 지문 오기로 판단. **재논쟁 금지.**
 *
 * 갭 (Pre-Do 시점):
 *   현행 엔진은 §95⑤ 혼합 산식을 모른다 — 1세대1주택 표2를 **총 보유기간 7년**에 그대로 적용해
 *   보유분 28%가 나온다. 법령상은 비주택 4년(표1 8%) + 주택 3년(표2 12%) = 20%다.
 *   ⇒ 공제 과대 → **세액 과소**.
 *
 * 기간 (calculateHoldingPeriod 실측):
 *   총 보유   2018-02-10 ~ 2026-01-27 = 7년 11개월 → 7년
 *   비주택    2018-02-10 ~ 2022-11-25 = 4년  9개월 → 4년 → 표1  8%
 *   주택      2022-11-25 ~ 2026-01-27 = 3년  2개월 → 3년 → 표2 12%
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** PDF 사례 30 — 성남시 중원구 오피스텔 1203호 */
function case30(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2026-01-27"),
    acquisitionPrice: 600_000_000,
    acquisitionDate: new Date("2018-02-10"),
    expenses: 7_300_000, // 취득세·등록세·중개수수료 등
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 36, // 3년 (위 주석 참조)
    // 취득 당시(2018-02-10) 조정대상지역 → 2022-11-14 해제 → 용도변경(2022-11-25)은 해제 후.
    // 현행 엔진은 취득일 기준이라 true. R-3 적용 후에는 용도변경일 기준이 되어 false.
    // 거주 3년이라 어느 쪽이든 거주요건은 충족되므로 비과세 결론은 동일하다.
    wasRegulatedAtAcquisition: true,
    isRegulatedArea: false,
    isUnregistered: false,
    ...overrides,
  });
}

describe("Pre-Do anchor — 비주택 → 주택 용도변경 (PDF 사례 30)", () => {
  it("공통 전제: 양도차익·12억 안분은 현행 엔진과 일치한다", () => {
    const r = calculateTransferTax(case30(), rates);

    // 전체 양도차익 = 15억 − 6억 − 730만
    // 과세대상 양도차익 = 892,700,000 × (15억 − 12억) / 15억 = 178,540,000 (§95③ 고가주택 안분)
    expect(r.taxableGain).toBe(178_540_000);
  });

  it("갭 실증: 현행 엔진은 총 보유기간 7년에 표2를 적용해 공제가 과대하다", () => {
    const r = calculateTransferTax(case30(), rates);

    // 현행: 보유 7년 × 4% = 28% + 거주 3년 × 4% = 12% → 40%
    expect(r.longTermHoldingRate).toBeCloseTo(0.4, 10);
    expect(r.longTermHoldingDeduction).toBe(71_416_000); // 178,540,000 × 40%
  });

  // Phase B(2026-08-05)에서 `it.fails` → `it`로 되돌렸다.
  //   Pre-Do 실측(2026-08-04): expected 0.4 to be close to 0.32 — 차이 0.08은
  //   비주택 4년이 표1 8%가 아니라 표2 16%로 계산된 값이었다(현행이 총 보유 7년에 표2 적용).
  it("★ 기대 (§95⑤·⑥ 적용 후)", () => {
    const r = calculateTransferTax(
      case30({
        nonHousingToHousingConversion: {
          residentialUseStartDate: new Date("2022-11-25"),
          residenceMonthsTrimmed: 0,
        },
      }),
      rates,
    );

    // 보유공제율 = min[ 비주택 4년 표1 8% + 주택 3년 표2 12%, 40% ] = 20%
    // 거주공제율 = 주택 거주 3년 표2 12%
    //                                            합계 32%
    expect(r.longTermHoldingRate).toBeCloseTo(0.32, 10);
    expect(r.longTermHoldingDeduction).toBe(57_132_800);
    // 양도소득금액 121,407,200 (= 178,540,000 − 57,132,800)은 result에 별도 필드가 없다 —
    // 과세표준 = 양도소득금액 − 기본공제로 간접 고정한다.
    expect(r.taxBase).toBe(118_907_200); // 121,407,200 − 기본공제 250만
    expect(r.calculatedTax).toBe(26_177_520); // × 35% − 15,440,000 (§55)
    expect(r.localIncomeTax).toBe(2_617_752); // 산출세액 × 10%

    // ── 표시 계층 (Phase G) — 문구가 자기일관적이고 sub-step 금액이 정확해야 한다 ──
    const lthdStep = r.steps.find((s) => s.label === "장기보유특별공제");
    expect(lthdStep?.formula).toContain("비주택 보유 4년 표1 8% + 주택 보유 3년 표2 12%");
    expect(lthdStep?.formula).toContain("보유분 20%");
    expect(lthdStep?.formula).toContain("거주 3년×4%=12% = 32%"); // 20+12=32 — 자기일관
    expect(lthdStep?.legalBasis).toBe("소득세법 §95 ⑤");

    // sub-step 안분은 20:12이지 28:12가 아니다 (종전 표2 경로는 39,992,960을 냈다)
    const holdingSub = r.steps.find((s) => s.label === "보유 기간분 장특");
    const residenceSub = r.steps.find((s) => s.label === "거주 기간분 장특");
    expect(holdingSub?.amount).toBe(35_708_000); // 57,132,800 × 20/32
    expect(residenceSub?.amount).toBe(21_424_800); // 57,132,800 × 12/32
    expect(holdingSub!.amount + residenceSub!.amount).toBe(57_132_800); // 합 = 총액 불변식
    expect(holdingSub?.legalBasis).toBe("소득세법 §95 ⑤");

    // echo — 결과 화면 산출근거가 읽는 값 (전파 3지점이 살아 있는지도 함께 고정)
    expect(r.usageConversionDetail).toEqual({
      residentialUseStartDate: "2022-11-25",
      nonHousingYears: 4,
      housingYears: 3,
      table1Pct: 8,
      table2HoldingPct: 12,
      residencePct: 12,
      holdingRateCapped: false,
      residenceMonthsTrimmed: 0,
    });
  });

  it("★ 비과세 보유기간 (§154⑤ 단서) — 주거용 사용일 기준 2년 미달이면 과세", () => {
    // 주거용 사용 개시일을 양도일 1년 10개월 전으로 → 취득일(2018) 기준으로는 7년 11개월이지만
    // §154⑤ 단서상 보유기간은 1년 10개월이라 비과세 불가. (Phase C — 2026-08-05)
    const r = calculateTransferTax(
      case30({
        transferPrice: 1_000_000_000, // 12억 이하 — 비과세 여부가 세액을 가르도록
        nonHousingToHousingConversion: {
          residentialUseStartDate: new Date("2024-03-20"),
          residenceMonthsTrimmed: 0,
        },
      }),
      rates,
    );
    expect(r.isExempt).toBe(false);

    // 같은 입력에서 토글만 빼면 취득일(2018-02-10) 기준 7년 보유라 전액 비과세다.
    const without = calculateTransferTax(case30({ transferPrice: 1_000_000_000 }), rates);
    expect(without.isExempt).toBe(true);
  });
});
