---
name: pdf-case-replica-workflow
description: 세무 교재·집행기준 PDF 사례를 100% 재현하기 위한 6-커밋 표준 워크플로. Plan → Design(케이스 매트릭스) → Pre-Do anchor → 환류 → Phase A~F 엔진 분리 → Phase H 통합 anchor → Phase G UI(Zod·API·결과 카드·위젯·사이드바·통합)까지. 외부 린터 자동 변경 대응·800줄 정책·1원 tolerance 정책 강제.
trigger: PDF 사례, 사례 재현, 100% 재현, anchor 일치, 교재 사례, 집행기준 사례, 종합사례, PDF replica, case study, anchor matching, 사례 구현, 사례 anchor
---

# pdf-case-replica-workflow — PDF 세무 사례 100% 재현 표준

세무 교재·집행기준·해석례의 PDF 사례를 엔진+UI에서 anchor 단위로 정확히 재현하는 워크플로. 본 프로젝트 상속세 종합사례 (책 1852~1877) 6-커밋 실증 기반.

## 적용 시점

- 세무 교재 PDF 사례 (예: 예제 양도세 사례, 상속세 종합사례) 100% 재현 요구
- 단일 사례가 여러 세법 조문을 교차 (§13·§15·§19·§24·§26·§27·§28·§3의2 등)
- 합계 anchor + 상속인·자산별 anchor 30+ 건 검증 필요
- 신규 엔진 모듈 3개 이상 + UI 위젯 4개 이상 + 마법사 분할

## 6-커밋 표준 구조

### 커밋 1 — 엔진 코어 + Pre-Do anchor

**산출물**:
- `lib/tax-engine/{module-1}.ts` 신규 (단위 기능 §X)
- `lib/tax-engine/{module-2}.ts` 신규 (단위 기능 §Y)
- `lib/tax-engine/{module-3}.ts` 신규 (안분/통합)
- `lib/tax-engine/types/...types.ts` 확장 (신규 타입 5+ 종)
- `__tests__/tax-engine/{tax-type}/fixtures/{case}.fixture.ts` — PDF 사례 입력 상수
- `__tests__/tax-engine/{tax-type}/{case}-pre.test.ts` — Pre-Do anchor 4~6건

**Pre-Do anchor 정책** (`pre-do-anchor-verification` skill 적용):
- 단위 함수 직접 호출 anchor 3~4건 (PRE-1·2·3·4)
- 통합 엔진 호출 anchor 1~2건 (PRE-5·6) — heir별 합계 등
- 실패 시 디자인 환류 우선 (산식·임계·분모 재검토)

### 커밋 2 — Phase H 종합 anchor + Phase D 자동 산식

**산출물**:
- `__tests__/tax-engine/{tax-type}/{case}-pdf.test.ts` — 통합 anchor 50+ 건
  - [A] 자산 평가 / [B] 단위 기능 / [C] 합산 / [D] 차감 / [E] 과세가액
  - [F] 공제 / [G] 산출세액 / [H] 면제 / [I] 상속인별 배부 / [J] 경계값
- 자동 산식 옵트인 패턴 (예: `spouseLegalShareOverride` 미입력 + 컨텍스트 신호 시 자동 발동)
- Zod 스키마 확장 (신규 필드 11+ 종)
- legacy 회귀 0건 보장

### 커밋 3 — Phase G UI 통합 ④⑦⑧⑬⑭

**산출물**:
- `lib/calc/{tax-type}-api.ts` 신규 — callXxxTaxAPI + body spread
- `lib/calc/{tax-type}-validate.ts` 신규 — 5+ validator + 통합 함수
- `components/calc/results/XxxAllocationTable.tsx` — PDF 표 1:1 재현
- `app/api/calc/{tax-type}/route.ts` — Zod parse → 엔진 input 명시적 매핑

### 커밋 4 — Phase G UI 위젯 ①②⑤ + 800줄 분할

**산출물**:
- `components/calc/{tax-type}/shared.ts` — FormState·INITIAL_FORM·STEPS
- `components/calc/{tax-type}/steps.tsx` — Step0~5 분리 (800줄 정책)
- `components/calc/{tax-type}/step4-5.tsx` — Step4·5 추가 분리 (필요 시)
- `components/calc/{tax-type}/XxxAllocationInput.tsx` — 자산-수준 협의분할
- `components/calc/{tax-type}/XxxDebtInput.tsx` — 채무 등 협의분할
- `components/calc/{tax-type}/XxxCategoryInput.tsx` — 카테고리별 카드 (§15 등)
- `XxxTaxForm.tsx` 본체 분리 (818 → 345줄 목표)

### 커밋 5 — Phase G 사이드바 ⑥

**산출물**:
- `lib/stores/{tax-type}-summary.ts` — computeXxxSummary 순수 함수 (4필드 + 보조)
- `components/calc/{tax-type}/XxxSidebar.tsx` — useMemo 래핑
- `__tests__/tax-engine/{tax-type}/{tax-type}-summary.test.ts` — anchor 4건
- `tax-summary-sidebar-pattern` skill 적용

### 커밋 6 — InheritanceTaxForm 사이드바 통합

**산출물**:
- `XxxTaxForm.tsx` grid 레이아웃 1줄 추가 + import 1줄

## 1원 tolerance 정책 (PDF round 비일관성 대응)

PDF 책 안분식이 일관성 없는 round 처리 시 (`bigint-round-half-up` skill 참조):

