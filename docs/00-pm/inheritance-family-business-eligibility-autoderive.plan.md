# 가업상속공제 요건 "기초데이터 → 시스템 자동판정" 전환 계획

> 작성: 2026-06-02 / 브랜치: `worktree-inheritance-family-business-autoderive` (origin/master 기반)
> 법령: 상증법 §18의2 + 상증령 §15 (KoreanLaw MCP `get_law_text` mst=283637, 시행 2026-02-27 직접 검증)
> 엔진 시니어 + UI 시니어 Plan 병렬 산출 → 수렴·정정 통합본

---

## 1. 문제 진단 (현재 상태 — 실측 file:line)

### 1-1. 사용자 지적
가업상속공제 요건 입력 화면이 "너무 형식적"이다. 요건이 전부 사용자가 직접 켜는 on/off 토글이라 **입력오류·기간계산오류를 검증할 수 없다**. 기초데이터(생년월일·날짜·지분율)를 입력받아 **시스템이 충족 여부를 자동 판정**해야 한다. 예: 가업종사기간은 시작일·종료일(상속개시일)로 자동계산→충족판정, 18세는 생년월일+상속개시일로 자동판정.

### 1-2. 근본 원인 — 날짜·텍스트와 요건판정의 단절
| 위치 | 사실 |
|---|---|
| `lib/tax-engine/types/inheritance-family-business.types.ts:54~80` | 요건이 전부 `boolean`: `decedentCEORequirementMet`·`decedentMajorShareholdingMet`·`heirIsAdult`·`heirTwoYearEngagement`·`heirOfficerByFilingDeadline`·`heirCEOWithinTwoYears` |
| `:113~131` | 날짜·텍스트 필드(`decedentCeoTenure:"20년"`·`decedentShareRatio:"60%"`·`heirEngagementPeriod`·`openingDate`·`heirOfficerAppointDate`)는 주석에 **"별지 제1호서식 표시 전용 (계산 미사용)"** |
| `lib/tax-engine/deductions/family-business.ts:64` `evaluateFamilyBusinessEligibility` | boolean 플래그를 그대로 소비. **날짜 기반 도출 0건** |
| `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:193~222` | "표시 정보(계산에는 사용되지 않음)" 박스. 날짜·텍스트는 표시만, 요건은 별도 ToggleCard 수동 |
| `components/calc/inheritance/steps.tsx:405` (워크트리 origin/master 기준 — v3 브랜치는 464) | `<FamilyBusinessEligibilitySection familyBusiness onChange/>` — **`deathDate`·`heirs` 미전달** (자동도출의 핵심 누락). 인접 영농 섹션은 둘 다 받음 |

### 1-3. 중요 정정 — "표시전용"은 신고서에서 실제 소비됨
`lib/calc/deduction-besshi-data.ts:473~488`이 `openingDate`·`decedentCeoTenure`·`decedentShareRatio`·`heirEngagementPeriod`·`heirOfficerAppointDate`를 **별지 제1호서식 자동채움에 사용 중**. 따라서:
- "계산 미사용"은 맞지만 **신고서에는 쓰임** → 신규 구조화 필드는 기존 string과 **병존 + 신고서 동기화** 필요(제거 금지).
- 신규 구조화 필드(날짜·숫자)를 단일 진실로 삼고, `deduction-besshi-data.ts`가 그것을 포맷해 신고서 string을 도출하도록 연계 ([[feedback_detailed_statement_formula_sync]]).

---

## 2. 법령 근거 (상증령 §15③ — mst=283637 직접 인용)

### 피상속인 요건 §15③1호
- **가목**(법인 한정): 최대주주등+특수관계인 합산 지분 **40%(상장 20%) 이상을 10년 이상 계속 보유**
- **나목**: 가업 영위기간 중 다음 중 하나의 기간을 **대표이사등으로 재직**:
  1) 영위기간의 **100분의 50 이상**의 기간
  2) **10년 이상**의 기간 (상속인이 승계하여 승계한 날부터 상속개시일까지 계속 재직한 경우 한정)
  3) **상속개시일부터 소급하여 10년 중 5년 이상**의 기간

