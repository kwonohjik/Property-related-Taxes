# 소칙 §81④ 월할 가산 (취득 후 상장 환산 — PR-2) 구현 계획서

> 작성: 2026-06-12 · 선행: PR-1(플래그·경고만, `stock-valuation-post-listing.ts`) · 추적 출처: 주식양도세 리뷰 R1 Medium#6 (memory `project_stock_transfer_review_r1`)
>
> **검증 상태**: §2 법령 인용은 전부 KoreanLaw MCP 축자 확인(2026-06-12, 소득세법 시행령 MST 286211 · 시행규칙 MST 286379, 현행 시행 2026-05-22). §5 코드 인용은 전부 Read/grep 실측.

---

## 1. 목적·배경

취득 후 상장 환산취득가 모듈(`lib/tax-engine/stock-transfer/stock-valuation-post-listing.ts`)은 시행령 §165⑤ 본문 환산식을 구현했으나, **후단(취득일 평가액 = 상장일 평가액인 경우의 월할 보정)은 PR-1에서 감지·경고만 하고 산식이 미구현**이다.

미구현 영향: 트리거 케이스에서 환산비율이 1로 처리되어 취득기준시가 = 상장일 종가평균 그대로 → 시점 차이 미반영 → **환산취득가 과대 → 양도차익 과소** 가능(상승장 기준). 현재는 warning으로 사용자에게 고지 중.

PR-2 범위: 보정 산식 본 구현 + 신규 입력 3필드 14지점 동기화 + UI 노출 + anchor.

## 2. 법령 근거 (KoreanLaw 축자 — 2026-06-12 확인)

### 2.1 시행령 §165⑤ 후단 (트리거 + 효과)

> "이 경우 **취득일 현재의 제4항에 따른 평가액**과 **코스닥시장 또는 코넥스시장 상장일 현재의 제4항에 따른 평가액**이 **같은 경우**에는 **제9항을 준용하여 계산한 가액**을 코스닥시장 또는 코넥스시장 **상장일 현재의 제4항에 따른 평가액으로 한다**."

- 트리거: 취득일 §4항 평가액 == 상장일 §4항 평가액
- 효과: §9항 준용 가액으로 **환산식의 분모(상장일 평가액)를 교체** — 분자(취득일 평가액)는 불변

### 2.2 시행령 §165⑨ (위임)

> "법 제99조제1항제3호 및 제4호에 따라 산정한 양도 당시의 기준시가와 취득 당시의 기준시가가 같은 경우에는 … 해당 자산의 보유기간과 기준시가의 상승률을 고려하여 재정경제부령으로 정하는 방법에 따라 계산한 가액을 양도 당시의 기준시가로 한다."

### 2.3 소칙 §81④ (산식 본문)

> "영 제165조제9항에서 '재정경제부령으로 정하는 방법에 따라 계산한 가액'이란 다음 각 호의 구분에 따라 계산한 가액을 말한다. 이 경우 **1개월 미만의 월수는 1개월로 본다**.
> 1. 해당 법인의 **동일한 사업연도 내에 취득하여 양도하는 경우**에는 다음 계산식에 따라 계산한 가액
>    양도당시의 기준시가 = 취득일이 속하는 사업연도의 직전사업연도 기준시가 + (취득일이 속하는 사업연도의 직전사업연도 기준시가 − 취득일이 속하는 사업연도의 **전전사업연도 기준시가**) × (양도자산 **보유월수** ÷ 취득일이 속하는 사업연도의 **직전사업연도의 월수**)
> 2. **제1호 외의 경우**에는 해당 양도자산의 기준시가" *(= 보정 없음)*

### 2.4 준용 치환 매핑 (§165⑤ 후단 → §81④)

§165⑤ 후단은 §9항을 **준용**하므로, §81④의 "양도"는 본 모듈 맥락에서 "상장"으로 읽는다:

| §81④ 원문 용어 | 준용 치환 (본 모듈) | 코드 대응 |
|---|---|---|
| 양도당시의 기준시가 | **상장일 현재의 §4항 평가액(보정값)** = 환산식 분모 | `adjustedListingYearPerShareValue` (신규 echo) |
| 취득일이 속하는 사업연도의 직전사업연도 기준시가 | 취득일 직전 사업연도 §4항 평가액 | `acquisitionYearPerShareValue` (기존, 트리거상 `listingYearPerShareValue`와 동일값) |
| 전전사업연도 기준시가 | 취득일 전전 사업연도 §4항 평가액 | **신규 입력** (NI·NA 2필드 → 기존 `calcUnlistedPerShareWeighted` 재사용) |
| 양도자산 보유월수 | **취득일 → 상장일** 월수 (1개월 미만 절상) | `acquisitionDate`·`listingDate` 기존 입력에서 산출 |
| 직전사업연도의 월수 | 동일 (보통 12) | **신규 입력** optional, default 12 |
| 1호 "동일한 사업연도 내에 취득하여 양도" | 동일 사업연도 내 취득 + **상장** | 기존 `monthlyAccrualToggle` 재활용 (§6.3) |

### 2.5 PR-1 docstring 오류 정정 (본 PR에서 함께)

- `stock-valuation-post-listing.ts:24-27` docstring이 §81④을 "취득일 평가 = 상장일 평가인 동일 사업연도 케이스"로 요약 — **§165⑤ 후단(평가액 동일)과 §81④ 1호(동일 사업연도)는 별개 2단 조건**임을 명확화. 2호(보정 없음) 분기 누락도 보완.
- `:17` "부동산과다보유 가중치 반전은 PR-2에서" — **이미 구현됨**(`calcUnlistedPerShareWeighted` `isHeavyRE` 반전, `:130-139` 실측). stale 주석 삭제.

## 3. 케이스 매트릭스 (전수)

| # | 평가액 동일(§165⑤ 후단) | 동일 사업연도(§81④ 1호, 토글) | 전전연도 입력 | 동작 |
|---|---|---|---|---|
| C-1 | ✕ (다름) | — | — | 본칙 환산 (현행 유지 — 사례 48 anchor 불변) |
| C-2 | ✓ | OFF (= 2호: 동일 사업연도 아님) | — | **보정 없음**(2호) + 안내 메시지 "§81④ 2호 적용 — 상장일 평가액 그대로" (기존 PL-MONTHLY-1~3 동작 보존, 문구 교체) |
| C-3 | ✓ | ON (= 1호) | 입력됨 | **월할 보정 발동**: 분모 = 보정 평가액, 환산비율 < 1 (상승 시) |
| C-4 | (무관) | ON | 미입력 | **validate 차단** (⑧ — 토글 ON 자체가 1호 신고이므로 전전연도 필수. 평가액 동일 여부는 엔진 단독 판단 — full 모드 합성 산출의 validate 재현은 dual-truth라 금지). 엔진 방어: warning + 보정 미적용 |
| C-5 | ✓ | ON | 입력됨, 전전 > 직전 (하락) | 법문 그대로: 보정 평가액 < 직전 → 환산비율 > 1 (음수 차이 허용) |
| C-6 | ✓ | ON | 보정 평가액 ≤ 0 | 기존 "환산 불가" 가드 재사용 (warning + 0 반환) |
| C-7 | ✕ (다름) | ON | — | 토글 무의미 — 엔진 무시 + warning "평가액이 달라 §81④ 미적용". validate warning은 **simple 모드만**(4필드 직접 비교 — full/listing_only는 합성 산출이라 엔진 warning에 위임) |

## 4. 산식 설계 (정수 연산)

```
보유월수 m = max(1, differenceInMonths(listingDate, acquisitionDate)
                 + (끝수 일자가 있으면 1))          ← "1개월 미만의 월수는 1개월" 절상
직전사업연도 월수 d = priorBizYearMonths ?? 12

보정 상장일 평가액 (분수 정수 연산 — 1회 floor):
  adjusted = floor( (prior × d + (prior − prePrior) × m) / d )
           ≡ floor( prior + (prior − prePrior) × m / d )

환산비율 분모 교체:
  finalPerShareValue = floor( listingDatePriceAvg1Month × prior / adjusted )   ← 분수 정수 연산
  totalAcquisitionPrice = finalPerShareValue × shareCount
```

