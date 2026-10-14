/**
 * ④⑤⑧ — 같은 날 취득 주택의 배율 초과분 분리 경로에서 **취득 당시 계약서 토지·건물 구분금액**을 받는가 (#17-6).
 *
 * 판정·연혁은 엔진 leaf(`lib/tax-engine/housing-excess-acq-contract.ts` · `data/sec100-3-split-era.ts`)가 정본이고, 여기는 `AssetForm` → 사실 변환뿐이다.
 * ⑤ 칸 노출 · ④ 전송 · ⑧ 필수/합계 검증이 **같은 술어**(`housingExcessNeedsAcqContract`)를 읽는다 — 칸 없는 요구도, 칸은 있는데 전송 안 함도 없다.
 *
 * 범위 — 취득 쪽만이다(양도가액의 계약서 구분은 이 경로가 아니다). 열리는 조건:
 *  · 배율 초과분 분리 경로(`housingExcessNeedsLandSplit`)
 *  · 취득가액이 실지거래가액 — 환산·감정·매매사례는 §100②(실지거래가액 산정)가 아니라 받지 않는다
 *  · 별개취득 토글이 꺼져 있다 — 켜져 있으면 분리 섹션의 파트 취득가액 칸이 같은 일을 하므로 이중 입력을 막는다(`housingExcessNeedsCapexSplit`과 같은 규약)
 * 미입력(둘 다 빈칸)이면 아무것도 보내지 않아 종전 기준시가 안분과 세액·판정이 같다(옛 저장분도 키 없음 = 비움).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { sec100_3Era, type Sec100_3Era } from "@/lib/tax-engine/data/sec100-3-split-era";
import { housingExcessNeedsLandSplit } from "./housing-excess-split";
import { deriveLegacyPartAcqMode } from "./transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 계약서 구분금액 칸(토지·건물 2칸 + 단서 토글)이 화면에 열리는가. */
export function housingExcessNeedsAcqContract(asset: AssetForm, transferDate: string | undefined): boolean {
  return (
    // 계약서 구분금액은 «매매계약서»의 가액 구분(§100②·③)이다 — 상속·증여는 상증 평가액 하나라 받지 않는다(#17-5 ②).
    asset.acquisitionCause === "purchase" &&
    deriveLegacyPartAcqMode(asset) === "actual" &&
    asset.hasSeperateLandAcquisitionDate !== true &&
    housingExcessNeedsLandSplit(asset, transferDate)
  );
}

/** 양도일로 본 §100③ 적용 구간 — 칸 노출·고지 문구가 엔진 연혁(`sec100_3Era`)을 그대로 따른다. */
export function housingExcessAcqContractEra(transferDate: string | undefined): Sec100_3Era {
  return sec100_3Era(transferDate);
}

/** 영 §166⑧1호 단서 질문(「다른 법령에서 정하는 바에 따라 가액을 구분」)이 열리는가 — 양도일 2025.1.1. 이후만(그 전은 단서 자체가 없다). */
export function housingExcessAcqContractAsksProviso(asset: AssetForm, transferDate: string | undefined): boolean {
  return housingExcessNeedsAcqContract(asset, transferDate) && sec100_3Era(transferDate) === "body_and_proviso";
}

/** 입력 상태 — 둘 다 빈칸이면 «입력 안 함»(종전 경로), 하나라도 채웠으면 «입력함»(둘 다 필수). 합계 대상 총액은 취득가액 칸. */
export function housingExcessAcqContractParts(asset: AssetForm): {
  entered: boolean;
  land: number | null;
  building: number | null;
  total: number;
} {
  const rawLand = (asset.acqContractLandPrice ?? "").trim();
  const rawBuilding = (asset.acqContractBuildingPrice ?? "").trim();
  return {
    entered: rawLand !== "" || rawBuilding !== "",
    land: rawLand === "" ? null : parseAmount(rawLand),
    building: rawBuilding === "" ? null : parseAmount(rawBuilding),
    total: parseAmount(asset.fixedAcquisitionPrice ?? ""),
  };
}

/**
 * ④ 전송값 — 칸이 열려 있고 둘 다 채워졌을 때만(⑧이 한쪽만·합 불일치를 선차단한다). 단서 신고는 단서 질문이 열린 양도일에서만 싣는다
 * (그 전 양도분에 stale 토글이 남아 있어도 엔진에 닿지 않는다 — 엔진도 같은 연혁으로 한 번 더 무시).
 */
export function housingExcessAcqContractPayload(
  asset: AssetForm,
  transferDate: string | undefined,
): { acqContractLandPrice: number; acqContractBuildingPrice: number; acqContractOtherLaw?: true } | null {
  if (!housingExcessNeedsAcqContract(asset, transferDate)) return null;
  const { entered, land, building } = housingExcessAcqContractParts(asset);
  if (!entered || land === null || building === null) return null;
  return {
    acqContractLandPrice: land,
    acqContractBuildingPrice: building,
    ...(housingExcessAcqContractAsksProviso(asset, transferDate) && asset.acqContractOtherLaw === true ? { acqContractOtherLaw: true as const } : {}),
  };
}
