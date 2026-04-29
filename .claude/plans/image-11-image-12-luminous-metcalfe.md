# 검용주택 + PHD 모드 "입력값이 올바르지 않습니다" 오류 — 정밀 분석 + 수정 계획

## Context

이미지 11·12와 같이 검용주택(`isMixedUseHouse=true`) + 환산취득가 + PHD(§164⑤) + 토지/건물 분리 + 4-way 결합 모드에서 모든 필드를 올바르게 입력했음에도 "다음" 버튼 클릭 시 이미지 13처럼 **"입력값이 올바르지 않습니다 / 다시 계산하기"** 오류가 발생.

이전 수정(`useEstimatedAcquisition: false` 송신, `addPropertyRefines` 검용주택 분기, `validateAssetAcquisition` 검용주택 전용 분기)으로 일부 검증은 통과했지만 여전히 schema 검증 실패가 남아있다.

**근본 문제**: `callTransferAPI`가 `error.fieldErrors`를 throw 메시지에 포함시키지 않아 어느 필드에서 검증 실패가 발생했는지 사용자도, 콘솔에서도 알 수 없다. 원인을 추측만 할 수 있는 상황.

## 근원 원인 분석

### 핵심 진단 차단 요인

**`lib/calc/transfer-tax-api.ts:670-674`** — API 응답의 `error.fieldErrors`(zod issues 상세)를 폐기하고 `error.message`만 throw:
```ts
const json = await res.json();
if (!res.ok) {
  const msg = json?.error?.message ?? "계산 중 오류가 발생했습니다.";
  throw new Error(msg);  // fieldErrors 손실 → 클라이언트에 "입력값이 올바르지 않습니다"만 표시
}
```

서버 응답에는 `fieldErrors: { "mixedUse.preHousingDisclosure.xxx": ["..."], ... }`가 포함되어 있는데(`app/api/calc/transfer/route.ts:111-126`), 클라이언트가 버려서 디버깅이 불가능.

### 구조적 후보 (확률 순)

#### 1. 면적 필드의 `parseAmount` 절단 (확정 버그, 영향: 계산 정확도)
**`lib/calc/transfer-tax-api.ts:239-242, 281`**
```ts
residentialFloorArea: parseAmount(primary.residentialFloorArea) || 0,    // "333.06" → 333 (소수점 절단)
nonResidentialFloorArea: parseAmount(primary.nonResidentialFloorArea) || 0, // "277.6" → 277
buildingFootprintArea: parseAmount(primary.buildingFootprintArea) || 0,   // "100" → 100 OK
totalLandArea: parseAmount(primary.mixedUseTotalLandArea) || 0,           // "168.3" → 168
residencePeriodYears: parseAmount(primary.mixedUseResidencePeriodYears) || 0, // "28" → 28 OK
```
`parseAmount`는 `parseInt`이므로 소수점 절단. `mixedUseAssetSchema`의 `.positive()`는 정수 강제 안 하므로 schema는 통과(333>0)하지만 엔진 계산이 부정확. 검증 실패의 직접 원인은 아님.

#### 2. `mixedUse.acquisitionStandardPrice.housingPrice = undefined`
**`lib/calc/transfer-tax-api.ts:251`**
```ts
housingPrice: parseAmount(primary.mixedAcqHousingPrice) || undefined,
```
검용주택 PHD에서는 사용자가 미공시이므로 빈 칸. `parseAmount("") = 0`, `0 || undefined = undefined`. schema는 `.optional()`이라 통과. OK.

#### 3. **PHD 토지면적 자동 mirror 안 된 경우** ⚠
`MixedUsePreHousingDisclosureSection`에서 `mixedTransferHousingPrice → phdTransferHousingPrice`는 useEffect로 mirror하지만, **사용자가 PHD 토글을 늦게 켰거나 mixed 값을 PHD 토글 후 변경했을 때** mirror 안 됐을 가능성. 또는 `phdLandPricePerSqmAtAcq` 등이 1991년에 자동 추천되었는데 사용자가 조회만 하고 입력 안 한 경우 0.

`preHousingDisclosureSchema`(`omit landArea`)의 `landPricePerSqmAtAcquisition: z.number().int().positive()` 등 **3개 시점 공시지가는 positive 필수** — 0이면 실패!

