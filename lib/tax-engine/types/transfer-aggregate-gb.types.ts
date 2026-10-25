/**
 * 양도소득세 다건 합산 결과 — **일반건물 echo 타입** (`transfer-aggregate.types.ts`에서 분리 · 800줄 정책).
 *
 * 소비자는 종전 경로(`./transfer-aggregate.types`)의 re-export로 계속 import한다.
 */

/**
 * **부담부증여 × 배우자등 이월과세** 판정 명세 (F27 — 일반건물 §159 분기 전용).
 *
 * 단건 경로의 `carryoverTaxationDetail`과 **다른 축**이다: 저쪽은 자산 1건의 A/B이고,
 * 이쪽은 카드 여러 장이 이루는 **신고 전체**의 A/B다(§97의2②3호가 「양도소득 **결정세액**」을
 * 비교하므로 카드 단위로는 판정할 수 없다).
 */
export interface GbBgCarryoverDetail {
  isEligible: boolean;
  applicablePeriodYears: 5 | 10;
  /** 채택 시나리오 — A: §97의2① 적용 · B: 미적용(②3호로 되돌아간 경우 포함) */
  adoptedScenario: "A" | "B";
  /** 신고단위 결정세액 — ②3호 비교의 두 항 */
  determinedTaxA: number;
  determinedTaxB: number;
  /** §95④ 단서 보유기간 기산일 */
  donorAcquisitionDate: Date;
  /** §97의2①3호 증여세 상당액 (§159 안분 단계가 한도까지 처리) */
  giftTaxAmount: number;
  /**
   * 시나리오별 카드 요약 (표시 전용 · PR-4) — 미채택 쪽 카드는 응답에 남지 않으므로 여기서만 보인다.
   * 이 필드가 생기기 전에 저장된 결과에는 없다.
   */
  scenarioA?: GbBgCarryoverScenarioSummary;
  scenarioB?: GbBgCarryoverScenarioSummary;
}

/**
 * 함께 부담부증여 묶음의 일반건물 자산 하나(비교 단위 하나)의 이월과세 명세 (PR-1 · `gb-bg-carryover-share-bundled.plan.md` §4.6).
 *
 * `determinedTaxA`·`determinedTaxB`는 **그 단위에만** ①을 적용 / 미적용했을 때의 **신고 전체** 결정세액이다(단건 엔진 단위의
 * `filingUnitComparison`과 같은 뜻). 다른 자산의 채택이 함께 정해지므로 최종 결정세액이 두 값 어느 쪽과도 다를 수 있다.
 * `scenarioA`·`scenarioB`는 최종 배정에서 이 단위만 반대 시나리오로 돌린 실행으로 만든다.
 */
export interface GbBgCarryoverUnitDetail extends GbBgCarryoverDetail {
  /** 자산 이름 — 카드 라벨 머리(`tagGbCards`)와 같은 값. */
  assetLabel: string;
}

/** §97②2호 단서 발동 비교 — 환산측(가목) < 직접측(나목)이면 나목 채택. */
/** 일반건물 부담부증여 × 이월과세(F27) 한 시나리오의 카드 요약 — 결과 화면 [A]/[B] 비교 카드용 */
export interface GbBgCarryoverScenarioSummary {
  /** 카드별 취득가액·양도차익 (토지 카드 1~3장 + 건물 카드) */
  parts: { propertyLabel: string; acquisitionPrice: number; transferGain: number }[];
  /** 보유기간 기산일 (YYYY-MM-DD) — 토지 카드·건물 카드 */
  landHoldingStartDate: string;
  buildingHoldingStartDate: string;
}

export interface GbSwapComparison { estimatedSide: number; directSide: number; chosen: "estimated" | "direct" }

/**
 * 함께 양도 일반건물 자산 하나의 결과 상세 — 단건 상세 + 그 자산의 §97②2호 단서 발동 비교.
 * 단건은 같은 값을 `AggregateTransferResult.swapComparison`에 싣는다(물건이 하나라 집계 단위와 같다).
 */
export type GbBundledAssetDetail = import("../general-building-valuation").GeneralBuildingOutput & {
  swapComparison?: GbSwapComparison;
};

/**
 * 지분 분할(축 B) 지분 하나의 결과 카드 블록 재료 — §100③ 판정 · §163⑨ 상속 표지 · 의제취득일 전 ①②③.
 * 지분마다 취득원인·평가액이 달라 물건 상세 한 벌에 실을 수 없다(`gb-fractional-result-blocks.plan.md` D-1).
 */
export type GbShareBlockEcho = Pick<
  import("../general-building-valuation").GeneralBuildingOutput,
  "saleSplitJudgment" | "acquisitionByInheritance" | "buildingAcquisitionByInheritance" | "preDeemedAcquisition"
> & {
  /** 지분 이름 — 카드 라벨 머리(`tagGbCards`)와 같은 값(「자산 1」). */
  label: string;
  ownershipRatio: number;
};

/** 일반건물 결과 상세 슬롯 — 지분 분할이면 지분별 블록 재료가 붙는다(키 = 지분 인덱스 = 카드 id 접미사). */
export type GbValuationDetail = import("../general-building-valuation").GeneralBuildingOutput & {
  shareBlockEcho?: Record<string, GbShareBlockEcho>;
};
