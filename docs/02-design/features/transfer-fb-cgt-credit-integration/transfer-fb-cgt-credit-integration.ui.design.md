# 가업상속공제 자산 양도 — §97의2④ + §18의2⑩ UI 통합 명세

> 작성: 2026-05-22 (UI 디자인 전담)
> 대상 Plan: `docs/00-pm/transfer-fb-cgt-credit-integration.plan.md` (v3)
> 의존 사전 PR: `transfer-tax-acquisition-param-refactor` (K7 분리 — 완료 후 Do 진입)
> Do 단계 위임 시점: 엔진 시니어 Pre-Do anchor 완료 + K7 사전 PR merge 확인 후

---

## 0. 800줄 정책 사전 점검 (E항)

| 파일 | 현재 줄수 | 예상 추가 | 예상 총계 | 판단 |
|---|---|---|---|---|
| `app/calc/transfer-tax/TransferTaxCalculator.tsx` | 707 | ~30 | ~737 | 안전 (분리 불필요) |
| `components/calc/results/TransferTaxResultView.tsx` | 778 | ~80 | ~858 | **경계 초과** → `FamilyBusinessImputedComparisonCard` 별도 컴포넌트로 분리 필수 |
| `lib/calc/transfer-tax-validate.ts` | 749 | ~25 | ~774 | 경계 근접 → `validate-fb.ts` sibling 신규 권장 |
| `lib/calc/transfer-tax-api.ts` | 749 | ~20 | ~769 | 경계 근접 — 최소 변경으로 유지 |
| `lib/stores/calc-wizard-asset-factory.ts` | 651 | ~10 | ~661 | 안전 |
| `FamilyBusinessInheritanceTransferSection.tsx` (신규) | 0 | ~180 | ~180 | 신규 단일 컴포넌트 — 분리 완결 |
| `FamilyBusinessImputedComparisonCard.tsx` (신규) | 0 | ~120 | ~120 | TransferTaxResultView에서 분리 |

**분리 결정 목록**:
1. `components/calc/results/FamilyBusinessImputedComparisonCard.tsx` — 신규 (결과 카드)
2. `components/calc/transfer/FamilyBusinessInheritanceTransferSection.tsx` — 신규 (입력 섹션)
3. `lib/calc/validate-fb.ts` (선택) — transfer-tax-validate.ts +25줄 후 749+25=774줄. 이미 경계 근접이므로 validate-fb.ts 신규 분리 권장하나 필수는 아님 (Do 단계 초반 실 줄수 확인 후 결정).

---

## 1. AssetForm 타입 변경 (지점 ①)

`AssetForm`은 **자산-수준** 구조이므로 `familyBusinessInheritance` 서브객체를 자산 카드에 추가.

### 1-1. 신규 인터페이스 (신규 파일 권장: `lib/stores/calc-wizard-asset-fb.ts`)

```typescript
/**
 * 가업상속공제 적용 자산 양도 시 §97의2④ 의제 취득가액 입력 (폼-수준, 문자열 기반).
 * API 변환 시 숫자·Date로 변환.
 */
export interface FamilyBusinessInheritanceTransferForm {
  /** 피상속인의 원취득가액 (§97의2④1호, 원) */
  decedentAcquisitionPrice: string;
  /**
   * 상속개시일 현재 자산 평가가액 (§97의2④2호, 원).
   * 상증법 §60·§63 보충적 평가가액 (시가 있으면 시가, 없으면 보충적 평가).
   */
  inheritanceMarketValue: string;
  /**
   * 가업상속공제적용률 (0~1 소수, 소령 §163의2 — Pre-Do FB-CGT-LAW-1 확정 필요).
   * 잠정 산식: 가업상속공제 적용액 / 가업상속재산 평가액.
   * 상속세 마법사 결과에서 K10 prefill 가능 (사용자 override).
   */
  fbDeductionAppliedRate: string;
  /**
   * 상속개시일 (YYYY-MM-DD).
   * 자본적지출 시점 분기용 — 피상속인(상속 전) vs 상속인(상속 후) 구분.
   */
  inheritanceDate: string;
  /**
   * 피상속인 자본적지출 (선택, 원) — 1호 산식 내 합산.
   * 본 PR 기본 정책: §97② 필요경비 통합(별도 입력 없음). 후속 PR에서 분리 지원.
   */
  decedentCapitalExpenditure?: string;
  /**
   * 상속인 자본적지출 (선택, 원) — 2호 산식 내 합산.
   */
  heirCapitalExpenditure?: string;

  // ── K10 prefill 메타 (UI 전용, API 전송 제외) ──
  /**
   * prefill 출처 식별자 — 상속세 이력 자동 도출 시 설정.
   * 형식: "inheritance:{calculationId}" 또는 undefined(수동 입력).
   * API 변환 시 제외 (엔진 미도달 무관).
   */
  prefillSourceId?: string;
}
```

