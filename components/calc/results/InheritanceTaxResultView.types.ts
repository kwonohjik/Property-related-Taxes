/**
 * InheritanceTaxResultView — Props 타입 + 자산 카테고리 라벨 상수.
 * 800줄 정책에 따라 InheritanceTaxResultView.tsx에서 분리 (2026-06-09).
 */
import type {
  EstateItem,
  InheritanceTaxResult,
  Heir,
  PriorGift,
  DebtItem,
  PresumedInheritanceItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FamilyBusinessInheritanceInput } from "@/lib/tax-engine/types/inheritance-family-business.types";

/**
 * 재산 평가 내역 표시명 — 사용자가 자산 이름(name)을 비우면 내부 id(prop-…·stock-…) 대신
 * 카테고리 한글 라벨 표시. (출처: CategoryChangeDialog CATEGORY_LABELS + listed/unlisted_stock)
 */
export const ASSET_CATEGORY_LABELS: Record<EstateItem["category"], string> = {
  real_estate_land: "토지",
  real_estate_building: "상업용 건물",
  real_estate_apartment: "주택",
  listed_stock: "상장주식",
  unlisted_stock: "비상장주식",
  cash: "현금",
  financial: "예금·펀드·채권·공제금",
  deposit: "전세보증금 반환채권",
  other: "기타 재산",
};

export interface InheritanceTaxResultViewProps {
  result: InheritanceTaxResult;
  onReset: () => void;
  onBack: () => void;
  /** 1단계로 이동 (입력값 보존) */
  onGoToFirst?: () => void;
  showLoginPrompt?: boolean;
  /** 상속인·수유자·영리법인 배열 — HeirAllocationSummaryTable 표시용 */
  heirs?: Heir[];
  /** 채무·공과·장례비 협의분할 항목 (방안 C — undefined: OFF 모드) */
  debtItems?: DebtItem[];
  /** 상속재산 입력 — §22 카운트 계산용 */
  estateItems?: EstateItem[];
  /** 사전증여 행별 명세 — InheritanceFilingFormTable 표시용 (Phase 3) */
  priorGifts?: PriorGift[];
  /** 상속개시일 (ISO date) — InheritanceFilingFormTable 13년 cutoff 분기용 */
  deathDate?: string;
  /** 추정상속재산 입력 — SourceDataSummarySection Table B용 (2026-05-28) */
  presumedItems?: PresumedInheritanceItem[];
  /** 가업상속 입력 — 별지 제1호서식(가업상속공제신고서) 나·다 칸용 */
  familyBusinessInput?: FamilyBusinessInheritanceInput;
  /** 피상속인 성명 — 각 신고서 인적사항 칸 (계산 미사용, 식별정보) */
  decedentName?: string;
  /** 피상속인 주민등록번호 — 각 신고서 인적사항 칸 */
  decedentResidentNumber?: string;
  /** 저장된 계산 id — 서버 PDF 선택 출력(PR-2)용. 미저장/비로그인 시 undefined */
  savedId?: string;
  /** 연부연납 입력 (Step4, §71·§72) — 결정세액 미영향 투영 */
  installmentEnabled?: boolean;
  installmentYears?: string;
  installmentFamilyBusiness?: boolean;
  installmentFbMode?: "straight20" | "grace10";
  installmentFutureRate?: string;
  /** 분납 입력 (Step4, §70②) — 연부연납과 배타. 결정세액 미영향 투영 */
  splitPaymentEnabled?: boolean;
  splitPaymentAmount?: string;
  /** 물납 입력 (Step4, §73) — 결정세액 미영향 투영 */
  paymentInKindEnabled?: boolean;
  paymentInKindIneligibleAmount?: string;
  paymentInKindRequestedAmount?: string;
  /** 거주자/비거주자 — 연부연납 신고기한 6/9개월 산정 (§67④) */
  decedentType?: "resident" | "non_resident";
}
