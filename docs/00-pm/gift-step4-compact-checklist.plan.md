# 증여세 Step4(공제·세액공제) 컴팩트 칩 체크리스트 전환 계획서

> 작성일: 2026-06-19 · worktree `feat/gift-step4-compact-layout` · 대상: 증여세 4단계 "공제·세액공제"
> 성격: **순수 UI 레이아웃 재구성** — 폼 필드·엔진·API·validation 무변경(데이터 흐름 동일)

## 1. 목표 / 문제

증여세 Step4(공제·세액공제)는 모든 입력 섹션이 세로로 펼쳐져 쌓여(이미지10) **스크롤을 끝까지 내려야 항목을 파악**할 수 있다. 이미지9(비과세 Step3 = `ExemptionChecklist`)처럼 **상단 칩 그리드로 항목을 한눈에 보고, 선택한 항목만 입력란이 펼쳐지는** 형식으로 전환한다.

## 2. 현황 (실측 — `gift-tax-form-shared.tsx:544-756` `Step3`)

`GiftTaxForm.tsx:237` → `{step === 3 && <Step3 form set />}` (UI 4단계 = 컴포넌트 `Step3`). 현재 7개 섹션 전부 인라인 펼침:

| # | 섹션 | 라인 | 폼 필드 | 현재 형태 | 활성 조건 |
|---|---|---|---|---|---|
| ① | 혼인·출산 공제 §53의2 | 558-589 | `marriageExemption`·`birthExemption`·`priorUsedMarriageBirthDeduction` | 조건부 `<div>` 3입력 | `donorRelation` 직계존속만 |
| ② | 10년 내 기사용 공제 | 591-598 | `priorUsedDeduction` | 항상 노출 CurrencyInput | 항상 |
| ③ | 감정평가수수료 §55①·령§46의2 | 600-607 | `appraisalRealEstateFee`·`appraisalUnlistedFee`·`appraisalUnlistedTargetCount`·`appraisalUnlistedAgencyCount`·`appraisalTangibleFee` | `AppraisalFeeSection`(1·2·3호 서브) | 항상 노출(내부 hint) |
| ④ | 신고세액공제 §69 3% | 609-616 | `isFiledOnTime` | ToggleCard(**기본 ON**) | 항상 |
| ⑤ | 외국납부세액 §59 | 618-625 | `foreignTaxPaid` | 항상 노출 CurrencyInput | 항상 |
| ⑥ | 조특법 과세특례 §30의5/§30의6 | 627-730 | `specialTreatment`(라디오) + 종속: `giftItems/stockItems[*].isSpecialTreatmentAsset`·`startupInvestmentCompleted`·`startupNewHiresAtLeast10`·`familyBusinessYears` | RadioCardGroup + 4개 종속 블록 | 항상(라디오), 종속은 선택 시 |
| ⑦ | 분납 신청 §70② | 732-753 | `splitPaymentEnabled`·`splitPaymentAmount` | ToggleCard + children 펼침 | 항상 |

→ `Step3` 함수 212줄. 전체 파일 756줄(Step0~3 통합).

## 3. 재사용 패턴 (이미 존재 — 신규 발명 불필요)

- **상속세 Step4**가 동일 문제를 칩 체크리스트로 해결: `inheritance/Step4DeductionChecklist.tsx`(칩 그리드 자동/수동) + `inheritance/Step4Deductions.tsx`(칩 상태 → 입력 섹션 게이트) + `lib/calc/inheritance-deduction-checklist.ts`(`isManualItemActive`·`manualItemHasValue`: **체크 OR 값있음** 게이트).
- **비과세 Step3**(이미지9): `ExemptionChecklistPanel`(칩 그리드) + `ExemptionGroupSection`(체크 항목만 접이식 입력). 칩 클릭 → `onGroupOpen()` 직접 호출(useEffect 금지), 값 보존.

증여 Step4는 이 두 패턴을 조합해 **이질적 필드(금액·토글·라디오)를 칩으로 통합**한다.

## 4. 설계

### 4-1. "공제·세액공제 항목 선택" 칩 패널 (상단)
이미지9처럼 카드 안 칩 그리드. 각 칩 = 공제/세액공제 항목. 칩 클릭 시 해당 입력 블록이 아래에 펼쳐짐(체크=활성, 재클릭=접힘·값 보존).

**칩 항목 매핑(권장)**:

| 칩 | 라벨 | active 판정(mirror — useEffect 금지) | 펼침 입력(기존 컴포넌트 재사용) |
|---|---|---|---|
| 혼인·출산 | 혼인·출산 공제 (§53의2) | 직계존속일 때만 칩 노출 + (값있음 OR 체크) | 기존 3 CurrencyInput |
| 기사용공제 | 10년 내 기사용 공제 | 값있음 OR 체크 | `priorUsedDeduction` 입력 |
| 감정수수료 | 감정평가수수료 (§55①) | 값있음 OR 체크 | `AppraisalFeeSection` |
| 외국납부 | 외국납부세액 (§59) | 값있음 OR 체크 | `foreignTaxPaid` 입력 |
| 조특특례 | 조특법 과세특례 (§30의5·6) | `specialTreatment !== ""` OR 체크 | RadioCardGroup + 종속 4블록(귀속자산·창업토글2·가업기간) |
| 분납 | 분납 신청 (§70②) | `splitPaymentEnabled` | 분납 희망액 입력 |

**칩 밖 항상 노출(결정 A)**: 신고세액공제(§69 3%, 기본 ON `isFiledOnTime`)는 칩에 넣지 않고 패널과 별도로 ToggleCard 상시 노출 — 기본 적용 공제 누락 방지.

**칩 2그룹(결정 3)**:
- **공제** (혼인·출산 §53의2 · 10년 내 기사용 · 감정평가수수료 §55①)
- **세액공제·특례·납부** (외국납부세액 §59 · 조특법 과세특례 §30의5·6 · 분납 §70②) — 분납은 엄밀히 납부방법이나 2그룹 구조상 후자에 배치

- **active 판정 단일 헬퍼**: `lib/calc/gift-credit-checklist.ts`(신규) — `isCreditItemActive(slice, key, manuallyOpenSet)` = `manuallyOpenSet.has(key) || hasValue(slice,key) || isToggleOn(slice,key) || (key==="조특특례" && slice.specialTreatment!=="")`. 상속세 `isManualItemActive` 패턴 차용. **값있는/켜진/특례선택 항목은 항상 active**(스크롤 줄이되 입력값 숨김으로 인한 누락 0).
  - **[O2] 의존 방향**: 헬퍼는 full `FormState`가 아니라 **narrow `GiftCreditFormSlice`**(혼인·출산·기사용·감정수수료·외국납부·specialTreatment·분납 필드만)를 받는다 — 상속세 `ChecklistFormSlice`(`inheritance-deduction-checklist.ts:57`)와 동일하게 lib→component 역참조 회피.
  - **[C1] validation 모순 차단 필수조건**: active 판정에 **trigger 필드 전부**(`specialTreatment !== ""`, `priorUsedMarriageBirthDeduction` 값, `familyBusinessYears` 값, boolean 토글)를 포함해야 — validateStep Step3가 차단하는 필드(§6)는 항상 펼쳐져 사용자가 수정 가능. 금액 `hasValue`만으론 불충분.
- **확장 상태**: 로컬 `useState<Set<string>>`(수동 펼침) — 칩 클릭 시 toggle. 값있음/토글ON은 자동 active. (zustand 미러링 금지.)
- 칩 미체크(값 없음)면 입력 블록 미렌더 → 기본 스크롤 대폭 감소.

### 4-2. 조건부 칩 — 혼인·출산
`donorRelation` 직계존속(`lineal_ascendant_adult|minor`)일 때만 칩 목록에 포함(현행 조건부 렌더 유지). 그 외 공여자는 칩 자체 미노출.

### 4-3. 신고세액공제(§69, 기본 ON) — **결정 A 확정**: 칩 밖 ToggleCard 상시 노출
3% 세액공제는 기본 적용(`isFiledOnTime: true` 초기값, line 110). 칩에 숨기면 OFF 오인·누락 위험 → 칩 패널과 별도로 ToggleCard 상시 노출(기본 ON 유지).

### 4-4. 컴포넌트 분리(800줄)
`Step3`(212줄) + 신규 칩 패널 → `gift-tax-form-shared.tsx`(756줄)에서 **`components/calc/gift/GiftCreditChecklist.tsx`(또는 Step4Credits)로 추출**. 칩 패널 + 입력 블록 게이트. shared 파일은 `<Step3>`에서 이 컴포넌트만 렌더.

## 5. 변경 파일

| 파일 | 작업 |
|---|---|
| `components/calc/gift/GiftCreditChecklist.tsx` (신규) | 칩 패널 + active 게이트 입력 블록 (기존 섹션 JSX 이관) |
| `lib/calc/gift-credit-checklist.ts` (신규) | `CREDIT_ITEMS` 메타(id·group·label·lawRef) + `GiftCreditFormSlice`(narrow) + `isCreditItemActive`/`creditItemHasValue` (상속세 `ChecklistFormSlice` 패턴 — lib→component 역참조 회피) |
| `components/calc/gift-tax-form-shared.tsx` | `Step3`을 `<GiftCreditChecklist form set />` 호출로 축소 |
| (재사용) `AppraisalFeeSection`·`SpecialTreatmentAssetSelector`·`ToggleCard`·`RadioCardGroup` | 그대로 펼침 블록으로 |