### 1-2. `AssetForm` 확장 (calc-wizard-asset.ts)

```typescript
export interface AssetForm extends BurdenedGiftFormSlice, RedevelopmentFormSlice {
  // ... 기존 필드 (생략)

  /**
   * 가업상속공제 §97의2④ 의제 취득가액 입력.
   * undefined = 토글 OFF (일반 §97 산식). 객체 존재 = 토글 ON.
   * 3-state 필요 없음 — undefined/object 2-state로 충분 (단일 서브객체, 배열 아님).
   */
  familyBusinessInheritance?: FamilyBusinessInheritanceTransferForm;
}
```

**주의**: `BurdenedGiftFormSlice`, `RedevelopmentFormSlice`처럼 별도 slice 파일로 분리해도 되나,
본 PR은 서브객체 1개이므로 `calc-wizard-asset-fb.ts` 타입 정의 + `AssetForm`에 optional 필드 추가로 충분.

---

## 2. initial value / normalize (지점 ②③)

### 2-1. `makeDefaultAsset` 변경 (`calc-wizard-asset-factory.ts`)

```typescript
// 기존 블록 끝 (redevCompletionDate: "" 이후) 추가:
// ── 가업상속공제 §97의2④ 의제 취득가액 입력 ──
// undefined = 토글 OFF (기본값). ToggleCard ON 시 초기화됨.
// familyBusinessInheritance: undefined (명시 생략 — AssetForm optional 필드)
```

- `makeDefaultAsset` 반환 객체에 `familyBusinessInheritance` 키 자체를 포함하지 않음 (undefined). ToggleCard ON 핸들러에서 초기 서브객체 할당.
- factory default = undefined (명시 생략) = normalize undefined 처리 = UI 토글 OFF (3중 일관성 충족).

### 2-2. `migrateAsset` 변경 (`calc-wizard-asset-factory.ts`)

```typescript
// migrateAsset 내부 말미에 추가:
// familyBusinessInheritance 마이그레이션 — 구형 sessionStorage에 키 없으면 undefined로 유지.
// 이미 optional이므로 추가 처리 불필요.
// 단, prefillSourceId 같은 내부 필드가 있으면 삭제하지 말 것 (재진입 시 UI 표시에 사용).
```

normalize 패턴: `raw.familyBusinessInheritance` 없으면 undefined 그대로 — 추가 처리 불필요.
내부 서브필드(decedentAcquisitionPrice 등)는 string이므로 별도 coerce 불필요.

---

## 3. API 변환 (지점 ④)

`lib/calc/transfer-tax-api.ts` — `buildAssetPayload` 함수 말미에 추가.

```typescript
// ⑬ 가업상속공제 §97의2④ — undefined이면 키 미포함 (Zod optional 통과)
// inheritanceDate: DateInput → ISO string (string 그대로 전달, Zod에서 z.string().date() 검증)
...(asset.familyBusinessInheritance !== undefined
  ? {
      familyBusinessInheritance: {
        decedentAcquisitionPrice: parseAmount(asset.familyBusinessInheritance.decedentAcquisitionPrice),
        inheritanceMarketValue: parseAmount(asset.familyBusinessInheritance.inheritanceMarketValue),
        fbDeductionAppliedRate: parseDecimal(asset.familyBusinessInheritance.fbDeductionAppliedRate),
        inheritanceDate: asset.familyBusinessInheritance.inheritanceDate,
        // capex 선택 필드: 빈 문자열이면 undefined 전달 (엔진 미도달)
        ...(asset.familyBusinessInheritance.decedentCapitalExpenditure
          ? { decedentCapitalExpenditure: parseAmount(asset.familyBusinessInheritance.decedentCapitalExpenditure) }
          : {}),
        ...(asset.familyBusinessInheritance.heirCapitalExpenditure
          ? { heirCapitalExpenditure: parseAmount(asset.familyBusinessInheritance.heirCapitalExpenditure) }
          : {}),
        // prefillSourceId는 UI 전용 — API에 포함하지 않음
      },
    }
  : {}),
```

**주의 사항**:
- `parseDecimal`은 `@/components/calc/inputs/DecimalInput`에서 import (fbDeductionAppliedRate가 소수).
- inheritanceDate는 string 그대로 전달 — route handler에서 `toDate()` coerce (⑭ 담당).
- `feedback_explicit_prop_mapping_strip` 정책: 명시 spread 방식으로 신규 선택 필드 침묵 strip 방지.

---

