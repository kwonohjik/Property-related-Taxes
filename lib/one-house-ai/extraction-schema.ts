/**
 * 1세대1주택 AI 사실 추출 — LLM 출력 스키마(구조화 출력 `output_config.format`).
 *
 * 필드가 100개를 넘어 폼 모양 그대로 엄격 스키마를 만들지 않고, 「경로 = 값」 목록으로 받는다.
 * 경로·값의 유효성은 필드 사전(`field-catalog.ts`)으로 `apply-extraction.ts`가 검증한다.
 *
 * 원문에 없는 사실은 값을 지어내지 않고 `missingFacts`에 질문으로 남긴다(「모름 = 불성립 + 확인 필요」).
 */
import { z } from "zod";

export const extractedFactSchema = z.object({
  /** 필드 사전 경로 — 배열 행은 `houses[A].acquisitionDate`처럼 행 이름을 대괄호에 넣는다 */
  path: z.string(),
  /** 값은 문자열 하나 — 날짜 YYYY-MM-DD · 참/거짓 "true"/"false" · 금액·개월은 숫자만 */
  value: z.string(),
  /** 값의 근거가 된 원문 구절(그대로 인용) */
  evidence: z.string(),
});

export const missingFactSchema = z.object({
  /** 판정에 필요한데 원문에 없는 칸의 경로(행 이름 포함) */
  path: z.string(),
  /** 사용자에게 물을 질문 — 한 문장 */
  question: z.string(),
  /** 이 사실이 왜 판정을 가르는지 — 한 문장 */
  why: z.string(),
});

export const extractedRowSchema = z.object({
  /** `houses` · `presaleRights` · `asset.residencePeriods` 등 배열 경로(대괄호 없이) */
  collection: z.string(),
  /** 원문 표기를 따른 행 이름(A주택 → "A") — facts·missingFacts 경로의 대괄호와 같아야 한다 */
  rowId: z.string(),
  /** 원문에서 이 행이 무엇인지 — 한 문장 */
  description: z.string(),
});

export const oneHouseExtractionSchema = z.object({
  rows: z.array(extractedRowSchema),
  facts: z.array(extractedFactSchema),
  missingFacts: z.array(missingFactSchema),
  /** 폼으로 표현할 수 없는 사실(입력 칸이 없는 사정)·해석상 주의 — 한 문장씩 */
  notes: z.array(z.string()),
});

export type OneHouseExtraction = z.infer<typeof oneHouseExtractionSchema>;
export type ExtractedFact = z.infer<typeof extractedFactSchema>;
export type MissingFact = z.infer<typeof missingFactSchema>;
