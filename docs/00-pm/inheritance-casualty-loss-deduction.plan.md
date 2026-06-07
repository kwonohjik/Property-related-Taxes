# 상속세 재해손실공제(상증법 §23) 구현 계획서

> 작성일: 2026-06-07
> 대상 세목: 상속세(inheritance)
> 근거: 상증법 §23, 상증령 §20, 상증통 23-20…1 (KoreanLaw MCP 검증 완료) + 첨부 교재 PDF
> 작성: inheritance-gift-tax-senior · inheritance-gift-deduction-senior · inheritance-gift-tax-ui-senior 병렬 분석 통합

---

## 1. 배경 — 검증된 법령 사실 (추정 금지, KoreanLaw MCP 실측)

### 1.1 상증법 §23 재해손실 공제

① 거주자의 사망으로 상속이 개시되는 경우로서 **§67 신고기한 이내**에 대통령령으로 정하는 **재난**으로 상속재산이 멸실·훼손된 경우 → 그 **손실가액을 상속세 과세가액에서 공제**. 단, 손실가액에 대한 **보험금 수령 또는 구상권 행사로 보전받을 수 있는 경우는 제외**.

② 손실공제를 받으려는 상속인·수유자는 **손실가액·손실내용 및 증명서류**를 관할세무서장에게 제출.

### 1.2 상증령 §20 재난의 범위 등

① 재난 = **화재·붕괴·폭발·환경오염사고 및 자연재해 등**으로 인한 재난
② 공제 손실가액 = **재난으로 인하여 손실된 상속재산의 가액**
③ **재해손실공제신고서**(별지 제6호 서식) + 재난사실 입증서류 제출

### 1.3 교재(PDF) 핵심 산식

```
재해손실 공제금액 = 재해손실재산가액 − (그 손실가액에 보험금 등 수령 또는 구상권 행사에 의거 보전 가능금액)
```

- 보전 가능 가액 **미확정 시**: 재난 종류·발생원인·보험금 종류·구상권 분쟁 진상 참작 적정가액 (상증통 23-20…1)
- 1997.1.1. 이후 최초 상속개시분부터 적용

### 1.4 §24 종합한도와의 관계 (중요)

- **§24 본문**(KoreanLaw 검증): "제18조, 제18조의2, 제18조의3, **제19조부터 제23조까지** 및 제23조의2에 따라 공제할 금액은 … 한도로 한다."
  → **§23 재해손실공제는 §24 한도에 묶이는 "대상 공제" 중 하나**다. 따라서 `rawTotalDeduction`에 합산 후 `applyDeductionLimit()`로 자동 capping되어야 한다.
- **§24 3호**(KoreanLaw 검증): 사전증여 가산가액에서 "**§53·§53의2 또는 §54**에 따라 공제받은 금액"을 차감.
  → 여기서 §54 = **증여세** 재해손실공제. **상속세 §23과 완전히 별개**다.

---

## 2. 현황 — 핵심 갭 (실측 검증)

### 2.1 §23 상속세 재해손실공제 = 완전 미구현

- `lib/tax-engine/deductions/inheritance-deductions.ts:700~706` `rawTotal` 합산은 **6종만** 포함:
  ```
  rawTotal = spouseDeduction(§19) + chosenBasicPersonal(§18·§20·§21)
           + financialDeduction(§22) + cohabitationDeduction(§23의2)
           + farmingDeduction(§18의3) + familyBusinessDeduction(§18의2)
  ```
  → **§23 재해손실공제 항목이 없다.**
- `legal-codes/inheritance-gift.ts:39~40` `INH.DISASTER_DEDUCTION = "상증법 §23"` 상수는 정의돼 있으나 **사용처 0건**.
- `inheritance-deductions.ts:5` 파일 헤더 주석에는 "재해공제(§23)"가 나열돼 있으나 실제 산식 없음 → **주석-구현 드리프트** (참고: `feedback_engine_comment_vs_impl_drift`).

### 2.2 기존 `disasterLossDeduction` 필드의 실제 정체

현재 코드의 `disasterLossDeduction`은 **§24③ 분자 보정 전용**이다 (= 사전증여에 적용된 §54 증여세 재해손실공제).

