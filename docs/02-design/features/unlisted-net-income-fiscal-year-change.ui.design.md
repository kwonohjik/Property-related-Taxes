# UI 설계 — 비상장주식 순손익가치: 합병 합산 입력·결과

> 엔진설계: `unlisted-net-income-fiscal-year-change.engine.design.md`
> 대상: `components/calc/inheritance/unlisted-stock-v2/`
> 영역③(합병)만 신규 UI. 영역①②는 hint 보강.

---

## 1. 진입점·배치

`UnlistedStockV2Card.tsx` 내 순손익가치 섹션, `FiscalYearAdjustmentTable`(사업연도 입력) **직후**에 신규 `MergerNetIncomeBlock` 삽입.
계산 로직 순서 = UI 순서(메모리 `feedback_ui_order_follows_logic`): 사업연도 순손익 입력 → **합병 보정(있으면)** → 가중평균.

토글은 `ToggleCard`(native 금지, OFF도 tone 유지 — 메모리 `feedback_toggle_card_visibility`). 합병 ON일 때만 하위 입력 노출(자동 가시성 — `feedback_ui_toggle_auto_visibility_policy`).

---

## 2. 위젯 레이아웃 (ASCII)

```
┌─ ⊞ 합병 후 3년 미경과 순손익 보정 ───────────────[ToggleCard: merger]┐
│  비상장법인이 최근 3년 내 합병한 경우, 합병법인·피합병법인 순손익을   │
│  합산해 1주당 순손익액을 재계산합니다. (상증령 §56③, 상증통 63-56…12) │
│                                                                       │
│  [ON일 때만]                                                          │
│  합병등기일            [ DateInput            ]   ← mergerRegistrationDate │
│  합병후 발행주식총수   [ CurrencyInput   주 ]    ← postMergerShares       │
│                                                                       │
│  ── 합병법인(전1/2/3년) ──────────────────────────────────────        │
│  │ 전1년  사업연도 [DateInput]~[DateInput] 주식수[ ] 순손익[ ]│        │
│  │ 전2년  사업연도 [DateInput]~[DateInput] 주식수[ ] 순손익[ ]│        │
│  │ 전3년  사업연도 [DateInput]~[DateInput] 주식수[ ] 순손익[ ]│        │
│                                                                       │
│  ── 피합병법인 사업연도 (해당분만, 추가 가능) ─────────────            │
│  │ #1  사업연도 [DateInput]~[DateInput]  순손익[ CurrencyInput ] [✕]│  │
│  │ #2  사업연도 [DateInput]~[DateInput]  순손익[ CurrencyInput ] [✕]│  │
│  │                                            [ + 사업연도 추가 ]   │  │
│  │  ℹ 소멸·합병전 연도는 입력하지 않으면 합병법인 단독으로 계산      │  │
└───────────────────────────────────────────────────────────────────────┘
```

- 금액·주식수: 기존 비상장 주식수/순손익 입력 위젯 패턴 준수(`NetAssetCalculationTable`·`FiscalYearAdjustmentTable` 동일 컴포넌트 — 검토 13-3). 순손익은 음수 허용(결손 통산). 우측정렬 tabular-nums(스킬 `amount-column-align`).
- 날짜: `DateInput`(type=date 금지 — 메모리 `feedback_date_input`).
- 피합병 목록: 가변(추가/삭제). placeholder 숫자 예시 금지 → FieldCard `hint`로 형식 설명.
- 포커스 전체선택: 전역 `SelectOnFocusProvider` 자동(개별 처리 불요).

---

## 3. 폼 상태 바인딩 (8지점 ①~③)

