/**
 * 양도소득세 토지/건물 분리 계산 결과 타입 (소득세법 §166⑥)
 * 800줄 정책 준수를 위해 transfer.types.ts 에서 분리. 하위 호환을 위해 transfer.types.ts 가 재수출.
 */
import type { PreHousingDisclosureResult } from "./transfer-phd.types";
import type { HousingExpropriationValuationDetail } from "../transfer-tax-expropriation-valuation";
import type { SaleSplitExemption, SaleSplitPair } from "../sale-split-deemed-unclear";
import type { Sec100_3Era } from "../data/sec100-3-split-era";
import type { ApportionBasisKind, AppraisalRejectReason } from "../sale-split-apportion-basis";
import type { CarryoverExclusionReason } from "../transfer-tax-carryover-eligibility";
import type { FilingUnitCarryoverComparison } from "../transfer-tax-aggregate-carryover-scope";

/**
 * §164⑨ 1호 건물 split 토지분 산출근거 (총액 3후보) — Record(Map 금지, JSON 소실).
 *
 * 시행규칙 §80⑧이 "보상기초 기준시가 = 토지 개별공시지가"로 한정 → split의 **토지분 분모만**
 * min[]으로 낮춘다(건물분은 "보상기초" 개념 부재로 미적용, 계획 D16-GB와 동형).
 * `SplitGainResult`에 부착되어 `TransferTaxResult.splitDetail`을 통해 결과 카드에 도달한다.
 *
 * 타입을 여기(split 결과 파일)에 두는 이유: `SplitGainResult`가 이 필드를 담으므로 co-locate.
 * `transfer-tax-expropriation-valuation.ts`의 `applySplitLandExpropriationValuation`이 이 타입을 import한다
 * (반대 방향이면 expropriation-valuation ↔ transfer.types ↔ split-gain.types 타입 순환).
 */
export interface SplitLandExpropriationValuationDetail {
  /** 양도시 토지 기준시가 총액 (분할 토지분 환산 분모) */
  landStdTotal: number;
  /** 토지분 보상액 총액 */
  compensationTotal: number;
  /** 토지분 보상액 산정 기초 기준시가 총액 */
  compensationBasisTotal: number;
  /** 적용값 = min(3) */
  chosen: number;
  /** 환산 분모(총액) = chosen */
  denominator: number;
}

/**
 * 개별주택가격(결합 공시 — 소득세법 §99①1호 라목)을 취득시 토지분·건물분으로 **비례 안분**한 내역
 * (S3-1, 2026-10). 일반 주택 비-별개 취득에서만 존재한다 — 별개 취득(파트 독립)·일반건물·구 resultData는 없다.
 *
 * `landBasis = floor(housingTotal × landStd ÷ (landStd + buildingStd))`, `buildingBasis = housingTotal − landBasis`.
 * 표시 계층은 이 값을 **그대로 읽는다** — 재계산하면 엔진과 어긋난다(`feedback_engine_result_display_drift`).
 */
export interface StdSplitDetail {
  /** 취득시 개별주택가격(결합 공시) */
  housingTotal: number;
  /** 토지 기준시가(가목) = ㎡당 개별공시지가 × 면적 */
  landStd: number;
  /** 건물 기준시가(나목) */
  buildingStd: number;
  /** 안분된 토지분 */
  landBasis: number;
  /** 안분된 건물분 (잔액 흡수) */
  buildingBasis: number;
}

/**
 * 영 §163⑨ 단서 비교 echo — 비교가 적용된 파트만. 금액은 지분 스케일 후(①②가 같은 축).
 * 토지 파트 = 단서 1호(`sec163_9_1`, ② 영 §164④ 가액) · 건물 파트 = 단서 2호(`sec163_9_2`, ② 영 §164⑦ 가액의 건물 몫)
 * · 토지 파트(주택 부수토지) = 단서 2호(`sec163_9_2_land`, ② 영 §164⑦ 가액의 토지 몫 — D1-H).
 * 타입명은 토지 전용 시절 그대로다(개명은 호출처만 늘려 별칭 유지).
 */
