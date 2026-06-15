# 종합부동산세 사례6 — 주택 건물·부속토지 소유자 분리(시가표준액 비율 안분) 구현 계획서

> 작성일: 2026-06-15 · 대상 worktree: `.claude/worktrees/cpt-test`
> 사례6 = **주택의 건물과 부속토지의 소유자가 다른 경우(≠1세대1주택)**. 납세자(홍길동)는 부속토지만 100% 소유(건물 0%).
> 공시가격을 **건물·토지 시가표준액 비율로 안분**하여 종부세·재산세 계산 (국세청 종부세 세액계산 사례집 제8장 사례6, 2022 귀속).

---

## 0. ★ 핵심 발견 (probe 실증 — 단정)

**사례6의 numeric 결과(⑤ 1,367,616)는 현행 엔진으로 이미 100% 재현됩니다.** 시가표준액 안분비율(당해 0.8 = 8억/10억, 직전 0.75 = 7.8억/10.4억)을 `ownershipRatio`로 전달하면 `effectiveFactor`/`applyEffectiveFactor` 경로가 안분을 정확히 처리합니다. throwaway probe로 전 항목 실측 확인 후 단정 (probe 삭제됨):

| 항목 | PDF | 엔진 실측(ownershipRatio 당해0.8/직전0.75) |
|---|---|---|
| ① 재산세공제전 종부세 | 2,280,000 | 2,280,000 ✓ |
| ⓐ 부과 재산세(안분) | 2,376,000 | 2,376,000 ✓ |
| ②ⓓ 공제할 재산세 | 912,384 | 912,384 ✓ |
| ③ 세부담상한전 | 1,367,616 | 1,367,616 ✓ |
| 나① 직전 재산세상당액 | 2,047,500 | 2,047,500 ✓ |
| 나② 직전 종부세상당액 | 1,708,500 | 1,708,500 ✓ |
| 다 세부담상한액 | 5,634,000 | 5,634,000 ✓ |
| 가 당해 총세액상당액 | 3,743,616 | 3,743,616 ✓ |
| **⑤ 납부할세액** | **1,367,616** | **1,367,616 ✓** |

→ **엔진 계산 로직 미구현 = 0** (사례4 `priorHouseValues`·사례5 `priorSection8Para4Value`와 동일 — numeric 영향 없는 충실재현·입력표현 과제). 세부담상한 미적용(가 3,743,616 ≤ 다 5,634,000)이라 안분 정밀도가 ⑤에 영향 주지 않음.

**진짜 갭 = 입력 표현/UX 3건** (상세 §2 현황표):
1. **직전연도 시가표준액 안분 채널 부재** — 현행 파이프라인은 `ownershipRatio`(공유지분)만 직전에 전달하며, 그것도 `properties[0].ownershipRatio`로 당해와 동일화(api.ts:287-291 — 공유지분은 연도 불변이라 **정상**). 사례6은 연도별로 다른 **시가표준액 안분비율**(당해 0.8 ≠ 직전 0.75)을 표현할 별도 채널이 없어 표현 불가.
2. **시가표준액(토지/건물) 입력 위젯 부재** — 사용자는 시가표준액(토지 8억·건물 2억 등)을 갖고 있지, 사전계산된 비율(0.8)을 갖고 있지 않음.
3. **의미론 불일치** — 사례6 안분은 "건물·토지 시가표준액 비율"(소유자 분리)이지 "공유지분"(`ownershipRatio` 라벨 "단독 소유면 100. 공유지분만 변경.")이 아님. 두 계수는 공존 가능(예: 부속토지를 부부 공유 50%).

---

## 1. 사례6 전체 산식 (PDF 추출 + 검증)

납세자 홍길동: 강남구 삼성동 단독주택의 **부속토지만 100% 소유**(건물 0%). 토지 과세면적 100㎡.

| 구분 | 주택공시가격 | 시가표준액(토지) | 시가표준액(건물) | 안분비율(토지/전체) | 재산세 납부세액 |
|---|---|---|---|---|---|
| '22년(당해) | 15억 | 8억 | 2억 | 8/10 = **0.8** | 2,376,000 |
| '21년(직전) | 14억 | 7.8억 | 2.6억 | 7.8/10.4 = **0.75** | 2,047,500 |

