/**
 * 건물 기준시가 계산기 — 엔진 헬퍼 (Pure Engine)
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시(첨부 PDF). 설계: docs/02-design/features/building-standard-price.engine.design.md
 *
 * 시점별 ㎡당 금액·기계식주차 특수산식·조정율(상증)·산정기준율(2000이전 취득)·§164⑧ 동일연도 환산.
 * 정수곱 후 /1,000,000, 잔가율·조정율 곱, 1,000원 절사(truncateToThousand), 면적 곱 후 원 절사 순서.
 */
import { safeMultiply, safeMultiplyThenDivide, truncateToThousand, applyRateFraction } from "./tax-utils";
import { round2 } from "./area-utils";
import type {
  BuildingPointInput,
  BuildingStdPriceBreakdown,
  SpecialAdjustmentFeatures,
  LandParcel,
  ApartmentConversionInput,
  ApartmentConversionResult,
  BuildingCompositePart,
  AncillaryFacility,
  AncillaryFacilityKind,
  AncillaryApportionment,
  AncillaryApportionRow,
} from "./types/building-standard-price.types";
import {
  resolveNewBuildingBasePrice,
  resolveStructureIndex,
  resolveUsageIndex,
  resolveLocationIndex,
  calcResidualRate,
  calcResidualRateByDurable,
  remodelYearError,
  residualMinByDurable,
  durableForGroup,
  resolveResidualGroupForYear,
  resolveAcqBaseGroup,
  resolveAcqBaseRate,
  resolveAdjustmentRateByNo,
  resolveMechParkingFormula,
  ADJUSTMENT_RATE_BASE,
  ROOF_MATERIAL_RATE,
  INTELLIGENT_BUILDING_RATE,
  HOUSE_TYPE_RATE,
  COMMERCIAL_FLOOR_RATE,
  ANCILLARY_RATE,
  COMMERCIAL_WITH_ANCILLARY_RATE,
  REMODEL_COUNT_RATE,
  STRUCTURAL_SAFETY_RATE,
  normalUseRatioError,
  resolveMaxFloorsRate,
  resolveMaxFloorsNo,
  resolveGrossAreaRate,
  resolveGrossAreaNo,
  resolveWallessRate,
  resolveWallessNo,
  ADJUSTMENT_FEATURE_LABEL,
  describeLocationBucket,
  resolveUsageLabel,
  STRUCTURE_META,
} from "./data/building-standard-price";

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

/** 리모델링(대수선) 정보 — 상증만 잔가율 할증 */
export interface RemodelInfo {
  remodelYear?: number;
  isInheritanceGift?: boolean;
}

/**
 * 유효 잔가율. 일반(대수선 없음) = 신축연도 경과 잔가율표 그대로.
 *
 * 상증 리모델링(대수선) 시는 국세청 고시가 **명문 산식**을 준다
 * (국세청 고시 제2025-39호 제10조② 각주 — 2025.12.31. 고시, 2026-01-01 시행):
 *
 *     Rn(잔존가치율) = 1 − (1−R) × (n − 0.3ⓝ) / N
 *       R = 최종잔존가치율   N = 대상건물의 내용연수   n = 대상건물의 경과연수
 *       ⓝ = 리모델링시점의 경과연수.
 *       **다만 ⓝ은 항상 N보다 작거나 같고, n − 0.3ⓝ > N 이면 Rn = R**
 *
 * 🔴 종전 구현은 `max(1 − n·step, R) + step·ⓝ·0.3` 이었다 — 하한(R)을 **기저에 먼저** 걸고
 *    거기에 할증을 더해서, 고시가 R 로 잘라야 할 노후 구간이 크게 부풀었다.
 *    실측(2026 · 전수 19,012셀): 괴리 15,979건, 거의 전부 **과대** 방향, 최대 **10배**
 *    (IV그룹 신축1930·대수선1997 → 코드 1.0 vs 고시 0.1). 신축 1980년 이후로 좁혀도 42%가 어긋났다.
 *    잔가율은 기준시가에 선형으로 실리므로 그대로 세액 과대가 된다.
 *
 * ⚠️ 리모델링연도를 신축연도로 치환하지 않는다 — 고시 산식이 n(신축 기준 경과연수)을 그대로 쓴다.
 * ⚠️ 각주는 제10조② **1호(상증법 §61①2호)** 표에만 달려 있고 2호(소득세법 §99①1호나목) 표에는 없다
 *    ⇒ 양도세는 대수선 할증 미적용(아래 `isInheritanceGift` 게이트).
 *
 * 검증: 국세청 공식 계산사례 — 통나무조(I·N=50·R=0.10) 신축1996·대수선2008·상속2026
 *   → 1 − 0.9 × (30 − 0.3×12)/50 = 0.5248. 저장소 anchor 값과 정확히 일치한다.
 */
