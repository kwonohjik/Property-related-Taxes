# 주식 양도세 — 취득가액 다건 입력 모드 UI 설계 (메인)

> **세목**: 주식 양도소득세 (stock-transfer)
> **참조 Plan**: `docs/00-pm/stock-transfer-acquisition-lots-only.plan.md` v2
> **참조 엔진 디자인**: `stock-split-lots.engine.design.md` (엔진 재사용)
> **상태**: Design v1 (2026-05-18)
> **분리 파일**: [`stock-transfer-acquisition-lots-only.ui.design.guards.md`](stock-transfer-acquisition-lots-only.ui.design.guards.md) — §7~§12 (차단 정책·위험·DoD·참조)

---

## 1. 사용자 시나리오 4종

### S-1. per_share 모드 — 현행 회귀 (L-1, L-2)

- **L-1**: `lotsMode="single"`, `acquisitionActualInputMode="per_share"` (default)
  - 사용자: "단 한 번 매수·한 번 양도. 1주당 가격으로 입력"
  - 취득가액 섹션에 `1주당 취득가액` CurrencyInput 단독 표시 (현행 그대로)

- **L-2**: `lotsMode="single"`, `transferActualInputMode="total"`, `acquisitionActualInputMode="per_share"`
  - 사용자: "양도가액은 총액 직접 입력, 취득가액은 1주당 단가"
  - 서브토글 `일자별 다건` 옵션은 disabled + disabledReason 표시

### S-2. lots 모드 — 3행 다건 취득 + 단일 양도 (L-3)

- `lotsMode="single"`, `transferActualInputMode="per_share"`, `acquisitionActualInputMode="lots"`
- 사용자: "A주식을 2023년·2024년·2025년 세 차례 매수. 2025년 말 전량 한 번에 양도"
- Step2 취득가액 섹션에서 `일자별 다건` 서브토글 선택 → AcquisitionLotsMatrix 노출
- 3행 매수 lot 입력 + 산정방법(FIFO/이동평균) 선택
- 자동 1행 추가: 서브토글 `lots` 선택 순간 빈 row 1개 자동 생성

### S-3. split 모드 진입 시 서브토글 미노출 (L-5)

- `lotsMode="split"` — Step1 SplitLotsBlock에서 매수·매도 lot 모두 입력
- Step2 취득가액 섹션 서브토글 미노출
- 안내 배너: "분할 모드에서는 Step1 lot 입력에서 자동 산출됩니다"

### S-4. total 모드 시 lots 옵션 disabled (L-4 차단)

- `transferActualInputMode="total"` 상태에서 취득가액 서브토글 `일자별 다건` 옵션 disabled
- disabledReason: "양도가액 합계 모드에서는 다건 취득 입력을 지원하지 않습니다 (역산 잔돈 발생 가능)"

---

## 2. UI 명세 — Step2 취득가액 섹션 트리

### 전체 구조 (계획서 §4.1 기반)

```
Step2 취득가액 섹션
│
└ [lotsMode === "split"] → 서브토글 미노출, split 안내 배너만 표시
│
└ [lotsMode === "single"] →
    FieldCard label="취득가액 방식"  (현행 RadioCardGroup, tone=amber)
    └ 실가 (actual)
        │
        └ FieldCard label="입력 방식"  ← 신규 서브 RadioCardGroup (tone=amber, layout="inline")
            ├ 1주당 단가 (per_share, default)
            └ 일자별 다건 (lots)
                disabled: transferActualInputMode === "total"
                disabledReason: "양도가액 합계 모드에서는 다건 취득 입력을 지원하지 않습니다"
        │
        ├ [per_share] → CurrencyInput "1주당 취득가액" (현행 그대로)
        │
        └ [lots] →
            AcquisitionLotsMatrix (신규 sub-component)
            ├ 산정방법 RadioCardGroup (fifo / moving_avg, tone=violet)
            │   └ specific → disabled, disabledReason="양도 단건 모드는 fifo/이동평균만 지원"
            ├ 매수 lot 행 목록
            │   └ 각 행: [취득일 DateInput] [취득원인 Select] [주식수 DecimalInput] [1주당단가 CurrencyInput]
            │            [조건부: 피상속인 취득일 DateInput (inheritance)]
            │            [조건부: 종전 주식 취득일 DateInput (merger_split)]
            │            [삭제 버튼 Trash2]
            ├ + 매수 행 추가 Button
            └ 합계 미리보기 (총 매수 주식수 / 가중평균 단가)

    [estimated / sale_case / appraisal / face_value] → 무변경 (서브토글 미노출)
```