세액감면·탄력세율 없음 가정.

### 당해연도(2022)
- **① 재산세공제전 종부세 = 2,280,000**
  - 공시가격 안분: 15억 × (8억/10억) = **12억**
  - 종부세 과표: (12억 − 6억) × 60% = 3.6억  ← 기본공제 6억(2022 일반, ≠1세대1주택)
  - 종부세: 3.6억 × 0.8% − 600,000 = 2,280,000
- **② 공제할 재산세 = 912,384**
  - ⓐ 해당연도 재산세 = 2,376,000
    - 재산세 과표(100% 지분): 15억 × 60% = 9억
    - 세부담상한전(100%): 9억 × 0.4% − 630,000 = 2,970,000
    - 직전 100% 지분 재산세: 2,047,500 ÷ (7.8/10.4) = **2,730,000**
    - §122 세부담상한: 2,730,000 × 130% = 3,549,000
    - 상한후(100%): Min(2,970,000, 3,549,000) = 2,970,000
    - **부과 = 2,970,000 × (8억/10억) = 2,376,000**  ← 100% 계산·상한 후 안분
  - ⓑ 종부세 과표 표준세율 재산세: 3.6억 × 60% × 0.4% = 864,000  ← 재산세 FMR 60%(≠1세대1주택 — `getPropertyFmrForProration(2022,false)`, probe 확인)
  - ⓒ 총표준세율 재산세: 12억 × 60% × 0.4% − 630,000 = 2,250,000
  - ⓓ 공제: 2,376,000 × (864,000/2,250,000) = 912,384
- **③ 세부담상한전(①−②) = 1,367,616**

### 직전연도(2021) 상당액 — "직전연도 현황 무관, 직전 공시 × 직전 시가표준액 비율"
- **나① 직전 재산세상당액 = 2,047,500**
  - 100% 표준세율: 8.4억(=14억×60%) × 0.4% − 630,000 = **2,730,000**
    - ⚠️ **PDF 오기**: 교재는 이 중간값을 "2,490,000"으로 표기하나 8.4억×0.4%−63만 = **2,730,000**이 정확(2,490,000×0.75=1,867,500 ≠ 2,047,500 / 2,730,000×0.75 = 2,047,500 ✓). 최종 2,047,500은 정합. anchor는 법령 정합값 사용 ([[feedback_anchor_correction_legal_priority]]).
  - 안분: 2,730,000 × (7.8억/10.4억) = 2,047,500
- **나② 직전 종부세상당액(ⓐ−ⓑ) = 1,708,500**
  - ⓐ 재산세공제전 종부세 = 2,820,000: 공시 14억×(7.8/10.4)=**10.5억** → (10.5억−6억)×95% = 4.275억 → 4.275억×0.8%−600,000
  - ⓑ 공제 재산세 = 1,111,500: 2,047,500 × (1,026,000 / 1,890,000)  [분자 4.275억×60%×0.4% / 분모 10.5억×60%×0.4%−63만]
- **나 직전 총세액상당액(①+②) = 3,756,000**

### 세부담상한 + 최종
- **④ 초과세액(가−다≥0) = 0**: 가(②ⓐ+③ = 3,743,616) ≤ 다(나×150% = 5,634,000)
- **⑤ 납부할세액(③−④) = 1,367,616**

---

## 2. 현행 구현 현황 (메커니즘별)

