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

  const domain = process.env.VWORLD_DOMAIN ?? "http://localhost:3000";

  const buildParams = (category: "road" | "parcel") =>
    new URLSearchParams({
      service: "search",
      request: "search",
      version: "2.0",
      crs: "epsg:4326",
      size,
      page,
      query,
      type: "address",
      category,
      format: "json",
      errorformat: "json",
      key: apiKey,
    });

  // Vworld는 category별 인덱스가 분리돼 있어 도로명·지번을 각각 호출해 병합한다.
  // (도로명만 검색하면 "제주특별자치도 서귀포시 호근동 628-2" 같은 순수 지번주소가 누락됨)
  const fetchCategory = async (category: "road" | "parcel"): Promise<VworldItem[]> => {
    try {
      const r = await fetch(`${VWORLD_URL}?${buildParams(category).toString()}`, {
        headers: { Accept: "application/json", Referer: domain },
        cache: "no-store",
      });
      if (!r.ok) return [];
      const d: VworldResponse = await r.json();
      if (d.response?.status !== "OK") return [];
      return d.response?.result?.items ?? [];
    } catch {
      return [];
    }
  };

  try {
    const [roadItems, parcelItems] = await Promise.all([
      fetchCategory("road"),
      fetchCategory("parcel"),
    ]);

    // PNU(item.id) 기준 dedup — 도로명 결과를 우선 노출.
    const seen = new Set<string>();
    const merged: VworldItem[] = [];
    for (const it of [...roadItems, ...parcelItems]) {
      const key = it.id ?? `${it.address?.road ?? ""}|${it.address?.parcel ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(it);
    }

    const results = merged.map((item) => ({
      pnu: item.id ?? "",   // Vworld item.id가 곧 PNU (19자리 필지고유번호)
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
