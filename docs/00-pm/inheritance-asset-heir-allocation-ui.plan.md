# 일반 상속재산 협의분할 UI 통합 계획서 (v6)

> **상태**: Plan v6 (구현 갭 분석 반영 — 2026-05-21 완료)

## v5 → v6 정정 (구현 후 갭 분석)

| # | 카테고리 | 정정 |
|---|---|---|
| G-1 | 디자인 환류 | `HeirAllocationResultCard.tsx` 신규 작성 → **기존 `HeirAllocationTable.tsx` 재사용** (PDF 책 1859 재현, 이미 InheritanceTaxResultView 라인 220-221에 통합되어 있음). 중복 컴포넌트 작성 차단. 신규 컴포넌트 1건 제외 |
| G-2 | 문서 경로 | UI anchor 파일 경로 `__tests__/calc/...` → **`__tests__/components/calc/...`** 정정 |
| G-3 | UI anchor 수 | "1건(C7)" → **3건 (C7 미렌더 + C7-반례 inheritance 노출 + C7-누락 heirs 미전달)** 확대 |
| G-4 | 엔진 결과 | 신규 anchor 11건 모두 PASS, 전체 회귀 4,127 passed / 1 skipped / 1 todo / 0 failed |
> **작성일**: 2026-05-21
> **세목**: 상속세 (Inheritance Tax)
> **유형**: UI 통합 + 마법사 단계 재구성 (선행) + 협의분할 대상 확장
> **에이전트**: `inheritance-gift-tax-ui-senior` (주) + `inheritance-gift-tax-senior` (보)

## v4 → v5 정정 (Plan ↔ Design 통합 검토)

Design v3와의 통합 비교 결과 다음을 반영:

| # | 카테고리 | 정정 |
|---|---|---|
| U1 | 변경 파일 누락 | `StockValuationForm.tsx`(props 확장 + ToggleSection 통합), `HeirAllocationToggleSection.tsx`(신규), `HeirAllocationInput.tsx`(heirShortLabel·hasDistributableHeir export) 변경 파일 표에 추가 |
| U2 | 줄 수 정정 | PropertyValuationForm `+70 (513→583)` → `+18 (513→531)`. 신규 `HeirAllocationToggleSection.tsx +70` 분리 |
| U3 | anchor 수 | "C3·C4·C5·C6·C8 5건" → **엔진 anchor 8건 (A1·A2·C3·C4·C5·C6·C8·C9) + UI anchor 1건 (C7) + 회귀 2건 (C1·C2)** |
| U4 | 호출처 | "호출처 2곳" → **4곳** (PropertyValuationForm × 2 [steps.tsx·GiftTaxForm] + StockValuationForm × 2 [steps.tsx·GiftTaxForm]) |

## v3 → v4 정정 (자체검토 2차)

| # | 카테고리 | 정정 내용 |
|---|---|---|
| G1 | 오류 | `EstateItem`에 `valuation` 단일 필드 없음. 평가액은 `marketValue` / `appraisalValue` / `standardPrice` 다중 후보 우선순위 (PropertyValuationForm.tsx:293-300). `expectedTotal`은 **계산된 최종 평가액(`computeEffectiveValuation(item)`)**으로 도출 — 모든 anchor·UI 코드에서 `item.valuation` → 도출값으로 정정 |
| G2 | 누락 (중대) | `InheritanceResultView`에 상속인별 세액 카드 **존재하지 않음**(grep 0건). 신규 컴포넌트 `HeirAllocationResultCard` 필요. 메인 PR 2 범위에 포함하거나 **후속 PR 3 (결과 카드)으로 분리**. 결정: **PR 2 범위에 포함** — UI 입력만 추가하고 결과 카드가 없으면 사용자가 효과를 확인할 수 없음 |
| G3 | 안전 확인 | Route handler `estateItems` 명시 매핑 존재 (route.ts:66-72), API 변환 명시 spread (inheritance-api.ts:71) — heirAllocations 자동 전달 ✅ |
| G4 | 개선 | `HeirAllocationInput`은 `distributableHeirs.length === 1` 시 자동채움. 자산 협의분할 토글 ON 후 상속인이 1명이면 자동 채움됨을 디자인 문서에 명시 |

