# 주식 양도세 — 취득 후 상장 환산취득가 PDF 완전 재현 확장 계획서

> **문서 종류**: PDCA Plan
> **작성일**: 2026-05-18 (v4 — Round 1·2·3·4 검토 반영, 누적 68건 정정)
> **작성자**: kwonohjik
> **세목**: stock-transfer (주식 양도소득세)
> **기반 PDF**: `주식-취득후 상장.pdf` (예제 출처 PDF — 사례 코드명 `EXAMPLE_POST_LISTING`)
> **법령 본칙**: 소득세법 시행령 §165⑤ + 시행령 §165④1 본칙 + 시행규칙 §81② → 상증령 §17 (환원율 10%) + 시행규칙 §81④ (월할 가산)
> **참고 동치**: 상속세및증여세법 §63①1호 나목 · 상증령 §54 · §55 (산식 동치 확인용 — 본칙 아님)

---

## 1. 배경 (Context)

### 1.1 현행 구현 상태

엔진·UI·사례 anchor가 이미 일부 존재한다.

| 구분 | 파일 | 상태 |
|---|---|---|
| 엔진 | `lib/tax-engine/stock-transfer/stock-valuation-post-listing.ts` | ✅ §165⑤ 환산 + (3+2)/5 가중 + §81④ 월할 가산 |
| 법령 상수 | `lib/tax-engine/legal-codes/stock.ts` (L150·205) | ✅ `ENFORCEMENT_DECREE_165_5_POST_LISTING` + `STOCK_LOSS_GAIN_DISCOUNT_RATE` |
| UI 카드 | `components/calc/stock-transfer/PostListingValuationCard.tsx` (229줄) | ✅ 간이 입력 (4개 결과값 직접 입력) |
| 진입점 | `Step2.tsx` L359: `acquisitionMode === "estimated" && isListed` → 카드 내부 `acquiredBeforeListing` 토글 | ✅ |
| 결과 표시 | `StockTransferTaxResultView.tsx` | ✅ |
| Anchor | `__tests__/.../case-48-acquired-then-listed.test.ts` | ✅ 본칙 자가검증 + alternative PDF 별도 추적 |

### 1.2 예제 PDF 사례 — 3개 입력 화면 구조

PDF는 환산취득가 산출을 위해 **3개 다이얼로그**를 제공한다.

| # | 다이얼로그 | 핵심 출력 | 현행 UI 상태 |
|---|---|---|---|
| ① | **상장시 주당 평가액** (**상장일 이후 1개월간** 거래일 21개 종가 ✱ Phase A 확정) | 1개월 종가평균 8,001 | ❌ 미구현 — 단일 금액 직접 입력 |
| ② | **순손익 계산서** (상장일·취득일 직전 사업연도 2열 × 24행) | 1주당 순손익가치 (61,570 / 44,520) | ❌ 미구현 — 결과값 직접 입력 |
| ③ | **순자산가액 계산서** (2열 × 20행) | 1주당 순자산가치 (5,352 / 4,348) | ❌ 미구현 — 결과값 직접 입력 |

> ✱ **시기 결론 (Phase A 확정, 2026-05-18)**: §165⑤은 "**상장일 이후 1개월**" 종가평균을 적용. 근거 — §165⑤ 본문은 "**코스닥시장 또는 코넥스시장 상장일 현재의 제4항에 따른 평가액**"을 분모로 사용하며, 상장일 이전은 비상장 기간으로 종가 미존재. PDF 사례 48 입력 일자 (2009-08-21 상장 → 2009-08-21~2009-09-21 종가) 일치. 엔진 주석(`stock-valuation-post-listing.ts` L10) + UI 라벨(`PostListingValuationCard.tsx` L128 "직전") 모두 **"이후"로 정정** (Phase C2).

### 1.3 사용자 요청 명세 (인터뷰 결과)

| 질문 | 답변 |
|---|---|
| UI 노출 범위 | **C — PDF 3개 화면 모두 재현 (완전)** |
| 양도가액 처리 | **현행 그대로 + 취득가액만 환산 신규** — 양도시 종가평균 화면(8,659) 본 PR **범위 외** |
| 법령 근거 표기 | §165⑤ 단서 + (참고) 상증법 §63① |
| Anchor | PDF 수치 100% 재현 (중간값 포함) |
| 진입점 | `acquiredBeforeListing` 토글 내부 `unlistedDetailMode` 서브토글 신설 (taxCategory와는 무관) |
| 상장시 주당 평가액 8,001의 용도 | **§165⑤ 환산 입력값** (취득가액 산정용, 양도가액과 별개) |

---

## 2. 정책 사전 적용 (메모리 인덱스 검색)

[[policy-check]] 스킬 패턴 — Round 1 검토에서 보강.

| 정책 | 적용 방안 |
|---|---|
| [[feedback_ui_input_path_enumeration]] ★★★ | §3.2 케이스 매트릭스 6분기 enumerate — Round 1에서 80% 하한 미적용 회귀 anchor 추가 |
| [[feedback_api_zod_schema_sync]] ★★★ | 14지점 동기화 — 신규 필드 + `string[]` 배열 2종에 대해 ⑨⑫⑭ 명세 |
| [[feedback_pre_anchor_verification]] ★★★ | **Pre-Do anchor 5건** — PDF 종가평균 8,001 자가산출 |
| [[feedback_engine_comment_vs_impl_drift]] ★★★ | **§1.2 시기 검증 항목 신설** — 엔진 주석·UI·PDF 시기 불일치 KoreanLaw로 확정 |
| [[feedback_no_yangdo_korea_brand]] ★★★ | 사례명 `EXAMPLE_POST_LISTING`. 코멘트·anchor 변수명에 "예제" 표기 금지 |
| [[feedback_ui_engine_dual_truth_avoidance]] ★★★ | UI 미리보기는 **엔진 함수 import 강제** — `calcUnlistedPerShareWeighted` 등 export하여 재사용. 자체 산식 재구현 금지 |
| [[feedback_store_default_vs_ui_display_fallback]] ★★★ | `unlistedDetailMode` factory default = normalize 빈문자 = sessionStorage 마이그 = UI 직접 사용 (4중 일관성) |
| [[feedback_useeffect_store_mirror_forbidden]] | 일자별 종가 합계·평균은 useMemo, 4개 기존 input 필드 자동 채움도 **onChange 즉시 반영** (useEffect → store 금지) |
| [[feedback_legal_codes]] | 신규 상수: `ENFORCEMENT_DECREE_165_5_POST_LISTING`(기존) + 시행규칙 §81②·§81④ + 상증령 §17 라벨 보강 |
| [[feedback_select_on_focus]] | 일자별 종가 다수 input — Provider 자동 적용 (수동 onFocus 금지) |
| [[feedback_decimal_input]] | 종가·금액 = `CurrencyInput`. 환원율(%)·주식수(주)는 별도 (§3.3 참고) |
| [[feedback_no_won_suffix]] | 결과/anchor "원" 단위 표기 금지 |
| [[feedback_3point_input_consistency]] | 환원율 UI(%) ↔ 엔진(decimal) 변환은 **api.ts ④에서 일괄** |
| **현행 위반 정정** | `PostListingValuationCard.tsx` placeholder 5건 숫자 예시 → 한국어 |