export function calcEffectiveResidualRate(
  group: "I" | "II" | "III" | "IV",
  builtYear: number,
  valuationYear: number,
  remodel?: RemodelInfo,
): number {
  const elapsed = valuationYear - builtYear;
  if (!remodel?.isInheritanceGift || remodel.remodelYear === undefined) {
    return calcResidualRate(group, elapsed, valuationYear);
  }

  // ⑧ validation 과 **같은 술어**를 같은 인자로 부른다 — UI 통과↔엔진 차단 모순 방지.
  const yearError = remodelYearError(remodel.remodelYear, builtYear, valuationYear);
  if (yearError) throw new BuildingStdPriceError(yearError);

  // N·R 은 평가연도로 결정된다(내용연수·최종잔존가치율 모두 시대별).
  const durableYears = durableForGroup(group, valuationYear);
  const finalResidual = residualMinByDurable(durableYears, valuationYear);

  const remodelElapsed = Math.min(
    Math.max(0, remodel.remodelYear - builtYear),
    durableYears, // ⓝ은 항상 N보다 작거나 같고
  );

  // ⚠️ **정수 산술로 계산한다.** `n − 0.3ⓝ` 는 0.1 단위라 float 로 두면 Rn×10000 이 정확히 `.5` 로
  //    끝나는 tie 가 자주 나오고(실측: 2026 격자에서 다수), 곱셈 결합 순서에 따라 반올림이 임의로
  //    갈린다 — 유리수로 검산하니 float 구현 두 가지가 서로 다른 케이스에서 각각 틀렸다.
  //    ⇒ 10배 스케일 정수로 옮겨 round-half-up 을 명시적으로 적용한다(잔가율표의 4자리 표기 규약).
  const scaledElapsed = 10 * elapsed - 3 * remodelElapsed; // = (n − 0.3ⓝ) × 10
  const scaledDurable = 10 * durableYears; // = N × 10
  // n − 0.3ⓝ > N 이면 Rn = R
  if (scaledElapsed > scaledDurable) return finalResidual;

  // Rn × 10000 = 10000 − (10000 − R×10000) × (n−0.3ⓝ)×10 ÷ (N×10)
  const oneMinusR = 10_000 - Math.round(finalResidual * 10_000);
  const numer = 10_000 * scaledDurable - oneMinusR * scaledElapsed;
  return Math.floor((2 * numer + scaledDurable) / (2 * scaledDurable)) / 10_000;
}

/**
 * ㎡당 금액(절사 전) → 1,000원 절사 후 면적 곱(원 미만 절사).
 * 절사+면적곱의 단일 출처 — calcPointBreakdown·§164⑧ 제2산식(신규고시 단가) 공용.
 */
export function stdPriceFromPerM2(
  rawPerM2: number,
  floorArea: number,
): { pricePerM2: number; standardPrice: number } {
  const pricePerM2 = truncateToThousand(rawPerM2);
  return { pricePerM2, standardPrice: floorAreaProduct(pricePerM2, floorArea) };
}

/**
 * ㎡당 금액 × 연면적 → 원 미만 절사. **정확 정수 곱**.
 *
 * `pricePerM2` 는 1,000원 절사를 거쳐 항상 1,000의 배수이므로, 연면적이 소수 6자리 이내면
 * 정확값은 언제나 정수다 ⇒ `Math.floor` 는 no-op 이어야 한다. 그런데 raw float 곱은
 * 정확값 바로 아래로 떨어져 1원을 깎았다(실측 격자 347,883셀 중 17,620건 = 5.06%,
 * 전건 1원 **과소** 한 방향). 면적을 micro-㎡ 정수로 올려 BigInt 로 곱한다.
 */
function floorAreaProduct(pricePerM2: number, floorArea: number): number {
  const areaMicro = BigInt(Math.round(floorArea * 1_000_000));
  return Number((BigInt(pricePerM2) * areaMicro) / 1_000_000n);
}

/**
 * `stdPriceFromPerM2`의 **정확 산술** 버전 — ㎡당 금액을 정수 분수(numer/denom)로 받는다.
 *
 * 1,000원 절사 직전까지 double 곱을 쓰지 않는다. `perM2Base × residualRate × adjustmentRate`처럼
 * double 을 이어 곱하면 정확값이 1,000의 배수인 조합에서 결과가 ulp 아래로 떨어져 절사가 한 칸
 * 내려가고, ㎡당 1,000원이 통째로 사라진다(면적만큼 배가, **항상 과소 한 방향**).
 * 저장소는 같은 실패모드를 `applyFairMarketRatio`·`applyRateFraction`에서 이미 두 번 정정했다.
 */
