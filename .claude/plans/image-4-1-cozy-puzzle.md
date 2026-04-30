# Plan: 용도변경일 기반 LTHD 정확 계산 + 취득시 면적 직접 입력 토글 수정

## Context

검용주택(겸용주택) 양도소득세 계산에서 두 가지 개선이 필요하다.

1. **용도변경일 LTHD 미반영**: 보유 중 일부 용도변경 시 현재 엔진은 양도시점 기준시가 비율로 양도차익을 1회만 안분하고, 장기보유특별공제는 취득일~양도일 전체 보유기간으로 계산한다. 이로 인해 양도시점 상가면적의 경우 "주택으로 사용 중이던 기간"의 양도차익에도 상가 표1 공제(2%/년, 최대 30%)만 적용되어, 집행기준 89-154-24의 취지(주택 사용 기간을 통산)에 부합하지 않는다.

2. **"취득시 면적 직접 입력" 토글 미작동**: ON 핸들러가 비어있어 사용자가 클릭해도 상태가 변하지 않고 입력 필드도 펼쳐지지 않는다.

---

## Part A. 용도변경일 기반 LTHD 정확 계산

### 법령·집행기준 근거
- 소득세법 §95 ② (장기보유특별공제 보유기간)
- 양도소득세 집행기준 89-154-24 (주택 사용 기간 통산)
- 시행령 §166⑥ (검용주택 양도가액 안분)

### 계산 모델 (시간 비례 분할)

**방향: `house_to_commercial`** (취득시 100% 주택 → 양도시 주택+상가)

```
t_total = 양도일 - 취득일
t1 = 용도변경일 - 취득일  (전체가 주택이었던 기간)
t2 = 양도일 - 용도변경일  (혼용 기간)

Period 1 양도차익 = total gain × (t1 / t_total)  → 100% 주택분
Period 2 양도차익 = total gain × (t2 / t_total)  → 혼합
  Period 2 주택분 = Period 2 양도차익 × 양도시점 housingRatio
  Period 2 상가분 = Period 2 양도차익 × (1 - housingRatio)
```

**LTHD 적용 (세분화):**

| 분류 | 양도차익 | LTHD 보유기간 | 적용 표 |
|---|---|---|---|
| Period 1 (전체 주택) | total × t1/t_total | t1 / 365.25 | 표1 또는 표2 |
| Period 2 주택분 | Period 2 × housingRatio | t2 / 365.25 | 표1 또는 표2 |
| Period 2 상가분 | Period 2 × (1-housingRatio) | t2 / 365.25 | 표1 (항상) |

**최종 합산:**
```
총 주택분 양도소득금액 = (Period 1 + Period 2 주택분) - 각 LTHD 합계
총 상가분 양도소득금액 = Period 2 상가분 - Period 2 상가분 LTHD
```

**방향 `commercial_to_house`** 는 대칭. Period 1이 100% 상가, Period 2가 혼합.

### 토지/건물 분리 처리 시
- 시간 비례 분할은 토지·건물 통합 양도차익에 대해 적용한 후, 토지/건물 양도차익 비율로 다시 분할하는 방식이 가장 단순.
- 또는 토지·건물 각각에 동일한 시간 비례 분할을 적용 (수치적으로 동일).

### 12억 초과 비과세 안분과의 관계
- 비과세 안분(`proratio`)은 Period 1 + Period 2 주택분 합산 양도차익에 적용.
- 비사업용토지 이전(부수토지 배율 초과)은 현재와 동일하게 주택분 토지차익에서 분리.

### Fallback 처리
- `partialChangeDate`가 미입력 또는 무효한 경우: 현재 로직(전체 보유기간 기준) 유지.
- `partialChangeDate ≤ 취득일` 또는 `partialChangeDate ≥ 양도일`: 무효 처리하고 fallback.

### 구현 변경 파일

#### 1. `lib/tax-engine/types/transfer-mixed-use.types.ts` (L94~100)
`partialUsageChange` 인터페이스에 `usageChangeDate?: Date` 추가.

#### 2. `lib/calc/transfer-tax-api.ts` (L298~305)
`partialChangeDate`를 Date 객체로 변환하여 `usageChangeDate`로 엔진에 전달.

#### 3. `lib/tax-engine/transfer-tax-mixed-use-helpers.ts`
- 새 헬퍼: `splitGainByUsagePeriod()` — 시간 비례로 Period 1/2 양도차익 분할.
- `buildHousingPart()` 수정 (L563~651):
  - `usageChangeDate` 유효 시 Period별 양도차익 + 보유기간 분리
  - LTHD를 두 번 계산하여 합산
- `buildCommercialPart()` 수정 (L654~682):
  - `usageChangeDate` 유효 시 Period 2 양도차익만 사용
  - 보유기간 = `t2 / 365.25`
