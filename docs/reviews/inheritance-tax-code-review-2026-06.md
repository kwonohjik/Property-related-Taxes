# 상속세 코드 리뷰 — 통합 리포트 (2026-06)

> 멀티 에이전트 워크플로(15개 영역 병렬 리뷰 → 적대적 검증 → 통합) 산출물.
> 범위: 엔진(33파일·8.5k줄) + UI(85파일·15.9k줄) + 테스트(83파일·18.3k줄) = 42,700줄.
> 결과: 제기 49 → **확정 31** (반증 기각 18). HIGH 7 · MEDIUM 9 · LOW 15.

## 검증 상태 표기

- `[N/N]` — 독립 refuter가 코드/법령(KoreanLaw MCP)·probe 재확인 후 실재 확정.
- `[미검증]` — refuter가 StructuredOutput 호출 실패로 자동 보존된 건. 대부분 "필드 존재/부재" 정적 사실이라 신뢰도 높으나, **반증 통과는 못 한 상태** → 적용 전 직접 확인 권장. (본 세션 후속 C 단계에서 재검증 진행)

---

## 가장 시급한 Top 3

1. **§13 사전증여 합산 cutoff가 만(滿)연수 절사** — 10년/5년 경계 직전 ~364일 도과분까지 과세가액 합산. 과세표준·세대생략 할증·법인면제까지 단일 진실로 전파되는 근본 버그. `[2/2]`
2. **§19 배우자 법정상속분 분자가 cutoff 미적용** — probe 실증: 배우자공제 6억 과대 → 세액 1.3억 과소. `[1/1]`
3. **§63②3호 비상장 신주 모드 라디오가 날짜 존재 여부에서 derive** — 선택 즉시 패널 사라짐 + validation 데드락. `[2/2]`

---

## 🔴 HIGH (7)

### H-1. [법령] §13 사전증여 cutoff 만연수 절사 — `lib/tax-engine/inheritance-gift-common.ts:316-320, 373` `[2/2]`
`isWithin13Cutoff`가 `differenceInYears(death, gift) <= limitYears`로 만연수 절사 비교 → 경계일 1~364일 도과 증여까지 합산 대상에 포함(법적으로는 제외). STEP4 과세가액·STEP4.5 cutoffFilteredGifts·STEP8.5 세대생략 분자·STEP10 영리법인 §3의2② 필터의 **단일 진실**이라 영향 광범위. §47 경로(line 373 `elapsedYears > 10`)도 동일.
- **수정**: 일(日) 단위 비교 — `boundary = subYears(deathDate, limitYears)`, `include iff !isBefore(giftDate, boundary)`. §47도 동일. `toDate()`/`coerceDates` 경유.
- **회귀**: 기존 `corporate-prior-gift.test.ts:122-124`가 도과분 포함을 정답으로 고정 중 → anchor 재산정 필요.

### H-2. [dual-truth] §63②3호 모드 라디오 데드락 — `components/calc/inheritance/listed-stock/ListedStockBesshiAttributesSection.tsx:100-104, 218-290` `[2/2]`
`unlistedMode`를 `capitalIncreaseDate ? 'capital_increase' : mergerDate ? 'merger' : 'none'`로 데이터 파생. onChange는 `isCapitalIncreaseUnlistedShare: true`만 set·날짜 미set → 다음 렌더에 'none' 복귀 → 라디오 되돌아감 + `unlistedMode !== 'none'` 게이트(L250)로 묶인 패널(증자일/액면가/배당률/배당기산일) 전체 숨김. 엔진·validation은 플래그로 게이트하므로 숨은 필수 필드를 요구(UI 통과↔validate 차단 모순).
- **수정**: 명시적 `unlistedShareMode: 'none'|'capital_increase'|'merger'` enum 필드를 store/normalize/API/validate에 도입(`feedback_three_state_optional_mode_toggle`).

