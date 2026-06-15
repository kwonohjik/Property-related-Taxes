# 종합부동산세 직전연도 다주택 중과 — UI 설계

> 계획서: `docs/01-plan/features/comprehensive-tax-prior-year-multi-house.plan.md`
> 엔진 설계: `comprehensive-tax-prior-year-multi-house.engine.design.md`
> 대상: `app/calc/comprehensive-tax/page.tsx` Step5TaxCap(:292) · `lib/stores/comprehensive-wizard-store.ts` · `lib/calc/comprehensive-api.ts` · `lib/validators/comprehensive-input.ts`
> 작성일: 2026-06-15 · 13단계 STEP 12

---

## 1. R-5 확정 — 입력 위치·방식

**Step5TaxCap 자동계산 모드 내부**에 직전 주택별 공시 입력(맥락: 세부담상한 = Step5). 당해 주택 수(`properties.length`)에 연동:

- 당해 **1주택** → 기존 단일 `previousYearAutoAssessedValue` 유지(E2E 하위호환 — `reduction-rate.spec.ts`가 단일 placeholder 의존).
- 당해 **2주택+** → 주택별 직전공시 입력란 N개(`previousYearAutoHouseValues[]`).

**★ 혼동 주의**: 기존 `isMultiHouseInAdjustedArea`(page.tsx:322)는 **당해연도** 상한율(300%/150%)·세율 multi 판정용. 직전연도 중과는 **별개 신규 필드** `previousYearAutoIsMultiAdjusted`. 사례4: 당해 OFF(일시적2주택 의제→150%) / 직전 ON(일반2주택 중과).

---

## 2. 위젯 ASCII (Step5TaxCap 자동모드, 당해 2주택)

```
┌─ 직전연도 공시가격 정보 ──────────────────────────┐ (sky)
│ 직전연도 주택별 공시가격 (직전연도 6.1 기준)        │
│  주택1  [ 1,200,000,000 ] 원                       │  ← previousYearAutoHouseValues[0]
│  주택2  [ 1,300,000,000 ] 원                       │  ← previousYearAutoHouseValues[1]
│  합계   2,500,000,000 (자동)                       │  ← read-only Σ
│                                                    │
│ ┌─ [✓] 직전연도 조정대상지역 2주택 이상 ────────┐ │ (rose)
│ │  직전연도 종부세상당액에 중과세율 적용          │ │  ← previousYearAutoIsMultiAdjusted
│ │  (≤2022: 조정 2주택 또는 3주택↑ 중과)          │ │
│ └────────────────────────────────────────────┘ │
│ ┌─ [ ] 직전연도 1세대1주택자 ─────────────────┐ │ (violet, 기존)
│ └────────────────────────────────────────────┘ │  ← previousYearAutoIsOneHouse
│ ⓘ 생년월일·취득일은 1단계 정보 자동 사용         │
└────────────────────────────────────────────────┘
```
- "직전연도 다주택은 직접입력" 안내(page.tsx:395) **제거**(이제 자동 지원).
- 직전 1세대1주택 토글과 직전 조정2주택 토글은 상호배타 아님(직전 1주택이면 중과 무의미하나 엔진 `isMultiHouseRate`가 count=1 처리 — UI 차단 불요).

---

## 3. 14지점 동기화

| # | 지점 | 파일·위치 | 변경 |
|---|---|---|---|
| ① | 폼 상태 | `comprehensive-wizard-store.ts:135-139` | +`previousYearAutoHouseValues: string[]` · +`previousYearAutoIsMultiAdjusted: boolean` |
| ② | initial | `store.ts:211-214` | +`previousYearAutoHouseValues: []` · +`previousYearAutoIsMultiAdjusted: false` |
| ③ | normalize | `store.ts:422-427` onRehydrate | +`?? []` · `?? false` |
| ④⑬ | API 변환 | `comprehensive-api.ts:246-264` | 아래 §4 코드 |
| ⑤ | UI 위젯 | `page.tsx:372-398` Step5TaxCap 자동모드 | §2 ASCII — 주택별 입력(properties.length 연동) + 직전 조정2주택 토글 |
| ⑥ | 사이드바 | — | 해당 없음(직전연도 미표시) |
| ⑦ | 결과뷰 | `ComprehensiveFilingFormBuppyo5Sub.tsx` | **변경 없음** — `detail.appliedRate`(:147)·`propertyTaxEquiv`(:182)·`comprehensiveTaxEquiv`(:258) 이미 렌더. 엔진 정확값이 자동 반영 |
| ⑧ | validation | **종부세 전용 validate 파일 부재**(실측) → Zod(⑨⑫) + UI `required` prop | 자동모드 2주택+ 시 `previousYearAutoHouseValues` 각 입력란 `required`(page.tsx:381 단일 필드 패턴 차용) + 빈칸 시 계산 차단. Zod `priorHouseValues` 항목 nonnegative |
| ⑨⑫ | Zod | `comprehensive-input.ts` previousYearAutoSchema | +`priorHouseValues`·`isMultiHouseInAdjustedArea`·`taxableHouseCount`(엔진 설계 §5) |
| ⑩ | Zod refine | 동상 | 자동·직접 상호배타 유지(무변경) |
| ⑭ | Route | `app/api/calc/comprehensive/route.ts` | previousYearAuto 신규 필드 pass-through(숫자·boolean — Date 변환 불요) |

