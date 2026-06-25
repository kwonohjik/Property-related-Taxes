# [UI 설계] 부동산 무상사용·담보 §37 보완 — 경정청구·다기간

> 계획서: `docs/00-pm/gift-free-realestate-supplement.plan.md` / 엔진설계: `gift-free-realestate-supplement.engine.design.md`
> 대상: `components/calc/deemed-gift/shared.tsx` `FreeRealEstateFields`(`:702`) + `components/calc/results/DeemedGiftResultView.tsx`
> 단일페이지 계산기(`DeemedGiftCalculator`) — 양도세 마법사 14지점 중 사이드바·step normalize N/A

## 1. 폼 상태 확장 (`shared.tsx` `DeemedFormState` `:84-91`, initial `:236-241`)

```ts
// 기존: freeSubType, freePropertyValue, freeLoanAmount, freeInterest, freeRelated, freeJustifiable
// 추가:
freePeriods?: { startDate: string; value: string; interest: string }[];  // 3-state: undefined=단일 / []=다기간ON빈 / [...]=다기간
freeRectOn: boolean;          // 경정청구 섹션 토글
freeRectTax: string;          // 증여세 산출세액(직접입력)
freeRectGiftDate: string;     // 당초 증여일
freeRectTermDate: string;     // 중단사유 발생일
```
initial: `freePeriods: undefined, freeRectOn: false, freeRectTax: "", freeRectGiftDate: "", freeRectTermDate: ""`.

> **3-state 토글**(memory `feedback_three_state_optional_mode_toggle`): `length>0` derive 금지. 토글 ON→`freePeriods=[]`, OFF→`undefined`. value/interest는 subType별 의미(free_use=부동산가액 / collateral=차입금·이자).

## 2. 위젯 레이아웃 (ASCII)

```
┌ 부동산 무상사용 (§37) ────────────────────────────┐
│ [무상 사용(§37①)] [무상 담보(§37②)]   ← RadioCardGroup(기존)
│                                                    │
│ ▸ 다기간(5년/1년 초과) 입력      [ OFF | ON ]  ← ToggleCard (freePeriods 3-state)
│   · OFF: ┌ 부동산 가액 [__________] (기존 단일)      │
│   · ON :  기간 1  개시일[DateInput] 가액[Currency]    │
│           기간 2  개시일[DateInput] 가액[Currency]    │
│           [+ 기간 추가] [기간 삭제]                    │
│           ⓘ 각 기간은 별개 증여 — 세액연결은 첫 기간   │
│                                                    │
│ [✓] 특수관계인 (기존 freeRelated)                    │
│ [ ] 거래관행상 정당한 사유 (기존, 비특수 시)          │
│                                                    │
│ ▸ 경정청구 계산 (소유자 사망·양도 등)  [ OFF | ON ] ← ToggleCard (freeRectOn)
│   · free_use에서만 활성. collateral은 비활성(분모12 §6 미검증) │
│   · ON: 증여세 산출세액 [Currency]                   │
│         (세대생략 할증 §57 포함)                      │
│         당초 증여일   [DateInput]                     │
│         중단사유 발생일 [DateInput]                   │
│   · collateral 다기간 window: 개시일[Date] 차입금[Currency] 실제이자[Currency] │
└────────────────────────────────────────────────────┘
```

- **컴포넌트 규칙**: 날짜=`DateInput`(type="date" 금지 `feedback_date_input`)·금액=`CurrencyInput`(select-on-focus 내장)·토글=`ToggleCard`(native 금지, OFF도 tone 유지 `feedback_toggle_card_visibility`).
- **placeholder 숫자 예시 금지** — 형식 설명은 `hint`/FieldCard.
- 다기간 ON 시 단일 부동산가액/차입금 필드 숨김(분기), 경정 섹션은 항상 병존 가능.