## 4. UI 입력 위젯 (지점 ⑤)

### 4-1. 위치

`app/calc/transfer-tax/steps/Step1.tsx` — 자산 카드 내부, `CompanionAcquisitionCauseSection` 이후 (취득원인 섹션 아래).

활성화 조건: `asset.acquisitionCause === "inheritance"` AND `assetKind`가 주택·토지·건물류 (주식 제외). 가업상속 자산은 반드시 상속 취득이어야 하므로.

```tsx
{/* 가업상속공제 §97의2④ — 상속 취득 자산만 표시 */}
{asset.acquisitionCause === "inheritance" && (
  <FamilyBusinessInheritanceTransferSection
    asset={asset}
    onChange={(patch) => updateAsset(asset.assetId, patch)}
  />
)}
```

### 4-2. `FamilyBusinessInheritanceTransferSection` 컴포넌트 명세

파일: `components/calc/transfer/FamilyBusinessInheritanceTransferSection.tsx`
예상 줄수: ~180줄

**구조**:

```
[ToggleCard "가업상속공제 적용 자산 (소법 §97의2④)" — emerald tone]
  OFF: emerald-50/70 배경 유지, 안내 문구 "가업상속공제를 받은 자산을 양도할 때 선택하세요"
  ON:
  ┌─── FamilyBusinessInheritanceTransferSection 본체 ───────────────────────────┐
  │                                                                              │
  │  [sky 안내 카드] §97의2④ 강제 적용 안내                                      │
  │  "가업상속공제 자산 양도 시 의제 취득가액이 강제 적용됩니다.                  │
  │   의제 산식 적용 양도세가 일반 산식보다 낮더라도 의제 산식이 적용되며,         │
  │   차액은 상속세에서 공제(§18의2⑩)됩니다."                                    │
  │                                                                              │
  │  ── [K10 prefill 버튼] ─────────────────────────────────────────────────── │
  │  [이력 자동 조회] — 로그인 + 상속세 이력 존재 시 활성화                       │
  │  (비활성 안내: "상속세 계산 후 결과를 이 화면에서 불러올 수 있습니다")         │
  │                                                                              │
  │  [prefill 배지] (prefillSourceId 존재 시): "상속세 결과 자동 도출 — 수정 가능" │
  │                                                                              │
  │  ── 입력 필드 ─────────────────────────────────────────────────────────── │
  │  ① 피상속인 원취득가액 (§97의2④1호)                                          │
  │     CurrencyInput                                                            │
  │     placeholder: "피상속인이 실제 취득한 금액"                               │
  │     hint: "§97의2④1호 — 피상속인 취득가액 × 적용률에 해당하는 부분"          │
  │                                                                              │
  │  ② 상속개시일 현재 자산 평가가액 (§97의2④2호)                                │
  │     CurrencyInput                                                            │
  │     placeholder: "상속 당시 시가 또는 보충적 평가가액"                       │
  │     hint: "상증법 §60·§63 보충적 평가가액. 시가 확인 가능 시 시가 입력"       │
  │                                                                              │
  │  ③ 상속개시일                                                                │
  │     DateInput                                                                │
  │     placeholder: "YYYY-MM-DD"                                                │
  │     hint: "자본적지출 귀속 시점(피상속인/상속인) 분기 기준"                  │
  │                                                                              │
  │  ④ 가업상속공제적용률                                                        │
  │     DecimalInput (소수 4자리, 0.0000~1.0000)                                │
  │     placeholder: "0.0000"                                                    │
  │     hint: "소령 §163의2 — 가업상속공제 적용액 ÷ 가업상속재산 평가액 (잠정)"  │
  │     prefill 표시: "0.7853 (상속세 결과 자동 도출)" + 수정 가능               │
  │                                                                              │
  │  [의제 취득가액 미리보기 — useMemo]                                           │
  │  "의제 취득가액 = 피상속인 원취득가액 × 적용률 + 상속개시 평가액 × (1-적용률)" │
  │  "= 100,000,000 × 0.8000 + 300,000,000 × 0.2000 = 140,000,000"             │
  │  (모든 필드 입력 시만 표시, 일부 미입력 시 미표시)                           │
  │                                                                              │
  │  [선택] 자본적지출 분리 입력 토글 (violet ToggleCard)                        │
  │  "피상속인·상속인 자본적지출 분리 입력 (후속 PR 구현 전 수동 입력 가능)"      │
  │  ON 시:                                                                       │
  │    - 피상속인 자본적지출 CurrencyInput                                       │
  │    - 상속인 자본적지출 CurrencyInput                                         │
  │  (본 PR 기본 정책: §97② 필요경비 통합 — capex 분리 필드는 UI 노출하되        │
  │   엔진 전달은 선택적 전달로 처리)                                            │
  │                                                                              │
  └──────────────────────────────────────────────────────────────────────────────┘
```

