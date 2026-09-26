import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import { calcConvertibleStockGift } from "@/lib/tax-engine/gift-deemed/convertible-stock";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { CapShareholder } from "@/lib/tax-engine/gift-deemed/types";

/**
 * 「상속세 및 증여세법」§39 리뷰 **5단계** — 결과·표시.
 *
 * 세액은 이미 맞다. 틀린 것은 **결과 객체가 스스로를 설명하는 방식**이다 —
 * 산술 체인이 끊기거나(가중 행 부재), 결론 행이 헤드라인과 다른 수를 말하거나(제외 경로),
 * 두 하위 계산의 사유가 통째로 사라진다(전환주식).
 */

const LOW = {
  direction: "low",
  subType: "forfeited_realloc",
  preIssuePrice: 20_000,
  preIssueShares: 100_000,
  newSharePrice: 5_000,
  issuedShares: 50_000,
  forfeitedShares: 30_000,
} as const;

const HIGH_NR = {
  direction: "high",
  subType: "no_realloc",
  preIssuePrice: 10_000,
  preIssueShares: 100_000,
  newSharePrice: 20_000,
  issuedShares: 20_000,
  forfeitedShares: 30_000,
  relatedAcquiredShares: 15_000,
  ratioDenomShares: 50_000,
} as const;

const last = (r: { breakdown: { label: string; amount: number }[] }) => r.breakdown.at(-1)!;

// ══════════════════════════════════════════════════════════════
// 5-A — 제외 경로의 결론 행이 헤드라인과 어긋난다 (#45·#85)
// ══════════════════════════════════════════════════════════════

