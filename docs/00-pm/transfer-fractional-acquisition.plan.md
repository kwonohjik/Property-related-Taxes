# 양도세 — 동일 아파트 2회 지분 취득 케이스 구현 계획

> **작성일**: 2026-05-07
> **상태**: ✅ **구현 완료** (R1~R5 + 후속 F1·F2·F3 — 2026-05-07 동일 일자)
> **선행 산출물**: 본 계획서 → 구현 (별도 Design Doc 생략 — 케이스 단일·산식 명료)
> **anchor 사례**: 양도코리아 사례 27 — "아파트를 2번에 걸쳐 지분취득한 경우"

## 변경 이력

| 일시 | 내용 |
|---|---|
| 2026-05-07 (작성) | A안 결정 후 초안 작성 (5건 신규 항목·22개 anchor) |
| 2026-05-07 (Round 2) | **anchor 검증 중 §4.2에 `checkExemption` 12억 판정 분모 교체 누락 발견** → 신규 항목 5→6건 정정. 미정정 시 1차 60% 지분 양도차익 0원 (전액비과세 오인) |
| 2026-05-07 (Round 1) | `transfer.types.ts` 805줄 정책 위반 → `transfer-phd.types.ts` 235줄 분리 (사후 발견·즉시 처리) |
| 2026-05-07 (구현 완료) | anchor 22→15개 정정 (핵심 anchor가 보조 anchor 함의). 결과 컴포넌트 위치 `BundledAllocationCard` 명시 |
| 2026-05-07 (후속) | F1 결과 카드 지분 라벨 / F2 100% 기준 안내 배너 / F3 헬퍼 통일 |

---

## 1. 케이스 개요 (사례 27)

다른 주택을 소유하지 않은 갑氏가 동일 아파트(서울 양천구 목동신시가지아파트 3단지)를
**2번에 걸쳐 지분 취득**한 후 2023.2.16 양도.

| 회차 | 취득일 | 지분 | 취득원인 | 매입/평가가액 | 기타취득가액 |
|---|---|---|---|---|---|
| 1차 | 2008.5.5 | **60%** | 상속 (보충적평가액 = 공동주택가격) | 808,000,000 (100% 기준) | 20,000,000 |
| 2차 | 2021.11.11 | **40%** | 매매 (실지거래가액) | 600,000,000 (40% 실지급액) → **1,500,000,000** (100% 환산) | 11,200,000 → 28,000,000 |

- 양도일: 2023.2.16, 양도가액 **1,700,000,000** (총액)
- 필요경비: 14,000,000 (총액)
- 거주기간: 2008.5.5 ~ 2023.2.16 (10년 이상)
- 1세대 1주택, 12억 초과 고가주택, 비조정지역, 등기

### 1.1 양도코리아 검증 결과 (anchor 목표값)

| 항목 | 1차(60%) | 2차(40%) | 합산 |
|---|---|---|---|
| 양도가액 | 1,020,000,000 | 680,000,000 | 1,700,000,000 |
| 취득가액 | 496,800,000 | 611,200,000 | 1,108,000,000 |
| 기타필요경비 | 8,400,000 | 5,600,000 | 14,000,000 |
| 전체 양도차익 | 514,800,000 | 63,200,000 | 578,000,000 |
| 비과세 양도차익 | **363,388,236** | 0 | 363,388,236 |
| 과세대상 양도차익 | **151,411,764** | 63,200,000 | 214,611,764 |
| 장기보유특별공제 | 121,129,411 (80%) | 0 | 121,129,411 |
| 양도소득금액 | 30,282,353 | 63,200,000 | 93,482,353 |
| 기본공제 | — | — | 2,500,000 (합산 1회) |
| 과세표준 | 30,282,353 | 60,700,000 | 90,982,353 |
| 세율 | 누진 15% | 1~2년미만 60% | — |
| 산출세액 | 3,282,352 | 36,420,000 | **39,702,352** |
| 지방소득세 | 328,235 | 3,642,000 | **3,970,235** |
| 총 납부세액 | — | — | **43,672,587** |

### 1.2 핵심 산식 (검증)

