/**
 * 장기임대주택 보유자의 거주주택 양도 비과세 특례 — 타입 정의
 *
 * 소득세법 시행령 §155⑳ (주택수 제외 특례)
 * 소득세법 시행령 §161 (PHRP 기준시가 안분)
 *
 * Design: docs/02-design/features/rental-housing-residence-exception.engine.design.md
 */

import type { ArticleFailCode } from "../../rental-article/check";
import type { AptTransferDeadlineExtension } from "../../rental-article/rules";
import type { AddendumTransitionBasis } from "../../data/rental-155-20-era";

// ============================================================
// 임대주택 단위 입력
// ============================================================

/**
 * 임대구분 (사용자 선택 축) — 의무임대기간·기준시가 상한은 등록기준일·취득방법에서 파생.
 *
 * long_general:      장기일반민간임대 (가/마/다/바목 — 등록기준일로 5/8/10 파생)
 * short_6y:          단기민간임대 6년 (아/자목, 2025.6.4 신설)
 * pre_2018:          구 임대주택법 (5년)
 * existing_business: 기존사업자 매입임대 (나목, 2003.10.29 이전 등록·취득당시 3억·국민주택·2호)
 * unsold_08_09:      미분양 매입임대 (라목, 2008.6.11~2009.6.30 최초분양·비수도권·취득당시 3억·5호·298/149)
 * (말소 사목은 다주택 전용 — §155⑳는 §155⑳㉓ 말소 후 5년 특례로 처리)
 */
export type RentalCategory =
  | "long_general" | "short_6y" | "pre_2018" | "existing_business" | "unsold_08_09";

/** 수도권/비수도권 구분 (조정대상지역은 isExcluded918Rule 별도 축) */
export type RegionType = "seoul-metro" | "non-metro";

/** 도출 엔진 목 (§167조의3①2호 가~자 — 사목은 다주택 전용이라 §155⑳ 미도출) */
export type RentalArticle = "가" | "나" | "다" | "라" | "마" | "바" | "아" | "자" | "구법";

/**
 * 임대주택 1호 입력 데이터
 *
 * 복수 임대주택 보유 시 배열로 전달. 최소 1호 필수.
 * 거주주택 외의 주택이 **모두** 장기임대주택이어야 한다(§155⑳ 「장기임대주택 … 과 그 밖의 1주택」 — OH-14).
 */
