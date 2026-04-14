/**
 * 공시지가·기준시가 조회 API — Vworld NED(국토정보) 오픈 API 프록시
 *
 * GET /api/address/standard-price
 *   ?jibun={지번주소}         필수 (PNU 구성에 사용)
 *   &propertyType={housing|land|building}
 *   &year={YYYY}
 *
 * PNU 구성 단계:
 *   1) jibun → Vworld 주소변환 API (/req/address) → 법정동코드(10자리) 획득
 *   2) 법정동코드 + 지번 본번/부번 → PNU(19자리) 직접 구성
 *   3) NED API로 공시가격 조회
 *
 * 필요 Vworld 서비스: "검색 2.0" (주소변환 포함) + "국토정보(NED)"
 */

import { NextRequest, NextResponse } from "next/server";

const VWORLD_ADDR_URL = "https://api.vworld.kr/req/address";
const VWORLD_NED_URL  = "https://api.vworld.kr/ned/data";

// ──────────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────────

interface AddrStructure {
  level4LC?: string; // 법정동코드 10자리
  [key: string]: unknown;
}

interface AddrResponse {
  response?: {
    status?: string;
    refined?: { structure?: AddrStructure };
    error?: { text?: string };
  };
}

interface NedPriceItem {
  pnu?: string;
  stdrYear?: string;
  pblntfPclnd?: string; // 개별공시지가 (원/㎡)
  pblntfPc?: string;    // 공시가격 (원)
  [key: string]: unknown;
}

interface NedResponse {
  indvdLandPrices?:    { field?: NedPriceItem | NedPriceItem[] };
  apartHousingPrices?: { field?: NedPriceItem | NedPriceItem[] };
  indvdHousingPrices?: { field?: NedPriceItem | NedPriceItem[] };
  result?: { resultCode?: string; resultMsg?: string };
}

// ──────────────────────────────────────────────────
// 법정동코드 조회 (Vworld /req/address)
// ──────────────────────────────────────────────────

