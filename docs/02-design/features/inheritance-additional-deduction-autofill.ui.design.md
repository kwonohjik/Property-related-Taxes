# 상속세 마법사 — 추가 공제 입력 자동 채움 + 간주상속재산 입력 (UI Design)

> 작성일: 2026-05-21
> 계획서: [`docs/00-pm/inheritance-additional-deduction-autofill.plan.md`](../../00-pm/inheritance-additional-deduction-autofill.plan.md) v2.2
> 대상 마법사: 상속세 (`InheritanceTaxForm` Step1·Step2·Step4)
> 정책 참조: 계획서 §4 + `[[besshi-form-replica]]` · `[[formula-display-builder]]` · `[[mirror-pattern]]`

## 0. 디자인 범위

본 디자인 문서는 계획서 §1~§11을 UI 명세로 구체화. 계산 산식·법령 근거는 계획서 참조.

### 0-1. 대상 파일
- `components/calc/inheritance/steps.tsx` (Step1·Step2 inline EstateItem·DebtItem 입력)
- `components/calc/inheritance/step4-5.tsx` (Step4 추가 공제 입력)
- `components/calc/inheritance/DebtAllocationInput.tsx` (R2 체크박스 통합)
- `components/calc/PropertyListInput.tsx` 또는 `components/calc/inheritance/EstateItemForm.tsx` (가칭 신규 분리)
- `components/calc/inheritance/AutoSuggestBadge.tsx` (신규)
- `components/calc/inheritance/DeemedInheritanceList.tsx` (신규)
- `components/calc/inheritance/TrustTypeRadio.tsx` (신규)
- `lib/calc/financial-deduction-resolver.ts` (신규)
- `lib/calc/inheritance-deduction-suggest.ts` (신규)

## 1. 케이스 매트릭스 (모든 분기 enumerate)

### 1-1. R1·R3 — EstateItem §22 체크박스 + 간주상속재산

| Case | category | deemedCategory | trustType | isFinancialAssetForDeduction | UI 노출 | resolveFinancialEligibility | Anchor |
|---|---|---|---|---|---|---|---|
| E-1 | financial | — | — | undefined | 체크박스 default ON | true | FDR-1 |
| E-2 | real_estate_land | — | — | undefined | 체크박스 default OFF | false | FDR-2 |
| E-3 | financial | — | — | true | "사용자 지정 (포함)" | true | FDR-3 |
| E-4 | financial | — | — | false | "사용자 지정 (제외)" | false | FDR-4 |
| E-5 | cash | insurance | — | undefined | 보험금 카드 + §22 ON | true | FDR-5 |
| E-6 | cash | retirement | — | undefined | 퇴직금 카드 + §22 OFF + 제외 안내 | false | FDR-6 |
| E-7 | other | trust | undefined | undefined | 신탁 카드 + trustType 라디오 노출 + §22 OFF | false | FDR-7 |
| E-8 | other | trust | cash_trust | undefined | 금전신탁 선택 + §22 ON | true | FDR-7b |
| E-9 | other | trust | real_estate | undefined | 부동산신탁 선택 + §22 OFF | false | FDR-7c |
| E-10 | other | trust | security | undefined | 증권신탁 선택 + §22 OFF | false | FDR-7d |
| E-11 | other | trust | other | undefined | 기타신탁 선택 + §22 OFF | false | FDR-7e |
| E-12 | other | trust | real_estate | true | "사용자 명시 포함" override | true | FDR-8 |
| E-13 | listed_stock | — | — | undefined | 체크박스 default ON + §22② 차명 안내 | true | FDR-9 |

### 1-2. R2 — DebtItem §22 체크박스

| Case | category | isFinancialDebtForDeduction | UI 노출 | resolveFinancialDebt | Anchor |
|---|---|---|---|---|---|
| D-1 | financial | undefined | 체크박스 ON, enabled | true | FDD-1 |
| D-2 | personal | undefined | 체크박스 OFF, disabled, disabledReason 표시 | false | FDD-2 |
| D-3 | personal | true (legacy) | 체크박스 OFF (강제), disabled | **false** | FDD-3 |
| D-4 | funeral | undefined | 체크박스 OFF, disabled | false | FDD-4 |
| D-5 | financial | false | 체크박스 OFF, "사용자 명시 제외" | false | FDD-5 |
| D-6 | tax | undefined | 체크박스 OFF, disabled | false | (D-2와 동일) |

