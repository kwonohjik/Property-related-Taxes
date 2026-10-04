/**
 * 판례(prec) 데이터출처별 본문 JSON 제공 여부 — 판례 탭(클라이언트)과 cite-check(서버)가 같은 판정을 쓴다.
 *
 * 2026-10-04 실측: 대법원·지방세법령정보시스템·근로복지공단산재판례 = 제공 / 국세법령정보시스템 = 「본문 제공 불가」.
 * 🔴 종전엔 /대법원/(cite-check)·`=== "대법원"`(판례 탭 배지)만 봐서 본문이 있는 지방세 출처 판결까지
 *    「없음」으로 다뤘다. 근거: __tests__/korean-law/cite-check-source-gap.anchor.test.ts
 */
export function hasFullTextSource(source: string): boolean {
  return /대법원|지방세법령정보시스템|근로복지공단산재판례/.test(source);
}