### 상속인 요건 §15③2호 (배우자가 가~라 모두 충족 시 상속인 충족 간주)
- **가목**: **상속개시일 현재 18세 이상**
- **나목**: 상속개시일 전에 §1호나목 영위기간 중 **2년 이상 직접 가업 종사**. 단서: 피상속인 65세 이전 사망 or 천재지변·인재 사망 시 면제
- **다목**: **상속세 과세표준 신고기한까지 임원 취임**
- **라목**: **상속세 과세표준 신고기한부터 2년 이내 대표이사등 취임**

### 신고기한 (상증법 §67①)
상속개시일이 속하는 달의 **말일부터 6개월**.
- 검증된 산식: `lib/calc/filing-form-9-data.ts:213` `deriveDueDates` = `addMonths(endOfMonth(parseISO(deathDate)), 6)` — **말일기산 정확** (단 client private 함수, 엔진 레이어엔 §67 헬퍼 없음).
- ⚠️ `lib/tax-engine/acquisition-timing.ts`의 `addMonths(date, 6)`는 말일기산 미반영 — 본 작업에서 사용 금지, 별도 산정.

---

## 3. 설계 원칙 (두 시니어 수렴 — 핵심 결정)

### 결정 1 — 자동도출 1차 + 3-state override (= 사용자 요구 "시스템이 판정")
각 요건은 기초데이터로 자동 도출한 boolean이 **1차 진실이자 기본 표시값**. edge case용 `*Override?: boolean` 3-state(`undefined`=자동 / `true`·`false`=수동) 추가 — `Heir.isMinorOverride`(types:574, 엔진 `resolveMinorBeneficiary` inheritance-gift-common.ts:487) 패턴 그대로.
- 토글이 "1차"가 아니라 **자동판정이 1차**, override는 예외 경로(접힌 "수동 보정") → 사용자 불만("형식적 토글") 해소.

### 결정 2 — store=기초데이터, 엔진=도출 (미러링 금지 정책과 양립)
> UI 시니어가 우려한 "자동값을 store boolean에 useEffect→set 미러링(금지)" 문제의 해법.

- **store에는 기초데이터(날짜·숫자)만 저장**. boolean 요건은 store에 쓰지 않는다.
- **엔진이 계산 시점에** `resolveFamilyBusinessRequirements(input, heirBirthDate, deathDate)`로 요건 boolean을 도출 → `evaluateFamilyBusinessEligibility` 소비.
- **UI 미리보기**는 동일 도출 함수를 `useMemo`로 호출해 표시만(단방향, store 미기록).
- 결과: 사용자 요구(엔진까지 자동판정 도달) + 미러링 금지 정책 **동시 충족**.

> ⚠️ 이는 영농의 "옵션 A"(자동은 안내용·최종은 사용자 boolean)와 다르다. 사용자가 거부한 그 방식이 아니라, **엔진이 실제로 자동판정**한다. (UI 시니어 Plan의 "Phase 1=미리보기 전용"은 본 결정으로 정정 — 엔진 도달이 Phase 1 핵심)

### 결정 3 — 가업상속인 Heir 연결 (`heirId`)
`FamilyBusinessInheritanceInput`에 `heirId?: string` 추가 → orchestrator가 `input.heirs.find(h => h.id === heirId)?.birthDate`로 birthDate 도출해 resolve에 주입. `Heir.birthDate`(types:548) 단일소스 재사용(§20·§27과 동일). `relation==="corporate"`(영리법인)는 가업상속인 지정 불가(검증 차단). Phase 1은 단일 가업상속인.

### 결정 4 — 18세 ≠ 19세 (정정)
§15③2호가목은 **만 18세 이상**. `resolveMinorBeneficiary`는 민법 §4 기준 **19세**(미성년) — **직접 재사용 금지**. 신규 `deriveFBHeirIsAdult(birthDate, deathDate) = differenceInYears(deathDate, birthDate) >= 18`. (UI 시니어 Plan의 "19세 역방향"은 본 항목으로 정정)

