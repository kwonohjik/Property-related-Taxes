# C-1 취득일 거래정지 — 엔진 설계 (stock-transfer-halt-acquisition-c1)

> 계획: `docs/00-pm/stock-transfer-halt-acquisition-c1.plan.md` · 기준 origin/master `68ddb510`
> 법령: 소법 §99①3·④ + 소령 §165③ 후문("양도일ㆍ취득일 이전 1개월") + §165④ + 상증령 §52의2③ (계획 §1 축자 검증 완료 · §165⑤ 비적용 판정 확정)

## 1. 케이스 인벤토리 (계획 §3 매트릭스 → 엔진 동작)

| # | 케이스 | 엔진 분기 | 결과 |
|---|---|---|---|
| M-1 | 취득정지 단독 + 상장 + estimated | ★신규 분기 | 혼합 환산: 분자=§165④ 취득 보충평가 · 분모=양도 1개월 종가평균 |
| M-2 | 양도정지+취득정지 동시 | 기존 `:288` 분기 선행 (신규 분기 미도달) | 양·취 보충평가 — 양도정지 단독과 전 필드 동일 |
| M-3 | 양도정지 단독 | 변경 0 | PR #150 현행 |
| M-4 | 취득정지 + 취득후상장 | validate·Zod 차단 (엔진 미도달) | — |
| M-5 | 취득정지 + unlisted | `:312` unlisted 분기 선행 (silent 무시) | 비상장 단독과 동일 |
| M-6 | 취득정지 + actual/face_value/sale_case | estimated 외 분기 — 필드 미참조 | 무영향 |
| M-7 | 취득정지 + split/lots | `isSplitMode`(`:55`) 실가 전용 — 상호배타 | 무영향 |
| M-8 | + netAssetOnlyReason | 분자 = 취득연도 NA 단독 | §165④3 |
| M-9 | + isHeavyRealEstateForValuation | 분자 가중 2:3 반전 | §165④1 괄호 |
| M-10 | + K-OTC exempt | `exempt-informational-acquisition.ts` mirror 분기 | 정보성 취득가 본체와 동일 산식 |
| M-11 | 분모/분자 ≤0 (validate 우회) | division 가드 | acquisitionPrice 0 + warning |

## 2. 타입 변경 (`types/stock-transfer.types.ts`)

```ts
// StockTransferInput — tradingHaltAtTransfer(:188) 직후
/**
 * 취득일 거래정지·관리종목 (소령 §165③ 후문 "양도일ㆍ취득일 이전 1개월" — 취득 시점).
 * true 시 취득시 기준시가만 §165④ 보충 평가(취득연도 NI/NA), 양도시 기준시가는 1개월 종가평균 유지.
 * §165⑤ 비적용 판정(계획 §1.2 — 계산식이 상장일 기반 취득 후 상장 전제). optional — 기존 호출부 보존.
 */
tradingHaltAtAcquisition?: boolean;
```

```ts
// valuationDetail.method 유니온(:493-500)에 추가
| "halt_acquisition_conversion"

// appliedRules 유니온(:676-695)에 추가
| "취득일거래정지우회"
```

result 신규 필드 없음 — 혼합 환산 echo는 기존 valuationDetail 필드 재사용:
`conversionAcqStdPerShare`(분자=취득 보충평가 1주당)·`conversionTransferStd`(분모=종가평균)·`niPerShare`·`naPerShare`(취득연도 echo)·`isHeavyRE`·`netAssetOnlyReason`·`weightedAvgPerShare`(floor 전 가중평균)·`acquisitionStdPriceTotal`.
**주석 갱신 필수**: `niPerShare`/`naPerShare`(types:519-522 "[사례 49] 양도연도" → C-1은 취득연도 겸용)·`acquisitionStdPriceTotal`(types:527-528 "[사례 49] acqFaceValuePerShare × shareCount" → C-1은 보충평가 × shareCount 겸용).

## 3. 신규 헬퍼 — `stock-valuation-unlisted.ts` export 추가

