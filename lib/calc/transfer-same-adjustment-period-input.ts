/**
 * ④⑬ §164⑧ 동일조정기간 환산 입력 조립 — 단건·다건·컴패니언 **단일 소스**.
 *
 * 세 경로가 각자 조립하면 기본값(`sapFormula`)이 어긋나 한쪽만 다르게 동작한다.
 * 여기 한 곳에서만 만든다.
 *
 * 게이트는 `sapEnabled`다. OFF면 `undefined`를 반환해 body에서 키 자체가 빠지고,
 * 엔진 STEP 0.47은 no-op이 된다(회귀 0).
 *
 * ⚠️ 여기서 쓰는 fallback은 ⑧ validation과 **같아야** 한다 —
 *    조정월수 미입력 → 엔진 기본 12(전송하지 않음). validate가 이걸 차단하면 모순이 된다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { calcPriorStdPriceSubstitute } from "@/lib/tax-engine/same-adjustment-period-std-price";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { SameAdjustmentPeriodTransferInput } from "@/lib/tax-engine/types/transfer.types";

/**
 * 「전기의 기준시가」 — ④⑤⑧⑥ **단일 소스**.
 *
 * §80③2호·3호를 고르면 값을 **읽는 시점에** 엔진 leaf로 산정한다. 종전에는 피연산자
 * onChange에서 계산해 `sapPriorStdPrice`에 적어 넣었는데, 3호의 피연산자 중 하나인
 * 「취득당시의 기준시가」는 **다른 섹션에서 편집**되므로 그쪽을 고치면 적어 둔 값이
 * 조용히 stale해졌다(⑤는 그 변경을 모르고, ⑧은 통과시키고, ④는 낡은 값을 엔진에 보냈다).
 *
 * ⇒ **저장하지 않는다.** 파생 근거에서는 `sapPriorStdPrice`를 읽지도 쓰지도 않으므로
 *   근거를 되돌리면 직접 입력값이 그대로 살아 있다.
 */
export function resolveSapPriorStdPrice(
  asset: Pick<
    AssetForm,
    | "sapPriorBasis"
    | "sapPriorStdPrice"
    | "sapFirstNoticeStdPrice"
    | "sapNoticeBaseRate"
    | "sapPriorLandBuildingSum"
    | "sapAcqLandBuildingSum"
    | "standardPriceAtAcq"
  >,
): number {
  const basis = asset.sapPriorBasis ?? "direct";
  if (basis === "first_notice_rate") {
    const rate = parseFloat((asset.sapNoticeBaseRate ?? "").replace(/,/g, ""));
    return (
      calcPriorStdPriceSubstitute({
        firstNoticeStdPrice: parseAmount(asset.sapFirstNoticeStdPrice ?? ""),
        // 화면은 %, leaf는 배율(1.0 = 100%)
        noticeBaseRate: Number.isFinite(rate) ? rate / 100 : undefined,
      })?.value ?? 0
    );
  }
  if (basis === "ratio_conversion") {
    return (
      calcPriorStdPriceSubstitute({
        standardPriceAtAcquisition: parseAmount(asset.standardPriceAtAcq ?? ""),
        priorLandBuildingSum: parseAmount(asset.sapPriorLandBuildingSum ?? ""),
        acquisitionLandBuildingSum: parseAmount(asset.sapAcqLandBuildingSum ?? ""),
      })?.value ?? 0
    );
  }
  return parseAmount(asset.sapPriorStdPrice ?? "");
}

export function buildSameAdjustmentPeriodInput(
  asset: Pick<
    AssetForm,
    | "sapEnabled"
    | "sapFormula"
    | "sapPriorStdPrice"
    | "sapNewStdPrice"
    | "sapAdjustMonths"
    | "sapPriorBasis"
    | "sapPriceSource"
    | "sapFirstNoticeStdPrice"
    | "sapNoticeBaseRate"
    | "sapPriorLandBuildingSum"
    | "sapAcqLandBuildingSum"
    | "standardPriceAtAcq"
  > | undefined,
): SameAdjustmentPeriodTransferInput | undefined {
  if (!asset?.sapEnabled) return undefined;

  const formula = asset.sapFormula ?? "prev";
  const prior = resolveSapPriorStdPrice(asset);
  const next = parseAmount(asset.sapNewStdPrice ?? "");
  // ⚠️ 콤마 제거 — `CurrencyInput`이 1,000 이상을 "1,200"으로 포맷한다.
  //    `Number("1,200")`은 NaN이라 값이 **조용히 미전송**되는데, ⑧ validation은
  //    콤마를 벗기고 통과시켜 「UI 통과 ↔ 엔진 미도달」 불일치가 된다(3중 패턴).
  const months = Number(String(asset.sapAdjustMonths ?? "").replace(/,/g, ""));

  // 산식이 요구하는 상대 기준시가가 비어 있으면 보내지 않는다 — 엔진이 no-op으로
  // 떨어질 뿐이지만, 반쪽 객체를 보내면 결과 화면이 "적용됨"으로 오해될 수 있다.
  const counterpart = formula === "prev" ? prior : next;
  if (!(counterpart > 0)) return undefined;

  return {
    formula,
    ...(formula === "prev" ? { priorStandardPrice: prior } : { newStandardPrice: next }),
    ...(Number.isFinite(months) && months > 0 && { adjustmentMonths: months }),
    ...(asset.sapPriorBasis && { priorBasis: asset.sapPriorBasis }),
    ...(asset.sapPriceSource && { priceSource: asset.sapPriceSource }),
  };
}
