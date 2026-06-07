# Phase 4 설계 — 부득이사유 자동산입 (G3-R: CohabitReason 배열)

> 상위 설계: [`inheritance-cohabit-deduction.engine.design.md`](./inheritance-cohabit-deduction.engine.design.md) (Phase 1~3)
> 사용자 확정 범위: "구조화 사유 배열 + 자동 판정(완전)"
> 전제: Phase 2에서 `Heir.cohabitStartDate?`·`Heir.cohabitExcludedYears?` 및
>        `calcCohabitYears(cohabitStartDate, deathDate, birthDate, excludedYears)` 구현 완료.
> 본 Phase는 `cohabitExcludedYears`(수동 숫자)를 `cohabitReasons`(구조화 배열)로 대체한다.
> 작성: 2026-06-07

---

## 법령 검증 결과 (KoreanLaw MCP 실측 — 추정 인용 없음)

### 상증법 §23의2② 본문 (MST 283637, 2026-02-27 시행)

```
② 피상속인과 상속인이 대통령령으로 정하는 사유로 동거하지 못한 경우
   계속 동거로 보되, 그 기간은 동거기간에 산입하지 아니함.
```

**법적 효과**: "계속 동거로 **인정**하되 동거기간에 **산입하지 않는다**" — 즉 부득이 사유 기간은
1세대 계속 동거 요건(§23의2②)을 충족시키되, effectiveYears 산정에는 포함하지 않는다.
**산입 방향 = 차감(제외)**. 재건축 전세 등 '산입'이란 rawYears 밖 기간의 가산이 아니라
법령 문언상 모든 부득이 사유가 "산입하지 않는다"이며, 재건축은 이 차감 규정의 **예외**(즉 차감 없이 산입)에 해당하는 해석례임을 유의.

### 상증령 §20의2② 호별 사유 (MST 283637, KoreanLaw 실측)

| 호 | 법령 문언 | 시행규칙 위임 |
|----|----------|-------------|
| 1호 | 징집 | 없음 (직접 열거) |
| 2호 | 취학·근무상 형편·질병 요양 | 상증세법 시행규칙 §9의2로 구체화 |
| 3호 | 제1·2호와 비슷한 사유 | 시행규칙 위임 |

### 상증세법 시행규칙 §9의2 (MST 284609, 2026-03-20 시행, KoreanLaw 실측)

§20의2②2호의 "재정경제부령으로 정하는 사유":
```
1. 「초·중등교육법」에 따른 학교(초등학교·중학교 제외) 및
   「고등교육법」에 따른 학교에의 취학
2. 직장의 변경이나 전근 등 근무상의 형편
3. 1년 이상의 치료나 요양이 필요한 질병의 치료 또는 요양
```

**핵심 확인**:
- **초·중학교 취학 = 제외**: 시행규칙 §9의2①1호가 "초등학교 및 중학교는 제외한다"고 명시.
  → 고등학교·대학교·대학원이 열거 범위.
- **국외 대학원**: 시행규칙 §9의2①1호의 "「고등교육법」에 따른 학교"는 국내 학교만 적용.
  국외 대학원은 열거 사유에 해당하지 않음 (법정 목록 엄격 해석).
  재조세-434 해석례는 API 검색 실패 — **해석례 미확인, 교재 근거** 처리.
  단, 법령 문언상 "고등교육법에 따른 학교"에 국외 대학원 포함 불가는 조문 자체로 확인.
- **재건축 전세 산입**: 재산-248 해석례는 API 검색 실패 — **해석례 미확인, 교재 근거**.
  법령 문언 §23의2②의 "산입하지 않는다"가 기본이고 재건축 전세는 예외적 해석.
  엔진 설계에서는 "해석례 입력 시 차감 없음" 방식으로 구조화하되, 해석례 출처 경고를 UI에 표시.

---

## CohabitReasonType enum 확정

