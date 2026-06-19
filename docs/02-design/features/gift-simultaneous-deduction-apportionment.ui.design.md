# 동시증여 증여재산공제 안분 — UI 설계

> Plan: `docs/00-pm/gift-simultaneous-deduction-apportionment.plan.md`
> Engine: `gift-simultaneous-deduction-apportionment.engine.design.md`
> 위치: 증여세 마법사 — 증여공제 입력 단계(`components/calc/gift-tax-form-shared.tsx`, `GiftCreditChecklist.tsx` 인접)

---

## 1. 사용자 시나리오

1. 갑이 2023.2.1. 부·모(동일인) + 할아버지로부터 동시 증여.
2. **부모 증여**를 현재 신고로 계산(donorRelation=직계존속, 과세가액 130,000,000). 부·모 합산은 §47② 기존 경로(R1 — Do 전 실측).
3. 증여공제 입력 단계에서 **"같은 날 다른 증여자로부터도 받으셨나요?"** ToggleCard ON.
4. 동시증여 행 추가: 관계=직계존속(성년), 과세가액=70,000,000(할아버지).
5. 계산 → 결과 카드: 증여재산공제 **32,500,000**(안분) + 산식 `50,000,000 × 130,000,000 ÷ 200,000,000`.

## 2. 위젯 배치 (ASCII)

```
┌─ ③ 증여재산공제 ────────────────────────────── (emerald) ─┐
│ 증여자와의 관계  [직계존속(성년) ▾]                        │
│ 10년 내 기사용 공제  [          0 ]                        │
│ ─────────────────────────────────────────────────────── │
│ [ToggleCard]  같은 날 다른 증여자로부터 동시에 받았나요?    │
│   OFF: (직계존속/직계비속 한도를 나눠 안분합니다 — §46②)   │
│   ON ↓                                                    │
│   ┌─ 동시증여 (현재 신고 외) ────────── [+ 추가] ─┐        │
│   │ 관계            과세가액         [수정][삭제] │        │
│   │ 직계존속(성년)  70,000,000        ✎    🗑     │        │
│   └──────────────────────────────────────────────┘        │
│   ※ 부·모처럼 같은 분(동일인)은 위 '현재 신고'에 합산 —     │
│      여기 중복 입력 금지                                    │
└───────────────────────────────────────────────────────────┘

[추가/수정 모달]  (PriorGiftHistoryModal 동형)
  증여자 관계  [Select: 직계존속(성년)/직계존속(미성년)/직계비속/배우자/기타친족]
               ※ default = 현재 신고 관계. hint "현재 신고와 같은 관계만 안분에 반영됩니다"
  증여세 과세가액  [CurrencyInput hideLabel]
  [취소] [저장]
```

- ToggleCard 3-state 매핑: OFF=`simultaneousGifts: undefined` / ON 빈=`[]` / ON 데이터=`[...]`. (`feedback_three_state_optional_mode_toggle`)
- 관계 Select: `<SelectValue/>` 단독 금지 → 명시 라벨(`feedback_select_component`).
- 과세가액: `CurrencyInput`, placeholder 숫자 예시 금지 → FieldCard `hint`. "원" 접미사 금지.
- 행 클릭=수정 모달(`tr[role=button]`), 동적 testid `simultaneous-gift-row-${index}`.

## 3. 8 클라이언트 동기화 지점

| 지점 | 위치 | 작업 |
|---|---|---|
| ① form state | `GiftTaxFormState`(gift-api.ts:22 re-export FormState) | `simultaneousGifts?: Array<{donorRelation, taxableValue}>` |
| ② initial | 폼 factory | 기본 `undefined`(OFF) — store default = UI display = normalize 3중 일치(`feedback_store_default_vs_ui_display_fallback`) |
| ③ normalize | 폼 normalize | undefined 보존(빈배열로 강제 변환 금지 — 3-state) |
| ④ API 변환 | `lib/calc/gift-api.ts:46` deductionInput 조립 | `simultaneousGifts: form.simultaneousGifts` |
| ⑤ UI 위젯 | `gift-tax-form-shared.tsx` 증여공제 섹션 | ToggleCard + 테이블 + 모달 |
| ⑥ 사이드바 합계 | 증여 summary | **result 도착 후** 엔진 `deductionDetail.apportionment` 값만 반영(0원 미표시). pre-result는 안분 공제 **미표시**(UI 재계산=dual-truth 금지 — `feedback_ui_engine_dual_truth_avoidance`) |
| ⑦ 결과 카드 | 증여 결과 공제 카드 | `deductionDetail.apportionment` 산식 표시(아래 4절) |
| ⑧ validation | `gift-tax-form-shared.tsx` 인라인(전용 gift-validate.ts 부재) | ON+과세가액≤0 차단 / §53의2 가드 차단 |

## 4. 결과 카드 산식 표시 (formula-display-builder)

```
증여재산공제 (직계존속)              32,500,000
  └ [펼치기 ▼] 동시증여 안분 (상증령 §46②2호)
      한도(잔여)            50,000,000
      현재 증여 과세가액    130,000,000
      동시증여 합산 분모    200,000,000   (현재 130,000,000 + 할아버지 70,000,000)
      = 50,000,000 × 130,000,000 ÷ 200,000,000 = 32,500,000
```

- 변수 약어·`floor()` 금지 → 한국어 풀어쓰기(`feedback_result_view_korean_formula`).
- `binding=false`(합<한도)이면 "동시증여 합산이 한도 미만 → 각자 전액 공제(안분 비구속)" 표기.
- 금액 칸 `font-mono tabular-nums` 우측정렬(`amount-column-align`). 내부 id 노출 금지.
- 펼치기: `ExpandToggleButton` 표준, 인쇄 시 CSS-only 자동 펼침(`print-only-css-toggle`).

## 5. validation (⑧) 규칙

| 규칙 | 조건 | 메시지 |
|---|---|---|
| 과세가액 필수 | ON & 행의 taxableValue ≤ 0 | "동시증여 과세가액을 입력하세요"(자동 분할·추정 금지 — `feedback_no_silent_apportion_fallback`) |
| 관계 필수 | ON & donorRelation 미선택 | "동시증여자 관계를 선택하세요" |
| §53의2 가드 | ON & (marriageExemption \|\| birthExemption) > 0 | "동시증여 시 혼인·출산공제 안분은 미지원(Phase 2). 별도 신고하세요" → **차단** |
| 동일인 중복 경고 | ON & 현재 신고와 같은 동일인 의심 | 안내(차단 아님): "부·모 등 같은 분 증여는 현재 신고에 합산하세요" |

- UI 통과 ↔ validate 차단 모순 금지. API/UI fallback 동일(`feedback_validation_sync_8th_point`).

## 6. E2E

- `e2e/gift-simultaneous-apportionment.spec.ts`: 부모 신고 + 동시 할아버지 입력 → 결과 32,500,000 확인. Network 탭 `deductionInput.simultaneousGifts` body 확인.
- 함정: 모달 저장 후 backdrop 닫기, 행 count 보존, 계산 전 모달 close (`[[project_prior_gift_table_modal]]` E2E 함정 차용).