### H-3. [dual-truth] 가업상속인 1명 자동선택 store 미반영 — `components/calc/inheritance/family-business/FamilyBusinessHeirSelector.tsx:73-83, 99-114` `[재검증✓]`
자연인 상속인 1명 시 `effectiveHeirId`로 화면엔 선택·만나이 표시하나 `onChange({heirId})` 미호출 → store `familyBusiness.heirId` undefined. 엔진(`inheritance-deductions.ts:655-657` 직접 확인: `heirs.find(h=>h.id===familyBusiness.heirId)?.birthDate ?? familyBusiness.heirBirthDate`)이 heirId로 도출 → 단독 상속인이 Heir에 birthDate를 가져도 엔진이 못 찾아 §15③2호 18세 자동판정 침묵 미충족.
- **재검증 노트**: 트리거는 다소 좁음 — 단독 자연인 상속인이 birthDate를 Heir 객체에 보유하고 사용자가 자동선택을 신뢰해 라디오를 클릭하지 않을 때. 그래도 침묵 실패라 high 유지.
- **수정**: autoSelected 확정 시 명시적 단발 `onChange({heirId})` 1회 기록(useEffect→store 미러링 금지) 또는 부모 `selectedHeirBirthDate` 도출에 동일 autoSelected 규칙 적용.

### H-4. [동기화⑧] 영리법인 사전증여 corporate 필수요건 Zod superRefine 부재 — `app/api/calc/inheritance/route.ts` / `lib/validators/property-valuation-input.ts:351-374` `[재검증✓]`
client `validatePriorGift`(`inheritance-validate.ts:156-176` 직접 확인: corporate 시 `corporateGiftComputedTax>0`·`doneeId`·`isHeir=false`·`giftTaxPaid=0` 강제)나, Zod `priorGiftSchema`(351-374 직접 확인: corporateGiftComputedTax·doneeId·beneficiaryType 모두 `.optional()`, superRefine 없음)는 미강제. `proxy.ts`가 `/api/calc/*` 비로그인 허용 → API 직접 호출 시 면제 블록(`inheritance-tax.ts:535` `corporateGifts.length>0 && corporateGiftComputedTax>0` 직접 확인) skip, 금액은 합산 → silent 과대 과세.
- **수정**: `priorGiftSchema`에 corporate superRefine 추가(client와 1:1) 또는 공유 corporate-rule 헬퍼 import.

### H-5. [논리] validateUnlistedStockV2 `instanceof Date` 실패 — `lib/calc/inheritance-validate.ts:419` `[재검증✓]`
`!(endDate instanceof Date)` 검사(419 직접 확인). `InheritanceTaxForm.tsx:209` 복원부 `JSON.parse(raw) as Partial<FormState>`만 수행·coerceDates/toDate 정규화 없음(grep 확인) → Date가 ISO string → instanceof false → '1년전 사업연도 종료일을 입력해야 합니다' 오류. 비상장 V2 포함 이력 '수정' 복원 사용자가 Step1→2 진행 불가.
- **재검증 노트**: 정상 입력 흐름에선 V2 fiscalYearEndDate가 Date 객체라 통과(그래서 평소엔 동작), 복원 경로에서만 string화로 실패하는 전형적 직렬화 버그. 수정(string 허용 or toDate)은 양쪽 모두 안전.
- **수정**: string 허용(`|| (typeof endDate==='string' && !isNaN(...))`) 또는 복원 직후 `toDate()` 정규화 헬퍼.

### H-6. [동기화⑫] `listedStockCode` Zod estateItemSchema 미선언 strip — `lib/validators/property-valuation-input.ts:151-223` `[재검증✓ — 단 기능영향 LOW]`
타입(`inheritance-gift.types.ts:95` 직접 확인: `listedStockCode?: string`)엔 있으나 `listedStockItemSchema`(151-223 전체 직접 확인 — companyName·isMaxShareholder 등 다수 optional 있으나 listedStockCode 없음) 미선언 → Zod strip → `inheritance-asset-category.ts:56` `item.listedStockCode != null` 분기 항상 false.
- **재검증 노트**: 같은 분기(57-58행)가 `listedStockShares>0`·`listedStockAvgPrice>0`로도 stock 분류하고 이 둘은 required → **실제 분류 결과 변화 없음. 세액·표시 영향 0**. ⑫ 정합성 원칙 위반은 사실이나 severity는 high가 아닌 **LOW**로 재분류 권장(1줄 추가로 예방적 수정).
- **수정**: `listedStockCode: z.string().optional()` 추가.

