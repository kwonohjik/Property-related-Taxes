# Design: 비사업용 토지 판정 UI·엔진 완전화

> **Feature ID**: `nbl-ui-completion`
> **작성일**: 2026-04-24
> **Plan**: `docs/01-plan/features/nbl-ui-completion.plan.md`
> **목적**: Plan M1 산출물. 전체 아키텍처 개요 + 하위 설계 문서 인덱스.
> **범위**: `NblDetailSection` 전면 개편 + 지목별 섹션 6종 신규 + 엔진 Gap 6건 해소.

---

## 1. 설계 문서 구성

본 설계는 규모가 커서 3개 파일로 분할. 구현 시 해당 파일을 함께 참조할 것.

| 파일 | 범위 | 주요 섹션 |
|---|---|---|
| `nbl-ui-completion.design.md` (이 파일) | 개요 + 파일 구조 + 마일스톤 매핑 | §2~§5 |
| `nbl-ui-completion.ui.design.md` | UI 컴포넌트·플로우·결과 카드 | 컨테이너, 7섹션, 지목별 필드, 상태 전환 |
| `nbl-ui-completion.engine.design.md` | 타입·매퍼·엔진 Gap·테스트 | TransferFormData 확장, form-mapper, grace-period, co-ownership, livestock-standards |

---

## 2. 파일 구조

```
lib/tax-engine/non-business-land/            (기존 — 일부 수정 + 신규)
├── engine.ts                    (수정) — gracePeriod 반영, villa REDIRECT 자동 재분류
├── types.ts                     (수정) — OwnershipRatio, 면제 케이스 확장
├── period-criteria.ts           (수정) — gracePeriod 가산 로직
├── pasture.ts                   (수정) — 표준면적 상수 import
├── villa-land.ts                (수정) — REDIRECT 후 housing 재호출 훅
├── co-ownership.ts              (신규) — 공동상속 지분 판정
├── grace-period.ts              (신규) — 부득이한 사유 유예기간 계산
├── form-mapper.ts               (신규) — UI flat 필드 ↔ nested Input 변환
└── data/
    └── livestock-standards.ts   (신규) — 축산법 별표2 표준면적

components/calc/transfer/nbl/                (신규 디렉터리 — 10 파일)
├── NblSectionContainer.tsx                  # 통합 컨테이너 (지목 스위처)
├── UnconditionalExemptionSection.tsx        # §168-14③ 7종 체크리스트
├── ResidenceHistorySection.tsx              # 거주 이력 타임라인
├── GracePeriodSection.tsx                   # 부득이한 사유 입력기
├── FarmlandDetailSection.tsx                # 농지 세부
├── ForestDetailSection.tsx                  # 임야 세부
├── PastureDetailSection.tsx                 # 목장 세부
├── HousingLandDetailSection.tsx             # 주택 부속토지 세부
├── VillaLandDetailSection.tsx               # 별장 세부
├── OtherLandDetailSection.tsx               # 나대지 세부
└── shared/
    ├── SigunguSelect.tsx                    # 시군구 자동완성
    └── BusinessUsePeriodsInput.tsx          # 사업용 기간 배열 입력 (재사용)

app/calc/transfer-tax/steps/
├── Step4.tsx                                (수정) — NblDetailSection → NblSectionContainer
└── step4-sections/
    └── NblDetailSection.tsx                 (제거 — 내용을 nbl/ 디렉터리로 이전)

components/calc/results/
└── NonBusinessLandResultCard.tsx            (수정) — 조문 강조·면적 안분 시각화·자연어 요약

lib/stores/
└── calc-wizard-store.ts                     (수정) — TransferFormData 확장 (약 30 필드)

lib/korean-law/
└── sigungu-codes.ts                         (신규) — 행안부 시군구 표준코드 (~250개)

__tests__/tax-engine/non-business-land/
├── grace-period.test.ts                     (신규)
├── co-ownership.test.ts                     (신규)
├── form-mapper.test.ts                      (신규)
└── integration.test.ts                      (신규 — 17 시나리오)

__tests__/ui/
└── nbl-wizard.test.tsx                      (신규)
```

---

## 3. 설계 원칙

### 3.1 하위 호환 (Additive Only)

- `NonBusinessLandInput` 기존 필드 시그니처 변경 없음, 추가만 허용
- 기존 14개 엔진 테스트 100% 통과 필수
- `TransferFormData.isNonBusinessLand` (기존 간단 체크박스) 유지 — `nblUseDetailedJudgment` 플래그로 분기

### 3.2 flat 필드 유지

- `TransferFormData`는 flat 구조(`nbl*` prefix) 유지. zustand persist 직렬화 호환성 + sessionStorage 게스트 마이그레이션 호환
- nested 구조로의 변환은 `lib/tax-engine/non-business-land/form-mapper.ts`에 집중