```ts
/**
 * §23의2② + 상증령 §20의2② + 시행규칙 §9의2 부득이한 사유 유형.
 *
 * 법령 근거 (KoreanLaw MST 283637·284609 실측):
 *   징집: §20의2②1호 직접 열거
 *   취학(고교·대학·대학원): §20의2②2호 + 시행규칙 §9의2①1호 ("초·중학교 제외")
 *   근무상_형편: §20의2②2호 + 시행규칙 §9의2①2호
 *   질병_요양: §20의2②2호 + 시행규칙 §9의2①3호 (1년 이상 요건)
 *   재건축_전세: 해석례 미확인(교재 재산-248 근거) — 사유 입력 시 UI 경고 표시
 *   국외_대학원: 시행규칙 §9의2①1호 적용 불가(국내 고교육법 학교 한정) → 불인정
 *
 * 법적 효과:
 *   "excluded" (제외): §23의2② 본문 — 계속 동거 인정, 동거기간 산입 안 함
 *                      → effectiveYears에서 해당 기간 차감
 *   "included" (산입): 재건축 전세 해석례 적용 시
 *                      → 차감 없음(rawYears 내 그대로 포함)
 *   "not_recognized" (불인정): 국외 대학원 — 법정 사유 미해당
 *                      → effectiveYears 차감 없음 + 계속성 단절 경고
 */
export type CohabitReasonType =
  | "conscription"          // 징집 (§20의2②1호) → 제외(차감)
  | "schooling"             // 취학 — 고교·대학·국내대학원 (시행규칙 §9의2①1호) → 제외(차감)
  | "work"                  // 근무상 형편 (시행규칙 §9의2①2호) → 제외(차감)
  | "medical"               // 질병 요양 1년 이상 (시행규칙 §9의2①3호) → 제외(차감)
  | "reconstruction_lease"  // 재건축 전세 — 해석례 미확인(교재 근거) → 차감 없음(산입)
  | "overseas_grad";        // 국외 대학원 — 법정 사유 미해당 → 불인정(경고)
```

**유형별 법적 효과 분류**:

| CohabitReasonType | 법령 근거 | 효과 코드 | effectiveYears 영향 | 계속성 |
|------------------|----------|----------|---------------------|--------|
| `conscription` | §20의2②1호 (실측) | EXCLUDED | 해당 기간 차감 | 유지 |
| `schooling` | 시행규칙 §9의2①1호 (실측) | EXCLUDED | 해당 기간 차감 | 유지 |
| `work` | 시행규칙 §9의2①2호 (실측) | EXCLUDED | 해당 기간 차감 | 유지 |
| `medical` | 시행규칙 §9의2①3호 (실측) | EXCLUDED | 해당 기간 차감 | 유지 |
| `reconstruction_lease` | 해석례 미확인(교재 근거) | INCLUDED | 차감 없음(rawYears 내 포함) | 유지 |
| `overseas_grad` | 시행규칙 §9의2①1호 미해당 | NOT_RECOGNIZED | 차감 없음 | **단절 경고** |

---

## CohabitReason 타입 및 Heir 배치

```ts
/**
 * §23의2② 부득이한 사유 1건 — 시작일·종료일·유형 구조화.
 *
 * 입력 규칙:
 *   - startDate·endDate: YYYY-MM-DD (ISO date string). endDate 최대 = deathDate.
 *   - startDate < endDate 검증은 Zod에서 .refine() 처리.
 *   - 기간은 Heir.cohabitStartDate ~ deathDate 구간 내에 있어야 유효.
 *     구간 밖 기간은 엔진이 clamp 처리(rawYears 구간에만 영향 있음).
 */
export interface CohabitReason {
  type: CohabitReasonType;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
}
```

### Heir 타입 변경

```ts
// lib/tax-engine/types/inheritance-gift.types.ts

// Phase 2에서 추가된 필드 (유지)
cohabitStartDate?: string;

// Phase 4: 수동 숫자 → 구조화 배열 전환
/** @deprecated Phase 2 수동 입력 필드. Phase 4에서 cohabitReasons로 대체.
 *  기존 저장 데이터 역직렬화 호환을 위해 타입에 잔류. 신규 입력 UI에서는 숨김.
 *  엔진: cohabitReasons가 존재하면 cohabitReasons 우선, 없으면 cohabitExcludedYears fallback.
 */
cohabitExcludedYears?: number;

/** §23의2② 부득이한 사유 배열 (Phase 4 신규).
 *  undefined = 사유 미입력 (cohabitExcludedYears fallback 또는 0 처리).
 *  [] = 사유 없음 (excludedYears = 0).
 *  [...] = 사유 입력됨 — 유형별 자동 집계.
 */
cohabitReasons?: CohabitReason[];
```

---

## 수학적 모델 — 정밀 설계

### 기본 구조

