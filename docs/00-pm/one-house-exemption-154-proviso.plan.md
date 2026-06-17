# 1세대1주택 비과세 §154① 단서 각호(보유·거주 요건 면제) 구현 계획서

> 작업 트리: worktree `feat/ex-154` (← origin/master 472b55d4)
> 대상 경로: **checkExemption 비과세 경로** (`lib/tax-engine/transfer-tax-helpers.ts`)
> 단일 진실: `meetsOneHouseHoldingResidence` 헬퍼 확장 → 비과세(E-4) + 혼인 게이트(§167의10①15호) 동시 반영
> 검증 원칙: 추정 금지. 모든 인용 file:line·법령은 실측(grep/Read·KoreanLaw MCP) 후 단정. 미검증은 "확인 필요" 명시.

---

## 1. 배경 — 갭 정의와 numeric 영향 (정직 평가)

### 1.1 현행 동작 (실측)

`lib/tax-engine/transfer-tax-helpers.ts:188-200`:

```ts
/**
 * §154① 보유·거주 핵심 요건 (단서 각호 제외).   ← docstring이 단서 미반영을 명시
 */
export function meetsOneHouseHoldingResidence(
  input: TransferTaxInput,
  rule: OneHouseSpecialRulesData["one_house_exemption"],
): boolean {
  const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
  const isPrePolicy = input.acquisitionDate < new Date(rule.prePolicyDate);
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);
  const meetsResidence =
    !input.wasRegulatedAtAcquisition ||
    (isPrePolicy && !input.wasRegulatedAtAcquisition) ||
    residenceYears >= rule.regulatedAreaMinResidenceYears;
  return holding.years >= rule.minHoldingYears && meetsResidence;
}
```

- 게이트 = `보유연수 ≥ 2년(rule.minHoldingYears)` **AND** `거주요건 충족`.
- 호출처: 비과세 `checkExemption` E-4 (`transfer-tax-helpers.ts:243-246`) + 혼인 2주택 §155⑤ 게이트 precompute (`transfer-tax.ts:196-199`).
- **§154① 단서 각호(보유·거주 제한 면제 사유)는 어디에도 없음.** 입력 타입에 사유 필드 없음(§3 실측).

### 1.2 갭의 실제 영향 (과대주장 금지 — `feedback_numeric_impact_verify_before_bug_claim`)

- **성격**: "입력 경로 부재형" 갭. 단서 사유 입력 필드 자체가 없어, 보유<2년(또는 조정취득+거주<2년)인 1주택자가 **수용·해외이주·부득이 사유로 양도해도 비과세를 신청할 방법이 없다** → 현행은 그 케이스를 **1세대1주택 비과세 미적용**(일반 양도세 과세)로 처리(고가주택이면 그조차 부분과세 아님 — 1세대1주택 자체 부적용).
- **현행 사용자 영향 범위**: 보유 2년 이상(대다수)은 무영향. 영향은 **보유<2년 + 단서 사유** 교집합에 한정 → "좁은 스코프"라는 사용자 판단과 일치.
- **단정 가능 사실**: 단서 사유 + 단기 양도 케이스에서 비과세가 누락된다(= 과세 과다). 단, anchor로 red 확보 후 단정(§7).

### 1.3 단일 진실 파급 (이득)

`meetsOneHouseHoldingResidence`는 비과세 + 혼인 게이트 공용(`transfer-tax-helpers.ts:186` 주석이 명시). **헬퍼 1곳에 단서를 넣으면 두 경로가 동시에 정합**해진다. 단, 혼인 게이트(§167의10①15호) 의미 적합성은 §6.2에서 확인 필요.

---

## 2. 법령 근거 (소득세법 시행령 §154① — MST 286211, 시행 20260522, KoreanLaw 본문 실측)

§154① 본문: 1세대 1주택 비과세 = 양도일 현재 국내 1주택 + **보유 2년 이상**(취득 당시 조정대상지역이면 보유 2년 + **그 보유기간 중 거주 2년 이상**).

