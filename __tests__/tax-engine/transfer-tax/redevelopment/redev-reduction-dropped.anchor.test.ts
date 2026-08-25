/**
 * anchor — E3-02 : §166 재개발·입주권 분기가 조특법 감면을 통째로 버린다.
 *
 * ## 결함
 *
 * `transfer-tax-redevelopment.ts`는 `finalizeTransferTax`를 호출하지 않고 결과를 직접
 * 조립하면서 `input.reductions`를 **한 번도 읽지 않고** `reductionAmount: 0`을 하드코딩했다.
 * `reductionType`·`reducibleIncome`·각 감면 detail·농어촌특별세도 전부 미부착이었다.
 *
 * 그런데 감면 자산종류 게이트(`transfer-reductions/asset-kind-gate.ts`)는
 *   · `RENTAL_HOUSING_KINDS`      = { housing, **redevelopment_apt** }
 *   · `NEW_UNSOLD_HOUSING_KINDS`  = { housing, right_to_move_in, presale_right, **redevelopment_apt** }
 *   · `standalone`(§77·§77의2·§77의3) = **전 자산 true**
 * 로 재개발·입주권을 **허용 자산으로 명시**하고, ④(`lib/calc/transfer-tax-api.ts`)·
 * ⑫(`lib/api/transfer-tax-schema-reductions.ts`)도 그대로 통과시킨다.
 *
 * ⇒ 감면이 엔진 input까지 **정상 도달한 뒤 엔진 안에서 침묵 소실**했다.
 *   화면에서는 감면을 선택한 상태 그대로 보이는데 세액은 미선택과 1원도 다르지 않다
 *   (memory `feedback_api_trigger_without_input_path_is_noop`의 거울상 —
 *    거기는 입력 경로가 없었고, 여기는 입력이 도달하는데 계산이 없다).
 *
 * ## 안전망 실측 (수정 전)
 *
 * `reductionAmount: 0` → `12345678` 변이 주입 후 `__tests__/tax-engine/transfer-tax/` 전건 실행:
 * **954파일 2637테스트 전건 통과 · 실패 0건**. 이 반환값을 지키는 테스트가 저장소에 없었다.
 *
 * ## 조문
 *
 * 조세특례제한법 §77(공익사업용 토지등에 대한 양도소득세 감면) · §97 · §98 · §99 /
 * 같은 법 §127⑦(중복배제) · §133②(5년 누적한도) / 농어촌특별세법 §5①1호.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "./_helpers";

const rates = makeMockRates();

/** 조특법 §77 공익수용 — 현금보상 전액, 사업인정고시 2025-01-10 */
const R77 = {
  type: "public_expropriation" as const,
  cashCompensation: 525_000_000,
  bondCompensation: 0,
  businessApprovalDate: new Date("2025-01-10"),
};

/** 사례 44 fixture — APT·환산·납부·주택출자 (비-1세대1주택이라 12억 안분 배제) */
function redevApt(reductions: TransferTaxInput["reductions"]): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2005-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: case44RedevelopmentInfo(),
    reductions,
  } as Partial<TransferTaxInput>);
}

