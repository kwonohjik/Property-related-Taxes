# 무체재산권(특허·실용신안·상표·디자인·저작권) 상속·증여세 평가 — 구현 계획서

> 출처: 국세청 상속·증여세 집행기준 **64-59-4** "5. 특허권·실용신안권·상표권·디자인권 및 저작권 등의 평가" (첨부 이미지 4~7)
> 작성 기준일: 2026-06-27 / 대상 세목: 상속세·증여세 공용 (EstateItem 평가 경로)
> 참고 템플릿 구현: **지상권(superficies, §61③)** — 동일한 정기금 BigInt 현가환산 자산

---

## 0. 요약 (TL;DR)

- 현재 특허·실용신안·상표·디자인·저작권은 **개별 평가 엔진 미구현**. "기타재산(`other`)"으로만 입력되어 사용자가 시가를 직접 넣는다.
- 본 계획은 **무체재산권 전용 카테고리 `intangible_ip`** 를 신설하고, **상증법 §64 → 상증령 §59⑤ → 상증칙 §19②③④** 산식(정기금 10% 현가환산, 20년 한도)을 지상권과 동일한 **BigInt Σ floor** 패턴으로 구현한다.
- **인용 오류 동반 정정**: 코드의 `INTANGIBLE: "상증법 §65"`(`legal-codes/inheritance-gift.ts:278`)는 무체재산권 근거로 **틀림** → §64로 정정.
- 핵심 anchor(특허권 사례): 연수입 15,000,000원·잔존 13년 → **106,550,336원**(천원절사 106,550천원, 교재 일치).

---

## 1. 법적 근거 (KoreanLaw 검증 완료, 2026-06-27)

| 단계 | 조문 | 내용 (법제처 원문 발췌) |
|---|---|---|
| 본칙 | **상증법 §64** (무체재산권의 가액) | MAX( ① 재산 취득가액 − 취득일~평가기준일 법인세법상 감가상각비, ② 장래 경제적 이익 등 고려 **대통령령으로 정하는 평가액** ) |
| 위임 | **상증령 §59⑤** | **특허권·실용신안권·상표권·디자인권 및 저작권 등**은 그 권리로 장래에 받을 **각 연도 수입금액** 기준, 재정경제부령이 정하는 계산금액 합계. 후단: 각 연도 수입금액 **미확정** 시 평가기준일전 3년간 각 연도 수입금액 합계액을 평균한 금액을 각 연도 수입금액으로 할 수 있다 |
| 산식 | **상증칙 §19②** | (영 §59⑤ 전단) 환산 산식 = Σₙ (각 연도 수입금액) / (1 + 0.1)ⁿ |
| 한도 | **상증칙 §19③** | 최종 경과연수 = 권리 존속기간 − 평가기준일 전일까지 경과연수. **20년 초과 시 20년** |
| 감정 | **상증칙 §19④** | (영 §59⑤ 후단) 미확정 시 직전 3년 평균(3년 미달 시 그 연수). 단 **최근 3년 수입 없거나 저작권(저작인접권 포함)으로 장래 수입 하락 명백** 시 → 2 이상 공신력 있는 감정기관·전문가 감정가액으로 평가 가능 |
| 할인율 | **상증칙 §19①** | 100분의 10 (영업권 규정이나 §19②④ 환산도 동일 10% — 이미지 연금현가계수표 이자율 10%) |

### 🔴 인용 오류 정정 (필수)

`lib/tax-engine/legal-codes/inheritance-gift.ts:277-278`
```ts
/** 상증법 §65 — 무체재산권·기타재산 평가 */
INTANGIBLE: "상증법 §65",      // ← 무체재산권 근거로 틀림
```
- **상증법 §65**(그 밖의 조건부 권리 등)는 "조건부 권리·존속기간 불확정 권리·신탁이익·소송 중 권리·정기금·가상자산"으로 **무체재산권과 무관**. ③에서 "이 법에서 따로 평가방법을 규정하지 아니한 재산"에 §60~§64 준용을 규정할 뿐.
- 무체재산권은 **§64에 명문 평가규정이 존재** → §65 아님.
- **정정안**:
  - 신규 상수 `INTANGIBLE_IP: "상증법 §64·상증령 §59⑤·상증규 §19②③④"` 추가 (무체재산권 전용).
  - 기존 `INTANGIBLE: "상증법 §65"`는 실제 용도가 `other`(기타재산) 분기의 lawRef(`property-valuation.ts` default case)이므로 → 명칭 의도에 맞게 `OTHER_PROPERTY: "상증법 §65③"`로 분리하거나, 최소변경 원칙상 주석을 "기타재산(§65③ 준용)"으로 교정. (surgical: 무체재산권 dispatch는 신규 상수를 쓰고, 기존 `other` 동작은 그대로 둔다.)

