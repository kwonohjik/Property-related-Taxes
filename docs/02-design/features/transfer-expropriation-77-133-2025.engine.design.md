# 비자발적 양도 감면(§77·§77의2·§77의3) + 종합한도(§133②) — 엔진 설계

> 계획서: [`docs/00-pm/transfer-expropriation-77-133-2025-amendment.plan.md`](../../00-pm/transfer-expropriation-77-133-2025-amendment.plan.md)
> UI 설계: `transfer-expropriation-77-133-2025.ui.design.md`
> 법령: KoreanLaw MCP 조특법 MST 280409(시행 2026-07-01) 원문 확정 + 2025.3.14 개정 해설 이미지

## Context

2025.3.14. 개정으로 §77 공익수용 감면율 인상(현금 10→15·채권 15→20·3년 30→35·5년 40→45%)과 §133② 비자발적 양도 감면 종합한도 상향(연 1억→2억·5년 2억→3억, §77·§77의2·§77의3 그룹)이 **2025.1.1. 이후 양도분부터** 소급 적용된다.

현행 코드는 (a) §77 감면율이 개정 전 값만, (b) §133 한도는 이미 2억/3억(연도분기 없이 pre-2025에도 과다), (c) §77의2·§77의3은 미구현이다. 본 설계는 세 조문을 완전 구현하고 한도를 양도연도 분기로 정정한다(방침 A).

---

## ★ 케이스 인벤토리 (행=anchor 약속)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| 1 | §77 현금 2026 양도 15% | §77·개정 | 개정 해설 표 | `public-expropriation-reduction.test.ts` | ☐ |
| 2 | §77 채권 무특약 2026 20% | §77 | 개정 해설 | 〃 | ☐ |
| 3 | §77 채권 3년 2026 35% / 5년 45% | §77 | 개정 해설 | 〃 | ☐ |
| 4 | §77 경계 양도 2025-01-01(NEW)/2024-12-31(CURRENT) | 부칙 적용례 | (P0 확정) | 〃 | ☐ |
| 5 | §77 pre-2025 한도 1억 캡 (양도 2023) | §133① | R77-7 갱신 | 〃 | ☐ |
| 6 | §77의3① 1호 40% (지정일 前 취득+거주) | §77의3①1 | 원문 | `gb-designated-land-reduction.test.ts` | ☐ |
| 7 | §77의3① 2호 25% (매수일−20년 前+거주) | §77의3①2 | 원문 | 〃 | ☐ |
| 8 | §77의3① 비적격 0% (지정 後 & 20년 이내) | §77의3① | 원문(반대해석) | 〃 | ☐ |
| 9 | §77의3① 1·2호 동시적격 → 40% 우선 | §77의3① | 유리적용 | 〃 | ☐ |
| 10 | §77의3② 해제토지 40%/25% + 1년(5년) 고시 게이트 | §77의3② | 원문 | 〃 | ☐ |
| 11 | §77의3③ 상속 = 피상속인 취득일 | §77의3③ | 원문 | 〃 | ☐ |
| 12 | §77의3 sunset 2028-12-31 경과(양도일) → 불가 | §77의3 | 원문 | 〃 | ☐ |
| 13 | §77의2 감면 모드 40% (대토보상액 안분) | §77의2① | 원문 | `replacement-land-reduction.test.ts` | ☐ |
| 14 | §77의2 과세이연 모드 (취득가액 승계) | §77의2① | 조특령(P0) | 〃 | ☐ |
| 15 | §77의2 추징 (현금전환·현물출자 + 이자상당가산액) | §77의2③ | 조특령(P0) | 〃 | ☐ |
| 16 | §77의2 sunset 2026-12-31(양도일) 경과 → 불가 | §77의2① | 원문 | 〃 | ☐ |
| 17 | §133② 다자산 그룹 합산 캡 (§77+§77의3 → 연 2억/5년 3억) | §133② | 원문 | `five-year-cumulative-*.test.ts` | ☐ |
| 18 | §133① 자경 그룹 연도불변 1억/2억 (회귀) | §133① | F-01/F-06 | 〃 | ☐ |

> anchor 출처 "(P0 확정)"·"(조특령 P0)" 행은 Do 착수 전 KoreanLaw로 시행령 원문 확인 후 수치 동결.

---

## 법령 근거 (KoreanLaw 원문 확정 · legal-codes 상수화)

**두 상수 namespace 모두 등록** (`legal-codes/transfer.ts`에 `TRANSFER.*`와 `TRANSFER_REDUCTION_ARTICLE.*` 병존 — 실측: metadata는 `TRANSFER_REDUCTION_ARTICLE.PUBLIC_EXPROPRIATION` 사용, 엔진 legalBasis는 `TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION`):
- 기존: `TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION="조특법 §77"`(:246) · `TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION_TRANSITIONAL="조특법 부칙 제53조"`(:248) · `TRANSFER_REDUCTION_ARTICLE.PUBLIC_EXPROPRIATION`
- ★신규 `TRANSFER.REDUCTION_REPLACEMENT_LAND` + `TRANSFER_REDUCTION_ARTICLE.REPLACEMENT_LAND = "조특법 §77의2"`
- ★신규 `TRANSFER.REDUCTION_GB_DESIGNATED_LAND` + `TRANSFER_REDUCTION_ARTICLE.GB_DESIGNATED_LAND = "조특법 §77의3"`
- ★신규 `TRANSFER.REDUCTION_OVERALL_LIMIT_INVOLUNTARY = "조특법 §133②"`