### 4-3. ToggleCard ON/OFF 핸들러

```typescript
// ON: 서브객체 초기화
onChange({
  familyBusinessInheritance: {
    decedentAcquisitionPrice: "",
    inheritanceMarketValue: "",
    fbDeductionAppliedRate: "",
    inheritanceDate: asset.inheritanceDate || "", // 자산 상속개시일 prefill
    prefillSourceId: undefined,
  }
})

// OFF: 서브객체 삭제
onChange({ familyBusinessInheritance: undefined })
```

ON 시 `asset.inheritanceDate`(취득원인 상속 섹션에 입력된 상속개시일)를 `inheritanceDate` 기본값으로 prefill — 동일 값 재입력 불편 해소.

### 4-4. K10 prefill 흐름 (★★★)

**소스**: `InheritanceTaxResult.familyBusinessDetail.appliedRate`

**prefill 버튼 활성 조건**:
1. 사용자 로그인 상태 (`session !== null`)
2. Dexie IndexedDB에 `taxType === "inheritance"` 계산 이력 1건 이상 존재
3. 이력 중 `result.familyBusinessDetail?.appliedRate` 존재하는 건

**prefill 실행 흐름**:
```
[이력 자동 조회 버튼] onClick
  → history-lookup-modal 패턴 (lib/storage CLAUDE.md)
  → 상속세 이력 목록 조회 (Dexie)
  → 날짜 내림차순 표시 (가장 최근 계산 우선)
  → 사용자 선택
  → result.familyBusinessDetail.appliedRate → fbDeductionAppliedRate 필드 자동 입력
  → prefillSourceId = "inheritance:{calculationId}"
  → prefill 배지 표시: "상속세 결과 자동 도출 (YYYY-MM-DD) — 수정 가능"
```

**prefill override 경고 배지**:
- prefillSourceId 존재 AND 사용자가 값 수정 시
- amber 배지: "자동 도출 값에서 수정됨 — 소령 §163의2 산식과 일치하는지 확인하세요"
- 수정된 값이 0~1 범위 벗어나면 validation 오류 (⑧ 담당)

**구현 정책** (`feedback_useeffect_store_mirror_forbidden`):
- prefill은 버튼 `onClick` 핸들러에서 store `onChange` 1회 호출 — useEffect 미러링 절대 금지
- fbDeductionAppliedRate DecimalInput은 비제어(uncontrolled) 초기값이 아닌 controlled (`value={...}` + `onChange={...}`) 패턴으로 사용자 편집 허용

---

## 5. 사이드바 합계 (지점 ⑥)

`lib/stores/calc-wizard-store.ts` — `computeTransferSummary` 함수.

가업상속 토글 ON 자산이 있을 때:
- 기존 양도세 추정 표시에 영향 없음 (의제 취득가액은 엔진 결과 후 확정)
- 결과 수신 후 (`result.familyBusinessDetail` 존재 시) 사이드바에 메타 표시:

```
┌─ 가업상속 §97의2④ ─────────────────┐
│ 의제 산식 양도세    30,000,000      │
│ 일반 산식 양도세    12,000,000      │
│ 상속세 공제 대상    18,000,000      │
└────────────────────────────────────┘
```

표시 조건: `result?.familyBusinessDetail?.creditAmount > 0` — creditAmount=0 (음수 가드 결과) 시 미표시.

**selector 무한 루프 방지** (`feedback_zustand_selector`):
```typescript
// ❌ 금지
const summary = useTransferStore(state => ({
  fbd: state.result?.familyBusinessDetail,
  ...
}));

// ✅ atomic + useMemo
const result = useTransferStore(state => state.result);
const fbdMeta = useMemo(() => {
  if (!result?.familyBusinessDetail) return null;
  return {
    imputedCgt: result.familyBusinessDetail.cgtUnderSection97_2_4,
    baselineCgt: result.familyBusinessDetail.cgtUnderSection97,
    creditAmount: result.familyBusinessDetail.creditAmount,
  };
}, [result]);
```

---

## 6. 결과 카드 (지점 ⑦)

### 6-1. `FamilyBusinessImputedComparisonCard` 컴포넌트

파일: `components/calc/results/FamilyBusinessImputedComparisonCard.tsx`
예상 줄수: ~120줄

표시 조건: `result.familyBusinessDetail !== undefined`

**레이아웃**:

