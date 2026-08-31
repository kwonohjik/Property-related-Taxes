/**
 * anchor — §127⑦ 트랙 교차 차단 (D10-01)
 *
 * 결함: §127⑦ 중복배제 max는 `calcReductions`의 **세액감면형 후보 안에서만** 돈다.
 * 소득차감형(§90② — 양도소득금액 차감)은 STEP 4.6에서 별도로 소득을 깎으므로,
 * 두 트랙을 동시에 선택하면 §127⑦을 우회해 **이중 혜택**이 된다.
 *
 * 실측 재현(§99 신축 차감형 + §77 공익수용 세액감면형, 900,000,000 양도):
 * ```
 * §99 단독(차감형)      결정 120,060,000   ← §127⑦상 정답(납세자 유리)
 * §77 단독(세액감면형)   결정 152,154,000
 * 둘 다 선택            결정 104,024,590   ← 16,035,410 과소
 * ```
 *
 * 조치: §127⑦은 「거주자가 토지등을 양도하여 둘 이상의 양도소득세의 감면규정을 동시에
 * 적용받는 경우에는 **그 거주자가 선택하는** 하나의 감면규정만을 적용한다」로 **납세자에게
 * 선택권**을 준다 ⇒ 엔진이 임의로 유리한 쪽을 고르는 대신 ⑧ validate가 동시 선택을 차단하고
 * 각각 계산해 비교하도록 안내한다(소득세법 §90②이 차감방식도 「양도소득세를 감면한다」임을
 * 명시하므로 두 트랙 모두 §127⑦의 「감면규정」에 해당한다).
 *
 * ⚠️ 하이브리드 8종은 5년 **이내**면 세액감면형이라 §127⑦ max에 합류한다 — 그때는
 *    이중 혜택이 없으므로 **차단하면 안 된다**(과잉 차단). 5년 축이 판정을 가른다.
 */
import { describe, it, expect } from "vitest";
import {
  isIncomeDeductionTrack,
  isTaxAmountTrack,
} from "@/lib/tax-engine/transfer-reductions/income-deduction-router";

describe("트랙 판정 — 항상 소득차감형", () => {
  it.each(["new_99", "new_99_3", "unsold_98_8"])("%s는 5년 여부와 무관하게 차감형", (id) => {
    expect(isIncomeDeductionTrack(id, true)).toBe(true);
    expect(isIncomeDeductionTrack(id, false)).toBe(true);
    expect(isTaxAmountTrack(id, true)).toBe(false);
    expect(isTaxAmountTrack(id, false)).toBe(false);
  });
});

describe("트랙 판정 — 하이브리드는 5년 축으로 갈린다", () => {
  const HYBRIDS = ["unsold_98_7", "unsold_99_2", "unsold_98_3", "unsold_98_5", "unsold_98_6", "unsold_98_2", "unsold_98_4", "unsold_98"];

  it.each(HYBRIDS)("%s — 5년 이내는 세액감면형(§127⑦ max 합류)", (id) => {
    expect(isTaxAmountTrack(id, true)).toBe(true);
    expect(isIncomeDeductionTrack(id, true)).toBe(false);
  });

  it.each(HYBRIDS)("%s — 5년 후는 차감형(§127⑦ 우회)", (id) => {
    expect(isIncomeDeductionTrack(id, false)).toBe(true);
    expect(isTaxAmountTrack(id, false)).toBe(false);
  });
});

describe("트랙 판정 — 세액감면형", () => {
  it.each([
    "rental_97_main", "rental_97_proviso", "rental_97_2", "rental_97_5",
    "self_farming", "public_expropriation", "gb_designated_land", "replacement_land_comp",
  ])("%s는 세액감면형", (id) => {
    expect(isTaxAmountTrack(id, false)).toBe(true);
    expect(isIncomeDeductionTrack(id, false)).toBe(false);
  });

  it("§97의3은 장특공제 대체라 두 트랙 어디에도 속하지 않는다", () => {
    expect(isIncomeDeductionTrack("rental_97_3", false)).toBe(false);
    expect(isTaxAmountTrack("rental_97_3", false)).toBe(false);
  });

  it("주택수 제외 조문도 두 트랙 밖이다 — 감면세액을 만들지 않는다", () => {
    for (const id of ["new_99_4_rural", "new_99_4_hometown", "unsold_98_9"]) {
      expect(isIncomeDeductionTrack(id, false), id).toBe(false);
      expect(isTaxAmountTrack(id, false), id).toBe(false);
    }
  });
});

describe("교차 조합 — 재현된 결함 조합이 두 트랙으로 판정된다", () => {
  it("§99(차감형) + §77(세액감면형)이 서로 다른 트랙이다", () => {
    expect(isIncomeDeductionTrack("new_99", false)).toBe(true);
    expect(isTaxAmountTrack("public_expropriation", false)).toBe(true);
  });

  it("§98의3(5년 이내) + §77은 둘 다 세액감면형 — §127⑦ max가 처리하므로 교차가 아니다", () => {
    expect(isTaxAmountTrack("unsold_98_3", true)).toBe(true);
    expect(isTaxAmountTrack("public_expropriation", true)).toBe(true);
    expect(isIncomeDeductionTrack("unsold_98_3", true)).toBe(false);
  });
});