---

## 3. 계획 (Plan)

### 3.1 KoreanLaw MCP 사전 검증 (Plan 단계 강제)

[[feedback_engine_comment_vs_impl_drift]] — **본칙 5건 + 시기 검증 1건**.

| 조문 | 검증 항목 | 우선순위 |
|---|---|---|
| 소령 **§165⑤ 단서** | 취득 당시 비상장 + 양도 당시 상장 환산식 정확 표기 + **"상장일 1개월" 시기**(전/후/주변) ★ | **CRITICAL** |
| 소령 §165④1 본칙 | 가중평균 (순손익×3 + 순자산×2)÷5 + 80% 하한 단서 | HIGH |
| 시행규칙 **§81② → 상증령 §17** | 순손익가치 환원율 = 연간 100분의 10 (Phase A 결론 — v3 "§82" 오류 정정) | HIGH |
| 시행규칙 **§81④** | 취득일 평가 = 상장일 평가인 경우 사업연도 내 월할 가산 — **산식·발동 조건** | HIGH |
| (참고) 상증령 §54 | 1주당 순손익가치 = 최근 3년 가중평균 ÷ 환원율 — **산식 동치 확인용** | MEDIUM |
| (참고) 상증령 §55 | 1주당 순자산가치 = (자산 − 부채) ÷ 발행주식총수 — **산식 동치 확인용** | MEDIUM |

**Plan 단계 산출물**: 원문 인용 6건을 본 계획서 §11(부록)에 첨부 + 시기 결론 1건.

### 3.2 케이스 매트릭스 — 6개 분기 전수 enumerate

[[feedback_ui_input_path_enumeration]] 강제.

| # | 시나리오 | unlistedDetailMode | 일자별 종가 | 순손익 상세 | 순자산 상세 | 부동산과다 | 월할 가산 | 80% 하한 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Simple** — 결과값 4개 직접 입력 (현행 호환) | `"simple"` | OFF | OFF | OFF | 일반(3:2) | 자동 | **미적용** ★ | 회귀 보호 — 기존 사례 48 anchor 유지 |
| 2 | **Listing-only detail** — 상장연도만 상세 | `"listing_only"` | 종가 화면 ON | 상장만 ON / 취득연도 직접 | 상장만 ON / 취득연도 직접 | 일반 | 자동 | 미적용 | 부분 노출 |
| 3 | **Full PDF replica** — 3개 화면 모두 ON | `"full"` | 16~32 종가 | 24행 2열 | 20행 2열 | 일반 | 자동 | **미적용 (회귀 anchor 강제)** ★ | PDF 사례 100% 재현 |
| 4 | **Heavy real estate** — 부동산과다 (3:2 → 2:3) | `"full"` | ON | ON | ON | **반전(2:3)** | 자동 | 미적용 | §165⑤ 가중치 반전(`isHeavyRealEstateForValuation`) |
| 5 | **§81④ 월할 가산** — 취득일 평가 = 상장일 평가 | `"full"` | (선택) | ON | ON | 일반 | **수동 ON** | 미적용 | 동일 사업연도 |
| 6 | **거래정지** — §165③ (1개월 종가 → 비상장 평가) | (모드 무관) | OFF (사용 불가) | ON | ON | (양도일 기준 별도) | 자동 | (양도 평가 별도) | **본 PR 범위 외 — 후속** |

★ **80% 하한 미적용 회귀 anchor 강제**: Case 1·3에 anchor 1건씩 추가 — `(취득연도 평가/상장연도 평가) ≥ 0.80 임의 가정 입력 시에도 ratio 그대로 적용` 검증.

**Do 진입 차단**: 위 표 매트릭스 합의 + Phase A KoreanLaw 시기 결론 + Phase B Pre-Do anchor 5건 PASS 후 Do 진입.

### 3.3 신규 폼 필드 (FormData) — 행 수 PDF 1:1 정밀화

PDF 표 행 수 1:1 재산정.

#### 모드 토글 (2필드)
| # | 필드 | 타입 | 비고 |
|---|---|---|---|
| F-01 | `unlistedDetailMode` | `"simple" \| "listing_only" \| "full"` | default `"simple"` (4중 일관성) |
| F-02 | `monthlyAccrualToggle` | `boolean` | §81④ 수동 ON, default false |

#### 상장시 1개월 종가 화면 (4필드, 배열 length는 가변)
| # | 필드 | 타입 | 비고 |
|---|---|---|---|
| F-03 | `listingPriceDates` | `string[]` | YYYY-MM-DD. PDF 16행 × 2열 = **최대 32 슬롯** (가변 길이, 휴일·주말 빈문자 허용) |
| F-04 | `listingPriceClosing` | `string[]` | 원 (CurrencyInput parse). length = F-03와 동일 |
| F-05 | `listingPriceBasisDate` | `string` | 평가기준일 (자동 = 상장일 ± 1일) |
| F-06 | `listingPriceHasIncrease` | `boolean` | 증자·합병 여부 (default false, 향후 환산주식수 후속 PR 신호) |

#### 순손익 계산서 — PDF 24행 표 정밀화 (총 16필드 × 2열 = 32 + 보조 4 = **36**)

PDF 24행 구조 (Round 2 정정 — Phase A에서 PDF 캡처 첨부 후 동결):
- (A) 가산항목 합계 = 행 1~4 + 행(A) 소계
- (B) 차감항목 합계 = 행 5~16 + 행(B) 소계
- 행 17 = 순손익액 (A−B)
- 행 18·19 = 비어있음 (PDF 캡처상 표시 안 됨)
- 행 20 = 사업연도말 주식 또는 환산주식수
- 행 21 = 주당 순손익액 (17÷20)
- 행 22 = 비어있음
- 행 23 = 기획재정부장관이 고시하는 이자율 (환원율)
- 행 24 = 1주당 가액 (21÷23)

**입력 데이터 행 = (A)4개 + (B)12개 = 16개 + 환산 보조 2개 (주식수·환원율) = 18 × 2열 = 36 필드**.

| 구분 | 필드 (상장연도 / 취득연도) | PDF 행 | 입력 단위 |
|---|---|---|---|
| 가산 (A) | `niAddRow1·2·3·4` × 2열 | 행 1~4 | 회사 단위 원 |
| 차감 (B) | `niSubRow5·6·7·8·9·10·11·12·13·14·15·16` × 2열 | 행 5~16 | 회사 단위 원 |
| 환산 — 주식수 | `niShareCountListing` / `niShareCountAcq` | 행 20 | 주 (정수) |
| 환산 — 환원율 | `niDiscountRateListing` / `niDiscountRateAcq` | 행 23 | % (default `"10"`, 시행규칙 §81② → 상증령 §17) |