```ts
// PDF 432,871,250 vs 우리 계산 432,871,249 (1원, PDF 자체 round 오기)
expect(Math.abs(result - 432_871_250)).toBeLessThanOrEqual(1);
```

## 외부 린터 자동 변경 대응

본 프로젝트 경험: InheritanceTaxForm 같은 핵심 마법사 파일은 외부 자동 처리(린터)가 변경을 되돌릴 수 있음.

**대응 전략**:
1. **신규 컴포넌트로 분리** — 메인 폼에 1줄만 추가, 본체는 별도 파일에 보존
2. **분할된 step 함수** — 한 번 분리하면 외부 자동 처리에 영향 받지 않음
3. **shared.ts·steps.tsx 별도 export** — 자동 되돌림 시에도 신규 위젯·로직 보존

## 800줄 정책 강제

| 파일 | 분할 트리거 |
|---|---|
| `XxxTaxForm.tsx` | 600줄 초과 시 — Step 함수들 `steps.tsx`로 추출 |
| `steps.tsx` | 600줄 초과 시 — Step4·5 등 큰 함수만 `step4-5.tsx`로 추가 분리 |
| 엔진 모듈 | 600줄 초과 시 — 단위 기능별 sibling 파일 |

## Phase 분리 명명 규칙

| Phase | 범위 | 예시 |
|---|---|---|
| Phase A | 첫 번째 신규 엔진 모듈 (단위 기능) | §15 추정상속재산 |
| Phase B | 두 번째 신규 엔진 모듈 | §3의2② 영리법인 면제 |
| Phase C | 안분/배부 모듈 (가장 큰 신규) | 상속인별 배부 |
| Phase D | 기존 엔진 시그니처 확장 (옵트인) | 배우자공제 §19 자동 산식 |
| Phase E | 직접 입력 모드 (요건 판정 생략) | 가업·동거 직접 입력 |
| Phase F | 기존 엔진 분모/분자 보정 | 세대생략 §27 분모 |
| Phase G | UI 통합 (14지점) | API·validate·결과 카드·위젯·사이드바 |
| Phase H | 종합 anchor (50+) | PDF 모든 산식·중간값 검증 |

## 케이스 매트릭스 — Design 문서 강제

Plan/Design 단계에서 모든 분기를 사전 enumerate (메모리 `feedback_design_law_cases`):

| ID | 케이스 | 입력 단서 | 기대 동작 | 법령 |
|---|---|---|---|---|
| C1 | 본래상속재산 — 예금 | `EstateItem(financial, ...)` | grossEstate += ... | §60 |
| ... | (10~30 행) | | | |
| C26 | 상속인별 배부 통합 | (모든 입력 합산) | PDF 자진납부세액 일치 | §3·§28 |

행이 1개 미만이면 Do 진입 금지.

## anchor 작성 체크리스트

- [ ] PDF 표 모든 수치를 사전 손계산 (외부 자료 추종 금지 — `feedback_transfer_year_tax_rate`)
- [ ] 누진공제·세율표 정확값 사용 (메모리 `feedback_progressive_deduction_accuracy`)
- [ ] 안분 산식은 `bigint-round-half-up` 헬퍼
- [ ] 1원 차이 발견 시 명시적 결정 (tolerance vs 정정)
- [ ] cross-cutting anchor (재산정 시 모든 분기 영향 확인)

## 모호 사항 처리 5범주

작업 중 발견되는 모호 사항을 Plan §6에 사전 분류:

1. **PDF 자체 오기** — 명시적 결정 + 1원 tolerance
2. **법령 인용 차이** — KoreanLaw MCP 검증 (`korean-law-citation-verify` skill)
3. **PDF 명시 안 된 안분** — fixture에서 PDF 결과 표 역산 가정
4. **신규 enum 결정** — Heir·Relation 확장 등 옵션 A·B 명시
5. **PDF 모순 (표 vs 산식)** — 산식 기준 채택 + 표 오기 명시

## 본 프로젝트 실증 (상속세 종합사례)

| 메트릭 | 값 |
|---|---|
| 총 커밋 수 | 6 |
| 신규 엔진 모듈 | 3 (`presumed-inheritance`·`inheritance-corporate-exemption`·`inheritance-allocation`) |
| 신규 타입 | 14 (Heir·EstateItem·PriorGift·InheritanceTaxInput 확장 + 8 신규) |
| 신규 위젯 | 5 (`HeirAllocationInput`·`DebtAllocationInput`·`PresumedInheritanceInput`·`steps`·`step4-5` — step4-5는 이후 steps로 재병합·삭제, 현행 분할은 `Step4Deductions` 등) |
| 신규 모듈 (UI/storage/api) | 6 (`shared.ts`·`InheritanceSidebar`·`HeirAllocationTable`(이후 삭제 — `HeirAllocationSummaryTable`로 일원화)·`inheritance-api.ts`·`inheritance-validate.ts`·`inheritance-summary.ts`) |
| 신규 anchor | 67 (PRE 6 + 통합 57 + summary 4) |
| 전체 회귀 | 0건 (4,043/4,045 통과) |
| InheritanceTaxForm | 818 → 345줄 (800줄 정책 통과) |
| 14 동기화 지점 | 11 완성 / 1 후속(③ normalize) / 2 n/a(⑩⑪ 단건 모드) |

## 다음 사례 적용 시 1줄 호출

```
"sample.pdf 사례를 본 프로젝트 양도세 탭에 100% 재현하세요."
```

→ 본 skill이 자동으로 6-커밋 워크플로 시작 + Plan/Design 매트릭스 강제.
