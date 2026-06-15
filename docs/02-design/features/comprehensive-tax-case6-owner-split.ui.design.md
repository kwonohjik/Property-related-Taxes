# 종합부동산세 사례6 — 건물·부속토지 시가표준액 안분 UI 설계

> 계획서: `docs/01-plan/features/comprehensive-tax-case6-owner-split.plan.md` · 엔진설계: `comprehensive-tax-case6-owner-split.engine.design.md`
> 작성일: 2026-06-15 · 13단계 STEP 12
> 범위: 주택별 **건물·부속토지 소유자 분리** 입력(시가표준액 토지/건물 당해·직전) + 안분비율 자동 표시 + 결과 산식. 8 클라이언트 + Zod/Route.

---

## 1. 사용자 시나리오 (사례6)

1. Step1: 2022 + ≠1세대1주택(isOneHouseOwner=false)
2. Step2 주택 1채: 공시가격 15억 → **"건물·부속토지 소유자 분리" 토글 ON** → 소유 부분 "토지만" 선택 → 시가표준액 당해(토지 8억·건물 2억) + 직전(토지 7.8억·건물 2.6억) 입력 → **안분비율 자동 표시 "80% (8억/10억)"**
3. Step5 세부담상한: 자동모드 + 직전 공시 14억
4. 계산 → ⑤ 1,367,616 + 신고서 서식: ① "공시 15억 × (8억/10억=80%) = 12억", ②ⓐ "100% 재산세 2,970,000 × 80% = 2,376,000"

---

## 2. 폼 상태 (①②③ — `lib/stores/comprehensive-wizard-store.ts` `PropertyForm`)

```ts
// ① 신규 필드 (PropertyForm — :14~ assessedValue 인근)
appurtenantSplitEnabled: boolean;   // 건물·부속토지 소유자 분리 토글
appurtenantOwnedPart: string;       // "land" | "building" (디폴트 "land")
landStdValue: string;               // 당해 토지 시가표준액 (원, CurrencyInput)
buildingStdValue: string;           // 당해 건물 시가표준액 (원)
priorLandStdValue: string;          // 직전 토지 시가표준액 (세부담상한 자동계산용)
priorBuildingStdValue: string;      // 직전 건물 시가표준액
```

- ② INITIAL(:153~): `false`/`"land"`/`""`×4
- ③ normalize(:414~ merge): `?? false`/`?? "land"`/`?? ""` (sessionStorage 호환)

---

## 3. UI 위젯 (⑤ — `components/calc/PropertyListInput.tsx`)

공시가격(:155-170) + 지분율/감면율 그리드(:172-211) **직후** 배치 (UI 순서 = 안분이 공시가격에 적용되는 로직 순서):

```
[ToggleCard tone="amber" "건물·부속토지 소유자 분리"]   ← OFF도 amber 배경 (소유자 분리 = amber)
  ON 시 children:
  ┌ 소유 부분  [RadioCardGroup inline: "토지만 소유" | "건물만 소유"]      (appurtenantOwnedPart)
  ├ 당해 시가표준액  [토지 CurrencyInput] [건물 CurrencyInput]              (landStdValue/buildingStdValue)
  ├ 직전 시가표준액  [토지 CurrencyInput] [건물 CurrencyInput]  hint:"세부담상한 자동계산 시(자동모드만 사용)"  (priorLandStdValue/priorBuildingStdValue)
  └ [자동표시] "안분비율: 80.00% (토지 8억 / 전체 10억)"   ← 양 시가표준액 >0 시만 표시(0-division 가드). useMemo derive (store 미러링 금지)
```

- ToggleCard `tone="amber"` (CLAUDE.md tone: amber=토지/건물 분리·소유자 분리). OFF도 `bg-amber-50/70`.
- 소유 부분 = `RadioCardGroup` layout="inline" (native radio 금지).
- 시가표준액 = `CurrencyInput`(원·정수 — 면적 아님, DecimalInput 아님) + `parseAmount`.
- 안분비율 표시 = `useMemo`로 derive (onChange 기반, useEffect→store 미러링 금지).
- `ownershipRatio`(공유지분)와 **공존** — 별도 카드 유지(의미 분리).