**12억 고가주택 비과세 안분** (1차 60% 지분):
```
과세대상 양도차익 = floor(전체양도차익 × (총양도가액 - 12억) / 총양도가액)
                  = floor(514,800,000 × 500,000,000 / 1,700,000,000)
                  = floor(151,411,764.7059...)
                  = 151,411,764  ✓
비과세 양도차익 = 514,800,000 - 151,411,764 = 363,388,236  ✓
```

**중요**: 분모는 **총 물건 양도가액 1,700,000,000** (지분 양도가액 1,020,000,000 아님).
이게 본 케이스 구현의 핵심 설계 포인트.

---

## 2. 현재 시스템 분석

### 2.1 활용 가능한 기존 자산 (재사용)

| 항목 | 위치 | 본 케이스 적용 |
|---|---|---|
| 다건 자산 마법사 | `assets[]` (`AssetForm`) | 1차/2차 지분을 별개 자산 2개로 모델링 |
| Aggregate 엔진 | `transfer-tax-aggregate.ts` | 합산 양도소득금액·기본공제 1회·세율 분리·합산 산출세액 |
| 1세대1주택 비과세 | `checkExemption` + `calcOneHouseProration` | 1차 60% 지분에만 적용 |
| 장기보유특별공제 | `calcLongTermHoldingDeduction` | 1차에 80% 적용 (15년+10년거주) |
| 상속 취득가액 (보충적평가액) | `acquisitionCause === "inheritance"` 분기 | 1차 공동주택가격 활용 |
| 일반 매매 취득가액 | `actual` 모드 | 2차 실지거래가액 |
| 합산 기본공제 1회 적용 | `calculateTransferTaxAggregate` | 이미 구현됨 |
| 다른 세율 적용 | `aggregateByGroup` | 1차 누진 / 2차 60% 단기 자동 분기 |

### 2.2 새로 필요한 항목 (6건)

> **2026-05-07 정정**: 초안 5건 → 6건. checkExemption 12억 비과세 판정 분모 교체 추가 (R2 anchor 검증 중 발견).

| # | 항목 | 위치 | 이유 |
|---|---|---|---|
| ① | `ownershipRatio` (분자/분모) | `AssetForm` (`lib/stores/calc-wizard-asset.ts`) | 지분 비율 저장 |
| ② | `contractTotalPrice` (총 양도가액) 자산 단위 활용 | `lib/calc/transfer-tax-api.ts` | 자산별 양도가액 = 총 × ratio |
| ③ | `totalPropertyTransferPrice` (엔진 input) | `TransferTaxInput` | 12억 고가주택 안분 분모 (총 물건가) — 지분 모드 전용 |
| ④ | `calcOneHouseProration` 분모 변경 | `transfer-tax-helpers.ts` | `totalPropertyTransferPrice ?? transferPrice` |
| ⑤ | **`checkExemption` E-1 12억 판정 분모 교체** ★사후추가 | `transfer-tax-helpers.ts:227-230` | 12억 비과세 판정과 안분 분모 일관성 — 한쪽만 교체 시 1.02B<12억 → 잘못된 전액비과세 |
| ⑥ | 취득원인 100% 기준 환산 | `transfer-tax-api.ts` + `transfer-tax-api-helpers.ts` | 자산.취득가·필요경비·양도가액 모두 × ratio 자동 (`getOwnershipRatio`·`applyRatio` 헬퍼) |

### 2.3 본 케이스에서 안 쓰는 기존 기능

- `hasSeperateLandAcquisitionDate` (토지/건물 분리 취득) — 사용 안 함. 본 케이스는 **같은 물건의 다른 지분**이지 같은 자산의 토지/건물 분리가 아님. 별개 자산 2건으로 모델링.
- `multi-parcel-transfer.ts` — 다필지 토지 양도 전용. 본 케이스는 단일 아파트.

---

## 3. 사용자 결정사항 (인터뷰 2026-05-07)

| 항목 | 결정 |
|---|---|
| **Q1. 양도가액 입력 방식** | **A안** — 총 양도가액(1.7B) 1회 입력 + `ownershipRatio` 자산별 입력. 시스템이 × 지분율 자동 계산 |
| **Q2. 상속 취득가액 입력 단위** | **A안** — 100% 기준 입력(808M) → 시스템이 × 지분율 자동 계산 |

