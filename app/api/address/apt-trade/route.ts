/**
 * RTMS 실거래가 프록시 — 국토교통부 공공데이터포털 아파트 매매 실거래가 조회
 *
 * GET /api/address/apt-trade
 *   ?lawdCd={5자리 법정동코드}
 *   &baseDate={YYYY-MM-DD}  (평가기준일)
 *   &taxType={inheritance|gift}
 *
 * 설계:
 *   - §9 D2: 응답 envelope { success, records, configMissing?, error?, months? }
 *   - §9 D3: 스마트 라우트 — lawdCd + baseDate + taxType으로 평가기간 자동 산출
 *   - §10 P2: 월별 전체 페이지 수집 (numOfRows=1000 + totalCount 루프)
 *   - §10 P5: env 미설정 = HTTP 200 + { success:false, configMissing:true }
 *   - §11 P8: cdealType·cdealDay 필드 추출
 *   - §11 P9: dealingType 정규화 보존
 *   - https 엔드포인트 사용 (§11.2 경미 정정)
 *
 * 법령: 상증령 §49①(평가기간), §49②1호(매매계약일 기준), §49④(신고일 절단)
 * RTMS endpoint: https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev
 */

import { NextRequest, NextResponse } from "next/server";
import { addMonths, format } from "date-fns";
import type { RtmsTradeRecord } from "@/lib/calc/rtms-similar-sales-filter";
import { normalizeAptName } from "@/lib/calc/rtms-similar-sales-filter";

// ──────────────────────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────────────────────

/** RTMS 프록시 응답 envelope (§9 D2) */
export interface RtmsAptTradeResponse {
  success: boolean;
  records: RtmsTradeRecord[];
  months?: string[];
  /** env 미설정 시 true — UI 버튼 비활성 판단용 */
  configMissing?: boolean;
  error?: string;
}

/**
 * 공동주택 계열 물건 종류 (RTMS endpoint·단지명 필드가 종류별로 분리됨).
 * - apt:  아파트 매매 (RTMSDataSvcAptTradeDev)  — 단지명 aptNm
 * - rh:   연립다세대 매매 (RTMSDataSvcRHTrade)   — 단지명 mhouseNm
 * - offi: 오피스텔 매매 (RTMSDataSvcOffiTrade)   — 단지명 offiNm
 */
export type RtmsPropertyType = "apt" | "rh" | "offi";

interface PropertyTypeConfig {
  endpoint: string;
  /** 단지/건물명 XML 태그 — 종류별 상이 (실측 확정: APT=aptNm, RH/OFFI는 활용신청 후 실측) */
  nameField: string;
  label: string;
}

const PROPERTY_TYPE_CONFIG: Record<RtmsPropertyType, PropertyTypeConfig> = {
  apt: {
    endpoint:
      "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev",
    nameField: "aptNm",
    label: "아파트",
  },
  rh: {
    endpoint:
      "https://apis.data.go.kr/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade",
    nameField: "mhouseNm",
    label: "연립·다세대",
  },
  offi: {
    endpoint:
      "https://apis.data.go.kr/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade",
    nameField: "offiNm",
    label: "오피스텔",
  },
};

function isRtmsPropertyType(v: string): v is RtmsPropertyType {
  return v === "apt" || v === "rh" || v === "offi";
}

/** RTMS XML 응답 단건 raw 구조 (단지명은 nameField 로 추출되어 complexName 으로 정규화) */
interface RtmsRawItem {
  complexName?: string; // 단지/건물명 (apt: aptNm / rh: mhouseNm / offi: offiNm)
  dealYear?: string;    // 계약년
  dealMonth?: string;   // 계약월
  dealDay?: string;     // 계약일
  excluUseAr?: string;  // 전용면적 (㎡, 소수 가능)
  dealAmount?: string;  // 거래금액 (만원, 쉼표 포함 가능)
  floor?: string;       // 층
  buildYear?: string;   // 건축연도
  jibun?: string;       // 지번
  umdNm?: string;       // 읍면동
  rgstDate?: string;    // 등기일
  dealingGbn?: string;  // 거래유형 ("중개거래"|"직거래"|"기타")
  /** 해제여부 — 해제 시 "O" (공공데이터포털 기술문서 기준, P8) */
  cdealType?: string;
  /** 해제사유발생일 */
  cdealDay?: string;
}