**단서**: 양도일 현재 국내 1주택 보유 시,
- **제1호·제2호·제3호** 해당 → **보유기간 및 거주기간의 제한을 받지 않음** (둘 다 면제)
- **제5호** 해당 → **거주기간의 제한만 받지 않음** (거주만 면제, 보유는 유지)
- 제4호: 삭제

### 2.1 각 호 사유·추가요건 (전수)

| 호 | 사유 | 면제 범위 | 법정 추가 요건 |
|---|---|---|---|
| **1호** | 건설임대·공공매입임대주택 취득·양도 | 보유+거주 | 임차일~양도일 중 **세대전원 거주 5년 이상**(부득이 일부 비거주 포함) |
| **2호 가** | 공익사업법 협의매수·수용 + 그 밖의 법률에 의한 수용 | 보유+거주 | **사업인정 고시일 전 취득**한 주택·부수토지 / 양도일·수용일부터 **5년 이내** 양도 잔존주택·부수토지 포함 |
| **2호 나** | 해외이주법에 따른 해외이주로 세대전원 출국 | 보유+거주 | 출국일 현재 1주택 보유 + **출국일부터 2년 이내** 양도 |
| **2호 다** | 1년 이상 계속 국외거주 필요한 취학·근무 형편으로 세대전원 출국 | 보유+거주 | 출국일 현재 1주택 보유 + **출국일부터 2년 이내** 양도 |
| **3호** | 1년 이상 거주한 주택을 취학·근무상 형편·질병요양·그 밖의 부득이한 사유로 양도 | 보유+거주 | **1년 이상 거주**(재정경제부령 사유) |
| **5호** | 조정대상지역 공고일 이전 매매계약 체결+계약금 지급(증빙) + 계약금 지급일 현재 1세대 무주택 | **거주만** | 증빙서류 |

> 사유별 추가요건이 충족되지 않으면 단서 미적용 → 본문 요건(보유 2년·거주 2년)으로 회귀. (예: 해외이주인데 출국일부터 2년 초과 양도 → 면제 없음)

### 2.2 우선순위·관계

- 면제 효과는 합집합이 아니라 **사유별 면제 범위가 다름**(1·2·3호=보유+거주, 5호=거주만). 사용자가 한 사유를 선택 → 그 범위만 적용.
- 1호(임대주택 5년 거주)는 장기임대 감면(조특법 §97 계열, `RentalHousingExceptionSection`)과 입력 의미가 다름(여기선 **비과세 거주요건 면제**). 중복 입력 혼선 방지 설계 필요(§6.3, 확인 필요).

---

## 3. 현행 코드 실측 (입력·세율·14지점 — file:line 근거)

### 3.1 입력 타입 (`lib/tax-engine/types/transfer.types.ts`)

- `residencePeriodMonths: number` (L120) — 거주기간(월). 거주 5년/1년 판정 재사용 가능.
- `wasRegulatedAtAcquisition: boolean` (L124), `isRegulatedArea` (L122).
- `isOneHousehold` (L136), `householdHousingCount` (L116), `acquisitionDate`/`transferDate`.
- **nested 객체 선례**: `temporaryTwoHouse?: { previousAcquisitionDate: Date; newAcquisitionDate: Date }` (L138-141), `marriageMerge?: { marriageDate: Date }` (L194-196).
- **§154① 단서 사유 필드 없음** (수용·해외이주·부득이·출국일·수용일·사업인정 고시일 전무).

### 3.2 세율 데이터 (`lib/tax-engine/schemas/rate-table.schema.ts:172-178`)

```ts
one_house_exemption: z.object({
  maxExemptPrice, minHoldingYears, regulatedAreaMinResidenceYears,
  prePolicyDate, prePolicyExemptResidence,   // ← prePolicyExemptResidence 미사용 (§8 인접발견)
}),
temporary_two_house: z.object({ ..., regulatedAreaRelaxDate, regulatedAreaRelaxDeadlineYears }).optional(),
```

- 단서 각호 시한(5년·2년·1년·5년 거주)은 **개정 없는 안정 역사값** → `feedback_historical_tax_tables` 정책상 `legal-codes/transfer.ts` 정적 상수가 적합(세율 데이터 확장보다 우선). `temporary_two_house`가 부칙 dates를 rate에 둔 것은 변동(완화) 때문 — 단서 각호는 해당 없음.

