# 재산세 분리과세(공장용지·목장용지) 면적 한도 초과분 — 종합합산 이관분 세액 — 엔진·판정 측 계획

> 상태: **Plan v1 (2026-11-25) · 코드 변경 0(계획서만)** · 사용자 결정 대기: Q-1~Q-6(§7, 추천안 첫째).
> base: `master` 46976ad8e(#3663 — 분리과세 과세표준 인용 §113①3호 정정 머지 직후) · 짝 문서: `property-separated-excess-transfer.ui.plan.md`(UI 시니어 — 이 문서는 건드리지 않는다. **필드·함수·testid 이름은 이 문서가 정본**: §4.9).
> 선례: `property-separate-demolished-requirements.engine.plan.md` v3 **§13**(PSA-E4 — 별도합산 선택 필지의 종합합산 이관분). 이 문서는 같은 leaf를 재사용한다.
> **번호 규칙**: `Q-n`(사용자 결정) · `V-n`(미검증) · `K-n`(케이스) · `M-n`(뮤테이션). 합칠 때 `PSE-Q-n`·`PSE-V-n`(PSE = Property Separated Excess).
> **검증 표기**: 「확인」= 이 세션에서 KoreanLaw MCP 본문·파일을 직접 읽음 / 「실측」= 현행 엔진(master 46976ad8e)을 throwaway probe로 돌린 수치 / 「오라클」= **기존 leaf 함수(`calculateLandClassTax`·`calcSurtax`·`applyBurdenCap`)를 분리과세분 + 이관분에 합성 호출한 값** — 아직 구현되지 않은 경로의 기대값이라 구현 PR의 anchor가 첫 검증 / 「확인 필요」= 읽지 못함.
> 약칭: 법 = 「지방세법」, 영 = 「지방세법 시행령」, 칙 = 「지방세법 시행규칙」, 종부세법 = 「종합부동산세법」. 금액은 원.

---

## 0. 한눈에

### 0.1 결론 요약

| 항목 | 내용 |
|---|---|
| 문제 | 분리과세 공장용지·목장용지는 면적 한도(공장입지기준면적·가축별 기준면적)를 넘는 부분을 **종합합산으로 이관**하는데, 현행 엔진은 이관분의 시가표준액(`excessAssessedValue`)을 구해 **경고로 안내만 하고 세액은 인정분에만** 매긴다(§2). 실측: 공장 15,000㎡ 중 3,000㎡ 초과 → 본세 1,680,000(이관분 세액 0) — 이관분을 반영하면 2,480,000(+800,000)(§3). **조용히 과소 과세**다. |
| 법적 구조(확인 §1) | 법 §106①1호: 종합합산 = «별도합산과세대상 또는 분리과세대상이 되는 토지를 제외한 토지». 영 §102①1호·③: 분리과세는 «공장입지기준면적 범위의 토지»·«…계산한 토지면적의 범위에서 소유하는 토지»로 한정. 따라서 한도 밖은 분리과세가 아니고, 별도합산이 아니면 종합합산이다. **별도합산 여부는 영 §101①2호 문언상 열려 있다(§1.4 · Q-1 · V-1)** — 추천안은 종합합산(혜택 불성립 + 확인 필요 고지). |
| 설계 | **PSA-E4 leaf 재사용 + 얇은 확장.** 분리과세분(단일세율·합산 없음 — 기존 `calculateSeparateTax` 그대로) + 종합합산 이관분(같은 관할구역 합산 → 이 필지 몫 — 기존 `calculateLandClassTax`의 종합합산 클래스 그대로) = **2-way**. 세부담상한은 이 필지 합계에, 부가세는 합계 본세·이 필지 자기 과표 기준(PSA-E4 Q-15·Q-18과 동일). 3-way(별도합산 포함)는 Q-1 (나)를 고를 때만 필요하며 leaf가 이미 두 분류를 받으므로 입력·판정 추가만 든다. |
| 입력·술어 | 와이어 신규 필드 **없음** — PSA-E4의 `otherComprehensiveValue` 재사용. 요구 술어 `propertyLandSplitRequired(For)` 하나를 확장: `landTaxType === "separated"` + 면적 한도 판정의 `excessArea > 0`이면 `otherComprehensive` 요구(⑧·⑫·엔진 동일), 초과 0이면 요구 안 함·엔진 읽지 않음. |
| 호환 | 초과 0(대다수 입력)은 **결과 바이트 불변**(회귀 0 anchor). 초과 > 0인데 `otherComprehensiveValue` 미입력인 API 호출은 ⑫ **400**(PSA-E4 선례 — 자동 0 금지). 엔진 직접 호출은 «단독 계산 + 고지». |

### 0.2 이 문서가 건드리지 않는 것

- 면적 한도 **판정**(`judgeFactoryAreaLimit`·`judgePastureAreaLimit`·별표6 산식·§102⑨1호 도시지역 목장) — 그대로. 이관 면적·가액을 **소비**만 한다.
- 별도합산 선택 경로(PSA-E4)·철거 요건 사슬 — 그대로.
- 분리과세 세율(0.07%·0.2%·4%)·`calculateSeparateTaxationTax`의 70%·절사 규칙 — 그대로(인정분 과표·세액이 종전과 같다).
- 종부세 엔진 — 입력·결과 불변(§4.8: **고지 문구만**).
- 다필지·여러 소유자 합산 엔진(`calculateComprehensiveAggregate` — 사용자 계산에 도달하지 않음) — 건드리지 않는다.
- 재제안 금지 준수: 인별 전국 합산(전국은 종부세 — §113①은 관할구역 합산) · 자동 0 기본값 · 자동 안분 fallback.

---

## 1. 법령 확인 (KoreanLaw MCP 본문 · 2026-11-25 조회 — 확인)

조회 MST: 영 290815(시행 2026.10.1.) · 법 282559(시행 2026.1.1. 본문·2026.7.1. 시행예정본 존재) · 칙 287031(시행 2026.7.1.) · 종부세법 280417(시행 2026.1.1.).

### 1.1 초과분이 종합합산으로 가는 근거 (verbatim)

| 조문 | 본문 |
|---|---|
| **법 §106①1호** | «종합합산과세대상: 과세기준일 현재 납세의무자가 소유하고 있는 토지 중 별도합산과세대상 또는 분리과세대상이 되는 토지를 제외한 토지» |
| **법 §106①3호 가목** | «분리과세대상: … 공장용지ㆍ전ㆍ답ㆍ과수원 및 목장용지로서 대통령령으로 정하는 토지» |
| **영 §102①1호** (공장용지) | «제101조제1항제1호 각 목에서 정하는 지역에 있는 공장용 건축물(제103조제1항제2호 및 제3호의 건축물을 포함한다)의 부속토지로서 행정안전부령으로 정하는 **공장입지기준면적 범위의 토지**. 다만, … 허가 등을 받지 않은 공장용 건축물이나 … 사용승인(임시사용승인을 포함한다)을 받지 않고 사용 중인 공장용 건축물의 부속토지는 제외한다.» |
| **영 §102①3호** (목장용지) | «개인이나 법인이 축산용으로 사용하는 도시지역 안의 개발제한구역ㆍ녹지지역과 도시지역 밖의 목장용지로서 과세기준일이 속하는 해의 직전 연도를 기준으로 다음 표에서 정하는 축산용 토지 및 건축물의 기준을 적용하여 계산한 **토지면적의 범위에서 소유하는 토지**» (표의 가축마릿수 = «연중 최고 마릿수») |
| **칙 §50** | «영 제102조제1항제1호에서 "행정안전부령으로 정하는 공장입지기준면적"이란 별표 6에 따른 공장입지기준면적을 말한다.» (별표6 본문은 이 계획 범위 밖 — 산식은 이미 구현·anchor됨) |
| **영 §101①1호 각 목** | 읍ㆍ면지역 · 「산업입지 및 개발에 관한 법률」에 따른 산업단지 · 「국토의 계획 및 이용에 관한 법률」에 따른 공업지역 — «**제외**»되는 지역(§101①1호 본문은 그 밖 시지역 공장용 건축물을 별도합산으로 정함). 영 §102①1호가 이 «각 목» 지역을 분리과세로 가져온다. |

→ **귀결**: 한도 밖 부분은 분리과세 요건(영 §102①1호·③)에서 빠진다. 그 부분이 별도합산과세대상이 아니면 법 §106①1호에 따라 종합합산이다. **별도합산 해당 여부는 §1.4.**

### 1.2 세율·합산 단위 (verbatim)

| 조문 | 본문 |
|---|---|
| **법 §113①3호** | «분리과세대상: 분리과세대상이 되는 해당 토지의 가액을 과세표준으로 하여 제111조제1항제1호다목의 세율을 적용한다.» (**합산 없음**) |
| **법 §113①1호** | «종합합산과세대상: 납세의무자가 소유하고 있는 해당 지방자치단체 관할구역에 있는 종합합산과세대상이 되는 토지의 가액을 모두 합한 금액을 과세표준으로 하여 제111조제1항제1호가목의 세율을 적용한다.» (**인별 전국이 아니라 납세의무자 × 해당 지방자치단체 관할구역** — 전국 합산은 종부세) |
| **법 §111①1호 가목** | 종합합산: 5,000만원 이하 1,000분의 2 · 5,000만원 초과 1억원 이하 10만원+5,000만원 초과금액의 1,000분의 3 · 1억원 초과 25만원+1억원 초과금액의 1,000분의 5 |
| **법 §111①1호 다목** | 분리과세: 1) 가목에 해당하는 전ㆍ답ㆍ과수원ㆍ목장용지 및 나목 임야: 1천분의 0.7 · 2) 골프장·고급오락장: 1천분의 40 · 3) 그 밖의 토지: 1천분의 2 → **공장용지는 다목3) 0.2%, 목장용지는 다목1) 0.07%.** |

