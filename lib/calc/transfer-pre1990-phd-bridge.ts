/**
 * 겸용주택 PHD §164⑤ + 1990.8.30. 이전 취득 토지 환산 브리지 (단일 진실 헬퍼)
 *
 * 겸용주택은 assetKind="housing"이라 API의 hasPre1990(assetKind="land" 게이트) 경로를
 * 타지 않는다. 따라서 pre1990 환산 "취득시 토지 ㎡당 가액"을 PHD 입력(phdLandPricePerSqmAtAcq)
 * 으로 잇는 유일한 경로다.
 *
 * 과거에는 MixedUsePreHousingDisclosureSection의 useEffect → store(onChange) 미러링으로
 * 이 값을 주입했으나, 이는 "파생 계산 결과를 store에 저장"하는 정책 위반(무한 루프 위험)이다.
 * 본 헬퍼로 추출하여 컴포넌트 표시·API 변환·validate가 동일 함수로 파생값을 얻고
 * store에는 저장하지 않는다 (3-layer fallback).
 */

import {
  calculatePre1990LandValuation,
  type LandGradeInput,
} from "@/lib/tax-engine/pre-1990-land-valuation";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { round2 } from "@/lib/tax-engine/mixed-use-derived-areas";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const parseArea = (raw: string | undefined): number =>
  parseFloat((raw ?? "").replace(/,/g, "")) || 0;

/**
 * 겸용주택 주택부수토지 면적(effectiveLandArea) — 사용자 직접 지정값 우선, 없으면 자동 계산.
 * MixedUsePreHousingDisclosureSection와 동일 산식 (소수 2자리 반올림).
 */
export function derivePhdResidentialLandArea(asset: AssetForm): number {
  const residential = parseArea(asset.residentialFloorArea);
  const commercial = parseArea(asset.nonResidentialFloorArea);
  const totalLand = parseArea(asset.mixedUseTotalLandArea);
  const totalFloor = residential + commercial;
  const autoLandArea = round2(totalFloor > 0 ? totalLand * (residential / totalFloor) : 0);
  // three-state — 문자열 수준 분기(빈값 = 자동 / "0" = 적법한 0).
  // ⚠️ `||`·`??` 금지: parseArea는 항상 number를 반환하므로(`:22-23` `parseFloat(...) || 0`)
  //    `||`는 적법한 0을 자동값으로 덮어쓰고, `??`는 아예 미발동한다.
  const raw = (asset.phdResidentialLandArea ?? "").trim();
  return raw !== "" ? parseArea(raw) : autoLandArea;
}

/**
 * 1990.8.30. 이전 취득 토지 환산 — 취득시 토지 ㎡당 가액(원, 정수) 단일 진실.
 *
 * @returns 환산 ㎡당 가액 | null (pre1990 미활성·취득일 1990.8.30. 이후·입력 부족·면적 0 시)
 */
export function derivePre1990PhdLandPricePerSqmAtAcq(
  asset: AssetForm,
  transferDate: string,
): number | null {
  const acqDate = asset.landAcquisitionDate || asset.acquisitionDate;
  const isPre1990 = !!acqDate && acqDate < "1990-08-30";
  if (!isPre1990 || !asset.pre1990Enabled || !transferDate) return null;

  const area = derivePhdResidentialLandArea(asset);
  if (area <= 0) return null;

  const buildGrade = (raw: string | undefined): LandGradeInput | undefined => {
    if (!raw) return undefined;
    const n = parseFloat(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return asset.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
  };
  const gCur = buildGrade(asset.pre1990Grade_current);
  const gPrev = buildGrade(asset.pre1990Grade_prev);
  const gAcq = buildGrade(asset.pre1990Grade_atAcq);
  const p1990 = parseAmount(asset.pre1990PricePerSqm_1990 || "");
  if (!gCur || !gPrev || !gAcq || p1990 <= 0) return null;

  try {
    const r = calculatePre1990LandValuation({
      acquisitionDate: new Date(acqDate),
      transferDate: new Date(transferDate),
      areaSqm: area,
      pricePerSqm_1990: p1990,
      // 환산엔 미사용 — validateInput 통과용 동일값 주입 (컴포넌트 useMemo와 동일)
      pricePerSqm_atTransfer: p1990,
      grade_1990_0830: gCur,
      gradePrev_1990_0830: gPrev,
      gradeAtAcquisition: gAcq,
    });
    return r.pricePerSqmAtAcquisition;
  } catch {
    return null;
  }
}

/**
 * 위 파생값을 폼 문자열로 — display fallback prop(`value={... || asString}`)용.
 * @returns ㎡당 가액 문자열 | "" (파생 불가 시 — fallback 체인이 다음 항으로 진행)
 */
export function derivePre1990PhdLandPricePerSqmAtAcqString(
  asset: AssetForm,
  transferDate: string,
): string {
  const v = derivePre1990PhdLandPricePerSqmAtAcq(asset, transferDate);
  return v !== null && v > 0 ? String(v) : "";
}