async function getLegalDongCode(jibun: string, apiKey: string): Promise<string | null> {
  const params = new URLSearchParams({
    service: "address",
    request: "getcoord",
    version: "2.0",
    crs: "epsg:4326",
    address: jibun,
    refine: "true",
    simple: "false",
    format: "json",
    type: "parcel",
    key: apiKey,
  });

  try {
    const res = await fetch(`${VWORLD_ADDR_URL}?${params.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data: AddrResponse = await res.json();
    if (data.response?.status !== "OK") return null;

    const code = data.response?.refined?.structure?.level4LC;
    if (!code || code.length < 10) return null;
    return code.slice(0, 10); // 법정동코드 10자리
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────
// PNU 구성 (법정동코드 + 지번 파싱)
// 형식: 법정동코드(10) + 산여부(1) + 본번(4) + 부번(4) = 19자리
// ──────────────────────────────────────────────────

function buildPnu(legalDongCode: string, jibun: string): string | null {
  // 지번 마지막 토큰 추출: "서울특별시 강남구 역삼동 123-45" → "123-45"
  const parts = jibun.trim().split(/\s+/);
  let token = parts[parts.length - 1] ?? "";

  let isMountain = "0";
  if (token.startsWith("산")) {
    isMountain = "1";
    token = token.slice(1);
  }

  const [mainStr, subStr] = token.split("-");
  const mainNum = parseInt(mainStr ?? "0", 10);
  const subNum  = parseInt(subStr  ?? "0", 10);

  if (isNaN(mainNum) || mainNum <= 0) return null;

  const pnu =
    legalDongCode +
    isMountain +
    String(mainNum).padStart(4, "0") +
    String(subNum).padStart(4, "0");

  return pnu.length === 19 ? pnu : null;
}

// ──────────────────────────────────────────────────
// NED API 호출
// ──────────────────────────────────────────────────

async function callNed(endpoint: string, pnu: string, year: string, apiKey: string): Promise<NedResponse | null> {
  const params = new URLSearchParams({
    key: apiKey,
    pnu,
    stdrYear: year,
    format: "json",
    numOfRows: "10",
    pageNo: "1",
  });
  try {
    const res = await fetch(`${VWORLD_NED_URL}/${endpoint}?${params.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as NedResponse;
  } catch {
    return null;
  }
}

function extractPrice(
  payload: NedResponse,
  key: keyof NedResponse,
  priceField: "pblntfPclnd" | "pblntfPc",
): { year: string; price: number } | null {
  const container = payload[key] as { field?: NedPriceItem | NedPriceItem[] } | undefined;
  if (!container) return null;
  const raw = container.field;
  if (!raw) return null;
  const items = Array.isArray(raw) ? raw : [raw];
  const sorted = items
    .map((it) => ({
      year: String(it.stdrYear ?? ""),
      price: parseInt(String(it[priceField] ?? "0").replace(/[^0-9]/g, ""), 10) || 0,
    }))
    .filter((it) => it.price > 0)
    .sort((a, b) => b.year.localeCompare(a.year));
  return sorted[0] ?? null;
}

// ──────────────────────────────────────────────────
// GET handler
// ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jibun        = searchParams.get("jibun") ?? "";
  const propertyType = searchParams.get("propertyType") ?? "housing";
  const year         = searchParams.get("year") ?? String(new Date().getFullYear());

  if (!jibun.trim()) {
    return NextResponse.json(
      { error: { code: "MISSING_JIBUN", message: "jibun(지번 주소) 파라미터가 필요합니다." } },
      { status: 400 },
    );
  }

  const apiKey = process.env.VWORLD_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: "VWORLD_API_KEY_MISSING", message: "VWORLD_API_KEY가 설정되지 않았습니다." } },
      { status: 500 },
    );
  }

  // 1) 법정동코드 조회
  const dongCode = await getLegalDongCode(jibun, apiKey);
  if (!dongCode) {
    return NextResponse.json(
      {
        error: {
          code: "DONG_CODE_NOT_FOUND",
          message:
            "법정동코드를 조회할 수 없습니다. " +
            "Vworld 인증키에 '주소변환' 서비스 권한이 필요하거나, 지번 주소를 확인해 주세요.",
        },
      },
      { status: 404 },
    );
  }

  // 2) PNU 구성
  const pnu = buildPnu(dongCode, jibun);
  if (!pnu) {
    return NextResponse.json(
      {
        error: {
          code: "PNU_BUILD_FAILED",
          message: `법정동코드(${dongCode})와 지번(${jibun})으로 PNU를 구성할 수 없습니다.`,
        },
      },
      { status: 422 },
    );
  }

  // 3) NED API 호출
  try {
    if (propertyType === "land" || propertyType === "building") {
      const res = await callNed("getIndvdLandPriceAttr", pnu, year, apiKey);
      const price = res ? extractPrice(res, "indvdLandPrices", "pblntfPclnd") : null;
      if (!price) {
        return NextResponse.json(
          {
            error: {
              code: "PRICE_NOT_FOUND",
              message: `개별공시지가 조회 실패 (PNU: ${pnu}). Vworld 인증키에 '국토정보(NED)' 서비스 권한을 추가하세요.`,
            },
            pnu,
            dongCode,
          },
          { status: 404 },
        );
      }
      return NextResponse.json({
        pnu, dongCode,
        type: "land_price",
        year: price.year,
        pricePerSqm: price.price,
        message: `${price.year}년 개별공시지가 (원/㎡)`,
      });
    }

    // housing: 공동주택 우선 → 개별주택 fallback
    const apt = await callNed("getApartHousingPriceAttr", pnu, year, apiKey);
    const aptPrice = apt ? extractPrice(apt, "apartHousingPrices", "pblntfPc") : null;
    if (aptPrice) {
      return NextResponse.json({
        pnu, dongCode,
        type: "apart_housing_price",
        year: aptPrice.year,
        price: aptPrice.price,
        message: `${aptPrice.year}년 공동주택 공시가격`,
      });
    }

    const indvd = await callNed("getIndvdHousingPriceAttr", pnu, year, apiKey);
    const indvdPrice = indvd ? extractPrice(indvd, "indvdHousingPrices", "pblntfPc") : null;
    if (indvdPrice) {
      return NextResponse.json({
        pnu, dongCode,
        type: "indvd_housing_price",
        year: indvdPrice.year,
        price: indvdPrice.price,
        message: `${indvdPrice.year}년 개별주택 공시가격`,
      });
    }

    return NextResponse.json(
      {
        error: {
          code: "PRICE_NOT_FOUND",
          message: `공시가격 조회 실패 (PNU: ${pnu}). Vworld 인증키에 '국토정보(NED)' 서비스 권한을 추가하거나, 기준년도(${year})를 확인해 주세요.`,
        },
        pnu,
        dongCode,
      },
      { status: 404 },
    );
  } catch (err) {
    console.error("[standard-price]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "공시가격 조회 중 오류가 발생했습니다." } },
      { status: 500 },
    );
  }
}
