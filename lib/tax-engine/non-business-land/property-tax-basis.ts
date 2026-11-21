/**
 * 기타토지 «재산세 분류 근거» 모델 — NBL2611-V1-A (리뷰 R19 · Q-1 (가)).
 *
 * ## 왜 필요한가
 *
 * 종전에는 건축물이 없으면(`hasBuilding` 거짓) 사용자가 비과세·분리과세·별도합산을 골라도 PR#291 override가 종합합산으로 덮었다.
 * 그 override의 법적 근거는 「지방세법 시행령」 §101①2호나목(건축물 부속토지의 별도합산 범위)뿐이다. 법 §104의3①4호 가목
 * (「지방세법」 또는 관계 법률에 따라 재산세가 비과세되거나 면제되는 토지)·나목(「지방세법」 제106조제1항제2호 및 제3호에 따른 재산세
 * 별도합산과세대상 또는 분리과세대상이 되는 토지)은 건축물을 요건으로 하지 않는다.
 *
 * 그렇다고 선언을 그대로 믿으면 «나대지를 근거 없이 별도합산으로 선언하는 역버그»(PR#291이 막으려던 것)가 된다.
 * 그래서 선언 아래에 **근거**를 묻고, 근거가 확인된 선언만 존중한다.
 *
 * ## 규칙 (리뷰 §7.1)
 *
 * | 선언 | 건축물 | 근거 | 처리 |
 * |---|---|---|---|
 * | 종합합산 | — | — | 해당 없음(종전 그대로) |
 * | 비과세·면제 | 무 | 가목(§109·관계 법률) | 전량 사업용 |
 * | 분리과세 | 무 | 영 §102 | 전량 사업용 |
 * | 별도합산 | 무 | 공지상태(영 §101③) | 전량 사업용 + 호별 면적 한도 확인 필요 |
 * | 별도합산 | 무 | 철거·멸실(영 §103의2) | 종전 바닥면적 × 영 §101② 배율 이내 + 한시 지위 확인 필요 |
 * | 비종합합산 | 무 | 미선택·모름·호환 불가·철거 바닥면적 미입력 | **종합합산 + 확인 필요**(역버그 방지 — 엔진 규칙) |
 * | 비과세·면제·분리과세 | 유 | 가목/영 §102 | 2% 강등·배율 게이트 미적용(그 규칙은 별도합산 범위 규정이다) |
 * | 별도합산 | 유 | (묻지 않음) | 건축물 부속토지 규칙(2% 강등·배율) — 종전 그대로 |
 *
 * 건축물이 있는 비과세·분리과세 선언이 근거를 고르지 않은 경우도 종전 그대로다(건축물 있음이 그 선언을 지지하는 사실이라, 근거 없이 접으면 기존 이력이 뒤집힌다).
 *
 * 순수 함수 — DB를 부르지 않는다. 화면(선택지 필터)·⑧·⑫·매퍼·엔진이 **같은 술어**를 쓴다(14지점 정합).
 */
import { NBL } from "../legal-codes";
import { judgeAppurtenantLandExcess } from "../appurtenant-land-excess";
import type { JudgmentStep, OtherLandUsage, PropertyTaxType } from "./types";

export const PROPERTY_TAX_BASIS_VALUES = [
  "statutory_exempt",
  "separate_taxation",
  "vacant_state",
  "demolished",
  "unknown",
] as const;

export type PropertyTaxBasis = (typeof PROPERTY_TAX_BASIS_VALUES)[number];

/** 선택지 라벨 — 법문 표현 그대로(강학상 용어 금지). 화면·결과 카드·고지가 이 표 하나를 읽는다. */
export const PROPERTY_TAX_BASIS_LABEL = {
  statutory_exempt: "재산세가 비과세되거나 면제되는 토지 (「지방세법」 제109조 · 관계 법률)",
  separate_taxation: "분리과세대상 토지 (「지방세법」 제106조제1항제3호 · 같은 법 시행령 제102조)",
  vacant_state: "공지상태 등 업무·경제활동에 활용되는 별도합산 토지 (「지방세법」 제106조제1항제2호나목 · 같은 법 시행령 제101조제3항)",
  demolished: "철거ㆍ멸실된 건축물 또는 주택의 부속토지 (「지방세법」 제106조제1항제2호다목 · 같은 법 시행령 제103조의2)",
  unknown: "모름 — 확인하지 못함",
} as const satisfies Record<PropertyTaxBasis, string>;

