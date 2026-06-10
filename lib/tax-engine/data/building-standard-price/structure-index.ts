/**
 * D2. 구조지수 ((연도, 구조키) → 지수)
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시 — 부록 「연도별 구조지수표」(9p).
 * PDF 전수 실측(2026-06-10).
 *
 * ★ 연도별 분류·값 상이: 2016~2026 = 11행 / 2012~2015 = 8행 / 2001~2011 = 8행(연도군 묶음).
 * ★ 지수표 1행 = 다수 구조 묶음 → 본 데이터는 **개별 구조키 단위로 분해**(같은 행은 동일 지수).
 *   (드롭다운 옵션·잔가율 그룹 결정이 개별 구조 단위여야 하므로 — `structure-group-map.ts` STRUCTURE_META).
 *
 * ⚠️ 모호 셀(Phase A 재대조 권장):
 *   · 2016년 6행: PDF에 "조립식패널조"가 6행(90)·8행(80) 중복 표기 → 8행(80) 기준 채택,
 *     6행은 [시멘트벽돌·황토·시멘트블록·와이어패널]로 해석(동일 구조 2지수 불가).
 *   · 2013년 4행: PDF에 석조·스틸하우스조 표기 불명확 → 인접연도(2012·2014) 정합으로 4행(100)에 포함.
 */
import { STRUCTURE_META } from "./structure-group-map";

/** 한 연도의 구조키 → 지수 맵 */
type StructureYearIndex = Readonly<Record<string, number>>;

// 연도군 공유 객체 (참조 공유)
const Y2003_2007: StructureYearIndex = {
  solid_wood: 140,
  steel_frame_rc: 120,
  rc: 100, stone: 100, precast_concrete: 100, wood_frame: 100,
  brick: 90, cement_brick: 90, ocher: 90, steel_frame: 90, steel_house: 90,
  reinforced_concrete_masonry: 80, wood: 80,
  cement_block: 60,
  light_steel_frame: 50,
  steel_pipe: 30, lime_earth_brick: 30, stone_earth_wall: 30,
};

const Y2008_2009: StructureYearIndex = {
  solid_wood: 140,
  steel_frame_rc: 110,
  rc: 100, stone: 100, precast_concrete: 100, wood_frame: 100,
  brick: 90, cement_brick: 90, ocher: 90, steel_frame: 90, steel_house: 90,
  reinforced_concrete_masonry: 80, wood: 80, steel_frame_eps: 80,
  cement_block: 70,
  light_steel_frame: 50,
  steel_pipe: 40, lime_earth_brick: 40, stone_earth_wall: 40,
};

const Y2010_2011: StructureYearIndex = {
  solid_wood: 130,
  steel_frame_rc: 110, wood_frame: 110,
  rc: 100, stone: 100, precast_concrete: 100,
  brick: 90, cement_brick: 90, ocher: 90, steel_frame: 90, steel_house: 90, reinforced_concrete_masonry: 90, wood: 90,
  steel_frame_eps: 80, cement_block: 80,
  light_steel_frame: 60,
  lime_earth_brick: 50, stone_earth_wall: 50,
  steel_pipe: 40,
};

const Y2001_2002: StructureYearIndex = {
  solid_wood: 130,
  steel_frame_rc: 120,
  rc: 100, stone: 100, precast_concrete: 100, wood_frame: 100,
  brick: 90, cement_brick: 90, ocher: 90, steel_frame: 90, steel_house: 90,
  reinforced_concrete_masonry: 80, wood: 80,
  cement_block: 60,
  light_steel_frame: 50,
  steel_pipe: 30, lime_earth_brick: 30, stone_earth_wall: 30,
};