## v2 → v3 정정 (자체검토 1차)

| # | 카테고리 | 정정 내용 |
|---|---|---|
| E1 | 오류 | anchor 결과 필드명 `heirAllocationDetail` → **`heirAllocationResult`** (실제 타입 `InheritanceTaxResult.heirAllocationResult?: HeirAllocationResult`, types 라인 740). 상속인별 세액은 `r.heirAllocationResult.perHeir.get(heirId).finalTax` |
| E2 | 오류 | `InheritanceTaxForm`은 zustand persist **미사용** — `useState(INITIAL_FORM)` 로컬 상태 (InheritanceTaxForm.tsx:151-152). `calc-wizard-migration.ts`는 **양도세 전용**. STEP_MIGRATION 작업 자체가 불필요 → 단순 STEPS 상수 변경만으로 충분, 기존 사용자 영향 0건 |
| E3 / C3 / I2 | 오류·모순 | `HeirAllocationInput.tsx:66`이 `corporate` 분배 대상 제외 중. 영리법인은 통상 유증·사전증여 형태이며 일반 상속재산 협의분할 대상 아님(상증령 §3 해석). **corporate 제외 유지** — C5(법인 분배) 케이스 제거 |
| O1 | 누락 | Step 0 길이 증가 → 색상 카드 + 섹션 번호 패턴 명시 (CLAUDE.md 강제) |
| O3 | 누락 | `InheritanceResultView`의 HeirAllocationCard 실제 존재 여부는 Do 진입 전 grep 확인 항목으로 명시 |
| O4 | 누락 | ⑭ Route handler `app/api/calc/inheritance/route.ts` 엔진 입력 매핑 점검 — heirAllocations에 Date 필드 없으나 spread 경로 grep 강제 |
| I3 | 개선 | anchor A2 검증 필드 정확화 — `r.heirAllocationResult.perHeir.get(heirId).finalTax`·`.generationSkipSurcharge` 사용 |

---

## v2 변경 요약 (v1 → v2)

| 변경 | v1 | v2 |
|---|---|---|
| 마법사 단계 | Step 4의 HeirComposition 유지 | **Step 0으로 이동 (선행 PR 1)** |
| 협의분할 대상 | 법정상속인만 | **법정상속인 + 수유자(legatee) + 법인(corporate)** |
| PR 분할 | 단일 PR | **선행 PR 1 (단계 재구성) → 메인 PR 2 (자산 협의분할)** |

---

## 1. 배경

### 1.1 UX 결함 (v1 미반영)

```
Step 0: 피상속인 정보
Step 1: 상속재산           ← 자산 협의분할 (신규 예정) — heirs 참조 필요
Step 2: 비과세·장례비       ← 채무 협의분할 (이미 존재) — heirs 참조 필요  ❗
Step 3: 사전증여
Step 4: 상속인·공제         ← heirs 입력  ❗ (위 두 단계가 미리 참조)
Step 5: 세액공제
```

`steps.tsx:102`·`149`에서 이미 Step 1·2에 `heirs={form.heirs}`를 전달하지만, heirs는 Step 4에서 입력. **사용자는 Step 4까지 가서 상속인 입력 후 Step 1·2로 돌아와야** 협의분할 입력이 가능. 채무 협의분할(Phase A0)도 같은 결함을 안고 있음.

자산 협의분할 UI를 Step 1에 추가하면 결함이 2배로 증폭 → **단계 재구성을 선행**한다.

### 1.2 협의분할 대상 범위 (법령)

상속재산 분할은 법정상속인만의 영역이 아니다.

- **민법 §1073** (유증): 피상속인은 유언으로 상속인 외의 자에게도 재산을 줄 수 있음
- **상증법 §3의2** ① 수유자(受遺者)도 상속인과 동일하게 받았거나 받을 재산 한도로 상속세 연대납부의무
- **상증령 §3** ② 협의분할 또는 유증에 의한 취득가액 기준으로 안분
- 따라서 **유증·사인증여 받는 비상속인(자연인 legatee, 영리법인 corporate)도 협의분할표에 포함**되어야 함