| 위치 | file:line | 역할 |
|---|---|---|
| 입력 타입 | `types/inheritance-gift.types.ts:904~905` | `/** 신고기한 내 재해손실공제 (§24 분자 보정용) */` |
| §24 한도 | `deductions/inheritance-deductions.ts:403~405` | `giftDeductions = priorGiftDeductionTotal + disasterLossDeduction` |
| orchestrator | `inheritance-tax.ts:437` | `input.deductionInput.disasterLossDeduction ?? 0` |
| 결과 detail | `types/inheritance-deduction-detail.types.ts:230~231` | `/** ③ 신고기한 내 재해손실공제 */` |
| **result 필드** | `types/inheritance-gift.types.ts:1380` | `disasterLossDeduction?: number; // ㉘ §54 재해손실공제` (Result 레벨 echo) |
| UI 입력 | `components/calc/inheritance/steps.tsx:546~552` | 라벨 "재해손실공제 (§24 종합한도 분자 보정)" |
| Form 상태 | `components/calc/inheritance/shared.ts:64`, 초기값 `:165` | `disasterLossDeduction: string` |
| Zod | `lib/validators/property-valuation-input.ts:672` | `z.number().nonnegative().optional()` |
| **부표3 ㉘ echo** | `lib/calc/deduction-besshi-data.ts:182` (`buildBuppyo3Data` :123) | `disaster: lim?.disasterLossDeduction ?? 0` (주석 :107 "§24 한도보정 입력값 echo") |

→ **이 필드는 §24③/§54 용도로 그대로 유지**한다. 신규 §23은 **별도 변수명**으로 분리한다 (혼동 차단).

> ⚠️ **별지/부표 구분 (혼동 주의)**:
> - **증여세 별지 제10호** `gift-tax-filing-form-besshi10.ts:126` ㉘ §54 재해손실공제 → `gift-tax.ts` 전용 import. **§54=증여세 재해손실공제이므로 정상**. 본 작업 무관.
> - **상속세 부표3** `deduction-besshi-data.ts:182` ㉘ 재해손실공제 → 현재 §54/§24③ 분자값을 echo 중이나, **부표3 라.상속공제 14항목(㉗금융~㉙동거 사이)이므로 §23이어야 함** (= dual-truth 결함, 본 작업에서 §23으로 교체).

### 2.3 부수 발견 — §53의2 §24③ 분자 미반영 (개선 항목)

- `computePriorGiftDeductionForLimit()` (`inheritance-deductions.ts:467~498`)는 §53 관계공제만 자동 도출, **§53의2(혼인·출산 증여재산공제) 누락**.
- `PriorGift` 타입에 `marriageExemption`/`birthExemption` 필드 없음 → 자동 도출 경로 부재. (단 `giftTaxBase` 명시 시 간접 우회 가능)
- **본 작업 범위 밖** — 후속 개선 항목으로 별도 기록.

---

## 3. 명명 규칙 결정 (혼동 차단)

| 개념 | 법조문 | 변수명 | 상태 |
|---|---|---|---|
| 사전증여 §54 공제분 (§24③ 분자 보정) | §54 + §24③ | `disasterLossDeduction` (기존) | **유지 — 의미·이름 불변** |
| **상속세 재해손실공제 (신규)** | §23 | 입력 `casualtyLoss: CasualtyLossInput` / 결과 `casualtyLossDeduction: number` | **신규 추가** |

> `disaster*`는 §54용으로 선점됐으므로, §23은 동의어 `casualty`로 명명해 grep·코드리뷰 시 혼동 원천 차단.
> 기존 §24 보정 필드의 **UI 라벨·hint만** "§24 분자 보정 — 사전증여 기간 §54 재해손실공제(보정용)"으로 명확화.

---

## 4. 엔진 레이어 설계

### 4.1 신규 입력 타입 — `types/inheritance-gift.types.ts`