/** 연도 → 구조지수 맵. 11행(2016~2026)·8행(2001~2015) */
const STRUCTURE_INDEX_BY_YEAR: Readonly<Record<number, StructureYearIndex>> = {
  // ── 11행 체계 (2016~2026) ──
  2026: {
    solid_wood: 135, wood_frame: 115, steel_frame_rc: 110,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 95, steel_frame: 95, reinforced_concrete_masonry: 95, reinforced_block: 95,
    cement_brick: 90, ocher: 90, cement_block: 90, wire_panel: 90,
    steel_frame_eps: 85, prefab_panel: 80, light_steel_frame: 79,
    lime_earth_brick: 60, stone_earth_wall: 60, steel_pipe: 59, container: 59,
  },
  2025: {
    solid_wood: 135, wood_frame: 120, steel_frame_rc: 110,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 95, steel_frame: 95, reinforced_concrete_masonry: 95, reinforced_block: 95,
    cement_brick: 90, ocher: 90, cement_block: 90, wire_panel: 90,
    steel_frame_eps: 85, prefab_panel: 80, light_steel_frame: 79,
    lime_earth_brick: 60, stone_earth_wall: 60, steel_pipe: 59, container: 59,
  },
  2024: {
    solid_wood: 135, wood_frame: 125, steel_frame_rc: 110,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 97, steel_frame: 97, reinforced_concrete_masonry: 97, reinforced_block: 97,
    cement_brick: 95, ocher: 95, cement_block: 95, wire_panel: 95,
    steel_frame_eps: 85, prefab_panel: 80, light_steel_frame: 79,
    lime_earth_brick: 60, stone_earth_wall: 60, steel_pipe: 59, container: 59,
  },
  2023: {
    solid_wood: 135, wood_frame: 125, steel_frame_rc: 115,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 97, steel_frame: 97, reinforced_concrete_masonry: 97, reinforced_block: 97,
    cement_brick: 95, ocher: 95, cement_block: 95, wire_panel: 95,
    steel_frame_eps: 85, prefab_panel: 80, light_steel_frame: 77,
    lime_earth_brick: 60, stone_earth_wall: 60, steel_pipe: 57, container: 57,
  },
  2022: {
    solid_wood: 135, wood_frame: 130, steel_frame_rc: 115,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 97, steel_frame: 97, reinforced_concrete_masonry: 97, reinforced_block: 97,
    cement_brick: 95, ocher: 95, cement_block: 95, wire_panel: 95,
    steel_frame_eps: 85, prefab_panel: 80, light_steel_frame: 77,
    lime_earth_brick: 60, stone_earth_wall: 60, steel_pipe: 55, container: 55,
  },
  2021: {
    solid_wood: 135, wood_frame: 130, steel_frame_rc: 115,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 97, steel_frame: 97, reinforced_concrete_masonry: 97, reinforced_block: 97,
    cement_brick: 95, ocher: 95, cement_block: 95, wire_panel: 95,
    steel_frame_eps: 85, prefab_panel: 80, light_steel_frame: 77,
    lime_earth_brick: 60, stone_earth_wall: 60, steel_pipe: 50, container: 50,
  },
  2020: {
    solid_wood: 135, wood_frame: 130, steel_frame_rc: 115,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 97, steel_frame: 97, reinforced_concrete_masonry: 97, reinforced_block: 97,
    cement_brick: 92, ocher: 92, cement_block: 92, wire_panel: 92,
    steel_frame_eps: 85, prefab_panel: 80, light_steel_frame: 77,
    lime_earth_brick: 60, stone_earth_wall: 60, steel_pipe: 50, container: 50,
  },
  2019: {
    solid_wood: 135, wood_frame: 130, steel_frame_rc: 115,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 97, steel_frame: 97, reinforced_concrete_masonry: 97, reinforced_block: 97,
    cement_brick: 92, ocher: 92, cement_block: 92, wire_panel: 92,
    steel_frame_eps: 85, prefab_panel: 80, light_steel_frame: 75,
    lime_earth_brick: 60, stone_earth_wall: 60, steel_pipe: 50, container: 50,
  },
  2018: {
    solid_wood: 135, wood_frame: 130, steel_frame_rc: 115,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 95, steel_frame: 95, reinforced_concrete_masonry: 95, reinforced_block: 95,
    cement_brick: 92, ocher: 92, cement_block: 92, wire_panel: 92,
    steel_frame_eps: 85, prefab_panel: 80, light_steel_frame: 75,
    lime_earth_brick: 60, stone_earth_wall: 60, steel_pipe: 50, container: 50,
  },
  2017: {
    solid_wood: 135, wood_frame: 130, steel_frame_rc: 115,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 95, steel_frame: 95, reinforced_concrete_masonry: 95, reinforced_block: 95,
    cement_brick: 90, ocher: 90, cement_block: 90, wire_panel: 90,
    steel_frame_eps: 85, prefab_panel: 80, light_steel_frame: 75,
    lime_earth_brick: 60, stone_earth_wall: 60, steel_pipe: 50, container: 50,
  },
  2016: {
    solid_wood: 135, wood_frame: 130, steel_frame_rc: 110,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 95, steel_frame: 95, reinforced_concrete_masonry: 95, reinforced_block: 95,
    cement_brick: 90, ocher: 90, cement_block: 90, wire_panel: 90,
    steel_frame_eps: 85, prefab_panel: 80, light_steel_frame: 75,
    lime_earth_brick: 60, stone_earth_wall: 60, steel_pipe: 50, container: 50,
  },

  // ── 8행 체계 (2012~2015) ──
  2015: {
    solid_wood: 130, wood_frame: 125, steel_frame_rc: 110,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 90, cement_brick: 90, ocher: 90, steel_frame: 90, reinforced_concrete_masonry: 90,
    cement_block: 90, reinforced_block: 90, wire_panel: 90,
    steel_frame_eps: 80, prefab_panel: 80,
    light_steel_frame: 70,
    lime_earth_brick: 50, stone_earth_wall: 50, steel_pipe: 50, container: 50,
  },
  2014: {
    solid_wood: 130, wood_frame: 120, steel_frame_rc: 110,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100, steel_house: 100,
    brick: 90, cement_brick: 90, ocher: 90, steel_frame: 90, reinforced_concrete_masonry: 90,
    cement_block: 90, reinforced_block: 90, wire_panel: 90,
    steel_frame_eps: 80, prefab_panel: 80,
    light_steel_frame: 70,
    lime_earth_brick: 50, stone_earth_wall: 50, steel_pipe: 50, container: 50,
  },
  2013: {
    solid_wood: 130, wood_frame: 120, steel_frame_rc: 110,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100, ramen: 100, alc: 100,
    brick: 90, cement_brick: 90, ocher: 90, steel_frame: 90, steel_house: 90,
    reinforced_concrete_masonry: 90, cement_block: 90, reinforced_block: 90, wire_panel: 90,
    steel_frame_eps: 80, prefab_panel: 80,
    light_steel_frame: 70,
    lime_earth_brick: 50, stone_earth_wall: 50, steel_pipe: 50, container: 50,
  },
  2012: {
    solid_wood: 130, wood_frame: 120, steel_frame_rc: 110,
    rc: 100, stone: 100, precast_concrete: 100, wood: 100,
    brick: 90, cement_brick: 90, ocher: 90, steel_frame: 90, steel_house: 90,
    reinforced_concrete_masonry: 90, cement_block: 90,
    steel_frame_eps: 80,
    light_steel_frame: 70,
    lime_earth_brick: 50, stone_earth_wall: 50, steel_pipe: 50,
  },

  // ── 연도군 (2001~2011) ──
  2011: Y2010_2011, 2010: Y2010_2011,
  2009: Y2008_2009, 2008: Y2008_2009,
  2007: Y2003_2007, 2006: Y2003_2007, 2005: Y2003_2007, 2004: Y2003_2007, 2003: Y2003_2007,
  2002: Y2001_2002, 2001: Y2001_2002,
};

