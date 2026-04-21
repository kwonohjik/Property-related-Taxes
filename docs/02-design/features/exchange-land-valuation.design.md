# Design: 환지된 토지 다필지 분리 계산 (exchange-land-valuation)

## 1. 파일 구조

```
lib/tax-engine/
├── multi-parcel-transfer.ts        (신규) — Pure Engine (STEP P-1~P-5)
├── transfer-tax.ts                 (수정) — STEP 0.5 parcels 분기 + 결과 병합
└── legal-codes.ts                  (수정) — REPLOTTING_ACQ_DATE 상수

lib/api/
└── transfer-tax-schema.ts          (수정) — parcelSchema + propertyBaseShape

lib/stores/
└── calc-wizard-store.ts            (수정) — parcelMode + parcels[] 필드

components/calc/
├── inputs/ParcelListInput.tsx      (신규) — 필지 배열 입력 UI
└── results/
    └── TransferTaxResultView.tsx   (수정) — 필지별 breakdown

app/calc/transfer-tax/
└── TransferTaxCalculator.tsx       (수정) — Step2·Step3 다필지 토글

__tests__/tax-engine/
├── multi-parcel-transfer.test.ts   (신규) — MP-1~7
└── exchange-land-integration.test.ts (신규) — EX-1 PDF 원단위

app/api/calc/transfer/{route,multi/route}.ts (수정) — parcels Date 변환

docs/00-pm/exchange-land-valuation.prd.md       (이미 작성)
docs/01-plan/features/exchange-land-valuation.plan.md (이미 작성)
docs/04-report/exchange-land-valuation.report.md  (Report 단계 생성)
```

## 2. Pure Engine 시그니처

```ts
// lib/tax-engine/multi-parcel-transfer.ts
import { applyRate, calculateProration, safeMultiplyThenDivide, calculateHoldingPeriod } from "./tax-utils";

export interface ParcelInput { /* §2-A in plan */ }
export interface ParcelResult { /* §2-B in plan */ }

export interface MultiParcelInput {
  parcels: ParcelInput[];
  totalTransferPrice: number;
  transferDate: Date;
  /** 기본공제 한도 차감용 (단건 엔진에서 계산 후 주입) */
  annualBasicDeductionUsed: number;
  isUnregistered: boolean;
  /** 필지 장특공제 계산에 필요한 메타 */
  longTermHoldingRules: ParsedRates["longTermHoldingRules"];
}

export interface MultiParcelResult {
  parcelResults: ParcelResult[];
  totalTransferPrice: number;
  totalTransferGain: number;          // Σ parcel.transferGain
  totalLongTermHoldingDeduction: number;
  totalTransferIncome: number;        // Σ (transferGain − longTermHoldingDeduction)
  warnings: string[];
}

export function calculateMultiParcelTransfer(
  input: MultiParcelInput,
): MultiParcelResult;
```

### 2-1. 면적 안분 — 잔여값 정확 분배
```ts
const total = parcels.reduce((s, p) => s + p.transferArea, 0);
let accumulated = 0;
parcels.forEach((p, i) => {
  if (i === parcels.length - 1) {
    p.allocated = totalTransferPrice - accumulated;  // 잔여값
  } else {
    p.allocated = calculateProration(totalTransferPrice, p.transferArea, total);
    accumulated += p.allocated;
  }
});
```

### 2-2. 환지확정일 익일 보정
```ts
// UI 단에서 미리 계산해 acquisitionDate에 주입
// 또는 Pure Engine 진입 시:
if (p.useDayAfterReplotting && p.replottingConfirmDate) {
  p.acquisitionDate = addDays(p.replottingConfirmDate, 1);
}
```

## 3. transfer-tax.ts 연동

### STEP 0.5 (신설): parcels 경로 분기
```ts
if (rawInput.parcels && rawInput.parcels.length > 0) {
  const mpResult = calculateMultiParcelTransfer({
    parcels: rawInput.parcels,
    totalTransferPrice: rawInput.transferPrice,
    transferDate: rawInput.transferDate,
    annualBasicDeductionUsed: rawInput.annualBasicDeductionUsed,
    isUnregistered: rawInput.isUnregistered,
    longTermHoldingRules: parsedRates.longTermHoldingRules,
  });

  // 단건 엔진으로 다시 들어가지 않고 직접 합산 결과 사용
  const taxableGain = mpResult.totalTransferGain;
  const longTermHoldingDeduction = mpResult.totalLongTermHoldingDeduction;
  const transferIncome = mpResult.totalTransferIncome;

  // 기본공제·과세표준·산출세액은 기존 헬퍼(calcBasicDeduction, calcTax) 그대로 재사용
  // ↳ steps 배열에 필지별 상세 + 합계 행 순차 push
  // ↳ parcelDetails: mpResult.parcelResults
  // ↳ 이하 R-1~R-5 감면, 지방세는 기존 흐름 그대로 적용
}
```

**장점**: 기존 단건 엔진 로직(기본공제→산출세액→감면→지방세) 재사용. parcels는 **양도차익·장특공제** 계산만 대체.

## 4. API 스키마