```ts
/** §23 재해손실공제 입력 (상증법 §23 + 상증령 §20) */
export interface CasualtyLossInput {
  /** 재해손실 상속재산 가액 (상증령 §20②) — 원 단위 정수 */
  lossValue: number;
  /** 보전 가능 금액 (보험금 + 구상권, §23① 단서) — 미입력 시 0 */
  compensatedValue?: number;
  /** 재난 종류 (상증령 §20① — 표시·신고서용, 산식 무영향) */
  disasterType?: "fire" | "collapse" | "explosion" | "environmental" | "natural" | "other";
  /** 재난 발생일 (YYYY-MM-DD) — §67 신고기한 내 검증용. string 비교, Date 변환 금지 */
  disasterDate?: string;
  /** §67 신고기한 내 발생 override (undefined: 자동판정 / true·false: 명시) */
  isWithinFilingDeadline?: boolean;
}

// InheritanceDeductionInput 에 추가:
/** §23 재해손실공제 입력. 미제공 시 공제 0. */
casualtyLoss?: CasualtyLossInput;
```

### 4.2 계산 로직 — 신규 파일 `deductions/casualty-loss-deduction.ts`

> ⚠️ `inheritance-deductions.ts` 현재 793줄 → §23 함수 인라인 시 800줄 초과. **별도 파일 분리 후 re-export** (800줄 정책, `feedback_800line_split_export_preservation`).

```
calcCasualtyLossDeduction(casualtyLoss, deathDate, decedentType?):
  1. casualtyLoss 미제공 → return { deduction: 0, ... }
  2. 신고기한 내 발생 판정:
     a. isWithinFilingDeadline 명시 → 그 값 사용 (기존 isFiledOnTime 패턴 일관)
     b. disasterDate + deathDate 제공 시 자동 (양방향 — §23 "상속개시…§67 신고기한 이내"):
        filingDeadline = 상속개시월 말일 + (거주자 6개월 / 비거주자 9개월)
        조건 = deathDate ≤ disasterDate ≤ filingDeadline   ← 하한(상속개시 후)+상한 모두
        (date-fns endOfMonth+addMonths 산정 후 YYYY-MM-DD string 비교 복귀)
     c. 둘 다 미제공 → true (기한 내 가정, 입력 강제는 validate 담당)
  3. 기한 외 → return { deduction: 0, isWithinFilingDeadline: false, ... }
  4. deduction = Math.max(0, lossValue − (compensatedValue ?? 0))   // 정수 연산
  반환: { deduction, lossValue, compensatedValue, netDeduction, isWithinFilingDeadline, breakdown }
```

> **신고기한 판정 전략 결정**: `isWithinFilingDeadline` boolean override 우선. 자동 판정(disasterDate+deathDate)은 선택적 보조. v1 단순화를 위해 `decedentType` 전달이 부담이면 override-only로 시작 가능 (엔진 시니어 Do 단계 확정).

### 4.3 `rawTotal` 합산 추가 — `inheritance-deductions.ts:700~706`

```ts
// §23 재해손실공제 (신규) — §23의2 동거주택공제 앞 (법령 조문 순서)
const casualtyResult = calcCasualtyLossDeduction(input.casualtyLoss, baseDate /*, decedentType */);
const casualtyLossDeduction = casualtyResult.deduction;

const rawTotal =
  spouseDeduction + chosenBasicPersonal + financialDeduction
  + casualtyLossDeduction        // ← §23 신규
  + cohabitationDeduction + farmingDeduction + familyBusinessDeduction;
```

→ `applyDeductionLimit(rawTotal, ...)` (`:709~715`)는 **수정 불필요** — §24 ceiling capping 자동 적용.
→ `appliedLaws` 배열(`:772~782`)에 `INH.DISASTER_DEDUCTION` **조건부 추가**(`casualtyLossDeduction>0`일 때만 — 미입력 케이스 법령 노출 방지).

### 4.4 결과 타입

```ts
// InheritanceDeductionResult 에 추가:
casualtyLossDeduction: number;
casualtyLossDeductionDetail?: CasualtyLossDeductionDetail;

// types/inheritance-deduction-detail.types.ts 에 추가 (289줄, 여유):
export interface CasualtyLossDeductionDetail {
  lossValue: number;          // 재난 손실 상속재산 가액 (§20②)
  compensatedValue: number;   // 보전 가능 금액 (보험금+구상권)
  netDeduction: number;       // = max(0, lossValue − compensatedValue)
  isWithinFilingDeadline: boolean;
  disasterType?: CasualtyLossInput["disasterType"];
  disasterDate?: string;
}
```

