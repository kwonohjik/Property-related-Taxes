/**
 * (9) 감자에 따른 이익의 증여 (§39의2) — 불균등 감자 N:N 다주주 안분.
 * 시행령 §29의2①1호(저가)·①2호(고가). 지분율 정확분수(반올림 규정 무).
 * 대주주등 §28②(본인+특수관계인 지분 합산). 할증평가 배제 §53⑧3호.
 */
import { GIFT } from "../legal-codes";
import { applyRate, safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type {
  DeemedGiftResult,
  CapitalDecreaseInput,
  CapitalDecreaseShareholder,
  CapitalDecreaseMultiDonee,
  CapitalDecreaseVerification,
} from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

const postSharesOf = (s: CapitalDecreaseShareholder) => s.preShares - s.redeemedShares;
const isRelated = (a: CapitalDecreaseShareholder, b: CapitalDecreaseShareholder) =>
  !!a.relationGroup && a.relationGroup === b.relationGroup;

export function calcCapitalDecreaseMulti(input: CapitalDecreaseInput): DeemedGiftResult {
  const sh = input.shareholders ?? [];
  const preTotal = input.preTotalShares ?? 0;
  const evalPrice = input.sharePrice;
  const faceValue = input.faceValue;

  // ─── (1) 감자 후 1주당 평가액 (정확값/표시값 분리) ───
  const totalRedeemed = sh.reduce((a, s) => a + s.redeemedShares, 0);
  const postTotal = preTotal - totalRedeemed;
  const redemptionPaidTotal = sh.reduce(
    (a, s) => a + safeMultiply(s.redeemedShares, s.redemptionPricePerShare ?? 0),
    0,
  );
  // 잔존주주 감자후 주식가액 정확 합계 = 발행총가액 − 총감자대가
  const postValueExactTotal = safeMultiply(preTotal, evalPrice) - redemptionPaidTotal;
  const postPerShareExact = postTotal > 0 ? postValueExactTotal / postTotal : 0;
  const postPerShareDisplay = Math.round(postPerShareExact);

  // ─── (3) 저가/고가 판정 + 고가 액면 게이트 ───
  const redeemers = sh.filter((s) => s.redeemedShares > 0); // 감자주주
  const survivors = sh.filter((s) => s.redeemedShares === 0); // 잔존주주
  const firstRedeemPrice = redeemers[0]?.redemptionPricePerShare ?? 0;
  const caseType: "low" | "high" = firstRedeemPrice > evalPrice ? "high" : "low";
  // 고가 액면 게이트(§29의2①2호 "평가액이 액면가액에 미달하는 경우로 한정") — 고가 판정 시에만
  const faceGateFail = caseType === "high" && (faceValue == null || evalPrice >= faceValue);

  // 저가: 수증자=잔존, 증여자=감자 / 고가: 수증자=감자, 증여자=잔존
  const recipients = caseType === "high" ? redeemers : survivors;
  const donors = caseType === "high" ? survivors : redeemers;

  // ─── (5) 대주주등 판정 (§28②: relationGroup 동일 주주 preShares 합산) ───
  const isMajor = (r: CapitalDecreaseShareholder): boolean => {
    const set = r.relationGroup ? sh.filter((s) => s.relationGroup === r.relationGroup) : [r];
    const sumShares = set.reduce((a, s) => a + s.preShares, 0);
    if (sumShares * 100 >= preTotal) return true; // 지분 1%
    if (faceValue != null && safeMultiply(sumShares, faceValue) >= ABSOLUTE_THRESHOLD) return true; // 액면 3억
    return false;
  };

  // ─── (4)(6)(7) 수증자별 산출 ───
  const donees: CapitalDecreaseMultiDonee[] = recipients.map((rcpt) => {
    const relatedDonors = donors.filter((dn) => isRelated(rcpt, dn));

    // 증여자별 분해 amount(i←j) = floor( base(i,j) × ratioShares / postTotal )  ← floor 각 항
    // potential/raw = "한 번에" floor (시행령 산식: 특수관계인 합을 한 번에 곱하고 floor)
    const perDonor = (dn: CapitalDecreaseShareholder): number => {
      if (postTotal <= 0) return 0;
      if (caseType === "high") {
        const diffI = (rcpt.redemptionPricePerShare ?? 0) - evalPrice; // 수증자(감자) 대가 − 평가
        if (diffI <= 0) return 0;
        return safeMultiplyThenDivide(safeMultiply(diffI, rcpt.redeemedShares), postSharesOf(dn), postTotal);
      }
      const diffJ = evalPrice - (dn.redemptionPricePerShare ?? 0); // 평가 − 증여자(감자) 대가
      if (diffJ <= 0) return 0;
      return safeMultiplyThenDivide(safeMultiply(diffJ, dn.redeemedShares), postSharesOf(rcpt), postTotal);
    };

    // "한 번에" floor 합계 (rawTotal / potentialAmount)
    const oneShotTotal = (donorSet: CapitalDecreaseShareholder[]): number => {
      if (postTotal <= 0) return 0;
      if (caseType === "high") {
        const diffI = (rcpt.redemptionPricePerShare ?? 0) - evalPrice;
        if (diffI <= 0) return 0;
        const baseI = safeMultiply(diffI, rcpt.redeemedShares);
        const sumDonorShares = donorSet.reduce((a, dn) => a + postSharesOf(dn), 0);
        return safeMultiplyThenDivide(baseI, sumDonorShares, postTotal);
      }
      const weightSum = donorSet.reduce(
        (a, dn) => a + safeMultiply(Math.max(0, evalPrice - (dn.redemptionPricePerShare ?? 0)), dn.redeemedShares),
        0,
      );
      return safeMultiplyThenDivide(weightSum, postSharesOf(rcpt), postTotal);
    };

    const potentialAmount = oneShotTotal(donors); // 게이트 무시 전체 증여자
    const rawTotal = oneShotTotal(relatedDonors); // 특수관계 증여자만

    // 게이트 (순서: 액면 → 대주주 → 특수관계 → 기준금액)
    const reject = (reason: string, threshold: number): CapitalDecreaseMultiDonee => ({
      name: rcpt.name,
      isTaxable: false,
      nonTaxableReason: reason,
      total: 0,
      potentialAmount,
      thresholdApplied: threshold,
      fromDonors: [],
    });

    if (faceGateFail) return reject("고가소각: 평가액이 액면가 이상(§29의2①2호 미충족)", 0);
    if (!isMajor(rcpt)) return reject("대주주 아님", 0);
    if (relatedDonors.length === 0) return reject("비특수관계", 0);

    // (6) 기준금액 — 차액 비율 ≥ 30%면 0, 아니면 3억
    const ratioNumer =
      caseType === "high"
        ? (rcpt.redemptionPricePerShare ?? 0) - evalPrice
        : evalPrice - (relatedDonors[0].redemptionPricePerShare ?? 0);
    const threshold = ratioNumer >= applyRate(evalPrice, 0.3) ? 0 : ABSOLUTE_THRESHOLD;
    if (!(rawTotal > 0 && rawTotal >= threshold)) return reject("기준금액 미달", threshold);

    // (7) 증여자별 floor 안분 — 마지막 증여자 잔액 흡수
    const fromDonors: { donorName: string; amount: number }[] = [];
    let running = 0;
    relatedDonors.forEach((dn, idx) => {
      const amt = idx < relatedDonors.length - 1 ? perDonor(dn) : rawTotal - running;
      fromDonors.push({ donorName: dn.name, amount: amt });
      running += amt;
    });

    return { name: rcpt.name, isTaxable: true, total: rawTotal, thresholdApplied: threshold, fromDonors };
  });

  // ─── 검증표 (잔존주주 postValue floor + 마지막 잔존 잔액 흡수 → 합계 증감 0) ───
  let postRunning = 0;
  const survivorPostValue = new Map<string, number>();
  survivors.forEach((s, idx) => {
    const v =
      idx < survivors.length - 1
        ? safeMultiplyThenDivide(postSharesOf(s), postValueExactTotal, postTotal)
        : postValueExactTotal - postRunning;
    survivorPostValue.set(s.id, v);
    postRunning += idx < survivors.length - 1 ? v : 0;
  });
  const verification: CapitalDecreaseVerification[] = sh.map((s) => {
    const preValue = safeMultiply(s.preShares, evalPrice);
    const redemptionPaid = safeMultiply(s.redeemedShares, s.redemptionPricePerShare ?? 0);
    const postValue = s.redeemedShares > 0 ? 0 : survivorPostValue.get(s.id) ?? 0;
    return { name: s.name, preValue, redemptionPaid, postValue, delta: postValue + redemptionPaid - preValue };
  });

  // ─── 최종 조립 ───
  const deemedGiftValue = donees.reduce((a, d) => a + (d.isTaxable ? d.total : 0), 0);
  const breakdown: CalculationStep[] = [
    { label: "감자 후 1주당 평가액", amount: postPerShareDisplay, lawRef: GIFT.CAPITAL_DECREASE },
    {
      label: caseType === "high" ? "증여재산가액 (고가소각 §39의2①2호)" : "증여재산가액 (저가소각 §39의2①1호)",
      amount: deemedGiftValue,
      lawRef: GIFT.CAPITAL_DECREASE,
      note: `과세 수증자 ${donees.filter((d) => d.isTaxable).length}명`,
    },
  ];

  return {
    type: "capital_decrease",
    applied: deemedGiftValue > 0,
    deemedGiftValue,
    breakdown,
    exclusionReason: deemedGiftValue > 0 ? undefined : "과세 요건 충족 수증자 없음(대주주·특수관계·기준금액·액면 게이트)",
    legalBasis: GIFT.CAPITAL_DECREASE,
    capitalDecreaseMulti: { caseType, postPerShareExact, postPerShareDisplay, donees, verification },
  };
}