→ **사용자는 100% 기준값으로 일관 입력. 시스템이 자동으로 × ownershipRatio 적용.**
→ 이후 모든 금액 입력(취득가액, 매입가액, 기타취득가액)은 100% 기준 통일.

---

## 4. 설계 — 엔진 (Engine Design)

### 4.1 데이터 모델 변경

**`AssetForm` (lib/stores/calc-wizard-asset.ts)**:
```typescript
interface AssetForm {
  // ... 기존 필드 ...

  /**
   * 공유 지분율 (분자/분모). 미설정 시 100/100 (단독 소유) 기본.
   * 본 자산이 같은 물건의 한 지분 단계취득인 경우 사용.
   *
   * 양도가액·취득가액·기타취득가액·매입가액 등 모든 금액 입력값에 ratio 자동 적용.
   * 필요경비는 100% 기준 입력 + 자동 안분.
   *
   * 예: 60% 지분 → ownershipNumerator=60, ownershipDenominator=100.
   */
  ownershipNumerator?: number;    // 분자 (기본 100)
  ownershipDenominator?: number;  // 분모 (기본 100)
}
```

**`TransferTaxInput` (lib/tax-engine/types/transfer.types.ts)**:
```typescript
interface TransferTaxInput {
  // ... 기존 필드 ...

  /**
   * 총 물건 양도가액 (지분 모드 전용).
   * 12억 고가주택 비과세 안분 분모로 사용 (지분 양도가액이 아닌 총 물건가).
   * 미설정 시 transferPrice를 그대로 사용 (기존 단독 소유 케이스 호환).
   *
   * 예: 60% 지분 양도시 transferPrice=1,020,000,000, totalPropertyTransferPrice=1,700,000,000.
   */
  totalPropertyTransferPrice?: number;
}
```

`ownershipRatio` 자체는 엔진에 전달하지 않는다. **API 변환 시점에 ratio를 적용한 결과값(분자값)** 만 전달.
엔진은 "지분 비율" 개념을 알 필요 없이, 분자값(양도/취득/필요경비) + 분모(총양도가액)만 알면 됨.

### 4.2 변경되는 엔진 함수 2개 (Pure Function 영향)

> **2026-05-07 정정 (Round 2 anchor 검증 중 발견)**: 초안에는 `calcOneHouseProration` 1개만 명시되었으나,
> `checkExemption`의 12억 비과세 판정도 분모 교체가 필수임이 anchor 테스트 중 드러났다. 미정정 시
> 1.02B (지분 양도가액) < 12억 → 전액 비과세 분기 → `isPartialExempt=false` → `calcOneHouseProration` 미호출
> → 결과 양도차익 0원 (사례 27 T-01 실패). 본 계획서 본문에 사후 보강.

**A. `calcOneHouseProration` (lib/tax-engine/transfer-tax-helpers.ts)**:
```typescript
// Before
export function calcOneHouseProration(gain: number, transferPrice: number): number {
  const threshold = 1_200_000_000;
  if (transferPrice <= threshold) return gain;
  return calculateProration(gain, transferPrice - threshold, transferPrice);
}

// After
export function calcOneHouseProration(
  gain: number,
  transferPrice: number,
  totalPropertyTransferPrice?: number,  // ← 신규 (옵션)
): number {
  const threshold = 1_200_000_000;
  const denominator = totalPropertyTransferPrice ?? transferPrice;
  if (denominator <= threshold) return gain;
  // 분자 = 지분 양도차익(이미 ratio 적용됨)
  // 분모 = 총 양도가액 (지분 모드) 또는 양도가액 (단독 모드)
  return calculateProration(gain, denominator - threshold, denominator);
}
```

**호출 변경** (transfer-tax.ts STEP 3):
```typescript
taxableGain = calcOneHouseProration(
  transferGain,
  input.transferPrice,
  input.totalPropertyTransferPrice,  // ← 신규
);
```

