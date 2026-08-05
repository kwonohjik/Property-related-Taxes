/**
 * 상속·증여 자산 취득가액 산정(Inheritance Acquisition Price) 공개 타입
 *
 * 양도소득세 계산 시 상속·증여로 취득한 자산의 취득가액은 해당 자산의
 * 상속개시일(또는 증여일) 현재 상속세및증여세법(상증법)상 평가가액으로 본다.
 *
 * 근거 조문:
 *   - 소득세법 §97 — 양도소득 필요경비 (취득가액)
 *   - 소득세법 시행령 §163 ⑨ — 상속·증여 자산의 취득가액 의제
 *   - 소득세법 시행령 §176조의2 ④ — 의제취득일 전 상속: max(환산가액, 취득실가×물가상승률)
 *   - 상증법 §60 — 평가의 원칙 (시가주의 + 보충적평가액)
 *   - 상증법 §61 ~ §66 — 부동산 등 보충적평가방법
 *
 * 평가 우선순위 (시가주의 원칙):
 *   1. 시가 (marketValue) — 유사 매매사례가액·공매·경매·감정가 등
 *   2. 2개 이상 감정평가액 평균 (appraisalAverage)
 *   3. 보충적평가액 (supplementary) — 공시가격 기반
 *      - 토지: 개별공시지가(원/㎡) × 면적
 *      - 주택: 개별주택가격 또는 공동주택가격
 */

/** 평가 대상 자산 종류 */
export type InheritanceAssetKind = "land" | "house_individual" | "house_apart";

/**
 * 상가 §163⑨2호 §164⑥ 취득당시 기준시가(P_A) 산정 입력 (소령 §164⑥ 최초고시 역환산).
 *
 * 오피스텔·상업용건물 기준시가 최초고시(2005-01-01) 전 상속 상가의 취득당시 기준시가를
 * 최초고시 역환산으로 추정한다. 취득당시 실지거래가액 의제 = max(상증법 평가액, 이 P_A).
 * 양도시 값은 P_A 산정에 불요(취득시·최초고시 시점만).
 */
export interface CommercialInheritanceValuationInput {
  /** 전용면적 (㎡) */
  exclusiveArea: number;
  /** 공유면적 (㎡) — 연면적 = exclusiveArea + commonArea */
  commonArea: number;
  /** 대지면적 (㎡) */
  landArea: number;
  /** 최초고시(2005) ㎡당 호별고시가 (원/㎡) */
  unitPriceAtFirstDisclosure: number;
  /** 취득시(상속개시일) 개별공시지가 (원/㎡) */
  landPriceAtAcquisition: number;
  /** 최초고시시(2005) 개별공시지가 (원/㎡) */
  landPriceAtFirstDisclosure: number;
  /** 취득시(상속개시일) 건물 기준시가 (원, 총액) */
  buildingStdPriceAtAcquisition: number;
  /** 최초고시시(2005) 건물 기준시가 (원, 총액) */
  buildingStdPriceAtFirstDisclosure: number;
}

/**
 * 의제취득일(1985.1.1.) — 소득세법 부칙(1985.1.1. 개정)
 * 1984.12.31. 이전에 취득한 자산은 이 날짜에 취득한 것으로 간주한다.
 */
export const DEEMED_ACQUISITION_DATE = new Date("1985-01-01T00:00:00.000Z");

/**
 * 취득가액 산정 방법
 *
 * 의제취득일 전 상속:
 *   - pre_deemed_max: max(환산가액, 취득실가×물가상승률) — 소령 §176조의2 ④
 *
 * 의제취득일 이후 상속 / 일반 상속:
 *   - market_value:      매매사례가액 (시가, 상증법 §60 ①)
 *   - appraisal:         감정평가액 평균 (상증법 §60 ⑤)
 *   - auction_public_sale: 수용·경매·공매가액 (상증법 §60 ②)
 *   - similar_sale:      유사매매사례가액 (상증법 시행령 §49)
 *   - supplementary:     보충적평가액 (상증법 §61)
 */
export type InheritanceAcquisitionMethod =
  | "market_value"          // 매매사례 (시가)
  | "appraisal"             // 감정평가
  | "auction_public_sale"   // 수용·경매·공매
  | "similar_sale"          // 유사매매사례
  | "supplementary"         // 보충적평가
  | "pre_deemed_max";       // 의제취득일 전 max(환산, 실가×CPI)

export interface InheritanceAcquisitionInput {
  /** 상속개시일 (의제취득일 분기 기준) */
  inheritanceDate: Date;

  /** 자산 종류 */
  assetKind: InheritanceAssetKind;

  // ── 보충적평가 보조 입력 ──

  /** 토지 면적 (㎡) — assetKind === "land"일 때 필수 */
  landAreaM2?: number;

  /**
   * 상속개시일 직전 공시된 단가 또는 공시가격 (원).
   * - land: 개별공시지가 (원/㎡)
   * - house_individual: 개별주택가격 (원, 총액)
   * - house_apart: 공동주택가격 (원, 총액)
   */
  publishedValueAtInheritance?: number;

  /**
   * 시가 (원, 선택).
   * 유사 매매사례가액·감정가·공매가액 등 시가로 인정되는 금액.
   * 지정 시 보충적평가보다 우선 적용.
   */
  marketValue?: number;