```
┌─ 가업상속공제 자산 양도 (소법 §97의2④) ────────────────────────────────────────────┐
│                                                                                   │
│  [rose 안내 배지] §97의2④ 본문 강제 적용 — 의제 산식이 일반 산식보다 높더라도       │
│                   본문에 따라 의제 산식이 강제 적용됩니다.                         │
│                                                                                   │
│  산식 (소령 §163의2):                                                             │
│  의제 취득가액 = 피상속인 원취득가액 100,000,000 × 적용률 0.8000                  │
│              + 상속개시 평가액 300,000,000 × (1 − 0.8000)                        │
│              = 80,000,000 + 60,000,000 = 140,000,000                             │
│                                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────────────┐ │
│  │               일반 산식 (§97)        의제 산식 (§97의2④, 적용)              │ │
│  │ 양도세액       12,000,000           30,000,000  ← 강제 적용                 │ │
│  │ 적용률                    —           0.8000                                │ │
│  └──────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                   │
│  §18의2⑩ + §15㉑ 양도세 상당액 공제 (상속세에서 공제 가능):                       │
│  = max(0, 의제 양도세 30,000,000 − 일반 양도세 12,000,000)                       │
│  = 18,000,000                                                                    │
│                                                                                   │
│  [creditAmount = 0 시 표시 — amber 배지]                                          │
│  "의제 산식 양도세(12,000,000)가 일반 산식(30,000,000) 이하로                    │
│   상속세 공제액은 0입니다. (§18의2⑩ 단서 — 음수 시 0 처리)"                     │
│   단, §97의2④ 본문에 따라 의제 산식은 강제 적용됩니다.                           │
│                                                                                   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**산식 표기 원칙** (`feedback_result_view_korean_formula`):
- 변수 약어(`fb.rate`, `imputedAcq`) 금지 — 한국어 라벨
- `Math.floor()` 묵시 처리 (산식 표기 금지)
- 숫자 끝 "원" 생략 (`feedback_no_won_suffix`)
- 산식의 각 숫자 옆 변수명 라벨

**인쇄 자동 펼침** (`print-only-css-toggle` 정책):
```tsx
<div className={open ? "block" : "hidden print:block"}>
  {/* 카드 본체 */}
</div>
<button className="print:hidden" onClick={() => setOpen(v => !v)}>
  {open ? "접기" : "펼치기"}
</button>
```

### 6-2. `TransferTaxResultView.tsx` 통합 위치

결과 최상단 (산출세액 직전 또는 직후):

```tsx
{result.familyBusinessDetail && (
  <FamilyBusinessImputedComparisonCard
    detail={result.familyBusinessDetail}
    input={fbInput} // 폼에서 전달 — 피상속인 취득가액·평가액·적용률 (산식 표기용)
  />
)}
```

`fbInput` prop: AssetForm에서 가져온 `familyBusinessInheritance` 서브객체 (산식 표기에 필요).
엔진 결과(`familyBusinessDetail`)만으로 산식 숫자 모두 표기 가능하도록 result echo 필드 확인 필요.

---

## 7. validate (지점 ⑧)

파일: `lib/calc/transfer-tax-validate.ts` (또는 `validate-fb.ts` sibling — Do 단계 줄수 확인 후 결정)

### 7-1. 필수 4개 필드 강제

토글 ON(`familyBusinessInheritance !== undefined`) 시:

| 필드 | 오류 메시지 |
|---|---|
| `decedentAcquisitionPrice` | "피상속인 원취득가액을 입력하세요 (§97의2④1호)" |
| `inheritanceMarketValue` | "상속개시일 현재 자산 평가가액을 입력하세요 (§97의2④2호)" |
| `fbDeductionAppliedRate` | "가업상속공제적용률을 입력하세요 (소령 §163의2)" |
| `inheritanceDate` | "상속개시일을 입력하세요" |

### 7-2. 범위 검증

- `fbDeductionAppliedRate`: 0 이상 1 이하 (소수 4자리). 범위 이탈 시 "0~1 사이의 소수를 입력하세요"
- `inheritanceDate`: 날짜 형식 검증 (YYYY-MM-DD). 양도일 이전이어야 함 ("상속개시일이 양도일 이후입니다")
- `decedentAcquisitionPrice`, `inheritanceMarketValue`: 0 이상 양수

### 7-3. 정책 준수

- `feedback_no_silent_apportion_fallback`: 미입력 시 자동 fallback 절대 금지 — 오류로 차단
- `feedback_validation_sync_8th_point`: API 변환에서 `undefined`일 때 키 미포함 처리와 validate의 필수 검증이 일관 (토글 OFF → API payload 없음 → validate 통과; 토글 ON → API payload 있음 → validate 4필드 강제)

---

## 8. Zod enum (지점 ⑨⑩) — 해당 없음

`familyBusinessInheritance` 서브객체 필드는 모두 number/string/date — enum 없음.
따라서 Zod discriminatedUnion 추가 불필요.

---

## 9. acquisitionDate fallback (지점 ⑪) — 영향 없음

`familyBusinessInheritance`는 자산-수준 서브객체이며, 기존 자산-수준 `acquisitionDate` 필드와 독립적으로 동작. 상속 취득 자산의 `inheritanceDate`는 기존 `asset.inheritanceDate` 필드와 별개 (가업상속 전용 상속개시일 = 동일한 경우 많으나 별도 필드 유지).

---

## 10. Zod 객체 정의 (지점 ⑫)

신규 파일 권장: `lib/validators/transfer-fb-input.ts` (또는 기존 `transfer-input.ts` 확장)

```typescript
import { z } from "zod";

