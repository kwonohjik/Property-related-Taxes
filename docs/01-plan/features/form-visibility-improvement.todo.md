# 입력폼 가시성 개선 — TODO

> 계획서: `docs/01-plan/form-visibility-improvement.plan.md`
> 설계서: `docs/02-design/features/form-visibility-improvement.design.md`
> 컴포넌트 명세: `docs/02-design/features/form-visibility-improvement.components.md`
> 작성일: 2026-04-25
> 담당: 프론트엔드 (frontend-architect / 사용자 검토)

---

## 진행 상태 범례

| 기호 | 상태 |
| ---- | ---- |
| `[ ]` | 미시작 |
| `[~]` | 진행 중 |
| `[x]` | 완료 |
| `[!]` | 차단 / 검토 필요 |

---

## 작업 합산 요약

| Phase | 항목 수 | 신규 파일 | 수정 파일 | 신규 테스트 | 예상 시간 |
| ----- | ------- | --------- | --------- | ----------- | --------- |
| P1 공용 컴포넌트 신설 | 7 | 3 | 2 | 1 | 0.5일 |
| P2 양도세 마법사 적용 | 13 | 0 | 8 | 1 | 1일 |
| P3 검증·QA | 10 | 0 | 0 | 0 | 0.5일 |
| P4 문서·런치 | 3 | 0 | 2 | 0 | 0.2일 |
| **합계** | **33** | **3** | **12** | **2** | **2.2일** |

---

## Phase P1 — 공용 컴포넌트 신설

### P1-A `FieldCard` 컴포넌트

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-01 | `FieldCardProps` 타입 11종 정의 (label·required·children·hint·warning·trailing·unit·badge·disabled·className·htmlFor) | `components/calc/inputs/FieldCard.tsx` | - | tsc 통과 + components.md §1.2와 100% 일치 |
| `[x]` | P1-02 | DOM 구조 구현 (`grid sm:grid-cols-[120px_1fr]` + 라벨/입력 슬롯 + warning/hint 분리) | `components/calc/inputs/FieldCard.tsx` | P1-01 | components.md §1.4 DOM과 일치 |
| `[x]` | P1-03 | `trailing` vs `unit` 우선순위 분기 (trailing 있으면 unit 무시) | `components/calc/inputs/FieldCard.tsx` | P1-02 | 둘 다 전달 시 trailing만 표시 |
| `[x]` | P1-04 | `disabled` 상태 시 `opacity-60` + `data-disabled` 속성 | `components/calc/inputs/FieldCard.tsx` | P1-02 | 시각 회귀 점검 통과 |
| `[x]` | P1-05 | 모바일/데스크톱 분기 검증 (sm 이하 vertical, sm 이상 horizontal) | `components/calc/inputs/FieldCard.tsx` | P1-02 | 375px / 768px 뷰포트 OK |

### P1-B `SectionHeader` 컴포넌트

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-06 | `SectionHeaderProps` 5종 정의 + DOM 구현 (title·description·action·leading·className) | `components/calc/shared/SectionHeader.tsx` | - | components.md §2와 일치, ~35줄 |

### P1-C `WizardSidebar` 컴포넌트

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-07 | `WizardSidebarStep` / `WizardSidebarSummaryItem` / `WizardSidebarProps` 타입 export | `components/calc/shared/WizardSidebar.tsx` | - | components.md §3.2와 일치 |
| `[x]` | P1-08 | 외곽 `<aside>` + `hidden lg:block lg:sticky lg:top-20` + `forceShow` 분기 | `components/calc/shared/WizardSidebar.tsx` | P1-07 | lg 미만 시 DOM 미렌더 (또는 hidden) |
| `[x]` | P1-09 | `StepRow` helper — active/done/todo 3분기 + `aria-current="step"` + `<button>`/`<div>` 분기 | `components/calc/shared/WizardSidebar.tsx` | P1-08 | 클릭 시 `onClick` 호출, 키보드 포커스링 |
| `[x]` | P1-10 | `SummaryRow` helper — number→콤마+원, string→그대로, null→`—`, highlight 시 border-t + primary | `components/calc/shared/WizardSidebar.tsx` | P1-08 | 4가지 입력 케이스 시각 OK |