---

## 4. 요건별 자동판정 매트릭스

| 요건 (조문) | 기초데이터 입력 | 자동판정 산식 | Phase | 법령정밀 리스크 |
|---|---|---|---|---|
| **영위연수** (§18의2① 한도) | `openingDate` + `deathDate` → 기존 `operatingYears`(캡 구동 필드) | `differenceInYears(death, opening)` 을 **제안값**으로 → `operatingYears`에 채움+override. 캡은 `familyBusinessCap(operatingYears)` 단일소스 유지 | 1 | 中 — 영위기간 법적정의(폐업·법인전환)≠개업일 단순차 → 제안+override |
| **18세 이상** (§15③2호가) | 가업상속인 `Heir.birthDate` + `deathDate` | `differenceInYears(death, birth) >= 18` | 1 | 低 |
| **상속인 2년 종사** (§15③2호나) | `heirEngagementStartDate` + `deathDate` (+ `decedentEarlyDeath` **수동 토글**, Zod 669 기존) | `decedentEarlyDeath || differenceInYears(death, start) >= 2` (단일 연속구간) | 1 | 中 — "직접 종사" 실질·"영위기간 중"·다구간 → override |
| **신고기한 임원취임** (§15③2호다) | `heirOfficerAppointDate` + 신고기한 | `appointDate <= filingDeadline` | 1 | 低 |
| **2년내 대표이사** (§15③2호라) | `heirCEOAppointDate` + 신고기한 | `ceoDate <= addYears(filingDeadline, 2)` (OFZ 특례 면제 유지) | 1 | 低 |
| **피상속인 대표이사 종사** (§15③1호나) | `decedentCEOPeriods[]` + `openingDate` + `deathDate` | 3대안 OR (50%↑ / 10년승계 / 소급10년중5년) | 2 | 高 — 나목2호 "승계" 자동불가, 비연속 재직 |
| **최대주주 지분 10년보유** (§15③1호가) | `decedentShareRatioNum` + `decedentShareAcquiredDate` + `isListed` | `ratio>=기준(0.4/0.2) AND 보유년>=10` | 2 | 高 — "계속 보유"(재취득 없음) 자동불가 |
| **배우자 간주** (§15③2호 후단) | 배우자 Heir 요건 4종 | 가~라 전부 충족 | 3 | 高 — 배우자 식별·요건 자동도출 |

---

## 5. 엔진 설계

### 5-1. 신규 파일 `lib/tax-engine/deductions/family-business-autoderive.ts`
`family-business.ts`(현 377줄)에 derive 함수 추가 시 800줄 근접 → **sibling 분리**. `family-business.ts`에서 `export * from "./family-business-autoderive"` re-export(import 사이트 무변경, [[feedback_800line_split_export_preservation]]).

