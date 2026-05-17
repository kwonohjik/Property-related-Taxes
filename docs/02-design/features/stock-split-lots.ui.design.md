# 주식 양도세 분할 매수·분할 양도 — UI 설계

> **세목**: 주식 양도소득세 (stock-transfer)
> **참조 Plan**: `docs/00-pm/stock-step1-reorder-split-lots.plan.md` v2.2
> **참조 엔진 디자인**: `stock-split-lots.engine.design.md`
> **상태**: Design v1 (2026-05-18)

## 사용자 시나리오

### S-1. 단일 매수·단일 양도 (현행 회귀)
- 사용자: "기존처럼 한 번 매수 후 한 번에 양도"
- `lotsMode === "single"` (default). 현행 UI 100% 유지

### S-2. 분할 매수·일괄 양도
- 사용자: "회사 A 주식을 2023년·2024년 두 번 매수 후 2025년 한 번에 모두 양도"
- split 모드 + 매수 lot 2행 + 매도 lot 1행. 산정방법 사용자 선택 (개별법/FIFO/이동평균)

### S-3. 분할 매수·분할 양도
- 사용자: "2024년 매수 분 일부를 2024년 말 매도, 나머지를 2025년 매도. 1년 통합 신고"
- split 모드 + 매수 lot 2행 + 매도 lot 2행

### S-4. 취득원인 혼재 (매매+상속)
- 사용자: "본인이 매수한 lot과 부친에게 상속받은 lot을 함께 보유. 일부 양도"
- 매수 lot 행 1=매매, 행 2=상속(피상속인 취득일 입력). lot별 §104② 보유기간 기산점 분기

### S-5. 개별법 명시 매칭
- 사용자: "이번에 양도한 250주는 첫 매수분 100주 + 둘째 매수분 150주에서 가져왔음" (증빙 보유)
- 산정방법 = specific. 매도 lot 옆에서 매수 lot 매칭 명시

### S-6. 산정방법 비교 검토
- 사용자: "개별법·선입선출법·이동평균법 중 어느 게 유리한지 비교"
- 3 모드 토글 전환하며 결과 카드 산출세액 비교 (자동 비교 미리보기는 후속 PR)

### S-7. 비과세 + split (K-OTC 비대주주·중소·벤처)
- 사용자: "K-OTC 비대주주 비과세 대상이지만 lot이 여러 개. 검산용으로 lot별 차익 보고 싶음"
- split 모드 + 비과세 분기. 결과 화면에 비과세 안내 카드 + LotMatchingDetailCard (검산용)

### S-8. 양도손실
- 사용자: "이번 분할 양도에서 일부 lot은 손실, 일부 lot은 이익. 합계가 손실"
- sub-lot perLotGain 음수 포함 → totalGain < 0 → 과세표준 0 → 산출세액 0. LotMatchingDetailCard에 음수 sub-lot 그대로 표시

---

## 14개 동기화 지점 명세

### ① FormData 타입 (`lib/stores/calc-wizard-stock-store.ts`)

```typescript
export interface AcquisitionLot {
  id: string;                                          // UUID (UI key)
  acquisitionDate: string;                             // "YYYY-MM-DD"
  shareCount: string;
  perShareAcquisitionPrice: string;                    // 원
  acquisitionCause: "purchase" | "inheritance" | "gift" | "merger_split";
  decedentAcquisitionDate?: string;
  preMergerAcquisitionDate?: string;
}

export interface TransferLot {
  id: string;
  transferDate: string;
  shareCount: string;
  perShareTransferPrice: string;
}

export interface SpecificMatching {
  transferLotId: string;
  acquisitionLotId: string;
  shareCount: string;
}

export interface StockTransferFormData {
  // ... 기존 필드 ...
  lotsMode: "single" | "split";
  costAllocationMethod: "specific" | "fifo" | "moving_avg";
  acquisitionLots: AcquisitionLot[];
  transferLots: TransferLot[];
  specificMatchings: SpecificMatching[];
}
```

### ② initial value (`createInitialStockFormData`)

```typescript
lotsMode: "single",
costAllocationMethod: "fifo",
acquisitionLots: [],
transferLots: [],
specificMatchings: [],
```

### ③ normalize (`normalizeStockFormData`)

```typescript
lotsMode: enumField("lotsMode", ["single", "split"], defaults.lotsMode),
costAllocationMethod: enumField("costAllocationMethod", ["specific", "fifo", "moving_avg"], defaults.costAllocationMethod),
acquisitionLots: normalizeLotArray(d.acquisitionLots),
transferLots: normalizeLotArray(d.transferLots),
specificMatchings: normalizeMatchingArray(d.specificMatchings),
```

