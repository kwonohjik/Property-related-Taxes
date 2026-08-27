# 주식 양도세 — 취득 후 상장 환산취득가 PDF 완전 재현 (엔진 설계)

> **Plan**: [`docs/00-pm/stock-transfer-post-listing-pdf-replica.plan.md`](../../00-pm/stock-transfer-post-listing-pdf-replica.plan.md)
> **UI**: [`stock-transfer-post-listing-pdf-replica.ui.design.md`](./stock-transfer-post-listing-pdf-replica.ui.design.md)
> **작성일**: 2026-05-18 (v2 — Round 4 검토 반영: C-02 Result echo + C-03 adapter Pick 7개 + H-04 detail 활성 조건 + H-06 80% 하한 양방향 anchor + Case 8 EM dash 일관성)
> **세목**: stock-transfer

## Context

소득세법 시행령 §165⑤ 단서 — 양도 시점에는 상장주식이지만 **취득 당시에는 비상장**이었던 주식의 환산취득가액 산정. 현행 엔진(`stock-valuation-post-listing.ts`)은 1주당 가치 4개(상장연도 순손익가치·순자산가치 + 취득연도 순손익가치·순자산가치)를 사용자가 외부에서 직접 계산하여 입력하는 **간이 모드**만 지원한다.

본 확장은 예제 PDF 사례에 등장하는 **3개 다이얼로그 화면**(상장시 주당 평가액·순손익 계산서·순자산가액 계산서)을 완전 재현하여, 사용자가 결산서 원천 데이터를 직접 입력하면 환산취득가를 산출하는 **상세 모드(`full` mode)**를 추가한다.

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| 1 | Simple — 기존 4 결과값 직접 입력 (회귀 호환) | 소령 §165⑤·§165④1 본칙 | 사례 48 본칙 자가검증 | `case-48-acquired-then-listed.test.ts`(기존) + `post-listing-detail.full.test.ts` PL-LEGACY-1~5 | ☐ TODO |
| 2 | Listing-only detail — 상장연도만 상세 입력 | 소령 §165⑤ + 시행규칙 §81②·§17 | 부분 재현 anchor | `post-listing-detail.netincome.test.ts` PL-NI-1~5 / `.netasset.test.ts` PL-NA-1~4 | ☐ TODO |
| 3 | Full PDF replica — 3개 화면 모두 ON | 소령 §165⑤·§165④1·시행규칙 §81②·상증령 §17 | 사례 48 PDF 100% 재현 | `post-listing-detail.full.test.ts` PL-FULL-1~3 | ☐ TODO |
| 4 | Heavy real estate — 부동산과다 가중치 반전(2:3) | 소령 §165⑤ 단서(가중치 반전) | 자가검증 | `post-listing-detail.full.test.ts` PL-RE-1~4 | ☐ TODO |
| 5 | §81④ 월할 가산 — 취득일 평가 = 상장일 평가 | 시행규칙 §81④ | 자가검증 | `post-listing-detail.full.test.ts` PL-MONTHLY-1~3 | ☐ TODO |
| 6 | 80% 하한 미적용 회귀 보호 — 임의 비율 ≥ 0.80 입력 시에도 ratio 그대로 | 소령 §165④1 단서 (양도 평가용·환산 미적용) | 자가검증 (회귀 보호) | `post-listing-detail.full.test.ts` PL-FLOOR-1~2 | ☐ TODO |
| 7 | 종가 1개월 평균 산출 — 거래일 16~21일 (휴일·주말 제외) | 소령 §165⑤ 단서 시기 (★ Phase A 결론) | 사례 48 PDF 168,040/21일/8,001 | `post-listing-detail.closing.test.ts` PL-CLOSE-1~5 | ☐ TODO |
| 8 | 환산비율 계산 + floor — PDF anchor (28,451/39,083=0.72792, floor(8,001×0.72792)=5,824) | 소령 §165⑤ | 사례 48 PDF | `post-listing-detail.full.test.ts` PL-CONV-1~6 | ☐ TODO |
| 9 | Flat → Nested 어댑터 — 80 폼 필드 → `PostListingDetailInput` 매핑 | (구현 검증) | 자가검증 | `post-listing-detail.full.test.ts` PL-BUILD-1~2 | ☐ TODO |
| ⊘ | (범위 외) Case 6 거래정지·관리종목 §165③ | 소령 §165③ | — | 후속 PR | — |
| ⊘ | (범위 외) 양도일 1개월 종가평균 입력 화면 §99①3 | — | — | 후속 PR | — |