```
§77의2① 대토보상분 양도차익 → 양도세 40% 감면 또는 과세이연. 사업인정고시일 소급 2년 이전 취득, 2026.12.31 이전 양도.
§77의2③ 추징: 현금전환·현물출자 등 → 감면·이연세액 + 이자상당가산액.
§77의3①1 지정일 이전 취득 + 소재지 거주 → 40%. §77의3①2 매수(청구/협의)일−20년 이전 취득 + 거주 → 25%. (2028.12.31까지 양도)
§77의3② 해제토지 협의매수·수용 → 40%/25% (해제 1년[경제자유구역 5년] 내 사업인정고시 한정).
§77의3③ 상속 = 피상속인 취득일.
§133② §77·§77의2·§77의3 합계: 연간 2억(1호)·5년 3억(2호) 초과분 배제.
§133① §66~§69·§69의2~4·§70 등: 연간 1억·5년 2억. (미개정 — 연도불변)
```

---

## 타입 설계

### F1. §77 (`public-expropriation-reduction.ts`)

```ts
// 감면율: 3세트 (LEGACY 불변, CURRENT→CURRENT_2018, AMENDED_2025 신규)
PUBLIC_EXPROPRIATION_RATES = {
  CURRENT_2018: { cash:0.10, bond:0.15, bond3y:0.30, bond5y:0.40 },
  AMENDED_2025: { cash:0.15, bond:0.20, bond3y:0.35, bond5y:0.45 },  // ★
  LEGACY:       { cash:0.20, bond:0.25, bond3y:0.40, bond5y:0.50 },
}
// 율 선택 (양도일 우선)
function pickRateSet(transferDate, businessApprovalDate):
  if transferDate >= 2025-01-01 → AMENDED_2025
  else if approval <= 2015-12-31 && transferDate <= 2017-12-31 → LEGACY
  else → CURRENT_2018
// 연간 한도: 상수 → 연도함수
getInvoluntaryTransferLimits(year) → { annual: year>=2025?2억:1억, fiveYear: year>=2025?3억:2억 }
```
- `Result.rateSetApplied?: "current_2018" | "amended_2025" | "legacy"` echo 추가(결과 카드 배지용).
- `PUBLIC_EXPROPRIATION_ANNUAL_LIMIT` 상수 제거 → `getInvoluntaryTransferLimits(transferYear).annual`. (테스트 R77-7 갱신 §회귀)

### F2. §77의3 (`gb-designated-land-reduction.ts` 신규)

```ts
interface GbDesignatedLandInput {
  branch: "in_zone" | "released";          // ①항 구역내 / ②항 해제
  acquisitionDate: Date;                    // 상속 시 피상속인 취득일 주입(③)
  designationDate: Date;                    // 개발제한구역 지정일
  triggerDate: Date;                        // 매수청구/협의매수일(①) 또는 사업인정고시일(②)
  releasedDate?: Date;                      // ②항: 해제일
  freeEconZone?: boolean;                   // ②항: 경제자유구역 등 지정 → 5년
  residedFromAcqToTrigger: boolean;         // 취득~trigger 소재지 거주 요건
  transferDate: Date; transferIncome: number; basicDeduction: number; taxBase: number; calculatedTax: number;
}
interface GbDesignatedLandResult {
  isEligible: boolean; reductionRate: 0 | 0.25 | 0.40; appliedClause?: "1호"|"2호";
  reducibleIncome: number; rawReductionAmount: number; reductionAmount: number;
  cappedByAnnualLimit: boolean; appliedAnnualLimit: number;
  legalBasis: string; warnings: string[]; notEligibleReason?: string;
}
```
**율 결정 함수** `resolveGbRate(input)` (40% 우선 → 25% → 0%):
```
// ②항: 해제 게이트 선검사 — 미충족 시 즉시 0%
if branch=="released" && (triggerDate - releasedDate) > (freeEconZone ? 5년 : 1년) → 0%
if !residedFromAcqToTrigger → 0%                                 // 거주요건
if acquisitionDate < designationDate            → 0.40 (1호)     // 지정일 이전 취득 우선
else if acquisitionDate <= (triggerDate − 20년)  → 0.25 (2호)     // 매수/고시일−20년 이전
else                                             → 0            // 비적격
if transferDate > 2028-12-31                     → 0 (sunset, 양도일 기준)
```