### 신규 서브 RadioCardGroup 구현 코드

```tsx
// Step2.tsx — 실가 취득가액 섹션 내, perShareAcquisitionPrice CurrencyInput 직전 삽입
{acquisitionMode === "actual" && !isSplitMode && (
  <FieldCard label="입력 방식">
    <RadioCardGroup
      name="acquisitionActualInputMode"
      value={acquisitionActualInputMode}
      onChange={(v) => {
        const mode = v as "per_share" | "lots";
        if (mode === "lots" && form.acquisitionLots.length === 0) {
          // 자동 1행 추가 — useEffect 미러링 금지, onChange 내 cross-field
          onChange({
            acquisitionActualInputMode: mode,
            acquisitionLots: [createInitialAcquisitionLot()],
          });
        } else {
          onChange({ acquisitionActualInputMode: mode });
        }
      }}
      tone="amber"
      layout="inline"
      options={[
        {
          value: "per_share",
          label: "1주당 단가",
          description: "1주당 취득가액 × 주식수",
        },
        {
          value: "lots",
          label: "일자별 다건",
          description:
            transferActualInputMode === "total"
              ? "양도가액 합계 모드에서는 지원하지 않습니다"
              : "여러 시점 분할 매수 lot별 입력",
          disabled: transferActualInputMode === "total",
        },
      ]}
    />
  </FieldCard>
)}
```

### 분기 조건 정리

| 조건 | 결과 |
|---|---|
| `lotsMode === "split"` | 서브토글 미노출 + split 안내 배너 |
| `acquisitionMode !== "actual"` | 서브토글 미노출 |
| `transferActualInputMode === "total"` | 서브토글 노출 + lots 옵션 disabled |
| `acquisitionActualInputMode === "per_share"` (default) | 기존 CurrencyInput 단독 |
| `acquisitionActualInputMode === "lots"` | AcquisitionLotsMatrix 노출 |

---

## 3. 케이스 인벤토리 표 (L-1 ~ L-6)

계획서 §6 기반. **행 6개 전수 enumerate** (Design 단계 도입 조건).

| ID | lotsMode | transferActualInputMode | acquisitionActualInputMode | costAllocationMethod | UI 동작 | 엔진 경로 |
|---|---|---|---|---|---|---|
| **L-1** | single | per_share | per_share (default) | N/A | 기존 per_share CurrencyInput | 엔진 단일가 경로 |
| **L-2** | single | total | per_share | N/A | lots 옵션 disabled, per_share CurrencyInput | 엔진 total 경로 |
| **L-3** | single | per_share | **lots** (신규) | fifo / moving_avg | AcquisitionLotsMatrix 표시, API에서 transferLot 합성 | 엔진 split 분기 |
| **L-4** | single | total | lots | - | **Zod refine 차단 + UI disabled** | API 도달 불가 |
| **L-5** | split | N/A | N/A (서브토글 미노출) | specific / fifo / moving_avg | Step1 SplitLotsBlock | 엔진 split 분기 |
| **L-6** | single | per_share | lots | **specific** | specific 옵션 UI disabled + Zod refine 차단 | API 도달 불가 |

---

## 4. 14개 동기화 지점 매트릭스

UI 책임: ①②③⑤⑥ / 엔진(API·Route) 책임: ④⑦⑧⑨⑫⑬⑭

### ① FormData 타입 (`lib/stores/calc-wizard-stock-store.ts` L120 부근)

```typescript
// acquisitionMode 직후 1필드 추가
acquisitionMode: "actual" | "sale_case" | "appraisal" | "estimated" | "face_value";
acquisitionActualInputMode: "per_share" | "lots";  // 3중 패턴 default: "per_share"
```

### ② initial value (`createInitialStockFormData()` L213 부근)

```typescript
acquisitionMode: "actual",
acquisitionActualInputMode: "per_share",  // 3중 패턴 source of truth
```

### ③ normalize (`normalizeStockFormData()` L324 부근)

```typescript
acquisitionMode: enumField("acquisitionMode", ["actual", "sale_case", "appraisal", "estimated", "face_value"], defaults.acquisitionMode),
acquisitionActualInputMode: enumField(  // 신규
  "acquisitionActualInputMode",
  ["per_share", "lots"],
  defaults.acquisitionActualInputMode,  // "per_share"
),
```