각 배열 sanitizer: 요소별 `strField` + `enumField`(cause) + 빈 row 필터 (모든 필드 빈문자 시 제거).

### ④ API 변환 (`lib/calc/stock-transfer-tax-api.ts` `buildStockTransferApiBody`)

```typescript
if (form.lotsMode === "split") {
  body.lotsMode = "split";
  body.costAllocationMethod = form.costAllocationMethod;
  body.acquisitionLots = form.acquisitionLots.map((lot) => ({
    acquisitionDate: lot.acquisitionDate,
    shareCount: parseIntOrUndef(lot.shareCount) ?? 0,
    perShareAcquisitionPrice: parseIntOrUndef(lot.perShareAcquisitionPrice) ?? 0,
    acquisitionCause: lot.acquisitionCause,
    decedentAcquisitionDate: lot.decedentAcquisitionDate || undefined,
    preMergerAcquisitionDate: lot.preMergerAcquisitionDate || undefined,
  }));
  body.transferLots = form.transferLots.map(...);
  if (form.costAllocationMethod === "specific") {
    body.specificMatchings = form.specificMatchings.map(...);
  }
  // ⑪ acquisitionDate FIFO fallback: 가장 오래된 매수 lot 일자
  const oldestLot = [...form.acquisitionLots].sort((a, b) =>
    a.acquisitionDate.localeCompare(b.acquisitionDate)
  )[0];
  if (oldestLot && !body.acquisitionDate) {
    body.acquisitionDate = oldestLot.acquisitionDate;
  }
}
```

### ⑤ UI 위젯

#### Step1.tsx — 섹션 재정렬 + 동적 번호

```tsx
const sections = useMemo(() => {
  const items = [
    { key: "market", title: "시장 유형", render: () => <MarketTypeBlock ... /> },
    { key: "company", title: "회사 규모 / K-OTC / 벤처기업", render: () => <CompanyTypeBlock ... /> },
    { key: "dates", title: form.lotsMode === "split" ? "양도·취득 lot (분할 모드)" : "양도·취득 일자 및 주식수",
      render: () => <DatesAndLotsBlock form={form} onChange={onChange} /> },
  ];
  if (form.lotsMode === "single") {
    items.push({ key: "cause", title: "취득원인 (단기 30% 기산점 §104②)",
      render: () => <AcquisitionCauseBlock ... /> });
  }
  items.push({ key: "major", title: "대주주 판정 (시행령 §157)",
    render: () => <MajorShareholderBlock ... /> });
  if (form.marketType === "other_asset" || form.isQualifyingBlockShareholder || form.isHeavyRealEstateForRate) {
    items.push({ key: "other", title: "기타자산 해당 여부 (§94①4)",
      render: () => <OtherAssetBlock ... /> });
  }
  return items;
}, [form, onChange]);

return (
  <div className="space-y-8">
    {sections.map((s, idx) => (
      <section key={s.key}>
        <SectionTitle n={idx + 1} title={s.title} />
        {s.render()}
      </section>
    ))}
  </div>
);
```

| lotsMode | 기타자산 | 섹션 수 |
|---|---|---|
| single | OFF | 5 (시장·회사·일자·취득원인·대주주) |
| single | ON | 6 (+기타자산) |
| split | OFF | 4 (시장·회사·split lot·대주주) |
| split | ON | 5 (+기타자산) |

#### DatesAndLotsBlock — split/single 분기 진입점

```tsx
function DatesAndLotsBlock({ form, onChange }: Props) {
  return (
    <>
      {/* 모드 토글 — RadioCardGroup */}
      <RadioCardGroup
        name="lotsMode"
        value={form.lotsMode}
        options={[
          { value: "single", label: "단일 매수·단일 양도", description: "한 번 매수 후 한 번에 양도" },
          { value: "split", label: "분할 매수·분할 양도", description: "여러 lot으로 매수/매도. 산정방법 3종 선택" },
        ]}
        layout="inline"
        tone="violet"
        onChange={(v) => handleLotsModeToggle(v)}              // 마이그레이션 wrapper
      />

      {form.lotsMode === "single" ? (
        <SingleDatesShareCountFields form={form} onChange={onChange} />     // 현행 4필드
      ) : (
        <SplitLotsBlock form={form} onChange={onChange} />                  // 신규
      )}
    </>
  );
}
```

#### lotsMode 토글 마이그레이션 wrapper