### 1.3 세부담상한·종부세 (verbatim)

| 조문 | 본문 |
|---|---|
| **법 §122** | «해당 재산에 대한 재산세의 산출세액(…)이 대통령령으로 정하는 방법에 따라 계산한 직전 연도의 해당 재산에 대한 재산세액 상당액의 100분의 150을 초과하는 경우에는 100분의 150에 해당하는 금액을 해당 연도에 징수할 세액으로 한다. 다만, 주택의 경우에는 적용하지 아니한다.» |
| **영 §118①1호 가목 단서** | «해당 연도의 과세대상별 토지에 대한 납세의무자 및 토지현황이 직전 연도와 일치하는 경우에는 직전 연도에 해당 토지에 과세된 세액으로 한다.» |
| **영 §118①1호 다목** | «… 해당 연도 과세대상 토지에 대하여 법 제106조제1항에 따른 과세대상 구분의 변경이 있는 경우에는 해당 연도의 과세대상의 구분이 직전 연도 과세대상 토지에 적용되는 것으로 보아 해당 연도 과세대상 토지별로 직전 연도의 법령과 과세표준(…) 등을 적용하여 산출한 세액» |
| **종부세법 §11** | «토지에 대한 종합부동산세는 … 「지방세법」 제106조제1항제1호에 따른 종합합산과세대상 … 과 같은 법 제106조제1항제2호에 따른 별도합산과세대상 … 으로 구분하여 과세한다.» → **재산세 종합합산으로 이관된 토지는 종부세 종합합산 대상일 수 있다**(분리과세분만 종부세 제외). |

### 1.4 판단이 갈리는 지점 (해석 — 법문 그대로, 결론 단정 아님)

**(a) 초과분이 별도합산일 수 있는가 (V-1 · Q-1).** 영 §101①2호는 «건축물(**제1호에 따른 공장용 건축물은 제외**한다)의 부속토지 중 … 건축물의 바닥면적에 제2항에 따른 용도지역별 적용배율을 곱하여 산정한 면적 범위의 토지»를 별도합산으로 정한다. «제1호에 따른 공장용 건축물»은 시지역 중 읍ㆍ면·산업단지·공업지역을 **뺀** 지역의 공장용 건축물이므로, 읍ㆍ면·산업단지·공업지역의 공장용 건축물이 «제1호에 따른» 것이 아니라면 문언상 2호 «건축물»에 해당할 여지가 있다. 그러면 공장입지기준면적을 넘는 토지 중 **바닥면적 × 배율 범위**는 별도합산, 그 밖은 종합합산이 될 수 있다(배율: 공업지역·일반주거 4배, 녹지 7배, 도시지역 외 7배). 이 문서는 이 해석의 결론을 **단정하지 않는다.**
- 반대 방향 근거(확인): 행정안전부 지방세운영과-51(2008.06.04., 구 지방세법 §182·구 영 §132 번호체계): «공장용건축물의 부속토지에 대한 공장입지기준면적 범위까지는 분리과세 대상에 해당하고, 나머지 공장입지기준 면적을 초과하는 토지는 종합합산과세 대상에 해당되나 이에 해당하는지 여부는 사실관계 및 증빙자료 확인후 과세권자인 자치단체장이 판단하여야 한다.» — **구법 번호 시행본**이고 현행 영 §101①2호 괄호(«제1호에 따른 공장용 건축물은 제외»)가 그 이후 문언인지는 **확인 필요**(V-1). 조세심판원 조심 2023지0373(2023.12.04.)은 산업단지 공장 부속토지의 나대지 부분을 분리과세로 본 사건(경정)이라 초과분 분류의 직접 근거가 아니다.
- 현행 코드·주석·경고문은 «종합합산 이관»으로 일관(`separate-taxation-classify.ts` 상단 주석·경고). 사용자 지시도 «종합합산 이관분».
- **목장용지**: 영 §102①3호 이관분이 별도합산인지(축사 건축물의 부속토지 = §101①2호?)에 관한 해석은 **찾지 못했다**(MCP 검색 «목장용지 기준면적 초과 종합합산» 0건) — V-2.

**(b) 인별 전국 합산 서술.** 이 계획의 합산 칸·고지는 «같은 지방자치단체 관할구역»(§113①1호)이다. 기존 anchor 주석(`property-factory-separate-limit.anchor.test.ts` 머리 «종합합산은 **인별 전국 합산**이라…»)과 `separate-taxation-classify.ts` 경고 «인별 합산 계산 시 별도 처리가 필요합니다»는 법문과 어긋난다 → 구현 PR이 서술만 정정(PSA Q-17 선례 — 로직 불변).

---

## 2. 현행 코드 사실 (file:line — master 46976ad8e 실측)