**B. `checkExemption` (lib/tax-engine/transfer-tax-helpers.ts) — E-1 단계 12억 판정**:
```typescript
// Before: 지분 양도가액으로 12억 판정 → 1.02B < 12억 → 잘못된 전액비과세
if (input.transferPrice <= rule.maxExemptPrice) {
  return { isExempt: true, isPartialExempt: false, exemptReason: "1세대1주택 비과세" };
}

// After: 지분 모드는 totalPropertyTransferPrice로 판정 (총 물건가)
const exemptionPriceCheck = input.totalPropertyTransferPrice ?? input.transferPrice;
if (exemptionPriceCheck <= rule.maxExemptPrice) {
  return { isExempt: true, isPartialExempt: false, exemptReason: "1세대1주택 비과세" };
}
```

**핵심**: 12억 비과세 판정과 12억 안분 분모는 **반드시 같은 가격**(총 물건가)을 사용해야 한다.
한쪽만 변경하면 분기 비일관성 발생.

### 4.3 변경 영향 분석

- `calcOneHouseProration` 시그니처에 옵션 매개변수 추가만 — 기존 호출은 모두 호환 (undefined fallback)
- `transferGain` 자체는 이미 ratio가 적용된 지분 양도차익 (514.8M for 60%) — 변경 불필요
- `transferPrice` (지분 양도가액 1.02B)는 STEP 4 LTHD·STEP 5 세율 적용 등 다른 계산에 그대로 사용 — 변경 불필요
- 분모만 총양도가액으로 교체 → 안분 비율 = (1.7B - 12억) / 1.7B = 5/17

### 4.4 Aggregate 엔진은 변경 없음

`calculateTransferTaxAggregate`는 이미:
- 각 자산을 단건 엔진으로 호출
- 양도소득금액 합산
- 기본공제 1회 (250만) 차감
- 보유기간별 세율 분리 적용 (1차=누진, 2차=60%)
- 합산 산출세액 반환

→ **본 케이스는 별도 분기 없이 자연 동작**. 단건 엔진의 12억 안분만 수정하면 됨.

---

## 5. 설계 — UI

### 5.1 자산 카드 내 지분 입력 (자산-수준)

**위치**: Step1 자산 카드, "취득 정보" 섹션 상단 또는 자산 헤더 근처.

**컴포넌트**: 신규 `OwnershipRatioInput.tsx` — 분자/분모 2개 숫자 입력.

```tsx
<FieldCard
  label="공유 지분율"
  hint="단독 소유는 100/100. 같은 물건을 다회 분할 취득한 경우 각 지분의 비율 입력."
  trailing={ratio < 1.0 ? <Badge>지분 모드</Badge> : null}
>
  <DecimalInput value={ownershipNumerator} ... /> /
  <DecimalInput value={ownershipDenominator} ... />
</FieldCard>
```

활성 조건: 항상 표시 (단독 소유는 100/100 기본값으로 작동).

### 5.2 사이드바 합계

자산이 여러 개이고 모두 같은 주소 + ownershipRatio 합 = 100% 인 경우,
**"동일 물건 지분 합산"** 안내 배지 표시 (선택적, Phase 2).
Phase 1은 단순히 자산별 양도가액을 합산해서 표시.

### 5.3 결과 카드 — 지분 모드 표시

> **2026-05-07 정정**: 초안에 결과 컴포넌트 위치 미명시 → 실제 구현 위치는 **`components/calc/results/BundledAllocationCard.tsx`** (aggregate 결과 분기 — `result.mode !== "single"` && `!== "mixed-use"`). `TransferTaxResultView`는 단건 모드용으로 본 케이스 미해당.

**구현 (F1 후속 작업, 2026-05-07 완료)**:

- **`BundledAllocationCard.Props.ownershipMap?`** 추가 — `Map<propertyId, { numerator, denominator }>` 옵션 prop
- **`PropertyCard`** 자산별 카드에 "지분 60% (60/100)" amber 배지 추가 (분자<분모 시만, 단독 소유 미표시)
- **`TransferTaxCalculator`** aggregate 결과 분기에서 `formData.assets`로 `propertyId → ratio` 매핑 빌드 후 전달 (assets[0] = "primary", 이후는 assetId)

