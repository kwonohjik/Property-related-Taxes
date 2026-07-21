/**
 * 건축물대장(국토부 건축HUB) 응답 → 건물 기준시가 폼 값 매핑 (순수 함수).
 *
 * 대장 strctCd/mainPurpsCd는 국세청 「건물 기준시가」 구조·용도 체계보다 거칠다(coarse).
 * - 구조: strctCd 9코드 → 대표 국세청 구조키 + etcStrct 자유텍스트 fine refine.
 * - 용도: mainPurpsCd 5자리 override → miss 시 앞2자리(건축법 시행령 별표1 호) default.
 *
 * 근거·동결: docs/02-design/features/building-register-autofill.design.md §2 ·
 *   docs/02-design/features/building-register-usage-mapping.draft.md §Z. Pre-Do 실측(2026-06).
 *
 * ★ 매핑은 명시 테이블만 — 라벨 역인덱스·정규식 접미사/괄호 치환 금지.
 *   STRUCTURE_META는 `목구조`(wood_frame) vs `목조`(wood)·`철골(철골철근)콘크리트조`(괄호) 등
 *   정규식으로 도달 불가/오매핑 라벨이 있음(`feedback_enum_substring_match_forbidden`).
 */
import { STRUCTURE_META } from "./structure-group-map";
import { round2 } from "@/lib/tax-engine/area-utils";

/** 매핑 신뢰도 — high(직접/derive) | medium(대표값·대분류·면적의존). low 등급 없음. */
export type RegisterMapConfidence = "high" | "medium";

export interface StructureMapResult {
  /** STRUCTURE_META 키 */
  structureKey: string;
  confidence: RegisterMapConfidence;
}

export interface UsageMapResult {
  /** scheme-60 용도번호(1~60) */
  usageNo: number;
  confidence: RegisterMapConfidence;
}

/** scheme-60(2018~2026) 적용 연도 — 용도번호 체계 기준. 그 외 연도는 용도 자동채움 비활성. */
const SCHEME60_MIN_YEAR = 2018;
const SCHEME60_MAX_YEAR = 2026;

/**
 * 대장 strctCd(2자리) → 국세청 대표 구조키. 9코드 완결 소표.
 * 출처: 건설교통부 「건축물대장 코드변환 정비요령」 + 실 API(2026). draft §Z-1.
 */
const STRCT_CD_TO_KEY: Readonly<Record<string, string>> = Object.freeze({
  "11": "brick", // 벽돌구조 → 연와조
  "12": "cement_block", // 블록구조 → 시멘트블록조
  "13": "stone", // 석구조 → 석조
  "21": "rc", // 철근콘크리트구조
  "22": "precast_concrete", // 프리캐스트콘크리트구조
  "31": "steel_frame", // 일반철골구조 → 철골조
  "32": "light_steel_frame", // 경량철골구조
  "42": "steel_frame_rc", // 철골철근콘크리트구조
  "51": "wood", // 일반목구조 → 목조(고시 검증 RESOLVED)
});

/**
 * etcStrct 자유텍스트(정규화: 공백제거+소문자) → fine 구조키 refine(명시 별칭만).
 * ★ 명시 키만 — 정규식 치환 금지(draft §Z-1·design §2.2).
 */
const STRCT_ETC_REFINE: Readonly<Record<string, string>> = Object.freeze({
  // 11 벽돌구조 군
  시멘트벽돌: "cement_brick",
  흙벽돌: "lime_earth_brick",
  석회: "lime_earth_brick",
  황토: "ocher",
  보강콘크리트조적: "reinforced_concrete_masonry",
  // 12 블록구조 군
  보강블록: "reinforced_block",
  // 13 석구조 군
  돌담: "stone_earth_wall",
  토담: "stone_earth_wall",
  // 21 RC 군
  라멘조: "ramen",
  라멘: "ramen",
  // 31 철골 군 — 단일·비충돌 토큰만. `조립식패널`/`조립식패널eps`(→prefab_panel/steel_frame_eps)는
  //   괄호형 표기(`조립식패널(EPS패널)`) 시 부분문자열 충돌로 오매핑 위험 + codil 미근거·실측 표본 미확보
  //   → 제거(strctCd 31 = steel_frame 대표값 medium fallback). 실 etcStrct 표본 확보 후 별도 추가.
  스틸하우스: "steel_house",
  와이어패널: "wire_panel",
  철파이프: "steel_pipe",
  컨테이너: "container",
  alc: "alc",
  // 51 목구조 군
  통나무: "solid_wood",
  경량목구조: "wood_frame",
  중목구조: "wood_frame",
});