| 위치 | 사실 |
|---|---|
| `separate-taxation-classify.ts:225` `apportionByArea` | 인정면적 = min(부속토지, 기준면적) · 인정분 시가표준액 = `floor(assessedValue × 인정면적/전체)` · 초과분 = 잔액(합 보존). 주석: «별도합산 경로의 이관분은 PSA-E4부터 세액에 반영 — 이 경로는 별도 후속». |
| `:252` `judgePastureAreaLimit` · `:414` `judgeFactoryAreaLimit` | 판정 입력 미충족 시 `TaxCalculationError(INVALID_INPUT)`로 **던진다**(유리한 추정 금지). 반환에 `excessArea`·`excessAssessedValue`. |
| `:303` `classifyLowRate`(목장) · `:448` `classifyStandard`(공장) | 초과 > 0이면 `warnings.push("… 종합합산과세대상으로 이관됩니다. 인별 합산 계산 시 별도 처리가 필요합니다.")` + `pastureAreaCheck`/`factoryAreaCheck` echo. **세액 없음.** |
| `separate-taxation.ts:178` `calculateSeparateTax` | 과세표준 기준 = `factoryAreaCheck?.recognizedAssessedValue ?? pastureAreaCheck?.recognizedAssessedValue ?? input.assessedValue` — **인정분만**. 이관분은 어디에도 가지 않는다. |
| `property-tax.ts:447` `landTaxType === "separated"` 분기 | `calculateSeparateTax` → `applyTaxCap(separatedTax, objectType, previousYearTax)`(direct 입력만) → `calcSurtax(determinedTax, separatedTaxBase, …)` → 반환. `:505` `isExcluded`이면 «분리과세 대상 토지는 종합부동산세 과세 대상에서 제외됩니다» 고지(이관분이 있어도 동일 문구 — §4.8). 결과에 `landSplit` 없음. 파일 667줄. |
| `property-land-split-tax.ts` | PSA-E4 leaf — `propertyLandSplitRequired`(`:60`) · `propertyLandSplitRequiredFor`(`:84`) · `missingLandSplitInputs`(`:109`) · `applyLandBrackets`(`:157`) · `calcClass`(`:168`, 비공개) · `applyLandSplitCap`(`:219`, 비공개) · `calculateLandClassTax`(`:301`). 368줄. |
| `property-tax-land-split.ts` | 별도합산·직접 종합합산 경로 조립(146줄). 분리과세는 이 파일을 호출하지 않는다. |
| `types/property.types.ts:413~460` | `PropertyLandSplitTransferReason`(`area_excess` = «바닥면적 × 배율» 초과 전용) · `PropertyLandSplitClass` · `PropertyLandSplitResult{separate?, comprehensive?, taxBeforeCap, cap?, jurisdictionBasis, demolishedVerdict?}`. |
| 화면·검증 | `request-body.ts:17` `landSplitRequired(form)`(별도합산 필지만 미리보기) · `:153~203` 분리과세 `st` 객체는 `buildPropertyTaxRequestBody` 안에 **인라인**(함수 분리 없음) · `:208` `landSplitBodyFields(landSplitRequired(form), form)` · `shared.ts:525` ⑧ `firstLandSplitIssue(landSplitRequired(form), form)` · `isRecomputeTarget`(`request-body.ts:86`)은 건축물·선박·항공기·종합합산·별도합산 토지만(**분리과세 제외**) · `LandSplitInputs.tsx`·`PropertyLandSplitCard.tsx`·`PropertyTaxResultView.tsx:493` 이미 있음. |
| Zod `lib/validators/property-input.ts` | `otherSeparateAggregateValue`·`otherComprehensiveValue` 선언됨(`:192·:197`) · `separateTaxationItem`에 `factoryTotalLandArea`·`factoryFloorArea`·`factoryAreaRatePercent`·`pasture*` 등 면적 한도 입력 이미 선언(`:208~`) · superRefine `:503` `propertyLandSplitRequiredFor({landTaxType, separateAggregateItem, targetDate})` — **`separateTaxationItem` 인자 없음**. route는 `parsed.data as PropertyTaxInput` 통과(`route.ts:79`) → ⑭ 매핑 작업 없음. |
| 기존 테스트 | 판정 anchor: `property-factory-separate-limit.anchor.test.ts`(LIM-1~4 등)·`separate-taxation.test.ts:133`(경고 substring «종합합산과세대상으로 이관» 단언 — **substring 유지**). API·E2E에 공장·목장 한도 초과 호출은 **없다**(grep `factoryTotalLandArea`·`pastureTotalLandArea` → 엔진 테스트 2건 + 소스뿐). |

---

## 3. Pre-Do 실측 (throwaway probe — 코드 변경 0)

probe: `/private/tmp/claude-501/-Users-mynote-workspace-Property-related-Taxes/9aedbcaa-1110-4c51-ab6e-5522b9010145/scratchpad/probe-sep-excess.ts`·`probe2.ts`(리포 밖, `npx tsx`). 과세기준일 2026.6.1. · 세부담상한 없음 · 지방교육세 20% · **초과분 시가표준액 = 면적 비례(공시지가 균일 가정 — V-6)**.

### 3.1 시료

- **F**: 산업단지 공장용지 15,000㎡ · ㎡당 100,000원 → 공시가액 1,500,000,000. 연면적 1,200㎡ ÷ 면적률 12% = 10,000㎡ + 3호가2) 20% 가산 = 한도 **12,000㎡** → 인정 12,000㎡(공시가 1,200,000,000) · **초과 3,000㎡(300,000,000)**.
- **P**: 목장용지 2,000㎡ · ㎡당 50,000원 → 100,000,000. 한우(육우) 사육 50마리 · 축사+부대시설 = (7.5+5)×50 = **625㎡** → 인정 625㎡(31,250,000) · **초과 1,375㎡(68,750,000)**.

### 3.2 현행(실측) vs 반영 후(오라클)

| 시료 | 현행 본세 / 부가세 / **총액** (실측) | 반영 후 분리과세분 | 반영 후 종합합산 이관분 | 반영 후 본세 / **총액** (오라클) | 본세 차 |
|---|---|---|---|---|---|
| **F-0** 초과 0 (8,000㎡ · 공시가 8억) | 1,120,000 / 224,000 / **1,344,000** | 1,120,000 | 없음 | **불변**(회귀 0 anchor) | 0 |
| **F-1** 초과 3,000㎡ · 타 종합합산 0 | 1,680,000 / 336,000 / **2,016,000** | 1,680,000 (과표 840,000,000) | 과표 210,000,000 → **800,000** | 2,480,000 / **2,976,000** | **+800,000** |
| **F-1u** F-1 + 도시지역 | 1,680,000 / 1,512,000(교육세 336,000+도시지역분 1,176,000) / **3,192,000** | 1,680,000 | 800,000 | 2,480,000 / 부가세 1,966,000 / **4,446,000**(도시지역분 = 자기 과표 1,050,000,000 × 0.14% = 1,470,000) | +800,000 |
| **F-2** F-1 + 같은 관할구역 타 종합합산 200,000,000 | — (칸 없음) | 1,680,000 | 합산 가액 500,000,000 → 과표 350,000,000 → 합산세 1,500,000 → **몫 900,000**(= floor(1,500,000 × 300,000,000/500,000,000)) | 2,580,000 / **3,096,000** | +900,000 |
| **P-1** 초과 1,375㎡ · 타 0 | 15,312 / 3,062 / **18,374** | 15,312 (과표 21,875,000 × 0.07% = 15,312.5 → 절사) | 과표 48,125,000 → **96,250** (5천만 이하 0.2%) | 111,562 / **133,874** | **+96,250** |
| **P-2** P-1 + 타 종합합산 200,000,000 | — | 15,312 | 합산 268,750,000 → 과표 188,125,000 → 합산세 690,625 → **몫 176,671** | 191,983 / **230,379** | +176,671 |
| **F-3** F-1 + 세부담상한 직전 세액 1,500,000 (**recompute·직접 적용 시**) | — | — | — | 상한 = 1,500,000 × 150% = 2,250,000 → 징수 본세 **2,250,000**(`applyBurdenCap` 실측) · 교육세 450,000(손계산) → 2,700,000 | — |
| **F-3b** F-3 + **direct** 입력(Q-3 추천 (가)) | — | — | — | **상한 미적용 2,480,000 + 확인 필요 고지**(분류 변경 여부를 알 수 없음 — 영 §118①1호 가목 단서·다목) | — |

해석: (1) **초과분 세액이 통째로 빠져 있다**(F +800,000 · P +96,250 본세). (2) 같은 관할구역 타 종합합산 토지가 있으면 이관분 몫이 합산 누진으로 더 커진다(F-2 +100,000 vs F-1). (3) 초과 0은 불변이어야 한다. (4) 도시지역분은 이관분 과표만큼 늘어난다(F-1u). 이 숫자는 단일 필지·단일 관할구역 가정이며 **합산 단위는 사용자가 입력한 값에 달려 있다.**

---

## 4. 설계

### 4.1 재사용 / 신규 경계 (단방향 의존 — `lib/tax-engine/CLAUDE.md`)

