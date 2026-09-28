/**
 * §43② 1년 합산 — §35(저가양수·고가양도) 축은 「대상 없음(대수적 무효)」으로 닫는다(사용자 결정 A안).
 *
 * 근거(조사 2026-09-29, `docs/review/gift-39/README.md` 별도 트랙 기록):
 *   · 「상증령」§32의4 1의2호는 법 §35①·② 둘 다 열거한다(2016.2.5 신설 — 그 전 영 §31의10 1호는
 *     특수관계 조항만 인용해 서울고법 2014누71698이 비특수관계 합산을 위법으로 봤다).
 *   · 그러나 합산은 두문대로 「각각의 금액기준을 계산」하는 데 쓰이고(정책 (a) — #19), 과세액은 당해 건이다.
 *   · §35는 기준금액이 **판정과 공제를 겸한다**: ① 판정·공제 모두 MIN(시가30%, 3억), ② 판정 시가30%·공제 3억.
 *     ⇒ 당해 건만으로 기준금액에 못 미치면 「차액 − 공제」가 항상 음수다. 합산이 판정을 바꿔도 과세액은 0이다.
 *
 * 이 파일은 그 **전제**(공제 ≥ 판정 기준의 금액 leg)를 엔진에서 실측으로 고정한다. 엔진의 공제·판정 구조가
 * 바뀌면 「대상 없음」의 근거가 무너지므로 여기서 먼저 빨개진다([[feedback_change_breaks_equivalence_proof_premise]]).
 */
import { describe, it, expect } from "vitest";
import { detectBargainTransfer, type BargainTransferInput } from "@/lib/tax-engine/bargain-transfer";
import { applyRate } from "@/lib/tax-engine/tax-utils";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { activeSameClauseRowsKey } from "@/lib/calc/gift-deemed-43-2";
import { INITIAL_DEEMED } from "@/components/calc/deemed-gift/deemed-form-state";

const AMOUNT_LEG = 300_000_000;

/** 정책 (a)를 §35에 그대로 씌운 변형 — 금액 leg(3억)만 선행 차액과 합산 판정, 과세액 = 당해 차액 − 공제 */
function policyAVariant(input: BargainTransferInput, priorGain: number) {
  const diff = input.transactionType === "purchase"
    ? input.marketValue - input.transactionPrice
    : input.transactionPrice - input.marketValue;
  const rate = applyRate(input.marketValue, 0.3);
  const eligible = input.isRelatedParty
    ? diff >= rate || diff + priorGain >= AMOUNT_LEG // ① MIN(비율, 금액) = 비율 leg(건별) OR 금액 leg(합산)
    : diff >= rate; // ② 판정은 비율 leg뿐 — 합산할 금액 leg가 없다
  const deduction = input.isRelatedParty ? Math.min(rate, AMOUNT_LEG) : AMOUNT_LEG;
  return { eligibleWithoutAgg: diff >= (input.isRelatedParty ? Math.min(rate, AMOUNT_LEG) : rate), eligible,
    value: diff > 0 && eligible ? Math.max(0, diff - deduction) : 0 };
}

/** 결정적 격자 — 시드 고정 LCG(재현 가능) */
function* cases(n: number) {
  let seed = 20260929;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = 0; i < n; i++) {
    const marketValue = Math.floor(rnd() * 3_000_000_000) + 1;
    const priorGain = Math.floor(rnd() * 600_000_000);
    const lowPrice = Math.floor(rnd() * marketValue);
    const highPrice = marketValue + Math.floor(rnd() * marketValue);
    for (const isRelatedParty of [true, false]) {
      yield { input: { transactionType: "purchase", marketValue, transactionPrice: lowPrice, isRelatedParty } as BargainTransferInput, priorGain };
      yield { input: { transactionType: "sale", marketValue, transactionPrice: highPrice, isRelatedParty } as BargainTransferInput, priorGain };
    }
  }
}

