/**
 * 외화 통화 코드 선택지 — 해외주식(§118의2~) · 국외전출세(§118의13) **공용 단일 소스**
 *
 * 종전에는 `ForeignStockBlock.tsx` 안에 로컬 상수로 있었다. 국외전출세도 외국납부세액을
 * 외화로 받게 되면서 같은 목록이 필요해졌는데, 복사하면 한쪽만 늘어나 목록이 갈린다.
 */
export const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD — 미국 달러" },
  { value: "JPY", label: "JPY — 일본 엔" },
  { value: "EUR", label: "EUR — 유로" },
  { value: "HKD", label: "HKD — 홍콩 달러" },
  { value: "CNY", label: "CNY — 중국 위안" },
  { value: "GBP", label: "GBP — 영국 파운드" },
  { value: "OTHER", label: "기타 (직접 입력)" },
] as const;