**Pre-Do 우선 anchor**: 케이스 7(PL-CLOSE-1)·1+2(PL-NI-1)·3(PL-NA-1)·8(PL-CONV-1)·3(PL-FULL-1) — Phase B에서 5건 우선 실행.

## 법령 근거

```
소령 §165⑤ 단서 (Phase A 결론 — 2026-05-18):
  취득 당시 비상장주식이 양도 시점에 상장된 경우 →
  1주당 취득기준시가 = 상장일 이후 1개월 종가평균 ×
                       (취득일 직전 사업연도 비상장 평가액 / 상장일 직전 사업연도 비상장 평가액)

  ※ "상장일 이후 1개월" 확정 근거:
     - §165⑤ 본문이 "코스닥/코넥스 상장일 현재의 제4항에 따른 평가액"을 분모로 사용
     - 상장일 이전은 비상장 기간 → 종가 미존재
     - PDF 사례 48 일자 2009-08-21(상장) → 2009-09-21 (1개월 후) 입력 일치

소령 §165④1 본칙:
  1주당 비상장 평가액 = 순손익가치 × 3/5 + 순자산가치 × 2/5
  (부동산과다보유법인은 가중치 반전 — 순손익가치 × 2/5 + 순자산가치 × 3/5)
  단서: 양도일 기준 평가에 한해 80% 하한. 환산비율 계산 분자·분모에는 미적용.

시행규칙 §81② → 상증법 시행규칙 §17 (Phase A 결론):
  순손익가치 환원율 = 연간 100분의 10
  ※ 소법 시행규칙 §82는 "소형 신축주택 및 준공 후 미분양주택의 요건"(전혀 다른 조문) — 인용 금지

시행규칙 §81④:
  취득일 직전 사업연도 평가액 = 상장일 직전 사업연도 평가액인 경우
  → 사업연도 내 월할 가산
```

`lib/tax-engine/legal-codes/stock.ts` 상수 사용 강제:
- `STOCK.ENFORCEMENT_DECREE_165_5_POST_LISTING` (기존)
- `STOCK.ENFORCEMENT_DECREE_165_4_1_WEIGHTED_AVG` (기존)
- `STOCK.ENFORCEMENT_DECREE_165_4_1_FLOOR_80` (기존)
- `STOCK.ENFORCEMENT_RULE_81_4_MONTHLY_ACCRUAL` (기존)
- **`STOCK.ENFORCEMENT_RULE_81_2_DISCOUNT_RATE` 신설** (소법 시행규칙 §81②) — Phase A 정정 (v3 §82 오류)
- **`STOCK.INHERITANCE_GIFT_RULE_17_DISCOUNT_RATE` 신설** (상증법 시행규칙 §17 → 10%) — 환원율 실체
- `STOCK_LOSS_GAIN_DISCOUNT_RATE = 0.10 as const` (기존)
- `STOCK_FLOOR_80_PCT = 0.80 as const` (기존, 환산비율에는 미적용)

---

## 엔진 input 타입

기존 `StockTransferInput`에 신규 nested 객체 1개 추가.

