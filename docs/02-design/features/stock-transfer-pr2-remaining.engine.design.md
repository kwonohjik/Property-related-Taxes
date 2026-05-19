# 주식 양도세 PR-2 잔여 엔진·UI 디자인 v2

> 작성일: 2026-05-19 (v2: 자가 검토 10건 반영 — 자기일관성·UI 타입·STEP 3.5 위치·swap 가드)
> 작성자: Claude (Opus 4.7)
> 연관 문서: `docs/00-pm/stock-transfer-pr2-remaining.plan.md` v3
> 범위: R-1' 매매사례가액 / R-2 무상증자·감자 / R-3 로드맵 카드 / R-4 appraisal dead-code 제거

## 1. 케이스 인벤토리 (행≥1 필수)

| # | 케이스 | 법령 근거 | 결과 분기 | 테스트 파일 | anchor |
|---|---|---|---|---|---|
| MS-1 | 비상장 + 취득 매매사례 정상 | §97①1나목 + 영§163⑫ + 영§176의2③1호 | acquisitionPrice = perShare × shareCount, 개산공제 0 | `market-sample-acquisition.test.ts` | ☐ 1건 |
| MS-2a/b/c | 상장(kospi/kosdaq/konex) 시도 → validate error | 영§176의2③1호 단서 | error "비상장·기타자산 전용" | `market-sample-listed-blocked.test.ts` | ☐ 3건 |
| MS-3 | 3개월 초과 → warning + 진행 | 영§176의2③1호 본문 | warning + 계산 진행 | 동상 | ☐ 1건 |
| MS-4 | 양도+취득 매매사례 동시 | 동상 | transferPrice·acquisitionPrice 양쪽 적용 | 동상 | ☐ 1건 |
| MS-5 | 특수관계인 counterparty warning | §98① 준용 안내 | warning "특수관계인 검토" | 동상 | ☐ 1건 |
| MS-6 | 기타자산(other_asset) 적용 | 영§176의2③1호 | error 없음 | 동상 | ☐ 1건 |
| CA-1 | 자본준비금 무상증자 단일 | 법§17②2호 가목 단서 (1)(2) | adjustedShareCount=1500 / perShareCost=66666 | `capital-adjustments.test.ts` | ☐ 1건 |
| CA-2 | 비례감자 단일 | 형식감자 (의제배당 비대상) | adjustedShareCount=800 / perShareCost=125000 | 동상 | ☐ 1건 |
| CA-3 | 자본준비금 → 비례감자 시계열 | 위 2개 합성 | 1000→1500→1200 / 83333 | 동상 | ☐ 1건 |
| CA-4 | 이익잉여금 무상증자 skip | 법§17②2호 가목 본문 | warning + 주식수 불변 | 동상 | ☐ 1건 |
| CA-5 | 자본환급 무상감자 skip | 법§17②1호 | warning + skip | 동상 | ☐ 1건 |
| CA-6 | split + adjustments → Zod error | (UI/엔진 정책) | error "단건 모드 전용" | 동상 | ☐ 1건 |
| CA-7 | adjustedShareCount ≠ shareCount → warning | 자기일관성 | warning "환산 결과 ≠ 입력 양도" | 동상 | ☐ 1건 |
| CA-8 | ratio=0 → validate error | (정책) | "ratio는 0보다 커야 함" | 동상 | ☐ 1건 |
| CA-9 | eventDate < acquisitionDate → error | (정책) | "발생일이 취득일 이전" | 동상 | ☐ 1건 |
| CA-10 | eventDate > transferDate → error | (정책) | "발생일이 양도일 이후" | 동상 | ☐ 1건 |
| CA-11 | 감자 ratio≥1 → error | (정책) | "감자비율은 1 미만 (100% 감자는 청산)" | 동상 | ☐ 1건 |
| CA-12 | 시계열 무순서 입력 자동 정렬 | (엔진 정책) | applied 배열 오름차순 | 동상 | ☐ 1건 |

**총 19건 케이스 / 신규 anchor 19건 / 회귀 보존 345건.**

## 2. 법령 근거 (정확 인용)