---

## 4. API 변환 (④⑬ — `lib/calc/comprehensive-api.ts`)

```ts
// 당해 (properties.map, :112 base 객체) — 분리 ON + 양 시가표준액 >0 시만
appurtenantSplit:
  p.appurtenantSplitEnabled &&
  parseAmount(p.landStdValue) > 0 && parseAmount(p.buildingStdValue) > 0
    ? { ownedPart: p.appurtenantOwnedPart === "building" ? "building" : "land",
        landStandardValue: parseAmount(p.landStdValue),
        buildingStandardValue: parseAmount(p.buildingStdValue) }
    : undefined,

// 직전 (previousYearAuto, :269~) — properties[0] 기준(ownershipRatio collapse와 동일 패턴), capMode==="auto"만
appurtenantSplit:
  formData.properties[0]?.appurtenantSplitEnabled &&
  parseAmount(formData.properties[0].priorLandStdValue) > 0 &&
  parseAmount(formData.properties[0].priorBuildingStdValue) > 0
    ? { ownedPart: formData.properties[0].appurtenantOwnedPart === "building" ? "building" : "land",
        landStandardValue: parseAmount(formData.properties[0].priorLandStdValue),
        buildingStandardValue: parseAmount(formData.properties[0].priorBuildingStdValue) }
    : undefined,
```

★ **직전은 직전 시가표준액에서 독립 도출** (당해 0.8 ≠ 직전 0.75). `ownershipRatio` collapse(:287, 당해=직전)는 공유지분이라 유지 — 두 계수 직교.

---

## 5. Zod (⑨⑫) + Route (⑭)

```ts
// ⑨ comprehensivePropertySchema (comprehensive-input.ts:142~) + ⑫ previousYearAuto (:376~) 공통 object
appurtenantSplit: z.object({
  ownedPart: z.enum(["land", "building"]),
  landStandardValue: z.number().int().nonnegative(),
  buildingStandardValue: z.number().int().nonnegative(),
}).optional(),
```

- ⑬ body spread(api.ts): base 객체 + previousYearAuto에 `appurtenantSplit` 포함 (위 §4).
- ⑭ route(`route.ts:80~`·`:109~`): pass-through (`appurtenantSplit: p.appurtenantSplit` / `schema.previousYearAuto.appurtenantSplit`) — 숫자·enum, **Date 변환 불요**.

---

## 6. 결과뷰 산식 (⑦ — `HousingPayableTaxCalcCard.tsx`)

`:91-93` 패턴(form 직접 read — result echo 역산 불가) 차용. `properties[0].appurtenantSplitEnabled` 시:
- **① 안분 행**(Step1 Bullet 분기): "공시가격 합산 15억 × (토지 시가표준액 8억 / 전체 10억 = 80.00%) = 안분 공시가격 12억"
- **②ⓐ — ★Do 환류(계획의 "주석" → 교재 ②ⓐ 충실 분기)**: 기존 ⓐ 라인은 안분 시 부정합(원공시 raw × FMR인데 값은 effective 기반). `hasAppurtenant`면 **100%→안분 분기** 렌더:
  - 재산세 과세표준(100% 지분): 원공시 15억 × FMR 60% = 9억 (`p100Base`)
  - 세부담상한전(100%): 9억 × 0.4% − 63만 = 2,970,000 (`p100Tax` = bracket 직접 계산)
  - 직전 100% 재산세: 안분 직전상당액 ÷ 직전 안분비율 = 2,047,500 × 10.4/7.8 = 2,730,000 (`prior100`)
  - 상한액·상한후: 2,730,000 × 130% = 3,549,000 / Min(2,970,000, 3,549,000) = 2,970,000
  - 부과: 2,970,000 × (토지 8억/전체 10억) = 2,376,000 (= `c.totalPropertyTax`)
  - 비안분 시 기존 라인 보존(分기, Step2 properties 전달 추가)
- **②ⓒ Do 환류**: 분모 행(`총표준세율재산세액`)을 `effectiveIncludedAssessedValue`(안분 12억) 사용으로 정정 — 교재 ⓒ "12억 × 60% × 0.4% − 63만 = 2,250,000" 일치(기존 raw 15억 표시는 모든 factor 케이스 부정합이던 것 동반 정정, 非factor 무영향).