```ts
// types/stock-transfer.types.ts
export type PostListingDetailInput = {
  /** Round 1 R-06: simple은 기존 4 필드만 사용, full은 본 객체 80필드 모두 사용 */
  unlistedDetailMode: "simple" | "listing_only" | "full";

  /** Case 7 — 상장 직후/직전 1개월 종가 (★ Phase A 시기 결론) */
  closing?: {
    dates: string[];          // 최대 32 슬롯, 가변 길이
    closes: string[];         // 원, 휴일·주말은 빈 문자열
    basisDate: string;        // YYYY-MM-DD
    hasIncrease: boolean;     // 증자·합병 (default false)
  };

  /** Case 2·3 — 순손익 계산서 24행 */
  netIncome?: {
    listing: NIYear;
    acquisition: NIYear;
  };

  /** Case 3·6 — 순자산가액 계산서 20행 */
  netAsset?: {
    listing: NAYear;
    acquisition: NAYear;
  };

  /** Case 5 — §81④ 월할 가산 수동 토글 (default false) */
  monthlyAccrualToggle: boolean;
};

export type NIYear = {
  /** 행 1~4 — 가산항목 (소득금액·과오납 환급금 이자·수익배당금 중 입금 불산입·기부금 한도초과액 이월손금 산입) */
  addA: number[];        // length 4
  /** 행 5~16 — 차감항목 (벌금·손금불산입 공과금·업무무관 지출·각 세법상 미납 등 12행) */
  subB: number[];        // length 12
  /** 행 20 — 사업연도말 주식 또는 환산주식수 */
  shareCount: number;
  /** 행 23 — 환원율 (기재부 고시 10%, decimal — UI %는 adapter에서 변환) */
  discountRate: number;
};

export type NAYear = {
  /** 행 1 — 재무상태표상 자산가액 */
  assetTotalRow1: number;
  /** 행 2~5 — 자산 가산 4행 */
  assetAdd: number[];    // length 4
  /** 행 6·7 — 자산 차감 2행 */
  assetSub: number[];    // length 2
  /** 행 8 — 재무상태표상 부채액 */
  liabTotalRow8: number;
  /** 행 9~14 — 부채 가산 6행 */
  liabAdd: number[];     // length 6
  /** 행 15~17 — 부채 차감 3행 */
  liabSub: number[];     // length 3
  /** 행 19 — 영업권 (optional, default 0) */
  goodwillRow19: number;
  /** 사업연도말 주식수 (NIYear와 분리 — 분할·증자 가능성) */
  shareCount: number;
};

// 기존 StockTransferInput에 합류
export type StockTransferInput = {
  // ... 기존 필드 ...
  acquiredBeforeListing: boolean;  // 게이트 (기존)
  postListingDetail?: PostListingDetailInput;  // 신규 nested 객체
  // ...
};
```

## 엔진 result 타입

기존 `StockTransferResult.postListingDetail` 필드 확장 + **Round 4 C-02 정정**: `StockTransferResult`에 `acquiredBeforeListing: boolean` echo 추가 (UI 결과 카드 게이트용).

```ts
export type StockTransferResult = {
  // ... 기존 필드 ...
  /** ⓒ-02 Round 4 echo — UI 결과 카드 PostListingDetailCard 노출 게이트 */
  acquiredBeforeListing: boolean;
  postListingDetail?: PostListingValuationResult;  // 확장 (아래 정의)
};
```

```ts
export type PostListingValuationResult = {
  // 기존
  listingYearPerShareValue: number;
  acquisitionYearPerShareValue: number;
  conversionRatio: number;
  finalPerShareValue: number;
  totalAcquisitionPrice: number;
  monthlyAccrualApplied: boolean;
  appliedRules: string[];
  warnings: string[];

  // 신규 (full mode 시 채워짐)
  detail?: {
    closing?: {
      tradingDays: number;
      sum: number;
      avg: number;
    };
    netIncome?: {
      listing: { netIncomeAmount: number; perShareIncome: number; perShareValue: number };
      acquisition: { netIncomeAmount: number; perShareIncome: number; perShareValue: number };
    };
    netAsset?: {
      listing: { netAssetAmount: number; perShareAsset: number };
      acquisition: { netAssetAmount: number; perShareAsset: number };
    };
    /** 사용된 모드 (디버깅·결과 카드용) */
    mode: "simple" | "listing_only" | "full";
    /** 80% 하한 비적용 명시 — 환산비율 산정 단계 */
    floor80NotApplied: true;
  };
};
```