```tsx
const handleLotsModeToggle = (newMode: "single" | "split") => {
  if (newMode === "split" && form.lotsMode === "single") {
    // single → split: 폼-전역 값을 첫 lot으로 마이그레이션 (데이터 보존)
    const newAcqLot: AcquisitionLot = {
      id: crypto.randomUUID(),
      acquisitionDate: form.acquisitionDate,
      shareCount: form.shareCount,
      perShareAcquisitionPrice: form.perShareAcquisitionPrice,
      acquisitionCause: form.acquisitionCause || "purchase",
      decedentAcquisitionDate: form.decedentAcquisitionDate || undefined,
      preMergerAcquisitionDate: form.preMergerAcquisitionDate || undefined,
    };
    const newTrnLot: TransferLot = {
      id: crypto.randomUUID(),
      transferDate: form.transferDate,
      shareCount: form.shareCount,
      perShareTransferPrice: form.perShareTransferPrice,
    };
    onChange({
      lotsMode: "split",
      acquisitionLots: form.acquisitionDate ? [newAcqLot] : [],
      transferLots: form.transferDate ? [newTrnLot] : [],
    });
  } else if (newMode === "single" && form.lotsMode === "split") {
    // split → single: 사용자 확인 다이얼로그
    if (confirm("분할 lot 데이터가 삭제됩니다. 단일 모드로 전환하시겠습니까?")) {
      const firstAcq = form.acquisitionLots[0];
      const firstTrn = form.transferLots[0];
      onChange({
        lotsMode: "single",
        acquisitionDate: firstAcq?.acquisitionDate ?? "",
        shareCount: firstTrn?.shareCount ?? "",
        perShareAcquisitionPrice: firstAcq?.perShareAcquisitionPrice ?? "",
        transferDate: firstTrn?.transferDate ?? "",
        perShareTransferPrice: firstTrn?.perShareTransferPrice ?? "",
        acquisitionCause: firstAcq?.acquisitionCause ?? "purchase",
        decedentAcquisitionDate: firstAcq?.decedentAcquisitionDate ?? "",
        preMergerAcquisitionDate: firstAcq?.preMergerAcquisitionDate ?? "",
        acquisitionLots: [],
        transferLots: [],
        specificMatchings: [],
      });
    }
  }
};
```

#### SplitLotsBlock — 신규 컴포넌트 (~350줄, 800줄 정책)

레이아웃:

```
┌─ 분할 lot 입력 ──────────────────────────────────────────┐
│ ⓐ 매수 lot 행렬 (amber tone, 빈 상태 시 안내 카드)        │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ #1 [취득일] [주식수] [1주당 단가] [취득원인 ▼] [🗑️]  │ │
│ │     └─ inheritance 시: [피상속인 취득일]               │ │
│ │     └─ merger_split 시: [종전 주식 취득일]            │ │
│ │     └─ gift 시: hint "취득일은 수증일을 입력하세요"   │ │
│ │ #2 ...                                                │ │
│ └──────────────────────────────────────────────────────┘ │
│ [+ 매수 행 추가]                                         │
│ (lot 없으면 안내 카드: "매수 행 추가부터 시작하세요")   │
│                                                          │
│ ⓑ 매도 lot 행렬 (emerald tone)                           │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ #1 [양도일] [주식수] [1주당 단가] [🗑️]                │ │
│ │ #2 ...                                                │ │
│ └──────────────────────────────────────────────────────┘ │
│ [+ 매도 행 추가]                                         │
│                                                          │
│ ⓒ 합계 미리보기 (sky tone)                               │
│   총 매수 1,000주 / 총 매도 500주 / 잔량 500주 ✓        │
│   (moving_avg 선택 시 추가) 가중평균 단가: 12,000원     │
│                                                          │
│ ⓓ 산정방법 선택 (RadioCardGroup violet, 3옵션)           │
│   ○ 개별법    ○ 선입선출법    ● 이동평균법             │
│   ↳ 선택된 모드 안내 카드 (FIFO/specific/moving_avg)    │
│                                                          │
│ ⓔ (specific만) 매칭 행렬 (fuchsia tone)                  │
│   매도 #1 ← 매수 #1 [수량 100] [🗑️]                     │
│   매도 #1 ← 매수 #2 [수량 150]                          │
│   매도 #2 ← 매수 #2 [수량 50]                           │
│   [+ 매칭 추가]                                          │
└──────────────────────────────────────────────────────────┘
```

색상 토큰: 매수 lot=amber, 매도 lot=emerald, 합계 미리보기=sky, 산정방법=violet, 매칭=fuchsia.