순수 함수 명세:
- `calcInheritanceFilingDeadline(deathDate): string` — §67 `format(addMonths(endOfMonth(parseISO(deathDate)),6),"yyyy-MM-dd")`. 검증된 `deriveDueDates`(filing-form-9-data.ts:213, **private**)와 동일 산식. **반환은 YYYY-MM-DD 형식 보장** → 후속 날짜비교(`<=`)는 문자열 사전순 비교 가능. (단일소스화 — filing-form-9-data.ts private 함수를 본 엔진 헬퍼 import로 교체는 **선택적 후속 리팩터**, Phase 1 필수 아님)
- `deriveFBHeirIsAdult(birthDate, deathDate): boolean` — `>= 18` (19 아님)
- `deriveFBHeirOfficerByDeadline(appointDate, filingDeadline): boolean` — `appointDate <= filingDeadline` (둘 다 YYYY-MM-DD 전제, DateInput 출력)
- `deriveFBHeirCEOWithinTwoYears(ceoDate, filingDeadline): boolean` — `<= addYears(deadline, 2)`
- `deriveFBHeirEngagement(startDate, deathDate, earlyDeath): boolean` — `earlyDeath || diffYears>=2` (Phase 1 단일구간)
- `suggestFBOperatingYears(openingDate, deathDate): number` — `differenceInYears` **제안값**(자동 덮어쓰기 아님 — UI가 `operatingYears` 빈칸일 때 채움 제안). 캡은 기존 `familyBusinessCap` 단일소스.
- (Phase 2) `deriveFBDecedentCEO(periods, openingDate, deathDate)` / `deriveFBDecedentShareholding(ratio, acquiredDate, deathDate, isListed)`
- `resolveFamilyBusinessRequirements(input, heirBirthDate, deathDate)` — 각 요건 resolve: `*Override != null` → override / 기초데이터 존재 → 자동도출 / 구 boolean → legacy fallback / 전부 미입력 → `false`. **Phase 1 덮어쓰기 = 4개 heir 요건만**(decedent 요건·spouse·OFZ는 legacy 통과). 반환 `{ resolvedInput(4 heir boolean 덮어쓴 사본), filingDeadline, source{ [요건]: "auto"|"override"|"legacy" } }`(엔진 설계 §계산알고리즘과 동일 형상).

### 5-2. 타입 확장 (`inheritance-family-business.types.ts`)
- `heirId?: string` (결정 3)
- Phase 1 기초데이터: `heirBirthDate?`(heirId 미설정 fallback)·`heirEngagementStartDate?`·`heirCEOAppointDate?`. (`openingDate`·`heirOfficerAppointDate`는 기존 재사용)
- Phase 1 override 3-state: `heirIsAdultOverride?`·`heirOfficerByFilingDeadlineOverride?`·`heirCEOWithinTwoYearsOverride?`·`heirTwoYearEngagementOverride?`
- Phase 2: `decedentShareRatioNum?`·`decedentShareAcquiredDate?`·`decedentCEOPeriods?[]`·`*Override?` 추가
- **기존 boolean 필드 유지** — Zod required(666~671)·legacy fallback. resolve가 override·자동도출 우선, 미입력 시 이 boolean fallback.
- **기존 string 표시필드(`decedentCeoTenure`·`decedentShareRatio`·`heirEngagementPeriod`) 유지** — ⚠️ 실측: **Zod에 없음 = 엔진 미도달**, 오직 client `deduction-besshi-data.ts`가 신고서용으로 직접 읽음. 신규 구조화 필드를 besshi가 포맷해 도출하므로 향후 제거 가능하나 Phase 1은 병존(신고서 회귀 방지). "Zod에서 제거 금지"는 string에 무의미(애초 부재).

### 5-3. `evaluateFamilyBusinessEligibility` 리팩터
시그니처 보존. 통합점 `inheritance-deductions.ts:651`에서 `resolveFamilyBusinessRequirements(...)` → resolved boolean으로 덮어쓴 입력 객체 생성 → 기존 evaluator 소비. legacy(구 boolean 직접입력)·직접입력 모드(Phase E) 100% 보존.
- **OFZ 면제 이중처리 금지**: resolve는 `heirCEOWithinTwoYears`의 **raw 자동값**만 산출. 기회발전특구 면제(상증령 §15㉕)는 기존 `evaluateFamilyBusinessEligibility:108~110` `ofzExempted` 분기에 그대로 둔다(resolve에서 라목 면제 처리 금지 — 중복).

### 5-4. 결과 detail (⑦용)
`FamilyBusinessDeductionDetail.breakdown`에 자동판정 근거 추가: 가업상속인명·만나이·영위연수·신고기한·요건별 source(auto/override). UI 결과카드가 소비.

---

## 6. UI 설계