### P1-D `CurrencyInput` 호환

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-11 | `CurrencyInputProps`에 `hideUnit?: boolean` 추가 (default false) | `components/calc/inputs/CurrencyInput.tsx` | - | 기존 호출부 무영향 |
| `[x]` | P1-12 | `hideUnit` true 시 우측 `원` span 미렌더 + `pr-8` → `pr-3` | `components/calc/inputs/CurrencyInput.tsx` | P1-11 | 카드 모드에서 단위 중복 없음 |

### P1-E selector — 양도세 요약

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-13 | `useTransferSummary()` selector — assets reduce로 sale·acq·expense 합산 + result.totalTax | `lib/stores/calc-wizard-store.ts` | - | 스키마 변경 0건 |
| `[x]` | P1-14 | selector 단위 테스트 (자산 0건/3건 합산/result null 케이스) | `__tests__/stores/use-transfer-summary.test.ts` | P1-13 | 3 cases 통과 |

### P1-F 문서

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-15 | `components/calc/CLAUDE.md` 에 카드 모드 패턴 + FieldCard·SectionHeader·WizardSidebar 사용 예시 추가 | `components/calc/CLAUDE.md` | P1-05, P1-06, P1-10 | 후속 PR이 참조 가능한 가이드 |

**Phase P1 commit**: `feat(ui): FieldCard·SectionHeader·WizardSidebar 공용 컴포넌트 추가 + CurrencyInput hideUnit prop`

---

## Phase P2 — 양도세 마법사 적용

### P2-A 페이지 레이아웃

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-01 | `STEP_LABELS` 상수 5종 정의 (기본사항/취득상세/보유상황/감면·공제/가산세) | `app/calc/transfer-tax/TransferTaxCalculator.tsx` | - | StepIndicator·sidebar 양쪽에서 동일 배열 사용 |
| `[x]` | P2-02 | `sidebarSteps` 계산 (i<current→done, i===current→active, i>current→todo, onClick=handleStepClick) | `app/calc/transfer-tax/TransferTaxCalculator.tsx` | P2-01 | 5단계 모두 매핑 |
| `[x]` | P2-03 | `sidebarSummary` 매핑 (`useTransferSummary` 결과 → `WizardSidebarSummaryItem[]` 5종) | `app/calc/transfer-tax/TransferTaxCalculator.tsx` | P1-13, P2-02 | 납부할 세액 highlight: true |
| `[x]` | P2-04 | 페이지 그리드 변경: `lg:grid lg:grid-cols-[18rem_1fr] lg:gap-8` + `<WizardSidebar>` 좌측 + `<main>` 우측 | `app/calc/transfer-tax/TransferTaxCalculator.tsx` | P2-03, P1-08 | lg+ 사이드바 표시, max-w-6xl |
| `[x]` | P2-05 | StepIndicator를 `<div className="lg:hidden">` 으로 감싸 모바일 전용 강등 | `app/calc/transfer-tax/TransferTaxCalculator.tsx` | P2-04 | lg+에서 상단 진행바 숨김 |

**P2-A commit**: `refactor(transfer): TransferTaxCalculator 사이드바 레이아웃 도입`

