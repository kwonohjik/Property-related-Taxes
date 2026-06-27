# 무체재산권 평가 — 엔진/데이터 설계서

> 계획서: [`docs/00-pm/inheritance-gift-intangible-ip-valuation.plan.md`](../../00-pm/inheritance-gift-intangible-ip-valuation.plan.md)
> 대상: 상속·증여세 공용 EstateItem 평가 · 근거 상증법 §64·령 §59⑤·규 §19②③④ (KoreanLaw 검증)
> 패턴 원본: 지상권 `evaluateSuperficies`(`lib/tax-engine/property-valuation.ts:91-131`)

## 1. 범위

- 무체재산권 전용 카테고리 `intangible_ip` 신설 + 권리종류 5종·수입모드 3종.
- 정기금 10% 현가환산(BigInt Σfloor) + 잔존연수 20년 한도.
- SCOPE_OUT: 연도별 상이 수입·상표갱신·구 디자인(15년)·저작권 2013.7.1 이전 소멸분(50년)·§64 1호 감가상각 자동계산·광업권/어업권·평가심의위.

## 2. Input 타입 (EstateItem 확장 — `types/inheritance-gift-estate.types.ts`)

```ts
export type IntangibleIpType = "patent" | "utility_model" | "trademark" | "design" | "copyright";
export type IntangibleIncomeMode = "fixed" | "avg3y" | "appraisal";

// EstateItem 신규 11필드 (모두 optional — discriminated by category==="intangible_ip")
intangibleIpType?: IntangibleIpType;
intangibleIncomeMode?: IntangibleIncomeMode;
intangibleAnnualIncome?: number;           // fixed: 미래 각 연도 수입(균등)
intangiblePrior3yIncomeTotal?: number;     // avg3y: 직전 3년 수입 합계
intangiblePrior3yYears?: number;           // avg3y: 실제 연수(1~3) — validate 필수, 자동 ÷3 금지
intangibleAppraisedValue?: number;         // appraisal: 감정가액(규 §19④ 후단)
intangibleOriginDate?: Date | string;      // 출원일(특허·실용·디자인)/설정등록일(상표)
intangibleAuthorDeathDate?: Date | string; // copyright: 저작자 사망일(공동=최후 사망자)
intangibleAcquisitionCost?: number;        // §64 1호: 취득가액−감가상각(선택, MAX 비교)
intangibleRemainingYearsOverride?: number; // 잔존연수 override(정수)
intangibleRemainingYears?: number;         // 엔진 소비 합성값(lib/calc inject) — Zod에도 선언(strip 방지)
```

## 3. 케이스 인벤토리 (입력 → 기대 결과)

| ID | 권리 | 모드 | 입력 | 잔존N | 기대 평가액 |
|---|---|---|---|---|---|
| IP-1 | patent | fixed | 출원2015.7.1·평가2022.6.30·연15,000,000 | 13 | **106,550,336** (anchor·교재 106,550천원) |
| IP-2 | patent | fixed | 잔존 ≥ 20 (연15,000,000) | 20 | **127,703,445** |
| IP-3 | patent | fixed | 평가일 ≥ 만료일 | 0 | 0 |
| IP-4 | utility | fixed | 출원+10년 | 만료=출원+10 | Σfloor |
| IP-5 | trademark | fixed | 설정등록+10년 | 만료=등록+10 | Σfloor |
| IP-6 | design | fixed | 출원2015 | 출원+20년→만료2035 | Σfloor (현행 §91①) |
| IP-7 | copyright | fixed | 사망=상속개시일 | 20 cap | Σfloor(20) |
| IP-8 | copyright | fixed | 2차상속·사망2000·평가2022 | 48→20 cap | Σfloor(20) |
| IP-9 | any | avg3y | 직전3년 합계45,000,000·연수3 | 13 | income=15,000,000→106,550,336 |
| IP-10 | any | avg3y | 직전2년만(합계30,000,000·연수2) | — | income=floor(30,000,000/2) |
| IP-11 | copyright | appraisal | 수입 하락 명백 | — | 감정가액 직접(Σ 미적용) |
| IP-12 | any | appraisal | 최근3년 수입 0 | — | 감정가액 직접 |
| IP-13 | patent(매입) | fixed | §64 1호 > ②환산 | — | byCost 채택·method=acquisition_cost |
| IP-14 | patent(매입) | fixed | §64 1호 < ②환산 | — | ②환산 채택 |
| IP-15 | any | — | override=25 / 0 | 20 / 0 | clamp(0~20) |