엔진 측은 이미 준비:

- `HeirRelation` 타입: `"spouse" | "lineal_descendant" | ... | "legatee" | "corporate"` (legatee 자연인 수유자 + corporate 영리법인) — `inheritance-gift.types.ts:339`
- `HeirComposition` UI 컴포넌트: legatee·corporate 추가 옵션 이미 지원 — `components/calc/HeirComposition.tsx:25,44`
- `calcHeirAllocation`: legatee/corporate 분기 처리 존재 (`beneficiaryType`)

즉 **타입·엔진·HeirComposition 모두 준비 완료** → 단계 위치만 옮기면 됨.

## 2. 목표

1. **선행 PR 1**: `HeirComposition`을 Step 4 → Step 0으로 이동. 사용자가 자산·채무·간주재산 협의분할 입력 *전*에 상속인·수유자·법인을 미리 정의.
2. **메인 PR 2**: `PropertyValuationForm`의 각 자산 카드에 협의분할 토글 + `HeirAllocationInput` 통합. 분할 대상은 Heir 배열 전체(상속인 + 수유자 + 법인).

## 3. 마법사 재구성 (선행 PR 1)

### 3.1 신/구 대비

| 단계 | v1 (현행) | v2 |
|---|---|---|
| 0 | 피상속인 정보 | **피상속인 정보 + 상속인·수유자 구성** |
| 1 | 상속재산 | 상속재산 (자산별 협의분할 활성) |
| 2 | 비과세·장례비 | 비과세·장례비 (채무 협의분할 정상 동작) |
| 3 | 사전증여 | 사전증여 |
| 4 | 상속인·공제 | **공제·세액공제** (HeirComposition만 제거, 나머지 그대로) |
| 5 | 세액공제 | (4로 통합 — 선택) |

`STEPS` 상수 (`components/calc/inheritance/shared.ts:89`):

```ts
// v1
["피상속인 정보","상속재산","비과세·장례비","사전증여","상속인·공제","세액공제"]
// v2
["피상속인·상속인","상속재산","비과세·장례비","사전증여","공제·세액공제"]
```

### 3.2 Step 0 레이아웃

색상 카드 + 섹션 번호 패턴 강제 (`components/calc/CLAUDE.md` "다-섹션 입력 폼" 규칙).

```
┌─ Step 0: 피상속인·상속인 구성 ──────────────────┐
│                                                  │
│  ┌──[sky tone, 섹션 ①]──────────────────┐       │
│  │ ① 피상속인 기본 정보                  │       │
│  │    거주자 여부 / 사망일 / 신고 기한    │       │
│  └──────────────────────────────────────┘       │
│                                                  │
│  ┌──[violet tone, 섹션 ②]──────────────────┐    │
│  │ ② 상속인·수유자 구성                    │    │
│  │    <HeirComposition>                      │    │
│  │    ⊕ 배우자 ⊕ 직계비속 ⊕ 직계존속      │    │
│  │    ⊕ 형제자매 ⊕ 수유자(legatee)         │    │
│  │    ⊕ 법인(corporate, 사전증여·유증 전용)│    │
│  │    ※ 협의분할 대상에 포함될 모든 자연인  │    │
│  │      자 등록 (법인은 협의분할 대상 ✗)   │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

- 섹션 ①: `sky tone`, 둥근 번호 `bg-sky-200 text-sky-800`
- 섹션 ②: `violet tone`, 둥근 번호 `bg-violet-200 text-violet-800`
- 안내 텍스트로 법인이 협의분할 대상에서 제외됨을 명시

### 3.3 마이그레이션

- **별도 마이그레이션 불필요** — `InheritanceTaxForm`은 zustand persist 미사용, `useState(INITIAL_FORM)` 로컬 상태(InheritanceTaxForm.tsx:151-152). 새로고침 시 폼 초기화는 현행과 동일
- 사용자 영향: 진행 중 세션이 있으면 새로고침으로 초기화 — 기존에도 동일 동작
- `calc-wizard-migration.ts`는 양도세 전용이므로 수정 불필요

### 3.4 validation 변경

- `lib/calc/inheritance-validate.ts`: Step 0 validate에 `heirs.length === 0` 차단 추가
- Step 1 자산 협의분할 토글 활성 조건은 `heirs.length > 0` (Step 0에서 이미 입력됨을 신뢰)

### 3.5 영향 받는 파일 (선행 PR 1)

| 파일 | 변경 |
|---|---|
| `components/calc/inheritance/shared.ts` | STEPS 상수 6→5단계, 라벨 변경 |
| `components/calc/inheritance/steps.tsx` | Step 0에 HeirComposition 추가, Step 4의 HeirComposition 호출 제거 |
| `components/calc/inheritance/step4-5.tsx` | HeirComposition import 제거, 공제 입력만 유지 |
| `components/calc/InheritanceTaxForm.tsx` | stepComponents 매핑 갱신 (인덱스 6→5) |
| `lib/stores/calc-wizard-migration.ts` | inheritance STEP_MIGRATION 신규 |
| `lib/calc/inheritance-validate.ts` | Step 0 validate에 heirs 필수 추가 |
| `__tests__/calc/inheritance-wizard-migration.test.ts` (신규) | 마이그레이션 anchor |

## 4. 자산 협의분할 UI (메인 PR 2)

### 4.1 토글 컴포넌트

각 자산 카드(`ItemEditor`, `PropertyValuationForm.tsx`) 하단에 추가:

```tsx
// 평가액 우선순위: marketValue > appraisalValue > standardPrice (PropertyValuationForm 기존 로직)
const effectiveValuation =
  item.marketValue ?? item.appraisalValue ?? item.standardPrice ?? 0;

