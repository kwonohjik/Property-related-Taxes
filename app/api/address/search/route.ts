/**
 * 주소 검색 API — Vworld 검색 API 프록시
 *
 * GET /api/address/search?q={query}&page=1&size=10
 *   - q: 검색어 (도로명/지번)
 *   - page, size: 페이지네이션
 *
 * 서버에서 Vworld API 호출 후 클라이언트에 필요한 필드만 정제하여 반환.
 * API 키는 서버 전용 환경변수(VWORLD_API_KEY)로 보호.
 */

import { NextRequest, NextResponse } from "next/server";

const VWORLD_URL = "https://api.vworld.kr/req/search";

interface VworldItem {
  id?: string;
  title?: string;
  category?: string;
  address?: {
    road?: string;
    parcel?: string;
    bldnm?: string;
    zipcode?: string;
  };
  point?: {
    x?: string;
    y?: string;
  };
}

interface VworldResponse {
  response?: {
    status?: string;
    error?: { text?: string };
    result?: {
      items?: VworldItem[];
    };
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const page = searchParams.get("page") ?? "1";
  const size = searchParams.get("size") ?? "10";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const apiKey = process.env.VWORLD_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: {
          code: "VWORLD_API_KEY_MISSING",
          message: "VWORLD_API_KEY 환경변수가 설정되지 않았습니다. (.env.local 확인)",
        },
      },
      { status: 500 },
    );
  }

  const params = new URLSearchParams({
    service: "search",
    request: "search",
    version: "2.0",
    crs: "epsg:4326",
    size,
    page,
    query,
    type: "address",
    category: "road", // road | parcel — 도로명 우선 검색
    format: "json",
    errorformat: "json",
    key: apiKey,
  });

  try {
    const res = await fetch(`${VWORLD_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          error: {
            code: "VWORLD_HTTP_ERROR",
            message: `Vworld API 응답 오류 (${res.status})`,
          },
        },
        { status: 502 },
      );
    }

    const data: VworldResponse = await res.json();
    const status = data.response?.status;

    // NOT_FOUND: 검색 결과 없음
    if (status === "NOT_FOUND") {
      return NextResponse.json({ results: [] });
    }

    if (status !== "OK") {
      return NextResponse.json(
        {
          error: {
            code: "VWORLD_ERROR",
            message: data.response?.error?.text ?? "Vworld API 오류",
          },
        },
        { status: 502 },
      );
    }

    const items = data.response?.result?.items ?? [];
    const results = items.map((item, idx) => ({
      id: `${idx}-${item.id ?? ""}-${item.address?.road ?? item.address?.parcel ?? ""}`,
      title: item.title ?? "",
      road: item.address?.road ?? "",
      jibun: item.address?.parcel ?? "",
      building: item.address?.bldnm ?? "",
      zipcode: item.address?.zipcode ?? "",
      lng: item.point?.x ?? "",
      lat: item.point?.y ?? "",
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[vworld] fetch failed:", err);
    return NextResponse.json(
      {
        error: {
          code: "VWORLD_FETCH_FAILED",
          message: "주소 검색 중 오류가 발생했습니다.",
        },
      },
      { status: 500 },
    );
  }
}
