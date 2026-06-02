/**
 * /api/pdf/result/[id]
 * 세금 계산 결과 단건 PDF 다운로드
 * 미들웨어(proxy.ts)에서 로그인 필수 처리 완료
 *
 * - GET: 전체 PDF (하위호환 — 양도세 등 기존 호출)
 * - POST: { sections: string[] } 선택 출력 (상속세 선택 항목 PDF, PR-2)
 */
import { type NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import React from "react";
import { getCalculation } from "@/actions/calculations";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { registerFonts } from "@/lib/pdf/fonts";
import { ResultPdfDocument } from "@/lib/pdf/ResultPdfDocument";

export const runtime = "nodejs";

const TAX_TYPE_LABELS: Record<string, string> = {
  transfer: "양도소득세",
  transfer_multi: "양도소득세 (다건)",
  inheritance: "상속세",
  gift: "증여세",
  acquisition: "취득세",
  property: "재산세",
  comprehensive_property: "종합부동산세",
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET·POST 공유 — 계산 이력 로드 → PDF 렌더 → 응답 (selectedSectionIds=undefined면 전체) */
async function buildPdfResponse(
  req: NextRequest,
  id: string,
  selectedSectionIds?: string[]
): Promise<Response> {
  // PDF 생성은 CPU 집약적 → 분당 10회 제한
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed, remaining } = checkRateLimit(`pdf:result:${ip}`, { limit: 10, windowMs: 60_000 });

  if (!allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": "0" } }
    );
  }

  const { record, error } = await getCalculation(id);

  if (error || !record) {
    return NextResponse.json({ error: "계산 이력을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    registerFonts();

    const taxTypeLabel = TAX_TYPE_LABELS[record.tax_type] ?? record.tax_type;
    const createdAt = new Date(record.created_at).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const buffer = await renderToBuffer(
      React.createElement(ResultPdfDocument, {
        taxType: record.tax_type,
        taxTypeLabel,
        createdAt,
        resultData: record.result_data as Parameters<typeof ResultPdfDocument>[0]["resultData"],
        inputData: record.input_data as Parameters<typeof ResultPdfDocument>[0]["inputData"],
        selectedSectionIds,
      }) as React.ReactElement<DocumentProps>
    );

    const filename = `세금계산결과_${record.tax_type}_${id.slice(0, 8)}.pdf`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "private, no-store",
        "X-RateLimit-Remaining": String(remaining),
      },
    });
  } catch (err) {
    console.error("[PDF Result] 생성 오류:", err);
    return NextResponse.json({ error: "PDF 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  return buildPdfResponse(req, id);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  let sections: string[] | undefined;
  try {
    const body = (await req.json()) as { sections?: unknown };
    if (Array.isArray(body.sections)) {
      sections = body.sections.filter((x): x is string => typeof x === "string");
    }
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  if (!sections || sections.length === 0) {
    return NextResponse.json(
      { error: "출력할 항목을 선택해 주세요." },
      { status: 400 }
    );
  }

  return buildPdfResponse(req, id, sections);
}
