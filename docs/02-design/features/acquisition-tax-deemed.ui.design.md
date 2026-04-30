# 간주취득 취득세 UI 설계 — 인덱스

**작성일**: 2026-05-01
**담당**: acquisition-tax-ui-senior
**대응 엔진**: `lib/tax-engine/acquisition-deemed.ts` (구현 완료)

분량 정책(800줄) 준수를 위해 3개 파일로 분리:

| 파일 | 내용 |
|---|---|
| 본 파일 | 개요·마법사 흐름·Skip 로직·결과 화면 경로·구현 순서 |
| [sync-points-1-4.md](acquisition-tax-deemed.sync-points-1-4.md) | 동기화 지점 ①~④ (FormState·INITIAL_FORM·normalize·API 변환) |
| [sync-points-5-7.md](acquisition-tax-deemed.sync-points-5-7.md) | 동기화 지점 ⑤~⑦ (UI 위젯·사이드바·결과카드) + TaxHelp + 시나리오 |

---

## 1. 개요

### 1.1 간주취득이란

지방세법 §7의2는 **실제 소유권 이전 없이** 경제적 지배력 변동이 발생하는 3가지 사유를
취득으로 간주하여 과세한다. 일반 취득과 성격이 근본적으로 다르다.

| 유형 | 법령 | 과세표준 | 물건 | 세율 | 중과 |
|---|---|---|---|---|---|
| 과점주주 | §7의2① | 법인 자산 × 과세지분율 | 법인 보유 자산 전체 | 2% | 없음 |
| 지목변경 | §7의2② | 변경 후 - 변경 전 시가표준액 | 토지 | 2% | 없음 |
| 건물 개수 | §7의2③ | 개수 후 - 개수 전 시가표준액 | 건물 | 2% | 없음 |

### 1.2 UI 설계 핵심 원칙

- 간주취득은 일반 취득(Step 2~5)과 **계산 구조가 전혀 다르다**. Step 2~5는 간주취득에 무의미하므로 **완전 skip**.
- 간주취득 전용 입력은 기존 Step 1을 **조건부로 대체**하는 방식(Step 1-D)을 채택한다. 별도 Step 추가보다 단순하고 skip 로직 변경 최소화.
- 상장법인 과점주주는 비과세이므로, `isListed = true` 입력 즉시 비과세 안내를 인라인으로 표시하고 이후 입력을 비활성화한다.

---

## 2. 마법사 흐름 (3종 분기)

### 2.1 일반 취득 vs 간주취득 흐름 비교

```
[일반 취득]
Step 0 → Step 1 → Step 2(*) → Step 3 → Step 4(*) → Step 5 → 결과

[간주취득 공통]
Step 0 (acquisitionCause = deemed_*) → Step 1-D (간주취득 상세) → 결과

  (*) 조건에 따라 skip 가능
```

### 2.2 유형별 흐름 상세

#### 과점주주 (deemed_major_shareholder)

```
Step 0:
  취득 원인: "간주취득 — 과점주주" 선택
  물건 유형·취득가액·취득일: 숨김 (간주취득 원인 선택 시 해당 분기 비표시)
  안내 배너: violet — "§7의2 간주취득, 중과세 없음, 다음 단계에서 상세 입력"

Step 1-D (과점주주):
  상장법인 여부 ToggleCard (rose) → ON 시 비과세 안내, 이후 입력 비활성
  법인 보유 자산 시가표준액 (CurrencyInput)
  취득 전 지분율 % (DecimalInput, 0~100)
  취득 후 지분율 % (DecimalInput, 0~100)
  과점주주 도달일 (DateInput)
  자동 계산 미리보기 박스 (amber 색조)

결과: DeemedAcquisitionResultCard (과점주주 전용 산식)
```

#### 지목변경 (deemed_land_category)