describe("E3-02 anchor — §166 재개발 분기의 조특법 감면", () => {
  const noReduction = calculateTransferTax(redevApt([]), rates);
  const with77 = calculateTransferTax(redevApt([R77]), rates);

  it("기준선 — 감면 미선택 시 산출세액 55,836,614 · 세액합계 61,420,275 (사례 44 anchor 불변)", () => {
    expect(noReduction.calculatedTax).toBe(55_836_614);
    expect(noReduction.reductionAmount).toBe(0);
    expect(noReduction.totalTax).toBe(61_420_275);
  });

  it("§77을 선택하면 감면세액이 0이 아니다 (침묵 소실 금지)", () => {
    expect(with77.reductionAmount).toBeGreaterThan(0);
  });

  it("감면세액 = 8,375,491 · 유형 = 공익사업용 토지 수용(§77)", () => {
    expect(with77.reductionAmount).toBe(8_375_491);
    expect(with77.reductionType).toBe("공익사업용 토지 수용(§77)");
    expect(with77.reductionTypeApplied).toBe("public_expropriation");
  });

  it("결정세액 47,461,123 · 지방소득세 4,746,112 · 세액합계 53,882,333", () => {
    expect(with77.determinedTax).toBe(47_461_123);
    expect(with77.localIncomeTax).toBe(4_746_112);
    expect(with77.totalTax).toBe(53_882_333);
  });

  it("농어촌특별세 1,675,098 = 감면세액 × 20% (농어촌특별세법 §5①1호)", () => {
    const surtax = with77.steps.find((s) => s.label === "농어촌특별세 (감면세액 × 20%)");
    expect(surtax?.amount).toBe(1_675_098);
    // §77은 「직접 경작한 토지」로 한정된 조건부 비과세(농특세령 §4①1호)라, 이 사안은 과세다.
    expect(with77.totalTax).toBe(with77.determinedTax + with77.localIncomeTax + 1_675_098);
  });

  it("실측 차액 7,537,942 = 감면 8,375,491 − 지방소득세 감소 837,549 + 농특세 1,675,098", () => {
    expect(noReduction.totalTax - with77.totalTax).toBe(7_537_942);
  });

  it("§77 감면 detail이 결과에 실린다 — 화면이 감면 근거를 표시할 수 있어야 한다", () => {
    expect(with77.publicExpropriationDetail).toBeDefined();
  });

  it("결정세액 = 산출세액 − 감면세액 (조특법 §77 · 원 미만 절사)", () => {
    expect(with77.determinedTax).toBe(with77.calculatedTax - with77.reductionAmount);
  });

  it("지방소득세는 감면 후 결정세액 기준으로 다시 계산된다 (지방세법 §103의3)", () => {
    expect(with77.localIncomeTax).toBe(Math.floor(with77.determinedTax * 0.1));
  });

  it("🔑 구별력 — 감면 선택 여부가 세액합계를 실제로 가른다 (종전에는 응답이 바이트 동일했다)", () => {
    expect(with77.totalTax).not.toBe(noReduction.totalTax);
    expect(with77.totalTax).toBeLessThan(noReduction.totalTax);
  });

  it("산출세액 자체는 감면과 무관하게 불변 — 감면은 산출세액 뒤 단계다 (조특법 §77①)", () => {
    expect(with77.calculatedTax).toBe(noReduction.calculatedTax);
  });

  it("감면세액 step이 계산과정에 나타난다", () => {
    expect(with77.steps.some((s) => s.label === "감면세액")).toBe(true);
  });
});

/**
 * 조특법 감면은 효과 방식이 둘이다 — **세액감면형**(위 describe)과 **차감형**(아래).
 * 차감형은 양도소득금액을 줄이므로 **산출세액보다 앞**에서 적용돼야 하고, 그 농어촌특별세는
 * 「감면 전 산출세액 − 감면 후 산출세액」의 2-pass로 구한다(농어촌특별세법 §2①1호 「소득공제」).
 *
 * 한쪽만 배선하면 나머지 한쪽이 조용히 사라지므로 두 트랙을 함께 고정한다.
 */
describe("E3-02 anchor — §166 재개발 분기의 차감형 감면 (§99의3)", () => {
  /** 조특법 §99의3 신축주택 과세특례 — 계약 2002-01-01·기준시가 3점 */
  const R993 = {
    type: "new_99_3" as const,
    contractDate993: "2002-01-01",
    standardPriceAtAcquisition993: 100_000_000,
    standardPriceAt5Years: 160_000_000,
    standardPriceAtTransfer993: 250_000_000,
    region993: "outside_speculation" as const,
    acquisitionType993: "from_builder" as const,
  };
  const r = calculateTransferTax(
    redevApt([R993] as unknown as TransferTaxInput["reductions"]),
    rates,
  );

  it("양도소득금액이 차감된다 — 201,912,143 → 과세표준 118,647,286", () => {
    expect(r.steps.find((s) => s.label === "양도소득금액")?.amount).toBe(201_912_143);
    expect(r.steps.some((s) => s.label.startsWith("§99의3"))).toBe(true);
    expect(r.steps.find((s) => s.label === "과세표준")?.amount).toBe(118_647_286);
  });

  it("산출세액 26,086,550 — 차감형은 산출세액 **앞**에서 적용된다", () => {
    expect(r.calculatedTax).toBe(26_086_550);
  });

  it("🔑 차감형 농특세 5,950,012 = (55,836,614 − 26,086,550) × 20%", () => {
    const surtax = r.steps.find((s) => s.label === "차감형 감면 농어촌특별세 (감면세액 × 20%)");
    expect(surtax?.amount).toBe(5_950_012);
  });

  it("세액합계 34,645,217 = 결정세액 + 지방소득세 + 농특세", () => {
    expect(r.totalTax).toBe(34_645_217);
    expect(r.totalTax).toBe(r.determinedTax + r.localIncomeTax + 5_950_012);
  });

  it("차감형은 세액감면형(reductionAmount)에 이중 계상되지 않는다", () => {
    expect(r.reductionAmount).toBe(0);
  });
});