---

## 2. 평가 산식 (3-모드)

```
평가액(②장래이익) = Σ_{n=1}^{N}  floor( 각연도수입금액 × 10ⁿ / 11ⁿ )      ← 할인율 10% = 분수 11/10
  · N = 잔존연수 (아래 §3)
  · 각연도수입금액:
      [fixed]   미래 각 연도 수입금액 (확정)                       — §59⑤ 전단·규 §19②
      [avg3y]   floor( 직전 3년 수입금액 합계 ÷ 연수(≤3) )          — §59⑤ 후단·규 §19④ 전단
      [appraisal] Σ 환산하지 않고 감정가액을 평가액으로 직접 사용     — 규 §19④ 후단

§64 1호 비교 (선택): 매입한 무체재산권은 final = MAX( ②환산액, ①취득가액 − 법인세법상 감가상각비 )
```

> **균등수입 가정**: §59⑤은 "장래에 받을 각 연도의 수입금액"으로 연도별 상이를 허용하나, 집행기준·시행규칙 산식·교재 사례는 **매년 동일 수입금액**(= 연수입 × 연금현가계수) 기준. MVP는 균등수입으로 구현. 연도별 상이 입력은 **SCOPE_OUT**(후속).

> **정수연산 원칙**: 연금현가계수(부동소수)를 곱하지 않는다. 지상권과 동일하게 **BigInt 각 항 floor 누적**. 검증: 특허 사례 BigInt Σfloor = 106,550,336원, 간편법(×7.10335)=106,550,250원, 교재 천원표시 106,550천원 — 셋 다 **천원 단위로 일치**(원 단위 차이는 천원절사로 흡수).

---

## 3. 존속기간 · 잔존연수 · 20년 한도

### 3-1. 무체재산권별 법정 존속기간 (이미지 7 표)

| 권리 | 근거 법령 | 기산점 | 존속기간 | 경계 분기 |
|---|---|---|---|---|
| 특허권 | 특허법 §88① | 특허**출원일** | + 20년 | — |
| 실용신안권 | 실용신안법 §22① | 실용신안등록**출원일** | + 10년 | — |
| 상표권 | 상표법 §42① | **설정등록일** | + 10년 | (갱신 SCOPE_OUT — 최근 갱신일을 등록일로 입력) |
| 디자인권 | 디자인보호법 **§91①** (현행·KoreanLaw MST 277191 검증) | 디자인등록**출원일** | **+ 20년** (설정등록일에 발생, 출원일 기산) | 구법(출원 < 2014.7.1) 15년·설정등록일 기산 = **SCOPE_OUT** |
| 저작권 | 저작권법 **§39①** (현행·KoreanLaw MST 283335 검증) | 저작자 **사망일** (공동저작물 = 최후 사망자, §39②) | **+ 70년** | 2013.7.1 이전 이미 소멸분(구 50년) 경과조치 = **SCOPE_OUT**(본칙 70년 보수 적용) |

### 3-2. 잔존연수 산식 (상증칙 §19③)

```
존속만료일 = 기산일(출원일/등록일/사망일) + 법정존속연수
잔존연수(raw) = differenceInYears(존속만료일, 평가기준일)        ← date-fns floor
잔존연수 N    = min( max(잔존연수raw, 0), 20 )                   ← 20년 한도
```

> ⚠️ **지상권과 절상 방향 반대**: 지상권 `resolveSuperficiesTenureYears`는 잔존을 **절상**(`+1 if remainder`). 무체재산권은 상증칙 §19③("존속기간 − 경과연수")상 **floor**(= 경과연수 절상). 지상권 코드 복붙 시 이 차이를 반드시 가드(아래 anchor로 회귀 검증).

