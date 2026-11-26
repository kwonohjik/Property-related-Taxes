/**
 * §101② 증여 후 우회양도 판정 ⑧ validation — 입력 폼 → 차단 사유
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §5.4
 * ⑫ Zod(`lib/validators/gift-resale-101-2-input.ts`)와 **같은 규칙·같은 문턱**이다 — UI만 막는 규칙은 없다.
 * 빈칸·미선택은 「미입력」으로 막는다(자동 보정·안분 없음 — 실질귀속 「모름」도 없다, Q-3).
 */
import type { GiftResaleFormState } from "./gift-resale-101-2-form";
import { isRealIsoDate } from "@/lib/validators/gift-resale-101-2-input";

export type GiftResaleIssueCode = "required" | "format" | "order" | "range";

export interface GiftResaleIssue {
  field: keyof GiftResaleFormState;
  code: GiftResaleIssueCode;
  message: string;
}

const AMOUNT_LABEL = {
  giftTaxCalculated: "증여세 산출세액",
  giftTaxCreditsAndReductions: "증여세 공제·감면세액",
  doneeTransferDeterminedTax: "수증자 양도소득세 결정세액",
  donorTransferDeterminedTax: "증여자 직접양도 양도소득세 결정세액",
} as const;

export function validateGiftResale(form: GiftResaleFormState): GiftResaleIssue[] {
  const out: GiftResaleIssue[] = [];

  if (!form.relation) {
    out.push({ field: "relation", code: "required", message: "증여자와 수증자의 관계를 고르세요." });
  }

  const dates = [
    ["giftRegistryDate", "증여 등기접수일"],
    ["transferDate", "양도일"],
  ] as const;
  for (const [field, label] of dates) {
    if (!form[field]) out.push({ field, code: "required", message: `${label}을 입력하세요.` });
    else if (!isRealIsoDate(form[field])) out.push({ field, code: "format", message: `${label}이 존재하지 않는 날짜입니다.` });
  }
  if (isRealIsoDate(form.giftRegistryDate) && isRealIsoDate(form.transferDate) && form.transferDate < form.giftRegistryDate) {
    out.push({ field: "transferDate", code: "order", message: "양도일이 증여 등기접수일보다 앞설 수 없습니다." });
  }

  if (!form.substantiveAttribution) {
    out.push({
      field: "substantiveAttribution",
      code: "required",
      message: "양도소득이 수증자에게 실질적으로 귀속됐는지 «예» 또는 «아니오»를 고르세요.",
    });
  }

  for (const field of Object.keys(AMOUNT_LABEL) as (keyof typeof AMOUNT_LABEL)[]) {
    const v = form[field];
    if (v === null) out.push({ field, code: "required", message: `${AMOUNT_LABEL[field]}을 입력하세요.` });
    else if (!Number.isInteger(v) || v < 0) out.push({ field, code: "range", message: `${AMOUNT_LABEL[field]}은 0 이상의 원 단위 정수여야 합니다.` });
  }
  if (
    form.giftTaxCalculated !== null &&
    form.giftTaxCreditsAndReductions !== null &&
    form.giftTaxCreditsAndReductions > form.giftTaxCalculated
  ) {
    out.push({ field: "giftTaxCreditsAndReductions", code: "range", message: "증여세 공제·감면세액이 산출세액보다 클 수 없습니다." });
  }

  return out;
}
