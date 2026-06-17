# 1세대1주택 비과세 §154① 단서 각호(보유·거주 요건 면제) — 엔진 설계

> 계획서: `docs/00-pm/one-house-exemption-154-proviso.plan.md`
> UI 설계: `docs/02-design/features/one-house-exemption-154-proviso.ui.design.md`
> 단일 진실: `meetsOneHouseHoldingResidence`(`lib/tax-engine/transfer-tax-helpers.ts:188`) 확장 → 비과세(E-4) + 혼인 게이트(§167의10①15호) 공용.

## Context

`meetsOneHouseHoldingResidence`(L188-200)는 `보유연수 ≥ minHoldingYears && 거주요건`만 판정하고, docstring이 **"단서 각호 제외"**를 명시. §154① 단서 각호(보유·거주 요건 면제 사유 — 수용·해외이주·국외거주·부득이·임대 5년거주·조정공고전계약)는 입력 타입에도 없어, **보유<2년인데 수용·해외이주로 양도한 1주택자가 비과세를 신청할 경로가 전무**(1세대1주택 비과세 미적용=일반 과세). 본 설계는 단서 각호를 헬퍼에 단일 진실로 반영한다.

---

## ★ 케이스 인벤토리 (필수)

테스트 파일: `__tests__/tax-engine/transfer-tax/exemption-154-proviso.test.ts`

| # | 시나리오 | 법령 근거 | anchor | 상태 |
|---|---|---|---|---|
| 1 | 보유 1.5년 + 수용(고시일 전 취득·5년 내) | §154① 단서 2호 가목 | A1 (red 우선) | ☐ TODO |
| 2 | 보유 1년 + 해외이주 출국일+2년 내 | 단서 2호 나목 | A2 | ☐ TODO |
| 3 | 해외이주 출국일+2년 **초과** → 미적용 | 단서 2호 나목 단서 | A3 | ☐ TODO |
| 4 | 부득이 + 거주 1년 미달 → 미적용 | 단서 3호 | A4a | ☐ TODO |
| 5 | 부득이 + 거주 1년 충족 | 단서 3호 | A4b | ☐ TODO |
| 6 | 5호 조정취득 거주0 + 보유충족 → 거주면제 | 단서 5호 | A5 | ☐ TODO |
| 7 | 5호 + 보유 미달 → 미적용(보유는 필요) | 단서 5호 | A6 | ☐ TODO |
| 8 | 단서 없음(기존) → 회귀 green | §154① 본문 | A7 | ☐ TODO |
| 9 | 수용 + 양도가 13억 → 부분과세(고가주택) | 단서 2호가 + §89①3호 | A8 | ☐ TODO |
| 10 | 국외거주(2호다) 출국일+2년 내 | 단서 2호 다목 | A2' | ☐ TODO |
| 11 | 임대주택(1호) + 세대전원 거주 5년 + 보유<2년 | 단서 1호 | A2'' | ☐ TODO |
| 12 | 혼인게이트 sellingHouse 보유<2년 + 수용 | §167의10①15호 + §154① 단서 | A9 (통합, §6.2 결정) | ☐ TODO |

규칙: A1 먼저 작성 → **red 확인 후** 헬퍼 구현 → A1~A9 green. PDF/교재 예시 발견 시 원단위 `toBe()` 보강.

---

## 법령 근거 (소득세법 시행령 §154①, MST 286211 본문 실측)

```
§154① 본문: 양도일 현재 국내 1주택 + 보유 2년(비거주자 3년) 이상.
           [취득 당시 조정대상지역 주택은 보유 2년 + 그 보유기간 중 거주 2년 이상]
§154① 단서: 1세대가 양도일 현재 국내 1주택 보유로서
  · 제1호~제3호 → 그 보유기간 및 거주기간의 제한을 받지 않는다 (둘 다 면제)
  · 제5호      → 거주기간의 제한을 받지 않는다 (거주만 면제)
  1호  건설·공공매입임대주택 취득·양도 + 임차일~양도일 세대전원 거주 5년 이상
  2호가 공익사업법 협의매수·수용(+기타 법률 수용); 사업인정 고시일 전 취득; 양도일·수용일부터 5년 내 잔존주택 포함
  2호나 해외이주법 해외이주 세대전원 출국; 출국일 1주택 + 출국일부터 2년 내 양도
  2호다 1년 이상 국외거주 필요한 취학·근무 세대전원 출국; 출국일 1주택 + 출국일부터 2년 내 양도
  3호  1년 이상 거주 주택을 취학·근무·질병요양·부득이 사유로 양도
  4호  삭제
  5호  조정공고일 이전 매매계약+계약금 지급(증빙) + 계약금일 1세대 무주택
```