export function stdPriceFromExactPerM2(
  numer: bigint,
  denom: bigint,
  floorArea: number,
): { pricePerM2: number; standardPrice: number } {
  // floor(정확값 ÷ 1,000) × 1,000. BigInt 나눗셈은 0 방향 절사이고 피연산자는 모두 음이 아니다.
  const pricePerM2 = Number(numer / (denom * 1000n)) * 1000;
  return { pricePerM2, standardPrice: floorAreaProduct(pricePerM2, floorArea) };
}

/**
 * §A 공통 ㎡당 금액 + 건물 기준시가 (1시점, 일반 건물).
 * raw = basePrice × (structIdx/100) × (usageIdx/100) × (locIdx/100) × residual × adjRate
 * pricePerM2 = 1,000원 절사 → standardPrice = floor(pricePerM2 × floorArea)
 */
export function calcPointBreakdown(
  year: number,
  point: BuildingPointInput,
  floorArea: number,
  builtYear: number,
  adjustmentRate: number, // 1.0 = 미적용(양도). 상증은 calcSpecialAdjustmentRate 결과
  labelForError: string,
  remodel?: RemodelInfo, // 상증 리모델링 잔가율 할증
): BuildingStdPriceBreakdown {
  const basePrice = resolveNewBuildingBasePrice(year);
  if (basePrice === undefined) {
    throw new BuildingStdPriceError(`${labelForError}: 신축가격기준액 미수록 연도 ${year}`);
  }
  const structureIndex = resolveStructureIndex(year, point.structureKey);
  if (structureIndex === undefined) {
    throw new BuildingStdPriceError(
      `${labelForError}: ${year}년 구조지수표에 구조키 '${point.structureKey}' 없음`,
    );
  }
  const usageIndex = resolveUsageIndex(year, point.usageNo);
  if (usageIndex === undefined) {
    throw new BuildingStdPriceError(
      `${labelForError}: ${year}년 용도지수표에 용도번호 #${point.usageNo} 없음`,
    );
  }
  const locationIndex = resolveLocationIndex(year, point.landPricePerM2);
  if (locationIndex === undefined) {
    throw new BuildingStdPriceError(
      `${labelForError}: ${year}년 위치지수표 미수록(공시지가 ${point.landPricePerM2}원/㎡)`,
    );
  }

  // 구조→잔가율 그룹은 시대별 멤버십(3그룹/era-B/era-C). 내용연수·잔존율도 평가연도로 결정
  const residualGroup = resolveResidualGroupForYear(point.structureKey, year);
  const durableYears = durableForGroup(residualGroup, year);
  const residualRate = calcEffectiveResidualRate(residualGroup, builtYear, year, remodel);

  // 정수곱(부동소수 누적 회피) 후 /1,000,000 — 지수 3개가 각 ÷100
  const indexProduct = safeMultiply(
    safeMultiply(safeMultiply(basePrice, structureIndex), usageIndex),
    locationIndex,
  );
  // 잔가율·조정률도 정수 분수로 되돌려 절사 직전까지 정확 산술을 유지한다.
  //   잔가율   = N / 10^4   (residual-rate.ts:109 `Math.round(x * 10000) / 10000`)
  //   조정률   = N / 100^k  (calcSpecialAdjustmentRate — k = 적용 구분 수, 최대 7 ⇒ 분모 ≤ 10^14)
  // double 의 상대오차는 1e-16 수준이라 아래 스케일에서 Math.round 가 원래 정수 분자를 정확히 되살린다.
  const residualNumer = BigInt(Math.round(residualRate * 1e4));
  const adjustmentNumer = BigInt(Math.round(adjustmentRate * 1e14));
  const { pricePerM2, standardPrice } = stdPriceFromExactPerM2(
    BigInt(indexProduct) * residualNumer * adjustmentNumer,
    1_000_000n * 10_000n * 100_000_000_000_000n, // 지수 3개(10^6) × 잔가율(10^4) × 조정률(10^14)
    floorArea,
  );

  const usageLabel = resolveUsageLabel(year, point.usageNo);

  return {
    standardPrice,
    pricePerM2,
    basePrice,
    structureIndex,
    usageIndex,
    locationIndex,
    residualRate,
    residualGroup,
    durableYears,
    adjustmentRate: adjustmentRate === 1 ? undefined : adjustmentRate,
    floorArea, // 계산서 Ⅱ 연면적·Ⅲ 면적⑨ echo(단일 경로 누락 방지 — 복합은 호출부에서 부분 면적으로 덮어씀)
    appliedLandPriceYear: year,
    applyNotes: {
      structure: STRUCTURE_META[point.structureKey]?.label,
      usage: usageLabel ? `${point.usageNo}. ${usageLabel}` : `${point.usageNo}`,
      location: describeLocationBucket(year, point.landPricePerM2),
      residual: `${residualGroup}그룹, ${builtYear}년 신축, ${Math.max(0, year - builtYear)}년 경과`,
    },
  };
}

