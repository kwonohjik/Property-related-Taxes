/**
 * DisclaimerBanner — 면책 고지 배너
 * 모든 계산 결과 화면에 표시 (법적 리스크 방지)
 */
export function DisclaimerBanner() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
      <p className="font-semibold mb-0.5">⚠️ 면책 고지</p>
      <p>
        본 계산 결과는 참고용이며 법적 효력이 없습니다. 세법 해석 및 개별 사안에 따라 실제 세액이
        다를 수 있습니다. 정확한 세금 신고는 세무 전문가와 상담하시기 바랍니다.
      </p>
    </div>
  );
}