| 구성 | 처리 |
|---|---|
| 분리과세분 세액(인정분 과표 × 단일세율) | **기존 `calculateSeparateTax` 그대로**(수정 없음 — F-0 불변 보증) |
| 이관분 = 종합합산 클래스 | **기존 `calculateLandClassTax`**(`separateOwnValue: 0`, `comprehensiveOwnValue: excessAssessedValue`) 재사용 — 합산 → 누진 → 이 필지 몫 `floor(합산세 × 이 필지 가액 / 합산 가액)` |
| 세부담상한·결과 echo | `calculateLandClassTax`에 **분리과세분 선택 인자** `separatedOwn?`(아래 4.4) 추가 — leaf 한 곳에서 합계 상한·`landSplit` 조립 |
| 분기 | `property-tax.ts`의 `separated` 분기(현 ~100줄)를 **새 파일 `lib/tax-engine/property-tax-separated.ts`로 이동**(`property-tax-land-split.ts` 선례) — 초과 0이면 기존 로직 그대로, 초과 > 0이면 leaf 호출. `property-tax.ts`는 667 → ≈570줄(≤700 착지 유지) |
| 판정 | `separate-taxation-classify.ts` 수정은 **경고 문구 정정과 export 추가뿐**(`excessArea` 읽기용 순수 함수) |

의존: `property-tax.ts → property-tax-separated.ts → {separate-taxation, property-land-split-tax}`. 역방향 없음. `comprehensive-*`는 import하지 않는다.

### 4.2 계산 흐름 (초과 > 0일 때)

1. `sepResult = calculateSeparateTax(…)` → `factoryAreaCheck | pastureAreaCheck`에서 `recognizedAssessedValue`·`excessAssessedValue`·`excessArea`. 분리과세분 `taxBase`·`calculatedTax`·`appliedRate`·`category`는 종전과 같다.
2. `required = propertyLandSplitRequired({ landTaxType: "separated", excessArea })` → `otherComprehensive: true`.
3. 이관분: `calcClass(own = excessAssessedValue, other = otherComprehensiveValue ?? 0 + 고지, fairMarketRatio = Step 1 값(DB 우선), rates = landComprehensive)` → 합산 과표 `B = applyFairMarketRatio(V, fmr)` → 합산 산출세액(`calculateComprehensiveAggregateTax` — 종합합산 세율 단일 소스) → 몫 `S_comp`.
4. 합계(상한 전) `T = 분리과세분 세액 + S_comp`.
5. 세부담상한 → `determinedTax`(§4.5).
6. 부가세: `calcSurtax(determinedTax, ownTaxBase, publishedPrice, "land", isUrbanArea)` — `ownTaxBase = 분리과세분 과표 + 이 필지 이관분 과표(= applyFairMarketRatio(excess, fmr))`. 지방교육세 = 합계 본세 × 20%, 도시지역분 = 이 필지 자기 과표 × 0.14%(선형이라 합산 무관 — PSA Q-18).
7. 분납(`calcInstallment`)·납세의무자(`buildTaxpayerOutcome`)는 합계 `determinedTax`·`totalPayable` 기준으로 그대로.

최상위 필드(초과 > 0): `taxBase` = 이 필지 자기 과표(분리과세분 + 이관분) · `calculatedTax`·`calculatedTaxBeforeCap` = 합계(상한 전) · `appliedRate` = **0**(혼합 — PSA-E4 누진 표기와 같은 관례, 분류별 세율은 `landSplit`) · `fairMarketRatio` = Step 1 값 · `legalBasis`에 `PROPERTY_LAND_SPLIT.AGGREGATION_COMPREHENSIVE` + `PROPERTY_CAL.RATE_COMPREHENSIVE` + 분리과세 근거 + 신규 이관 근거(§4.7) 추가.

초과 = 0이면 **현행 분기를 한 줄도 바꾸지 않는다**(결과 객체 `landSplit` 키 부재까지 동일).

### 4.3 결과 타입 — `landSplit` 확장 (신규 타입 아님)

`PropertyLandSplitResult`에 optional 한 칸 추가:

```ts
separated?: {
  category: SeparateTaxationCategory;      // low_rate | standard (heavy는 면적 한도 없음)
  appliedRate: number;                     // 0.0007 | 0.002
  ownValue: number;                        // 인정분 시가표준액
  ownTaxBase: number;                      // 인정분 과표 (= ownValue × 70%, 종전 값)
  tax: number;                             // 인정분 산출세액 (종전 값)
  areaLimit: {                             // 한도 echo — 카드가 «왜 갈렸나»를 같은 값으로 말한다
    kind: "factory" | "pasture";
    totalArea: number; standardArea: number; recognizedArea: number; excessArea: number;
  };
};
```
- `comprehensive?`(기존 `PropertyLandSplitClass & { transferReasons }`)가 이관분을 싣는다. `PropertyLandSplitTransferReason`에 **`factory_area_excess` · `pasture_area_excess`** 추가(기존 `area_excess` = 바닥면적 × 배율 초과와 의미가 다르다 — 재사용 금지). 라벨(`PROPERTY_LAND_SPLIT_TRANSFER_REASON_LABEL` — `Record<…>`라 누락 시 tsc 오류): «공장입지기준면적(칙 §50 [별표 6])을 초과한 공장 부속토지» · «가축별 기준면적(영 §102①3호 [표])을 초과한 목장용지».
- `taxBeforeCap`·`cap`·`jurisdictionBasis`는 기존 의미 그대로 — `cap.basisTaxSeparate`는 **별도합산 전용**이라 분리과세분 직전 재산정액은 `cap.basisTaxSeparated?`(신규 optional)로 둔다.
- `PropertyTaxResult`에 최상위 신규 필드 **없음**(echo는 `landSplit` 하나).

**대안(기각)**: 신규 `separatedExcess` 결과 타입 — 카드·PDF·이력 소비처(`PropertyLandSplitCard` · `PropertyTaxResultView.tsx:493·513~535` · `__tests__/print/property-land-split-pdf.anchor.test.tsx`)가 `landSplit`에 이미 결속돼 있고 같은 «과세 구분별 세액» 개념이라 확장이 변경 면적이 가장 작다(Q-5).

### 4.4 leaf 확장 — `calculateLandClassTax`

`LandClassTaxInput`에 `separatedOwn?: { category; appliedRate; ownValue; ownTaxBase; tax; areaLimit }` 추가(전부 호출자가 이미 구한 값 — leaf는 단일세율을 **다시 계산하지 않는다**).
- 합계 `taxBeforeCap = (hasSep ? separate.share : 0) + (hasComp ? comprehensive.share : 0) + (separatedOwn?.tax ?? 0)`.
- `ownTaxBase`에 `separatedOwn.ownTaxBase` 합산. `landSplit.separated` 조립.
- 상한(§4.5)의 recompute 분기에 «분리과세분 직전 재산정»을 추가.
- `transferredFromSeparate`(별도합산 선택에서 이관분이 생겼는가)는 direct 상한 미적용 판단용 — 분리과세 이관도 «과세대상 구분이 직전과 달라질 수 있음»이라 **같은 플래그를 true로 넘긴다**(Q-3 추천안). 이름은 유지하고 주석만 넓힌다.
- `property-land-split-tax.ts` 368 → ≈430줄(≤700).

### 4.5 세부담상한 (§122 · 영 §118) — 위치

- 상한은 **이 필지 합계**(분리과세분 + 이관분)에 150%(PSA Q-15와 동일 단위; 영 §118①1호 «과세대상 토지별» — 한 필지가 두 구분으로 갈리므로 직전 기준을 필지 합계로 받는다는 점은 V-4).
- **direct**(`previousYearTax`): 초과 0 = 종전 그대로 `applyTaxCap`. **초과 > 0 + direct = 상한 미적용 + `PROPERTY_LAND_SPLIT_DIRECT_CAP_NOTICE` 고지** — 직전 연도 실제 부과액이 이 연도 구분(분리과세+종합합산)의 기준인지 알 수 없다(영 §118①1호 가목 단서는 «토지현황 일치» 시에만, 다목은 구분 변경 시 직전에도 적용). «모름 = 혜택 불성립 + 확인 필요».
- **recompute**(`taxCapMode = "recompute"` + `previousYearTaxBase`): 직전 과세표준을 이 필지 분류 가액 비율(분리과세분 : 이관분)로 나눠 **분류별 직전 연도 세율**로 재산정 — 분리과세분 `getPropertyRateSet(priorYear).landSeparated{Low|General}`(단일세율) · 이관분 `landComprehensive` 누진. 타 토지 합산 효과는 넣지 않는다(PSA `PROPERTY_LAND_SPLIT_RECOMPUTE_NOTICE` 재사용). 화면은 `isRecomputeTarget`을 «분리과세 + 초과 > 0»까지 확장해야 이 모드가 열린다(UI 몫 — §5).
- Q-3에서 분할(1단계 direct 고지 → 2단계 recompute)할 수 있다.