/**
 * 다필지 부속토지 면적가중평균 ㎡당 공시지가(고시 §6⑥). Σ(면적×지가) ÷ Σ면적.
 *
 * ⚠️ 종전 주석은 「정수 절사 없이 사용(구간 경계 영향 없음)」이라 단정했으나 **반증됐다.**
 *   면적은 소수 입력이라 float 합·곱을 그대로 나누면, 정확값이 정수(= 위치지수 구간 경계)인
 *   조합에서 몫이 경계 **아래**로 떨어져 `resolveLocationIndex`(`>=` 비교)가 구간을 한 칸 강등시킨다.
 *   지가가 **모든 필지에서 같아도** 발생한다 — 66.67㎡ + 12.34㎡ 둘 다 500,000원/㎡ 이면
 *   정확 평균이 당연히 500,000 인데 float 는 499999.99999999994 를 내고 지수가 98 → 94 로 떨어졌다
 *   (실측 2026-08-26: 4,096셀 격자 중 59건, 오차 방향은 강등 한 방향).
 *
 * ⇒ 면적을 micro-㎡ 정수로 올려 **정확 분수**를 만든다. 몫이 정수로 떨어지면 그 정수를 그대로 쓴다.
 *   정수로 떨어지지 않으면 참값이 두 정수 사이에 있어 정수 경계와 같아질 수 없으므로
 *   부동소수 몫으로 충분하다(참값과 경계의 간격 ≥ 1/Σ면적 ≫ 이 크기에서의 ulp).
 */
export function weightedAvgLandPrice(parcels: LandParcel[]): number {
  let areaMicro = 0n;
  let valueMicro = 0n;
  for (const p of parcels) {
    const a = BigInt(Math.round(p.areaM2 * 1_000_000));
    areaMicro += a;
    valueMicro += a * BigInt(Math.round(p.pricePerM2));
  }
  if (areaMicro <= 0n) throw new BuildingStdPriceError("다필지 부속토지: 면적 합계가 0입니다.");
  if (valueMicro % areaMicro === 0n) return Number(valueMicro / areaMicro);
  return Number(valueMicro) / Number(areaMicro);
}

/** 부속시설 종류 표시 순서·라벨(계산서 Ⅴ Ci~Hi). "other"="공용"(기존 단일 sharedFacilityArea 라벨 보존) */
const ANCILLARY_KIND_ORDER: AncillaryFacilityKind[] = [
  "parking",
  "machine",
  "boiler",
  "shelter",
  "rooftop",
  "other",
];
const ANCILLARY_KIND_LABEL: Record<AncillaryFacilityKind, string> = {
  parking: "주차장",
  machine: "기계실",
  boiler: "보일러실",
  shelter: "대피소",
  rooftop: "옥탑",
  other: "공용",
};

/**
 * 부분 조정률(상증 복합) — 수동(번호/%) 우선, 없으면 건물전체+부분 특성 자동 산정.
 * rate=calcSpecialAdjustmentRate·items=selectSpecialAdjustment 동일 selection 공유 → 드리프트 0.
 */
function resolvePartAdjustment(
  p: BuildingCompositePart,
  opts: CompositeYearOptions,
  year: number,
  structureKey: string,
  buildingTotalArea: number,
  label: string,
  buildingHasAnyFeatures: boolean,
): { adjRate: number; items?: { nos: number[]; rate: number }[] } {
  // (1) 수동 우선(완전 override — 단일 manual과 일관)
  if ((p.adjustmentNos?.length ?? 0) > 0 || p.adjustmentRate != null) {
    return adjustmentFromNos(p.adjustmentNos, p.adjustmentRate, label);
  }
  // (2) 특성 자동 — 건물 전체 ∪ 부분 (키셋 disjoint 가정 — 경계에서 필터됨)
  const merged: SpecialAdjustmentFeatures = { ...(opts.buildingWideFeatures ?? {}), ...(p.specialFeatures ?? {}) };
  // ⚠️ 조기반환 조건은 **건물 단위**여야 한다. II 연면적(9~13)은 merged 의 키가 아니라
  //    buildingTotalArea 에서 자동 도출되는 **건물 전체 항목**이라, 이 부분의 merged 가 비었다는
  //    이유로 건너뛰면 같은 건물의 부분끼리 II 적용 여부가 갈린다(실측: P1 1.32 / P2 미적용).
  //    🟡 「건물 어디에도 특성이 없을 때 II 를 적용할 것인가」는 별개 미결(F-09 축, 고시 본문 미확인)
  //       이므로 그 경우의 종전 동작(1.0)은 그대로 둔다.
  if (Object.keys(merged).length === 0 && !buildingHasAnyFeatures) {
    return { adjRate: 1.0, items: undefined };
  }
  const structureIndex = resolveStructureIndex(year, structureKey) ?? 0;
  const ctx: AdjustmentContext = {
    isResidential: !!opts.adjustmentCtx?.isResidential,
    isApartment: !!opts.adjustmentCtx?.isApartment,
    structureKey, // II 통나무조 제외·I 지붕 게이트(부분 구조지수<100일 때만)
  };
  const adjRate = calcSpecialAdjustmentRate(merged, structureIndex, buildingTotalArea, ctx);
  const sel = selectSpecialAdjustment(merged, structureIndex, buildingTotalArea, ctx);
  return {
    adjRate,
    items: sel.length > 0 ? sel.map((s) => ({ nos: s.nos, rate: s.rate })) : undefined,
  };
}

