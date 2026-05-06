# 장기임대주택 보유자의 거주주택 양도 — UI 설계

> 관련 plan: `docs/00-pm/rental-housing-residence-exception.plan.md`
> 관련 engine: `rental-housing-residence-exception.engine.design.md`

## 사용자 시나리오 (UI 흐름)

### S1. 거주주택 비과세 (RH-A1·A2)
1. Step3 자산 카드에서 양도 자산 = 거주주택 선택
2. **"장기임대주택 보유자 거주주택 비과세 특례 적용"** 토글 ON
3. 임대주택 N호 입력 (등록일·기준시가·임대기간) — 호별 카드 추가
4. 기타 요건 자기확인 체크 (5%증액·등록·임대료 — `LawArticleModal` 링크)
5. Step4 결과: "비과세 (특례 §155⑳)" 배지 + 산출세액 0 또는 §156 고가주택 결과

### S2. PHRP 양도 (RH-B1·B2)
1. 토글 ON 후 시나리오 라디오 = "임대주택을 거주주택으로 전환 후 양도"
2. **직전거주주택 양도일** 입력 (`DateInput`)
3. 3-시점 기준시가 입력 (취득·직전양도·현양도) — 자동조회 버튼 + 직접입력
4. Step4 결과: "비과세 (§161① 안분)" 배지 + 산식 한국어 풀어쓰기 + 과세대상 양도소득금액 + 산출세액

---

## 14개 동기화 지점 매핑

### ① 폼 상태 타입 (`lib/stores/calc-wizard-types.ts`)

```ts
// TransferAssetFormData에 추가
rentalHousingException: {
  applyException: boolean;
  scenario: 'A' | 'B';
  rentalUnits: Array<{
    registrationDate: string;
    rentalType: 'short-4' | 'short-6' | 'long-8' | 'long-10' | 'pre-2018';
    rentalAcquisitionType: 'purchase' | 'construction';
    isApartment: boolean;
    region: 'seoul-metro' | 'non-metro' | 'regulated-area';
    standardPriceAtRentalStart: string;
    rentalMonths: string;
    rentalAutoTermination: boolean;
    requirementsConfirmed: boolean;
  }>;
  priorResidenceTransferDate?: string;
  standardPriceAtAcquisition?: string;
  standardPriceAtPriorTransfer?: string;
  standardPriceAtTransfer?: string;
}
```

### ② Initial value (`lib/stores/calc-wizard-initial.ts`)

```ts
export const INITIAL_RENTAL_HOUSING_EXCEPTION = {
  applyException: false,
  scenario: 'A',
  rentalUnits: [],
  priorResidenceTransferDate: undefined,
  standardPriceAtAcquisition: undefined,
  standardPriceAtPriorTransfer: undefined,
  standardPriceAtTransfer: undefined,
} as const;
```

토글 ON으로 변경 시 `rentalUnits`에 빈 1호 자동 추가.

### ③ Normalize fallback (`lib/calc/transfer-tax-normalize.ts`)

```ts
function normalizeRentalHousingException(raw): NormalizedRentalHousingException {
  if (!raw?.applyException) return { applyException: false };
  return {
    applyException: true,
    scenario: raw.scenario ?? 'A',
    rentalUnits: (raw.rentalUnits ?? []).map(normalizeRentalUnit),
    priorResidenceTransferDate: parseOptionalDate(raw.priorResidenceTransferDate),
    standardPriceAtAcquisition: parseOptionalCurrency(raw.standardPriceAtAcquisition),
    standardPriceAtPriorTransfer: parseOptionalCurrency(raw.standardPriceAtPriorTransfer),
    standardPriceAtTransfer: parseOptionalCurrency(raw.standardPriceAtTransfer),
  };
}
```

**자동 안분 fallback 금지** — 미입력 필드를 다른 값으로 추정하지 않음.

### ④ API 변환 (`lib/calc/transfer-tax-api.ts`)

