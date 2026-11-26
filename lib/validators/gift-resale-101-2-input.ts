/**
 * §101② 증여 후 우회양도 판정 Zod 스키마 (`/api/calc/gift-resale-101-2`) — ⑫
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §5.2
 * ⑧(`lib/calc/gift-resale-101-2-validate.ts`)과 **같은 규칙**이다 — UI가 통과시키면 API도 통과한다(격자 테스트).
 *
 * - 날짜는 `YYYY-MM-DD`(존재하는 날짜) — route가 `toDate`로 UTC 자정 Date로 바꾼다.
 * - 양도일 ≥ 증여 등기접수일(사건 순서).
 * - 금액은 0 이상 정수. 증여세 공제·감면세액 ≤ 산출세액.
 * - 실질귀속은 `yes`/`no`만 — 「모름」 없음, 생략하면 거부(Q-3).
 */
import { z } from "zod";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 달력에 있는 날짜인가 — `2026-02-30`은 정규식을 통과하지만 무효다 */
export function isRealIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const isoDate = z.string().refine(isRealIsoDate, { message: "존재하는 날짜(YYYY-MM-DD)여야 합니다." });
const won = z.number().int().min(0);

export const giftResaleInputSchema = z
  .object({
    relation: z.enum(["related", "spouse_lineal", "none"]),
    giftRegistryDate: isoDate,
    transferDate: isoDate,
    substantiveAttribution: z.enum(["yes", "no"]),
    isBurdenedGift: z.boolean(),
    donorDeceasedAtTransfer: z.boolean(),
    donorHasOtherTransfersSameYear: z.boolean(),
    doneeHasOtherTransfersSameYear: z.boolean(),
    giftTaxIncludesOtherAssets: z.boolean(),
    giftTaxCalculated: won,
    giftTaxCreditsAndReductions: won,
    doneeTransferDeterminedTax: won,
    donorTransferDeterminedTax: won,
  })
  .superRefine((v, ctx) => {
    if (v.transferDate < v.giftRegistryDate) {
      ctx.addIssue({ code: "custom", path: ["transferDate"], message: "양도일이 증여 등기접수일보다 앞설 수 없습니다." });
    }
    if (v.giftTaxCreditsAndReductions > v.giftTaxCalculated) {
      ctx.addIssue({
        code: "custom",
        path: ["giftTaxCreditsAndReductions"],
        message: "증여세 공제·감면세액이 산출세액보다 클 수 없습니다.",
      });
    }
  });

export type GiftResaleRequestBody = z.input<typeof giftResaleInputSchema>;