// 분배 대상: corporate 제외 (HeirAllocationInput 내부 필터와 동일 정책)
const distributableHeirs = heirs.filter((h) => h.relation !== "corporate");

<ToggleCard
  tone="violet"
  title="상속인·수유자별 협의분할 입력"
  description="OFF: 법정상속분(민법 §1009)으로 자동 안분 / ON: 상속인·수유자에게 직접 분배 (민법 §1013 협의분할 + §1073 유증). 영리법인은 협의분할 대상이 아닙니다."
  disabled={distributableHeirs.length === 0 || effectiveValuation === 0}
  disabledReason={
    distributableHeirs.length === 0
      ? "Step 0에서 상속인·수유자(자연인)를 먼저 등록하세요"
      : "평가액을 먼저 입력하세요"
  }
  checked={!!item.heirAllocations}
  onCheckedChange={(on) => {
    if (on) {
      // distributableHeirs.length === 1 시에도 안전 (HeirAllocationInput가 자동채움)
      onChange({
        heirAllocations: [{ heirId: distributableHeirs[0].id, amount: effectiveValuation }],
      });
    } else {
      onChange({ heirAllocations: undefined });
    }
  }}
>
  <HeirAllocationInput
    allocations={item.heirAllocations ?? []}
    expectedTotal={effectiveValuation}
    heirs={heirs}                       /* 전체 전달 — 컴포넌트 내부에서 corporate 자동 필터 */
    onChange={(allocs) => onChange({ heirAllocations: allocs })}
  />
