/**
 * 단건 양도세 마법사가 다건 편집 화면(`/calc/transfer-tax/multi`)에 임베드됐는가.
 *
 * 다건 편집은 단건 `<TransferTaxCalculator>`를 그대로 임베드한다(`MultiTransferTaxCalculator.tsx` 편집 단계). 마법사(`TransferTaxCalculator`)와
 * 그 안의 입력 섹션이 **같은 판정**을 쓰도록 한 곳에 둔다 — 한쪽만 바뀌면 ⑤(화면)와 ⑧(검증)이 갈린다.
 */
export function isEmbeddedInMultiPath(pathname: string | null | undefined): boolean {
  return pathname?.includes("/multi") ?? false;
}
