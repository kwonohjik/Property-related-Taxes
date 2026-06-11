# 증권거래세 정보성 산출 (주식 양도세 통합) — 엔진 설계

> 계획서: `docs/00-pm/securities-transaction-tax.plan.md` (rev.2) · 13단계 자가 검토 STEP 5 산출물
> Phase 1 스코프: 현행(2026.01.02~) 세율 단일 + 2경로 echo 통합 + 과거 거래일 경고

## Context

- 기존 `lib/tax-engine/stock-transfer/securities-transaction-tax.ts`(162줄)를 **수정**(신규 파일 아님). 메인 엔진 미통합 상태에서 세율 현행화 + result 타입 echo 연결.
- 신규 입력 필드 0 — `StockTransferInput`의 기존 `marketType`·`isKOTCTrading`·`transferDate`와 STEP 2 산출 `transferPrice`만 사용.
- 호출 경로 2개: ⓐ 메인 파이프라인(STEP 12.5) ⓑ K-OTC 비과세 조기 반환(`buildExemptResult`).

## ★ 케이스 인벤토리 (필수)

| # | 케이스 | 입력 조건 | 기대 산출 | anchor ID |
|---|---|---|---|---|
| C-01 | 코스피 | `marketType="kospi"`, 양도가액 100,000,000 | 증권거래세 50,000 (5/10000) + 농특세 150,000 (15/10000) = 합계 200,000 | STX-01 |
| C-02 | 코스닥 | `marketType="kosdaq"`, 100,000,000 | 200,000 (20/10000), 농특세 0 | STX-02 |
| C-03 | 코넥스 | `marketType="konex"`, 100,000,000 | 100,000 (10/10000), 농특세 0 | STX-03 |
| C-04 | K-OTC | `marketType="unlisted"` + `isKOTCTrading=true`, 100,000,000 | 200,000 (20/10000 — 시행령 §5 3호 나목), 농특세 0 | STX-04 |
| C-05 | 비상장 장외 | `marketType="unlisted"` + `isKOTCTrading=false`, 100,000,000 | 350,000 (35/10000 — 법 §8① 본칙), 농특세 0 | STX-05 |
| C-06 | 기타자산 | `marketType="other_asset"` | 0원 + `warning` "주권 양도 해당 시 증권거래세 별도 발생 — 시장 구분 확인 필요" (법 §2 본문 — "과세 대상 아님" 단정 금지) | STX-06 |
| C-07 | floor 1원 경계 | 코스닥, 양도가액 999,999 (× 20/10000 = 1,999.998) | 1,999 (floor) — `Math.floor(999999*20/10000)`. 부동소수 `999999*0.002=1999.9979…` 와 동일하나 분수 연산으로 통일 | STX-07 |
| C-08 | floor 부동소수 불일치 실증 | 분수 vs 부동소수 결과가 갈리는 입력을 탐색 실증(예: `435,990,000 × 12/10000` 유형 — memory `feedback_applyrate_fractional_rate_one_won_error` 실측 사례 준용). Phase 1 세율(5·10·15·20·35/10000)로 불일치 입력 1건 이상 찾아 anchor 고정. 탐색 실패 시 "Phase 1 세율에서 불일치 없음"을 probe 결과로 기록 | STX-08 |
| C-09 | 과거 거래일 경고 | 코스피, `transferDate=2025-12-31` | 정상 산출 + `warning` "2026-01-02 시행 세율 적용 — 거래일 당시 세율 확인 필요" | STX-09 |
| C-10 | 경계일 경고 없음 | 코스피, `transferDate=2026-01-02` | `warning` 없음(undefined) | STX-10 |
| C-11 | K-OTC 비과세 조기 반환 echo | K-OTC + 중소기업 + 비대주주 (`buildExemptResult` 경로), per_share 10,000×1,000주 | `finalTax=0`(양도세) **그러나** `securitiesTransactionTax.totalTax=20,000` (10,000,000 × 20/10000) | STX-11 |
| C-12 | 장내 비과세 zeroing echo 보존 | 코스피 비대주주 장내(`applyExemptZeroing` 경로) | `finalTax=0` + `securitiesTransactionTax` 필드 보존(spread) | STX-12 |
| C-13 | 양도가액 0 | transferPrice=0 | 0원, 농특세 0 (음수·0 가드) | STX-13 |