Date 필드 없음 (closing.basisDate는 YYYY-MM-DD string — UI 직접 표시용).

### Result `detail` 활성 조건 (Round 4 H-04)

| mode | `detail` 채움 |
|---|---|
| `"simple"` | `detail = { mode: "simple", floor80NotApplied: true }` — closing/netIncome/netAsset 모두 undefined |
| `"listing_only"` | `detail.closing`·`detail.netIncome.listing`·`detail.netAsset.listing` 채움. acquisition은 undefined (사용자 직접 입력값이므로 echo 불필요) |
| `"full"` | `detail` 전부 채움 (closing + netIncome.{listing,acquisition} + netAsset.{listing,acquisition}) |

`floor80NotApplied: true`는 **모든 모드**에서 명시 (환산비율 단계 80% 하한 비적용 사실 echo).

---

## 계산 알고리즘 (단계별)

### 단계 0 — 모드 게이트
```
if (postListingDetail.unlistedDetailMode === "simple"):
  → 기존 4 입력 필드(listingYearNetIncomePerShare 등) 사용. STEP 3로 점프.

if (mode === "listing_only"):
  → closing + netIncome.listing + netAsset.listing 필수.
  → 취득연도는 기존 4 필드(...AcquisitionYear...) 사용.

if (mode === "full"):
  → closing + netIncome.{listing, acquisition} + netAsset.{listing, acquisition} 모두 필수.
```

### 단계 1 — 종가 1개월 평균 (H-01)
```
inputs: dates[], closes[]
output: { tradingDays, sum, avg }

알고리즘:
  tradingDays = closes.filter(c => c !== "" && !isNaN(parseAmount(c))).length
  sum = closes.reduce((acc, c) => acc + parseAmount(c), 0)
  avg = floor(sum / tradingDays)   // 1주당은 원 미만 절사
```

### 단계 2 — 1주당 순손익가치 (H-02)
```
inputs: NIYear { addA[4], subB[12], shareCount, discountRate }
output: { netIncomeAmount, perShareIncome, perShareValue }

알고리즘:
  netIncomeAmount = sum(addA) - sum(subB)
  perShareIncome = floor(netIncomeAmount / shareCount)       // 1주당 순손익액
  perShareValue = floor(perShareIncome / discountRate)       // 1주당 순손익가치
```

### 단계 3 — 1주당 순자산가치 (H-03)
```
inputs: NAYear { assetTotalRow1, assetAdd[4], assetSub[2], liabTotalRow8, liabAdd[6], liabSub[3], goodwillRow19, shareCount }
output: { netAssetAmount, perShareAsset }

알고리즘:
  assetSubtotal = assetTotalRow1 + sum(assetAdd) - sum(assetSub)
  liabSubtotal = liabTotalRow8 + sum(liabAdd) - sum(liabSub)
  netAssetAmount = assetSubtotal - liabSubtotal + goodwillRow19
  perShareAsset = floor(netAssetAmount / shareCount)
```

### 단계 4 — 1주당 가중평균 평가액 (H-04, 양 연도)
```
inputs: netIncomeValue, netAssetValue, isHeavyRE
output: weighted

알고리즘 (§165④1 본칙):
  if (isHeavyRE):  weighted = floor(netIncomeValue * 2/5 + netAssetValue * 3/5)
  else:            weighted = floor(netIncomeValue * 3/5 + netAssetValue * 2/5)

★ 80% 하한 미적용 (환산비율 산정용).
```

### 단계 5 — 환산비율 + 1주당 취득기준시가
```
ratio = acquisitionYearPerShareValue / listingYearPerShareValue
finalPerShareValue = floor(listingDatePriceAvg1Month * ratio)
totalAcquisitionPrice = finalPerShareValue * shareCount  // shareCount = StockTransferInput.shareCount (전체 양도주식수)
```