export type RentalUnitInput = {
  /** 세무서 사업자등록일 (소득세법 §168) */
  businessRegistrationDate: Date;
  /** 지자체 임대사업자등록신청일 (민특법 §5) */
  rentalRegistrationDate: Date;
  /** 임대구분 (도출 목·의무기간·cap의 파생 소스) */
  rentalCategory: RentalCategory;
  /** 매입임대 / 건설임대 구분 */
  rentalAcquisitionType: "purchase" | "construction";
  /** 아파트 여부 (2020.7.11 이후 등록 아파트는 장기일반 불가·단기/건설은 항상 제외) */
  isApartment: boolean;
  /** 소재지 구분 (수도권/비수도권 — cap 산정축) */
  region: RegionType;
  /**
   * 918 조정취득 배제 (2018.9.14 이후 조정대상지역 신규취득):
   * - 마목(장기 매입): hard 배제.
   * - 아목(단기 매입): 계약금 지급 증빙(hasContractDepositProof) 있으면 carve-out.
   * (구 isRegulatedAreaNewAcq rename — D-2 아목 게이트 다주택 정합)
   * ※ 생산 경로는 Zod(rentalUnitSchema)가 required 강제 — 엔진 타입은 미해당 목(가/다/구법 등)
   *    구성 편의를 위해 optional. 미제공 시 false/0 default(check.ts falsy·adapter).
   */
  isExcluded918Rule?: boolean;
  /** 아목 918 carve-out — 조정대상지역 공고 전 계약 + 계약금 지급 증빙 */
  hasContractDepositProof?: boolean;
  /** 마·바목 단기→장기 변경신고 배제 여부 */
  isExcludedShortToLongChange?: boolean;
  /** 임대개시일 당시 기준시가 (원) — 가/다/마/바/아/자/구법 가액요건 */
  standardPriceAtRentalStart: number;
  /** 취득당시 기준시가 (원) — 나목 가액요건(취득당시 3억, 지역무관). 미제공 시 adapter 0 */
  acquisitionOfficialPrice?: number;
  /** 국민주택규모(전용 85㎡·수도권 도시지역 60㎡ 이하) 충족 — 나목 요건 */
  isNationalSizeHousing?: boolean;
  /** 대지면적 (㎡) — 건설임대 규모요건(≤298) 판정용 */
  landAreaM2?: number;
  /** 주택 연면적/전용면적 (㎡) — 건설임대 규모요건(≤149) 판정용 */
  totalFloorAreaM2?: number;
  /** 2호 이상 임대 충족 자기확인 — 건설임대(다/바/자)·나목 호수요건 */
  hasMinimum2Units: boolean;
  /** 같은 시·군 5호 이상 임대 충족 — 라목(미분양) 호수요건 */
  hasMinimum5UnitsInCity?: boolean;
  /** 최초 분양계약일 — 라목(미분양) 2008.6.11~2009.6.30 판정용 */
  firstSaleContractDate?: Date;
  /** 실제 임대 개월수 (공실 차감 후) */
  rentalMonths: number;
  /**
   * §155㉓ 말소 — 가·다·라·마목 임대주택이 자진말소(민특법 §6①11호, 임대의무기간 1/2 이상)·자동말소
   * (§6⑤)로 **등록이 말소됐다**는 선언. 「말소 이후 5년 이내 양도」는 선언이 아니라
   * `registrationCancellationDate`로 엔진이 판정한다(I-4). 판정 맥락(`EligibilityContext`)이 없는 직접
   * 호출에서는 종전대로 이 값만으로 임대기간요건을 간주 충족한다(RENTAL_PERIOD_SHORT 억제).
   */
  rentalAutoTermination: boolean;
  /**
   * §155㉓ 등록 말소일(I-4) — 「해당 등록이 말소된 이후(장기임대주택을 2호 이상 임대하는 경우에는 최초로
   * 등록이 말소되는 장기임대주택의 등록 말소 이후를 말한다) 5년 이내」의 기산 사건일. `rentalAutoTermination`
   * 이 true인데 없으면(구 기록) ㉓을 판정하지 않는다 — 간주 충족을 주지 않는다.
   */
  registrationCancellationDate?: Date;
  /**
   * §155㉓1호 자진말소 「같은 법(민특법) 제43조에 따른 **임대의무기간**의 2분의 1 이상」 판정용 —
   * 말소된 주택의 종전 「민간임대주택에 관한 특별법」 등록 유형(OH-39).
   * - `short_term`: 종전 민특법 §2 6호 단기민간임대주택 — 「4년 이상」 → 1/2 = 24개월
   * - `long_term_general`: 종전 민특법 §2 5호 장기일반민간임대주택 — 「8년 이상」 → 1/2 = 48개월
   * (법률 제17482호 개정 전 본문, MST 211593. 자진말소는 민특법 §6①11호가 이 두 유형만 허용한다.)
   * 소득세법 §167의3 목별 임대기간요건(가목 5년 등)과 **다른 축**이다. 미입력이면 ㉓을 판정하지 않는다.
   */
  terminatedRegistrationType?: "short_term" | "long_term_general";
  /**
   * §167조의3⑪ 기한 연장 사실(가목2)·나목2)·라목8)·마목4) 아파트) — 미제공 = 「모름」(바닥 초과 양도면
   * 기한 경과 + 확인 필요 고지 · 사용자 결정 2026-10-04). §155㉓ 경로는 이 요건을 적용하지 않는다(`skipAptTransferDeadlineGate`).
   */
  aptDeadlineExtension?: AptTransferDeadlineExtension;
  /**
   * 기타 요건 자기확인 체크
   * (임대료 5% 이내 증액·임대차계약 체결·임대료 지급 등 — LawArticleModal 안내 후 사용자 확인)
   */
  requirementsConfirmed: boolean;
};

// ============================================================
// 메인 입력 타입
// ============================================================

/**
 * 장기임대주택 거주주택 비과세 특례 입력
 *
 * TransferTaxInput.rentalHousingException? 으로 전달됨.
 */