### 4.6 요구 술어 — 단일 소스 (⑧·⑫·엔진)

`property-land-split-tax.ts`(이름·위치 동결):

```ts
// 기존 시그니처 확장 — 면적 필드만 추가, 기존 호출처 호환
propertyLandSplitRequired(i: { landTaxType?; recognizedArea?; excessArea? }): PropertyLandSplitRequired
//   + landTaxType === "separated": { otherSeparate: false, otherComprehensive: (i.excessArea ?? 0) > 0 }

propertyLandSplitRequiredFor(i: { landTaxType?; separateAggregateItem?; separateTaxationItem?; targetDate? }): PropertyLandSplitRequired
//   + landTaxType === "separated": separatedAreaExcessOf(separateTaxationItem) → propertyLandSplitRequired({ landTaxType, excessArea })
```
신규 순수 함수 `separatedAreaExcessOf(item): { kind: "factory" | "pasture"; excessArea: number } | null`(`separate-taxation.ts`에서 export — 내부는 `classifySeparateTaxation({ assessedValue: 0, ...item })`의 `factoryAreaCheck ?? pastureAreaCheck`를 읽는다. **엔진 판정과 같은 코드 경로**라 술어와 엔진이 어긋날 수 없다).
- **판정이 던지면**(면적 입력 누락 등 — ⑧ step 2가 따로 막고, 엔진도 같은 판정을 던진다): `null`(요구 없음). PSA-E4와 달리 «두 칸 요구»로 접지 않는다 — 분리과세는 엔진이 같은 호출을 던져 400이 되므로 **침묵 0원 경로가 없다**(anchor로 고정: 술어 throw ⇒ 엔진 throw).
- **요구되지 않은 칸은 엔진이 읽지 않는다**: 초과 0인데 stale `otherComprehensiveValue`가 body에 있어도 결과 불변(anchor).
- 엔진 직접 호출에서 요구됐는데 `otherComprehensiveValue === undefined`: **이 필지 단독 + `PROPERTY_LAND_SPLIT_NO_OTHER_NOTICE` 고지**(leaf의 기존 동작). 입구 차단은 ⑧·⑫ 몫(자동 0 기본값 없음).
- ⑫: superRefine `:503` 호출에 `separateTaxationItem: data.separateTaxationItem` 한 인자만 추가. `missingLandSplitInputs`·`PROPERTY_LAND_SPLIT_INPUT_MESSAGE`는 그대로(문구에 «다른 공장·목장 필지의 한도 초과분도 종합합산 가액에 넣는다» 보충은 UI 문서·구현 PR이 정한다 — 이름 `otherComprehensiveValue` 동결).

### 4.7 법령 상수·manifest

`legal-codes/property.ts`의 `PROPERTY_LAND_SPLIT`에 추가(문자열 리터럴 금지):
- `SEPARATED_EXCESS_TO_COMPREHENSIVE` = «지방세법 §106①1호» (종합합산 = 별도합산·분리과세 제외 토지)
- `SEPARATED_FACTORY_AREA_LIMIT` = «지방세법 시행령 §102①1호» (기존 `PROPERTY.SEPARATE.STANDARD_FACTORY`와 동일 값 — 재사용 우선, 중복이면 추가 안 함)
- `SEPARATED_PASTURE_AREA_LIMIT` = «지방세법 시행령 §102①3호» (기존 `LOW_RATE_LIVESTOCK` 재사용)

`lib/legal-verification/manifest/`에 verbatim 키워드 등록(게이트 `legal-verification-coverage-complete.test.ts`): 법 §106 규칙에 «별도합산과세대상 또는 분리과세대상이 되는 토지를 제외한 토지»; 영 §102 규칙(`LOCAL_DECREE.SEPARATE_TAXATION_LAND` — `additions-local-decree.ts:192`)에 «공장입지기준면적 범위의 토지»·«계산한 토지면적의 범위에서 소유하는 토지»; 종부세법 §11 규칙에 «종합합산과세대상»(고지 문구 근거). 등록 후 `npm run verify:legal`. **새 조문을 더 인용하지 않는다**(§113①1호·§118·§122는 PSA-E4가 이미 등록).

### 4.8 종부세 고지 (세액 불변)

현행 `property-tax.ts:505` 문구 «분리과세 대상 토지는 종합부동산세 과세 대상에서 제외됩니다»는 **초과 > 0이면 부정확**하다(§1.3 종부세법 §11). 초과 > 0일 때 고지를 «분리과세로 남은 부분만 제외 — 종합합산으로 이관된 부분은 종합부동산세 종합합산 과세대상일 수 있다(종부세 계산은 별도 — 확인 필요)»로 바꾼다. 종부세 엔진 입력·결과·`isExcludedFromComprehensiveTax` 의미는 건드리지 않는다(종부세 토지는 자체 필지 모델 — 이 계산기의 분리과세 판정을 읽지 않음, PSA §13.8). 초과 = 0이면 현행 문구 유지.

### 4.9 UI 시니어용 export (이름 정본)

| 이름 | 위치 | 용도 |
|---|---|---|
| `propertyLandSplitRequiredFor({ …, separateTaxationItem })` | `property-land-split-tax.ts` | ⑧·⑫ 요구 칸 판정(기존 이름·확장) |
| `separatedAreaExcessOf(item)` | `separate-taxation.ts` | 술어 입력·화면 미리보기(초과 면적·kind) |
| `buildSeparateTaxationItem(form)` | `components/calc/property/request-body.ts` (신규 추출) | ④ 본문과 ⑧ 미리보기가 **같은 객체**를 쓰도록 `buildPropertyTaxRequestBody:153~203`의 인라인 `st`를 함수로 분리 |
| `landSplitRequiredFromForm({ …, separateTaxationItem })` | `lib/calc/property-land-split-inputs.ts` | 어댑터 확장(별도합산 인자와 병렬) |
| `PropertyLandSplitResult.separated` · `PropertyLandSplitTransferReason` `"factory_area_excess" \| "pasture_area_excess"` | `types/property.types.ts` | 결과 카드 |
| `PROPERTY_LAND_SPLIT_SEPARATED_NOTICE`(초과분이 종합합산으로 이관·합산 단위·별도합산 해당 여부 확인 필요 고지) | `property-land-split-tax.ts` | 카드·경고 중복 제거(`LAND_SPLIT_CARD_NOTICES` 등록) |
| testid(엔진 정본 — UI가 그대로 쓴다) | — | `land-split-separated-section`(분리과세분) · `land-split-separated-area-limit`(기준면적·인정·초과) · `land-split-comprehensive-section`(기존 재사용) · `land-split-total-line`(합계) |

---

## 5. 14 동기화 지점 영향표

> 이 기능은 **신규 와이어 필드가 없다**(`otherComprehensiveValue`·`separateTaxationItem` 면적 필드 모두 기존). 변경은 «요구 술어 확장 + 결과 echo 확장 + 표시»다. ⑫⑬⑭는 TypeScript가 못 잡으므로 anchor가 지킨다.