## 4. 알고리즘

### 4-1. 존속기간 (권리별 — 현행법, KoreanLaw 검증)

```ts
function resolveIntangibleDurationYears(item): { 기산일?: Date; 연수: number } {
  switch (item.intangibleIpType) {
    case "patent":        return { 기산일: originDate, 연수: 20 }; // 특허법 §88①
    case "utility_model": return { 기산일: originDate, 연수: 10 }; // 실용신안법 §22①
    case "trademark":     return { 기산일: originDate, 연수: 10 }; // 상표법 §42①(등록일)
    case "design":        return { 기산일: originDate, 연수: 20 }; // 디자인보호법 §91① (구법 15년 SCOPE_OUT)
    case "copyright":     return { 기산일: authorDeathDate, 연수: 70 }; // 저작권법 §39① (구 50년 SCOPE_OUT)
  }
}
```

### 4-2. 잔존연수 — 엔진 단일진실 (UI useMemo·lib/calc inject·validate 공용 import)

```ts
export function resolveIntangibleRemainingYears(p): number {
  if (p.override != null) return clamp(Math.trunc(p.override), 0, 20);   // IP-15
  const { 기산일, 연수 } = resolveIntangibleDurationYears(p);
  if (!기산일) return 0;                                                  // 미입력 → validate 차단
  const 만료 = addYears(기산일, 연수);
  if (만료 <= p.valuationDate) return 0;                                  // IP-3
  return Math.min(differenceInYears(만료, p.valuationDate), 20);          // floor + 20년 한도(규 §19③)
}
```

> ⚠️ **지상권과 절상 방향 반대**: 지상권은 잔존 절상(`+1 if remainder`), 무체재산권은 `differenceInYears` **floor**(= 경과연수 절상, 규 §19③). 교재 사례(출원2015.7.1·평가2022.6.30 → differenceInYears(2035-07-01,2022-06-30)=13)로 회귀 가드.

### 4-3. 평가 (BigInt Σfloor — `evaluateSuperficies` 미러)

```ts
export function evaluateIntangibleIp(item: EstateItem): PropertyValuationResult {
  if (item.category !== "intangible_ip") throw TaxCalculationError(INVALID_INPUT, ...);

  // appraisal: Σ 미적용, 감정가액(규 §19④ 후단=§64 2호 하위). §64 1호 취득가액과 MAX(법 §64 본문 "큰 금액").
  if (item.intangibleIncomeMode === "appraisal") {
    const valA = Math.max(item.intangibleAppraisedValue ?? 0, item.intangibleAcquisitionCost ?? 0);
    const methodA = (item.intangibleAcquisitionCost ?? 0) > (item.intangibleAppraisedValue ?? 0) ? "acquisition_cost" : "appraisal";
    return { estateItemId:item.id, method: methodA, valuatedAmount: valA,
      breakdown:[ 감정가액 + (byCost MAX 시 §64 1호 항목) + 평가액 ],
      warnings:["감정가액 — 2 이상 공신력 감정기관·전문가 평가 확인"] };
  }
  // (IP-11b anchor: appraisal 90M + byCost 100M → 100M·acquisition_cost)

  // 각 연도 수입금액 (명시 분기 — silent fallback 금지)
  let income = 0;
  if (item.intangibleIncomeMode === "avg3y")
    income = Math.floor((item.intangiblePrior3yIncomeTotal ?? 0) / (item.intangiblePrior3yYears ?? 1));
  else if (item.intangibleIncomeMode === "fixed")
    income = item.intangibleAnnualIncome ?? 0;

  const years = Math.max(0, Math.min(20, Math.trunc(item.intangibleRemainingYears ?? 0)));

  // Σ floor(income × 10ⁿ / 11ⁿ) — 할인율 10% = 분수 11/10, 각 항 BigInt floor
  let sum=0n, num=1n, den=1n; const inc=BigInt(income);
  for (let n=1; n<=years; n++){ num*=10n; den*=11n; sum += inc*num/den; }
  let valuatedAmount = Number(sum);

  // §64 1호 MAX (양방향) — method 라벨 일치
  const byCost = item.intangibleAcquisitionCost ?? 0;
  const method = byCost > valuatedAmount ? "acquisition_cost" : "standard_price";
  valuatedAmount = Math.max(valuatedAmount, byCost);

  return { estateItemId:item.id, method, valuatedAmount,
    breakdown:[
      { label:`각 연도 수입금액 (${모드라벨})`, amount:income, lawRef:VALUATION.INTANGIBLE_IP },
      { label:`잔존연수 ${years}년(20년 한도) · 할인율 10% 현가환산 합계`, amount:Number(sum), lawRef:VALUATION.INTANGIBLE_IP },
      ...(method==="acquisition_cost" ? [{ label:"§64 1호 취득가액−감가상각(MAX 채택)", amount:byCost, lawRef:VALUATION.INTANGIBLE_IP }] : []),
      { label:"평가액", amount:valuatedAmount },
    ],
    warnings:["무체재산권 보충적 평가 — 수입금액·존속기간·감정 여부 확인 권장"] };
}
```