export const familyBusinessInheritanceTransferSchema = z.object({
  /** 피상속인 원취득가액 (§97의2④1호) */
  decedentAcquisitionPrice: z.number().int().nonnegative(),
  /**
   * 상속개시일 현재 자산 평가가액 (§97의2④2호).
   * 상증법 §60·§63 보충적 평가가액.
   */
  inheritanceMarketValue: z.number().int().nonnegative(),
  /**
   * 가업상속공제적용률 (소령 §163의2).
   * 0 이상 1 이하 소수.
   */
  fbDeductionAppliedRate: z.number().min(0).max(1),
  /** 상속개시일 (YYYY-MM-DD) — route handler에서 toDate() coerce */
  inheritanceDate: z.string().date(),
  /** 자본적지출 분리 (선택 — 본 PR 기본: §97② 통합) */
  decedentCapitalExpenditure: z.number().int().nonnegative().optional(),
  heirCapitalExpenditure: z.number().int().nonnegative().optional(),
});

export type FamilyBusinessInheritanceTransferSchema = z.infer<typeof familyBusinessInheritanceTransferSchema>;
```

Route handler의 메인 Zod 스키마(또는 `singleTransferInputSchema`)에 통합:

```typescript
familyBusinessInheritance: familyBusinessInheritanceTransferSchema.optional(),
```

---

## 11. callTransferTaxAPI body spread (지점 ⑬)

`lib/calc/transfer-tax-api.ts` — `buildAssetPayload` 내 기존 `// ⑬ ...` 블록들 다음에 추가:

```typescript
// ⑬ 가업상속공제 §97의2④ — TypeScript 미감지 영역, 명시 spread 필수
// undefined이면 키 자체 미포함 (Zod optional 통과)
...(asset.familyBusinessInheritance !== undefined
  ? { familyBusinessInheritance: buildFamilyBusinessInheritancePayload(asset.familyBusinessInheritance) }
  : {}),
```

`buildFamilyBusinessInheritancePayload` 순수 헬퍼 함수 신규 (같은 파일 상단):

```typescript
function buildFamilyBusinessInheritancePayload(
  fb: FamilyBusinessInheritanceTransferForm,
): FamilyBusinessInheritanceTransferInput {
  return {
    decedentAcquisitionPrice: parseAmount(fb.decedentAcquisitionPrice),
    inheritanceMarketValue: parseAmount(fb.inheritanceMarketValue),
    fbDeductionAppliedRate: parseDecimal(fb.fbDeductionAppliedRate),
    inheritanceDate: fb.inheritanceDate,
    ...(fb.decedentCapitalExpenditure
      ? { decedentCapitalExpenditure: parseAmount(fb.decedentCapitalExpenditure) }
      : {}),
    ...(fb.heirCapitalExpenditure
      ? { heirCapitalExpenditure: parseAmount(fb.heirCapitalExpenditure) }
      : {}),
    // prefillSourceId: 제외 (UI 전용 메타)
  };
}
```

`FamilyBusinessInheritanceTransferInput` (엔진 타입)은 엔진 시니어가 `TransferTaxInput`에 추가.
본 함수 반환 타입으로 참조하여 TypeScript가 누락 필드를 catch.

---

## 12. Route handler 엔진 input 매핑 (지점 ⑭)

`app/api/calc/transfer/route.ts` — 엔진 input 조립 블록에 추가:

```typescript
// ⑭ 가업상속공제 §97의2④ — Date 변환 필수 (date-coerce 정책)
...(validatedBody.familyBusinessInheritance !== undefined
  ? {
      familyBusinessInheritance: {
        ...validatedBody.familyBusinessInheritance,
        // inheritanceDate: string → Date (coerceDates 또는 toDate)
        inheritanceDate: toDate(validatedBody.familyBusinessInheritance.inheritanceDate, "familyBusinessInheritance.inheritanceDate"),
      },
    }
  : {}),
```