---

## 7. Validation (⑧ — `comprehensive-api.ts` validate + `PropertyListInput` onChange)

- 분리 ON 시 **토지·건물 시가표준액 모두 > 0** 필수(빈값 차단) → owned part >0 자동 보장(엔진 E-2).
- 직전 자동모드(capMode=auto)에서 분리 ON 시 직전 시가표준액 토지·건물 모두 > 0 (전부-or-전무 — 자동 안분 fallback 금지 정책).
- UI 통과 ↔ validate 차단 모순 금지: API가 `>0` 시만 전송하므로 validate도 동일 게이트.

---

## 8. E2E (C6-E1 — `e2e/comprehensive-case6.spec.ts`)

입력경로 = 사례5 C5-E1 차용 + 분리 토글:
```
Step1: 2022, isOneHouseOwner=false (특례 토글 미클릭)
Step2: 공시 15억 → "건물·부속토지 소유자 분리" 토글 ON → "토지만 소유"
       → 당해 토지 8억·건물 2억, 직전 토지 7.8억·건물 2.6억
       → 안분비율 "80" 표시 확인
Step5: cap-mode-auto + 직전 공시 14억
계산 → ⑤ 1,367,616 표시 + 신고서 서식 펼침 → 1,367,616
console error 0
```

### ★ Do 환류 — E2E switch 인덱스 시프트 회귀 (분리 토글 = property card 신규 switch)
분리 ToggleCard가 §8④ 토글 **앞**에 switch를 추가 → `getByRole("switch").nth(N)`/`.first()` 인덱스가 주택당 +1 시프트. 기존 종부세 E2E **4건 회귀**(case5:67·section8-4:58·109·133 — 모두 Step2 §8④ 타겟). **수정: `.last()`로 전환** — §8④는 property card의 마지막 switch이고 마지막 주택의 §8④ = 페이지 마지막 switch이므로 분리 토글 추가·향후 추가에 **불변**. Step1(부부특례·1세대1주택)·Step5(직전 토글) switch는 분리(Step2)와 다른 DOM이라 미영향(prior-year-multi·payable·case12·reduction-rate·tax·year-aware 통과). → 신규 property-card 토글 추가 시 **전체 종부세 E2E 회귀 점검 필수**([[feedback_blocking_validation_full_e2e_regression]]).

---

## 9. 14 동기화 지점 체크리스트

| # | 지점 | 위치 | 작업 |
|---|---|---|---|
| ① 폼 상태 | store `PropertyForm` | 6필드 추가 |
| ② initial | store INITIAL | `false`/`"land"`/`""`×4 |
| ③ normalize | store merge | `?? ` fallback |
| ④ API 변환 | comprehensive-api.ts | 당해 + 직전 `appurtenantSplit` 도출(독립) |
| ⑤ UI 위젯 | PropertyListInput.tsx | ToggleCard amber + RadioCardGroup + 시가표준액 4 + 비율표시 |
| ⑥ 사이드바 | store | **무변경 확정** — comprehensive store에 `compute*Summary` 부재(`"summary"`는 `LandInputMode`뿐, 실측). 안분 미영향 |
| ⑦ 결과 카드 | HousingPayableTaxCalcCard.tsx | ①·②ⓐ 안분 산식 2행 |
| ⑧ validation | api.ts validate + onChange | 토지·건물>0, 직전 전부-or-전무 |
| ⑨ Zod 메인 | comprehensive-input.ts:142~ | property `appurtenantSplit` |
| ⑫ Zod 입력객체 | :376~ previousYearAuto | `appurtenantSplit` |
| ⑬ body spread | comprehensive-api.ts | base + previousYearAuto |
| ⑭ route 매핑 | route.ts:80~·:109~ | pass-through |

(⑩⑪ = 양도세 컴패니언 전용 — 종부세 N/A)

자가 점검: tsc 0 · 전체 vitest 회귀 0(applyEffectiveFactor 시그니처) · anchor PY-S6 · E2E C6-E1 + 기존 종부세 E2E 회귀 0 · 브라우저(Playwright) 확인.
