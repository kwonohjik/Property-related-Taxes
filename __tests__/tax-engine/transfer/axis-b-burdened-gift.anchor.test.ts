/**
 * anchor — 축 B(지분 분할 취득) × 부담부증여(소령 §159) **채무 안분 규약**.
 *
 * 계획서: `docs/02-design/features/transfer-axis-b-burdened-gift.plan.md`
 *
 * ## 왜 엔진 무변경으로 되는가
 *
 * `transfer-tax-aggregate.ts`의 M-1이 카드를 **통째로 spread**해 단건 엔진을 부른다
 * (`{...(item as unknown as TransferTaxInput)}`). 그래서 카드에 `burdenedGiftInfo`와
 * `ownershipRatio`가 실리기만 하면 **STEP 0.48이 카드마다 돈다**.
 *
 * ## 🔴 축 A와 **반대** 규약 — 채무도 안분한다
 *
 * §159①1호는 `양도가액 = A × B/C`이고 **B/C(채무비율)는 물건 단위 하나**다.
 * `scaleBurdenedGiftInfo`는 A·C(평가액·기준시가)만 줄이고 B(채무)는 그대로 두는데,
 * 축 B에서 그대로 쓰면 **담보평가 항이 절대금액이라 C가 채무로 clamp**돼 B/C가 1을 넘는다:
 *
 * | 카드 | A | C = max(보충적, 담보) | B | B/C |
 * |---|---|---|---|---|
 * | 60% | 6억 | max(6억, **6억**) | **6억** | **1.0** 🔴 (정답 0.6) |
 * | 40% | 4억 | max(4억, **6억**) | **6억** | **1.5** 🔴 |
 *
 * ⇒ 채무·보증금·임대료·저당설정액도 **×지분율**로 안분해야 B/C가 보존된다.
 *
 * **축 A와 반대여도 모순이 아니다**: 축 A는 공유자마다 **별개 증여계약**이라 인수채무가
 * **사실**(사용자 입력)이고, 축 B는 갑 한 사람의 **하나의 계약**이라 tranche는 세법상
 * 계산 단위일 뿐이다 — 안분은 「미입력 추정」이 아니라 **산식이 요구하는 분할**이다.
 *
 * > 🔴 같은 필드가 축에 따라 반대로 처리된다 (`feedback_rename_same_name_two_axes`).
 * >   공통 헬퍼로 통합하지 말 것 — 축을 인자로 받아야 한다.
 *
 * ## 검증 기준
 *
 * **취득일을 같게 둔** 60% + 40% 2카드의 합계는 **단건 100%와 정확히 일치**해야 한다
 * (장특·세율 차이를 제거해 채무 규약만 관측한다). 취득일이 다르면 일치하지 않는 것이
 * 정상이며 그것은 §T-3이 따로 고정한다.
 *
 * ⚠️ 수치는 mock 세율표(`makeMockRates`) 실측값이지 「정본 세액」이 아니다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const rates = makeMockRates();

/** 물건 전체(100%) — 끝자리 1로 floor 판별력 확보 */
const WHOLE_STD_T = 1_000_000_001;
const WHOLE_STD_A = 500_000_001;
const DEPOSIT = 300_000_000;
const MORTGAGE = 300_000_000;

/** @param debtScale 채무 4필드에 곱할 비율. 축 B 규약이면 지분율, 위반이면 1 */
const info = (debtScale: number): BurdenedGiftInfo =>
  ({
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: Math.floor(DEPOSIT * debtScale),
    mortgageDebtAmount: Math.floor(MORTGAGE * debtScale),
    annualRentTotal: 0,
    donorRelation: "lineal_descendant",
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: WHOLE_STD_T,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: WHOLE_STD_A,
  }) as BurdenedGiftInfo;

const BASE = {
  propertyType: "housing" as const,
  transferType: "burdened_gift" as const,
  transferDate: new Date("2024-03-01"),
  transferPrice: 600_000_000,
  acquisitionPrice: 0,
  isOneHousehold: false,
  householdHousingCount: 2,
};

/** 지분 카드. 기준시가는 **물건 전체 raw** — 엔진이 ownershipRatio로 줄인다. */
const card = (
  id: string,
  ownershipRatio: number,
  debtScale: number,
  acquisitionDate = "2009-03-01",
) => ({
  propertyId: id,
  propertyLabel: id,
  ...baseTransferInput({
    ...BASE,
    acquisitionDate: new Date(acquisitionDate),
    burdenedGiftInfo: info(debtScale),
    ownershipRatio,
  }),
});

