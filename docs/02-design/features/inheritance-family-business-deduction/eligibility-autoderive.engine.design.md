# 가업상속공제 요건 자동판정 (eligibility-autoderive) — 엔진 설계

> 계획서: `docs/00-pm/inheritance-family-business-eligibility-autoderive.plan.md`
> 법령: 상증법 §18의2 + §67 / 상증령 §15③ (KoreanLaw mst=283637 시행 2026-02-27 직접 검증)
> 기반: `inheritance-family-business-deduction.engine.design.md`(기존 v2) 확장. 자동도출 레이어만 추가.

## Context

가업상속공제 요건(상증령 §15③)이 전부 사용자 수동 `boolean` 토글이라 입력오류·기간계산오류를 검증할 수 없다. 날짜·텍스트(`openingDate`·`decedentCeoTenure`·`heirEngagementPeriod`·`heirOfficerAppointDate`)는 "계산 미사용 표시 전용"으로 신고서(`deduction-besshi-data.ts`)에만 쓰이고 요건판정과 단절. 본 설계는 **기초데이터(생년월일·날짜·지분율)로 요건을 엔진이 자동 판정**하고(store=base-data, 엔진=도출, UI=미리보기), 법령상 자동 불가 항목만 3-state override로 보정한다.

핵심 결정(계획 §3): ① 자동 1차 + 접힌 3-state override ② store엔 기초데이터만, 엔진이 계산 시점에 resolve(미러링 금지 양립) ③ 가업상속인 `Heir.birthDate` 재사용(`heirId` 연결) ④ **18세 ≠ 19세**(§15③2호가는 18세, `resolveMinorBeneficiary`는 민법§4 19세 — 재사용 금지).

---

## ★ 케이스 인벤토리 (anchor 약속 — Phase 1)

테스트 파일: `__tests__/tax-engine/inheritance/family-business-autoderive.test.ts`

| # | 시나리오 | 법령 근거 | anchor 출처 | 상태 |
|---|---------|----------|-------------|------|
| 1 | 18세 생일 당일 상속개시 → 충족 | §15③2호가 | 만나이 경계(생일=기준일 만18세) | ☐ |
| 2 | 18세 생일 전날 상속개시 → 미충족 | §15③2호가 | 만17세 | ☐ |
| 3 | birthDate 미입력 → false(보수적) | §15③2호가 | 미입력 정책 | ☐ |
| 4 | heirIsAdultOverride=true + birthDate 미입력 → 충족 | 결정1 override | override 우선 | ☐ |
| 5 | heirId의 Heir.birthDate 사용 → 충족 | 결정3 | Heir 연결 | ☐ |
| 6 | Heir.birthDate 없음 + familyBusiness.heirBirthDate fallback | 결정3 R2 | fallback | ☐ |
| 7 | 신고기한: 상속 2024-03-15 → 2024-09-30 | §67 말일+6M | endOfMonth | ☐ |
| 8 | 신고기한: 상속 2024-08-31 → 2025-02-28 | §67 | 2월 말일 보정 | ☐ |
| 9 | 신고기한: 상속 2024-01-31 → 2024-07-31 | §67 | — | ☐ |
| 10 | 임원취임 = 신고기한 당일 → 충족(다) | §15③2호다 | `<=` 경계 | ☐ |
| 11 | 임원취임 = 신고기한 +1일 → 미충족(다) | §15③2호다 | — | ☐ |
| 12 | 임원취임 미입력 → false(다) | §15③2호다 | 미입력 | ☐ |
| 13 | 대표취임 = 신고기한 +2년 당일 → 충족(라) | §15③2호라 | addYears 경계 | ☐ |
| 14 | 대표취임 = 신고기한 +2년 +1일 → 미충족(라) | §15③2호라 | — | ☐ |
| 15 | OFZ(특구 소재+50%) + 대표취임 미입력 → 라목 면제 충족 | 상증령 §15㉕ | 기존 ofzExempted 보존 | ☐ |
| 16 | 종사시작 = 상속개시 2년 전 당일 → 충족(나) | §15③2호나 | 2년 경계 | ☐ |
| 17 | 종사기간 1년 364일 → 미충족(나) | §15③2호나 | — | ☐ |
| 18 | decedentEarlyDeath=true(65세 단서) + 종사 미입력 → 나목 면제 충족 | §15③2호나 단서 | 수동 토글 면제 | ☐ |
| 19 | 영위연수 제안: 개업 2004-01-01 상속 2024-01-01 → 20(2호캡 400억) | §18의2① | suggest 제안값 | ☐ |
| 20 | legacy: 구 boolean 직접입력(기초데이터 없음) → 기존 동작 100% 보존 | 하위호환 | 회귀 | ☐ |
| 21 | 전 요건 충족 자연인 가업상속인 → eligible=true | §15③ | 통합 | ☐ |

