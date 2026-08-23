/**
 * 시행령 §163⑥ 개산공제율 — **자산 종류별 호 구분** (2026-08-23 신설)
 *
 * ## 법문 (소득세법 시행령 mst 286211 · 소득세법 mst 280405 실독)
 *
 * | 호 | 대상 | 율 |
 * |---|---|---|
 * | 1 | 토지 | 개별공시지가 × **3/100** (미등기 3/1000) |
 * | 2 | 건물(가: §99①1호 다·라목 건물·주택 / 나: 그 외 건물) | × **3/100** (미등기 3/1000) |
 * | 3 | 법 §94①2호 **나목 및 다목** — 지상권 / 전세권·등기된 부동산임차권 (미등기 제외) | × **7/100** |
 * | 4 | 제1호 내지 제3호 **외의** 자산 | 취득당시 기준시가 × **1/100** |
 *
 * 조합원입주권·분양권은 법 §94①2호 **가목**(「부동산을 취득할 수 있는 권리」)이다.
 * 3호는 **나목·다목만** 열거하므로 가목은 3호에 없다 ⇒ **4호 = 1%**.
 *
 * ## 종전 결함
 *
 * `transfer-tax-helpers.ts`가 리터럴 `input.isUnregistered ? 0.003 : 0.03`을 써서 **자산 종류를
 * 전혀 보지 않았다**. 같은 파일의 `estimatedDeductionRate()` 주석이 이미 「리터럴 0.03 금지」를
 * 명시했는데 이 지점만 규칙 밖에 있었다.
 *
 * **분양권은 도달 가능한 활성 결함이었다** — ⑧ validate 통과 · ⑤ 상단 산정방식 라디오 노출
 * (`CompanionAcqPurchaseBlock`의 숨김 게이트는 `right_to_move_in`·`redevelopment_apt`만 잡는다) ·
 * body에 `propertyType=presale_right`·`acquisitionMethod=estimated` 정상 송신.
 * 취득기준시가 3억이면 개산공제 9,000,000 vs 법정 3,000,000 = **6,000,000 과대공제**.
 *
 * 착수 전 안전망 실측: 입주권·분양권 환산을 보는 기존 테스트는 **단 1건**
 * (`expropriation-scope-expansion.anchor.test.ts` C-06c)이었고, 그 1건이 잘못된 3%를 고정하고 있었다.
 *
 * ## 판별력 (뮤테이션 3회 실측)
 *
 * | 뮤테이션 | 결과 |
 * |---|---|
 * | M-5 §166 경로에 `propertyType`을 주입해 1%로 떨어뜨림 | **82건 실패** — 경계는 기존 스위트가 두껍게 지킨다(그래서 D-10을 따로 두지 않았다) |
 * | M-6 4호 술어를 `false`로(종전 동작 복원) | **5건 실패** — D-01·D-02·D-06·D-08·D-09 |
 * | M-7 미등기 판정을 4호보다 **앞**으로 | **1건 실패** — D-06만. 그래서 D-06이 우선순위의 유일한 파수꾼이다 |
 *
 * ## ⛔ 절대 금지
 *
 * **§166③ 환산(원조합원 입주권·재개발APT)에 1%를 적용하지 말 것.** 그 환산의 대상은 입주권이
 * 아니라 조합에 제공한 **종전 건물과 그 부수토지**(= 토지·건물)이므로 3%다. D-10이 그 경계를
 * 지킨다 — §166 경로(`redevelopment-*-contribution.ts`·`redevelopment-split.ts`)는
 * `estimatedDeductionRate()`에 `propertyType`을 **넘기지 않는다**.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

/** 양도 8억 · 취득기준시가 3억 · 양도기준시가 6억 ⇒ 환산취득가 = 8억 × 3/6 = 4억 */
const TRANSFER_PRICE = 800_000_000;
const STD_ACQ = 300_000_000;
const CONVERTED = 400_000_000;

/** 양도차익 = 8억 − 환산 4억 − 개산공제 */
const gainWith = (deduction: number) => TRANSFER_PRICE - CONVERTED - deduction;