### 1-3. Step4 자동 채움 — 6개 필드

| Field | 도출 함수 | isApplicable 조건 | 결과 화면 | Anchor |
|---|---|---|---|---|
| netFinancialAssets | suggestNetFinancialAssets | 자산 또는 채무 1건 이상 R1·R2 체크 | "예금 5천만 + 보험금 2억 − 대출 3천만 = 2.2억" | ADS-1~5 |
| priorGiftDeductionTotal | suggestPriorGiftDeductionTotal (calcRelationDeduction 재사용) | priorGifts ≥ 1 | "배우자 회차: 6억 (한도), 직계비속 회차: 5천만 (한도)" | ADS-6·7 |
| familyBusinessValue | suggestFamilyBusinessValue | isFamilyBusinessAsset=true 1건 이상 | "가업자산 2건 합 N억" | ADS-8 |
| legateeAmountNonHeir | suggestLegateeAmountNonHeir | heirAllocations에 legatee/corporate 분배 존재 | "손녀 분배 합 N억" | ADS-9 |
| spouseActualAmount | suggestSpouseActualAmount | heirAllocations에 spouse 분배 존재 | "배우자 분배 합 N억" | ADS-10 |
| cohabitHouseStdPrice | (suggestCohabitHouseCandidates) | 주택 자산 + isCohabitant 자녀 존재 | 라디오 후보 목록 | (디자인 §3-6) |

## 2. UI 컴포넌트 명세

### 2-1. `FinancialDeductionCheckbox` (R1 — EstateItem 카드 통합)

위치: EstateItem 입력 카드 내부, category 선택 직후.

```
┌─ 자산 카드 (테두리 emerald-200) ──────────────────────┐
│ 자산명: [예금]                                          │
│ 카테고리: [예금·펀드·채권 (financial) ▼]                │
│ ┌─ §22 금융재산공제 (emerald-50/40 box) ─────────────┐ │
│ │ 공제 대상                       [기본 적용] 배지     │ │
│ │ ◉ 포함  ○ 제외  ○ 기본값으로                        │ │
│ │ (현재: ✓ 공제 대상으로 포함)                        │ │
│ └────────────────────────────────────────────────────┘ │
│ 평가액 ··· (이하 기존 입력)                              │
└─────────────────────────────────────────────────────────┘
```

3-state RadioCardGroup (layout="inline"):
- "포함" (tone=emerald, isFinancialAssetForDeduction=true)
- "제외" (tone=rose, isFinancialAssetForDeduction=false)
- "기본값으로" (tone=violet, isFinancialAssetForDeduction=undefined)

배지: `CategoryDefaultBadge` — `[기본 적용]` (default true) / `[기본 제외]` (default false) — `resolveFinancialEligibility(item)`의 명시 분기 없는 결과 표시.

`disabled` 조건: 없음 (모든 카테고리에서 사용자 override 가능).

`hint`: §19① 인용 — "예금·적금·부금·신탁(금전)·보험금·주식·채권·수익증권 등이 대상"

### 2-2. `TrustTypeRadio` (R3-보강)

조건부 렌더: `deemedCategory === "trust"`일 때만 표시.

```
┌─ 신탁 유형 (violet-50/40) ─────────────────────────────┐
│ 신탁 유형 선택                                          │
│  ◉ 금전신탁 (§22 적용)                                  │
│  ○ 부동산신탁 (§22 미적용)                              │
│  ○ 증권신탁 (§22 미적용)                                │
│  ○ 기타                                                 │
│ ⓘ 상증령 §19① — 금전신탁만 금융재산공제 대상            │
└─────────────────────────────────────────────────────────┘
```