describe("[5-A] §39① 적용 제외 — 결론 행이 0원 헤드라인과 같은 말을 해야 한다", () => {
  it("[RD-1] 공모 제외 — 결론 행 라벨이 「증여재산가액」이면 안 된다", () => {
    // 「상증법」§39① 각 호 외의 부분 — 「그 이익에 상당하는 금액을 … **증여재산가액**으로 한다」.
    //   §39①1호 가목 괄호는 「배정」이라는 **구성요건 문언 내부**에 삽입돼 있어, 공모배정이면
    //   요건 자체가 불성립하고 증여재산가액도 성립하지 않는다.
    //   종전에는 헤드라인 0원 · 펼침 표 「증여재산가액 450,000,000」이 **동시에** 표시됐다.
    const r = calcCapitalIncreaseGift({ ...LOW, isListed: true, allocationMethod: "public_offering" });
    expect(r.deemedGiftValue).toBe(0);
    expect(last(r).label).not.toBe("증여재산가액");
    expect(last(r).label).toMatch(/제외/);
  });

  it("[RD-2] 공모 제외 — 산출값은 버리지 않는다 (감사 추적성)", () => {
    const r = calcCapitalIncreaseGift({ ...LOW, isListed: true, allocationMethod: "public_offering" });
    const plain = calcCapitalIncreaseGift(LOW);
    // 제외 전 산출 이익이 결과 객체에서 **소실**되면 「왜 0인지」를 사후에 재현할 수 없다.
    expect(last(r).amount).toBe(plain.deemedGiftValue);
    expect(r.thresholdEcho?.gain).toBe(plain.deemedGiftValue);
  });

  it("[RD-3] 영리법인 제외 — 그 금액은 「증여재산가액」이 아니라 법인세 익금이다", () => {
    // 「법인세법 시행령」 제89조제6항이 §39·「상증령」§29②를 준용해 계산하는 **익금**이다.
    //   금액은 보존해야 하지만 라벨이 「증여재산가액」이면 사실과 다르다.
    const r = calcCapitalIncreaseGift({ ...LOW, doneeIsForProfitCorp: true });
    expect(r.deemedGiftValue).toBe(0);
    expect(last(r).label).not.toBe("증여재산가액");
    expect(last(r).amount).toBe(calcCapitalIncreaseGift(LOW).deemedGiftValue);
  });

  it("[RD-4] 🔑 양성 짝 — 제외가 아니면 결론 행은 종전 그대로 「증여재산가액」이다", () => {
    const r = calcCapitalIncreaseGift(LOW);
    expect(last(r).label).toBe("증여재산가액");
    expect(last(r).amount).toBe(r.deemedGiftValue);
  });

  it("[RD-5] 🔑 기준금액 미달로 0원인 경로는 건드리지 않는다 — 그 행은 이미 0이다", () => {
    // §29②2호 기준금액 미달은 **요건 불성립이 아니라 계산 결과가 0**이다. 라벨이 맞다.
    const r = calcCapitalIncreaseGift({ ...LOW, subType: "no_realloc", newSharePrice: 19_999, forfeitedShares: 1 });
    expect(r.deemedGiftValue).toBe(0);
    expect(last(r).label).toBe("증여재산가액");
    expect(last(r).amount).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// 5-B — 고가 비율 가중 행이 없어 산술 체인이 끊긴다 (#47·#62)
// ══════════════════════════════════════════════════════════════

describe("[5-B] §29②4·5호 비율 가중을 화면이 보여 줘야 한다", () => {
  it("[RD-6] 고가 나목 — 「차액 × 귀속 주식수」와 결론 금액이 다르면 그 사이 행이 있어야 한다", () => {
    const r = calcCapitalIncreaseGift(HIGH_NR);
    // 8,334 × 30,000 = 250,020,000 → × (15,000 ÷ 50,000) = 75,006,000
    expect(r.deemedGiftValue).toBe(75_006_000);
    const labels = r.breakdown.map((s) => s.label);
    expect(labels.some((l) => /가중/.test(l))).toBe(true);
    const w = r.breakdown.find((s) => /가중/.test(s.label))!;
    expect(w.amount).toBe(250_020_000); // 가중 **전** 금액
    expect(w.note).toMatch(/15,000|50,000/);
  });

  it("[RD-7] 🔑 양성 짝 — 가중이 없는 저가 가목에는 그 행을 붙이지 않는다", () => {
    const r = calcCapitalIncreaseGift(LOW);
    expect(r.breakdown.some((s) => /가중/.test(s.label))).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 5-C — 전환주식이 두 leg의 사유·유형을 버린다 (#40)
// ══════════════════════════════════════════════════════════════

describe("[5-C] 전환주식 — 두 시점의 제외사유·발행유형 보존", () => {
  const leg = (over: Record<string, unknown> = {}) => ({ ...LOW, ...over });

  it("[RD-8] 전환 시점이 공모로 제외됐다면 그 사유가 결과에 남아야 한다", () => {
    const r = calcConvertibleStockGift({
      atConversion: leg({ isListed: true, allocationMethod: "public_offering" }) as never,
      atIssuance: leg({ newSharePrice: 10_000 }) as never,
    });
    const notes = r.breakdown.map((s) => s.note ?? "").join(" ");
    expect(notes).toMatch(/모집방법|적용 제외/);
  });

  it("[RD-9] 발행유형(§39①3호 가목·나목)이 결과에 남아야 한다", () => {
    const r = calcConvertibleStockGift({
      atConversion: leg({ direction: "high", newSharePrice: 30_000 }) as never,
      atIssuance: leg({ direction: "high", newSharePrice: 25_000 }) as never,
    });
    const text = r.breakdown.map((s) => `${s.label} ${s.note ?? ""}`).join(" ");
    expect(text).toMatch(/나목|고가/);
  });
});

// ══════════════════════════════════════════════════════════════
// 5-D — zero-sum 경계(delta = 0)에 구별력이 없다 (#78·#87·#92)
// ══════════════════════════════════════════════════════════════

describe("[5-D] delta가 정확히 0인 주주는 증여자에도 수증자에도 들어가지 않는다", () => {
  // 균등 인수(당초 배정분을 그대로 인수)하면 지분 자산 증감이 **정확히 0**이다.
  //   기존 anchor는 `perBeneficiary` 총액과 특정 (수증자, 증여자) 쌍만 보고 행 개수를 한 번도
  //   단언하지 않아, `< 0` → `<= 0` · `> 0` → `>= 0` 뮤테이션이 전건 생존했다(5단계 감사 실측).
  const sh = (id: string, pre: number, ent: number, sub: number, realloc = 0, rel: string[] = []): CapShareholder => ({
    id, name: id, preShares: pre, entitledShares: ent, subscribedShares: sub, reallocatedShares: realloc, relatedTo: rel,
  });
  const r = calcCapitalIncreaseAllocation({
    direction: "low",
    preIssuePrice: 30_000,
    newSharePrice: 10_000,
    shareholders: [
      sh("갑", 25_000, 25_000, 0, 0, ["을"]),
      sh("을", 15_000, 15_000, 40_000, 25_000, ["갑"]),
      sh("소액주주", 10_000, 10_000, 10_000), // 균등 인수 ⇒ delta 0
    ],
  });

  it("[RD-10] 균등 인수 주주의 delta는 정확히 0이다", () => {
    expect(r.byShareholder.find((b) => b.id === "소액주주")!.delta).toBe(0);
  });

  it("[RD-11] delta 0 주주는 **수증자**가 아니다 — perBeneficiary에 없다", () => {
    expect(r.perBeneficiary.map((b) => b.beneficiaryId)).toEqual(["을"]);
  });

  it("[RD-12] delta 0 주주는 **증여자**도 아니다 — splits 행이 1개뿐이다", () => {
    expect(r.splits).toHaveLength(1);
    expect(r.splits[0]).toMatchObject({ beneficiaryId: "을", donorId: "갑" });
  });

  it("[RD-13] 🔑 양성 짝 — 실제 손익이 있는 주주는 그대로 들어간다", () => {
    expect(r.byShareholder.find((b) => b.id === "갑")!.delta).toBe(-250_000_000);
    expect(r.perBeneficiary[0].total).toBe(250_000_000);
  });

  it("[RD-14] 검증내역 합계도 delta 0 주주를 세지 않는다 (zero-sum 유지)", () => {
    expect(r.reconciliation.totalGain).toBe(250_000_000);
    expect(r.reconciliation.totalLoss).toBe(250_000_000);
    expect(r.reconciliation.balanced).toBe(true);
  });

  /*
   * ℹ️ **`totalGain`의 `b.delta > 0` → `>= 0`은 등가 뮤턴트다**(5단계 실측).
   *    누산식이 `a + b.delta`라 delta가 0이면 `a + 0 = a`로 **산술적으로 같다** ⇒ 어떤 테스트도
   *    죽일 수 없다. 커버리지 공백이 아니므로 anchor를 더 만들지 말 것.
   *    하네스 구별력은 대조군으로 확인했다 — 같은 줄의 `> 0` → `< 0`은 **10건을 죽인다**.
   *    (`> 0` → `> 1`도 생존하는데, 이건 delta가 정확히 1인 주주가 모집단에 없어서다.)
   */
});