상수: `lib/tax-engine/legal-codes/transfer.ts`
```ts
TRANSFER.EXEMPTION_PROVISO_154_1 = "소득세법 시행령 §154① 단서";
EXEMPTION_PROVISO_CONST = {
  OVERSEAS_TRANSFER_YEARS: 2,      // 2호 나·다목 출국일부터
  EXPROPRIATION_TRANSFER_YEARS: 5, // 2호 가목 양도일·수용일부터
  RENTAL_RESIDENCE_YEARS: 5,       // 1호 세대전원 거주
  UNAVOIDABLE_RESIDENCE_YEARS: 1,  // 3호 1년 거주
};
```
> 시한은 개정 없는 안정 역사값 → rate 데이터 확장 아닌 정적 상수(`feedback_historical_tax_tables`).

---

## 엔진 input 타입 (`lib/tax-engine/types/transfer.types.ts` — optional nested, 하위호환)

```ts
/** §154① 단서 — 보유·거주 요건 면제 사유 (엔진 nested; 폼은 FLAT — feedback_flat_vs_nested_form_field_decision) */
oneHouseExemptionProviso?: {
  reason:
    | "rental_5yr_residence"      // 1호    : 보유+거주 면제 (거주 5년 전제)
    | "expropriation"             // 2호 가 : 보유+거주 면제
    | "overseas_migration"        // 2호 나 : 보유+거주 면제 (출국일+2년)
    | "overseas_residence"        // 2호 다 : 보유+거주 면제 (출국일+2년)
    | "unavoidable"               // 3호    : 보유+거주 면제 (거주 1년 전제)
    | "pre_designation_contract"; // 5호    : 거주만 면제
  departureDate?: Date;          // 나·다목 출국일 (2년 기산). toDate 변환 필수
  expropriationDate?: Date;      // 가목 수용일 (5년 기산; 미제공 시 transferDate). toDate
  businessApprovalDate?: Date;   // 가목 사업인정 고시일 (acquisitionDate < 고시일 전제). toDate
};
```
> 거주 충족(1호 5년·3호 1년)은 기존 `residencePeriodMonths`(L120) 재사용 — 신규 거주 필드 금지(`feedback_ui_engine_dual_truth_avoidance`).

## 엔진 result 타입 (`TransferTaxResult`)

- **신규 필드 없음**. 기존 `exemptReason?: string`(transfer.types.ts:521)에 단서 호 **append**.
  - 예: `"1세대1주택 비과세 (§154① 단서 2호가 수용)"` → `ResultDetailClient.tsx:145`·`ResultPdfDocument.tsx:370,705`·step formula(`transfer-tax.ts:276`) 자동 렌더.
  - 실측 안전: `exemptReason` 값 동등 assert 0건(grep). `basic.test.ts:672`는 `steps[0].label`(별개) → 무영향.

---

## 계산 알고리즘 (단계별)

### 신규 헬퍼 `resolveExemptionProviso(input): "both" | "residence_only" | null`

> 정의 위치: `lib/tax-engine/transfer-tax-helpers.ts` export (`meetsOneHouseHoldingResidence` 인접). `addYears`(date-fns)는 동 파일 기존 import(L233 사용) 재사용. `EXEMPTION_PROVISO_CONST`·`TRANSFER`는 `lib/tax-engine/legal-codes/transfer.ts`에서 import(`legal-codes.ts` 배럴 경유).