**lot 행 번호 표시**: `#{idx + 1}` — `useMemo`로 lot 배열 idx 기반. specific 매칭 드롭다운에서 lot ID 대신 사용자에게는 "매도 #1·매수 #2" 표시.

**lot 행 삭제 cascade**:
- AcquisitionLot 삭제 시: `specificMatchings.filter((m) => m.acquisitionLotId !== deletedLot.id)` 자동 제거
- TransferLot 삭제 시: `specificMatchings.filter((m) => m.transferLotId !== deletedLot.id)` 자동 제거
- 양쪽 모두 토스트 알림 ("매수/매도 lot 삭제로 매칭 N건 함께 제거됨")

**빈 상태 안내**: `acquisitionLots.length === 0`이면 amber 안내 카드 "매수 행 추가부터 시작하세요". `transferLots.length === 0`이면 emerald 안내 카드 동일.

**cause === "gift" hint**: 행 내부 "취득일" 라벨 hint를 "수증일을 입력하세요 (helpers.ts:54-58 — 주식은 §97의2 미적용)"로 자동 변경.

**cause별 perShareAcquisitionPrice hint** (§163⑨ 평가가액 안내):
- `purchase` → "1주당 실지 매수가 (원)"
- `inheritance` → "상속개시일 §60-66 평가가액 (원) — 소령 §163⑨"
- `gift` → "수증일 §60-66 평가가액 (원) — 소령 §163⑨"
- `merger_split` → "1주당 가중평균 취득원가 (원) — 소령 §163①4·5호"

**lot 행 default 값**:
- 신규 lot 추가 시 `acquisitionCause = "purchase"` (가장 빈도 높음)
- `id = nanoid()` 사용 (SSR 호환. `crypto.randomUUID()`는 hydration 오류 가능)
- 다른 필드는 모두 빈 문자열 (사용자 명시 입력 강제)

**잔량 카드 hint**: "잔량 500주 = 향후 양도 가능한 보유 주식 수" 풍선 hint

**SplitLotsBlock 실시간 검증** (합계 미리보기 카드 적색 경고):
- 매도 합 > 매수 합 → 적색 "매도 수량이 매수 수량을 초과합니다 (FIFO 매칭 불가)"
- specific 모드 매칭 부족 → 적색 "매도 #1: 250주 중 200주만 매칭됨 — 50주 미매칭"
- specific 모드 매수 lot 초과 → 적색 "매수 #1: lot 수량 100주 < 매칭 합 120주"

**specific 매칭 실시간 진행률**: 매칭 행렬 하단 (sky tone)
```
매도 #1: 250주 중 250주 매칭 완료 ✓
매도 #2: 100주 중 0주 매칭 — 매칭 추가 필요
```

#### Step2.tsx — split 모드 분기

```tsx
// L82-98 perShareTransferPrice
<CurrencyInput
  label="1주당 양도단가"
  value={form.perShareTransferPrice}
  onChange={(v) => onChange({ perShareTransferPrice: v })}
  disabled={form.lotsMode === "split"}
  hint={form.lotsMode === "split"
    ? "분할 양도 lot에서 자동 산출 중. Step1으로 돌아가 lot을 수정하세요."
    : "1주당 양도가액 (원)"
  }
/>

// L187-195 perShareAcquisitionPrice 동일 패턴

// acquisitionMode RadioCardGroup (L146-183)
{form.lotsMode === "split" && (
  <div className="violet 안내 카드">
    분할 모드에서는 실가 모드(actual)만 지원합니다.
    환산취득가·매매사례가액·감정가액·액면가·교환 모드는 후속 PR로 지원 예정입니다.
  </div>
)}
<RadioCardGroup
  options={[
    { value: "actual", label: "실가", description: "..." },
    { value: "estimated", label: "환산취득가", description: "...",
      disabled: form.lotsMode === "split",
      disabledReason: "분할 모드에서는 실가만 지원" },
    // ... 나머지 4종 동일 disabled
  ]}
  ...
/>
```

### ⑥ 사이드바 합계 (`StockSidebar.tsx`)