```ts
function toRentalHousingExceptionApi(asset): RentalHousingExceptionApiPayload | undefined {
  const rh = asset.rentalHousingException;
  if (!rh?.applyException) return undefined;
  return {
    applyException: true,
    scenario: rh.scenario,
    rentalUnits: rh.rentalUnits.map(u => ({
      registrationDate: u.registrationDate,            // ISO string
      rentalType: u.rentalType,
      rentalAcquisitionType: u.rentalAcquisitionType,
      isApartment: u.isApartment,
      region: u.region,
      standardPriceAtRentalStart: parseCurrency(u.standardPriceAtRentalStart),
      rentalMonths: parseDecimal(u.rentalMonths),
      rentalAutoTermination: u.rentalAutoTermination,
      requirementsConfirmed: u.requirementsConfirmed,
    })),
    priorResidenceTransferDate: rh.priorResidenceTransferDate,
    standardPriceAtAcquisition: parseCurrency(rh.standardPriceAtAcquisition),
    standardPriceAtPriorTransfer: parseCurrency(rh.standardPriceAtPriorTransfer),
    standardPriceAtTransfer: parseCurrency(rh.standardPriceAtTransfer),
  };
}

// callTransferTaxAPI body에 spread
const body = {
  ...assetCommon,
  rentalHousingException: toRentalHousingExceptionApi(asset),  // ⑬
};
```

### ⑤ UI 입력 위젯 (`components/calc/transfer/asset/sections/RentalHousingExceptionSection.tsx`)

```tsx
<ToggleCard
  label="장기임대주택 보유자 거주주택 비과세 특례 적용 (소령 §155⑳)"
  trailing={<LawArticleModal article="소득세법 시행령 §155" />}
  active={form.rentalHousingException.applyException}
  onToggle={...}
>
  <RadioCardGroup
    label="시나리오"
    options={[
      { value: 'A', label: '거주주택 양도 (임대주택을 주택수 제외)' },
      { value: 'B', label: '임대주택→거주주택 전환 후 양도 (직전거주주택보유주택)' },
    ]}
    value={form.scenario}
  />

  {/* 임대주택 호별 카드 */}
  <SectionCard tone="emerald" number={1} title="임대주택 정보">
    {rentalUnits.map((unit, i) => (
      <RentalUnitCard key={i} unit={unit} index={i}
        onLawLink={() => openLawModal('소득세법 시행령 §167조의3 제1항 제2호')}
      />
    ))}
    <Button onClick={addRentalUnit}>임대주택 추가</Button>
  </SectionCard>

  {form.scenario === 'B' && (
    <SectionCard tone="amber" number={2} title="직전거주주택 정보 + 3-시점 기준시가">
      <DateInput label="직전거주주택 양도일" value={form.priorResidenceTransferDate} />
      <CurrencyInputWithLookup label="취득 당시 기준시가 (P_acq)"
        value={form.standardPriceAtAcquisition}
        lookupYear={getYear(form.acquisitionDate)} />
      <CurrencyInputWithLookup label="직전거주주택 양도 당시 기준시가 (P_prior)"
        value={form.standardPriceAtPriorTransfer}
        lookupYear={getYear(form.priorResidenceTransferDate)} />
      <CurrencyInputWithLookup label="현 양도 당시 기준시가 (P_transfer)"
        value={form.standardPriceAtTransfer}
        lookupYear={getYear(form.transferDate)} />
    </SectionCard>
  )}

  <SectionCard tone="violet" number={3} title="기타 요건 자기확인">
    <Checkbox label="아파트 제외, 임대료 5% 상한, 등록 요건, 임대료증액 후 1년 이내 재증액 금지 모두 충족"
      trailing={<LawArticleModal article="소득세법 시행령 §155⑳" />}
    />
  </SectionCard>
</ToggleCard>
```

**공용 컴포넌트 사용**:
- `ToggleCard` / `RadioCardGroup` (CLAUDE.md 강제)
- `DateInput` (type="date" 금지)
- `CurrencyInput` 기반 `CurrencyInputWithLookup` 신규 (자동조회+직접입력)
- `LawArticleModal`

### ⑥ 사이드바 합계 (`components/calc/transfer/SideSummary.tsx`)

특례 적용 시 양도세 합계 위에 배지:
```
[특례] 장기임대주택 거주주택 비과세 §155⑳
시나리오: PHRP §161① 안분
```
0원 항목 미표시 정책 유지 — 비과세분은 사이드바 표기 X, 과세분만 합산.

### ⑦ 결과 카드 산식 (`components/calc/transfer/result/AssetResultCard.tsx`)

