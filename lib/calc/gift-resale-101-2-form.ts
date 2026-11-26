/**
 * §101② 증여 후 우회양도 판정 화면 — 폼 상태(①)·초기값(②)
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §5.3·§5.4
 * 이력을 저장하지 않는 화면이라 store 없이 화면 로컬 state로 쓴다(R-14). normalize(③)가 필요 없다.
 *
 * 미선택·미입력은 `""`·`null`로 둔다 — 자동 보정 없이 ⑧·⑫가 막는다.
 * 토글 3개(같은 해 다른 양도 · 증여세에 다른 재산 포함)와 부담부증여·증여자 사망은 OFF(false)가 기본이다.
 */
import type { GiftResaleRelation } from "@/lib/tax-engine/gift-resale-101-2";

export interface GiftResaleFormState {
  relation: GiftResaleRelation | "";
  /** YYYY-MM-DD */
  giftRegistryDate: string;
  /** YYYY-MM-DD */
  transferDate: string;
  substantiveAttribution: "yes" | "no" | "";
  isBurdenedGift: boolean;
  donorDeceasedAtTransfer: boolean;
  donorHasOtherTransfersSameYear: boolean;
  doneeHasOtherTransfersSameYear: boolean;
  giftTaxIncludesOtherAssets: boolean;
  giftTaxCalculated: number | null;
  giftTaxCreditsAndReductions: number | null;
  doneeTransferDeterminedTax: number | null;
  donorTransferDeterminedTax: number | null;
}

export const GIFT_RESALE_INITIAL: GiftResaleFormState = {
  relation: "",
  giftRegistryDate: "",
  transferDate: "",
  substantiveAttribution: "",
  isBurdenedGift: false,
  donorDeceasedAtTransfer: false,
  donorHasOtherTransfersSameYear: false,
  doneeHasOtherTransfersSameYear: false,
  giftTaxIncludesOtherAssets: false,
  giftTaxCalculated: null,
  giftTaxCreditsAndReductions: null,
  doneeTransferDeterminedTax: null,
  donorTransferDeterminedTax: null,
};