**교재 특허 사례 재현**: 출원 2015.7.1 + 20년 = 만료 2035.7.1. 평가 2022.6.30. `differenceInYears(2035-07-01, 2022-06-30)` = 13(13.003년 floor). min(13,20)=**13** ✓ (교재 "20−7=13"과 동치: floor(20−경과)=20−ceil(경과)).

---

## 4. 케이스 매트릭스 (전수 enumerate)

| # | 권리 | 수입모드 | 시나리오 | 기대 동작 |
|---|---|---|---|---|
| C1 | 특허 | fixed | 출원2015.7.1·평가2022.6.30·연15,000천원 | N=13 → **106,550,336원** (anchor) |
| C2 | 특허 | fixed | 잔존 > 20 (출원 직후 평가) | N=20 cap → 127,703,445원 |
| C3 | 특허 | fixed | 평가일 ≥ 만료일 | N=0 → 평가액 0 |
| C4 | 실용신안 | fixed | 출원+10년 | 만료 = 출원+10 |
| C5 | 상표 | fixed | 설정등록+10년 | 만료 = 등록+10 |
| C6 | 디자인 | fixed | 출원 2010 (구법 < 2014.7.1) | **SCOPE_OUT** (구법 15년·설정등록일 기산) |
| C7 | 디자인 | fixed | 출원 2015·평가 2022 | 출원+20년 → 만료 2035, N=13 |
| C8 | 저작권 | fixed | 사망 = 상속개시일 | 사망+70년 → N=20 cap (상시) |
| C9 | 저작권 | fixed | 2차 상속·과거 사망 | 사망+70년(현행 §39①) → 잔존 도출 (2013.7.1 이전 소멸분 SCOPE_OUT) |
| C10 | 임의 | avg3y | 직전3년 합계 / 3 | income=floor(합계÷3) |
| C11 | 임의 | avg3y | 직전 2년만 존재 | income=floor(합계÷2) (3 미달 = 실연수) |
| C12 | 저작권 | appraisal | 수입 하락 명백 | 감정가액 직접(Σ 미적용) |
| C13 | 임의 | appraisal | 최근 3년 수입 0 | 감정가액 직접 |
| C14 | 매입특허 | fixed | §64 1호 > ②환산 | MAX → 취득가액−감가상각 채택, method="acquisition_cost" |
| C14b | 매입특허 | fixed | §64 1호 < ②환산 | ②환산 채택 (MAX 양방향 검증) |
| C15 | 임의 | any | 잔존연수 override 입력 | 자동도출 무시 → clamp(trunc, 0~20) |

---

## 5. anchor (Pre-Do 우선 작성 — `pre-do-anchor-verification`)

신규 테스트 `__tests__/tax-engine/property-valuation/intangible-ip-64-59-5.test.ts` (superficies-61-3.test.ts 미러):

```ts
// IP-1 (교재 특허 사례, 집행기준 64-59-4)
evaluateIntangibleIp(ip({ intangibleIpType:"patent",
  intangibleAnnualIncome:15_000_000, intangibleRemainingYears:13 }))
  .valuatedAmount === 106_550_336              // 천원절사 시 106,550천원 = 교재 일치

// IP-2 20년 한도
evaluateIntangibleIp(ip({ ...연15,000,000, intangibleRemainingYears:20 }))
  .valuatedAmount === 127_703_445
// IP-3 잔존 0 → 0
// IP-4 avg3y: 직전3년 합계 45,000,000 / 3 → income 15,000,000 → N=13 → 106,550,336
// IP-5 appraisal: 감정가액 그대로

// 잔존연수 도출 (resolveIntangibleRemainingYears)
// IP-T1 특허 출원2015.7.1·평가2022.6.30 → 13
// IP-T2 디자인 출원2015 → 출원+20년 만료2035 (현행 §91①). 구법(출원<2014.7.1) SCOPE_OUT
// IP-T3 저작권 사망2000 → 사망+70년 만료2070 → 평가2022 잔존48 → 20 cap (현행 §39①)
// IP-T4 잔존 30년 → 20 cap
// IP-T5 override=25 → 20 cap / override=0 → 0 (자동도출 무시, clamp)
```

> anchor를 **Do 진입 전 먼저 작성·실행해 RED 확보** → 산식·잔존연수 방향(floor vs 절상) 오류를 구현 전에 잡는다.

---

## 6. 타입 설계 (`types/inheritance-gift-estate.types.ts`)

