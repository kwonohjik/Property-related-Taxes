/**
 * 상업용건물·오피스텔 환산취득가 계산 타입
 *
 * 800줄 정책 준수를 위해 transfer.types.ts에서 분리.
 * transfer.types.ts에서 재수출되어 외부 소비자 경로는 변경 없음.
 *
 * 법령 근거: 소득세법 §97②2호; 시행령 §163⑥·§164①·⑧·§176조의2②2호
 */

/**
 * 상업용건물·오피스텔 환산취득가 계산 입력
 *
 * 소득세법 시행령 §164⑥ (호별고시 전 취득) + §176조의2②2호 (환산취득가 산식)
 */
export interface CommercialBuildingValuationInput {
  /**
   * 호별고시 전 취득 여부.
   * true  = 취득일 < 2005-01-01 → 소령 §164⑥ 최초고시 역환산 경로 (C-01)
   * false = 취득일 ≥ 2005-01-01 → 단순 호별고시가 비율 경로 (C-02)
   */
  isPreDisclosure: boolean;

  // ── 면적 (공통) ──
  /** 전용면적 (㎡) */
  exclusiveArea: number;
  /** 공유면적 (㎡) — 연면적 = exclusiveArea + commonArea */
  commonArea: number;
  /** 대지면적 (㎡) — 기준시가합 산출에 사용 */
  landArea: number;

  // ── 호별 ㎡당 고시가 ──
  /** 양도시 ㎡당 호별고시가 (원/㎡) */
  unitPriceAtTransfer: number;
  /**
   * 최초고시(2005) ㎡당 호별고시가 (원/㎡).
   * isPreDisclosure === true 일 때 필수.
   */
  unitPriceAtFirstDisclosure?: number;
  /**
   * 취득시 ㎡당 호별고시가 (원/㎡).
   * isPreDisclosure === false (C-02) 일 때 필수.
   */
  unitPriceAtAcquisition?: number;

  // ── 건물 기준시가 총액 (소령 §164①) — C-01 전용 ──
  // 사용자(외부)에서 ㎡당 단가 × 연면적(전유+공용 보정계수 반영)을 미리 곱해 입력하는 총액 (원).
  // 3시점 환산 입력 일관성: 호별고시는 ㎡당 단가, 토지는 개별공시지가×면적, 건물은 총액.
  /**
   * 취득시 건물 기준시가 (원, 총액).
   * isPreDisclosure === true 일 때 필수.
   */
  buildingStdPriceAtAcquisition?: number;
  /**
   * 최초고시시(2005) 건물 기준시가 (원, 총액).
   * isPreDisclosure === true 일 때 필수.
   */
  buildingStdPriceAtFirstDisclosure?: number;
  /**
   * 양도시 건물 기준시가 (원, 총액).
   * isPreDisclosure === true 일 때 사용. (C-02에서는 호별고시가만 사용)
   */
  buildingStdPriceAtTransfer?: number;

  // ── 개별공시지가 (소령 §164①) ──
  /** 취득시 개별공시지가 (원/㎡). C-01/C-02 모두 필수. */
  landPriceAtAcquisition?: number;
  /** 최초고시시(2005) 개별공시지가 (원/㎡). isPreDisclosure === true 일 때 필수. */
  landPriceAtFirstDisclosure?: number;
  /** 양도시 개별공시지가 (원/㎡). C-01 시 필요. */
  landPriceAtTransfer?: number;

  /**
   * 취득연도 — **§164⑥ 단서 해당 여부 판정 전용**(계산에 쓰지 않는다).
   *
   * API를 새로 태우지 않는다 — `runCommercialBuildingStep`이 이미 있는
   * `TransferTaxInput.acquisitionDate`에서 파생해 주입한다(14 동기화 지점 ⑫⑬⑭ 불필요).
   * 미지정 시 판정을 생략한다(`sec164_5ProvisoApplicable` undefined).
   */
  acquisitionYear?: number;
}