| # | 지점 | 영향 | 비고 |
|---|---|---|---|
| ① | FormState | **없음** | `otherComprehensiveValue` 기존(`shared.ts:195`) |
| ② | INITIAL | **없음** | 기본값 `""` 유지(자동 0 금지) |
| ③ | normalize | **없음** | — |
| ④ | request-body | **변경** — `buildSeparateTaxationItem(form)` 추출 · `landSplitRequired(form)`에 `landTaxType === "separated"` 분기 · `landSplitBodyFields` 재사용 · stale 값은 요구 칸만 전송 | 초과 0이면 `otherComprehensiveValue` 미전송 |
| ⑤ | 위젯 | **변경(UI)** — `LandSplitInputs`가 분리과세에서도 열림(별도합산 전용 «pending» 가드의 분리과세판) · 문구 · `isRecomputeTarget` 확장(Q-3) | UI 계획서 |
| ⑥ | 사이드바 합계 | **확인 필요(UI)** — 분리과세 합계가 `publishedPrice` 기준 추정이면 이관분 반영 여부 | UI 계획서가 판단 |
| ⑦ | 결과 카드/PDF | **변경(UI)** — `PropertyLandSplitCard` 3분류·`PropertyTaxResultView`의 `landSplit` 분기(`:395`·`:493`·`:513~535` 문구)·PDF anchor | UI 계획서 |
| ⑧ | validate | **변경(술어만)** — `shared.ts:525`가 이미 `firstLandSplitIssue(landSplitRequired(form), form)` 호출 → 술어 확장으로 자동 연동 | 같은 문구·순서 |
| ⑨ | Zod enum 메인 | **없음** | `landTaxType` 3종 기존 |
| ⑩ | Zod 컴패니언 | **없음** | — |
| ⑪ | 자산-수준 `acquisitionDate` | **해당 없음** | 양도세 전용 |
| ⑫ | Zod 입력·superRefine | **변경** — `:503` 호출에 `separateTaxationItem` 인자 추가. 입력 객체 정의 변경 **없음**(선언 누락 stripping 위험은 anchor로 확인) | ⑧↔⑫ 패리티 격자 필수 |
| ⑬ | body spread | **해당 없음**(재산세는 `buildPropertyTaxRequestBody`가 본문 정본 — ④) | — |
| ⑭ | route 매핑 | **없음** — `parsed.data as PropertyTaxInput` 통과(`route.ts:79`), 숫자라 Date 변환 불필요 | — |
| 엔진 type | `PropertyTaxInput` 변경 없음 · `PropertyLandSplitResult` 확장(§4.3) | — | — |
| 저장 이력 | 기존 저장 결과는 `landSplit` 부재 → 카드 조건부 렌더라 안전. 이력에서 다시 열 때 분리과세 + 초과 > 0이던 과거 결과는 **구 값(이관분 0)** — 재계산 안내 필요 여부 확인 필요(V-7) | — | — |

---

## 6. 케이스 표 (오라클 — 구현 PR의 anchor 입력)

| K | 입력 | 기대 |
|---|---|---|
| K-1 | 공장 F-0(초과 0) · `otherComprehensiveValue` 있음/없음 | 결과 **현행과 바이트 동일**(요구 안 함·읽지 않음) |
| K-2 | 공장 F-1 · 타 0 명시 | 분리과세 1,680,000 + 이관 800,000 = **2,480,000** · 교육세 496,000 · 총 2,976,000 |
| K-3 | 공장 F-1u(도시지역) | 부가세 = 교육세 496,000 + 도시지역분 1,470,000 → 총 **4,446,000** |
| K-4 | 공장 F-2(타 종합합산 2억) | 이관분 몫 **900,000** → 본세 2,580,000 · 총 3,096,000 |
| K-5 | 목장 P-1 | 15,312 + 96,250 = **111,562** · 총 133,874 |
| K-6 | 목장 P-2(타 2억) | 15,312 + 176,671 = **191,983** · 총 230,379 |
| K-7 | 공장 초과 > 0 + `otherComprehensiveValue` **빈칸** | ⑧ 차단 + ⑫ **400**(경로 `otherComprehensiveValue`) · 엔진 직접 호출은 단독 계산 + `NO_OTHER_NOTICE` |
| K-8 | 값 `0` 명시 | = K-2(`0` = 없음 입력, 빈칸과 구별) |
| K-9 | 음수·소수 | ⑫ 400(기존 Zod 규칙) |
| K-10 | 공장 인정면적 0(전부 초과 — `recognizedArea ≤ 0`) | 분리과세 비해당 → 기존대로 던짐(변경 없음 — 술어 `null`) |
| K-11 | 공장 도시지역 `urban`·허가 미이행 | 분리과세 아님 — 변경 없음(술어 `null`, 이관 로직 미진입) |
| K-12 | 면적 입력 누락(총면적·연면적·면적률 0) | 판정이 던짐 — 술어 `null`·엔진 throw(침묵 0원 아님) |
| K-13 | 공장 F-1 + direct `previousYearTax` | **상한 미적용 + DIRECT_CAP_NOTICE**(Q-3 (가)) · 값 2,480,000 |
| K-14 | 공장 F-1 + recompute | 분류별 직전 세율 재산정 — 오라클 구현 PR이 격자로 확정(분리과세 직전 세율은 `getPropertyRateSet(priorYear)`) |
| K-15 | 골프장·고급오락장·염전·터미널·농지·임야 | 면적 한도 echo 없음 → 술어 `null` · 결과 불변 |
| K-16 | 합 보존: `separated.ownValue + comprehensive.ownValue == publishedPrice` | 항상(`apportionByArea` 잔액 흡수) |
| K-17 | 종부세 고지 | 초과 > 0이면 이관분 고지문, 0이면 현행 문구 |
| K-18 | 공유지분·납세의무자 판정 있는 입력 | `buildTaxpayerOutcome`이 합계 `determinedTax`·`totalPayable`로 동작(기존 경로 재사용) |
| K-19 | 총액 정합 | `determinedTax + totalSurtax == totalPayable`, 분납 기준 = 합계 |

### 6.1 Mutation 후보 (anchor가 죽여야 함)

M-1 이관분을 세액에서 뺌(현행 회귀 — K-2) · M-2 이관분을 타 토지 합산 없이 단독 처리(K-4·K-6) · M-3 몫 분모를 이 필지 가액으로(K-4) · M-4 이관분을 별도합산 세율로 계산 · M-5 술어를 `excessArea > 0` 대신 항상 true(K-1: 초과 0에서 요구 강제) · M-6 술어를 항상 false(K-7: 침묵 단독 계산 — ⑧·⑫ 통과) · M-7 엔진이 술어 false인데 stale `otherComprehensiveValue`를 읽음(K-1) · M-8 ⑧만 술어 확장하고 ⑫는 미확장(⑧↔⑫ 패리티 격자 — «UI 통과↔200 막다른 길»의 반대) · M-9 지방교육세를 분리과세분 본세만으로(K-2 총액) · M-10 도시지역분을 분리과세분 과표만으로(K-3) · M-11 direct 상한을 이관분 > 0에서도 적용(K-13) · M-12 상한을 이관분에만 적용(합계 아님 — F-3) · M-13 `pasture_area_excess`를 `area_excess`로 재사용(라벨 오귀속) · M-14 목장 `pastureAreaCheck` 누락(공장만 이관) · M-15 종부세 고지 분기 반전(K-17) · M-16 술어가 판정 throw를 «두 칸 요구»로 바꿈(K-12: 오류 메시지 가림).

---

## 7. 사용자 결정 Q (각 추천안 첫째)