```
mergerForm (UnlistedStockV2Card 서브상태):
  enabled: boolean                       // ToggleCard
  mergerRegistrationDate: string|Date
  postMergerShares: number
  acquirer: [{start,end,shares,netIncome} ×3]
  targetFiscalYears: [{start,end,netIncome}]   // 가변, 3-state(메모리 feedback_three_state_optional_mode_toggle)
```
- ② initial: `enabled:false`, 배열 빈/0.
- ③ normalize: `normalize-restored-form-dates.ts`에 merger Date 필드(mergerRegistrationDate·acquirer[].start/end·targetFiscalYears[].start/end) 재수화 추가. **useEffect→store 미러링 금지**(메모리 `feedback_useeffect_store_mirror_forbidden`) — onChange 직접 갱신.
- ④ 변환: `enabled`이면 `mergerContext` 조립해 `UnlistedStockValuationInput`에 패스스루(API 미경유 → JSON 직렬화 없음). `enabled=false`면 `mergerContext: undefined`(검토 13-2).

---

## 4. 결과 카드 (지점 ⑦) — `PerShareValuationResultCard.tsx`

합병 적용 시 기존 ⑤ 1주당 순손익가치 행 아래 **합산 명세 카드**(amber tone, 연환산 카드와 동일 패턴 `:139-151` 차용):

```
┌ 합병 순손익 합산 내역 (상증령 §56③) ───────────[ExpandToggleButton]┐
│ 연도   합병법인순손익  +피합병안분   = 합산순손익  ÷주식수  =1주당 │
│ 전1년     600          0(이미포함)      600       …       …      │
│ 전2년     300         +50(6개월)        350       …       …      │
│ 전3년     200        +250(각6개월)      450       …       …      │
│  · 피합병 사업연도가 합병법인 연도와 겹치는 개월수만큼 안분 합산   │
│  · 결손금은 0으로 보지 않고 합병법인 이익과 통산                  │
└──────────────────────────────────────────────────────────────────┘
```
- echo 소스: `result.mergerYearBreakdown`(엔진설계 §2.2). 결과 산식 한국어 풀어쓰기, `floor()`·변수약어 금지(메모리 `feedback_result_view_korean_formula`).
- **연환산 카드와 동시 표출 없음**(검토 13-1): 합병 적용 시 §17의3② 연환산은 skip(안분에 월할 내재) → `mergerApplied`이면 연환산 카드 미표시, 합병 카드만. 상호배타 분기.
- 인쇄 자동 펼침: `print:block`(스킬 `print-only-css-toggle`), 토글 버튼 `print:hidden`.
- 금액 칸 `font-mono tabular-nums` 우측정렬.

---

## 5. validation (지점 ⑧) — `lib/calc/inheritance-validate-unlisted.ts`

merger.enabled=true 시 필수:
- mergerRegistrationDate, postMergerShares>0
- acquirer 3개 각 start<end, shares>0, netIncome(숫자, 음수 허용)
- targetFiscalYears 각 start<end (목록 비어도 허용 — 합병법인 단독)
- **UI 통과 ↔ validate 차단 모순 금지**(메모리 `feedback_validation_sync_8th_point`): UI에서 입력 가능한 모든 상태가 validate 통과. 자동 안분 fallback 신설 금지(`feedback_no_silent_apportion_fallback`) — 미입력은 검증오류.

---

## 6. 영역①② — 신규 위젯 없음(hint만)

- 영역①(1년 미만 연환산): 기구현. `FiscalYearAdjustmentTable`에 "사업연도 1년 미만 시 자동 1년 환산(§17의3②)" hint 1줄 추가 검토.
- 영역②(사업연도 변경): 사용자가 전1/2/3년 사업연도를 직접 입력하는 현행 구조 유지. "사업연도 변경 시 평가기준일 이전 1·2·3년이 되는 날이 속하는 사업연도를 입력" hint 추가.

---

## 7. testid (E2E 동결)
- `merger-toggle`, `merger-reg-date`, `merger-post-shares`
- `merger-acquirer-{0,1,2}-{start,end,shares,income}`
- `merger-target-{idx}-{start,end,income}`, `merger-target-add`, `merger-target-{idx}-remove`
- 결과: `merger-breakdown-row-{0,1,2}`