---

## 4. API 변환 (④⑬ — `comprehensive-api.ts:246-264` 확장)

```ts
const priorHouseStrs = formData.previousYearAutoHouseValues ?? [];
const priorHouseValues =
  priorHouseStrs.length > 0
    ? priorHouseStrs.map(parseAmount).filter((v) => v > 0)
    : undefined;                                  // 단일 케이스 = undefined → 엔진 [assessedValue] fallback
const priorSum = priorHouseValues?.reduce((a, b) => a + b, 0);

const previousYearAuto =
  !isCorporate && capMode === "auto" &&
  (formData.previousYearAutoAssessedValue || priorHouseValues)
    ? {
        // priorHouseValues 있으면 합산을 assessedValue로(단일 원천), 없으면 단일 입력
        assessedValue: priorSum ?? parseAmount(formData.previousYearAutoAssessedValue),
        isOneHouseOwner: formData.previousYearAutoIsOneHouse,
        birthDate: formData.birthDate || undefined,
        acquisitionDate: formData.acquisitionDate || undefined,
        reductionRate: /* 기존 properties[0] 기준 */,
        ownershipRatio: /* 기존 properties[0] 기준 */,
        // ── 신규 ──
        priorHouseValues,                                          // 다주택만 (undefined=단일)
        isMultiHouseInAdjustedArea: formData.previousYearAutoIsMultiAdjusted || undefined,
        taxableHouseCount: priorHouseValues?.length,               // 미입력=엔진 fallback
      }
    : undefined;
```

> ⑬ grep 자가점검: `priorHouseValues`·`isMultiHouseInAdjustedArea`·`taxableHouseCount`가 body까지 도달하는지(TS 미감지 침묵 strip 방지).

---

## 5. Zod (⑨⑫ — `comprehensive-input.ts` previousYearAutoSchema)

```ts
priorHouseValues: z.array(z.number().nonnegative()).optional(),
isMultiHouseInAdjustedArea: z.boolean().optional(),
taxableHouseCount: z.number().int().positive().optional(),
```
- `assessedValue` required 유지(API가 priorSum 세팅). refine: `previousYearAuto`·`previousYearTotalTax` 상호배타(기존 무변경).

---

## 6. E2E (Phase 3)

신규 `e2e/comprehensive-prior-year-multi.spec.ts`:

| ID | 시나리오 | 검증 |
|---|---|---|
| PYM-E1 | 사례4 자동모드 풀입력(2주택+일시적2주택, 직전 [12억,13억]+조정2주택) | 결과뷰 직전 종부세상당액 **39,556,223** · 직전 재산세상당액 **4,740,000** · 세율 **3.6%**(Buppyo5Sub) · ⑤ 6,464,123 |
| PYM-E2 | 직전 조정2주택 OFF(비조정 2주택) | 직전 세율 일반(중과 아님) |
| REGR | 사례2 자동모드(단일 주택) 회귀 | 294,923 불변 (단일 `previousYearAutoAssessedValue` 경로 보존) |

**E2E 함정**(memory): worktree `E2E_PORT=3003` · 계산 전 모달 닫기 · `getByPlaceholder` 단일 vs 주택별 nth 구분 · Buppyo5Sub는 "신고서 서식" 펼침 후 노출.

---

## 7. UI 리스크

| # | 항목 | 처리 |
|---|---|---|
| U-1 | 당해 주택 수 변경 시 `previousYearAutoHouseValues` 행 수 불일치 | properties.length 연동 렌더(인덱스 초과분 무시·부족분 빈칸). **전제: 직전 주택 수 = 당해 주택 수**(사례4 정합). 직전≠당해(중도 처분·추가 취득)는 **직접입력 모드 안내** |
| U-2 | 기존 단일 `previousYearAutoAssessedValue` 與 신규 배열 혼재 | 당해 1주택=단일 필드, 2주택+=배열 — 분기 렌더(§2). API는 배열 우선(priorSum) |
| U-3 | 직전 조정2주택 토글 ↔ 당해 isMultiHouseInAdjustedArea 혼동 | 라벨·hint 명확화("직전연도" 명시). 별개 store 필드 |
| U-4 | E2E `reduction-rate.spec.ts` placeholder 의존 | 단일 케이스 placeholder 유지 — 회귀 0(REGR) |