### 3.3 14 동기화 지점 — 실측 경로 (nested 객체 `temporaryTwoHouse` 템플릿)

| # | 지점 | 기존 선례 file:line | 신규 작업 |
|---|---|---|---|
| ① | 폼 상태 | `calc-wizard-store.ts:95-96`·`189-190` (FLAT `previousHouseAcquisitionDate` 등 = nested 입력의 폼 선례) | **FLAT** 폼 필드 `provisoReason`·`provisoDepartureDate`·`provisoExpropriationDate`·`provisoBusinessApprovalDate` (`feedback_flat_vs_nested_form_field_decision` — 폼 FLAT / 엔진 nested) |
| ② | initial | `calc-wizard-store.ts:189-190` 인근 | `provisoReason=""`(미선택) + 날짜 3종 `""` |
| ③ | normalize | `calc-wizard-store` migration | proviso flat 필드 string 보장(undefined→"") |
| ④ | API 변환(단건) | `lib/calc/transfer-tax-api.ts:460-473` (조건부 spread) | `oneHouseExemptionProviso` spread |
| ④ | API 변환(다건) | `lib/calc/multi-transfer-tax-api.ts:129-133` | 동일 |
| ⑤ | UI 위젯 | `components/calc/transfer/ResidencePeriodSection.tsx`(인접 배치) | `ExemptionProvisoSection` — 사유 `RadioCardGroup`, 날짜 `DateInput`(`components/ui/date-input.tsx:76`, `type="date"` 금지 `feedback_date_input`) |
| ⑥ | 사이드바 합계 | — | **N/A** (금액 아님) |
| ⑦ | 결과 카드 | `exemptReason` 자동 렌더: `app/result/[id]/ResultDetailClient.tsx:145`·`lib/pdf/ResultPdfDocument.tsx:370,705`·step formula `transfer-tax.ts:276` | **신규 UI 없음** — `checkExemption`의 `exemptReason` 문자열에 단서 호 부가만 |
| ⑧ | validation | `lib/calc/transfer-tax-validate-asset.ts` | **사유별 required**: overseas_migration/overseas_residence→`departureDate` 필수(미입력 시 항상 null=침묵 비과세 미적용 차단), expropriation→`businessApprovalDate` 권장+`acquisitionDate<고시일` 경고, unavoidable→거주 1년·rental→거주 5년(`residencePeriodMonths`). `feedback_no_silent_apportion_fallback` |
| ⑨⑩ | Zod enum | 메인 입력 스키마 + 컴패니언 `multiInputSchema` (`lib/api/transfer-tax-schema.ts`, `multi/route.ts:24,61`) | **두 스키마 모두** `provisoReason` enum + proviso 객체 추가 |
| ⑫ | Zod 입력 객체 | `transfer-tax-schema.ts:134`(temporaryTwoHouse) `:140-141`(marriageMerge inline), 서브 `transfer-tax-schema-sub.ts:28` | `oneHouseExemptionProvisoSchema` |
| ⑬ | body spread | `transfer-tax-api.ts:460-473` | spread 포함 확인(grep) |
| ⑭ | Route 엔진 매핑(Date) | `app/api/calc/transfer/route.ts:195-198`·`:219-220` (단건), `multi/route.ts:137-140` (다건, `toDate` 사용 ✓) | 출국일·수용일·고시일 `toDate` 변환 (단건도 `toDate` 준수 — `date-coerce`) |

> ⑭ 주의: 단건 `route.ts:195-198`는 `new Date()` 직접 호출(legacy). CLAUDE.md "신규 코드 `new Date(x)` 직접 호출 금지" → 신규 날짜는 `toDate(v,"field")` 사용. 다건 `multi/route.ts:139-140`는 이미 `toDate` 준수 → 그 패턴 채택.

---

## 4. 케이스 매트릭스 (단순 → 복합, 전수 enumerate)

