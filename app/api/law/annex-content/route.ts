/**
 * GET /api/law/annex-content?url=...&type=HWPX&mst=123&annexNo=1
 *
 * 별표 파일을 서버측에서 다운로드 → HWPX/PDF/XLSX → Markdown 변환 후 반환.
 *
 * Feature Flag: LAW_ANNEX_BODY_ENABLED === "false" 이면 404 (번들 영향·법제처
 * 트래픽 통제용). 즉 **기본은 활성화**이고, 끄려면 명시적으로 "false" 를 넣는다.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseAnnexBody } from "@/lib/korean-law/annex-body-parser";
import type { AnnexBodyResponse, LawApiErrorEnvelope } from "@/lib/korean-law/types";
import { ensureRateLimit, mapErrorToResponse, parseQuery } from "../_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const inputSchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      (v) => /(^https?:)?\/\/(www\.)?law\.go\.kr\//i.test(v),
      "법제처(law.go.kr) URL 만 허용됩니다."
    ),
  type: z.string().max(10).optional(),
  /** 캐시 키 컴포넌트 — {mst}_{annexNo} 형태 권장 */
  mst: z.string().max(30).optional(),
  annexNo: z.string().max(20).optional(),
});

/**
 * 🔴 **매 요청마다 새로 만든다.** 종전엔 모듈 레벨 상수였는데, Response 본문은
 *    1회 소비형이라 같은 인스턴스를 두 번 돌려주면 두 번째부터 깨진다
 *    (실측: `TypeError: Body is unusable: Body has already been read`).
 *    킬 스위치를 켠 «바로 그때» 두 번째 요청부터 500 이 나는 셈이었다.
 */
function disabledResponse(): NextResponse<LawApiErrorEnvelope> {
  return NextResponse.json(
    {
      error:
        "별표 본문 변환이 비활성화되어 있습니다. LAW_ANNEX_BODY_ENABLED 를 지우거나 \"false\" 가 아닌 값으로 설정하세요.",
      code: "UPSTREAM",
    },
    { status: 404 }
  );
}

function isEnabled(): boolean {
  return process.env.LAW_ANNEX_BODY_ENABLED !== "false";
}

export async function GET(req: NextRequest) {
  if (!isEnabled()) return disabledResponse();
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const { url, type, mst, annexNo } = parseQuery(req, inputSchema);
    const cacheKey = [mst ?? "law", annexNo ?? hashUrl(url)].join("_");
    const result = await parseAnnexBody(url, type, cacheKey);
    const body: AnnexBodyResponse = {
      content: result.content,
      truncated: result.truncated,
      status: result.status,
      fileType: result.fileType,
      pageCount: result.pageCount,
      originalSize: result.originalSize,
      error: result.error,
    };
    return NextResponse.json(body);
  } catch (err) {
    return mapErrorToResponse(err);
  }
}

/** URL 을 고정 길이 hash 문자열로 변환 (단순 FNV-1a 변형) */
function hashUrl(url: string): string {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
