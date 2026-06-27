# 채권가액 평가 (대여금·외상매출금·받을어음 등) — 구현 계획서

> 상속·증여 재산 중 **금전채권**(대부금·대여금·외상매출금·받을어음·정리채권 등)의
> 보충적 평가. 상증령 §58② / 상증칙 §18의2② / 상증령 §58의2②1호가목(적정할인율).
> 작성 기준 코드: worktree `receivable-valuation` (origin/master `feda7d0f`).

## 1. 범위 — 이미지(교재) 3장의 케이스 전부

사용자 제공 교재의 **모든 케이스**를 구현 대상으로 한다.

| 케이스 | 조건 | 평가산식 | 비고 |
|---|---|---|---|
| **A. 기타의 채권** | 회수기간 **5년 이내** | `원본가액 + 평가기준일까지 미수이자상당액` | 상증칙 §18의2②2. 실무 대다수 |
| **B. 장기·변경 채권** | 회수기간 **5년 초과** **또는** 회사정리·화의 등으로 채권내용 변경 | `Σ [각 연도 회수금액(원본+이자상당액)] / (1+적정할인율)ⁿ` | 상증칙 §18의2②1가목. **현가할인** |
| **C. 회수불가능 채권** | 평가기준일 현재 전부·일부 회수불가능 인정 | 회수불가능분 **산입 제외**(가액 0) / 일부면 잔액만 | 상증령 §58② **단서** |

> **A vs B 분기 기준**: 「원본의 회수기간」이 5년 초과인가. 5년 이내 = A, 초과 = B.
> 회사정리·화의 개시 등 채권내용 변경 시에는 회수기간과 무관하게 B(현가할인).

### 1.1 적정할인율 시점별 고시 테이블 (상증칙 §18의2 / §18의3)

케이스 B의 할인율은 **평가기준일** 기준 시점별로 다르다. 시대표 상수로 관리(아래 §4.2).

| 적용기간 | 적정할인율 | 고시근거 |
|---|---|---|
| 2016.3.21. 이후 | **8.0%** | 상증칙 §18의3 (2016.3.21. 신설) |
| 2011.7.26. ~ 2016.3.20. | 8.0% | 기재부고시 제2010-20호 |
| 2002.11.8. ~ 2011.7.25. | **6.5%** | 국세청고시 제2009-29·2004-02·2002-39·2002-28호 |
| 2002.7.10. ~ 2002.11.7. | 7.0% | 국세청고시 제2002-23호 |
| 2001.1.1. ~ 2002.7.9. | 7.5% | 국세청고시 제2001-14호 |

> **개정연혁 (상증칙 §18의2②) — 회수기간 임계의 시점별 변동**:
> - 2000.12.31. 이전: 원본 + 미수이자 (현가할인 없음)
> - 2001.1.1. ~ 2003.12.31.: 회수기간 **3년** 초과 시 현가할인
> - 2004.1.1. 이후: 회수기간 **5년** 초과 시 현가할인
>
> MVP는 **현행(2004.1.1.~ 5년 초과, 2016.3.21.~ 8.0%)** 을 1차 구현하되,
> 시대표·임계를 평가기준일 lookup으로 설계해 과거시점 확장 여지를 남긴다.
> (메모리 `feedback_historical_statute_value_via_tribunal` — 역사값 단정 금지)

## 2. 검증된 Anchor — 정리채권 현가할인 (케이스 B)

교재 사례(이미지 1)를 **즉석 실측으로 재현 완료**. 정밀도 리스크 해소됨.

- 회사정리계획 인가일 2020.12.20 / 정리채권 원금 50억 / 10년 거치 5년 분할
- 상환: 2031.12.20.부터 5년간 매년 원금 10억 + 잔액 연 10% 이자
- **평가기준일 2022.12.20., 적정할인율 8%**

