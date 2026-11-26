/**
 * §101② 증여 후 우회양도 판정 — 판정 사유·확인 필요 문구 매핑 (순수 함수)
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §4(K-1~K-18)·§5.3
 * 엔진은 문구가 아니라 코드를 낸다(`GiftResaleReasonCode`·`GiftResaleConfirmation`) — 문구는 여기서만 정한다.
 * `satisfies Record<…>`가 코드 추가 시 문구 누락을 컴파일 오류로 만든다.
 *
 * 조문 번호는 `GIFT_RESALE_101` 상수에서 파생한다(리터럴 재작성 금지 — 항 번호 오기는 verify:legal이 못 잡는다).
 * 유리·불리·절감 표현을 쓰지 않는다 — 판정과 근거만 적는다.
 */
import type { GiftResaleConfirmation, GiftResaleReasonCode } from "@/lib/tax-engine/gift-resale-101-2";
import { GIFT_RESALE_101 } from "@/lib/tax-engine/legal-codes/transfer-gift-resale-101";
import { TRANSFER, shortArticle } from "@/lib/tax-engine/legal-codes/transfer";

/** 「§101 ②」 → 「§101②」 — 항 번호 앞 공백만 지운다(「§101 ② 단서」 → 「§101② 단서」) */
const tight = (s: string): string => s.replace(/ (?=[①-⑳])/g, "");

/** 상수 → 화면용 짧은 인용 */
const art = (citation: string): string => tight(shortArticle(citation));

const A101_2 = art(GIFT_RESALE_101.SEC101_2);
const A101_2_PROVISO = art(GIFT_RESALE_101.SEC101_2_PROVISO);
const A101_3 = art(GIFT_RESALE_101.SEC101_3);
const DECREE_98_1 = tight(GIFT_RESALE_101.DECREE_SEC98_1);
/** 시행령 §163의2 — 기존 상수에 항이 없어 ②를 덧붙인다(이월과세 증여세 상당액 안분) */
const DECREE_163_2_2 = `${TRANSFER.CARRYOVER_GIFT_TAX_FORMULA}②`;

/** 엔진이 주는 날짜(ISO 문자열 · `Date#toISOString`) → 「YYYY.M.D.」. 해석할 수 없으면 원문 그대로. */
export function formatGiftResaleDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}.${Number(m[2])}.${Number(m[3])}.`;
}

export interface GiftResaleReasonContext {
  periodYears: 5 | 10;
  /** 엔진 `deadline`의 ISO 문자열 */
  deadline: string;
}

type ReasonText = (ctx: GiftResaleReasonContext) => string;

const REASON_TEXT = {
  applied: () =>
    `부인 적용 — 증여자가 그 자산을 직접 양도한 것으로 봅니다(${A101_2}). 수증자는 연대하여 납세의무를 지고(§2의2③), 당초 증여받은 자산에는 증여세를 부과하지 않습니다(${A101_3}).`,
  clause1_not_less: () =>
    "미적용 — 1호 세액(증여세 + 수증자 양도소득세)이 2호 세액(증여자가 직접 양도한 경우의 양도소득세)보다 적지 않습니다.",
  attributed_to_donee: () => `미적용 — 양도소득이 수증자에게 실질적으로 귀속됐습니다(${A101_2_PROVISO}).`,
  period_exceeded: ({ periodYears, deadline }) =>
    `미적용 — 증여 등기접수일부터 ${periodYears}년(${formatGiftResaleDate(deadline)})이 지난 뒤 양도했습니다.`,
  relation_none: () => `미적용 — 증여자와 수증자가 특수관계인(${DECREE_98_1})이 아닙니다.`,
  relation_spouse_lineal: () =>
    "배우자·직계존비속 증여는 이 판정 대상이 아닙니다. 양도세 계산기의 「배우자등 이월과세」(§97의2)로 계산하세요. 이월과세가 배제되는 경우(§97의2②)에 §101②가 적용되는지는 해석례가 없어 다루지 않습니다.",
  burdened_gift:
    () => "부담부증여는 지원하지 않습니다 — 채무 부분은 양도이고 증여 부분만 §101② 대상이라 나누어 입력해야 합니다.",
  donor_deceased: () =>
    "양도일 현재 증여자가 사망한 경우는 판정하지 않습니다 — 구 해석례(재일46014-668)에 미적용으로 본 사례가 있으나 현행 적용은 확인이 필요합니다.",
  before_2013: () => "2013.1.1. 전 양도는 지원하지 않습니다.",
} satisfies Record<GiftResaleReasonCode, ReasonText>;

/**
 * 2호 열 고지(V-2) — 증여자 기준 계산에 감면을 넣었을 때 그 감면을 2호에 반영할지는 해석례가 엇갈린다.
 * 해석례 번호는 원문 재대조(V-8) 전이라 적지 않는다.
 */
export const GIFT_RESALE_DONOR_REDUCTION_NOTE =
  "증여자 기준 계산에 감면을 넣었다면, 그 감면을 2호에 반영할지는 해석례가 엇갈려 확인이 필요합니다.";

/** 부인 적용 결과에 덧붙이는 줄 */
export const GIFT_RESALE_APPLIED_EXTRA = "이미 낸 증여세의 환급 절차는 확인이 필요합니다.";

export function giftResaleReasonText(code: GiftResaleReasonCode, ctx: GiftResaleReasonContext): string {
  return REASON_TEXT[code](ctx);
}

export const GIFT_RESALE_CONFIRMATION_TEXT = {
  other_transfers_same_year:
    "같은 해 다른 양도가 있습니다 — 1·2호의 양도소득세를 그 해 전체 결정세액으로 볼지 이 자산 몫으로 볼지 해석이 확인되지 않았습니다. 넣은 금액에 따라 결론이 달라질 수 있어 확인이 필요합니다.",
  gift_tax_includes_other_assets: `증여세에 다른 증여재산이 포함돼 있습니다 — 이 자산 몫을 나누는 방법은 ${A101_2}에 명문이 없습니다(인접 규정: ${DECREE_163_2_2} 이월과세 증여세 상당액 안분). 확인이 필요합니다.`,
} satisfies Record<GiftResaleConfirmation, string>;

/** 화면에서 «1호 열» 증여세 칸에 «이 자산 몫»을 안내할 때 쓰는 hint */
export const GIFT_RESALE_SHARE_HINT = `이 자산 몫을 나누는 방법은 ${A101_2}에 명문이 없습니다 — 확인 필요`;

/** 관계 선택지 설명 — 「특수관계인」의 범위(시행령 §98①) */
export const GIFT_RESALE_RELATED_DESCRIPTION = `4촌 이내 혈족·3촌 이내 인척, 임원·사용인 등 경제적 연관관계, 경영지배관계 — ${DECREE_98_1}`;

/** 결과 카드·화면 머리에서 같이 쓰는 인용 */
export const GIFT_RESALE_ARTICLES = {
  sec101_2: A101_2,
  sec101_3: A101_3,
  sec101_4: art(GIFT_RESALE_101.SEC101_4),
} as const;