> ⚠️ 결과 Map 금지 — `Record`/일반 객체 필드로 정의 (`feedback_engine_result_map_json_loss`).

### 4.5 부표3 ㉘ 데이터 소스 교체 (dual-truth 해소)

현재 `lib/calc/deduction-besshi-data.ts:182` `buildBuppyo3Data()`는 부표3 ㉘ 재해손실공제를 `lim?.disasterLossDeduction`(§24③ 분자값/§54)에서 가져온다. §23 구현 후:

```ts
// deduction-besshi-data.ts:182 (buildBuppyo3Data)
// 변경 전: disaster: lim?.disasterLossDeduction ?? 0,   // §24 분자값(§54) — 오매핑
disaster: d.casualtyLossDeduction ?? 0,                   // §23 상속세 재해손실공제
```

→ `d = result.deductionDetail` 경로(`:166`)에서 신규 `casualtyLossDeduction`을 읽도록 교체. 이를 위해 §4.4의 `InheritanceDeductionResult.casualtyLossDeduction`이 **`deductionDetail` 경유로 접근 가능**해야 함(부표3 build가 `result.deductionDetail`만 참조).

### 4.6 orchestrator 통합 — `inheritance-tax.ts`

`casualtyLoss`는 `deductionInput` 안에 포함되므로 `calcInheritanceDeductions()` 호출 시 자동 전달. **별도 선처리 없음**. (금융재산공제처럼 rows 집계 불필요 — 사용자 직접 입력값만 사용.)

---

## 5. 공제 한도·상호작용 정리

1. **§23 → rawTotal 포함 → §24 자동 capping**: §24 본문이 §23 인용 → rawTotal 합산이 정답. `applyDeductionLimit()` 무수정.
2. **§24③ 분자의 §54(`disasterLossDeduction`)와 §23(`casualtyLoss`)는 별개 경로**: 동시 존재. JSDoc에 조문 번호 명시 필수.
3. **결과 표시 구분**: §23 공제액(`casualtyLossDeduction`, 상속공제 7종 중 하나) vs §24③ 분자 §54(`DeductionLimitCeilingDetail.disasterLossDeduction`, 한도 detail). UI에서 §23/§54 라벨 명확화.

---

## 6. UI 레이어 — 14개 동기화 지점

> 기존 §24 보정 필드(`disasterLossDeduction`)는 **유지**하고 라벨·hint만 명확화. §23은 신규 필드로 분리.

| 지점 | 파일 | 작업 |
|---|---|---|
| ① 폼 상태 | `inheritance/shared.ts` | `casualtyLossEnabled:boolean`, `casualtyLossValue:string`, `casualtyLossCompensated:string`, `casualtyLossType:enum`, `casualtyLossDate:string` 추가 |
| ② initial | `shared.ts` | 위 5필드 초기값 (`false`/`""`/`"fire"`) |
| ③ normalize | `normalize-restored-form-dates.ts` | **불요 (환류 2026-06-07)** — `casualtyLossDate`는 FormState `string`이라 JSON round-trip 보존됨. normalize는 `Date` 객체 필드(V2 주식) 전용. Check에서 over-spec 확인 |
| ④ API 변환 | `lib/calc/inheritance-api.ts:82` (`deductionInput: input.deductionInput` 통째 전달) + steps.tsx 변환부 | FormState→`casualtyLoss` 객체 매핑. **buildDeductionInput 헬퍼 부재 확인** — steps.tsx 변환 위치에 명시 추가 |
| ⑤ UI 위젯 | `inheritance/steps.tsx` (Step 4) | `ToggleCard`(rose) + 재난종류 `RadioCardGroup` + `DateInput`(재난발생일) + 손실가액·보전금액 `CurrencyInput` + 자동계산 박스 |
| ⑥ 사이드바 | `lib/stores/inheritance-summary.ts` | 엔진 rawTotal 반영 시 과세표준 자동 변동. 입력단계 미리보기는 선택적 |
| ⑦ 결과 카드 | 공제 breakdown 카드 + **부표3 ㉘** | 엔진 breakdown step 자동 렌더 + `deduction-besshi-data.ts:182` ㉘ `disaster`를 §54→**§23 `d.casualtyLossDeduction`로 교체** (§4.5) |
| ⑧ validation | `lib/calc/inheritance-validate.ts` (존재 확인됨) | 토글 ON 시: 손실가액 필수, 재난발생일 필수+신고기한 검증, 보전금액>손실가액 차단. API와 동일 `max(0, …)` fallback |
| ⑨ Zod 메인 | `lib/validators/property-valuation-input.ts` | `casualtyLoss` 객체 스키마 추가 (`lossValue` nonneg, `compensatedValue?` nonneg, `disasterType?` enum, `disasterDate?` regex, `isWithinFilingDeadline?` bool) |
| ⑩ Zod 컴패니언 | — | 상속세 route는 superRefine 없음. 날짜 교차검증은 ⑧에서 |
| ⑪ acqDate fallback | — | 해당 없음 (공제 전역 입력) |
| ⑫ Zod 입력객체 | `inheritanceDeductionInputSchema` | ⑨와 동일 위치 + 엔진 타입 동기화 (TS 미감지 → grep 점검) |
| ⑬ body spread | `inheritance-api.ts:68~91` | `deductionInput` 통째 전달 — 변환부에서 `casualtyLoss` 명시 포함 확인 |
| ⑭ Route 매핑 | `app/api/calc/inheritance/route.ts:82~83` | `as cast` 자동 — Zod·엔진 타입 추가 후 자동 도달 |