## 법령 근거 (전부 KoreanLaw 현행 본문 검증 — 2026-06-11 조회)

| 항목 | 조문 | 내용 | 비고 |
|---|---|---|---|
| 과세대상 | 증권거래세법 §2 본문 | 주권·지분의 양도 전부 과세 | 기타자산 분류 무관 |
| 비과세(범위외) | 법 §2 단서 1호 | 외국증권시장 상장 주권 양도 | 해외주식·국외전출세 제외 근거 |
| 기본세율 | 법 §8① 본칙 | 35/10000 (비상장 장외) | 2021~2022 한시 43/10000 단서는 Phase 2 |
| 탄력세율 위임 | 법 §8② | 증권시장 거래분 대통령령 위임 | |
| 코스피 | 시행령 §5 1호 (2026.01.02 시행) | 5/10000 | |
| 코넥스 | 시행령 §5 2호 | 10/10000 | |
| 코스닥 | 시행령 §5 3호 가목 | 20/10000 | |
| K-OTC | 시행령 §5 3호 나목 | 20/10000 (자본시장법 영 §178① 금융투자협회 경유) | |
| 과세표준 | 법 §7①1호·2호 | 양도가액 (저가양도 시가 의제는 범위외 — disclaimer) | |
| 농특세 과세 | 농특세법 §4 7호 단서 + 영 §4③ | 유가증권시장(코스피)만 농특세 과세 | |
| 농특세 세율 | 농어촌특별세법 **§5①5호** | 15/10000 | ✅ Do 단계 축자 확인 완료(MST 285905, 2026-06-11). 초안 "6호 추정" 오류 정정 — **5호** 확정 |

법령 상수: 기존 `lib/tax-engine/legal-codes/stock.ts`(실측 확인 — `STOCK` 상수 등 기존재)에 `STOCK_STX` 상수 그룹 추가 (문자열 리터럴 금지 정책).

## 엔진 input 타입 (변경 없음 — 기존 필드만 사용)

```ts
// 사용 필드 (StockTransferInput 기존)
marketType: "kospi" | "kosdaq" | "konex" | "unlisted" | "other_asset";
isKOTCTrading: boolean;
transferDate: Date;          // C-09 경고 게이트
// + 별도 인자: transferPrice: number (STEP 2 산출 or calcTransferPriceSimple)
```

**함수 시그니처 — narrow params로 변경 (확정)**:

```ts
export interface SecuritiesTaxParams {
  marketType: StockTransferInput["marketType"];
  isKOTCTrading: boolean;
  /** 미제공 시 과거 거래일 경고 생략 (C-09 게이트 자체를 건너뜀) */
  transferDate?: Date;
}
export function calcSecuritiesTransactionTax(params: SecuritiesTaxParams, transferPrice: number): SecuritiesTransactionTaxResult
```

- 메인 엔진(ⓐⓑ)은 full `input`을 그대로 전달 — TS 구조적 타이핑으로 호환(3필드 포함).
- Step3 inline은 폼 파싱 3필드만 구성 — 기존 카드의 `as StockTransferInput` 캐스팅 hack 제거.

## 엔진 result 타입

```ts
export interface SecuritiesTransactionTaxResult {
  securitiesTransactionTax: number;  // floor(양도가액 × num / den)
  agriculturalTax: number;           // 코스피만 floor(양도가액 × 15 / 10000)
  totalTax: number;                  // 합계
  appliedRateNum: number;            // 분자 (예: 20)
  appliedRateDen: number;            // 분모 (10000)
  appliedAgriRateNum: number;        // 코스피 15, 기타 0
  rateReference: string;             // 법령 근거 문자열 (legal-codes 상수 조합)
  warning?: string;                  // C-06 기타자산 / C-09 과거 거래일
  isInformational: true;
}
// 기존 appliedRate(0.0005 등 부동소수) → Num/Den 쌍으로 교체.
// 표시용 % 는 UI에서 (num/den*100).toFixed(2) 파생.

// StockTransferResult 확장 (types/stock-transfer.types.ts)
securitiesTransactionTax?: SecuritiesTransactionTaxResult;  // optional echo — plain object (JSON-safe)
```