```
법 §17②1호 — 의제배당 (주식소각·자본감소·잉여금자본전입 등)
법 §17②2호 가목 — 의제배당 (잉여금 자본전입에 따른 무상주)
법 §17②2호 가목 단서 (1) — 「법인세법」 §16①2호 가목 자본준비금 (의제배당 제외)
법 §17②2호 가목 단서 (2) — 「법인세법 시행령」 §12①1호 재평가적립금 (의제배당 제외)
법 §97①1나목 — 매매사례가액·감정가액·환산취득가액 순차 적용
영 §163⑫ — §97①1나목 위임 → §176의2②~④
영 §176의2③1호 — 매매사례가액 (주권상장법인 주식등 제외)
영 §176의2③2호 단서 — 감정가액 (주식등 제외) ← 본 문서 R-4 근거
영 §176의2③ 단서 — §98① 특수관계인 부당거래 시 적용 배제
국세청 양도소득세 집행기준 97-163-12 — 무상주 1주당 환산
```

## 3. 입력·결과 타입 (TypeScript 시그니처)

```ts
// types/stock-transfer.types.ts — 신규·변경 필드

// 3-1. acquisitionMode enum 변경
- export type AcquisitionMode = "actual" | "estimated" | "face_value" | "appraisal";
+ export type AcquisitionMode = "actual" | "estimated" | "face_value" | "market_sample";

// 3-2. 매매사례가액 신규 필드 (StockTransferInput에 6개)
acquisitionMarketSamplePrice?: number;
acquisitionMarketSampleDate?: Date;
acquisitionMarketSampleCounterparty?: string;
transferMarketSamplePrice?: number;
transferMarketSampleDate?: Date;
transferMarketSampleCounterparty?: string;

// 3-3. capital_adjustments 신규 (StockTransferInput에 배열)
export type CapitalAdjustmentType =
  | "bonus_capital_reserve"
  | "bonus_retained_earnings"
  | "reduction_proportional"
  | "reduction_capital_return";

export interface CapitalAdjustment {
  type: CapitalAdjustmentType;
  eventDate: Date;
  ratio: number;
  notes?: string;
}

capitalAdjustments?: CapitalAdjustment[];

// 3-3-1. UI 측 폼 타입 (string Date)
export interface CapitalAdjustmentForm {
  type: CapitalAdjustmentType;
  eventDate: string;   // "YYYY-MM-DD"
  ratio: string;       // "0.5" (parseDecimal로 변환)
  notes: string;
}

// 3-4. 결과 echo (StockTransferResult)
marketSampleDetail?: {
  acquisitionApplied: boolean;
  transferApplied: boolean;
  acquisitionPerShare?: number;
  transferPerShare?: number;
  acquisitionDeltaDays?: number;
  transferDeltaDays?: number;
  warnings: string[];
};

capitalAdjustmentsDetail?: {
  baseShareCount: number;
  adjustedShareCount: number;
  baseTotalCost: number;
  adjustedPerShareCost: number;
  applied: {
    type: CapitalAdjustmentType;
    eventDate: Date;
    ratio: number;
    beforeShares: number;
    afterShares: number;
    skipped: boolean;
    reason?: string;
  }[];
};
```

## 4. 엔진 모듈 구조

### 4.1 신규 파일

```
lib/tax-engine/stock-transfer/
├── stock-valuation-market-sample.ts   (신규, ~120줄)
└── stock-capital-adjustments.ts       (신규, ~150줄)
```

### 4.2 호출 위치 (`stock-transfer-tax.ts` 통합)

```
calculateStockTransferTax()
  └─ STEP 2.5 (양도가액) ───┬─ transferPriceMode === "actual"
                            │   └─ transferMarketSamplePrice 우선 → fallback perShareTransferPrice
                            │
  └─ STEP 3 (취득가액) ─────┬─ acquisitionMode === "market_sample"
                            │   └─ calcAcquisitionFromMarketSample()
                            │
  └─ STEP 3.5 (capital_adjustments) ─ NEW
       └─ adjustShareCountAndCost() — 취득가액 산출 후 1주당 단가 환산
                                       (단, totalAcquisitionCost는 불변)
       → 이 단계는 swap 비교(§97②2호) 진입과 직교
         · swap 비교는 acquisitionMode === "estimated" 전용
         · market_sample·actual·face_value 모드는 swap 자동 우회
         · capital_adjustments는 1주당 단가만 영향 — totalAcquisitionPrice 불변
            → swap 비교 결과에 영향 없음
```

