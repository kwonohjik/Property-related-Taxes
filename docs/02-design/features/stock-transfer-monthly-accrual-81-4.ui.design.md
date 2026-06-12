# 소칙 §81④ 월할 가산 — UI 설계 (stock-transfer PR-2)

> 계획: `docs/00-pm/stock-transfer-monthly-accrual-81-4.plan.md` · 엔진 설계: `stock-transfer-monthly-accrual-81-4.engine.design.md` · 작성 2026-06-12

## 1. 사용자 시나리오

1. 상장주식 양도 + 환산취득가 모드 + "상장 전 취득" ON (`acquiredBeforeListing`) — 기존 흐름.
2. 상장연도·취득연도 평가 입력(simple 4필드 또는 full/listing_only 계산서) 결과 **양 연도 가중평균이 동일**해지면 → §81④ 토글 카드가 자동 노출 (현재는 full/listing_only에서만 무조건 노출 — 변경).
3. 사용자가 "같은 사업연도에 취득·상장" 여부를 토글로 신고:
   - ON(1호) → 펼침 영역에 전전사업연도 평가 2필드 + 직전사업연도 월수 입력
   - OFF(2호) → 입력 없음, 계산 시 결과 카드에 2호 안내
4. 계산 → 결과 카드에 보정 산식(전전 평가·보유월수·보정 평가액) 표시.

## 2. 입력 위젯 — `PostListingValuationCard.tsx` (⑤)

### 2.1 토글 노출 조건 변경 (`:272` 실측 `mode !== "simple"` → 평가액 동일 감지)

```
양 연도 평가액 산출 (모드별):
  simple        → form 4필드 parseAmount → calcUnlistedPerShareWeighted (엔진 import)
  full/listing_only → PostListingFormulaPreview.tsx:94-95의 stage 산출 로직 재사용
                     → useMemo 훅 `usePostListingPreviewValues`로 추출해 Preview·토글 가시성 공유
                       (dual-truth 0 — 산출은 엔진 export 헬퍼 단일)
노출: listingEval > 0 && listingEval === acqEval
```

- `isHeavyRealEstateForValuation` 반영 동일 (Preview와 같은 인자).
- 토글 잔존 무해성: 노출 해제 후 store ON 잔존 → 엔진 C-7 흡수 (계획 §6.4).

### 2.2 ToggleCard 변경 + 펼침 children (ASCII)

```
┌─[rose]──────────────────────────────────────────────┐
│ ◉ 같은 사업연도에 취득·상장 (소칙 §81④ 1호)    [Switch] │
│   취득일·상장일 직전 사업연도 평가액이 동일합니다.        │
│   같은 사업연도면 ON — 직전·전전 평가 차액을 보유월수로   │
│   안분해 상장일 평가액을 보정합니다. 아니면 OFF(2호).     │
│ ── ON 펼침 ──────────────────────────────────────── │
│  전전사업연도 1주당 순손익가치   [CurrencyInput]        │
│  전전사업연도 1주당 순자산가치   [CurrencyInput]        │
│  직전사업연도의 월수            [DecimalInput] (기본 12)│
│   hint: 사업연도 변경 법인만 수정 (1~12)                │
│  안내: 보유월수는 취득일~상장일에서 자동 계산             │
│        (1개월 미만은 1개월)                             │
└─────────────────────────────────────────────────────┘
```

- tone `rose` 유지(기존)·variant `card`(children 펼침). placeholder 숫자 예시 금지 — hint로 형식 안내.
- 월수는 `DecimalInput` + `parseDecimal` (CurrencyInput 금지 — 콤마 불요 소수/정수 필드 규칙).
- 라벨 정정: 기존 "§81④ 월할 가산 (취득일·상장일 평가 동일 시)" → 위 ASCII (토글의 법적 의미 = 1호/2호 구분).

## 3. 결과 카드 — `PostListingDetailCard.tsx` (⑦)

`post.monthlyAccrualDetail` 존재 시 환산비율 행(:59 실측) 직전에 보정 블록 삽입:

```
┌─[violet 기존 카드 내]─────────────────────────────────┐
│ 월할 가산 보정 (소칙 §81④ 1호 — 같은 사업연도 취득·상장) │
│  전전사업연도 평가액 = 25,600                           │
│  보유월수 = 8개월 (취득일~상장일, 1개월 미만 절상)        │
│  보정 상장일 평가액 = 32,000 + (32,000 − 25,600)        │
│                      × 8 ÷ 12 = 36,266                 │
│  → 환산비율 분모를 보정 평가액으로 교체                   │
└──────────────────────────────────────────────────────┘
```

