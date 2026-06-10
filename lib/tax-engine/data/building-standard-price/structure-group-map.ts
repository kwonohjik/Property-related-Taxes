/**
 * D8. 구조키 → 구조 메타({표시명, 잔가율그룹, 산정기준율그룹})
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시 — 잔가율표 헤더 + 산정기준율표 헤더 + 제3장 §4 주의사항(p.297).
 * PDF 전수 실측(2026-06-10).
 *
 * ★ 잔가율 그룹(I~IV, 내용연수 50/40/30/20년)과 산정기준율 그룹(I~III, 내용연수 40/30/20년)은
 *   **별개 체계**다. 같은 구조가 두 표에서 다른 그룹에 속함(단순 번호 시프트 아닌 구조별 재편):
 *     · 황토조   = 잔가율 III · 산정기준율 II
 *     · 목조     = 잔가율 II  · 산정기준율 II
 *     · 목구조   = 잔가율 I   · 산정기준율 I
 *     · 경량철골조 = 잔가율 III · 산정기준율 III
 *
 * ★ acqBase(산정기준율 그룹) undefined = 산정기준율표 헤더에 없는 신공법 구조
 *   (ALC조·보강블록조·와이어패널조·조립식패널조·컨테이너건물). 이들은 2001~2002 구조지수표에도
 *   존재하지 않아 2000.12.31 이전 취득(산정기준율 경로)에 들어올 수 없음 → 해당 경로 진입 시 검증 오류.
 *
 * p.297 §4④: R.C조·P.S조·라멘조는 철근콘크리트조의 일종 → 산정기준율 I그룹.
 */
import type {
  ResidualRateGroup,
  AcqBaseRateGroup,
} from "../../types/building-standard-price.types";

export interface StructureMeta {
  /** 표시명(드롭다운 라벨 기준) */
  label: string;
  /** 잔가율 그룹(I~IV) */
  residual: ResidualRateGroup;
  /** 산정기준율 그룹(I~III). 헤더 미수록 신공법 구조는 undefined */
  acqBase?: AcqBaseRateGroup;
}

/**
 * 구조 마스터: 정규화 키 → 메타.
 * 구조지수표(`structure-index.ts`)·드롭다운·그룹 매핑의 단일 출처.
 */
export const STRUCTURE_META: Readonly<Record<string, StructureMeta>> = Object.freeze({
  // ── 잔가율 I그룹(50년) ──
  solid_wood: { label: "통나무조", residual: "I", acqBase: "I" },
  wood_frame: { label: "목구조", residual: "I", acqBase: "I" },
  steel_frame_rc: { label: "철골(철골철근)콘크리트조", residual: "I", acqBase: "I" },
  rc: { label: "철근콘크리트조", residual: "I", acqBase: "I" },
  stone: { label: "석조", residual: "I", acqBase: "I" },
  precast_concrete: { label: "프리캐스트 콘크리트조", residual: "I", acqBase: "I" },
  ramen: { label: "라멘조", residual: "I", acqBase: "I" }, // 철근콘크리트조 일종(§4④)

  // ── 잔가율 II그룹(40년) ──
  brick: { label: "연와조", residual: "II", acqBase: "II" },
  wood: { label: "목조", residual: "II", acqBase: "II" },
  cement_brick: { label: "시멘트벽돌조", residual: "II", acqBase: "II" },
  reinforced_concrete_masonry: { label: "보강콘크리트조", residual: "II", acqBase: "II" },
  steel_frame: { label: "철골조", residual: "II", acqBase: "II" },
  steel_house: { label: "스틸하우스조", residual: "II", acqBase: "II" },
  alc: { label: "ALC조", residual: "II" }, // 산정기준율 헤더 미수록(신공법)
  reinforced_block: { label: "보강블록조", residual: "II" }, // 산정기준율 헤더 미수록
  wire_panel: { label: "와이어패널조", residual: "II" }, // 산정기준율 헤더 미수록

  // ── 잔가율 III그룹(30년) ──
  ocher: { label: "황토조", residual: "III", acqBase: "II" }, // ★재편: 잔가율 III·산정기준율 II
  light_steel_frame: { label: "경량철골조", residual: "III", acqBase: "III" },
  lime_earth_brick: { label: "석회 및 흙벽돌조", residual: "III", acqBase: "III" },
  stone_earth_wall: { label: "돌담 및 토담조", residual: "III", acqBase: "III" },
  cement_block: { label: "시멘트블록조", residual: "III", acqBase: "III" },
  prefab_panel: { label: "조립식패널조", residual: "III" }, // 산정기준율 헤더 미수록
  // ☐ 확인 필요: "철골조 중 조립식패널(EPS패널에 한함)"은 구조지수표 별도 항목(2008~2026 출현, 지수 80~85).
  //   잔가율표 헤더에 명시 없음 → "철골조 중"으로 보아 II(철골조 기반) 잠정. 산정기준율 헤더 미수록(신공법).
  steel_frame_eps: { label: "철골조 중 조립식패널(EPS패널)", residual: "II" },
  mechanical_parking: { label: "기계식주차전용빌딩", residual: "III", acqBase: "III" },

  // ── 잔가율 IV그룹(20년) ──
  steel_pipe: { label: "철파이프조", residual: "IV", acqBase: "III" },
  container: { label: "컨테이너건물", residual: "IV" }, // 산정기준율 헤더 미수록(경량철골조 분류 §4⑧)
});

/** 잔가율 그룹 조회 — 구조키 미존재 시 throw */
export function resolveResidualGroup(structureKey: string): ResidualRateGroup {
  const meta = STRUCTURE_META[structureKey];
  if (!meta) throw new Error(`알 수 없는 구조키: ${structureKey}`);
  return meta.residual;
}

/**
 * 2001년 잔가율표 그룹 매핑(3그룹). 현행(2026)과 그룹 구성이 다른 구조만 override.
 *   · 황토조 ocher: 2026 III(30년) → 2001 II(30년)
 *   · 철파이프조 steel_pipe: 2026 IV(20년) → 2001 III(20년)
 * 나머지는 현행 그룹과 동일(내용연수만 스킴에서 보정). 2001 미수록 신공법은 structure-index에서 이미 차단.
 */
const RESIDUAL_GROUP_2001_OVERRIDE: Readonly<Record<string, ResidualRateGroup>> = Object.freeze({
  ocher: "II",
  steel_pipe: "III",
});
export function resolveResidualGroup2001(structureKey: string): ResidualRateGroup {
  return RESIDUAL_GROUP_2001_OVERRIDE[structureKey] ?? resolveResidualGroup(structureKey);
}

/** 산정기준율 그룹 조회 — 헤더 미수록 신공법 구조는 undefined(호출부에서 검증 오류) */
export function resolveAcqBaseGroup(structureKey: string): AcqBaseRateGroup | undefined {
  return STRUCTURE_META[structureKey]?.acqBase;
}