**Q-1. 한도 초과분의 과세 구분 — 종합합산 단일로 둘 것인가(§1.4)**
- **(가) 종합합산 단일(2-way) + «별도합산 해당 여부는 영 §101①2호 문언상 확인 필요» 고지** — 추천. 근거: 현행 코드·경고문·사용자 지시와 일치, 법 §106①1호(잔여 = 종합합산)에 직접 부합, 행안부 지방세운영과-51(구법 시행본)의 회신과 같은 방향. 별도합산이 되면 세액이 낮아질 수 있는 «혜택»이라 **법 근거가 확인되기 전에는 적용하지 않는다**(모름 = 혜택 불성립 + 확인 필요). 별도합산 가능성을 결과 고지에 명시.
- (나) 바닥면적 × 배율 범위는 별도합산, 그 밖은 종합합산(3-way) — 문언 해석이 확정되면. 추가 입력(바닥면적 = 연면적 아님 · 용도지역 · 허가)·`isSeparateAggregateLand` 재사용·leaf는 이미 두 분류 지원. 해석례 확보 전에는 비추천.
- (다) 사용자가 화면에서 («초과분 과세 구분: 종합합산 / 별도합산») 선택 — 토글이 법 판단을 사용자에게 넘기고 강행규정에 토글을 다는 꼴이라 비추천.

**Q-2. 목장용지도 같이 넣나**
- **(가) 공장용지·목장용지 같이** — 추천. 근거: 두 subtype만 `*AreaCheck`·`excessAssessedValue`를 갖고 `apportionByArea`·술어·카드가 같은 코드 경로. 목장만 빼면 같은 구조에서 한쪽만 과소 과세가 남는다. 단 목장 이관분의 별도합산 해당 여부는 해석례 미확보(V-2)라 Q-1과 같은 고지.
- (나) 공장용지만 먼저, 목장은 후속 — 시료·anchor 감축이 크지 않아 이유 약함.

**Q-3. 세부담상한 처리**
- **(가) 필지 합계에 적용 · direct = 초과 > 0이면 상한 미적용 + 확인 필요 고지(PSA Q-15 동일) · recompute는 같은 브랜치 2단계(`isRecomputeTarget` 확장)** — 추천. 근거: 영 §118①1호 가목 단서(토지현황 일치 시에만 직전 부과세액 사용)·다목(구분 변경 시 직전에도 적용) — 직전 구분을 모르면 direct 값은 기준이 아닐 수 있다. 선례와 일관.
- (나) direct 입력도 합계 상한 적용(직전 구분이 같다고 가정) + 고지 — 입력 구분을 사용자가 보증하는 구조가 없어 «모름 = 혜택 불성립»에 어긋남.
- (다) recompute는 후속 PR로 미룸(direct 고지만) — 범위 축소, 이관분 있는 납세자가 상한을 못 받음.

**Q-4. 직접 API·화면에서 초과 > 0인데 `otherComprehensiveValue` 미입력**
- **(가) ⑧ 차단 + ⑫ 400(자동 0 금지)**, 엔진 직접 호출은 «단독 계산 + 고지» — 추천(PSA-E4 선례). 호환 영향: 공장·목장 한도 초과 입력을 보내던 API 클라이언트만 영향(리포 API·E2E 호출 0건 — §2).
- (나) 200 + 단독 계산 + 고지(입구 차단 없음) — 합산을 무시하면 조용히 틀리는 크기(F-2 +100,000)가 입구에서 안 걸림.
- (다) 빈칸을 0으로 기본 처리 — **재제안 금지**(자동 0 기본값).

**Q-5. 결과 표시 형태**
- **(가) 기존 «토지 과세 구분별 세액» 카드(`PropertyLandSplitCard`)를 3분류로 확장(분리과세분 / 종합합산 이관분 / 합계) + 한도 echo 행** — 추천. 근거: `landSplit` 소비처(카드·결과 뷰·PDF anchor) 변경 면적 최소, 같은 개념.
- (나) 신규 `SeparatedExcessCard` — 카드 중복, PDF·이력 소비처 추가.
- (다) 경고 문구 + 합계 한 줄만 — 분류별 산식 근거가 사라져 합산 입력 효과를 못 보여 줌.

**Q-6. 종부세 고지 문구**
- **(가) 초과 > 0이면 «분리과세 부분만 종부세 제외 · 이관분은 종합합산 대상일 수 있음(종부세 계산은 별도 — 확인 필요)»로 교체, 세액·종부세 엔진 불변** — 추천(§1.3 종부세법 §11 확인).
- (나) 현행 문구 유지 — 이관분이 있을 때 사실과 다르게 «제외»라고 말함.
- (다) 종부세 엔진에 이관분 연동 — 범위 확대·종부세 필지 모델과 충돌, 비추천.

---

## 8. 미검증·확인 필요 (V)

| V | 내용 |
|---|---|
| **V-1** | 읍ㆍ면·산업단지·공업지역 공장용 건축물의 한도 초과 토지가 영 §101①2호(«제1호에 따른 공장용 건축물은 제외»)로 별도합산 일부가 될 수 있는지. 지방세운영과-51(2008)은 구법 번호·구 구조. 현행 해석례·판례·행정안전부 지방세 법령 운영예규 **미확보**. 해석이 나오기 전 Q-1 (가) 고지 유지. |
| **V-2** | 목장용지 한도 초과분의 별도합산 해당 여부(축사 건축물 부속토지) — 해석례 0건. |
| **V-3** | 과세기준일이 2020.6.1. 전인 시행본의 법 §106①1호(가목·나목 2019.12.3. 삭제 전) — 이관분 종합합산 귀결은 같다고 보이나 시행본 본문 미대조. 계산기 대상 연도 범위와 함께 확인 필요. |
| **V-4** | 세부담상한 «과세대상 토지별» 단위에서 한 필지가 분리과세 + 종합합산으로 갈릴 때 직전 기준을 필지 합계 하나로 받는 것이 영 §118①1호에 부합하는지(PSA V-18과 같은 계열) — 근거 미확보, 고지 유지. |
| **V-5** | 분리과세분 FMR은 상수 70%(`separate-taxation.ts` `FAIR_MARKET_RATIO`)이고 이관분은 Step 1 `calcTaxBase`(DB `tax_rates` 우선) — DB 행이 0.70이 아니면 두 분류 FMR이 갈린다(PSA V-19와 같은 이중 소스). 이 계획은 분리과세분을 **건드리지 않는다**(F-0 불변). 한 소스로 통일할지는 별도 판단. |
| **V-6** | 초과분 시가표준액 = 인정면적 **면적 비례** 안분(`apportionByArea`). 개별공시지가가 필지 내 균일하다는 가정이며, 「1구의 공장」이 여러 필지(공시지가 상이)에 걸치면 초과분이 어느 필지 몫인지 입력으로 알 수 없다. 현행 코드가 이미 쓰는 가정이라 이번에 바꾸지 않지만 이관분 세액이 이 가정에 의존한다. |
| **V-7** | 이력(IndexedDB `resultData`)에서 과거 분리과세 + 초과 > 0 결과를 다시 열 때 이관분 0으로 보이는 문제 — 재계산 안내 필요 여부. `lib/storage/CLAUDE.md` 확인 필요. |
| **V-8** | 합산 입력 라벨: «같은 관할구역 타 종합합산 토지» 합계에 **다른 공장·목장 필지의 한도 초과분도 포함**해야 한다는 안내 문구가 필요하다 — 법문상 종합합산과세대상 토지 전부(§113①1호)이므로 포함이 맞고, 이 계산기는 다른 필지 판정을 하지 않는다(사용자 입력). |

---

## 9. PR 분할 · 검증 (엔진 선행 → UI 같은 브랜치 시퀀셜 — CLAUDE.md 워크플로)