> Phase 2(후속 PR) 케이스: 지분 10년보유(가)·대표이사 3대안(나)·종사 영위기간교차·다구간·배우자간주 — 별도 인벤토리.

---

## 법령 근거

```
상증법 §67①: 상속개시일이 속하는 달의 말일부터 6개월 (신고기한)
상증령 §15③2호가: 상속개시일 현재 18세 이상
상증령 §15③2호나: 상속개시일 전에 §1호나목 영위기간 중 2년 이상 직접 가업 종사
                  (단서: 피상속인 65세 이전 사망 or 천재지변·인재 사망 시 면제)
상증령 §15③2호다: 상속세 과세표준 신고기한까지 임원 취임
상증령 §15③2호라: 상속세 과세표준 신고기한부터 2년 이내 대표이사등 취임
상증령 §15㉕:    기회발전특구 특례 — 라목·§11①1호 적용 배제
```
법령코드 상수: `INH.FAMILY_BUSINESS_DEDUCTION`(기존) 재사용. 신고기한 §67 상수 신규 시 `legal-codes/inheritance-gift.ts`.

---

## 엔진 input 타입 (`types/inheritance-family-business.types.ts` 확장)

```ts
export interface FamilyBusinessInheritanceInput {
  // ... 기존 필드 전부 유지 (boolean·string·deathDate 등) ...

  // ── 자동판정 Phase 1 (신규) ──
  /** 가업상속인 Heir.id — Heir.birthDate 재사용(§20·§27 단일소스). corporate 지정 불가(validate). */
  heirId?: string;
  /** 가업상속인 생년월일 — heirId의 Heir.birthDate 미입력 시 fallback (ISO date). */
  heirBirthDate?: string;
  /** 상속인 가업종사 시작일 — 2년 종사(나목) 자동판정. (ISO date, 기존 heirEngagementPeriod string 승격) */
  heirEngagementStartDate?: string;
  /** 상속인 대표이사 취임(예정)일 — 라목 2년내 자동판정. (ISO date) */
  heirCEOAppointDate?: string;

  // ── 3-state override (undefined=자동 / true·false=수동, 결정1) ──
  heirIsAdultOverride?: boolean;
  heirOfficerByFilingDeadlineOverride?: boolean;
  heirCEOWithinTwoYearsOverride?: boolean;
  heirTwoYearEngagementOverride?: boolean;

  // ── Phase 2 (후속) ──
  // decedentShareRatioNum?, decedentShareAcquiredDate?, decedentCEOPeriods?[], *Override?
}
```
- `openingDate`·`heirOfficerAppointDate`(기존 표시전용 날짜)는 **계산용으로 승격 재사용**.
- 기존 string(`decedentCeoTenure`·`decedentShareRatio`·`heirEngagementPeriod`)은 신고서 호환 유지(Zod 부재 = client-only).

## 엔진 result 타입 (`FamilyBusinessDeductionDetail` 확장)