**12억 안분 산식 표시** (이미 엔진 STEP 3에서 처리됨):
```
과세대상 양도차익 = 514,800,000 × (총양도가 1,700,000,000 - 12억) / 총양도가
                  = 151,411,764
```
엔진 `transfer-tax.ts:421` 의 `formula` 문자열이 지분 모드 시 "총양도가" 라벨로 분기 → `CalculationStep`을 통해 결과 화면에 자동 표출.

### 5.4 Step1 자산 카드의 입력 단위 일관화

**모든 금액 입력 = 100% 기준** (사용자 결정사항 Q1·Q2-A안):

| 입력 필드 | 사용자 입력 | 시스템 변환 |
|---|---|---|
| 총 양도가액 (form.contractTotalPrice) | 1,700,000,000 | × 60% = 1,020,000,000 (지분1) / × 40% = 680,000,000 (지분2) |
| 상속 취득가액 (공동주택가격) | 808,000,000 | × 60% = 484,800,000 |
| 매매 취득가액 (실지거래가액) | **1,500,000,000** (100% 기준 환산) | × 40% = 600,000,000 |
| 기타취득가액 (취등록세 등) | 20,000,000 / 28,000,000 (100% 기준) | × ratio 적용 |
| 필요경비 (form.totalNecessaryExpense?) | 14,000,000 (총액) | × ratio 적용 |

**UX 메시지 — 두 단계로 강화** (F2 후속 작업, 2026-05-07 완료):

1. **FieldCard hint** (`OwnershipRatioInput`): "단독 소유는 100/100. 같은 물건을 다회 분할 취득(지분 단계취득)한 경우 각 지분의 비율을 입력하고, 양도가액·취득가액·필요경비는 모두 **100% 기준**으로 입력하세요. 시스템이 지분율을 자동 적용합니다."

2. **자산 카드 강조 배너** (`CompanionAssetCard`, ratio < 1.0 시 동적 표시): amber 톤 강조 배너로 ⚠ 심볼 + 매매 100% 환산 예시("60% 지분의 실제 매매가 600M → 100% 기준 1,000M으로 입력 = 600M ÷ 0.6") + 상속 보충적평가 안내. 단독 소유(100/100)는 미표시 → 기존 UX 무변경.

매매 케이스에서 100% 환산이 부담스러운 점은 강조 배너의 산식 예시로 1차 완화. 실제 지급액 보조 입력(`actualPaidAmount` + `auto-back-calc` 토글)은 Phase 2 후속.

---

## 6. API/Route 동기화 (14개 지점)

### 클라이언트 8개

| # | 지점 | 변경 |
|---|---|---|
| ① | `AssetForm` 타입 | `ownershipNumerator?`·`ownershipDenominator?` 추가 |
| ② | `createInitialAssetForm` | `ownershipNumerator: 100, ownershipDenominator: 100` 기본값 |
| ③ | `normalizeAsset` | undefined → 기본 100/100 fallback |
| ④ | `transfer-tax-api.ts` API 변환 | 자산별로 `transferPrice = totalContract × ratio`, `acquisitionPrice = input × ratio`, `totalPropertyTransferPrice = totalContract` |
| ⑤ | UI 입력 위젯 | `OwnershipRatioInput` (Step1 자산 카드) |
| ⑥ | 사이드바 합계 | 자산별 양도가액(이미 ratio 반영) 합산 표시 |
| ⑦ | 결과 카드 | 자산 카드에 "지분 X%" + 12억 안분 산식 분모 명시 |
| ⑧ | `transfer-tax-validate.ts` | 분자 ≤ 분모, 분모 > 0, 분모 ≤ 1000(상식적 한도) |

### API/Route 6개 (신규 enum 미발생, 객체 필드만 추가)

