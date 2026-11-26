/**
 * §101② 판정 화면 — reasonCode·확인 필요 → 문구 매핑
 *
 * 문구는 사용자 지정 원문이다(법령 표현 임의 변경 금지). 키 누락은 `satisfies`가 컴파일 단계에서 잡고,
 * 여기서는 (1) 모든 코드에 비어 있지 않은 문구가 있고 (2) 지정 원문과 글자 그대로 같고 (3) 날짜 포맷이 맞는지 본다.
 */
import { describe, it, expect } from "vitest";
import type { GiftResaleConfirmation, GiftResaleReasonCode } from "@/lib/tax-engine/gift-resale-101-2";
import {
  GIFT_RESALE_APPLIED_EXTRA,
  GIFT_RESALE_CONFIRMATION_TEXT,
  formatGiftResaleDate,
  giftResaleReasonText,
} from "@/lib/calc/gift-resale-101-2-labels";

const CTX = { periodYears: 10 as const, deadline: "2036-02-01T00:00:00.000Z" };

const ALL_REASONS: GiftResaleReasonCode[] = [
  "applied",
  "clause1_not_less",
  "attributed_to_donee",
  "period_exceeded",
  "relation_none",
  "relation_spouse_lineal",
  "burdened_gift",
  "donor_deceased",
  "before_2013",
];
const ALL_CONFIRMATIONS: GiftResaleConfirmation[] = ["other_transfers_same_year", "gift_tax_includes_other_assets"];

describe("giftResaleReasonText", () => {
  it.each(ALL_REASONS)("%s — 비어 있지 않은 문구", (code) => {
    expect(giftResaleReasonText(code, CTX).length).toBeGreaterThan(10);
  });

  it("지정 원문과 글자 그대로 같다", () => {
    const expected: Record<Exclude<GiftResaleReasonCode, "period_exceeded">, string> = {
      applied:
        "부인 적용 — 증여자가 그 자산을 직접 양도한 것으로 봅니다(§101②). 수증자는 연대하여 납세의무를 지고(§2의2③), 당초 증여받은 자산에는 증여세를 부과하지 않습니다(§101③).",
      clause1_not_less:
        "미적용 — 1호 세액(증여세 + 수증자 양도소득세)이 2호 세액(증여자가 직접 양도한 경우의 양도소득세)보다 적지 않습니다.",
      attributed_to_donee: "미적용 — 양도소득이 수증자에게 실질적으로 귀속됐습니다(§101② 단서).",
      relation_none: "미적용 — 증여자와 수증자가 특수관계인(소득세법 시행령 §98①)이 아닙니다.",
      relation_spouse_lineal:
        "배우자·직계존비속 증여는 이 판정 대상이 아닙니다. 양도세 계산기의 「배우자등 이월과세」(§97의2)로 계산하세요. 이월과세가 배제되는 경우(§97의2②)에 §101②가 적용되는지는 해석례가 없어 다루지 않습니다.",
      burdened_gift: "부담부증여는 지원하지 않습니다 — 채무 부분은 양도이고 증여 부분만 §101② 대상이라 나누어 입력해야 합니다.",
      donor_deceased:
        "양도일 현재 증여자가 사망한 경우는 판정하지 않습니다 — 구 해석례(재일46014-668)에 미적용으로 본 사례가 있으나 현행 적용은 확인이 필요합니다.",
      before_2013: "2013.1.1. 전 양도는 지원하지 않습니다.",
    };
    for (const [code, text] of Object.entries(expected)) {
      expect(giftResaleReasonText(code as GiftResaleReasonCode, CTX)).toBe(text);
    }
  });

  it("period_exceeded — 연수와 기한(YYYY.M.D.)이 들어간다", () => {
    expect(giftResaleReasonText("period_exceeded", CTX)).toBe(
      "미적용 — 증여 등기접수일부터 10년(2036.2.1.)이 지난 뒤 양도했습니다.",
    );
    expect(giftResaleReasonText("period_exceeded", { periodYears: 5, deadline: "2027-12-31T00:00:00.000Z" })).toBe(
      "미적용 — 증여 등기접수일부터 5년(2027.12.31.)이 지난 뒤 양도했습니다.",
    );
  });

  it("부인 적용 추가 줄", () => {
    expect(GIFT_RESALE_APPLIED_EXTRA).toBe("이미 낸 증여세의 환급 절차는 확인이 필요합니다.");
  });
});

describe("GIFT_RESALE_CONFIRMATION_TEXT", () => {
  it.each(ALL_CONFIRMATIONS)("%s — 비어 있지 않은 문구", (code) => {
    expect(GIFT_RESALE_CONFIRMATION_TEXT[code].length).toBeGreaterThan(10);
  });

  it("지정 원문과 글자 그대로 같다", () => {
    expect(GIFT_RESALE_CONFIRMATION_TEXT.other_transfers_same_year).toBe(
      "같은 해 다른 양도가 있습니다 — 1·2호의 양도소득세를 그 해 전체 결정세액으로 볼지 이 자산 몫으로 볼지 해석이 확인되지 않았습니다. 넣은 금액에 따라 결론이 달라질 수 있어 확인이 필요합니다.",
    );
    expect(GIFT_RESALE_CONFIRMATION_TEXT.gift_tax_includes_other_assets).toBe(
      "증여세에 다른 증여재산이 포함돼 있습니다 — 이 자산 몫을 나누는 방법은 §101②에 명문이 없습니다(인접 규정: 소득세법 시행령 §163의2② 이월과세 증여세 상당액 안분). 확인이 필요합니다.",
    );
  });
});

describe("formatGiftResaleDate", () => {
  it("ISO → YYYY.M.D. (월·일 앞 0 제거)", () => {
    expect(formatGiftResaleDate("2033-03-01T00:00:00.000Z")).toBe("2033.3.1.");
    expect(formatGiftResaleDate("2036-12-31")).toBe("2036.12.31.");
  });
  it("해석할 수 없으면 원문 그대로", () => {
    expect(formatGiftResaleDate("미정")).toBe("미정");
  });
});