### 단계 6 — §81④ 월할 가산 (선택)
```
if (monthlyAccrualToggle && listingYearPerShareValue === acquisitionYearPerShareValue):
  → KoreanLaw Phase A에서 정확 산식 확정 후 적용.
  → 발동 시 monthlyAccrualApplied = true, appliedRules에 §81④ push.
```

### Flat → Nested 어댑터 (H-05 + post-listing-flat-adapter.ts) — Round 4 C-03·H-02 정정

```ts
adaptFlatToPostListingDetail(form: PostListingFlatForm): PostListingDetailInput;

/** Round 4 C-03: listing_only 모드의 취득 4 필드도 함께 매핑 */
adaptFlatToApiBody(form: PostListingFlatForm): Pick<
  StockTransferInput,
  | "postListingDetail"
  | "acquiredBeforeListing"
  | "listingDatePriceAvg1Month"
  | "listingYearNetIncomePerShare"
  | "listingYearNetAssetPerShare"
  | "acquisitionYearNetIncomePerShare"
  | "acquisitionYearNetAssetPerShare"
>;
```

**3 분기 동작 (Round 4 H-02 정정)**:

| `unlistedDetailMode` | 동작 |
|---|---|
| `"simple"` | adapter 호출 X — 기존 4 필드(`listingYearNetIncomePerShare` 등) 그대로 사용. `postListingDetail` body에 미포함 |
| `"listing_only"` | adapter 호출 → 상장연도 18 필드 환산 후 `listingYearNet...PerShare` 2 필드 채움. 종가 화면도 환산하여 `listingDatePriceAvg1Month` 채움. 취득연도 4 필드는 사용자 직접 입력값 그대로. `postListingDetail`도 함께 송신 (mode echo용) |
| `"full"` | adapter 호출 → 80 필드 모두 환산하여 4 필드 + `postListingDetail` nested 모두 송신 |

**공통 책임**:
- 80개 flat string 필드 → nested 구조 변환
- 환원율 `"10"` (%) → 0.10 (decimal) 변환
- 빈 문자열 → 0 (영업권 등 optional)
- 빈 배열 슬롯 → 0 (휴일·주말)
- `acquiredBeforeListing` 토글 값 그대로 echo (Round 4 C-02)

---

## Silent fallback / 자동 안분 후보 식별

| 후보 필드 | 처리 |
|---|---|
| 영업권 행 19 빈 문자열 | → 0 (optional). [[feedback_no_silent_apportion_fallback]] 위반 아님 — 명시적 default |
| 휴일·주말 종가 빈 문자열 | → tradingDays에서 제외. **자동 안분 아님** — 분모에서 제외하는 표준 산식 |
| `discountRate` 빈 문자열 | → 검증 오류로 차단 ([[feedback_no_silent_apportion_fallback]]) — default "10"은 폼 initial에서만 |
| `shareCount` 빈 문자열 | → 검증 오류로 차단 |
| listing_only 모드의 acquisition 4 필드 | → 사용자 직접 입력 필수. 자동 환산 없음 |

**원칙**: §165⑤ 산식 외 자동 안분 0건. 모든 미입력은 validation에서 명확한 오류로 차단.

---

## 80% 하한 비적용 명시 (회귀 보호)

`stock-valuation-post-listing.ts` 주석 L17-18 유지·강화:
> "취득 후 상장 환산비율 계산(분자·분모)에는 80% 하한 적용하지 않음. 80% 하한은 양도일 기준 비상장 평가에서만 적용 (§165④1 단서)."

**회귀 보호 anchor — 양방향 (Case 6, PL-FLOOR-1~2) — Round 4 H-06 정정**:
- **PL-FLOOR-1**: ratio = 0.85 (≥ 0.80) 입력 → ratio 그대로 적용 (보정 X)
- **PL-FLOOR-2**: ratio = 0.50 (< 0.80) 입력 → ratio 그대로 적용 (0.80으로 끌어올림 X)

