# 입력폼 가시성 개선 (홈택스 스타일) — 작업 계획서

> **Feature ID**: `form-visibility-improvement`
> **작성일**: 2026-04-25
> **작성자**: Claude Code (Opus 4.7)
> **참조 디자인**: 국세청 홈택스 양도소득세 신고 화면 (사용자 제공 스크린샷)
> **대상 범위**: 6대 세금 입력 마법사 전체 — 양도세 → 취득세 → 재산세 → 종부세 → 상속·증여세 순 적용

---

## 1. 배경 및 문제 정의

### 1.1 현재 시스템의 가시성 한계

`components/calc/transfer/`·`components/calc/property/`·`components/calc/acquisition/` 등의 입력폼은 다음 패턴으로 구현되어 있음.

```tsx
// 현재 (Step1.tsx 발췌)
<div className="space-y-4">
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">
        양도일 <span className="text-destructive">*</span>
      </label>
      <DateInput ... />
      <p className="text-xs text-muted-foreground">잔금 청산일 ...</p>
    </div>
    {/* ... */}
  </div>
</div>
```

**관찰된 약점**
1. **필드 단위 시각적 경계 부재** — `space-y-4`로 여백만 두고 `border` 등 박스 구분이 없음 → 필드끼리 시각적으로 흘러내림
2. **섹션 그룹화 약함** — "기본정보" / "양도자산 정보" / "감면" 같은 큰 섹션 헤더가 옅거나 없음
3. **좌측 진척·요약 사이드바 부재** — 사용자는 "지금 어느 단계인지" / "현재까지 입력된 양도가액·취득가액·예상세액"을 한눈에 보지 못함 (StepIndicator만 상단에 있음)
4. **인라인 보조 액션 통일성 부족** — 주소 검색, 공시가격 조회, 국적 선택 등 "검색" 버튼이 인풋과 분리·산재
5. **단위 표시 불일치** — 일부는 우측 `원`이 떠 있고, 일부는 placeholder에만 있음
6. **필수 마커(`*`) 위치·색·크기 일관성 부족** — `text-destructive` 별표 외에 별도 강조 없음

### 1.2 참조 디자인 (홈택스) 핵심 패턴

스크린샷에서 추출한 8가지 설계 요소:

| # | 요소 | 설명 |
|---|------|------|
| ① | **필드 카드** | 각 입력 필드가 둥근 사각 박스(border + 배경)로 감싸지고, 좌측 상단에 라벨, 우측에 입력 |
| ② | **좌측 라벨 + 우측 입력 가로 배치** | 카드 내부에서 라벨은 좌상단(작은 영역), 입력은 우측 넓은 영역 |
| ③ | **필수 마커** | 라벨 앞에 빨간색 `*`, 라벨 텍스트는 굵은 글꼴 |
| ④ | **2-컬럼 그리드** | 데스크톱에서 관련 필드 좌우 배치 (예: 신고구분/국내·외자산구분, 양도자산종류/양도연월) |
| ⑤ | **섹션 헤더** | `◦ 세무대리인` 처럼 점·아이콘 + 굵은 텍스트로 큰 그룹 구분 |
| ⑥ | **좌측 사이드바** | 진행 중 단계(파란 강조) + 실시간 결과 요약(양도가액 합계·취득가액 합계·납부할 세액) |
| ⑦ | **인라인 검색 버튼** | 인풋 우측 끝에 작은 `검색` 버튼 (주소·국적·공시가격) |
| ⑧ | **인풋 우측 단위/접미** | `원`, `@`, `KR / 대한민국`, `▾` 등 우측 정렬 부가 표시 |

### 1.3 목표

- **모든 입력 필드를 카드형 컨테이너로 일관 래핑**하여 경계·라벨·입력 영역이 명확히 분리되도록 한다.
- **2-컬럼 그리드 + 섹션 헤더**로 마법사 각 Step의 정보 구조가 한눈에 파악되도록 한다.
- **좌측 진척·요약 사이드바**를 도입하여 "어디까지 왔고, 결과가 어떻게 누적되는지" 동시 표시한다.
- 단, 양도세 마법사의 **데이터 구조·검증 로직·zustand store는 변경하지 않는다** (UI shell만 교체).

---

## 2. 비범위 (Out of Scope)

다음은 이번 작업 범위가 **아니다** — 범위 확대 시 별도 PRD 분리.