`toDate` import: `import { toDate } from "@/lib/api/date-coerce"` (기존 pattern).

---

## 13. 14개 동기화 지점 체크리스트 (Design 완료 기준)

| 지점 | 위치 | 내용 | 명세 완료 |
|---|---|---|---|
| ① AssetForm 타입 | `calc-wizard-asset.ts` + `calc-wizard-asset-fb.ts` | `familyBusinessInheritance?: FamilyBusinessInheritanceTransferForm` | ✅ |
| ② initial value | `calc-wizard-asset-factory.ts` `makeDefaultAsset` | 키 생략 (undefined) — ToggleCard ON 시 초기화 | ✅ |
| ③ normalize fallback | `calc-wizard-asset-factory.ts` `migrateAsset` | 구형 sessionStorage에 키 없음 → undefined 유지 (추가 처리 불필요) | ✅ |
| ④ API 변환 | `lib/calc/transfer-tax-api.ts` `buildAssetPayload` | `buildFamilyBusinessInheritancePayload` 헬퍼 + spread | ✅ |
| ⑤ UI 위젯 | `components/calc/transfer/FamilyBusinessInheritanceTransferSection.tsx` | ToggleCard emerald + 4필드 + K10 prefill 버튼 + 미리보기 | ✅ |
| ⑥ 사이드바 합계 | `lib/stores/calc-wizard-store.ts` `computeTransferSummary` | result 수신 후 creditAmount > 0 시 3-행 메타 표시 | ✅ |
| ⑦ 결과 카드 | `FamilyBusinessImputedComparisonCard.tsx` (신규) | 의제·일반 비교 표 + §18의2⑩ creditAmount + rose/amber 안내 배지 | ✅ |
| ⑧ validate | `lib/calc/transfer-tax-validate.ts` (또는 `validate-fb.ts`) | 4 필수 필드 강제 + 범위 검증 (자동 fallback 금지) | ✅ |
| ⑨ Zod enum 메인 | route.ts discriminatedUnion | 해당 없음 (enum 추가 없음) | ✅ (N/A) |
| ⑩ Zod enum 컴패니언 | 해당 없음 | 해당 없음 | ✅ (N/A) |
| ⑪ acquisitionDate fallback | route.ts | 영향 없음 (독립 서브객체) | ✅ (N/A) |
| ⑫ Zod 객체 정의 | `lib/validators/transfer-fb-input.ts` | `familyBusinessInheritanceTransferSchema` | ✅ |
| ⑬ body spread | `lib/calc/transfer-tax-api.ts` | 명시 spread `buildFamilyBusinessInheritancePayload` — 침묵 strip 방지 | ✅ |
| ⑭ Route handler 매핑 | `app/api/calc/transfer/route.ts` | `toDate()` coerce + 서브객체 스프레드 | ✅ |

**명세 완료 카운트: 14/14** (⑨⑩⑪은 N/A 확인)

---

## 14. UI 케이스 매트릭스 (C항)

| # | 시나리오 | 토글 | prefill | fbDeductionAppliedRate | 결과 |
|---|---|---|---|---|---|
| C-1 | 기본 — 일반 산식 | OFF | — | — | `familyBusinessDetail` 없음. 기존 §97 산식 그대로 |
| C-2 | 토글 ON + 상속세 이력 자동 prefill | ON | 상속세 이력 자동 | 0.7853 (자동 도출) | 의제 취득가액 = 피상속인취득가 × 0.7853 + 평가액 × 0.2147. §97의2④ 강제 적용 |
| C-3 | 토글 ON + 상속세 이력 없음 (수동) | ON | 없음 | 사용자 직접 입력 | C-2 동일 경로. prefill 배지 없음 |
| C-4 | 토글 ON + prefill override | ON | 자동 도출 후 수정 | 사용자 수정값 | amber 경고 배지 "자동 도출 값에서 수정됨". 수정값으로 의제 취득가액 산출 |
| C-5 | 의제 양도세 < 일반 양도세 | ON | 임의 | 낮은 적용률 | creditAmount = 0 (음수 가드). amber "상속세 공제액 0". 의제 산식은 여전히 강제 적용 |
| C-6 | capex 분리 입력 (선택) | ON + capex ON | 임의 | 임의 | decedentCapEx → API 전달. 엔진에서 1호 산식 내 합산 (엔진 시니어 구현 완료 후) |
| C-7 | 토글 OFF → ON → OFF (데이터 폐기) | ON → OFF | — | — | familyBusinessInheritance = undefined. 재진입 시 초기 빈 객체 재생성 |

**케이스 매트릭스 행 수: 7행**

---

## 15. 정책 준수 사전 명시 (F항)