두 anchor 모두 통과해야 80% 하한 미적용이 양방향으로 보장됨. 향후 누군가 80% 하한 잘못 추가 시 PL-FLOOR-2가 즉시 fail.

---

## 테스트 약속

### 파일 분할 (800줄 정책 사전 대응)
- `__tests__/tax-engine/stock-transfer/post-listing-detail.closing.test.ts` (~180줄) — H-01 PL-CLOSE
- `post-listing-detail.netincome.test.ts` (~220줄) — H-02 PL-NI + PL-WEIGHT 상장
- `post-listing-detail.netasset.test.ts` (~200줄) — H-03 PL-NA + PL-WEIGHT 취득
- `post-listing-detail.full.test.ts` (~280줄) — PL-CONV·PL-FULL·PL-RE·PL-MONTHLY·PL-FLOOR·PL-LEGACY·PL-BUILD
- `helpers/post-listing-input-builder.ts` (~150줄) — 80필드 입력 객체 빌더

### Anchor 그룹 (총 52건)

| Group | 수 | 케이스 | 검증 |
|---|---|---|---|
| PL-CLOSE-1~5 | 5 | 7 | 종가합계 168,040 / 거래일 21 / 평균 8,001 |
| PL-NI-1~10 | 10 | 2·3 | (A 합 − B 합) / 주식수 / 10% = 61,570 / 44,520 |
| PL-NA-1~8 | 8 | 3 | (자산 − 부채 + 영업권) / 주식수 = 5,352 / 4,348 |
| PL-WEIGHT-1~4 | 4 | 3 | 39,083 / 28,451 (3:2 가중) — 80% 하한 미적용 확인 |
| PL-CONV-1~6 | 6 | 8 | 0.72792 / 5,824 / 29,120,000 |
| PL-FULL-1~3 | 3 | 3 | 사례 48 산출세액 본칙 2,667,760 (PDF 2,372,760 alternative) |
| PL-RE-1~4 | 4 | 4 | 부동산과다 2:3 가중 자가검증 |
| PL-MONTHLY-1~3 | 3 | 5 | §81④ 월할 가산 적용 시 |
| PL-FLOOR-1~2 | 2 | 6 | 80% 하한 미적용 회귀 보호 |
| PL-LEGACY-1~5 | 5 | 1 | 기존 사례 48 simple mode 회귀 보호 |
| PL-BUILD-1~2 | 2 | 9 | adaptFlatToPostListingDetail 정확성 |

### Pre-Do 우선 5건 (Phase B)
`PL-CLOSE-1`·`PL-NI-1`·`PL-NA-1`·`PL-CONV-1`·`PL-FULL-1` — Phase A 결론에 따라 입력 일자·시기 라벨 갱신 후 통과 확인.

---

## UI 통합 위임

- UI 측 명세: [`stock-transfer-post-listing-pdf-replica.ui.design.md`](./stock-transfer-post-listing-pdf-replica.ui.design.md)
- 14개 동기화 지점 — UI 시니어 책임 (엔진 시니어는 input/result 타입 + adapter 함수만 정의)
- Flat → Nested 어댑터는 **엔진 측 모듈**(`lib/tax-engine/stock-transfer/post-listing-flat-adapter.ts`)에 위치하되 UI·API 양쪽에서 import — UI 시니어가 사용

---

## 위험 / 보류 (Plan §6 R-06 종속)

| 항목 | 상태 |
|---|---|
| R-06: 상장일 1개월 = 직전 / 직후 / 평가기준일 ±1일 | Phase A에서 KoreanLaw 원문 확정 후 본 문서 §법령근거·§3.3 행 번호 갱신 |
| R-07: 환원율 10% 시간별 테이블 | 본 PR 고정 default 10% — 변경 가능 |
| R-08: 영업권 음수 입력 | validation 차단 |