## 3. testid (E2E 동결)
| 요소 | testid |
|---|---|
| 다기간 토글 | `free-periods-toggle` |
| 기간 추가 | `free-period-add` |
| 기간 N 개시일 | `free-period-date-{n}` |
| 기간 N 값(가액/차입금) | `free-period-value-{n}` |
| 기간 N 실제이자(collateral) | `free-period-interest-{n}` |
| 경정 토글(free_use 한정) | `free-rect-toggle` |
| 경정 산출세액 | `free-rect-tax` |
| 경정 증여일 | `free-rect-giftdate` |
| 경정 중단일 | `free-rect-termdate` |

## 4. 동기화 (④⑤⑥ — UI측)
- ④ Zod ⑫: `periods`(z.array partial)·`rectification`(z.object) optional 추가 + superRefine. **침묵 strip 주의**(미추가 시 제거).
- ⑤ API ⑬(`gift-deemed-api.ts:66-74`): `freeRealEstate` case에 명시 매핑 추가 —
  `periods: form.freePeriods?.map(p => ({ startDate:p.startDate, [subType==="free_use"?"propertyValue":"loanAmount"]: parseAmount(p.value), actualInterestPaid: parseAmount(p.interest) }))`,
  `rectification: form.freeRectOn ? { giftTaxCalculated: parseAmount(form.freeRectTax), giftDate: form.freeRectGiftDate, terminationDate: form.freeRectTermDate } : undefined`. **explicit strip 주의**.
- ⑥ validate(`gift-deemed-validate.ts:41-48`): 다기간 ON & 빈배열 → "기간 1개 이상" 차단(자동 fallback 금지). 경정 ON → 산출세액>0·증여일·중단일 필수. **UI 통과↔validate 차단 모순 금지**(mirror-pattern).

## 5. 결과뷰 (`DeemedGiftResultView.tsx` — ⑦)

```
┌ 부동산 무상사용 §37① ─────────────────┐
│ [다기간 표]  증여일 | 부동산가액 | 5년현가합 | 과세 │
│   2020-03-15 | 5,000,000,000 | 379,078,675 | ○   │
│   2025-03-16 | 5,000,000,000 | 379,078,675 | ○(예정)│
│   ⓘ 각 기간은 해당 증여일 도래 시 별도 신고 대상     │
│   증여재산가액(이번 증여) = 379,078,675             │
├ 경정청구 가능 세액 ──────────────────┤
│   증여세 산출세액           55,815,740             │
│   × 잔여 20개월 / 60개월                            │
│   = 경정청구 가능 세액      18,605,246             │
│   근거 상증법 §79②1호·상증령 §81⑨                  │
└────────────────────────────────────────┘
```

- **금액 우측정렬** `font-mono tabular-nums`(skill `amount-column-align`)·**숫자 끝 "원" 미표기**(`feedback_no_won_suffix`).
- 산식 **한국어 풀어쓰기**(변수약어·floor 금지 `feedback_result_view_korean_formula`): "잔여 20개월 / 60개월".
- "예정"(미래 window)은 결과뷰 정적 라벨(엔진 계산 아님 — §3 엔진설계). 내부 id 노출 금지.
- 경정세액 = "경정청구 **가능** 세액"(중립, "환급" 단정 금지 `feedback_tax_calculation_principle`).
- 펼침/접기는 `ExpandToggleButton`·인쇄 시 CSS-only 펼침(`print:block`).

## 6. E2E (`e2e/gift-deemed-free-realestate.spec.ts`, `E2E_PORT=3101`)
- RECT-1: 무상사용 + 경정 ON, 산출세액 55,815,740·증여일 2020-03-15·중단 2023-07-20 → 결과 "18,605,246" 노출.
- FRE-MULTI: 다기간 ON, 기간2 입력 → window 표 2행, 증여재산가액(이번 증여)=첫 window.
- 회귀: 단일 무상사용(다기간 OFF·경정 OFF) → 기존 결과 동일.
- **CurrencyInput label htmlFor 미연결** → `getByPlaceholder`/testid 사용(DateInput만 `getByLabel`). memory `project_gift_deemed_transfer_plan`.
