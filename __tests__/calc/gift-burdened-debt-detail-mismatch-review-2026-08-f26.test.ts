/**
 * F26 — 증여세 폼 부담부증여: §159 양도가액 B가 §47① 인수채무가 아니라 §66 평가용 칸에서
 * 파생돼 양도소득세가 조용히 0원이 되거나 과대해지던 결함의 회귀 anchor (코드리뷰 2026-08).
 *
 * ## 결함
 * ④ `buildGiftBurdenedTransferBody`는 `item.leaseDeposit`·`item.mortgageAmount`를 엔진
 * `burdenedGiftInfo.lendingDepositTotal`·`mortgageDebtAmount` 슬롯에 싣고, 엔진은 그 **합**을
 * §159의 양도가액 B(= 채무비율 분자)로 쓴다. 그런데 증여세 폼에서 그 두 칸은 §66 평가 하한
 * 목적이고 실제 인수채무는 `assumedDebtForGift`(§47①)라 **축이 다르다**. ⑧은 §47①이 0인지만
 * 보았을 뿐 두 축의 일치를 요구하지 않았다.
 *
 * ## 수정 전 실측 (공시가 8억 · 취득시 기준시가 4억 · 취득 2009-06-01 · 증여 2024-03-01 · 아파트)
 * | 케이스 | §47① | §66 두 칸 | validateStep(1) | 엔진 B | 결정세액 |
 * |---|---|---|---|---|---|
 * | D1 | 5억 | 공란       | **null(통과)** | **0**   | **0원** (정답 45,458,000 전액 소실) |
 * | D3 | 3억 | 3억+2억    | **null(통과)** | **5억** | 45,458,000 (정답 20,351,000 · 25,107,000 과대) |
 * | D4 | 3억 | 3억+0      | null(통과)     | 3억     | 20,351,000 (정답) |
 * | D2 | 5억 | 3억+2억    | null(통과)     | 5억     | 45,458,000 (정답) |
 *
 * ## 수정 범위 — ⑧ 불일치 차단만
 * 엔진 슬롯의 의미는 바꿀 수 없다. 같은 슬롯을 양도세 마법사 자체 경로
 * (`lib/calc/transfer-tax-api-burdened-gift.ts:107-108` ← `BurdenedGiftBlock`의 "실제 채무잔액" 칸)와
 * §47③ 초과부담부 차단(`lib/tax-engine/burdened-gift-eligibility.ts:56-57`)이 **인수채무**로 쓰고
 * 있고, 엔진 anchor 10여 파일이 현행 산식을 고정한다. 「인수채무 명시 축 신설」은 설계상
 * 「일부 인수」 비범위라 별도 PR이다. ⇒ 두 축이 같은 값이 되도록 ⑧에서 강제한다.
 *
 * 세액 산식은 변하지 않는다 — 침묵 오산(D1·D3)이 **차단 메시지**로 바뀐다.
 */
import { describe, it, expect } from "vitest";
import {
  validateStep,
  INITIAL_FORM,
  type FormState,
} from "@/components/calc/gift-tax-form-shared";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const STEP1 = 1;
const MISMATCH = "임대보증금·저당권 채무액의 합계";

function aptItem(over: Partial<EstateItem>): EstateItem {
  return {
    id: "asset1",
    category: "real_estate_apartment",
    name: "아파트",
    standardPrice: 800_000_000,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2009-06-01"),
      standardPriceAtAcquisition: 400_000_000,
      valuationMode: "sangjeungbeop_standard",
      isHousing: true,
    },
    ...over,
  } as unknown as EstateItem;
}

function form(item: EstateItem): FormState {
  return { ...INITIAL_FORM, giftDate: "2024-03-01", giftItems: [item], stockItems: [] };
}

/** 엔진 §159 양도가액 B = lendingDepositTotal + mortgageDebtAmount (④ 실측 고정) */
function engineB(item: EstateItem): number {
  const bgi = buildGiftBurdenedTransferBody(item, form(item)).burdenedGiftInfo as Record<
    string,
    number
  >;
  return (bgi.lendingDepositTotal ?? 0) + (bgi.mortgageDebtAmount ?? 0);
}

describe("[F26] 증여세 폼 부담부증여 — §47① ↔ §66 채무 칸 불일치 차단", () => {
  it("BG-1 (D1): §47① 5억인데 §66 두 칸이 공란이면 차단한다 — 종전엔 통과 후 세액 0원", () => {
    const item = aptItem({ assumedDebtForGift: 500_000_000 });
    // 결함의 크기를 함께 고정: 이 입력이 통과하면 엔진 B가 0이 되어 양도소득세가 통째로 사라진다.
    expect(engineB(item)).toBe(0);

    const msg = validateStep(STEP1, form(item));
    expect(msg).not.toBeNull();
    expect(msg).toContain(MISMATCH);
    expect(msg).toContain("500,000,000");
  });

  it("BG-2 (D3): §47① 3억 + §66 합계 5억 불일치를 차단한다 — 종전엔 25,107,000 과대", () => {
    const item = aptItem({
      assumedDebtForGift: 300_000_000,
      leaseDeposit: 300_000_000,
      mortgageAmount: 200_000_000,
    });
    expect(engineB(item)).toBe(500_000_000); // §47①(3억)이 아니라 §66 두 칸의 합이 B가 된다

    const msg = validateStep(STEP1, form(item));
    expect(msg).not.toBeNull();
    expect(msg).toContain(MISMATCH);
  });

  it("BG-3 (D4): 일치하면 통과한다 — 저당권 0원도 정상 입력", () => {
    const item = aptItem({
      assumedDebtForGift: 300_000_000,
      leaseDeposit: 300_000_000,
      mortgageAmount: 0,
    });
    expect(engineB(item)).toBe(300_000_000);
    expect(validateStep(STEP1, form(item))).toBeNull();
  });

  it("BG-4 (D2): 두 칸으로 나누어 합계가 맞으면 통과한다", () => {
    const item = aptItem({
      assumedDebtForGift: 500_000_000,
      leaseDeposit: 300_000_000,
      mortgageAmount: 200_000_000,
    });
    expect(engineB(item)).toBe(500_000_000);
    expect(validateStep(STEP1, form(item))).toBeNull();
  });

  it("BG-5: §47① 미입력(0)은 기존 C-4 메시지가 먼저 잡는다 (검사 순서 고정)", () => {
    const item = aptItem({ assumedDebtForGift: 0, leaseDeposit: 100_000_000 });
    const msg = validateStep(STEP1, form(item));
    expect(msg).toContain("수증자 인수 채무액(§47①)을 입력하세요");
    expect(msg).not.toContain(MISMATCH);
  });

  it("BG-6: 양도소득세 토글 OFF 자산에는 이 차단이 걸리지 않는다", () => {
    const item = {
      id: "asset1",
      category: "real_estate_apartment",
      name: "아파트",
      standardPrice: 800_000_000,
      assumedDebtForGift: 500_000_000,
    } as unknown as EstateItem;
    expect(validateStep(STEP1, form(item))).toBeNull();
  });
});