→ 총 **16 × 2 + 2 × 2 = 36 필드**. 필드명은 PDF 행 번호와 1:1 일관(예: `niAddRow1Listing` / `niAddRow1Acq`).

> **Phase A 산출물**: PDF 캡처 첨부 + 행 번호 동결 문서. 행 번호가 PDF와 어긋나면 Do 진입 차단.

#### 순자산가액 계산서 — PDF 20행 표 정밀화 (총 18필드 × 2열 = 36 + 보조 2 = **38**) — Round 4 C-01 정정

PDF 20행 구조 (Round 2 정정 — Phase A에서 PDF 캡처 첨부 후 동결):
- 행 1 = 재무상태표상 자산가액(자산총계)
- 행 2~5 = 자산에 가산 (2 평가차액·3 법인세법상 유보금액·4 유상증자 등·5 기타)
- 행 6·7 = 자산에서 제외 (6 선급비용/이연자산·7 증자일전잉여금의 유보액)
- 행 가 = 자산총계 ((1+2+…+5)−(6+7))
- 행 8 = 재무상태표상의 부채액
- 행 9~14 = 부채에 가산 (9 법인세·10 농특세·11 지방소득세·12 배당금/상여금·13 퇴직급여추계액·14 기타)
- 행 15·16·17 = 부채에서 차감 (15 제준비금·16 제충당금·17 외화환산대)
- 행 나 = 부채총계 ((8+9+…+14)−(15+16+17))
- 행 18 = 영업권포함전순자산가액 (가 − 나)
- 행 19 = 영업권
- 행 20 = 순자산가액 (18 + 19)

**입력 데이터 행 = 자산 7개(행 1 총계 + 행 2~5 가산 4 + 행 6·7 차감 2) + 부채 10개(행 8 총계 + 행 9~14 가산 6 + 행 15~17 차감 3) + 영업권 1개(행 19) = 총 18개** (Round 4 C-01 정정 — v3의 "9개"·"17~18개" 오기).

| 구분 | 필드 (상장연도 / 취득연도) | PDF 행 | 입력 단위 |
|---|---|---|---|
| 자산총계 | `naAssetTotalRow1Listing` / `naAssetTotalRow1Acq` | 행 1 | 회사 단위 원 |
| 자산 가산 | `naAssetAddRow{2,3,4,5}Listing` / `naAssetAddRow{2,3,4,5}Acq` | 행 2~5 | 동상 |
| 자산 차감 | `naAssetSubRow{6,7}Listing` / `naAssetSubRow{6,7}Acq` | 행 6·7 | 동상 |
| 부채총계 | `naLiabTotalRow8Listing` / `naLiabTotalRow8Acq` | 행 8 | 동상 |
| 부채 가산 | `naLiabAddRow{9,10,11,12,13,14}Listing` / `naLiabAddRow{9,10,11,12,13,14}Acq` | 행 9~14 | 동상 |
| 부채 차감 | `naLiabSubRow{15,16,17}Listing` / `naLiabSubRow{15,16,17}Acq` | 행 15~17 | 동상 |
| 영업권 | `naGoodwillRow19Listing` / `naGoodwillRow19Acq` | **행 19** (Round 1 v2의 행 18 표기 정정) | 동상 (optional) |
| 환산 — 주식수 | `naShareCountListing` / `naShareCountAcq` | (별도) | 주 (정수, `niShareCount`와 분리) |

→ 총 **18 × 2 + 1 × 2 = 38 필드** (자산 7 + 부채 10 + 영업권 1 = 18 데이터행 × 2열 + 주식수 2). 영업권 행 번호는 PDF 캡처상 19행 (Phase A 동결).

#### 합산 (Round 4 C-01 정정)
- 모드 토글: 2
- 종가 화면: 4 (그중 2개는 `string[]`)
- 순손익: 36 (16 데이터행 × 2열 + 보조 4)
- 순자산: 38 (18 데이터행 × 2열 + 보조 2)
- **신규 폼 필드 총 80** (v1 22 → v3 78 → v4 80 — 부채 데이터 10행 재산정)

**현행 4 결과 필드 호환**: `listingYearNetIncomePerShare` / `listingYearNetAssetPerShare` / `acquisitionYearNetIncomePerShare` / `acquisitionYearNetAssetPerShare`는 그대로 유지. `unlistedDetailMode === "full"`일 때 **api.ts 변환 단계 ④에서 80필드 → 4필드 환산 후 엔진 body에 spread**. UI는 useMemo 미리보기 표시만 (store 미러링 금지).

### 3.4 신규 엔진 헬퍼 (현행 엔진 확장)

기존 `stock-valuation-post-listing.ts`는 1주당 가치 4개 직접 받음. 신규 헬퍼는 **상세 행 → 1주당 가치 환산** + UI 재사용용 export.

| # | 신규 함수 | 위치 | 시그니처 | 산식 근거 |
|---|---|---|---|---|
| H-01 | `calcMonthlyClosingAverage` | `stock-valuation-listed.ts` 확장 | `(dates: string[], closes: string[]) → { tradingDays, sum, avg }` | §99①3 류 |
| H-02 | `calcNetIncomePerShare` | `stock-valuation-unlisted.ts` 확장 | `(rows: { addA: number[]; subB: number[] }, shareCount: number, discountRate: number) → { netIncomeAmount, perShareIncome, perShareValue }` | 상증령 §54 동치 |
| H-03 | `calcNetAssetPerShare` | `stock-valuation-unlisted.ts` 확장 | `(rows: { assetTotal: number; assetAdd: number[]; assetSub: number[]; liabTotal: number; liabAdd: number[]; liabSub: number[]; goodwill: number }, shareCount: number) → { netAssetAmount, perShareAsset }` | 상증령 §55 동치 |
| H-04 | `calcUnlistedPerShareWeighted` | `stock-valuation-post-listing.ts` (현행 private → **export**) | `(netIncomeValue: number, netAssetValue: number, isHeavyRE: boolean) → number` | §165④1 |
| H-05 | `buildPostListingFromDetail` | `stock-valuation-post-listing.ts` (신규) | `(detail: PostListingDetailInput) → { listingDatePriceAvg1Month, listingYearNetIncomePerShare, listingYearNetAssetPerShare, acquisitionYearNetIncomePerShare, acquisitionYearNetAssetPerShare }` | 합성 함수 |