```ts
// (1) AssetCategory enum — :46 "superficies" 다음에 추가
| "intangible_ip"   // 무체재산권 — 특허·실용신안·상표·디자인·저작권 (상증법 §64·령§59⑤·규§19)

// (2) 신규 enum (SuperficiesStructureType 패턴, :50)
export type IntangibleIpType =
  | "patent" | "utility_model" | "trademark" | "design" | "copyright";
export type IntangibleIncomeMode = "fixed" | "avg3y" | "appraisal";

// (3) EstateItem 필드 (모두 optional — superficies 8필드 :209~229 패턴)
intangibleIpType?: IntangibleIpType;
intangibleIncomeMode?: IntangibleIncomeMode;
intangibleAnnualIncome?: number;          // fixed — 미래 각 연도 수입(균등)
intangiblePrior3yIncomeTotal?: number;    // avg3y — 직전 3년 수입 합계
intangiblePrior3yYears?: number;          // avg3y — 실제 연수(1~3)
intangibleAppraisedValue?: number;        // appraisal — 감정가액
intangibleOriginDate?: Date | string;     // 출원일/설정등록일 (특허·실용·상표·디자인)
intangibleAuthorDeathDate?: Date | string;// 저작권 — 저작자 사망일
intangibleAcquisitionCost?: number;       // §64 1호 — 취득가액−감가상각(선택, MAX 비교)
intangibleRemainingYearsOverride?: number;// 잔존연수 사용자 오버라이드(정수)
intangibleRemainingYears?: number;        // 엔진 소비용 합성값 (lib/calc 주입, §3-2)
```

---

## 7. 엔진 설계 (`property-valuation.ts` — 지상권 :54~131 미러)

```ts
// 존속기간 도출 — 권리별 분기 (경계 포함)
function resolveIntangibleDurationYears(type, originDate?, authorDeathDate?): {기산일, 연수} {
  patent: [출원일, 20], utility_model: [출원일, 10], trademark: [등록일, 10],
  design: [출원일, 20],     // 현행 디자인보호법 §91① — 출원일+20년 (구법 15년 SCOPE_OUT)
  copyright: [사망일, 70],   // 현행 저작권법 §39① — 사망+70년 (구 50년 경과조치 SCOPE_OUT)
}

// 잔존연수 — 엔진 단일진실 (UI useMemo·lib/calc inject·validate 공용 import; dual-truth 금지)
export function resolveIntangibleRemainingYears(p:{
  type; originDate?; authorDeathDate?; override?; valuationDate: Date;
}): number {
  if (override != null) return clamp(trunc(override), 0, 20);
  const { 기산일, 연수 } = resolveIntangibleDurationYears(...);
  if (!기산일) return 0;                                  // 미입력
  const 만료 = addYears(기산일, 연수);
  if (만료 <= valuationDate) return 0;
  return Math.min(differenceInYears(만료, valuationDate), 20);   // floor + 20년 한도
}

// 평가 — BigInt Σ floor(income × 10ⁿ/11ⁿ) (지상권 evaluateSuperficies 복제)
export function evaluateIntangibleIp(item: EstateItem): PropertyValuationResult {
  if (item.category !== "intangible_ip") throw TaxCalculationError(...);
  if (item.intangibleIncomeMode === "appraisal")
    return { ..., method:"appraisal", valuatedAmount: item.intangibleAppraisedValue ?? 0,
             breakdown:[{ label:"감정가액(상증규 §19④ 후단)", ... }] };

  // 모드는 validate가 필수화(미선택 차단) — 엔진은 명시 분기, silent fallback 금지
  let income = 0;
  if (item.intangibleIncomeMode === "avg3y")
    // prior3yYears는 validate 필수(≥1) — `?? 3` 자동 안분 금지 (no_silent_apportion_fallback)
    income = Math.floor((item.intangiblePrior3yIncomeTotal ?? 0) / (item.intangiblePrior3yYears ?? 1));
  else if (item.intangibleIncomeMode === "fixed")
    income = item.intangibleAnnualIncome ?? 0;
  const years = Math.max(0, Math.min(20, Math.trunc(item.intangibleRemainingYears ?? 0)));

  let sum=0n, num=1n, den=1n; const inc=BigInt(income);
  for (let n=1; n<=years; n++){ num*=10n; den*=11n; sum += inc*num/den; }   // 각 항 BigInt floor
  let valuatedAmount = Number(sum);

  // §64 1호 MAX 비교 (선택 입력 시) — 양방향, method 라벨 일치(모순 수정)
  const byCost = item.intangibleAcquisitionCost ?? 0;
  const method = byCost > valuatedAmount ? "acquisition_cost" : "standard_price";
  valuatedAmount = Math.max(valuatedAmount, byCost);

  return { estateItemId:item.id, method, valuatedAmount,
    breakdown:[
      { label:`각 연도 수입금액 (${모드라벨})`, amount:income, lawRef:VALUATION.INTANGIBLE_IP },
      { label:`잔존연수 ${years}년(20년 한도) · 할인율 10% 현가환산 합계`, amount:Number(sum), lawRef:VALUATION.INTANGIBLE_IP }, // ← 환산합계는 Number(sum)(byCost 아님). §64 1호 MAX 승리 시 별도 항목으로 표기
      { label:"평가액", amount:valuatedAmount },
    ],
    warnings:["무체재산권 보충적 평가 — 수입금액·존속기간·감정 여부 확인 권장"] };
}

// dispatch — :555 switch에 case 추가
case "intangible_ip": return evaluateIntangibleIp(item);
```

