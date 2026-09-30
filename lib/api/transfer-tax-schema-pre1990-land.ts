/**
 * ⑫ 1990.8.30. 이전 취득 토지 기준시가 환산(소득세법 시행령 §164④) — **leaf**.
 *
 * `transfer-tax-schema-sub.ts`에서 옮겼다(2026-09-30, CP-3). 컴패니언 스키마(`transfer-tax-schema-companion.ts`)가
 * 주 자산과 **같은 §163⑨ shape**(`transfer-tax-schema-sec163-9-shape.ts`)을 쓰려면 이 스키마를 import해야 하는데,
 * sub ↔ companion은 서로를 참조해 TDZ 순환이 된다. 공개 경로는 sub의 재export로 유지된다.
 */
import { z } from "zod";

export const landGradeInputSchema = z.union([
  z.number().int().min(1).max(365),
  z.object({ gradeValue: z.number().positive() }),
]);

export const pre1990LandSchema = z.object({
  acquisitionDate: z.string().date(),
  transferDate: z.string().date(),
  areaSqm: z.number().positive(),
  pricePerSqm_1990: z.number().positive(),
  // 양도시 기준시가는 상위 standardPriceAtTransfer로 공급 — 서브엔진은 산출하지 않음(deprecated).
  pricePerSqm_atTransfer: z.number().positive().optional(),
  grade_1990_0830: landGradeInputSchema,
  gradePrev_1990_0830: landGradeInputSchema,
  gradeAtAcquisition: landGradeInputSchema,
  forceRatioCap: z.boolean().optional(),
});