### 4-1. `parcelSchema`
```ts
const parcelSchema = z.object({
  parcelId: z.string().min(1),
  parcelLabel: z.string().optional(),
  acquisitionDate: z.string().date(),
  acquisitionMethod: z.enum(["actual", "estimated"]),
  acquisitionPrice: z.number().int().nonnegative().optional(),
  acquisitionArea: z.number().positive(),
  transferArea: z.number().positive(),
  standardPricePerSqmAtAcq: z.number().nonnegative().optional(),
  standardPricePerSqmAtTransfer: z.number().nonnegative().optional(),
  expenses: z.number().int().nonnegative().default(0),
  useDayAfterReplotting: z.boolean().optional(),
  replottingConfirmDate: z.string().date().optional(),
}).superRefine((p, ctx) => {
  if (p.acquisitionMethod === "estimated") {
    if (!p.standardPricePerSqmAtAcq) ctx.addIssue({...});
    if (!p.standardPricePerSqmAtTransfer) ctx.addIssue({...});
  }
  if (p.acquisitionMethod === "actual" && !p.acquisitionPrice) {
    ctx.addIssue({ message: "실가 방식은 취득가액 필수" });
  }
});

// propertyBaseShape에 추가
parcels: z.array(parcelSchema).max(10).optional(),
```

### 4-2. multiInputSchema
- 다건 양도 엔진(다른 과세연도 자산 합산)에는 **현재 범위 밖**. Phase 2에서 고려.

## 5. UI 설계

### 5-1. Step2 (양도 정보)
- 기존 "양도가액" 입력 유지
- 신규 토글: `[○] 다필지 분리 계산 (환지·인접지 합병)`

### 5-2. Step3 (취득 정보) — 다필지 모드
단일 입력 필드 대신 `ParcelListInput` 렌더링:

```tsx
<ParcelListInput
  parcels={form.parcels}
  totalTransferPrice={parseAmount(form.transferPrice)}
  transferDate={form.transferDate}
  onChange={(parcels) => onChange({ parcels })}
/>
```

기능:
- `[+ 필지 추가]` 버튼 (최대 10건)
- 각 행: 라벨 / 취득일 / 취득원인 / 취득면적 / 양도면적 / (실가) 취득가·필요경비 / (환산) 취득시·양도시 ㎡당 단가
- "환지확정일 익일" 체크박스 → 체크 시 환지확정일 입력란 노출 + 자동 +1일 표시
- 실시간 양도가액 안분 프리뷰 (면적비)
- 실시간 환산취득가·개산공제 프리뷰

### 5-3. 결과 카드 (TransferTaxResultView)
필지별 접이식 카드 + 합계:

```
[필지1] 종전 권리분 (1996-02-18 취득, 환산)
  양도가 485,594,405 / 취득가 67,782,886 / 경비 1,178,940
  양도차익 416,632,579 / 장특공제 124,989,773 (30%)
  양도소득금액 291,642,806

[필지2] 과도 취득분 (2007-04-27 취득, 실가)
  양도가 39,405,595 / 취득가 34,000,000 / 경비 0
  양도차익 5,405,595 / 장특공제 1,621,678 (30%)
  양도소득금액 3,783,917

─────────────────────────────────
합계 양도소득금액 295,426,723
```

## 6. 구현 단계 (Do)

1. **Pure Engine** (`multi-parcel-transfer.ts`) — MP-1~7 단위 테스트 동반
2. **transfer-tax.ts STEP 0.5** — parcels 분기 + 결과 병합
3. **legal-codes.ts 상수** 추가
4. **API 스키마 + Route 변환** — parcels Date 주입
5. **Zustand store 확장** — `parcelMode`, `parcels[]`, reset 포함
6. **UI 컴포넌트** — `ParcelListInput` + Step2/3 토글 + 결과 breakdown
7. **통합 테스트** — `exchange-land-integration.test.ts` PDF 원단위 앵커
8. **gap-detector** 실행 → Match Rate ≥ 90% 확인
9. **Report 작성**

## 7. 검증 방법

### 단위 테스트 (MP-1~7)
```bash
npx vitest run __tests__/tax-engine/multi-parcel-transfer.test.ts
```

### 통합 테스트 (EX-1 PDF 원단위)
```bash
npx vitest run __tests__/tax-engine/exchange-land-integration.test.ts
```

### 회귀
```bash
npx vitest run                # 1301+α tests all pass
npx tsc --noEmit              # EXIT=0
```

### 수동 UI 검증
```bash
npm run dev
# /calc/transfer → 토지 → 다필지 토글 ON → PDF 값 입력 → 결과 카드 85,254,495 확인... 
# (이 사례는 §77 감면 없으므로 총납부 9,137,215 + 91,372,154 = 지방세 + 산출)
```

## 8. 체크리스트

- [ ] Pure Engine 단위 테스트 7건 통과
- [ ] PDF 통합 앵커 (양도차익 422,038,174 / 산출 91,372,154 / 지방세 9,137,215) 정확 일치
- [ ] parcels 미제공 시 기존 단필지 흐름 회귀 0건
- [ ] 타입 0 error
- [ ] API zod 스키마 validation
- [ ] UI: 필지 추가·삭제·안분 프리뷰 동작
- [ ] 환지확정일 익일 자동 보정 동작
- [ ] gap-detector ≥ 90%

## 9. 범위 외 명시

- PDF [문제2] 권리면적 감소 + 일부 양도 (2단계 양도 시나리오) — Phase 2
- 종전 토지 면적 환산 유틸 (490 × 305/396.8 = 376.64㎡) — Phase 2
- 1세대1주택 80% 장특공제 다필지 적용 — Phase 2
- 감정평가액·기준시가 방식 다필지 혼합 — Phase 3