- `prior` = `acquisitionYearPerShareValue` (트리거상 분자·분모 원값 동일)
- `prePrior` = `calcUnlistedPerShareWeighted(prePriorYearNetIncomePerShare, prePriorYearNetAssetPerShare, isHeavyRE)` — 기존 H-04 재사용 (80% 하한 미적용 — 환산비율 산정용 §165④1 단서 비적용 기존 원칙 동일)
- 음수 차이(C-5): 전체 분수에 단일 floor — `Math.floor`의 음수 방향 내림이 식 전체에 1회만 적용되어 방향 일관 (memory `feedback_applyrate_fractional_rate_one_won_error` — 부동소수 곱 금지)
- **기존 비보정 경로(C-1·C-2)는 ratio 부동소수 곱 유지** — 사례 48 anchor(5,824) 불변. 보정 경로(신규)만 분수 정수 채택
- 월수 끝수 판정: `addMonths(acquisitionDate, fullMonths) < listingDate` → +1. `differenceInMonths`는 `stock-transfer-helpers.ts:7`에서 이미 사용 중인 date-fns

## 5. 현행 코드 실측 (2026-06-12)

| 항목 | 위치 | 상태 |
|---|---|---|
| 트리거 감지 | `stock-valuation-post-listing.ts:257` `acquisitionYearPerShareValue === listingYearPerShareValue` | §165⑤ 후단 트리거와 일치 ✓ (유지) |
| 보정 산식 | 없음 — `:258-264` warning만 | **본 PR 구현 대상** |
| `monthlyAccrualToggle` | 폼 `calc-wizard-stock-store.ts:214`·initial `:531`·normalize `calc-wizard-stock-normalize.ts:179`·Zod `stock-transfer-tax-schema.ts:97`(nested postListingDetail)·flat-adapter `post-listing-flat-adapter.ts:212`(simple 모드 포함 전달 ✓)·UI ToggleCard `PostListingValuationCard.tsx:273-280` | **존재하나 엔진이 읽지 않는 dead input** — 본 PR에서 §81④ 1호/2호 분기 입력으로 활성화 |
| UI 토글 노출 조건 | `PostListingValuationCard.tsx:272` `mode !== "simple"` | **simple 모드에서 미노출 — 변경 필요** (트리거는 simple에서도 발생) |
| 결과 echo | `monthlyAccrualApplied` (types `:724`) + 결과 카드 배지 `PostListingDetailCard.tsx:93` | 존재 ✓ — 보정 상세 echo 추가 필요 |
| 기존 anchor | `post-listing-detail.extra.test.ts:71-109` PL-MONTHLY-1~3 | **PL-MONTHLY-1(:81)·3(:106)은 `monthlyAccrualApplied=true` 기대 → §6.2 의미 재정의(감지→발동)로 깨짐. 법령 정합 재산정**(`feedback_anchor_correction_legal_priority`): false + 2호 안내로 갱신. ratio 1·final 8,001·문구 체크(`"§81④"||"월할"`)는 유지. PL-MONTHLY-2·사례 48(5,824)은 불변 |
| 합성 지점 | `stock-transfer-tax.ts:251` → `synthesizePostListingInput`(`post-listing-flat-adapter.ts:459`) | **`...input` spread 기반 — top-level 신규 3필드 자동 보존 확인 완료** (명시 매핑 strip 함정 없음 — Do 재확인 불요) |
| route 매핑 | `route.ts buildEngineInput` (PR#140에서 단건·다자산 단일화) | 신규 필드 **1곳만** 추가 (⑭) |

## 6. 설계

### 6.1 엔진 — 신규 input 필드 3개 (`StockTransferInput`, 모두 optional)

```ts
/** §81④ 1호 — 취득일이 속하는 사업연도의 전전사업연도 1주당 순손익가치 (월할 가산 전용) */
prePriorYearNetIncomePerShare?: number;
/** §81④ 1호 — 전전사업연도 1주당 순자산가치 */
prePriorYearNetAssetPerShare?: number;
/** §81④ 1호 — 직전사업연도의 월수 (사업연도 변경 법인 대응, default 12) */
priorBizYearMonths?: number;
```

- 전전연도는 **모든 모드(simple/listing_only/full)에서 1주당 가치 2필드 직접 입력으로 통일**. full 모드 24행 계산서의 전전연도 확장은 스코프 외(§11) — 입력 빈도 대비 폼 비대화 회피.
- `monthlyAccrualToggle`은 nested `postListingDetail` 경유로 엔진 도달 (기존 배선 재사용 — 신규 배선 0).

### 6.2 엔진 — result echo (`PostListingValuationResult`)

```ts
/** §81④ 1호 보정 상세 (보정 발동 시만) — 결과 카드 산식 표시용 */
monthlyAccrualDetail?: {
  prePriorYearPerShareValue: number;   // 전전사업연도 가중평균
  holdingMonths: number;               // 절상 후 보유월수
  priorBizYearMonths: number;          // 분모 월수 (echo)
  adjustedListingYearPerShareValue: number;  // 보정 상장일 평가액 (= 새 분모)
};
```

- `monthlyAccrualApplied`의 의미 재정의: PR-1 "평가액 동일 감지" → PR-2 "**보정 실제 발동**"(C-3만 true). C-2는 false + 안내 메시지. plain object (Map 금지 — memory `feedback_engine_result_map_json_loss`).

### 6.3 엔진 — 분기 로직 (`calcPostListingConversion` `:253-264` 교체)

```
평가액 동일?
├─ NO  → 본칙 (C-1, 현행)         ※ 토글 ON이면 warning "평가액 상이 — §81④ 미적용" (C-7)
└─ YES
   ├─ 토글 OFF → 2호: 보정 없음 + 안내 (C-2)
   └─ 토글 ON
      ├─ 전전 NI·NA 미입력 → warning + 보정 미적용 (C-4 엔진 방어 — validate가 1차 차단)
      ├─ adjusted ≤ 0     → 환산 불가 가드 (C-6)
      └─ 정상              → §4 산식 보정 + monthlyAccrualDetail echo (C-3·C-5)
```

### 6.4 UI

- **토글 노출 조건**: `mode !== "simple"` 삭제 → **양 연도 입력 가중평균이 동일할 때 모든 모드에서 노출** (활성 우선 — memory `feedback_ui_toggle_auto_visibility_policy`). 동일 판정은 엔진 export 헬퍼 `calcUnlistedPerShareWeighted` import — **`PostListingFormulaPreview.tsx:94-95`가 이미 동일 패턴으로 양 연도 평가액을 산출 중(실측)**이므로 그 로직 재사용(신규 dual-truth 0). full/listing_only 모드의 합성 평가액 동일 감지는 Preview의 stage 산출값 기준.
- 토글 라벨 정정: "§81④ 월할 가산 (취득일·상장일 평가 동일 시)" → "**같은 사업연도에 취득·상장 (소칙 §81④ 1호)**" — 토글의 법적 의미 = 1호/2호 구분.
- 토글 잔존 무해성: 토글 ON 후 입력 변경으로 평가액이 달라져 토글 UI가 숨겨져도 store의 ON 값은 엔진 C-7 경로(무시 + warning)로 흡수 — silent 오작동 없음.
- 토글 ON 펼침 children: 전전연도 NI·NA(CurrencyInput 2개) + 직전사업연도 월수(DecimalInput, default 12, hint "사업연도 변경 법인만 수정"). placeholder 숫자 예시 금지.
- 결과 카드(`PostListingDetailCard`): `monthlyAccrualDetail` 존재 시 산식 한국어 풀어쓰기 행 추가 (변수 약어·floor 표기 금지, "원" 미표기).

### 6.5 validate (⑧)

삽입 위치: `stock-transfer-tax-validate-step2.ts` `form.acquiredBeforeListing` 블록(:177~, detailMode 분기 바깥 — 모든 모드 공통).

- C-4 차단: **토글 ON && (전전 NI 또는 NA 비어있음)** → error 2건. 평가액 동일 여부는 조건에서 제외 — full/listing_only 모드의 평가액은 nested 계산서 합성 산출이라 validate 재현 시 adapter 로직 중복(dual-truth 금지).
- C-7 경고: 토글 ON && 평가액 상이 → warning (차단 아님). **simple 모드만** — 4필드 직접 가중평균 비교(엔진 export `calcUnlistedPerShareWeighted` import — `PostListingFormulaPreview.tsx:94-95`와 동일 기존 패턴).
- 월수 필드: 비어있으면 default 12 (API 변환과 동일 fallback — 3중 패턴).

## 7. 14 동기화 지점 매핑

| # | 지점 | 작업 |
|---|---|---|
| ① 폼 상태 | `calc-wizard-stock-store.ts` | `prePriorYearNetIncomePerShare`·`prePriorYearNetAssetPerShare`·`priorBizYearMonths` 3필드 (string) |
| ② initial | 동상 | `""` · `""` · `"12"` |
| ③ normalize | `calc-wizard-stock-normalize.ts` | 3필드 |
| ④ API 변환 | `stock-transfer-tax-api.ts` | **`parseFloatOrUndef`×2 + 조건부 포함**(기존 4필드 :431 패턴 — `parseAmount`는 빈값 0이라 C-4 우회 위험, 금지) + `priorBizYearMonths || 12` fallback |
| ⑤ UI 위젯 | `PostListingValuationCard.tsx` | 토글 노출 조건 변경 + 펼침 3필드 |
| ⑥ 사이드바 | — | 해당 없음 (평가 입력 — 합계 비대상) |
| ⑦ 결과 카드 | `PostListingDetailCard.tsx` | `monthlyAccrualDetail` 산식 표시 |
| ⑧ validation | `stock-transfer-tax-validate-step2.ts` | C-4 차단 + C-7 경고 + ④와 동일 fallback |
| ⑨⑩ Zod enum | — | enum 신규 없음 |
| ⑫ Zod 입력 객체 | `stock-transfer-tax-schema.ts` | 3필드 optional (`priorBizYearMonths` `.int().min(1).max(12)`) |
| ⑬ body spread | `stock-transfer-tax-api.ts` | body 포함 확인 |
| ⑪⑭ route | `route.ts buildEngineInput` | 3필드 매핑 — **단일화 덕에 1곳** (PR#140). 엔진 내부 합성(`synthesizePostListingInput`)은 spread 보존이라 작업 0 |

`monthlyAccrualToggle`은 기존 14지점 배선 완료 — UI 노출 조건만 변경.

## 8. anchor 케이스 (설계 시 사전 계산 — 원단위 toBe)

공통 가정: `listingDatePriceAvg1Month` 8,001 · `shareCount` 5,000 (사례 48 baseInput 재사용 — **단 baseInput의 취득 2004-07-01·상장 2018-07-01은 실측값이므로 anchor마다 취득·상장일 override 필수**) · 직전연도 NI 50,000 / NA 5,000 → 가중평균 **32,000** (= 50,000×3/5 + 5,000×2/5).

| # | 케이스 | 입력 | 기대값 |
|---|---|---|---|
| A-MA-1 | C-3 기본 보정 | 전전 NI 40,000/NA 4,000(→25,600) · 취득 2024-03-15 → 상장 2024-10-20 (7개월+5일→**8**) · d=12 | adjusted = floor((32,000×12 + 6,400×8)/12) = **36,266** · final = floor(8,001×32,000/36,266) = **7,059** · 총 35,295,000 |
| A-MA-2 | C-2 토글 OFF | 평가 동일·토글 OFF | ratio 1 · final **8,001** · `monthlyAccrualApplied` **false** · 2호 안내 포함 — **PL-MONTHLY-1 재산정으로 갈음**(중복 anchor 신규 작성 금지) |
| A-MA-3 | 1개월 미만 절상 | 취득 2024-06-01 → 상장 2024-06-20 (0+끝수→**1**) | adjusted = floor((384,000+6,400)/12) = **32,533** · final = **7,869** |
| A-MA-4 | C-5 하락 | 전전 NI 62,500/NA 6,250(→40,000) · m=8 | adjusted = floor((384,000 − 64,000)/12) = **26,666** · final = floor(8,001×32,000/26,666) = **9,601** (>8,001 — 법문 그대로) |
| A-MA-5 | C-6 가드 | 극단 하락 → adjusted ≤ 0 | 환산 불가 warning · final 0 |
| A-MA-6 | C-7 | 평가 상이 + 토글 ON | 본칙 결과 불변 + warning |
| A-MA-7 | C-4 엔진 방어 | 토글 ON·전전 미입력 | warning + 보정 미적용 (validate 1차 차단은 별도 ⑧ 테스트) |
| 재산정 | PL-MONTHLY-1·3 | 기존 입력 (토글 OFF) | `monthlyAccrualApplied` **true → false**(의미 재정의 — 감지→발동) + 2호 안내. ratio 1·final 8,001·문구 체크 유지 |
| 회귀 | 사례 48 본칙 + PL-MONTHLY-2 | 기존 | **5,824 불변** · post-listing 5파일 (위 재산정 2건 외 전체 불변) |

※ A-MA-1·3·4의 중간값은 계획 단계 수기 계산 — **Pre-Do에서 A-MA-1 실패 anchor 우선 실행으로 실측 확정** (memory `feedback_pre_anchor_verification`). 월수 절상 규칙(끝수 +1)은 법문 "1개월 미만의 월수는 1개월로 본다"의 해석 — 교재·예규 예제 미확보 상태이므로 **확인 필요** 표기, Do 전 KoreanLaw 해석례/조세심판원 검색 1회 시도.

## 9. 검증 계획

1. **Pre-Do**: A-MA-1 작성 → 현행 코드에서 실패 확보(현재 final=8,001) → 구현 → 통과
2. anchor 신규(A-MA-1·3~7) + **재산정 2건**(PL-MONTHLY-1·3 — true→false) + 회귀(PL-MONTHLY-2·사례 48 5,824 불변) → `npx vitest run __tests__/tax-engine/stock-transfer/`
3. tsc 0 · 전체 `npm test`
4. E2E 1건 (`e2e/` — worktree `E2E_PORT=3100`): simple 모드 평가 동일 입력 → 토글 노출 → ON + 전전 입력 → 결과 카드 보정 산식 확인
5. ⑫⑬⑭ grep 자가 점검 (`prePriorYear` 3필드 전 경로)

## 10. 작업 순서

| Phase | 내용 | 산출 |
|---|---|---|
| P0 | Pre-Do: A-MA-1 실패 anchor + 월수 해석례 검색 1회 | 실패 확보 |
| P1 | 엔진: input 3필드 + 산식 + 분기 + echo + docstring 정정 | A-MA-1~7 통과 |
| P2 | 14지점: ①②③④⑧⑫⑬⑭ | grep 점검 |
| P3 | UI: 토글 조건·펼침·결과 카드 (⑤⑦) | E2E |
| P4 | 회귀 전체 + 문서 환류 + memory 갱신 | ship.sh |

## 11. 스코프 외 (명시)

- **§165⑨ 본체 적용** (상장 환산 무관 — 기준시가 방식 양도에서 양도·취득 기준시가 동일 케이스): 본 모듈은 §165⑤ 후단 준용 케이스만. 본체는 별도 갭으로 추적.
- **full 모드 전전연도 24행 계산서 확장**: 1주당 직접 입력으로 갈음.
- **§165⑥ 유가증권시장 상장 준용**: 변경 없음 — **실측 확정**: 환산 게이트는 `acquiredBeforeListing`(`stock-transfer-tax.ts:247`, marketType 무관)이고 보정 로직은 `calcPostListingConversion` 내부이므로 ⑥ 케이스에도 자동 공유.
- 거래정지 §165③ 보충 평가 (기존 disabled 토글 — 별도 PR).

## 12. 리스크·확인 필요

| 항목 | 상태 |
|---|---|
| 월수 절상 규칙 (끝수 +1 vs 버림) | **확인 필요** — 법문 "1개월 미만의 월수는 1개월로 본다"를 절상으로 해석(보수). P0에서 해석례 검색 |
| 교재·집행기준 월할 가산 수치 예제 | **미확보** — 법령 산식 직접 계산 anchor로 구성. 발견 시 anchor 추가 |
| `monthlyAccrualApplied` 의미 변경(감지→발동) | 결과 카드 배지 문구 함께 갱신. 외부 소비처 grep: `PostListingDetailCard.tsx:93` 1곳뿐(실측) |
| 직전사업연도 월수 ≠ 12 (사업연도 변경 법인) | optional 입력으로 대응. UI hint로 안내 |