### P2-B Step 본문 카드화

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-06 | Step1 — `<SectionHeader title="기본정보">` + 양도일/신고일을 `FieldCard`로 (warning·hint 슬롯 활용) | `app/calc/transfer-tax/steps/Step1.tsx` | P1-02, P1-06 | 신고기한 경고 warning 슬롯에 정상 표시 |
| `[x]` | P2-07 | Step1 — 일괄양도 토글을 `<SectionHeader title="양도자산 구성">` 아래로 이동, `CompanionAssetsSection` 외곽은 유지 | `app/calc/transfer-tax/steps/Step1.tsx` | P2-06 | 자산 카드 내부는 변경 없음 |
| `[x]` | P2-08 | Step1 — 일괄양도 활성 시 `총 양도가액` `CurrencyInput` → `<FieldCard label="총 양도가액" required unit="원">` + `hideUnit` | `app/calc/transfer-tax/steps/Step1.tsx` | P1-12, P2-07 | 단위 중복 없음 |
| `[x]` | P2-09 | Step3 (취득 상세) — 환산취득가·감정가·신축·증축 입력을 lg:grid-cols-2 + `FieldCard`로 | `app/calc/transfer-tax/steps/Step3.tsx` | P1-02 | 자산 N개 반복 시에도 카드 정렬 정상 |
| `[x]` | P2-10 | Step4 (보유 상황) — NBL/다주택/합가 3섹션을 `SectionHeader` 3개로 분리 | `app/calc/transfer-tax/steps/Step4.tsx` | P1-06 | 섹션 시각 구분 명확 |
| `[x]` | P2-11 | Step4 — `step4-sections/*` 내부 입력 필드를 `FieldCard`로 (가능한 것만, props mismatch는 후속) | `app/calc/transfer-tax/steps/step4-sections/*` | P2-10 | 800줄 정책 위반 없음 |
| `[x]` | P2-12 | Step5 (감면·공제) — 자산별 감면 체크박스 그룹을 `<FieldCard label="감면 항목" badge={`자산 ${i+1}`}>` 으로 래핑 | `app/calc/transfer-tax/steps/Step5.tsx` | P1-02 | badge 슬롯 정상 |
| `[x]` | P2-13 | Step6 (가산세) — 단건 모드 한정 `FieldCard` 적용 (무신고/지연납부 입력) | `app/calc/transfer-tax/steps/Step6.tsx` | P1-02 | 다건 모드는 비노출 유지 |

**P2-B commits**: 각 Step별 분리 (`refactor(transfer): Step{N} 입력 카드화`)

### P2-C 검증

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-14 | `npm run build` 무경고 (Turbopack) | - | P2-13 | exit 0 |
| `[x]` | P2-15 | 800줄 정책 위반 없음 (PostToolUse hook 경고 0건) | 변경 파일 전체 | P2-13 | hook silent |

**Phase P2 최종 commit (선택)**: `refactor(transfer): 양도세 마법사 가시성 개선 적용 완료`

---

## Phase P3 — 시각·기능 회귀 검증

### P3-A 자동 회귀

| 상태 | ID | 작업 | 명령 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P3-01 | vitest 전체 회귀 (80 파일 / 1,484 cases) | `npm test` | P2-15 | 0 실패 |
| `[x]` | P3-02 | ESLint | `npm run lint` | P2-15 | 0 경고 |
| `[x]` | P3-03 | Production build | `npm run build` | P2-15 | exit 0, 신규 경고 0 |

### P3-B 데스크톱 시각 점검 (1440×900)

| 상태 | ID | 점검 항목 | 의존 | 결과 |
| ---- | -- | --------- | ---- | ---- |
| `[ ]` | P3-04 | 좌측 사이드바 노출 + sticky 동작 (스크롤 시 따라옴) | P3-03 | OK / 이슈 |
| `[ ]` | P3-05 | 본문 max-w-3xl 그리드 정상 / lg:grid-cols-2 카드 좌우 배치 | P3-04 | 〃 |
| `[ ]` | P3-06 | `FieldCard` 라벨 좌측 120px 고정 / 입력 우측 가변 / 단위 우측 정렬 | P3-04 | 〃 |
| `[ ]` | P3-07 | 사이드바 합계가 자산 입력 변경 시 즉시 갱신 (rerender 즉시성) | P3-04 | 〃 |
| `[ ]` | P3-08 | 활성 단계 `bg-primary text-primary-foreground` / 완료 단계 ✓ 표시 / todo 단계 muted | P3-04 | 〃 |

### P3-C 노트북 (1366×768) 점검

| 상태 | ID | 점검 항목 | 의존 | 결과 |
| ---- | -- | --------- | ---- | ---- |
| `[ ]` | P3-09 | 사이드바 288px + 본문 max-w-3xl(768px) + gap 32px = 1088px ≤ 1366px → 가독성 OK | P3-04 | 〃 |

### P3-D 모바일 (375×667) 점검

| 상태 | ID | 점검 항목 | 의존 | 결과 |
| ---- | -- | --------- | ---- | ---- |
| `[ ]` | P3-10 | 사이드바 숨김 + 상단 StepIndicator 노출 / 카드 vertical (라벨 위·입력 아래) / lg:grid-cols-2 → 1-col | P3-04 | 〃 |

### P3-E 접근성