## 5. 정수연산 디테일

- `Math.round()` 금지 / 부동소수 누적 금지. 연금현가계수 곱 대신 BigInt 각 항 floor.
- 검증: `node` BigInt Σfloor(15,000,000, 13)=106,550,336 / (·,20)=127,703,445 (계획서 실측 일치).
- 천원 단위 신고서 표시 시 `truncateToThousand` → 106,550천원 (교재 일치).

## 6. 엔진 동기화 지점

| 지점 | 파일 | 작업 |
|---|---|---|
| 상수 | `legal-codes/inheritance-gift.ts:278,280` | `INTANGIBLE_IP:"상증법 §64·령§59⑤·규§19②③④"` 신규 + 기존 `INTANGIBLE:"§65"`→`OTHER_PROPERTY:"§65③"` 주석교정(`other` 분기 전용, surgical) |
| 타입 | `types/inheritance-gift-estate.types.ts:46,50,209` | AssetCategory·enum 2종·EstateItem 11필드 |
| 엔진 | `property-valuation.ts:54,555` | resolve 2함수·evaluate·dispatch `case "intangible_ip"` |
| 그룹 | `inheritance-asset-category.ts:24` | `intangible_ip:"other"` 그룹 매핑 |

## 7. anchor 명세 (`__tests__/tax-engine/property-valuation/intangible-ip-64-59-5.test.ts`)

- evaluate: IP-1(106,550,336)·IP-2(127,703,445)·IP-3(0)·IP-9 avg3y·IP-11 appraisal·IP-13/14 §64 1호 양방향.
- resolveIntangibleRemainingYears: IP-T1 특허13·IP-T2 디자인 출원+20·IP-T3 저작권 20cap·IP-T4 30→20·IP-T5 override 25→20/0→0.
- **Pre-Do RED 우선**: IP-1·IP-T1 먼저 작성·실행해 산식·잔존연수 floor 방향 확정.
- **inject 우회 가드**: `intangibleRemainingYears` 미합성 raw item(API/테스트 우회 경로)이 silent 0평가되지 않도록 anchor 1건(remainingYears 없는 fixed item → 0 또는 명시) + Zod 필드 선언(⑰)으로 strip 방지.

## 8. 정책 준수

정수연산(BigInt)·dual-truth 회피(잔존연수 엔진 단일진실 import)·mirror-pattern(useMemo+override+inject 3중, store 미러링 0)·자동 안분 금지(avg3y `prior3yYears` validate 필수)·enum exhaustive Record 가드·법령 상수 리터럴 금지.