### 6-1. prop 스레딩 (`steps.tsx:405`, 워크트리 기준)
```tsx
<FamilyBusinessEligibilitySection
  familyBusiness={form.familyBusiness}
  onChange={(v) => set({ familyBusiness: v })}
  deathDate={form.deathDate}   // 신규 — 영위연수·신고기한·18세 자동판정
  heirs={form.heirs}           // 신규 — 가업상속인 지정
/>
```
`heirId`는 `FamilyBusinessInheritanceInput` 내부 필드(엔진 도달 위해) — UI는 `familyBusiness.heirId`로 read/write.

### 6-2. 화면 재구성 (색상카드+번호 패턴, [[feedback_section_card_numbering]])
| 섹션 | 내용 | 표시전용→승격 |
|---|---|---|
| ① amber 가업 기본 | 사업유형·기업규모·별표업종·개업일·업종·사업자번호 + **영위연수 제안(개업일~상속개시일, `operatingYears` 빈칸 시 채움·override 가능)** | `openingDate`→영위연수 제안 |
| ② amber 피상속인 요건 | **Phase 1: 기존 ToggleCard(지분·대표이사) 유지.** Phase 2: 가목 지분(`DecimalInput %`+보유시작일)·나목 대표이사(방법 RadioCardGroup+재직일) + 자동판정 미리보기 | (Phase 2) `decedentShareRatio`→숫자, `decedentCeoTenure`→날짜 |
| ③ sky 가업상속인 지정 | `heirs` RadioCardGroup(1명 자동선택, corporate 차단) → birthDate 연동. 없으면 `heirBirthDate` DateInput | 신규 |
| ④ sky 상속인 요건 | 18세·2년종사·신고기한임원·2년내대표 각 **자동판정 미리보기 + 접힌 수동보정** | `heirEngagementPeriod`→날짜, `heirOfficerAppointDate` 승격 |
| ⑤ amber 안내·동의 | 200%가드·사업무관자산·사후관리·조세포탈 (기존 유지) | — |

### 6-3. 자동판정 미리보기 카드 (`FbAutoCheckPreviewCard` 신규)
영농 `ResidenceCheckPreviewCard` 패턴 차용 (단 자동이 1차). 4분기 tone:
- emerald=자동충족(근거: `만 N세`/`종사 N년 M개월`/`취임일 ≤ 신고기한 YYYY-MM-DD`), rose=자동미충족, amber=입력필요(자동 안분 fallback 금지 — "○○를 입력하면 자동판정"), sky=자동≠수동override(불일치 안내)
- 산식·근거조문 라벨 명시 ([[feedback_result_view_korean_formula]])

### 6-4. 3-state override UX
요건별: `[자동판정 미리보기]` 항상표시 + `[▼ 수동 보정 (예외)]` 기본접힘(`useState`, store 미러링 금지). override가 자동과 다르면 sky 불일치 카드 자동노출.

### 6-5. 800줄 분할 (현 640줄 → 추정 1,100+)
```
FamilyBusinessEligibilitySection.tsx (오케스트레이터 ~250줄, 섹션①⑤ 인라인)
└ family-business/
  ├ FbDecedentRequirementsSection.tsx  (섹션②)
  ├ FbHeirRequirementsSection.tsx      (섹션③④)
  └ FbAutoCheckPreviewCard.tsx         (미리보기 공통)
```
re-export 보존(`steps.tsx:20` import 무변경).

---

## 7. 14 동기화 지점 매핑 (실측 정정본)

> 실측으로 데이터 흐름 확정: `familyBusiness` 객체는 `InheritanceTaxForm.tsx:328`에서 **통째 전달** → `inheritanceDeductionInputSchema.familyBusiness`(Zod, property-valuation-input.ts:701) 검증 → `route.ts:82-83` deductionInput **통째 cast** → 엔진 `inheritance-deductions.ts:651` 분기. **field-by-field 변환·route 매핑 없음** — 신규 필드의 유일한 게이트는 **Zod 객체 스키마**(미추가 시 침묵 strip).

