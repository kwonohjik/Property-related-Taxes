/**
 * 1세대1주택 AI 사실 추출 API Route (하이브리드 AI 검토 도구 P3) — **로컬 개발 서버 전용**.
 *
 * POST /api/one-house-ai/extract  { text }
 *
 *   Rate limit → 개발 서버 게이트 → Zod(원문 1만 자 이하) → API 키 확인 → LLM 추출(`extractOneHouseFacts`)
 *   → 필드 사전 재검증(`applyExtraction`) → 판정 메뉴 폼에 합쳐 ⑧ 검증·본문 스키마가 막는 칸을 질문으로(`collectValidationQuestions`)
 *
 * 판정은 하지 않는다 — LLM은 사실 추출만 맡고, 사용자가 확인한 폼으로 판정 메뉴(`/api/calc/one-house-exemption`)가 판정한다.
 * 응답의 `form`은 추출한 칸만 담은 조각이다 — 화면은 빈 판정 메뉴 폼 위에 덮어 현재 입력을 통째로 바꾼다(`mergeExtractedForm`).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { checkOneHouseAiAccess } from "@/lib/one-house-ai/access-guard";
import {
  extractOneHouseFacts,
  ExtractionFailedError,
  ONE_HOUSE_AI_TEXT_MAX,
  type ExtractionRun,
} from "@/lib/one-house-ai/extract";
import type { ExtractedFact } from "@/lib/one-house-ai/extraction-schema";
import type { FieldSpec } from "@/lib/one-house-ai/field-catalog.types";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";
import {
  applyExtraction,
  catalogKeyOf,
  parsePath,
  type ExtractedForm,
  type ExtractionIssue,
} from "@/lib/one-house-ai/apply-extraction";
import { mergeExtractedForm } from "@/lib/one-house-ai/merge-form";
import { collectValidationQuestions } from "@/lib/one-house-ai/validation-questions";

// LLM 추출은 문서 하나에 20~45초(오프라인 평가 실측) — 여유를 둔다.
export const maxDuration = 120;

const bodySchema = z.object({
  text: z.string().trim().min(1, "원문을 입력하세요.").max(ONE_HOUSE_AI_TEXT_MAX, `원문은 ${ONE_HOUSE_AI_TEXT_MAX.toLocaleString()}자 이하로 입력하세요.`),
});

type ExtractQuestion = { path: string; label?: string; question: string; why?: string; source: "llm" | "validation" };

/** 화면(`OneHouseAiExtractDialog`)이 읽는 응답 `data` */
export type OneHouseAiExtractData = {
  form: ExtractedForm;
  /** `label` = 칸 이름 · `valueLabel` = 선택지 뜻(선택형 칸일 때) */
  facts: (ExtractedFact & { label?: string; valueLabel?: string })[];
  questions: ExtractQuestion[];
  notes: string[];
  issues: ExtractionIssue[];
  model: string;
  usage: ExtractionRun["usage"];
};

const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: NextRequest) {
  // 단계 0: Rate limit — 비용이 드는 호출이라 분당 5회
  const rl = checkRateLimit(`one-house-ai-extract:${getClientIp(request)}`, {
    limit: 5,
    windowMs: 60_000,
    bypass: shouldBypassRateLimit(request),
  });
  if (!rl.allowed) return fail(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도하세요");

  // 단계 1: 개발 서버 게이트
  const gate = checkOneHouseAiAccess();
  if (!gate.ok) return fail(gate.status, gate.code, gate.message);

  // 단계 2: 본문
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, "INVALID_JSON", "요청 본문을 파싱할 수 없습니다");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다");

  // 단계 3: API 키 — 없으면 호출하지 않는다(키 값은 응답·로그에 남기지 않는다)
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, "AI_UNAVAILABLE", "AI 사실 추출이 설정되지 않았습니다(ANTHROPIC_API_KEY).");

  // 단계 4: 추출
  let run: ExtractionRun;
  try {
    run = await extractOneHouseFacts(parsed.data.text);
  } catch (e) {
    if (e instanceof ExtractionFailedError) return fail(422, "EXTRACTION_FAILED", e.message);
    console.error("[one-house-ai extract] LLM 호출 실패", { name: (e as Error).name, message: (e as Error).message });
    return fail(502, "AI_UPSTREAM_ERROR", "AI 사실 추출 호출에 실패했습니다. 잠시 후 다시 시도하세요");
  }

  // 단계 5: 사전 재검증 → 폼 조각 · 질문
  const { form, issues } = applyExtraction(run.extraction, ONE_HOUSE_FIELD_CATALOG);
  // 행 이름 없는 칸(`asset.residencePeriods[].moveInDate`)은 그 자체가 사전 키다
  const specOf = (path: string): FieldSpec | undefined => {
    const segs = parsePath(path);
    const key = segs ? catalogKeyOf(segs) : path;
    return ONE_HOUSE_FIELD_CATALOG.find((s) => s.path === key);
  };
  const labelOf = (path: string) => specOf(path)?.label;
  const llmQuestions = run.extraction.missingFacts.map((m) => ({
    path: m.path,
    label: labelOf(m.path),
    question: m.question,
    why: m.why,
    source: "llm" as const,
  }));
  // LLM이 이미 물은 칸(같은 묶음 포함 — `asset.residencePeriods[].moveInDate` ↔ `asset.residencePeriods`)은 다시 묻지 않는다
  const groupOf = (path: string) => path.replace(/\[[^\]]*\]/g, "[]");
  const overlaps = (a: string, b: string) => {
    const [x, y] = [groupOf(a), groupOf(b)];
    return x === y || x.startsWith(`${y}.`) || x.startsWith(`${y}[`) || y.startsWith(`${x}.`) || y.startsWith(`${x}[`);
  };
  const validationQuestions = collectValidationQuestions(mergeExtractedForm(form), ONE_HOUSE_FIELD_CATALOG).filter(
    (q) => !llmQuestions.some((l) => overlaps(l.path, q.path)),
  );

  const data: OneHouseAiExtractData = {
    form,
    // 화면은 필드 사전을 싣지 않는다 — 칸 이름과 선택지 뜻을 여기서 붙인다
    facts: run.extraction.facts.map((f) => {
      const spec = specOf(f.path);
      return { ...f, label: spec?.label, valueLabel: spec?.values?.find((v) => v.value === f.value.trim())?.label };
    }),
    questions: [...llmQuestions, ...validationQuestions],
    notes: run.extraction.notes,
    issues,
    model: run.model,
    usage: run.usage,
  };
  return NextResponse.json({ data });
}
