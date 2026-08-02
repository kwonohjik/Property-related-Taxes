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
import { computeWeightedPerShare } from "./capital-helpers";
import { safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import type {
  CapShareholder,
  CapitalIncreaseAllocationInput,
  CapitalIncreaseAllocationResult,
  DonationSplit,
} from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000; // §29②2·4 3억원
const RATIO_NUMER = 30; // 100분의 30
const RATIO_DENOM = 100;

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
  const perShareDiff = Math.abs(perShareAfter - priceIn);
  const ratioMet = perShareDiff >= safeMultiplyThenDivide(perShareAfter, RATIO_NUMER, RATIO_DENOM);

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

  for (const b of byShareholder) {
    if (b.delta <= 0) continue; // 이익 본 자만 수증자
    // 집계 게이트(②⑤): 실권처리 발생 시 차액 30% 미만 AND 집계이익 3억 미만이면 미과세
    const gatedOut = hasForfeitProcessing && !ratioMet && b.delta < ABSOLUTE_THRESHOLD;
    const publicOfferingOut = publicOfferingIds.has(b.id); // §39① 적용 제외

    // 손해비례 증여자별 배분 + floor 잔액 흡수(마지막 증여자가 잔액 흡수)
    const byDonor: DonationSplit[] = [];
    let assigned = 0;
    donors.forEach((d, i) => {
      const raw =
        i === donors.length - 1
          ? b.delta - assigned // 마지막 = 잔액(floor 누적 −1 차단)
          : safeMultiplyThenDivide(b.delta, -d.delta, totalLoss);
      assigned += raw;
      const isRelated = relatedSets.get(b.id)?.has(d.id) ?? false;
      const relationExcluded = relationGateApplies && !isRelated;
      const taxable = publicOfferingOut || gatedOut || relationExcluded ? 0 : raw;
      const excludedReason = publicOfferingOut
        ? "주권상장법인의 유가증권 모집방법 배정 — §39① 적용 제외"
        : gatedOut
          ? "이익이 기준금액(증자후가 30%·3억) 미만"
          : relationExcluded
            ? direction === "high"
              ? "특수관계 부재(§39①2호)"
              : "특수관계 부재(§39①1호나목)"
            : undefined;
      const row: DonationSplit = { beneficiaryId: b.id, donorId: d.id, value: taxable, excludedReason };
      byDonor.push(row);
      splits.push(row);
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