```ts
// breakdown(CalculationStep[])에 자동판정 근거 step 추가 — 신규 필드 불필요(기존 breakdown 활용).
// 선택: 요건별 source 노출용 메타
resolvedRequirements?: {
  filingDeadline: string;
  source: Record<"heirIsAdult"|"heirOfficerByFilingDeadline"|"heirCEOWithinTwoYears"|"heirTwoYearEngagement", "auto"|"override"|"legacy">;
};
```
- `FamilyBusinessDeductionDetail`(types:176~212)에 `resolvedRequirements?` optional 추가. `calcFamilyBusinessDeductionPhase2`(family-business.ts:182)에 `resolvedMeta?` **additive optional** 인자(기존 호출 하위호환) → detail.resolvedRequirements로 echo. breakdown step에 신고기한·요건별 source 텍스트 포함.
- **가업상속인명**: result에 `heirId` 직접 노출 금지([[feedback_no_internal_id_in_result]]). UI 결과카드가 `form.heirs`에서 `heirId`→`name` resolve(없으면 관계 라벨). 엔진 result 변경 없음.

신규 Date 필드는 ISO 문자열(YYYY-MM-DD)로 전달 — `date-coerce` 불필요(엔진 내부 `parseISO`). 라우트는 deductionInput 통째 cast(변환 없음).

---

## 계산 알고리즘

신규 파일 `lib/tax-engine/deductions/family-business-autoderive.ts` (family-business.ts 377줄 → sibling 분리, re-export 보존).

> ⚠️ **타입 일관성(CLAUDE.md date-coerce)**: 모든 날짜 인자는 ISO 문자열(YYYY-MM-DD). date-fns(`differenceInYears`·`addYears`·`endOfMonth`)는 **Date 인자** → 함수 내부에서 `parseISO` 후 사용. 날짜 **비교는 동일 타입**으로 — 문자열끼리(`<=`, 사전순) 또는 Date끼리. `string <= Date` 혼합 비교 금지(silent false 함정).

```
순수 함수 (date-fns: differenceInYears·endOfMonth·addMonths·addYears·parseISO·format):
1. calcInheritanceFilingDeadline(deathDate: string): string
   = format(addMonths(endOfMonth(parseISO(deathDate)), 6), "yyyy-MM-dd")   // §67, YYYY-MM-DD 보장
2. deriveFBHeirIsAdult(birthDate?, deathDate): boolean
   = birthDate ? differenceInYears(parseISO(deathDate), parseISO(birthDate)) >= 18 : false   // 18세(19 아님)
3. deriveFBHeirOfficerByDeadline(appointDate?, deadline): boolean
   = appointDate ? appointDate <= deadline : false        // 둘 다 YYYY-MM-DD 문자열 → 사전순 비교
4. deriveFBHeirCEOWithinTwoYears(ceoDate?, deadline): boolean
   const limit = format(addYears(parseISO(deadline), 2), "yyyy-MM-dd")
   = ceoDate ? ceoDate <= limit : false                   // 문자열끼리 비교(Date<string 금지)
5. deriveFBHeirEngagement(startDate?, deathDate, earlyDeath): boolean
   = earlyDeath ? true
     : (startDate ? differenceInYears(parseISO(deathDate), parseISO(startDate)) >= 2 : false)
   // Phase 1 단순화: 단일 연속구간(start→death). "영위기간 중 교차"·다구간은 Phase 2.
6. suggestFBOperatingYears(openingDate, deathDate): number
   = differenceInYears(parseISO(deathDate), parseISO(openingDate))   // UI 제안값 전용(자동 덮어쓰기 아님)

resolveFamilyBusinessRequirements(input, heirBirthDate?, deathDate):
  deadline = calcInheritanceFilingDeadline(deathDate)
  각 요건 = override(*Override != null) ?? auto(기초데이터 존재) ?? legacy(구 boolean) ?? false
  // ⚠️ Phase 1 덮어쓰기 범위 = 4개 heir 요건만:
  //    heirIsAdult · heirTwoYearEngagement · heirOfficerByFilingDeadline · heirCEOWithinTwoYears
  //    decedent 요건(가목 지분·나목 대표이사)·spouseFulfillsRequirements·OFZ는 Phase 1 미변경(legacy 통과).
  //    → evaluateFamilyBusinessEligibility의 spouse-skip·ofzExempted 로직 정상 동작.
  반환 { resolvedInput: FamilyBusinessInheritanceInput,   // 기존 객체 + 4개 heir boolean만 덮어쓴 사본
         filingDeadline: deadline,
         source: Record<4개 heir 요건, "auto"|"override"|"legacy"> }
```

