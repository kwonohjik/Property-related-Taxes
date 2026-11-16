/**
 * FilingFormTable Props·행/열 타입 — `FilingFormTableHelpers.ts`에서 분리(800줄 정책, 타입 전용).
 * 기존 import 경로(`./FilingFormTableHelpers`)는 그 파일의 re-export로 유지한다.
 */
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type {
  AggregateTransferResult,
  PerPropertyBreakdown,
} from "@/lib/tax-engine/types/transfer-aggregate.types";

// ── Props ──────────────────────────────────────────────────────

/**
 * 다자산 합산(aggregate) 모드 메타 — 사례 27 등 묶음매매·합산신고에서 사용.
 * 자산별 컬럼 + 합계 컬럼으로 단건과 동일한 32행 신고서 양식 표 렌더.
 */
export interface AggregateMeta {
  properties: PerPropertyBreakdown[];
  aggregated: AggregateTransferResult;
  /** propertyId → 지분율 매핑 (헤더 "지분 X%" 배지) */
  ownershipMap?: Map<string, { numerator: number; denominator: number }>;
  /**
   * propertyId → 토지 성격 매핑 (헤더 "자산 N (부수토지)" / "(독립 나대지)" suffix용).
   * 사례 28 landNature 명시 입력 정책에 따라 토지 자산은 성격을 명시.
   */
  landNatureMap?: Map<string, "appurtenant" | "standalone">;
  /**
   * propertyId → 해당 property의 form (다건 multi 전용 — 자산별 양도일·취득일·거주기간 파생).
   * multi는 N개 개별 filing이라 각 property가 자기 form을 가짐. bundled(1 formData) 미주입 시 기존 formData 폴백.
   */
  propertyFormMap?: Map<string, TransferFormData>;
}

export interface FilingFormTableProps {
  result: TransferTaxResult;
  /** 단건 모드에서 폼 데이터 — 미제공 시 합계 열만 결과 기반으로 표시 */
  formData?: TransferFormData;
  /** 다건 모드에서 자산별 표 렌더 시 해당 자산 1개 */
  asset?: AssetForm;
  /** 단건 모드 자산 가액 (formData.contractTotalPrice 우선) */
  transferPriceOverride?: number;
  /**
   * 다자산 합산 모드 — 본 prop이 존재하면 단건/분리 detail보다 우선해
   * `aggregate` 모드 컬럼(합계 + 자산별)으로 32행 표 렌더.
   */
  aggregate?: AggregateMeta;
  /** 헤더 우측 출력 버튼 핸들러 */
  onPrint?: () => void;
  /**
   * 취득일자 라벨 보조 텍스트 — carryover_gift 모드에서 어느 날짜인지 명확화.
   * 예: "(증여자 취득일)" / "(증여 등기접수일)"
   */
  acquisitionDateLabel?: string;
  /**
   * 취득일자 표시값 override — carryover_gift Scenario A에서 증여자 취득일을 표시하기 위함.
   * 자산-수준 acquisitionDate(등기접수일)와 별도로 보유기간/장특공 기산점인 증여자 취득일을 우선 표시.
   * "YYYY-MM-DD" 또는 빈 문자열.
   */
  acquisitionDateOverride?: string;
  /** 헤더 제목 — 기본값 "신고서 양식". Scenario A/B 구분 시 사용. */
  title?: string;
  /** 헤더 서브타이틀 */
  subtitle?: string;
  /** 채택 여부 강조 스타일 */
  adopted?: boolean;
  /**
   * 재개발/재건축 양도 대상 — deriveColumns 컬럼 모드 결정용.
   * "right" + redevSettlementDirection="pay" → 3열 모드 (redev-right-pay).
   * 미제공 시 기본 4열 모드 (redev-4split).
   */
  redevSubject?: "right" | "apt";
  /**
   * 재개발 청산금 방향 — redev-right-pay 모드 활성화 조건.
   */
  redevSettlementDirection?: "pay" | "receive";
}

// ── 내부 타입 ──────────────────────────────────────────────────

export type ColumnKey = string;

export interface Column {
  key: ColumnKey;
  label: string;
}

export interface RowDef {
  label: string;
  /** 열별 값 (number=금액, string=날짜·기간 등) */
  values: Record<ColumnKey, number | string | null>;
  /** 들여쓰기 (보유분/거주분 장특공제 등) */
  indent?: boolean;
  /** 강조 (결정세액·총결정세액·과세표준 등) */
  highlight?: boolean;
  /** 구분선 (섹션 구분) */
  separatorAfter?: boolean;
  /**
   * 열별 주석 — 특수 세율 분기(부수토지 일체과세 등) 시 세율 근거를 산출세액 행 셀 아래에 표시.
   * 예: { "primary": "주택·부수토지 일체과세 / §104①2호·영§167의5 / 재산세제과-1354" }
   */
  notes?: Record<ColumnKey, string>;
  /**
   * 열별 rose 색상 주석 — §95② 본문 괄호 배제 등 법령 경고를 붉은 색으로 표시.
   * 예: { "postApproval": "§95② 본문 괄호 배제" }
   */
  roseNotes?: Record<ColumnKey, string>;
  /** 표 아래 「※」 안내 한 줄 — 이 행의 값 해석이 칸마다 다를 때(합산 표 자산별 세액 칸 등). */
  footnote?: string;
}