/** 조정율 번호(들) → {배율, echo items}. 번호 미수록 시 throw. */
function adjustmentFromNos(
  nos: number[] | undefined,
  ratePercent: number | undefined,
  label: string,
): { adjRate: number; items?: { nos: number[]; rate: number }[] } {
  if (nos && nos.length > 0) {
    const rates = nos.map((no) => {
      const r = resolveAdjustmentRateByNo(no);
      if (r === undefined) throw new BuildingStdPriceError(`${label}: 조정률 번호 ${no} 미수록(1~36)`);
      return r;
    });
    const numerator = rates.reduce((a, r) => a * r, 1);
    return {
      adjRate: numerator / 100 ** rates.length,
      items: nos.map((no, i) => ({ nos: [no], rate: rates[i] })),
    };
  }
  if (ratePercent != null) return { adjRate: ratePercent / 100 };
  return { adjRate: 1.0 };
}

/** 복합 계산 1시점 옵션 — usageNo 선택(양도 취득/양도 시점별)·조정률 적용(상증만)·부속 종류 */
export interface CompositeYearOptions {
  /** 부분 → 해당 시점 용도번호(양도 취득=acqUsageNo, 그 외=usageNo) */
  usageNoSelector: (p: BuildingCompositePart) => number;
  /** 조정률 적용 여부 — 상증 true / 양도 false(고시: 양도 조정률 미적용) */
  adjustmentEnabled: boolean;
  /** 부속시설 종류별 면적(정규화 후) */
  ancillary: AncillaryFacility[];
  remodel?: RemodelInfo;
  /** 오류 메시지 접두(예 "복합 부분"·"양도 복합 부분") */
  errorPrefix?: string;
  /** 건물 전체 특성(상증 복합 전용) — I 지붕·II·III. 부분 specialFeatures와 merge 후 자동 산정. */
  buildingWideFeatures?: SpecialAdjustmentFeatures;
  /** 조정율 II 통나무조 제외·주거용 판정 컨텍스트(상증 복합 자동 산정용) */
  adjustmentCtx?: { isResidential: boolean; isApartment: boolean };
}

export interface CompositeYearResult {
  breakdowns: BuildingStdPriceBreakdown[];
  total: number;
  apportionment?: AncillaryApportionment;
}

/**
 * 복합건물 1시점 평가(상증·양도 공용). 부분별 주용도 행 + 부속 종류별 행(Ⅳ) + Ⅴ 안분 echo.
 * breakdowns 순서 = [주용도1, 부속1(종류순), 주용도2, 부속2, ...] (인터리브 — 기존 단언 호환).
 * 부속 행은 주용도와 동일 구조·용도·위치·잔가, 조정률만 상이(공용 조정률). "other" 단일 종류 = 기존 동작.
 */
