# 재산세 주택 과세표준상한제 (§110③) 구현 계획서

> 작성일: 2026-06-16 · 세목: 재산세(property) · 후속 갭 #1
> 근거: 지방세법 §110③ + 시행령 §109의2 (모두 KoreanLaw MCP 본문 검증 완료)

## 1. 배경 — 무엇이 미구현인가

재산세 R1 리뷰(PR #115)에서 **주택 세부담상한 §122 단서 배제**는 수정됐으나, 그 폐지된 세부담상한을 **대체하는 과세표준상한제는 미구현** 상태로 후속 작업으로 남겨졌다.

현행 코드 실측:
- `lib/tax-engine/property-tax.ts:294` — 주석에만 *"주택 세부담상한 폐지, 과세표준상한제 §110의2로 대체"* 라고 기재. **실제 과세표준상한 계산 로직 없음.**
- `property-tax.ts` 내 `과세표준상한|taxBaseCap` → 주석 1건 외 0건.
- 즉 현재는 주택 과세표준이 `공시가격 × 공정시장가액비율`로 **상한 없이** 그대로 세율에 들어간다.

> ⚠️ **기존 `HOUSING_TAX_CAP_*` 상수와 혼동 금지**(실측): `legal-codes/property.ts:184-190`에 `HOUSING_TAX_CAP_BRACKET_1/2`(3억·6억)·`HOUSING_TAX_CAP_PCT_1/2/3`(105/110/130%)·`HOUSING_TAX_CAP_ABOLISHED_YEAR`(2024)가 존재하나, 이는 **폐지된 §122 주택 세부담상한(세액 상한)**으로 `comprehensive-prior-year.ts:185-192`에서 종부세 직전연도 재산세상당액 계산에 **사용 중**(dead code 아님). 신규 §110③ 과세표준상한(과세표준 상한)과는 **전혀 다른 제도** → 이 상수들을 **재사용·수정하지 말 것**. 신규 상수는 별도 명명(`TAX_BASE_CAP_*`).

> ⚠️ **조문 번호 정정**: 코드 주석의 "§110의2"는 부정확. 정확한 근거는 **지방세법 §110③(본칙) + 시행령 §109의2(위임)**. (시행령에는 §109의2 "과세표준상한액"이 존재하나, 본법에는 §110의2가 없고 §110③에 계산식이 있음.) 구현 시 `legalBasis`는 **`지방세법 §110③`** 으로 표기한다.

## 2. 법령 근거 (검증 완료)

### 지방세법 §110③ (MST 282559, 시행 2026-04-24)
> 제1항에 따라 산정한 **주택**의 과세표준이 다음 계산식에 따른 **과세표준상한액보다 큰 경우**에는 제1항에도 불구하고 해당 주택의 과세표준은 **과세표준상한액**으로 한다.
>
> **과세표준상한액 = 직전 연도 해당 주택의 과세표준 상당액 + (과세기준일 당시 시가표준액으로 산정한 과세표준 × 과세표준상한율)**
> **과세표준상한율 = 0 ~ 100분의 5 범위 내 대통령령으로 정하는 비율**

### 지방세법 시행령 §109의2 (MST 286395, 시행 2026-06-01)
- **①「직전 연도 해당 주택의 과세표준 상당액」** = 직전 연도 시가표준액(직전 연도 시가표준액이 없으면 해당 연도 시가표준액) × **과세기준일 현재** 해당 주택의 §109①2호 공정시장가액비율
- **②「대통령령으로 정하는 비율」(과세표준상한율) = 100분의 5**

### 시행령 §109①2호 (공정시장가액비율 — 과세표준상한액에 쓰는 비율)
- 주택: 시가표준액의 100분의 60
- 단, 2026년 납세의무 성립 1세대1주택: 3억 이하 43% / 6억 이하 44% / 6억 초과 45%

→ **과세표준상한제는 모든 주택에 적용**되며, 직전·당해 두 항 모두 **그 주택에 적용되는 동일 공정시장가액비율**(일반 60% 또는 1세대1주택 43~45%)을 사용한다. (이미 `calcTaxBase`가 반환하는 `fairMarketRatio`와 동일)

## 3. 계산식 정리 (정수 연산)

```
// 입력: taxBase (= calcTaxBase 산정 당해연도 과세표준), ratio (= fairMarketRatio), priorYearPublishedPrice?
currentTaxBase = taxBase                                      // 재계산 아님 — 전달받은 값 그대로
priorBaseEquiv = priorYearPublishedPrice != null             // 직전연도 과세표준 상당액
                   ? applyRate(priorYearPublishedPrice, ratio)
                   : taxBase                                  // 직전 미입력 → 당해값 동치 (시행령 §109의2① 단서)
capIncrement   = applyRate(currentTaxBase, 0.05)             // 당해 과세표준 × 과세표준상한율(5%)
taxBaseCap     = priorBaseEquiv + capIncrement                // 과세표준상한액
finalTaxBase   = min(currentTaxBase, taxBaseCap)             // §110③ 적용
```

- `applyRate(x, r) = Math.floor(x * r)` (`tax-utils.ts`) — 세율×금액은 항상 floor. **`Math.round()` 금지.**
- **직전연도 시가표준액 미입력 시**: `priorBaseEquiv = taxBase` → `taxBaseCap = taxBase + (taxBase × 5%) > taxBase` → **상한 미작동** (신축·직전 자료 부재 시 정상 동작. 시행령 §109의2① 단서 *"직전 연도의 시가표준액이 없는 경우에는 해당 연도의 시가표준액"* 정합). **함수는 `publishedPrice`를 받지 않아도 됨** — 폴백이 `taxBase` 동치이므로.
- **적용 대상**: `objectType === "housing"` 만. 토지·건축물·선박·항공기는 §110③ 무관(이들은 §122 세부담상한 유지).

### Anchor 예시 (직전 5억 → 당해 7억, 일반주택 60%)
| 항목 | 값 |
|---|---|
| 당해 과세표준 (`currentTaxBase`) | 700,000,000 × 60% = **420,000,000** |
| 직전 과세표준 상당액 (`priorBaseEquiv`) | 500,000,000 × 60% = 300,000,000 |
| 상한 증가분 (`capIncrement`) | 420,000,000 × 5% = 21,000,000 |
| 과세표준상한액 (`taxBaseCap`) | **321,000,000** |
| **최종 과세표준** | min(420,000,000, 321,000,000) = **321,000,000** |

→ 과세표준이 4.2억 → 3.21억으로 제한되어, 이후 누진세율(`calcHousingTax`)에 3.21억이 투입된다.

## 4. 파이프라인 통합 위치

현행 `calculatePropertyTax`(property-tax.ts:459):
```
Step 1 (line 471): calcTaxBase()       → taxBase
Step 2 (line 478): switch(objectType)  → calcHousingTax(taxBase, ...)
```

신규 **Step 1.5** 를 Step 1과 Step 2 사이, **housing 분기 한정**으로 삽입:
```
const { taxBase, fairMarketRatio } = calcTaxBase(...);
let effectiveTaxBase = taxBase;
let taxBaseCapDetail;
if (input.objectType === "housing") {
  const cap = applyHousingTaxBaseCap(taxBase, fairMarketRatio, input.priorYearPublishedPrice);
  effectiveTaxBase = cap.cappedTaxBase;
  taxBaseCapDetail = cap;  // 결과 노출용
}
// 이후 calcHousingTax(effectiveTaxBase, ...) 사용
```
- 신규 순수 함수 `applyHousingTaxBaseCap()` 을 property-tax.ts 내 `calcTaxBase` 직후에 배치.
- **주의 1**: housing 분기의 `calcHousingTax` **1번째 인자(과세표준)**, 종부세 연동 export(`taxBase`), 결과 객체의 `taxBase` 필드 모두 **상한 적용 후 값(`effectiveTaxBase`)** 으로 일관 반영. (메모리 `feedback_engine_result_display_drift` — 산식 반영해도 표시필드 미반영 시 카드 0 함정)
- **주의 2 (실측)**: `calcHousingTax(taxBase, publishedPrice, isOneHousehold)`의 **2번째 인자 `publishedPrice`는 9억 이하 1세대1주택 특례 세율 판정용**(property-tax.ts:219-221). 여기에는 **상한 미적용 원본 `publishedPrice`** 를 그대로 전달 — 과세표준만 capped, 특례 판정 기준은 원본 공시가격. (capped 값을 잘못 넘기면 특례 판정 오작동)
- 토지(`land`)·건축물(`building`) 분기는 무변경.

## 5. 동기화 지점 (재산세 8지점 + Zod/Route)

> 재산세 UI는 `lib/calc/*` 가 아닌 **`components/calc/property/shared.ts`** 에 FormState·initial·validate·API변환이 모두 모여 있음 (실측 확인).

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| 엔진-T | Input/Result 타입 | `lib/tax-engine/types/property.types.ts` | `PropertyTaxInput.priorYearPublishedPrice?: number` 추가 / `PropertyTaxResult`에 `taxBaseBeforeCap?`·`taxBaseCapApplied?`·`taxBaseCapLimit?`·`priorYearTaxBaseEquivalent?`·`taxBaseCapRate?` 추가 |
| 엔진-C | 법령 상수 | `lib/tax-engine/legal-codes/property.ts` | `PROPERTY.TAX_BASE_CAP = "지방세법 §110③"` / `PROPERTY_CONST.TAX_BASE_CAP_RATE = 0.05` |
| 엔진-F | 계산 함수 | `lib/tax-engine/property-tax.ts` | `applyHousingTaxBaseCap()` 신설 + Step 1.5 통합 |
| ① | FormState | `components/calc/property/shared.ts:51` | `priorYearPublishedPrice: string` |
| ② | INITIAL_FORM | 동상 `:73` | `priorYearPublishedPrice: ""` |
| ③ | normalize | (property는 component-local state — sessionStorage normalize 미사용. **해당 없음** / 신규 store 키 추가 시에만 검토) |
| ④ | API 변환 | 동상 `buildPropertyTaxRequestBody:136` | `objectType === "housing"` + 값 존재 시 `body.priorYearPublishedPrice = parseAmount(...)` |
| ⑤ | UI 위젯 | `components/calc/property/Step0.tsx` (주택 분기) | `publishedPrice` 직하 주택 한정 `CurrencyInput` — "직전연도 공시가격(과세표준상한 계산용)". 미입력 시 상한 미적용 hint |
| ⑥ | 사이드바 합계 | **해당 없음**(실측) — 재산세 마법사에 `compute*Summary` 사이드바 없음 |
| ⑦ | 결과 카드 | `components/calc/results/PropertyTaxResultView.tsx`(실측 존재) | `taxBaseCapApplied` 시 "과세표준상한 적용" 산식 카드 (당해 과세표준 → 상한액 → min). 변수 약어·floor 금지, 한국어 풀어쓰기 |
| ⑧ | Validation | 동상 `validateStep:99` | optional. 입력 시 숫자·≥0 검증만 (미입력=상한 미적용이므로 차단 금지 — UI통과↔validate 모순 방지) |
| ⑫ | Zod | `lib/validators/property-input.ts:19` | `priorYearPublishedPrice: z.number().nonnegative().optional()` + refine: housing 외 거부(`isOneHousehold` refine 패턴 차용 — `property-input.ts:126`) |
| ⑭ | Route 매핑 | **자동 충족**(실측) — `route.ts:88`이 `parsed.data as PropertyTaxInput` **직접 캐스트**. ⑫ Zod 스키마에 필드만 추가되면 별도 매핑 불필요 (Date 변환 무관 — 숫자 필드) |

## 6. 작업 순서 (PDCA Do — 시퀀셜)

1. **엔진 시니어** (`property-tax-senior`): 엔진-T·C·F 선처리 → `applyHousingTaxBaseCap` 구현 + 파이프라인 통합 + anchor 테스트.
2. **Pre-Do anchor** (정책 `pre-do-anchor-verification`): §4 anchor 예시(4.2억→3.21억) 1건을 **Do 진입 직후 우선 작성·실행**해 실패 확보 → 디자인 환류. "현행 일치 예상" 가정 금지.
3. **UI 시니어** (`property-tax-ui-senior`): ①②④⑤⑦⑧⑫⑭ 동기화.
4. **Check**: `ui-engine-sync-checker`(8지점) + `bkit:gap-detector`(matchRate).

## 7. 테스트 계획

`__tests__/tax-engine/property/` (또는 기존 `property-tax.test.ts`)에 추가:
- **T-1 상한 작동**: 직전 5억/당해 7억/일반 60% → 최종 과세표준 321,000,000 (원단위 `toBe`).
- **T-2 1세대1주택 2026**: `isOneHousehold=true`, `taxYear=2026`, 직전 5억/당해 7억 → 비율 45%(6억 초과 구간) 양쪽 항 적용. 당해 과세표준 = 700,000,000×45% = 315,000,000 / 직전 상당액 = 500,000,000×45% = 225,000,000 / 증가분 = 315,000,000×5% = 15,750,000 / 상한액 = 240,750,000 / **최종 과세표준 = 240,750,000**.
- **T-3 직전 미입력**: `priorYearPublishedPrice` undefined → 상한 미작동, 과세표준 = 당해값 그대로.
- **T-4 상한 미도달**: 당해 ≤ 직전×1.05 → cap 미적용 (`taxBaseCapApplied === false`).
- **T-5 비주택 무영향**: building/land 입력 시 신규 필드 무시·기존 결과 불변(회귀).
- **T-6 종부세 연동**: 상한 적용 후 `taxBase`가 종부세 재산세 비율 안분 입력으로 전달되는지 (export 일관성).

## 8. 리스크·미확정 (확인 필요)

- **과세표준상한율 연도 게이트**: 시행령 §109의2②는 현행 5% 고정값. 1세대1주택 공정시장가액비율(`ONE_HOUSE_FMR_YEAR=2026`)처럼 연도 분기가 필요한지는 부칙 확인 필요. → 우선 `TAX_BASE_CAP_RATE = 0.05` 상수화, 개정 시 갱신(메모리 `property-tax-review-r1`의 2027 갱신 주의와 동일 패턴).
- **사이드바(⑥) 존재 여부**: 재산세 마법사에 과세표준 추정 사이드바가 있는지 미확인 — Do 착수 시 grep으로 확정.
- **결과 뷰 파일명**: `PropertyTaxResultView` 정확 경로·산식 카드 구조 미확인 — UI 시니어가 Do 시 실측.
- **브라우저 수동 확인**: 주택 입력 → 직전연도 공시가격 입력 → Network 탭 request body에 `priorYearPublishedPrice` 도달 + 결과 카드 상한 적용 표시 확인 (Playwright E2E 또는 명시적 미수행 보고).
