/**
 * CompanionAcqPurchaseBlock props 타입 정의
 * 800줄 정책에 따라 메인 파일에서 분리.
 */

import type { Pre1990FormSlice } from "@/components/calc/inputs/Pre1990LandValuationInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export interface BlockProps {
  acquisitionDate: string;
  onAcquisitionDateChange: (v: string) => void;
  /**
   * Round 9 (2026-05-06): 매매계약일 (분양/매매계약 + 계약금 납부 기준일).
   * 신축·미분양·임대 감면 13개 조문(§99·§99의3·§98 시리즈·§97의2·§97의5·§99의2)의 시한 판정 1차 기준.
   * 주택 자산만 의미 있음. 미입력 시 acquisitionDate fallback.
   */
  assetContractDate?: string;
  onAssetContractDateChange?: (v: string) => void;
  useEstimatedAcquisition: boolean;
  onUseEstimatedChange: (v: boolean) => void;
  /** 감정가액 모드 — 자산-수준 (Step1↔Step3 통합 후) */
  isAppraisalAcquisition?: boolean;
  onIsAppraisalAcquisitionChange?: (v: boolean) => void;
  /**
   * 일반건물 증축 여부 — "쌍방+일방 (증축 있음)" 4번째 라디오 옵션 전용.
   * assetKind === "general_building" 시만 사용. 이 값이 true이면
   * useEstimatedAcquisition=true·isAppraisalAcquisition=false 와 함께
   * "원취득 실가 + 증축분 환산" 모드를 표시한다.
   */
  gbHasExtension?: boolean;
  onGbHasExtensionChange?: (v: boolean) => void;
  /**
   * 증축분 취득방식 — "actual" | "estimated" | "" (미선택).
   * assetKind === "general_building" + gbHasExtension === true 시만 사용.
   */
  gbExtensionAcquisitionMode?: string;
  onGbExtensionAcquisitionModeChange?: (v: string) => void;
  fixedAcquisitionPrice: string;
  onFixedAcquisitionPriceChange: (v: string) => void;
  /** 환산취득가 분자: 취득시 기준시가 총액 (원) */
  standardPriceAtAcq: string;
  onStandardPriceAtAcqChange: (v: string) => void;
  /** 환산취득가 분모: 양도시 기준시가 총액 (원) */
  standardPriceAtTransfer: string;
  onStandardPriceAtTransferChange: (v: string) => void;
  /** 양도일 (양도시 기준시가 조회 연도 계산용) */
  transferDate?: string;
  /** 공시가격 조회용 지번 주소 */
  jibun?: string;
  /** 공동주택 기준시가 조회용 동(예: "201동") — 세대 식별 */
  dong?: string;
  /** 공동주택 기준시가 조회용 호(예: "3204") — 세대 식별 */
  ho?: string;
  /** 자산 종류 — 공시가격 API 선택 및 토지 면적 계산용 */
  assetKind?: string;
  /**
   * 자산 전체 축 A(「취득가액 산정 방식」 라디오 + 취득가액 금액)를 숨긴다.
   *
   * 일반건물이 **파트별 입력을 자기 2카드에서 직접** 받을 때 쓴다(2026-08-05 P4).
   * `isSeparateAcq`(주택·건물 경로)와 같은 자리를 가리지만, 일반건물은 `isSplitable`에
   * 포함하지 않는다 — 포함시키면 공용 `CompanionAcqDateSection`의 토글·2열 날짜가 함께 켜져
   * 일반건물의 자체 토글·건물 카드 날짜와 **중복**된다.
   */
  hideAssetAcqAxis?: boolean;
  /** 취득 당시 면적 (㎡) — 취득시 기준시가 자동계산, Pre1990 환산용 */
  acquisitionArea?: string;
  onAcquisitionAreaChange?: (v: string) => void;
  /** 취득시 기준시가 면적 입력 라벨 커스텀 (증환지 당초분 = "종전토지 면적") */
  acqAreaLabel?: string;
  /** 양도 당시 면적 (㎡) — 양도시 기준시가 자동계산용 */
  transferArea?: string;
  onTransferAreaChange?: (v: string) => void;
  /** 양도시 기준시가 면적 입력 라벨 커스텀 (증환지 당초분 = "권리면적") */
  transferAreaLabel?: string;
  /** 1990 이전 취득 토지 환산 슬라이스 */
  pre1990Form?: Pre1990FormSlice;
  onPre1990Change?: (patch: Partial<Pre1990FormSlice>) => void;
  /** 취득시 기준시가 ㎡당 단가 (외부 저장 — 없으면 내부 state fallback) */
  standardPricePerSqmAtAcq?: string;
  onStandardPricePerSqmAtAcqChange?: (v: string) => void;
  /** 양도시 기준시가 ㎡당 단가 (외부 저장 — 없으면 내부 state fallback) */
  standardPricePerSqmAtTransfer?: string;
  onStandardPricePerSqmAtTransferChange?: (v: string) => void;
  /** 신축·증축 자산-수준 4필드 (Step1↔Step3 통합 후) */
  isSelfBuilt?: boolean;
  onIsSelfBuiltChange?: (v: boolean) => void;
  buildingType?: "new" | "extension" | "";
  onBuildingTypeChange?: (v: "new" | "extension" | "") => void;
  constructionDate?: string;
  onConstructionDateChange?: (v: string) => void;
  extensionFloorArea?: string;
  onExtensionFloorAreaChange?: (v: string) => void;
  /** 증축부분 취득시 기준시가 총액 (원). buildingType==="extension" 시 필수. Phase 2. */
  extensionStdPriceAtAcquisition?: string;
  onExtensionStdPriceAtAcquisitionChange?: (v: string) => void;
  /** 토지/건물 취득일 분리 (housing·building 공통) */
  hasSeperateLandAcquisitionDate?: boolean;
  onHasSeperateLandAcquisitionDateChange?: (v: boolean) => void;
  landAcquisitionDate?: string;
  onLandAcquisitionDateChange?: (v: string) => void;
  landTransferPrice?: string;
  onLandTransferPriceChange?: (v: string) => void;
  buildingTransferPrice?: string;
  onBuildingTransferPriceChange?: (v: string) => void;
  landAcquisitionPrice?: string;
  onLandAcquisitionPriceChange?: (v: string) => void;
  buildingAcquisitionPrice?: string;
  onBuildingAcquisitionPriceChange?: (v: string) => void;
  landDirectExpenses?: string;
  onLandDirectExpensesChange?: (v: string) => void;
  buildingDirectExpenses?: string;
  onBuildingDirectExpensesChange?: (v: string) => void;
  landStandardPriceAtTransfer?: string;
  onLandStandardPriceAtTransferChange?: (v: string) => void;
  buildingStandardPriceAtTransfer?: string;
  onBuildingStandardPriceAtTransferChange?: (v: string) => void;
  /**
   * 개별주택가격 미공시 취득 §164⑤ 3-시점 모드.
   * 환산취득가 + hasSeperateLandAcquisitionDate === true 일 때만 표시.
   * asset·onAssetChange와 함께 제공해야 한다.
   */
  asset?: AssetForm;
  onAssetChange?: (patch: Partial<AssetForm>) => void;
  /** 토지·건물 소유자 분리 — 본인 소유 부분 (소령 §166⑥, §168②) */
  selfOwns?: "both" | "building_only" | "land_only";
  onSelfOwnsChange?: (v: "both" | "building_only" | "land_only") => void;
  /** 매매사례가액 추계(§176의2③1호) 모드 토글 */
  isSalesCaseAcquisition?: boolean;
  onIsSalesCaseAcquisitionChange?: (v: boolean) => void;
  /** 매매사례가액 (원) — isSalesCaseAcquisition=true 시 엔진으로 전달 */
  similarSalesValue?: string;
  onSimilarSalesValueChange?: (v: string) => void;
  /** 매매사례가액 출처 — "rtms_auto" 시 배지 표시 */
  similarSalesSource?: "rtms_auto" | undefined;
  onSimilarSalesSourceChange?: (v: "rtms_auto" | undefined) => void;
  /** 취득 주소 시군구코드 — RTMS 자동조회 버튼 활성화 조건 */
  acquisitionSigunguCode?: string;
}

/** assetKind → StandardPriceInput propertyKind 변환 */
export function toPropertyKind(
  assetKind?: string,
): "land" | "building_non_residential" | "house_individual" | "house_apart" {
  if (assetKind === "housing") return "house_individual";
  if (assetKind === "land") return "land";
  return "building_non_residential";
}
