/**
 * transfer-tax-schema-rental.ts
 *
 * 임대주택 감면 공용 leaf 스키마 (rentHistorySchema·vacancyPeriodSchema).
 *
 * transfer-tax-schema-sub.ts(임대 감면 상세)와 transfer-tax-schema-reductions.ts
 * (23개 조문 discriminatedUnion)가 모두 이 두 스키마를 참조한다. 두 파일이 서로를
 * import(sub→reductionSchema re-export, reductions→rentHistorySchema)하면서 발생하던
 * 모듈 초기화 순환(ESM TDZ: `z.array(T)`에서 T가 초기화 전 접근)을 끊기 위해,
 * 양쪽이 공통으로 의존하는 leaf로 분리했다. zod 외 의존 없음 — 역참조 금지.
 */

import { z } from "zod";

export const rentHistorySchema = z.object({
  contractDate: z.string().date(),
  monthlyRent: z.number().int().nonnegative(),
  deposit: z.number().int().nonnegative(),
  contractType: z.enum(["jeonse", "monthly", "semi_jeonse"]),
});

export const vacancyPeriodSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
});
