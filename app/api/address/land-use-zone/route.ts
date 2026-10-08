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
 *   - Vworld 가 요청을 거부(status ERROR — 인증키 만료 등)·연결 실패 → 502 VWORLD_API_ERROR.
 *     클라이언트(`lookupLandUseZone`·`HouseEntryRuralHouseBlock`)는 `!res.ok` 를 unknown 으로
 *     받으므로 화면 동작은 같고, 원인이 Network·서버 로그에 남는다(종전엔 「자료 없음」과 구별 불가).
 *
 * 계획서: docs/00-pm/property-urban-area-auto-lookup.plan.md §5-2
 * 실측 함정(2026-06-25): req/data API에 domain 파라미터를 부착하면 INCORRECT_KEY →
 *   domain 미부착, Referer 헤더만 유지.
 */

import { NextRequest, NextResponse } from "next/server";
import { classifyVworldStatus, vworldErrorMessage } from "@/lib/address/vworld-status";
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
    error?: { level?: string; code?: string; text?: string };
    result?: { point?: { x?: string; y?: string } };
  };
}

interface ZoneRawResponse {
  response?: {
    status?: string;
    error?: { level?: string; code?: string; text?: string };
    result?: {
      featureCollection?: {
        features?: Array<{ properties?: { uname?: string; dyear?: string } }>;
      };
    };
  };
}

/** Vworld 가 요청을 거부했거나 연결하지 못함 — 「자료 없음」과 구별해 502 로 올린다 */
class VworldLookupError extends Error {}

/** 지번주소 → 좌표(EPSG:4326). 못 찾으면 null, Vworld 오류는 throw. */
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
  let data: CoordResponse;
  try {
    const res = await fetch(`${VWORLD_ADDR_URL}?${params}`, {
      cache: "no-store",
      headers: { Accept: "application/json", Referer: VWORLD_DOMAIN },
    });
    if (!res.ok) throw new VworldLookupError(`주소 좌표 서비스 HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    if (err instanceof VworldLookupError) throw err;
    throw new VworldLookupError(`주소 좌표 서비스에 연결하지 못했습니다. (${String(err)})`);
  }
  const st = classifyVworldStatus(data);
  if (st.kind === "error") throw new VworldLookupError(vworldErrorMessage("주소 좌표 서비스", st));
  if (st.kind === "not_found") return null;
  const pt = data.response?.result?.point;
  if (!pt?.x || !pt?.y) return null;
  return { lng: String(pt.x), lat: String(pt.y) };
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
  let data: ZoneRawResponse;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", Referer: VWORLD_DOMAIN },
    });
    if (!res.ok) throw new VworldLookupError(`용도지역 서비스 HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    if (err instanceof VworldLookupError) throw err;
    throw new VworldLookupError(`용도지역 서비스에 연결하지 못했습니다. (${String(err)})`);
  }
  const st = classifyVworldStatus(data);
  if (st.kind === "error") throw new VworldLookupError(vworldErrorMessage("용도지역 서비스", st));
  if (st.kind === "not_found") return [];
  const features = data.response?.result?.featureCollection?.features ?? [];
  return features.map((f) => ({
    uname: f.properties?.uname ?? "",
    dyear: f.properties?.dyear,
  }));
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
    let coord: { lng: string; lat: string } | null;
    try {
      coord = await getCoord(jibun, apiKey);
    } catch (err) {
      return vworldFailed(err);
    }
    if (!coord) return unknownResponse("vworld_uq111");
    lng = coord.lng;
    lat = coord.lat;
  }

  let zones: ZoneFeature[];
  try {
    zones = await getZones(lng, lat, apiKey);
  } catch (err) {
    return vworldFailed(err);
  }
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

function vworldFailed(err: unknown) {
  if (!(err instanceof VworldLookupError)) throw err;
  console.error(`[land-use-zone] ${err.message}`);
  return NextResponse.json(
    { error: { code: "VWORLD_API_ERROR", message: err.message } },
    { status: 502 },
  );
}
