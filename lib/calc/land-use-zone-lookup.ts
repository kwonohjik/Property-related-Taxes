/**
 * 용도지역 자동조회 클라이언트 mediator.
 *
 * /api/address/land-use-zone 프록시 호출 래퍼. 실패는 verdict:"unknown" graceful
 * (사용자 수동 입력 fallback). 1회성 버튼 조회라 클라이언트 캐시는 두지 않는다(YAGNI).
 *
 * 계획서: docs/00-pm/property-urban-area-auto-lookup.plan.md §5-3
 */

import type { UrbanAreaVerdict } from "@/lib/geo/land-use-zone";

export interface LandUseZoneResult {
  /** 대표 용도지역 명칭 (예: "제3종일반주거지역"). 미확보 시 빈 문자열. */
  uname: string;
  verdict: UrbanAreaVerdict;
  /** verdict === "urban" — 도시지역분 토글 ON 제안 여부. */
  suggestUrbanToggle: boolean;
  /** 조회된 전체 용도지역(참고용). */
  allZones: string[];
  source: string;
}

const UNKNOWN: LandUseZoneResult = {
  uname: "",
  verdict: "unknown",
  suggestUrbanToggle: false,
  allZones: [],
  source: "vworld_uq111",
};

/** 지번주소로 용도지역 조회. 실패·미확보는 unknown 반환(throw 없음). */
export async function lookupLandUseZone(
  jibun: string,
): Promise<LandUseZoneResult> {
  const addr = jibun.trim();
  if (!addr) return UNKNOWN;
  try {
    const res = await fetch(
      `/api/address/land-use-zone?jibun=${encodeURIComponent(addr)}`,
      { method: "GET" },
    );
    if (!res.ok) return UNKNOWN;
    const data = (await res.json()) as Partial<LandUseZoneResult>;
    if (!data || typeof data.verdict !== "string") return UNKNOWN;
    return {
      uname: data.uname ?? "",
      verdict: data.verdict,
      suggestUrbanToggle: data.suggestUrbanToggle ?? false,
      allZones: data.allZones ?? [],
      source: data.source ?? "vworld_uq111",
    };
  } catch {
    return UNKNOWN;
  }
}
