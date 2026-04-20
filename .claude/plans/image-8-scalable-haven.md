# 양도소득세(다건) 진입 UX 개선 계획

## Context

현재 홈에서 "양도소득세 (다건)" 카드를 클릭하면 `/calc/transfer-tax/multi`의 빈 "자산 목록" 화면으로 진입한다. 사용자는 다음 단계를 거쳐야 한다:

1. "+ 첫 번째 양도 건 추가" 클릭
2. 6단계 마법사 진행
3. 화면 상단의 "← 자산 목록으로" 클릭하여 저장
4. 다시 목록에서 "+ 양도 건 추가" 클릭
5. 반복 후 "공통 설정으로 →" 클릭
6. 공통 설정 → 계산

이 흐름은 단건 양도(`/calc/transfer-tax`) 진입 시 즉시 마법사가 시작되는 자연스러운 UX와 다르다. 사용자는 "단건과 동일한 흐름으로 자산을 차례로 입력하고 싶다"고 명시적으로 요청했다.

추가로, 자산별 가산세 입력(step 6)은 세법상 의미가 약하다. 가산세는 합산 세액 기준으로 계산되므로 `AggregateSettingsPanel`(공통 설정)에서만 입력하는 것이 정확하다.

## Goals

1. `/calc/transfer-tax/multi` 진입 즉시 첫 자산의 마법사 화면(step 0 = 물건 유형)으로 시작
2. 각 자산은 5단계 마법사(물건 유형 → 양도 정보 → 취득 정보 → 보유 상황 → 감면 확인)만 진행 — **가산세 step은 다건 모드에서 비활성**
3. 마지막 step(감면 확인)에서 두 버튼 분기:
   - `+ 양도 건 추가` → 현재 자산 저장 후 새 자산의 step 0으로 이동
   - `공통 설정으로 →` → 현재 자산 저장 후 settings step으로 이동
4. 자산 간 이동·삭제·복제는 상단 `AssetTabBar`로 수행 (현재 동작 유지)
5. 가산세는 `AggregateSettingsPanel`(공통 설정)에서만 입력

## Files to Modify

### 1. `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx`

**변경 1**: 진입 시 자동으로 첫 자산을 추가하고 edit 모드로 전환하는 `useEffect` 추가

```tsx
useEffect(() => {
  if (form.properties.length === 0 && form.activeStep === "list") {
    handleAddProperty();
  }
}, []); // mount only
```

**변경 2**: 두 개의 신규 핸들러 추가 — `TransferTaxCalculator`에 콜백으로 전달

```tsx
const handleSaveAndAddNext = useCallback(() => {
  // 1) 현재 wizardForm을 multi-store에 저장
  const wizardForm = useCalcWizardStore.getState().formData;
  const completion = calcPropertyCompletion(wizardForm);
  updateProperty(form.activePropertyIndex, { form: wizardForm, completionPercent: completion });
  // 2) 새 자산 추가 + wizard step 0으로 리셋 (handleAddProperty 재사용)
  handleAddProperty();
}, [form.activePropertyIndex, updateProperty, handleAddProperty]);

const handleSaveAndGoToSettings = useCallback(() => {
  const wizardForm = useCalcWizardStore.getState().formData;
  const completion = calcPropertyCompletion(wizardForm);
  updateProperty(form.activePropertyIndex, { form: wizardForm, completionPercent: completion });
  resetWizard();
  setStep("settings");
}, [form.activePropertyIndex, updateProperty, resetWizard, setStep]);
```

**변경 3**: `<TransferTaxCalculator />` 호출 시 콜백 props 전달

```tsx
<TransferTaxCalculator
  onSaveAndAddNext={handleSaveAndAddNext}
  onSaveAndGoToSettings={handleSaveAndGoToSettings}
/>
```

**변경 4**: 빈 상태(자산 0개) "list" UI는 사실상 노출되지 않으므로 그대로 두되, `StepList`의 "첫 번째 양도 건 추가" 버튼은 fallback으로 유지(자산을 모두 삭제했을 때 대비).

### 2. `app/calc/transfer-tax/TransferTaxCalculator.tsx`

**변경 1**: 컴포넌트 시그니처에 optional props 추가

```tsx
interface TransferTaxCalculatorProps {
  onSaveAndAddNext?: () => void;
  onSaveAndGoToSettings?: () => void;
}

export default function TransferTaxCalculator({
  onSaveAndAddNext,
  onSaveAndGoToSettings,
}: TransferTaxCalculatorProps = {}) { ... }
```

`isEmbeddedInMulti`는 기존대로 `usePathname()`로 판정하되, 콜백 존재 여부를 추가 조건으로 사용해도 됨.

**변경 2**: 다건 모드에서 step 5(가산세)를 마법사 단계에서 제외

옵션 A — `STEPS` 상수를 동적으로 결정:
```tsx
const STEPS_FULL = ["물건 유형", "양도 정보", "취득 정보", "보유 상황", "감면 확인", "가산세"];
const STEPS_MULTI = ["물건 유형", "양도 정보", "취득 정보", "보유 상황", "감면 확인"];
const STEPS = isEmbeddedInMulti ? STEPS_MULTI : STEPS_FULL;
const totalSteps = STEPS.length; // 5 또는 6
```