export interface LandAcquisitionBasis {
  rule: "sec163_9_1" | "sec163_9_2" | "sec163_9_2_land";
  /** ① 상속개시일·증여일 평가액 */
  reported: number;
  /** ② 토지 = 영 §164④ 가액(또는 §164⑦ 가액의 토지 몫) · 건물 = 영 §164⑦ 가액의 건물 몫 */
  sec164: number;
  /** 많은 금액 쪽 — 동점은 reported(①② 우선) */
  adopted: "reported" | "sec164" | "converted";
  /**
   * ③ 환산취득가액(지분 반영) — 1985.1.1. 전 상속·증여 토지 파트만(3자 max — 계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §13).
   * 채택되면 그 파트는 추계(개산공제 · §97②2호 단서 비교)로 계산된다.
   */
  converted?: number;
  /** 1985.1.1. 전 상속·증여 **건물** 파트(D2) — ③을 비교하지 않았다(Q-9 a: 척도 불일치·해석례 미확보 · 확인 필요 고지) */
  preDeemedUncompared?: true;
}

/**
 * 파트 이월과세(소득세법 §97의2①) echo — 이월과세 입력이 있던 파트만(`SplitPartResult.carryover`). 표시 전용·세액 불변.
 * 생성은 해결자(`transfer-tax-split-carryover.ts`) 한 곳이다. 설계: transfer-split-part-carryover.engine.design.md §7.
 */
export interface SplitPartCarryoverEcho {
  /** 이 파트에 §97의2①을 적용했는가(A) / 적용하지 않았는가(B) */
  judgment: "applied" | "excluded";
  /** 미적용 사유 — 적격 판정(①·③·②1호) 사유 또는 ②3호(`tax_comparison`) */
  exclusionReason?: CarryoverExclusionReason | "tax_comparison";
  /** 증여자의 취득일(YYYY-MM-DD) — 적용 시 장특·세율 기산일(§95④ 단서·§104②2호) */
  donorAcquisitionDate: string;
  /**
   * 증여자의 취득 당시 금액(§97의2①1호) — 입력 그대로. **환산 입력(`estimated`)이면 없다**(가액을 받지 않는다 — 0으로 채우면 «취득가액 0»으로 읽힌다).
   */
  donorAcquisitionPrice?: number;
  /**
   * 증여자 취득가액을 환산취득가액(§97①1호 나목, 증여자 취득 당시 그 파트 기준시가)으로 계산한 파트(P6) — 환산 입력일 때만 존재한다.
   * 분자(`donorStdPriceAtAcquisition`)는 입력 그대로(물건 전체 값 — 지분 스케일 없음)이고, 나머지 셋은 **이월과세를 적용(A)한 파트**에서만 싣는다
   * (미적용(B) 파트는 수증자 취득가액(증여 신고가액)으로 계산해 환산을 쓰지 않았다). 채움은 `attachSplitCarryoverEcho`가 파트 결과에서 읽는다.
   */
  estimated?: SplitPartCarryoverEstimatedEcho;
  /**
   * 증여자 자본적지출(§97의2①2호)로 필요경비에 더한 금액 — 미적용 파트·2024.1.1. 전 양도분은 0.
   * 환산 파트는 이 금액이 §97②2호 단서 나목(자본적지출 + 양도비) 비교에 들어간 값이다 — 실제 필요경비에 들어갔는지는 파트 결과의 `swapApplied`로 갈린다.
   */
  donorCapexAdded: number;
  /** 양도일이 2024.1.1. 전이라 증여자 자본적지출을 0으로 처리했는가 */
  donorCapexGuardApplied: boolean;
  /** 증여 당시 평가액 = 증여세 상당액 안분 분자 = 미적용(B) 시 취득가액 */
  giftDateValuation: number;
  /** 영 §163의2② 안분 증여세 상당액 — **한도 전** */
  giftTaxApportioned: number;
  /** 한도 = 이 파트의 양도차익(영 §163의2② 후단) — 적격이 아니면 0 */
  giftTaxLimitCap: number;
  /** 필요경비에 실제로 더한 증여세 상당액(미적용 파트는 0) — echo `directExpenses`에는 이 값이 섞여 있다 */
  giftTaxAddedToExpense: number;
  giftTaxLimitApplied: boolean;
  /** §97의2②3호 비교 — 신고 전체 결정세액. 적격 판정에서 이미 배제된 파트는 없다 */
  comparison?: FilingUnitCarryoverComparison;
}