| # | 1세대 | 주택수 | 보유 | 조정취득/거주 | 단서 사유 | 추가요건 | 기대 결과 |
|---|---|---|---|---|---|---|---|
| C0 | Y | 1 | 3년 | 비조정 | 없음 | — | 비과세(기존, 회귀) |
| C1 | Y | 1 | 1.5년 | 비조정 | 2호가 수용 | 고시일 전 취득·5년내 | **비과세**(현행 false) |
| C2 | Y | 1 | 1년 | 비조정 | 2호나 해외이주 | 출국일+2년내 | **비과세** |
| C3 | Y | 1 | 1년 | 비조정 | 2호나 해외이주 | 출국일+**2년 초과** | 과세(단서 미적용→보유 미달) |
| C4 | Y | 1 | 0.5년 | 비조정 | 3호 부득이 | **1년 거주 미달** | 과세(3호 1년 거주 요건 불충족) |
| C5 | Y | 1 | 1.5년 | 비조정 | 3호 부득이 | 1년 거주+사유 | **비과세** |
| C6 | Y | 1 | 3년 | 조정+거주 0년 | 5호 공고전계약 | 무주택 증빙 | **비과세**(거주면제, 보유 충족) |
| C7 | Y | 1 | 1년 | 조정 | 5호 | — | 과세(**5호는 거주만 면제**, 보유 미달) |
| C8 | Y | 1 | 4년 | 비조정 | 1호 임대 | 세대전원 5년 거주 | 비과세(보유 이미 충족 — 면제 무영향이지만 정합) |
| C9 | Y | 1 | 1.5년 | 비조정 | 1호 임대 | 거주 5년 | **비과세**(보유 면제) |
| C10 | Y | 1 | 13억 양도 | — | 2호가 수용 | 충족 | 단서로 요건 충족 → E-2 **고가주택 부분과세**(12억 초과분), 전액과세 아님 |
| C11(통합) | 혼인 2주택 게이트 | sellingHouse 보유<2년 | — | 2호가 수용 | 충족 | §154① 충족 의제 → 게이트 통과 여부(§6.2 확인) |

> C10: 단서는 **보유·거주 요건**만 면제 → 12억 초과 고가주택 부분과세(E-2)는 그대로. 단서가 12억 한도를 풀지 않음(법문상 요건 면제 ≠ 고가주택 과세 면제).

---

## 5. 엔진 설계 (단일 진실 헬퍼 확장)

### 5.1 법령 상수 (`lib/tax-engine/legal-codes/transfer.ts`)

```ts
TRANSFER.EXEMPTION_PROVISO_154_1 = "소득세법 시행령 §154① 단서";
// 시한 상수 (안정 역사값)
EXEMPTION_PROVISO_CONST = {
  OVERSEAS_TRANSFER_YEARS: 2,      // 2호 나·다목 출국일부터
  EXPROPRIATION_TRANSFER_YEARS: 5, // 2호 가목 양도일·수용일부터
  RENTAL_RESIDENCE_YEARS: 5,       // 1호 세대전원 거주
  UNAVOIDABLE_RESIDENCE_YEARS: 1,  // 3호 1년 거주
};
```

### 5.2 입력 타입 (`types/transfer.types.ts` — optional nested, 하위호환)

```ts
/** §154① 단서 — 보유·거주 요건 면제 사유 (수용·해외이주·국외거주·부득이·임대·공고전계약) */
oneHouseExemptionProviso?: {
  reason:
    | "rental_5yr_residence"   // 1호: 보유+거주 면제, 거주 5년 충족 전제
    | "expropriation"          // 2호가: 보유+거주 면제
    | "overseas_migration"     // 2호나: 보유+거주 면제
    | "overseas_residence"     // 2호다: 보유+거주 면제
    | "unavoidable"            // 3호: 보유+거주 면제, 1년 거주 전제
    | "pre_designation_contract"; // 5호: 거주만 면제
  departureDate?: Date;          // 나·다목 출국일 (2년 기산)
  expropriationDate?: Date;      // 가목 수용일 (5년 기산; 미제공 시 transferDate로 5년 판정)
  businessApprovalDate?: Date;   // 가목 사업인정 고시일 (acquisitionDate < 고시일 검증)
};
```

> 거주 충족(1호 5년·3호 1년)은 **기존 `residencePeriodMonths` 재사용** — 신규 거주 필드 추가 금지(단일 진실, `feedback_ui_engine_dual_truth_avoidance`).

