/**
 * 증여로 보는 경우 Zod — 본 스키마(`gift-deemed-input.ts`)와 Phase 3 스키마(`gift-deemed-input-phase3.ts`)가
 * 함께 쓰는 조각. 800줄 정책으로 나누면서 옮겼다 — 정의와 주석은 그대로다.
 */
import { z } from "zod";

/**
 * ⑫ 「상증법」§2 9호·§4의2①·③ 공통 축 — §39 밖 단일 수증자 13종(7-12).
 *
 * 붙는 유형은 `taxpayer-gate.ts` `COMMON_FOR_PROFIT_DONEE_GATE`와 **같아야 한다**.
 * 빠지면 Zod가 이 필드를 **침묵 strip**해 화면에서 켠 토글이 엔진에 닿지 않고(TypeScript는
 * 모른다), 더 붙이면 명부형·§45의2 페이로드가 이 필드를 통과시킨다.
 * `for-profit-donee-zod-layer.anchor.test.ts`가 두 방향을 고정한다.
 */
export const forProfitDoneeShape = {
  doneeIsForProfitCorp: z.boolean().optional(),
};

/**
 * ⑫ 「상증법」§4의2③ 축(7-16) — 수증자 1명 입력 스키마에만. 영리법인 shape가 붙는 16곳 + §39 단건(최상위) ·
 * 전환주식(최상위 — 2시점 leg가 아니다) · §45의5. §41의2·§45의2·§45의3에는 붙이지 않는다(법이 배제·명부뿐).
 * `income-taxed-donee-wiring.anchor.test.tsx`가 두 방향을 고정한다.
 */
export const incomeTaxedDoneeShape = {
  doneeIncomeOrCorporateTaxed: z.boolean().optional(),
};

// 🔴 `.int()`는 장식이 아니다 — 소수 분모가 통과하면 엔진의 `safeMultiplyThenDivide`가
//    BigInt 경로에서 `RangeError: Division by zero`를 던져 API가 500으로 죽는다
//    (leaf 쪽 가드는 `lib/tax-engine/tax-utils.ts`에 함께 넣었다).
//    생산 측(`lib/calc/gift-deemed-api.ts`의 `parseRatio`)은 `{Math.round(pct*100), 10_000}`
//    으로 언제나 정수를 만들므로, 정수 강제가 정상 입력을 막지 않는다.
export const ratioSchema = z
  .object({
    numer: z.number().int().nonnegative(),
    denom: z.number().int().positive(),
  })
  // 🔴 SC-7-g: 상한이 없어 200%(`{20000, 10000}`)가 그대로 통과했다 — 실측 2,000,000,000원.
  //    이 스키마의 사용처 14곳은 **전부 지분율 축**이다(이자율 같은 1을 넘는 rate는 없다)
  //    — `appropriateRate`는 별도 스키마다. ⑧validate가 막는 것은 클라이언트라 **서버측 관문**을 여기 둔다.
  //    roster의 「주식수 > 발행주식총수」 가드(`gift-deemed-input.ts` superRefine)와 같은 층위고, single 경로만 비어 있었다.
  .refine((r) => r.numer <= r.denom, {
    message: "지분율은 100%를 초과할 수 없습니다",
  });