```tsx
const totals = useMemo(() => {
  if (form.lotsMode === "split") {
    // split 모드: lot 합계 미리보기
    const transferPriceTotal = form.transferLots.reduce((sum, lot) => {
      return sum + parseAmount(lot.shareCount) * parseAmount(lot.perShareTransferPrice);
    }, 0);
    const acquisitionPriceTotal = result?.acquisitionPrice
      ?? form.acquisitionLots.reduce((sum, lot) => {
        return sum + parseAmount(lot.shareCount) * parseAmount(lot.perShareAcquisitionPrice);
      }, 0);
    return {
      transferPrice: transferPriceTotal,
      acquisitionPrice: acquisitionPriceTotal,
      // ... 나머지 result 우선
    };
  }
  // single 모드: 현행 로직 (L34-98)
  return { ... };
}, [form, result]);

// 0원 항목 제외 규칙 유지
```

### ⑦ 결과 카드 (`StockTransferTaxResultView.tsx` + 신규 `LotMatchingDetailCard`)

#### appliedRules 배지 라벨 매퍼 확장

```typescript
const APPLIED_RULES_LABEL: Record<AppliedRule, string> = {
  // ... 기존 12종 ...
  "로트개별법": "로트 개별법 (specific)",
  "로트선입선출": "로트 선입선출법 (FIFO)",
  "로트이동평균": "로트 이동평균법 (총평균)",
};
```

#### appliedRate "혼합" 라벨 분기 + `hasMixedRates` 정의

```typescript
// helpers
function hasMixedRates(detail: LotMatchingDetail): boolean {
  const uniqueRates = new Set(detail.matched.map((sub) => sub.appliedRate));
  return uniqueRates.size > 1;
}
```

```tsx
{result.lotMatchingDetail && hasMixedRates(result.lotMatchingDetail) ? (
  <span className="text-amber-700">혼합 — sub-lot별 세율 상이 (LotMatchingDetailCard 참조)</span>
) : (
  <span>{(result.appliedRate * 100).toFixed(2)}%</span>
)}
```

#### 비과세 분기 (S-7)

비과세 케이스(K-OTC 비대주주·중소·벤처)에서도 lotMatchingDetail은 echo (검산용). 결과 화면:
- 비과세 안내 카드 (기존 L118-131) 그대로 노출
- LotMatchingDetailCard도 함께 표시 (사용자가 lot별 차익·매칭 검산 가능)
- 산출세액 0 (비과세), LotMatchingDetailCard 합계와 별개

#### 양도손실 분기 (S-8)

`totalGain < 0` 시 sub-lot 음수 perLotGain 그대로 표시. 결과 표 산출세액 0. LotMatchingDetailCard에 손실 lot은 음수 차익을 회색·괄호 표기 ("(-300,000)").

#### 비대주주 단일 세율 분기 (C-26)

`taxCategory === "listed_non_major_in_market"` 등 비대주주 분기에서 split 모드 활성 시:
- LotMatchingDetailCard에 모든 sub-lot의 `appliedRate`가 동일 (예: 0.20 단일)
- 단기/장기 컬럼은 표시하되 세율 컬럼은 단일값 (sub-lot 분기 의미 없음)
- footnote "비대주주 단일 세율 — sub-lot 분기 무관"

#### LotMatchingDetailCard — 신규 (split 모드만, L211 보유기간 카드 직후)

```
┌─ 로트별 매칭 상세 (LotMatchingDetail) ───────────────────────────────┐
│ 산정방법: [선입선출법(FIFO) 🏷️] 산정방법은 납세자 입증책임 (세법 명문 부재) ⓘ│
│                                                                       │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐    │
│ │매수일│ cause│§104②│매도일│매칭주│매수단│매도단│보유일│단/장│sub차│세율│
│ ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤    │
│ │2023..│ 매매 │ 동일 │2025..│ 100  │10,000│15,000│ 786  │장기 │500K│20%│
│ │2024..│ 상속 │2020..│2025..│ 150  │12,000│15,000│ 1852 │장기 │450K│20%│
│ └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘    │
│                                                       합계: 950,000 │
│                                                                     │
│ [▼ 더 보기 / ▲ 접기]                                                │
└─────────────────────────────────────────────────────────────────────┘
```

footnote: "최장 보유 lot 기준 holdingPeriodDays 표시 — 세부는 위 표 참조"

### ⑧ Validation (`stock-transfer-tax-validate.ts`)