### 5.3 헬퍼 확장 (`transfer-tax-helpers.ts` — `meetsOneHouseHoldingResidence`)

```ts
type ProvisoScope = "both" | "residence_only" | null;

/** §154① 단서 각호 충족 시 면제 범위 반환 (요건 미충족이면 null) */
export function resolveExemptionProviso(input: TransferTaxInput): ProvisoScope {
  const p = input.oneHouseExemptionProviso;
  if (!p) return null;
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);
  switch (p.reason) {
    case "expropriation": {
      // 사업인정 고시일 전 취득 + 양도일/수용일부터 5년 이내
      if (p.businessApprovalDate && input.acquisitionDate >= p.businessApprovalDate) return null;
      const base = p.expropriationDate ?? input.transferDate;
      return input.transferDate <= addYears(base, 5) ? "both" : null;
    }
    case "overseas_migration":
    case "overseas_residence":
      // 출국일부터 2년 이내 양도
      return p.departureDate && input.transferDate <= addYears(p.departureDate, 2) ? "both" : null;
    case "unavoidable":
      return residenceYears >= 1 ? "both" : null;       // 1년 이상 거주
    case "rental_5yr_residence":
      return residenceYears >= 5 ? "both" : null;        // 세대전원 5년 거주
    case "pre_designation_contract":
      return "residence_only";                            // 거주만 면제 (증빙은 UI 안내)
  }
}

export function meetsOneHouseHoldingResidence(input, rule): boolean {
  const proviso = resolveExemptionProviso(input);
  const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
  const meetsHolding = proviso === "both" || holding.years >= rule.minHoldingYears;

  const isPrePolicy = input.acquisitionDate < new Date(rule.prePolicyDate);
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);
  const meetsResidence =
    proviso === "both" || proviso === "residence_only" ||
    !input.wasRegulatedAtAcquisition ||
    (isPrePolicy && !input.wasRegulatedAtAcquisition) ||  // §8 인접발견(중복절) — 본 작업서 별도 처리
    residenceYears >= rule.regulatedAreaMinResidenceYears;

  return meetsHolding && meetsResidence;
}
```

- `checkExemption` E-4(L243-246)는 헬퍼만 호출 → **무수정**. 단서 효과가 E-1/E-2(12억 분기)로 자연 전파.
- `exemptReason`에 단서 호 라벨 부가(⑦): 예 `"1세대1주택 비과세 (§154① 단서 2호가 수용)"` → result detail·PDF·step formula 자동 노출(신규 UI 0).
- **Date-coerce(⑭ 필수)**: `departureDate`·`expropriationDate`·`businessApprovalDate`는 JSON 경유 후 string 도달 → `Date < string` silent false 함정(CLAUDE.md `lib/api/date-coerce.ts`). Route에서 `toDate(v,"field")` 변환 후 엔진 도달 보장. 헬퍼는 Date 전제(직접 `new Date` 금지).
- **가목 5년 기산 의미**: 전부 수용 시 수용=양도(수용일≈양도일), 일부 수용 시 잔존주택을 양도일·수용일부터 5년 내 양도. `expropriationDate` 미제공이면 `transferDate`로 5년 판정(전부수용 근사). 사업인정 고시일 전 취득(`acquisitionDate < businessApprovalDate`)이 가목 전제 — 미충족 시 null.
- **exemptReason append 안전성(실측)**: 값 동등 assert 0건(grep). `basic.test.ts:672`는 `steps[0].label`(별개 필드)이라 무영향 → base 문자열 유지 + 단서 호 append 채택.
- **옵션분리 시그니처(§6.2 보수안 채택 시)**: `meetsOneHouseHoldingResidence(input, rule, applyProviso: boolean)` 파라미터 추가 → `checkExemption`=`true`, 혼인게이트 precompute(`transfer-tax.ts:196-199`)=정책 결정값 전달. **단일진실(기본안)이면 파라미터 불요**(헬퍼 내부에서 무조건 proviso 반영).

### 5.4 오케스트레이터

