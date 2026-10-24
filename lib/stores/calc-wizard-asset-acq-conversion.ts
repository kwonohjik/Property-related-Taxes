/**
 * AcqPriceConversionFormSlice — 환산취득가 기준시가 보조 입력
 * (개별주택가격 미공시 §164⑦ · 상속 주택 환산 · 1990.8.30. 이전 토지 등급가액).
 * AssetForm이 extends. 800줄 정책으로 calc-wizard-asset.ts에서 분리.
 */
export interface AcqPriceConversionFormSlice {
  // ── 개별주택가격 미공시 취득 환산 (§164⑦) ──
  /** true 시 3-시점 미공시 취득 환산 모드 활성화 */
  usePreHousingDisclosure: boolean;
  /**
   * 주택유형 — 「개별주택가격(단독·다가구)」 / 「공동주택가격(아파트)」 라벨 축.
   *
   * 🔴 종전에는 `PreHousingDisclosureSection`의 `useState` 로컬이었다(R12). 단계를 옮기거나
   *    새로고침하면 항상 「단독·다가구」로 되돌아가, **저장된 공동주택가격에 개별주택가격
   *    라벨**이 붙었다. 표시 축이라 ④⑧에는 싣지 않는다.
   */
  phdHousingType: "individual" | "apartment";
  /** 최초 고시일 (YYYY-MM-DD, 사용자 직접 입력) */
  phdFirstDisclosureDate: string;
  /** 최초 고시 개별주택가격 P_F (원) */
  phdFirstDisclosureHousingPrice: string;
  /** 취득당시 선택 연도 (문자열 "2013" 등, 자동추천 또는 수동 변경) */
  phdLandPriceYearAtAcq: string;
  /** true = 수동 변경됨, false = 자동추천 */
  phdLandPriceYearAtAcqIsManual: boolean;
  /** 취득당시 토지 단위 공시지가 (원/㎡) — **토지값 트랙**(부수토지 기준시가 = 공시지가 × 면적). 엔진 입력 */
  phdLandPricePerSqmAtAcq: string;
  /**
   * 취득 ≤2000 — 2001.1.1 현재 단위 공시지가 (원/㎡). **위치지수 트랙**(건물 기준시가 산정, 소령 §164⑤).
   * `phdLandPricePerSqmAtAcq`(취득당시 연도 토지값)와 의미가 달라 혼용 금지 — 트랙 판정은
   * `lib/calc/phd-acq-land-price-track.ts` 단일 소스.
   * **엔진 미전달(UI 전용)**: 배치 모달 입력 보존 + 상가건물 모달 prefill 소스.
   */
  phdLandPricePerSqmAtAcq2001: string;
  /**
   * 계산 보조(«환산 …가격 계산해 채우기» — `PhdConvertedPriceFill`) 전용 확인 — 취득일·최초 고시일이 2000년 이전이면
   * 그 시점 건물 기준시가(법 §99①1호 나목)가 없어 §164⑤ 준용 산정 값을 넣었다는 사용자 확인(소령 §164⑥·⑦ 후단).
   * 체크해야 채우기 버튼이 켜진다. **엔진 미전달(UI 전용)** — 보조 입력은 ④가 보내지 않고 ⑧이 요구하지 않는다.
   */
  phdAssistBuildingStdBy164_5: boolean;
  /** 취득당시 건물 기준시가 (원) */
  phdBuildingStdPriceAtAcq: string;
  /** 최초공시일 선택 연도 */
  phdLandPriceYearAtFirst: string;
  /** true = 수동 변경됨 */
  phdLandPriceYearAtFirstIsManual: boolean;
  /** 최초공시일 토지 단위 공시지가 (원/㎡) */
  phdLandPricePerSqmAtFirst: string;
  /** 최초공시일 건물 기준시가 (원) */
  phdBuildingStdPriceAtFirst: string;
  /** 양도시 개별주택가격 P_T (원) */
  phdTransferHousingPrice: string;
  /** 양도시 선택 연도 */
  phdLandPriceYearAtTransfer: string;
  /** true = 수동 변경됨 */
  phdLandPriceYearAtTransferIsManual: boolean;
  /** 양도시 토지 단위 공시지가 (원/㎡) */
  phdLandPricePerSqmAtTransfer: string;
  /** 양도시 건물 기준시가 (원) */
  phdBuildingStdPriceAtTransfer: string;
  /**
   * 겸용주택 PHD 주택부수토지 면적 수동 지정 (㎡).
   * 비어 있으면 엔진이 양도시 주택연면적 비율로 자동 계산.
   * 최초 공시 당시 전체가 주택이었던 경우 전체 토지 면적으로 수정.
   */
  phdResidentialLandArea: string;