`PostListingDetailInput` 타입은 `types/stock-transfer.types.ts`에 신설 — 80필드를 nested object로 묶음:
```ts
type PostListingDetailInput = {
  unlistedDetailMode: "simple" | "listing_only" | "full";
  closing?: { dates: string[]; closes: string[]; basisDate: string; hasIncrease: boolean };
  netIncome?: { listing: NIYear; acquisition: NIYear };  // NIYear = { addA: number[]; subB: number[]; shareCount: number; discountRate: number }
  netAsset?: { listing: NAYear; acquisition: NAYear };  // NAYear = { assetTotal; assetAdd[]; assetSub[]; liabTotal; liabAdd[]; liabSub[]; goodwill; shareCount }
};
```

**[[feedback_ui_engine_dual_truth_avoidance]] 강제**: UI `PostListingFormulaPreview` 컴포넌트는 H-01~H-04를 **직접 import**하여 미리보기 산출. UI 자체 산식 재구현 0건.

**Flat → Nested 어댑터 (R2-03 신설)**: 80개 flat 폼 필드 → H-02·H-03 nested object 매핑은 **`lib/tax-engine/stock-transfer/post-listing-flat-adapter.ts`** (신규)에 단일 위치. UI 미리보기·API 변환 양쪽에서 동일 어댑터 import. 시그니처:
```ts
export function adaptFlatToPostListingDetail(form: PostListingFlatForm): PostListingDetailInput;
export function adaptFlatToApiBody(form: PostListingFlatForm): Pick<StockTransferInput, ...>;
```
환원율 `"10"` (%) → `0.10` 변환은 이 어댑터 내부에서 일괄.

### 3.5 산출물 — UI Sub-Components (800줄 정책 사전 분할)

```
components/calc/stock-transfer/
├── PostListingValuationCard.tsx                  (229 → ~280줄, orchestrator)
├── PostListingClosingPriceTable.tsx              (신규, ~260줄) — F-03~F-06 일자별 종가 16~32행
├── PostListingNetIncomeStatement.tsx             (신규, ~340줄) — 순손익 16행 × 2열 + 보조 2행
├── PostListingNetAssetStatement.tsx              (신규, ~300줄) — 순자산 18행 × 2열 + 보조 1행
└── PostListingFormulaPreview.tsx                 (신규, ~150줄) — 환산 미리보기 (엔진 H-01~H-04 import)
```

**Props 시그니처**: `Pick<StockTransferFormData, ...>` + `onChange: (patch: Partial<StockTransferFormData>) => void` (현행 패턴 유지).

**진입 게이트 우선순위 (R2-05)**:
```
showPostListingCard
  = acquisitionMode === "estimated"
  && isListed
  && acquiredBeforeListing === true   // ← 최우선 게이트

showDetailSubComponents
  = showPostListingCard
  && unlistedDetailMode !== "simple"   // ← 모드별 분기

showClosingPriceTable   = showDetailSubComponents && unlistedDetailMode === "full"
showNetIncomeStatement  = showDetailSubComponents  // full + listing_only
showNetAssetStatement   = showDetailSubComponents  // full + listing_only
```

`unlistedDetailMode === "full"`이라도 `acquiredBeforeListing === false`이면 sub-component 미표시 (모드 자동 reset 안 함 — 사용자가 토글 OFF로 끔).

### 3.6 결과 카드 — 산식 확장

`StockTransferTaxResultView` 내 **`PostListingDetailCard` 신설**.

- **위치**: `LotMatchingDetailCard` 직후 (취득가액 산정 상세 영역)
- **산식**: `1주당 취득기준시가 = 상장일 직전/직후 1개월 종가평균(시기는 §1.2 결론) × (취득연도 평가 ÷ 상장연도 평가)`
- **중간값 표시**: 8,001 / 39,083 / 28,451 / 0.72792 / 5,824 / 29,120,000
- **법조문 배지**: `§165⑤ 단서` (본칙) + `§165④1` (가중) + (참고) `상증법 §63① · §54 · §55`
- **80% 하한 비적용 명시 주석**: violet 카드로 "환산비율 산정에는 80% 하한 미적용 — 양도일 기준 비상장 평가와 별개"
- **결과 컨텍스트 (R2-08)**: 환산 중간값 6개와 함께 **사례 자가검증 라인** 표시 — `양도가액 44,750,000 − 환산취득가 29,120,000 − 개산공제 291,200 = 양도차익 15,338,800 → 산출세액 ...`. 사용자가 PDF 산식과 1:1 대조 가능.

### 3.7 Anchor 테스트 (PDF 100% 재현)

**파일 분할 (R2-13)** — 그룹별 800줄 정책 사전 대응:
- `__tests__/tax-engine/stock-transfer/post-listing-detail.closing.test.ts` (~180줄) — PL-CLOSE
- `__tests__/tax-engine/stock-transfer/post-listing-detail.netincome.test.ts` (~220줄) — PL-NI + PL-WEIGHT 상장연도
- `__tests__/tax-engine/stock-transfer/post-listing-detail.netasset.test.ts` (~200줄) — PL-NA + PL-WEIGHT 취득연도
- `__tests__/tax-engine/stock-transfer/post-listing-detail.full.test.ts` (~280줄) — PL-CONV·PL-FULL·PL-RE·PL-MONTHLY·PL-FLOOR·PL-LEGACY·PL-BUILD
- 보조 헬퍼 `__tests__/tax-engine/stock-transfer/helpers/post-listing-input-builder.ts` (~150줄) — 80필드 입력 객체 빌더 (4 test 파일 공유)
- **Round 4 H-07 추가**: `__tests__/calc/stock-transfer/post-listing-validate.test.ts` (~120줄) — validate 모드별 매트릭스 3건 (`simple` 4 / `listing_only` 22 / `full` 80) + Round 4 H-03 조합 차단 1건 (`tradingHaltAtTransfer + acquiredBeforeListing + unlistedDetailMode !== "simple"`) = **총 4건**

**범위 정정**: 양도시 1개월 평균(8,659)은 본 PR **범위 외** — 해당 anchor 그룹 삭제.