**STEP 3.5의 결과 객체 의미 확정**:
- `result.acquisitionPrice` = totalAcquisitionPrice (불변) — 사이드바·결과 카드 표시
- `result.perShareAcquisitionPrice` (신규 또는 echo) = adjustedPerShareCost — 결과 상세 카드 표시용
- 양도차익(`transferIncome`) 산정에는 `totalAcquisitionPrice`만 사용 (1주당 환산 단가 미사용)
- **자기일관성 anchor**: `totalAcquisitionPrice === adjustedPerShareCost × adjustedShareCount ± floor(±1원)`

### 4.3 finalize 영향 없음

가산세·전자신고 공제·지방소득세 등은 무변경.

## 5. UI 모듈 구조

### 5.1 신규 파일

```
components/calc/stock-transfer/
├── MarketSampleBlock.tsx              (신규, ~180줄)
│   ├─ 취득 매매사례 섹션 (amber tone)
│   └─ 양도 매매사례 섹션 (amber tone)
└── CapitalAdjustmentsBlock.tsx        (신규, ~220줄)
    └─ 테이블 + 행 추가/삭제 + type RadioCardGroup

components/calc/results/
├── MarketSampleDetailCard.tsx         (신규, ~80줄)
│   └─ 양도·취득 사례 표 + ±3개월 검증 결과
└── CapitalAdjustmentsTimelineCard.tsx (신규, ~120줄)
    └─ 시계열 표 (날짜/타입/비율/주식수 변화/단가)
```

### 5.2 Step2 통합

```
Step2.tsx (취득·양도가액 입력)
  ├─ TransferPriceModeBlock (기존)
  ├─ AcquisitionModeBlock (기존, market_sample 옵션 추가)
  ├─ ActualAcquisitionBlock (기존)
  ├─ EstimatedUnlistedBlock (기존)
  ├─ FaceValueBlock (기존)
  ├─ MarketSampleBlock (신규)              ← R-1' (acquisitionMode === "market_sample"일 때만 노출)
  ├─ CapitalAdjustmentsBlock (신규)         ← R-2 (acquisitionMode 무관, 항상 표시 가능)
  │   └─ 도움말 카드: "의제배당(이익잉여금 자본전입·자본환급) vs 양도세(자본준비금·형식감자)"
  │       + 법 §17② 단서 (1)(2) 본문 발췌
  │       + lotsMode === "split" 시 섹션 전체 disabled + disabledReason
  └─ [appraisal 안내 카드 삭제]              ← R-4
```

### 5.3 결과 화면 통합

```
StockTransferTaxResultView.tsx
  ├─ ...
  ├─ ValuationDetailCard (기존, 비상장 보충적 평가)
  ├─ MarketSampleDetailCard (신규, marketSampleDetail 있을 때만)
  ├─ CapitalAdjustmentsTimelineCard (신규, capitalAdjustmentsDetail 있을 때만)
  ├─ ...
  └─ PrRoadmapCard (수정 — R-3)
```

## 6. UI 동기화 7지점 (UI 시니어 표준)

| # | 위치 | R-1' | R-2 |
|---|---|---|---|
| ① 폼 상태 | `lib/stores/calc-wizard-stock-store.ts` `StockTransferFormData` | 6 신규 필드 (string 또는 ISO string for Date) | `capitalAdjustments: CapitalAdjustmentForm[]` |
| ② initial | `INITIAL_STOCK_FORM_DATA` | 모두 "" | `[]` |
| ③ normalize | `calc-wizard-stock-normalize.ts` | strField 6개 | 배열 normalize 헬퍼 |
| ④ API 변환 | `lib/calc/stock-transfer-tax-api.ts` | parseAmount/Date 변환 후 spread | 배열 매핑 + type enum 검증 |
| ⑤ UI 위젯 | Step2.tsx + MarketSampleBlock + CapitalAdjustmentsBlock | 신규 컴포넌트 | 신규 컴포넌트 |
| ⑥ 사이드바 | `computeStockSummary` | 자동 반영 (result.acquisitionPrice) | 자동 반영 |
| ⑦ 결과 카드 | StockTransferTaxResultView | MarketSampleDetailCard | CapitalAdjustmentsTimelineCard |

## 7. 14지점 동기화 (API 14지점 — 시니어 표준)