export type RentalHousingExceptionInput = {
  /** 특례 적용 여부 토글 */
  applyException: boolean;
  /**
   * 시나리오 선택
   * A: 자가 거주주택 양도 (임대주택은 계속 보유)
   * B: 임대주택 → 거주주택으로 전환 후 양도 (직전거주주택보유주택, PHRP)
   */
  scenario: "A" | "B";
  /**
   * 임대주택 목록. 시나리오 A는 최소 1호. 시나리오 B는 **0호 가능**(I-5) —
   * 양도일 현재 공동보유 중인 장기임대주택이 하나도 없으면(전부 처분·등록말소 후 미보유) §155⑳이 아니라
   * §154⑩(PHRP 표준 경로)로 판정한다. 이때는 `wasRegisteredRentalOrChildcare`(§154⑩1호)와
   * `priorResidenceTransferDate`(§154⑩2호 PHRP 확인)가 요건을 대신하고, 거주기간은 취득 시기에 따라
   * `postRegistrationResidenceMonths`(2019.2.12 이후 취득) 또는 일반 거주기간(그 전 취득)을 쓴다.
   */
  rentalUnits: RentalUnitInput[];
  // ─── B 시나리오 전용 (scenario === 'B' 시 필수) ───
  /** D_prior: 직전거주주택 양도일 */
  priorResidenceTransferDate?: Date;
  /** P_acq: PHRP(임대→거주 전환 주택) 취득 당시 기준시가 (원) */
  standardPriceAtAcquisition?: number;
  /** P_prior: 직전거주주택 양도 당시 PHRP의 기준시가 (원) */
  standardPriceAtPriorTransfer?: number;
  /** P_transfer: PHRP 양도 당시 기준시가 (원) */
  standardPriceAtTransfer?: number;
  /**
   * B 시나리오 전용 — §155⑳1호 괄호 「직전거주주택보유주택의 경우에는 법 제168조에 따른 사업자등록과
   * 「민간임대주택에 관한 특별법」 제5조에 따른 임대사업자 등록을 한 날 … **이후의 거주기간**」(OH-15).
   * 전체 거주기간(`TransferTaxInput.residencePeriodMonths`)은 장특 표2 거주분에만 쓰고, 1호 거주요건은
   * 이 값으로 판정한다. 미입력이면 B의 거주요건을 충족으로 보지 않는다.
   */
  postRegistrationResidenceMonths?: number;
  /**
   * 대통령령 제29523호(2019-02-12)~제35349호(2025-02-27) 구간의 「생애 한 차례만 거주주택을 최초로
   * 양도하는 경우에 한정」 판정 사실(OH-40) — 장기임대주택을 보유한 상태에서 이미 거주주택을 양도해
   * §155⑳을 적용받은 적이 있는가. 미입력이면 판정 보류 경고를 낸다(요건 미충족으로 단정하지 않는다).
   */
  priorRentalExemptionHistory?: "none" | "used";
  /**
   * 대통령령 제29523호 부칙 제7조② 경과조치 — 2019-02-12 당시 그 거주주택에 거주 중이었거나, 그 전에
   * 매매계약을 체결하고 계약금을 지급한 사실이 증빙서류로 확인된다(종전 규정 적용). 미입력 = false.
   */
  residenceTransitionUnderAddendum?: boolean;
  /**
   * D11 — 위 경과조치의 사유(부칙 제7조② 1호 거주 · 2호 계약금 + 2019.2.12. 전 등록 임대주택 소유 여부).
   * 생애 1회 제한(OH-40)은 `isAddendumTransitionEffective`로만 푼다 — 사유가 없으면 풀지 않는다.
   */
  residenceTransitionBasis?: AddendumTransitionBasis;
  /**
   * §154⑩1호(I-5) — 이 주택이 「민간임대주택에 관한 특별법」 §5에 따라 임대주택으로 등록되거나
   * 「영유아보육법」 §12·§13에 따른 어린이집으로 설치·운영된 사실이 있는가. `rentalUnits`가 0호인
   * 시나리오 B(§154⑩ 경로)에서만 판정에 쓰인다 — §167조의3①2호 요건(면적·가액·의무기간)은 인용하지
   * 않는 **단순 등록·운영 사실**이다. 미입력·false면 §154⑩1호 불충족.
   *
   * 🔑 거주기간 요건은 이 필드와 별도로 취득 시기에 따라 갈린다(2019.2.12 이후 취득 →
   * `postRegistrationResidenceMonths` 재사용 · 그 전 취득 → 일반 거주기간, `eligibility.ts` 상단 주석).
   * `rentalUnits`가 0호인 시나리오 B에서 별도 필드가 필요하지 않다 — §154⑩ 경로도 §155⑳ PHRP와
   * 같은 필드를 쓴다.
   */
  wasRegisteredRentalOrChildcare?: boolean;
};

// ============================================================
// 결과 타입
// ============================================================

/** 요건 미충족 임대주택 단위 정보 (code는 공용 predicate check.ts의 ArticleFailCode 단일 소스) */
export type RentalUnitFailReason = {
  unitIndex: number;
  code: ArticleFailCode;
  message: string;
};

/** 임대주택 호별 판정기준 echo (결과카드 P5 표시용 — 산식 무변경) */
export type RentalUnitVerdict = {
  unitIndex: number;
  derivedArticle: RentalArticle;
  requiredYears: number;
  stdPriceCap: number;
  effectiveRegDate: string; // ISO date (max 두 등록일)
  sizeRequired: boolean;    // 건설 규모요건 적용 여부
};