/**
 * 상업용건물·오피스텔 환산취득가 계산 상세 결과.
 * 결과 카드 산식 표시·신고서 양식 토지/건물 분리 표 재현에 사용.
 */
export interface CommercialBuildingValuationResult {
  // ── 산출 중간값 ──
  /** 연면적 = 전용 + 공유 (㎡) */
  floorAreaTotal: number;
  /** 양도시 호별총액 = 양도시 ㎡당 호별고시가 × 연면적 */
  unitPriceTotalAtTransfer: number;
  /**
   * 최초고시 호별총액 = 최초고시 ㎡당 호별고시가 × 연면적.
   * isPreDisclosure === true 일 때만 존재.
   */
  unitPriceTotalAtFirst?: number;

  // ── 3시점 기준시가합 (소령 §164①) ──
  /** 취득시 기준시가합 = 개공지 × 대지면적 + 건물 기준시가(총액) */
  combinedStdAtAcq?: number;
  /** 최초고시시 기준시가합 */
  combinedStdAtFirst?: number;
  /** 양도시 기준시가합 */
  combinedStdAtTransfer?: number;

  /** 취득시 토지 기준시가합 = 개공지 × 대지면적 */
  landStdAtAcq?: number;
  /** 취득시 건물 기준시가합 = 건물 기준시가 입력값(총액) */
  buildingStdAtAcq?: number;
  /** 최초고시시 토지 기준시가합 */
  landStdAtFirst?: number;
  /** 최초고시시 건물 기준시가합 */
  buildingStdAtFirst?: number;
  /** 양도시 토지 기준시가합 */
  landStdAtTransfer?: number;
  /** 양도시 건물 기준시가합 */
  buildingStdAtTransfer?: number;

  /**
   * 취득시 환산기준시가 (소령 §164⑥).
   * = INT( 최초고시 호별총액 × 취득시 기준시가합 / 최초고시시 기준시가합 )
   * isPreDisclosure === true 일 때만 존재.
   * 이 값이 §163⑥의 '취득당시의 기준시가' — 개산공제 기준으로 사용.
   */
  estimatedBasisAtAcq?: number;

  // ── 환산취득가 (소령 §176조의2②2호) ──
  /** 환산취득가 합계 = INT( 양도가액 × 취득당시기준시가 / 양도시호별총액 ) */
  estimatedAcquisitionTotal: number;
  /** 환산취득가 토지분 = INT( 합계 × 취득시토지기준시가 / 취득시기준시가합 ) */
  estimatedAcquisitionLand: number;
  /** 환산취득가 건물분 = 합계 − 토지분 */
  estimatedAcquisitionBuilding: number;

  // ── 개산공제 (§97②2호 + §163⑥) ──
  /**
   * 개산공제 합계 = 취득당시의 기준시가 × 3%.
   * C-01: INT( 취득시 환산기준시가(P_A) × 3% ).
   * C-02: INT( 취득시 호별총액 × 3% ).
   */
  estimatedDeductionTotal: number;
  /** 개산공제 토지분 (내부 표시용: 토지기준시가 비율로 안분) */
  estimatedDeductionLand: number;
  /** 개산공제 건물분 (내부 표시용: 건물기준시가 비율로 안분) */
  estimatedDeductionBuilding: number;

  /**
   * §164⑥ 단서 해당 — 취득당시 건물 기준시가(법 §99①1호나목)가 고시 전이라 존재하지 않아
   * **§164⑤을 준용해 산정해야 하는 경우**임을 뜻한다.
   *
   * ⚠️ 입력값이 실제로 §164⑤로 산정됐는지는 **엔진이 알 수 없다** — 준용에 필요한
   *    신축연도·구조·용도가 엔진 input에 없기 때문이다. 이 플래그는 **산출 근거 표시용**이며
   *    계산을 바꾸지 않는다. 실제 준용 여부 확인은 UI 게이트가 담당한다
   *    (`lib/calc/commercial-164-6-proviso.ts`).
   *
   * `acquisitionYear` 미지정 시 undefined(판정 생략).
   */
  sec164_5ProvisoApplicable?: boolean;
}
