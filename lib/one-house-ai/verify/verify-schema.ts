/**
 * 1세대1주택 AI 원문 검증 — 요청·응답 타입과 2차 대조 LLM 출력 스키마(계획 §3.5).
 */
import { z } from "zod";
import { oneHouseOpinionSchema } from "../opinion/opinion-schema";
import type { StatuteRef } from "../statute-ref";

/**
 * 원문 검증 입력 상한 (2026-11 리뷰 I-21) — 의견 스키마(`oneHouseOpinionSchema`)는 LLM 출력 스키마와 같은 객체라 `.max`를 달지 않고
 * 검증 본문에만 건다. 종전엔 조문 5,000개를 보내면 조문 조회가 5,000회 돌았다. 정상 의견은 쟁점 수 건 · 조문 수 개다.
 */
export const VERIFY_INPUT_LIMITS = { points: 20, statutesTotal: 60, docNosTotal: 60, textChars: 4000 } as const;

const verifyBodyShape = z.object({
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
export const verifyBodySchema = verifyBodyShape.superRefine((d, ctx) => {
  const L = VERIFY_INPUT_LIMITS;
  const pts = d.opinion.points;
  if (pts.length > L.points) ctx.addIssue({ code: "custom", path: ["opinion", "points"], message: `쟁점은 ${L.points}개까지` });
  if (pts.reduce((n, p) => n + p.statutes.length, 0) > L.statutesTotal)
    ctx.addIssue({ code: "custom", path: ["opinion", "points"], message: `인용 조문은 모두 ${L.statutesTotal}개까지` });
  if (pts.reduce((n, p) => n + p.citedDocNos.length, 0) > L.docNosTotal)
    ctx.addIssue({ code: "custom", path: ["opinion", "points"], message: `인용 문서는 모두 ${L.docNosTotal}개까지` });
  if (pts.some((p) => p.topic.length > L.textChars || p.opinion.length > L.textChars))
    ctx.addIssue({ code: "custom", path: ["opinion", "points"], message: `쟁점·의견은 ${L.textChars}자까지` });
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