</ToggleCard>
```

### 4.2 HeirAllocationInput 표시 라벨

기존 `heirShortLabel(h: Heir)`이 relation별 한국어 라벨을 반환 (`feedback_select_component`). 수유자·법인도 동일 헬퍼로 자동 표시:

| relation | 표시 |
|---|---|
| spouse | 배우자 |
| lineal_descendant | 자녀 (이름) |
| legatee | 수유자 (이름) |
| corporate | 법인 (상호) |

`HeirAllocationInput` 자체는 수정 불필요 — Heir 배열만 풀로 받으면 됨.

### 4.3 PropertyValuationForm props 시그니처

```ts
interface PropertyValuationFormProps {
  items: EstateItem[];
  onChange: (items: EstateItem[]) => void;
  mode: "inheritance" | "gift";   // 신규 — gift는 협의분할 토글 비노출
  heirs?: Heir[];                  // 신규 — inheritance 시 필수
}
```

`mode === "gift"` OR `heirs.length === 0` → 토글 자체 미렌더.

## 5. 케이스 매트릭스 (UI + Engine 분기)

| # | mode | heirs 구성 | item.heirAllocations | 엔진 분기 | UI 표시 |
|---|---|---|---|---|---|
| C1 | inheritance | 0명 | - | `hasHeirAllocations=false` | 토글 disabled + reason |
| C2 | inheritance | 배우자+자녀 2명 | undefined | 자동 안분 (법정상속분) | 토글 OFF |
| C3 | inheritance | 배우자+자녀 2명 | `[{배우자:전액}]` | STEP 13 활성 | 토글 ON, 1명 분배 |
| C4 | inheritance | 배우자+자녀+**수유자** 3명 | `[{배우자:50%},{자녀:30%},{수유자:20%}]` | STEP 13 + 수유자 분기 | 토글 ON, 비상속인 포함 |
| C5 | inheritance | 배우자+자녀 2명 | 합계 ≠ valuation | validate 차단 | rose 경고 |
| C6 | inheritance | 배우자+자녀 2명 | orphaned heirId (삭제됨) | validate 차단 | rose 경고 |
| C7 | gift | - | - | - | 토글 미렌더 |
| C8 | inheritance | 배우자+**법인(corporate)** | - | corporate는 분배 대상 자동 제외 (`distributableHeirs` filter) | HeirAllocationInput에서 법인 행 미노출 |

## 6. 동기화 8지점 점검 (메인 PR 2)

| # | 지점 | 변경 | 파일 |
|---|---|---|---|
| ① | 폼 상태 타입 | `EstateItem.heirAllocations` 이미 존재 | - |
| ② | initial value | undefined 유지 (현행) | - |
| ③ | normalize fallback | 토글 OFF 전환 시 undefined 강제 (onCheckedChange 내부) | `PropertyValuationForm` |
| ④ | API 변환 | `inheritance-api.ts` 이미 spread — 점검만 | `lib/calc/inheritance-api.ts` |
| ⑤ | **UI 위젯** (신규) | ItemEditor에 ToggleCard + HeirAllocationInput | `components/calc/PropertyValuationForm.tsx` |
| ⑥ | 사이드바 합계 | 영향 없음 | - |
| ⑦ | **결과 카드 (신규)** | `InheritanceResultView`에 상속인별 세액 카드 부재 확인 — `HeirAllocationResultCard.tsx` **신규 작성** (`r.heirAllocationResult.perHeir` 순회, 상속인별 finalTax·generationSkipSurcharge·priorGiftCredit 표시) | `components/calc/results/InheritanceResultView.tsx` + 신규 `HeirAllocationResultCard.tsx` |
| ⑧ | **Validation** | `inheritance-validate.ts:30` 이미 동작 — 점검만 | - |
| ⑭ | Route handler | `app/api/calc/inheritance/route.ts`에서 `estateItems` spread 시 heirAllocations 전달 grep 확인 (Date 필드 없으므로 변환 불필요) | `app/api/calc/inheritance/route.ts` |

**TS 미감지 위험**: ⑤ props 시그니처(`mode` + `heirs`) 확장 → `PropertyValuationForm` 호출처 모두 grep 자가점검 강제.

## 7. Pre-Do anchor (Plan 강제)

Do 진입 전 다음 anchor 2건 우선 작성·실행 — 엔진 동작 확인:

```ts
// __tests__/tax-engine/inheritance/asset-heir-allocation-anchor.test.ts

it("[A1] 일반 자산 heirAllocations 입력 시 STEP 13 활성·배우자 100% 안분", () => {
  const r = calculateInheritanceTax({
    heirs: [
      { id: "h1", relation: "spouse", name: "배우자", ... },
      { id: "h2", relation: "lineal_descendant", name: "장남", ... },
    ],
    estateItems: [{
      id: "a1", category: "real_estate_apartment", valuation: 1_000_000_000,
      heirAllocations: [{ heirId: "h1", amount: 1_000_000_000 }],
    }],
    ...
  }, rates);
  expect(r.heirAllocationResult).toBeDefined();
  const h1 = r.heirAllocationResult!.perHeir.get("h1")!;
  const h2 = r.heirAllocationResult!.perHeir.get("h2")!;
  expect(h1.finalTax).toBeGreaterThan(0);
  expect(h2.finalTax).toBe(0);
});