```
Step 0:
  취득 원인: "간주취득 — 지목변경" 선택
  물건 유형: "토지"로 자동 설정·표시 (선택 불필요)
  취득가액·취득일: 숨김

Step 1-D (지목변경):
  변경 전 지목 (select — 지목 28종)
  변경 후 지목 (select — 변경 전과 동일 선택 불가)
  지목변경일 (DateInput)
  변경 전 시가표준액 (CurrencyInput)
  변경 후 시가표준액 (CurrencyInput)
  자동 계산 미리보기 (sky 색조): "과세표준 = 변경 후 - 변경 전"

결과: DeemedAcquisitionResultCard (지목변경 전용 산식)
```

#### 건물 개수 (deemed_renovation)

```
Step 0:
  취득 원인: "간주취득 — 건물 개수" 선택
  물건 유형: "건물"로 자동 설정·표시 (선택 불필요)
  취득가액·취득일: 숨김

Step 1-D (건물 개수):
  개수 유형 RadioCardGroup (amber, 3종)
    structural_change / use_change / major_repair
  개수 완료일 (DateInput)
  개수 전 시가표준액 (CurrencyInput)
  개수 후 시가표준액 (CurrencyInput)
  자동 계산 미리보기 (violet 색조): "과세표준 = 개수 후 - 개수 전 / 세액 = × 2%"

결과: DeemedAcquisitionResultCard (건물 개수 전용 산식)
```

### 2.3 Step 1 내부 분기 구조

`Step1.tsx`에 `acquisitionCause` prop을 추가해 내부 조건부 렌더:

```
[Step1.tsx 내부 분기]
isDeemedAcquisition?
  → true:
      "deemed_major_shareholder" → <MajorShareholderPanel />
      "deemed_land_category"     → <LandCategoryPanel />
      "deemed_renovation"        → <RenovationPanel />
  → false:
      기존 물건 상세 UI (면적·시가표준액·사치성)
```

800줄 초과 시 `DeemedStep1.tsx` 파일로 추출.

---

## 3. Skip 로직 (`computeNextStep`)

`AcquisitionTaxForm.tsx`의 `computeNextStep` 함수 변경:

```ts
// 간주취득 판별 헬퍼
function isDeemedAcquisitionCause(cause: string): boolean {
  return ["deemed_major_shareholder", "deemed_land_category", "deemed_renovation"]
    .includes(cause);
}

function computeNextStep(current: number, form: FormState, forward: boolean): number {
  const isDeemed = isDeemedAcquisitionCause(form.acquisitionCause);

  // 간주취득: Step 0 → Step 1 → 결과 (-1 = 계산 트리거 시그널)
  if (isDeemed) {
    if (forward) {
      if (current === 0) return 1;
      if (current === 1) return -1;  // -1: handleNext에서 API 호출
    } else {
      if (current === 1) return 0;
      if (current === 0) return -99; // 홈으로
    }
  }

  // 기존 일반 취득 로직 유지
  const isHousing = form.propertyType === "housing";
  const isCorporation = form.acquiredBy === "corporation";
  const isLuxury = form.isLuxuryProperty;
  const hasSpecialRate = !!form.specialRateType;

  const shouldSkipStep2 = !isHousing;
  const shouldSkipStep4 = !isCorporation && !isLuxury && !hasSpecialRate;

  if (forward) {
    let next = current + 1;
    if (next === 2 && shouldSkipStep2) next = 3;
    if (next === 4 && shouldSkipStep4) next = 5;
    return next;
  } else {
    let prev = current - 1;
    if (prev === 4 && shouldSkipStep4) prev = 3;
    if (prev === 2 && shouldSkipStep2) prev = 1;
    return prev;
  }
}
```

`handleNext` 변경 — `nextStep === -1` 시 API 호출:

```ts
const handleNext = async () => {
  const err = validateStep(step, form);
  if (err) { setError(err); return; }
  setError(null);

  const nextStep = computeNextStep(step, form, true);

  if (nextStep === -1) {
    // 간주취득 Step 1에서 계산 트리거
    setLoading(true);
    try {
      const res = await callAcquisitionTaxAPI(form);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
    return;
  }

  if (!isLastStep) {
    setStep(nextStep);
  } else {
    // 기존 Step 5 계산 로직
    setLoading(true);
    try {
      const res = await callAcquisitionTaxAPI(form);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }
};
```

