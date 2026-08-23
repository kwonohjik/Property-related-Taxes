/**
 * 승계조합원 조합원입주권 양도 — 엔진 anchor
 *
 * 계획서: docs/02-design/features/right-to-move-in-top-acq-axis-removal.plan.md §3 · §5 Phase 1
 *
 * ── 법령 (KoreanLaw MCP 본문 실독, 시행 2026-07-01본) ──
 *
 * 소득세법 시행령 §166 ①
 *   「… 정비사업조합의 조합원이 **당해 조합에 기존건물과 그 부수토지를 제공**(건물 또는 토지만을
 *     제공한 경우를 포함한다)**하고 취득한** 입주자로 선정된 지위를 양도하는 경우 **그 조합원의**
 *     양도차익은 다음 각 호의 산식에 의하여 계산한다.」
 *   ⇒ 승계조합원은 조합에 제공한 사실이 없다 → **§166①의 적용 요건을 충족하지 않는다.**
 *      양도차익은 §100①·§95①·§97①1호 가목의 일반 원칙으로 계산한다.
 *
 * 소득세법 §95 ② (LTHD)
 *   「… §94①2호가목에 따른 자산 중 조합원입주권(**조합원으로부터 취득한 것은 제외**한다) …」
 *   ⇒ 승계분은 장기보유특별공제 대상이 아니다.
 *
 * 소득세법 §89 ① 4호 (비과세)
 *   「조합원입주권을 1개 보유한 1세대[관리처분계획의 인가일 … **현재 제3호가목에 해당하는
 *     기존주택을 소유하는 세대**]가 …」
 *   ⇒ 승계조합원은 인가일 현재 그 기존주택을 소유하지 않았으므로 **비과세 대상이 아니다.**
 *
 * 기준-2025-법규재산-0057 (법규과-1320, 2025-06-19 · taxlaw.nts.go.kr 본문 실독)
 *   조합원입주권을 매매로 승계취득한 경우 취득가액 = 「종전주택 권리가액 + 취득 이후 조합원
 *   분양계약에 따라 납입한 추가분담금 + (객관적 입증 시) 프리미엄」. 인용 법령은 §97·영 §163①뿐
 *   이고 §166은 나오지 않는다.
 *
 * ── 착수 전 실측 (계획서 §2.4 probe P-2) ──
 * 현행은 승계 입주권도 §166① 3분할을 탄다(`isSuccessorRightToMoveIn`의 소비처는 LTHD 뿐).
 * 합계는 항등식 `(R−A)+(T−R−C) = T−A−C` 때문에 우연히 맞지만, 화면에는 존재할 수 없는
 * 「인가전 양도차익 −50,000,000」이 표시되고, ⑤ 라벨을 문자대로 따르면 97,922,000원 과대과세된다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

/** 승계취득가액 (권리가액 상당 300,000,000 + 프리미엄 50,000,000) */
const SUCCESSOR_ACQ = 350_000_000;
/** 승계 후 납입한 추가분담금 */
const ADDED_CONTRIB = 90_000_000;
/** 양도가액 */
const TRANSFER_PRICE = 500_000_000;
/** §97①1호 가목 — 양도차익 = 양도가액 − (승계취득가 + 추가분담금) */
const EXPECTED_GAIN = TRANSFER_PRICE - (SUCCESSOR_ACQ + ADDED_CONTRIB); // 60,000,000

/**
 * 승계 입주권 엔진 입력.
 *
 * API 변환(⑬)이 `successorRightAcqPrice + successorRightAddedContribution`를 합산해
 * `acquisitionPrice` 한 값으로 보내고, `redevelopment` 페이로드는 **보내지 않는다**.
 * 엔진 쪽에도 `isRedevelopmentActive` 가드를 두어 직접 fixture 입력을 막는다 — 그 가드를
 * 검증하기 위해 여기서는 일부러 `redevelopment`를 **함께 전달**한다.
 */
function successorInput(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  const redev: RedevelopmentInfo = {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "pay",
    settlementAmount: ADDED_CONTRIB,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
  };
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: TRANSFER_PRICE,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2020-05-01"), // 관리처분 인가 후 승계취득
    acquisitionPrice: SUCCESSOR_ACQ + ADDED_CONTRIB,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    isSuccessorRightToMoveIn: true,
    redevelopment: redev,
    ...over,
  });
}