| 회수일 | 회수금액(원본+이자) | n(평가기준일~회수일) | 현가 = 금액×25ⁿ/27ⁿ (round) |
|---|---|---|---|
| 2031.12.20 | 15억 (10+이자5) | 9 | 750,373,451 |
| 2032.12.20 | 14억 (10+4) | 10 | 648,470,883 |
| 2033.12.20 | 13억 (10+3) | 11 | 557,547,717 |
| 2034.12.20 | 12억 (10+2) | 12 | 476,536,510 |
| 2035.12.20 | 11억 (10+1) | 13 | 404,467,717 |
| **합계** | | | **2,837,396,278** ✓ 교재 일치 |

### 2.1 정밀도 결정 (실측 완료)

- 할인 `(1+0.08)ⁿ` = **정수분수 `27ⁿ/25ⁿ`** → 현가 = `금액 × 25ⁿ / 27ⁿ` (BigInt). 부동소수 금지.
- **연도별 항에 round-half-up 적용** → 합계 2,837,396,278 교재 **정확 일치**.
  - floor 적용 시 9년항이 750,373,450 (−1원) → 합계 2,837,396,277 (1원 부족).
  - §58 평가는 "세율×금액 직후 floor"가 아닌 **재산평가 현가환산**이므로 round-half-up 채택 정당.
  - 헬퍼: `safeMulDivRound` 스타일을 BigInt `25ⁿ/27ⁿ`에 적용 (`lib/tax-engine/tax-utils.ts:131`).
- n = **평가기준일로부터 회수일이 속하는 연수**(상증칙 §18의2②1가목). 정수.
  - 이미지 정리채권은 정확히 정수년(매년 12.20). **비정수 잔여월 처리 규칙은 Pre-Do anchor에서 확정**(§7).

## 3. 데이터 모델 — `AssetCategory` 신규 종류 + EstateItem 필드

지상권 §61③(`superficies`)이 **직전 추가 템플릿**. 동일 8단계 패턴 차용.