RadioCardGroup (layout="stack"):
- 옵션 4개: `cash_trust` / `real_estate` / `security` / `other`
- 미선택 시 안전 default: `resolveFinancialEligibility`가 false 반환
- 사용자가 선택 즉시 useMemo로 `FinancialDeductionCheckbox` 배지·default 갱신 (`useEffect → store` 미러링 금지 — derive만)

### 2-3. `DeemedInheritanceCard` (R3 — Step1 신규 그룹)

위치: Step1 기존 `estateItems` 입력 영역 하단.

```
┌─ 간주상속재산 (§8·§9·§10) — violet 카드 ────────────────┐
│ ● 보험금·신탁재산·퇴직금 — 본래상속재산과 합산되어 과세  │
│                                                          │
│ [＋ 보험금 추가] [＋ 신탁재산 추가] [＋ 퇴직금 추가]      │
│                                                          │
│ ┌─ 보험금 카드 (cash 카테고리 자동) ─────────────────┐  │
│ │ 자산명: [생명보험 김ㅇㅇ]                            │  │
│ │ §8 안내: 피상속인이 보험계약자인 생명·손해보험        │  │
│ │   (실질 납부자도 포함 §8②)                          │  │
│ │ §22 체크박스 (default true)                           │  │
│ │ 평가액 ···                                            │  │
│ └─────────────────────────────────────────────────────┘  │
│ ┌─ 신탁재산 카드 (other 카테고리 자동) ──────────────┐  │
│ │ §9 안내: 피상속인 신탁재산                            │  │
│ │   (§33① 수증자 분 신탁이익은 상속재산 제외)         │  │
│ │ ⚠️ 신탁 유형 선택 — 금전신탁만 §22 적용              │  │
│ │ TrustTypeRadio (조건부)                              │  │
│ │ §22 체크박스 (trustType 의존)                         │  │
│ └─────────────────────────────────────────────────────┘  │
│ ┌─ 퇴직금 카드 (cash 카테고리 자동) ─────────────────┐  │
│ │ §10 안내: 퇴직금·퇴직수당·공로금·연금                │  │
│ │ ⚠️ 제외 항목: 국민연금·공무원연금·사립학교교직원연금·│  │
│ │    군인연금 유족급여, 산재 유족보상, 업무상 사망       │  │
│ │    유족보상금 (§10 1~6호)                            │  │
│ │ §22 체크박스 (default false)                          │  │
│ └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

데이터 흐름:
- `addEstateItem` 호출 시 `deemedCategory` 자동 부여 + 카테고리 자동 (insurance·retirement → cash / trust → other)
- 일반 자산 목록(`estateItems.filter(i => !i.deemedCategory)`)과 분리 표시
- 삭제 시 동일 estateItems 배열에서 제거 (별도 store 분리 없음)

### 2-4. `FinancialDebtCheckbox` (R2 — DebtItem 카드 통합)

위치: `DebtAllocationInput.tsx`의 각 DebtItem 카드 내부.

```
┌─ 채무 카드 ─────────────────────────────────────────────┐
│ 명칭: [은행 대출]                                        │
│ 카테고리: [금융기관 채무 (financial) ▼]                  │
│ 금액: [50,000,000] 원                                    │
│ ┌─ §22 금융채무 (rose-50/40) ───────────────────────┐  │
│ │ 순금융재산 차감 채무             [기본 적용] 배지   │  │
│ │ ✓ 차감 대상으로 포함                                │  │
│ │ ⓘ §19④ — §10① 1호 입증된 금융회사등 채무만 차감     │  │
│ └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

- `category === "financial"` 외 카테고리에서는 **체크박스 disabled** + disabledReason 표시: "§19④ 정의상 금융기관 채무만 §22 차감 대상"
- legacy `form.debts` 문자열 모드: 별도 안내 카드 "협의분할 모드 전환 시 §22 적용 가능"

### 2-5. `AutoSuggestBadge` (Step4 — 6개 필드 공용)

위치: Step4 각 CurrencyInput 직전.

