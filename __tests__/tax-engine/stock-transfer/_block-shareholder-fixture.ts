/**
 * §94①4 다목 게이트 **통과** 픽스처 — 기존 테스트가 「다목 = 기타자산」을 단언할 때 쓴다.
 *
 * 2026-09-13 이전에는 토글 `isQualifyingBlockShareholder` 하나로 분류가 결정돼 요건 입력이
 * 필요 없었다. 게이트가 생기면서 **요건 4칸이 필수**가 됐고, 기존 픽스처 26건이 그 값을
 * 갖고 있지 않아 빨개졌다. 단언 자체는 그대로 맞다(전부 **요건 충족** 케이스다) —
 * 빠진 것은 입력이다.
 *
 * ⚠️ `firstTransferDate` 는 각 픽스처의 **양도일 기준**으로 넘긴다. 상수로 박으면 양도일이
 *    2017년인 픽스처에서 「최초 양도일이 미래」가 되어 창이 깨진다.
 */
export function passingBlockShareholderGate(transferDate: Date) {
  // 합산기간 최초 양도일 — 양도일의 1년 전(3년 창 **안**).
  const first = new Date(transferDate);
  first.setFullYear(first.getFullYear() - 1);
  return {
    isQualifyingBlockShareholder: true as const,
    /** 요건① 부동산등 65% (임계 50% 이상) */
    blockShareholderRealEstateRatio: 0.65,
    /** 요건② 소유비율 70% — 「초과」·「이상」 어느 시기 규정에서도 통과 */
    blockShareholderOwnershipRatio: 0.7,
    /** 요건③ 누적 양도비율 70% (임계 50% 이상) */
    cumulativeTransferRatio: 0.7,
    aggregationFirstTransferDate: first,
  };
}