```typescript
export function validateStep1(form: StockTransferFormData): StockValidationError[] {
  const errors: StockValidationError[] = [];

  if (form.lotsMode === "single") {
    // 현행 검증 유지 (line 122-130)
    if (isEmpty(form.shareCount) || parseI(form.shareCount) <= 0) {
      errors.push({ field: "shareCount", message: "양도 주식수를 입력하세요", severity: "error" });
    }
    if (isEmpty(form.totalIssuedShares) || parseI(form.totalIssuedShares) <= 0) {
      errors.push({ field: "totalIssuedShares", message: "발행주식 총수를 입력하세요", severity: "error" });
    }
    // ... cause별 보조 일자 (line 132-148) ...
  } else {
    // split 모드
    if (form.acquisitionLots.length === 0) {
      errors.push({ field: "acquisitionLots", message: "매수 lot을 1행 이상 입력하세요", severity: "error" });   // C-10
    }
    if (form.transferLots.length === 0) {
      errors.push({ field: "transferLots", message: "매도 lot을 1행 이상 입력하세요", severity: "error" });
    }

    // lot별 검증
    form.acquisitionLots.forEach((lot, i) => {
      if (parseI(lot.shareCount) <= 0) errors.push({ field: `acquisitionLots[${i}].shareCount`, ... });
      if (parseI(lot.perShareAcquisitionPrice) <= 0) errors.push({ ... });  // C-22
      if (lot.acquisitionCause === "inheritance" && isEmpty(lot.decedentAcquisitionDate)) {
        errors.push({ field: `acquisitionLots[${i}].decedentAcquisitionDate`,
          message: "상속 lot의 피상속인 취득일을 입력하세요 (§104②1)", severity: "error" });   // C-19
      }
      if (lot.acquisitionCause === "merger_split" && isEmpty(lot.preMergerAcquisitionDate)) {
        errors.push({ field: `acquisitionLots[${i}].preMergerAcquisitionDate`,
          message: "합병·분할 lot의 종전 주식 취득일을 입력하세요 (§104②3)", severity: "error" });   // C-19b
      }
    });
    form.transferLots.forEach((lot, i) => {
      if (parseI(lot.shareCount) <= 0) errors.push({ ... });
      if (parseI(lot.perShareTransferPrice) <= 0) errors.push({ ... });   // C-23
    });

    // 매도수량 ≤ 매수수량 합
    const totalAcq = form.acquisitionLots.reduce((s, l) => s + parseI(l.shareCount), 0);
    const totalTrn = form.transferLots.reduce((s, l) => s + parseI(l.shareCount), 0);
    if (totalTrn > totalAcq) {
      errors.push({ field: "transferLots", message: "총 매도 수량이 총 매수 수량을 초과합니다", severity: "error" });   // C-9
    }

    // specific 매칭 검증
    if (form.costAllocationMethod === "specific") {
      // 매도 lot당 매칭 합계 = 매도수량
      form.transferLots.forEach((trn, i) => {
        const matchedSum = form.specificMatchings
          .filter((m) => m.transferLotId === trn.id)
          .reduce((s, m) => s + parseI(m.shareCount), 0);
        if (matchedSum !== parseI(trn.shareCount)) {
          errors.push({ field: `specificMatchings[${i}]`,
            message: `매도 lot #${i+1}의 매칭 합계(${matchedSum})가 매도 수량(${trn.shareCount})과 다릅니다`, ... });   // C-20
        }
      });
      // 매수 lot당 매칭 합계 ≤ lot 수량
      form.acquisitionLots.forEach((acq, i) => {
        const matchedSum = form.specificMatchings
          .filter((m) => m.acquisitionLotId === acq.id)
          .reduce((s, m) => s + parseI(m.shareCount), 0);
        if (matchedSum > parseI(acq.shareCount)) {
          errors.push({ field: `specificMatchings[${i}]`,
            message: `매수 lot #${i+1}에 매칭된 합계(${matchedSum})가 lot 수량(${acq.shareCount})을 초과합니다`, ... });   // C-20b
        }
      });
    }
  }

  return errors;
}

export function validateStep2(form: StockTransferFormData): StockValidationError[] {
  const errors: StockValidationError[] = [];

  if (form.lotsMode === "single") {
    // 현행 검증 유지 (line 214·232 perShareTransferPrice·perShareAcquisitionPrice 필수)
  } else {
    // split 모드: 호환성 차단
    if (form.acquisitionMode !== "actual") {
      errors.push({ field: "acquisitionMode",
        message: "분할 모드에서는 취득가 산정방법으로 실가만 지원합니다", severity: "error" });   // C-8
    }
    if (form.transferPriceMode === "exchange") {
      errors.push({ field: "transferPriceMode",
        message: "분할 모드에서는 양도가액 모드로 교환을 지원하지 않습니다", severity: "error" });
    }
    // lot 단위 perShare 검증은 validateStep1에서 처리됨
  }

  return errors;
}
```

### ⑨ Zod enum 메인 (`lib/api/stock-transfer-tax-schema.ts`)

```typescript
const lotsModeSchema = z.enum(["single", "split"]);
const costAllocationMethodSchema = z.enum(["specific", "fifo", "moving_avg"]);

