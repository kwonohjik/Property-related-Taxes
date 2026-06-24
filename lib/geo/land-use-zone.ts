/**
 * 용도지역(국토계획법 §36) → 재산세 도시지역분(지방세법 §112) 판정 헬퍼.
 *
 * 데이터 소스: V-World LT_C_UQ111(용도지역) 레이어의 properties.uname.
 * 계획서: docs/00-pm/property-urban-area-auto-lookup.plan.md §4·§5-1
 *
 * 법령:
 * - 국토계획법 §36①1호 — 도시지역 = 주거·상업·공업·녹지지역 (녹지지역 포함)
 * - 지방세법 §112① — 도시지역 中 지방의회 의결 고시 지역에 0.14% 도시지역분
 *
 * ⚠️ 판정은 "도시지역 용도지역 여부"까지만. §112①의 "지방의회 의결 고시" 요건은
 *    데이터 소스가 없어 자동 확정 불가 → UI는 토글 ON을 "제안"만 한다.
 */

export type UrbanAreaVerdict = "urban" | "non_urban" | "unknown";

/** V-World LT_C_UQ111 feature에서 추출한 용도지역 1건. */
export interface ZoneFeature {
  /** 용도지역 명칭 (예: "제3종일반주거지역"). 미지정 feature는 빈 문자열. */
  uname: string;
  /** 결정연도 (예: "2023"). 최신 우선 선별에 사용. */
  dyear?: string;
}

/**
 * 도시지역 용도지역 정식 명칭 (국토계획법 §36①1호 + 시행령 §30).
 * 주거(6) + 상업(4) + 공업(3) + 녹지(3) = 16종.
 */
const URBAN_ZONE_NAMES: ReadonlySet<string> = new Set([
  // 주거지역
  "제1종전용주거지역",
  "제2종전용주거지역",
  "제1종일반주거지역",
  "제2종일반주거지역",
  "제3종일반주거지역",
  "준주거지역",
  // 상업지역
  "중심상업지역",
  "일반상업지역",
  "근린상업지역",
  "유통상업지역",
  // 공업지역
  "전용공업지역",
  "일반공업지역",
  "준공업지역",
  // 녹지지역 — ★ 녹지도 도시지역(§36①1호 라목)
  "보전녹지지역",
  "생산녹지지역",
  "자연녹지지역",
]);

/** 비도시지역 정식 명칭 (관리 3 + 농림 1 + 자연환경보전 1 = 5종). */
const NON_URBAN_ZONE_NAMES: ReadonlySet<string> = new Set([
  "계획관리지역",
  "생산관리지역",
  "보전관리지역",
  "농림지역",
  "자연환경보전지역",
]);

/**
 * 용도지역 명칭 → 도시지역분 판정.
 *
 * 화이트리스트(정식명) 우선, 미일치 시 접미사 보조(명칭 변형 대비).
 * 빈값·미지정·알 수 없는 명칭 → unknown(제안 보류, 토글 수동 유지).
 */
export function classifyUrbanArea(uname: string): UrbanAreaVerdict {
  const name = (uname ?? "").trim();
  if (!name) return "unknown";

  if (URBAN_ZONE_NAMES.has(name)) return "urban";
  if (NON_URBAN_ZONE_NAMES.has(name)) return "non_urban";

  // 접미사 보조 — 정식 화이트리스트에 없는 표기 변형 대비.
  // 비도시(관리·농림·자연환경보전)를 먼저 판정해 "관리지역"이 "지역" 일반매칭에 흡수되지 않게 함.
  if (/(?:계획|생산|보전)?관리지역$/.test(name)) return "non_urban";
  if (/(?:농림지역|자연환경보전지역)$/.test(name)) return "non_urban";
  if (/(?:주거|상업|공업|녹지)지역$/.test(name)) return "urban";

  return "unknown";
}

/**
 * 다중 feature 중 대표 1건 선별.
 * 비어있지 않은 uname 우선 → 그 안에서 dyear 최신(내림차순).
 */
export function pickLatestZone(features: ZoneFeature[]): ZoneFeature | null {
  if (!features || features.length === 0) return null;
  const sorted = [...features].sort((a, b) => {
    const aEmpty = !(a.uname ?? "").trim();
    const bEmpty = !(b.uname ?? "").trim();
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1; // 값 있는 것 우선
    return (b.dyear ?? "").localeCompare(a.dyear ?? ""); // dyear 내림차순
  });
  return sorted[0] ?? null;
}