| Group | Anchor 수 | 내용 |
|---|---|---|
| PL-CLOSE-1~5 | 5 | 상장일 직후 1개월 종가합계 168,040 / 거래일 21 / 평균 **8,001** ✱ (시기 §1.2 결론 적용) |
| PL-NI-1~10 | 10 | 순손익 24행 산식 — (A 4행 − B 12행)/주식수 × (1/10%) = 61,570 (상장) / 44,520 (취득) |
| PL-NA-1~8 | 8 | 순자산 20행 산식 — (자산 7항 − 부채 9항 + 영업권)/주식수 = 5,352 (상장) / 4,348 (취득) |
| PL-WEIGHT-1~4 | 4 | (61,570×3 + 5,352×2)/5 = 39,083 (상장) / (44,520×3 + 4,348×2)/5 = 28,451 (취득). 80% 하한 미적용 검증 |
| PL-CONV-1~6 | 6 | 환산비율 28,451 ÷ 39,083 = 0.72792 / 1주당 floor(8,001 × 0.72792) = 5,824 / 총취득가 5,824 × 5,000 = 29,120,000 |
| PL-FULL-1~3 | 3 | full mode integration — 사례 산출세액 자가검증 (PDF 2,372,760 alternative + 본칙 2,667,760) |
| PL-RE-1~4 | 4 | Case 4 부동산과다 (2:3 가중) — `isHeavyRealEstateForValuation=true` |
| PL-MONTHLY-1~3 | 3 | Case 5 §81④ 월할 가산 — `monthlyAccrualToggle=true` + 사업연도 6개월 |
| PL-FLOOR-1~2 | 2 | **80% 하한 미적용 회귀 보호 — Round 4 H-06 양방향**: PL-FLOOR-1(ratio=0.85, ≥0.80) + PL-FLOOR-2(ratio=0.50, <0.80) 모두 ratio 그대로 적용 |
| PL-LEGACY-1~5 | 5 | Case 1 simple mode 호환 — 기존 사례 48 anchor 회귀 보호 |
| PL-BUILD-1~2 | 2 | `buildPostListingFromDetail` 합성 함수 — 80필드 → 4필드 환산 정확성 |
| **합계** | **52** | (계획서 v1 55 → PL-CLOSE 6 삭제 + PL-FLOOR 2·PL-BUILD 2 추가) |

**Pre-Do 우선 anchor 5건**: PL-CLOSE-1·PL-NI-1·PL-NA-1·PL-CONV-1·PL-FULL-1. [[feedback_pre_anchor_verification]] — Plan Phase A 종료 직후 즉시 실행. PDF 수치 재현 가능성 검증 + 시기(직전/직후) KoreanLaw 결론 cross-check.

✱ **PL-CLOSE-1 시기**: §1.2의 KoreanLaw 결론에 따라 입력 일자가 "상장일 직전" 혹은 "직후"가 변경될 수 있음. 산출값 8,001은 동일하나 의미·UI 라벨이 달라짐. anchor 코멘트에 결론 명시.

### 3.8 14개 동기화 지점 점검표 — Round 1 정밀화