### 6.1 UI 위젯 상세 (지점 ⑤)

```
[ToggleCard tone=rose] "재해손실공제 신청 (상증법 §23)"
  desc: "신고기한(상속개시일 말일부터 6개월) 이내 화재·붕괴·폭발·자연재해 등으로
         상속재산이 멸실·훼손된 경우 과세가액에서 공제"
  ON 시:
  ├ [sky 카드] 재난 정보
  │   RadioCardGroup: 화재/붕괴/폭발/환경오염사고/자연재해/기타
  │   DateInput: 재난발생일 (hint: §67 신고기한 내 발생 요건)
  └ [rose 카드] 손실 산정
      CurrencyInput: 재해손실재산가액 (멸실·훼손 상속재산 평가액)
      CurrencyInput: 보전가능금액 (보험금·구상권, 없으면 0)
      [자동박스] 공제 신청액 = 재해손실재산가액 − 보전가능금액
```

결과 카드 산식(한국어, 약어·floor 금지):
```
재해손실공제 (§23)
  재해손실재산가액      xxx
  − 보전가능금액         xxx
  ─────────────────
  재해손실공제 신청액    xxx
```

### 6.2 신고서(부표3 / 별지 제6호) 범위

- `deduction-besshi-constants.ts:70`의 ㉘는 **부표3**(`BP3_DEDUCTION_ROWS`, "라.상속공제 14항목")의 행 — §23 재해손실공제 자리(㉗금융~㉙동거 사이). 별지 제6호(재해손실공제신고서)와는 다름.
- **본 작업 포함**: 부표3 ㉘ 데이터 소스를 §54→§23으로 교체 (§4.5, `deduction-besshi-data.ts:182`).
- **후속 분리**: 별지 제6호(재해손실공제신고서) 전체 서식 재현은 `deduction-besshi/`에 컴포넌트 **없음** → 후속 작업.

---

## 7. anchor 테스트 시나리오 (`__tests__/tax-engine/inheritance/`)

| anchor | 입력 | 기대 |
|---|---|---|
| CL-01 기본(부분 보전) | loss=500,000,000 · comp=150,000,000 | 공제 350,000,000 |
| CL-02 전액 보전 | loss=200,000,000 · comp=250,000,000 | 공제 0 |
| CL-03 보전 미입력 | loss=300,000,000 · comp=undefined | 공제 300,000,000 |
| CL-04 신고기한 경과 | loss=500,000,000 · isWithinFilingDeadline=false | 공제 0 |
| CL-05 §24 한도 통합 | taxableEstate=800M(유증·사전증여 0→ceiling=800M) · 기존rawTotal=750M · casualty=100M | rawTotal 850M, limitedDeduction=800M (capping) |
| CL-06 회귀(미입력) | casualtyLoss=undefined | 기존 결과 완전 동일 |
| CL-07 부표3 자기일관 | 임의 §23 입력 | `buildBuppyo3Data(result).deduction.disaster === result.deductionDetail.casualtyLossDeduction` (§54 `lim.disasterLossDeduction`와 분리) |
| CL-08 자동 기한판정(선택, v1 보류 가능) | disasterDate 상한·하한 경계 (`disasterDate<deathDate`→0) | 양방향 경계 정확 |