## 6. 동기화 지점

**순수 UI 재배치 — 폼 필드·엔진 input·API·validation 무변경**. 8/14 지점 대부분 N/A.
- ⑤ UI 위젯: 칩 패널 + 게이트. **값 보존**(접힘≠삭제).
- ⑧ validation: **실측 완료** — gift `validateStep`(`gift-tax-form-shared.tsx:237`) Step 3 차단 규칙: ⒜ 혼인·출산 `priorUsedMarriageBirthDeduction ≥ 0`, ⒝ `specialTreatment !== ""` 시 귀속자산 전수선택·카테고리 적격, ⒞ family_business 시 `familyBusinessYears ≥ 0`. → **active 모델이 이 trigger 필드(specialTreatment·priorUsedMarriageBirthDeduction·familyBusinessYears)를 모두 auto-show**하므로 "안 보이는 입력 차단" 모순 없음(§4-1 C1 필수조건 준수 시).
- 폼 필드/엔진/결과 무변경.

## 7. 검증 / E2E (Pre-Do anchor 우선)

- **회귀 anchor**: 기존 gift 계산 테스트(공제·특례·분납·신고세액)는 폼 필드 무변경이라 **계산 결과 동일**해야 함 → 전체 vitest 회귀 0.
- **컴포넌트 테스트**: Step4 렌더 → 칩 그리드 노출, 미체크 시 입력 블록 미렌더, 칩 체크 → 입력 노출, 값 입력 후 접기 → 값 보존(재펼침 시 유지). 직계존속 아닐 때 혼인·출산 칩 미노출.
- **E2E**(worktree `E2E_PORT=3102`): 증여 Step4 진입 → 칩 클릭 → 입력 펼침 → 계산까지. 신고세액공제 default-ON 유지 확인.
- 정책: `feedback_pre_anchor_verification`·`mirror-pattern`(useEffect 미러링 금지)·`feedback_three_state_optional_mode_toggle`.

## 8. 위험 / 함정

- **값 보존**: 칩 접힘 시 폼 값 유지(삭제 금지). active=값있음이면 자동 노출되어 "숨겨진 값" 0. (비과세 칩과 동일 원칙.)
- **신고세액공제 누락 방지**: 기본 ON 3% 공제가 칩에 묻혀 OFF로 오인되지 않게(§4-3 결정).
- **조특법 특례 종속 초기화**: 라디오 변경 시 종속 필드 reset 로직(현행 636-656)을 칩 펼침 블록으로 이관 시 보존.
- **mirror-pattern**: active 판정은 derive(useMemo)·로컬 useState만. `useEffect→store` 금지.
- **800줄**: 추출로 shared 파일 축소.
- **상속세 Step4와 공용화 유혹**: 필드 성격이 달라 무리한 공통화 금지 — 시각 패턴만 차용, gift 전용 메타.

## 9. 결정 확정 (사용자)

1. **신고세액공제(§69 기본 ON)**: **(A) 칩 밖 항상 노출 토글 유지** ✓
2. **②기사용·⑤외국납부**: **칩화** ✓
3. **칩 그룹**: **공제 vs 세액공제·특례 2그룹 분리** ✓ (§4-1 그룹 구조 참조)

## 9.5 자체 검토 정정 이력 (2026-06-19, 실측 기반)
- **검증 정확**: Step3 위치·7섹션·필드·라인 / `isFiledOnTime:true`(line 110) / `isManualItemActive`(`inheritance-deduction-checklist.ts:195`)·`ChecklistFormSlice`(:57) / `FormState` export(:42).
- **O1**[중]: validateStep Step3 차단 규칙 실측(혼인·출산·조특·가업기간) → §6·§8 "확인 필요" → "확인 완료" 승격.
- **O2**[중]: lib 헬퍼는 narrow `GiftCreditFormSlice` 사용(상속세 `ChecklistFormSlice` 패턴) → lib→component 역참조 회피. §4-1 명시.
- **O3**[경]: 신고세액공제 칩 표 "결정 필요" 잔존 → 결정 A(칩 밖 상시) 반영.
- **C1**[중]: 칩 접힘↔validation 모순은 active 판정에 trigger 필드(specialTreatment·priorUsedMarriageBirthDeduction·familyBusinessYears·토글) 전부 포함 시에만 해소 → 필수조건 명문화.

## 10. 범위 외

- 공제/세액공제 **계산 로직·엔진** 변경(레이아웃만).
- 다른 세목 Step4.