> `differenceInYears`·`addYears`는 지상권이 이미 import. `safeMultiply`/floor 동일. **800줄 정책**: `property-valuation.ts`가 한계 근접 시 무체재산권 로직을 `property-valuation/intangible-ip.ts`로 분리(영업권 `goodwill.ts` 선례).

---

## 8. 동기화 지점 체크리스트 (`superficies` 전수 grep 기반 — 무체재산권 대응)

> `superficies`가 박힌 **21개 위치 = 무체재산권이 동기화해야 할 지도**. 누락 시 침묵 strip/카테고리 미표시.

### 엔진 코어
| # | 파일:line | 지상권 | 무체재산권 추가 |
|---|---|---|---|
| ① | `types/inheritance-gift-estate.types.ts:46` | AssetCategory `superficies` | `intangible_ip` 멤버 |
| ② | `…estate.types.ts:50-54` | `SuperficiesStructureType` | `IntangibleIpType`·`IntangibleIncomeMode` 신규 |
| ③ | `…estate.types.ts:209-229` | superficies 8필드 | intangible 11필드 (§6) |
| ④ | `types/inheritance-gift.types.ts:27` | re-export | 신규 enum re-export |
| ⑤ | `property-valuation.ts:54-131` | 상수·resolve·evaluate | `resolveIntangibleRemainingYears`·`evaluateIntangibleIp` |
| ⑥ | `property-valuation.ts:555` | dispatch case | `case "intangible_ip"` |
| ⑦ | `legal-codes/inheritance-gift.ts:278,280` | SUPERFICIES 상수 | `INTANGIBLE_IP` 신규 + §65→§64 정정 |
| ⑧ | `inheritance-asset-category.ts:24` | `superficies:"realEstate"` 그룹 | `intangible_ip:"other"` 그룹 |

### lib/calc (변환·합성·정책)
| # | 파일:line | 추가 |
|---|---|---|
| ⑨ | `lib/calc/estate-item-valuation.ts:35-62` | `injectIntangibleRemainingYears` 신규 |
| ⑩ | `…estate-item-valuation.ts:88-94` | `computeEffectiveValuation`에 `intangible_ip` 분기 |
| ⑪ | `lib/calc/gift-api.ts:50` | inject 호출(증여) |
| ⑫ | `components/calc/InheritanceTaxForm.tsx:426` | inject 호출(상속) + import :52 |
| ⑬ | `lib/calc/deemed-category-policy.ts:28-37` | `INHERITANCE_CATEGORIES`·`GIFT_CATEGORIES` 배열 + `DEEMED_ALLOWED_CATEGORIES`에 추가 (폼 노출 게이트 — **非exhaustive 배열, TS 미감지** → 누락 시 폼 드롭다운 미표시) |
| ⑭ | `lib/calc/asset-toggle-visibility.ts:101,221` | 토글 노출 정책 + `hidden_permanent` |
| ⑮ | `lib/calc/besshi-buppyo-2-data.ts:53` | 부표2 코드/라벨 |
| ⑯ | `lib/calc/deduction-besshi-data.ts:252` | 공제 부표 라벨 |