```
rawYears = differenceInYears(deathDate, effectiveStart)
  여기서 effectiveStart = max(cohabitStartDate, adultDate)  ← 미성년 제외(Phase 2)

사유별 기간 합산:
  EXCLUDED 유형: totalExcludedDays = Σ clampedDays(reason)   (clamp: effectiveStart~deathDate 구간)
  INCLUDED 유형: totalIncludedDays = 0  (rawYears에 이미 포함 — 별도 처리 없음)
  NOT_RECOGNIZED: totalNotRecognizedDays = Σ days(reason)     (경고만, 계산 영향 없음)

  reasonExcludedYears = floor(totalExcludedDays / 365.25)    ← 일 단위 → 연 단위 변환

effectiveYears = max(0, rawYears - reasonExcludedYears)
  ※ minorYearsDeducted는 rawYears 산정 시 effectiveStart로 이미 반영됨(이중 차감 방지)
```

### 핵심 설계 결정 5가지

**결정 1 — 기간 clamp 방식 (effectiveStart~deathDate 구간 내 제한)**

사유 기간(startDate~endDate)이 rawYears 산정 구간(effectiveStart~deathDate) 밖에 있으면
clamp하여 구간 내 겹치는 부분만 차감한다.

```ts
clampedStart = max(reason.startDate, effectiveStart_str)
clampedEnd   = min(reason.endDate, deathDate)
clampedDays  = max(0, differenceInCalendarDays(clampedEnd, clampedStart))
```

이유: 동거 시작 전 기간·미성년 기간·상속개시일 이후 기간은 rawYears에 포함되지 않으므로
차감 대상이 아님. clamp가 effectiveStart 기준이므로 미성년 이중차감 자동 방지.

**결정 2 — 재건축 전세(reconstruction_lease)의 수학적 처리**

법령 문언 §23의2② "산입하지 않는다"가 모든 부득이 사유의 기본 효과이며,
재건축 전세는 해석례에 의해 이 차감을 배제(=원래 rawYears에 그대로 포함)하는 것이다.

`reconstruction_lease` 유형 기간은 rawYears에 이미 포함되어 있으므로
추가 가산도, 추가 차감도 하지 않는다. effectiveYears에 영향 없음.

해석례 미확인 경고: UI에서 "재건축 전세 사유는 교재(재산-248) 근거이며,
세무사 확인을 권장합니다"라는 amber 경고를 표시.

**결정 3 — 국외 대학원(overseas_grad)의 계속성 단절 경고**

국외 대학원 기간은 법정 사유 미해당이므로 effectiveYears에서 차감 불가.
엔진은 이를 경고로만 처리(비차단). 경고 내용:
"국외 대학원 취학 기간은 §20의2② 부득이한 사유에 해당하지 않습니다.
해당 기간의 동거 단절은 10년 계속 동거 요건에 영향을 줄 수 있습니다. 세무사 확인 권장."

**결정 4 — 미성년 기간과 부득이 사유 기간의 중복 처리**

clamp 기준이 `effectiveStart`(= max(cohabitStartDate, adultDate))이므로
미성년 구간(cohabitStartDate~adultDate)에 걸친 사유는 clamp 후 자동으로 성인 이후 기간만 차감.
이중차감 없음 — 별도 보정 로직 불필요.

```
예시: 징집 18세~21세, birthDate=2000-01-01, adultDate=2019-01-01
  effectiveStart = 2019-01-01
  clampedStart = max(징집시작, 2019-01-01) = 2019-01-01
  → 성인 후 2년(2019~2021)만 EXCLUDED 차감 대상
```

**결정 5 — 연 단위 변환 방식**

일 단위 합산 후 `floor(totalDays / 365.25)` 방식(합산 후 1회 변환).
이유: 여러 사유 기간을 각각 연 단위 변환 후 합산하면 floor 오차 누적.
date-fns `differenceInCalendarDays` 사용 (정수 일수, 복수 기간 합산 가능).

**결정 6 — 질병 요양 1년 미만 처리**

시행규칙 §9의2①3호: "1년 이상의 치료나 요양이 필요한 질병". 1년 미만 입력 시
법정 요건 미달 → 차감 없음(clampedDays=0) + `MEDICAL_UNDER_1Y` 경고.
엄격 적용 (자동 차감 금지 정책 부합).

---

## 케이스 인벤토리 (필수)

