import { describe, it, expect } from "vitest";

import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import { computeWeightedPerShare } from "@/lib/tax-engine/gift-deemed/capital-helpers";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";

/**
 * 「상속세 및 증여세법」§39 리뷰 **3단계** — ⑧ validate · ⑫ Zod 검증 계층.
 *
 * 이 배치의 공통 결함 형태는 **「미입력」과 「실제 0」을 파이프라인이 구별하지 못하는 것**이다.
 * ④ API 변환이 `parseAmount("")`로 0을 만들고, ⑧·⑫ 어디도 막지 않아 엔진이 0을 곱한다.
 * 저장소 원칙은 「자동 안분 fallback 금지 — 미입력은 검증 오류로 차단」이다.
 *
 * ⚠️ **모든 차단 anchor에 긍정 짝을 붙인다** — 「항상 막는다」로 퇴화하면 안전망이 아니라 벽이다.
 */

const D = (patch: Partial<DeemedFormState>): DeemedFormState =>
  ({ ...INITIAL_DEEMED, giftDate: "2026-01-01", ...patch }) as DeemedFormState;

/** ⑧을 통과하는 저가 가목 최소 기반 */
const ciBase = {
  type: "capital_increase" as const,
  ciDirection: "low" as const,
  ciSubType: "forfeited_realloc" as const,
  ciPrePrice: "10000",
  ciPreShares: "100000",
  ciNewPrice: "5000",
  ciIssuedShares: "50000",
  ciForfeitedShares: "10000",
};

// ════════════════════════════════════════════════════════════
// 3-A — 산식 필수 인자 (「상증령」§29②1호 가목의 분자·분모·차감항)
// ════════════════════════════════════════════════════════════