/** `SplitPartCarryoverEcho.estimated` — 파트 환산(P6). 환산취득가액 = 파트 양도가액 × 분자 ÷ 분모, 개산공제 = 분자 × 3%(영 §163⑥, 지분 반영). */
export interface SplitPartCarryoverEstimatedEcho {
  /** 환산취득가액의 분자 — 증여자 취득 당시 이 파트 기준시가(물건 전체 값, 입력 그대로) */
  donorStdPriceAtAcquisition: number;
  /** 분모 — 양도 당시 이 파트 기준시가(엔진이 실제 쓴 값). 적용(A) 파트만 */
  stdPriceAtTransfer?: number;
  /** 환산취득가액 — 적용(A) 파트만(= 파트 `acquisitionPrice`. §97②2호 단서 swap이면 필요경비로 차감되지 않는다 — `swapApplied`) */
  estimatedAcquisitionPrice?: number;
  /** 개산공제(분자 × 3%, 지분 반영) 산출액 — 적용(A) 파트만. swap이면 파트 `appraisalDeduction`은 0이지만 이 값은 비교에 쓰인 산출액이다 */
  lumpDeduction?: number;
}

/** 파트 이월과세의 증여 사건 echo (`SplitGainResult.carryoverEvent`) */
export interface SplitCarryoverEventEcho {
  giftRegistryDate: string;
  giftTaxCalculated: number;
  giftTaxBase: number;
  /** §97의2③ 적용기간(증여 등기접수일 기준 5년 / 10년) */
  applicablePeriodYears: 5 | 10;
  /**
   * 두 파트 모두 ②3호 비교 대상인데 **안정 구성이 둘**이라(토지·건물이 서로를 가리는 단기 구간) 판정 순서(토지 → 건물)가 결과를 가른다 — 결과뷰 「확인 필요」 고지.
   * 참일 때만 싣는다(생략 = 해당 없음). 세액은 바꾸지 않는다(순서는 N-1과 같은 순차 고정점으로 고정이다 — 설계서 §4.2).
   */
  orderDependent?: true;
  /**
   * §97의2②2호(P5) — 적격 파트를 전부 적용하면 1세대1주택(딸린 토지 포함) 양도에 해당하게 되고 전부 미적용이면 해당하지 않아
   * 모든 적격 파트에 ①을 적용하지 않았다. 파트 echo의 `exclusionReason`은 `one_house_exemption`이고 ②3호 비교는 하지 않았다(`comparison` 없음).
   * 참일 때만 싣는다.
   */
  oneHouseExclusion?: true;
  /** 위 조합이지만 배우자 예외(증여일 현재 1세대1주택을 배우자로부터 통째로 증여받음 — C만)로 ②2호를 적용하지 않았다. 참일 때만 싣는다. */
  spouseOneHouseExceptionApplied?: true;
}