| # | 사유 유형 | 시나리오 | 입력 요약 | 기대 effectiveYears | 계속성 | anchor ID |
|---|---------|---------|----------|---------------------|--------|-----------|
| R4-1 | `conscription` | 징집 2년, rawYears=14 | reasons=[{conscription, 2012~2014}] | 14-1=13 (730일=floor 1년), meets=true | 유지 | R4-CONSCRIPTION-BASIC |
| R4-2 | `work` | 근무 3년, rawYears=11 | reasons=[{work, 3년}] | 11-2=9 (1096일=floor 2년), meets=false | 유지 | R4-WORK-SHORT |
| R4-3 | `medical` | 질병 요양 11개월(1년 미만) | reasons=[{medical, 2025-01-01~2025-12-01}] | 차감 0 + MEDICAL_UNDER_1Y 경고 | 유지 | R4-MEDICAL-UNDER1Y |
| R4-4 | `medical` | 질병 요양 정확히 365일 | reasons=[{medical, 2020-01-01~2021-01-01}] | 365일=floor 0년 (365/365.25=0.9993→0) → 차감 없음 + 경고 | 유지 | R4-MEDICAL-365DAYS |
| R4-5 | `medical` | 질병 요양 2년(730일) | reasons=[{medical, 2년}] | floor(730/365.25)=1년 차감 | 유지 | R4-MEDICAL-2Y |
| R4-6 | `schooling` | 국내 대학 4년, rawYears=12 | reasons=[{schooling, 4년}] | floor(1461/365.25)=3년 차감 → 9, meets=false | 유지 | R4-SCHOOLING-UNIV |
| R4-7 | `reconstruction_lease` | 재건축 전세 2년, rawYears=10 | reasons=[{reconstruction_lease, 2년}] | 10-0=10, meets=true + amber경고 | 유지 | R4-RECONSTRUCTION-NOOP |
| R4-8 | `overseas_grad` | 국외 대학원 2년, rawYears=12 | reasons=[{overseas_grad, 2년}] | 12-0=12 + rose경고 | 단절경고 | R4-OVERSEAS-GRAD-WARN |
| R4-9 | 중복 기간 | 징집+근무 기간 겹침 2021~2022 | reasons=[{conscription,2020~2022},{work,2021~2023}] | 겹침 구간 union 후 단일 차감(이중차감 없음) | 유지 | R4-OVERLAP-DEDUP |
| R4-10 | 미성년 중복 | 징집 18세~21세, birthDate=2000-01-01 | reasons=[{conscription,2018~2021}], deathDate=2025 | clamp→성인 후 2년만 차감, rawYears=6 → 5 | 유지 | R4-MINOR-OVERLAP |
| R4-11 | rawYears 밖 | 사유 기간이 동거시작 이전 | reasons=[{work, 동거시작 2년 전~1년 전}] | clamp 후 days=0, 차감 없음 | 유지 | R4-OUT-OF-RANGE |
| R4-12 | 복수 사유 | 징집 1년 + 근무 2년(비겹침) | reasons=[{conscription,1년},{work,2년}], rawYears=12 | floor((365+730)/365.25)=2년 차감 → 10 | 유지 | R4-MULTI-REASON |
| R4-13 | migration | Phase 2 cohabitExcludedYears=3, reasons=undefined | cohabitExcludedYears=3, cohabitReasons=undefined | rawYears-3 (legacy fallback), usedLegacyFallback=true | 유지 | R4-MIGRATION-FALLBACK |
| R4-14 | 경계 | 사유 없음, rawYears=10 | reasons=[], rawYears=10 | effectiveYears=10, meets=true | 유지 | R4-EXACT-10Y-NO-REASON |
| R4-15 | 경계 | 징집 1년, rawYears=10 → 미달 | reasons=[{conscription,365일}], rawYears=10 | floor(365/365.25)=0년 → 10-0=10 meets=true ★ (365일=0.9993년→floor 0) | 유지 | R4-EXACT-10Y-CONSCRIPT |

> ★ R4-15 주의: 365일 정확히는 `365/365.25 = 0.9993` → `floor = 0` → 차감 없음.
> 징집 1년 차감을 의도하려면 `366일 이상`이어야 한다. Pre-Do에서 반드시 확인.

---

## calcCohabitYears v2 — 함수 시그니처 (확정)

Phase 2의 `calcCohabitYears(cohabitStartDate, deathDate, birthDate, excludedYears)` 를
아래로 교체한다. **함수 시그니처 변경이므로 Phase 2 호출부도 함께 수정 필요.**

