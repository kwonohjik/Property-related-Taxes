# 상속세 Step4 공제·세액공제 — 체크리스트 선택형 입력 구조 계획

> 작성일 2026-06-13 · 브랜치 `feat/step4-checklist` · dev 포트 3003 / E2E 3103
> 결정: **상단 체크리스트 + 자동 선체크** 방식 (사용자 승인)
> 정책: feedback_three_state_optional_mode_toggle · feedback_useeffect_store_mirror_forbidden · single-source-engine-helper · feedback_result_expand_toggle_standard · feedback_api_zod_schema_sync(클라이언트 8지점)

## 1. 목표 / 배경

현행 Step4(공제·세액공제)는 모든 입력칸이 세로로 펼쳐져 스크롤하며 입력하는 구조 → **누락 위험 + 입력 피로**.

개선안 (사용자 제안 + 보강):
1. **맨 위에 공제 항목 체크리스트 패널** — 전 항목을 그룹별 그리드로 한눈에 조망.
2. **자동 도출형 항목은 시스템이 선(先)체크** — 자산 카드·상속인 구성에서 감지(§19 배우자·§22 금융재산 등). 체크 깜빡임으로 인한 대형 공제 누락을 시스템이 방어.
3. **체크된 항목만 아래 입력 카드 노출**, 카드는 펼침/접힘 가능(표준 토글).
4. 체크 해제 시 입력값은 **보존**(계산에서만 제외, 재체크 시 복구).

**비목표**: 엔진 input/result 타입 변경 없음. 공제 계산 로직 변경 없음. 신고 상태 라디오(C-1)·납부방법 그룹(D)은 체크리스트 대상에서 제외(아래 §3.4).

## 2. 현행 구조 (file:line 검증 완료)

| 사실 | 위치 |
|---|---|
| Step4 본체 — "공제·세액공제 입력 (선택)" 헤더 | `components/calc/inheritance/steps.tsx:398` (Step 컴포넌트 345~716) |
| 4그룹 접이식 래퍼 `Step4DeductionGroup` (defaultOpen=true) | `components/calc/inheritance/Step4DeductionGroup.tsx:58,70` |
| 그룹 A 상속공제(emerald) `step4-group-deduction` | steps.tsx:407~558 |
| 그룹 B 종합한도·재해·감정수수료(amber) `step4-group-adjust` | steps.tsx:561~603 |
| 그룹 C 신고·외국납부·단기재상속(violet) `step4-group-credit` | steps.tsx:606~699 |
| 그룹 D 납부방법(sky) `step4-group-payment` | steps.tsx:702~710 |
| 그룹별 "입력됨" 배지 hasData 도출 | steps.tsx:357~392 (`has = s.trim() !== ""`) |
| 배우자 입력은 `hasSpouse` 게이트로 이미 조건부 렌더 | steps.tsx:354, 413 |
| 자동 제안 배지 (빈칸=제안 대기 / 일치=적용됨 / 불일치=경고) | `components/calc/inheritance/AutoSuggestBadge.tsx:43~159` |
| 자동 도출 단일 출처 — `DeductionSuggestion.isApplicable` | `lib/calc/inheritance-deduction-suggest.ts:35~43` |
| suggest 함수 8종 (Net금융:113 · PriorGift:183 · FamilyBiz:243 · Legatee:276 · Farming:359 · CohabitCand:534 · CohabitStd:582 · Spouse:657) | 동 파일 |
| suggest 호출은 InheritanceTaxForm useMemo → prop 전달 (3중 일치) | steps.tsx:46 주석 |

## 3. 설계

### 3.1 상태 — 3-state override (mirror-pattern 준수의 핵심)

`useEffect → store` 미러링 금지 정책과 "자동 선체크"를 양립시키는 방법:
**체크 상태를 store에 쓰지 않고 파생**한다.

```typescript
// FormState에 단 1개 필드 추가 (shared.ts)
deductionChecklistOverrides: Partial<Record<DeductionItemKey, boolean>>;
// undefined = 자동 감지값을 따름(선체크) / true·false = 사용자 명시 선택

// 표시 체크 상태 (steps.tsx useMemo — store write 없음)
const effectiveChecked = (key) => form.deductionChecklistOverrides[key] ?? autoDetected[key];
```

- 자산 카드를 나중에 수정해도 자동 감지가 **라이브로 추종** (override 없는 항목만).
- INITIAL_FORM: `{}` / normalize fallback: `?? {}` — sessionStorage 구버전 복원 안전.
- 체크박스 클릭 = `set({ deductionChecklistOverrides: {...prev, [key]: next} })` (onChange 직접 write — 정책 적합).
- "자동 감지로 되돌리기"는 해당 key를 delete (undefined 복귀).

### 3.2 자동 감지 소스 (단일 출처 재사용 — 신규 판정 로직 금지)