### H-7. [테스트] ⑫⑬⑭ 경계 통합 테스트 0건 — `__tests__/{lib/calc,inheritance,components/calc/inheritance}` `[재검증✓]`
스코프 테스트에 실제 `.safeParse(`/`Schema.parse(` 호출 **0건**(grep 직접 확인, JSON.parse 제외). `section22-stock-toggle-f1.test.ts`의 `baseItemSchema` 매치는 **주석**(`E-4: baseItemSchema에 ... 추가`)·필드명 참조일 뿐 실제 Zod 통과 없음. 신규 EstateItem optional 필드 침묵 strip 회귀 미탐지 — `isSection22MajorShareholder` 등은 financial-deduction-resolver 헬퍼만 검증, Zod 보존은 무검증.
- **수정**: EstateItem을 실제 Zod 스키마로 `.parse()` 후 신규 optional 필드 보존을 검증하는 round-trip anchor 1건 추가(신규 필드 시 RED).

---

## 🟡 MEDIUM (9)

### M-1. [법령] §19 배우자 법정상속분 분자 cutoff 미적용 — `lib/tax-engine/inheritance-tax.ts:287-303` `[1/1]`
`heirGiftAmount`·`spouseGiftTaxBase`를 전체 preGifts에서 cutoff 필터 없이 합산. STEP4/4.5는 `isWithin13Cutoff`로 도과분 제외 → 도과 증여가 §19 분자에만 들어가 배우자공제 과대.
- **probe 실증**: 도과 자녀증여 10억 → 배우자공제 18억→24억, 세액 9,215천 vs 144,045천 = **1.3억 과소**. 단 spouseLegalShareOverride 미설정·배우자 존재 자동경로 한정.
- **수정**: `cutoffFilteredGifts` 단일진실 적용. (H-1과 같은 클러스터)

### M-2. [법령] §28① 단서 5억 이하 증여세액공제 배제 누락 — `lib/tax-engine/inheritance-gift-tax-credit.ts:53-116` `[2/2]`
과세가액 ≤5억 시 증여세액공제 전면배제(KoreanLaw §28① 단서 확인) 미구현. 통상 §21 일괄공제로 과세표준 0 → 자기상쇄되나, **비상속인 수유자 존재(§24 1호 차감으로 과세표준>0)** 시 결정세액 과소(probe: 5백만 과소).
- **수정**: `taxableEstateValue <= 500_000_000 → giftTaxCredit=0`. 국기법 §26의2④⑤ 기간만료 배제도 함께 검토.

### M-3. [법령] §30① 단기재상속 안분 분수 미적용 — `lib/tax-engine/credits/short-term-reinheritance.ts:89-113` `[1/1]`
`rawCredit = priorTaxPaid × creditRate`만 — §30① 법정 안분분수(재상속분/전체 상속재산) 누락. 입력 타입에도 관련 3필드 부재. 일부만 재상속 시 공제 과대. UI 라벨은 "당시 납부한 상속세" 전액 입력 유도.
- **수정**: 안분 3필드 추가 + §30① 분수 적용, 또는 '전부 재상속 가정' 명시·UI hint 강제.

### M-4. [법령] §27 세대생략 할증 분모 cutoff 미적용 — `lib/tax-engine/inheritance-generation-skip.ts:88-92` `[1/1]`
`nonHeirNonLegateeGifts`가 raw preGifts의 corporate 합산(cutoff 미적용). `taxableEstateValue`는 cutoff 필터된 것만 포함 → 도과 법인증여 있으면 분모 과소 → §27 할증 과대. `summaryTable.surchargeTargetTaxableValue`에도 전파.
- **수정**: `cutoffFilteredGifts` 재사용. 도과 법인증여 generation-skip anchor 추가. (H-1 클러스터)

### M-5. [dual-truth/표시] §22 금융재산 rows 집계 발산 — `lib/tax-engine/inheritance-tax-financial-rows.ts:47-56` `[2/2]`
rows는 unlisted_stock `isFinancialAssetForDeduction===true`만(undefined 누락)·신탁 분기 없음. 공제 base(`financial-deduction-resolver.ts` CATEGORY_DEFAULT.unlisted_stock=true·cash_trust 포함)와 발산 → 표 합 < 소계(detail.netFinancial). **세액 영향 없음(계산은 scalar netFinancialAssets), 표시 자기모순.** 헤더 주석이 "base와 정합" 선언하나 미준수.
- **수정**: rows도 `resolveFinancialEligibility` 단일진실 재사용(또는 동일 판정 반영).