/** §155㉓ 「최초 말소일부터 5년 이내」 기한 echo (I-4) — 날짜는 YYYY-MM-DD */
export type CancellationWindow = {
  /** 입력한 말소 호 중 가장 먼저 말소된 날 */
  firstCancellationDate: string;
  /** 그 호(0-based) */
  firstUnitIndex: number;
  /** 역상 말일(민법 §157·§160) */
  calendarEnd: string;
  /** 기한 말일(민법 §161 — 토요일·공휴일이면 익일) — 이 날 당일까지 */
  deadline: string;
  /** 말일이 연장됐거나 공휴일 표가 그 해를 덮지 못할 때만 */
  deadlineNote?: string;
  /** 양도일이 기한 안인가 */
  withinDeadline: boolean;
};

/** 요건 판정 결과 */
export type EligibilityResult = {
  /** 전체 통과 여부 (입력한 임대주택 **전 호** 통과 + 거주주택 요건 충족 — OH-14) */
  passed: boolean;
  /** 미충족 사유 목록 */
  failReasons: RentalUnitFailReason[];
  /** 거주주택 요건 미충족 사유 (보유 2년/거주 2년) */
  residenceFailReasons: string[];
  /** 인용된 법령 조문 코드 */
  laws: string[];
  /** 호별 판정기준 echo (결과카드 표시용) */
  perUnitVerdict?: RentalUnitVerdict[];
  /**
   * 결론을 바꾸지 않는 **판정 보류·확인 필요 고지**(OH-40 생애 1회 이력 미입력 · 계획서 §7-5 분기).
   * 계산기는 warnings로, 판정 메뉴는 결과 카드로 낸다.
   */
  notices?: string[];
  /**
   * §155㉓ 5년 창(I-4) — 말소일을 입력한 말소 호가 있을 때만. 「최초로 등록이 말소되는」 호의 말소일과
   * 그 5년 기한(민법 §161 연장 반영). 결과 카드·판정 메뉴가 표시한다.
   */
  cancellationWindow?: CancellationWindow;
  /**
   * 의무임대기간을 채우기 전이라 §155㉑로 통과한 호(0-based) — ㉒ 사후 추징 안내 대상.
   * 기간을 채웠거나 ㉓ 말소 특례로 간주 충족한 호는 들어가지 않는다.
   */
  periodPendingUnitIndexes?: number[];
};

/** §161 안분 산식 추적 데이터 (결과 카드 표기용) */
export type FormulaTrace = {
  /** gain95(표1) — §95① 양도소득금액 (표1 장기보유공제 적용) */
  gain95Table1: number;
  /** gain95(표2) — §95① 양도소득금액 (표2 장기보유공제 적용, 1세대1주택 특례) */
  gain95Table2: number;
  /** r161_1 = (P_prior − P_acq) / (P_transfer − P_acq) (B1·B2-1호) */
  ratio161_1?: number;
  /** r161_2_2 = (P_transfer − P_prior) / (P_transfer − P_acq) (B2-2호) */
  ratio161_2_2?: number;
  /** r_high = (S − 12억) / S (A2·B2 — 고가주택 과세비율) */
  ratioHighValue?: number;
  /** §161③ 캡 발동 여부 */
  capApplied: boolean;
  /**
   * 적용한 고가주택 기준금액(원) — 양도일 기준 `resolveHighValueHouseThreshold`(OH-13).
   * 결과 카드가 「12억」을 리터럴로 적지 않고 이 값을 표시한다.
   */
  highValueThreshold?: number;
  /** B2 각 호 과세 양도소득금액 (1호 + 2호 합산 전 개별값) */
  part1?: number;
  part2?: number;
};

/**
 * 장기임대주택 거주주택 비과세 특례 계산 결과
 *
 * transfer-tax 엔진의 1세대1주택 비과세·고가주택 분기보다 우선 적용.
 * applied=false 시 일반 분기로 폴백.
 */
export type RentalHousingExceptionResult = {
  /** 특례 적용 여부 (요건 미충족 시 false) */
  applied: boolean;
  /** 시나리오 ID */
  scenarioId: "RH-A1" | "RH-A2" | "RH-B1" | "RH-B2";
  /** 요건 판정 결과 */
  eligibility: EligibilityResult;
  /**
   * 과세대상 양도소득금액 (원)
   * A1: 0 (전액 비과세)
   * A2: gain95(표2) × (S − 12억) / S
   * B1: gain95(표1) × r161_1
   * B2: part1 + part2
   */
  taxableGain: number;
  /**
   * 비과세 양도소득금액 (원) — 보고용
   * B 시나리오: gain95(표1) − taxableGain
   * A1: gain95(표2) 전액
   * A2: gain95(표2) × 12억 / S
   */
  exemptGain: number;
  /** 적용된 장기보유공제 표 구분 */
  appliedTable: "table-1" | "table-2" | "mixed";
  /** §161 산식 추적 데이터 */
  formulaTrace: FormulaTrace;
};