> CL-01~06 = 엔진설계 케이스 1~6, CL-07 = 케이스 7, CL-08 = 케이스 8. (엔진설계 케이스 인벤토리와 1:1 정합)
> **Pre-Do anchor 우선 실행** (`feedback_pre_anchor_verification`): CL-01을 Do 진입 전 작성·실행 → 실패 확보 → 디자인 환류. "현행 일치 예상" 가정 금지.

---

## 8. Do 단계 작업 순서 (시퀀셜 위임)

1. **엔진 시니어** (선행):
   - `CasualtyLossInput` 타입 + `casualtyLoss` 필드 (`types/inheritance-gift.types.ts`)
   - `deductions/casualty-loss-deduction.ts` 신규 (`calcCasualtyLossDeduction`)
   - `rawTotal` 합산 추가 + `appliedLaws` 조건부 (`inheritance-deductions.ts`)
   - `InheritanceDeductionResult.casualtyLossDeduction` + `CasualtyLossDeductionDetail`
   - **부표3 ㉘ 교체** `deduction-besshi-data.ts:182` (§54→`d.casualtyLossDeduction`, §4.5 — result 필드 의존이라 엔진 시니어 담당)
   - anchor CL-01~07 (CL-08 v1 보류 가능)
2. **UI 시니어** (엔진 타입 확정 후):
   - ①②③ shared.ts → ⑤ ToggleCard 위젯 → ④⑬ 변환 → ⑧ validate → ⑨⑫ Zod → ⑦ 결과 카드
   - 기존 §24 보정 필드 라벨·hint 명확화
   - CL-07 부표3 자기일관 anchor 검증
3. **Check**: `ui-engine-sync-checker`(14지점) → `bkit:gap-detector`(matchRate) → 브라우저 E2E(`e2e/*.spec.ts`)

---

## 9. 완료 정의 (Definition of Done)

- [ ] §23 공제액이 `rawTotal`에 합산되어 과세표준·세액에 실제 반영 (echo만 아님)
- [ ] 부표3 ㉘이 §23(`casualtyLossDeduction`)을 표시 — §54값과 분리 (dual-truth 해소, anchor CL-07)
- [ ] 기존 `disasterLossDeduction`(§54/§24③) 동작 무변경 (회귀 anchor CL-06)
- [ ] 14지점 전부 동기화 (⑫⑬⑭ grep 자가점검)
- [ ] API fallback ↔ validation 동기화 (`max(0, loss−comp)`)
- [ ] `npx tsc --noEmit` 0건 / `npx vitest run __tests__/tax-engine/inheritance/` 통과 / 전체 `npm test`
- [ ] 브라우저 E2E (토글 ON → 입력 → 계산 → 결과 반영, Network request body `casualtyLoss` 확인)
- [ ] 800줄 정책 준수 (casualty-loss-deduction.ts 분리)

---

## 10. 범위 밖 (후속 항목)

- 별지 제6호 서식(재해손실공제신고서) 전체 재현
- §53의2(혼인·출산 증여재산공제) §24③ 분자 자동 도출 (현재 §53만 반영 — 부수 발견)
- 보전금액 미확정 시 적정가액 추정 가이드(상증통 23-20…1) UI 안내
- **비거주자 신고기한(9개월) — v1 미지원** (Check 2026-06-07 확인): 엔진 `isWithinFilingDeadline` override·`isResident=false` 경로는 구현됐으나, UI(FormState·위젯·API 변환)에 override 입력이 없어 **v1은 거주자(6개월) 전용**. validate도 6개월 하드코딩 → 비거주자 7~9개월 재난을 잘못 차단. 비거주자 지원 시 후속(decedentType 토글 + ①④⑤⑧ override 입력)
- 결과 카드 `disasterType`·`disasterDate` 표시 (신고서 검증 정보, 현재 미표시)