**엔진 선처리**:
- **① 타입**: `FamilyBusinessInheritanceInput`(types/inheritance-family-business.types.ts)에 `heirId?`·기초데이터 날짜·`*Override?` 추가.
- **② initial**: `EMPTY_FB`(FamilyBusinessEligibilitySection.tsx:48) 신규 필드 `undefined`.
- **③ normalize**: 별도 normalize 없음(통째 전달) — 누락 시 자연 `undefined`.
- **④ API 변환**: **변경 없음** — `inheritance-api.ts`에 familyBusiness field-map 없음(`InheritanceTaxForm.tsx:328` 통째). ⚠️ plan 旧 "④ inheritance-api.ts 변환"은 오류.
- **⑫ Zod (Critical)**: **`familyBusinessInheritanceInputSchema`에 신규 필드 추가 필수** (Do 환류 2026-06-02: 800줄 정책으로 `lib/validators/family-business-inheritance-schema.ts` sibling 분리, property-valuation-input.ts가 import+재수출) — 미추가 시 `z.object` 침묵 strip → 엔진 미도달. 추가: `heirId: z.string().optional()` · `heirBirthDate: z.string().optional()`(Heir.birthDate 미입력 fallback) · `heirEngagementStartDate`·`heirCEOAppointDate`·(Phase2) `decedentShareAcquiredDate`·`decedentShareRatioNum: z.number().optional()`·`decedentCEOPeriods: z.array(z.object({startDate,endDate})).optional()` · `*Override: z.boolean().optional()` 일괄. ([[feedback_api_zod_schema_sync]] · [[feedback_explicit_prop_mapping_strip]])
- **⑨ Zod enum**: 신규 enum 없음(`decedentCeoMethod`는 Phase 2 — 추가 시 enum) → Phase 1 변경 없음.
- **⑭ route handler**: **변경 없음** — `route.ts:82-83`이 deductionInput 통째 cast. ⚠️ plan 旧 "⑭ route에서 resolve 호출"은 오류 — **자동도출 통합점은 엔진 `inheritance-deductions.ts:651`**(아래).

**엔진 자동도출 통합점 (route 아님)**: `lib/tax-engine/deductions/inheritance-deductions.ts:651` `if (input.familyBusiness)` 분기. 감싸는 `calcInheritanceDeductions`(527)에 **`input.heirs`(deductionInput.heirs, Zod 684)·`baseDate`(=상속개시일) 모두 스코프 내** → 스레딩 불필요:
```ts
if (input.familyBusiness) {
  const heirBirthDate = input.heirs.find(h => h.id === input.familyBusiness!.heirId)?.birthDate
    ?? input.familyBusiness.heirBirthDate;
  const resolved = resolveFamilyBusinessRequirements(input.familyBusiness, heirBirthDate, baseDate);
  return calcFamilyBusinessDeductionPhase2({ input: resolved, /* 기존 인자 */ });
}
```
OFZ 면제는 `evaluateFamilyBusinessEligibility:108-110`에 유지(resolve는 raw `heirCEOWithinTwoYears` 산출, 이중처리 금지).

**신고서 (client-only)**: 표시전용 string(`decedentCeoTenure` 등)은 **Zod에 없음 = 엔진 미도달**, `deduction-besshi-data.ts:473~488`이 **client form `form.familyBusiness`를 직접** 읽어 별지 제1호서식 자동채움. → 신규 구조화 필드를 besshi-data.ts가 포맷해 표시문자열 도출(client-side, Zod 무관): `ceoTenure`←재직일 기간, `shareRatio`←`decedentShareRatioNum`, `heirEngagement`←`heirEngagementStartDate`~상속개시일. ([[feedback_detailed_statement_formula_sync]])

**UI (UI 시니어)**: ⑤ 위젯(DateInput/DecimalInput/RadioCardGroup + 미리보기) · ⑥ 사이드바(capPreview 기존) · ⑦ 결과카드(자동판정 근거) · ⑧ validate(날짜 정합성: 종사시작>상속개시 모순·재직 시작>종료·취임일>신고기한+2년 차단. heirId 미지정+heirs 1명=자동선택).

---

## 8. anchor 테스트 (`__tests__/tax-engine/inheritance/family-business-autoderive.test.ts`)