```
┌─ 💡 자동 제안 (emerald-50/40, dashed border) ──────────┐
│ 순 금융재산 — 자동 도출값                                │
│ 8,500,000원  [▼ 산식 펼침]                              │
│ ┌────────────────────────────────────────────────────┐  │
│ │ 금융자산 합계: 12,000,000원 (예금 1건 + 보험금 1건) │  │
│ │ 금융채무 합계: 3,500,000원 (은행대출 1건)            │  │
│ │ 순 금융재산: 8,500,000원                             │  │
│ └────────────────────────────────────────────────────┘  │
│                              [이 값으로 채우기]          │
└──────────────────────────────────────────────────────────┘

(아래에 기존 CurrencyInput "순 금융재산" 입력란)
```

상태 분기:
- `currentValue === "" && suggestion.isApplicable`: 배지 표시 + "채우기" 버튼 활성
- `currentValue !== "" && currentValue !== String(suggestion.value)`: "현재 입력값과 다름" 경고 배지 amber
- `currentValue === String(suggestion.value)`: "자동 채움 적용됨" 체크 표시 + "되돌리기" 버튼
- `!suggestion.isApplicable`: 배지 미렌더

토글 동작:
- "채우기" 클릭 → `set({ [field]: String(suggestion.value) })` (사용자 명시 action만 store write — `useEffect → store` 미러링 금지)
- 산식 펼침: 로컬 state, useEffect 불필요
- 인쇄 시 자동 펼침: `[[print-only-css-toggle]]` 패턴 — `className={open ? "block" : "hidden print:block"}`

## 3. Step별 UI 통합

### 3-1. Step1 (상속재산)

순서:
1. 일반 자산 목록 (기존 `estateItems.filter(i => !i.deemedCategory)`)
   - 각 카드 내 `FinancialDeductionCheckbox` 추가 (R1)
2. **간주상속재산 (§8·§9·§10) — 신규** (`DeemedInheritanceCard`)
   - 보험금 / 신탁 / 퇴직금 추가 버튼 3개
   - 신탁 추가 시 `TrustTypeRadio` 조건부 노출
3. 추정상속재산 (`presumedItems`) — 기존 유지
4. 비상장주식 (`stockItems`) — 기존 유지, R1 체크박스 통합

### 3-2. Step2 (비과세·장례비·채무)

- `DebtAllocationInput`(ON 모드) 각 DebtItem 카드에 `FinancialDebtCheckbox` 통합
- legacy `form.debts` 문자열(OFF 모드)에 안내 카드 추가: "💡 부채 협의분할 모드 전환 시 §22 금융채무 차감 자동화 가능"

### 3-3. Step4 (공제)

순서 (기존 유지 + AutoSuggestBadge 삽입):

```
1. HeirComposition (기존)
2. ── 추가 공제 입력 (선택) ──
3. 배우자 실제 상속액 §19         [AutoSuggestBadge (협의분할 시)]
4. 순 금융재산 §22                [AutoSuggestBadge]  ← 가장 자주 사용
5. 동거주택 공시가격 §23의2       [후보 라디오]
6. 동거주택공제 직접 입력 (Phase E) — 수동만
7. 영농상속재산가액 §23 — 수동만 (범위 외)
8. 가업상속재산가액 §18의2        [AutoSuggestBadge]
9. 가업영위기간 (familyBusiness >0 시)
10. 가업상속공제 직접 입력 (Phase E) — 수동만
11. 상속외자 유증 §19·§24        [AutoSuggestBadge (협의분할 시)]
12. 사전증여 증여재산공제 §24    [AutoSuggestBadge]
13. 일괄공제 토글 §21
```

## 4. 14지점 동기화 상세 (UI 측 책임)

