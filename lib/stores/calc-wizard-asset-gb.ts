/**
 * GeneralBuildingFormSlice — 일반건물(general_building) + 겸용주택(commercial_building) 폼 필드.
 * calc-wizard-asset.ts 800줄 정책 준수를 위해 분리 (Phase 2, 2026-06-22).
 * AssetForm이 이 slice를 extend한다.
 */

export interface GeneralBuildingFormSlice {
  // ── 일반건물(토지+건물 일괄) 환산취득가 (사례 31, 영 §176의2②, §163⑥) ──
  // useEstimatedAcquisition=true + assetKind="general_building" 시 GeneralBuildingBlock 노출.
  /** 양도시 토지 공시지가 (원/㎡). LandPriceLookupField. 안분 분모: ×gbLandArea. */
  gbTransferLandPricePerSqm: string;
  /** 양도시 건물기준시가 총액 (원). 국세청 기준시가 조회. */
  gbTransferBuildingValue: string;
  /** 취득시 토지 공시지가 (원/㎡). LandPriceLookupField. 환산 분자: ×gbLandArea. */
  gbAcqLandPricePerSqm: string;
  /** 취득시 건물기준시가 총액 (원). 환산 분자 + 개산공제 기준액. */
  gbAcqBuildingValue: string;
  /** 토지 부수면적 (㎡). 안분·환산·개산공제·NBL 판정 공통 사용. */
  gbLandArea: string;
  /** 건물 연면적(㎡). 자산 식별·표시용. */
  gbBuildingArea: string;
  /** 건물 수평투영면적(㎡). 건축물대장 건축면적. §168의12 NBL 배율 기준. */
  gbBuildingFootprintArea: string;

  // ── 일반건물 비사업용토지 판정 (§104의3·§168의12) ──
  /** 용도지역. §168의12 배율 결정 기준 (필수 — 미입력 시 계산 차단). */
  gbZoneType: string;
  /** 수도권(서울·경기·인천) 소재 여부. 3배 vs 5배 배율 분기. */
  gbIsMetropolitan: boolean;
  /** 무허가건축물 여부. true 시 전체 비사업용 의제 (§168의11①1호). */
  gbIsUnregistered: boolean;

  /**
   * 건물 취득원인 (일반건물 전용, 사례 32 이후).
   * - "purchase": 매매
   * - "inheritance": 상속
   * - "gift": 증여
   * - "newConstruction": 신축(자가건축) — §114조의2 가산세 판정 기준
   * undefined: 미선택 (⑧ validate에서 차단)
   */
  gbBuildingAcquisitionCause?: "purchase" | "inheritance" | "gift" | "newConstruction";
  /**
   * 건물 취득일 (YYYY-MM-DD). 소득세법 시행령 §162① 4호 기준:
   * 사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날.
   * gbBuildingAcquisitionCause === "newConstruction" 시 필수. 미입력 시 validation에서 차단.
   * 사례 31 호환(매매 등): gbBuildingAcquisitionCause !== "newConstruction" 시 취득일 = acquisitionDate 동일 가정.
   */
  gbBuildingAcquisitionDate: string;

  /**
   * 토지·건물(원건물) 일괄 취득 시 발생한 필요경비 (원).
   * 사례 33 일괄 모드 전용 — `useEstimatedAcquisition === false && gbHasExtension === true`일 때 의미 가짐.
   * 중개수수료·취득세·인지대 등 §97① 가목 부대비용. 미입력 시 0원 처리.
   * 엔진은 토지·건물1 안분(취득시 기준시가 비율)에 사용 — `actualBundledExpenses`로 매핑.
   * 이 필드 신설 전(legacy)에는 `transferExpense`(양도비) 필드가 임시 매핑되었으나 의미 충돌로 분리.
   */
  gbBundledAcquisitionExpenses: string;

  // ── 사례 33: 증축 건물 환산취득가 (소득세법 시행령 §176의2②, §166⑥) ──
  /**
   * 증축 유무 ToggleCard.
   * true 시 extensionInfo 서브객체를 빌드하여 API에 전달.
   * false(default) 시 나머지 5필드 무시 — normalize에서 폐기.
   */
  gbHasExtension: boolean;

