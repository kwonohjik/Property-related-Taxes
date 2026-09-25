import { describe, it, expect } from "vitest";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/deemed-form-state";

/**
 * ⑧ — 1-A 비율 인자의 **부분 입력 차단**.
 *
 * 엔진은 인자가 빠지면 종전 동작(가중 없음)으로 되돌아간다(하위호환). 그 fallback은 API
 * 호출자·기존 anchor를 위한 것이고, **UI 경로에서는 조용한 과다과세**가 된다 —
 * 사용자는 값을 넣었다고 믿는데 한 칸이 비어 가중이 통째로 사라지기 때문이다.
 * ⇒ validate가 세 인자를 모두 요구한다. 이 단언이 없으면 ⑧ 완화가 아무 데서도 안 잡힌다.
 */
const base = (over: Partial<DeemedFormState>): DeemedFormState => ({
  ...INITIAL_DEEMED,
  type: "capital_increase",
  giftDate: "2025-03-15",
  ciPrePrice: "10000",
  ciPreShares: "100000",
  ciNewPrice: "5000",
  ciIssuedShares: "50000",
  ciForfeitedShares: "30000",
  ...over,
});

describe("§39 증자 비율 인자 — ⑧ 부분 입력 차단", () => {
  const LOW_NR = { ciDirection: "low", ciSubType: "no_realloc" } as const;

  const FULL_LOW_NR = { ciEqualIssueShares: "100000", ciRelatedAcquiredShares: "30000", ciPostHeldShares: "75000", ciPostTotalShares: "150000" } as const;

  it("[V-LOW-NR-ALL] 저가 나목: 네 인자가 모두 차면 통과한다", () => {
    expect(validateDeemedInput(base({ ...LOW_NR, ...FULL_LOW_NR }))).toBeNull();
  });

  it("[V-LOW-NR-EQUAL] 저가 나목: 균등증자 가정 증가주식수 미입력이면 차단된다", () => {
    // ⚠️ `not.toBeNull()`로는 부족하다 — 바로 뒤 범위 검사(균등 < 실제)가 0을 걸러내며
    //    **같은 자리에서 다른 사유**를 돌려주기 때문이다. 두 가드가 서로를 가리므로
    //    필수화만 지워도 통과해버린다(뮤테이션 실측). ⇒ 사유 문자열까지 고정한다.
    expect(validateDeemedInput(base({ ...LOW_NR, ...FULL_LOW_NR, ciEqualIssueShares: "" }))).toBe(
      "균등증자 가정 증가주식수를 입력하세요",
    );
  });

  it("[V-LOW-NR-EQUAL-RANGE] 균등증자 가정치가 실제 증자 주식수보다 작으면 차단된다", () => {
    // 실권주가 소멸해 실제가 줄어드는 방향이므로 균등 ≥ 실제가 항상 성립한다.
    expect(
      validateDeemedInput(base({ ...LOW_NR, ...FULL_LOW_NR, ciIssuedShares: "50000", ciEqualIssueShares: "49999" })),
    ).not.toBeNull();
  });

  it.each([
    ["특수관계인 실권주수", { ...FULL_LOW_NR, ciRelatedAcquiredShares: "" }],
    ["증자 후 보유주식수", { ...FULL_LOW_NR, ciPostHeldShares: "" }],
    ["증자 후 발행주식총수", { ...FULL_LOW_NR, ciPostTotalShares: "" }],
  ])("[V-LOW-NR-PARTIAL] 저가 나목: %s 미입력이면 차단된다", (_label, over) => {
    expect(validateDeemedInput(base({ ...LOW_NR, ...over }))).not.toBeNull();
  });

  it("[V-LOW-NR-RANGE] 저가 나목: 보유주식수 > 발행주식총수는 차단된다 (비율 > 1)", () => {
    expect(
      validateDeemedInput(base({ ...LOW_NR, ...FULL_LOW_NR, ciPostHeldShares: "150001" })),
    ).not.toBeNull();
  });

  it("[V-HIGH-GA-DENOM] 고가 **가목**도 분모가 필수다 — 종전엔 가목만 빠져 있었다", () => {
    const high = { ciDirection: "high", ciSubType: "forfeited_realloc" } as const;
    expect(validateDeemedInput(base({ ...high, ciRatioDenomShares: "" }))).not.toBeNull();
    expect(validateDeemedInput(base({ ...high, ciRatioDenomShares: "30000" }))).toBeNull();
  });

  it("[V-LOW-REALLOC-FREE] 저가 **가목**(재배정)은 §29②1호 다목이라 비율 인자를 요구하지 않는다", () => {
    expect(validateDeemedInput(base({ ciDirection: "low", ciSubType: "forfeited_realloc" }))).toBeNull();
  });
});