/** 길이 내림차순 1회 정렬(부분문자열 포함 시 더 구체적인 긴 키 우선). 현재 키는 상호 비충돌. */
const SORTED_REFINE_ENTRIES: ReadonlyArray<readonly [string, string]> =
  Object.entries(STRCT_ETC_REFINE).sort(([a], [b]) => b.length - a.length);

/**
 * 대장 strctCd(+etcStrct) → 국세청 구조키.
 * ① STRCT_CD_TO_KEY[strctCd] 대표 매핑 → ② etcStrct가 STRCT_ETC_REFINE에 매칭 시 fine refine.
 * - refine 성공 → confidence "high", 대표값만 → "medium".
 * - strctCd 미수록 → null(미채움·수동).
 */
export function mapStructure(
  strctCd: string,
  etcStrct: string | undefined,
): StructureMapResult | null {
  const base = STRCT_CD_TO_KEY[strctCd];
  if (!base) return null; // ① 미수록 → null
  if (etcStrct) {
    const norm = etcStrct.replace(/\s/g, "").toLowerCase(); // 공백 제거 + 소문자
    for (const [key, fine] of SORTED_REFINE_ENTRIES) {
      // ★ 방향 확정: norm이 refine 키를 부분문자열로 포함(norm.includes(key)). 역방향 금지.
      if (norm.includes(key) && STRUCTURE_META[fine]) {
        return { structureKey: fine, confidence: "high" }; // ② refine 성공
      }
    }
  }
  return { structureKey: base, confidence: "medium" }; // ③ 대표값
}

/** 앞2자리(별표1 호) → §A default usageNo. 단일값 동결(다값 병기 금지). */
const PURPS_PREFIX_TO_USAGE: Readonly<Record<string, number>> = Object.freeze({
  "01": 2, // 단독주택
  // "02" 공동주택 = 층수 derive(특수분기, 표 미수록)
  "03": 41, // 제1종 근생
  "04": 41, // 제2종 근생
  "05": 20, // 문화·집회
  "06": 23, // 종교
  "07": 10, // 판매(소매 default 단일 — §Y 실측 07000→#10)
  "08": 13, // 운수
  "09": 27, // 의료(종합병원#26은 override)
  "10": 33, // 교육연구(학원#32는 override)
  "11": 34, // 노유자
  "12": 36, // 수련
  "13": 25, // 운동(관람석≥1천㎡#22·골프장등#24는 override)
  "14": 29, // 업무(오피스텔#28은 override)
  "15": 4, // 숙박 default(관광호텔#3은 등급부재 → 자동도달 불가)
  "16": 15, // 위락
  "17": 48, // 공장
  "18": 52, // 창고(냉동/냉장#51은 override)
  "19": 53, // 위험물
  "20": 56, // 자동차(주차장#57·매매/학원#55는 override)
  "21": 59, // 동식물
  "22": 54, // 자원순환
  // "23" 교정·군사 = 미대응 → null
  "24": 30, // 방송통신
  "25": 50, // 발전(원자력#49는 override)
  "26": 42, // 묘지
  "27": 31, // 관광휴게
  // "28" 그밖에(야영장) = 미대응 → null
});

/** 5자리 세부코드 override — 실측 9 확정분(draft §Z-2). */
const PURPS_DETAIL_TO_USAGE: Readonly<Record<string, number>> = Object.freeze({
  // "03025"(목욕장)은 면적의존 → mapUsage 특수분기. 표 미수록.
  "03005": 41, // 의원
  "03002": 41, // 휴게음식점
  "03008": 41, // 변전소
  "04001": 41, // 일반음식점
  "04402": 41, // 사무소(근생)
  "13011": 25, // 골프연습장
  "14299": 29, // 기타일반업무
  "07999": 10, // 기타판매
});

/** 목욕장 면적의존 코드(#37/#38/#39 — totArea 구간). */
const BATHHOUSE_DETAIL_CD = "03025";

/**
 * 대장 mainPurpsCd(5자리) → 국세청 usageNo.
 * ① 미대응 prefix → null ② 목욕장 면적의존 ③ 5자리 override ④ 공동주택 층수 derive
 * ⑤ 앞2자리 default ⑥ 미수록 → null. year ∉ 2018~2026 → null(scheme-60 한정).
 */