sessionStorage에 `acquisitionActualInputMode` 미존재 시 → `enumField`가 `"per_share"` 반환 → 기존 사용자 자동 per_share 유지.

### ④ API 변환 (`lib/calc/stock-transfer-tax-api.ts`) — 엔진 시니어 책임

acquisitionMode === "actual" 분기 내 추가:

```typescript
const acqInputMode = form.acquisitionActualInputMode || "per_share";  // 3중 패턴 default

if (acqInputMode === "lots" && form.lotsMode === "single") {  // v2 명시
  body.acquisitionActualInputMode = acqInputMode;  // ⑬ body spread 명시
  body.costAllocationMethod = form.costAllocationMethod || "fifo";
  body.acquisitionLots = form.acquisitionLots.map((lot) => {
    const o: Record<string, unknown> = {
      id: lot.id,
      acquisitionDate: lot.acquisitionDate,
      shareCount: parseIntOrUndef(lot.shareCount) ?? 0,
      perShareAcquisitionPrice: parseIntOrUndef(lot.perShareAcquisitionPrice) ?? 0,
      acquisitionCause: lot.acquisitionCause,
    };
    if (lot.acquisitionCause === "inheritance" && lot.decedentAcquisitionDate)
      o.decedentAcquisitionDate = lot.decedentAcquisitionDate;
    if (lot.acquisitionCause === "merger_split" && lot.preMergerAcquisitionDate)
      o.preMergerAcquisitionDate = lot.preMergerAcquisitionDate;
    return o;
  });
  // 합성 transferLot — ID 충돌 차단용 명시 prefix
  body.transferLots = [{
    id: "__synth_single_transfer__",
    transferDate: form.transferDate,
    shareCount: parseIntOrUndef(form.shareCount) ?? 0,
    perShareTransferPrice: parseIntOrUndef(form.perShareTransferPrice) ?? 0,
  }];
  // ⑪ acquisitionDate fallback — 가장 오래된 매수 lot 일자
  const oldestLotDate = form.acquisitionLots
    .map((l) => l.acquisitionDate)
    .filter((d) => d && d.length > 0)
    .sort()[0];
  if (oldestLotDate && !body.acquisitionDate) {
    body.acquisitionDate = oldestLotDate;
  }
} else {
  // 기존 per_share 경로
  const perAcq = parseIntOrUndef(form.perShareAcquisitionPrice);
  if (perAcq !== undefined) body.perShareAcquisitionPrice = perAcq;
}
```

### ⑤ UI 입력 위젯 — Step2.tsx + AcquisitionLotsMatrix.tsx

**변경 파일**: `app/calc/stock-transfer-tax/steps/Step2.tsx` (현행 338줄)
예상 증분: +약 80줄 → ~418줄 (800줄 정책 안전)

**신규 파일**: `components/calc/stock-transfer/AcquisitionLotsMatrix.tsx`
(§5 상세 명세 참조)

**Step2 localvar 추가**:
```tsx
const acquisitionActualInputMode = form.acquisitionActualInputMode || "per_share";

const createInitialAcquisitionLot = (): AcquisitionLotForm => ({
  id: nanoid(),
  acquisitionDate: "",
  shareCount: "",
  perShareAcquisitionPrice: "",
  acquisitionCause: "purchase",
});
```

**취득가액 실가 분기 교체 (split 미노출 + 서브토글 + lots/per_share 분기)**:
```tsx
{/* single 모드 — 서브토글 포함 */}
{acquisitionMode === "actual" && !isSplitMode && (
  <>
    <FieldCard label="입력 방식">
      {/* RadioCardGroup — §2 구현 코드 참조 */}
    </FieldCard>
    {acquisitionActualInputMode === "per_share" && (
      <CurrencyInput label="1주당 취득가액" required ... />
    )}
    {acquisitionActualInputMode === "lots" && (
      <AcquisitionLotsMatrix
        lots={form.acquisitionLots}
        onChange={(lots) => onChange({ acquisitionLots: lots })}
        costAllocationMethod={form.costAllocationMethod}
        onCostMethodChange={(v) => onChange({ costAllocationMethod: v })}
      />
    )}
  </>
)}
{/* split 모드 — 기존 disabled CurrencyInput */}
{acquisitionMode === "actual" && isSplitMode && (
  <CurrencyInput label="1주당 취득가액" required disabled
    hint="분할 모드에서는 매수 lot에서 자동 산출됩니다 (Step1 참조)"
    value={form.perShareAcquisitionPrice}
    onChange={(v) => onChange({ perShareAcquisitionPrice: v })}
  />
)}
```