// ──────────────────────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────────────────────

const NUM_OF_ROWS = 1000; // 페이지당 최대 (P2 전체 페이지 수집)

// ──────────────────────────────────────────────────────────────
// 내부 유틸
// ──────────────────────────────────────────────────────────────

/**
 * 평가기준일(또는 양도세 취득일) + 세목 → 조회 대상 월 목록 (YYYYMM 배열)
 * - 상속(상증령 §49①): 평가기준일 전후 6개월 → 최대 13개월
 * - 증여(상증령 §49①): 전 6개월 ~ 후 3개월 → 최대 10개월
 * - 양도(소득세법 시행령 §176의2③1호): 취득일 전후 각 3개월 → 최대 7개월
 */
function buildQueryMonths(
  baseDate: Date,
  taxType: "inheritance" | "gift" | "transfer",
): string[] {
  const monthsBefore = taxType === "transfer" ? 3 : 6;
  const monthsAfter = taxType === "inheritance" ? 6 : 3;
  const months: string[] = [];
  for (let m = -monthsBefore; m <= monthsAfter; m++) {
    months.push(format(addMonths(baseDate, m), "yyyyMM"));
  }
  // 중복 제거 (월 경계에서 동일 월이 두 번 나오는 경우 방어)
  return [...new Set(months)];
}

/**
 * RTMS 거래금액(만원 문자열) → 원 정수.
 * 음수 원문·NaN·0 → 0.
 */
function parseDealAmountWon(raw: string | undefined): number {
  if (!raw) return 0;
  if (raw.trimStart().startsWith("-")) return 0;
  const manwon = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  if (isNaN(manwon) || manwon <= 0) return 0;
  return manwon * 10_000;
}

/** 거래유형 정규화 (P9) */
function parseDealingType(
  raw: string | undefined,
): RtmsTradeRecord["dealingType"] {
  if (!raw) return undefined;
  const v = raw.trim();
  if (v === "중개거래") return "중개거래";
  if (v === "직거래") return "직거래";
  if (v === "기타") return "기타";
  return v as RtmsTradeRecord["dealingType"];
}

/**
 * RTMS XML 응답 파싱 — XML string → RtmsRawItem[].
 * 공공데이터포털 v2 응답은 XML. JSON 응답 옵션이 없는 서비스.
 *
 * 주요 XML 구조:
 * <response><body><items><item>...</item></items><totalCount>N</totalCount></body></response>
 */
function parseRtmsXml(
  xml: string,
  lawdCd: string,
  nameField: string,
): { items: RtmsRawItem[]; totalCount: number } {
  // totalCount 추출
  const totalMatch = xml.match(/<totalCount>(\d+)<\/totalCount>/);
  const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  // item 블록 추출 — 정규식 기반 간이 파싱 (DOMParser 미사용, Node.js 환경)
  const items: RtmsRawItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;

  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag: string): string | undefined => {
      const r = new RegExp(`<${tag}>([^<]*)<\/${tag}>`);
      const match = r.exec(block);
      return match ? match[1].trim() : undefined;
    };

    items.push({
      complexName: get(nameField),
      dealYear:   get("dealYear"),
      dealMonth:  get("dealMonth"),
      dealDay:    get("dealDay"),
      excluUseAr: get("excluUseAr"),
      dealAmount: get("dealAmount"),
      floor:      get("floor"),
      buildYear:  get("buildYear"),
      jibun:      get("jibun"),
      umdNm:      get("umdNm"),
      rgstDate:   get("rgstDate"),
      dealingGbn: get("dealingGbn"),
      cdealType:  get("cdealType"),
      cdealDay:   get("cdealDay"),
    });
  }

  return { items, totalCount };
}