### 3.3 조건부 렌더링

- 지목 선택에 따라 해당 지목 섹션만 렌더 (탭 대신 조건부 아코디언)
- 무조건 면제 섹션은 지목 선택과 독립적으로 최상단 노출 (적용 시 이후 섹션 음영)

### 3.4 법령 조문 상수

- UI 툴팁·결과 카드 조문 표시는 `lib/tax-engine/legal-codes/transfer.ts`의 `NBL.*` 네임스페이스만 사용
- 문자열 리터럴 직접 사용 금지

---

## 4. 하위 호환 및 API

### 4.1 API 스키마 변경 없음

- `app/api/calc/transfer-tax/route.ts`의 Zod 스키마는 그대로
- UI의 flat 필드는 Orchestrator 진입 직전 `mapFormToNblInput()`으로 변환 후 기존 nested 구조로 전달

### 4.2 데이터 마이그레이션

- zustand persist version 3 → 4 bump
- 기존 사용자 폼은 `migrate` 함수에서 신규 필드 기본값(falsy·빈배열) 주입
- DB 저장 이력(`actions/calculations.ts`)은 최종 결과만 저장하므로 영향 없음

---

## 5. Plan Milestone → Design 매핑

| Plan Milestone | 참조 Design 파일 | 주요 섹션 |
|---|---|---|
| M1 설계 및 타입 계약 | 본 파일 + `.engine.design.md` | 전체 개요, 타입 확장 |
| M2 무조건 면제 + 거주 이력 | `.ui.design.md` §3, §4 | UnconditionalExemptionSection, ResidenceHistorySection |
| M3 지목별 세부 섹션 | `.ui.design.md` §5 | 6개 DetailSection |
| M4 지원 필드 + 플로우 통합 | `.ui.design.md` §6, §7, §10 | NblSectionContainer, GracePeriodSection, 시군구 |
| M5 엔진 Gap 해소 | `.engine.design.md` §3~§7 | grace-period, co-ownership, livestock-standards, REDIRECT, 수도권 |
| M6 결과 표시 강화 | `.ui.design.md` §8 | NonBusinessLandResultCard |
| M7 통합 테스트 + QA | `.engine.design.md` §8 | grace-period·co-ownership·form-mapper·integration·UI 테스트 |

---

## 6. 성공 기준 (Design-level DoD)

Plan의 성공 지표(§8)를 Design 수준에서 재확인:

- [ ] `TransferFormData` 확장 필드 전체 타입 정의 (약 30개)
- [ ] 엔진 `NonBusinessLandInput` 신규 optional 필드 1개 (`ownershipRatio`) + 기존 필드 전부 유지
- [ ] UI 컴포넌트 10개 구조 + props 시그니처 확정
- [ ] 엔진 Gap 6건 해소 설계 (grace, co-ownership, livestock, REDIRECT, 수도권, `gracePeriods` 실제 반영)
- [ ] 17개 시나리오 각각의 입력 경로 (Plan 부록 B 3건 + 14건 추가)
- [ ] 테스트 전략 (엔진 25건 + 통합 17건 + UI 4건)

---

## 7. Next Actions

1. 본 Design 및 sibling 문서(`.ui.design.md`, `.engine.design.md`) 검토·승인
2. `TransferFormData` 확장 PR 1차 (필드 정의·기본값·migrate 함수만)
3. `mapFormToNblInput` 매퍼 PR + 테스트
4. M2부터 순차 구현 (`/pdca do nbl-ui-completion`)
5. 각 Milestone 완료 시 `gap-detector` 실행하여 Match Rate 측정

---

## 8. 참고 조문

- 소득세법 §104조의3 (비사업용 토지 중과)
- 소득세법 시행령 §168조의6 (기간 기준)
- 소득세법 시행령 §168조의7 (부득이한 사유 유형)
- 소득세법 시행령 §168조의8 (농지)
- 소득세법 시행령 §168조의9 (임야)
- 소득세법 시행령 §168조의10 (목장용지)
- 소득세법 시행령 §168조의11 (기타 토지)
- 소득세법 시행령 §168조의12 (주택 부속토지 배율)
- 소득세법 시행령 §168조의13 (별장)
- 소득세법 시행령 §168조의14 (부득이한 사유 + 무조건 면제)
- 대법원 2015두39439 (공동상속 비사업용 토지 지분별 판단)

---

## 9. 변경 이력

| 날짜 | 버전 | 변경 |
|---|---|---|
| 2026-04-24 | v1.0 | 최초 작성 — Plan M1 산출물, 3파일 분할 구조 |
