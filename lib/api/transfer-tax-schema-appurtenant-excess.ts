/**
 * ⑫ 배율 초과분의 «비사업용 토지로 보지 않는» 사유 판정 사실 (NBL2611-C4 · R16) — 엔진 `TransferTaxInput.appurtenantExcessFacts`의 운반 스키마.
 *
 * 주 자산(단건·다건)과 함께 양도 컴패니언 카드가 **같은 스키마**를 쓴다 — 한쪽에만 두면 Zod가 값을 조용히 떼어내(strip) 엔진에 닿지 않는다(200 + 의제 미적용).
 * 유예 구간은 ④가 사유별 법정기간으로 이미 푼 시작·종료일이다(`resolveGraceIntervals`).
 */
import { z } from "zod";

export const appurtenantExcessFactsSchema = z
  .object({
    /** 공익수용 사업인정 고시일 — 영 §168의14③3호. `transferCause`가 수용일 때만 엔진이 읽는다. */
    expropriationNoticeDate: z.string().date().optional(),
    /** 영 §168의14① 유예기간 구간 — 주택 배율 초과분만 읽는다. */
    graceIntervals: z
      .array(
        z
          .object({ startDate: z.string().date(), endDate: z.string().date() })
          .refine((g) => g.startDate <= g.endDate, { message: "유예기간 시작일이 종료일보다 늦습니다." }),
      )
      .max(60)
      .optional(),
  })
  .optional();