/** 근거별 법 인용(상수 — 문자열 리터럴 금지). `unknown`은 인용이 없다. */
export const PROPERTY_TAX_BASIS_LEGAL = {
  statutory_exempt: NBL.PTAX_BASIS_EXEMPT,
  separate_taxation: NBL.PTAX_BASIS_SEPARATE_TAXATION,
  vacant_state: NBL.PTAX_BASIS_VACANT_STATE,
  demolished: NBL.PTAX_BASIS_DEMOLISHED,
  unknown: undefined,
} as const satisfies Record<PropertyTaxBasis, string | undefined>;

type BasisFacts = Pick<OtherLandUsage, "propertyTaxType" | "hasBuilding" | "propertyTaxBasis" | "demolishedFloorArea">;

/**
 * 이 선언 + 건축물 유무에서 화면이 보여 줄 근거 선택지(「모름」 포함). 빈 배열 = 근거를 묻지 않는다.
 *
 *  · 종합합산: 묻지 않는다.
 *  · 별도합산 + 건축물 있음: 묻지 않는다 — 건축물 부속토지 규칙(2% 강등·배율)으로 판정한다.
 */
export function propertyTaxBasisOptions(declared: PropertyTaxType, hasBuilding: boolean): readonly PropertyTaxBasis[] {
  switch (declared) {
    case "exempt":
      return ["statutory_exempt", "unknown"];
    case "special_sum":
      return ["separate_taxation", "unknown"];
    case "separate":
      return hasBuilding ? [] : ["vacant_state", "demolished", "unknown"];
    case "comprehensive":
      return [];
  }
}

/** 근거 값이 이 선언 + 건축물 유무에서 «판정에 쓸 수 있는 실제 근거»인가(모름 제외). */
export function isUsableBasis(declared: PropertyTaxType, hasBuilding: boolean, basis: PropertyTaxBasis | undefined): basis is Exclude<PropertyTaxBasis, "unknown"> {
  return basis !== undefined && basis !== "unknown" && propertyTaxBasisOptions(declared, hasBuilding).includes(basis);
}

export type UnconfirmedReason = "unselected" | "unknown" | "incompatible" | "demolished_area_missing";

export type PropertyTaxBasisResolution =
  /** 근거 모델이 개입하지 않는다 — 종전 판정 그대로(종합합산 선언 · 건축물 부속토지 규칙 · 건축물 있는 비과세·분리과세의 근거 미선택). */
  | { kind: "not_applicable" }
  /** 근거가 확인된 선언 — 선언한 분류를 유지한다. `statutory_exempt`·`separate_taxation`·`vacant_state`. */
  | { kind: "accepted"; basis: Exclude<PropertyTaxBasis, "unknown" | "demolished"> }
  /** 철거·멸실 — 종전 바닥면적(㎡) × 영 §101② 적용배율 이내만 별도합산(사업용). */
  | { kind: "demolished"; floorArea: number }
  /** 건축물 없는 토지의 비종합합산 선언에 쓸 수 있는 근거가 없다 → 종합합산 + 확인 필요. */
  | { kind: "unconfirmed"; reason: UnconfirmedReason };