  /**
   * 증축일 (건물2 취득일, YYYY-MM-DD).
   * 영 §162①4호 기준: 사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날.
   * 범위: 토지 취득일(exclusive) ~ 양도일(exclusive).
   */
  gbExtensionDate: string;

  /**
   * 증축 면적 (㎡, 정보용 — 산식 미사용).
   * 현 시점 안분식에 미사용. 위치지수 산정 등 후속 확장 대비.
   * 선택 필드: 모르는 경우 비워도 계산에 영향 없음.
   */
  gbExtensionArea: string;

  /**
   * 양도시 건물2(증축분) 기준시가 총액 (원).
   * ⚠ 면적 × 단가가 아닌 총액 직접 입력. 안분 분모 3항의 건물2 성분.
   */
  gbTransferExtensionBuildingStdPrice: string;

  /**
   * 취득시(증축시) 건물2 기준시가 총액 (원).
   * ⚠ 면적 × 단가가 아닌 총액 직접 입력. 환산 비율 분자: 취득시 총액 / 양도시 총액.
   */
  gbAcquisitionExtensionBuildingStdPrice: string;

  /**
   * 증축 취득원인.
   * "newConstruction": 자가증축 (default). §114조의2 가산세 대상.
   * "purchase": 증축부 매수. §114조의2 적용 여부는 엔진 판단.
   */
  gbExtensionAcquisitionCause: "purchase" | "newConstruction";

  /**
   * 증축분 취득방식.
   * "estimated": 환산취득가 (default) — 증축시·양도시 건물기준시가 비율로 산정.
   * "actual": 실거래가 — gbExtensionActualAcquisitionPrice 직접 입력.
   * 빈 문자열: 미선택 (normalize에서 "estimated" fallback).
   */
  gbExtensionAcquisitionMode: "" | "actual" | "estimated";

  /**
   * 증축 실거래가 (원).
   * gbExtensionAcquisitionMode === "actual" 시 필수.
   * validate에서 차단.
   */
  gbExtensionActualAcquisitionPrice: string;

  /**
   * 증축 시 발생한 실제 필요경비 (원).
   * gbExtensionAcquisitionMode === "actual" 시 입력 가능.
   * 미입력 시 0원 처리.
   */
  gbExtensionActualExpenses: string;

  /**
   * §114조의2① 85㎡ 초과 게이트 전용 증축부분 바닥면적 합계 (㎡).
   * extensionArea(연면적 정보용)와 별도 필드. extensionAcquisitionCause==="newConstruction" 시만 유효.
   * 미입력(0)이면 85㎡ 이하 처리로 가산세 미발동.
   */
  gbExtensionFloorArea85: string;

  // ── 사례 35: 주택→상가 용도변경 (사전법규재산 2022-684) ──
  /** 주택→상가 단일 용도변경 토글 (general_building 한정). */
  gbHouseToCommercialConversion: boolean;
  /** 용도변경일 (YYYY-MM-DD). gbHouseToCommercialConversion=true 시 필수. */
  gbConversionDate: string;
  /** 변경 당시 다주택자 여부. null=미선택(강제). true=다주택 → LTHD 기산일 이동. */
  gbWasMultiHouseAtConversion: boolean | null;

  // ── 사례 35 후속-1: §99-164-10 환산주택가격 (취득가액 불명 케이스) ──
  /** "주택으로 최초공시 후 상가로 용도변경" 토글. 환산 모드에서만 의미. */
  gbHasFirstDisclosure: boolean;
  /** 최초공시주택가격 (원). gbHasFirstDisclosure=true 시 필수. */
  gbFirstDisclosurePrice: string;
  /** 최초공시 당시 토지 기준시가 총액 (원). */
  gbFirstDisclosureLandStdPrice: string;
  /** 최초공시 당시 건물 기준시가 총액 (원). */
  gbFirstDisclosureBuildingStdPrice: string;