### 3.1 `AssetCategory` 추가
`lib/tax-engine/types/inheritance-gift-estate.types.ts:36` (enum), `:45` 인근(superficies 다음)
```ts
| "receivable"   // 금전채권 (대여금·외상매출금·받을어음·정리채권 §58②)
```
> **financial 분리 정당 — 실측 확정**(STEP1 #4): `evaluateFinancial`(`property-valuation.ts`)은
> `item.marketValue` **단순 잔액·시가 평가**만 수행(method=`market_value`), §58② 미수이자합산·현가할인
> 로직 없음. 라벨은 "예금·펀드·채권·공제금"이나 채권은 잔액평가에 그침. 따라서 §58② 전용 `receivable`
> 신설이 맞다(입력필드·산식 완전 이질). financial은 그대로 둔다.

### 3.2 EstateItem 필드 (지상권 필드와 동일 위치 §206~ 인접 추가)
```ts
// ── 채권 평가 (§58②) ───────────────────────────────
/** 채권 종류 (UI 안내·별지 표기용) */
receivableKind?: ReceivableKind;          // "loan"|"trade"|"note"|"reorg"|"other"
/** 원본(원금) 가액 */
receivablePrincipal?: number;
/** 평가기준일까지 발생한 미수이자상당액 (케이스 A·B 공통, 미수령분) */
receivableAccruedInterest?: number;
/** 평가방식 — 회수기간 5년 이내(simple) / 초과·변경(discounted) */
receivableMode?: "simple" | "discounted";
/** [discounted] 연도별 회수 스케줄 (원본+이자상당액, 회수일) */
receivableSchedule?: ReceivableInstallment[]; // { recoverDate, amount }
/** [discounted] 적정할인율 override (미입력 시 평가기준일 lookup) */
receivableDiscountRateOverride?: RateFraction;
/** 회수불가능 차감액 (케이스 C — 0이면 전액 산입) */
receivableUncollectible?: number;
/** 회수불가능 사유 메모 (별지·근거) */
receivableUncollectibleReason?: string;
```
> `ReceivableInstallment`, `ReceivableKind`는 동 타입파일에 신규 정의.
> `RateFraction`은 **공유 타입이 아니라 `lib/tax-engine/data/gift-deemed-rates.ts:9`에 정의**(STEP1 #8) —
> `receivableDiscountRateOverride?: RateFraction`는 거기서 import.
> 스케줄의 `amount`는 **원본+이자상당액 합산값을 사용자가 직접 입력**(이자율 자동산정은
> 정리채권·약정별로 달라 자동 fallback 금지 — 메모리 `feedback_no_silent_apportion_fallback`).
>
> ⚠️ **중첩배열 Date 함정**(STEP1 #5, 정책 `feedback_api_zod_schema_sync`): `receivableSchedule[].recoverDate`는
> 배열 안 Date → Route의 `coerceDates(obj, [...])`가 **최상위 키만 처리**하면 JSON 경유 후 string 도달
> (`Date < string` silent false). Route ⑭에서 `estateItems[].receivableSchedule[].recoverDate`를 **명시 변환**
> (`item.receivableSchedule?.map(s => ({...s, recoverDate: toDate(s.recoverDate, "recoverDate")}))`).

## 4. 엔진 설계

### 4.1 평가 함수 — `evaluateReceivable(item)`
`lib/tax-engine/property-valuation.ts` 신규 + `evaluateEstateItem` switch(`:541`)에 `case "receivable"` 추가.

```
1) 회수불가능 차감: usable = max(0, principal − uncollectible)   // 케이스 C 단서
2-A) simple (5년 이내):
     valuated = max(0, usable + accruedInterest − uncollectible_on_interest?)
     → 원본가액 + 평가기준일까지 미수이자상당액
2-B) discounted (5년 초과·변경):
     rate = override ?? resolveReceivableDiscountRate(valuationDate)
     (1+rate) = (denom+numer)/denom  (8% → 27/25)
     valuated = Σ_k roundHalfUp( installment_k.amount × denomⁿ / (denom+numer)ⁿ )
        where n_k = 회수일 연수(평가기준일 기준)
3) breakdown: 케이스별 산식 문자열(한국어 풀어쓰기, 변수약어·floor 금지)
```

**케이스 C × discounted 안분 — 2안 (STEP1 #6, Pre-Do anchor로 확정 §7-2)**:
- **(가) 스케줄 사전제외**: 사용자가 회수불가능분을 뺀 회수금액만 스케줄에 입력 → 엔진은 입력 스케줄만 할인. 단순·투명하나 사용자 수계산 필요.
- **(나) 비율 안분**: `receivableUncollectible`를 원본 대비 비율로 각 회수금액에서 차감 후 할인. 자동이나 안분근거 모호(자동 안분 fallback 금지 정책과 충돌 소지).
- **권장 (가)**: 회수불가능은 simple·discounted 공통으로 **스케줄/원본 입력 전 단계에서 사용자가 반영**, 엔진 `receivableUncollectible`는 simple 케이스의 명시적 차감(원본−차감)에만 사용. discounted은 스케줄에 이미 반영된 것으로 간주(UI 안내 카드 명시).
```
```

### 4.2 시점별 적정할인율 테이블 — `resolveReceivableDiscountRate`
`gift-deemed-rates.ts:27` `resolveFreeLoanRate` **패턴 그대로**.
```ts
export const RECEIVABLE_DISCOUNT_RATE_HISTORY: ReadonlyArray<{from:string; rate:RateFraction}> = [
  { from: "2001-01-01", rate: { numer: 75, denom: 1000 } }, // 7.5%
  { from: "2002-07-10", rate: { numer: 70, denom: 1000 } }, // 7.0%
  { from: "2002-11-08", rate: { numer: 65, denom: 1000 } }, // 6.5%
  { from: "2011-07-26", rate: { numer: 80, denom: 1000 } }, // 8.0%
];
export function resolveReceivableDiscountRate(valuationDate: string): RateFraction { /* ≥ from 누적 */ }
```
> **확인 필요**: 위 from 경계·율은 이미지 표 기준. KoreanLaw MCP로 상증칙 §18의2②1호가목·§18의3
> 본문 및 고시 일자 재검증 후 동결(스킬 `korean-law-citation-verify`).

### 4.3 회수기간 5년 임계 도출 — 단일 헬퍼(dual-truth 회피, STEP1 #7)
스케줄 최종 회수일 − 평가기준일 > 5년이면 discounted 권장 안내(UI). 단 회사정리·화의 변경 채권은
회수기간 무관 discounted (사용자 토글). 자동 강제보다 **모드 토글 + 안내 카드** 권장(법령정확성·사용자판단).

> ⚠️ 회수기간 계산을 UI와 엔진이 **각자 구현하면 dual-truth**. 순수 헬퍼
> `resolveReceivableRecoveryYears(schedule, valuationDate): number`를 `lib/tax-engine`(또는 property-valuation)에
> **단일 정의·export**하고 UI 안내·엔진 임계판정 모두 import(메모리 `feedback_ui_engine_dual_truth_avoidance`,
> 스킬 `single-source-engine-helper`). 지상권 `resolveSuperficiesTenureYears` 패턴 그대로.

### 4.4 조문 상수
`lib/tax-engine/legal-codes/inheritance-gift.ts`에 `VALUATION.RECEIVABLE`(상증령 §58②),
`VALUATION.RECEIVABLE_DISCOUNT`(상증칙 §18의2②1가) 추가. 리터럴 금지.

## 5. 동기화 지점 (지상권 추가 시 변경된 25파일 기준 체크리스트)

**엔진·타입 (4)**
- [ ] `types/inheritance-gift-estate.types.ts` — AssetCategory + EstateItem 필드 + ReceivableKind/Installment enum
- [ ] `property-valuation.ts` — `evaluateReceivable` + dispatch case
- [ ] `data/gift-deemed-rates.ts` (또는 신규 `data/receivable-rates.ts`) — 시대표 + resolve
- [ ] `legal-codes/inheritance-gift.ts` — VALUATION.RECEIVABLE*

**검증 (1)**
- [ ] `lib/validators/estate-item-schema.ts` — `receivableItemSchema` extend + discriminatedUnion 등록
      (mode=discounted → schedule 1건↑ 필수, simple → principal 필수 superRefine)

**UI (5)**
- [ ] `components/calc/inheritance/estate-card/variants/EstateBodyReceivable.tsx` — 신규 입력 폼
- [ ] `.../variants/index.ts` — re-export
- [ ] `components/calc/EstateItemEditor.tsx:46` — VariantBody switch case `"receivable"`
- [ ] `.../estate-card/estate-category-meta.ts` — `CATEGORY_LABELS`(:21)·`CATEGORY_ICONS`(:32)["receivable"]
- [ ] `.../estate-card/CategoryChangeDialog.tsx` — 카테고리 옵션

> ⚠️ **카테고리 목록 3원 정의 — dual-truth (STEP1 #1·#2, 인용오류 정정)**: 노출 카테고리 배열이 **3곳**에 중복 정의.
> receivable 노출하려면 **전부** 추가:
> - `components/calc/inheritance/estate-card/estate-category-meta.ts:39` `GIFT_CATEGORIES` (증여 — 탐색 인용 "gift-api.ts"는 **오류**)
> - `lib/calc/deemed-category-policy.ts:28` `INHERITANCE_CATEGORIES` (상속)
> - `components/calc/inheritance/estate-card/CategoryChangeDialog.tsx:45·56` **자체** INHERITANCE/GIFT_CATEGORIES (중복 — 다이얼로그 전용)
> (정리 권장사항: Low 개선으로 단일출처화 별건 — 본 작업 범위 밖, 언급만)

**클라이언트 헬퍼 (6)**
- [ ] `lib/calc/estate-item-valuation.ts` — computeEffectiveValuation 분기(부분입력 try/catch 0가드) + (discounted면 valuationDate 주입 필요 — 지상권 injectSuperficies 패턴)
- [ ] `lib/calc/inheritance-validate.ts` — validate 로직
- [ ] `lib/calc/asset-toggle-visibility.ts:76` 인근 — `receivable:` 전용 필드 가시성 블록 신규
- [ ] `lib/calc/deemed-category-policy.ts:28` — `INHERITANCE_CATEGORIES`에 추가. `SupportedCategory`(:20 `Exclude<…>`)는
      AssetCategory 추가 시 자동 포함되나 노출 배열은 수동. `DEEMED_ALLOWED_CATEGORIES`(:42 insurance/retirement/trust)에는
      **미포함**(채권은 직접 상속재산, 간주상속 대상 아님 — 확정 §9)
- [ ] `lib/calc/inheritance-asset-category.ts` — 분류

**API/Route (메모리 `feedback_api_zod_schema_sync` ⑫⑬⑭)**
- [ ] ⑬ `inheritance-api.ts`/`gift-api.ts` body spread — estateItems 전체 전달(추가변환 불요, 단 신규필드 grep 확인)
- [ ] ⑫ `app/api/calc/{inheritance,gift}/route.ts` Zod 입력객체 — receivable 신규필드 정의 누락 시 **침묵 strip**(TS 미감지). grep 자가점검
- [ ] ⑪⑭ 동 Route — estateItems Date 강제: **중첩** `receivableSchedule[].recoverDate` 명시 map 변환(§3.2 ⚠️)

**결과·데이터 (3)**
- [ ] `components/calc/results/InheritanceTaxResultView.tsx` — breakdown 자동 렌더(확인)
- [ ] `lib/calc/besshi-buppyo-2-data.ts:51` — `CATEGORY_LABEL_KO["receivable"]="채권"` + 별지2호 행
- [ ] **`components/calc/results/inheritance-filing-form-helpers.ts`** (STEP1 #3, 누락 발견) —
      `toEstateItemTypeCode`(별지2호 재산 type 코드)·`toEstateItemValuationMethodCode`·`inferEstateItemKindCode`에
      receivable 매핑 추가. **type 코드는 별지2호 뒷면 코드표 검증 후 동결**(§9, 현재 placeholder 금지)

**테스트 (3)**
- [ ] `__tests__/tax-engine/property-valuation/receivable-58-2.test.ts` — anchor: 정리채권 2,837,396,278 + 케이스 A/C
- [ ] `__tests__/lib/calc/deemed-category-policy.test.ts` — 분류
- [ ] `e2e/receivable-valuation.spec.ts` — 입력→계산→결과(메모리 `feedback_browser_verify_with_playwright`)

## 6. UI 명세 (EstateBodyReceivable)

- 자산 명칭(선택)
- **채권 종류** RadioCardGroup: 대여금/대부금 · 외상매출금 · 받을어음 · 정리채권 · 기타
- **평가방식 토글** (ToggleCard, OFF도 tone 유지):
  - `simple` 회수기간 5년 이내 → 원본 + 미수이자
  - `discounted` 5년 초과·회사정리/화의 변경 → 연도별 현가할인
- simple: 원본가액 · 미수이자상당액(CurrencyInput)
- discounted: **연도별 회수 스케줄 테이블**(회수일 DateInput + 회수금액[원본+이자] CurrencyInput, 행 추가/삭제)
  - 적정할인율: 평가기준일 자동표시 + override 입력(amber 안내)
  - 스케줄 마지막 회수일 − 평가기준일 ≤ 5년인데 discounted면 amber 경고(역도 동일) — `resolveReceivableRecoveryYears` 단일 헬퍼 사용(§4.3)
  - **회수불가능분은 스케줄 회수금액에서 사용자가 미리 차감해 입력**(케이스 C×discounted = (가)안, §4.1) — rose 안내 카드
- **회수불가능 차감**(simple 전용, 선택, R1): 차감액 + 사유 메모(rose 안내 카드). discounted은 위 스케줄 사전반영으로 대체
- 결과 미리보기: `computeEffectiveValuation` 사이드바 합계 반영(0원 미표시)

> 토글/라디오 native 금지, `ToggleCard`/`RadioCardGroup` 필수. 금액칸 `amount-column-align`.
> 미입력=검증오류 차단(자동 안분 fallback 금지).

## 7. Pre-Do Anchor (Do 진입 전 우선 작성·실행 — 메모리 `feedback_pre_anchor_verification`)

1. **정리채권 현가 2,837,396,278** (검증완료 산식 동결 — round-half-up 25ⁿ/27ⁿ). 엔진 실패→일치까지.
2. **비정수 잔여월 n 처리** — 회수일이 평가기준일 +9년 6개월이면 n=9? 9.5? 절상? **상증칙 본문·예규로 확정**.
   교재 사례는 정수년이라 미검증 → anchor 추가 작성 전 KoreanLaw MCP 확인.
3. **케이스 A** — 원본 1억 + 미수이자 300만 = 1억300만 (단순합산) anchor.
4. **케이스 C** — 원본 5천만 중 회수불가능 2천만 → 3천만 anchor. simple/discounted 각각.
5. **시대표 경계** — 평가기준일 2010.1.1(6.5%) vs 2016.4.1(8.0%) 율 분기 anchor.

## 8. 구현 순서 & 검증기준 (Goal-Driven)

```
0. Pre-Do anchor 5건 작성 → 전부 RED 확인          verify: vitest RED 메시지 확보
1. 타입·조문상수·시대표·회수기간헬퍼(§3·4.2·4.3·4.4) verify: tsc 0건, resolveReceivableRecoveryYears 단위테스트
2. evaluateReceivable 엔진(§4.1)                  verify: anchor #1·#3·#4·#5 GREEN
3. Zod 스키마(§5 검증)                            verify: 잘못된입력 차단 테스트
4. UI EstateBodyReceivable + variant 등록(§6)     verify: 폼 렌더, 토글 동작
5. 클라이언트 헬퍼 6 + API 14지점 grep(§5)        verify: ⑫⑬⑭ 신규필드 grep, request body 확인
6. 결과뷰·별지2호 행                               verify: 결과카드 산식 한국어
7. E2E 통합 spec                                  verify: 입력→계산→2,837,396,278 결과
8. 회귀: npm test + 상속/증여 기능 spec            verify: baseline 대조 0 신규실패
```

## 9. 확인 필요 — KoreanLaw 검증 완료 (2026-06-27)

### 9.0 ✅ 검증·동결 (시행규칙/시행령 본문 실측)
- ✅ **§58② 본문 + 회수불가능 단서** — 시행령 §58② 일치 (산입 제외)
- ✅ **장기·변경채권 현가할인** — 시행규칙 §18의2②**1호** 일치 (5년 초과·회사정리·화의)
- ✅ **기타채권 미수이자 합산** — 시행규칙 §18의2②**2호** 일치
- ✅ **현행 적정할인율 8%** — 시행규칙 §18의3 "연간 100분의 8" 일치
- ✅ **인용 정정** — `§18의2②1가` → `§18의2②1호`("가목"은 영 §58의2②1호의 것). 코드 반영
- ✅ **회사정리/화의 근거** — §18의2②1호 "회사정리절차 또는 화의절차의 개시 등의 사유로 당초 채권의 내용이 변경" 명문 확인

### 9.1 ⚠️ 동결 불가 — 본문 부재 (문서화된 한계)
- **시대표 과거 율(7.5/7.0/6.5%)** — §18의3 신설 전 국세청·기재부 고시 출처, **법제처 조문 미수록**(2010-01-01 §18의3 NOT_FOUND 확인). 교재 고시번호 잠정, 고시 원문 확인 후 동결. (현행 8%는 동결됨)
- **비정수 n(잔여월)** — §18의2②1호에 연수 산정 방식 명문 없음. `differenceInYears`(floor) 잠정. 교재 anchor는 정수년만.

### 9.2 미구현 edge case (scope-out, KoreanLaw로 신규 발견)
- **시설물이용권 입회금·보증금 회수기간 미정 → 5년 간주** (§18의2②1호 후단, 소득세법 §94①4호나목). 현재 정리채권·일반 장기채권만 — 후속.
- **별지2호 receivable type 코드** — 잠정 "11"(금융재산). 별지9호 부표2 뒷면 코드표 확인 후 동결.

### 9.3 STEP1 검토로 해소
- ✅ receivable vs financial 분리(`evaluateFinancial`=marketValue 단순평가) · ✅ 증여 공용(`GIFT_CATEGORIES`=estate-category-meta.ts:39) · ✅ 간주상속 미포함

---
**다음 단계**: 본 계획서 자가검토(스킬 `plan-self-review` 또는 `plan-design-self-review-loop`) →
엔진·UI 설계문서 분리 생성 → Pre-Do anchor 착수.