- 엔진 로직 변경, 새 입력 필드 추가, 검증 룰 수정
- 기존 store(`calc-wizard-store.ts`) 스키마 변경
- 결과 화면(`results/*ResultView.tsx`) 재디자인
- 모바일 전용 UX 재설계 (반응형은 유지하되 신규 모바일 패턴 도입은 별건)
- 디자인 토큰/색상 팔레트 변경 (현재 shadcn 토큰 그대로 사용)

---

## 3. 설계 방향

### 3.1 새 공용 컴포넌트 (3종)

#### 3.1.1 `FieldCard` — 필드 카드 래퍼 (참조 ①②③⑦⑧)

```tsx
// components/calc/inputs/FieldCard.tsx (신규)
<FieldCard
  label="양도일"
  required
  hint="잔금 청산일 또는 등기 접수일 중 빠른 날"
  warning={isFilingOverdue ? "신고기한을 지났습니다" : undefined}
  trailing={<button>검색</button>}   // optional 인라인 버튼
  unit="원"                            // optional 단위
>
  <DateInput value={...} onChange={...} />
</FieldCard>
```

**구현**
- 외곽: `rounded-lg border bg-card px-4 py-3`
- 데스크톱: `grid grid-cols-[120px_1fr] gap-3 items-start` (라벨 좌측 고정폭 + 입력 우측 가변)
- 모바일(`sm` 미만): `flex flex-col gap-2` (라벨 위, 입력 아래)
- `required` 시 라벨 앞 `<span className="text-destructive mr-1">*</span>`
- `hint`/`warning`은 입력 아래 작은 텍스트 (`warning`은 `text-destructive`)

#### 3.1.2 `SectionHeader` — 섹션 그룹 헤더 (참조 ⑤)

```tsx
<SectionHeader
  title="기본정보"
  action={<Button size="sm" variant="outline">새로작성하기</Button>}
/>
```

**구현**
- `flex items-center justify-between border-b pb-2 mb-3`
- `<h3 className="text-base font-semibold flex items-center gap-2"><Dot />{title}</h3>`
- 우측 슬롯에 `action`(액션 버튼들)

#### 3.1.3 `WizardSidebar` — 좌측 진척·요약 사이드바 (참조 ⑥)

```tsx
<WizardSidebar
  steps={[
    { label: "기본사항을 입력하세요", active: true, done: false },
    { label: "양수인", active: false, done: false },
    /* ... */
  ]}
  summary={[
    { label: "양도가액 합계", value: 0 },
    { label: "취득가액 합계", value: 0 },
    { label: "필요경비 합계", value: 0 },
    { label: "납부할 세액", value: 0, highlight: true },
  ]}
/>
```

**구현**
- 데스크톱(`lg+`): 좌측 320px 고정 폭 + sticky top-20
- 모바일(`lg` 미만): collapse → 상단 StepIndicator 유지(기존)
- 현재 단계는 파란 배경 + 흰색 텍스트, 완료 단계는 체크 아이콘
- 요약 영역: 현재 `form` 상태에서 zustand selector로 합계 계산

### 3.2 레이아웃 변경 (양도세 우선)

```
[현재]  StepIndicator (상단) → Step1~6 본문 (full width)
[개선]  ┌─ WizardSidebar ──┬──── SectionHeader ────┐
        │ ● 기본사항       │  기본정보             │
        │ ○ 양도자산       │  ┌─ FieldCard ──┐    │
        │ ○ 보유 상황      │  │ 양도일       │    │
        │ ○ 감면           │  └──────────────┘    │
        │ ○ 가산세         │  ┌─ FieldCard ──┐    │
        │                  │  │ 신고일       │    │
        │ [요약 패널]      │  └──────────────┘    │
        │ 양도가액  0원    │  ...                 │
        │ 납부세액  0원    │                      │
        └──────────────────┴───────────────────────┘
```

### 3.3 기존 컴포넌트와의 통합

- `CurrencyInput`/`DateInput` **자체는 변경하지 않음** — 외곽만 `FieldCard`로 감쌀 수 있도록 두 가지 사용 모드 지원:
  - **단독 모드(기존)**: `<CurrencyInput label="..." />` (label 내장) — 호환성 유지
  - **카드 모드(신규)**: `<CurrencyInput label="" />` + `<FieldCard label="...">` 외부에서 래핑
  - 가이드: `components/calc/CLAUDE.md` 에 "카드 모드 사용 시 내부 라벨 비우기" 명시