| 커밋 | 내용 | 검증 |
|---|---|---|
| **PSE-E0 (Pre-Do)** | anchor 먼저: K-1(회귀 0, 현행 값 고정) · K-2·K-5(오라클 — **빨강으로 시작**) · 술어 단위 | 의도된 빨강 확인 → 설계 환류 |
| **PSE-E1 술어·타입·상수** | `propertyLandSplitRequired(For)` 확장 · `separatedAreaExcessOf` · `PropertyLandSplitResult.separated`·이관 사유 2종·라벨·고지 상수 · `PROPERTY_LAND_SPLIT` 상수 · manifest 키워드 | tsc · `verify:legal` · `__tests__/tax-engine/property/` |
| **PSE-E2 leaf·분기** | `calculateLandClassTax`의 `separatedOwn` · `property-tax-separated.ts`(분기 이동 + 초과 > 0 경로) · 종부세 고지 분기 · 경고 문구 정정(substring «종합합산과세대상으로 이관» 유지) · 기존 anchor 주석 정정 | K-1~K-19 · M-1~M-16 뮤테이션 · `npm run test:property` |
| **PSE-E3 ⑫ Zod** | superRefine 인자 추가 + 400 anchor(K-7·K-9) · ⑧↔⑫ 패리티 격자(초과 0/>0 × 입력 있음/없음/0/stale) | route anchor |
| **PSE-E4 recompute(Q-3 (가) 2단계)** | 분류별 직전 재산정(K-14) | 격자 확정 |
| **PSE-U1~U3 (UI — 같은 브랜치 이어서)** | `buildSeparateTaxationItem` 추출·⑧·위젯·카드·PDF·`isRecomputeTarget` | UI 계획서 · `ui-engine-sync-checker`(14지점) · 브라우저 확인(Playwright) |

**순서 이유**: E0(회귀 고정)이 가장 먼저여야 F-0 불변을 증명할 수 있다. E3(⑫ 400)를 E2 뒤에 두면 엔진이 이관분을 계산하기 전에 입구가 막는 일이 없다. UI는 엔진 타입·술어가 확정된 뒤.

**검증 명령**: `npx vitest run __tests__/tax-engine/property/ __tests__/tax-engine/property-factory-separate-limit.anchor.test.ts __tests__/tax-engine/separate-taxation.test.ts __tests__/calc/ __tests__/api/` · `npx tsc --noEmit` · `npm run verify:legal` · 전수 `npm run test:property`(세목 단위 회귀 — `lib/tax-engine/**` 변경이라 pre-push가 전체를 돌린다).

### 9.1 영향받는 기존 테스트

- 경고 문구 정정: `property-factory-separate-limit.anchor.test.ts:91·304`·`separate-taxation.test.ts:133`(substring «종합합산과세대상으로 이관» 유지로 통과) · `property/building-permit-101.anchor.test.ts:98`(«종합합산으로 이관됩니다. 인별 합산» 부재 단언 — 별도합산 경로, 영향 없음 확인).
- `__tests__/api/property.route.*`·`__tests__/calc/property-*-parity-grid*`: 분리과세 격자에 «초과 > 0» 축 추가(공유 단언 반전 시 형제 안전망 소실 주의 — `feedback_shared_assertion_reversal_erases_sibling_net`).

### 9.2 위험

| 위험 | 대응 |
|---|---|
| 한도 초과분이 별도합산일 수 있음(§1.4 V-1) — 방향이 틀리면 과대 과세 | Q-1 (가) 고지·결과 카드에 «별도합산 해당 여부 확인 필요» 명시. 해석 확정 시 3-way로 확장(leaf 이미 지원) |
| API 호환(Q-4) — 초과 > 0 호출이 400으로 바뀜 | 리포 내 호출 0건 확인(§2). 변경 고지는 PR 설명에 |
| `property-tax.ts` 800줄 정책 | 분리과세 분기 이동으로 667 → ≈570줄. 분기 이동 커밋(동작 불변)과 신규 경로 커밋을 분리 |
| 술어·엔진 분기 불일치(침묵 단독/침묵 차단) | 술어가 엔진과 **같은 `classifySeparateTaxation` 경로**를 읽음 · 패리티 격자 · M-5~M-8 |
| 합산 입력 미포함 오입력(다른 필지 초과분 누락) | 라벨·hint에 포함 대상 명시(V-8), 결과 카드에 «입력한 합산 가액 N원 기준» 노출 |
| `taxBase` 최상위 의미 변화(분리과세 인정분 → 이 필지 자기 과표 합) | 초과 > 0에서만. PDF·이력 소비처 anchor로 확인, 초과 0은 불변 |
| 분리과세분은 `landSplit.separated.tax`, 별도합산분은 `landSplit.separate.share` — 이름 혼동 | 타입 주석·테스트 이름으로 구분(별도합산 = `separate`, 분리과세 = `separated`) |

---

## 10. 재제안 금지·기결정 준수 확인

- 인별 전국 합산: 합산 단위 = 납세의무자 × 해당 지방자치단체 관할구역(법 §113①1호) — 전국은 종부세(§1.2·§4.8).
- 자동 0 기본값·자동 안분 fallback: 합산 칸 빈칸 = ⑧ 차단 + ⑫ 400, `0`은 사용자가 직접 입력한 «없음».
- 「모름 = 혜택 불성립 + 확인 필요」: Q-1(별도합산 혜택)·Q-3(direct 상한) 적용.
- 법 근거 없는 유리/불리 적용 금지: 이관분 종합합산은 법 §106①1호 본문 직접 근거, 별도합산 가능성은 고지로만.
- 납세자 유리/불리·절감 표현 금지(결과·고지 문구).
- 금액 정수: 이관분 몫 `calculateProration`(floor)·분리과세 `applyRate` — `Math.round` 금지. 면적 반올림은 기존 판정이 이미 처리(이번에 안 건드림).

## 11. 후속 문서 갱신 (구현 PR 시)

- `separate-taxation-classify.ts` 상단·`apportionByArea`·`judgeFactoryAreaLimit` 주석의 «이 경로는 별도 후속» 삭제 + «인별 합산» 서술 정정.
- `property-factory-separate-limit.anchor.test.ts` 머리 주석 «종합합산은 인별 전국 합산» 정정.
- `docs/00-pm/recent-completions.md`(구현 완료 시) · 메모리 색인 «취득세·재산세·종합부동산세» 항.
- UI 계획서와 §4.9 이름 대조.

## 12. 검증 기록

- KoreanLaw MCP 직접 조회(2026-11-25): 영 §101(MST 290815) · 영 §102 · 영 §118 · 법 §106·§111·§113·§122(MST 282559) · 칙 §50(MST 287031) · 종부세법 §11(MST 280417) · 행정안전부 지방세운영과-51(2008.06.04.) · 조심 2023지0373. **읽지 못한 것**: 칙 별표6 본문(이 계획 범위 밖 — 기존 구현·anchor 의존), 영 §101①2호 현행 이전 시행본 연혁(V-1), 목장용지 해석례(0건).
- 코드: `separate-taxation-classify.ts`·`separate-taxation.ts`·`property-tax.ts`·`property-land-split-tax.ts`·`property-tax-land-split.ts`·`types/property.types.ts`·`validators/property-input.ts`·`request-body.ts`·`shared.ts`·`LandSplitInputs.tsx`·`PropertyLandSplitCard.tsx`·`route.ts` 직접 읽음. 테스트 grep.
- probe: §3(리포 밖 스크래치). 현행 열 = `calculatePropertyTax` 직접 호출 실측. 반영 후 열 = `calculateLandClassTax`(PSA-E4)·`calcSurtax`·`applyBurdenCap` 합성 — **구현 전 오라클**.

---

## 사용자 결정 (2026-11-26 확정)

| 항목 | 결정 |
|---|---|
| Q-1 초과분 과세 구분 | **(가) 종합합산 단일 + «별도합산 해당 여부 확인 필요» 고지** — 3-way·토글 기각 |
| Q-2 목장용지 | **(가) 공장·목장 같이** |
| Q-3 세부담상한 | **(가) 필지 합계 적용 · direct는 이관분 있으면 미적용 + 확인 필요 · recompute는 같은 브랜치에서 구현** |
| Q-4 초과>0 · 합산 칸 미입력 | **(가) ⑧ 차단 + ⑫ 400** (0 기본값 재제안 금지) |
| Q-5 결과 표시 | **(가) `PropertyLandSplitCard` 확장** |
| Q-6 종부세 고지문 | **(가) 초과>0이면 «분리과세 부분만 제외 · 이관분은 종합합산 대상일 수 있음»으로 교체** |
| UQ-1~UQ-9 | **전부 (가) 추천안** |
