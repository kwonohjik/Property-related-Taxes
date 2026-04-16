/**
 * GET /api/pdf/history?taxType=transfer&limit=100
 * 계산 이력 목록 PDF 다운로드
 * 미들웨어에서 로그인 필수 처리 완료
 */
import { type NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import React from "react";
import { listCalculations } from "@/actions/calculations";
import type { TaxType } from "@/actions/calculations";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { registerFonts } from "@/lib/pdf/fonts";
import { HistoryPdfDocument } from "@/lib/pdf/HistoryPdfDocument";

export const runtime = "nodejs";

const VALID_TAX_TYPES = new Set([
  "transfer",
  "inheritance",
  "gift",
  "acquisition",
  "property",
  "comprehensive_property",
]);

export async function GET(req: NextRequest) {
  // PDF 생성은 CPU 집약적 → 분당 5회 제한 (이력 전체 렌더링이 더 무거움)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = checkRateLimit(`pdf:history:${ip}`, { limit: 5, windowMs: 60_000 });

  if (!allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { searchParams } = req.nextUrl;
  const rawTaxType = searchParams.get("taxType");
  const limit = Math.min(Number(searchParams.get("limit") ?? "100"), 200);

  const taxType =
    rawTaxType && VALID_TAX_TYPES.has(rawTaxType)
      ? (rawTaxType as TaxType)
      : undefined;

  const { records, total, error } = await listCalculations({
    taxType,
    limit,
  });

  if (error && records.length === 0) {
    return NextResponse.json({ error: "이력 조회에 실패했습니다." }, { status: 500 });
  }

  try {
    registerFonts();

    const generatedAt = new Date().toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const buffer = await renderToBuffer(
      React.createElement(HistoryPdfDocument, {
        records,
        total,
        taxTypeFilter: rawTaxType ?? "all",
        generatedAt,
      }) as React.ReactElement<DocumentProps>
    );

    const dateStr = new Date()
      .toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
      .replace(/\. /g, "-")
      .replace(".", "");
    const filename = `세금계산이력_${dateStr}.pdf`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[PDF History] 생성 오류:", err);
    return NextResponse.json(
      { error: "PDF 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
