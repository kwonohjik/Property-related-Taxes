/** TransferTaxCalculator 단계 라벨·Props — 800줄 정책 격리 */

export const STEPS_SINGLE = ["자산 목록", "보유 상황", "감면·공제", "가산세"] as const;
export const STEP_TITLES = [
  "자산 목록·취득 정보 입력",
  "보유 상황 입력",
  "감면 확인",
  "가산세 입력",
] as const;

export interface TransferTaxCalculatorProps {
  /** 다건 모드: 현재 자산 저장 후 새 자산 추가 (마법사 step 0으로 리셋) */
  onSaveAndAddNext?: () => void;
  /** 다건 모드: 현재 자산 저장 후 공통 설정 단계로 이동 */
  onSaveAndGoToSettings?: () => void;
  /**
   * 다건 모드: 자산 편집 첫 단계에서 **자산 목록으로 복귀**.
   *
   * 🔴 없으면 하단 좌측이 `WizardBackNav`의 `HomeButton`으로 떨어져 **다건 흐름을
   *    통째로 벗어난다**(R03). `handleBack`의 `if (!isEmbeddedInMulti) router.push("/")`
   *    가드는 step 0에서 `onBack` 자체가 호출되지 않아 **사문화**돼 있었다
   *    (`WizardNav.tsx:56` — isFirstStep이면 HomeButton을 직접 렌더한다).
   */
  onBackToList?: () => void;
}
