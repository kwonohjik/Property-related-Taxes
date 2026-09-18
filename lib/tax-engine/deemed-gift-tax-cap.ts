/**
 * 상증법 §45의5② — 특정법인과의 거래 이익 증여의제의 **증여세액 상한**을 증여세 본엔진에 적용한다.
 *
 * 「제1항에 따른 증여세액이 지배주주등이 직접 증여받은 경우의 증여세 상당액에서 특정법인이
 * 부담한 법인세 상당액을 차감한 금액을 초과하는 경우 **그 초과액은 없는 것으로 본다**.」
 * 감면이 아니라 세액 자체의 상한이므로 산출세액 단계에서 잘라야 한다.
 *
 * ── 종전 상태 ────────────────────────────────────────────────────────
 * 한도는 증여의제 결과뷰에만 표시되고(`SpecificCorpMultiResultView`), 「이 금액으로 증여세
 * 계산하기 →」로 마법사에 넘어가면 사라졌다. 같은 제품이 같은 사안에 **두 개의 세액**을 냈다
 * (교재 사례2 실측: 화면 적용 산출세액 189,000,000 ↔ 마법사 산출세액 399,600,000).
 *
 * ── 왜 무조건 자르지 않는가 ──────────────────────────────────────────
 * 상한이 걸리는 대상은 「**제1항에 따른** 증여세액」이다. 같은 신고에 다른 증여재산이나 사전증여가
 * 섞이면 산출세액은 §45의5① 이익 밖의 부분까지 포함하는데, §45의5에는 그 안분 규칙이 없다.
 * 없는 안분을 만들어 총액을 깎으면 다른 증여재산까지 법 근거 없이 덜 과세된다.
 * ⇒ **상한이 산출세액 전부에 대응한다고 말할 수 있을 때만** 적용하고, 아니면 적용하지 않고
 *    그 사실을 경고로 남긴다(조용히 버리지 않는다).
 *
 * ── staleness ────────────────────────────────────────────────────────
 * ㉯ = ㉠ − ㉡ 의 ㉠는 증여재산공제에 의존한다. 마법사에서 공제가 달라지면 이관된 ㉯는 낡은 값이다.
 * ⇒ 산출 근거(`basis`)를 함께 실어 **사본과 원본이 어긋나면 적용하지 않는다**.
 */
import type { EstateItem } from "./types/inheritance-gift.types";

/** 증여의제 화면이 이관하는 §45의5② 한도 + 그 산출 근거 스냅샷 */
export interface DeemedGiftTaxCap {
  /** ㉯ 한도액 = ㉠(직접증여 가정 증여세) − ㉡(법인세 상당액 × 주식보유비율) */
  limitAmount: number;
  /** staleness 가드 — 이 값들이 이번 신고와 다르면 한도를 적용하지 않는다 */
  basis: {
    /** 이관 당시 증여의제이익(= 이 항목의 평가액) */
    deemedGiftValue: number;
    /** 이관 당시 ㉮㉠ 계산에 쓴 증여재산공제 */
    giftDeduction: number;
  };
}

export type DeemedGiftTaxCapSkipReason =
  | "other_gift_property"
  | "prior_gifts"
  | "deduction_changed"
  | "value_changed";

export type DeemedGiftTaxCapDecision =
  | { status: "absent" }
  | { status: "applies"; limitAmount: number }
  | { status: "skipped"; limitAmount: number; reason: DeemedGiftTaxCapSkipReason };

const SKIP_MESSAGE: Record<DeemedGiftTaxCapSkipReason, string> = {
  other_gift_property:
    "다른 증여재산이 함께 있어 §45의5②(특정법인) 한도를 산출세액에 적용하지 않았습니다 — 한도는 §45의5①의 이익에만 걸리는데 그 안분 규정이 없습니다. 증여의제이익만 따로 신고하면 한도가 적용됩니다.",
  prior_gifts:
    "사전증여 합산이 있어 §45의5②(특정법인) 한도를 산출세액에 적용하지 않았습니다 — 한도는 §45의5①의 이익에만 걸리는데 그 안분 규정이 없습니다.",
  deduction_changed:
    "증여재산공제가 증여의제 화면과 달라져 §45의5②(특정법인) 한도를 적용하지 않았습니다 — 한도 ㉠는 공제액에 따라 달라집니다. 증여의제 화면에서 같은 공제로 다시 계산하십시오.",
  value_changed:
    "증여재산가액이 증여의제 화면과 달라져 §45의5②(특정법인) 한도를 적용하지 않았습니다 — 증여의제 화면에서 다시 계산하십시오.",
};

export function deemedGiftTaxCapWarning(reason: DeemedGiftTaxCapSkipReason): string {
  return SKIP_MESSAGE[reason];
}

/**
 * 한도 적용 여부를 판정한다. 「적용 가능한 하나의 조건」만 인정한다 —
 * 이 신고의 증여세과세가액이 **그 증여의제이익 하나**이고, 공제도 이관 당시와 같을 것.
 */
export function resolveDeemedGiftTaxCap(args: {
  items: EstateItem[];
  priorGiftCount: number;
  /** §47 합산 후 증여세과세가액 */
  aggregatedGiftValue: number;
  /** §53·§53의2 공제 합계 */
  totalDeduction: number;
}): DeemedGiftTaxCapDecision {
  const capped = args.items.filter((i) => i.deemedGiftTaxCap);
  if (capped.length === 0) return { status: "absent" };
  // 한도를 가진 항목이 둘 이상이면 어느 한도가 어느 세액에 대응하는지 정할 수 없다 — 적용하지 않는다.
  const cap = capped[0]!.deemedGiftTaxCap!;
  const limitAmount = Math.max(0, cap.limitAmount);
  const skip = (reason: DeemedGiftTaxCapSkipReason): DeemedGiftTaxCapDecision => ({
    status: "skipped",
    limitAmount,
    reason,
  });

  if (capped.length > 1 || args.items.length > 1) return skip("other_gift_property");
  if (args.priorGiftCount > 0) return skip("prior_gifts");
  if (args.aggregatedGiftValue !== cap.basis.deemedGiftValue) return skip("value_changed");
  if (args.totalDeduction !== cap.basis.giftDeduction) return skip("deduction_changed");
  return { status: "applies", limitAmount };
}
