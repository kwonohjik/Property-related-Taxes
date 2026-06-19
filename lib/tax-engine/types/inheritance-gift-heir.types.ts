/**
 * 상속인·동거가족·주주 정보 타입 — inheritance-gift.types.ts에서 분리 (800줄 정책, 2026-06-19).
 *
 * Heir·CohabitantDependent·ShareholderInfo·HeirAllocation + §23의2② 부득이사유.
 * leaf 파일(외부 타입 의존 없음). estate·deduction 타입이 HeirAllocation·Heir·CohabitantDependent를 import.
 */

// ============================================================
// §23의2② 부득이사유 타입 (Phase 4 — 2026-06-07)
// ============================================================

/**
 * §23의2② + 상증령 §20의2② + 시행규칙 §9의2 부득이한 사유 유형.
 *
 * 법령 근거 (KoreanLaw MST 283637·284609 실측):
 *   conscription:          §20의2②1호 직접 열거 (징집)
 *   schooling:             §20의2②2호 + 시행규칙 §9의2①1호 (고교·대학·국내대학원; 초·중학교 제외)
 *   work:                  §20의2②2호 + 시행규칙 §9의2①2호 (근무상 형편)
 *   medical:               §20의2②2호 + 시행규칙 §9의2①3호 (1년 이상 질병 요양)
 *   reconstruction_lease:  해석례 미확인(교재 재산-248 근거) → INCLUDED(차감 없음) + UI amber 경고
 *   overseas_grad:         시행규칙 §9의2①1호 적용 불가(국내 고등교육법 학교 한정) → NOT_RECOGNIZED + 계속성 경고
 *
 * 효과 분류:
 *   EXCLUDED (conscription·schooling·work·medical): §23의2② 본문 — 계속 동거 인정, 동거기간 차감
 *   INCLUDED (reconstruction_lease): 해석례상 차감 배제 — rawYears에 그대로 포함
 *   NOT_RECOGNIZED (overseas_grad): 법정 사유 미해당 — 차감 없음 + 계속성 단절 경고
 */
export type CohabitReasonType =
  | "conscription"         // 징집 (§20의2②1호) → EXCLUDED
  | "schooling"            // 취학 — 고교·대학·국내대학원 (시행규칙 §9의2①1호) → EXCLUDED
  | "work"                 // 근무상 형편 (시행규칙 §9의2①2호) → EXCLUDED
  | "medical"              // 질병 요양 1년 이상 (시행규칙 §9의2①3호) → EXCLUDED
  | "reconstruction_lease" // 재건축 전세 — 해석례 미확인(교재 근거) → INCLUDED
  | "overseas_grad";       // 국외 대학원 — 법정 사유 미해당 → NOT_RECOGNIZED

/**
 * §23의2② 부득이한 사유 1건.
 *
 * 입력 규칙:
 *   - startDate·endDate: YYYY-MM-DD (ISO date string)
 *   - startDate < endDate 검증은 Zod에서 .superRefine() 처리
 *   - 기간이 동거기간(cohabitStartDate~deathDate) 밖이면 엔진이 clamp 처리
 */
export interface CohabitReason {
  type: CohabitReasonType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

// ============================================================
// 상속인 정보
// ============================================================

/** 상속인 관계 */
export type HeirRelation =
  | "spouse"
  | "child"
  | "lineal_ascendant"
  | "sibling"
  | "other"
  // ===== 종합사례 PDF 확장 (Design §2-0) =====
  | "legatee"         // 비상속인 수유자 (자연인, 예: 손녀)
  | "corporate";      // 비상속인 영리법인 수증자

/** 상속인 정보 */
export interface Heir {
  id: string;
  relation: HeirRelation;
  name?: string;
  /** 주민등록번호 (각 신고서 인적사항 칸 — 계산 미사용, 식별정보) */
  residentNumber?: string;
  birthDate?: string;
  isDisabled?: boolean;
  /**
   * 성별 — 장애인공제(§20①4호) 성별·연령별 기대여명 계산용.
   * 장애인(isDisabled===true) 시 필수. 미입력 시 validation 차단 (자동추정 금지).
   * 미성년자·연로자공제는 성별 불필요.
   */
  gender?: "male" | "female";
  /**
   * 태아 여부 — §20①1호·2호 "태아를 포함한다" (2023.1.1.~).
   * 자녀공제(1호): count 포함. 미성년자공제(2호): 만 0세 간주 → (19−0)×1천만=1.9억.
   * 시행령 §18② 신고기한 내 임신 확인 서류 제출 요건.
   */
  isFetus?: boolean;
  /**
   * @deprecated 2026-05-26 — 전역 협의분할 비율 폐지. 협의분할은 자산별 `heirAllocations`로 일원화,
   * 미입력 자산은 법정상속분 자동 배분(`inheritance-legal-share.ts`). 엔진 미사용 —
   * sessionStorage 기존 데이터 호환을 위해 타입만 잔류(validator/UI 제거됨).
   */
  actualShareRatio?: number;
  isCohabitant?: boolean;
  // ===== 종합사례 PDF 확장 =====
  /** 상속인 vs 수유자·영리법인 구분. 미입력 시 relation으로 자동 추론. */
  isHeir?: boolean;
  /**
   * 영리법인 여부 (relation === "corporate"일 때만 의미) — Step1에서 결정 (donee-phase2).
   * undefined·true = 영리법인(§3의2② 면제·산출세액 상당액 자동), false = 비영리법인(§3의2② 미적용).
   * 미설정 시 영리법인으로 간주(기존 corporate Heir 호환).
   */
  isForProfit?: boolean;
  /** 세대생략 수유자(직계비속 손자녀) — §27 ② 30%/40% 할증 대상 */
  isGenerationSkipBeneficiary?: boolean;
  /**
   * 민법 §1001 대습상속 여부 — 상증법 §27 단서(세대생략 할증 배제).
   * isGenerationSkipBeneficiary(직계비속 세대생략)이면서 대습상속(부모 사망·결격으로 갈음 상속)인 경우 true
   * → §27 할증 전액 배제(30%·40% 모두). 자동 판정 불가 → 사용자 명시.
   * v1: 직계비속 대습(§1001)·배우자 대습(§1003②) 미구분 — generic 1플래그가 양자 포괄.
   * 신규(2026-06-09): substituteGroupId 보유 시 cohabit-helpers가 본 플래그와 동치 처리(파생).
   */
  isSubstituteInheritance?: boolean;