```ts
/**
 * §23의2① 동거연수 계산 v2 — 부득이사유 자동산입.
 * lib/tax-engine/deductions/inheritance-cohabit-helpers.ts
 *
 * @param cohabitStartDate 동거 시작일 (YYYY-MM-DD)
 * @param deathDate        상속개시일 (YYYY-MM-DD)
 * @param birthDate        상속인 생년월일 (optional — 미성년 제외, 2016.1.1.~)
 * @param reasons          부득이한 사유 배열 (undefined=사유 없음 → legacy fallback)
 * @param excludedYearsLegacy Phase 2 수동값 — reasons===undefined 일 때만 사용
 */
export function calcCohabitYears(
  cohabitStartDate: string,
  deathDate: string,
  birthDate: string | undefined,
  reasons: CohabitReason[] | undefined,
  excludedYearsLegacy: number,
): CohabitYearsResult

export interface CohabitYearsResult {
  // Phase 2 호환 필드 (유지 — 외부 소비처 변경 없음)
  rawYears: number;            // effectiveStart → deathDate 연수 (date-fns floor)
  minorYearsDeducted: number;  // echo용 (rawYears 산정에 이미 반영됨)
  effectiveYears: number;      // rawYears - reasonExcludedYears (≥0)
  meetsRequirement: boolean;   // effectiveYears >= 10

  // Phase 4 신규 필드
  reasonBreakdown: CohabitReasonBreakdown[];
  reasonExcludedYears: number;          // floor(totalExcludedDays / 365.25)
  hasOverseasGradWarning: boolean;
  hasReconstructionLeaseNote: boolean;
  hasMedicalUnder1YWarning: boolean;
  usedLegacyFallback: boolean;          // cohabitExcludedYears fallback 사용 여부
}

export interface CohabitReasonBreakdown {
  type: CohabitReasonType;
  inputStartDate: string;
  inputEndDate: string;
  clampedStartDate: string;    // effectiveStart ~ deathDate 구간 clamp
  clampedEndDate: string;
  clampedDays: number;
  effect: "excluded" | "included" | "not_recognized";
  warningCode?: "MEDICAL_UNDER_1Y" | "OVERSEAS_GRAD_CONTINUITY" | "RECONSTRUCTION_UNVERIFIED";
}
```

### 핵심 알고리즘 (의사코드)

```ts
function calcCohabitYears(
  cohabitStartDate, deathDate, birthDate, reasons, excludedYearsLegacy
): CohabitYearsResult {

  // 1. 미성년 제외 → effectiveStart (Phase 2 로직 동일)
  const { effectiveStart, minorYearsDeducted } =
    calcEffectiveStart(cohabitStartDate, deathDate, birthDate)

  // 2. rawYears (effectiveStart 기준 — 미성년 이미 제외)
  const rawYears = max(0, differenceInYears(new Date(deathDate), new Date(effectiveStart)))

  // 3. reasons 없음 → legacy fallback
  if (reasons === undefined) {
    const effectiveYears = max(0, rawYears - excludedYearsLegacy)
    return {
      rawYears, minorYearsDeducted, effectiveYears,
      meetsRequirement: effectiveYears >= 10,
      reasonBreakdown: [], reasonExcludedYears: excludedYearsLegacy,
      hasOverseasGradWarning: false, hasReconstructionLeaseNote: false,
      hasMedicalUnder1YWarning: false, usedLegacyFallback: excludedYearsLegacy > 0,
    }
  }

  // 4. 사유 배열 처리
  const breakdown: CohabitReasonBreakdown[] = []
  let hasOverseasGradWarning = false
  let hasReconstructionLeaseNote = false
  let hasMedicalUnder1YWarning = false

  for (const reason of reasons) {
    const clampedStart = max(reason.startDate, effectiveStart)  // string 비교
    const clampedEnd   = min(reason.endDate, deathDate)
    const clampedDays  = max(0, differenceInCalendarDays(
      new Date(clampedEnd), new Date(clampedStart)
    ))
    const effect = REASON_EFFECT_MAP[reason.type]  // excluded | included | not_recognized

    if (effect === "excluded") {
      if (reason.type === "medical") {
        const totalDays = differenceInCalendarDays(new Date(reason.endDate), new Date(reason.startDate))
        if (totalDays < 365) {
          hasMedicalUnder1YWarning = true
          breakdown.push(buildEntry(reason, clampedStart, clampedEnd, 0, "excluded", "MEDICAL_UNDER_1Y"))
          continue  // 차감 없음
        }
      }
      breakdown.push(buildEntry(reason, clampedStart, clampedEnd, clampedDays, "excluded"))

    } else if (effect === "included") {
      hasReconstructionLeaseNote = true
      breakdown.push(buildEntry(reason, clampedStart, clampedEnd, 0, "included", "RECONSTRUCTION_UNVERIFIED"))

    } else {  // not_recognized
      if (reason.type === "overseas_grad") hasOverseasGradWarning = true
      breakdown.push(buildEntry(reason, clampedStart, clampedEnd, 0, "not_recognized", "OVERSEAS_GRAD_CONTINUITY"))
    }
  }

  // 5. EXCLUDED 구간 union merge → 이중차감 방지
  const totalExcludedDays = mergeAndSumExcludedDays(breakdown)

  // 6. 연 단위 변환 (합산 후 1회)
  const reasonExcludedYears = Math.floor(totalExcludedDays / 365.25)

  // 7. effectiveYears (rawYears는 이미 미성년 제외됨)
  const effectiveYears = max(0, rawYears - reasonExcludedYears)

  return {
    rawYears, minorYearsDeducted, effectiveYears,
    meetsRequirement: effectiveYears >= 10,
    reasonBreakdown: breakdown, reasonExcludedYears,
    hasOverseasGradWarning, hasReconstructionLeaseNote,
    hasMedicalUnder1YWarning, usedLegacyFallback: false,
  }
}

// 효과 매핑 상수
const REASON_EFFECT_MAP: Record<CohabitReasonType, "excluded" | "included" | "not_recognized"> = {
  conscription: "excluded",
  schooling: "excluded",
  work: "excluded",
  medical: "excluded",
  reconstruction_lease: "included",
  overseas_grad: "not_recognized",
}
```