describe("[3-A] 증자 주식수·신주 1주당 인수가액", () => {
  it("[VL-A1] 증자 주식수 공란 → 차단 (종전: 33,330,000 → 50,000,000 과다)", () => {
    expect(validateDeemedInput(D({ ...ciBase, ciIssuedShares: "" }))).toMatch(/증자 주식수/);
  });

  it("[VL-A2] 증자 주식수 0 → 차단 (증자가 아니다)", () => {
    expect(validateDeemedInput(D({ ...ciBase, ciIssuedShares: "0" }))).toMatch(/증자 주식수/);
  });

  it("[VL-A3] 신주 1주당 인수가액 **공란** → 차단 (종전: 2배 과다)", () => {
    expect(validateDeemedInput(D({ ...ciBase, ciNewPrice: "" }))).toMatch(/인수가액/);
  });

  it("[VL-A4] 🔑 신주 1주당 인수가액 **0은 통과한다** — 무상 배정은 법령상 성립한다", () => {
    // 「상증령」§29②1호 나목 「신주 1주당 인수가액」에 0을 금하는 문언이 없다.
    //   0을 막으면 실제로 0원에 배정받은 사안을 계산기가 거부하게 된다.
    //   ⇒ 「빈 칸」과 「0」을 구별해야 한다(`parseAmount`만으로는 둘 다 0이다).
    expect(validateDeemedInput(D({ ...ciBase, ciNewPrice: "0" }))).toBeNull();
  });

  it("[VL-A5] 양성 짝 — 두 칸을 채우면 이 축으로는 막지 않는다", () => {
    expect(validateDeemedInput(D(ciBase))).toBeNull();
  });

  it("[VL-A6] ⑫도 대칭으로 막는다 — issuedShares 0은 Zod에서 실패", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "capital_increase", preIssuePrice: 10_000, preIssueShares: 100_000,
      newSharePrice: 5_000, issuedShares: 0, forfeitedShares: 10_000,
    });
    expect(r.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// 3-B — 고가 비율 가중의 분자 (「상증령」§29②3·4·5호)
// ════════════════════════════════════════════════════════════

const hiBase = { ...ciBase, ciDirection: "high" as const, ciNewPrice: "20000" };

describe("[3-B] 고가 비율 가중 — 분자 가드와 분자 ≤ 분모 상한", () => {
  it("[VL-B1] 분자(특수관계인 인수 신주수) 미입력 → 차단 (종전: 0원 + 거짓 제외사유)", () => {
    const err = validateDeemedInput(
      D({ ...hiBase, ciSubType: "no_realloc", ciRatioDenomShares: "50000", ciRelatedAcquiredShares: "" }),
    );
    expect(err).toMatch(/특수관계인/);
  });

  it("[VL-B2] 양성 짝 — 분자를 채우면 통과", () => {
    expect(
      validateDeemedInput(
        D({ ...hiBase, ciSubType: "no_realloc", ciRatioDenomShares: "50000", ciRelatedAcquiredShares: "15000" }),
      ),
    ).toBeNull();
  });

  it("[VL-B3] 분자 > 분모 → 차단 (가중이 1을 넘어 증폭이 된다)", () => {
    const err = validateDeemedInput(
      D({ ...hiBase, ciSubType: "no_realloc", ciRatioDenomShares: "50000", ciRelatedAcquiredShares: "60000" }),
    );
    expect(err).toMatch(/초과/);
  });

  it("[VL-B4] 고가 **나목**: 분모 < 증자 주식수 → 차단", () => {
    // §29②4호 분모 = 「증자전의 지분비율대로 **균등하게 증자하는 경우의 증자 주식총수**」.
    //   실권주가 소멸해 실제 증가분이 줄어든 것이므로 균등 가정 총수 ≥ 실제 증가주식수다.
    const err = validateDeemedInput(
      D({ ...hiBase, ciSubType: "no_realloc", ciIssuedShares: "50000", ciRatioDenomShares: "40000", ciRelatedAcquiredShares: "20000" }),
    );
    expect(err).toMatch(/분모/);
  });

  it("[VL-B5] 🔑 고가 **라목**은 같은 조건이 정상이다 — 하한을 걸면 안 된다", () => {
    // §29②5호 분모 = 「주주가 아닌 자에게 배정된 신주 및 … 초과하여 인수한 신주의 **총수**」로
    //   증가주식수의 **부분집합**이다. `[CI-HIGH-TPE]`가 denom 40,000 < issued 50,000을
    //   법정 정답(100,005,000)으로 고정하고 있다 ⇒ 하한은 `no_realloc` 한정이어야 한다.
    expect(
      validateDeemedInput(
        D({ ...hiBase, ciSubType: "excess", ciIssuedShares: "50000", ciRatioDenomShares: "40000", ciRelatedAcquiredShares: "20000" }),
      ),
    ).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// 3-C — ⑫ 정수성·상장 단서·전환주식 direction 교차
// ════════════════════════════════════════════════════════════

describe("[3-C] ⑫ Zod — 주식수 정수성", () => {
  const ci = (patch: Record<string, unknown>) =>
    deemedGiftInputSchema.safeParse({
      type: "capital_increase", preIssuePrice: 10_000, preIssueShares: 100_000,
      newSharePrice: 5_000, issuedShares: 50_000, forfeitedShares: 10_000, ...patch,
    });

  it("[VL-C1] 소수 발행주식총수 → 실패 (종전: 엔진 RangeError → HTTP 500)", () => {
    expect(ci({ preIssueShares: 0.5 }).success).toBe(false);
  });

  it("[VL-C2] 소수 실권주수 → 실패", () => {
    expect(ci({ forfeitedShares: 50_000.5 }).success).toBe(false);
  });

  it("[VL-C3] 🔑 **가액**은 소수를 허용한다 — 「상증법」§63①1가의 「최종 시세가액의 평균액」", () => {
    expect(ci({ preIssuePrice: 10_000.7, newSharePrice: 5_000.3 }).success).toBe(true);
  });

  it("[VL-C4] cap-table 주주 행의 주식수도 정수여야 한다", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "capital_increase_allocation", direction: "low", preIssuePrice: 10_000, newSharePrice: 5_000,
      shareholders: [
        { id: "a", preShares: 0.25, entitledShares: 0, subscribedShares: 0 },
        { id: "b", preShares: 100, entitledShares: 50, subscribedShares: 50 },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe("[3-C] ⑫ Zod — 상장 단서·전환주식 direction 교차", () => {
  it("[VL-C5] 상장 ON인데 종가평균이 없으면 실패 (§29②1가·3나 단서가 조용히 미발동)", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "capital_increase", preIssuePrice: 10_000, preIssueShares: 100_000,
      newSharePrice: 5_000, issuedShares: 50_000, forfeitedShares: 10_000, isListed: true,
    });
    expect(r.success).toBe(false);
  });

  it("[VL-C6] 🔑 공모 배정이면 종가평균 없이도 통과 — §39① 적용제외라 세액에 닿지 않는다", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "capital_increase", preIssuePrice: 10_000, preIssueShares: 100_000,
      newSharePrice: 5_000, issuedShares: 50_000, forfeitedShares: 10_000,
      isListed: true, allocationMethod: "public_offering",
    });
    expect(r.success).toBe(true);
  });

  it("[VL-C7] 간주모집(§29③)은 제외가 취소되어 과세되므로 종가평균이 필요하다", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "capital_increase", preIssuePrice: 10_000, preIssueShares: 100_000,
      newSharePrice: 5_000, issuedShares: 50_000, forfeitedShares: 10_000,
      isListed: true, allocationMethod: "deemed_public_offering",
    });
    expect(r.success).toBe(false);
  });

  it("[VL-C8] 전환주식 — 두 시점의 direction이 어긋나면 실패 (§39①3호 가목+나목 혼합)", () => {
    const leg = (direction: "low" | "high") => ({
      direction, preIssuePrice: 10_000, preIssueShares: 100_000,
      newSharePrice: 5_000, issuedShares: 50_000, forfeitedShares: 10_000,
    });
    const r = deemedGiftInputSchema.safeParse({
      type: "convertible_stock", atConversion: leg("low"), atIssuance: leg("high"),
    });
    expect(r.success).toBe(false);
  });

  it("[VL-C9] 양성 짝 — 두 시점 direction이 같으면 통과", () => {
    const leg = (direction: "low" | "high") => ({
      direction, preIssuePrice: 10_000, preIssueShares: 100_000,
      newSharePrice: 5_000, issuedShares: 50_000, forfeitedShares: 10_000,
    });
    const r = deemedGiftInputSchema.safeParse({
      type: "convertible_stock", atConversion: leg("low"), atIssuance: leg("low"),
    });
    expect(r.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// 3-D — 과잉 검증 해제 (⑧이 세액 무영향인 칸을 요구하던 축)
// ════════════════════════════════════════════════════════════

describe("[3-D] ⑧ — 공모 배정에서 종가평균 요구 해제", () => {
  it("[VL-D1] 🔑 상장 ∧ 공모 배정 ∧ 종가평균 공란 → 통과 (결과는 어느 값이든 0원)", () => {
    expect(
      validateDeemedInput(
        D({ ...ciBase, ciIsListed: true, ciAllocationMethod: "public_offering", ciListedMarketAvg: "" }),
      ),
    ).toBeNull();
  });

  it("[VL-D2] 일반 배정에서는 여전히 요구한다 — 그쪽은 세액이 바뀐다", () => {
    expect(
      validateDeemedInput(
        D({ ...ciBase, ciIsListed: true, ciAllocationMethod: "normal", ciListedMarketAvg: "" }),
      ),
    ).toMatch(/종가평균|평가가액/);
  });

  it("[VL-D3] 간주모집도 여전히 요구한다 — 제외가 취소되어 과세된다", () => {
    expect(
      validateDeemedInput(
        D({ ...ciBase, ciIsListed: true, ciAllocationMethod: "deemed_public_offering", ciListedMarketAvg: "" }),
      ),
    ).toMatch(/종가평균|평가가액/);
  });
});

// ════════════════════════════════════════════════════════════
// 3-E — §39의3 현물출자 당사자 명부의 관계 (1-D 부수 발견)
// ════════════════════════════════════════════════════════════

describe("[3-E] §39의3 roster 관계 필수", () => {
  const conBase = {
    type: "contribution" as const,
    conCaseType: "low" as const,
    conPrePrice: "10000",
    conPreShares: "100000",
    conNewPrice: "5000",
    conContributedShares: "50000",
    conAllocatedShares: "30000",
  };
  const party = (name: string, shares: string, relation: string) =>
    ({ name, shares, relation }) as NonNullable<DeemedFormState["conParties"]>[number];

  it("[VL-E1] 관계 **일부** 미지정 → 차단 (종전: 차단도 안 되고 동시증여 1건이 조용히 사라졌다)", () => {
    // 실측: `simultaneousGifts`가 `relation` 없는 행을 필터로 버린다.
    //   동일인(부·모) 2명 roster에서 결정세액 2,909,418 → 969,418 (−1,940,000 과소과세).
    const err = validateDeemedInput(
      D({ ...conBase, conParties: [party("A", "60000", "father"), party("B", "40000", "")] }),
    );
    expect(err).toMatch(/관계/);
  });

  it("[VL-E2] 양성 짝 — 전원 지정하면 통과", () => {
    expect(
      validateDeemedInput(
        D({ ...conBase, conParties: [party("A", "60000", "father"), party("B", "40000", "mother")] }),
      ),
    ).toBeNull();
  });

  it("[VL-E3] 고가 roster(수증자)도 같은 규칙", () => {
    const err = validateDeemedInput(
      D({
        ...conBase, conCaseType: "high", conNewPrice: "20000",
        conParties: [party("A", "60000", "sibling"), party("B", "40000", "")],
      }),
    );
    expect(err).toMatch(/관계/);
  });
});

// ════════════════════════════════════════════════════════════
// 3-C 보강 — 엔진 그물 (⑫를 거치지 않는 호출자용)
// ════════════════════════════════════════════════════════════

describe("[3-C] 엔진 최종 그물 — 0 < 분모 < 1", () => {
  // ⚠️ 이 anchor는 **일부러 leaf를 직접 호출**한다. ⑫ `.int()`가 상류에서 막고 있어
  //    폼 경로로는 이 분기에 도달할 수 없고, 뮤테이션에서 구별력 0으로 측정됐다
  //    (T15 SURVIVED — 겹친 방어가 서로를 가린 것이지 그물이 불필요한 것이 아니다).
  //    엔진은 `convertible-stock.ts`·다른 엔진·테스트가 **직접** 부르는 공개 함수라
  //    ⑫ 아래에도 그물이 있어야 한다. 그 그물을 여기서 고정한다.
  it("[VL-C10] 분모가 0과 1 사이면 0을 반환한다 — 종전엔 BigInt(0n) 나눗셈으로 RangeError", () => {
    expect(() => computeWeightedPerShare(10_000, 0.25, 5_000, 0.25)).not.toThrow();
    expect(computeWeightedPerShare(10_000, 0.25, 5_000, 0.25)).toBe(0);
  });

  it("[VL-C11] 증자 엔진도 소수 주식수에서 죽지 않는다 (HTTP 500 → 정상 응답)", () => {
    expect(() =>
      calcCapitalIncreaseGift({
        direction: "low", subType: "forfeited_realloc",
        preIssuePrice: 1_000, preIssueShares: 0.5, newSharePrice: 500,
        issuedShares: 0, forfeitedShares: 1,
      }),
    ).not.toThrow();
  });

  it("[VL-C12] 양성 짝 — 정수 분모에서는 그대로 가중평균을 낸다", () => {
    // ㉯ = [(10,000 × 100,000) + (5,000 × 50,000)] ÷ 150,000 = 8,333
    expect(computeWeightedPerShare(10_000, 100_000, 5_000, 50_000)).toBe(8_333);
  });
});