  /**
   * Case A 4부분 안분 전용 (취득시 전체 주택 → 양도시 일부 상가, 최초공시 < 용도변경일).
   * 엑셀 사례 기준: 취득시·최초공시 시점에는 건물 전체가 주택이었으나
   * 양도시점 기준으로 "주택건물 부분"과 "상가건물 부분"의 기준시가를 각각 분리 입력.
   * Case A 비활성 시 빈 문자열 유지.
   */
  /** 취득시 상가건물 기준시가 (원) — Case A 4부분 안분용 */
  phdCommercialBuildingStdPriceAtAcq: string;
  /** 최초공시일 상가건물 기준시가 (원) — Case A 4부분 안분용 */
  phdCommercialBuildingStdPriceAtFirst: string;

  // ── 상속 주택 환산취득가 보조 입력 (주택 자산 + 상속개시일 < 2005-04-30) ──
  /** true 시 3-시점 보조 계산 활성화 */
  inhHouseValEnabled: boolean;
  /**
   * 공동주택 — 상속개시일·증여일 당시 국세청장이 고시한 공동주택 기준시가가 있었는가(영 §163⑨ 단서 2호). 「모름」 값은 없다
   * (사용자 지시 2026-10-19) — 미선택("")이면 ⑧이 묻는다. 판정·송신·검증은 `lib/calc/apart-nts-price.ts`.
   */
  inhApartNtsPriceExisted: "" | "yes" | "no";
  /** 「없었음」일 때 첫 가격 기관 — 국세청장 고시(영 §164⑥) / 국토교통부장관 공시(⑦). 미선택 "" */
  inhApartFirstPriceAgency: "" | "nts" | "molit";
  /**
   * 「없었음」일 때 그 공동주택의 첫 가격 고시·공시일(YYYY-MM-DD) — 기본 "" (필수 입력이라 기본값을 두지 않는다).
   * 단독·다가구의 `inhHouseValFirstDisclosureDate`(기본 2005-04-30)와 별개다 — 공동주택은 2005.4.30. 전일 수 있다.
   */
  inhApartFirstPriceDate: string;
  /** 최초 고시일 (기본 "2005-04-30") */
  inhHouseValFirstDisclosureDate: string;
  /** 토지 면적 (㎡) */
  inhHouseValLandArea: string;
  /** 양도시 개별공시지가 (원/㎡) */
  inhHouseValLandPricePerSqmAtTransfer: string;
  /** 최초고시 시점 개별공시지가 (원/㎡) */
  inhHouseValLandPricePerSqmAtFirst: string;
  /** 상속개시일 시점 개별공시지가 (원/㎡) — 1990-08-30 이후 시 직접 입력 */
  inhHouseValLandPricePerSqmAtInheritance: string;
  /** 양도시 개별주택가격 (원) */
  inhHouseValHousePriceAtTransfer: string;
  /** 최초고시 시점 개별주택가격 (원) */
  inhHouseValHousePriceAtFirst: string;
  /** 양도당시 건물기준시가 (원) — 국세청 기준시가. 양도시 합계 기준시가의 건물 성분 */
  /** 최초고시 시점 건물기준시가 (원) — §164⑦ Sum_F 분모: 토지기준시가 + 이 값. 국세청 기준시가 */
  inhHouseValBuildingStdPriceAtFirst: string;
  /** 상속개시일 시점 건물기준시가 (원) — §164⑦ Sum_A 분자의 건물 성분. 국세청 기준시가 */
  inhHouseValBuildingStdPriceAtInheritance: string;
  /** 상속개시일 시점 주택가격 직접 입력 override 사용 여부 */
  inhHouseValUseHousePriceOverride: boolean;
  /** 상속개시일 시점 주택가격 직접 입력 override (원) */
  inhHouseValHousePriceAtInheritanceOverride: string;
  // 1990-08-30 이전 토지 등급가액 환산은 기존 pre1990* 7필드 재사용

  // ── 1990.8.30. 이전 취득 토지 환산 (assetKind === "land" + acquisitionDate < 1990-08-30) ──
  pre1990Enabled: boolean;
  pre1990PricePerSqm_1990: string;
  pre1990PricePerSqm_atTransfer: string;
  pre1990Grade_current: string;
  pre1990Grade_prev: string;
  pre1990Grade_atAcq: string;
  pre1990GradeMode: "number" | "value";
}
