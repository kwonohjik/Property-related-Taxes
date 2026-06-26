# 증여자 사망 합산제외 — UI 설계

> 계획서 rev.2 · engine.design.md 연동. 14지점 중 ①②③④⑤⑥⑦⑧ + 결과뷰.
> 대상: `components/calc/prior-gift/GiftRowEditor.tsx`(사전증여 행 입력) · 결과 `TaxCreditBreakdownCard`/`PriorGiftCreditDetail`.

## 1. 입력 위젯 (⑤) — 사전증여 행에 사망일

기존 사전증여 행(증여일·증여자·가액·산출세액 등) 하단에 **opt-in 토글**:

```
┌─ 사전증여 #1 ─────────────────────────────┐
│ 증여일 [2018-05-02]  증여자 [부친 ▾]        │
│ 증여재산가액 [620,000,000]                  │
│ 산출세액 [111,000,000]  과세표준 [570,000,000]│
│                                            │
│ ┌─ ToggleCard: "이 증여자가 금번 증여 전 사망" ─┐│
│ │  ○ OFF (기본)        ● ON                  ││
│ │  [ON 시] 사망일 [DateInput: 2022-05-02]    ││
│ │  ⓘ 사망자 생전 증여재산은 §47② 합산 제외     ││
│ │    (재산-58). 부·모 중 사망자분만 선별 제외.  ││
│ └────────────────────────────────────────┘│
└────────────────────────────────────────────┘
```

- **ToggleCard** 필수(native checkbox 금지). OFF도 tone 유지(`feedback_toggle_card_visibility`).
- 사망일은 **DateInput 컴포넌트**(`type="date"` 금지 — `feedback_date_input`). 포커스 전체선택 자동(SelectOnFocus/DateInput 내장).
- 토글 OFF → `donorDeceasedDate = undefined`(store default와 일치, 빈문자열 금지).
- placeholder 숫자 예시 금지 — 형식 설명은 `hint`.

## 2. 폼 바인딩 (①②③)

| 단계 | 위치 | 처리 |
|---|---|---|
| ① FormData | PriorGift 폼 타입 | `donorDeceasedDate?: string` |
| ② initial | calc-wizard factory | `undefined`(3중 일치: factory=normalize=UI display) |
| ③ normalize | gift normalize | passthrough(변형 없음) |

## 3. 변환·검증 (④⑧)

- **④ gift-api**: 명시 키 `donorDeceasedDate: gift.donorDeceasedDate`(`lib/calc/gift-api.ts`). `...rest` 의존 금지.
- **⑧ validate** (`lib/calc/gift-tax-form-validate.ts`):
  - 토글 ON인데 사망일 미입력 → **차단**("사망일을 입력하세요").
  - 사망일 ≥ 해당 증여일(데이터 모순) → **차단**("사망일은 증여일 이후일 수 없습니다").
  - 사망일 ≥ 금번 증여일(증여 후 사망, 합산유지) → **경고**(통과). E2E 전체회귀 회피(`feedback_blocking_validation`).
  - 3중 패턴: UI display fallback 없음(optional) → validate도 미입력 시 통과(토글 OFF 경로).

## 4. 사이드바 (⑥)
영향 없음 — 사망 제외는 합계 표시가 아닌 산출세액 안분 내부 보정.

## 5. 결과 카드 (⑦) — 사례4(뺄셈) vs 사례3(곱셈) 구분 표기

`PriorGiftCreditDetail.deceasedExclusion` 플래그로 산출근거 분기:

```
[기납부세액공제 — §58 한도]
 ├ deceasedExclusion = true (사례3 곱셈 안분):
 │   "직전 신고 산출세액 231,000,000원 중 생존 증여자(모) 해당분 안분
 │    = 231,000,000 × 400,000,000 / 1,020,000,000 = 90,588,235원
 │    ※ 부(父) 2022-05-02 사망 — 생전 증여재산(1차)은 §47② 합산 제외 (서일46014-11750·재산-58)
 │    ※ 분모 = 부·모 합산 증여재산가액(gross). 한도(⑨)에 막혀 최종 공제는 78,620,000원"
 │
 ├ priorRoundHadDropout = true (사례4 뺄셈):
 │   "직전 합산 산출세액 388,000,000 − 1차분 산출세액 171,000,000 = 217,000,000원
 │    ※ 1차 증여(2012-05-02)는 10년 경과로 합산 제외 (§47②)"
 │
 └ 그 외: 기존 §58 한도 표기
```

- 산식은 **한국어 풀어쓰기**(변수 약어·`floor()` 노출 금지 — `feedback_result_view_korean_formula`).
- 금액 칸 `font-mono`+`tabular-nums`+우측정렬(amount-column-align).
- "원" 표기 규칙 준수, 내부 id 노출 금지.

## 6. 위젯 가시성 정책
- 사망 토글은 **항상 노출**(모든 사전증여 행) — 사망 여부는 흔한 분기. 단 ON일 때만 DateInput children 표시(점진 노출, `feedback_ui_toggle_auto_visibility_policy`).

## 7. E2E (Playwright)
`e2e/gift-prior-deceased.spec.ts` — 사례3 입력→계산→결과 카드 "부(父) … 사망 … 92,400,000" 텍스트 + Network 탭 request body `donorDeceasedDate` 도달 확인. 사례4 무회귀 spec 별도.