| 메커니즘 | 현행 | 위치 | 판정 |
|---|---|---|---|
| 공시가격 안분(종부세 과표) | `applyEffectiveFactor`로 처리 | `comprehensive-tax.ts:177` | ✓ (ownershipRatio 경로) |
| 재산세 100% 계산 후 안분(ⓐ) | `propTax` 100% → `imposedTax` 안분 | `comprehensive-tax.ts:185-204` | ✓ |
| 재산세 §122 Min 세부담상한 | 안분값 기준 Min | `comprehensive-tax.ts:404-412` | △ (§8 한계 — numeric 0) |
| ②ⓑⓒⓓ 공제 재산세 안분 | 안분 공시 기준 | `comprehensive-tax.ts:380-419` | ✓ |
| 직전 재산세상당액 안분(나①) | `applyEffectiveFactor` | `comprehensive-prior-year.ts:97-102` | ✓ |
| 직전 종부세상당액 안분(나②) | `effectiveAssessedValue` | `comprehensive-prior-year.ts:63-118` | ✓ |
| 세부담상한(가/나/다) | `applyTaxCap` | `comprehensive-tax-helpers.ts:181` | ✓ |
| **시가표준액(토지/건물) 입력** | **없음** | — | ✗ **갭** |
| **당해≠직전 안분비율 표현** | api가 직전=당해 강제 | `comprehensive-api.ts:287-291` | ✗ **갭** |
| **안분비율 자동 도출(시가표준액→비율)** | 없음 | — | ✗ **갭** |
| **건물·토지 분리 의미론(라벨/산식)** | "공유지분"만 | `PropertyListInput.tsx:175-191` | ✗ **갭** |

종부세 엔진에 시가표준액 필드 자체가 없음(공시가격 단일 사용) — 취득세·재산세 엔진에만 존재. `section8para4Type: "appurtenant_land_only"`(§8④1호 부속토지) enum은 존재하나 **1세대1주택 의제 경로 전용**이며 시가표준액 안분과 무관(사례6은 ≠1세대1주택).

---

## 3. 설계 (Scope A — 충실재현, 권장)

사례2~5 패턴(각 사례마다 명시적·충실 메커니즘)을 따라 **시가표준액 비율 안분**을 정식 입력으로 추가. 엔진의 안분 수학은 `ownershipRatio`와 동일(probe 입증)하므로 엔진 변경은 "계수 3-way 확장"으로 최소.

### 3-1. 타입 (`types/comprehensive.types.ts`)

```ts
/** 건물·부속토지 소유자 분리 시 시가표준액 비율 안분 (§8④1호 / 건물·토지 소유자 상이). */
export interface AppurtenantSplitInput {
  ownedPart: "land" | "building";  // 납세자가 소유한 부분 (사례6 = "land")
  landStandardValue: number;       // 토지 시가표준액 (원)
  buildingStandardValue: number;   // 건물 시가표준액 (원)
}
// ComprehensiveProperty +1 (당해)
appurtenantSplit?: AppurtenantSplitInput;
// PreviousYearAutoInput +1 (직전 — 당해와 시가표준액 다름. 비율 변동 허용이 핵심)
appurtenantSplit?: AppurtenantSplitInput;
```

> 안분비율 = `ownedPart==="land" ? land/(land+building) : building/(land+building)`. **분수(num/den) 그대로** 엔진에 전달해 사전 라운딩 0 — float 비율 0.747… 사전라운딩 시 1원 오차 위험([[feedback_safemul_decimal_apportion_precision]]·[[feedback_applyrate_fractional_rate_one_won_error]]).

### 3-2. 엔진 (`comprehensive-tax-helpers.ts` + 5 call sites)

`applyEffectiveFactor`를 **3계수(감면 × 지분 × 시가표준액 안분)**로 확장 — 안분은 정확 분수로 fold:

```ts
// 현행: (base × ratioBp × (10000−rateBp)) / 1e8
// 확장: appurtenant 분수(num/den)를 BigInt 곱/나눗셈에 정확히 결합
export function applyEffectiveFactor(
  base: number, reductionRate?: number, ownershipRatio?: number,
  appurtenant?: { num: number; den: number },  // 시가표준액 안분 분자/분모
): number {
  const ratioBp = BigInt(Math.round((ownershipRatio ?? 1) * 10000));
  const rateBp = BigInt(Math.round((reductionRate ?? 0) * 10000));
  const num = appurtenant ? BigInt(appurtenant.num) : 1n;
  const den = appurtenant ? BigInt(appurtenant.den) : 1n;
  return Number((BigInt(Math.round(base)) * ratioBp * (10000n - rateBp) * num) / (100000000n * den));
}
```

