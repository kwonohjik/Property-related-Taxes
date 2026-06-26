# 영농자녀 농지 증여세 감면(조특법 §71) — 농지 재차증여 — UI 설계

> 계획서: `docs/00-pm/gift-farmland-reduction-71-redonation.plan.md` · 엔진설계: `gift-farmland-reduction-71.engine.design.md`
> 대상: 자산 카드 `components/calc/EstateItemEditor.tsx` · 사전증여 `components/calc/PriorGiftInput.tsx` · 결과 `components/calc/results/GiftTaxResultView.tsx` + 신규 `FarmlandReductionCard.tsx`
> 범위: 감면농지 토글(자산-수준) + 사전증여 감면 입력 + 감면세액·안분 결과 카드

## 입력 위젯 1 — 자산 카드 §71 토글 (⑤, `EstateItemEditor.tsx`)

`isSpecialTreatmentAsset`(`EstateItemTableView.tsx`)과 동일 패턴. **§71 대상 자산종류에서만 노출**(grep 확인된 AssetCategory — Pre-Do 확정).

```
┌─ 증여재산: 농지 (real_estate_land) ─────────────────────────┐
│  평가액            [   813,066,000 ] 원                       │
│  ⋯ (기존 자산 입력 필드) ⋯                                    │
│                                                              │
│  [ToggleCard] 영농자녀 농지 증여세 감면 (조특법 §71)   ◯ OFF  │  ← 농지·초지·산림지·축사만 노출
│   └▶ ON 시 emerald 안내:                                      │
│       "영농자녀(만18세↑ 직계비속·농지소재지 또는 직선 20km    │
│        거주·증여 전 3년 자경)·자경농민 요건 충족 시 신청.      │
│        감면세액 5년 합계 1억원 한도(§71②)."                   │
└──────────────────────────────────────────────────────────────┘
```

- `ToggleCard`(native checkbox 금지 — memory `feedback_toggle_card_visibility`). OFF도 tone 유지.
- 비대상 종류(주식·현금 등)에서는 토글 **미렌더**(엔진설계 E2 — AssetCategory 게이트).
- 요건 자동판정 없음 — 토글 = 요건 충족 의제 선언 + 안내 문구(memory `feedback_no_unfavorable_application_without_legal_basis`: 불리 자동적용 금지, 유리 default).

## 입력 위젯 2 — 사전증여 감면 입력 (⑤, `PriorGiftInput.tsx`)

기존 사전증여 행(증여일·증여자·가액·`computedTax`·`giftTaxBase` — PDF 사례 1·2에서 도입됨)에 **감면 토글 + 감면세액** 추가.

```
┌─ 사전증여 #1 ──────────────────────────────────────────────┐
│  증여일   [2019-05-03]   증여자 [부]                          │
│  증여가액 [ 153,754,000 ]                                     │
│  당시 과세표준 ⑤ [ 153,754,000 ]   당시 산출세액 ⑦ [20,750,800]│  ← 기존
│                                                              │
│  [ToggleCard] 이 회차 §71 농지 감면 적용         ● ON         │  ← 신규
│   └▶ 감면받은 증여세액 [ 20,750,800 ] 원  (5년 1억 한도 누계용)│  ← farmlandReductionApplied=true 시 필수
└──────────────────────────────────────────────────────────────┘
```