### Validation
| # | 파일:line | 추가 |
|---|---|---|
| ⑰ | `lib/validators/estate-item-schema.ts:311-330` | `intangibleIpItemSchema` 신규 — **11필드 전부 1:1 Zod 선언**(합성 `intangibleRemainingYears: z.number().int().nonnegative().optional()` 포함 — superficies :323 패턴, 누락 시 ⑫ 침묵 strip→엔진 0평가). 날짜 `z.union([z.string(),z.date()])`. **superRefine 분기표**: fixed→annualIncome / avg3y→prior3yIncomeTotal+prior3yYears(≥1) / appraisal→appraisedValue / (patent·utility·trademark·design)→originDate / copyright→authorDeathDate / override 있으면 날짜 면제 |
| ⑱ | `…estate-item-schema.ts:347` | discriminatedUnion에 등록 — **누락 시 全 intangible 항목 validate 하드 실패(loud)** |
| ⑲ | `…estate-item-schema.ts:353` | `COORD_INCOMPATIBLE`에 `intangible_ip` (영향 경미 — UI 좌표필드 없어 미차단만) |

### UI
| # | 파일:line | 추가 |
|---|---|---|
| ⑳ | `…variants/EstateBodyIntangibleIp.tsx` | **신규 파일** (EstateBodySuperficies 미러). 권리종류·수입모드=`RadioCardGroup`(3-state, **옵션별 testId**)·원금액=`CurrencyInput`·연수=`DecimalInput`·날짜=`DateInput`(**testid 래퍼 div**). testid 10종·가시성·parseISO는 UI 설계서 §2~§5 단일출처 |
| ㉑ | `…variants/index.ts:12,16,33-34` | export + `pickBodyVariant` case. ⚠️ `pickBodyVariant`는 `assertNever` TS-guard지만 **사용처 0(dead)** — 안전망으로 신뢰 금지 |
| ㉒ | `components/calc/EstateItemEditor.tsx:24,55-56` | import + **실 dispatch `VariantBody` case** (`category as` 캐스트·default 없음 → case 누락 시 **silent blank 빈 화면**, TS 미감지). 반드시 추가 |
| ㉓ | `…estate-card/estate-category-meta.ts:23,34,45` | 라벨 "무체재산권"·아이콘(예 💡)·정렬순서 |
| ㉔ | `…estate-card/CategoryChangeDialog.tsx:41,52,62` | 라벨·목록 |
| ㉕ | `components/calc/results/InheritanceTaxResultView.types.ts:30` | 결과 라벨 |
| ㉖ | `components/calc/results/inheritance-filing-form-helpers.ts:130` | 부표2 코드 (지상권=12 기타재산 fallback과 동일 검토 — 무체재산권 별지 코드 확인) |

### 테스트
| # | 파일 | 추가 |
|---|---|---|
| ㉗ | `__tests__/tax-engine/property-valuation/intangible-ip-64-59-5.test.ts` | **신규** anchor (§5) |
| ㉘ | `__tests__/lib/calc/deemed-category-policy.test.ts:15-18` | `intangible_ip` 포함 검증 |

> **TS 가드 여부 분류 (검토 실측)**:
> - **Record(exhaustive · TS-guard)** — 멤버 추가 시 컴파일러가 누락 catch: ①~③ 타입·⑧·⑭⑮⑯·㉓ `CATEGORY_LABELS/ICONS`(Record)·㉕·㉖.
> - **🔴 非exhaustive 배열·`as` 캐스트 (TS 미감지 — grep 수동 추가 필수)**: ⑬ `INHERITANCE_CATEGORIES`(:28-37)·㉓ `GIFT_CATEGORIES`(:45)·㉔ `CategoryChangeDialog` 배열 2곳(:52,62)·**㉒ `VariantBody`(실 dispatch, silent blank)**. 누락 시 폼 드롭다운 미표시 또는 입력 빈 화면 — TS 침묵.
> - **dead(무시)**: ㉑ `pickBodyVariant`(assertNever TS-guard지만 사용처 0).

---

## 9. Phase 분할 (구현 순서)