| # | 지점 | 작업 |
|---|---|---|
| ① | FormData 타입 | `calc-wizard-stock-store.ts` — 신규 필드 **80개** (모드 2 + 종가 4 + 순손익 36 + 순자산 38) 추가. `string[]` 2종 명시 |
| ② | initial value | `INITIAL_STOCK_FORM_DATA` — string 빈문자, `string[]` 빈 배열 default |
| ③ | normalize | `normalizeStockForm` — sessionStorage 마이그: undefined → "" / Array.isArray(...) ? ... : []. `unlistedDetailMode` enum 빈문자 → `"simple"` |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api.ts` — `unlistedDetailMode === "full"` 분기에서 H-05 호출하여 4 input 필드 + `acquiredBeforeListing=true`로 body 합성. 환원율 "10" → 0.10 변환 책임 |
| ⑤ | UI 위젯 | 4 신규 sub-component (§3.5) |
| ⑥ | 사이드바 합계 | **Round 4 D-01·C-01 정정**: `computeStockSummary` 함수는 **존재하지 않음**. 실제 위치 = `components/calc/stock-transfer/StockSidebar.tsx`의 `summary` useMemo. 현행 8개 표준 표시 항목(양도가액·취득가액·필요경비·양도소득금액·기본공제·과세표준·산출세액·지방소득세) 유지. **"취득가액" 항목 effective 값에 full mode adapter 호출** 추가하여 `adaptFlatToApiBody(form).postListingDetail` 활성 시 환산 결과로 자동 반영. 별도 항목 추가 X (8항목 표준 보존). 0·NaN 가드 |
| ⑦ | 결과 카드 | `PostListingDetailCard` 신설 + `StockTransferTaxResultView` LotMatchingDetailCard 다음 위치 삽입 |
| ⑧ | Validation | `stock-transfer-tax-validate.ts` Step2 — **모드별 필수 매트릭스 (R2-04)**:<br>• `simple`: 현행 4필드만 (회귀 호환)<br>• `listing_only`: 종가 화면 4 + 상장 18 = 22 필수 + 취득 4 결과값 직접<br>• `full`: 80필드 모두 필수<br>API/UI fallback 있는 필드는 validate에도 동일 fallback 인식. UI 통과↔validate 차단 모순 방지 |
| ⑨ | Zod enum (메인) | `stock-transfer-tax-schema.ts` — `unlistedDetailModeSchema = z.enum(["simple","listing_only","full"])` 추가 |
| ⑩ | Zod enum (컴패니언) | N/A — 자산-수준 아님 |
| ⑪ | acquisitionDate fallback | N/A |
| ⑫ | Zod 입력 객체 | `stock-transfer-tax-schema.ts` — 80필드 정의. **`string[]` 2종**은 `z.array(z.string()).optional().default([])`. nested object 직접 펴서 정의 (현행 패턴 따름) |
| ⑬ | callStockTransferAPI body spread | `stock-transfer-tax-api.ts` — **R2-07 800줄 위반 대응**: 80필드 spread를 인라인 작성하지 않고 `buildPostListingApiBody(form)` 헬퍼(`lib/calc/stock-transfer-post-listing-api-helper.ts` 신규 ~120줄)로 분리. callStockTransferAPI 본체에서는 `...buildPostListingApiBody(form)` 한 줄만 추가 |
| ⑭ | route handler 매핑 | `app/api/calc/stock-transfer/route.ts` — **단건 POST + buildEngineInput 두 곳 모두** 매핑. lots-only 작업 선례 ([[project_stock_transfer_acquisition_lots_only]]) 재발 차단. **점검 grep**: `grep -n "listingPriceClosing\\|niAddRow1\\|naAssetTotalRow1" app/api/calc/stock-transfer/route.ts` → 2회 이상 매치 확인 |

### 3.9 정정 항목 (현행 위반) — Round 1 추가

| # | 위치 | 위반 | 정정 |
|---|---|---|---|
| C-01 | `PostListingValuationCard.tsx` L131·146·154·171·179 | placeholder `"8,001"`·`"61,570"`·`"5,352"`·`"44,520"`·`"4,348"` 숫자 예시 | 한국어 설명 |
| C-02 | `PostListingValuationCard.tsx` L128 | "상장일 직전 1개월" 표기 | §1.2 KoreanLaw 결론에 따라 정정 |
| C-03 | `stock-valuation-post-listing.ts` L10 | 엔진 주석 "상장일 1개월" 모호 | §1.2 결론 반영하여 정확 표기 |
| C-04 (**Phase A 정정**) | `legal-codes/stock.ts` 환원율 라벨 미명시 | `ENFORCEMENT_RULE_81_2_DISCOUNT_RATE: "소득세법 시행규칙 §81②"` + `INHERITANCE_GIFT_RULE_17_DISCOUNT_RATE: "상속세및증여세법 시행규칙 §17"` 2건 신설 (v3 §82는 오류) |
| C-05 | 결과 카드 | 80% 하한 비적용 명시 누락 | violet 안내 카드 추가 |
| **C-06** | `PostListingValuationCard.tsx` L219~225 `tradingHaltAtTransfer` 토글 | 본 PR 범위 외(Case 6)인데 카드 내부 표시 | **R2-06**: full mode 진입 시 disabled + tooltip "거래정지 시나리오는 후속 PR 예정" (제거하지 않음 — Case 6 후속 PR에서 활성화) |
| **C-07** | `legal-codes/stock.ts` 신규 상수 추가 위치 | C-04와 통합 — STOCK 객체 멤버 `ENFORCEMENT_RULE_81_4_MONTHLY_ACCRUAL` L157 아래에 2건 추가 (Phase A 정정 — §81② + 상증령 §17) |
| **C-08** | UI 환원율 표시 통일 | 입력은 `"10"`, 라벨에 `%` suffix. 미리보기에서 `0.10`·`10%` 혼용 가능 위험 | **R2-11**: UI 표시 항상 `"10%"`, 엔진 `0.10`, 변환은 adapter 단일 위치 |

---

## 4. 작업 분할 (Sequencing)

[[feedback_pdca_session_efficiency]] — Round 1 책임 경계 재정의.

| Phase | 담당 | 주요 작업 | 산출물 |
|---|---|---|---|
| **A. KoreanLaw 검증** | `stock-transfer-tax-senior` | §165⑤·§165④1·§81②·§81④·상증령 §17·(참고) §63①·§54·§55 원문 검증 + **시기 결론**(상장일 직전/직후 1개월) | §11 부록 + §1.2 결론 |
| **B. Pre-Do anchor 5건** | `stock-transfer-tax-senior` | PL-CLOSE-1·PL-NI-1·PL-NA-1·PL-CONV-1·PL-FULL-1 우선 작성·실행 | 5 PASS / 디자인 환류 |
| **C. 엔진 헬퍼 확장 H-01~H-05** | `stock-transfer-tax-senior` | 5개 함수 export + `PostListingDetailInput` 타입 + anchor 52건 통과 | engine commit |
| **D. UI — 종가 표** | `stock-transfer-tax-ui-senior` | `PostListingClosingPriceTable.tsx` + 16~32행 가변 입력 | 1 컴포넌트 commit |
| **E. UI — 순손익** | `stock-transfer-tax-ui-senior` | `PostListingNetIncomeStatement.tsx` 24행 × 2열 | 1 컴포넌트 commit |
| **F. UI — 순자산** | `stock-transfer-tax-ui-senior` | `PostListingNetAssetStatement.tsx` 20행 × 2열 | 1 컴포넌트 commit |
| **G. UI — orchestrator + 미리보기** | `stock-transfer-tax-ui-senior` | `PostListingValuationCard` 재구성 + `PostListingFormulaPreview` 추출 (엔진 import) + 정정 C-01·C-02 | 2 컴포넌트 commit |
| **H. 14지점 sync + 결과 카드 + 사이드바** | `stock-transfer-tax-ui-senior` + 본 세션 | ④⑥⑦⑨⑫⑬⑭ + `PostListingDetailCard` + `computeStockSummary` | sync-checker 통과 |
| **I. QA** | `tax-qa-lead` + `ui-engine-sync-checker` | Anchor 52건 PASS + matchRate ≥ 90 + 전체 회귀 0건 | 보고서 |
| **J. 브라우저 수동 확인** | 본 세션 | 마법사 진입 → full mode → PDF 사례 입력 → 결과 정합 + Network 탭 body 신규 80필드 확인 | 스크린샷 + Network 캡처 |
| **J+. (권장) Playwright 자동 회귀** | 본 세션 또는 후속 PR | `.mjs` 자동 검증 — full mode 진입 → 80필드 입력 → 결과 카드 정합. 사례 36·37·45 선례 패턴 (**R2-14**) | `.mjs` 신규 또는 후속 신호 |
| **K. 환류** | 본 세션 | `recent-completions.md` + `roadmap.md` 갱신 + 신규 메모리 entry 추가 + 후속 PR 신호 정리 | 메모리 갱신 |

**Plan 병렬 / Do 시퀀셜** 패턴:
1. Phase A·B (엔진 anchor) **선처리**
2. Phase C (엔진 헬퍼) — anchor 통과 후 진입
3. Phase D~G (UI) **시퀀셜** — 컴포넌트 1개씩 commit
4. Phase H (sync) **마지막 한 번에** ④⑥⑦⑨⑫⑬⑭ 동기화

**Phase 게이트 (R2-02)**:

| 게이트 | 조건 | 미충족 시 |
|---|---|---|
| A → B | R-06 (상장일 1개월 직전/직후 시기) 결론 확정 + §11 부록 6건 인용 첨부 + PDF 행 번호 동결 (§3.3 행 17·20·21·23·19 영업권) | Phase B 진입 차단 |
| B → C | Pre-Do anchor 5건 PASS + 시기 결론 cross-check 통과 (PDF 입력값과 모순 시 anchor·디자인 환류) | Phase C 진입 차단 |
| C → D | 엔진 H-01~H-05 + flat adapter 구현 완료 + 52 anchor 100% PASS + 800줄 정책 점검 | UI 진입 차단 |
| G → H | 4 UI sub-component 합 ≤ 1500줄 + orchestrator ≤ 350줄 | 분할 추가 |
| H → I | 14지점 grep 자가 점검 (⑨⑫⑬⑭) + tsc 0건 | QA 진입 차단 |
| I → J | Anchor 52건 + matchRate ≥ 90 + 전체 회귀 0건 | 브라우저 확인 차단 |

---

## 5. Definition of Done — 자가 점검표

- [ ] §11 KoreanLaw 원문 인용 6건 첨부 + **시기 결론 1건** 확정
- [ ] 케이스 매트릭스 (§3.2) 6분기 모두 anchor 1건 이상 + Case 6 (거래정지) 본 PR 범위 외 명시
- [ ] Pre-Do anchor 5건 PASS (PDF 8,001·61,570·5,352·44,520·4,348 재현 + 시기 라벨 확정)
- [ ] PostListingValuationCard.tsx ≤ 350줄 (800줄 정책 + 분할 사전 적용)
- [ ] 신규 4 sub-component 각 ≤ 400줄
- [ ] **14지점 sync** — ⑨⑫⑬⑭ grep 자가 점검 (`unlistedDetailMode` enum 5곳 + 80필드 spread 2곳)
- [ ] **80 신규 필드** ② initial · ③ normalize 모두 매핑 (string[] 2종 빈 배열 default 포함)
- [ ] simple mode (Case 1) 기존 사례 48 anchor 회귀 0건
- [ ] 80% 하한 미적용 회귀 anchor 2건 PASS
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/stock-transfer/` 100% 통과
- [ ] `ui-engine-sync-checker` 결과 누락 0건
- [ ] **브라우저 수동 확인**: full mode 진입 → PDF 사례 입력 → 결과 5,824 / 29,120,000 / 산출세액 정합 + Network 탭 80필드 송신 확인
- [ ] **placeholder 정책** (C-01 5건) 한국어 교체 완료
- [ ] **엔진/UI 시기 표기 일관성** (C-02·C-03) 동시 정정
- [ ] **메모리 환류** Phase K 완료
- [ ] Flat → Nested 어댑터(`post-listing-flat-adapter.ts`) UI·API 양쪽 import 1회 이상 grep 확인
- [ ] `buildPostListingApiBody` 헬퍼 분리 + callStockTransferAPI 800줄 미만 유지
- [ ] 진입 게이트 우선순위(R2-05) 4-state 시뮬 통과 (acquiredBeforeListing × unlistedDetailMode 조합)
- [ ] validate 모드별 매트릭스 (simple 4 / listing_only 22 / full 78) 테스트 3건
- [ ] PDF 행 번호 동결 문서 첨부 (Phase A 산출물)
- [ ] **Round 4 종합 점검**: C-01(80필드·부채 10개) + C-02(Result echo) + C-03(adapter Pick 7) + H-01~07 + M-01~08 + L-01~03 모두 반영
- [ ] PL-FLOOR-1(0.85) + PL-FLOOR-2(0.50) 양방향 통과 (80% 하한 미적용 회귀 보호)
- [ ] `post-listing-validate.test.ts` 4건 통과 (3 모드 매트릭스 + tradingHalt × acquiredBeforeListing 조합 차단)
- [ ] 모드 전환 안내 1회 표시 + LocalStorage flag 검증
- [ ] PDF 출력 라우트 grep 확정 + 신규 섹션 정합

