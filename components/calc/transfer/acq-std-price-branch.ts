/**
 * «취득시 기준시가» 영역(`CompanionAcqStdPriceSection`)의 분기 판정 — **단일 소스**.
 *
 * 감정가액·매매사례가액 + 토지·건물 분리(같은 취득일)에서는 `CompanionAcqAmountSection`(감정 칸) 또는 `SalesCaseSection`과
 * `CompanionAcqStdPriceSection`이 함께 렌더돼 `[data-field="standardPriceAtAcq"]` 칸이 둘 떴다(같은 `standardPriceAtAcq`).
 * 이 파일의 판정을 StdPriceSection(자기 분기)과 부모(AmountSection에 «이 칸은 저쪽이 맡는다» 전달)가 **같이** 쓴다 —
 * 부모가 분기 조건을 다시 쓰면 한쪽 조건만 바뀔 때 칸이 0개가 되거나 2개가 된다.
 */
import { phdFlagEffective } from "@/lib/calc/phd-toggle-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export type AcqStdPriceBranch =
  /** 환산도 분리도 아니다 — 이 영역은 아무것도 그리지 않는다 */
  | "hidden"
  /** 겸용주택 — 겸용 분리계산 영역에서 입력(길잡이 문구) */
  | "mixed"
  /** 상업용건물·오피스텔 — 환산 영역에서 입력(길잡이 문구) */
  | "commercial"
  /** 일반건물 — 일반건물 환산 영역에서 입력(길잡이 문구) */
  | "general"
  /** §164⑦ PHD 3-시점 입력으로 자동 도출(길잡이 문구) */
  | "phd"
  /** 취득시/양도시 기준시가 입력 블록 */
  | "standard";

export interface AcqStdPriceBranchArgs {
  useEstimatedAcquisition: boolean;
  /** 주택·건물 + 토지·건물 분리 토글 ON */
  isSplit: boolean;
  isMixedUse: boolean;
  assetKind?: string;
  isGeneralBuilding: boolean;
  asset?: AssetForm;
}

export function acqStdPriceBranch(a: AcqStdPriceBranchArgs): AcqStdPriceBranch {
  if (!(a.useEstimatedAcquisition || a.isSplit)) return "hidden";
  if (a.isMixedUse) return "mixed";
  if (a.assetKind === "commercial_building") return "commercial";
  if (a.isGeneralBuilding) return "general";
  if (a.asset && phdFlagEffective(a.asset)) return "phd";
  return "standard";
}

/**
 * 「취득시 기준시가」 **입력 칸**(`standardPriceAtAcq`)을 `CompanionAcqStdPriceSection`이 그리는가.
 * `acqStdPriceRequired`는 파트 카드와 같은 술어(`requiresAcqStdPricePart`)를 부모가 1회 계산한 값이다.
 */
export function acqStdFieldInStdSection(
  a: AcqStdPriceBranchArgs & { acqStdPriceRequired: boolean; isSeparateAcq: boolean },
): boolean {
  return acqStdPriceBranch(a) === "standard" && a.acqStdPriceRequired && !a.isSeparateAcq;
}