| 항목 | 감지 = | 출처 |
|---|---|---|
| §19 배우자 | `hasSpouse` (steps.tsx:354와 동일식) | heirs[] |
| §22 금융재산 | `suggestNetFinancialAssets().isApplicable` | suggest.ts:113 |
| §23의2 동거주택 | `deriveCohabitHouseStdPrice().isApplicable` | suggest.ts:582 |
| §18의3 영농 | `suggestFarmingAssetValue().isApplicable` | suggest.ts:359 |
| §18의2 가업 | `suggestFamilyBusinessValue().isApplicable` | suggest.ts:243 |
| §19·§24 상속외자 유증 | `suggestLegateeAmountNonHeir().isApplicable` | suggest.ts:276 |
| §24 사전증여 공제합계 | `suggestPriorGiftDeductionTotal().isApplicable` | suggest.ts:183 |
| 수동형 (외국납부 §29 · 단기재상속 §30 · 재해손실 §23 · §54 분자보정 · 감정평가수수료 §25) | 항상 `false` (빈 체크박스) | — |

- 기존 InheritanceTaxForm useMemo의 suggest 결과를 그대로 내려받아 사용 (재계산 금지 — dual-truth 회피).
- **이미 입력값이 있는 항목**(`hasData` 식과 동일 판정)은 감지와 무관하게 checked 취급 — 기존 세션 복원·이력 불러오기 시 입력칸이 사라지는 회귀 0.
  - `effectiveChecked = override ?? (autoDetected || hasValue)`

### 3.3 체크리스트 패널 UI (`Step4DeductionChecklist.tsx` 신규)

- 위치: "공제·세액공제 입력 (선택)" 헤더 바로 아래, 그룹 카드들 위.
- 그룹 A·B·C의 개별 항목을 **그룹 색조(emerald/amber/violet)별 칩 그리드**로 나열.
- 각 칩: 체크박스 + 라벨(법령 조문 포함) + 상태 배지:
  - `자동 감지` (선체크됨, override 없음) — emerald 점
  - `입력됨` (값 있음) — 기존 hasData 배지와 동일 어휘
  - 미체크 + 감지 가능성 있음(감지 false지만 suggest가 후보 존재 신호) → 회색 + "해당 시 체크"
- ToggleCard 가시성 원칙 준수: 미체크도 tone 배경 유지(`bg-{tone}-50/70`), 체크는 ring·border·title 강조.
- 칩 클릭 = 체크 토글. 칩에서 해당 입력 카드로 스크롤 anchor(선택 구현).

### 3.4 입력 카드 노출 규칙

- **그룹 A·B·C의 공제 항목**: `effectiveChecked`인 항목만 기존 위치(기존 그룹 카드 내부)에 렌더.
  - 그룹 내 체크 항목이 0이면 그룹 카드 자체에 "체크한 항목이 없습니다 — 위 체크리스트에서 선택" 1줄 안내만.
- **체크리스트 제외 (항상 노출)**:
  - C-1 신고 상태 라디오(`isFiledOnTime`/`isUnfiled`) — 공제가 아니라 **모든 신고의 공통 필수 상태**.
  - 그룹 D 납부방법(연부연납·분납·물납) — 이미 ToggleCard 3개가 체크리스트 역할 수행(steps.tsx:702~710). 이중 체크 금지.
  - §23의2 부속 필드(부수토지 면적·정착 면적·지역, A-5~A-7)는 동거주택 항목 체크에 종속 노출.
  - 가업 요건 입력(A-12 `familyBusiness` 3-state 섹션)은 가업 항목 체크에 종속.
- **개별 입력 카드 펼침/접힘**: 그룹 단위 접이식(Step4DeductionGroup)은 유지. 항목-수준 추가 접이식은 **도입하지 않음** — 체크리스트로 미해당 항목이 이미 사라지므로 항목-접기까지 더하면 클릭 깊이만 증가(YAGNI). 단 토글이 필요해지면 `expandToggleClass/Label` 표준 사용(feedback_result_expand_toggle_standard).

### 3.5 값 보존 + API·validation 동기화 (⑧·④ — 모순 금지)

- 체크 해제: 폼 값 **보존**. 단 ④ API 변환(`lib/calc/inheritance-api.ts`)에서 미체크 항목 필드를 **전송 제외**(undefined).
- ⑧ validation(`inheritance-validate.ts`): 미체크 항목의 필드는 검증 skip (UI 미노출 ↔ validate 차단 모순 방지).
- 미체크인데 값이 남아 있으면 체크리스트 칩에 amber 경고 점 — "입력값이 있으나 계산에서 제외됩니다" (침묵 누락 방지 — feedback_silent_omission_full_input_enforcement 정신).
- Zod(⑨~⑭)는 변경 없음 — 필드가 안 가는 것뿐, 스키마 형태 동일.

### 3.6 항목 매트릭스 (체크리스트 대상 12항목)