/** 토지/건물 분리 계산 결과 */
export interface SplitPartResult {
  transferPrice: number;
  acquisitionPrice: number;
  /** 영 §163⑨ 단서 비교 결과 — 비교가 적용된 파트만(토지 = 1호 · 건물 = 2호, 구 결과·단서 밖은 생략) */
  acquisitionBasis?: LandAcquisitionBasis;
  directExpenses: number;
  appraisalDeduction: number;
  /** 취득시 기준시가 — 물건 전체(100%) 값 */
  stdPriceAtAcq?: number;
  /**
   * 양도시 기준시가(환산 분모로 **실제 쓴 값** — 결합 공시 비례 안분·§164⑨1호 공익수용 min[] 적용 후). 그 파트가 환산(estimated)일 때만 싣는다.
   * 건물은 §114조의2① 증축부분 환산취득가(`resolveSplitBuildingPenaltyAxis`)의 분모이기도 하다. 토지는 P6(파트 이월과세 환산 echo)부터 싣는다.
   */
  stdPriceAtTransfer?: number;
  /**
   * 개산공제 base로 **실제 사용된 값** = `floor(취득시 기준시가 × 지분율)`.
   * 표시 산식 「… × 3%」가 표시된 개산공제를 그대로 만들어내게 하는 echo다 — 100% 기준시가를
   * 노출하면 지분 자산에서 산식이 자기 값을 못 만든다(`feedback_engine_result_display_drift`).
   * 단독소유면 기준시가와 같다.
   */
  lumpDeductionBase?: number;
  /**
   * 개산공제에 **실제 적용한 율**(0.03 · 미등기 0.003) — 개산공제 base를 가진 파트(`stdPriceAtAcq`가 있는
   * 환산·감정·매매사례 파트)에만 채운다. 결과 카드 「× 3%」 리터럴 대신 이 값을 읽는다(미등기 split은 0.3%
   * 인데 3%로 표기되면 「50,000,000 × 3%」가 표시된 150,000을 못 만든다 — E-U3, 표시 전용).
   * 구 `resultData`에는 없다 — 소비처는 `undefined`면 종전 표기를 유지한다.
   */
  lumpDeductionRate?: number;
  gain: number;
  /**
   * 이 파트의 **과세 대상** 양도차익 — 12억 안분(영 §160①)·1세대1주택 비과세 제외를 반영한 값.
   *
   * `gain`은 안분 **전** 양도차익이라 `longTermDeduction`(안분 후 기준)과 축이 다르다. 파트별
   * 세율(§104⑤)처럼 "파트 양도소득금액 = 과세 양도차익 − 장특공제"가 필요한 소비자는 이 값을 써야
   * 한다. `calcLongTermHoldingDeduction`의 split 분기가 채운다 — 미설정 시 소비자는 `gain` fallback.
   */
  taxableGainAfterProration?: number;
  holdingYears: number;
  longTermRate: number;
  longTermDeduction: number;
  /**
   * 장기보유특별공제의 **보유기간분·거주기간분 분해 echo**(표시 전용·세액 불변 — E-1). 소유 파트에만 채운다
   * (`selfOwns`로 제외된 파트·구 `resultData`는 `undefined`). 공제율은 `longTermRate`와 같은 **분수**(0.4 = 40%)
   * 이고 정수 % 단위로 나눈 뒤 되돌린 값이다(`0.68 − 0.4` 같은 double 뺄셈 금지). 표1·단일축 시기(2009~2020
   * 표2)는 거주분이 0이다. 금액은 `거주분 = floor(공제액 × 거주% ÷ (보유% + 거주%))`, `보유분 = 공제액 − 거주분`
   * (잔액 흡수) — 겸용 echo(`buildHousingLthdEcho`)와 같은 규약이라 `보유분 + 거주분 = longTermDeduction`.
   */
  holdingDeductionRate?: number;
  residenceDeductionRate?: number;
  holdingDeductionAmount?: number;
  residenceDeductionAmount?: number;
  /**
   * 소득세법 기본통칙 95-0…1 적용 echo(표시 전용·세액은 `longTermRate`·`longTermDeduction`이 정본) — **토지 파트**이고
   * 1세대1주택 표2 대상이며 토지가 주택(건물)보다 보유기간이 오래된 경우에만 채운다. 표1(토지 전체 보유기간)과
   * 표2(주택 부수토지로서의 보유기간 = 건물 보유연수) 중 **큰 공제율**을 `longTermRate`로 삼았다는 사실이다.
   * 표시 계층은 이 값을 **그대로 읽는다**(재계산 금지).
   */
  appurtenantLthd?: {
    /** 「주택 부수토지로서의 보유기간」 — 건물(주택) 보유연수 */
    houseHoldingYears: number;
    /** 표1(토지 전체 보유기간) 공제율 */
    table1Rate: number;
    /** 표2(건물 보유연수 + 거주) 공제율 */
    table2Rate: number;
    /** 표1이 적용됐다(표1 ≥ 표2) */
    table1Applied: boolean;
    /** 통칙을 적용하지 않았다면(토지 자신의 보유연수로 표2) 나왔을 공제율과 값이 달라졌다 — 고지 게이트 */
    changedFromOwnYears: boolean;
    /** 고지의 근거 인용·독법 병기 판정(양도일 연혁) — 표시 계층이 그대로 읽는다 */
    basis: { source: "circular" | "ruling"; twoAxis: boolean };
  };
  /** §97② 단서 swap 발동 여부 (자산 단위) */
  swapApplied?: boolean;
  /** 파트별 취득 방식 echo (결과뷰 라벨 전용, 계산 로직 무영향) */
  acqMode?: "actual" | "estimated" | "appraisal" | "salesCase";
  /**
   * 이 파트의 **취득시 기준시가**가 결합 총액에서 역산된 값인가 (결과뷰 fine-print 전용).
   *
   * ⚠️ 결함 표식이 아니다 — 의미가 propertyType별로 정반대다:
   *  · 주택(라목): 개별·공동주택가격이 부수토지 포함 결합 공시라 역산이 **법정 정상 경로**다.
   *  · 일반 건물: 가목·나목이 각각 공시되므로 역산은 건물 취득시점이 섞인 **한시 후퇴**다.
   * UI 문구는 propertyType으로 갈라 쓸 것.
   */
  stdPriceDerivedFromTotal?: boolean;
  /*
   * ── 파트 취득원인·기산일 echo (D1-3, 표시 전용 · 세액 불변) ──
   * 생성은 `buildSplitPartCauseEcho`(`transfer-split-part-echo.ts`) 한 곳이다. 구 `resultData`에는 없다 —
   * 소비처는 `undefined`면 라벨을 내지 않고 종전 표기를 유지한다.
   */
  /**
   * 이 파트의 **유효 취득원인** — 토지: `landAcquisitionCause ?? acquisitionCause`(엔진 컨벤션), 건물: `acquisitionCause`.
   * 입력이 미지정이면 **생략**한다(「매매」로 지어내지 않는다).
   */
  acquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction" | "burdened_gift";
  /**
   * 이 파트의 취득일(YYYY-MM-DD) — 상속개시일·증여일(영 §162①5호) / 매매 취득일 = **장특 기산일**(법 §95④).
   * 해당 시나리오가 실제로 쓴 취득일 = 장특 기산일이다. 이월과세(§95④ 단서) 적용(A) 파트는 증여자 취득일, 배제(B) 파트는 증여 등기접수일이다.
   * (가업상속공제 자산은 여전히 이 분리 계산의 범위 밖이다.)
   */
  acquisitionDate?: string;
  /** 법 §104② 세율 보유기간 **법정 기산일**(YYYY-MM-DD) — 단서 1호(피상속인)·2호(증여자) 적용 후, 주택 `max` 적용 **전**. */
  rateBasisAcquisitionDate?: string;
  /** 위 기산일을 정한 규칙 — 표시 계층이 날짜 비교로 재추론하지 않게 엔진이 직접 말한다. */
  rateBasisRule?: "own" | "decedent" | "donor";
  /**
   * **파트 세율 판정에 쓰였을** 기산일(YYYY-MM-DD) — 주택 토지 파트는 `max(법정 기산일, 건물 취득일)`
   * (주택부수토지로서의 보유기간 — `resolveAppurtenantLandRateBasisDate`), 그 밖은 법정 기산일과 같다.
   * 파트 세율이 모두 같아 자산 단위 경로로 계산된 경우에도 세액은 같다(설계 R-4).
   */
  appliedRateBasisDate?: string;
  /**
   * 구주택 멸실·신축 통산(`landRebuildPriorHouse`)이 적용된 **토지 파트**만 — 세율 보유기간을 정한 두 구간·합산 개월·등가 기산일.
   * 이때 `appliedRateBasisDate`는 실제 취득일이 아니라 합산 개월을 만드는 **등가 기산일**(= `equivalentBasisDate`)이다 — 표시는 이 echo를 우선 읽는다.
   * 장기보유특별공제·건물 파트는 불변이다.
   */
  rateHoldingAggregation?: SplitRateHoldingAggregation;
  /** 파트 이월과세(§97의2①) echo — 이월과세 입력이 있던 파트만. 생략 = 그 파트는 이월과세 입력 없음 */
  carryover?: SplitPartCarryoverEcho;
}