1. **P0 — 법령 상수 + 인용 정정**: `legal-codes` `INTANGIBLE_IP` 추가, §65→§64 정정. (단독 커밋)
2. **P1 — 타입**: AssetCategory·신규 enum·EstateItem 필드(①~④).
3. **P2 — 엔진 + anchor RED→GREEN**: `resolveIntangibleRemainingYears`·`evaluateIntangibleIp`·dispatch(⑤⑥⑧) + 테스트(㉗) 먼저 RED 확보 후 GREEN.
4. **P3 — lib/calc 변환·validate**: inject·effective·정책·schema(⑨~⑲) + deemed 테스트(㉘).
5. **P4 — UI**: EstateBodyIntangibleIp 신규·메타·dispatch·결과뷰(⑳~㉖).
6. **P5 — E2E + 통합 anchor**: Playwright spec(`e2e/`) 폼→계산→결과 + 사이드바 합계 반영 확인.

> 각 Phase 후 `npx tsc --noEmit` 0건 + 해당 vitest 통과 게이트.

---

## 10. 정책 준수 체크 (메모리 사전 적용)

- **정수연산**: 연금현가계수 부동소수 곱 금지 → BigInt Σ floor (`feedback_safemul_decimal_apportion_precision`, `applyrate` 정책). 천원절사 비교 시 1원 tolerance.
- **mirror-pattern**: 잔존연수는 `useEffect→store` 미러링 금지. UI useMemo derive + override 필드 + lib/calc inject **3중**, 엔진 단일진실 import (`feedback_ui_engine_dual_truth_avoidance`, `single-source-engine-helper`).
- **자동 안분/fallback 금지**: 수입모드 미선택·기산일 미입력은 **validate 차단**(0 평가 후 통과 금지). UI 통과↔validate 모순 금지(`feedback_validation_sync_8th_point`).
- **enum 검증 후 매핑**: `Record<AssetCategory,…>` exhaustive 타입으로 누락 컴파일 가드(`enum-verification-before-mapping`).
- **법령 정확성 최우선**: 납세자 유·불리 표현 금지. 조문 상수만 사용(리터럴 금지).
- **800줄 정책**: 엔진/스키마 한계 근접 시 분리(`property-valuation/intangible-ip.ts`).
- **결과 산식 한국어 풀어쓰기**: `floor()`·변수약어 금지.

---

## 11. SCOPE_OUT (이번 범위 제외 — 명시)

- 연도별 **상이한** 미래 수입금액(균등수입만 구현).
- 상표권 **갱신**(존속기간 무한 연장) 자동 반영 — 최근 갱신일을 등록일로 입력하여 우회.
- 저작권 **2013.7.1 이전 이미 소멸**분의 구 50년 경과조치 — 현행 본칙 70년으로 보수 적용(저작권법 §39①). 사망=상속개시일이면 70년→항상 20년 cap이라 실무 영향 미미(2차 상속·과거 사망 저작권에 국한).
- 구 **디자인권**(출원 < 2014.7.1, 설정등록일 기산 15년) — 현행 출원일+20년만 구현(디자인보호법 §91①). 구법은 별도 설정등록일 필드 필요 → 후속.
- §64 1호 **법인세법상 감가상각비 자동 계산** — 사용자가 (취득가액−감가상각) 결과치를 직접 입력(MAX 비교만).
- 광업권·채석권(§59⑥·규 §19⑤), 어업권·양식업권(§59④, 영업권 포함) — 별건.
- 평가심의위원회·DCF 등 §54⑥ 대체평가.

---

## 12. 미해결 질문 (Do 착수 전 확인)

1. **권리 세분 수준**: `intangible_ip` 단일 카테고리 + `IntangibleIpType` 서브타입(권장) vs 권리별 5개 카테고리? → 단일 카테고리가 Record 동기화 부담 최소 (권장).
2. **별지 부표2 코드**(㉖): 무체재산권 전용 코드 존재 여부 — 미존재 시 지상권처럼 "12 기타재산" fallback. (KoreanLaw/서식 확인 필요.)
3. **§64 1호 비교**를 MVP에 포함할지 — 매입 무체재산권 빈도 낮음. 선택 입력으로 두되 UI 노출은 P4에서 결정.
4. **저작권 기산점**: 상속 평가에서 피상속인이 곧 저작자인 경우 사망일 = 상속개시일 → 존속 70년 → 항상 20년 cap. UI에서 사망일 기본값을 평가기준일로 제안할지.
