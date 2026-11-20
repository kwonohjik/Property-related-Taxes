/**
 * DisclaimerBanner — 면책 고지 배너
 * 모든 계산 결과 화면에 표시 (법적 리스크 방지)
 */
/** 판정 메뉴(1세대1주택 비과세 · 다주택 중과) 결과 화면용 문구 — 세액이 아니라 판정을 낸다(2026-11 리뷰 I-13). */
export const JUDGMENT_DISCLAIMER =
  "본 판정 결과는 참고용이며 법적 효력이 없습니다. 세법 해석 및 개별 사안의 사실관계에 따라 판정이 달라질 수 있습니다. 정확한 판단은 세무 전문가와 상담하시기 바랍니다.";

export function DisclaimerBanner({ body }: { body?: string } = {}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
      <p className="font-semibold mb-0.5">⚠️ 면책 고지</p>
      <p>
        {body ??
          "본 계산 결과는 참고용이며 법적 효력이 없습니다. 세법 해석 및 개별 사안에 따라 실제 세액이 다를 수 있습니다. 정확한 세금 신고는 세무 전문가와 상담하시기 바랍니다."}
      </p>
    </div>
  );
}