/**
 * RtmsRawItem → RtmsTradeRecord 정규화.
 * - dealDate: "YYYY-MM-DD" 변환 (dealYear + dealMonth.padStart(2) + dealDay.padStart(2))
 * - dealAmountWon: 만원 × 10_000 정수
 * - aptNameNormalized: normalizeAptName 적용
 */
function normalizeRawItem(
  raw: RtmsRawItem,
  lawdCd: string,
): RtmsTradeRecord | null {
  if (!raw.complexName) return null;

  const year  = raw.dealYear?.trim()  ?? "";
  const month = (raw.dealMonth?.trim() ?? "").padStart(2, "0");
  const day   = (raw.dealDay?.trim()   ?? "").padStart(2, "0");
  if (!year || month === "00" || day === "00") return null;
  const dealDate = `${year}-${month}-${day}`;

  const exclusiveAreaM2 = raw.excluUseAr
    ? parseFloat(raw.excluUseAr.replace(/,/g, ""))
    : 0;
  if (isNaN(exclusiveAreaM2) || exclusiveAreaM2 <= 0) return null;

  const dealAmountWon = parseDealAmountWon(raw.dealAmount);
  // dealAmountWon=0인 거래는 필터 함수에서 제외되지만 여기서는 그대로 전달

  const floor     = parseInt(raw.floor     ?? "0", 10) || 0;
  const buildYear = parseInt(raw.buildYear ?? "0", 10) || 0;

  return {
    aptName:           raw.complexName,
    aptNameNormalized: normalizeAptName(raw.complexName),
    dealDate,
    exclusiveAreaM2,
    dealAmountWon,
    floor,
    buildYear,
    jibun:       raw.jibun   ?? "",
    umdNm:       raw.umdNm   ?? "",
    lawdCd,
    cdealType:   raw.cdealType   ?? undefined,
    cdealDay:    raw.cdealDay    ?? undefined,
    dealingType: parseDealingType(raw.dealingGbn),
  };
}

/**
 * 단일 월 RTMS 전체 페이지 수집 (P2 — callNedAllPages 패턴 적용).
 * numOfRows=1000, pageNo 루프, totalCount 기반 종료.
 */
async function fetchRtmsMonth(
  lawdCd: string,
  dealYmd: string,
  apiKey: string,
  config: PropertyTypeConfig,
): Promise<{ records: RtmsTradeRecord[]; error?: string }> {
  const allRecords: RtmsTradeRecord[] = [];
  let pageNo = 1;

  while (true) {
    const params = new URLSearchParams({
      serviceKey: apiKey,
      LAWD_CD:    lawdCd,
      DEAL_YMD:   dealYmd,
      numOfRows:  String(NUM_OF_ROWS),
      pageNo:     String(pageNo),
    });

    let res: Response;
    try {
      res = await fetch(`${config.endpoint}?${params}`, {
        cache: "no-store",
        // data.go.kr 게이트웨이는 User-Agent 없는 요청을 "400 Request Blocked"로 차단한다.
        // Node 서버 fetch 기본 UA로는 전건 차단 → 반드시 브라우저형 UA 명시.
        headers: {
          Accept: "application/xml",
          "User-Agent": "Mozilla/5.0",
        },
      });
    } catch (err) {
      return {
        records: allRecords,
        error: `RTMS fetch error (${dealYmd}): ${String(err)}`,
      };
    }

    if (!res.ok) {
      return {
        records: allRecords,
        error: `RTMS HTTP ${res.status} (${dealYmd})`,
      };
    }

    const xml = await res.text();

    // 오류 응답 감지 (resultCode 비정상)
    // 성공 코드: "00"(legacy) 또는 "000"(RTMSDataSvcAptTradeDev) — 두 형식 모두 허용
    const codeMatch = xml.match(/<resultCode>([^<]*)<\/resultCode>/);
    const resultCode = codeMatch?.[1]?.trim();
    if (resultCode && resultCode !== "00" && resultCode !== "000") {
      const msgMatch = xml.match(/<resultMsg>([^<]+)<\/resultMsg>/);
      return {
        records: allRecords,
        error: `RTMS API 오류 (${dealYmd}): ${resultCode} — ${msgMatch?.[1] ?? ""}`,
      };
    }

    const { items, totalCount } = parseRtmsXml(xml, lawdCd, config.nameField);

    for (const raw of items) {
      const normalized = normalizeRawItem(raw, lawdCd);
      if (normalized) allRecords.push(normalized);
    }

    // 종료 조건: 빈 페이지 또는 totalCount 달성
    if (
      items.length === 0 ||
      (totalCount > 0 && allRecords.length >= totalCount)
    ) {
      break;
    }
    pageNo++;
  }

  return { records: allRecords };
}