  // ===== 대습상속 법정상속분 반영 (민법 §1001·§1003②·§1010, 2026-06-09) =====
  /**
   * 대습상속 그룹 식별자 — 같은 피대습자(상속개시 전 사망·결격된 자녀·형제)를 갈음하는
   * 대습상속인들이 공유. 존재 시 이 Heir는 **대습상속인**(실제 상속인) —
   * computeLegalShares가 피대습 슬롯을 §1010②로 재분배한다.
   * 피대습자는 별도 Heir 엔트리로 만들지 않음(그룹키 방식). relation은 표시용,
   * 그룹 판정은 본 필드 단독(enum substring 매칭 금지).
   */
  substituteGroupId?: string;
  /**
   * 피대습자의 원래 상속순위 — §1001은 1순위(직계비속)·3순위(형제자매)만 대습 가능.
   * "child"=사망 자녀 / "sibling"=사망 형제자매. (2순위 직계존속·배우자 본인 대습 없음)
   * computeLegalShares가 어느 그룹 슬롯을 차지하는지 결정.
   */
  substituteForRelation?: "child" | "sibling";
  /**
   * 대습 그룹 내 역할 — §1010②/§1009 재분배 비율(통일 가중치 spouse=3·descendant=2).
   * "spouse"=피대습자의 배우자(며느리·사위·형수·매부, §1003②) /
   * "descendant"=피대습자의 직계비속(손자녀·조카).
   */
  substituteRole?: "spouse" | "descendant";
  /**
   * 피대습자(상속개시 전 사망·결격된 자녀·형제) 성명 — **표시 전용**(엔진 미사용).
   * 같은 substituteGroupId 멤버가 공유. UI 그룹 라벨("故 {name} 갈음")·신고서 표시에만 사용.
   */
  substituteAncestorName?: string;

  /**
   * §27 미성년 여부 수동 override (3-state).
   * - undefined: birthDate 기반 자동 판정 (differenceInYears(deathDate, birthDate) < 19, 민법 §4)
   * - true:  강제 미성년 처리 (연령 개정 대비 or birthDate 미입력 시 수동)
   * - false: 강제 성년 처리 (자동 판정 결과 무효화)
   */
  isMinorOverride?: boolean;
  /**
   * 영리법인 수증자 사전증여 당시 증여세 산출세액 (§3의2② 면제 한도용).
   * ※ 현재 입력 UI·API 경로 없음 — ⑩a 배부 표는 PriorGift.corporateGiftComputedTax(doneeId 합산)를
   *   단일 진실로 사용(inheritance-allocation.ts). 이 Heir 필드는 하위호환 fallback만 잔류.
   */
  corporateGiftComputedTax?: number;

  // ===== PR 2 (2026-05-22) — 부표 5 영리법인 면제 및 납부 명세서 =====
  /**
   * 영리법인 사업자등록번호 — 별지 제9호서식 부표 5 ② 컬럼.
   * relation === "corporate" 일 때만 의미.
   */
  businessRegistrationNumber?: string;
  /**
   * 영리법인 사업장 소재지 — 별지 제9호서식 부표 5 ③ 컬럼.
   * relation === "corporate" 일 때만 의미.
   */
  businessAddress?: string;
  /**
   * 영리법인 주주 중 상속인·직계비속 명세 (부표 5 나. 표).
   *
   * 상증법 §3의2② 작성방법 6:
   *   ⑪ 면제분 납부세액 = [면제세액(⑤) − 유증가액(④)×10%] × 지분율(⑩)
   *
   * relation === "corporate" 일 때만 의미.
   * 합 ≤ 1.0 (외부 주주 — 상속인 아닌 자 — 보유분은 명세 제외, validate 미차단)
   */
  shareholders?: ShareholderInfo[];

