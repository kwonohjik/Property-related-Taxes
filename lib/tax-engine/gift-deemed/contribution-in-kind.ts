/** (10) 현물출자에 따른 이익의 증여 (§39의3) — 저가인수(①1호) / 고가인수(①2호) */
import { GIFT } from "../legal-codes";
import { applyRate, safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import { computeWeightedPerShare } from "./capital-helpers";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, ContributionInput, ContributionParty } from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

type ContributionBreakdownRow = NonNullable<DeemedGiftResult["contributionBreakdown"]>[number];

/** 결과뷰 법령 근거 행 — 4대 비수치 법령효과 키워드 부착 (증여시기·할증배제·연대면제·중복배제) */
function legalNote(base: string): string {
  return (
    `${base} · 증여시기 현물출자 납입일(${GIFT.CONTRIBUTION_TIMING})` +
    ` · 최대주주 할증평가 배제(${GIFT.PREMIUM_EXCLUSION_29_3})` +
    ` · 증여자 연대납부의무 면제(${GIFT.JOINT_LIABILITY_EXEMPTION})` +
    ` · 중복적용 배제(${GIFT.DUP_EXCLUSION})`
  );
}

/** "55,000/100,000" 형태 비율 라벨 (locale 무관 천단위 콤마) */
function ratioLabel(numer: number, denom: number): string {
  const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${fmt(numer)}/${fmt(denom)}`;
}

/** 당사자 표시명 (feedback_no_internal_id_in_result) */
function partyName(p: ContributionParty): string {
  return (p.name ?? "").trim() || "주주";
}

export function calcContributionGift(input: ContributionInput): DeemedGiftResult {
  return (input.caseType ?? "low") === "high" ? contributionHigh(input) : contributionLow(input);
}

/** ①1호 저가인수 (시행령 §29의3①1 → §29②1가 준용) */
function contributionLow(input: ContributionInput): DeemedGiftResult {
  const { preContribPrice, preContribShares, newSharePrice, contributedShares, allocatedShares, parties } = input;
  const perShareAfter = computeWeightedPerShare(preContribPrice, preContribShares, newSharePrice, contributedShares);
  const perShareGain = perShareAfter - newSharePrice; // 저가: 평가 > 인수가
  // gross = 법문 §29의3①1호 = (후가−인수가) × 배정신주수 (지분비율 없음)
  const gross = perShareGain > 0 ? safeMultiply(perShareGain, allocatedShares) : 0;

  // §39의3②: 이익을 증여한 소액주주 2명 이상 → 1인 의제 (저가인수 ①1호 한정, 집계 이익 불변)
  const imputation = input.smallShareholderImputation === true;
  const imputationNote = imputation ? " · §39의3② 소액주주 1인 의제" : "";

  const breakdown: CalculationStep[] = [
    { label: "현물출자 후 1주당 가액", amount: perShareAfter, lawRef: GIFT.CONTRIBUTION },
    { label: "신주 1주당 인수가액", amount: newSharePrice },
    { label: "1주당 이익", amount: perShareGain },
    { label: "배정받은 신주수", amount: allocatedShares },
    { label: "증여재산가액 총액(gross)", amount: gross, lawRef: GIFT.CONTRIBUTION, note: "법문 §29의3①1호 — 증여자별 안분 전" },
  ];

  if (parties === undefined || parties.length === 0) {
    // roster無: gross만 표시, 자동 안분 금지 (feedback_no_silent_apportion_fallback).
    // 현물출자자가 출자前 지분 보유 시 gross > 실제 과세표준 — 결과뷰 amber 경고로 안내.
    breakdown.push({
      label: "증여재산가액",
      amount: gross,
      lawRef: GIFT.CONTRIBUTION,
      note: legalNote(`§39의3①1호 저가인수${imputationNote} — 증여자 명부 미입력(자기지분 포함 전액)`),
    });
    return {
      type: "contribution",
      applied: gross > 0,
      caseType: "low",
      deemedGiftValue: gross,
      grossDeemedGiftValue: gross,
      breakdown,
      exclusionReason: gross > 0 ? undefined : "출자 후 1주가가 인수가 이하 — 이익 없음",
      legalBasis: GIFT.CONTRIBUTION,
      thresholdEcho: { gain: gross, smallShareholderImputation: imputation },
    };
  }

  // roster有: §47 증여자별 안분 (현물출자자 자기지분은 명부 미포함으로 자연 제외).
  const sumShares = parties.reduce((s, p) => s + p.preShares, 0);
  // ★ 잔액흡수 기준 = taxableTotal (gross 아님 — feedback_floor_residual_absorption).
  //    gross 기준이면 자기증여 비과세분이 마지막 증여자에 흡수돼 과대과세.
  const taxableTotal = safeMultiplyThenDivide(gross, sumShares, preContribShares);

  const contributionBreakdown: ContributionBreakdownRow[] = [];
  let acc = 0;
  parties.forEach((p, i) => {
    const isLast = i === parties.length - 1;
    const v = isLast ? taxableTotal - acc : safeMultiplyThenDivide(gross, p.preShares, preContribShares);
    if (!isLast) acc += v;
    contributionBreakdown.push({
      party: partyName(p),
      preShares: p.preShares,
      ratioLabel: ratioLabel(p.preShares, preContribShares),
      value: v,
      relation: p.relation,
    });
  });

  contributionBreakdown.forEach((bd) =>
    breakdown.push({ label: `증여자 ${bd.party} (${bd.ratioLabel})`, amount: bd.value }),
  );
  breakdown.push({
    label: "증여재산가액(과세)",
    amount: taxableTotal,
    lawRef: GIFT.CONTRIBUTION,
    note: legalNote(`§39의3①1호 저가인수${imputationNote} — 증여자별 안분(자기지분 제외, §47)`),
  });

  return {
    type: "contribution",
    applied: taxableTotal > 0,
    caseType: "low",
    deemedGiftValue: taxableTotal,
    grossDeemedGiftValue: gross,
    contributionBreakdown,
    breakdown,
    exclusionReason: taxableTotal > 0 ? undefined : "출자 후 1주가가 인수가 이하 — 이익 없음",
    legalBasis: GIFT.CONTRIBUTION,
    thresholdEcho: { gain: taxableTotal, smallShareholderImputation: imputation },
  };
}

/** ①2호 고가인수 (시행령 §29의3①2·② → §29②3가 준용) */
function contributionHigh(input: ContributionInput): DeemedGiftResult {
  const { preContribPrice, preContribShares, newSharePrice, contributedShares, allocatedShares, parties } = input;
  const perShareAfter = computeWeightedPerShare(preContribPrice, preContribShares, newSharePrice, contributedShares);
  const perShareGain = newSharePrice - perShareAfter; // 고가: 인수가 > 평가
  const base = perShareGain > 0 ? safeMultiply(perShareGain, allocatedShares) : 0;
  // §29의3② 30% 게이트 — per-share 공통(다수 수증자도 동일). CON-H 회귀: applyRate(perShareAfter, 0.3).
  const ratioGateMet = perShareGain >= applyRate(perShareAfter, 0.3);

  const baseBreakdown: CalculationStep[] = [
    { label: "신주 1주당 인수가액", amount: newSharePrice, lawRef: GIFT.CONTRIBUTION },
    { label: "현물출자 후 1주당 가액", amount: perShareAfter },
    { label: "1주당 차액", amount: perShareGain },
    { label: "인수 신주수", amount: allocatedShares },
    { label: "차액 × 인수신주(base)", amount: base, note: "특수관계인 지분비율 적용 전" },
  ];

  if (parties === undefined || parties.length === 0) {
    // roster無: 현행 relatedRatio 경로 (CON-H 회귀 보존). 저가 Step 3-L과 대칭(빈 배열 방어).
    // ⚠️ 3억 게이트가 합계(aggregate) 기준 — 다수 특수관계인을 단일 relatedRatio로 입력 시
    //    개인별 < 3억·합계 ≥ 3억이면 §29의3② per-donee 기준과 어긋날 수 있음(roster 경로 권장).
    const relatedRatio = input.relatedRatio ?? { numer: 0, denom: 1 };
    const gain = safeMultiplyThenDivide(base, relatedRatio.numer, relatedRatio.denom);
    const applied = gain > 0 && (ratioGateMet || gain >= ABSOLUTE_THRESHOLD);
    const value = applied ? gain : 0;
    return {
      type: "contribution",
      applied,
      caseType: "high",
      deemedGiftValue: value,
      grossDeemedGiftValue: base,
      breakdown: [
        ...baseBreakdown,
        {
          label: "증여재산가액 (차액 × 인수신주 × 특수관계인 지분비율)",
          amount: value,
          lawRef: GIFT.CONTRIBUTION,
          note: legalNote("§39의3①2호 고가인수"),
        },
      ],
      exclusionReason: applied ? undefined : "이익이 기준금액(출자후평가 30%·3억) 미만",
      legalBasis: GIFT.CONTRIBUTION,
      thresholdEcho: { gain: value },
    };
  }

  // roster有: per-donee 분리. 30% 게이트=per-share 공통, 3억 게이트=per-donee(§29의3② "그 이익").
  const contributionBreakdown: ContributionBreakdownRow[] = [];
  let deemedGiftValue = 0;
  parties.forEach((p) => {
    const raw = safeMultiplyThenDivide(base, p.preShares, preContribShares);
    const applied = raw > 0 && (ratioGateMet || raw >= ABSOLUTE_THRESHOLD);
    const v = applied ? raw : 0;
    deemedGiftValue += v;
    contributionBreakdown.push({
      party: partyName(p),
      preShares: p.preShares,
      ratioLabel: ratioLabel(p.preShares, preContribShares),
      value: v,
      relation: p.relation,
    });
  });

  const breakdown: CalculationStep[] = [...baseBreakdown];
  contributionBreakdown.forEach((bd) =>
    breakdown.push({ label: `수증자 ${bd.party} (${bd.ratioLabel})`, amount: bd.value }),
  );
  breakdown.push({
    label: "증여재산가액(과세)",
    amount: deemedGiftValue,
    lawRef: GIFT.CONTRIBUTION,
    note: legalNote("§39의3①2호 고가인수 — 수증자별 per-donee(특수관계인)"),
  });

  return {
    type: "contribution",
    applied: deemedGiftValue > 0,
    caseType: "high",
    deemedGiftValue,
    grossDeemedGiftValue: base,
    contributionBreakdown,
    breakdown,
    exclusionReason: deemedGiftValue > 0 ? undefined : "이익이 기준금액(출자후평가 30%·3억) 미만",
    legalBasis: GIFT.CONTRIBUTION,
    thresholdEcho: { gain: deemedGiftValue },
  };
}