export function resolvePropertyTaxBasis(o: BasisFacts): PropertyTaxBasisResolution {
  const declared = o.propertyTaxType;
  if (declared === "comprehensive") return { kind: "not_applicable" };

  const basis = o.propertyTaxBasis;
  if (o.hasBuilding) {
    // 별도합산은 건축물 부속토지 규칙이 정한다. 비과세·분리과세는 호환되는 근거를 골랐을 때만 2%·배율 게이트를 벗는다.
    if (declared !== "separate" && isUsableBasis(declared, true, basis)) return { kind: "accepted", basis: basis as "statutory_exempt" | "separate_taxation" };
    return { kind: "not_applicable" };
  }

  if (basis === undefined) return { kind: "unconfirmed", reason: "unselected" };
  if (basis === "unknown") return { kind: "unconfirmed", reason: "unknown" };
  if (!isUsableBasis(declared, false, basis)) return { kind: "unconfirmed", reason: "incompatible" };
  if (basis === "demolished") {
    const area = o.demolishedFloorArea;
    return area !== undefined && area > 0
      ? { kind: "demolished", floorArea: area }
      : { kind: "unconfirmed", reason: "demolished_area_missing" };
  }
  return { kind: "accepted", basis: basis as "statutory_exempt" | "separate_taxation" | "vacant_state" };
}

/** 이 선택이 «종전 바닥면적» 칸을 요구하는가 — 화면 표시·⑧·⑫·매퍼 전송이 같은 술어를 쓴다. */
export function requiresDemolishedFloorArea(declared: PropertyTaxType, hasBuilding: boolean, basis: PropertyTaxBasis | undefined): boolean {
  return declared === "separate" && !hasBuilding && basis === "demolished";
}

/** 철거ㆍ멸실 근거의 입력 누락 — ⑧·⑫가 같은 술어·같은 문구를 쓴다(엔진은 같은 조건에서 종합합산 + 확인 필요로 접는다). */
export type DemolishedBasisIssuePart = "floorArea" | "zone";

export const DEMOLISHED_FLOOR_AREA_REQUIRED_MESSAGE =
  `철거ㆍ멸실 근거 — 철거 전 건축물의 바닥면적(㎡)을 입력하세요. ${NBL.PTAX_BASIS_DEMOLISHED}은 철거ㆍ멸실되기 전 건축물의 바닥면적에 용도지역별 적용배율을 곱하여 산정한 면적 범위의 토지를 부속토지로 봅니다.`;

export function demolishedZoneUnmappedMessage(zoneType: string): string {
  return `철거ㆍ멸실 근거 — 용도지역 "${zoneType}"은 「지방세법 시행령」 제101조 제2항 적용배율표에 대응 항목이 없어 면적 범위를 계산할 수 없습니다. 세분된 용도지역(전용주거·일반주거·준주거 등)을 선택하세요.`;
}

/** 문제가 없으면 null. 한 번에 첫 문제 하나만. */
export function demolishedBasisIssue(i: {
  declared: PropertyTaxType;
  hasBuilding: boolean;
  basis: PropertyTaxBasis | undefined;
  floorArea: number | undefined;
  zoneType: string;
  zoneMapped: boolean;
}): { part: DemolishedBasisIssuePart; message: string } | null {
  if (!requiresDemolishedFloorArea(i.declared, i.hasBuilding, i.basis)) return null;
  if (i.floorArea === undefined || !(i.floorArea > 0)) return { part: "floorArea", message: DEMOLISHED_FLOOR_AREA_REQUIRED_MESSAGE };
  if (!i.zoneMapped) return { part: "zone", message: demolishedZoneUnmappedMessage(i.zoneType) };
  return null;
}

// ─────────────────────────────────────────────────────────────
// echo (표시 전용 — 세액 불변)
// ─────────────────────────────────────────────────────────────

/** 엔진이 근거 모델을 적용했을 때만 싣는 echo. 결과 카드가 enum 원문 없이 한국어로 표시한다. */
export interface PropertyTaxBasisEcho {
  /** 사용자가 선언한 재산세 분류 */
  declared: PropertyTaxType;
  /** 사용자가 고른 근거(미선택이면 없음) */
  basis?: PropertyTaxBasis;
  /** accepted = 선언 존중(철거·멸실 포함) · unconfirmed = 종합합산으로 접음 */
  outcome: "accepted" | "unconfirmed";
  /** 판정에 실제로 쓴 분류 */
  effective: PropertyTaxType;
  unconfirmedReason?: UnconfirmedReason;
}