// stockTransferInputSchema에 추가
{
  // ...
  lotsMode: lotsModeSchema.optional().default("single"),
  costAllocationMethod: costAllocationMethodSchema.optional(),
  acquisitionLots: z.array(acquisitionLotSchema).optional(),
  transferLots: z.array(transferLotSchema).optional(),
  specificMatchings: z.array(specificMatchingSchema).optional(),
}
```

### ⑩ Zod refines (`addStockRefines` superRefine)

```typescript
// split 모드 호환성 게이트
if (data.lotsMode === "split") {
  if (data.acquisitionMode !== "actual") {
    ctx.addIssue({ code: "custom", path: ["acquisitionMode"],
      message: "분할 모드에서는 실가만 지원" });
  }
  if (data.transferPriceMode === "exchange") {
    ctx.addIssue({ ... });
  }
  if (!data.acquisitionLots || data.acquisitionLots.length === 0) {
    ctx.addIssue({ ... });
  }
  if (!data.transferLots || data.transferLots.length === 0) {
    ctx.addIssue({ ... });
  }
  // cause별 보조 일자 필수
  data.acquisitionLots?.forEach((lot, i) => {
    if (lot.acquisitionCause === "inheritance" && !lot.decedentAcquisitionDate) {
      ctx.addIssue({ path: ["acquisitionLots", i, "decedentAcquisitionDate"], ... });
    }
    if (lot.acquisitionCause === "merger_split" && !lot.preMergerAcquisitionDate) {
      ctx.addIssue({ path: ["acquisitionLots", i, "preMergerAcquisitionDate"], ... });
    }
  });
  // specific 매칭 무결성
  if (data.costAllocationMethod === "specific") { ... }
}
```

### ⑪ acquisitionDate FIFO fallback

`buildStockTransferApiBody` split 모드 시 가장 오래된 매수 lot 일자를 단건 `acquisitionDate`에도 동시 채움 (legacy `calcHoldingPeriod` fallback + STT 호환). ④에 포함.

### ⑫ Zod 입력 객체 정의 (TypeScript 미감지 지점)

```typescript
const acquisitionLotSchema = z.object({
  id: z.string().optional(),
  acquisitionDate: z.union([z.string(), z.date()]),
  shareCount: z.number().int().positive(),
  perShareAcquisitionPrice: z.number().int().positive(),
  acquisitionCause: z.enum(["purchase", "inheritance", "gift", "merger_split"]),
  decedentAcquisitionDate: z.union([z.string(), z.date()]).optional(),
  preMergerAcquisitionDate: z.union([z.string(), z.date()]).optional(),
});

const transferLotSchema = z.object({
  id: z.string().optional(),
  transferDate: z.union([z.string(), z.date()]),
  shareCount: z.number().int().positive(),
  perShareTransferPrice: z.number().int().positive(),
});

const specificMatchingSchema = z.object({
  transferLotId: z.string(),
  acquisitionLotId: z.string(),
  shareCount: z.number().int().positive(),
});
```

### ⑬ `buildStockTransferApiBody` body spread (TypeScript 미감지 지점)

④에 포함된 명시 spread. `acquisitionLots`·`transferLots`·`costAllocationMethod`·`specificMatchings`를 body에 직접 명시.

### ⑭ Route handler 매핑 (`app/api/calc/stock-transfer/route.ts`)

```typescript
const STOCK_DATE_FIELDS = [
  "acquisitionDate", "transferDate", "priorYearEndDate", "listingDate",
  "filingDate", "decedentAcquisitionDate", "donorAcquisitionDate", "preMergerAcquisitionDate",
  // v2.2 신규 4건 — coerceDates dot-notation 지원
  "acquisitionLots[].acquisitionDate",
  "acquisitionLots[].decedentAcquisitionDate",
  "acquisitionLots[].preMergerAcquisitionDate",
  "transferLots[].transferDate",
];