  /**
   * 감정평가액 평균 (원, 선택).
   * 상증법 §60 ⑤: 평가기간 내 2개 이상 감정평가 평균.
   */
  appraisalAverage?: number;

  // ── 의제취득일 이후 상속 (case B): 상속세 신고가액 ──

  /**
   * 상속세 신고 시 평가가액 (원).
   * 신고한 평가방법에 따른 금액을 그대로 취득가액으로 한다.
   */
  reportedValue?: number;

  /** 신고 시 적용한 평가방법 */
  reportedMethod?: InheritanceAcquisitionMethod;

  /**
   * 개별주택가격 미공시 상속주택의 §164⑦ 취득당시 기준시가 (원, 미스케일).
   * post-deemed(의제취득일 이후) 주택 & 상속개시일 < 2005-04-30 시,
   * 취득가액 = max(reportedValue[① 상증법 평가액], 이 값[② §164⑦]). 소령 §163⑨2호.
   * helpers가 houseValuationResult.housePriceAtInheritanceUsed로 주입. 양도가 스케일 없음.
   */
  houseValuationStdPrice?: number;

  /**
   * 상업용건물·오피스텔 기준시가 미공시 상속 상가의 §164⑥ 취득당시 기준시가 (원, 미스케일).
   * post-deemed(의제취득일 이후) 상가 & 상속개시일 < 2005-01-01(최초고시 전) 시,
   * 취득가액 = max(reportedValue[① 상증법 평가액], 이 값[② §164⑥]). 소령 §163⑨2호.
   * helpers가 commercialInheritanceValuation로부터 P_A(최초고시 역환산)를 산정해 주입. 양도가 스케일 없음.
   * (houseValuationStdPrice와 배타 — 자산은 주택 or 상가.)
   */
  commercialValuationStdPrice?: number;

  // ── 의제취득일 전 상속·증여 (case A): max(①,②,③) ──

  /** @deprecated 물가상승률 방식 폐지(상속·증여 미적용). Phase 2에서 제거 예정 — 엔진 미사용 */
  decedentAcquisitionDate?: Date;

  /** @deprecated 물가상승률 방식 폐지(상속·증여 미적용). Phase 2에서 제거 예정 — 엔진 미사용 */
  decedentActualPrice?: number;

  /** 양도일 */
  transferDate?: Date;

  /** 양도가액 (원) — 환산취득가 공식의 분자 */
  transferPrice?: number;

  /**
   * 의제취득일(1985.1.1.) 시점 기준시가 (원).
   * 토지: 1990.8.30. 이전 토지등급가액 환산 결과 또는 직접 입력.
   * 건물: 국세청 기준시가.
   */
  standardPriceAtDeemedDate?: number;

  /** 양도시 기준시가 (원) */
  standardPriceAtTransfer?: number;
}

/**
 * 의제취득일 전 상속·증여(case A) 취득가액 후보.
 * 취득가액 = max(① 상증법 §60~66 평가액, ③ 환산취득가). [Phase 1]
 * 근거: 소령 §163⑨·§176조의2④, 국심2003부602·2003서3266, 조심2023서0676.
 * ※ 상속·증여 자산엔 생산자물가상승률 방식(§176조의2④2호) 부적용
 *   (호2 base=취득당시 실지거래가액·매매·감정가액이 무상취득엔 부존재).
 * ※ ② 소령 §164④~⑦ 취득당시 기준시가는 Phase 2에서 별도 후보로 추가 예정
 *   (환산 분자 standardPriceAtDeemedDate와 구분되는 값·시점 확정 필요).
 */
/**
 * pre-deemed 취득가액 후보.
 * ⚠️ `"converted"`만 추계(§176조의2③3호)라 **개산공제(§163⑥) 대상**이다
 *    (`inheritance-acquisition-helpers.ts`의 `isConvertedSelected` 게이트).
 *    `"reported"`(①)·`"sec164"`(②)는 **실지거래가액 의제**(§163⑨)라 실제 필요경비를 쓴다.
 */
export type PreDeemedSelectedMethod = "reported" | "converted" | "sec164";

export interface PreDeemedBreakdown {
  /** ① 상증법 §60~66 평가액 (상속세 신고가액) — null=미입력 */
  reportedAmount: number | null;
  /** ③ 환산취득가: 양도가 × (의제취득일 기준시가 ÷ 양도시 기준시가) */
  convertedAmount: number;
  /** ② §164④~⑦ 취득당시 기준시가 (§163⑨1호·2호) — null=미주입(opt-in) */
  sec164Amount: number | null;
  /** 채택된 후보 (max) */
  selectedMethod: PreDeemedSelectedMethod;
}

export interface InheritanceAcquisitionResult {
  /** 최종 취득가액 (원) */
  acquisitionPrice: number;
  /** 선택된 산정방법 */
  method: InheritanceAcquisitionMethod;
  /** 상증법·소득세법 근거 */
  legalBasis: string;
  /** 계산 산식 설명 (UI 표시용) */
  formula: string;
  /** 의제취득일 전 상속(case A) 비교 내역 */
  preDeemedBreakdown?: PreDeemedBreakdown;
  /** 경고 메시지 (CPI 범위 외, 입력 누락 fallback 등) */
  warnings?: string[];
}
