/**
 * 승계조합원 완공 APT — 「취득 당시 기준시가」 §164⑦ 계산 도우미(`PhdConvertedPriceFill`)에 넘길 **읽기용 사본**
 * (계획서 `docs/02-design/features/redev-successor-apt-phd-assist.plan.md` Q-1~3 a).
 *
 * 도우미는 일반 주택용이다 — 노출 게이트(`phdFillAssistVisible`)가 `assetKind === "housing"`만 받고, 적용 가능·같은 조정기간·§164⑤ 준용 판정과
 * 공시가격 조회 기준일이 `acquisitionDate`를 읽는다. 승계 APT의 `acquisitionDate`는 **입주권 취득일**이지만 신축주택의 취득일은 사용승인일이다
 * (소득세법 시행령 §162①4호) — 그래서 사본은 취득일을 준공일로 바꾸고, 재개발 완공 APT는 공동주택이라 주택 유형을 공동주택으로 고정한다(Q-3 a).
 * 추계 플래그는 끈다 — 일반 주택은 환산이면 §164⑦ 3-시점 토글이 대신하지만 재개발 APT에는 그 토글이 없어 환산에서도 도우미를 연다(Q-2 a).
 *
 * ⚠️ 사본은 **읽기 전용**이다 — 도우미가 쓰는 patch(`phd*` 칸 · `acquisitionArea`)는 호출부가 원래 자산에 그대로 쓴다. 사본에서 바꾼 키
 *    (`assetKind`·`acquisitionDate`·추계 플래그 등)는 도우미가 patch로 내보내지 않는다. 보조 칸은 ④가 싣지 않고 ⑧이 요구하지 않는다
 *    (`phdFlagEffective` — 재개발 APT는 PHD 토글 범위 밖). 엔진에는 사용자가 확인한 「취득시 기준시가」 한 칸만 간다.
 * 매매 승계(추계 가능)가 아니거나 준공일이 비면 `undefined` — 도우미를 그리지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isRedevSuccessorAptEstimable } from "./redev-acquisition-price-source";

export function successorAptPhdAssistView(asset: AssetForm): AssetForm | undefined {
  if (!isRedevSuccessorAptEstimable(asset) || !asset.redevCompletionDate) return undefined;
  return {
    ...asset,
    assetKind: "housing",
    acquisitionDate: asset.redevCompletionDate,
    landAcquisitionDate: "",
    hasSeperateLandAcquisitionDate: false,
    isMixedUseHouse: false,
    phdHousingType: "apartment",
    useEstimatedAcquisition: false,
    isAppraisalAcquisition: false,
    isSalesCaseAcquisition: false,
  };
}