이미지 12에서 모든 PHD 필드가 입력된 듯 보이지만, 실제 zustand state에 반영됐는지는 fieldErrors로만 확인 가능.

#### 4. 토지/건물 분리 빈 가액 (가능성 낮음)
`landSplitMode: "apportioned"` 모드에서도 `landTransferPrice`/`buildingTransferPrice`가 **빈 문자열이 아닌 "0"** 으로 저장된 상태라면 `parseAmount("0") = 0`, `0 || undefined = undefined`. OK.

#### 5. `mixedUse.usePreHousingDisclosure` boolean 강제 (가능성 낮음)
schema `z.boolean().optional()`. AssetForm 기본값 boolean. OK.

---

## 수정 계획

### Phase A — 진단 강화 (선결조건, 즉시 적용)

**파일**: `lib/calc/transfer-tax-api.ts`

`callTransferAPI`의 에러 throw에 `fieldErrors`를 포함시켜 클라이언트 콘솔에 노출:

```ts
if (!res.ok) {
  const msg = json?.error?.message ?? "계산 중 오류가 발생했습니다.";
  const fieldErrors = json?.error?.fieldErrors;
  if (fieldErrors && Object.keys(fieldErrors).length > 0) {
    console.error("[transfer-tax API] fieldErrors:", fieldErrors);
    const firstField = Object.keys(fieldErrors)[0];
    const firstMsg = fieldErrors[firstField]?.[0] ?? "";
    throw new Error(`${msg} (${firstField}: ${firstMsg})`);
  }
  throw new Error(msg);
}
```

이로써 화면에 "입력값이 올바르지 않습니다 (mixedUse.preHousingDisclosure.landPricePerSqmAtAcquisition: ...)" 식으로 정확한 실패 필드가 표시됨. 사용자(개발자)가 즉시 원인 파악 가능.

### Phase B — 면적 정수 절단 버그 수정 (확정 버그)

**파일**: `lib/calc/transfer-tax-api.ts:239-242, 281`

`parseAmount` → `parseFloat`로 교체. 이미 `MixedUseStandardPriceInputs`/`computeTransferSummary`에서 `parseFloat`/`parseDecimal` 사용 중이므로 일관성 회복.

```ts
// Before
residentialFloorArea: parseAmount(primary.residentialFloorArea) || 0,
nonResidentialFloorArea: parseAmount(primary.nonResidentialFloorArea) || 0,
buildingFootprintArea: parseAmount(primary.buildingFootprintArea) || 0,
totalLandArea: parseAmount(primary.mixedUseTotalLandArea) || 0,
residencePeriodYears: parseAmount(primary.mixedUseResidencePeriodYears) || 0,

// After
residentialFloorArea: parseFloat(primary.residentialFloorArea) || 0,
nonResidentialFloorArea: parseFloat(primary.nonResidentialFloorArea) || 0,
buildingFootprintArea: parseFloat(primary.buildingFootprintArea) || 0,
totalLandArea: parseFloat(primary.mixedUseTotalLandArea) || 0,
residencePeriodYears: parseFloat(primary.mixedUseResidencePeriodYears) || 0,
```

`mixedUseAssetSchema`의 `z.number().positive()`는 실수 허용이라 검증 통과.

### Phase C — Phase A 결과에 따른 추가 수정

Phase A 적용 후 **실제 fieldErrors를 확인**하고 그 결과에 따라 분기:

#### C-1) PHD 입력값이 0인 경우
사용자가 PHD 필드를 한 번도 입력 안 한 채로 토글만 켠 경우 → `addPropertyRefines`에서는 mixed-use 분기로 우회되지만, `mixedUseAssetSchema.preHousingDisclosure.landPricePerSqmAt*`가 `.positive()`라 0 송신 시 실패.

**해결**: `lib/calc/transfer-tax-api.ts:256-280`에서 PHD 페이로드 빌드 조건을 강화 — 모든 필수 필드가 채워져 있을 때만 `preHousingDisclosure` 객체 송신, 아니면 `undefined`:

```ts
preHousingDisclosure:
  primary.usePreHousingDisclosure &&
  primary.phdFirstDisclosureDate &&
  parseAmount(primary.phdFirstDisclosureHousingPrice) > 0 &&
  parseAmount(primary.phdLandPricePerSqmAtAcq) > 0 &&
  parseAmount(primary.phdLandPricePerSqmAtFirst) > 0 &&
  parseAmount(primary.phdLandPricePerSqmAtTransfer) > 0 &&
  (parseAmount(primary.phdTransferHousingPrice) > 0 ||
    parseAmount(primary.mixedTransferHousingPrice) > 0)
    ? { ... }
    : undefined,
```

또한 `validateAssetAcquisition`(이미 추가된 검용주택 분기, `lib/calc/transfer-tax-validate.ts`)에서 PHD 토글 ON 시 누락 필드 사전 검증해 사용자에게 정확한 메시지 표시.

#### C-2) `acquisitionStandardPrice` 필드 누락
검용주택 PHD에서 `mixedAcqCommercialBuildingPrice`나 `mixedAcqLandPricePerSqm`가 입력 안 됐으면 0 송신. `.nonnegative()`라 통과하지만, **PHD 모드에서는 이 두 값이 사실상 PHD 페이로드의 `landPricePerSqmAtAcquisition`/`buildingStdPriceAtAcquisition`로 대체** — UI에서 PHD ON 시 일반 취득시 공시지가 입력 영역을 readonly나 숨김 처리 필요(별도 후속 작업, 본 plan 범위 외).

#### C-3) `propertyType: "mixed-use-house"` 경로의 schema 추가 검증
`propertySchema.superRefine`에서 일괄양도 검증은 companions=빈배열이라 skip. 다른 검증은 검용주택과 무관.

만약 fieldErrors가 `mixedUse.*` 외 다른 필드(예: `acquisitionPrice`, `expenses`, `transferPrice`)에서 나오면 그 시점에 추가 수정.

---

## 영향받는 파일

| 파일 | 변경 |
|---|---|
| `lib/calc/transfer-tax-api.ts` | Phase A: throw 메시지에 fieldErrors 첫 항목 포함 / Phase B: 면적 5필드 parseAmount→parseFloat / Phase C-1: PHD 페이로드 빌드 조건 강화 |
| `lib/calc/transfer-tax-validate.ts` | (필요 시 C-1 후속) 검용주택 PHD 토글 ON 시 phdLandPricePerSqmAt* 누락 사전 검증 메시지 추가 |

---

## 재사용 가능한 함수 / 패턴

- `parseFloat` (전역) — 면적·연수 등 소수점 입력 파싱. `parseDecimal`(`components/calc/inputs/DecimalInput.tsx:72`)도 동일 동작.
- 기존 `addPropertyRefines`(`lib/api/transfer-tax-schema-sub.ts:271`)의 `propertyType` + `mixedUse.preHousingDisclosure` 인식 로직 — 이미 Phase B 분기 구현됨.
- `parseAmount`(`components/calc/inputs/CurrencyInput.tsx:14`) — 원화 정수 입력 전용. 소수점 필드에는 사용 금지(이미 메모리 규칙 존재).

---

## 검증 (Verification)

### 1. Phase A 진단 적용 후
- 이미지 11·12 시나리오 재현
- 브라우저 DevTools Console 열고 "다음" 클릭
- `[transfer-tax API] fieldErrors: {...}` 로그 확인 → 정확한 실패 필드 파악
- 화면 에러 메시지에 첫 fieldKey + 메시지 표시 확인

### 2. Phase B 적용 후 (면적 절단 버그)
- 콘솔에서 페이로드 확인: `mixedUse.residentialFloorArea === 333.06` (333 아님)
- `mixed-use-house.test.ts` (47개) 통과 유지 — 엔진은 이미 부동소수점 처리 OK

### 3. Phase C-1 적용 후 (PHD 페이로드 빌드)
- PHD 토글 OFF → `mixedUse.preHousingDisclosure: undefined` 송신
- PHD 토글 ON + 필드 일부 미입력 → 클라이언트 검증에서 사전 차단(빨간 메시지)
- PHD 토글 ON + 모든 필드 입력 → 정상 계산, 결과 카드 노출

### 4. 통합
- `npx tsc --noEmit` → 0 error
- `npm test` → 전체 1,714 테스트 통과
- 이미지 11·12 시나리오 → 결과 화면(주택부분 + 상가부분 + 합산세액) 표시
- 6,100,000 × 76.51 = 466,711,000 등 사이드바 미리보기 일치 확인
