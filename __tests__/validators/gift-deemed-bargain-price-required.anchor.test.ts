/**
 * anchor — §35 저가양수·고가양도의 **거래대가 필수**(A16)
 *
 * 코드리뷰 2026-09 A16 · 실측 +600,000,000원 과다산정.
 *
 * ⑧이 시가 한 필드만 보고 거래대가를 검증하지 않아 **미입력이 0원으로 통과**했다.
 * `parseAmount`가 빈 문자열을 0으로 되돌리고 ⑫도 `z.number().nonnegative()`라 0을
 * 통과시키므로, 시가 10억·대가 공란이면 차액 10억에서 기준금액을 뺀
 * **증여재산가액 700,000,000원**이 산출됐다(정상 대가 6억이면 100,000,000원).
 * 결과 화면의 「증여세 마법사로」 버튼까지 렌더돼 그 값이 다음 계산으로 연계된다.
 *
 * ## 논거 (사용자 결정 2026-09-02 — 「미입력만 차단」)
 *
 * 저장소의 「미입력은 검증 오류로 차단」 정책 + **같은 파일 유형 간 일관성**이다:
 *   `insurance` — 납부보험료 총액 > 0 차단 · `debt_forgiveness` — 채무액 > 0 차단
 * §35만 금액 필드를 안 막고 있었다.
 *
 * ⚠️ **명시 「0」은 막지 않는다.** 미입력과 명시 0은 ④ 이후 완전히 동일한 wire
 *    (`transactionPrice: 0`)를 만들어 ⑫⑭·엔진 어디서도 구분되지 않는다 — 구분이 가능한
 *    유일한 지점인 ⑧에서 **원문자열**로 가른다. 무상이전(대가 0)이 §35 대상인지는
 *    「상속세 및 증여세법」 §4①1호 ↔ §4①2호 구분의 문제로 **별건**이다.
 *    ⇒ ⑫에 `positive()`를 걸거나 union superRefine을 넣는 접근은 **원리적으로 무의미**하다
 *      (Zod는 wire만 보므로 두 입력을 구분할 수단이 없다).
 */
import { describe, it, expect } from "vitest";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import type { DeemedFormState } from "@/components/calc/deemed-gift/shared";

function bargainForm(over: Partial<DeemedFormState> = {}): DeemedFormState {
  return {
    type: "bargain_transfer",
    giftDate: "2024-06-01",
    bargMarketValue: "1000000000",
    bargPrice: "600000000",
    ...over,
  } as DeemedFormState;
}

describe("[A16] §35 거래대가 필수", () => {
  it("A16-1(회귀): 시가·대가가 모두 있으면 통과", () => {
    expect(validateDeemedInput(bargainForm())).toBeNull();
  });

  it("A16-2: 거래대가 미입력 → 차단 (종전에는 0원으로 통과해 700,000,000원을 산출했다)", () => {
    expect(validateDeemedInput(bargainForm({ bargPrice: "" }))).toBe("거래대가를 입력하세요");
  });

  it("A16-3: 공백만 있어도 차단", () => {
    expect(validateDeemedInput(bargainForm({ bargPrice: "   " }))).toBe("거래대가를 입력하세요");
  });

  it("A16-4(경계): 명시 「0」은 통과시킨다 — 무상이전 논점은 별건이다", () => {
    expect(validateDeemedInput(bargainForm({ bargPrice: "0" }))).toBeNull();
  });

  it("A16-5(회귀): 시가 차단이 거래대가 차단보다 먼저다", () => {
    expect(validateDeemedInput(bargainForm({ bargMarketValue: "", bargPrice: "" }))).toBe(
      "시가를 입력하세요",
    );
  });
});