export function calcCompositeForYear(
  parts: BuildingCompositePart[],
  year: number,
  landPrice: number,
  builtYear: number,
  opts: CompositeYearOptions,
): CompositeYearResult {
  const prefix = opts.errorPrefix ?? "복합 부분";
  const totalMainArea = parts.reduce((s, p) => s + p.floorArea, 0);
  if (!(totalMainArea > 0)) throw new BuildingStdPriceError(`${prefix}: 면적 합계가 0입니다.`);
  // II 연면적용 건물 전체 연면적 = 부분 주용도 면적 합 + 부속 면적 합(적용요령 4 "지하·옥탑 포함 전체면적")
  const buildingTotalArea =
    totalMainArea + opts.ancillary.reduce((s, a) => s + (a.areaM2 > 0 ? a.areaM2 : 0), 0);
  // 건물 단위 특성 유무 — II 연면적(건물 전체 항목)을 부분마다 갈리지 않게 하는 게이트(F-10).
  const buildingHasAnyFeatures =
    Object.keys(opts.buildingWideFeatures ?? {}).length > 0 ||
    parts.some((p) => Object.keys(p.specialFeatures ?? {}).length > 0);

  // 부속 종류별 총면적 + 층 라벨 집계(층은 종류별 첫 입력값 — 계산서 Ⅳ "층별" 표기 전용)
  const totalByKind: Partial<Record<AncillaryFacilityKind, number>> = {};
  const floorByKind: Partial<Record<AncillaryFacilityKind, string>> = {};
  for (const a of opts.ancillary) {
    if (a.areaM2 > 0) {
      totalByKind[a.kind] = (totalByKind[a.kind] ?? 0) + a.areaM2;
      if (floorByKind[a.kind] === undefined && a.floorLabel?.trim()) floorByKind[a.kind] = a.floorLabel.trim();
    }
  }
  const activeKinds = ANCILLARY_KIND_ORDER.filter((k) => (totalByKind[k] ?? 0) > 0);
  const hasAncillary = activeKinds.length > 0;

  const breakdowns: BuildingStdPriceBreakdown[] = [];
  const apportionRows: AncillaryApportionRow[] = [];

  // 부속 수령 부분 사전 판별 — 마지막 수령 부분이 안분 잔액을 흡수한다(면적 안분 잔액 흡수 정책).
  // 수령 여부는 부분 속성만으로 결정되므로 루프 전 계산 가능.
  const receivesAt = (p: BuildingCompositePart) =>
    opts.adjustmentEnabled
      ? p.sharedAdjustmentRate != null || (p.sharedAdjustmentNos?.length ?? 0) > 0
      : true;
  const receivingIdx = parts.map((p, i) => (receivesAt(p) ? i : -1)).filter((i) => i >= 0);
  const lastReceivingIdx = receivingIdx[receivingIdx.length - 1];
  // 수령 부분들의 면적 합 — 일부만 수령하는 경로(상증)에서는 안분 대상이 전체가 아니므로
  // 잔액 흡수 기준도 "수령분 raw 합"이어야 한다(게이팅 의미 보존, 반올림 드리프트만 제거).
  const receivingMainArea = receivingIdx.reduce((s, i) => s + parts[i].floorArea, 0);
  const roundedSoFarByKind: Partial<Record<AncillaryFacilityKind, number>> = {};

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const label = p.label ?? `${prefix} ${i + 1}`;
    if (!p.structureKey) throw new BuildingStdPriceError(`${label}: 구조 미선택`);
    const usageNo = opts.usageNoSelector(p);
    if (usageNo === undefined || usageNo < 1) throw new BuildingStdPriceError(`${label}: 용도 미선택`);
    if (!(p.floorArea > 0)) throw new BuildingStdPriceError(`${label}: 면적(㎡) 필요`);
    const point: BuildingPointInput = { structureKey: p.structureKey, usageNo, landPricePerM2: landPrice };

    // 주용도 행 — 상증: 수동 우선, 없으면 건물전체+부분 특성 자동 산정 / 양도: 미적용
    const mainAdj = opts.adjustmentEnabled
      ? resolvePartAdjustment(p, opts, year, point.structureKey, buildingTotalArea, label, buildingHasAnyFeatures)
      : { adjRate: 1.0, items: undefined };
    const main = calcPointBreakdown(year, point, p.floorArea, builtYear, mainAdj.adjRate, label, opts.remodel);
    breakdowns.push({ ...main, label: p.label, floorArea: p.floorArea, adjustmentItems: mainAdj.items });

    // 부속 — 수령 여부(상증 = 공용 조정률 지정 부분만 / 양도 = 전 부분)
    const receives = receivesAt(p);
    if (hasAncillary && receives) {
      const sharedAdj = opts.adjustmentEnabled
        ? adjustmentFromNos(p.sharedAdjustmentNos, p.sharedAdjustmentRate, `${label} 공용`)
        : { adjRate: 1.0, items: undefined };
      const byKind: Partial<Record<AncillaryFacilityKind, number>> = {};
      for (const kind of activeKinds) {
        // 마지막 수령 부분은 잔액 흡수 — 앞 부분들의 반올림 드리프트를 흡수해
        // Σ안분면적 = round2(수령분 raw 합) 불변식을 보장(전 부분 수령 시 = 부속 총면적).
        const area =
          i === lastReceivingIdx
            ? round2(
                round2((totalByKind[kind]! * receivingMainArea) / totalMainArea) -
                  (roundedSoFarByKind[kind] ?? 0),
              )
            : round2((totalByKind[kind]! * p.floorArea) / totalMainArea);
        roundedSoFarByKind[kind] = round2((roundedSoFarByKind[kind] ?? 0) + area);
        byKind[kind] = area;
        const kLabel = `${label} ${ANCILLARY_KIND_LABEL[kind]}`;
        const bd = calcPointBreakdown(year, point, area, builtYear, sharedAdj.adjRate, kLabel, opts.remodel);
        breakdowns.push({
          ...bd,
          label: kind === "other" ? `${label} 공용` : kLabel,
          floorArea: area,
          ancillaryKind: kind,
          attributedTo: p.label,
          ancillaryFloorLabel: floorByKind[kind],
          adjustmentItems: sharedAdj.items,
        });
      }
      apportionRows.push({
        label: p.label,
        usageIndex: main.usageIndex ?? 0,
        ratio: p.floorArea / totalMainArea,
        areaSum: activeKinds.reduce((s, k) => s + (byKind[k] ?? 0), 0),
        byKind,
      });
    }
  }

  const total = breakdowns.reduce((s, b) => s + b.standardPrice, 0);
  const apportionment: AncillaryApportionment | undefined = hasAncillary
    ? { totalArea: activeKinds.reduce((s, k) => s + (totalByKind[k] ?? 0), 0), totalByKind, rows: apportionRows }
    : undefined;
  return { breakdowns, total, apportionment };
}