| 정책 | 적용 내용 |
|---|---|
| `feedback_useeffect_store_mirror_forbidden` | K10 prefill은 버튼 onClick 핸들러에서 1회 onChange 호출. useEffect로 store에 write 금지 |
| `feedback_store_default_vs_ui_display_fallback` | factory default = undefined (명시 생략) = normalize undefined = UI 토글 OFF. 3중 일관성 확보. display fallback `value={fb.fbDeductionAppliedRate || ""}` 사용 (빈 문자열 허용) |
| `feedback_toggle_card_visibility` | ToggleCard emerald tone — OFF 상태에도 `bg-emerald-50/70` 배경 유지. native checkbox 금지 |
| `feedback_select_on_focus` | CurrencyInput·DateInput·DecimalInput 내장 — 개별 `onFocus` 추가 금지. SelectOnFocusProvider 전역 적용 |
| `feedback_no_won_suffix` | 결과 카드 숫자 끝 "원" 표기 생략 |
| `feedback_no_silent_apportion_fallback` | 4 필수 필드 미입력 시 validation 오류로 차단. 자동 채우기 금지 |
| `feedback_explicit_prop_mapping_strip` | buildFamilyBusinessInheritancePayload 명시 spread 패턴 — 신규 optional 필드 침묵 strip 방지 |
| `feedback_validation_sync_8th_point` | API 변환 토글 OFF → undefined → ⑧ validate 토글 OFF 패스. 토글 ON → 4필드 강제 — UI·API·validate 3중 일관 |
| `feedback_zustand_selector` | 사이드바 selector: atomic 분리 + useMemo 래핑. 새 객체 selector 반환 금지 |
| `feedback_date_input` | inheritanceDate는 DateInput 사용. `type="date"` native input 금지 |
| `feedback_decimal_input` | fbDeductionAppliedRate는 DecimalInput (소수). CurrencyInput 사용 금지 |

---

## 16. Do 단계 진입 전 미해결 질문

1. **FB-CGT-LAW-1 확정 필요**: 소령 §163의2 가업상속공제적용률 산정 산식 — "공제액 / 가업상속재산 평가액" 단순 비율 vs 자산별 분리 적용 여부. 엔진 시니어 Pre-Do anchor 완료 후 확정. Zod 스키마 `fbDeductionAppliedRate: z.number().min(0).max(1)` 는 확정 산식 무관하게 유효.

2. **K7 사전 PR 완료 여부**: `transfer-tax-acquisition-param-refactor` 사전 PR merge 없이 Do 단계 진입 불가. `runTransferEngineWithAcquisition` 헬퍼 signature 확정 후 ⑭ route handler 매핑 최종 작성.

3. **InheritanceTaxResult.familyBusinessDetail.appliedRate 필드 존재 여부**: 상속세 엔진 시니어가 결과 타입에 `appliedRate` 노출했는지 확인 필요. K10 prefill 버튼 활성화 조건 구현 전 확인. 없으면 상속세 측에 echo 필드 추가 요청.

4. **result echo 필드 확인**: `TransferTaxResult.familyBusinessDetail`에 `decedentAcquisitionPrice`, `inheritanceMarketValue`, `fbDeductionAppliedRate` echo 여부 — 결과 카드 산식 표기에 필요. 없으면 엔진 시니어에게 echo 필드 추가 요청 (`echo-field-pattern` 정책).

---

## 17. 관련 파일 목록 (Do 단계 변경 대상)

```
신규 파일:
  components/calc/transfer/FamilyBusinessInheritanceTransferSection.tsx
  components/calc/results/FamilyBusinessImputedComparisonCard.tsx
  lib/validators/transfer-fb-input.ts
  lib/stores/calc-wizard-asset-fb.ts  (타입 정의 — 선택: calc-wizard-asset.ts 인라인 가능)

변경 파일:
  lib/stores/calc-wizard-asset.ts        (① AssetForm 확장)
  lib/stores/calc-wizard-asset-factory.ts (② makeDefaultAsset, ③ migrateAsset)
  lib/calc/transfer-tax-api.ts           (④⑬ buildAssetPayload + 헬퍼 함수)
  app/calc/transfer-tax/steps/Step1.tsx  (⑤ ToggleCard 조건부 렌더링)
  lib/stores/calc-wizard-store.ts        (⑥ computeTransferSummary)
  components/calc/results/TransferTaxResultView.tsx (⑦ FamilyBusinessImputedComparisonCard 통합)
  lib/calc/transfer-tax-validate.ts      (⑧ 4필드 강제 — 또는 validate-fb.ts 신규)
  app/api/calc/transfer/route.ts         (⑫⑭ Zod 스키마 통합 + Date coerce)
```