const single = () =>
  calculateTransferTax(
    baseTransferInput({
      ...BASE,
      acquisitionDate: new Date("2009-03-01"),
      burdenedGiftInfo: info(1),
    }) as never,
    rates,
  );

const agg = (cards: unknown[]) =>
  calculateTransferTaxAggregate(
    { taxYear: 2024, properties: cards as never, annualBasicDeductionUsed: 0 } as never,
    rates,
  );

const sumGain = (r: ReturnType<typeof agg>) =>
  r.properties.reduce((s, p) => s + (p.transferGain ?? 0), 0);

describe("축 B × 부담부증여 — 채무 안분 규약", () => {
  it("T-0 기준선: 단건 100% (양도가액 합 = 채무 B — §159 항등)", () => {
    const r = single();
    const b = r.transferBurdenedGiftBreakdown!;
    expect(b.perAsset.land.transferPrice + b.perAsset.building.transferPrice).toBe(600_000_000);
    expect(r.transferGain).toBe(291_000_000);
    expect(r.totalTax).toBe(64_600_360);
  });

  it("T-1 ✅ 채무도 안분: 60%+40% 합계가 단건 100%와 **정확히 일치**", () => {
    const r = agg([card("p1", 0.6, 0.6), card("p2", 0.4, 0.4)]);
    // 자산별 차익이 지분율에 정비례한다
    expect(r.properties[0].transferGain).toBe(174_600_000); // 291,000,000 × 0.6
    expect(r.properties[1].transferGain).toBe(116_400_000); // 291,000,000 × 0.4
    expect(sumGain(r)).toBe(291_000_000);
    expect(r.totalTax).toBe(64_600_360);
  });

  it("T-2 🔴 채무 미안분(축 A 규약)이면 세액이 2.9배로 뛴다 — 판별력", () => {
    const r = agg([card("p1", 0.6, 1), card("p2", 0.4, 1)]);
    // 60% 카드가 100% 카드와 같은 차익을 낸다 — C가 채무로 clamp돼 B/C=1이 됐다는 신호
    expect(r.properties[0].transferGain).toBe(291_000_000);
    // 40% 카드는 A<B라 더 크게 왜곡된다
    expect(r.properties[1].transferGain).toBe(394_000_000);
    expect(r.totalTax).toBe(187_374_000);
    expect(r.totalTax).toBeGreaterThan(64_600_360 * 2);
  });

  it("T-3 취득일이 다르면 단건과 일치하지 않는 것이 **정상**이다", () => {
    // 축 B의 존재 이유가 tranche별 보유기간이다 — 장특이 달라지므로 합계도 달라진다.
    // 「일치해야 한다」로 오해해 T-1의 기준을 여기 적용하지 말 것.
    const r = agg([card("p1", 0.6, 0.6), card("p2", 0.4, 0.4, "2020-03-01")]);
    expect(sumGain(r)).toBe(291_000_000); // 차익 자체는 보유기간과 무관 — 같다
    expect(r.totalTax).not.toBe(64_600_360); // 장특·세율이 갈려 세액은 다르다
  });

  it("T-4 §159 항등: 카드별 엔진 양도가액 합 = 채무 총액 (지분 무관)", () => {
    // 단건 엔진이 STEP 0.48에서 산정한 값으로 확인한다.
    const sum = [card("p1", 0.6, 0.6), card("p2", 0.4, 0.4)]
      .map((c) => calculateTransferTax(c as never, rates).transferBurdenedGiftBreakdown!)
      .reduce((s, b) => s + b.perAsset.land.transferPrice + b.perAsset.building.transferPrice, 0);
    expect(sum).toBe(600_000_000);
  });

  it("T-5 🟠 `PerPropertyBreakdown.transferPrice`는 **입력값 echo**다 — §159 override 미반영", () => {
    // 세액에는 영향이 없다(T-1이 일치를 고정한다). 그러나 **다건 결과뷰·신고서가 이 값을
    // 표시하면 틀린 양도가액이 뜬다** — 결과뷰 작업(계획서 §5)의 실제 과제다.
    // 현재 동작을 고정해 두어, 고칠 때 이 anchor가 함께 갱신되도록 한다.
    const r = agg([card("p1", 0.6, 0.6), card("p2", 0.4, 0.4)]);
    const echoed = r.properties.reduce((s, p) => s + (p.transferPrice ?? 0), 0);
    expect(echoed).toBe(1_200_000_000); // 카드 입력값 600,000,000 × 2
    expect(echoed).not.toBe(600_000_000); // §159 실제 양도가액과 다르다
  });
});