const DEDUCTION_3PCT = 9_000_000; // 3억 × 3%
const DEDUCTION_1PCT = 3_000_000; // 3억 × 1%  ← §163⑥4호
const DEDUCTION_0_3PCT = 900_000; // 3억 × 3/1000 (미등기, 1호·2호 단서)

function build(
  propertyType: string,
  over: Partial<TransferTaxInput> = {},
): TransferTaxInput {
  return baseTransferInput({
    propertyType: propertyType as never,
    acquisitionCause: "purchase",
    transferPrice: TRANSFER_PRICE,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2018-03-10"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: STD_ACQ,
    standardPriceAtTransfer: 600_000_000,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    ...over,
  }) as TransferTaxInput;
}

describe("§163⑥ 개산공제율 — 호 구분", () => {
  it("[D-01] 분양권 = §94①2호 가목 → 4호 1% (활성 결함이었다)", () => {
    const r = calculateTransferTax(build("presale_right"), rates);
    expect(r.transferGain).toBe(gainWith(DEDUCTION_1PCT));
  });

  it("[D-02] 입주권(§166 미적용 일반 경로) = 가목 → 4호 1%", () => {
    const r = calculateTransferTax(build("right_to_move_in"), rates);
    expect(r.transferGain).toBe(gainWith(DEDUCTION_1PCT));
  });

  it("[D-03] 토지 → 1호 3% (회귀)", () => {
    const r = calculateTransferTax(build("land"), rates);
    expect(r.transferGain).toBe(gainWith(DEDUCTION_3PCT));
  });

  it("[D-04] 주택 → 2호 3% (회귀)", () => {
    const r = calculateTransferTax(build("housing"), rates);
    expect(r.transferGain).toBe(gainWith(DEDUCTION_3PCT));
  });

  it("[D-05] 재개발APT(§166 미적용 일반 경로) → 2호 3% — 완공 **신축주택**의 양도다", () => {
    const r = calculateTransferTax(build("redevelopment_apt"), rates);
    expect(r.transferGain).toBe(gainWith(DEDUCTION_3PCT));
  });

  /**
   * 4호에는 미등기 단서가 **없다**. 1호·2호만 「미등기양도자산의 경우 3／1000」을 두고,
   * 3호는 아예 「미등기 양도자산을 제외한다」로 4호에 넘긴다.
   * ⇒ 4호 대상은 미등기여도 1%다. 종전 코드는 0.3%를 줬을 것이다.
   */
  it("[D-06] 분양권 + 미등기 → **여전히 1%** (4호에 미등기 단서 없음)", () => {
    const r = calculateTransferTax(build("presale_right", { isUnregistered: true }), rates);
    expect(r.transferGain).toBe(gainWith(DEDUCTION_1PCT));
  });

  it("[D-07] 토지 + 미등기 → 1호 단서 0.3% (회귀)", () => {
    const r = calculateTransferTax(build("land", { isUnregistered: true }), rates);
    expect(r.transferGain).toBe(gainWith(DEDUCTION_0_3PCT));
  });

  /** 감정가액·매매사례가액 모드도 같은 §163⑥ 개산공제를 쓴다 — 율 판정도 같아야 한다. */
  it("[D-08] 감정가액 모드 + 분양권 → 1%", () => {
    const r = calculateTransferTax(
      build("presale_right", {
        useEstimatedAcquisition: false,
        acquisitionMethod: "appraisal",
        appraisalValue: CONVERTED,
      }),
      rates,
    );
    expect(r.transferGain).toBe(gainWith(DEDUCTION_1PCT));
  });

  it("[D-09] 매매사례가액 모드 + 분양권 → 1%", () => {
    const r = calculateTransferTax(
      build("presale_right", {
        useEstimatedAcquisition: false,
        acquisitionMethod: "salesCase",
        similarSalesValue: CONVERTED,
      }),
      rates,
    );
    expect(r.transferGain).toBe(gainWith(DEDUCTION_1PCT));
  });
});