- `farmlandReductionApplied` 토글 ON → `farmlandReductionAmount` CurrencyInput 노출(필수 — 미입력 validate 차단, 자동 0 금지 memory `feedback_no_silent_apportion_fallback`).
- 현금 prior(#0, 2015) 등 감면 무관 회차는 토글 OFF → 금액 행 숨김.
- 입력 포커스 시 전체선택(글로벌 `SelectOnFocusProvider` 또는 `onFocus select`).

## 결과 화면 — `FarmlandReductionCard` (⑦, `GiftTaxResultView.tsx` 통합)

`farmlandReductionDetail !== null` 일 때만 렌더. 펼침 토글(`ExpandToggleButton` — memory `feedback_result_expand_toggle_standard`).

```
┌─ 영농자녀 농지 증여세 감면 (조특법 §71)  [법령]──────────────┐
│  합산 산출세액 ㉡                              230,046,000     │
│  − 직전 회차 산출세액 ㉠ ※                      20,750,800     │
│  ───────────────────────────────────────                    │
│  농지분 산출세액 ㉣                            209,295,200     │
│                                                              │
│  5년 감면한도 잔여 (1억 − 기감면 20,750,800)     79,249,200     │
│  농지 감면세액 ㉤ = min(㉣, 잔여)               79,249,200  [§71②]│
│  5년 누적 감면 (20,750,800 + 79,249,200)       100,000,000     │  ← 1억 도달 amber
│                                                              │
│  감면농지가액 안분 ─────────────────────────────────────────│
│   감면받은 농지가액(감면범위) ㉮                 307,867,000     │
│     = 농지가액 813,066,000 × ㉤ 79,249,200 / ㉣ 209,295,200    │
│   감면한도 초과분 농지가액 ㉯                    505,199,000     │
│     (일반 증여재산과 합산과세 대상)              [§133②]        │
│                                                              │
│  차감세액 (㉡ − §58 − ㉤)                       130,046,000     │
└──────────────────────────────────────────────────────────────┘
※ 결정세액(신고세액공제 §69 적용 후)은 증여세 결과 본표 참조.
```

- 금액 칸: `text-right font-mono tabular-nums`(memory `amount-column-align`). "원" 접미사 금지(memory `feedback_no_won_suffix`).
- 산식은 한국어 풀어쓰기 — 변수 약어·`floor()` 노출 금지(memory `feedback_result_view_korean_formula`). ㉠㉡㉣㉤㉮㉯ 기호는 PDF 해설 대조용 배지로만.
- 1억 도달 amber: `farmlandReductionDetail.cumulative5yrReduction >= 100_000_000` 판정(문자열 매칭 금지).
- `LawArticleModal legalBasis={GIFT.FARMLAND_REDUCTION_LIMIT}`(§71②·§133②).
- 차감세액(§69 전)은 카드 내 표시, **결정세액(§69 후)은 본표** — 헤드라인 혼동 방지(R-10).
- ※ ㉠는 **안분 분모용 직전 회차 산출세액(full)**. FR-1은 §58 한도 비구속이라 §58 기납부공제(20,750,800)와 수치 일치 — 각주로 명시(엔진설계 ㉣ vs §58 구분).

### ⚠️ 본표·별지10호 reconcile (U2 — Critical 자기일관)
농지 감면세액이 finalTax를 줄이므로, **별지 제10호서식·증여세 본표의 산출세액→결정세액 흐름에도 감면행이 반영**되어야 `결정세액 = 본표 합` 자기일관이 성립(memory `feedback_engine_result_display_drift`).
- Pre-Do: `gift-tax-filing-form-besshi10.ts` 구조 확인 → 별지10호에 "③ 세액공제·감면" 또는 전용 감면세액 행 매핑 가능 여부 점검.
- 전용 행 부재 시: ① breakdown(allBreakdown)에 감면 step 노출 + side card로 reconcile, ② 본표 결정세액은 finalTax 단일 진실. 별지 전용행 정식 매핑은 SCOPE 결정(MVP는 breakdown+card).

## 8 동기화 지점 (UI 측)

| # | 지점 | 위치 (실측) | 작업 |
|---|---|---|---|
| ① 폼 | 자산 `isFarmlandGiftReduction`·prior `farmlandReductionApplied`·`farmlandReductionAmount` | `GiftTaxForm.tsx` state·`EstateItemEditor`·`PriorGiftInput` | 신규 |
| ② initial | 토글 false·금액 "" | 폼 팩토리 | 신규 |
| ③ normalize | 빈문자→undefined·숫자변환 | 폼 normalize | 신규 |
| ④ API | `lib/calc/gift-api.ts:46`(giftItems)·`:95`(priorGifts) map | 수정 |
| ⑤ UI | 자산 토글 + prior 감면 입력 | `EstateItemEditor.tsx`·`PriorGiftInput.tsx` | 신규 |
| ⑥ 사이드바 | finalTax(감면 반영) | gift summary | 점검 |
| ⑦ 결과 | `FarmlandReductionCard` | `GiftTaxResultView.tsx` | 신규 |
| ⑧ validate | 토글 ON 요건 안내 + prior 3필드 필수(`farmlandReductionAmount`·`computedTax`·`giftTaxBase`) | `components/calc/gift-tax-form-validate.ts` | 수정 |
| ⑫ Zod | `isFarmlandGiftReduction`(estate-item-schema)·`farmlandReductionApplied`/`farmlandReductionAmount`(prior-gift-schema) | `lib/validators/estate-item-schema.ts`·`prior-gift-schema.ts` | 수정 |

> ⑨⑩⑪⑬⑭는 엔진설계 14지점 표 참조. UI 측 핵심은 ⑤⑦⑧⑫.

## testid

- 입력: `gift-farmland-toggle-{assetId|idx}`(EstateItem id 없으면 idx) · `prior-farmland-applied-{idx}` · `prior-farmland-amount-{idx}`
- 결과: `farmland-reduction-card` · `farmland-reduction-amount`(㉤) · `farmland-reduced-value`(㉮) · `farmland-excess-value`(㉯) · `farmland-cumulative-limit`(1억 amber)

## E2E (memory `feedback_browser_verify_with_playwright`)

`e2e/gift-farmland-reduction-71.spec.ts`: 현금(2015)·농지A(2019, 감면 토글 ON·감면 20,750,800) prior + 농지B(2021, §71 토글 ON) 813,066,000 입력 → 계산 → `farmland-reduction-amount` 79,249,200 / `farmland-reduced-value` 307,867,000(±1,000) / `farmland-excess-value` 505,199,000(±1,000) / `farmland-cumulative-limit` 1억 amber 확인.

## 정책 준수 체크

- [x] ToggleCard(native 금지) / CurrencyInput(금액) / DateInput(기존 prior 날짜)
- [x] 토글 ON 금액 필수 — 자동 0 금지(`feedback_no_silent_apportion_fallback`)
- [x] 1억 amber·요건 안내는 echo·threshold 판정(문자열 매칭 금지 — `feedback_enum_substring_match_forbidden`)
- [x] 금액 칸 정렬(`amount-column-align`) · "원" 금지(`feedback_no_won_suffix`) · 결과 산식 한국어(`feedback_result_view_korean_formula`)
- [x] §71 대상 자산종류만 토글 노출(엔진설계 E2 게이트)
- [x] 펼침 토글 `ExpandToggleButton` + print 자동펼침(`print-only-css-toggle`)
- [x] 3중 패턴 — display fallback / API·validate fallback 일치, useEffect 미러링 금지(`mirror-pattern`)