// L73 coerceDates 단일 호출 (변경 없음)
coerceDates(rawInput, [...STOCK_DATE_FIELDS]);
```

---

## 입력 순서 (계산 로직 순서 = UI 순서)

split 모드 SplitLotsBlock 내부:

1. **매수 lot 행렬** (취득 정보 먼저) — 매수일·주식수·단가·cause·보조 일자
2. **매도 lot 행렬** — 매도일·주식수·단가
3. **합계 미리보기** — 매수/매도 수량 + 불일치 경고
4. **산정방법 RadioCardGroup** — 매수·매도 입력 후 산정방법 선택
5. **(specific만) 매칭 행렬** — 산정방법 선택 후 노출

(엔진 `allocateLots(acquisitionLots, transferLots, method, matchings)` 함수 시그니처 순서와 정확히 일치)

---

## UX 규칙 적용

- **DateInput**: 모든 일자 (lot.acquisitionDate·transferDate·decedentAcquisitionDate·preMergerAcquisitionDate)
- **DecimalInput**: shareCount (정수 주식수)
- **CurrencyInput**: perShareAcquisitionPrice·perShareTransferPrice (원 단위)
- **RadioCardGroup**: lotsMode (single/split) + costAllocationMethod (3종) — 모두 layout="inline" tone="violet"
- **포커스 시 전체 선택**: `SelectOnFocusProvider` 전역 적용
- **placeholder 숫자 예시 금지**: 한국어 설명만
- **OFF/ON tone 유지**: ToggleCard·RadioCardGroup 미선택도 violet 배경

---

## sessionStorage 마이그레이션 케이스

기존 sessionStorage에는 `lotsMode`·`costAllocationMethod`·`acquisitionLots`·`transferLots`·`specificMatchings` 신규 5 필드가 없음. `normalizeStockFormData` (③ 동기화 지점):
- `lotsMode` undefined → `"single"` default
- `costAllocationMethod` undefined → `"fifo"` default
- `acquisitionLots`·`transferLots`·`specificMatchings` undefined → `[]` default
- 기존 폼-전역 4필드(acquisitionDate·shareCount·perShareAcquisitionPrice·perShareTransferPrice)는 그대로 유지 → single 모드 정상 동작

테스트 케이스: `normalizeStockFormData({})` → 모든 신규 필드 default 채움 확인.

---

## 후속 PR 트리거 (UI)

본 PR 범위 외 명시 차단:
1. 산정방법별 산출세액 비교 미리보기 (S-6 자동 비교 카드)
2. lot 정렬·필터 (5건 이상 시)
3. specific 매칭 "FIFO 자동 채우기" 보조 버튼
4. 결과 PDF에 LotMatchingDetailCard 포함
5. LotMatchingDetailCard 풍부화 (CSV·정렬·시각화)

---

## 변경 로그

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-05-18 | v1 | Plan v2.2 + 엔진 디자인 v1 기반 UI 디자인 초안 작성 |
| 2026-05-18 | **v1.1 1차 정정** | 검토 17건 반영. 🔴 ①anchor ID/케이스 ID 표기 분리 ②`hasMixedRates` 정의 추가 ③Zod optional/superRefine 일관성 ④STEP 8 시그니처 정정. 🟡 ⑤비과세+split(S-7·C-24) ⑥양도손실(S-8·C-25) ⑦비대주주+split(C-26) ⑧lot 행 삭제 cascade ⑨가중평균 미리보기 ⑩lot 행 번호 ⑪gift cause hint ⑫sessionStorage 마이그레이션. 🟢 ⑬빈 상태 안내 ⑭후속 PR 5건 ⑮moving_avg 0 가드 ⑯taxCategory 3분기 의사코드 ⑰음수 perLotGain 처리 |
| 2026-05-18 | **v1.2 2차 정정** | 재검토 14건 반영. 🔴 ①`naMokRate` → taxCategory별 명시 분기(`STOCK_NON_MAJOR_SME_RATE` 0.10 / `STOCK_NON_MAJOR_GENERAL_RATE` 0.20) ②`appliedRules.단기30%` 적용 조건 명시(대주주+비SME AND 단기 sub-lot 1건+) ③TransferLot cascade 산식 명시 ④비과세 분기에서도 `buildExemptResult` 패스에 `allocateLots()` 사전 호출 명시. 🟡 ⑤lot default cause="purchase" + nanoid SSR 호환 ⑥cause별 perShareAcquisitionPrice hint 4종 ⑦잔량 카드 풍선 hint ⑧SplitLotsBlock 실시간 검증 (매도>매수 적색·specific 매칭 부족 적색). 🟢 ⑨specific 매칭 진행률 sky 카드 ⑩LotMatchingDetailCard sub-lot ID 표시(후속 PR) ⑪산정방법 추천 hint(후속 PR) ⑫lot collapsible 5건 기준(후속 PR) ⑬법령 inline 인용 배지 ⑭매칭 자동 채우기 UX(후속 PR) |