---

## 6. 리스크 및 의사결정 항목

| # | 항목 | 옵션 / 결정 | 결정 시점 |
|---|---|---|---|
| R-01 | 양도일 1개월 평균(8,659) 입력 화면 — PDF에 존재 | **본 PR 범위 외 확정** (사용자 인터뷰) — 후속 PR에서 §99①3 양도가액 화면 분리 | ✅ 확정 |
| R-02 | 80 신규 필드 sessionStorage 부담 | 평문 string + string[] 빈배열 default — 직렬화 OK. nested object 회피 (현행 flat 패턴 유지) | ✅ 확정 |
| R-03 | §81④ 월할 가산 자동 vs 수동 | 본 PR — `monthlyAccrualToggle` 수동. 자동 판정(취득일 평가 = 상장일 평가 동치)은 향후 후속 | ✅ 확정 |
| R-04 | 거래정지 (Case 6) | **본 PR 범위 외** — 후속 PR | ✅ 확정 |
| R-05 | 부동산과다 (Case 4) UI 노출 | 현행 `isHeavyRealEstateForValuation` 토글 재사용 (별도 신설 X). 가중치 반전(2:3) 자동 적용 | ✅ 확정 |
| **R-06** | **상장일 1개월 시기 — 직전 vs 직후** | **Phase A KoreanLaw §165⑤ 원문으로 확정** ★ | **Phase A 종료 시** |
| **R-07** | 환원율 10% 시간 변동 가능성 (기재부 고시) | 본 PR 입력 default 10% 고정 + UI 변경 허용. 시간별 테이블화는 후속 | ✅ 본 PR — 고정 default |
| **R-08** | 영업권(F-naGoodwillRow18) 음수·0 처리 | 입력 빈문자 → 0, optional. 음수 차단(validation ⑧) | ✅ 확정 |

---

## 7. 후속 PR 시그널

본 PR 완료 후 다음 항목 별도 추적.

- 거래정지·관리종목 (§165③) Case 6
- §165⑥ 액면분할·증자 환산주식수 자동 계산
- 양도일 1개월 종가평균 입력 화면 (§99①3 — 양도가액 측)
- §81④ 자동 판정 (취득일 평가 = 상장일 평가 동치성 자동 검출)
- 사례 48 PDF "11,863,800 과세표준" alternative anchor — 환산비율 정밀도 (0.72792 vs 0.7280 vs 0.7282) 검증
- 환원율 시간별 테이블화

---

## 8. 메모리·문서 갱신 계획 (Phase K)

작업 완료 후 다음 환류.

| 대상 | 변경 |
|---|---|
| [[MEMORY.md]] | 신규 entry `project_stock_transfer_post_listing_pdf_replica` 추가 — anchor 52건 + 80필드 + 시기 결론 요약 |
| `docs/00-pm/recent-completions.md` | 본 PR 완료 한 줄 요약 + 후속 신호 5개 |
| `docs/00-pm/korean-tax-calc.roadmap.md` | stock-transfer 항목 진행률 갱신 (현행 + PR-N 추가) |
| 신규 정책 도출 시 (Round 4 M-05) | `feedback_pdf_table_row_one_to_one_mapping.md` (PDF 표 행 1:1 매핑) + `feedback_flat_vs_nested_form_field_decision.md` (대용량 80+ 필드 flat 결정) + `feedback_multi_year_statement_input_ux.md` (다년도 결산서 UX 2열×24행) — 3 후보 사전 명시 |

---

## 9. 일정 (예상)

| Phase | 예상 소요 |
|---|---|
| A. KoreanLaw 검증 (시기 확정 포함) | 0.4h |
| B. Pre-Do anchor 5건 | 0.6h |
| C. 엔진 헬퍼 H-01~H-05 + anchor 52건 | 1.8h |
| D~G. UI 4 컴포넌트 | 3.2h |
| H. 14지점 sync + 결과 카드 + 사이드바 | 1.2h |
| I. QA + 회귀 | 0.7h |
| J~K. 브라우저 확인 + 환류 | 0.6h |
| **합계** | **~8.5h (1~2 세션)** |

---

## 10. 즉시 다음 액션

1. (시니어) **KoreanLaw MCP 도구 선택 (R2-12)**:
   - 본칙 4건: `mcp__claude_ai_KoreanLaw__get_law_text` — 소득세법 시행령 §165⑤·§165④1, 시행규칙 §81②·§81④, 상증법 시행규칙 §17 (Phase A에서 §82 → §81②+§17로 정정)
   - 참고 동치 2건: `mcp__claude_ai_KoreanLaw__get_law_text` — 상증법 §63①, 상증령 §54·§55
   - 시기 확정용 보조: `mcp__claude_ai_KoreanLaw__search_decisions` — "상장일 직전 1개월" 판례·해석례 검색 (현행 엔진 주석 vs PDF 모순 해소용)