- 한국어 풀어쓰기 — 변수 약어·`floor()` 표기 금지, 숫자 끝 "원" 금지.
- 기존 배지(:93) 문구 갱신: "§81④ 월할 가산 발동" 유지 (의미 재정의 후 정확해짐 — 발동 시만 true).
- C-2·C-4·C-7은 기존 warnings 표시 경로로 노출 (신규 UI 없음).

## 4. 동기화 지점 (UI 측 상세)

| # | 파일 | 작업 |
|---|---|---|
| ① | `calc-wizard-stock-store.ts` | `prePriorYearNetIncomePerShare: string`·`prePriorYearNetAssetPerShare: string`·`priorBizYearMonths: string` |
| ② | 동상 initial | `""`·`""`·`"12"` |
| ③ | `calc-wizard-stock-normalize.ts` | `strField`×2 + `strField`(월수) |
| ④ | `stock-transfer-tax-api.ts` | **`parseFloatOrUndef`×2 + `if (x !== undefined) body.x = x` 조건부 포함** (기존 4필드 :431·:437 패턴 동일 — ⚠ `parseAmount`는 빈값 0 반환이라 엔진 C-4 차단을 우회시키므로 금지) + `parseDecimal(priorBizYearMonths) \|\| 12` |
| ⑤ | `PostListingValuationCard.tsx` | §2 (토글 조건·라벨·펼침 3필드) |
| ⑥ | — | 해당 없음 |
| ⑦ | `PostListingDetailCard.tsx` | §3 |
| ⑧ | `stock-transfer-tax-validate-step2.ts` `acquiredBeforeListing` 블록(:177~) | C-4: 토글 ON && (전전 NI 또는 NA 빈값) → error 2건. C-7 warning: simple 모드만. 월수: 빈값 → 12 fallback(④와 동일) + **입력 시 1~12 정수 체크**(Zod `.int()` 400 사전 차단) |
| ⑫ | `stock-transfer-tax-schema.ts` | 3필드 optional (`priorBizYearMonths` `.int().min(1).max(12)` optional) |
| ⑬ | `stock-transfer-tax-api.ts` body | 3필드 포함 grep 점검 |
| ⑭ | `route.ts buildEngineInput` | 3필드 (단일 지점) |

토글(`monthlyAccrualToggle`)은 기존 14지점 배선 완비 — ⑤ 노출 조건·라벨만 변경.

## 5. E2E — `e2e/stock-transfer-monthly-accrual.spec.ts` (신규, worktree `E2E_PORT=3100`)

| # | 시나리오 | 검증 |
|---|---|---|
| E-1 | kosdaq·환산모드·상장 전 취득·simple 4필드 **동일값** 입력 | §81④ 토글 카드 노출 |
| E-2 | E-1 + 토글 ON + 전전 2필드·월수 입력 + 계산 | 결과 카드 "월할 가산 보정" 블록 + 보정 평가액 표시 |
| E-3 | E-1 + 토글 OFF + 계산 | 2호 안내 warning 표시·보정 블록 없음 |
| E-4 | 4필드 **상이값** | 토글 카드 미노출 |

- 셀렉터: ToggleCard 라벨 텍스트 기준(이모지·중복 매칭 주의 — `.first()` 패턴), Network 탭 body에 `prePriorYear*` 3필드 확인(⑬ 실증).
- **Do deviation (E2E)**: ToggleCard 토글 시 `getByRole("switch").click()`는 Switch가 `<label>` 내부라 이중 처리되어 net no-op이 될 수 있음 → **제목 텍스트(`getByText(TITLE).click()`)를 클릭해 1회 토글**. CurrencyInput 채우기는 `input[type="text"]` 한정(ToggleCard 숨은 checkbox 제외). 포트 충돌 회피: 다른 worktree가 3100 점유 시 `E2E_PORT=3200` 격리(reuseExistingServer stale 방지).
- **Do 결과**: E-1·E-2·E-3 3건 통과(E-4 미노출은 E-3로 갈음). 보정 결과 계산 검증은 route anchor LO-PRE-3로 대체(E2E는 토글 가시성·펼침에 집중).

## 6. UI 자가 점검 (Do 완료 조건)

- [ ] 14지점 grep (`prePriorYear` 전 경로 + ⑫⑬⑭)
- [ ] 토글 OFF에도 rose tone 배경 유지 (ToggleCard 기본)
- [ ] validate C-4 차단 ↔ UI 노출 모순 없음 (토글 ON 시 입력 필드가 같은 카드 안 — 사용자 즉시 인지)
- [ ] 결과 카드 "원" 미표기·약어 금지
- [ ] E2E 4건 통과
