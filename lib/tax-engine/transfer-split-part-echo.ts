/**
 * 토지·건물 분리(split) 파트의 **취득원인·기산일 echo** — 순수 leaf (D1-3, 표시 전용 · 세액 불변).
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d1.engine.design.md §2 (계획서 §10.2 T-1이 우선)
 *
 * 산식을 새로 쓰지 않는다 — 세율 판정이 쓰는 함수를 **그대로** 부른다(판정 단일 소스):
 *   · 토지 파트: `resolveLandRateBasis`(법정 기산일·규칙) + `resolveAppurtenantLandRateBasisDate`(주택 `max`)
 *     = `computeSplitPartTax`가 토지 `SplitRatePart.basisDate`로 쓰는 값
 *   · 건물 파트: `resolveRateBasis`(자산 단위) = `calcTax`가 건물 세율 입력(`...input`)에서 재적용하는 값
 */
import { resolveRateBasis } from "./transfer-rate-holding-basis";
import { coerceOptionalDate } from "./tax-utils";
import {
  resolveAppurtenantLandRateBasisDate,
  resolveLandRateBasis,
} from "./transfer-tax-appurtenant-land";
import type { SplitPartResult } from "./types/transfer-split-gain.types";
import type { TransferTaxInput } from "./types/transfer.types";

type CauseEcho = Pick<
  SplitPartResult,
  "acquisitionCause" | "acquisitionDate" | "rateBasisAcquisitionDate" | "rateBasisRule" | "appliedRateBasisDate"
>;

const day = (d: Date) => d.toISOString().slice(0, 10);

/** 원인이 미지정이면 키 자체를 내지 않는다(「매매」로 지어내지 않는다). */
const causeOf = (c: TransferTaxInput["acquisitionCause"]) => (c ? { acquisitionCause: c } : {});

/**
 * ④ payload를 Route 변환 없이 엔진에 바로 넣는 호출부(테스트)도 있다 — 날짜 문자열도 받는다
 * (`calcSplitGain`의 `dayKey`와 같은 규약). 판정 함수는 Date를 받으므로 여기서만 정규화한다.
 */
function withDates(input: TransferTaxInput): TransferTaxInput {
  const c = (d: Date | undefined) => coerceOptionalDate(d as Date | string | undefined);
  return {
    ...input,
    acquisitionDate: c(input.acquisitionDate) ?? input.acquisitionDate,
    landAcquisitionDate: c(input.landAcquisitionDate),
    decedentAcquisitionDate: c(input.decedentAcquisitionDate),
    donorAcquisitionDate: c(input.donorAcquisitionDate),
    landDecedentAcquisitionDate: c(input.landDecedentAcquisitionDate),
    landDonorAcquisitionDate: c(input.landDonorAcquisitionDate),
  };
}

/** `calcSplitGain`의 두 반환 지점(일반·PHD)이 파트에 spread한다. 토지 취득일이 없으면 호출되지 않는다. */
export function buildSplitPartCauseEcho(raw: TransferTaxInput): { land: CauseEcho; building: CauseEcho } {
  const input = withDates(raw);
  const building = resolveRateBasis({
    acquisitionCause: input.acquisitionCause,
    acquisitionDate: input.acquisitionDate,
    decedentAcquisitionDate: input.decedentAcquisitionDate,
    donorAcquisitionDate: input.donorAcquisitionDate,
  });
  const land = resolveLandRateBasis(input);
  const applied = resolveAppurtenantLandRateBasisDate(input);
  return {
    land: {
      ...causeOf(input.landAcquisitionCause ?? input.acquisitionCause),
      ...(input.landAcquisitionDate ? { acquisitionDate: day(input.landAcquisitionDate) } : {}),
      ...(land ? { rateBasisAcquisitionDate: day(land.date), rateBasisRule: land.rule } : {}),
      ...(applied ? { appliedRateBasisDate: day(applied) } : {}),
    },
    building: {
      ...causeOf(input.acquisitionCause),
      acquisitionDate: day(input.acquisitionDate),
      rateBasisAcquisitionDate: day(building.date),
      rateBasisRule: building.rule,
      appliedRateBasisDate: day(building.date),
    },
  };
}