| key | 라벨 | 그룹 | 자동감지 | 종속 필드 |
|---|---|---|---|---|
| spouse | 배우자 상속공제 §19 | A | hasSpouse | spouseActualAmount |
| financial | 금융재산공제 §22 | A | suggest | netFinancialAssets |
| cohabit | 동거주택공제 §23의2 | A | suggest | cohabitHouseStdPrice·cohabitDirectAmount·ancillaryLandArea·buildingFootprintArea·ancillaryLandRegion |
| farming | 영농상속공제 §18의3 | A | suggest | farmingAssetValue |
| familyBusiness | 가업상속공제 §18의2 | A | suggest | familyBusinessValue·Years·DirectAmount·familyBusiness(요건) |
| legatee | 상속외자 유증 §19·§24 | B | suggest | legateeAmountNonHeir |
| priorGiftDeduction | 사전증여 공제합계 §24 | B | suggest | priorGiftDeductionTotal |
| disasterAdjust | §54 분자 보정 | B | 수동 | disasterLossDeduction |
| casualtyLoss | 재해손실공제 §23 | B | 수동 | casualtyLoss* 5필드 (기존 ToggleCard 흡수 — 체크=기존 casualtyLossEnabled와 통합 검토, §7-2) |
| appraisalFee | 감정평가수수료 §25 | B | 수동 | appraisal*Fee 3필드 |
| foreignTax | 외국납부세액공제 §29 | C | 수동 | foreignTaxPaid·foreignInheritanceTaxBase |
| shortTermReinherit | 단기재상속공제 §30 | C | 수동 | shortTermReinherit* 6필드 |

## 4. 동기화 지점 점검 (클라이언트 8 — 엔진 무변경이므로 ⑨~⑭ 해당 없음)

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 타입 | `deductionChecklistOverrides` 1필드 추가 (shared.ts FormState) |
| ② initial | `{}` |
| ③ normalize | `?? {}` fallback |
| ④ API 변환 | 미체크 항목 필드 전송 제외 (inheritance-api.ts) |
| ⑤ UI 위젯 | Step4DeductionChecklist 신규 + steps.tsx 조건부 렌더 |
| ⑥ 사이드바 | 변경 없음 (공제 합계는 결과 도착 후 — 현행 유지) |
| ⑦ 결과 카드 | 변경 없음 |
| ⑧ validation | 미체크 항목 검증 skip — ④와 동일 게이트 함수 공유 (단일 헬퍼 `isDeductionItemActive(form, key)` 추출, dual-truth 금지) |

## 5. E2E 영향 (14 spec — grep 검증)

`step4-group` 또는 "공제·세액공제" 의존 spec: deduction-breakdown · heir-allocation-table · installment-payment · law-article-badges · payment-in-kind · prior-gift-donee · result-edit-steps · review-summary · section21-unfiled · section22-excluded-badge · special-prior-13 · spouse-deduction-fix · step-status · step4-groups.

- **자동 선체크 덕에 대부분 무수정 통과 예상** — 기존 spec은 자산·배우자를 먼저 입력하므로 §19·§22 등은 선체크되어 입력칸이 그대로 보임. (단정 금지 — Do 단계에서 전체 실행으로 실측)
- **수정 확실**: 수동형 항목을 직접 입력하는 spec — 외국납부(foreign-tax-credit), 단기재상속, casualty-loss(기존 ToggleCard와 통합 시 selector 변경) → 체크 단계 1줄 선행 추가.
- step4-groups.spec(G4G-1·G4G-2)는 그룹 구조 유지로 통과 예상, 체크리스트 패널 신규 검증 추가.
- 신규 E2E: ①선체크(배우자 입력→§19 칩 자동 체크) ②수동 체크→입력칸 노출 ③체크 해제→값 보존+경고 점+API body 제외 ④0항목 그룹 안내문.
- 사전존재 실패 baseline 대조 (feedback_e2e_preexisting_failures · project_inheritance_stale_e2e_specs).

## 6. 구현 순서 (Do)

1. `DeductionItemKey` 타입 + `isDeductionItemActive` 단일 헬퍼 (lib/calc/ — ④⑧ 공유) + ①②③.
2. Pre-Do anchor: 헬퍼 단위테스트 (override 3-state × autoDetected × hasValue 매트릭스 8케이스).
3. `Step4DeductionChecklist.tsx` 신규 (≤800줄, 칩 그리드 + 상태 배지).
4. steps.tsx 조건부 렌더 연결 (그룹 A·B·C 항목 게이트, C-1·그룹 D 불변).
5. ④ API 전송 제외 + ⑧ validation skip (동일 헬퍼).
6. E2E: 기존 14 spec 실행 → 실측 수정 + 신규 4 시나리오.
7. tsc · vitest · 전체 E2E baseline 대조.

## 7. 결정 필요 사항 (착수 전 확인)

1. **체크 해제 시 값 정리**: 보존(권장·§3.5) vs 즉시 초기화(confirm Dialog). → 보존 + 경고 점 권장.
2. **casualtyLoss 기존 ToggleCard와 체크리스트 칩의 관계**: (a) 칩이 `casualtyLossEnabled`를 직접 read/write(양방향 단일 필드 — 권장, 별도 override key 불필요) vs (b) 칩 별도 + ToggleCard 유지(이중 토글 — 비권장).
3. **체크리스트 패널 모바일 레이아웃**: 칩 그리드 2열 vs 1열 스택.