## 계산 알고리즘 (단계별)

```
1. marketType === "other_asset"
   → zero 결과 + warning(C-06 문구). 종료.
2. 세율 결정 (우선순위):
   a. isKOTCTrading && marketType === "unlisted" → 20/10000 (§5 3호 나목)
   b. kospi → 5/10000 + 농특세 15/10000
   c. kosdaq → 20/10000
   d. konex → 10/10000
   e. unlisted → 35/10000 (법 §8①)
3. 산출 (분수 정수연산):
   증권거래세 = Math.floor(transferPrice * num / den)
   농특세     = kospi ? Math.floor(transferPrice * 15 / 10000) : 0
   합계       = 증권거래세 + 농특세
   ※ transferPrice ≤ 0 → 전부 0 (C-13)
4. 경고: transferDate < 2026-01-02 → warning 부착 (C-09·C-10 경계).
5. 통합 echo:
   ⓐ stock-transfer-tax.ts STEP 12.5 — 결과 조립 객체(현행 `fullResult` 정의 :499-553) 직전에
      산출 후 멤버 1행 추가. (applyExemptZeroing은 spread라 자동 보존 — C-12)
   ⓑ stock-transfer-exempt-result.ts buildExemptResult — 명시 매핑에 1행 추가 (C-11)
      ⚠️ spread 없는 명시 매핑 — 누락 TS 미감지 → grep 자가점검 필수
```

`safeMultiply` 불요 판단: 양도가액 상한을 1조원으로 가정해도 `1e12 × 35 = 3.5e13 < Number.MAX_SAFE_INTEGER(9e15)` — overflow 여유. 주석으로 근거 명기.

## Silent fallback / 자동 안분 후보 식별

- 없음. 전 입력이 기존 검증 통과 필드. transferPrice ≤ 0 은 0 반환(echo 미생성이 아니라 0 결과).
- 결과뷰 표시 게이트: `stx && (stx.totalTax > 0 || stx.warning)` — **경고만 있는 케이스(C-06 기타자산)도 표시**(경고 취지). 0원·무경고(C-13)만 미표시. 상세는 UI 설계.
- 기타자산 0 처리는 fallback이 아니라 **명시 경고 동반 보류** (C-06).

## 테스트 약속

- 파일: `__tests__/tax-engine/stock-transfer/securities-transaction-tax.test.ts` (신규)
- anchor STX-01 ~ STX-13 — 전부 원단위 `toBe()`.
- Pre-Do anchor: **STX-02(코스닥 0.20%)·STX-04(K-OTC 0.20%) 2건을 Do 진입 직후 우선 작성·실행** — 현행 코드(0.15%·0.35%)에서 **실패를 먼저 확보**한 뒤 수정 → 통과 전환 (memory `feedback_pre_anchor_verification`). STX-01(코스피)은 세액 수치는 현행 코드도 통과하나 result 타입(Num/Den) 변경으로 함께 갱신.
- 통합 anchor: STX-11·12는 `calculateStockTransferTax` 전체 호출로 검증(단위 함수 아님).
- 기존 회귀: `npx vitest run __tests__/tax-engine/stock-transfer/` 전체 통과 유지.

## UI 통합 위임 (→ `.ui.design.md`)

- ⑤ Step3 자체 세율표 삭제 + inline 카드 교체 (`calcTransferPriceSimple` 폼 파싱).
- ⑦ 결과뷰 카드(서버 echo) + 인쇄 섹션. 표시 게이트 `totalTax > 0 || warning`.
- ⑦-w **warning 표시 슬롯** — C-06(기타자산)·C-09(과거 거래일) 문자열을 카드 하단 amber 안내로.
- ⑦-agg **다자산 합산 뷰** — `StockTransferAggregateResult.items[].securitiesTransactionTax` 종목별 카드 내 표시(합계 행 없음 — Phase 2).
- ⑥ 사이드바 무변경(별도 세금 — 합산 금지) 확인.
- 카드 narrow props(`SecuritiesTaxParams`) 시그니처 동기화. **기존 `appliedRate`(0.0005 등 소수) 필드 제거에 따라 카드의 `(stx.appliedRate*100).toFixed(2)` % 표시를 `(num/den*100)` 파생으로 교체** — 기존 카드 :67, :105 사용처.