// ──────────────────────────────────────────────────────────────
// GET handler
// ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse<RtmsAptTradeResponse>> {
  const { searchParams } = new URL(request.url);
  const lawdCd   = searchParams.get("lawdCd")?.trim()  ?? "";
  const baseDate = searchParams.get("baseDate")?.trim() ?? "";
  const taxType  = searchParams.get("taxType")?.trim()  ?? "";
  // 물건 종류 — 미지정 시 apt (기존 호출 하위호환)
  const propertyTypeRaw = searchParams.get("propertyType")?.trim() ?? "apt";

  // env 미설정 — HTTP 200 + configMissing:true (P5 — 500 에러 금지)
  const apiKey = process.env.MOLIT_RTMS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      configMissing: true,
      records: [],
      error: "MOLIT_RTMS_API_KEY가 설정되지 않았습니다.",
    });
  }

  // 파라미터 검증
  if (!lawdCd || lawdCd.length !== 5 || !/^\d{5}$/.test(lawdCd)) {
    return NextResponse.json({
      success: false,
      records: [],
      error: "lawdCd는 5자리 숫자이어야 합니다.",
    });
  }

  if (!baseDate || !/^\d{4}-\d{2}-\d{2}$/.test(baseDate)) {
    return NextResponse.json({
      success: false,
      records: [],
      error: "baseDate는 YYYY-MM-DD 형식이어야 합니다.",
    });
  }

  if (taxType !== "inheritance" && taxType !== "gift" && taxType !== "transfer") {
    return NextResponse.json({
      success: false,
      records: [],
      error: 'taxType은 "inheritance"·"gift"·"transfer" 중 하나이어야 합니다.',
    });
  }

  if (!isRtmsPropertyType(propertyTypeRaw)) {
    return NextResponse.json({
      success: false,
      records: [],
      error: 'propertyType은 "apt"·"rh"·"offi" 중 하나이어야 합니다.',
    });
  }
  const config = PROPERTY_TYPE_CONFIG[propertyTypeRaw];

  // 평가기간 → 조회 월 목록 산출 (§4.2)
  const baseDateObj = new Date(baseDate + "T00:00:00.000Z");
  const months = buildQueryMonths(
    baseDateObj,
    taxType as "inheritance" | "gift" | "transfer",
  );

  // 병렬 fetch + 부분 성공 허용 (Promise.allSettled)
  const results = await Promise.allSettled(
    months.map((m) => fetchRtmsMonth(lawdCd, m, apiKey, config)),
  );

  const allRecords: RtmsTradeRecord[] = [];
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      allRecords.push(...result.value.records);
      if (result.value.error) errors.push(result.value.error);
    } else {
      errors.push(String(result.reason));
    }
  }

  // 중복 제거 (동일 거래가 월 경계에서 두 번 수집될 수 있음 — dealDate + aptName + floor + dealAmountWon 기준)
  const seen = new Set<string>();
  const deduped: RtmsTradeRecord[] = [];
  for (const r of allRecords) {
    const key = `${r.dealDate}|${r.aptNameNormalized}|${r.floor}|${r.dealAmountWon}|${r.exclusiveAreaM2}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  return NextResponse.json({
    success: true,
    records: deduped,
    months,
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
  });
}