export function mapUsage(
  mainPurpsCd: string,
  grndFlrCnt: number | undefined,
  totArea: number | undefined,
  year: number,
): UsageMapResult | null {
  // 0. 연도 게이트 — scheme-60 외 연도는 용도 비활성
  if (year < SCHEME60_MIN_YEAR || year > SCHEME60_MAX_YEAR) return null;

  const prefix = mainPurpsCd.slice(0, 2);

  // 2. 미대응 대분류(국세청 표 미수록) → null
  if (prefix === "23") return null; // 교정·군사
  // (호텔 등급류는 별도 null 분기 불요 — override 미수록 + prefix 15 default #4로 #3 자동도달 불가)

  // 3. 면적의존(목욕장 #37/#38/#39)
  if (mainPurpsCd === BATHHOUSE_DETAIL_CD) {
    if (totArea === undefined) return { usageNo: 41, confidence: "medium" }; // 대분류 fallback
    const usageNo = totArea >= 3000 ? 37 : totArea >= 1000 ? 38 : 39;
    return { usageNo, confidence: "medium" };
  }

  // 4. 5자리 세부 override
  const detail = PURPS_DETAIL_TO_USAGE[mainPurpsCd];
  if (detail !== undefined) return { usageNo: detail, confidence: "high" };

  // 5. 공동주택 층수 derive
  if (prefix === "02") {
    if (grndFlrCnt === undefined) return null; // 층수 없으면 #1/#2 판정 불가 → 수동
    return { usageNo: grndFlrCnt >= 5 ? 1 : 2, confidence: "high" };
  }

  // 6. 앞2자리 default
  const def = PURPS_PREFIX_TO_USAGE[prefix];
  if (def !== undefined) return { usageNo: def, confidence: "medium" };

  // 7. 미수록(prefix "28" 등) → null
  return null;
}

// ─────────────────────────────────────────────────────────────
// 집합건물 전유공용면적 (getBrExposPubuseAreaInfo) — 접근 B
// ─────────────────────────────────────────────────────────────

/** getBrExposPubuseAreaInfo item(필요 필드만). 국토부는 숫자도 문자열 반환. */
export interface ExposPubuseAreaItem {
  /** 동명칭 (예 "201동") */
  dongNm?: string;
  /** 호명칭 (예 "3204") */
  hoNm?: string;
  /** 전유공용구분코드 "1"=전유 / "2"=공용 */
  exposPubuseGbCd?: string;
  /** 면적(㎡) */
  area?: string | number;
}

/**
 * 동/호명 정규화 — 공백 제거 + 접미 "동"/"호" 제거.
 * ⚠️ API dongNm/hoNm 실 형식은 배포환경 실측 미검증 — 폼 unitDong("201동")/unitHo("3204")와
 *   형식이 어긋날 수 있어 정규화로 방어("201동"→"201", "3204호"→"3204", "3204"→"3204").
 */
function normalizeUnitName(s: string | undefined): string {
  return (s ?? "").replace(/\s/g, "").replace(/(동|호)$/, "");
}

/**
 * 집합건물 전유공용면적 items에서 해당 세대(dong/ho)의 **전유+공용** area 합 (㎡, round2).
 *
 * 국세청 「건물 기준시가 계산방법 고시」상 건물면적 = 전유+공용 연면적이므로
 * exposPubuseGbCd "1"(전유)+"2"(공용) 행을 모두 합산한다(전유만 = 과소산정).
 * dong/ho는 정규화 후 일치하는 행만(dong 공란=단동이면 dong 조건 생략). 매칭 행 없으면 null(수동 fallback).
 *
 * ⚠️ dongNm/hoNm 실 형식·area 행 구조(전유 1행 + 공용 다행)는 배포환경 실측 미검증.
 *   route가 서버측 dongNm/hoNm 필터도 병행하나, 형식 불일치 대비 클라이언트에서도 재필터.
 */
export function sumExclusiveCommonArea(
  items: ExposPubuseAreaItem[],
  dong: string,
  ho: string,
): number | null {
  const targetDong = normalizeUnitName(dong);
  const targetHo = normalizeUnitName(ho);
  // 집합건물 세대는 '호'로 식별 — 호 없으면 세대 특정 불가 → null(수동).
  //   호 조건을 생략하면 해당 동 전체 세대 합산 = 잘못된 큰 값이 무경고로 채워짐(과대) → 차단.
  if (!targetHo) return null;
  let sum = 0;
  let matched = 0;
  for (const it of items) {
    if (targetDong && normalizeUnitName(it.dongNm) !== targetDong) continue;
    if (targetHo && normalizeUnitName(it.hoNm) !== targetHo) continue;
    const gb = String(it.exposPubuseGbCd ?? "").trim();
    if (gb !== "1" && gb !== "2") continue; // 전유·공용만
    const a =
      typeof it.area === "number"
        ? it.area
        : parseFloat(String(it.area ?? "").trim());
    if (Number.isFinite(a) && a > 0) {
      sum += a;
      matched++;
    }
  }
  return matched > 0 ? round2(sum) : null;
}