/**
 * 부속시설 입력 정규화 — sharedFacilityArea(단일 합계) ↔ ancillaryFacilities(종류별) 단일화.
 * 양쪽 동시 입력 = 검증 오류. sharedFacilityArea > 0 → [{kind:"other"}](하위호환·결과 불변).
 */
export function normalizeAncillary(
  ancillaryFacilities: AncillaryFacility[] | undefined,
  sharedFacilityArea: number | undefined,
): AncillaryFacility[] {
  const hasList = (ancillaryFacilities?.length ?? 0) > 0;
  const hasLegacy = (sharedFacilityArea ?? 0) > 0;
  if (hasList && hasLegacy) {
    throw new BuildingStdPriceError("부속시설: 종류별 면적과 단일 합계를 동시에 입력할 수 없습니다.");
  }
  if (hasList) return ancillaryFacilities!.filter((a) => a.areaM2 > 0);
  if (hasLegacy) return [{ kind: "other", areaM2: sharedFacilityArea! }];
  return [];
}

/**
 * §A' 기계식주차전용빌딩 특수산식. standardPrice = floor(단가 × 잔가율(내용연수그룹) × 주차대수).
 * 구조·용도·위치지수·연면적·조정율 미적용. 단가·내용연수는 연도 가변(D9).
 */
export function calcMechBreakdown(
  year: number,
  parkingLotCount: number,
  effBuiltYear: number,
): BuildingStdPriceBreakdown {
  const formula = resolveMechParkingFormula(year);
  if (formula === undefined) {
    throw new BuildingStdPriceError(`기계식주차: ${year}년 특수산식(단가·내용연수) 미수록`);
  }
  // 기계식주차 잔가율 = 내용연수 버킷(연도가변 20/30년)·평가연도 잔존율로 직접 계산(그룹 레터 비경유)
  const residualRate = calcResidualRateByDurable(formula.durableYears, year - effBuiltYear, year);
  // 잔가율은 `calcResidualRateByDurable` 이 소수 4자리로 양자화하므로 정수 분수로 되돌린다.
  // 이 경로에는 1,000원 절사가 없어 raw float 곱의 1원 손실이 그대로 최종값에 남았다
  // (실측 격자 17,790셀 중 377건 = 2.12%, 전건 1원 과소).
  const standardPrice = applyRateFraction(
    safeMultiply(formula.unitPrice, parkingLotCount),
    Math.round(residualRate * 10_000),
    10_000,
  );

  return {
    standardPrice,
    basePrice: formula.unitPrice,
    residualRate,
    parkingLotCount,
    mechDurableYears: formula.durableYears,
  };
}

/**
 * §B 산정기준율 경로 (취득연도 ≤ 2000, 소령 §164⑤ + 고시 §8, D6).
 * pricePerM2(2001년 지수표) × floorArea × 산정기준율. 산정기준율 그룹·신축/취득연도 정규화는 resolveAcqBaseRate 내부.
 */
