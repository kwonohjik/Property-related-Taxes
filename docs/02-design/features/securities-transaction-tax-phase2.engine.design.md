# 증권거래세 Phase 2 (연도별 탄력세율 + 다자산 합산 echo) — 엔진 설계

> 계획서: `docs/00-pm/securities-transaction-tax-phase2.plan.md` · 13단계 자가 검토 STEP 5 산출물
> 선행: Phase 1 설계 `securities-transaction-tax.engine.design.md` (현행 세율·2경로 echo — 완료)

## Context

- Phase 1 완료 상태에서 **세율 결정만 구간화** — `calcSecuritiesTransactionTax` 시그니처·`SecuritiesTransactionTaxResult` 타입·호출부 3곳(메인 STEP 12.5·buildExemptResult·Step3 inline) **전부 무변경**.
- 추가 1: 역사 세율 정적 상수(`lib/tax-engine/data/`) + 내부 resolve 헬퍼.
- 추가 2: `StockTransferAggregateResult.totalSecuritiesTransactionTax` 합산 필드(엔진만 — UI 미연결 실측).
- ⚠️ Phase 1 결함 동시 정정: 경고 경계 1일 오류(2026-01-02 → 영 36001호 2026.1.1 시행) — 코드 주석·legal-codes 인용 포함.

## ★ 케이스 인벤토리 (계획서 §2-4·§3-2와 1:1 — anchor ID 동일)

| # | 케이스 | 입력 (양도가액 100,000,000) | 기대 산출 | 비고 |
|---|---|---|---|---|
| A-01 | 2021 코스피 | 2021-06-15 | 80,000 + 농특 150,000 | 영 31290호 단서 |
| A-02 | 2021 코스닥 | 〃 | 230,000 | |
| A-03 | 2021 코넥스 | 〃 | 100,000 | |
| A-04 | 2021 K-OTC | 〃 | 230,000 | V-2 확인 후 확정 |
| A-05 | 2021 비상장 | 〃 | 430,000 | 법 §8① 단서 43 |
| A-06~10 | 2023 5시장 | 2023-06-15 | 50,000+150,000 / 200,000 / 100,000 / 200,000 / 350,000 | 영 33209호 단서 |
| A-11~15 | 2024 5시장 | 2024-06-15 | 30,000+150,000 / 180,000 / 100,000 / 180,000 / 350,000 | 〃 |
| A-16~20 | 2025 5시장 | 2025-06-15 | **0+150,000(농특만)** / 150,000 / 100,000 / 150,000 / 350,000 | 영 33209호→35359호 §5 본문(2024 단서 만료 — 두 버전 동일 세율) |
| A-21~25 | 현행 5시장 | 2026-06-15 | 50,000+150,000 / 200,000 / 100,000 / 200,000 / 350,000 | 영 36001호. Phase 1 STX-01~05 동치 |
| A-26 | 경계 | 2022-12-31 코스닥 | 230,000 | 2021 구간 말일 |
| A-27 | 경계 | 2023-01-01 코스닥 | 200,000 | 2023 구간 첫날 |
| A-28 | 경계 | 2025-12-31 코스피 | 0 + 150,000 + **경고 없음** | Phase 1 STX-09(경고 기대) 대체 |
| A-29 | 경계 | 2026-01-01 코스피 | 50,000 + 150,000 + **경고 없음** | 신세율 첫날 — Phase 1 1일 오류 직접 검증 |
| A-30 | cutoff 미만 | 2020-12-31 코스피 | 현행 세율(50,000+150,000) + warning("미지원") | 경고 anchor 이동처 |
| A-31 | 양도일 미제공 | transferDate 생략, 코스피 | 현행 세율 + 경고 없음 | inline 미리보기 호환 |
| A-32 | 2021 초입 | 2021-01-15 코스닥 | 230,000 | 부칙 적용례 검증 완료 |
| A-33 | 기타자산 구간 무관 | 2023-06-15 other_asset | 0 + C-06 경고 (Phase 1 STX-06 유지) | resolve 미진입 |
| B-01 | 합산 2종목 | 코스피 1억 + 코스닥 1억 (2026-06-15) | total = { 증권거래세분 **250,000** (50,000+200,000) / 농특세 **150,000** / 합계 **400,000** } | 단순합 — 안분 없음 |
| B-02 | 합산 + 비과세 종목 | K-OTC 중소 비과세 1천만 + 코스피 1억 (2026-06-15) | total = { **70,000** (20,000+50,000) / **150,000** / **220,000** } | 비과세 종목 echo 포함(양도세 비과세와 독립). **Do 환류**: K-OTC 비과세 분류엔 `isListedSmallShareholder: true` 필수(§94①3 나목 단서 소액주주 — `stock-classification.ts:204-210` 실측) |