export const STRUCTURE_INDEX_MIN_YEAR = 2001;
export const STRUCTURE_INDEX_MAX_YEAR = 2026;

/** 해당 연도 구조지수표 조회(2000 이전 = 2001년표). 보유 범위 밖이면 undefined */
function resolveYearMap(year: number): StructureYearIndex | undefined {
  if (year < STRUCTURE_INDEX_MIN_YEAR) return STRUCTURE_INDEX_BY_YEAR[2001];
  return STRUCTURE_INDEX_BY_YEAR[year];
}

/**
 * (연도, 구조키) → 구조지수(정수). 해당 연도에 그 구조가 없으면 undefined(검증 오류 처리).
 */
export function resolveStructureIndex(year: number, structureKey: string): number | undefined {
  return resolveYearMap(year)?.[structureKey];
}

/**
 * UI 드롭다운용 — 해당 연도에 존재하는 구조 옵션 목록(키·표시명·지수).
 * 표시명은 STRUCTURE_META 단일 출처. 지수 내림차순 정렬.
 */
export function listStructureOptions(
  year: number,
): ReadonlyArray<{ key: string; label: string; index: number }> {
  const map = resolveYearMap(year);
  if (!map) return [];
  return Object.entries(map)
    .map(([key, index]) => ({ key, label: STRUCTURE_META[key]?.label ?? key, index }))
    .sort((a, b) => b.index - a.index || a.label.localeCompare(b.label, "ko"));
}