| 상태 | ID | 점검 항목 | 의존 | 결과 |
| ---- | -- | --------- | ---- | ---- |
| `[ ]` | P3-11 | Tab 순회 — 사이드바 단계 → 본문 입력 자연스러운 순서 | P3-04 | 〃 |
| `[ ]` | P3-12 | `aria-current="step"` 활성 단계에 부착 / `<nav aria-label>` / `<aside>` 사용 | P3-04 | 〃 |
| `[ ]` | P3-13 | Lighthouse 접근성 점수 ≥95 (양도세 마법사 페이지) | P3-04 | 점수 기록 |

---

## Phase P4 — 문서·런치

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[ ]` | P4-01 | `components/calc/CLAUDE.md` 최종 업데이트 (P1-15 보완: 카드 모드 사용 통계·예시 코드) | `components/calc/CLAUDE.md` | P3-13 | 후속 세목 작업자가 참조 가능 |
| `[ ]` | P4-02 | 사용자 manual review (홈택스 참조 디자인과 비교 OK 사인) | - | P4-01 | 사용자 LGTM |
| `[ ]` | P4-03 | `docs/04-report/` 에 완료 리포트 작성 (gap 점검 결과·후속 PR 목록) | `docs/04-report/form-visibility-improvement.report.md` | P4-02 | bkit gap-detector 90%+ |

---

## 작업 의존 그래프 (요약)

```
P1-01 ─┬─ P1-02 ─┬─ P1-03
       │         ├─ P1-04
       │         └─ P1-05
       │
P1-06 ──── (independent)
       │
P1-07 ─── P1-08 ─┬─ P1-09
                 └─ P1-10
       │
P1-11 ─── P1-12
       │
P1-13 ─── P1-14
       │
       └─ P1-15 (P1-05, P1-06, P1-10 후)
            │
            ▼
P2-01 ─ P2-02 ─ P2-03 ─ P2-04 ─ P2-05  (페이지 레이아웃)
                                  │
                                  ▼
P2-06 ─ P2-07 ─ P2-08            (Step1)
P2-09                            (Step3) — 병렬 가능
P2-10 ─ P2-11                    (Step4) — 병렬 가능
P2-12                            (Step5) — 병렬 가능
P2-13                            (Step6) — 병렬 가능
                                  │
                                  ▼
                             P2-14 ─ P2-15
                                  │
                                  ▼
P3-01 ─ P3-02 ─ P3-03 (자동 회귀)
   │
   ▼
P3-04 ─ P3-05/06/07/08 ─ P3-09 ─ P3-10 ─ P3-11/12/13
                                                     │
                                                     ▼
                                                 P4-01 ─ P4-02 ─ P4-03
```

---

## 주의 사항 (계획서·설계서 §6 위험 요소 재명시)

- **`CompanionAssetCard.tsx` (1000줄 근접) 내부는 절대 수정 금지**. 이번 작업에서는 외곽 그룹만 `SectionHeader`로 라벨링.
- **store 스키마 변경 0건**. selector 추가만 허용.
- **`CurrencyInput`/`DateInput` 자체 변경은 P1-11/P1-12 (hideUnit)만 허용**. 그 외는 외부 래핑으로 해결.
- 800줄 초과 PostToolUse hook 경고 발생 시 **즉시 분할** 후 진행.
- 사이드바의 "납부할 세액"은 `transferResult` 가 있을 때만 숫자로 표시. 미계산 시 `—` (사용자 혼동 방지 — 계획서 §6).

---

## 후속 작업 (본 PR 범위 밖)

각 항목은 본 todo 완료 후 **별도 todo 파일**로 작성:

- 취득세 마법사(`components/calc/acquisition/`) — Step0/Step1
- 재산세 마법사(`components/calc/property/`) — Step0~3 (현재 진행 중인 UI 작업과 병합 검토)
- 종합부동산세 — Step0~N
- 상속·증여세 (`InheritanceTaxForm.tsx`·`GiftTaxForm.tsx`) — 단일 폼 → SectionHeader 위주
- `CompanionAssetCard.tsx` 내부 카드화 + 800줄 정책 정상화 — 별도 리팩터링 PR

---

## 변경 이력

| 일자 | 변경 | 비고 |
| ---- | ---- | ---- |
| 2026-04-25 | 최초 작성 | 계획서·설계서 기반 33항목 |