**한국어 풀어쓰기**:
```
[비과세 적용 — 장기임대주택 보유자 거주주택 특례]
직전거주주택 양도일: 2016년 8월 25일
3-시점 기준시가: 취득 3억 / 직전 4.5억 / 양도 5억

§161① 안분 비율
  = (직전 양도 당시 기준시가 4억 5천만 − 취득 당시 기준시가 3억)
    ÷ (양도 당시 기준시가 5억 − 취득 당시 기준시가 3억)
  = 1억 5천만 ÷ 2억
  = 75%

과세대상 양도소득금액
  = 양도소득금액(표1) 2억 3천 14만 × 75%
  = 1억 7천 260만 5천원

비과세 양도소득금액 = 5천 753만 5천원
```

**금지**: 변수 약어(`r161_1` 등)·`floor()` 표기. 단위 "원" 끝에 미표기(`feedback_no_won_suffix.md`).

### ⑧ Validation (`lib/calc/transfer-tax-validate.ts`)

```ts
function validateRentalHousingException(rh, asset): ValidationError[] {
  if (!rh?.applyException) return [];

  errors = [];

  // 거주주택 보유 2년 / 거주 2년
  if (holdYears(asset) < 2) errors.push('거주주택 보유기간 2년 미만');
  if (asset.liveYears < 2) errors.push('거주주택 거주기간 2년 미만');

  // 임대주택 1호 이상
  if (rh.rentalUnits.length === 0) errors.push('임대주택 정보 1호 이상 필수');

  // 호별 검증
  rh.rentalUnits.forEach((u, i) => {
    if (!u.registrationDate) errors.push(`임대주택 #${i+1} 등록일 미입력`);
    if (!u.standardPriceAtRentalStart) errors.push(`임대주택 #${i+1} 임대개시 기준시가 미입력`);
    if (!u.requirementsConfirmed) errors.push(`임대주택 #${i+1} 기타 요건 자기확인 필요`);
  });

  // B 시나리오 추가 검증
  if (rh.scenario === 'B') {
    if (!rh.priorResidenceTransferDate) errors.push('직전거주주택 양도일 미입력');
    if (!rh.standardPriceAtAcquisition) errors.push('취득 당시 기준시가 미입력');
    if (!rh.standardPriceAtPriorTransfer) errors.push('직전거주주택 양도 당시 기준시가 미입력');
    if (!rh.standardPriceAtTransfer) errors.push('현 양도 당시 기준시가 미입력');

    // 시점 일관성
    if (P_prior < P_acq) errors.push('직전 양도 당시 기준시가가 취득 당시보다 작음 (확인 필요)');
    if (P_transfer < P_prior) errors.push('현 양도 당시 기준시가가 직전 양도 당시보다 작음 (확인 필요)');

    // 자동 안분 fallback 금지 — 미입력 시 명시적 차단
  }

  return errors;
}
```

⑧ 규칙 준수: API/UI fallback 없음 → validate에서 동일하게 차단. UI 통과↔validate 차단 모순 차단.

### ⑨ Zod enum (메인 — `lib/api/transfer-tax-schema.ts`)

```ts
export const RentalScenarioEnum = z.enum(['A', 'B']);
export const RentalTypeEnum = z.enum(['short-4', 'short-6', 'long-8', 'long-10', 'pre-2018']);
export const RentalAcqTypeEnum = z.enum(['purchase', 'construction']);
export const RentalRegionEnum = z.enum(['seoul-metro', 'non-metro', 'regulated-area']);
```

### ⑩ Zod enum (컴패니언 — `lib/api/transfer-tax-schema-sub.ts`)

동일 enum 재export + `addRentalHousingExceptionRefines(schema)` 헬퍼.

### ⑪ 자산-수준 acquisitionDate fallback

해당 없음 — 기존 `acquisitionDate` 그대로 사용. PHRP의 별도 취득일 입력 없음.

### ⑫ Zod 입력 객체 정의 (TypeScript 미감지 영역)

```ts
// transfer-tax-schema.ts
export const rentalUnitSchema = z.object({
  registrationDate: z.string().datetime(),
  rentalType: RentalTypeEnum,
  rentalAcquisitionType: RentalAcqTypeEnum,
  isApartment: z.boolean(),
  region: RentalRegionEnum,
  standardPriceAtRentalStart: z.number().int().nonnegative(),
  rentalMonths: z.number().nonnegative(),
  rentalAutoTermination: z.boolean(),
  requirementsConfirmed: z.boolean(),
});