## 법령 근거 (전부 KoreanLaw 축자 검증 — §1-1 계획서 참조)

| 구간 | 근거 버전 | 인용 문자열(legal-codes) |
|---|---|---|
| 2021~2022 | 영 31290호(2021.1.1 시행) §5 단서 + 법 §8① 단서(43) | "시행령 §5 단서 (2021~2022)" + "법 §8① 단서 (2021~2022 한시 1만분의 43)" |
| 2023 | 영 33209호(2023.1.1 시행) §5 단서 | "시행령 §5 단서 (2023)" |
| 2024 | 〃 단서 | "시행령 §5 단서 (2024)" |
| 2025 | 영 33209호·35359호 §5 본문(코스피 영·3호 15 — 2024 단서 만료, 2025.2.28 개정은 §5 세율 무변경) | "시행령 §5 (2025 — 코스피 영세율)" |
| 2026.1.1~ | **영 36001호(2025.12.31 공포, 2026.1.1 시행)** §5 | "시행령 §5 (영 제36001호, 2026.1.1 시행)" |
| 농특세 | §5①5호 15/10000 — 전 구간(간접 확인: 부칙 개정 흔적 0) | Phase 1 상수 유지 |

V-2 잔여: 2021~22 §5 3호 나목(K-OTC) — 법제처 웹 원문·`chain_amendment_track` 확인 후 A-04 확정. 불일치 시 `kosdaqKotcNum` → `kosdaqNum`+`kotcNum` 분리.

## 데이터 모델 (신규 파일)

```ts
// lib/tax-engine/data/securities-transaction-tax-rates.ts
// 역사 세율 정적 상수 (memory feedback_historical_tax_tables — DB 아님)
export interface StxRatePeriod {
  /** 구간 [from, to] — new Date("YYYY-MM-DD") UTC ISO 자정 기준 (로컬 생성자 금지) */
  from: string;
  to: string | null;            // null = 현행 (개방 구간)
  kospiNum: number;
  kosdaqKotcNum: number;        // §5 3호 가·나목 동률 전제 (V-2 확인 후)
  konexNum: number;
  unlistedNum: number;          // 법 §8① (한시 단서 반영)
  reference: string;            // 구간별 인용 (위 표)
}
export const STX_RATE_DEN = 10000 as const;
export const STX_RATE_PERIODS: readonly StxRatePeriod[] = [/* 5행 — §1-2 매트릭스 */];
export const STX_CUTOFF_DATE = "2021-01-01" as const;
```

- **정렬 전제**: from 오름차순 — find 순회 매칭(memory `feedback_progressive_bracket_sort_enforcement` 준용, 모듈 로드 시 dev assert 1줄).
- anchor 기대값은 **숫자 리터럴**(법령 축자값)로만 — 상수 재사용 금지(R-3 dual-오염 방지).

## 알고리즘

```
resolveStxRates(transferDate?: Date): { period: StxRatePeriod; cutoffWarning: boolean }
1. transferDate undefined → 마지막 구간(현행, to=null) + false   // A-31
2. d < STX_CUTOFF_DATE → 현행 구간 + true                        // A-30
3. from 역순 매칭 — 마지막으로 from <= d 인 구간 (Do deviation 환류:
   설계 초안의 [from, to] 양단 비교는 시간 성분 있는 Date(2022-12-31T10:00)가
   to 상한에서 구간 사이 갭으로 빠지는 함정 → 연속 구간 전제 + from 역순으로 교체.
   to 필드는 데이터 표현·문서용으로 유지하되 매칭에는 미사용)
   — Date 비교는 전부 new Date("YYYY-MM-DD") ISO 파싱끼리 (Phase 1 :169 패턴 일관)

calcSecuritiesTransactionTax(params, transferPrice):  // 시그니처 무변경
1. other_asset → Phase 1 C-06 zero+경고 그대로 (resolve 미진입)  // A-33
2. const { p, cutoffWarning } = resolveStxRates(params.transferDate)
3. num 선택: isKOTCTrading&&unlisted → p.kosdaqKotcNum / kospi → p.kospiNum / ...
4. floor(transferPrice * num / STX_RATE_DEN), 농특세는 kospi만 15 (구간 무관)
5. warning: cutoffWarning ? STOCK_STX.WARNING_UNSUPPORTED_PERIOD : undefined
   — Phase 1 WARNING_PRIOR_DATE("2026-01-02 시행 …") 상수는 문구 교체
6. rateReference = p.reference 기반 조합 (코스피 농특세 병기)

calculateStockTransferTaxAggregate(...): // 양 분기 공통
  totalSecuritiesTransactionTax = sumSecuritiesTransactionTax(items)
  // 이미 floor된 종목별 값의 단순합 — 안분·잔액흡수 비해당 (주석 명기)
  // Do 환류: 합산 헬퍼·SecuritiesTransactionTaxTotal 타입은 stock-transfer-tax.ts가 아닌
  // securities-transaction-tax.ts에 배치 (800줄 정책 — 814줄 도달로 응집 모듈에 이동)
```

