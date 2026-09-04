/**
 * 건물 기준시가 — **특수부설·특수조정** 판정.
 *
 * `building-standard-price-helpers.ts`에서 분리했다(800줄 정책). 방향은 한쪽뿐이다 —
 * 그 파일이 여기를 **쓰고**, 여기는 그 파일을 참조하지 않는다(leaf).
 *
 * 종전 import 경로 호환을 위해 `building-standard-price-helpers.ts`가 재export한다.
 */
import {
  ADJUSTMENT_RATE_BASE,
  ROOF_MATERIAL_RATE,
  INTELLIGENT_BUILDING_RATE,
  HOUSE_TYPE_RATE,
  COMMERCIAL_FLOOR_RATE,
  ANCILLARY_RATE,
  COMMERCIAL_WITH_ANCILLARY_RATE,
  REMODEL_COUNT_RATE,
  STRUCTURAL_SAFETY_RATE,
  ADJUSTMENT_FEATURE_LABEL,
  resolveMaxFloorsNo,
  resolveMaxFloorsRate,
  resolveGrossAreaNo,
  resolveGrossAreaRate,
  resolveWallessRate,
  resolveWallessNo,
  normalUseRatioError,
} from "./data/building-standard-price";
import type { SpecialAdjustmentFeatures } from "./types/building-standard-price.types";

/** 엔진 내부 오류(검증 실패) — orchestrator가 warnings로 변환하거나 throw */
export class BuildingStdPriceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildingStdPriceError";
  }
}

/** 주거 판정(조정율 II) 컨텍스트 */
export interface AdjustmentContext {
  isResidential: boolean;
  isApartment: boolean;
  /** 구조키 — II 최고층수 "통나무조(solid_wood) 적용 제외"(원본 비고) 판정용. 미지정 시 제외 안 함 */
  structureKey?: string;
}

interface AdjustmentSelection {
  nos: number[];
  rate: number;
}

/**
 * 조정율 구분별 선택(단일 출처). I~VII 각 구분의 적용 규칙대로 선택 항목을 산출.
 * calcSpecialAdjustmentRate(지수곱)·describeSpecialAdjustment(라벨) 양쪽이 이 결과를 공유 → 드리프트 방지.
 */