- **call sites 5개** (안분 분수 주입 — V2 grep 실측): `comprehensive-tax.ts:177`(effectiveAssessedValue)·`:204`(imposedTax)·`:233`(effectiveExcludedValue) + `comprehensive-prior-year.ts:63`(effectiveAssessedValue)·`:102`(propertyTaxEquiv). 각 호출부가 `prop.appurtenantSplit` / `auto.appurtenantSplit`에서 `{num, den}` 도출 — `toAppurtenantFraction` 헬퍼(helpers export, 양쪽 import).
  - ★ **자동 전파**: `comprehensive-prior-year.ts:107`(propertyTaxBase)·`:110`(stdTaxNumerator)·`:114`(stdTaxDenominator)와 `comprehensive-tax.ts:380`(numeratorStdTaxEq)·`:389`(aggregatedPropertyTaxBase)·`:392`(denominatorStdTax)는 `effectiveAssessedValue`/`effectiveIncludedAssessedValue`/`taxBase` 파생이라 **안분 계수가 자동 반영** — 별도 주입 불요.
- `effectiveFactor`(float)는 **활성 호출처 0건**(주석·타입doc만 — V1 실측) → 확장 불요(선택적 일관성만).
- **회귀 0**: `appurtenant` 미전달 시 num=den=1 → 기존 동작 보존(사례1~5 anchor 불변, 전체 vitest로 시그니처 변경 회귀 확인).
- **결과 echo**: `OneHouseDeductionResult`처럼 안분 표시용 필드 추가 검토 — 단, 결과뷰는 form 시가표준액 직접 사용 가능(§3-4)이므로 엔진 echo 최소화.

### 3-3. 14 동기화 지점

| # | 지점 | 위치 | 작업 |
|---|---|---|---|
| ① 폼 상태 | `comprehensive-wizard-store.ts:14~` `PropertyForm` | `appurtenantSplitEnabled:boolean`·`appurtenantOwnedPart`·`landStdValue`·`buildingStdValue` + 직전 `priorLandStdValue`·`priorBuildingStdValue` (문자열) |
| ② initial | `:153~` `INITIAL` | 전부 `""`/`false`/`"land"` |
| ③ normalize | `:414~` merge | `?? ""`/`?? false` |
| ④ API 변환 | `comprehensive-api.ts:106~`(properties)·`:269~`(previousYearAuto) | 당해 `appurtenantSplit` 도출 + **직전 `appurtenantSplit`를 직전 시가표준액에서 별도 도출**. ★ **`ownershipRatio` collapse(:287)는 유지가 정답**(공유지분은 연도 불변) — 사례6 갭은 시가표준액 안분비율의 연도 변동(0.8→0.75)이므로 `appurtenantSplit`만 직전 독립 입력. 두 계수 직교 |
| ⑤ UI 위젯 | `PropertyListInput.tsx:172~` | ToggleCard(amber, "건물·부속토지 소유자 분리") + ownedPart 라디오 + 시가표준액 토지/건물(당해)·직전 4입력. 안분비율 자동 표시 |
| ⑥ 사이드바 | `comprehensive-wizard-store.ts` | **무변경 확정** — store에 `compute*Summary` 부재(실측, `"summary"`=LandInputMode뿐). 안분 미영향 |
| ⑦ 결과 카드 | `HousingPayableTaxCalcCard.tsx:111-116` | "공시가격 × 지분율(%)" → "× (토지 시가표준액/전체 = N%)"로 분기 표시. ②ⓐ 부과 재산세 안분 산식도 |
| ⑧ validation | `comprehensive-api.ts` validate + `PropertyListInput` onChange | 분리 ON 시 토지·건물 시가표준액 > 0 필수(빈값 차단), 직전 자동모드 시 직전 시가표준액 전부-or-전무 |
| ⑨ Zod 메인 | `comprehensive-input.ts:142~` `comprehensivePropertySchema` | `appurtenantSplit` object optional + 직전은 previousYearAuto schema |
| ⑫ Zod 입력객체 | `:376~` `previousYearAuto` | `appurtenantSplit` object optional |
| ⑬ body spread | `comprehensive-api.ts:106~`·`:269~` | base 객체 + previousYearAuto에 `appurtenantSplit` 포함 |
| ⑭ route 매핑 | `route.ts:80~`(properties)·`:109~`(previousYearAuto) | pass-through(숫자·문자열 enum — Date 변환 불요) |