| # | 지점 | 변경 |
|---|---|---|
| ⑨ | Zod enum (메인) | 변경 없음 (enum 신설 없음) |
| ⑩ | Zod enum (컴패니언) | 변경 없음 |
| ⑪ | 자산-수준 acquisitionDate fallback | 변경 없음 (기존 그대로) |
| ⑫ | **Zod 입력 객체 정의** | `transfer-tax-schema-sub.ts` `TransferAssetSchema`에 `ownershipNumerator`·`ownershipDenominator` (number, optional, default 100) |
| ⑬ | `callTransferTaxAPI` body spread | 자산별 ratio + `totalPropertyTransferPrice` body에 포함 |
| ⑭ | Route handler 엔진 input 매핑 | `route.ts`에서 자산별 `transferPrice = totalContract × ratio` + `totalPropertyTransferPrice` 엔진 input 변환 |

⑫⑬⑭ 누락 시 침묵 stripping → 데이터 미도달. 메모리 정책 `feedback_api_zod_schema_sync.md` 적용.

---

## 7. anchor 테스트 계획

### 7.1 테스트 파일

`__tests__/tax-engine/transfer-tax/fractional-acquisition-case-27.test.ts` (신규)

### 7.2 anchor 항목 (사례 27 양도코리아 PDF 100% 일치 목표)

> **2026-05-07 정정**: 초안 anchor 22개(T-01~T-16 + R-01~R-03 + 분모 단위 3) → 실제 구현 **15개** (단건 6 + 합산 5 + 회귀/분모 단위 4). 테스트 합치 + TS 타입 보장으로 흡수된 보조 anchor 정리.
>
> 핵심 결과 anchor (T-12·T-13·T-14)는 **PDF 원단위 일치** 100% 충족. 보조 anchor 일부는 핵심 anchor가 함의(예: 누진 컬럼별 산출세액 = 합산 산출세액 - 단기 컬럼).

#### 7.2.1 단건 엔진 anchor (단건 호출 검증) — 6개

| # | 입력 | 기댓값 (toBe) | 구현 |
|---|---|---|---|
| T-01 | 1차 60% 지분 단독 호출 (transferPrice=1.02B, totalPropertyTransferPrice=1.7B) — 양도차익 | 514_800_000 | ✅ |
| T-02·T-03 | 1차 — 비과세 363,388,236 / 과세대상 151,411,764 (한 it 안에 통합) | 363_388_236 / 151_411_764 | ✅ |
| T-04 | 1차 — 장기보유특별공제(80%) | 121_129_411 | ✅ |
| T-05 | 1차 — 양도소득금액 | 30_282_353 | ✅ |
| T-07 | 2차 40% 지분 단독 — 양도차익 | 63_200_000 | ✅ |
| T-08 | 2차 — 양도소득금액 (보유 < 2년 LTHD 0) | 63_200_000 | ✅ |
| ~~T-06~~ | ~~1차 산출세액 누진~~ | ~~3_282_352~~ | ⚠️ T-15 합산 컬럼이 함의 — 단건 anchor 흡수 |
| ~~T-09~~ | ~~2차 산출세액 단기~~ | ~~변동값~~ | ⚠️ 단건 호출 시 의미 없음 — 합산 케이스로 흡수 |

#### 7.2.2 Aggregate 엔진 anchor (합산 검증) — 5개

| # | 입력 | 기댓값 (toBe) | 구현 |
|---|---|---|---|
| T-10 | 합산 양도소득금액 | 93_482_353 | ✅ |
| T-11 | 합산 과세표준 | 90_982_353 | ✅ |
| T-12 | 합산 산출세액 | **39_702_352** | ✅ |
| T-13 | 합산 지방소득세 | **3_970_235** | ✅ |
| T-14 | 합산 총 납부세액 | **43_672_587** | ✅ |
| ~~T-15~~ | ~~누진 컬럼 산출세액~~ | ~~3_282_352~~ | ⚠️ T-12 합산 anchor가 함의 |
| ~~T-16~~ | ~~60% 단기 컬럼 산출세액~~ | ~~36_420_000~~ | ⚠️ T-12 합산 anchor가 함의 |

#### 7.2.3 회귀 anchor (기존 동작 보존)

| # | 케이스 | 검증 |
|---|---|---|
| R-01 | 단독 소유 (ownership 100/100) — 기존 케이스 양도가액 1.5B, 7억 취득가 | 결과값 무변경 |
| R-02 | `totalPropertyTransferPrice` 미설정 시 `calcOneHouseProration` 기존 동작 | 동일 결과 |
| R-03 | `ownershipRatio` undefined 자산 normalize 시 100/100 fallback | 단독 소유로 동작 |