/** 해석 결과 → echo. 근거 모델이 개입하지 않았으면 `undefined`. */
export function buildPropertyTaxBasisEcho(o: BasisFacts, res: PropertyTaxBasisResolution): PropertyTaxBasisEcho | undefined {
  if (res.kind === "not_applicable") return undefined;
  const base = { declared: o.propertyTaxType, ...(o.propertyTaxBasis !== undefined ? { basis: o.propertyTaxBasis } : {}) };
  if (res.kind === "unconfirmed") return { ...base, outcome: "unconfirmed", effective: "comprehensive", unconfirmedReason: res.reason };
  return { ...base, outcome: "accepted", effective: o.propertyTaxType };
}

// ─────────────────────────────────────────────────────────────
// 확인 필요 고지 — 판정하지 않은 사실을 밝힌다(2026-10-04 「모름 = 혜택 불성립 + 확인 필요」)
// ─────────────────────────────────────────────────────────────

const UNCONFIRMED_REASON_TEXT: Record<UnconfirmedReason, string> = {
  unselected: "근거를 선택하지 않아",
  unknown: "근거를 「모름」으로 선택해",
  incompatible: "선택한 근거가 이 재산세 분류와 맞지 않아",
  demolished_area_missing: "철거ㆍ멸실 근거의 종전 건축물 바닥면적이 없어",
};

/** 건축물 없는 토지의 비종합합산 선언을 근거 없이 접은 고지 — 역버그 방지(근거 없는 별도합산·분리과세·비과세 인정 금지)를 사실대로 밝힌다. */
export function propertyTaxBasisUnconfirmedNotice(declaredLabel: string, reason: UnconfirmedReason): string {
  return (
    `건축물이 없는 토지에 재산세 분류(${declaredLabel})를 선택했지만 ${UNCONFIRMED_REASON_TEXT[reason]} 종합합산으로 보아 판정했습니다 ` +
    `(${NBL.OTHER_LAND_PROPERTY_TAX_EXCLUSION}은 근거가 확인된 비과세·면제·별도합산·분리과세 토지만 제외합니다). ` +
    `재산세 과세내역(고지서)에서 근거를 확인해 선택하면 그 근거로 판정합니다 — 확인 필요.`
  );
}

/** 근거를 사용자 선언으로 받아들였다는 고지 — 요건 충족 여부는 판정하지 않는다. */
export function propertyTaxBasisAcceptedNotice(basis: Exclude<PropertyTaxBasis, "unknown">): string {
  return (
    `재산세 분류 근거(${PROPERTY_TAX_BASIS_LABEL[basis]} — ${PROPERTY_TAX_BASIS_LEGAL[basis]})를 사용자가 확인해 선택한 사실로 보아 판정했습니다. ` +
    `그 토지가 해당 요건을 실제로 충족하는지는 판정하지 않았습니다 — 확인 필요.`
  );
}

/** 공지상태 별도합산(영 §101③) — 호별 면적 한도를 판정하지 않았다는 고지. */
export const NBL_PTAX_VACANT_STATE_LIMIT_NOTICE =
  `${NBL.BUILDING_SITE_SEPARATE_AGG_LIST}의 각 호는 면적 한도(최저보유차고면적기준의 1.5배 이내, 물품 등의 보관·관리에 사용된 최대면적의 1.2배 이내, 부설주차장 설치기준면적 이내 등)가 있는데 ` +
  `어느 호에 해당하는지와 그 한도는 판정하지 않고 토지 전체를 사업용으로 보았습니다 — 확인 필요.`;

/** 철거ㆍ멸실 별도합산(영 §103의2) — 한시 지위·허가 요건을 판정하지 않았다는 고지. */
export const NBL_PTAX_DEMOLISHED_STATUS_NOTICE =
  `${NBL.PTAX_BASIS_DEMOLISHED}은 철거ㆍ멸실된 날부터 1년이 지나지 않은 건축물(빈집정비사업 등으로 철거된 빈집은 3년)의 부속토지이고, 건축 용도 외의 다른 용도로 쓰는 부분과 ` +
  `허가·사용승인을 받지 않은 건축물의 부속토지는 제외됩니다. 철거일(한시 지위)과 이 요건들은 판정하지 않았습니다 — 확인 필요.`;