| 지점 | UI 측 작업 | 파일 |
|---|---|---|
| ① 폼 타입 | `shared.ts` FormState 변경 없음 (EstateItem·DebtItem이 array element라 타입 외부에서 변경) | `components/calc/inheritance/shared.ts` |
| ② initial | `INITIAL_FORM.estateItems`·`debtItems` 빈 배열 그대로. 신규 필드는 EstateItem·DebtItem 자체 factory가 책임 | `shared.ts` + `lib/tax-engine/types/inheritance-gift.types.ts` 인근 factory |
| ③ normalize | sessionStorage 마이그 — `lib/stores/calc-wizard-migration.ts`에 `migrateInheritanceEstateItem`·`migrateInheritanceDebtItem` 함수 추가 (신규 필드 undefined 보장) | 동일 |
| ④ API 변환 | `lib/calc/inheritance-tax-api.ts` (또는 `InheritanceTaxForm.buildInput`) — estateItems·debtItems spread 전환. 명시 매핑 grep 전수 점검 | `lib/calc/inheritance-tax-api.ts` |
| ⑤ UI 위젯 | `FinancialDeductionCheckbox`·`TrustTypeRadio`·`DeemedInheritanceCard`·`FinancialDebtCheckbox`·`AutoSuggestBadge` (총 5 신규) | 본 디자인 §2 |
| ⑥ 사이드바 | `InheritanceSidebar` — `deemedCategory` 별 합계 분리 표시(보험금/신탁/퇴직금) — 옵션 | `components/calc/inheritance/InheritanceSidebar.tsx` |
| ⑦ 결과 카드 | `components/calc/results/InheritanceTaxResultView.tsx` — §22 공제 산출 표시에 "(자산 N건 − 채무 M건)" 카운트 노출 | `components/calc/results/InheritanceTaxResultView.tsx` |
| ⑧ validation | `lib/calc/inheritance-validate.ts` (또는 step별 validate) — trust 선택 시 trustType 미입력 경고(차단 아님, 안내만) | `lib/calc/inheritance-validate.ts` |
| ⑨ Zod 메인 | `app/api/calc/inheritance/route.ts` estateItemSchema에 `isFinancialAssetForDeduction`·`trustType` optional 추가 | `app/api/calc/inheritance/route.ts` |
| ⑩ Zod 컴패니언 | debtItemSchema에 `isFinancialDebtForDeduction` optional 추가 | 동일 |
| ⑪ acquisitionDate fallback | 해당 없음 (양도세 컨벤션) | — |
| ⑫ Zod 입력 객체 | inheritanceInputSchema의 estateItems·debtItems element type 신규 필드 포함 — **누락 시 침묵 strip** | 동일 |
| ⑬ callInheritanceTaxAPI body | spread 보장 확인. 명시 매핑이 있으면 신규 필드 3개 모두 추가 | `lib/calc/inheritance-tax-api.ts` |
| ⑭ Route handler 매핑 | estateItems·debtItems spread 보장 시 자동 통과 | `app/api/calc/inheritance/route.ts` |

## 5. 색상·tone 가이드

| UI 요소 | tone | 의미 |
|---|---|---|
| §22 금융재산공제 체크박스 (R1) | emerald | 공제·세제 혜택 |
| §22 금융채무 체크박스 (R2) | rose | 차감·부채 |
| 간주상속재산 카드 (R3) | violet | 거주·자격·간주 분류 (`feedback_section_card_numbering`) |
| TrustTypeRadio | violet | 동일 그룹 |
| AutoSuggestBadge | emerald + dashed border | 자동 제안 |
| "현재값 ≠ 제안값" 경고 | amber | 주의 |
| disabled disabledReason | gray-400 + tooltip | 비활성 |

## 6. 접근성 / 인쇄

- 모든 체크박스·라디오 키보드 접근 (`ToggleCard`·`RadioCardGroup` 기본 보장)
- AutoSuggestBadge 산식 펼침 — `[[print-only-css-toggle]]` 패턴 (인쇄 시 자동 펼침)
- TrustTypeRadio·DeemedInheritanceCard — `aria-label` 명시
- 안내 카드(§10 1~6호 제외 항목 등) — `<aside role="note">` 시맨틱

## 7. 사용자 시나리오 (대표 3건)

### 시나리오 A — 단순 (R1만)
1. Step1에서 예금 5천만 입력 → §22 체크박스 default ON (배지 "기본 적용")
2. 부동산 10억 입력 → §22 체크박스 default OFF
3. Step4 진입 → 순 금융재산 AutoSuggestBadge "5천만원 (예금 1건)" → "채우기" 클릭

