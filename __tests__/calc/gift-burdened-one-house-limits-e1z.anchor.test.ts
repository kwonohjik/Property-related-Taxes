/**
 * E-1 한계(e1z) — 증여세 부담부증여 양도 경로의 남은 갭 · ⑧ 검증 · ③ 복원 · 게이트 leaf.
 *
 * ⑧은 양도세 계산기·판정 메뉴와 **같은 규칙·문구**를 ⑤·④와 **같은 게이트**로 건다.
 */
import { describe, it, expect } from "vitest";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

function landItem(over: Partial<BurdenedGiftTransferTaxInput> = {}, base: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "land-1",
    category: "real_estate_land",
    name: "테스트 토지",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2020-06-01"),
      standardPriceAtAcquisition: 150_000_000,
      ...over,
    },
    ...base,
  } as EstateItem;
}
const form = (giftDate: string, it: EstateItem): FormState =>
  ({ ...INITIAL_FORM, giftDate, donor: "father", giftItems: [it] }) as FormState;
/** 부담부증여 양도세 검증이 있는 단계 — 증여재산 단계(1) */
const v = (giftDate: string, it: EstateItem) => validateStep(1, form(giftDate, it));

describe("G1 ⑧ 상속받은 토지 — ④가 원인을 싣는 순간 ⑫ refine 필수값(피상속인 취득일)을 같이 막는다", () => {
  it("V-G1-1 ★ 상속인데 피상속인 취득일 없음 → 차단 · 상속개시일 이후 → 차단", () => {
    expect(v("2021-06-01", landItem({ acquisitionCause: "inheritance" }))).toContain(
      "상속받은 자산이면 피상속인 취득일을 입력",
    );
    expect(
      v("2021-06-01", landItem({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2020-06-01" })),
    ).toContain("피상속인 취득일은 상속개시일보다 이전");
  });
  it("V-G1-2 부정 짝 — 사실을 다 넣으면 통과 · 비주택의 stale 동일세대 값은 막지 않는다 · 원인 매매면 보지 않는다", () => {
    expect(v("2021-06-01", landItem({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-01-01" }))).toBeNull();
    expect(
      v(
        "2021-06-01",
        landItem({
          acquisitionCause: "inheritance",
          decedentAcquisitionDate: "2010-01-01",
          decedentSameHouseholdBeforeInheritance: true,
        }),
      ),
    ).toBeNull();
    expect(v("2021-06-01", landItem({ acquisitionCause: "purchase" }))).toBeNull();
  });
});