  // ===== Phase 2 (2026-06-07) — §23의2①1호 동거기간 검증 =====
  /**
   * §23의2①1호 동거 시작일 (ISO date, YYYY-MM-DD).
   * - 입력 시: 엔진이 deathDate와의 차이로 동거연수 계산, result.cohabitDeductionDetail.cohabitYears에 echo.
   * - 미입력 시: 동거기간 자동 검증 생략 — isCohabitant 체크박스(사용자 확인) 신뢰.
   *   (자동 안분 fallback 금지 정책 부합 — validation 오류 아님)
   */
  cohabitStartDate?: string;

  /**
   * §23의2② + 상증령 §20의2 부득이한 사유(징집·취학·근무상 형편·질병 요양)로 동거에서 제외할 연수.
   * 해당 기간은 계속 동거로 인정되나 동거기간에는 산입하지 아니함.
   *
   * @deprecated Phase 4에서 cohabitReasons(구조화 배열)로 대체. 역직렬화 호환을 위해 타입에 잔류.
   *  신규 입력 UI에서는 숨김. 엔진: cohabitReasons가 존재하면 cohabitReasons 우선,
   *  undefined이면 이 필드 fallback.
   */
  cohabitExcludedYears?: number;

  // ===== Phase 4 (2026-06-07) — §23의2② 부득이사유 구조화 배열 =====
  /**
   * §23의2② 부득이한 사유 배열 (Phase 4 신규).
   *
   * - undefined: 사유 미입력 → cohabitExcludedYears(legacy) fallback 또는 차감 없음.
   * - []:        사유 없음 → excludedYears=0.
   * - [...]:     사유 입력됨 → 유형별 자동 집계.
   *
   * 법령 근거 (KoreanLaw MST 283637·284609 실측):
   *   CohabitReasonType 참조.
   */
  cohabitReasons?: CohabitReason[];
}

/**
 * 동거가족 (시행령 §18① — 상속개시일 현재 피상속인이 사실상 부양하는
 * 직계존비속(배우자의 직계존속 포함)·형제자매). 상속인이 아닌 부양가족.
 * §20①2~4호 미성년·연로자·장애인공제 대상 (자녀공제 §20①1호는 제외).
 * P1 — 별도 배열(옵션 B): heirs[] 무변경, calcPersonalDeductions 3rd 인자.
 */
export interface CohabitantDependent {
  id: string;
  name?: string;
  /** YYYY-MM-DD — 미성년·연로자 판정 (상속개시일 현재 만 나이) */
  birthDate?: string;
  isDisabled?: boolean;
  /** 장애인(isDisabled) 시 필수 — §20①4호 성별·연령별 기대여명 */
  gender?: "male" | "female";
  /**
   * 시령 §18① 제한: 직계존비속(배우자의 직계존속 포함)·형제자매.
   * - lineal_ascendant: 부·모·조부모·장인·장모(배우자 직계존속 포함)
   * - lineal_descendant: 손자·손녀 (HeirRelation엔 없는 신규 값 — 본 타입 전용)
   * - sibling: 형제자매
   */
  relation: "lineal_ascendant" | "lineal_descendant" | "sibling";
}

/**
 * PR 2 — 영리법인 주주 명세 (부표 5 나. 표).
 *
 * §3의2② 본문: "그 영리법인의 주주 또는 출자자 중 상속인, 상속인의 배우자,
 * 상속인의 직계비속 또는 그 직계비속의 배우자"
 */
export interface ShareholderInfo {
  id: string;
  /**
   * 부표 5 ⑦ 구분.
   *   - "heir": 상속인
   *   - "heir_spouse": 상속인의 배우자
   *   - "lineal_descendant_of_heir": 상속인의 직계비속
   *   - "spouse_of_lineal_descendant": 직계비속의 배우자
   */
  relation:
    | "heir"
    | "heir_spouse"
    | "lineal_descendant_of_heir"
    | "spouse_of_lineal_descendant";
  /**
   * ⑦에서 "입력된 상속인"을 선택한 경우 그 Heir.id.
   * 미설정 = 기타 관계(수동 입력).
   * 엔진 미사용 — 신고서 표시·연결 추적 전용.
   */
  heirRef?: string;
  /** 부표 5 ⑧ 성명 */
  name: string;
  /** 부표 5 ⑨ 주민등록번호 (옵션 — 신고서 표시용) */
  residentNumber?: string;
  /** 부표 5 ⑩ 지분율. 0 ≤ r ≤ 1 (1=100%). 합 ≤1 (외부 주주분 제외) */
  shareRatio: number;
}

// ============================================================
// 자산-수준 협의분할 (Design §2-1)
// ============================================================

export interface HeirAllocation {
  /** Heir.id 참조 */
  heirId: string;
  /** 분배 금액 (원). 합계 = 자산 평가액 */
  amount: number;
  /** 분배 면적 (선택, 표시용) */
  areaM2?: number;
}
