# 종부세 사례 7·8·9 재산세 ⓐ 자동화 — UI 설계

> 계획서: [`comprehensive-case789-auto-property-tax.plan.md`](../../01-plan/features/comprehensive-case789-auto-property-tax.plan.md) · 엔진설계: [`comprehensive-case789-auto-property-tax.engine.design.md`](comprehensive-case789-auto-property-tax.engine.design.md)
> 작성일 2026-06-15 · 13단계 STEP 12 · 베이스라인 `origin/master`=`97e73c6c`(PR #210).
> 범위: 트랙 A(다가구 층별 면적) + 트랙 B(주택별 직전 공시 → 세부담상한). 8 클라이언트 + Zod/Route. `propertyTaxAmount` 수동입력은 **최우선 안전판** 유지.

---

## 1. 사용자 시나리오

**트랙 A (사례7 — 다가구)**
1. Step1: 2022 + ≠1세대1주택
2. Step2 주택 1채: 통합공시 8억 → **"다가구주택 층별 면적" 토글 ON** → 층 행 추가({1층 120㎡}, {2층 120㎡}, {지하 60㎡}) → 자동 표시 "구별 안분: 1층 3.2억(300,000) / 2층 3.2억(300,000) / 지하 1.6억(114,000) = 714,000"
3. 계산 → ⓐ 714,000(수동입력 없이) → ⑤ **560,595**

**트랙 B (사례8·9 — 세부담상한)**
1. Step1: 2022 + ≠1세대1주택 + (사례8) 조정 2주택 중과
2. Step2 서초: 공시 20억 + 감면율 30% + **직전 공시 15억** / 강남: 공시 10억 + 직전 8억 / (사례9) 안양: 공시 5억 + 직전 4억
3. Step5: 직전연도 자동모드 — **직전 공시는 Step2 주택별 입력에서 자동 합산**(별도 입력 비활성)
4. 계산 → ⓐ_서초 2,702,700·강남 1,677,000·(안양 462,000) → ⑤ **16,747,099**(사례8) / **25,546,712**(사례9)

---

## 2. 폼 상태 (①②③ — `lib/stores/comprehensive-wizard-store.ts` `PropertyForm`)

```ts
// ① 신규 필드 (PropertyForm — assessedValue 인근)
multiFamilyEnabled: boolean;                       // 다가구 층별 면적 토글
floorUnits: { label: string; area: string }[];     // 층별 {명칭, 면적㎡} — area는 string(DecimalInput)
priorAssessedValue: string;                        // 직전연도 공시가격(원, CurrencyInput) — 세부담상한용
```

- ② INITIAL: `false` / `[]` / `""`
- ③ normalize(merge): `?? false` / `?? []` / `?? ""` (sessionStorage 호환)
- ★ `floorUnits`는 **3-state**([[feedback_three_state_optional_mode_toggle]]): 토글 OFF → API에서 `undefined`, ON·행0 → `[]`(검증오류), ON·행N → 데이터. `multiFamilyEnabled`로 ON/OFF 구분(length>0 derive 금지).

---

## 3. UI 위젯 (⑤ — `components/calc/PropertyListInput.tsx`)

공시가격 + 지분율/감면율 그리드 **직후** 배치(UI 순서 = 안분·상한이 공시가격에 적용되는 로직 순서). 사례6 `appurtenantSplit`(amber) 카드와 **공존** — 별도 카드.

```
[ToggleCard tone="violet" "다가구주택 층별 면적"]            ← 트랙 A. OFF도 bg-violet-50/70
  ON 시 children (multiFamilyEnabled):
  ┌ 층별 면적 행 (동적 추가/삭제):
  │   [명칭 text "1층"] [면적 DecimalInput "120" ㎡]  [✕ 삭제]
  │   [명칭 text "2층"] [면적 DecimalInput "120" ㎡]  [✕ 삭제]
  │   [명칭 text "지하"] [면적 DecimalInput "60"  ㎡]  [✕ 삭제]
  │   [+ 층 추가]
  └ [자동표시] "구별 안분 공시: 1층 3.2억 · 2층 3.2억 · 지하 1.6억"   (세액 300,000 등은 결과 카드 ⑦ — rates 서버)
                ↑ Σarea>0 시만 순수 산술(통합 × area/Σarea). useMemo derive — store 미러링 금지

[ToggleCard tone="sky" "직전연도 공시가격 (주택 세부담상한)"]   ← 트랙 B. OFF도 bg-sky-50/70
  ON 시 children:
  ┌ 직전연도 공시가격  [CurrencyInput "1,500,000,000" 원]   (priorAssessedValue)
  │     hint: "전년도 주택공시가격 — 105/110/130% 세부담상한 자동 산정용"
  └ (라이브 산식 표시 없음 — 세부담상한 105/110/130%는 calcHousingTax(rates) 필요 → 결과 카드 ⑦에서 산정·표시)

[안내 배지] propertyTaxAmount(부과세액 직접입력) 입력 시: "직접입력이 우선 적용됩니다 — 층별 면적·직전 공시는 무시됨"
```

- 면적 = **`DecimalInput`** + `parseDecimal`(㎡ 소수 — `CurrencyInput` 금지, [[feedback_decimal_input]]).
- 명칭 = 짧은 text input(`onFocus select` — 공유 컴포넌트 내장).
- 직전 공시 = `CurrencyInput`(원·정수) + `parseAmount`.
- 토글 tone 정적 매핑(`bg-violet-50`/`bg-sky-50` Record — dynamic class 금지, [[feedback_tailwind_static_tone_mapping]]).
- ⑤ 라이브 표시는 **rates 불요 순수 산술만**(다가구 구별 공시 안분). 누진세액·세부담상한(rates 필요)은 결과 카드 ⑦(엔진 echo)에서 — UI 누진표 재구현 금지([[feedback_ui_engine_dual_truth_avoidance]]).
- ★ Step5(직전연도 자동모드) 직전 공시(`priorHouseValues`, **주택별 배열** number[]) 입력 컴포넌트는 `priorAssessedValue` 입력 시 **비활성 + "주택별 입력에서 자동" 안내**(dual-truth 방지, §7). ※ Step5 입력 컴포넌트 위치는 Do 착수 시 식별(확인 필요).
- 층 명칭 빈값 → "구분1·구분2…" 자동 번호(echo 중복 방지).

---

## 4. API 변환 (④⑬ — `lib/calc/comprehensive-api.ts`)

```ts
// 당해 (properties.map, base 객체)
floorUnits:
  p.multiFamilyEnabled && p.floorUnits.some((u) => parseDecimal(u.area) > 0)
    ? p.floorUnits
        .filter((u) => parseDecimal(u.area) > 0)
        .map((u) => ({ label: u.label.trim() || "구분", area: parseDecimal(u.area) }))
    : undefined,                                   // 3-state: OFF/빈 → undefined(기존 단일 경로)
priorAssessedValue:
  parseAmount(p.priorAssessedValue) > 0 ? parseAmount(p.priorAssessedValue) : undefined,

// 직전 총세액상당액(④) — priorAssessedValue 단일 진실에서 합산 도출(previousYearAuto.priorHouseValues 중복 금지)
//   capMode==="auto" && 주택별 priorAssessedValue 입력 시 → priorHouseValues = properties.map(priorAssessedValue)
```

★ `floorUnits` 면적은 `parseDecimal`(소수), `priorAssessedValue`는 `parseAmount`(원·정수). 빈/0 → `undefined`(엔진 우선순위 분기 ③④로 fallback).

---

## 5. Zod (⑨⑫) + Route (⑭)

```ts
// ⑨ comprehensivePropertySchema (comprehensive-input.ts) + ⑫ 입력객체
floorUnits: z.array(z.object({
  label: z.string(),
  area: z.number().positive(),          // ㎡ 소수 허용(.positive)
})).min(1).optional(),
priorAssessedValue: z.number().int().nonnegative().optional(),
```

- **★ dual-truth refine**(⑫): `priorAssessedValue`(주택별)와 `previousYearAuto.priorHouseValues`(인별 합산) **공존 금지** — `.superRefine`로 한쪽만 허용.
- **★ 우선순위 refine**: `propertyTaxAmount` 입력 시 `floorUnits`·`priorAssessedValue`는 경고 없이 무시(엔진 분기 ①). validate는 차단 안 함(안전판).
- ⑬ body spread(api.ts): base 객체에 `floorUnits`·`priorAssessedValue` 포함.
- ⑭ route(`route.ts`): pass-through(`floorUnits: p.floorUnits` / `priorAssessedValue: p.priorAssessedValue`) — 숫자·배열, **Date 변환 불요**. ★ 명시 매핑이면 신규 필드 strip 위험 → spread 우선 + grep([[feedback_explicit_prop_mapping_strip]]).

---

## 6. 결과뷰 산식 (⑦ — `HousingPayableTaxCalcCard.tsx`)

★ 본 자동화는 result echo(`properties[].multiFamilyBreakdown`·`housingTaxCapDetail`)를 **신설**하므로, 카드는 form-direct-read(사례6 패턴) 대신 **result echo를 단일 출처로 read**(dual-truth 방지). `propertyTaxAmount` 직접입력 시 echo undefined → 기존 "부과세액 직접입력" bullet 유지.

- **트랙 A 펼침**(`multiFamilyBreakdown`): "다가구 구별 안분 — 1층 320,000,000(300,000) · 2층 320,000,000(300,000) · 지하 160,000,000(114,000) → 합계 714,000". ▼펼치기/▲접기(`ExpandToggleButton`, [[feedback_result_expand_toggle_standard]]).
- **트랙 B 펼침**(`housingTaxCapDetail`): 한국어 산식 풀어쓰기(약어·floor 금지, [[feedback_result_view_korean_formula]]):
  - "당해 표준세율 재산세: 4,170,000"
  - "직전 표준세율 재산세: 2,970,000 → 세부담상한 130% = 3,861,000" (capPct=130)
  - "세부담상한 적용: min(4,170,000, 3,861,000) = 3,861,000"
  - "감면(30%)·지분 적용 후 부과세액 ⓐ: 2,702,700"
  - capPct=null(2024+) 시: "세부담상한 미적용(2024년 폐지·과세표준상한제)" 라인만.
- "원" 접미사 생략([[feedback_no_won_suffix]]) · 내부 id 노출 금지([[feedback_no_internal_id_in_result]]).

---

## 7. Validation (⑧ — `comprehensive-api.ts` validate + `PropertyListInput` onChange)

- **트랙 A**: `multiFamilyEnabled` ON 시 면적 행 ≥1 & 각 area>0 & Σarea>0(빈값/0 차단 — 자동 안분 fallback 금지 [[feedback_no_silent_apportion_fallback]]). 명칭 빈값은 "구분"으로 허용.
- **트랙 B**: `priorAssessedValue` ON 시 >0 필수.
- **★ dual-truth**: `priorAssessedValue`(주택별) 입력 시 Step5 `priorHouseValues` 수동입력 **비활성**(UI) + Zod refine 공존 차단. 한쪽만.
- **우선순위**: `propertyTaxAmount` 입력 시 트랙 A·B 입력 있어도 **차단 안 함**(무시·안내만) — UI 통과 ↔ validate 차단 모순 금지([[feedback_validation_sync_8th_point]]).
- API가 `>0` 시만 전송 → validate도 동일 게이트(3중 패턴 [[mirror-pattern]]).

---

## 8. E2E

| spec | 시나리오 |
|---|---|
| `e2e/comprehensive-case7-multifamily.spec.ts` | Step1 2022·非1주택 → Step2 공시 8억 → "다가구 층별 면적" 토글 ON → 3행(120/120/60) 입력 → 안분 "714,000" 표시 → 계산 → ⑤ **560,595** (수동입력 없이) · console error 0 |
| `e2e/comprehensive-case89-taxcap.spec.ts` | Step2 서초(공시20억·감면30%·직전15억)+강남(10억·직전8억) → 계산 → ⑤ **16,747,099** · 산식 펼침 "2,702,700" |

### ★ E2E switch/selector 시프트 회귀 (필수)
다가구·세부담상한 ToggleCard가 property card에 **신규 switch 2개** 추가 → `getByRole("switch").nth(N)`/`.first()` 인덱스 시프트. 사례6 교훈([[project_comprehensive_case6_owner_split]]): **`.last()`/role+name 한정**으로 전환. 신규 토글 추가 → **전체 종부세 E2E 회귀 점검 필수**([[feedback_blocking_validation_full_e2e_regression]]·[[feedback_e2e_preexisting_failures]]). 기존 `comprehensive-case789.spec.ts`(수동입력)는 유지(하위호환).

---

## 9. 14 동기화 지점 체크리스트

| # | 지점 | 위치 | 작업 |
|---|---|---|---|
| ① 폼 상태 | store `PropertyForm` | `multiFamilyEnabled`·`floorUnits[]`·`priorAssessedValue` |
| ② initial | store INITIAL | `false`/`[]`/`""` |
| ③ normalize | store merge | `?? ` fallback |
| ④ API 변환 | comprehensive-api.ts | floorUnits(parseDecimal)·priorAssessedValue(parseAmount)·priorHouseValues 합산 도출 |
| ⑤ UI 위젯 | PropertyListInput.tsx | violet 다가구 토글+DecimalInput 행 / sky 직전공시 토글 / 우선순위 안내 |
| ⑥ 사이드바 | store | **N/A 확정** — comprehensive store `compute*Summary` 부재(사례6 실측). ⓐ는 결과 카드만 |
| ⑦ 결과 카드 | HousingPayableTaxCalcCard.tsx | result echo read(multiFamilyBreakdown·housingTaxCapDetail) 펼침 2종 |
| ⑧ validation | api.ts validate + onChange | area>0·Σ>0 / priorAssessedValue>0 / dual-truth·우선순위 refine |
| ⑨ Zod 메인 | comprehensive-input.ts | property `floorUnits`·`priorAssessedValue` |
| ⑫ Zod 입력객체 | 〃 | + dual-truth/우선순위 superRefine |
| ⑬ body spread | comprehensive-api.ts | base 객체 spread |
| ⑭ route 매핑 | route.ts | pass-through(Date 불요) · spread 우선·grep |
| ⑩⑪ | — | **N/A** — 양도세 컴패니언 전용(종부세 무관) |

자가 점검: tsc 0 · 전체 vitest 회귀 0 · anchor AUTO-A1·A2·B1·B2·B3·C1·C2·R · E2E 사례7·8 + 기존 종부세 E2E 회귀 0(`.last()` 전환) · 브라우저(Playwright) Network 탭 신규 필드 확인.
