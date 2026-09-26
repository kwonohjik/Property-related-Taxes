/**
 * 별지 제10호서식 부표 1 ⑧ 평가기준코드 — 증여의제 산정액 축 anchor (리뷰 7단계 7-B)
 *
 * 「상속세 및 증여세법 시행규칙」 별지 제10호서식 부표 1 뒷면 작성방법 7 「⑧ 평가기준코드」란:
 *   코드 **01** = "해당 재산의 매매거래가액(「상속세 및 증여세법」 제60조)"
 *   코드 **08** = "기준시가 등 보충적 평가가액(「상속세 및 증여세법」 제61조부터 제65조)"
 * (총 8종, 이 외 코드 없음)
 *
 * §39 증여이익은 「상증령」§29②의 **법정 산식 산정액**이고 신주 인수는 자본거래이지
 * 매매거래가 아니다. 그런데 이관 payload가 그 금액을 `marketValue`에 실으므로
 * `resolveValuationMethod`가 `market_value`로 판정해 ⑧에 **01**이 인쇄됐다.
 *
 * ⚠️ 법령에서 도출되는 것은 **「01은 틀렸다」**뿐이다. 08의 법정 설명(「§61~§65로 평가한
 * 가액」)도 §39 증여이익 자체에는 정확히 들어맞지 않는다 — 08은 **이 저장소의 확립된
 * fallback**(같은 서식의 사전증여 행이 이미 08을 하드코딩한다)이라는 근거로만 선택한다.
 *
 * 판정은 `id`가 `deemed-`로 시작한다는 **사실**이 아니라 명시 필드
 * `isStatutoryFormulaValue`로 한다 — id 접두어는 표시용 문자열이라 언제든 바뀐다.
 */

import { describe, it, expect } from "vitest";
import { toEstateItemValuationMethodCode } from "@/components/calc/results/inheritance-filing-form-helpers";
import { buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-prefill";
import { INITIAL_DEEMED } from "@/components/calc/deemed-gift/deemed-form-state";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { PropertyValuationResult } from "@/lib/tax-engine/types/inheritance-gift.types";

function item(over: Partial<EstateItem> = {}): EstateItem {
  return { id: "x", category: "other", name: "항목", marketValue: 100_000_000, ...over };
}
const marketVr = { method: "market_value" } as unknown as PropertyValuationResult;
const stdVr = { method: "standard_price" } as unknown as PropertyValuationResult;

describe("[VM] ⑧ 평가기준코드 — 법정 산식 산정액", () => {
  it("[VM-1] 증여의제 산정액 표지가 붙은 항목은 market_value여도 08", () => {
    expect(
      toEstateItemValuationMethodCode(item({ isStatutoryFormulaValue: true }), marketVr),
    ).toBe("08");
  });

  // 긍정 짝 — 표지가 없으면 종전 매핑 그대로여야 한다.
  // 이 짝이 없으면 「전부 08」로 밀어버리는 과잉 수정이 통과한다.
  it("[VM-2] 긍정 짝: 표지 없는 기타재산 + market_value → 01 (종전 보존)", () => {
    expect(toEstateItemValuationMethodCode(item(), marketVr)).toBe("01");
  });
  it("[VM-3] 긍정 짝: 표지 없는 부동산 + market_value → 01 (GV-7과 동형)", () => {
    expect(
      toEstateItemValuationMethodCode(item({ category: "real_estate_land" }), marketVr),
    ).toBe("01");
  });
  it("[VM-4] cash는 표지와 무관하게 06 — 현금 우선 규칙이 살아 있다", () => {
    expect(
      toEstateItemValuationMethodCode(item({ category: "cash", isStatutoryFormulaValue: true }), marketVr),
    ).toBe("06");
  });
  it("[VM-5] 표지 + standard_price → 08 (원래 08이던 경로에 무영향)", () => {
    expect(
      toEstateItemValuationMethodCode(item({ isStatutoryFormulaValue: true }), stdVr),
    ).toBe("08");
  });
});

describe("[VM] 배선 — 이관 payload가 실제로 표지를 싣는다", () => {
  // 라이브러리 anchor만으로는 「헬퍼가 옳다」밖에 증명하지 못한다.
  // 실제 §39 이관 경로가 그 필드를 채우는지를 따로 고정한다.
  it("[VM-6] §39 저가 실권주 재배정 이관 항목에 isStatutoryFormulaValue가 있다", () => {
    const result = calcCapitalIncreaseGift({
      direction: "low",
      subType: "forfeited_realloc",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 5_000,
      issuedShares: 50_000,
      forfeitedShares: 20_000,
    });
    expect(result.deemedGiftValue).toBeGreaterThan(0);
    const payload = buildGiftWizardPrefill(
      { ...INITIAL_DEEMED, type: "capital_increase" },
      result,
    );
    expect(payload.giftItems?.length).toBeGreaterThan(0);
    expect(payload.giftItems?.[0].isStatutoryFormulaValue).toBe(true);
  });
});
