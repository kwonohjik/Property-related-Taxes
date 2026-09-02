// §97의3 풀 파이프라인 통합 anchor — plan §6 P2 B-1 (법정 산식 직접 계산, 35% 구간 검산 완료)
//
// 시나리오: 2주택자(비조정— 중과 없음)가 장기일반민간임대 등록 주택(취득 즉시 임대) 10년 임대 후 양도.
//   양도가 8억 − 취득가 3억 = 양도차익 5억
//   장특공제 (§97의3 특례 70%·ratio=1) = 350,000,000
//   양도소득금액 = 150,000,000 → 기본공제 §103 250만 → 과세표준 147,500,000
//   산출세액 (§55: 8,800만 초과~1.5억 이하 35%·누진공제 15,440,000) = 36,185,000
//   §97의3은 세액감면 아님 → reductionAmount = 0
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

describe("§97의3 통합 anchor (B-1)", () => {
  const rates = makeMockRates();

  function input973() {
    return baseTransferInput({
      propertyType: "housing",
      transferPrice: 800_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2014-01-01"),
      transferDate: new Date("2024-06-01"),
      isOneHousehold: true,
      householdHousingCount: 2, // 거주주택 + 임대주택 — 12억 비과세 미적용
      isRegulatedArea: false,
      residencePeriodMonths: 0,
      reductions: [
        {
          type: "rental_97_3",
          registrationDate: new Date("2014-01-01"),
          rentalStartDate: new Date("2014-01-01"),
          isTaxRegistered: true,
          rentIncreaseViolated: false,
          officialPriceAtStart: 400_000_000,
          isNationalHousingScale: true,
          region: "capital",
          propertyType: "non_apartment",
          rentalHousingType: "long_term_private",
          isConvertedFromShortTerm: false,
        },
      ],
    });
  }

  it("B-1: 장특공제 3.5억 (70%)·과세표준 147,500,000·산출세액 36,185,000·감면 0", () => {
    const result = calculateTransferTax(input973(), rates);

    expect(result.isExempt).toBe(false);
    expect(result.transferGain).toBe(500_000_000);
    expect(result.longTermHoldingDeduction).toBe(350_000_000);
    expect(result.longTermHoldingRate).toBeCloseTo(0.7, 10);
    expect(result.taxBase).toBe(147_500_000);
    expect(result.calculatedTax).toBe(36_185_000);
    // §97의3은 장특공제율 특례 — 세액감면 아님
    expect(result.reductionAmount).toBe(0);
    // echo 필드
    expect(result.rental97LthdDetail?.isEligible).toBe(true);
  });

  it("B-1 대조군: §97의3 미적용 시 장특 일반율 (10년 보유 표1 20%) → 공제 1억", () => {
    const noReduction = { ...input973(), reductions: [] };
    const result = calculateTransferTax(noReduction, rates);
    expect(result.longTermHoldingDeduction).toBe(100_000_000); // 5억 × 10년 × 2%
    expect(result.rental97LthdDetail).toBeUndefined();
  });

  it("불적격 (기준시가 6억 초과) → 특례 미적용·일반율 + 사유 echo", () => {
    /**
     * 🔁 **2026-09-02 픽스처 정정** — `acquisitionDate`를 공통 픽스처(2014-01-01)에서
     * **2019-01-01**로 옮겼다. 4호(기준시가 한도)는 대통령령 **제29241호**(2018.10.23 시행)에서
     * 신설됐고 부칙 §2②1호가 「**2018년 9월 13일 이전에 주택을 취득**한 경우 종전의 규정에
     * 따른다」고 정하므로, 2014년 취득 사안은 애초에 **4호 적용 대상이 아니다**.
     * 이 케이스의 의도(한도 초과 → 특례 탈락 → 일반율)는 그대로다. 보유기간이 10년 → 5년으로
     * 줄어 표1이 20% → 10%가 되므로 공제 기대값도 함께 갱신했다(5억 × 10%).
     * 부칙 축은 `rental-973-clause4-addenda-gate.anchor.test.ts`가 잠근다.
     */
    const base = input973();
    const ineligible = {
      ...base,
      acquisitionDate: new Date("2019-01-01"),
      reductions: [{ ...base.reductions[0], officialPriceAtStart: 700_000_000 } as (typeof base.reductions)[0]],
    };
    const result = calculateTransferTax(ineligible, rates);
    expect(result.longTermHoldingDeduction).toBe(50_000_000); // 일반율 10% (보유 5년)
    expect(result.rental97LthdDetail?.isEligible).toBe(false);
  });
});


// ─────────────────────────────────────────────────────────────────
// PR-1 D-9 — 결과 카드 산식 표시용 echo 배선 anchor
//
// ⚠️ 카드 렌더 테스트(__tests__/components/transfer-reduction-formula-cards.test.tsx)는
//    detail을 fixture로 직접 주입하므로 **엔진의 echo 주입을 지키지 못한다**
//    (mutation으로 실측 확인 — echo를 제거해도 카드 테스트는 전건 통과했다).
//    그래서 엔진 단계에서 별도로 고정한다.
// ─────────────────────────────────────────────────────────────────
describe("§97의3 — 결과 카드 산식 echo (D-9)", () => {
  const rates = makeMockRates();

  it("공제액 산출에 쓰인 값이 rental97LthdDetail에 echo된다", () => {
    const result = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 800_000_000,
        acquisitionPrice: 300_000_000,
        acquisitionDate: new Date("2014-01-01"),
        transferDate: new Date("2024-06-01"),
        isOneHousehold: true,
        householdHousingCount: 2,
        isRegulatedArea: false,
        residencePeriodMonths: 0,
        reductions: [
          {
            type: "rental_97_3",
            registrationDate: new Date("2014-01-01"),
            rentalStartDate: new Date("2014-01-01"),
            isTaxRegistered: true,
            rentIncreaseViolated: false,
            officialPriceAtStart: 400_000_000,
            isNationalHousingScale: true,
            region: "capital",
            propertyType: "non_apartment",
            rentalHousingType: "long_term_private",
            isConvertedFromShortTerm: false,
          },
        ],
      }),
      rates,
    );
    const raw = result.rental97LthdDetail;
    expect(raw).toBeDefined();
    // union narrowing — echo는 LTHD 특례 효과(RentalLthdEffect)에만 있다
    if (!raw || !raw.isEligible || raw.effectCategory !== "long_term_holding_special") {
      throw new Error("§97의3 LTHD 특례가 적용되지 않았다 — anchor 전제 실패");
    }
    const d = raw;
    // echo 4종 — 카드가 「양도차익 × 특례율 = 공제액」 산식을 값으로 쓰는 근거
    expect(d.gainApplied).toBe(500_000_000);
    expect(d.deductionApplied).toBe(350_000_000);
    expect(d.rentalGainApplied).toBe(500_000_000); // ratio=1 → 전액 임대분
    expect(d.nonRentalGainApplied).toBe(0);
    expect(d.baseLthdRate).toBeGreaterThan(0); // 일반 공제율(§95② 표)
    // echo는 표시 전용 — 실제 공제액과 반드시 일치해야 한다(드리프트 방지)
    expect(d.deductionApplied).toBe(result.longTermHoldingDeduction);
  });
});
