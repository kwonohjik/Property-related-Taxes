/**
 * 소득세법 §101② — 특수관계인 증여 후 10년 내 양도 부당행위계산부인 **판정** (순수 함수)
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §4(케이스 K-1~K-18)·§5.1
 *
 * 양도세를 계산하지 않는다. 사용자가 양도세 계산기를 수증자 기준·증여자 기준으로 한 번씩 돌린
 * **결정세액**(§92③2호 — 가산세 제외)과 증여세를 받아 1호·2호를 비교한다(안 A · Q-0).
 *
 * - 1호 = 증여세(산출세액 − 공제·감면세액, 신고세액공제 포함 — Q-2) + 수증자 양도세 결정세액
 * - 2호 = 증여자가 직접 양도한 것으로 보아 계산한 양도세 결정세액
 * - 1호 < 2호 이고 실질귀속이 아니면 부인 적용 → 납세의무자 증여자(§2의2③ 수증자 연대) · 증여세 미부과(§101③)
 * - 금액 비교만 하고 곱셈이 없다. 지방소득세는 1·2호 어디에도 없다(최종부담에서도 제외).
 */
import { addYears, parseISO } from "./utc-date";
import { TEN_YEAR_RULE_CUTOFF } from "./transfer-tax-carryover-eligibility";

/**
 * 1·2호 구조와 단서가 본문에 있는 것이 확인된 시점(2013.1.1. 시행본). 그 전 양도는 지원하지 않는다(K-15 · V-7).
 * 도입 시점 자체(2009.12.31.~2011.6.1. 사이)는 미확인이다 — 이 값을 「도입일」로 표시하지 말 것.
 */
export const GIFT_RESALE_SUPPORTED_TRANSFER_FROM = parseISO("2013-01-01");

/** 증여자와 수증자의 관계 — 「특수관계인」은 소득세법 시행령 §98① → 국세기본법 시행령 §1의2①②③1호 */
export type GiftResaleRelation =
  /** 배우자·직계존비속이 아닌 특수관계인(4촌 이내 혈족·3촌 이내 인척·경제적 연관·경영지배 등) */
  | "related"
  /** 배우자·직계존비속 — 이월과세(§97의2) 적용·배제 불문 이 판정 대상에서 뺀다(Q-1) */
  | "spouse_lineal"
  /** 특수관계 없음 */
  | "none";

export type GiftResaleOutcome = "applied" | "not_applied" | "out_of_scope";

export type GiftResaleReasonCode =
  | "applied"                 // K-1
  | "clause1_not_less"        // K-2·K-3 (1호 ≥ 2호)
  | "attributed_to_donee"     // K-4 단서
  | "period_exceeded"         // K-6
  | "relation_none"           // K-10
  | "relation_spouse_lineal"  // K-8·K-9 (차단)
  | "burdened_gift"           // K-12 (차단)
  | "donor_deceased"          // K-13 (차단 — 근거가 구법 해석뿐)
  | "before_2013";            // K-15 (차단)

/** 판정은 하되 결론의 전제가 미확인인 항목(K-17·K-18) */
export type GiftResaleConfirmation =
  | "other_transfers_same_year"       // V-10 — 1·2호 양도세가 연간 결정세액인지 이 자산 몫인지 미확인
  | "gift_tax_includes_other_assets"; // V-9 — 증여세 «이 자산 몫» 산정 방법 명문 없음

