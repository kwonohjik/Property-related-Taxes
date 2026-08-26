/**
 * 건물 기준시가 모달의 **적용 버튼 가시성 판정** — 순수 leaf.
 *
 * 종전에는 이 조건이 `BuildingStdPriceModalButton.tsx` 의 JSX 에 네 번 흩어져 있었고,
 * 단건 결과(`acquisition`/`transfer`)에만 `!bothMode && applyTimePoint !== …` 가드가 있었다.
 * 복합구조 결과(`acquisitionComposite`/`transferComposite`)에는 그 가드가 없어서:
 *   ① `bothMode` 호출부에서 개별 버튼이 노출되고, `onApply` 가 취득 필드에 고정 배선된 곳에서는
 *      「양도시 적용」이 **양도값을 취득 칸에** 써 넣었다.
 *   ② `onApply` 미배선 호출부에서는 클릭이 **침묵 no-op** 이면서 다이얼로그만 닫혀
 *      「적용됐다」고 오인하게 했다.
 * 또 통합 버튼 판정이 단건만 봐서 복합에서는 **구조적으로 뜨지 않았다**(그래서 개별 버튼만 남았다).
 */

export interface ApplyButtonFacts {
  /** 단건 취득 결과의 기준시가 */
  acquisition?: number;
  /** 단건 양도 결과의 기준시가 */
  transfer?: number;
  /** 복합 취득 합계(≤2000 은 산정기준율 환산 후 값) */
  acquisitionComposite?: number;
  /** 복합 양도 합계 */
  transferComposite?: number;
  /** 상증 1시점 복합 합계 */
  compositeTotal?: number;
  /** `onApplyBoth` 가 배선된 호출부(취득·양도를 한 번에 적용) */
  bothMode: boolean;
  /** 호출부가 고정한 단일 시점 — 지정 시 반대 시점 버튼은 뜨지 않는다 */
  applyTimePoint?: "acquisition" | "transfer";
}

export interface ApplyButtonPlan {
  /** 통합 버튼에 실을 취득 금액 (없으면 undefined) */
  acqTotal?: number;
  /** 통합 버튼에 실을 양도 금액 (없으면 undefined) */
  transferTotal?: number;
  showBoth: boolean;
  showAcquisitionOnly: boolean;
  showTransferOnly: boolean;
  showAcquisitionCompositeOnly: boolean;
  showTransferCompositeOnly: boolean;
  showCompositeTotal: boolean;
  /** 상증 1시점 복합 합계 금액 */
  compositeTotalValue?: number;
  /** bothMode 인데 두 시점이 아직 안 모였다는 안내 */
  showBothPending: boolean;
}

export function planApplyButtons(f: ApplyButtonFacts): ApplyButtonPlan {
  const acqTotal = f.acquisition ?? f.acquisitionComposite;
  const transferTotal = f.transfer ?? f.transferComposite;
  const showBoth = f.bothMode && acqTotal !== undefined && transferTotal !== undefined;
  // 단건·복합 모두 **같은 축**의 가드를 쓴다 — bothMode 이거나 반대 시점이면 개별 버튼을 내지 않는다.
  const singleAllowed = (side: "acquisition" | "transfer") =>
    !f.bothMode && f.applyTimePoint !== (side === "acquisition" ? "transfer" : "acquisition");
  const anyResult =
    acqTotal !== undefined || transferTotal !== undefined || f.compositeTotal !== undefined;
  return {
    acqTotal,
    transferTotal,
    showBoth,
    showAcquisitionOnly: f.acquisition !== undefined && singleAllowed("acquisition"),
    showTransferOnly: f.transfer !== undefined && singleAllowed("transfer"),
    showAcquisitionCompositeOnly:
      f.acquisitionComposite !== undefined && singleAllowed("acquisition"),
    showTransferCompositeOnly: f.transferComposite !== undefined && singleAllowed("transfer"),
    showCompositeTotal: f.compositeTotal !== undefined,
    compositeTotalValue: f.compositeTotal,
    showBothPending: f.bothMode && anyResult && !showBoth,
  };
}