/**
 * 주택 부수토지 배율 초과분 = 비사업용 토지 (G-2).
 *
 * 「소득세법」 제104조의3 제1항 제5호가 "주택부속토지 중 주택 정착면적에 지역별 배율을 곱하여
 * 산정한 면적을 초과하는 토지"를 **명문으로 비사업용 토지로 규정**한다(배율 위임 = 같은 법
 * 시행령 제168조의12). ⇒ 1세대1주택 비과세 대상이 아니고, 토지 본래 보유기간 기준
 * 누진세율 + 10%p 중과(§104①8호), 장기보유특별공제는 표1이다.
 *
 * 「소득세법」 제104조 제5항 후단("한 필지의 토지가 비사업용 토지와 그 외의 토지로 구분되는
 * 경우에는 각각을 별개의 자산으로 보아 산출세액을 계산한다")이 이 분리의 직접 근거다.
 */
export interface SplitNonBusinessLandPart {
  /** 인정 한도 면적 = 건물 정착면적 × 배율 */
  limitArea: number;
  /** 한도 초과 면적 (㎡) */
  excessArea: number;
  /** 적용 배율 (3/5/10 — 2022.1.1. 전 양도분은 종전 규정) */
  appliedMultiplier: number;
  /** 토지 양도차익 중 초과면적 비율만큼 이전한 금액 — 12억 안분 대상이 아니다 */
  gain: number;
  /** 과세 대상 양도차익 (= `gain` — 안분하지 않는다). `SplitPartResult`와 축을 맞추기 위한 echo */
  taxableGainAfterProration?: number;
  /** 토지 본래 보유연수 */
  holdingYears: number;
  /** 장기보유특별공제율 (표1) */
  longTermRate: number;
  longTermDeduction: number;
}

