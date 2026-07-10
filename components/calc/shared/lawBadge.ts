/**
 * lawBadge — 법령 조문 인용 배지 공용 클래스 (blue).
 *
 * 5개 파일(InheritedAcquisitionDeemedSection·PreDeemedInputs·PostDeemedInputs·
 * HouseValuationSection·UnconditionalExemptionSection)에 동일 문자열로 중복 정의되던 것을
 * 단일 소스로 추출 (계획서 docs/02-design/features/ui-color-tone-tokenization.plan.md §2.3.2).
 *
 * blue는 카드 톤 축(tones.ts `Tone`)이 아니라 법령배지 전용 → 별도 상수로 유지.
 */
export const LAW_BADGE_CLASS =
  "inline-flex items-center rounded px-1.5 py-0.5 text-caption font-medium " +
  "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 " +
  "hover:bg-blue-100 dark:hover:bg-blue-950/70 transition-colors shrink-0 whitespace-nowrap cursor-pointer";
