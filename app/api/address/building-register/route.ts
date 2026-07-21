/**
 * 건축물대장(국토부 건축HUB) 자동조회 프록시 라우트 — 건물 기준시가 폼 자동채움용.
 *
 * PNU → 표제부 getBrTitleInfo(1-call) → 구조·용도·연면적·신축연도·층수 매핑 → 정규화 응답.
 * env=MOLIT_RTMS_API_KEY(data.go.kr 동일 인증키, 건축HUB 활용신청 승인). 비차단(매핑 실패=warnings).
 *
 * 템플릿: app/api/address/apt-trade/route.ts (env-graceful·resultCode). 차이: 본 라우트는 _type=json.
 * 설계: docs/02-design/features/building-register-autofill.design.md §4.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  mapStructure,
  mapUsage,
  type RegisterMapConfidence,
} from "@/lib/tax-engine/data/building-standard-price/building-register-map";
import { decomposePnuForBuildingRegister } from "@/lib/geo/pnu-building-register";

export interface BuildingRegisterLookupResponse {
  success: boolean;
  /** 매핑 결과 — success 시에만. 자동채움 대상 5필드(층수 지상/지하 분리). */
  data?: {
    structureKey: string | null;
    usageNo: number | null;
    confidence: RegisterMapConfidence | null;
    floorArea: number | null;
    builtYear: number | null;
    floorsAbove: number | null;
    floorsBelow: number | null;
  };
  /** env 미설정 — UI 버튼 비활성 판단용. */
  configMissing?: boolean;
  /** 비차단 안내(매핑 불가·HUB 쿼터·resultCode 에러). throw 금지. */
  warnings?: string[];
  /** 파라미터 검증 실패·치명 오류. */
  error?: string;
}

const BASE =
  "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";

/** HUB는 숫자도 문자열로 반환 — NaN·빈문자 → undefined. */
function toIntOrUndef(v: unknown): number | undefined {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isNaN(n) ? undefined : n;
}
function toFloatOrUndef(v: unknown): number | undefined {
  const n = parseFloat(String(v ?? "").trim());
  return Number.isNaN(n) ? undefined : n;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<BuildingRegisterLookupResponse>> {
  const { searchParams } = new URL(request.url);
  const pnu = searchParams.get("pnu")?.trim() ?? "";
  const year = searchParams.get("year")?.trim() ?? "";

  // ① env 미설정 — HTTP 200 + configMissing(500 금지)
  const apiKey = process.env.MOLIT_RTMS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      configMissing: true,
      error: "MOLIT_RTMS_API_KEY가 설정되지 않았습니다.",
    });
  }

  // ② pnu 검증(19자리) + 분해
  const parts = decomposePnuForBuildingRegister(pnu);
  if (!parts) {
    return NextResponse.json({
      success: false,
      error: "pnu는 19자리 숫자이어야 합니다.",
    });
  }

  // ③ year 검증(4자리 — 용도 매핑 전용, optional).
  //   표제부(구조·연면적·신축연도·층수)는 시점 무관 → year 없어도 조회. 잘못된 값(비-4자리·비공백)만 차단.
  const hasYear = /^\d{4}$/.test(year);
  const yearNum = hasYear ? parseInt(year, 10) : undefined;
  if (year !== "" && !hasYear) {
    return NextResponse.json({
      success: false,
      error: "year는 4자리 연도이어야 합니다.",
    });
  }

  // ④ getBrTitleInfo 호출(F2 동결 7파라미터 — 단건은 페이지네이션 불요)
  const qs = new URLSearchParams({
    serviceKey: apiKey,
    sigunguCd: parts.sigunguCd,
    bjdongCd: parts.bjdongCd,
    platGbCd: parts.platGbCd,
    bun: parts.bun,
    ji: parts.ji,
    _type: "json",
  });

  let res: Response;
  try {
    res = await fetch(`${BASE}?${qs.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      warnings: [`건축물대장 조회 네트워크 오류: ${String(err)}`],
    });
  }
  if (!res.ok) {
    return NextResponse.json({
      success: false,
      warnings: [`건축물대장 조회 실패: HTTP ${res.status}`],
    });
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return NextResponse.json({
      success: false,
      warnings: ["건축물대장 응답을 해석할 수 없습니다."],
    });
  }

  // resultCode 검증("00"|"000" 성공). _type=json 경로 response.header.resultCode(실측 확인).
  const response = (json as { response?: unknown })?.response as
    | { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: unknown } } }
    | undefined;
  const resultCode = String(response?.header?.resultCode ?? "").trim();
  if (resultCode && resultCode !== "00" && resultCode !== "000") {
    return NextResponse.json({
      success: false,
      warnings: [
        `건축물대장 API 오류: ${resultCode} — ${response?.header?.resultMsg ?? ""}`,
      ],
    });
  }

  // envelope: response.body.items.item (단건 객체 / 다건 배열)
  const rawItem = response?.body?.items?.item;
  const item = (Array.isArray(rawItem) ? rawItem[0] : rawItem) as
    | Record<string, unknown>
    | undefined;
  if (!item) {
    return NextResponse.json({
      success: false,
      warnings: ["해당 소재지의 건축물대장 표제부를 찾을 수 없습니다."],
    });
  }

  // ⑤ 필드 추출 + 매핑
  const strctCd = String(item.strctCd ?? "").trim();
  const etcStrct = item.etcStrct ? String(item.etcStrct).trim() : undefined;
  const mainPurpsCd = String(item.mainPurpsCd ?? "").trim();
  const grndFlrCnt = toIntOrUndef(item.grndFlrCnt);
  const ugrndFlrCnt = toIntOrUndef(item.ugrndFlrCnt);
  const totArea = toFloatOrUndef(item.totArea);
  const useAprDay = String(item.useAprDay ?? "").trim(); // YYYYMMDD

  const structResult = mapStructure(strctCd, etcStrct);
  // 용도 매핑은 연도별 지수 체계 종속 → year 없으면 스킵(구조·연면적·신축연도·층수만 반환)
  const usageResult =
    yearNum !== undefined
      ? mapUsage(mainPurpsCd, grndFlrCnt, totArea, yearNum)
      : null;

  const warnings: string[] = [];
  if (!structResult)
    warnings.push("건물 구조를 대장에서 매핑할 수 없습니다(직접 선택).");
  if (yearNum !== undefined && !usageResult)
    warnings.push("건물 용도를 대장에서 매핑할 수 없습니다(직접 선택).");

  // 구조·용도 모두 채우면 둘 중 낮은 등급(medium 우선). 하나만이면 그 등급. 둘 다 null이면 null.
  const confidence: RegisterMapConfidence | null =
    structResult && usageResult
      ? structResult.confidence === "medium" ||
        usageResult.confidence === "medium"
        ? "medium"
        : "high"
      : (structResult?.confidence ?? usageResult?.confidence ?? null);

  return NextResponse.json({
    success: true,
    data: {
      structureKey: structResult?.structureKey ?? null,
      usageNo: usageResult?.usageNo ?? null,
      confidence,
      floorArea: totArea ?? null,
      builtYear:
        useAprDay.length >= 4 ? parseInt(useAprDay.slice(0, 4), 10) : null,
      floorsAbove: grndFlrCnt ?? null,
      floorsBelow: ugrndFlrCnt ?? null,
    },
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}