### F3. §77의2 (`replacement-land-reduction.ts` 신규)

```ts
interface ReplacementLandInput {
  mode: "reduction" | "deferral";           // 40% 감면 / 과세이연
  cashCompensation: number;                 // 현금보상
  replacementLandComp: number;              // 대토보상(토지)
  businessApprovalDate: Date; acquisitionDate: Date; transferDate: Date;
  calculatedTax: number; transferIncome: number; basicDeduction: number; taxBase: number;
  // deferral 모드: 승계취득가액 등 후속 정산 필드 (P3b — 조특령 확인 후 확정)
}
// ⚠️ 이연 모드 범위: 과세이연은 대토(replacement land)의 취득가액을 승계하고 실제 정산은
//   **대토를 나중에 양도하는 별개 양도시점**에 발생. 본 단건 계산기에서는 (a) 이연세액 산출,
//   (b) 승계취득가액 기준만 기록·표시. 대토 후속 양도 정산은 별도 시나리오(P3b) — 단건 감면세액=0.
interface ReplacementLandResult {
  isEligible: boolean; mode: "reduction"|"deferral";
  replacementRatio: number;                 // 대토보상 / (현금+대토보상)
  reducibleIncome: number;                  // 대토보상분 소득 × 40% (감면 모드)
  rawReductionAmount: number; reductionAmount: number; deferredTax?: number;
  cappedByAnnualLimit: boolean; recaptureNote?: string;   // §77의2③ 추징 안내
  legalBasis: string; warnings: string[]; notEligibleReason?: string;
}
```

### §133 그룹 (`aggregate-reduction-limits.ts`)

```ts
buildLimitGroups(transferYear): LimitGroup[] = [
  { types:[self_farming...], annual:1억, fiveYear:2억, legalBasis:"조특법 §133①" },   // 연도불변
  { types:["public_expropriation","gb_designated_land","replacement_land_comp"],
    annual: L.annual, fiveYear: L.fiveYear, legalBasis:"조특법 §133②" },              // L=getInvoluntaryTransferLimits(year)
]
// applyAnnualLimits/applyFiveYearLimits는 groups 인자 필수화 → 호출부(finalize STEP8.5)가 buildLimitGroups(transferYear) 주입
```

---

## 알고리즘 (공통 감면 산식)

세 조문 모두 §77 골격 재사용:
```
감면대상소득 = Σ (보상분 소득_i − 배정 기본공제_i) × 감면율_i       // §77의3·§77의2는 단일 율
raw = safeMultiplyThenDivide(산출세액, 감면대상소득, 과세표준)         // floor
개별 상한 = min(raw, getInvoluntaryTransferLimits(year).annual, 산출세액)  // 단건 보수 상한
candidates.push({amount, type})                                       // §127⑦ max 선택
→ finalize STEP8.5: applyAnnualLimits + applyFiveYearLimits (그룹 합산 = 권위 한도)
```
- 기본공제 §103② 배정(감면율 낮은 자산 우선)은 §77 기존 로직 재사용.
- §77의2 이연 모드: 감면세액=0, `deferredTax` 산출 + 취득가액 승계(P3b, 조특령 §79의2 확인).

---

## 14 동기화 지점 (엔진 측 진입점)

| 지점 | 대상 |
|---|---|
| ⑫ Zod | `lib/api/transfer-tax-schema-reductions.ts` — gb_designated_land·replacement_land_comp discriminated 추가 |
| ⑭ Route | `app/api/calc/transfer/route-reductions-mapper.ts` — Date 변환(designationDate·triggerDate·releasedDate 등) |
| 엔진 input | `transfer-tax-reductions-calc.ts` R-5 뒤에 R-6(§77의3)·R-7(§77의2) 후보 push |
| metadata | `transfer-reductions/metadata.ts` 2조문 등록(category:"standalone"·effectCategory:"tax_amount"·effectLabel). §77 effectLabel 2025 반영(현금 15%/채권 20~45%) |
| legal-codes | `legal-codes/transfer.ts` — `TRANSFER.*` + `TRANSFER_REDUCTION_ARTICLE.*` **양 namespace** |
| ⚠️ sunset 게이트 | **period-check.ts 재사용 금지** — 해당 헬퍼는 전부 `contractDate??acquisitionDate` 취득기준(실측 L54~151). §77의2(2026-12-31)·§77의3(2028-12-31) sunset은 **엔진 내 `transferDate` 별도 비교**로 판정 |

> ⑬ 클라이언트 body spread·①~⑧·⑪는 UI 설계 문서에서 상세.

---

## 리스크

- **§77의2 과세이연**: 취득가액 승계 + 대토 후속 양도 정산 — 최고난도. P3b 분리, 필요 시 별도 설계.
- **거주요건·추징 이자율**: 조특령 위임 → P0 KoreanLaw 확인 전 수치 동결 금지.
- **회귀**: R77-7(양도 2023) 2억→1억 anchor 갱신. F-01/F-06(year=2026) 불변.