- `transfer-tax.ts`: 신규 호출 없음(헬퍼 내부 확장). 혼인 게이트 precompute(L196-199)는 동일 헬퍼 → **단서 자동 반영**(§6.2 확인).

---

## 6. 설계 검증 포인트 (확인 필요 — 추정 금지)

### 6.1 [HIGH] 면제 범위 ≠ 12억 한도 면제
단서는 보유·거주 요건만 면제. C10처럼 12억 초과 고가주택은 E-2 부분과세 유지. **anchor C10로 입증**.

### 6.2 [HIGH] 혼인 게이트(§167의10①15호)에 단서 적용 주택이 "§154① 요건 충족"으로 인정되는가
- 법문(실측): "§155 또는 조특법에 따라 1세대1주택으로 보아 **§154①이 적용되는 주택으로서 같은 항의 요건을 모두 충족하는 주택**".
- 해석: 단서 사유 주택은 §154① 적용(비과세) 주택 → "§154①이 적용되는 주택"에 해당. 단, "요건을 모두 충족"의 문언이 단서 면제(요건 제한 배제)를 포함하는지 **예규/판례 확인 필요**.
- **✅ Do 확정 (단일 진실 채택)**: §167의10①15호 본문 실측(MST 286211) "§154①이 적용되는 주택으로서 같은 항의 요건을 모두 충족하는 주택". 단서는 "보유기간 및 거주기간의 제한을 받지 않는다"=요건 충족 의제 → 게이트 포함이 법문 일관. **옵션분리 불채택**, `meetsOneHouseHoldingResidence` 헬퍼 단일 진실로 혼인게이트 자동 반영(A9 통합 anchor green). `applyProviso` 파라미터 불필요 → 코드 변경 0.
- **대안 설계**: 보수적으로 가려면 혼인 게이트 precompute에 `applyProviso=false` 플래그를 주어 게이트는 본문 요건만 보게 분리 가능(헬퍼에 옵션 파라미터). 기본은 단일 진실(단서 포함) + 확인 후 확정.

### 6.3 [MEDIUM] 1호(임대주택 5년 거주)와 장기임대 감면 UI 중복
`RentalHousingExceptionSection`(거주주택 비과세 특례)과 의미 충돌 점검. 1호는 §154① **거주요건 면제**, 거주주택 특례(§155⑳ 등)는 별개. UI에서 사유 설명으로 구분(확인).

### 6.4 [MEDIUM] 5호 무주택 증빙·계약금일 판정
5호는 "계약금 지급일 현재 1세대 무주택"이 실체 요건이나, 엔진이 과거 무주택을 검증할 입력이 없음 → 사용자 선언(체크) + UI 증빙 안내로 처리(자동 안분 fallback 아님, 사용자 명시 입력). `feedback_no_silent_apportion_fallback` 준수.

---

## 7. Anchor 설계 (Pre-Do red→green) — `__tests__/tax-engine/transfer-tax/exemption-154-proviso.test.ts`

| anchor | 케이스 | 단정 |
|---|---|---|
| A1 | C1 보유1.5년+수용(고시일 전·5년내) | `isExempt === true` (현행 false → **red 확보**) |
| A2 | C2 해외이주 출국일+2년내 | `isExempt === true` |
| A3 | C3 해외이주 출국일+2년 초과 | `isExempt === false` |
| A4a·A4b | C4 부득이 거주1년 미달 / C5 거주1년 충족 | C4 `isExempt===false` · C5 `isExempt===true` |
| A5 | C6 5호 조정+거주0+보유충족 | `isExempt === true` (거주면제) |
| A6 | C7 5호+보유미달 | `isExempt === false` (보유 미면제) |
| A7 | C0 단서없음 | `isExempt === true` (회귀) |
| A8 | C10 수용+13억 | `isPartialExempt === true` (고가주택, 한도 불면제) |
| A2′ | 국외거주(2호다) 출국일+2년내 | `isExempt === true` |
| A2″ | 임대주택(1호) 세대전원 거주5년+보유<2년 | `isExempt === true` |
| A9(통합) | C11 혼인게이트 sellingHouse 보유<2년+수용 | 단일진실 채택 시 §154① 충족 의제→게이트 통과 / 옵션분리 채택 시 게이트는 본문요건만→불충족. §6.2 결정 후 확정 |