export function calcAcqBaseBreakdown(
  acqYear: number,
  acq: BuildingPointInput,
  floorArea: number,
  builtYear: number,
): BuildingStdPriceBreakdown {
  // 취득당시 기준시가 = 2001년 지수표 ㎡당 금액(조정율 미적용)
  const base2001 = calcPointBreakdown(2001, acq, floorArea, builtYear, 1.0, "취득(2000이전)");

  const acqGroup = resolveAcqBaseGroup(acq.structureKey);
  if (acqGroup === undefined) {
    throw new BuildingStdPriceError(
      `취득(2000이전): 구조 '${acq.structureKey}'는 산정기준율표 미수록(신공법)`,
    );
  }
  const acqBaseRate = resolveAcqBaseRate(acqGroup, builtYear, acqYear);
  if (acqBaseRate === undefined) {
    throw new BuildingStdPriceError(
      `취득(2000이전): 산정기준율 미수록(그룹 ${acqGroup}·신축 ${builtYear}·취득 ${acqYear})`,
    );
  }
  // 산정기준율은 취득당시 기준시가에 적용 — pricePerM2(2001) × floorArea × acqBaseRate
  const pricePerM2 = base2001.pricePerM2 ?? 0;
  // 3항 raw float 곱이었다 — ㎡당(1,000의 배수) × 면적 × 산정기준율(소수 3자리).
  // 면적·기준율을 정수로 올려 한 번에 곱한다(중간 절사 없이 마지막에 원 미만 절사).
  const standardPrice = Number(
    (BigInt(pricePerM2) *
      BigInt(Math.round(floorArea * 1_000_000)) *
      BigInt(Math.round(acqBaseRate * 1000))) /
      (1_000_000n * 1000n),
  );

  return {
    ...base2001,
    standardPrice,
    acqBaseRate,
    appliedLandPriceYear: 2001,
  };
}

/**
 * 공동주택 고시 전 취득 → 취득당시 기준시가 환산.
 * Ⅰ = ① × (취득토지④ + 취득건물⑤) ÷ (최초고시토지② + 최초고시건물③).
 *   토지 = 공시지가 × 대지지분면적 / 건물 = 2001건물기준시가 × 산정기준율(해당 취득시점, I~III그룹).
 */
export function calcApartmentConversion(
  builtYear: number,
  acquisitionYear: number,
  ac: ApartmentConversionInput,
): ApartmentConversionResult {
  // 2001 건물기준시가(조정 미적용)
  const base2001 = calcPointBreakdown(
    2001,
    { structureKey: ac.structureKey, usageNo: ac.usageNo, landPricePerM2: ac.building2001LandPrice },
    ac.totalFloorArea,
    builtYear,
    1.0,
    "공동주택 2001 건물기준시가",
  ).standardPrice;

  const acqGroup = resolveAcqBaseGroup(ac.structureKey);
  if (acqGroup === undefined) {
    throw new BuildingStdPriceError(`공동주택 환산: 구조 '${ac.structureKey}'는 산정기준율표 미수록`);
  }
  const firstNoticeAcqBaseRate = resolveAcqBaseRate(acqGroup, builtYear, ac.firstNoticeYear);
  const acquisitionAcqBaseRate = resolveAcqBaseRate(acqGroup, builtYear, acquisitionYear);
  if (firstNoticeAcqBaseRate === undefined || acquisitionAcqBaseRate === undefined) {
    throw new BuildingStdPriceError("공동주택 환산: 산정기준율 미수록(취득연도 2000 초과 또는 셀 부재)");
  }

  const firstNoticeLandValue = Math.floor(ac.firstNoticeLandPrice * ac.landAreaM2);
  const acqLandValue = Math.floor(ac.acquisitionLandPrice * ac.landAreaM2);
  const firstNoticeBuildingValue = Math.floor(base2001 * firstNoticeAcqBaseRate);
  const acqBuildingValue = Math.floor(base2001 * acquisitionAcqBaseRate);

  const numerator = acqLandValue + acqBuildingValue;
  const denominator = firstNoticeLandValue + firstNoticeBuildingValue;
  if (denominator <= 0) throw new BuildingStdPriceError("공동주택 환산: 최초고시 토지+건물 합계가 0");
  const convertedAcquisitionPrice = safeMultiplyThenDivide(ac.firstNoticeApartmentPrice, numerator, denominator);

  return {
    convertedAcquisitionPrice,
    base2001BuildingPrice: base2001,
    firstNoticeLandValue,
    firstNoticeBuildingValue,
    acqLandValue,
    acqBuildingValue,
    firstNoticeAcqBaseRate,
    acquisitionAcqBaseRate,
  };
}


/**
 * 조정율 (상증 전용, 7구분). 미해당 구분 = 100(무영향). 중복 구분은 누적 곱(적용요령 2).
 * 부동소수 누적 회피: 적용 지수(정수)를 분자에 곱하고 분모 100^k로 마지막에 환산.
 * @returns 1.0 기준 배율(미적용 = 1.0)
 */
/** 조정율 선택 항목 — 적용 구분별 선택된 번호(들)와 지수(정수, 100 기준) */
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