- `StepIndicator`는 모바일 전용으로 강등 (`hidden lg:hidden` ↔ `lg:block` 사이드바 노출)

---

## 4. 작업 단계

### Phase 1 — 공용 컴포넌트 신설 (Day 1)

| Task | 산출물 | 검증 |
|------|--------|------|
| 1.1 `FieldCard` 컴포넌트 작성 | `components/calc/inputs/FieldCard.tsx` (~80 줄) | Storybook 대신 `app/calc/transfer-tax/steps/Step1.tsx` 1개 필드에 시범 적용해 시각 확인 |
| 1.2 `SectionHeader` 컴포넌트 작성 | `components/calc/shared/SectionHeader.tsx` (~30 줄) | 동상 |
| 1.3 `WizardSidebar` 컴포넌트 작성 | `components/calc/shared/WizardSidebar.tsx` (~150 줄) | 데스크톱/모바일 토글 동작 확인 |
| 1.4 `components/calc/CLAUDE.md` 업데이트 | "카드 모드" 패턴 + 사용 예시 추가 | 문서 review |

### Phase 2 — 양도세 마법사 적용 (Day 2)

| Task | 대상 파일 | 비고 |
|------|-----------|------|
| 2.1 `TransferTaxCalculator` 레이아웃 개편 | `app/calc/transfer-tax/TransferTaxCalculator.tsx` | 사이드바 + main 2-컬럼 그리드 도입. `StepIndicator` 모바일 전용으로 |
| 2.2 Step1 (자산 목록) 카드화 | `steps/Step1.tsx` | 양도일/신고일 → `FieldCard`. 일괄양도 토글은 별도 섹션 헤더 |
| 2.3 Step3 (취득 상세) 카드화 | `steps/Step3.tsx` | 환산취득가·감정가·신축·증축 입력 → `FieldCard` 2-컬럼 |
| 2.4 Step4 (보유 상황) 카드화 | `steps/Step4.tsx` + `step4-sections/*` | NBL·다주택·합가 섹션을 `SectionHeader`로 분리 |
| 2.5 Step5 (감면·공제) 카드화 | `steps/Step5.tsx` | 자산별 체크박스 그룹은 카드 내부에 유지 |
| 2.6 Step6 (가산세) 카드화 | `steps/Step6.tsx` | 단건 모드 한정 |
| 2.7 사이드바 요약 selector 작성 | `lib/stores/calc-wizard-store.ts` (selector만 추가, 스키마 변경 없음) | `useTransferSummary()` — 양도가액·취득가액·필요경비 합계 계산 (자산 배열 reduce) |

### Phase 3 — 시각 회귀 점검 (Day 3 오전)

- `npm run dev` 띄우고 양도세 마법사 1~6단계 수동 점검:
  - [ ] 각 입력 필드가 카드형으로 표시
  - [ ] 데스크톱 2-컬럼 / 모바일 1-컬럼 정상 전환 (`md` breakpoint)
  - [ ] 좌측 사이드바가 lg 이상에서만 표시
  - [ ] 필수 마커(*) 정상 위치
  - [ ] 인라인 단위(원/원/㎡) 우측 정렬
  - [ ] StepIndicator(상단)는 lg 미만에서만 표시
  - [ ] 사이드바 합계가 입력 변경 시 실시간 갱신
- `npm test -- transfer-tax` 회귀 통과 (UI 변경뿐이라 엔진 테스트는 영향 없음을 재확인)
- `npm run lint` / `npm run build` 무경고

### Phase 4 — 타 세목 점진 확장 (이번 PR 범위 밖, 후속)

양도세 적용 후 패턴이 안정화되면 다음 순서로 적용 (각각 별도 작업 계획):

1. 취득세 (`components/calc/acquisition/`) — Step0/Step1
2. 재산세 (`components/calc/property/`) — Step0~3 (현재 진행 중인 UI 작업과 병합 검토)
3. 종합부동산세 — Step0~N
4. 상속·증여세 (`InheritanceTaxForm.tsx`·`GiftTaxForm.tsx`) — 단일 폼이라 SectionHeader 위주

각 세목 작업 시 본 계획서의 `FieldCard`·`SectionHeader`·`WizardSidebar`를 그대로 재사용.

---

## 5. 기술적 결정 사항