> 절차: A1 먼저 작성 → 실패(red) 확인 → 헬퍼 확장 → A1~A9 green. `feedback_pre_anchor_verification`.

---

## 8. 인접 발견 (별도 처리 — 버그 단정 금지, 확인 필요)

`feedback_numeric_impact_verify_before_bug_claim`: anchor 없이 버그 단정하지 않음. 아래는 **정리 후보**로 기록, probe 후 판단.

1. **`prePolicyExemptResidence` rate config 미사용(dead)**: `rate-table.schema.ts:177` 정의되나 `transfer-tax-helpers.ts` 어디서도 read 안 함(grep 0건). → 와이어링 또는 제거 결정 필요.
2. **`meetsResidence` 중복절**: `(isPrePolicy && !input.wasRegulatedAtAcquisition)`(L197)은 직전 절 `!input.wasRegulatedAtAcquisition`(L196)의 부분집합 → 논리적 중복(결과 불변). 무해하나 `prePolicyExemptResidence` 의도(2017.8.3 이전 취득 거주요건 면제)가 미구현일 가능성. **probe: 조정취득+isPrePolicy 케이스 anchor로 의도 확정 후 처리**.

> 위 2건은 본 §154① 단서 작업과 **인접**하나 별개. 본 PR 범위에 포함할지(§5.3 헬퍼 정리 시 동시 처리)는 probe 결과로 결정.

---

## 9. 범위 / 비범위

### 9.1 범위 (본 계획)
- §154① 단서 1·2(가나다)·3·5호 보유/거주 요건 면제 — 비과세 경로(checkExemption), 단일 진실 헬퍼.
- 14 동기화 지점 + anchor A1~A9.

### 9.2 비범위 (별도 과제)
- **부칙 양도일 분기**: 비과세 단서 각호 자체는 안정 조문(부칙 영향 미미). 일시적 2주택 부칙은 **기구현**(`checkExemption` E-3, `regulatedAreaRelaxDate` `transfer-tax-helpers.ts:222-231`). multi-house 부칙(§155⑤ 10년 / §167의3⑨·§167의4⑤ 5년)은 **다주택 중과 과제**(`project_transfer_multi_house_gaps`)로 본 비과세 plan 범위 밖.
- 5호 무주택 자동 검증(과거 보유이력 추적) — 사용자 선언으로 처리, 자동화는 별도.
- 인접 발견 2건(§8) — probe 후 별도 결정.

---

## 10. 작업 순서 (Do)

1. **Pre-Do anchor A1 작성 → red 확인** (현행 비과세 거부 실증).
2. legal-codes 상수(§5.1) → 타입 `oneHouseExemptionProviso`(§5.2) → 헬퍼 `resolveExemptionProviso`+`meetsOneHouseHoldingResidence` 확장(§5.3).
3. anchor A1~A9 green.
4. §6.2 혼인 게이트 의미 — KoreanLaw 예규/판례 확인 → 단일진실 vs 옵션분리 확정 → A9 반영.
5. 14 동기화 지점(§3.3): 폼·initial·normalize·API(단/다건)·UI 섹션·결과 라벨·validation·Zod(enum+객체)·route Date(`toDate`).
6. `npx tsc --noEmit` 0 · `npx vitest run __tests__/tax-engine/transfer-tax/` 통과 · 전체 `npm test`.
7. E2E: 단서 사유 선택→날짜 입력→비과세 결과 (`e2e/transfer-exemption-154-proviso.spec.ts`, `E2E_PORT=3103`).
8. 브라우저 수동 확인(Network 탭 `oneHouseExemptionProviso` body 확인) 또는 E2E 대체.

---

## 11. 다음 단계 제안 (이 계획서 이후)

본 문서는 PDCA **Plan** 산출물. 본격 구현 전 `plan-design-self-review-loop`의 STEP 5·12(엔진/UI 디자인 문서 별도 생성 + 검토 2회 + 통합비교)를 돌릴지 사용자 결정 필요. 단순 1-헬퍼 확장이므로 본 계획서 + Pre-Do anchor로 바로 Do 진입도 가능(규모 판단).