### mergeAndSumExcludedDays (interval union)

```ts
function mergeAndSumExcludedDays(breakdown: CohabitReasonBreakdown[]): number {
  const excluded = breakdown
    .filter(b => b.effect === "excluded" && b.clampedDays > 0)
    .map(b => ({ start: b.clampedStartDate, end: b.clampedEndDate }))
    .sort((a, b) => a.start.localeCompare(b.start))

  if (excluded.length === 0) return 0

  // 정렬 후 인접/겹침 구간 union merge
  const merged: { start: string; end: string }[] = [excluded[0]]
  for (let i = 1; i < excluded.length; i++) {
    const cur = excluded[i]
    const prev = merged[merged.length - 1]
    if (cur.start <= prev.end) {
      prev.end = max(prev.end, cur.end)  // 겹침 → 확장
    } else {
      merged.push(cur)
    }
  }

  return merged.reduce((sum, iv) =>
    sum + differenceInCalendarDays(new Date(iv.end), new Date(iv.start)), 0
  )
}
```

---

## 마이그레이션 전략

### Deprecated 처리

```ts
// Heir 타입에서
/** @deprecated Phase 2. Phase 4에서 cohabitReasons로 대체. 역직렬화 호환용 잔류. */
cohabitExcludedYears?: number;
```

우선순위: `cohabitReasons !== undefined` → reasons 사용 / `cohabitReasons === undefined` → `cohabitExcludedYears ?? 0` fallback.

**마이그레이션 대상 파일**:
- `lib/tax-engine/types/inheritance-gift.types.ts` — `Heir`: `cohabitExcludedYears` @deprecated, `cohabitReasons` 추가
- `lib/tax-engine/deductions/inheritance-cohabit-helpers.ts` — `calcCohabitYears` 시그니처 교체
- `lib/tax-engine/types/inheritance-deduction-detail.types.ts` — `CohabitYearsResult`·`CohabitReasonBreakdown` 추가
- Route Zod `heirSchema` — `cohabitReasons` optional 배열, `cohabitExcludedYears` 잔류
- Store initial/normalize — `cohabitReasons: undefined` 초기값

**저장 데이터 하위 호환**: 기존 `cohabitExcludedYears: 3` sessionStorage → normalize 그대로 통과 → 엔진 fallback → `usedLegacyFallback: true` echo.

---

## 데이터 계약 v2 — UI 시니어 동기화 지점

### 신규 input 필드 (`Heir` 타입, Phase 4)

| 필드 | 타입 | default | 설명 | 14지점 |
|------|------|---------|------|--------|
| `cohabitReasons` | `CohabitReason[]?` | `undefined` | 부득이한 사유 배열. undefined=legacy fallback. []=사유 없음. | ①②③④⑤⑦⑧⑨⑫⑬⑭ |

**기존 필드 상태**:
| 필드 | Phase 2 | Phase 4 |
|------|---------|---------|
| `cohabitStartDate` | 신규 추가 | 유지 |
| `cohabitExcludedYears` | 신규 추가 | @deprecated (잔류, UI 숨김) |
| `cohabitReasons` | 없음 | 신규 추가 |

