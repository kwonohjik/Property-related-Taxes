/**
 * 조정대상지역 판별 API
 *
 * POST /api/address/regulated-area
 *   body: { address, transferDate, acquisitionDate }
 *
 * 응답: {
 *   isRegulatedAtTransfer: boolean,
 *   wasRegulatedAtAcquisition: boolean,
 *   transferBasis: string,
 *   acquisitionBasis: string,
 *   confidence: "high" | "medium" | "low"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRegulatedArea } from "@/lib/regulated-area";

const schema = z.object({
  address: z.string().min(2),
  transferDate: z.string().date(),
  acquisitionDate: z.string().date().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { address, transferDate, acquisitionDate } = parsed.data;

  const transfer = checkRegulatedArea(address, transferDate);
  const acquisition = acquisitionDate ? checkRegulatedArea(address, acquisitionDate) : null;

  // 전체 신뢰도는 두 판별 중 낮은 쪽
  const confidences = [transfer.confidence, acquisition?.confidence].filter(Boolean) as Array<
    "high" | "medium" | "low"
  >;
  const confidenceRank = { low: 0, medium: 1, high: 2 };
  const overallConfidence = confidences.reduce(
    (min, c) => (confidenceRank[c] < confidenceRank[min] ? c : min),
    "high" as "high" | "medium" | "low",
  );

  return NextResponse.json({
    isRegulatedAtTransfer: transfer.isRegulated,
    wasRegulatedAtAcquisition: acquisition?.isRegulated ?? false,
    transferBasis: transfer.basis,
    acquisitionBasis: acquisition?.basis ?? null,
    confidence: overallConfidence,
  });
}
