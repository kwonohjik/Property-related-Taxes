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
  sumExclusiveCommonArea,
  toExposQueryDong,
  toExposQueryHo,
  type RegisterMapConfidence,
  type ExposPubuseAreaItem,
} from "@/lib/tax-engine/data/building-standard-price/building-register-map";
import {
  decomposePnuForBuildingRegister,
  type BuildingRegisterPnuParts,
} from "@/lib/geo/pnu-building-register";

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
/** 전유공용면적(집합건물 세대별 전유+공용) — 접근 B */
const EXPOS_BASE =
  "https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo";

/** HUB는 숫자도 문자열로 반환 — NaN·빈문자 → undefined. */
function toIntOrUndef(v: unknown): number | undefined {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isNaN(n) ? undefined : n;
}
function toFloatOrUndef(v: unknown): number | undefined {
  const n = parseFloat(String(v ?? "").trim());
  return Number.isNaN(n) ? undefined : n;
}

/**
 * 서버가 강제하는 페이지 크기 상한 — 2026-07-28 실측.
 * `numOfRows=500`·`1000`을 보내도 응답 body의 `numOfRows`가 **100**으로 되돌아오고
 * item도 100건만 온다(은마아파트 PNU는 totalCount 24,066). 종전 상수 1000은 무효였다.
 */
const EXPOS_MAX_ROWS = 100;

/** 전유공용 응답 body 중 사용하는 필드. */
interface ExposBody {
  totalCount?: number | string;
  items?: { item?: unknown };
}

/** 한 번의 getBrExposPubuseAreaInfo 호출 — items + totalCount. 실패 시 null. */
async function callExposApi(
  parts: BuildingRegisterPnuParts,
  apiKey: string,
  filters: { dongNm?: string; hoNm?: string },
): Promise<{ items: ExposPubuseAreaItem[]; totalCount: number } | null> {
  const qs = new URLSearchParams({
    serviceKey: apiKey,
    sigunguCd: parts.sigunguCd,
    bjdongCd: parts.bjdongCd,
    platGbCd: parts.platGbCd,
    bun: parts.bun,
    ji: parts.ji,
    _type: "json",
    numOfRows: String(EXPOS_MAX_ROWS),
    pageNo: "1",
  });
  if (filters.dongNm) qs.set("dongNm", filters.dongNm);
  if (filters.hoNm) qs.set("hoNm", filters.hoNm);
  try {
    const res = await fetch(`${EXPOS_BASE}?${qs.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { response?: unknown };
    const response = json?.response as
      | { header?: { resultCode?: string }; body?: ExposBody }
      | undefined;
    const resultCode = String(response?.header?.resultCode ?? "").trim();
    if (resultCode && resultCode !== "00" && resultCode !== "000") return null;
    const rawItem = response?.body?.items?.item;
    const items: ExposPubuseAreaItem[] = Array.isArray(rawItem)
      ? (rawItem as ExposPubuseAreaItem[])
      : rawItem
        ? [rawItem as ExposPubuseAreaItem]
        : [];
    const totalCount = toIntOrUndef(response?.body?.totalCount) ?? items.length;
    return { items, totalCount };
  } catch {
    return null;
  }
}

/**
 * 집합건물 세대 전유+공용 연면적 조회 (getBrExposPubuseAreaInfo, 접근 B).
 *
 * ## 2026-07-28 실 API 실측으로 확정된 3가지 (종전 구현은 전부 어긋나 있었다)
 *
 * 1. **서버 필터는 정확 문자열 일치**다. `hoNm`은 "1410호"처럼 **접미 "호"를 포함**해야 하고
 *    `dongNm`은 "1"처럼 **접미 "동" 없이** 보내야 한다. 폼은 `unitDong="201동"`·`unitHo="3204"`를
 *    주므로 **양쪽 다 틀린 꼴**이었다 → 서버가 0건을 돌려주고 항상 수동 fallback으로 떨어졌다
 *    (= 기능이 배포돼도 동작하지 않는 상태). `toExposQueryDong/Ho`가 이 변환을 담당한다.
 * 2. **`numOfRows`는 100에서 캡**된다(위 `EXPOS_MAX_ROWS`). 종전 1000은 무효.
 * 3. 따라서 필터가 듣지 않으면 24,066건 중 100건만 손에 들어온다 → 클라이언트 재필터가
 *    **일부 행만 합산해 과소 연면적을 무경고로 채울** 위험이 있다. 아래 절단 가드로 차단한다.
 *
 * 비차단(throw 금지) — 실패·미매칭은 null(수동 입력).
 */
async function fetchExposPubuseArea(
  parts: BuildingRegisterPnuParts,
  dong: string,
  ho: string,
  apiKey: string,
): Promise<number | null> {
  const qDong = toExposQueryDong(dong);
  const qHo = toExposQueryHo(ho);
  // 호 없이는 세대를 특정할 수 없다(동 전체 합산 = 과대). sumExclusiveCommonArea와 동일 기준.
  if (!qHo) return null;

  let r = await callExposApi(parts, apiKey, { dongNm: qDong, hoNm: qHo });
  // 동 명칭 드리프트("가"·"A"·"101" 등 표기 차이) 대비 — 호만으로 1회 재시도.
  //   클라이언트 재필터가 동까지 다시 대조하므로 잘못된 동이 섞여도 걸러진다.
  if (qDong && (!r || r.items.length === 0)) {
    r = await callExposApi(parts, apiKey, { hoNm: qHo });
  }
  if (!r || r.items.length === 0) return null;

  // 절단 가드 — 서버가 준 것이 전체의 일부면 합산값을 신뢰할 수 없다.
  //   부분 합산은 "그럴듯하게 작은" 연면적을 만들어 기준시가를 과소산정한다. 수동 입력이 낫다.
  if (r.totalCount > r.items.length) return null;

  return sumExclusiveCommonArea(r.items, dong, ho);
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<BuildingRegisterLookupResponse>> {
  const { searchParams } = new URL(request.url);
  const pnu = searchParams.get("pnu")?.trim() ?? "";
  const year = searchParams.get("year")?.trim() ?? "";
  // 집합건물(공동주택) 세대 식별 — 있으면 전유+공용 연면적을 floorArea로(접근 B)
  const dong = searchParams.get("dong")?.trim() ?? "";
  const ho = searchParams.get("ho")?.trim() ?? "";

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

  // 집합건물(공동주택 세대): floorArea = 전유+공용 연면적(§146④·건물기준시가 고시상 건물면적).
  //   표제부 totArea(동 전체)를 세대 전유+공용으로 대체. 조회 실패·미매칭이면 null(수동 입력).
  let floorAreaValue: number | null = totArea ?? null;
  if (dong || ho) {
    floorAreaValue = await fetchExposPubuseArea(parts, dong, ho, apiKey);
    if (floorAreaValue === null)
      warnings.push(
        "집합건물 세대의 전유+공용 연면적을 조회하지 못했습니다(직접 입력).",
      );
  }

  return NextResponse.json({
    success: true,
    data: {
      structureKey: structResult?.structureKey ?? null,
      usageNo: usageResult?.usageNo ?? null,
      confidence,
      floorArea: floorAreaValue,
      builtYear:
        useAprDay.length >= 4 ? parseInt(useAprDay.slice(0, 4), 10) : null,
      floorsAbove: grndFlrCnt ?? null,
      floorsBelow: ugrndFlrCnt ?? null,
    },
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}