### 신규 result 필드 (`CohabitDeductionDetail`)

Phase 2의 `cohabitYears` 타입을 `CohabitYearsResult`로 교체 (기존 4개 필드 유지 + 신규 추가):

```ts
// Before (Phase 2)
cohabitYears?: { rawYears: number; minorYearsDeducted: number; effectiveYears: number; meetsRequirement: boolean };

// After (Phase 4) — 타입 교체. 기존 4필드 유지 + 신규 필드 추가
cohabitYears?: CohabitYearsResult;
```

UI 시니어가 읽을 신규 echo 필드:
| 필드 | 렌더 용도 |
|------|---------|
| `reasonBreakdown[]` | 사유별 상세 표 |
| `reasonExcludedYears` | "부득이 사유 차감 N년" |
| `hasOverseasGradWarning` | rose 경고 배지 |
| `hasReconstructionLeaseNote` | amber 주의 배지 |
| `hasMedicalUnder1YWarning` | amber "1년 미만" 경고 |
| `usedLegacyFallback` | slate "구형 입력" 배지 |

### 14지점 영향

| 지점 | 위치 | 변경 내용 |
|------|------|---------|
| ① 폼 상태 | `calc-wizard-store.ts` | `Heir.cohabitReasons: undefined` 초기값 |
| ② initial | 동상 | `cohabitReasons: undefined` |
| ③ normalize | 동상 | `CohabitReason[]` 배열 그대로 통과 (ISO string, Date 변환 불필요) |
| ④ API 변환 | `lib/calc/inheritance-api.ts` | Heir spread → 자동 포함 |
| ⑤ UI 위젯 | `HeirComposition.tsx` | `cohabitExcludedYears` DecimalInput 숨김 + `CohabitReasonsInput` 배열 신규 |
| ⑥ 사이드바 | 해당 없음 | — |
| ⑦ 결과 카드 | `CohabitDeductionDetailCard` | `reasonBreakdown` 표 + 경고 배지 3종 |
| ⑧ validation | `lib/calc/inheritance-validate.ts` | `startDate < endDate`, `endDate <= deathDate` Zod refine |
| ⑨ Zod enum | route Zod | `cohabitReasonTypeSchema` + `cohabitReasonSchema` 신규 |
| ⑩ 컴패니언 | 해당 없음 | — |
| ⑪ acqDate fallback | 해당 없음 | — |
| ⑫ Zod 입력 객체 | `heirSchema` | `cohabitReasons: z.array(cohabitReasonSchema).optional()` |
| ⑬ body spread | `callInheritanceTaxAPI` | Heir spread → 자동 포함 |
| ⑭ Route 매핑 | route handler | ISO string 그대로 (Date 변환 없음) |

---

## Pre-Do anchor 설계 (RED 확보)

테스트 파일: `__tests__/tax-engine/inheritance/cohabit-reasons.test.ts`

### A. 제외 사유 차감 — R4-CONSCRIPTION-BASIC

```ts
// 입력
cohabitStartDate = "2010-01-01"
deathDate = "2024-01-01"   // rawYears = 14
birthDate = undefined
reasons = [{ type: "conscription", startDate: "2012-01-01", endDate: "2014-01-01" }]
// clampedDays = 730, floor(730/365.25) = 1

// 기대값
expect(result.rawYears).toBe(14)
expect(result.reasonExcludedYears).toBe(1)
expect(result.effectiveYears).toBe(13)
expect(result.meetsRequirement).toBe(true)
expect(result.usedLegacyFallback).toBe(false)

// 현행(Phase 2 함수 시그니처 4인수): reasons 파라미터 없음 → 컴파일 오류 → RED
```

### B. 재건축 전세 산입 — R4-RECONSTRUCTION-NOOP

```ts
cohabitStartDate = "2010-01-01"
deathDate = "2021-01-01"   // rawYears = 11
reasons = [{ type: "reconstruction_lease", startDate: "2016-01-01", endDate: "2018-01-01" }]

expect(result.reasonExcludedYears).toBe(0)   // INCLUDED → 차감 없음
expect(result.effectiveYears).toBe(11)
expect(result.hasReconstructionLeaseNote).toBe(true)
expect(result.reasonBreakdown[0].effect).toBe("included")
expect(result.reasonBreakdown[0].warningCode).toBe("RECONSTRUCTION_UNVERIFIED")
```

