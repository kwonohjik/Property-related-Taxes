/**
 * 증여이익(gift_deemed) 이력 표시 — 카드·드로어가 같은 값을 쓴다(#72).
 *
 * 이 세목은 **세액이 없다**. 「납부세액」 자리에 증여재산가액을 띄운다.
 * 단건 결과는 `deemedGiftValue`, cap-table 결과(`CapitalIncreaseAllocationResult`)는
 * 수증자별 `perBeneficiary[].total`의 합이다(수증자는 각자 별개 납세의무자 — 합계는 표시용).
 */
export function deemedGiftHeadline(resultData: Record<string, unknown> | null | undefined): string {
  const v = resultData?.deemedGiftValue;
  if (typeof v === "number") return v.toLocaleString();
  const per = resultData?.perBeneficiary;
  if (Array.isArray(per) && per.length > 0) {
    const sum = per.reduce((a: number, b: { total?: unknown }) => a + (typeof b?.total === "number" ? b.total : 0), 0);
    return sum.toLocaleString();
  }
  return "-";
}