export interface GiftResaleInput {
  relation: GiftResaleRelation;
  /** 증여 등기접수일 — §101④ → §97의2③ 「등기부에 기재된 소유기간」 */
  giftRegistryDate: Date;
  /** 수증자의 양도일 */
  transferDate: Date;
  /** 양도소득이 수증자에게 실질적으로 귀속됐는가(§101② 단서) — 미선택은 ⑧·⑫에서 차단(Q-3) */
  substantiveAttribution: "yes" | "no";
  isBurdenedGift: boolean;
  donorDeceasedAtTransfer: boolean;
  donorHasOtherTransfersSameYear: boolean;
  doneeHasOtherTransfersSameYear: boolean;
  /** 참이면 아래 증여세 두 칸은 사용자가 넣은 «이 자산 몫»이다(자동 안분 없음 — Q-9) */
  giftTaxIncludesOtherAssets: boolean;
  /** 증여세 산출세액 */
  giftTaxCalculated: number;
  /** 증여세 공제·감면세액(신고세액공제 포함) — 산출세액 이하(⑧·⑫) */
  giftTaxCreditsAndReductions: number;
  /** 1호 — 수증자 양도세 결정세액 */
  doneeTransferDeterminedTax: number;
  /** 2호 — 증여자가 직접 양도한 것으로 보아 계산한 양도세 결정세액 */
  donorTransferDeterminedTax: number;
}

export interface GiftResaleResult {
  outcome: GiftResaleOutcome;
  reasonCode: GiftResaleReasonCode;
  /** 1호 = 증여세(산출 − 공제·감면) + 수증자 결정세액 */
  clause1Tax: number;
  /** 2호 = 증여자 직접양도 결정세액 */
  clause2Tax: number;
  /** §101④·부칙 — 증여 등기접수일이 2023.1.1. 전이면 5년 */
  periodYears: 5 | 10;
  /** 이 날까지 양도하면 기간 안(당일 포함) */
  deadline: Date;
  /** out_of_scope면 null — 판정하지 않았다 */
  taxpayer: "donor" | "donee" | null;
  /** 소득세·증여세 합(지방소득세 제외). 적용 = 2호(증여세 미부과) · 미적용 = 1호 · out_of_scope = null */
  finalBurden: number | null;
  needsConfirmation: GiftResaleConfirmation[];
}

export function judgeGiftResale1012(input: GiftResaleInput): GiftResaleResult {
  const giftTax = input.giftTaxCalculated - input.giftTaxCreditsAndReductions;
  const clause1Tax = giftTax + input.doneeTransferDeterminedTax;
  const clause2Tax = input.donorTransferDeterminedTax;
  // §101④ → §97의2③ · 부칙 §18 — 경계는 이월과세와 같은 단일 소스·같은 비교식(당일은 기간 안)
  const periodYears: 5 | 10 = input.giftRegistryDate < TEN_YEAR_RULE_CUTOFF ? 5 : 10;
  const deadline = addYears(input.giftRegistryDate, periodYears);

  const needsConfirmation: GiftResaleConfirmation[] = [];
  if (input.donorHasOtherTransfersSameYear || input.doneeHasOtherTransfersSameYear) {
    needsConfirmation.push("other_transfers_same_year");
  }
  if (input.giftTaxIncludesOtherAssets) needsConfirmation.push("gift_tax_includes_other_assets");

  const base = { clause1Tax, clause2Tax, periodYears, deadline, needsConfirmation };
  const outOfScope = (reasonCode: GiftResaleReasonCode): GiftResaleResult => ({
    ...base, outcome: "out_of_scope", reasonCode, taxpayer: null, finalBurden: null,
  });
  const notApplied = (reasonCode: GiftResaleReasonCode): GiftResaleResult => ({
    ...base, outcome: "not_applied", reasonCode, taxpayer: "donee", finalBurden: clause1Tax,
  });

  if (input.relation === "spouse_lineal") return outOfScope("relation_spouse_lineal");
  if (input.isBurdenedGift) return outOfScope("burdened_gift");
  if (input.donorDeceasedAtTransfer) return outOfScope("donor_deceased");
  if (input.transferDate < GIFT_RESALE_SUPPORTED_TRANSFER_FROM) return outOfScope("before_2013");

  if (input.relation === "none") return notApplied("relation_none");
  if (input.transferDate > deadline) return notApplied("period_exceeded");
  if (input.substantiveAttribution === "yes") return notApplied("attributed_to_donee");
  if (!(clause1Tax < clause2Tax)) return notApplied("clause1_not_less");

  return { ...base, outcome: "applied", reasonCode: "applied", taxpayer: "donor", finalBurden: clause2Tax };
}