describe("승계조합원 입주권 — §166 미적용 (엔진 가드)", () => {
  it("A-6: §166 3분할을 타지 않는다 — redevelopmentDetail 부재 · 양도차익 = 양도가액 − 합산취득가", () => {
    const r = calculateTransferTax(successorInput(), mockRates);

    expect(
      r.redevelopmentDetail,
      "승계조합원은 §166①의 「조합에 기존건물을 제공하고 취득한 조합원」이 아니다 — " +
        "3분할 결과가 있으면 존재할 수 없는 「인가전 양도차익」이 표시된다.",
    ).toBeUndefined();
    expect(r.transferGain).toBe(EXPECTED_GAIN);
    expect(r.longTermHoldingDeduction, "§95② 괄호 — 조합원으로부터 취득한 것은 제외").toBe(0);
  });

  it("A-6b: 필요경비(자본적지출·양도비)가 양도차익에서 차감된다", () => {
    const r = calculateTransferTax(successorInput({ expenses: 10_000_000 }), mockRates);
    expect(r.transferGain).toBe(EXPECTED_GAIN - 10_000_000);
  });

  it("A-7: 1세대1입주권 자기선언이 있어도 §89①4호 비과세가 적용되지 않는다", () => {
    const redevWithDeclaration: RedevelopmentInfo = {
      ...(successorInput().redevelopment as RedevelopmentInfo),
      exemptionEligibleAtApproval: true,
    };
    const r = calculateTransferTax(
      successorInput({
        redevelopment: redevWithDeclaration,
        isOneHousehold: true,
        householdHousingCount: 0,
        householdRightCount: 1,
      }),
      mockRates,
    );

    expect(
      r.isExempt,
      "§89①4호 본문은 「관리처분계획의 인가일 현재 제3호가목에 해당하는 기존주택을 소유하는 세대」를 " +
        "요구한다 — 승계조합원은 인가일에 그 주택을 소유하지 않았다.",
    ).toBe(false);
    expect(r.transferGain).toBe(EXPECTED_GAIN);
  });

  it("A-7b: 12억 초과 승계 입주권도 안분 비과세 없이 전액 과세된다", () => {
    const redevWithDeclaration: RedevelopmentInfo = {
      ...(successorInput().redevelopment as RedevelopmentInfo),
      exemptionEligibleAtApproval: true,
    };
    const r = calculateTransferTax(
      successorInput({
        redevelopment: redevWithDeclaration,
        transferPrice: 1_500_000_000,
        isOneHousehold: true,
        householdHousingCount: 0,
        householdRightCount: 1,
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
    expect(r.transferGain).toBe(1_500_000_000 - (SUCCESSOR_ACQ + ADDED_CONTRIB));
  });

  it("A-6c: 보유 1년 미만이면 §104①4호 단기세율이 적용된다 (일반 경로 유지 확인)", () => {
    const shortTerm = calculateTransferTax(
      successorInput({ acquisitionDate: new Date("2025-09-01") }),
      mockRates,
    );
    const longTerm = calculateTransferTax(successorInput(), mockRates);
    expect(shortTerm.transferGain).toBe(EXPECTED_GAIN);
    expect(
      shortTerm.calculatedTax,
      "단기 세율이 장기(기본세율)보다 커야 한다 — 일반 §104 경로를 그대로 탄다는 확인.",
    ).toBeGreaterThan(longTerm.calculatedTax);
  });
});

describe("일반 경로 위임의 부수 효과 — 계획서 §9 V-1·V-2·V-3 해소", () => {
  it("V-1: 세대 3주택이어도 §104⑦ 다주택 중과가 붙지 않는다 (입주권은 주택이 아니다)", () => {
    const base = calculateTransferTax(successorInput(), mockRates);
    const threeHouses = calculateTransferTax(
      successorInput({ isOneHousehold: true, householdHousingCount: 3, isRegulatedArea: true }),
      mockRates,
    );
    // 중과가 붙으면 세액이 올라간다 — 같으면 §104⑦ 미적용이다.
    expect(threeHouses.calculatedTax).toBe(base.calculatedTax);
    expect(threeHouses.transferGain).toBe(EXPECTED_GAIN);
    expect(threeHouses.longTermHoldingDeduction).toBe(0);
  });

  it("V-2: 보유 1~2년 세율이 1년 미만과 2년 이상 사이에 놓인다 (§104①4호)", () => {
    const under1y = calculateTransferTax(
      successorInput({ acquisitionDate: new Date("2025-09-01") }),
      mockRates,
    ).calculatedTax;
    const between = calculateTransferTax(
      successorInput({ acquisitionDate: new Date("2025-01-01") }),
      mockRates,
    ).calculatedTax;
    const over2y = calculateTransferTax(successorInput(), mockRates).calculatedTax;

    expect(under1y).toBeGreaterThan(between);
    expect(between).toBeGreaterThan(over2y);
  });

  it("V-3: 1세대1주택 비과세(§89①3호)가 입주권에 오적용되지 않는다", () => {
    // 주택 비과세 요건을 흉내 낸 세대 구성 — 입주권은 §89①3호의 「주택」이 아니다.
    const r = calculateTransferTax(
      successorInput({
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: 120,
        transferPrice: 500_000_000, // 12억 이하
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
    expect(r.transferGain).toBe(EXPECTED_GAIN);
  });
});

describe("원조합원 입주권 무변경 트립와이어", () => {
  /** 사례 36 CORE — §166①1호 (청산금 납부) */
  it("A-10: 원조합원은 §166 3분할을 그대로 탄다", () => {
    const r = calculateTransferTax(
      successorInput({
        isSuccessorRightToMoveIn: false,
        acquisitionDate: new Date("2002-04-09"),
        acquisitionPrice: 100_000_000,
        transferPrice: 520_000_000,
        transferDate: new Date("2023-03-02"),
      }),
      mockRates,
    );
    expect(r.redevelopmentDetail, "원조합원 경로는 본 PR에서 바뀌지 않는다").toBeDefined();
    // §166①1호: 인가전 = 권리가액 300,000,000 − 취득가액 100,000,000 = 200,000,000
    expect(r.redevelopmentDetail?.preApproval.gain).toBe(200_000_000);
    // 인가후(청산금 분) = 520,000,000 − (300,000,000 + 90,000,000) = 130,000,000
    expect(r.redevelopmentDetail?.settlement.gain).toBe(130_000_000);
  });
});
