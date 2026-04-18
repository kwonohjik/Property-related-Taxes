/**
 * POST /api/law/annexes/parse
 * 별표 PDF 파일을 다운로드해 텍스트 추출.
 *
 * Body: { annexId: string, fileUrl: string }
 * 반환: { text: string, pageCount: number, parsedAt: string }
 *
 * 제약:
 *   - PDF만 지원 (다른 형식은 400)
 *   - 캐시: .legal-cache/annex_pdf_text_<id>.json, TTL 30일
 *   - Vercel Serverless 번들 고려해 pdfjs-dist 는 lazy import
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseAnnexPdf, detectFileType } from "@/lib/korean-law/annex-pdf-parser";
import { ensureRateLimit, mapErrorToResponse } from "../../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // pdfjs-dist 는 Node 런타임 필요
export const maxDuration = 60;

const parseAnnexInputSchema = z.object({
  annexId: z.string().min(1).max(100),
  fileUrl: z.string().url("유효한 URL이어야 합니다."),
});

export async function POST(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const body = await req.json();
    const input = parseAnnexInputSchema.parse(body);

    // 파일 형식 검증: PDF 만 지원
    const ext = detectFileType(input.fileUrl);
    if (ext && ext !== "pdf") {
      return NextResponse.json(
        {
          error: `PDF 만 지원합니다 (현재: ${ext}). HWPX/HWP5/XLSX/DOCX 는 링크에서 다운로드 후 확인하세요.`,
          code: "UNSUPPORTED_FORMAT",
        },
        { status: 400 }
      );
    }

    const parsed = await parseAnnexPdf(input.annexId, input.fileUrl);
    return NextResponse.json({
      text: parsed.text,
      pageCount: parsed.pageCount,
      parsedAt: parsed.parsedAt,
    });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
