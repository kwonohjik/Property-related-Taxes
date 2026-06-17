/**
 * 조정대상지역 판별 API
 *
 * POST /api/address/regulated-area
 *   body: { address?, regionCode?, transferDate, acquisitionDate? }
 *     - regionCode(법정동코드, PNU 앞 10자리)가 있으면 동 단위까지 정밀 판정(우선).
 *     - 없으면 address(주소 문자열)로 시군구 단위 판정(fallback).
 *
 * 응답: {
 *   isRegulatedAtTransfer: boolean,
 *   wasRegulatedAtAcquisition: boolean,
 *   transferBasis: string,
 *   acquisitionBasis: string | null,
 *   confidence: "high" | "medium" | "low"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  checkRegulatedArea,
  checkRegulatedAreaByCode,
  type RegulatedAreaResult,
} from "@/lib/regulated-area";

const schema = z
  .object({
    address: z.string().min(2).optional(),
    regionCode: z.string().min(2).optional(),
    transferDate: z.string().date(),
    acquisitionDate: z.string().date().optional(),
  })
  .refine((d) => !!d.address || !!d.regionCode, {
    message: "address 또는 regionCode 중 하나는 필요합니다",
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

  const { address, regionCode, transferDate, acquisitionDate } = parsed.data;

  // regionCode(법정동코드) 우선 → 동 단위 정밀, 없으면 주소 문자열 fallback
  const judge = (date: string): RegulatedAreaResult =>
    regionCode ? checkRegulatedAreaByCode(regionCode, date) : checkRegulatedArea(address!, date);

  const transfer = judge(transferDate);
  const acquisition = acquisitionDate ? judge(acquisitionDate) : null;

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
