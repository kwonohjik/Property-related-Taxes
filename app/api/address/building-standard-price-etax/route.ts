/**
 * 서울 ETAX 주택외건물(비주거용) 시가표준액 자동조회 프록시 라우트 — 재산세 건축물 공시가격 자동채움용.
 *
 * PNU(서울) → etax POST → 시가표준액 계(건축물+시설)·연면적 정규화. 무인증(env 불요).
 * EUC-KR·약한 DH키 SSL은 lib(`etax-building-std.ts`)에서 처리. 비차단(실패=warnings).
 *
 * 설계: docs/02-design/features/property-building-nonresidential-stdprice-etax-lookup.plan.md §5.1
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  fetchEtaxBuildingStd,
  type EtaxBuildingStdResult,
} from "@/lib/geo/etax-building-std";

export interface EtaxBuildingStdLookupResponse {
  success: boolean;
  results?: EtaxBuildingStdResult[];
  /** 비차단 안내(비서울·무자료·네트워크). throw 금지. */
  warnings?: string[];
  /** 파라미터 검증 실패. */
  error?: string;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<EtaxBuildingStdLookupResponse>> {
  const { searchParams } = new URL(request.url);
  const pnu = searchParams.get("pnu")?.trim() ?? "";
  const year = searchParams.get("year")?.trim() ?? "";
  // dong/hosu는 etax 숫자 코드 — 외부 전달 전 숫자만 통과(미신뢰 입력 방어)
  const dong = (searchParams.get("dong")?.trim() ?? "").replace(/\D/g, "");
  const hosu = (searchParams.get("hosu")?.trim() ?? "").replace(/\D/g, "");

  if (!/^\d{19}$/.test(pnu)) {
    return NextResponse.json({
      success: false,
      error: "pnu는 19자리 숫자이어야 합니다.",
    });
  }
  if (!/^\d{4}$/.test(year)) {
    return NextResponse.json({
      success: false,
      error: "year는 4자리 연도이어야 합니다.",
    });
  }
  // 서울 게이트 — 비서울 PNU는 etax 조회 불가(비차단 안내)
  if (!pnu.startsWith("11")) {
    return NextResponse.json({
      success: false,
      warnings: ["서울 소재 건축물만 ETAX 조회가 가능합니다."],
    });
  }

  const { results, warnings } = await fetchEtaxBuildingStd(pnu, year, dong, hosu);
  return NextResponse.json({
    success: results.length > 0,
    results,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}