```ts
export interface AcquisitionSideSupplementaryResult {
  /** 취득시 1주당 보충평가액 (floor) — 80% 하한 미적용 (양측 경로 분자 관행 :422-423 일관) */
  perShare: number;
  /** floor 전 가중평균 raw (NA 단독 시 NA 그대로) */
  weightedRaw: number;
  /** 비타입 문자열 규칙 (호출부 warnings로 전달 — :305-310 패턴) */
  appliedRules: string[];
  warnings: string[];
}

/**
 * 취득시 1주당 §165④ 보충평가 단독 산출 (C-1 취득일 거래정지 전용)
 * - 가중치 연혁: getValuationWeights(transferDate) — 양측 경로(:277)와 동일 (양도시점 과세)
 * - netAssetOnlyReason 시 취득연도 NA 단독 (:313-314와 동일 규율)
 * - isHeavyRealEstateForValuation 시 2:3 반전 (:355-356)
 */
export function calcAcquisitionStdPerShareSupplementary(
  input: StockTransferInput,
): AcquisitionSideSupplementaryResult
```

구현 골격: 기존 양측 경로의 취득기준시가 산출부(`:422-430`)와 **동일 산식** — `getValuationWeights`·`calcWeightedAvgPerShare` 내부 함수 재사용 (파일 내 export 추가만, 이동 없음). NA 단독 분기는 `:291-315` 취득측 서브셋. dual-truth 금지 — 양측 경로를 이 헬퍼로 치환하는 리팩터링은 **비스코프** (회귀 면적 최소화, 자기일관 anchor로 동일성 증명).

appliedRules 구성 (legal-codes 상수 — 문자열 리터럴 금지):
- 공통: `STOCK.ENFORCEMENT_DECREE_165_3_TRADING_HALT` (`legal-codes/stock.ts:174`)
- 가중평균 경로: `STOCK.ENFORCEMENT_DECREE_165_4_1_WEIGHTED_AVG` (+ heavyRE 시 "부동산과다보유가중치반전" — `:360` 패턴)
- NA 단독 경로: 사유별 `ENFORCEMENT_DECREE_165_4_3_*` (`:293-308` switch 재사용)

## 4. 본체 분기 (`stock-transfer-tax.ts` — unlisted 블록(:312-349)과 listed(:351) 사이)

```ts
} else if (input.tradingHaltAtAcquisition) {
  // 취득일 거래정지 — 취득시 기준시가만 §165④ 보충 평가 (소령 §165③ 후문, §165⑤ 비적용 판정)
  appliedRules.push("취득일거래정지우회");
  const acqSide = calcAcquisitionStdPerShareSupplementary(input);
  const transferStd = Math.floor(input.transferDatePriceAvg1Month ?? 0);
  if (acqSide.perShare <= 0 || transferStd <= 0) {
    // division 가드 — validate 우회(엔진 직접 호출) 방어 (stock-valuation-listed.ts:70-83 패턴)
    acquisitionPrice = 0;
    estimatedBase = 0;
    warnings.push(
      transferStd <= 0
        ? "양도일 직전 1개월 종가평균이 0 이하 — 환산취득가 산출 불가"
        : "취득시 보충평가액이 0 이하 — 취득연도 순손익·순자산가치를 확인하세요",
    );
  } else {
    acquisitionPrice = Number(
      (BigInt(transferPrice) * BigInt(acqSide.perShare)) / BigInt(transferStd),
    );
    estimatedBase = acqSide.perShare * shareCount;   // §163⑥4 base
  }
  valuationDetail = {
    method: "halt_acquisition_conversion",
    netAssetFloorApplied: false,                      // 분자 80% 하한 미적용 관행
    finalPerShareValue: acqSide.perShare,
    conversionAcqStdPerShare: acqSide.perShare,
    conversionTransferStd: transferStd,
    weightedAvgPerShare: Math.floor(acqSide.weightedRaw),
    niPerShare: input.acquisitionYearNetIncomePerShare,
    naPerShare: input.acquisitionYearNetAssetPerShare,
    isHeavyRE: input.isHeavyRealEstateForValuation,
    netAssetOnlyReason: input.netAssetOnlyReason,
    acquisitionStdPriceTotal: acqSide.perShare * shareCount,
  };
  warnings.push(...acqSide.warnings);
  for (const rule of acqSide.appliedRules) warnings.push(rule);
}
```

- `usedEstimatedAcquisition = true`는 estimated 진입부(:258)에서 기설정 — 추가 작업 없음
- `acquisitionDatePriceAvg1Month` **미참조** (잔존값 silent 무시)

## 5. exempt mirror (`exempt-informational-acquisition.ts`)

`:125` `if (input.tradingHaltAtTransfer || input.marketType === "unlisted")` 블록 **뒤**, `:141` listed 호출 **앞**에 동일 가드의 축약 분기:

```ts
if (input.tradingHaltAtAcquisition) {
  const acqSide = calcAcquisitionStdPerShareSupplementary(input);
  const transferStd = Math.floor(input.transferDatePriceAvg1Month ?? 0);
  const acquisitionPrice = acqSide.perShare > 0 && transferStd > 0
    ? Number((BigInt(transferPrice) * BigInt(acqSide.perShare)) / BigInt(transferStd))
    : 0;
  return {
    acquisitionPrice,
    usedEstimatedAcquisition: true,
    estimatedBase: acqSide.perShare * shareCount,
    postListingDetail: undefined,
    valuationDetail: {
      method: "halt_acquisition_conversion",
      netAssetFloorApplied: false,
      finalPerShareValue: acqSide.perShare,
    },
  };
}
```

## 6. Zod·validate·api·route (14지점 — 계획 §5 표 그대로)

- **⑫** `stock-transfer-tax-schema.ts:228` 인근: `tradingHaltAtAcquisition: z.boolean().optional(),`
- **Zod refine 1건 (M-4)**: superRefine(`:295`) 내 `tradingHaltAtAcquisition && acquiredBeforeListing` → issue "취득 당시 비상장 주식은 취득일 거래정지 대상이 아닙니다" — validate와 문구 일치. ※ 기존 G-5(양도정지+취득후상장)는 validate만 차단·Zod 부재 — **기존 갭(비스코프)**, M-4만 Zod 방어를 두는 비대칭은 의도(신규 필드는 신설 시점에 완전 방어)
- **⑧** `stock-transfer-tax-validate-step2.ts`:
  - `:222` 분자 필수 조건에 `&& !form.tradingHaltAtAcquisition` 추가 (면제)
  - C-6 패턴 신규: `if (form.tradingHaltAtAcquisition && !form.tradingHaltAtTransfer && !form.acquiredBeforeListing)` → `validateAcquisitionSideUnlistedFields(form, errors)` 신규 헬퍼 (취득연도 NA 필수 + NA단독 아닐 시 NI 필수 — `validateUnlistedSimpleFields`(:32) 취득측 서브셋). **`acqFaceValueOnly` 잔존값 무관하게 필수** — UI도 무조건 렌더(ui.design §3)·엔진 분기도 미참조라 3중 정합
  - G-5 패턴 신규 (M-4): `form.tradingHaltAtAcquisition && form.acquiredBeforeListing` → error (Zod와 동일 문구)
- **④** `stock-transfer-tax-api.ts:494` 인근: `body.tradingHaltAtAcquisition = form.tradingHaltAtAcquisition;`
- **⑭** `route.ts:187` 인근: `tradingHaltAtAcquisition: coerced.tradingHaltAtAcquisition as boolean | undefined,`
- **①②③** store `:173`/`:502`/normalize `:146` 인근 boolean·false·boolField

## 7. anchor (계획 §8 — 10건 + E2E 1건)

Pre-Do: 현행 listed 환산 1건 통과 고정 → C1-ENGINE-1~6 · C1-EXEMPT-1 · C1-VALIDATE-1~2 · C1-ZOD-1.
파일: `__tests__/tax-engine/stock-transfer/halt-acquisition-c1.test.ts` (validate는 `validateStep2Domestic` import — A-2 교훈).

| anchor | 핵심 수치 |
|---|---|
| C1-ENGINE-1 | 1,000주 · 양도가 10,000,000 · 분모 10,000 · NI 6,000/NA 5,000 → 분자 5,600 → acquisitionPrice **5,600,000** · estimatedBase 5,600,000 · estimatedDeduction 56,000 |
| C1-ENGINE-2 | NA단독 → 분자 5,000 → **5,000,000** |
| C1-ENGINE-3 | heavyRE → 분자 5,400 → **5,400,000** |
| C1-ENGINE-4 | 양도정지+취득정지 = 양도정지 단독 전 필드 동일 (appliedRules "취득일거래정지우회" 미포함) |
| C1-ENGINE-5 | unlisted+취득정지 = unlisted 단독 동일 |
| C1-ENGINE-6 | 분모 0 → acquisitionPrice 0 + warning |
| C1-EXEMPT-1 | exempt 정보성 = ENGINE-1 동일 산식 |

## 8. 파일 영향 (800줄 정책)

| 파일 | 현행 | 예상 증분 |
|---|---|---|
| stock-transfer-tax.ts | 601 | +40 내외 |
| stock-valuation-unlisted.ts | 553 | +55 내외 |
| exempt-informational-acquisition.ts | 159 | +25 |
| stock-transfer-tax-schema.ts | 681 | +15 (refine) — **700 부근 주시** |
| validate-step2.ts | 411 | +35 |
| types | +10 | — |
