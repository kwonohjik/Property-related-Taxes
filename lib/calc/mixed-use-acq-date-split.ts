/**
 * 겸용주택 — 「건물 취득일 기준 ㎡당 공시지가」 UI 어댑터 (Phase B0).
 *
 * ⑤ 노출 · ④ 전송 · ⑧ 필수가 **같은 함수**를 호출한다(3중 패턴). 판정 규칙은 엔진 leaf
 * `isBuildingDayLandPriceRequired`(`lib/tax-engine/mixed-use-acq-date.ts`) 한 곳에만 있고,
 * 이 파일은 폼 문자열 → leaf 인자 변환만 한다 — 날짜·방향·PHD 규칙을 여기 다시 쓰지 않는다(dual-truth 금지).
 *
 * 인자의 원천은 ④ `buildMixedUsePayload`가 엔진에 보내는 값과 같다:
 *   · 건물 취득일 = `acquisitionDate`, 토지 취득일 = `landAcquisitionDate || acquisitionDate`
 *   · 용도변경 방향 = `hasPartialUsageChange && partialChangeDirection`일 때만
 *   · 취득시 개별주택가격 = `parseAmount(mixedAcqHousingPrice)`
 *   · (B1) PHD = `mixedUsePhdEffective`, 파트 모델의 필수 여부 = `mixedPartAcqNeeds` AND
 *
 * 값 해소에 **폴백이 없다** — 토지 취득일 값(`mixedAcqLandPricePerSqm`)·PHD·1990 환산으로 대체하지 않는다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  areMixedAcqDatesSeparate,
  isBuildingDayLandPriceRequired,
} from "@/lib/tax-engine/mixed-use-acq-date";
import { mixedPartAcqNeedsOfForm, mixedUsePhdEffective } from "./mixed-use-part-acq-split";

type DateFields = Pick<AssetForm, "acquisitionDate" | "landAcquisitionDate">;

/** ④가 엔진에 보내는 두 취득일이 (날짜 단위로) 다른가. 토지일 미입력이면 건물일로 폴백(④와 동일). */
export function isMixedAcqDatesSeparate(a: DateFields): boolean {
  return areMixedAcqDatesSeparate(a.landAcquisitionDate || a.acquisitionDate, a.acquisitionDate);
}

/** ⑤ 노출 · ④ 전송 · ⑧ 필수의 **같은 술어**. 겸용 자산이 아니면 거짓. */
export function needsMixedAcqLandPriceAtBuildingAcq(a: AssetForm): boolean {
  if (!(a.assetKind === "housing" && a.isMixedUseHouse)) return false;
  return isBuildingDayLandPriceRequired({
    landDate: a.landAcquisitionDate || a.acquisitionDate,
    buildingDate: a.acquisitionDate,
    // B1 — 파트 모델이면 PHD는 「환산 파트가 있을 때만」 의미가 있다(실효값). 총액 모델은 저장값 그대로(불변).
    usePhd: mixedUsePhdEffective(a),
    partialDirection:
      a.hasPartialUsageChange && a.partialChangeDirection ? a.partialChangeDirection : undefined,
    housingPrice: parseAmount(a.mixedAcqHousingPrice) || undefined,
    // B1 — 파트 모델이면 `mixedPartAcqNeeds`를 AND로 받는다(양쪽 실가 + 잔존 H가 쓰이지 않는 값을 요구하지 않는다). 총액 모델은 undefined.
    partAcqNeeds: mixedPartAcqNeedsOfForm(a),
  });
}

/**
 * ④·⑧이 쓰는 값. `parseAmount`는 null/undefined를 0으로 돌려주므로 stale sessionStorage(필드 없음)에도 안전하다.
 * 폴백 없음 — 술어 참인데 비어 있으면 0 그대로(⑧이 막고, ⑫·엔진도 막는다).
 */
export function mixedAcqLandPricePerSqmAtBuildingAcq(a: Pick<AssetForm, "mixedAcqLandPricePerSqmAtBuildingAcq">): number {
  return parseAmount(a.mixedAcqLandPricePerSqmAtBuildingAcq);
}