/**
 * G-3 — 주택보다 **나중에 취득**해 영 §154① 보유요건에 못 미치는 부수토지분(배율 초과분 제외)을 §155⑳ 특례 경로가 비과세 범위에서 뗀 내역.
 * 일반 경로는 같은 사실을 `land.taxableGainAfterProration`(안분 없이 전액)으로 싣고, 특례 경로는 토지 파트를 주택분(`rhe`)에서 통째로 빼므로
 * 파트 echo(`land.longTermDeduction` 등 — 주택분 기준)만으로는 이 토지분의 양도차익·공제가 보이지 않아 따로 싣는다. 세액에는 영향이 없다.
 */
export interface SplitLaterLandPart {
  /** 비과세에서 빠져 전액 과세되는 토지분 양도차익(배율 초과분 제외) */
  gain: number;
  /** 토지 본래 보유연수 */
  holdingYears: number;
  /** 장기보유특별공제율 (표1 — 보유요건 미달 토지분은 보유 3년 미만이라 0) */
  longTermRate: number;
  longTermDeduction: number;
}

/**
 * §100③ 「구분 기장 가액이 안분 가액과 30% 이상 차이 → 불분명 의제」 판정 결과.
 *
 * 「소득세법」 제100조 제3항의 적용 내역이다. 구분 기재가 **없는** 일괄양도에는 비교 대상이
 * 존재하지 않으므로 이 필드가 **없다**(`{deemedUnclear:false}`로 메우면 "판정했고 통과했다"로
 * 침묵 오표시된다).
 *
 * 표시 계층(결과 카드·신고서 각주)은 이 값을 **그대로 읽는다** — 이탈률을 재계산하면 엔진 판정과
 * 어긋난다(메모리 `feedback_engine_result_display_drift`).
 */