> ⑩⑪은 양도세 컴패니언 전용 — 종부세 N/A. 실작업 8지점(①②③④⑤⑦⑧⑨⑫⑬⑭ 중 종부세 해당분).

### 3-4. 결과뷰 산식 (⑦)

`HousingPayableTaxCalcCard.tsx:91-116`은 현재 `properties[0].ownershipRatio`로 "공시가격 × 지분율(N%) = 안분 공시가격" 표시. 분리 ON 시:
- ① 안분(`:111-116` Bullet 분기): "공시가격 15억 × (토지 시가표준액 8억 / 전체 10억 = 80%) = 안분 공시가격 12억"
- ②ⓐ 부과 재산세(`:158-182` ⓐ 영역에 행 추가): "100% 재산세 2,970,000 × (8억/10억) = 부과 2,376,000" (지분율 적용 행과 동형)
- form 시가표준액 값 직접 사용(기존 `:91` 주석 "result echo 역산 불가 → form 직접" 패턴 차용). ownershipRatio 행과 appurtenantSplit 행은 **상호배타 표시**(둘 다 적용 시 둘 다 행 표기, 동형 2줄).

### 3-5. 케이스 인벤토리

| # | 케이스 | 입력 | 기대 | 검증 |
|---|---|---|---|---|
| S6-1 | **사례6** 토지만 100% | 당해 `{ownedPart:"land",land:8억,building:2억}`·직전 `{land:7.8억,building:2.6억}`, ≠1세대1주택 | ⑤ 1,367,616 · ⓐ 2,376,000 · 나 3,756,000 | anchor PY-S6 |
| S6-2 | 건물만 소유 | `ownedPart:"building"` | 비율 = 건물/전체 | anchor |
| S6-3 | 분리 + 공유지분 동시 | `appurtenantSplit` + `ownershipRatio:0.5` | 3계수 합성 floor | anchor |
| S6-4 | 분리 미적용(회귀) | `appurtenantSplit` 미입력 | 사례1~5 불변 | 전체 vitest |
| S6-5 | 1세대1주택 + 부속토지 | `isOneHouseOwner` + 분리 | §8④1호 의제 교차 | **범위외**(후속 — §5) |

---

## 4. anchor + E2E

- **anchor PY-S6** (신규 `__tests__/tax-engine/comprehensive-prior-year-owner-split.test.ts` — multi.test.ts 혼잡 회피): S6-1 입력으로 ⑤ 1,367,616·ⓐ 2,376,000·②ⓓ 912,384·나① 2,047,500·나② 1,708,500·나 3,756,000·가 3,743,616·다 5,634,000·`taxCap.isApplied=false` 전수. **Phase 0**: 신규 `appurtenantSplit` 필드 미인식 → 안분 미적용 → 실패(갭 실증). **Phase 1**: 통과. + S6-2/S6-3/S6-4 회귀.
  - ★ anchor 주석: "PDF 나① 중간값 2,490,000은 오기 — 정정 2,730,000. 세부담상한 미적용이라 ⑤ 안분 정밀도 무관(numeric 0)." ([[feedback_pdf_example_test_anchoring]])
- **E2E C6-E1** (`e2e/comprehensive-case6.spec.ts`): 입력경로 = ≠1세대1주택(2022) + 주택 1채(공시 15억) + 건물·토지 분리 토글 ON + ownedPart=토지 + 시가표준액 당해(8억/2억)·직전(7.8억/2.6억) + Step5 직전자동 → ⑤ 1,367,616 + 신고서 서식 펼침 1,367,616. (사례5 C5-E1 입력경로 차용 — [[project_comprehensive_case5_prior_s84]])

---