**Phase 1 (케이스 인벤토리 21행, anchor 1+/행 — 엔진 설계 §케이스 인벤토리 동기화)**: 18세 생일당일=충족 / 전날=미충족 / birthDate 미입력=false / override=true 우선 / Heir.birthDate·heirBirthDate fallback · 신고기한 2024-03-15→2024-09-30 / 08-31→2025-02-28 / 01-31→2024-07-31 · 임원취임 신고기한당일=충족/+1일=미충족 · 대표취임 신고기한+2년당일=충족/+1일=미충족 / OFZ면제 · 종사 2년경계 / 65세단서면제 · 영위 20년=2호캡 · legacy 회귀.

**Phase 2**: 지분취득+10년당일=충족/9년364일=미충족 / 상장20% / 비상장39% · 나목 50%경계·소급10년중5년경계 · 종사 2년경계.

경계는 상속개시일 기준 경계값(만나이·기간·신고기한±1일)을 §15③·§67 조문에서 직접 산정, Pre-Do anchor 우선([[feedback_pre_anchor_verification]]).

---

## 9. 법령 정밀성 리스크 — 보수적 처리

| 리스크 | 처리 |
|---|---|
| 영위기간 법적정의(폐업·법인전환) | 자동도출 1차 표시 + "이견 시 직접입력(override)" 경고 |
| 나목2호 "승계" 시점 | Phase 2도 **자동 미지원·override only** |
| 지분 "계속 보유"(재취득) | 자동결과에 "매도·재취득 없는 경우만 적용" 경고 상시 |
| "직접 종사" 실질 | 달력 계산만, "§15④ 실질 확인 필요" 경고 |
| 배우자 간주 | Phase 1 수동 boolean 유지(Phase 3) |
| §67 vs acquisition-timing 불일치 | 판정에 사용한 신고기한 날짜 UI 명시 |

---

## 10. 단계화

**Phase 1 (이번 PR)** — 사용자가 명시한 예시(가업종사기간·18세) 전부 포함:
영위연수 auto · 18세(가목) · 상속인 2년종사(나목 단일구간) · 신고기한 임원취임(다목) · 2년내 대표이사(라목) · `calcInheritanceFilingDeadline` · `resolveFamilyBusinessRequirements` · heirId 연결 · 엔진 도달 · UI 미리보기·override · 신고서 동기화 · anchor 15+.

**Phase 2 (후속 PR)** — 기간산식 高리스크:
피상속인 대표이사 나목 3대안 · 최대주주 10년보유 가목 · 종사 "영위기간 중"·다구간 정밀화 · 배우자 간주.

---

## 11. 결정 사항 (사용자 확정 2026-06-02)
1. **override 정책 — ✅ 확정: 자동 1차 + 접힌 3-state override**. 기초데이터 자동판정이 기본·1차. 법령상 자동 불가 항목(나목 "승계" 시점·지분 "계속 보유"·"직접 종사" 실질)만 접힌 "수동 보정(예외)"으로 보정. 자동값과 다를 때 경고 표시.
2. **범위/진행 — ⏸ 계획서 검토 우선, 구현 보류**. 본 계획서 검토·확정 후 다음 세션에 구현 시작. (Phase 1 우선 / Phase 1+2 일괄 여부는 검토 시 확정)
3. **가업상속인 다수**: Phase 1 단일 (권장, 검토 시 확정).

> **상태: PLAN + DESIGN 완료 · 13단계 자가검토 28건 정정 · 구현 대기.** 소스 미수정. 워크트리 `worktree-inheritance-family-business-autoderive` 보존.
> 설계문서: `docs/02-design/features/inheritance-family-business-deduction/eligibility-autoderive.{engine,ui}.design.md`
> 13단계 검토(plan-design-self-review-loop): 계획 14건 + 엔진설계 7건 + 통합비교 2건 + UI설계 5건 = **28건 정정**(Critical 3). 통합 정합축 전부 ✓, Critical/High 잔존 0.