```ts
const p = input.oneHouseExemptionProviso;
if (!p) return null;
const C = EXEMPTION_PROVISO_CONST;              // 매직넘버 금지 — legal-codes 상수
const residenceYears = Math.floor(input.residencePeriodMonths / 12);
switch (p.reason) {
  case "expropriation":
    if (p.businessApprovalDate && input.acquisitionDate >= p.businessApprovalDate) return null; // 고시일 전 취득 위반
    return input.transferDate <= addYears(p.expropriationDate ?? input.transferDate, C.EXPROPRIATION_TRANSFER_YEARS) ? "both" : null;
  case "overseas_migration":
  case "overseas_residence":
    return p.departureDate && input.transferDate <= addYears(p.departureDate, C.OVERSEAS_TRANSFER_YEARS) ? "both" : null;
  case "unavoidable":
    return residenceYears >= C.UNAVOIDABLE_RESIDENCE_YEARS ? "both" : null;
  case "rental_5yr_residence":
    return residenceYears >= C.RENTAL_RESIDENCE_YEARS ? "both" : null;
  case "pre_designation_contract":
    return "residence_only";
  default:
    return null;                                // exhaustive 가드 (TS 전 경로 return)
}
```
> 가목 5년: 전부수용 시 수용일≈양도일 / 일부수용 시 잔존주택 양도일·수용일부터 5년. expropriationDate 미제공=transferDate 근사.

### `meetsOneHouseHoldingResidence` 확장 (기본안 = 단일 진실)

```ts
const proviso = resolveExemptionProviso(input);
const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
const meetsHolding = proviso === "both" || holding.years >= rule.minHoldingYears;
const meetsResidence =
  proviso === "both" || proviso === "residence_only" ||
  !input.wasRegulatedAtAcquisition ||
  Math.floor(input.residencePeriodMonths / 12) >= rule.regulatedAreaMinResidenceYears;
return meetsHolding && meetsResidence;
```
- `checkExemption` E-4(L243-246) 무수정 — 헬퍼만 호출. 단서 효과가 E-1/E-2(12억 분기)로 자연 전파 → C9(13억)는 부분과세 유지(면제는 요건만, 12억 한도 불면제).
- **옵션분리 변형(§6.2 보수안)**: 시그니처에 `applyProviso: boolean` 추가 → checkExemption은 `true`, 혼인게이트 precompute(`transfer-tax.ts:196-199`)는 정책 결정값. 기본안이면 불요.

### exemptReason append (checkExemption E-1/E-2)

```ts
// 모듈 스코프 상수 (checkExemption 밖 — per-call 재생성 금지)
const PROVISO_LABEL: Record<NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>["reason"], string> = {
  rental_5yr_residence: "1호 임대주택 거주5년",
  expropriation: "2호가 수용",
  overseas_migration: "2호나 해외이주",
  overseas_residence: "2호다 국외거주",
  unavoidable: "3호 부득이",
  pre_designation_contract: "5호 공고전계약",
};
const r = input.oneHouseExemptionProviso?.reason;
const provisoLabel = r ? ` (§154① 단서 ${PROVISO_LABEL[r]})` : "";
// exemptReason = "1세대1주택 비과세" + provisoLabel
```

### 인접 정리(별도 결정 — §8 계획서): `prePolicyExemptResidence` 미사용 config + `meetsResidence` 중복절 제거. probe anchor 확정 후 동시 처리 여부 결정.

---

## Silent fallback / 자동 안분 후보 식별

- **departureDate 미입력**: `resolveExemptionProviso`가 null 반환 → 침묵 비과세 미적용. **validation ⑧에서 overseas_*→departureDate 필수 차단**(`feedback_no_silent_apportion_fallback`). 자동 채움 금지.
- **5호 무주택**: 과거 보유이력 자동검증 입력 없음 → 사용자 선언(체크) + UI 증빙 안내. 자동 추정 금지.
- **businessApprovalDate 미입력**: 가목 고시일 전 취득 검증 생략(경고만) — 미입력 시 검증 skip하되 UI 경고. 자동 통과/차단 아님.

---

## 테스트 약속

- 케이스 인벤토리 12행 → anchor A1~A9(+A2'·A2''). A1 red 우선(`feedback_pre_anchor_verification`).
- 회귀: A7(단서 없음) + 기존 비과세 anchor(`reductions-and-exempt.test.ts`·`basic.test.ts`) green 유지.
- 통합 A9: cross-engine(precompute→헬퍼) — §6.2 결정 반영.

---

## UI 통합 위임

- UI 명세: `one-house-exemption-154-proviso.ui.design.md`.
- 14 동기화 지점: 계획서 §3.3. 엔진 시니어는 input(`oneHouseExemptionProviso`)·result(`exemptReason` append) + 헬퍼만. 폼 FLAT 필드·위젯·validation은 UI.