export function selectSpecialAdjustment(
  features: SpecialAdjustmentFeatures,
  structureIndex: number,
  floorArea: number,
  ctx: AdjustmentContext,
): AdjustmentSelection[] {
  const sel: AdjustmentSelection[] = [];
  const pickMax = (c: { no: number; rate: number }[]) => c.reduce((a, b) => (b.rate > a.rate ? b : a));
  const pickMin = (c: { no: number; rate: number }[]) => c.reduce((a, b) => (b.rate < a.rate ? b : a));

  // I 지붕재료: 구조지수 < 100 일 때만
  if (structureIndex < 100 && features.roofMaterial !== undefined) {
    sel.push({ nos: [features.roofMaterial], rate: ROOF_MATERIAL_RATE[features.roofMaterial] });
  }

  // II 최고층수/연면적/지능형: 해당 항목 중 가장 높은 지수 1개
  // 최고층수: 통나무조(solid_wood) 적용 제외(원본 II 비고) · 주거용은 아파트만 적용
  const groupII: { no: number; rate: number }[] = [];
  if (
    features.maxFloors !== undefined &&
    (!ctx.isResidential || ctx.isApartment) &&
    ctx.structureKey !== "solid_wood"
  ) {
    groupII.push({ no: resolveMaxFloorsNo(features.maxFloors), rate: resolveMaxFloorsRate(features.maxFloors) });
  }
  if (!ctx.isResidential && floorArea > 0) {
    groupII.push({ no: resolveGrossAreaNo(floorArea), rate: resolveGrossAreaRate(floorArea) });
  }
  if (features.intelligentBuildingGrade !== undefined) {
    groupII.push({
      no: features.intelligentBuildingGrade === "1-2" ? 15 : 14,
      rate: INTELLIGENT_BUILDING_RATE[features.intelligentBuildingGrade],
    });
  }
  if (groupII.length > 0) {
    const w = pickMax(groupII);
    sel.push({ nos: [w.no], rate: w.rate });
  }

  // III 단독/공동주택: 해당 지수 1개
  if (features.houseTypeTier !== undefined) {
    sel.push({ nos: [features.houseTypeTier], rate: HOUSE_TYPE_RATE[features.houseTypeTier] });
  }

  // IV 상가·부속: 가장 낮은 지수 1개. 20~23 + 24·25 동시 해당이면 60
  const hasCommercialFloor = features.commercialFloor !== undefined;
  const hasAncillary = features.ancillaryParking !== undefined;
  if (hasCommercialFloor && hasAncillary) {
    sel.push({ nos: [features.commercialFloor!, features.ancillaryParking!], rate: COMMERCIAL_WITH_ANCILLARY_RATE });
  } else {
    const groupIV: { no: number; rate: number }[] = [];
    if (features.commercialFloor !== undefined)
      groupIV.push({ no: features.commercialFloor, rate: COMMERCIAL_FLOOR_RATE[features.commercialFloor] });
    if (features.ancillaryParking !== undefined)
      groupIV.push({ no: features.ancillaryParking, rate: ANCILLARY_RATE[features.ancillaryParking] });
    if (groupIV.length > 0) {
      const w = pickMin(groupIV);
      sel.push({ nos: [w.no], rate: w.rate });
    }
  }

  // V 개축(일부): 해당 지수 1개
  if (features.remodelCount !== undefined) {
    sel.push({ nos: [features.remodelCount], rate: REMODEL_COUNT_RATE[features.remodelCount] });
  }

  // VI 무벽건물: 무벽면적비율 구간 판정(미적용 시 100)
  if (features.wallessRatio !== undefined) {
    const r = resolveWallessRate(features.wallessRatio);
    const no = resolveWallessNo(features.wallessRatio);
    if (r !== ADJUSTMENT_RATE_BASE && no !== undefined) sel.push({ nos: [no], rate: r });
  }

  // VII 구조진단/철거: 가장 낮은 지수 1개. 37=정상사용면적비율(0~1 → ×100%)
  const groupVII: { no: number; rate: number }[] = [];
  if (features.structuralSafety !== undefined)
    groupVII.push({ no: features.structuralSafety, rate: STRUCTURAL_SAFETY_RATE[features.structuralSafety] });
  if (features.normalUseRatio !== undefined) {
    // ⑧ validation 과 **같은 술어**를 같은 인자로 부른다 — UI 통과↔엔진 차단 모순 방지.
    const ratioError = normalUseRatioError(features.normalUseRatio);
    if (ratioError) throw new BuildingStdPriceError(ratioError);
    // 고시 제11조 구분 VII 번호 37 — 지수 칸이 숫자가 아니라 「정상 사용 비율」이다:
    // "정상적으로 사용되는 면적비율을 **조정률로 적용**한다" ⇒ 비율 그 자체가 조정률이며
    // 정수 퍼센트로 양자화할 근거가 없다. 종전 `Math.round(ratio * 100)` 은 0.125 → 0.13(+4%),
    // 0.3333 → 0.33(−0.99%) 처럼 양방향 오차를 냈고, 0.005 미만은 0이 되어 기준시가가 통째로 0이 됐다.
    groupVII.push({ no: 37, rate: features.normalUseRatio * 100 });
  }
  if (groupVII.length > 0) {
    const w = pickMin(groupVII);
    sel.push({ nos: [w.no], rate: w.rate });
  }

  return sel;
}

export function calcSpecialAdjustmentRate(
  features: SpecialAdjustmentFeatures,
  structureIndex: number,
  floorArea: number,
  ctx: AdjustmentContext,
): number {
  const sel = selectSpecialAdjustment(features, structureIndex, floorArea, ctx);
  if (sel.length === 0) return 1.0;
  // 분자=정수 지수곱, 분모=10,000^k (부동소수 누적 회피).
  // ⚠️ 지수를 **100배 스케일 정수**로 올려 곱한다 — VII-37(정상사용면적비율)은 고시상 정수 퍼센트가
  //    아니라 비율 그 자체라 소수 지수(예 85.5·33.33)가 들어온다. 종전처럼 `rate` 를 그대로 곱하면
  //    0.3333 이 0.33329999999999996 로 새어 나간다. BigInt 로 정확히 곱한 뒤 1e12 스케일로 환원한다.
  const numerator = sel.reduce((acc, s) => acc * BigInt(Math.round(s.rate * 100)), 1n);
  const denom = 10_000n ** BigInt(sel.length);
  const SCALE = 1_000_000_000_000n; // 1e12 — 조정률은 소수 12자리면 충분하다
  return Number((numerator * SCALE) / denom) / 1e12;
}

/**
 * 조정율 적용 특성 설명(인쇄·적용요령용). 예 "1. 기와·징크 등 지붕 & 4. 5층 이하".
 * calcSpecialAdjustmentRate와 동일 선택(selectSpecialAdjustment) 기반 → 산식과 항상 일치.
 * 적용 특성 없으면 undefined.
 */
export function describeSpecialAdjustment(
  features: SpecialAdjustmentFeatures,
  structureIndex: number,
  floorArea: number,
  ctx: AdjustmentContext,
): string | undefined {
  const sel = selectSpecialAdjustment(features, structureIndex, floorArea, ctx);
  if (sel.length === 0) return undefined;
  return sel
    .map((s) => s.nos.map((no) => `${no}. ${ADJUSTMENT_FEATURE_LABEL[no] ?? ""}`).join(" & "))
    .join(" & ");
}