| 결정 | 이유 |
|------|------|
| `FieldCard`는 `CurrencyInput`/`DateInput` 외부에서 감싸는 패턴 | 기존 라벨 내장 모드와의 호환 유지. 양 컴포넌트 자체 수정 시 회귀 위험 큼 |
| `WizardSidebar`는 `lg`(1024px) 이상에서만 노출 | 노트북·모니터에서는 항상 보이고, 태블릿·모바일은 상단 StepIndicator로 폴백 |
| 사이드바 요약은 store selector로 파생 | store 스키마는 변경 없음 → zustand subscribe로 자동 리렌더 |
| shadcn `Card` 컴포넌트 대신 `FieldCard` 신설 | shadcn `Card`는 더 무거운 헤더/푸터 구조 — 입력 단일 필드용으로는 과함 |
| 색상은 모두 토큰(`bg-card`/`border`/`text-destructive`) 사용 | 다크모드 자동 호환 + 디자인 토큰 변경 시 일괄 반영 |

---

## 6. 위험 요소 & 대응

| 위험 | 영향 | 대응 |
|------|------|------|
| `FieldCard` 적용으로 줄 수가 늘어 800줄 정책 위반 가능 | 빌드 시 hook 경고 | Step별 inline으로 두지 말고 helper 함수(`renderXxxCard`)로 분리하거나 sub-section 컴포넌트로 추출 |
| `CompanionAssetCard.tsx` (이미 1000줄 근접) 추가 변경 시 분할 필요 | 800줄 초과 | 해당 카드는 이번 작업에서 **건드리지 않음** — 자산 카드 내부 입력 카드화는 후속 PR로 분리 |
| 사이드바 요약의 `필요경비 합계` 등은 엔진 호출 없이는 정확값 산출 불가 | 사용자 혼동 | 사이드바에는 **사용자 직접 입력값의 단순 합계**만 표시. "예상 세액"은 엔진 호출 결과가 있을 때만 노출(없으면 `—`) |
| 모바일 레이아웃 회귀 | 기존 사용자 영향 | Phase 3 점검 시 모바일 뷰포트(375px) 직접 확인 |
| 좌측 사이드바가 좁은 노트북(13") 화면에서 본문 영역을 좁힘 | 가독성 저하 | `lg` (1024px) 기준점이 적절한지 Phase 3에서 확인하고 필요 시 `xl`(1280px)로 상향 |

---

## 7. 완료 기준 (DoD)

- [ ] `FieldCard`·`SectionHeader`·`WizardSidebar` 3종 컴포넌트 각 800줄 이하로 작성·동작
- [ ] 양도세 마법사 Step1·3·4·5·6 모든 입력 필드가 `FieldCard`로 감싸짐
- [ ] 데스크톱(lg+)에서 좌측 사이드바 + 본문 2컬럼, 모바일에서 단일 컬럼 + StepIndicator 정상 동작
- [ ] 사이드바 요약 패널이 자산 입력에 따라 실시간 갱신
- [ ] 기존 vitest 테스트(80 파일 / 1,484 cases) 전부 그린
- [ ] `npm run lint` / `npm run build` 무경고
- [ ] `components/calc/CLAUDE.md` 에 카드 패턴 가이드 추가
- [ ] 사용자 manual review로 홈택스 참조 디자인과 비교 OK 사인

---

## 8. 참고 자료

- 사용자 제공: 홈택스 양도소득세 신고 화면 스크린샷 (`기본정보` / `세무대리인` 섹션)
- 기존: `components/calc/CLAUDE.md` (마법사·공용 입력 컴포넌트 규칙)
- 기존: `docs/02-design/features/korean-tax-calc-ui.design.md`
- 메모리: `feedback_select_on_focus`·`feedback_date_input`·`feedback_select_component` (입력 컴포넌트 규칙 — 변경 없음)

---

> **Learning Point**: 이 계획서는 PDCA의 **Plan** 단계 산출물입니다. UI 가시성 개선이라는 한 가지 목표를 위해 (1) 현 시스템의 구체적 약점, (2) 참조 디자인의 추출 가능한 패턴, (3) 단계별 산출물·DoD를 분리해 기술했습니다. 다음 단계는 본 계획서를 바탕으로 `docs/02-design/features/form-visibility-improvement.design.md`를 작성하거나, Phase 1부터 바로 구현(Do 단계)에 들어갈 수 있습니다.