// ─────────────────────────────────────────────────────────────
// 엔진 보조 — `other-land.ts`가 부른다(그 파일의 800줄 정책으로 분리)
// ─────────────────────────────────────────────────────────────

/** Step 0 「나대지 간주 검증」 단계의 detail — 근거가 선언을 지킨 경우·근거 미확인으로 접은 경우·종전 문구. */
export function bareLandStepDetail(p: {
  keptBasis: Exclude<PropertyTaxBasis, "unknown"> | undefined;
  bareLand: boolean;
  hasBuilding: boolean;
  unconfirmed: boolean;
  declaredLabel: string;
}): string {
  if (p.keptBasis)
    return `재산세 분류 근거 확인(${PROPERTY_TAX_BASIS_LABEL[p.keptBasis]}) → 선택한 재산세 분류(${p.declaredLabel}) 유지 — 나대지 간주·2% 기준을 적용하지 않음`;
  if (!p.bareLand) return `건축물 부속토지 (선택한 재산세 분류 유지: ${p.declaredLabel})`;
  if (p.hasBuilding) return `건축물 시가표준액 < 토지 시가표준액 × 2% → 별도합산 제외(종합합산 취급)`;
  return p.unconfirmed
    ? `건축물 없는 토지 + 재산세 분류(${p.declaredLabel}) 근거 미확인 → 종합합산 취급`
    : `건축물 없는 토지(나대지) → 종합합산 취급`;
}

/** 근거 확인 시 판정에 남기는 고지(선언 존중 사실 · 호별 한도·한시 지위 미판정) + 근거 미확인 고지. */
export function propertyTaxBasisWarnings(
  res: PropertyTaxBasisResolution,
  keptBasis: Exclude<PropertyTaxBasis, "unknown"> | undefined,
  declaredLabel: string,
): string[] {
  const out: string[] = [];
  if (keptBasis) {
    out.push(propertyTaxBasisAcceptedNotice(keptBasis));
    if (keptBasis === "vacant_state") out.push(NBL_PTAX_VACANT_STATE_LIMIT_NOTICE);
    if (keptBasis === "demolished") out.push(NBL_PTAX_DEMOLISHED_STATUS_NOTICE);
  }
  if (res.kind === "unconfirmed") out.push(propertyTaxBasisUnconfirmedNotice(declaredLabel, res.reason));
  return out;
}

/**
 * 철거ㆍ멸실 근거 — 종전 건축물 바닥면적 × 영 §101② 적용배율 범위만 별도합산(영 §103의2①1호 후단). 건물 부수토지 배율(Step 0.6)과 같은 표·같은 헬퍼, 근거 조문·문구만 다르다.
 * 배율표에 없는 용도지역이면 `judgeAppurtenantLandExcess`가 던진다 — ⑧·⑫가 먼저 막는다(`demolishedBasisIssue`).
 */
export function judgeDemolishedSite(landArea: number, zoneType: string, floorArea: number) {
  const b = judgeAppurtenantLandExcess({ landArea, buildingFootprintArea: floorArea, zoneType, context: "기타토지(철거·멸실 부속토지)" });
  const step: JudgmentStep = {
    id: "other_demolished_multiplier",
    label: "Step 0.6 철거·멸실 부속토지 영 §103의2 배율",
    status: b.isWithinLimit ? "PASS" : "FAIL",
    detail: b.isWithinLimit
      ? `종전 바닥면적 ${floorArea}㎡ · ${b.multiplierDetail} → 허용 ${b.allowedLandArea}㎡ ≥ 부속토지 ${landArea}㎡ → 별도합산 유지`
      : `종전 바닥면적 ${floorArea}㎡ · ${b.multiplierDetail} → 허용 ${b.allowedLandArea}㎡ 초과분 ${b.nonBusinessArea}㎡는 별도합산 제외`,
    legalBasis: NBL.PTAX_BASIS_DEMOLISHED,
  };
  return { excess: b, step };
}
