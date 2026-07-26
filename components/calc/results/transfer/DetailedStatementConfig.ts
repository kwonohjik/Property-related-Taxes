/**
 * 양도세 상세 계산명세서 — 타입·그룹 정의 (DetailedStatementHelpers.ts 800줄 정책 분리, 2026-07-01).
 * 순수 상수·인터페이스만. buildStatementItems 등 로직은 DetailedStatementHelpers.ts.
 * 하위 호환: DetailedStatementHelpers.ts가 이 파일을 re-export하므로 기존 import 경로 유지.
 */
import type { ReactNode } from "react";

// ── 자산별 분해 ──────────────────────────────────────────────────

export interface PerAssetValue {
  /** 자산 라벨 (예: "토지(1001)", "건물(3001)") */
  label: string;
  /** 표시할 값 (숫자=금액, 문자열=날짜·기간 등) */
  value: number | string;
  /** 자산별 산식·메모 (선택) */
  formula?: string;
}

// ── 항목 단위 ────────────────────────────────────────────────────

export interface StatementItem {
  /** 신고서 양식 표의 항목 라벨과 일치 */
  label: string;
  /** 산식·계산 과정 설명 (예: "양도가액 - 취득가액 - 필요경비"). ReactNode 허용 — Frac 분수 표기(PR #746 표준) */
  formula?: ReactNode;
  /** 실제 계산 결과 값 — 숫자=금액(formatKRW), 문자열=날짜/기간 */
  value: number | string | null;
  /** 법령 근거 (LawArticleModal에 전달) */
  legalBasis?: string;
  /** 추가 설명 (산식만으로 부족한 경우) */
  note?: string;
  /** 다건 모드 자산별 분해 (있는 경우만 disclosure로 펼침) */
  perAsset?: PerAssetValue[];
  /** 합계만 표시 가능 항목 (자산별 산정 의미 없음) */
  summaryOnly?: boolean;
}

export interface GroupDef {
  id: string;
  /** 그룹 헤더 라벨 (예: "1단계: 양도차익 산정") */
  title: string;
  /** 색조 — UI 색상 카드 패턴 (sky·emerald·amber·violet·rose) */
  tone: "sky" | "emerald" | "amber" | "violet" | "rose" | "slate";
  /** 그룹에 포함할 itemKey 순서 */
  itemKeys: string[];
}

// ── 그룹 정의 ────────────────────────────────────────────────────

export const STATEMENT_GROUPS: GroupDef[] = [
  // 일자·기간 그룹은 신고서 양식 표 헤더에 이미 표시되므로 명세서에서는 생략 (사용자 요청 2026-05-12).
  {
    id: "gain",
    title: "1단계 — 양도차익 산정",
    tone: "emerald",
    itemKeys: [
      "transferPrice",
      "acquisitionPrice",
      "expenses",
      "transferGain",
      "exemptGain",
      "taxableGain",
    ],
  },
  {
    id: "ltDeduction",
    title: "2단계 — 장기보유특별공제 (§95②)",
    tone: "amber",
    // 겸용은 주택분/상가분 키(ltHousing*·ltCommercialPart)만, 그 외는 ltHoldingPart/ltResidencePart만
    // Map에 set됨 — 미설정 키는 렌더러가 자동 skip(부분별 vs 합산 자동 분기).
    itemKeys: [
      "ltDeduction",
      "ltHousingPart",
      "ltHousingHolding",
      "ltHousingResidence",
      "ltCommercialPart",
      "ltHoldingPart",
      "ltResidencePart",
    ],
  },
  {
    id: "income",
    title: "3단계 — 양도소득금액·기본공제",
    tone: "violet",
    itemKeys: [
      "incomeAmount",
      "nontaxableIncome",
      "reductionTargetIncome",
      "reductionTargetIncome2",
      "incomeAmountAfter",
      "priorIncomeAmount",
      "basicDeduction",
    ],
  },
  // 다건 합산 절차 — 다건 모드에서만 활성 항목이 있음 (단건 모드는 빈 그룹으로 자동 미렌더).
  // §102② 차손통산·§103 기본공제 배분·§104⑤ 비교과세 등 다건 전용 합산 step 노출.
  {
    id: "aggregate",
    title: "4단계 — 다건 합산 절차 (§102②·§103·§104⑤)",
    tone: "violet",
    itemKeys: ["lossOffset", "basicDeductionAggregate", "comparedTaxation"],
  },
  {
    id: "tax",
    title: "5단계 — 세액 산정",
    tone: "rose",
    itemKeys: [
      "taxBase",
      "calculatedTax",
      "reductionTax",
      "determinedTax",
    ],
  },
  {
    id: "penalty",
    title: "6단계 — 가산세·총결정세액",
    tone: "slate",
    itemKeys: ["penaltyTax", "totalDeterminedTax"],
  },
  {
    id: "local",
    title: "7단계 — 부가세·지방세",
    tone: "sky",
    itemKeys: [
      "ruralSurtax",
      "localCalculatedTax",
      "localReduction",
      "localDeterminedTax",
    ],
  },
];