## 5. §122 Min 세부담상한 한계 (numeric 0 — 후속 drift anchor)

PDF 셋째 원칙 "주택분 재산세는 **100% 지분 재산세(당해·직전)로 세부담상한 적용 후 안분**". 현행 엔진 `comprehensive-tax.ts:404-412`는 §122 Min을 **안분값 기준**으로 수행:
- 교재: Min(100% 당해 2,970,000, 100% 직전 2,730,000 × 130%=3,549,000) × 당해비율 0.8 = 2,376,000
- 엔진: Min(안분 당해 2,376,000, 안분 직전 2,047,500 × 130%=2,661,750) = 2,376,000

**사례6은 상한 미발동(2,970,000 < 3,549,000)이라 ⓐ = 2,376,000 동일 → numeric 영향 0.** 단, ① 건물·토지 분리 + ② 당해≠직전 비율 + ③ §122 binding(재산세 급등) + ④ ≤2023(2024+ §122 폐지) **4조건 동시**일 때만 엔진 cap(직전비율 적용)이 교재(당해비율)보다 엄격. 

→ **사례6 범위에서 차단/수정 불요**. 완전 충실화는 100% 직전 재산세(현재 `comprehensive-prior-year.ts` `propertyTaxEquivRaw` 미노출)를 expose 후 Step6 Min을 100%에서 수행→안분하는 후속 과제. 계획서에 **drift anchor**(4조건 binding 케이스 1건, 현행≠교재 명시)로 기록만([[feedback_engine_comment_vs_impl_drift]]).

> §122 cap **구간 판정 공시 기준**: `getHousingTaxCapPct(year, effectiveIncludedAssessedValue)`가 안분 공시(12억) 사용. 사례6은 안분 12억·100% 15억 모두 6억 초과 → 130%(PCT_3) 동일 → numeric 0 (V3 상수 실측).

---

## 6. Scope B (최소 대안 — 비권장)

`ownershipRatio` 재사용 + ④ api.ts:287 collapse만 해소(직전 비율 별도 입력) + 라벨에 "시가표준액 안분 포함" 힌트. 코드 최소이나 ① 사용자가 0.8/0.75 수동 계산 ② 공유지분과 의미 혼재 ③ 산식 충실재현 불가 → 사례2~5 패턴과 불일치. **권장: Scope A.**

---

## 7. 리스크

| # | 항목 | 처리 |
|---|---|---|
| R-1 | `applyEffectiveFactor` 3-way 확장이 사례1~5 회귀 유발 | num=den=1 기본값 → 곱셈 항등. 전체 vitest로 회귀 0 확인 |
| R-2 | 직전 시가표준액 별도 입력 누락 시 직전=당해 collapse 재발 | ④에서 직전 `appurtenantSplit` 독립 도출(api.ts:287 안티패턴 제거) + ⑧ 전부-or-전무 |
| R-3 | 시가표준액 안분 사전 라운딩 1원 오차 | 분수(num/den) 그대로 BigInt fold — 사전 비율 라운딩 금지 |
| R-4 | §8④1호 `appurtenant_land_only` 의제와 혼동 | 시가표준액 안분은 의제와 독립(사례6 ≠1세대1주택). 교차(S6-5)는 범위외 |
| R-5 | 800줄 정책 | `PropertyListInput.tsx`(현 ~240줄)·`HousingPayableTaxCalcCard.tsx`(545줄) — 추가 시 섹션 추출 검토 |

---

## 8. 결론 — 범위 확정 (Scope A — 사용자 결정 2026-06-15)

- **numeric 미구현 0** (probe 단정). 본 과제는 **충실 입력표현·UX**(사례4·5와 동류).
- **확정: Scope A**(시가표준액 안분 정식 입력). 엔진 변경 최소(3-way 계수)·14지점 동기화·anchor·E2E. (Scope B·보류 기각)
- §122 Min 한계는 numeric 0 → drift anchor 기록만, 후속(§5).
- **다음 단계**: 13단계 자가 검토 루프(plan→engine.design→ui.design) → Do(시퀀셜) → Check.