버튼 텍스트:
```tsx
{(isDeemedAcquisitionCause(form.acquisitionCause) && step === 1) || isLastStep
  ? "취득세 계산"
  : "다음"}
```

---

## 4. 결과 화면 경로

### 4.1 Step 표시 동적화

```ts
// AcquisitionTaxForm.tsx
const activeSteps = isDeemedAcquisitionCause(form.acquisitionCause)
  ? ["취득 정보", "간주취득 상세"]
  : STEPS;

<StepIndicator steps={activeSteps} current={step} />
```

### 4.2 Step 1에서 결과 조건부 렌더

```tsx
{step === 1 && (
  <>
    {result ? (
      <div className="space-y-4">
        <AcquisitionTaxResultView
          result={result}
          isRegulatedArea={form.isRegulatedArea}
          isCorporation={isCorporation}
          onGoToStep={(s) => { setResult(null); setError(null); setStep(s); }}
        />
        <button onClick={() => setResult(null)}>조건 변경 후 재계산</button>
      </div>
    ) : (
      <Step1 ... />
    )}
  </>
)}
```

### 4.3 AcquisitionTaxResultView 내 배치

```tsx
// 기존 과세 정보 요약 카드 앞에 배치
{isDeemedAcquisition && <DeemedAcquisitionResultCard result={result} />}

// 간주취득 시 불필요한 컴포넌트 숨김
{!isDeemedAcquisition && <SurchargeFlowDiagram result={result} />}
{!isDeemedAcquisition && <HouseCountVerifier result={result} />}
{!isDeemedAcquisition && <RateScenarioTable ... />}
{!isDeemedAcquisition && <LinearInterpolationGraph ... />}
{!isDeemedAcquisition && <ReductionPossibilityPanel ... />}
```

---

## 5. 구현 순서 (Do 단계)

1. `shared.ts` — FormState 15개 필드 추가 + INITIAL_FORM + ACQUISITION_CAUSE_LABELS + LAND_CATEGORY_OPTIONS
2. `normalize.ts` — 15개 필드 fallback 추가
3. `acquisition-tax-api.ts` — `deemedInput` 변환 블록 추가
4. `Step0.tsx` — optgroup 구조 + 안내 배너
5. `Step1.tsx` (또는 `DeemedStep1.tsx`) — 3종 패널 구현
6. `AcquisitionTaxForm.tsx` — computeNextStep·handleNext·activeSteps 변경
7. `AcquisitionSidebar.tsx` — 간주취득 분기 추가
8. `AcquisitionTaxResultView.tsx` — `DeemedAcquisitionResultCard` 신설
9. `npx tsc --noEmit` 오류 0건
10. `npx vitest run __tests__/tax-engine/acquisition-deemed/` 회귀
11. 브라우저 시나리오 8종 수동 확인

---

## 6. Definition of Done 자가 점검표

- [ ] 디자인 문서 3개 파일 모두 완성 (본 파일 + sync-points-1-4 + sync-points-5-7)
- [ ] FormState 15개 신규 필드 추가
- [ ] INITIAL_FORM 전부 `undefined`
- [ ] normalize.ts 15개 fallback
- [ ] API 변환 `deemedInput` 중첩 객체 조합
- [ ] ACQUISITION_CAUSE_LABELS 3종 + optgroup 구조
- [ ] Step 1-D 3종 패널 (컴포넌트 패턴 준수)
- [ ] computeNextStep 간주취득 경로 + handleNext -1 트리거
- [ ] validateStep step=1 간주취득 유효성 검증
- [ ] 사이드바 간주취득 분기
- [ ] DeemedAcquisitionResultCard 한국어 산식
- [ ] 상장법인 비과세 경로 완전 차단
- [ ] `npx tsc --noEmit` 0건
- [ ] 회귀 테스트 통과
- [ ] 브라우저 수동 확인
- [ ] `ui-engine-sync-checker` 호출 결과 첨부