### M-6. [동기화/표시] 별지 제2쪽 ⑲ 부채총액 보험준비금 누락 — `components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable.tsx:39-41` `[1/1]`
`BESSHI_P2_LIABILITY_ROWS`(⑨~⑱)에 insuranceReservePolicy/Extraordinary/Surrender 3필드 없음. 엔진 `net-asset-calc.ts:75-78`은 totalLiabilities에 가산. 보험사 토글(PR-M) 입력 시 별지 다(=⑧−⑲, 미반영) ≠ 마(=다+영업권, 엔진 반영) → `마≠다+라` 자기모순. **표시 전용.**
- **수정**: ⑲ 소계에 보험준비금 3필드 가산 + self-consistency anchor.

### M-7. [설계] PresumedInheritanceInput 동적 Tailwind tone — `components/calc/inheritance/PresumedInheritanceInput.tsx:112, 136, 141` `[미검증]`
`border-${tone}-300`·`bg-${tone}-50` 등 템플릿 보간 → JIT purge로 프로덕션 색상 누락(safelist 없음). 같은 폴더 DebtAllocationInput은 정적 Record로 해결됨.
- **수정**: 완성 클래스 정적 Record(`feedback_tailwind_static_tone_mapping`).

### M-8. [동기화①②⑤] `disasterLossDeduction` FormState·UI 위젯 미구현 — `components/calc/inheritance/shared.ts:16-71` `[미검증]`
Zod(626)·route 매핑(`inheritance-tax.ts:436`)엔 있으나 FormState·INITIAL_FORM·buildInput 누락 → UI 입력 경로 없음(항상 0). 재해손실 사례서 §24 한도 과소.
- **수정**: FormState 추가 + Step4 CurrencyInput 위젯 + buildInput 매핑. (우선순위 낮으면 '고급 사례' 분류)

### M-9. [테스트] JSON 직렬화 회귀 가드 부재(UI/통합) — `__tests__/{lib/calc,inheritance,components/calc/inheritance}` `[미검증]`
Date string화·Map→{} 소실을 잡는 round-trip 테스트가 스코프에 0건(`perheir-json-roundtrip`은 엔진 디렉터리에만). 
- **수정**: Date 사용 통합 anchor에 `JSON.parse(JSON.stringify(input))` + coerceDates round-trip 1건 추가.

---

## 🟢 LOW (15)

### 세액 영향 가능(엔진)
- **L-1** §19 분모 `coheirCount` 상속포기(isHeir=false) 미제외 — `inheritance-tax.ts:336-341` `[1/1]`. `computeLegalShares`는 `isHeir!==false` 필터 → dual-truth. 현재 UI에 상속포기 토글 없어 도달불가(엔진/API 직접 호출만). → 동일 필터 적용 또는 `computeLegalShares` 재사용.
- **L-2** 협의분할 추정상속재산(§15) floor 잔액 흡수 누락 — `inheritance-allocation.ts:411-419` `[미검증]`. added≠totalAlloc 시 Σ < added 최대 (n−1)원. → 마지막 항목 잔액 흡수.

### 표시 전용 drift
- **L-3** 레거시 세대생략 denominator 표시 드리프트 — `inheritance-generation-skip.ts:148-191` `[1/1]`. 안분 비활성 시 카드는 분모 표시하나 실제 산식은 `applyRate(전액)` → 역검증 불일치. → 분모 미노출/라벨 구분.
- **L-4** §16② 공익법인 동족주식 임계 **5%→10% 라벨 오기** — `legal-codes/inheritance-gift.ts:192-193` + `exemption-evaluator.ts:120,122,127,130` `[1/1]`. KoreanLaw §16②2호 본칙 10%(5%/20%는 예외). 사용자 노출 문자열 전파. 계산엔 영향 없음(임계 미사용). → 주석·라벨 정정.
- **L-5** 발행주식총수 역산 표시 — `PerShareValuationResultCard.tsx:77, 84` `[1/1]`. `Math.round(netAssetTotal/netAssetPerShare)` floor 역산 → 실제 totalShares와 수백~수천주 오차(probe 94.58% 불일치). → `input.totalShares` 직접 표시.

