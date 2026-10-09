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
import { rankAddressResults } from "@/lib/address/rank-address-results";
import { classifyVworldStatus, vworldErrorMessage } from "@/lib/address/vworld-status";

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
  //
  // 실패는 빈 배열로 흡수하지 않고 `failure` 로 돌려준다 — 종전에는 인증키 만료(EXPIRE_KEY)까지
  // 「검색 결과가 없습니다」로 위장됐다(lib/address/vworld-status.ts).
  type CategoryFetch = {
    items: VworldItem[];
    failure?: { code: "VWORLD_API_ERROR" | "VWORLD_FETCH_FAILED"; message: string };
  };
  const fetchCategory = async (category: "road" | "parcel"): Promise<CategoryFetch> => {
    try {
      const r = await fetch(`${VWORLD_URL}?${buildParams(category).toString()}`, {
        headers: { Accept: "application/json", Referer: domain },
        cache: "no-store",
      });
      if (!r.ok) {
        return { items: [], failure: { code: "VWORLD_FETCH_FAILED", message: `주소 검색 서비스 HTTP ${r.status}` } };
      }
      const d: VworldResponse = await r.json();
      const st = classifyVworldStatus(d);
      if (st.kind === "not_found") return { items: [] };
      if (st.kind === "error") {
        return { items: [], failure: { code: "VWORLD_API_ERROR", message: vworldErrorMessage("주소 검색 서비스", st) } };
      }
      return { items: d.response?.result?.items ?? [] };
    } catch (err) {
      console.error(`[vworld] search ${category} fetch failed:`, err);
      return { items: [], failure: { code: "VWORLD_FETCH_FAILED", message: "주소 검색 서비스에 연결하지 못했습니다." } };
    }
  };

  try {
    const [road, parcel] = await Promise.all([
      fetchCategory("road"),
      fetchCategory("parcel"),
    ]);
    const roadItems = road.items;
    const parcelItems = parcel.items;
    const failure = road.failure ?? parcel.failure;
    if (failure) console.error(`[vworld] search failed: ${failure.code} ${failure.message}`);

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

    // 결과가 하나도 없는데 실패가 있었다면 「없음」이 아니라 「조회 실패」다 — 502 로 원인을 올린다.
    // (한쪽 category 만 실패하고 다른 쪽에 결과가 있으면 결과를 살리고 로그만 남긴다.)
    if (merged.length === 0 && failure) {
      return NextResponse.json({ error: failure }, { status: 502 });
    }

    // 검색어 관련도 순으로 안정 정렬 — 지번 검색 시 정확 지번이 최상단에 오도록.
    return NextResponse.json({ results: rankAddressResults(query, results) });
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