export const rentalHousingExceptionSchema = z.object({
  applyException: z.boolean(),
  scenario: RentalScenarioEnum,
  rentalUnits: z.array(rentalUnitSchema).min(1),
  priorResidenceTransferDate: z.string().datetime().optional(),
  standardPriceAtAcquisition: z.number().int().nonnegative().optional(),
  standardPriceAtPriorTransfer: z.number().int().nonnegative().optional(),
  standardPriceAtTransfer: z.number().int().nonnegative().optional(),
});

// transferTaxAssetSchema에 통합
export const transferTaxAssetSchema = z.object({
  // ... 기존 필드
  rentalHousingException: rentalHousingExceptionSchema.optional(),
});
```

**중요**: 이 객체 정의가 누락되면 Zod가 알 수 없는 필드를 침묵 stripping. 메모리 `feedback_api_zod_schema_sync.md` 정책 준수.

### ⑬ callTransferTaxAPI body spread (TypeScript 미감지 영역)

```ts
// lib/calc/transfer-tax-api.ts
async function callTransferTaxAPI(form): Promise<TransferTaxResult> {
  const body = {
    transferDate: form.transferDate,
    assets: form.assets.map(a => ({
      ...assetCommonFields(a),
      rentalHousingException: toRentalHousingExceptionApi(a),  // ⑬ 통합
    })),
  };
  return fetch('/api/calc/transfer-tax', { ... });
}
```

**자가 점검**: `grep -n "rentalHousingException" lib/calc/transfer-tax-api.ts` → 헬퍼 정의·body spread 양쪽 매칭 확인.

### ⑭ Route handler 엔진 input 매핑 (TypeScript 미감지 영역)

```ts
// app/api/calc/transfer-tax/route.ts
const validated = transferTaxAssetSchema.parse(body);
const assets = validated.assets.map(a => ({
  ...mapAssetToEngineInput(a),
  rentalHousingException: a.rentalHousingException ? {
    ...a.rentalHousingException,
    rentalUnits: a.rentalHousingException.rentalUnits.map(u => ({
      ...u,
      registrationDate: toDate(u.registrationDate, 'rentalUnit.registrationDate'),
    })),
    priorResidenceTransferDate: toOptionalDate(a.rentalHousingException.priorResidenceTransferDate),
  } : undefined,
}));
const result = calculateTransferTax({ assets, ... });
```

**Date 변환**: `lib/api/date-coerce.ts`의 `toDate`/`toOptionalDate` 강제. `new Date(x)` 직접 호출 금지.

---

## 자동조회 vs 직접입력 토글 UX

`CurrencyInputWithLookup` 신규 컴포넌트:
- 기본 상태: 직접입력
- "자동조회" 버튼 클릭 → 공동주택가격 API 호출 (Phase 2 예정, Phase 1은 비활성 + tooltip)
- 조회 성공 시 값 채워짐 + "자동조회 결과 (수정 가능)" 라벨
- 사용자 수동 변경 시 "수동입력" 라벨로 전환

Phase 1: 직접입력만 활성화. Phase 2에서 국토부 공동주택가격 API 연동.

---

## 자가 점검 체크리스트 (작업 완료 보고 전)

- [ ] 케이스 매트릭스 7행 모두 anchor 테스트 작성됨
- [ ] 14개 동기화 지점 grep 자가 점검 (`rentalHousingException` 등장 횟수 ≥ 14)
- [ ] ⑫⑬⑭ TypeScript 미감지 영역 별도 확인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer/rental-housing-exception/` 통과
- [ ] 사례문제 PDF#1 anchor 17개 모두 toBe() 일치
- [ ] 브라우저 수동 확인: 토글 ON → 임대주택 입력 → 시나리오 B → 3-시점 기준시가 → 결과 §161① 산식 한국어 표기
- [ ] Network 탭에서 request body에 `rentalHousingException` 객체 포함 확인
- [ ] 회귀 테스트: 토글 OFF 시 기존 1세대1주택·고가주택 anchor 영향 없음