2. (시니어) PDF 캡처 첨부 + §3.3 행 번호 동결 (행 17·20·21·23 순손익 / 행 18·19 순자산 영업권 위치)
3. (시니어) Pre-Do anchor 5건 (PL-CLOSE-1·PL-NI-1·PL-NA-1·PL-CONV-1·PL-FULL-1) 작성·실행 + 시기 결론 cross-check
4. 결과에 따라 본 계획서 §1.2·§3.3·§3.7·§3.9 (C-02·C-03) 정정
5. PDCA Do 진입 (Phase C)

---

## 11. 부록 — KoreanLaw 원문 인용 (Phase A 완료 2026-05-18)

### 11.1 핵심 결론 (R-06·C-04·§81④ 산식)

| # | 결론 | 근거 |
|---|---|---|
| 1 | **§165⑤ 시기 = 상장일 이후 1개월** | 상장일 이전은 비상장 기간으로 종가 미존재 → §165⑤이 §165③(1개월 종가평균)을 상장일 기점으로 준용. PDF 사례 48 입력 일자 2009-08-21~2009-09-21 일치 |
| 2 | **환원율 10% 근거 = §82 아님 → §81② + 상증령 §17** | 소법 시행규칙 §82는 "소형 신축주택 및 준공 후 미분양주택의 요건"(전혀 다른 조문). 환원율은 소법 §165④1 가목 → 시행규칙 §81② → 상증법 시행규칙 §17 → "연간 100분의 10" |
| 3 | **§81④ = §165⑨ 위임 (동일 사업연도 케이스)** | 산식: 양도당시 기준시가 = 취득일 속 사업연도의 **직전 사업연도** 기준시가 + (직전 − 전전) × (보유월수 / 직전 사업연도 월수). "1개월 미만은 1개월로 본다" |
| 4 | **§165④1 본칙 + 가중치 반전** | 순손익가치 × 3 + 순자산가치 × 2 ÷ 5. 부동산과다(§94①4 다목) 시 2:3 반전. 80% 하한 단서 |

### 11.2 §165⑤ 본문 (소법 시행령, 시행일 2026-04-23)

> ⑤ 주식등의 양도일 현재에는 제3항에 따른 주식등에 해당되나 그 취득 당시에는 제3항에 따른 주식등에 해당되지 않는 경우 취득 당시의 기준시가는 제4항에도 불구하고 다음 계산식에 따라 계산한 가액에 따른다. 이 경우 취득일 현재의 제4항에 따른 평가액과 코스닥시장 또는 코넥스시장 상장일 현재의 제4항에 따른 평가액이 같은 경우에는 **제9항을 준용하여 계산한 가액**을 코스닥시장 또는 코넥스시장 상장일 현재의 제4항에 따른 평가액으로 한다.

> ⑨ 법 제99조제1항제3호 및 제4호에 따라 산정한 양도 당시의 기준시가와 취득 당시의 기준시가가 같은 경우에는 법 제99조제1항제3호 및 제4호에도 불구하고 해당 자산의 보유기간과 기준시가의 상승률을 고려하여 **재정경제부령(시행규칙 §81④)**으로 정하는 방법에 따라 계산한 가액을 양도 당시의 기준시가로 한다.

### 11.3 §165④1 본칙 (가중평균 + 80% 하한)

> ④ 법 제99조제1항제4호 후단에 따른 평가기준시기 및 평가액은 다음 각 호에서 정하는 바에 따른다.
> 1. 1주당 가액의 평가는 가목의 계산식에 따라 평가한 가액(이하 이 항에서 "순손익가치"라 한다)과 나목의 계산식에 따라 평가한 가액(이하 이 항에서 "순자산가치"라 한다)을 각각 **3과 2의 비율(법 제94조제1항제4호다목에 해당하는 법인의 경우에는 순손익가치와 순자산가치의 비율을 각각 2와 3으로 한다)로 가중평균한 가액**으로 한다. 다만, **그 가중평균한 가액이 1주당 순자산가치에 100분의 80을 곱한 금액보다 적은 경우에는 1주당 순자산가치에 100분의 80을 곱한 금액을 평가액**으로 한다.
>   - 가. 양도일 또는 취득일이 속하는 사업연도의 직전 사업연도의 1주당 순손익액 ÷ 「금융실명거래 및 비밀보장에 관한 법률」 제2조제1호에 따른 금융회사등이 보증한 3년만기회사채의 유통수익률을 고려하여 **재정경제부령(시행규칙 §81②)**으로 정하는 이자율
>   - 나. 양도일 또는 취득일이 속하는 사업연도의 직전 사업연도 종료일 현재 해당 법인의 장부가액 ÷ 발행주식총수

### 11.4 시행규칙 §81② (환원율 위임)

> ② 영 제165조제4항제1호가목에서 "재정경제부령이 정하는 이자율"이란 「상속세 및 증여세법 시행규칙」 **제17조에 따른 이자율**을 말한다.

### 11.5 상증법 시행규칙 §17 (환원율 10%)

> 영 제54조제1항의 계산식에서 "재정경제부령으로 정하는 이자율"이란 **연간 100분의 10**을 말한다.

### 11.6 시행규칙 §81④ (월할 가산 산식 — §165⑨ 위임)

> ④ 영 제165조제9항에서 "재정경제부령으로 정하는 방법에 따라 계산한 가액"이란 다음 각 호의 구분에 따라 계산한 가액을 말한다. 이 경우 **1개월 미만의 월수는 1개월로 본다**.
> 1. 해당 법인의 **동일한 사업연도 내에 취득하여 양도하는 경우**에는 다음 계산식에 따라 계산한 가액
>
>   **양도당시 기준시가 = 직전사업연도 기준시가 + (직전 − 전전사업연도 기준시가) × (양도자산 보유월수 / 직전사업연도 월수)**
>
> 2. 제1호 외의 경우에는 해당 양도자산의 기준시가

### 11.7 (참고) 상증령 §54① (산식 동치)

> 법 제63조제1항제1호나목에 따른 주식등은 1주당 다음의 계산식에 따라 평가한 가액(이하 "순손익가치"라 한다)과 1주당 순자산가치를 각각 3과 2의 비율[부동산과다보유법인(「소득세법」 제94조제1항제4호다목에 해당하는 법인을 말한다)의 경우에는 1주당 순손익가치와 순자산가치의 비율을 각각 2와 3으로 한다]로 가중평균한 가액으로 한다. 다만, 그 가중평균한 가액이 1주당 순자산가치에 100분의 80을 곱한 금액 보다 낮은 경우에는 1주당 순자산가치에 100분의 80을 곱한 금액을 비상장주식등의 가액으로 한다.

→ 소령 §165④1과 **완전 동치** (가중치 + 80% 하한 동일).