it("[A2] 수유자(legatee) 포함 협의분할 — §3의2 연대납부 + §27 세대생략 할증 정상 동작", () => {
  const r = calculateInheritanceTax({
    heirs: [
      { id: "h1", relation: "spouse", ... },
      { id: "h2", relation: "legatee", name: "손녀(수유자)",
        beneficiaryType: "legatee", isGenerationSkipBeneficiary: true, ... },
    ],
    estateItems: [{
      id: "a1", valuation: 1_000_000_000,
      heirAllocations: [
        { heirId: "h1", amount: 700_000_000 },
        { heirId: "h2", amount: 300_000_000 },
      ],
    }],
    ...
  }, rates);
  // 수유자 세액 + 세대생략 할증 30% 분기 검증 (perHeir 맵 사용)
  const h2 = r.heirAllocationResult!.perHeir.get("h2")!;
  expect(h2.finalTax).toBeGreaterThan(0);
  expect(h2.generationSkipSurcharge).toBeGreaterThan(0); // HeirTaxBreakdown.generationSkipSurcharge
});
```

A1·A2 통과 → UI 통합(Do) 진행. 실패 → 엔진 STEP 13 재확인 → 디자인 환류.

## 8. PDCA 단계

### Plan ✅ (본 v2 문서)

### Design

- `docs/02-design/features/inheritance-asset-heir-allocation-ui.design.md`
- 케이스 매트릭스 8행 (C1~C8) 명시
- 선행 PR 1 ↔ 메인 PR 2 commit 순서 다이어그램
- Pre-Do anchor A1·A2 코드 동결
- props drilling 경로 (`InheritanceTaxForm → Step1 → PropertyValuationForm → ItemEditor → ToggleCard → HeirAllocationInput`)

### Do — 선행 PR 1 (단계 재구성)

1. `STEPS` 상수 5단계로 변경
2. `Step0` 컴포넌트에 색상 카드 + 섹션 번호 패턴으로 HeirComposition 추가 (sky=피상속인, violet=상속인)
3. `Step4` (구 4·5)에서 HeirComposition 제거, 공제·세액공제만 유지
4. `InheritanceTaxForm.tsx` `validateStep` 갱신 (Step 0 단계에서 `heirs.length === 0` 차단)
5. `inheritance-validate.ts`: 동일 차단 동기화 (⑧)
6. 기존 inheritance anchor 회귀 0
7. 브라우저 수동 확인 (Step 0에서 상속인 입력 → Step 1·2 협의분할 토글 정상 동작)
8. **sessionStorage 마이그레이션 작업 없음** — useState 로컬 상태이므로 새로고침 시 초기화 (현행과 동일)

### Do — 메인 PR 2 (자산 협의분할 UI + 결과 카드)

1. Pre-Do anchor A1·A2 실행
2. `HeirAllocationInput.tsx`에 `heirShortLabel`·`hasDistributableHeir` export 추가
3. `HeirAllocationToggleSection.tsx` 신규 작성 (ToggleCard + HeirAllocationInput 래퍼)
4. `PropertyValuationForm` props 시그니처 확장 (mode, heirs) + computeEffectiveValuation 헬퍼 + ToggleSection 호출 (mode==="inheritance"일 때만)
5. `StockValuationForm` 동일 패턴 적용 (mode/heirs props + computeStockValuation + ToggleSection 호출)
6. 호출처 4곳 mode/heirs 전달 (inheritance/steps.tsx의 PropertyValuationForm + StockValuationForm 2건, GiftTaxForm의 2건)
7. **`HeirAllocationResultCard.tsx` 신규** 작성 — perHeir 순회 5열 표 + 합계 행 + 산식 펼침 (인쇄 자동)
8. `InheritanceResultView`에 카드 조건부 렌더 (`r.heirAllocationResult !== undefined && form.heirs.length > 0`)
9. 엔진 anchor 8건 (A1·A2·C3·C4·C5·C6·C8·C9) + UI anchor 1건 (C7) 추가
10. `npx tsc --noEmit` 0건 + 회귀 0
11. 브라우저 수동 확인 (자산 협의분할 ON/OFF, 주식 자산도 동일 동작, 수유자 포함, 법인 제외, 합계 불일치 경고, 결과 카드 상속인별 세액 + 산식 펼침)

### Check

- `ui-engine-sync-checker` 8지점 read-only
- `bkit:gap-detector` matchRate
- 회귀: 기존 inheritance anchor 전건 통과

### Act

- 후속 PR 후보:
  - 협의분할 합계 자동 보정 제안 UI (비례 분배 버튼 — 자동 적용 아님)
  - 협의분할서 PDF 첨부·OCR
  - 증여세 다수 수증자 모드 (별도 PRD)

## 9. 변경 파일 예상

### 선행 PR 1

| 파일 | 변경 | 줄 수 변화 |
|---|---|---|
| `components/calc/inheritance/shared.ts` | STEPS 6→5 | -1 |
| `components/calc/inheritance/steps.tsx` | Step 0에 섹션 카드 + HeirComposition | +25 |
| `components/calc/inheritance/step4-5.tsx` | HeirComposition 제거 | -10 |
| `components/calc/InheritanceTaxForm.tsx` | stepComponents 매핑 + validateStep Step 0 갱신 | +5~10 |
| `lib/calc/inheritance-validate.ts` | Step 0 validate에 heirs 필수 | +10 |

### 메인 PR 2

| 파일 | 변경 | 줄 수 변화 |
|---|---|---|
| `components/calc/PropertyValuationForm.tsx` | props 확장 (mode/heirs) + effectiveValuation 헬퍼 + ToggleSection 호출 | +18 (513→531) |
| `components/calc/StockValuationForm.tsx` | props 확장 (mode/heirs) + computeStockValuation + ToggleSection 호출 | +20 |
| `components/calc/inheritance/HeirAllocationToggleSection.tsx` (신규) | ToggleCard + HeirAllocationInput 래퍼 — onCheckedChange + disabledReason | +70 |
| `components/calc/inheritance/HeirAllocationInput.tsx` | `heirShortLabel`·`hasDistributableHeir` export 추가 | +5 |
| `components/calc/inheritance/steps.tsx` | PropertyValuationForm·StockValuationForm에 mode="inheritance"·heirs 전달 | +4 |
| `components/calc/GiftTaxForm.tsx` | PropertyValuationForm·StockValuationForm에 mode="gift" 명시 | +2 |
| ~~`components/calc/results/HeirAllocationResultCard.tsx` (신규)~~ | **취소** — 기존 `HeirAllocationTable.tsx`가 PDF 책 1859 형식으로 이미 구현 + InheritanceTaxResultView에 통합되어 있음 (라인 220-221) | 0 |
| `components/calc/results/InheritanceTaxResultView.tsx` | (기존) `heirAllocationResult && heirs.length > 0` 조건부 렌더 이미 존재 — 변경 없음 | 0 |
| `__tests__/tax-engine/inheritance-gift/asset-heir-allocation-anchor.test.ts` (신규) | 엔진 anchor A1·A2·C3·C4·C5·C6·C8·C9 8건 | +240 |
| `__tests__/components/calc/property-valuation-form-heir-allocation.test.tsx` (신규) | UI anchor C7 (gift 미렌더 / inheritance 노출 / heirs 누락) RTL 3건 | +70 |

## 10. 리스크 / 검토

| 리스크 | 완화책 |
|---|---|
| 마이그레이션 sessionStorage 호환 | `STEP_MIGRATION` 매핑 + anchor 1건, 양도세 5→4 전례 차용 |
| Step 0 길이 증가 | HeirComposition 자체가 접이식 카드 — 기본 1명만 노출 |
| 수유자(legatee) 사용자 멘탈 모델 혼동 | HeirComposition 안내 카드에 "상속인 외 유증·법인 수증자도 포함 — 협의분할 대상에 들어감" 명시 |
| props drilling 4단계 | TS strict + 호출처 grep 자가점검 |
| 채무 협의분할 UX 결함이 같이 해소되는 부수효과 | 선행 PR 1 회귀 anchor에 채무 협의분할 케이스 1건 포함 |

## 11. 정책 사전 적용 (MEMORY.md)

- [feedback_useeffect_store_mirror_forbidden]: onCheckedChange 직접 onChange ✅
- [feedback_toggle_card_visibility]: violet tone OFF 배경 유지 ✅
- [feedback_validation_sync_8th_point]: ⑧ inheritance-validate 이미 동작 ✅
- [feedback_no_silent_apportion_fallback]: 합계 불일치 차단, 자동 보정 금지 ✅
- [feedback_ui_input_path_enumeration]: C1~C8 8케이스 매트릭스 ✅
- [feedback_pre_anchor_verification]: Pre-Do anchor A1·A2 명시 ✅
- [feedback_ui_order_follows_logic]: 엔진 STEP 13이 heirs + estateItems를 함께 처리 → UI도 Step 0에 heirs 우선 ✅
- [feedback_pdca_session_efficiency]: PR 2단계 분할로 회귀 영향 격리 ✅
- [feedback_explicit_prop_mapping_strip]: PropertyValuationForm 호출처 모두 mode/heirs 명시 — grep 점검 ✅

## 12. 완료 조건 (Definition of Done)

### 선행 PR 1

- [ ] STEPS 5단계로 변경 (`shared.ts`)
- [ ] Step 0에 색상 카드 + 섹션 번호 패턴 (sky=피상속인, violet=상속인)
- [ ] HeirComposition Step 0으로 이동, Step 4 (구 4·5) 공제·세액공제 통합
- [ ] `InheritanceTaxForm.validateStep` Step 0에서 `heirs.length === 0` 차단
- [ ] `inheritance-validate.ts` 동기 차단 (⑧)
- [ ] 기존 inheritance anchor 회귀 0건
- [ ] 브라우저 확인 (Step 0 입력 → Step 2 채무 협의분할 정상 작동)
- [ ] **sessionStorage 마이그레이션 작업 없음** — useState 로컬 상태 (현행과 동일)

### 메인 PR 2

- [ ] Pre-Do anchor A1·A2 통과
- [ ] `HeirAllocationInput.tsx` `heirShortLabel`·`hasDistributableHeir` export 추가
- [ ] `HeirAllocationToggleSection.tsx` 신규 작성
- [ ] `PropertyValuationForm` props (mode, heirs) 확장 + `computeEffectiveValuation` 헬퍼 (`marketValue ?? appraisedValue ?? standardPrice ?? 0`)
- [ ] `StockValuationForm` 동일 패턴 적용 + `computeStockValuation` 헬퍼
- [ ] 호출처 **4곳** mode/heirs 전달 (inheritance/steps.tsx의 PropertyValuationForm·StockValuationForm + GiftTaxForm의 2건)
- [ ] 수유자(legatee) 분배 + §27 세대생략 할증 정상 동작 (A2 검증)
- [ ] 법인(corporate) 자동 제외 동작 (C8 검증)
- [ ] `HeirAllocationResultCard.tsx` 신규 + `InheritanceResultView` 조건부 렌더
- [ ] 엔진 anchor 8건 (A1·A2·C3·C4·C5·C6·C8·C9) PASS
- [ ] UI anchor 1건 (C7 gift 모드 토글 미렌더) PASS
- [ ] 회귀: C1·C2 + 기존 inheritance anchor 전건 통과
- [ ] `npx tsc --noEmit` 0건
- [ ] 브라우저 수동 확인 (자산·주식 협의분할 ON/OFF, 수유자 포함, 법인 자동 제외, 합계 불일치 rose 경고, 결과 카드 + 산식 펼침, 인쇄 시 자동 펼침)
- [ ] `ui-engine-sync-checker` 8지점 + ⑭ Route handler 결과 첨부
- [ ] 800줄 정책 준수 (PropertyValuationForm 531줄 예상, StockValuationForm ~상한 미달 확인)
- [ ] HeirAllocationResultCard 모바일 가로 스크롤 동작 확인