  // ── 겸용주택 분리계산 (sodt §160①단서, 2022.1.1 이후) ──
  /** 겸용주택 여부 토글 */
  isMixedUseHouse: boolean;
  /** 주택 전용면적 (㎡) — 공통면적 안분 전 (연면적 파생 원천) */
  residentialExclusiveArea: string;
  /** 상가 전용면적 (㎡) — 공통면적 안분 전 */
  commercialExclusiveArea: string;
  /** 공통(공용)면적 (㎡) — 전용면적 비율로 안분 */
  commonArea: string;
  /** 주택 연면적 (㎡) — 전용+공통안분 파생 결과 (UI read-only) */
  residentialFloorArea: string;
  /** 비주택(상가·사무·근린·주차장) 연면적 합계 (㎡) — 파생 결과 */
  nonResidentialFloorArea: string;
  /** 건물 정착면적 = 1층 면적 (㎡) */
  buildingFootprintArea: string;
  /** 전체 토지 면적 (㎡) — 겸용주택용 */
  mixedUseTotalLandArea: string;
  /**
   * 주택 부수토지 면적 수동 지정 (㎡) — PHD OFF 전용, 취득·양도 양시점 공통.
   * 빈값=자동 안분(전체 × 주택연면적비율). UI는 상가칸 편집→역산(전체−상가) 저장.
   */
  mixedResidentialLandAreaOverride: string;
  /**
   * 상가 부수토지 면적 수동 지정 (㎡) — PHD OFF 전용, 취득·양도 양시점 공통.
   * 빈값=자동(잔액). 주택·상가 둘 다 지정 시 잔액 미적용 → 합계 불일치는 validate가 차단.
   */
  mixedCommercialLandAreaOverride: string;
  /**
   * 주택 정착면적 수동 지정 (㎡) — §168의12 배율초과 NBL 판정에 사용.
   * 빈값=자동(정착면적 × 주택연면적비율). UI는 상가 정착칸 편집→역산(전체−상가) 저장.
   */
  mixedResidentialFootprintOverride: string;
  /** 양도시 개별주택공시가격 (원) */
  mixedTransferHousingPrice: string;
  /** 양도시 상가건물 기준시가 (원, 토지 제외) */
  mixedTransferCommercialBuildingPrice: string;
  /** 양도시 개별공시지가 (원/㎡) */
  mixedTransferLandPricePerSqm: string;
  /**
   * §164⑨1호 공익수용 — 상가분 토지 보상액 총액 (원) — 겸용 상가분 min 후보 (P7/D8).
   * 주택분 보상은 P5 필드(housingCompensationTotal·housingCompensationBasisTotal) 재사용.
   */
  mixedCommercialLandCompensationTotal: string;
  /** §164⑨1호 상가분 토지 보상액 산정 기초 개별공시지가 총액 (원) */
  mixedCommercialLandCompensationBasisTotal: string;
  /** 취득시 개별주택공시가격 (원, PHD 토글 ON 시 비활성) */
  mixedAcqHousingPrice: string;
  /** 취득시 상가건물 기준시가 (원, 신축 시점) */
  mixedAcqCommercialBuildingPrice: string;
  /** 취득시 개별공시지가 (원/㎡) */
  mixedAcqLandPricePerSqm: string;
  /** 수도권 여부 */
  mixedIsMetropolitanArea: boolean;

  // ── 보유 중 일부 용도변경 (시행령 §166⑥ + 집행기준 99-164-10) ──
  /** 보유 중 일부 용도변경 토글 — 양도시 겸용이지만 취득시 단일 용도였던 경우 */
  hasPartialUsageChange: boolean;
  /** 용도변경 방향 — 빈 문자열은 미선택 상태 */
  partialChangeDirection: "" | "house_to_commercial" | "commercial_to_house";
  /** 취득시 주택 연면적 (㎡) — 빈값이면 양도시 합계로 자동 도출 */
  partialChangeAcqResidentialArea: string;
  /** 취득시 상가 연면적 (㎡) — 빈값이면 양도시 합계로 자동 도출 */
  partialChangeAcqCommercialArea: string;
  /** 용도변경일 (YYYY-MM-DD, 메모용 — 계산 미사용) */
  partialChangeDate: string;
}