### 7.3 12억 안분 분모 단위 테스트

`reduction-onehouse-proration.test.ts` (신규 또는 기존 통합):
- 분모 = 지분 양도가액(<12억) + totalPropertyTransferPrice 미설정 → 전액 비과세 (기존)
- 분모 = 지분 양도가액(<12억) + totalPropertyTransferPrice=1.7B → 부분 과세
- 분모 fallback 동작 anchor

---

## 8. 구현 순서 (PDCA)

### Round 1 — 엔진 (영향 0 회귀)
1. `TransferTaxInput`에 `totalPropertyTransferPrice?` 추가
2. `calcOneHouseProration` 시그니처 옵션 매개변수 추가
3. `transfer-tax.ts` STEP 3에서 호출 변경
4. 단위 테스트: 12억 안분 분모 동작 (R-02·R-03 포함)
5. 기존 vitest 전체 회귀 0건 확인

### Round 2 — anchor 테스트 (TDD)
6. `fractional-acquisition-case-27.test.ts` 작성
7. 단건 엔진 anchor T-01~T-09 통과
8. Aggregate 엔진 anchor T-10~T-16 통과

### Round 3 — UI (자산 카드 + Step1)
9. `AssetForm` 타입 + initial + normalize 추가
10. `OwnershipRatioInput.tsx` 컴포넌트 작성
11. Step1 자산 카드에 위젯 통합
12. `transfer-tax-validate.ts` 검증 로직 추가
13. 결과 카드에 지분 표시 + 12억 안분 산식 분모 명시

### Round 4 — API/Route (5단 파이프라인)
14. `transfer-tax-api.ts` 자산별 ratio 적용 + `totalPropertyTransferPrice` 전달
15. `transfer-tax-schema-sub.ts` `TransferAssetSchema`에 ratio 필드 추가
16. `transfer-tax-schema.ts` 메인 스키마는 변경 없음 (객체 필드만 추가)
17. Route handler 엔진 input 매핑 (자산별 변환)
18. callTransferTaxAPI body spread 점검

### Round 5 — 검증
19. tsc --noEmit 0건
20. vitest 전체 통과 (기존 + 신규 anchor)
21. 브라우저 수동 확인 — 사례 27 입력 후 결과 일치 확인 (네트워크 탭에서 ratio + totalPropertyTransferPrice body 확인)

---

## 9. 위험 및 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| 기존 단독 소유 케이스 회귀 | 모든 양도세 사용자 영향 | `ownershipRatio` 기본값 100/100 + `totalPropertyTransferPrice` undefined fallback. R-01·R-02·R-03 회귀 anchor로 사전 차단 |
| 사용자가 100% 기준 입력을 헷갈림 | UX 혼란 | FieldCard hint + ratio < 1.0 시 "지분 모드" 배지 + 결과 카드에 분모 명시 |
| Aggregate 엔진 기본공제 1회 검증 누락 | 합산 세액 오차 | T-11 anchor에서 과세표준 = 합산 양도소득 - 250만 검증 |
| 매매 100% 기준 환산 부담 (600M ÷ 40% = 1.5B) | 사용자 실수 가능 | Phase 2 `actualPaidAmount` 보조 입력 + 자동 환산 토글 검토 |
| Zod 침묵 stripping | 엔진 미도달 | ⑫⑬⑭ TypeScript 미감지 영역 grep 자가 점검 |
| 기존 자산 normalize 호환 | sessionStorage legacy | `migrateLegacyForm`에서 `ownershipNumerator/Denominator` undefined → 100/100 |

---

## 10. 본 계획 범위 외 (별도 PR)

### 10.1 후속 작업 완료 (2026-05-07)

차이분석 후 즉시 처리된 후속 항목:

- **F1 — 결과 카드 자산별 "지분 X%" 라벨** ✅: `BundledAllocationCard.PropertyCard`에 `ownership` 옵션 prop + amber 배지 표시. `TransferTaxCalculator`에서 `formData.assets`로 `propertyId → ratio` 맵 빌드 후 전달
- **F2 — 지분 모드 100% 기준 입력 동적 안내** ✅: `CompanionAssetCard`에 ratio < 1.0 활성 시 amber 톤 강조 배너 (⚠ 심볼 + 매매·상속 산식 예시) 동적 렌더
- **F3 — `isFractional` 헬퍼 통일** ✅: `lib/calc/transfer-tax-api-helpers.ts`에 `isFractionalRatio(n, d: number)` 단일 진실 공급원 + `isFractionalRatioStr` UI 어댑터. `OwnershipRatioInput.isFractionalMode`는 deprecated alias로 재수출 (호환 유지)

### 10.2 사후 발견 — 800줄 정책 위반 처리 ✅

`TransferTaxInput.totalPropertyTransferPrice` 추가 시 `transfer.types.ts` 805줄 도달. PostToolUse hook 자동 감지 → **PHD 타입 235줄을 `transfer-phd.types.ts`로 분리** (805→585줄). 본체에서 `export type {...}` 재수출로 하위 호환 유지. 계획서 초안 미명시 항목.

### 10.3 추후 (Phase 2~)

- **Phase 2 보조 입력 토글**: `actualPaidAmount` (실제 지급액) + 자동 100% 환산
- **동일 물건 지분 그룹 UI**: 같은 주소 + ratio 합산 = 100% 자동 감지 + 시각적 그룹핑
- **동일 물건 지분의 1세대1주택 비과세 면적 합산** (전용면적 95.74m² × ratio 합산 → 보유기간 합산 등) — 본 케이스는 1차의 보유기간만 사용하므로 회피 가능
- **사례 27 외 추가 단계취득 패턴**: 3회 이상 분할 취득, 토지/건물 분리 + 지분 결합 등
- **브라우저 수동 확인** ⏳: 실제 폼 입력 → 계산 → 결과 표시까지 사례 27 재현 (Network 탭에서 ratio + totalPropertyTransferPrice body 확인)

---

## 11. 산출물 체크리스트 (Definition of Done) — 2026-05-07 최종 상태

- [x] Engine Design Doc: 본 계획서 §4·§5에 통합 (별도 design doc 생성 생략 — 케이스 단일·구현 명료)
- [x] **anchor 테스트 15개 100% 통과** (단건 6 + 합산 5 + 회귀/분모 단위 4) — 초안 22개에서 핵심 anchor가 함의하는 보조 anchor 흡수
- [x] 14개 동기화 지점 전부 반영 (⑫⑬⑭ grep 자가 점검 완료)
- [x] tsc --noEmit 0건
- [x] vitest 전체 회귀 0건 (138 파일 / 2329 테스트 100% 통과)
- [x] 메모리 갱신: `project_fractional_acquisition_case_27.md` + MEMORY.md 인덱스
- [x] 800줄 정책 준수 (`transfer-phd.types.ts` 분리)
- [x] 차이분석 후속 F1·F2·F3 모두 완료
- [ ] **브라우저 수동 확인** — Phase 2로 이관 (실제 폼 입력→계산→결과 흐름 + Network 탭 body 검증)
- [ ] PDF 출력·이력 저장 호환성 확인 — Phase 2

**핵심 검증**: 양도코리아 사례 27 PDF 산출세액 **39,702,352** / 지방세 **3,970,235** / 총 납부세액 **43,672,587** 모두 **원단위 일치** ✅

---

## 12. 의문/추후 결정 사항

| # | 항목 | 현 결정 | 추후 검토 시점 |
|---|---|---|---|
| 1 | 실지급액 보조 입력(actualPaidAmount) | Phase 1 미포함 | 사용자 피드백 후 Phase 2 |
| 2 | 동일 물건 지분 자동 그룹핑 | Phase 1 미포함 | 다회 사례 누적 후 |
| 3 | 분모 1000 초과 입력 (예: 12345/67890) | 검증 차단 | 일반적인 분수 표기는 100 이하 |
| 4 | 지분 변경 (이혼·증여 후 일부 양도) | 본 계획 범위 외 | 별도 케이스 인터뷰 |
