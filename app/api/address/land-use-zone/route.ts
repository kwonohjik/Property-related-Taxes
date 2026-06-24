/**
 * 용도지역 자동조회 API — 재산세 도시지역분(§112) 토글 보조.
 *
 * GET /api/address/land-use-zone
 *   ?jibun={지번주소}        주 입력 (재산세 폼 form.jibun)
 *   ?lat={위도}&lng={경도}    선택 (직접 좌표 전달 시)
 *
 * 처리: jibun → getcoord(EPSG:4326 point) → LT_C_UQ111 geomFilter=POINT(경도 위도)
 *        → pickLatestZone → classifyUrbanArea
 *
 * 응답: { uname, verdict, suggestUrbanToggle, allZones, source }
 *   - 좌표 미확보·NOT_FOUND·빈 uname → verdict:"unknown" 200 (에러 아님 — 수동 fallback UX)
 *
 * 계획서: docs/00-pm/property-urban-area-auto-lookup.plan.md §5-2
 * 실측 함정(2026-06-25): req/data API에 domain 파라미터를 부착하면 INCORRECT_KEY →
 *   domain 미부착, Referer 헤더만 유지.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  classifyUrbanArea,
  pickLatestZone,
  type ZoneFeature,
} from "@/lib/geo/land-use-zone";

const VWORLD_ADDR_URL = "https://api.vworld.kr/req/address";
const VWORLD_DATA_URL = "https://api.vworld.kr/req/data";
const VWORLD_DOMAIN = process.env.VWORLD_DOMAIN ?? "http://localhost:3000";

interface CoordResponse {
  response?: {
    status?: string;
    result?: { point?: { x?: string; y?: string } };
  };
}

interface ZoneRawResponse {
  response?: {
    status?: string;
    result?: {
      featureCollection?: {
        features?: Array<{ properties?: { uname?: string; dyear?: string } }>;
      };
    };
  };
}

/** 지번주소 → 좌표(EPSG:4326). 실패 시 null. */
async function getCoord(
  jibun: string,
  apiKey: string,
): Promise<{ lng: string; lat: string } | null> {
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
    const res = await fetch(`${VWORLD_ADDR_URL}?${params}`, {
      cache: "no-store",
      headers: { Accept: "application/json", Referer: VWORLD_DOMAIN },
    });
    if (!res.ok) return null;
    const data: CoordResponse = await res.json();
    if (data.response?.status !== "OK") return null;
    const pt = data.response?.result?.point;
    if (!pt?.x || !pt?.y) return null;
    return { lng: String(pt.x), lat: String(pt.y) };
  } catch {
    return null;
  }
}

/** 좌표 → 용도지역 feature 목록. domain 미부착(실측 함정). */
async function getZones(
  lng: string,
  lat: string,
  apiKey: string,
): Promise<ZoneFeature[]> {
  // geomFilter 공백/괄호 인코딩: encodeURIComponent는 공백만 %20, 괄호는 보존(실측 OK 형식).
  const geom = encodeURIComponent(`POINT(${lng} ${lat})`);
  const url =
    `${VWORLD_DATA_URL}?service=data&request=GetFeature&data=LT_C_UQ111` +
    `&key=${apiKey}&format=json&geometry=false&size=100&geomFilter=${geom}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", Referer: VWORLD_DOMAIN },
    });
    if (!res.ok) return [];
    const data: ZoneRawResponse = await res.json();
    if (data.response?.status !== "OK") return [];
    const features = data.response?.result?.featureCollection?.features ?? [];
    return features.map((f) => ({
      uname: f.properties?.uname ?? "",
      dyear: f.properties?.dyear,
    }));
  } catch {
    return [];
  }
}

function unknownResponse(source: string) {
  return NextResponse.json({
    uname: "",
    verdict: "unknown" as const,
    suggestUrbanToggle: false,
    allZones: [] as string[],
    source,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jibun = searchParams.get("jibun")?.trim() ?? "";
  let lng = searchParams.get("lng")?.trim() ?? "";
  let lat = searchParams.get("lat")?.trim() ?? "";

  const apiKey = process.env.VWORLD_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: {
          code: "VWORLD_API_KEY_MISSING",
          message: "VWORLD_API_KEY가 설정되지 않았습니다.",
        },
      },
      { status: 500 },
    );
  }

  // 좌표 확보 — 직접 전달이 없으면 jibun → getcoord
  if (!lng || !lat) {
    if (!jibun) {
      return NextResponse.json(
        {
          error: {
            code: "MISSING_INPUT",
            message: "jibun 또는 lat·lng 파라미터가 필요합니다.",
          },
        },
        { status: 400 },
      );
    }
    const coord = await getCoord(jibun, apiKey);
    if (!coord) return unknownResponse("vworld_uq111");
    lng = coord.lng;
    lat = coord.lat;
  }

  const zones = await getZones(lng, lat, apiKey);
  const picked = pickLatestZone(zones);
  const uname = picked?.uname ?? "";
  const verdict = classifyUrbanArea(uname);

  return NextResponse.json({
    uname,
    verdict,
    suggestUrbanToggle: verdict === "urban",
    allZones: zones.map((z) => z.uname).filter(Boolean),
    source: "vworld_uq111",
  });
}