### 시나리오 B — 신탁 (R3 + R1 override)
1. Step1에서 "신탁재산 추가" 클릭 → 신탁 카드 생성, deemedCategory="trust", trustType=undefined
2. TrustTypeRadio "금전신탁" 선택 → trustType="cash_trust" → §22 체크박스 자동 ON (배지 "기본 적용")
3. 평가액 3억 입력
4. Step4 진입 → 순 금융재산 AutoSuggestBadge "3억원 (신탁 1건)"

### 시나리오 C — 채무 차감 (R2)
1. Step2 부채 협의분할 모드 ON
2. 은행 대출 5천만 (financial 카테고리) 입력 → §22 차감 체크박스 default ON
3. 사적 차용 1천만 (personal) 입력 → §22 차감 체크박스 disabled + 안내
4. Step4 → 순 금융재산 = 자산합 − 5천만 (사적 차용 제외)

## 8. 유효성 검증

| 케이스 | 검증 | 동작 |
|---|---|---|
| deemedCategory="trust" + trustType=undefined | 경고 (차단 아님) | UI 배지 "신탁 유형 미선택 — §22 미적용으로 처리" |
| isFinancialAssetForDeduction=true + 평가액=0 | 경고 | "평가액 미입력 자산은 §22 합계에 포함되지 않음" |
| debtItems 모두 disabled + netFinancialAssets 자동값 음수 | 차단 안 함 (`Math.max(0, ...)`) | "순 금융재산이 음수 — 0원으로 처리" 안내 |
| legacy debts 문자열 모드 | 안내 | "협의분할 모드 전환 시 §22 차감 적용 가능" 카드 |

## 9. 다크모드

모든 카드 tone에 다크모드 변형 적용:
- emerald: `dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200`
- rose: `dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-200`
- violet: `dark:bg-violet-950/30 dark:border-violet-800 dark:text-violet-200`
- amber 경고: `dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200`

정적 매핑 객체 (`[[feedback_tailwind_static_tone_mapping]]`) 강제 — dynamic class 금지.

## 10. 사이드바 합계 (옵션)

`InheritanceSidebar`에 R3 간주상속재산 합계 분리 표시:

```
─ 상속재산 ─
본래상속재산 ……… 1,200,000,000
간주상속재산
  보험금 ………… 200,000,000
  신탁재산 ……… 300,000,000
  퇴직금 ………… 50,000,000
추정상속재산 …… 100,000,000
─────────────
합계 ………… 1,850,000,000
```

0원 항목 미표시 (`[[tax-summary-sidebar-pattern]]`).

## 11. 테스트 시나리오 매트릭스

본 디자인 §1 케이스 매트릭스가 anchor 표와 1:1 매핑. `__tests__/lib/calc/financial-deduction-resolver.test.ts` + `__tests__/lib/calc/inheritance-deduction-suggest.test.ts` 외에 UI 통합 테스트(`__tests__/components/calc/inheritance/`)는 후속 PR로 분리.

## 12. Pre-Do anchor (우선 실행)

계획서 §8 Pre-Do anchor 3건 유지:
- FDR-7·FDR-7b (trustType 의존성 검증)
- ADS-2·ADS-2b (사적채무 override 불가 검증)
- ADS-7 (사전증여 공제 엔진 헬퍼 호환)

실패 시 디자인 환류 — 본 문서 §1 케이스 매트릭스·§2 컴포넌트 시그니처 갱신.

## 13. 범위 외 (후속 PR)

계획서 §11 동기화:
- 영농상속재산가액 자동화 (AssetCategory 확장 선행)
- 동거주택 라디오 → `isCohabitHouse?: boolean` 자동화 (Phase B)
- 직접 입력(Phase E) 자동 토글
- 결과 화면 "📊 자동 도출" 출처 배지
- 보험금 평가 특례 (§4②·상증령 §4) UI
- 신탁수익권 §65 평가 분기
