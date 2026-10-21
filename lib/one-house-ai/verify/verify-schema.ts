/**
 * 1세대1주택 AI 원문 검증 — 요청·응답 타입과 2차 대조 LLM 출력 스키마(계획 §3.5).
 */
import { z } from "zod";
import { oneHouseOpinionSchema } from "../opinion/opinion-schema";
import type { StatuteRef } from "../statute-ref";

export const verifyBodySchema = z.object({
  /** 양도일 YYYY-MM-DD — 없으면 현행 조문으로 확인하고 그 사실을 표시한다 */
  transferDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  opinion: oneHouseOpinionSchema,
  citations: z
    .array(
      z.object({
        docNo: z.string().max(200),
        origin: z.enum(["card", "live"]),
        source: z.enum(["nts", "moef", "tax_tribunal"]).optional(),
        id: z.string().max(30).optional(),
      }),
    )
    .max(100),
});
export type VerifyBody = z.infer<typeof verifyBodySchema>;

export type StatuteCheck = {
  ref: StatuteRef;
  status: "verified" | "not_found" | "failed";
  /** 확인 기준 — 양도일 시행본이면 그 날짜, 현행이면 null */
  baseDate: string | null;
  versionEfYd?: string;
  sameAsCurrent?: boolean | null;
  excerpt?: string;
  reason?: string;
  url?: string;
};

export type DocCheck = {
  docNo: string;
  status: "fetched" | "mismatch" | "failed";
  /** 다시 받은 원문 발췌(요지·회신·본문 앞부분) */
  excerpt?: string;
  url?: string;
  reason?: string;
};

export type PointSupport = "supported" | "partial" | "not_supported" | "cannot_verify";

export type PointCheck = {
  index: number;
  support: PointSupport;
  reason: string;
  /** 원문에 없는 주장 구절 */
  unsupportedClaims: string[];
  /** 이 쟁점이 인용한 조문·문서 — `statutes`·`docs`의 키 */
  statuteKeys: string[];
  docNos: string[];
};

/** 화면(`OneHouseAiOpinionPanel`)이 읽는 응답 `data` */
export type OneHouseAiVerifyData = {
  statutes: (StatuteCheck & { key: string })[];
  docs: DocCheck[];
  points: PointCheck[];
  /** 2차 대조를 부르지 않았으면 null(대조할 원문이 하나도 없을 때) */
  model: string | null;
  usage: { input: number; cacheRead: number; cacheWrite: number; output: number } | null;
};

/** 2차 대조 LLM 출력 */
export const verifyLlmSchema = z.object({
  points: z.array(
    z.object({
      index: z.number().int(),
      support: z.enum(["supported", "partial", "not_supported", "cannot_verify"]),
      reason: z.string(),
      unsupportedClaims: z.array(z.string()),
    }),
  ),
});