export interface SaleSplitJudgmentDetail {
  /** 「불분명한 때로 본다」 발동 여부 */
  deemedUnclear: boolean;
  /** 구분 기장 가액 — 한쪽만 입력된 경우 반대쪽은 `총액 − 입력값`으로 도출된 값 */
  declared: SaleSplitPair;
  /**
   * 안분 가액 — 부가령 §64① basis 서열 적용 결과.
   * **양도일 2016.1.1. 전(`era === "none"`)에는 생략**한다 — 그 구간은 판정이 없어 안분값을 만들지 않는다.
   */
  apportioned?: SaleSplitPair;
  /** 실제 적용된 가액 = 발동 시 `apportioned`, 아니면 `declared` */
  applied: SaleSplitPair;
  /** 안분에 쓴 basis 종류 (감정평가가액 / 기준시가) — `apportioned`와 함께 `none`에서는 생략 */
  basisKind?: ApportionBasisKind;
  /** 이탈률 (basis point — 1% = 100) */
  landDeviationBp: number;
  buildingDeviationBp: number;
  /** 그 파트가 30% 이상 벗어났는가 — **예외가 적용돼 발동을 면했어도 사실은 기록한다** */
  landOver: boolean;
  buildingOver: boolean;
  /** §166⑧ 예외로 발동을 면한 경우의 사유 */
  exemptionApplied?: SaleSplitExemption;
  /** 양도일로 본 §100③ 적용 구간 — 표시 계층이 문구를 가르는 값(재계산 금지) */
  era: Sec100_3Era;
  /** 예외가 입력됐으나 양도일이 단서 시행(2025.1.1.) 전이라 무시한 경우의 사유 — 침묵 후퇴 금지 */
  exemptionIgnoredByEra?: SaleSplitExemption;
  /**
   * 감정평가가액을 basis로 **쓰지 못한 사유** — 감정 입력이 있었는데 배제된 경우만 채운다
   * (`out_of_window` 시기 요건 이탈 · `incomplete` 한쪽 미평가).
   *
   * 서열상 감정이 기준시가를 이기므로(부가령 §64①1호 단서), 감정을 넣었는데 기준시가로 안분되면
   * 사용자는 **이유를 알 수 없다**. 침묵 후퇴를 막으려고 결과에 싣는다(Phase 1-E).
   */
  appraisalRejected?: AppraisalRejectReason;
}

/**
 * 취득 당시 계약서 토지·건물 구분금액의 §100③ 판정 결과 (#17-6) — 같은 날 취득한 주택의 배율 초과분 분리 경로에서
 * 계약서 구분금액을 입력한 경우에만 존재한다(미입력 = 키 없음 = 종전 기준시가 안분).
 *
 * `outcome`
 *  - `contract` 구분 기장 가액이 안분 가액과 30% 미만 차이 → 계약서 구분금액 적용
 *  - `deemed_unclear` 토지·건물 중 한쪽이라도 30% 이상 차이 → 불분명으로 보아 기준시가 안분 가액 적용
 *  - `exempt_other_law` 30% 이상 차이가 있으나 영 §166⑧1호(다른 법령 구분)로 계약서 구분금액 적용(양도일 2025.1.1. 이후)
 *  - `before_effective` 양도일 2016.1.1. 전 — 판정 없이 계약서 구분금액 적용
 * 이탈률(bp)은 엔진 값을 표시 계층이 그대로 읽는다(재계산 금지).
 */
export interface AcqSplitJudgmentDetail {
  outcome: "contract" | "deemed_unclear" | "exempt_other_law" | "before_effective";
  declared: SaleSplitPair;
  apportioned: SaleSplitPair;
  applied: SaleSplitPair;
  landDeviationBp: number;
  buildingDeviationBp: number;
  landOver: boolean;
  buildingOver: boolean;
}