이렇게 하면 `currentStep === totalSteps - 1` 판정이 자동으로 5-step에 맞춰지고, `stepComponents` 배열도 다건일 때 `Step6` 제외.

```tsx
const stepComponents = isEmbeddedInMulti
  ? [Step1, Step2, Step3, Step4, Step5]
  : [Step1, Step2, Step3, Step4, Step5, Step6];
```

**변경 3**: 마지막 step 버튼 영역에서 다건 모드 분기

```tsx
{isLastStep ? (
  isEmbeddedInMulti ? (
    <div className="flex gap-3 w-full">
      <button onClick={() => onSaveAndAddNext?.()}>+ 양도 건 추가</button>
      <button onClick={() => onSaveAndGoToSettings?.()}>공통 설정으로 →</button>
    </div>
  ) : (
    // 기존 단건: 가산세 계산하기 / 세금 계산하기 버튼
  )
) : (
  // 기존 다음 버튼
)}
```

가산세 인라인 카드(`isLastStep && penaltyResult` 조건의 가산세 결과 표시)는 단건 전용이므로 다건 모드에서는 자동으로 표시되지 않음(`isLastStep`이 step 4(감면)에 매칭되므로).

**변경 4**: `validateStep`은 step 0~4까지만 사용되므로 변경 불필요. `handleNext` 동작은 그대로 유지.

### 3. (선택) `lib/stores/multi-transfer-tax-store.ts`

초기 `activeStep`을 `"edit"`로 바꾸는 것은 자산이 없을 때 빈 wizard가 렌더되어 혼란스러우므로 **권장하지 않음**. `"list"`로 두고 `useEffect`로 첫 자산을 자동 추가하는 방식이 안전.

## 재사용 가능한 기존 구조

- `handleAddProperty()` — 기존 함수 그대로 재사용 (auto-mount 시 호출)
- `syncToWizardStore()` — 기존 함수 그대로 재사용
- `calcPropertyCompletion()` — 기존 완성도 계산 재사용
- `AssetTabBar` — 자산 탭바 그대로 재사용 (현재 edit 모드에서 이미 표시됨)
- `AggregateSettingsPanel` — 공통 설정 그대로 재사용 (가산세 입력란 이미 포함)
- `useCalcWizardStore` 및 `resetWizard()` — wizard 상태 리셋에 그대로 사용

## 영향 범위 / 주의 사항

- `TransferTaxCalculator`에 props 추가 → 단건 페이지(`app/calc/transfer-tax/page.tsx`)는 props 미전달이므로 영향 없음(default `= {}`)
- `STEPS` 동적 변경 → `StepIndicator`의 단계 레이블이 다건 모드에서 5개로 표시됨. `setStep(currentStep + 1)`도 자동으로 5-step 범위 내에서 작동
- 가산세 인라인 카드, `handlePenaltyCalc`, `penaltyResult` state는 단건 모드에서만 사용되므로 그대로 유지(다건에서 자동 비활성)
- sessionStorage 키는 다건/단건 분리되어 있으므로(`multi-transfer-tax-wizard`, `transfer-tax-wizard`) 충돌 없음
- 이전 수정에서 `currentStep >= totalSteps && !result` 시 reset하는 useEffect는 그대로 유지(다건에서도 5단계 이후 잘못된 값 방지)
- `handleSubmit`, `handlePenaltyCalc`는 다건 모드에서 호출 경로가 사라지지만 함수 자체는 유지(단건과 코드 공유)

## 검증 방법

1. `npm run dev` 실행
2. 홈에서 "양도소득세 (다건)" 카드 클릭
3. 다음 사항 확인:
   - [ ] 즉시 마법사 step 0(물건 유형 선택)이 나타나야 함
   - [ ] 상단에 AssetTabBar가 보이고 "양도 1번 0%"이 표시되어야 함
   - [ ] 상단 step indicator에 5개 단계만 표시되어야 함 (가산세 미포함)
4. 5단계까지 모두 입력 → 마지막 단계에서 두 버튼이 보여야 함
   - [ ] "+ 양도 건 추가" 클릭 시: 새 자산이 추가되고 wizard가 step 0으로 리셋, AssetTabBar에 "양도 2번"이 활성화됨
   - [ ] "공통 설정으로 →" 클릭 시: settings step으로 이동, `AggregateSettingsPanel` 표시
5. 공통 설정에서 가산세 옵션 입력 → "세액 계산" 클릭 → 결과 표시
6. 단건(`/calc/transfer-tax`)도 정상 작동 확인:
   - [ ] step indicator에 6개 단계 모두 표시
   - [ ] 가산세(step 5) 마법사 화면 정상 표시
   - [ ] "세금 계산하기" 버튼 정상 작동
7. `npm run build` — 타입 오류 0
8. `npm test -- transfer-tax` — 기존 테스트 통과 확인