### 정책 위반(경미)
- **L-6** 상속인 라벨 내부 id 노출 — `FarmingEligibilitySection.tsx:515`, `HeirAssessmentCard.tsx:56`, `DebtAllocationInput.tsx:169` `[미검증]`. `name || \`${relation} ${id}\`` → RELATION_LABEL fallback(`feedback_no_internal_id_in_result`).
- **L-7** `new Date()` 직접 호출 — `inheritance-validate.ts:411` `[미검증]`. → `toOptionalDate()`. (동작은 안전, 정책 정합)
- **L-8** 사이드바 장례비 FUNERAL_MIN(500만) 미적용 legacy — `lib/stores/inheritance-summary.ts:158-163` `[미검증]`. 결과 도착 전 추정만 영향. → `Math.max(min(...), 5_000_000)`.
- **L-9** `inheritanceDeductionInputSchema` deathDate strip — `property-valuation-input.ts:611-631` `[미검증]`. 오케스트레이터 재주입으로 기능 무해, ⑫ 위반. → 예방적 추가.
- **L-10** §67① 신고기한 2/29 말일 정렬 edge — `lib/calc/filing-form-9-data.ts:221` `[미검증]`. `addMonths(endOfMonth(2/29),6)=8/29`(8/31 아님). → 해석 확정 후 처리.

### 테스트 품질
- **L-11** Σ finalTax 5원 tolerance 과다 — `heir-allocation-summary-table.test.ts:89-95` `[미검증]`. 동일 합계 다른 anchor는 ≤1원. → `toBe(1_033_760_232)`.
- **L-12** E15 세대생략 40% 주석 오기(결과는 정답) — `inheritance-gift/gift.test.ts:156-162` `[미검증]`. 판정 기준은 과세표준 아닌 증여재산가액. → 주석 정정.
- **L-13** J-04c §24 한도 무력 anchor — `comprehensive-case-pdf.test.ts:451-466` `[미검증]`. 제목은 '한도 발동'이나 미발동(부등호 assertion). → J-04d처럼 강화 또는 삭제.
- **L-14** besshi-10 SC1~4 0-row trivial anchor — `filing-form-besshi-10.test.ts:119-162` `[미검증]`. 중간 0-row 전제 항등식. → 비-0 row 케이스 보강.
- **L-15** suggest fallback↔validate corporate만 anchor — `prior-gift-auto-tax.test.ts:107-119` `[미검증]`. securedClaimIsFinancialDebt 등 다른 fallback 필드 ⑧ 가드 부재. → anchor 추가 또는 불필요 명시.

---

## 권장 조치 순서

1. **§13 cutoff 클러스터 일괄 수정** (H-1 + M-1 §19분자 + M-4 §27분모) — `isWithin13Cutoff` 일 단위 수정 + 소비처 `cutoffFilteredGifts` 단일진실 통일. 세 건 동일 테마. 도과 증여 anchor 신규.
2. **§28① 5억 배제 게이트** (M-2).
3. **UI 데드락/누락 입력** (H-2 모드 enum · H-3 가업상속인 store · M-8 disasterLossDeduction 위젯).
4. **API 경계 강화** (H-4 영리법인 Zod · H-6 listedStockCode · H-5 instanceof Date 복원).
5. **표시 dual-truth 정합** (M-5 §22 rows · M-6 별지 ⑲ · L-3·L-4·L-5).
6. **테스트 가드 보강** (H-7 ⑫⑬⑭ round-trip · M-9 JSON 직렬화 · L-11~L-15).
7. **경미 정책 정리** (M-7 Tailwind · L-6 내부 id · L-7 new Date · L-8 장례비 · L-9 deathDate).

---

## 메타

- 워크플로: 74 subagent · 4.16M 토큰 · tool_uses 938 · duration ~3h.
- 통합 리포트 생성 에이전트는 세션 한도로 실패 → 본 문서는 확정 31건 구조화 데이터에서 수동 종합.
- refuter StructuredOutput 실패로 `[미검증]` 처리됐던 HIGH 5건(H-3~H-7)은 **2026-06 직접 재검증 완료(`[재검증✓]`)**. 결과: H-3·H-4·H-5·H-7 실재 확정, **H-6은 실재하나 기능영향 0 → severity LOW 재분류**.
- 재검증 방식: 인용 file:line을 실제 Read + grep으로 코드 단정(추정 금지 정책). probe 미실행(정적 사실 위주).