export interface SplitGainResult {
  land: SplitPartResult;
  building: SplitPartResult;
  /** 배율 초과 부수토지(비사업용 토지) 파트 — 초과분이 있을 때만 (G-2) */
  nonBusinessLandPart?: SplitNonBusinessLandPart;
  /** G-3 나중 취득 부수토지분 — §155⑳ 특례 경로가 비과세에서 뗄 때만 (`SplitLaterLandPart`) */
  laterLandPart?: SplitLaterLandPart;
  /**
   * 취득시 기준시가 안분비율. **파트별 실지거래가액을 아는 경우에는 안분 자체를 하지 않으므로
   * 존재하지 않는다**(계획서 transfer-split-acq-std-gate-relaxation §4.3 — `{0,0}` 금지).
   */
  apportionRatio?: { land: number; building: number };
  /**
   * 취득시 개별주택가격의 토지·건물 비례 안분 내역 — **일반 주택 비-별개 취득**에서만 존재한다(S3-1).
   * UI는 이 필드의 유무로 비례 산식 표시를 분기한다(`stdPriceDerivedFromTotal`의 의미에 의존하지 않는다).
   */
  stdSplit?: StdSplitDetail;
  /**
   * §100③ 판정 내역 — **구분 기재가 있고 안분값도 산출된 경우에만** 존재한다.
   *
   * 없는 경우 2가지: ① 일괄양도(구분 기재 없음 — 비교 대상 부재) ② 양도시 기준시가·감정가액이
   * 없어 안분값을 만들 수 없음(⏳ 1-C 한시 — 계획서 §12.7이 1-D에서 필수화를 확정했다).
   */
  saleSplitJudgment?: SaleSplitJudgmentDetail;
  /**
   * 양도가액을 **구분 기재 없이 안분**했을 때 엔진이 실제로 쓴 basis 종류 — 표시 전용 echo.
   *
   * `saleSplitJudgment`와 **배타**다(구분 기재가 있으면 판정이 차고 이 값은 없다). 토지·건물 양도가액이 둘 다 비어 안분한 경우에는
   * 비교 대상이 없어 판정이 비므로, 화면이 «감정평가가액으로 나눴는가 기준시가로 나눴는가»를 알려면 이 값이 필요하다.
   * 폼에서 「구분 기재(actual)」를 골랐는데 두 칸을 비운 경우의 안내 한 줄이 읽는다(계획서 `sale-split-actual-both-empty.plan.md` §10).
   * 세액·양도가액에는 영향이 없다.
   */
  saleApportionBasisKind?: ApportionBasisKind;
  /** 취득 당시 계약서 구분금액 §100③ 판정 — 계약서 구분금액을 입력한 같은 날 취득 주택(배율 초과분 분리)에서만 (#17-6) */
  acqSplitJudgment?: AcqSplitJudgmentDetail;
  /** 파트 이월과세의 증여 사건 echo — 파트 이월과세 입력이 있을 때만 */
  carryoverEvent?: SplitCarryoverEventEcho;
  note: string;
  /** 본인 신고 부분 — UI 결과 뷰 표시용 */
  selfOwns: "both" | "building_only" | "land_only";
  /**
   * 산출세액이 파트별 §104② 기산일로 **세율을 판정한 결과인가**(D1-3, 표시 전용) — `resolveSplitAwareTax`가 낸 값을
   * 실제 세액을 쓰는 호출부(단건 STEP 7 · 다건 `assetTaxOf`)가 싣는다. `false`면 게이트(결손·소유자 분리·세율 특칙 등)로
   * 자산 단위 `calcTax`가 건물 기산일 하나로 계산했으므로 결과뷰는 파트 「세율 기산일」(`appliedRateBasisDate`)을 내지 않는다.
   * `undefined` = 세율 단계에 닿지 않음(비과세 조기반환·차손·임대 특례 경로) 또는 구 결과 — 역시 내지 않는다.
   */
  partRateBasisApplied?: boolean;
  /** §164⑦ 경로 시만 포함 — calculateTransferTax가 result.preHousingDisclosureDetail로 승격 */
  preHousingDisclosureDetail?: PreHousingDisclosureResult;
  /** §164⑨1호 건물 split 토지분 특례 산출근거 (계획 P6/D6) — 적용 시만 포함 */
  splitLandExpropriationValuationDetail?: SplitLandExpropriationValuationDetail;
  /** §164⑨1호 주택 PHD split 총액 특례 산출근거 (계획 P6b/D15) — 적용 시만 포함 */
  housingExpropriationValuationDetail?: HousingExpropriationValuationDetail;
}

/** `landRebuildPriorHouse` 통산 echo — 날짜는 YYYY-MM-DD */
export interface SplitRateHoldingAggregation {
  /** 구주택 부수토지 기간 [시작일, 멸실일] */
  priorHouse: { from: string; to: string; months: number };
  /** 신축주택 부수토지 기간 [신축 취득일, 양도일] */
  newHouse: { from: string; to: string; months: number };
  totalMonths: number;
  /** `calculateHoldingPeriod(이 날짜, 양도일)`의 개월 수가 `totalMonths`가 되는 날 */
  equivalentBasisDate: string;
  /** 구주택 시작일의 근거 — `land_basis` 토지 법정 기산일 / `input_date` 입력한 구주택 취득일 */
  startRule: "land_basis" | "input_date";
}