- 결과 타입에 Period별 breakdown 필드 추가 (UI 표시용):
  ```typescript
  usagePeriodSplit?: {
    period1Days: number;
    period2Days: number;
    period1HousingGain: number;
    period2HousingGain: number;
    period2CommercialGain: number;
    period1HousingLTHD: number;
    period2HousingLTHD: number;
    period2CommercialLTHD: number;
  }
  ```

#### 4. `components/calc/transfer/mixed-use/PartialUsageChangeInputs.tsx` (L147~152)
`용도변경일` FieldCard의 `hint`를 `"계산에 사용 안 됨"` → `"LTHD를 용도변경일 전후로 분리 계산 (집행기준 89-154-24)"`으로 변경.

#### 5. 결과 뷰 (`components/calc/results/transfer/MixedUseDetailCard.tsx` 또는 동등 파일)
`usagePeriodSplit` 존재 시 별도 카드로 Period 1/2 양도차익·LTHD 내역 표시.

#### 6. 테스트
`__tests__/tax-engine/transfer-tax/mixed-use/usage-change-period-split.test.ts` 신규:
- 용도변경일 미입력 시 기존 결과 동일 (회귀 방지)
- 용도변경일 입력 시 Period 1/2 양도차익 합 = 총 양도차익
- t1=0 (취득과 동시 변경) → 현재 엔진과 동일 결과
- t2=0 (양도일과 동시 변경) → 모든 양도차익이 Period 1, 100% 주택 LTHD
- house_to_commercial / commercial_to_house 양방향 검증

---

## Part B. 취득시 면적 직접 입력 토글 수정

### 현재 버그 (`PartialUsageChangeInputs.tsx` L108~123)

```typescript
checked={isCustomized}  // !!partialChangeAcqResidentialArea || !!partialChangeAcqCommercialArea
onCheckedChange={(c) => {
  if (!c) {
    onChange({ partialChangeAcqResidentialArea: "", partialChangeAcqCommercialArea: "" });
  }
  // ← ON 분기 없음 → 토글 클릭해도 store 변화 없음 → checked 영원히 false
}}
```

### Fix
ON 시 자동값을 디폴트로 store에 기록하고, 입력 필드를 펼침. 사용자는 즉시 자동값을 확인하고 필요 시 수정 가능.

```typescript
onCheckedChange={(c) => {
  if (!c) {
    onChange({
      partialChangeAcqResidentialArea: "",
      partialChangeAcqCommercialArea: "",
    });
  } else {
    onChange({
      partialChangeAcqResidentialArea: acqResAuto.toFixed(2),
      partialChangeAcqCommercialArea: acqCommAuto.toFixed(2),
    });
  }
}}
```

`acqResAuto`/`acqCommAuto`는 이미 L37~38에서 계산되어 있음 (양도시 합계 + 방향에 따라 결정).

### 부수 변경
- 자동값이 0인 경우(양도시 면적 미입력)에도 `"0.00"` 문자열이 truthy하므로 토글 ON 작동.
- 입력 필드의 `placeholder={`자동: ${acqResAuto.toFixed(2)}`}`는 이미 동작함.
- `(수정됨)` 라벨은 사용자가 자동값과 다르게 입력했을 때만 표시되도록 보강 가능 (선택 사항).

### 구현 변경 파일
- `components/calc/transfer/mixed-use/PartialUsageChangeInputs.tsx` L108~123 (onCheckedChange ON 분기 추가)

---

## 작업 순서

1. **Part B 토글 수정** (1줄 add) → 즉시 작동 확인
2. **Part A 타입 확장** (engine types + API conversion)
3. **Part A 헬퍼 신규** (`splitGainByUsagePeriod`)
4. **Part A buildHousingPart / buildCommercialPart 수정**
5. **Part A 결과 타입 + UI breakdown 카드**
6. **테스트 작성** (회귀 + 신규 케이스)

## 검증

### Part B
- 검용주택 ON → 보유 중 일부 용도변경 ON → 1-A 섹션의 "취득시 면적 직접 입력" 토글 클릭
- 토글이 ON으로 전환되고 주택/상가 연면적 입력 필드가 자동값으로 펼쳐지는지 확인
- 자동값을 수정하여 다른 값 입력 후 결과 변동 확인
- OFF로 되돌리면 두 필드 비워지고 자동값 복귀

### Part A
- 용도변경일 미입력: 기존 케이스(예: PDF 갑氏 사례) 결과 동일 확인
- 용도변경일 중간 입력 (예: 보유 10년 중 5년 시점): Period 1/2 양도차익 합 = 총 양도차익
- house_to_commercial: 양도시점 상가면적의 LTHD가 t1 비례 주택분 + t2 비례 상가분으로 분리 계산되는지 확인
- 결과 카드에서 Period 1/2 breakdown 가시성 확인
- `npm test` 회귀 테스트 통과
