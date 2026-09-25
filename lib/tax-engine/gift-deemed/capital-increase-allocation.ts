/**
 * (8b) 증자에 따른 이익의 증여 (§39) — cap-table 다수증자·다증여자 배분.
 *
 * equity-delta 방식: 주주별 지분 자산 증감(delta)이 곧 증여재산가액이고(부의 이전 zero-sum),
 * 증여자별 분할은 손해비례(증여자 손해 ÷ 총손해)로 배분한다.
 * 이는 교재 호별 산식(§29②1~5: 실권주÷실권주총수·지분비율·균등㉯)과 대수적으로 동치이며
 * (손해 ∝ 인수신주이므로 손해비례 = 인수신주비례), 유형 추론 없이 case-independent하게 6사례를 재현한다.
 *
 * 증자후 1주당 평가가액(㉯) = [(증자전평가×증자전총주식) + (인수가×실제 증가주식)] ÷ (증자전총 + 증가)
 *   - 실제 증가주식 = Σ 인수신주(subscribedShares). 검증내역·증여재산가액 모두 실제 ㉯ 사용.
 */
import { computeWeightedPerShare, meetsRatioThreshold } from "./capital-helpers";
import { safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import type {
  CapShareholder,
  CapitalIncreaseAllocationInput,
  CapitalIncreaseAllocationResult,
  DonationSplit,
} from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000; // §29②2·4 3억원

/** 주주의 실권주수 = max(0, 당초배정 − 본인 당초배정분 인수) */
function forfeitedBy(s: CapShareholder): number {
  const ownSubscribed = s.subscribedShares - (s.reallocatedShares ?? 0);
  return Math.max(0, s.entitledShares - ownSubscribed);
}

export function calcCapitalIncreaseAllocation(
  input: CapitalIncreaseAllocationInput,
): CapitalIncreaseAllocationResult {
  const { preIssuePrice: pre, newSharePrice: priceIn, shareholders, direction } = input;
  const preTotal = shareholders.reduce((a, s) => a + s.preShares, 0);
  const issuedActual = shareholders.reduce((a, s) => a + s.subscribedShares, 0);

  // ㉯ 실제 증자후 1주당 평가가액 (BigInt floor)
  const perShareAfter = computeWeightedPerShare(pre, preTotal, priceIn, issuedActual);

  // 주주별 지분 자산 증감 (검증내역) — delta = 증자후평가 − 증자전평가 − 납입대금
  const byShareholder = shareholders.map((s) => {
    const preValuation = safeMultiply(s.preShares, pre);
    const paidIn = safeMultiply(s.subscribedShares, priceIn);
    const postValuation = safeMultiply(s.preShares + s.subscribedShares, perShareAfter);
    return { id: s.id, name: s.name, preValuation, paidIn, postValuation, delta: postValuation - preValuation - paidIn };
  });

  const donors = byShareholder.filter((b) => b.delta < 0); // 손해 본 자(증여자)
  const totalLoss = donors.reduce((a, b) => a + -b.delta, 0);
  const totalGain = byShareholder.reduce((a, b) => (b.delta > 0 ? a + b.delta : a), 0);

  // 실권처리(②⑤) 발생 여부 = 총실권주 > 총재배정 → 30%·3억 게이트 적용
  const totalForfeit = shareholders.reduce((a, s) => a + forfeitedBy(s), 0);
  const totalRealloc = shareholders.reduce((a, s) => a + (s.reallocatedShares ?? 0), 0);
  const hasForfeitProcessing = totalForfeit > totalRealloc;
  // 차액(|㉯−㉰|) ≥ 증자후가 30% (per-share, 수증자 무관)
  // §29②2호 가목 — 저가 나목(실권처리)의 기준선 ㉯는 「증자전의 지분비율대로 **균등하게
  //   증자하는 경우의 증가주식수**」 기준이다. 실권주가 소멸해 실제 증가분이 줄면 실제 ㉯가
  //   높게 잡혀 차액이 부풀고, 게이트가 **한 방향으로만** 헐거워져 법정 미과세가 과세된다.
  //   Σ`entitledShares`가 곧 균등증자 가정 증가주식수라 새 입력 없이 구할 수 있다.
  // ⚠️ 고가는 그대로 둔다 — §29②4호의 비율 요건은 「제3호 **나목의 가액**의 100분의 30 이상」
  //   이고 그 나목 산식은 「증자에 의하여 증가한 주식수」(실제)다. 한 값으로 묶어 고치면 고가가 깨진다.
  const perShareForRatio =
    direction !== "high" && hasForfeitProcessing
      ? computeWeightedPerShare(pre, preTotal, priceIn, shareholders.reduce((a, s) => a + s.entitledShares, 0))
      : perShareAfter;
  // 「100분의 30」 임계는 절사하지 않는다 — 절사는 게이트를 통과시키는 쪽으로만 작동해 과다과세다.
  const perShareDiff = Math.abs(perShareForRatio - priceIn);
  const ratioMet = meetsRatioThreshold(perShareDiff, perShareForRatio);

  // §39①: 저가발행(1호) 가목(재배정)·다목(제3자배정)·라목(초과배정)은 특수관계 요건 없음.
  //        나목(실권주 미배정=실권처리)·고가발행(2호)만 특수관계인 요구.
  const relationGateApplies = direction === "high" || hasForfeitProcessing;

  const relatedSets = new Map(shareholders.map((s) => [s.id, new Set(s.relatedTo ?? [])]));
  // 「상증법」§39① 괄호 — **주권상장법인이** 자본시장법 §9⑦ 모집방법으로 배정한 몫은 「배정」에서 제외된다.
  //   한 증자에 공모 배정과 특정 배정이 섞일 수 있어 **주주별 행**으로 판정한다.
  //   ⚠️ 「주권상장법인이」는 **AND 조건**이다 — 비상장법인의 모집방법 배정은 제외 대상이 아니다(과소과세 차단).
  //      `isListed`는 여기서만 쓰이고 ㉯(`perShareAfter`)에는 접촉하지 않는다 — 안 C 유지(위 타입 주석).
  //   ⚠️ 간주모집(「상증령」§29③ · 자시령 §11③)은 제외가 취소되므로 normal과 같이 과세된다.
  const publicOfferingIds = new Set(
    input.isListed === true
      ? shareholders.filter((s) => s.allocationMethod === "public_offering").map((s) => s.id)
      : [],
  );
  const splits: DonationSplit[] = [];
  const perBeneficiary: CapitalIncreaseAllocationResult["perBeneficiary"] = [];

  /** 손해비례 배분 + floor 잔액 흡수(마지막 증여자가 잔액 흡수 — 누적 −1 차단) */
  function splitByLoss(amount: number): number[] {
    let assigned = 0;
    return donors.map((d, i) => {
      const raw =
        i === donors.length - 1 ? amount - assigned : safeMultiplyThenDivide(amount, -d.delta, totalLoss);
      assigned += raw;
      return raw;
    });
  }

  const shareholderById = new Map(shareholders.map((s) => [s.id, s]));

  for (const b of byShareholder) {
    if (b.delta <= 0) continue; // 이익 본 자만 수증자

    // 「상증법」§39①1호 **가·다·라목** 몫을 나목 몫과 가른다 — 국세청 재산세과-60(2010.2.1.)은
    //   「일부는 재배정하고 나머지는 실권처리한 경우 증여이익을 **각각 산정하여 합산**」한다고 한다.
    //   · 가목(실권주 배정)·다목(제3자 직접배정)·라목(초과배정) — 법문에 **특수관계 문언이 없고**,
    //     「상증령」§29②1호에는 **기준금액 규정 자체가 없다**.
    //   · 나목(실권주 미배정) — §29②2호가 30%·3억 기준금액을 두고, 법문이 특수관계인을 요건으로 한다.
    //   가·다·라목분 = (㉯ − 인수가) × 배정받은 신주수 = §29②1호 가목 산식 그 자체다.
    //
    // ⚠️ **저가에 한정한다.** 법문상 「배정받은 자」는 저가(§39①1호)에서는 이익을 얻는 자 = 수증자지만,
    //    고가(§39①2호)에서는 「그 실권주를 배정받은 자가 인수함으로써 **그의 특수관계인인 포기자**가
    //    얻은 이익」이라 배정받은 자가 **증여자**다. 고가의 목별 분해는 증여자 행 기준이어야 하고
    //    equity-delta에서 증여자 손해를 자기배정분/재배정분으로 가르는 기준이 확정되지 않았다
    //    ⇒ 고가는 현행 유지(리뷰 2-C 보류분).
    //    ℹ️ 이 `direction` 항은 **정상 입력에서는 아래 `perShareGain > 0`과 중복**이다 —
    //       인수가 > ㉮이면 항상 ㉯ < 인수가이기 때문이다(㉮T + P·I < P(T+I) ⟺ ㉮ < P).
    //       뮤테이션에서 구별력 0으로 측정됐고(N6 SURVIVED), 그 원인은 커버리지 공백이 아니라
    //       조건 중복이다. direction이 실제 부호와 어긋나게 들어온 경우에만 단독으로 작동한다.
    const reallocShares = direction === "high" ? 0 : (shareholderById.get(b.id)?.reallocatedShares ?? 0);
    const perShareGain = perShareAfter - priceIn;
    const reallocGain =
      reallocShares > 0 && perShareGain > 0
        ? Math.min(safeMultiply(perShareGain, reallocShares), b.delta)
        : 0;
    const forfeitGain = b.delta - reallocGain; // 나목분(§29②2호·4호)

    const rawRealloc = splitByLoss(reallocGain);
    const rawForfeit = splitByLoss(forfeitGain);
    const isRelatedTo = (donorId: string) => relatedSets.get(b.id)?.has(donorId) ?? false;

    // 기준금액(3억) 게이트(§29②2호 다목·4호) — 판정 대상은 **특수관계인 몫으로 가중한 뒤의 금액**이다.
    //   종전에는 분할 **전** `b.delta`로 봐서 비특수관계 증여자 몫까지 합산됐고,
    //   `b.delta ≥ 특수관계 가중액`이 항상 성립하므로 오차가 **게이트가 헐거워지는 한 방향**으로만 났다.
    const relatedForfeitSum = donors.reduce((a, d, i) => (isRelatedTo(d.id) ? a + rawForfeit[i] : a), 0);
    const gatedOut = hasForfeitProcessing && !ratioMet && relatedForfeitSum < ABSOLUTE_THRESHOLD;

    const byDonor: DonationSplit[] = donors.map((d, i) => {
      // §39① 적용 제외 — 제외 대상은 **배정 행위**이므로 「배정받은 자」 행으로 판정한다.
      //   저가(§39①1호): 「그 실권주를 **배정받은 자**가 배정받음으로써 얻은 이익」 ⇒ 배정받은 자 = 수증자
      //   고가(§39①2호): 「그 실권주를 **배정받은 자**가 인수함으로써 **그의 특수관계인인 포기자**가
      //                   얻은 이익」 ⇒ 배정받은 자 = **증여자**(인수자), 이익을 얻는 자와 다른 사람이다.
      //   종전에는 양쪽 다 수증자 행으로 조회해 고가에서 판정 주체가 뒤바뀌어 있었다(양방향 오류 —
      //   배정받은 자에 표시하면 제외 미발동으로 과다과세, 포기자에 표시하면 근거 없이 0원).
      const publicOfferingOut = publicOfferingIds.has(direction === "high" ? d.id : b.id);
      const isRelated = isRelatedTo(d.id);
      const relationExcluded = relationGateApplies && !isRelated;
      // 가·다·라목분은 저가에서 특수관계·기준금액 어느 게이트도 받지 않는다.
      const taxableRealloc = publicOfferingOut ? 0 : rawRealloc[i];
      const taxableForfeit = publicOfferingOut || gatedOut || relationExcluded ? 0 : rawForfeit[i];
      const value = taxableRealloc + taxableForfeit;
      const excludedReason = publicOfferingOut
        ? "주권상장법인의 유가증권 모집방법 배정 — §39① 적용 제외"
        : value > 0
          ? undefined
          : gatedOut
            ? "이익이 기준금액(증자후가 30%·3억) 미만"
            : relationExcluded
              ? direction === "high"
                ? "특수관계 부재(§39①2호)"
                : "특수관계 부재(§39①1호나목)"
              : undefined;
      const row: DonationSplit = { beneficiaryId: b.id, donorId: d.id, value, excludedReason };
      splits.push(row);
      return row;
    });
    perBeneficiary.push({ beneficiaryId: b.id, total: byDonor.reduce((a, r) => a + r.value, 0), byDonor });
  }

  return {
    type: "capital_increase_allocation",
    perShareAfter,
    perBeneficiary,
    byShareholder,
    reconciliation: { totalGain, totalLoss, balanced: totalGain === totalLoss },
    splits,
  };
}