**통합점**: `inheritance-deductions.ts:651` (감싸는 `calcInheritanceDeductions:527`에 `input.heirs`·`baseDate` 스코프 내):
```ts
if (input.familyBusiness) {
  const heirBirthDate = input.heirs.find(h => h.id === input.familyBusiness!.heirId)?.birthDate
    ?? input.familyBusiness.heirBirthDate;
  const resolved = resolveFamilyBusinessRequirements(input.familyBusiness, heirBirthDate, baseDate);
  return calcFamilyBusinessDeductionPhase2({
    input: resolved.resolvedInput,   // ← resolved boolean 덮어쓴 객체 (source/filingDeadline은 별도)
    resolvedMeta: { filingDeadline: resolved.filingDeadline, source: resolved.source },  // detail 노출용
    /* estateItems·familyBusinessValueOverride·taxIfNoFBD·lawRef 기존 */
  });
}
```
- `evaluateFamilyBusinessEligibility`(family-business.ts:64) 시그니처 보존 — resolved boolean을 덮어쓴 객체 소비.
- **OFZ 면제 이중처리 금지**: resolve는 `heirCEOWithinTwoYears` raw만 산출. §15㉕ 면제는 기존 evaluator `:108~110` `ofzExempted` 유지.
- legacy(구 boolean)·Phase E(directAmount) 분기 100% 보존.

---

## Silent fallback / 자동 안분 후보 식별

- **금지**: 기초데이터 미입력 시 요건을 자동 충족(true)으로 채우지 않는다 → `false`(미충족) 후 UI 안내. ([[feedback_no_silent_apportion_fallback]])
- **영위연수**: `suggestFBOperatingYears`는 **제안값**(UI가 `operatingYears` 빈칸일 때 채움 제안), 자동 덮어쓰기 아님. 캡은 `familyBusinessCap` 단일소스.
- **override > auto > legacy > false** 우선순위 고정. 미러링(useEffect→store) 없음 — store엔 기초데이터만.
- **validate(⑧)**: 날짜 정합성(종사시작>상속개시·취임일>신고기한+2년·재직 시작>종료) 차단. `filingDeadline`은 validate·UI 동일 `calcInheritanceFilingDeadline` 사용(모순 방지).

---

## 테스트 약속

- 케이스 인벤토리 21행 전부 anchor 1+개. 경계는 §15③·§67 직접 산정(±1일).
- legacy 회귀(케이스 20) — 구 boolean 직접입력 시 기존 4,966+ anchor 영향 0 확인.
- Pre-Do anchor 우선([[feedback_pre_anchor_verification]]): 케이스 7(신고기한 2024-03-15→2024-09-30)·케이스 2(18세 전날 미충족)를 Do 진입 전 1건 실행해 도출 함수 부재 실패 확보.

---

## UI 통합 위임

UI 명세는 `eligibility-autoderive.ui.design.md`. 8개 동기화 지점 중 UI측(① 폼상태·⑤ 위젯·⑥ 사이드바·⑦ 결과카드·⑧ validate) UI 시니어 책임. 엔진측 게이트는 **⑫ Zod**(property-valuation-input.ts:656~681 신규 필드 추가 — 미추가 시 침묵 strip) + 통합점(inheritance-deductions.ts:651).