### C. 국외 대학원 불인정 + 단절 경고 — R4-OVERSEAS-GRAD-WARN

```ts
cohabitStartDate = "2010-01-01"
deathDate = "2024-01-01"   // rawYears = 14
reasons = [{ type: "overseas_grad", startDate: "2015-01-01", endDate: "2017-01-01" }]

expect(result.reasonExcludedYears).toBe(0)   // NOT_RECOGNIZED → 차감 없음
expect(result.effectiveYears).toBe(14)
expect(result.hasOverseasGradWarning).toBe(true)
expect(result.reasonBreakdown[0].effect).toBe("not_recognized")
```

### D. 미성년 중복 비이중차감 — R4-MINOR-OVERLAP

```ts
// birthDate = 2000-01-01, adultDate = 2019-01-01
// cohabitStartDate = 2010-01-01
// effectiveStart = max("2010-01-01", "2019-01-01") = "2019-01-01"
// deathDate = 2025-01-01, rawYears = differenceInYears(2025-01-01, 2019-01-01) = 6
cohabitStartDate = "2010-01-01"
deathDate = "2025-01-01"
birthDate = "2000-01-01"
reasons = [{ type: "conscription", startDate: "2017-01-01", endDate: "2021-01-01" }]
// clampedStart = max("2017-01-01", "2019-01-01") = "2019-01-01"
// clampedEnd   = min("2021-01-01", "2025-01-01") = "2021-01-01"
// clampedDays  = 730, reasonExcludedYears = 1

expect(result.rawYears).toBe(6)
expect(result.minorYearsDeducted).toBe(9)   // echo용 (rawYears 산정에 이미 반영)
expect(result.reasonExcludedYears).toBe(1)
expect(result.effectiveYears).toBe(5)        // 6 - 1 (이중차감 없음)
expect(result.meetsRequirement).toBe(false)
```

---

## 자동 판정 vs 임의 안분 — 정책 명확화

본 Phase는 **법령 결정적 파생**이며 임의 안분 fallback이 아니다:

- 사용자가 `CohabitReason.type = "conscription"` 과 기간을 명시적으로 입력하면
  엔진이 시행규칙 §9의2 법정 목록에 따라 법적 효과(EXCLUDED)를 자동 적용.
- 빈값 자동채움 없음 — `cohabitReasons` 미입력 시 `undefined`로 통과, 차감 없음.
- 재건축 전세 해석례 불확실성은 UI 경고로 고지.
- `feedback_no_silent_apportion_fallback` 정책의 "빈 값을 자동으로 채워 세금을 계산"에
  해당하지 않음 — 입력된 사유의 법령 분류일 뿐.

---

## Definition of Done — Phase 4

- [ ] `CohabitReasonType` 타입 + `CohabitReason` interface + `REASON_EFFECT_MAP` 상수 추가
- [ ] `CohabitYearsResult` + `CohabitReasonBreakdown` 타입 추가 (`inheritance-deduction-detail.types.ts`)
- [ ] `Heir.cohabitReasons?: CohabitReason[]` 추가 + `cohabitExcludedYears` @deprecated JSDoc
- [ ] `calcCohabitYears` 시그니처 교체 (5인수: reasons + excludedYearsLegacy)
- [ ] `mergeAndSumExcludedDays` interval union merge 헬퍼 구현
- [ ] `medical` 1년 미만 경고(차감 없음) 처리
- [ ] `reconstruction_lease` INCLUDED + `RECONSTRUCTION_UNVERIFIED` 경고
- [ ] `overseas_grad` NOT_RECOGNIZED + `OVERSEAS_GRAD_CONTINUITY` 경고
- [ ] `cohabitReasons === undefined` → `cohabitExcludedYears` legacy fallback
- [ ] Zod `cohabitReasonTypeSchema` + `cohabitReasonSchema` + `heirSchema` 확장 (⑨⑫)
- [ ] UI: `cohabitExcludedYears` DecimalInput 숨김 + `CohabitReasonsInput` 배열 입력 위젯 (⑤)
- [ ] 결과 카드: `reasonBreakdown` 표 + 경고 배지 3종 (⑦)
- [ ] validation: `startDate < endDate`, `endDate ≤ deathDate` 검증 (⑧)
- [ ] Pre-Do anchor A·B·C·D RED 확보 후 GREEN
- [ ] anchor R4-1~R4-15 전부 GREEN
- [ ] `npx tsc --noEmit` 0건 / `npm test` 전체 통과