| # | 위치 | R-1' | R-2 | R-4 |
|---|---|---|---|---|
| ① | FormData | 6 필드 | 배열 | enum 갱신 |
| ② | initial | "" | [] | "actual" |
| ③ | normalize | strField | normalizeCapitalAdjustments | enumField allow-list |
| ④ | API 변환 | spread | 배열 매핑 | dead-code 삭제 |
| ⑤ | UI 위젯 | MarketSampleBlock | CapitalAdjustmentsBlock | 라디오 제거 |
| ⑥ | 사이드바 | 자동 | 자동 | — |
| ⑦ | 결과 카드 | MarketSampleDetailCard | CapitalAdjustmentsTimelineCard | — |
| ⑧ | Validation | 시장 게이트 + ±3개월 | 시계열 + ratio + type | enum 통과만 |
| ⑨ | Zod enum 메인 | acquisitionModeSchema 갱신 | capitalAdjustmentTypeSchema 신규 | "appraisal" 제거 |
| ⑩ | Zod 컴패니언 | market_sample + listed 모순 차단 | split + adjustments 모순 차단 | — |
| ⑪ | acquisitionDate fallback | — | — | — |
| ⑫ | Zod 입력 객체 | 6 필드 optional | capitalAdjustments optional | enum 갱신 |
| ⑬ | callTransferTaxAPI body spread | 6 필드 + 빈문자 처리 | 배열 + 빈배열 처리 | — |
| ⑭ | Route handler 엔진 input + STOCK_DATE_FIELDS | `acquisitionMarketSampleDate`·`transferMarketSampleDate` + `capitalAdjustments[].eventDate` 추가 | 동상 | enum cast 갱신 |

## 8. 색상 토큰 (UI 일관성)

| 영역 | tone | 사용처 |
|---|---|---|
| 매매사례가액 (취득) | `amber` (취득시 색상) | MarketSampleBlock 취득 섹션 |
| 매매사례가액 (양도) | `emerald` (양도시 색상) | MarketSampleBlock 양도 섹션 |
| 무상증자·감자 | `violet` (이벤트 시계열) | CapitalAdjustmentsBlock |
| 의제배당 안내 (warning) | `slate` (중립 안내) | 의제배당 분기 hint |
| 로드맵 (completed) | `emerald` + ✓ | PrRoadmapCard |
| 로드맵 (current) | `sky` + "현재" | PrRoadmapCard |
| 로드맵 (pending) | `slate` opacity-60 | PrRoadmapCard |

## 8.1 MarketSampleDetailCard 표시 명세

| 행 | 표시 |
|---|---|
| 모드 | "매매사례가액 (시행령 §176의2③1호)" |
| 취득 1주당 사례가 | `acquisitionMarketSamplePrice.toLocaleString()`원 |
| 취득 거래일 / 기준일 차이 | `sampleDate` / `+${deltaDays}일` (±3개월 초과 시 amber warning) |
| 양도 1주당 사례가 | (있을 때만) |
| 양도 거래일 / 기준일 차이 | (있을 때만) |
| 산식 | `사례 1주당 × 양도 주식수 = 취득가액` |
| 거래상대 | (메타 — 특수관계인 의심 시 warning) |

## 8.2 CapitalAdjustmentsTimelineCard 표시 명세

| 열 | 내용 |
|---|---|
| # | 시계열 인덱스 (정렬 후) |
| 발생일 | eventDate (YYYY-MM-DD) |
| 유형 | 한국어 라벨 (자본준비금 무상증자 등) |
| 비율 | ratio (예: 0.5 또는 50%) |
| 변동 전 주식수 | beforeShares |
| 변동 후 주식수 | afterShares |
| 처리 | "적용" (양도세) / "건너뜀 (배당소득)" |

하단 요약:
- 최종 환산 주식수 (취득가액 분모) = `adjustedShareCount`
- 환산 1주당 단가 = `floor(totalCost / adjustedShareCount)`
- 총 취득원가 (불변) = `totalCost`

## 8.3 호환성·우선순위 매트릭스 (cross-feature)

