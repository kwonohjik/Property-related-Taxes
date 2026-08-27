/**
 * anchor — 청산금 분할양도는 **토지 출자에도 적용된다**
 *
 * ## 🔴 종전 동작
 *
 * `computeAptReceive`가 `originalAssetType === "land"`이면 청산금분을 **통째로 0**으로 만들어
 * (양도가·취득가·차익 전부), 청산금 상당분이 **과세에서 이탈**했다. 근거 주석은
 * 「청산금 자체는 인가시점에 받은 금액이라 **별도 양도(처분) 사건이 없음**」이었다.
 *
 * ## 조문 — §166①은 토지만 제공한 경우를 **명시적으로 포함**한다
 *
 * > **§166①** … 정비사업조합의 조합원이 당해 조합에 기존건물과 그 부수토지를
 * > **제공(건물 또는 <ins>토지만을 제공한 경우를 포함한다</ins>)** 하고 취득한
 * > 입주자로 선정된 지위를 양도하는 경우 …
 *
 * 그리고 §166①2호 **나목이 `×(평가액 − 청산금) ÷ 평가액`로 청산금 상당분을 배제**하는데,
 * 그 배제는 **자산 종류를 가리지 않는다**. §166②2호는 「제1항제2호에 따른 가액」뿐이다.
 *
 * ## 국세청 해석 셋 — 전부 같은 방향 (반대 근거 없음)
 *
 * | 문서 | 연도 | 요지 |
 * |---|---|---|
 * | **재일46014-2870** | 1997.12.08 | 재건축조합에게 **토지 등**을 양도하고 청산금을 교부받는 경우 **양도에 해당**되어 과세대상 |
 * | **재일46014-2104** | 1999.12.13 | **토지·건물**의 대가로 권리와 청산금을 교부받은 경우, 청산금에 상당하는 종전의 **토지·건물은 유상이전**에 해당하여 과세 |
 * | **법규재산2012-358** | 2012.11.09 | 청산금은 종전 주택(부수토지 포함)의 **분할양도**에 해당 |
 *
 * 1997·1999년 해석이 **토지를 명시**한다 — 「주택 사안이라 토지엔 미확인」이라던 종전 보류
 * 사유는 해소됐다.
 *
 * ## ⭐ 착수 조건이 두 번 틀렸다 (기록)
 *
 * 1. 「사례 46·47 원본 산식 확인」 — 두 사례 다 취득가액 ≪ 평가액이라 쟁점 구간을 안 덮었다.
 * 2. 「사례 42 원본 확인」 — 그 원본이 **자기 자료끼리 답이 다르다**(설계문서 `:31` 행 #7
 *    「xlsx 교재 답 상이 → anchor 보류」). 원본으로는 판정이 불가능했다.
 *    설계문서 `:509`가 이미 해소 경로를 **「국세청 해석례」** 로 적어 뒀다.
 *
 * 🔑 **「원본 자료 확보」를 착수 조건으로 적을 때는 그 자료가 쟁점을 가르는지부터 확인할 것.**
 *
 * ## 🔑 중심은 항등식이다
 *
 * ```
 *   나목     = (평가액 − 취득가액) × (평가액 − 청산금) ÷ 평가액
 *   청산금분 = (평가액 − 취득가액) × 청산금           ÷ 평가액
 *   합계     =  평가액 − 취득가액          ← 자산 종류와 무관하게 성립해야 한다
 * ```
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

/** 사례 42 조건 — 평가액 5억 · 청산금 수령 1.14억 · 종전 취득가 2억 · 양도 5.25억 */
const RIGHTS_VALUE = 500_000_000;
const SETTLEMENT = 114_000_000;
const OLD_ACQ = 200_000_000;
const TRANSFER_PRICE = 525_000_000;

function run(originalAssetType: "land" | "housing") {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: TRANSFER_PRICE,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: OLD_ACQ,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2009-10-23"),
      rightsValue: RIGHTS_VALUE,
      settlementDirection: "receive",
      settlementAmount: SETTLEMENT,
      settlementSaleDate: new Date("2023-03-02"),
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType,
    } as RedevelopmentInfo,
  });
  const result = calculateTransferTax(input, mockRates);
  return { result, detail: result.redevelopmentDetail! };
}

/** 청산금분 = 1.14억 − 2억 × 1.14억 ÷ 5억 = 114,000,000 − 45,600,000 */
const SETTLEMENT_GAIN = 68_400_000;
/** 나목 = (5억 − 2억) × (5억 − 1.14억) ÷ 5억 */
const PRE_APPROVAL_GAIN = 231_600_000;

describe("⭐ 항등식은 자산 종류와 무관하다", () => {
  it("★ 토지 출자: 나목 + 청산금분 = 평가액 − 취득가액", () => {
    const { detail } = run("land");
    expect(detail.preApproval.gain + detail.settlement.gain).toBe(RIGHTS_VALUE - OLD_ACQ);
  });

  it("🔑 주택 출자도 같다 (회귀 — 종전에도 성립했다)", () => {
    const { detail } = run("housing");
    expect(detail.preApproval.gain + detail.settlement.gain).toBe(RIGHTS_VALUE - OLD_ACQ);
  });
});

describe("토지 출자 청산금분 — 분할양도가 과세된다", () => {
  it("★ 청산금분이 0이 아니다 (재일46014-2870·2104)", () => {
    const { detail } = run("land");
    expect(detail.settlement.gain).toBe(SETTLEMENT_GAIN);
    expect(detail.settlement.apportionedTransfer).toBe(SETTLEMENT);
    expect(detail.settlement.apportionedAcquisition).toBe(45_600_000);
  });

  it("★ 자산 종류가 청산금분을 가르지 않는다 — 토지 = 주택", () => {
    const land = run("land").detail.settlement;
    const housing = run("housing").detail.settlement;
    expect(land.gain).toBe(housing.gain);
    expect(land.apportionedTransfer).toBe(housing.apportionedTransfer);
    expect(land.apportionedAcquisition).toBe(housing.apportionedAcquisition);
  });

  it("🔑 총 양도차익이 경제적 실질과 맞는다 — 양도가 + 청산금 − 취득가", () => {
    expect(run("land").detail.total.gain).toBe(TRANSFER_PRICE + SETTLEMENT - OLD_ACQ); // 439,000,000
  });
});

describe("회귀 — 가목·나목은 이 변경과 무관하다", () => {
  it("나목(인가전 분)이 그대로다", () => {
    for (const t of ["land", "housing"] as const) {
      expect(run(t).detail.preApproval.gain, t).toBe(PRE_APPROVAL_GAIN);
    }
  });

  it("가목(인가후 기존분)이 그대로다 — 양도가액 − 분양가", () => {
    for (const t of ["land", "housing"] as const) {
      expect(run(t).detail.postApprovalExistingHouse.gain, t).toBe(
        TRANSFER_PRICE - (RIGHTS_VALUE - SETTLEMENT), // 139,000,000
      );
    }
  });
});