describe("§35 — 정책 (a) 합산은 과세액을 바꾸지 않는다(대수적 무효)", () => {
  it("[S35-1] 격자 20,000건 — 합산 변형의 과세액이 현행 엔진과 전건 같다", () => {
    let differs = 0;
    for (const { input, priorGain } of cases(5_000)) {
      if (policyAVariant(input, priorGain).value !== detectBargainTransfer(input).deemedGiftAmount) differs++;
    }
    expect(differs).toBe(0);
  });

  it("[S35-1+] 짝 — 같은 격자에서 합산이 **판정은** 실제로 뒤집는다(무효가 공집합 탓이 아니다)", () => {
    // 이 수가 0이면 [S35-1]은 합산 분기를 한 번도 밟지 않은 공허한 통과다.
    let flipped = 0;
    for (const { input, priorGain } of cases(5_000)) {
      const v = policyAVariant(input, priorGain);
      if (v.eligible && !v.eligibleWithoutAgg) flipped++;
    }
    expect(flipped).toBeGreaterThan(100);
  });

  it("[S35-2] 수치 예 — 특수관계 저가양수 시가 10억·차액 2억 + 선행 2억: 판정은 넘지만 2억 − 3억 < 0 ⇒ 0", () => {
    const input: BargainTransferInput = { transactionType: "purchase", marketValue: 1_000_000_000, transactionPrice: 800_000_000, isRelatedParty: true };
    const v = policyAVariant(input, 200_000_000);
    expect(v.eligible).toBe(true);
    expect(v.eligibleWithoutAgg).toBe(false);
    expect(v.value).toBe(0);
    expect(detectBargainTransfer(input).deemedGiftAmount).toBe(0);
  });

  it("[S35-2+] 짝 — 당해 차액 3억 5천만이면 합산 없이도 5천만 과세(공제 경로가 살아 있다)", () => {
    const input: BargainTransferInput = { transactionType: "purchase", marketValue: 1_000_000_000, transactionPrice: 650_000_000, isRelatedParty: true };
    expect(detectBargainTransfer(input).deemedGiftAmount).toBe(50_000_000);
    expect(policyAVariant(input, 200_000_000).value).toBe(50_000_000);
  });
});

describe("§35 — 「대상 없음」 결정의 코드 가드(입력 경로가 없다)", () => {
  // 계획서의 「제외」는 코드 가드가 있어야 살아남는다([[feedback_plan_exclusion_decision_needs_a_code_gate]]).
  // 누군가 §35에 선행 이익 입력을 배선하면 여기서 빨개져 이 결정을 다시 보게 된다.
  it("[S35-3] ⑫ — bargain_transfer 스키마는 priorSameClauseGains를 떨어뜨린다", () => {
    const parsed = deemedGiftInputSchema.safeParse({
      type: "bargain_transfer", transactionType: "purchase", marketValue: 1_000_000_000, transactionPrice: 800_000_000,
      isRelatedParty: true, priorSameClauseGains: [{ date: "2025-09-01", gain: 200_000_000 }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "priorSameClauseGains" in parsed.data).toBe(false);
  });

  it("[S35-3+] 짝 — 배선된 축(free_realestate)의 스키마는 같은 키를 보존한다", () => {
    const parsed = deemedGiftInputSchema.safeParse({
      type: "free_realestate", subType: "free_use", propertyValue: 1_200_000_000, isRelatedParty: true,
      giftDate: "2026-03-02", priorSameClauseGains: [{ date: "2025-09-01", gain: 10_000_000 }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "priorSameClauseGains" in parsed.data).toBe(true);
  });

  it("[S35-4] ⑤④⑧ 단일 술어 — bargain_transfer에는 선행 이익 표가 없다(짝: free_realestate는 있다)", () => {
    expect(activeSameClauseRowsKey({ ...INITIAL_DEEMED, type: "bargain_transfer" })).toBeNull();
    expect(activeSameClauseRowsKey({ ...INITIAL_DEEMED, type: "free_realestate" })).toBe("freePriorSameClauseRows");
  });
});