| 기능 | + market_sample (R-1') | + capital_adjustments (R-2) |
|---|---|---|
| PostListingDetail (§165⑤) | 호환 (취득가액 산출 후 1주당만 적용) | 호환 — 직교 |
| transferStdInputMode="daily" | transferMarketSamplePrice 우선 → daily 입력 무시 | 무관 |
| isExempt (비과세) | 적용 무관 (취득가액 산출 의미 없음) | 적용 무관 |
| lotsMode="split" | Zod refine error | Zod refine error |
| acquisitionMode="estimated" + swap | swap 자동 우회 (market_sample은 별 모드) | totalAcquisitionPrice 불변 → swap 결과 동일 |

## 9. 사용자 시나리오 (UX 검증용)

### S-1: 비상장 매매사례 신고
1. 시장 = 비상장 선택
2. 취득가액 모드 = "매매사례가액"
3. 취득 매매사례 1주당 가격·거래일 입력
4. 양도가액 모드 = "실가" 또는 "매매사례가액"
5. 계산 → 결과 화면 MarketSampleDetailCard 노출

### S-2: 코스피 + 매매사례 시도 → 차단
1. 시장 = 코스피
2. 취득가액 모드 = "매매사례가액" 선택 → 라디오 disabled (UI) + Zod·validate error (이중 방어)

### S-3: 비상장 + 무상증자 1회
1. 시장 = 비상장
2. 취득가액 = 실가 또는 환산
3. 무상증자·감자 섹션 → "행 추가" → type = 자본준비금 무상증자, 비율 = 0.5, 발생일 = 취득~양도 사이
4. 계산 → 결과 화면 CapitalAdjustmentsTimelineCard 노출 + 환산 1주당 단가 표시

### S-4: 의제배당 분기 skip
1. type = 이익잉여금 무상증자
2. 계산 → warning + 주식수 불변
3. 결과 화면 timeline에 `skipped: true` 행 노출 + 안내 메시지

### S-5: 로드맵 카드 시각 확인
- PR-1 ✓ emerald / PR-2 ✓ emerald / PR-3 sky "현재" / 후속 slate opacity-60

## 10. 800줄 정책 점검

| 파일 | 추정 줄수 | 분할 신호 |
|---|---|---|
| `stock-transfer-tax.ts` (오케스트레이터) | 현재 약 700줄 → STEP 3.5 추가로 ~720줄 | ✅ 여유. 임계 800줄 근접 시 finalize·valuation 분리 |
| `stock-valuation-market-sample.ts` | ~120줄 | ✅ |
| `stock-capital-adjustments.ts` | ~150줄 | ✅ |
| `lib/calc/stock-transfer-tax-api.ts` | 현재 약 380줄 → 약 420줄 | ✅ |
| `lib/calc/stock-transfer-tax-validate.ts` | 현재 약 700줄 → 약 800줄 | ⚠️ 임계 도달 가능 → validate-market-sample.ts·validate-capital-adjustments.ts로 분할 권장 |
| `app/calc/stock-transfer-tax/steps/Step2.tsx` | 현재 약 600줄 → 약 700줄 | ✅ |
| `MarketSampleBlock.tsx` | ~180줄 | ✅ |
| `CapitalAdjustmentsBlock.tsx` | ~220줄 | ✅ |

**선제 분할**: validate가 800줄 임계 도달 가능 → 신규 모듈 추가 전 `stock-transfer-tax-validate-market.ts`·`-capital.ts` 분할.

## 11. 의존성·순서

```
-1. R-4 사전 grep 검증         ← appraisal 잔재 파일·줄 확인
0. R-4 (appraisal 제거)        ← 침습 최소·dead-code 정리, 첫 단계
1. types 갱신                   ← enum + 신규 필드
2. legal-codes 갱신             ← STOCK §17·§176의2 상수 추가
3. validate 분할 + 신규 validator (R-1' + R-2)
4. Zod schema 갱신              ← input · refine
5. API 변환 갱신                ← body spread
6. Route handler 갱신           ← input 매핑 + STOCK_DATE_FIELDS
7. 엔진 모듈 신규               ← stock-valuation-market-sample.ts + stock-capital-adjustments.ts
8. stock-transfer-tax.ts 통합   ← STEP 3.5 호출 + result echo
9. anchor 테스트 19건
10. Form 상태 + initial + normalize
11. UI 컴포넌트 (Block 2종 + Card 2종)
12. Step2.tsx 통합
13. R-3 PrRoadmapCard 갱신
14. 회귀 + 수동 확인
```

## 12. 종료 조건 (계획서 §9와 동기)

- [ ] anchor 19건 신규 + 회귀 345 PASS 보존
- [ ] typecheck 0건
- [ ] 14지점 sync-checker 0 누락
- [ ] 브라우저 S-1~S-5 시나리오 확인 (또는 미수행 명시)
- [ ] 로드맵 카드 시각 확인 (S-5)
- [ ] 계획서·디자인 문서 cross-link 검증