### ⑥ 사이드바 합계 (`StockSidebar.tsx` single 분기 취득가액 계산)

현행 single 모드 L102-L115 교체:

```typescript
} else {
  const acqInputMode = formData.acquisitionActualInputMode || "per_share";

  if (acqInputMode === "lots" && formData.acquisitionLots.length > 0) {
    // 가중평균 단가 × 양도 주식수 (근사치 — FIFO와 다를 수 있음)
    const totalShares = formData.acquisitionLots.reduce(
      (s, l) => s + parseInt(l.shareCount || "0", 10), 0,
    );
    const totalCost = formData.acquisitionLots.reduce(
      (s, l) =>
        s + parseAmount(l.perShareAcquisitionPrice) * parseInt(l.shareCount || "0", 10),
      0,
    );
    const weightedAvg = totalShares > 0 ? Math.floor(totalCost / totalShares) : 0;
    const transferCount = parseInt(formData.shareCount || "0", 10);
    acqPrice = weightedAvg > 0 && transferCount > 0 ? weightedAvg * transferCount : null;
  } else {
    const perShareAcq = parseAmount(formData.perShareAcquisitionPrice);
    const count = parseInt(formData.shareCount || "0", 10);
    acqPrice = perShareAcq > 0 && count > 0 ? perShareAcq * count : null;
  }
}
```

결과(result) 있으면 `result.acquisitionPrice` 우선 (기존 로직 유지).

### ⑦ 결과 카드 (`StockTransferTaxResultView.tsx`) — 변경 없음

`lotMatchingDetail` 기존 `LotMatchingDetailCard` (L297·L305) 자동 표시. lots-only도 동일 엔진 split 분기 → 동일 결과 구조.

### ⑧ Validation (`lib/calc/stock-transfer-tax-validate.ts`) — 엔진 시니어 책임

