/**
 * Vworld reverseGeocoding 프록시.
 *
 * GET /api/address/reverse-geocode?lat={lat}&lng={lng}
 *   - lat, lng: WGS84 좌표 (한국 영역: 33~39N, 124~132E)
 *
 * 응답:
 *   200 — { sigunguCode, address, sidoName, sigunguName }
 *   400 — { error: { code: "INVALID_COORDINATES" | "OUT_OF_KOREA", message } }
 *   503 — { error: { code: "VWORLD_API_KEY_MISSING", message } }
 *   502 — { error: { code: "VWORLD_API_ERROR" | "VWORLD_FETCH_FAILED" | "NO_SIGUNGU_CODE", message } }
 *
 * 계획서: docs/00-pm/inheritance-farming-vworld-reverse-geocode.plan.md v1 §3 S2
 */

import { NextRequest, NextResponse } from "next/server";

const VWORLD_URL = "https://api.vworld.kr/req/address";

interface VworldStructure {
  level0?: string;   // 국가 (예: "대한민국")
  level1?: string;   // 시·도 (예: "서울특별시")
  level2?: string;   // 시·군·구 (예: "강남구")
  level3?: string;   // 읍·면 (또는 빈 문자열)
  level4L?: string;  // 법정동 명칭 (예: "삼성동")
  level4LC?: string; // 법정동 10자리 코드 (예: "1168010500" — 시·군·구 5자리 + 동 5자리)
  level4A?: string;  // 행정동 명칭
  level4AC?: string; // 행정동 10자리 코드
  level5?: string;   // 지번 또는 집세
  detail?: string;   // 상세주소
}

interface VworldResult {
  structure?: VworldStructure;
  text?: string;
}

interface VworldReverseResponse {
  response?: {
    status?: string;
    error?: { text?: string };
    result?: VworldResult[];
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const latRaw = searchParams.get("lat") ?? "";
  const lngRaw = searchParams.get("lng") ?? "";
  const lat = parseFloat(latRaw);
  const lng = parseFloat(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: { code: "INVALID_COORDINATES", message: "lat·lng 좌표 형식 오류 (숫자 필수)" } },
      { status: 400 },
    );
  }

  // 한국 영역 sanity check (위도 33.0~38.7N, 경도 124.5~131.0E 여유 포함)
  if (lat < 33 || lat > 39 || lng < 124 || lng > 132) {
    return NextResponse.json(
      { error: { code: "OUT_OF_KOREA", message: "한국 영역 외 좌표 (33~39N, 124~132E)" } },
      { status: 400 },
    );
  }

  const apiKey = process.env.VWORLD_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: "VWORLD_API_KEY_MISSING", message: "VWORLD_API_KEY 미설정 (.env.local 확인)" } },
      { status: 503 },
    );
  }

  const domain = process.env.VWORLD_DOMAIN ?? "http://localhost:3000";

  const url = new URL(VWORLD_URL);
  url.searchParams.set("service", "address");
  url.searchParams.set("request", "getAddress");
  url.searchParams.set("format", "json");
  url.searchParams.set("crs", "epsg:4326");
  url.searchParams.set("type", "both"); // 도로명 + 지번 양쪽 시도
  url.searchParams.set("point", `${lng},${lat}`);
  url.searchParams.set("key", apiKey);

  let data: VworldReverseResponse;
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", Referer: domain },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: { code: "VWORLD_FETCH_FAILED", message: `Vworld HTTP ${res.status}` } },
        { status: 502 },
      );
    }
    data = await res.json();
  } catch (err) {
    return NextResponse.json(
      { error: { code: "VWORLD_FETCH_FAILED", message: String(err) } },
      { status: 502 },
    );
  }

  if (data.response?.status !== "OK") {
    return NextResponse.json(
      {
        error: {
          code: "VWORLD_API_ERROR",
          message: data.response?.error?.text ?? "Vworld 응답 status != OK",
        },
      },
      { status: 502 },
    );
  }

  const first = data.response.result?.[0];
  const level4LC = first?.structure?.level4LC;
  // Vworld level4LC = 법정동 10자리 코드 (시·군·구 5 + 동 5). 행안부 시·군·구 표준은 앞 5자리 + "00000".
  if (!level4LC || !/^\d{10}$/.test(level4LC)) {
    return NextResponse.json(
      {
        error: {
          code: "NO_SIGUNGU_CODE",
          message: "Vworld 응답에서 법정동 10자리 코드(level4LC) 추출 실패",
        },
      },
      { status: 502 },
    );
  }

  const sigunguCode = level4LC.slice(0, 5) + "00000"; // 행안부 시·군·구 표준 10자리
  return NextResponse.json({
    sigunguCode,
    address: first.text ?? "",
    sidoName: first.structure?.level1 ?? "",
    sigunguName: first.structure?.level2 ?? "",
  });
}