## 타입 변경

```ts
// StockTransferAggregateResult 확장 (stock-transfer-tax.ts)
totalSecuritiesTransactionTax: {        // 필수 — 두 분기 모두 채움
  securitiesTransactionTax: number;
  agriculturalTax: number;
  totalTax: number;
};
// ⚠️ 현재 aggregate UI 소비자 없음(실측) — 향후 다자산 UI 연결 시 14지점 재점검 대상 주석 명기
// 필수 필드 파급 실측: 테스트(case-aggregate-multi-stock.test.ts)는 전부 함수 호출 수신 —
// 객체 리터럴 수동 생성 0건. 생성처 = calculateStockTransferTaxAggregate 2분기 return만 → 안전.
```

`SecuritiesTransactionTaxResult`·`SecuritiesTaxParams`·`StockTransferResult.securitiesTransactionTax` — **무변경**.

## Phase 1 정정 동반 작업 (경계 1일 오류)

| 위치 | 현재 (오류) | 정정 |
|---|---|---|
| `securities-transaction-tax.ts:169` | `RATE_CHANGE_DATE = new Date("2026-01-02")` | resolve 도입으로 상수 자체 삭제 |
| 동 파일 주석 :7~17, :97, :167-168 | "2026.01.02 시행" | "영 제36001호(2025.12.31 공포, 2026.1.1 시행)" |
| `legal-codes/stock.ts` STOCK_STX 주석·rateReference | 〃 | 〃 |
| `securities-transaction-tax.test.ts` STX-09 | warning 기대 | A-28 법령 정합값으로 대체 |
| Phase 1 계획서 §6·§4 | "2026.01.02 시행" | 정정 + Phase 2 역링크 |
| memory `project_stock_transfer_securities_tax` | "2026 개정 시행일 = 1.2" | "영 36001호 2026.1.1 시행 (1.2는 타법 오귀속)" |

## Silent fallback 점검

- 없음. cutoff 미만·미제공은 **경고 동반 명시 fallback**(현행 세율) — Phase 1 동작 연속.
- 구간 미매칭 이론 케이스(정렬 가정 위반)는 dev assert + 현행 구간 fallback + warning.

## 테스트 약속

- 파일: 기존 `__tests__/tax-engine/stock-transfer/securities-transaction-tax.test.ts` 확장 (A-01~33) + aggregate는 기존 aggregate 테스트 파일 또는 동 파일 내 describe (B-01·02).
- **Pre-Do anchor**: A-28·A-29 2건 우선 작성·실행 — 현행 코드에서 실패 확보(A-28: 경고 발생+5/10000 적용 → 기대 0+무경고 / A-29: 경고 발생 → 기대 무경고) 후 구현.
- 전 anchor 원단위 `toBe()` — 숫자 리터럴.
- 회귀: Phase 1 STX-01~08·10~13 유지(STX-09만 A-28 대체), stock-transfer 도메인 610+ 전체, `npm test` 전체.

## UI 통합 위임 (→ phase2.ui.design.md)

- ⑦ 코스피 0%(2025 구간) 카드 표시 — 산식 행 "× 0.00%" 대신 영세율 안내 1행.
- 경고 문구 교체(엔진 소관 문자열 — UI 변경 없음 확인).
- E2E 1건 추가(2025 코스피 → 농특세만 150,000).
- 그 외 카드·게이트·인쇄 — 변경 없음 확인만.