```typescript
// Step2 검증 — lots 모드 추가
if (
  form.acquisitionMode === "actual" &&
  (form.acquisitionActualInputMode || "per_share") === "lots"
) {
  if (!form.acquisitionLots || form.acquisitionLots.length === 0) {
    errors.push("취득 lot을 1건 이상 입력하세요");
  } else {
    const totalAcqShares = form.acquisitionLots.reduce(
      (s, l) => s + parseInt(l.shareCount || "0", 10), 0,
    );
    const transferShares = parseInt(form.shareCount || "0", 10);
    if (totalAcqShares < transferShares) {
      errors.push(
        `매수 lot 합계(${totalAcqShares}주)가 양도 주식수(${transferShares}주)보다 적습니다`,
      );
    }
    form.acquisitionLots.forEach((lot, i) => {
      if (!lot.acquisitionDate)
        errors.push(`매수 lot #${i + 1}: 취득일을 입력하세요`);
      if (!lot.shareCount || parseInt(lot.shareCount, 10) <= 0)
        errors.push(`매수 lot #${i + 1}: 주식수를 입력하세요`);
      if (!lot.perShareAcquisitionPrice || parseInt(lot.perShareAcquisitionPrice, 10) <= 0)
        errors.push(`매수 lot #${i + 1}: 1주당 단가를 입력하세요`);
    });
  }
}
// L-4 차단
if (
  (form.transferActualInputMode || "per_share") === "total" &&
  (form.acquisitionActualInputMode || "per_share") === "lots"
) {
  errors.push("양도가액 합계 모드와 취득 다건 입력 모드를 동시에 사용할 수 없습니다");
}
```

### ⑨⑩ Zod enum (`lib/api/stock-transfer-tax-schema.ts`) — 엔진 시니어 책임

```typescript
export const acquisitionActualInputModeSchema = z.enum(["per_share", "lots"]);
// 기존 stockTransferInputSchema 객체에 추가:
acquisitionActualInputMode: acquisitionActualInputModeSchema.optional(),
// addStockRefines L-4 refine 추가 (§8 guards.md 참조)
```

### ⑫⑬⑭ 상세 — `guards.md` §3 참조

---

## 5. `AcquisitionLotsMatrix` 컴포넌트 분리 명세

### 위치 및 Props

`components/calc/stock-transfer/AcquisitionLotsMatrix.tsx` — 신규 파일

### 선결 — 공통 상수·팩토리 export (v2 추가)

- **`ACQ_CAUSE_LABEL`** (`SplitLotsBlock.tsx:52` 내부 const): `export const`로 변경하여 `AcquisitionLotsMatrix`에서 import — 중복 방지
- **`createEmptyAcquisitionLot()`** 팩토리 신설: `lib/stores/calc-wizard-stock-store.ts`에 `export function createEmptyAcquisitionLot(): AcquisitionLotForm`. `SplitLotsBlock.tsx:88~96 addAcquisitionLot` 인라인 객체 + `AcquisitionLotsMatrix.tsx addLot` 인라인 + Step2 onChange 자동 1행 추가 분기 등 **3곳에서 공유** (R-12 해결)

```typescript
interface AcquisitionLotsMatrixProps {
  lots: AcquisitionLotForm[];
  onChange: (lots: AcquisitionLotForm[]) => void;
  costAllocationMethod: StockTransferFormData["costAllocationMethod"];
  onCostMethodChange: (method: StockTransferFormData["costAllocationMethod"]) => void;
}
```

### SplitLotsBlock과의 차이점

| 항목 | SplitLotsBlock | AcquisitionLotsMatrix |
|---|---|---|
| 매도 lot 행렬 | 포함 (ⓑ 섹션) | **미포함** (단일 양도는 Step2 단가로) |
| specific 매칭 행렬 | 포함 (ⓔ 섹션) | **미포함** (transferLots 의존 없음) |
| specific 옵션 | 활성 | **disabled** + disabledReason |
| 합계 미리보기 | 매수+매도 잔량 | 매수 합계 + 가중평균 단가만 |

### JSX 구조

```tsx
export function AcquisitionLotsMatrix({
  lots, onChange, costAllocationMethod, onCostMethodChange,
}: AcquisitionLotsMatrixProps) {
  const summary = useMemo(() => {
    const totalAcq = lots.reduce((s, l) => s + parseInt(l.shareCount || "0", 10), 0);
    const totalCost = lots.reduce(
      (s, l) =>
        s + parseAmount(l.perShareAcquisitionPrice) * parseInt(l.shareCount || "0", 10),
      0,
    );
    return {
      totalAcq,
      weightedAvg: totalAcq > 0 ? Math.floor(totalCost / totalAcq) : null,
    };
  }, [lots]);

  const addLot = () =>
    onChange([
      ...lots,
      {
        id: nanoid(),
        acquisitionDate: "",
        shareCount: "",
        perShareAcquisitionPrice: "",
        acquisitionCause: "purchase",
      },
    ]);
  const updateLot = (idx: number, patch: Partial<AcquisitionLotForm>) =>
    onChange(lots.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const deleteLot = (idx: number) => onChange(lots.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      {/* ⓐ 산정방법 — specific disabled */}
      <RadioCardGroup
        name="costAllocationMethod_acq"
        value={costAllocationMethod}
        onChange={onCostMethodChange}
        tone="violet"
        layout="inline"
        options={[
          {
            value: "specific",
            label: "개별법",
            description: "양도 단건 모드는 지원하지 않습니다 (후속 PR 예정)",
            disabled: true,
          },
          {
            value: "fifo",
            label: "선입선출법",
            description: "먼저 매수한 lot부터 차감 (자동 매칭)",
          },
          {
            value: "moving_avg",
            label: "이동평균법",
            description: "전체 매수 lot 가중평균 단가 (총평균법)",
          },
        ]}
      />

      {/* ⓑ 매수 lot 행 목록 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-amber-800">매수 lot (취득 정보)</h3>
        {lots.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-100/60 rounded p-3">
            매수 행 추가부터 시작하세요.
          </p>
        ) : (
          lots.map((lot, idx) => (
            <div key={lot.id} className="rounded border border-amber-300 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-700">매수 #{idx + 1}</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => deleteLot(idx)}
                  className="text-red-500 hover:text-red-700">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <FieldCard
                  label={lot.acquisitionCause === "gift" ? "수증일" : "취득일"}
                  hint={lot.acquisitionCause === "gift" ? "수증일 (§97의2 미적용)" : "실제 취득일"}
                >
                  <DateInput
                    value={lot.acquisitionDate}
                    onChange={(v) => updateLot(idx, { acquisitionDate: v })}
                  />
                </FieldCard>
                <FieldCard label="취득원인" hint="lot별 §104② 보유기간 기산점">
                  <Select
                    value={lot.acquisitionCause}
                    onValueChange={(v) =>
                      updateLot(idx, {
                        acquisitionCause: v as AcquisitionLotForm["acquisitionCause"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>{ACQ_CAUSE_LABEL[lot.acquisitionCause]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACQ_CAUSE_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldCard>
                <FieldCard label="주식수" hint="lot 수량 (주)">
                  <DecimalInput
                    value={lot.shareCount}
                    onChange={(v) => updateLot(idx, { shareCount: v })}
                    thousandSeparator
                  />
                </FieldCard>
                <CurrencyInput
                  label="1주당 단가"
                  hint={
                    lot.acquisitionCause === "inheritance"
                      ? "상속개시일 §60-66 평가가액 (원)"
                      : lot.acquisitionCause === "gift"
                      ? "수증일 §60-66 평가가액 (원)"
                      : lot.acquisitionCause === "merger_split"
                      ? "1주당 가중평균 취득원가 (원)"
                      : "1주당 실지 매수가 (원)"
                  }
                  value={lot.perShareAcquisitionPrice}
                  onChange={(v) => updateLot(idx, { perShareAcquisitionPrice: v })}
                />
                {lot.acquisitionCause === "inheritance" && (
                  <FieldCard label="피상속인 취득일" hint="§104②1 보유기간 기산점">
                    <DateInput
                      value={lot.decedentAcquisitionDate ?? ""}
                      onChange={(v) => updateLot(idx, { decedentAcquisitionDate: v })}
                    />
                  </FieldCard>
                )}
                {lot.acquisitionCause === "merger_split" && (
                  <FieldCard label="종전 주식 취득일" hint="§104②3 보유기간 기산점">
                    <DateInput
                      value={lot.preMergerAcquisitionDate ?? ""}
                      onChange={(v) => updateLot(idx, { preMergerAcquisitionDate: v })}
                    />
                  </FieldCard>
                )}
              </div>
            </div>
          ))
        )}
        <Button type="button" variant="outline" size="sm" onClick={addLot}>
          + 매수 행 추가
        </Button>
      </div>

      {/* ⓒ 합계 미리보기 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 text-sm text-sky-900">
        <p>총 매수 <strong>{summary.totalAcq.toLocaleString()}주</strong></p>
        {summary.weightedAvg !== null && summary.weightedAvg > 0 && (
          <p className="text-xs mt-1 text-sky-700">
            가중평균 단가: <strong>{summary.weightedAvg.toLocaleString()}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
```

---

## 6. RadioCardGroup onChange 자동 1행 추가 패턴

### 요건 (계획서 §4.4)

`acquisitionActualInputMode === "lots"` 진입 시 `acquisitionLots.length === 0`이면 자동 1행 추가.

### 금지 패턴 (`feedback_useeffect_store_mirror_forbidden`)

```typescript
// 절대 금지 — useEffect → store 미러링 무한 루프
useEffect(() => {
  if (acquisitionActualInputMode === "lots" && form.acquisitionLots.length === 0) {
    onChange({ acquisitionLots: [createInitialAcquisitionLot()] });
  }
}, [acquisitionActualInputMode]);
```

### 허용 패턴 — onChange 내 cross-field 분기

```typescript
onChange={(v) => {
  const mode = v as "per_share" | "lots";
  if (mode === "lots" && form.acquisitionLots.length === 0) {
    onChange({
      acquisitionActualInputMode: mode,
      acquisitionLots: [createInitialAcquisitionLot()],
    });
  } else {
    onChange({ acquisitionActualInputMode: mode });
  }
}}
```

zustand `set()`은 동기 배치 업데이트를 지원하므로 단일 호출로 두 필드 동시 갱신 가능. 렌더 사이클 외부에서 실행되어 무한 루프 없음.

`lots → per_share` 역방향 전환 시 `acquisitionLots` 초기화 미수행 — 기존 입력 보존 (재전환 시 복원).

---

계속: [`stock-transfer-acquisition-lots-only.ui.design.guards.md`](stock-transfer-acquisition-lots-only.ui.design.guards.md) — §7 분할 모드 차단 / §8 total 모드 차단 / §9 3중 패턴 일치 표 / §10 위험·회피 / §11 DoD 체크리스트 / §12 참조 파일
