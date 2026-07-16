# 상속세·증여세 엔진 코드리뷰 — 2라운드 통합 결함 계획서

> 생성: 2026-07-16 / 기준 커밋: `ed314de2` (origin/master, PR #617·#618 반영본)
> 방법: 다중 에이전트 워크플로 2라운드(총 30개 조사축) + 발견별 3렌즈 적대적 검증(법령근거·코드도달성·수치재현). 법령은 KoreanLaw MCP로 원문·위임체인 직접 조회, 수치는 vitest probe로 재현.
> 결과: **CONFIRMED 73건**(critical 15 / high 40 / medium 17 / low 1) + PLAUSIBLE 13건.
> 워크트리: `.claude/worktrees/review-inheritance-gift` (2R 종합·완전성비평 에이전트는 월 지출 한도 도달로 미실행 — 종합은 본 문서로 대체).
>
> **⚠️ 착수 정정(2026-07-16)**: 실착수 결과 **C-3(복수가업 개별한도)가 PDF 379p 교재 anchor와 충돌해 PLAUSIBLE로 강등**됐다(§2 C-3 참조). 실질 CONFIRMED 72건 / PLAUSIBLE 14건. 이는 리뷰 방법론의 정직한 한계를 드러낸다 — 검증 에이전트가 법령 원문으로 발견을 확증해도, 실제 수정은 **기존 교재 anchor·서식 집계 구조와의 정합성**이라는 별도 관문이 있다. **모든 세액 수정은 KoreanLaw MCP 법령 원문 확정 + 관련 기존 테스트 anchor 정독을 선행할 것.**

---

## 0. 신뢰도 등급 (지출 한도로 일부 검증 미완)

| 등급 | 의미 | 건수 |
|---|---|---|
| **3렌즈 완전 검증** | 법령·도달성·수치 세 렌즈 전원 통과 | 약 62건 |
| **부분 검증(렌즈 0~2)** | 지출 한도로 일부 렌즈 미실행. 서식 축(B1·B2·B3) 다수 | 아래 표기 |
| **저자(리뷰어) 재확인 완료** | 지출 한도 후 코드로 직접 실재 확인 | `filing-form-9-data.ts:147`·`deduction-besshi-data.ts:184`·`payment-in-kind.ts:209` |

각 발견에 `(렌즈N)`으로 검증 렌즈 수를 표기한다. `(렌즈0)`·`(렌즈1)`은 착수 전 재현 probe 필수.

---

## 1. 근본 원인 그룹 (그룹 단위로 고치면 다수가 한 번에 해소)

- **G-1. `decedentType`(거주자/비거주자) 완전 미배선** — UI→Zod→Route까지 도달하나 `lib/tax-engine/` 소비처가 타입 선언 1건뿐. §14②·§18~§22·§18의2① 거주자 전용 규정이 전부 비거주자에게 적용. → C-12·C-13·H-33
- **G-2. §69 신고세액공제율 단일진실 우회** — `credits/filing-credit.ts:47 resolveFilingCreditRate`가 정본인데 배부표는 `0.03` 리터럴, 증여 2스트림·합산배제 스트림은 `giftDate` optional 침묵 누락. → C-5·H-14·H-21·H-22
- **G-3. `isHeir === false` 필터 dual-truth** — `inheritance-deductions.ts:457 realHeirs`(대습 예외 X)와 `personal-deduction-calc.ts:366 activeHeirs`(isHeir 검사 X)가 상이. 공통 헬퍼 `isRealHeir(h)` 부재. → C-1·H-17
- **G-4. 합산배제/특례 스트림이 메인 스트림 입력 통째 재사용** — `gift-aggregation-excluded-stream.ts:133`·`gift-tax-two-stream.ts:63`이 creditInput·appraisalFee·플래그를 재투입/무시. §59 이중공제, §55①3호 격리 붕괴. → C-15·H-23·H-24·H-30·H-31·M-2
- **G-5. `CurrencyInput` `allowNegative` 누락** — Zod가 `z.number()`로 부호를 선언한 필드인데 위젯이 `-`를 침묵 제거. → C-10·H-28·H-29·M-6
- **G-6. 물납(§73·§74) 4분류·하드코딩** — `credits/payment-in-kind.ts`가 표시용 `buildSummaryCategory`를 법정 금융재산·부동산 정의로 전용 + `eligibleSecuritiesValue: 0` 하드코딩(주석이 미완성 자백). → C-14의 5건 집중
- **G-7. 별지 서식 엔진값 소실/재계산 dual-truth** — 서식 빌더가 엔진 result를 재계산하거나 combined값을 넣거나 상수 0으로 표시. `pdf_table_row_one_to_one_mapping` 정책 위반. → H-35~H-40, M-11~M-16
- **G-8. 정수연산 BigInt↔부동소수 혼용** — 같은 함수 안에서 `safeMultiplyThenDivide`와 부동소수 곱셈 공존. 1원 오차. → M-8·L-1
- **G-9. 법령 인용 상수 오기(수치 무영향, 표시만)** — `legal-codes` 상수가 결과 화면 조문 링크로 노출. → PLAUSIBLE 다수

### 결함 집중 파일 (곧 우선순위)

| 건수 | 파일 |
|---|---|
| 5 | `lib/tax-engine/credits/payment-in-kind.ts` (물납 G-6) |
| 4 | `lib/tax-engine/deductions/family-business.ts` (가업상속) |
| 4 | `lib/tax-engine/gift-aggregation-excluded-stream.ts` (합산배제 G-4) |
| 3 | `lib/tax-engine/inheritance-allocation.ts` (배부표 §69·§27) |
| 3 | `lib/tax-engine/deductions/inheritance-deductions.ts` (§21·§23의2) |
| 3 | `lib/tax-engine/gift-tax-two-stream.ts` (조특법 특례) |

---

## 2. CRITICAL (15건)

### C-1. 대습상속인 `realHeirs` 탈락 → §21② 배우자 단독상속 오판 → 일괄공제 5억 부당 배제 `(렌즈3)`
- **위치**: `lib/tax-engine/deductions/inheritance-deductions.ts:463` [G-3]
- **법령**: 상증법 §21②(mst 276123) — "배우자가 **단독으로** 상속받는 경우에는 §18·§20①만 공제". 배우자+대습상속인(민법 §1001) 공동상속은 단독상속이 아니므로 §21① max(기초+인적, 5억) 적용.
- **재현**: 며느리/사위를 `relation:"other"`(isHeir:false)로 추가 후 SubstituteHeirPanel 대습토글 ON → `substituteGroupId`만 세팅되고 `isHeir` 미변경 → HeirEditor.tsx:474 조건으로 토글이 숨겨져 `isHeir:false` 고착 → `realHeirs`에서 탈락 → 배우자 단독상속 오판.
- **수정**: `isHeir === false`를 비상속인 단일 신호로 쓰지 말고, 대습상속인(`substituteGroupId != null`)은 항상 상속인으로 취급하는 공통 헬퍼 `isRealHeir(h)`를 `inheritance-legal-share.ts`에 신설(→ H-17과 동시 해소).

### C-2. 가업 사후관리 추징액이 '과세가액 산입액'인데 세액으로 취급 — 추징세액·이자 약 2배 과대 `(렌즈3)`
- **위치**: `lib/tax-engine/credits/family-business-postmgmt-orchestrator.ts:112`
- **법령**: 상증법 §18의2⑤(mst 276123) — "공제받은 금액에 …율을 곱한 금액을 상속개시 당시 상속세 **과세가액에 산입하여 상속세를 부과**". 이자 기준은 상증령 §15⑯1호 "결정한 상속세액". 대조로 영농(`farming-post-mgmt.ts`)은 `determinedTax`를 별도 입력받아 분리.
- **재현**: 가업공제 300억, 지분감소 위반 → `totalRecapture=30,000,000,000` / `totalInterest=1,860,000,000` / `netPayable=31,860,000,000`. 정답은 300억을 과세가액에 산입해 재계산한 증가분(최고세율 50% 기준 약 150억)이며 이자도 그 기준 → **약 159억 과대**.
- **수정**: 반환 필드를 `taxableAmountAddback`으로 개명, orchestrator가 당초 과세가액+산입액으로 상속세 재계산 → 증가분을 추징세액으로, 그 증가분을 `calcFamilyBusinessInterest.determinedTax`에 주입. §18의2⑩ 양도세 상당액 차감도 산출세액 기준으로 정정.

### C-3. 복수가업 순차공제 개별한도 — ⚠️ 교재 충돌로 **보류(PLAUSIBLE로 강등)** `(렌즈3, 그러나 착수 시 반증)`
- **위치**: `lib/tax-engine/deductions/family-business.ts:130`
- **리뷰 주장**: 상증칙 §5(mst 284609) — "계속 경영기간이 긴 기업의 공제한도를 적용"(총한도 1개)이므로 `Math.min`의 3항 `individualCap`은 근거 없음. A(35·100억)+B(12·500억) → 정답 600억 vs 실제 400억.
- **⚠️ 착수 시 발견한 반증(2026-07-16)**: 기존 테스트 `__tests__/tax-engine/inheritance/family-business-multiple.test.ts`가 **PDF 379p 교재 사례를 개별한도 적용으로 명시 anchor**한다 — `:7` 주석 "PDF 379p 표 = 개별기업별 한도(㉯=400억, ㉰=300억)도 Min에 포함", FB-MULTI-PDF379 테스트(`:50-70`)가 25년 500억 가업을 `Min(500,500,400)=400억`으로 개별한도 절삭. 즉 **실제 교재가 개별한도를 적용**하며, 리뷰 검증 에이전트는 상증칙 §5 원문만 조회하고 이 교재 anchor의 존재를 놓쳤다.
- **성격**: 상증칙 §5 원문 해석(총한도만) vs 세무 교재 실무(개별한도 포함)의 **법령 해석 충돌**. 교재 원본(PDF 379p) 확인 없이 코드·anchor를 어느 방향으로도 변경 금지.
- **선결 과제**: (1) PDF 379p 교재 원본에서 복수가업 개별한도 적용 여부 확정, (2) 상증칙 §5 + 상증령 §15④ 위임 체계에서 개별한도의 실무 근거(기업별 판정 원칙) 재검토. 두 자료가 일치하면 리뷰 반증(현행 유지), 교재가 원문과 달리 오적용이면 리뷰 확정.

### C-4. §47② 사전증여 합산 '1천만원 이상' 임계 미구현 — 소액 사전증여도 무조건 가산 `(렌즈3)`
- **위치**: `lib/tax-engine/gift-prior-aggregation.ts:202`
- **법령**: 상증법 §47②(mst 276123) — "10년 이내 동일인 증여재산가액 합계가 **1천만원 이상인 경우에는** 가산".
- **재현**: 사전증여 500만 + 금회 1억. 합계 500만 < 1천만 → 가산 요건 불성립 → 정답 과세표준 5,000만·결정세액 4,850,000. 실제: 105,000,000 가산 → 5,335,000 → **485,000원 과다**.
- **수정**: `const totalAmount = rawTotal >= 10_000_000 ? rawTotal : 0;`. 임계 미달 시 `matchedPriorGifts`·§58·§57 연계값 무력화. 상수는 `legal-codes` 상수화.

### C-5. §69 신고세액공제율 배부표 3% 하드코딩 — 2018년 이전 상속개시 연도별율 침묵 덮어씀 `(렌즈3)` [G-2]
- **위치**: `lib/tax-engine/inheritance-allocation.ts:586`(+`:670`)
- **법령**: 상증법 §69①. 연도별율 정본 `credits/filing-credit.ts:31-36`(~2016=10%/2017=7%/2018=5%/2019~=3%, 법률 제14388호 부칙).
- **재현**: 사망 2016-06-01, 예금 10억, 자녀1. 정답 §69=floor(88,000,000×10%)=8,800,000 → 결정세액 79,200,000. 실제 filingCredit=2,640,000(3%) → 85,360,000 → **6,160,000 과다**.
- **수정**: `HeirAllocationParams`에 `deathDate` 추가(엔진 내부 전달, 14지점 불필요), `:586`·`:670`의 `0.03` → `resolveFilingCreditRate(deathDate)`. **선결**: 부칙 기준일 축(상속개시일 vs 신고일) 원문 확정 후 anchor.

### C-6. 기타재산(other) 평가에서 감정평가액 무시 → 평가액 0원 `(렌즈3)`
- **위치**: `lib/tax-engine/property-valuation.ts:838`
- **법령**: 상증법 §60②·상증령 §49①2호 — 감정가액은 시가에 포함. 같은 파일 `resolveValuationMethod`도 appraisedValue를 인정.
- **재현**: category="other"에 감정평가액 30억만 입력 → 사이드바 표시 30억, 엔진 평가액 **0원**(marketValue만 읽음) → grossEstate 0, 세액 0.
- **수정**: default 분기를 `resolveValuationAmount(item)`에 위임해 §60 우선순위(market→appraised→similar→standard) 적용. [Wave 1 후보]

### C-7. 전세보증금 반환채권(deposit=자산)에 §14 담보채무 자동공제 토글 노출 → 유령채무 공제 `(렌즈3)`
- **위치**: `lib/tax-engine/inheritance-collateral-debt.ts:60`
- **법령**: 상증법 §14①3호 — 차감 채무는 "피상속인의 채무"에 한정. deposit은 피상속인이 임차인=**채권(자산)**.
- **재현**: deposit 30억 + "담보채무 자동공제" 토글 ON → amount 30억이 §14 채무로 파생 → taxBase 0, 세액 0.
- **수정**: (1) `EstateItemEditor.tsx:133-137` showCollateralDeductToggle 조건에서 `cat === "deposit"` 제거, (2) `deriveCollateralDebts`에 `if (item.category === "deposit") return` 엔진 방어 가드(stale store 재발 방지). [Wave 1]

### C-8. 상호출자·10%초과 보유 비상장주식 평가에 §54① 단서(순자산 80% 하한) 누락 → 과소계상 `(렌즈3)`
- **위치**: `lib/tax-engine/property-valuation/cross-holding-equations.ts:256`
- **법령**: 상증령 §54①(mst 283637) 단서 — "가중평균이 순자산가치×80%보다 낮으면 순자산가치×80%를 가액으로".
- **재현**: 보유 B사 순손익가치 0·순자산 10,000/주 → 가중평균 (2×10,000+3×0)/5=4,000. 정답 max(4,000, 8,000)=8,000. 실제 4,000 → 하한 미적용.
- **수정**: `solveCrossHolding` perShareSupplementary 산출부(247~256)에서 `valuationBasis==="weighted"` 노드에 `floor80 = alpha×4/5` 적용, `net_asset_only` 분기(§54④) 제외.

### C-9. 감자 단일 고가소각에 §29의2①2호 「평가액<액면가」 한정요건 4개층 누락 → 통상사례 전액 과세 `(렌즈3)`
- **위치**: `lib/tax-engine/gift-deemed/capital-decrease.ts:52`
- **법령**: 상증령 §29의2①2호(mst 283637) — 고가소각 과세는 "1주당 평가액이 액면가액에 미달하는 경우로 한정".
- **재현**: 평가액 10,000 ≥ 액면 5,000 → 정답 0원. 실제 `deemedGiftValue=1,000,000,000`. 멀티 경로는 동일 입력에 0원(요건 반영됨) — 단일 경로만 누락.
- **수정**: `decreaseHigh`에 멀티와 동일 게이트: `if (faceValue == null || sharePrice >= faceValue)` → `applied=false, deemedGiftValue=0`. ④⑥⑧⑫ 동시 착지 필수(엔진 단독 적용 시 단일 high 전건 0원화).

### C-10. 비상장주식 V2 사업연도 순손익표 ① 소득금액이 결손(음수) 입력 불가 → 순손익가치 과대 `(렌즈3)` [G-5]
- **위치**: `components/calc/inheritance/unlisted-stock-v2/FiscalYearAdjustmentTable.tsx:291`
- **법령**: 상증령 §56④·§56① 후단 — 음수 가드는 3년 가중평균 단계에서만("가액이 음수인 경우 영으로"), 개별 사업연도 소득금액은 음수 허용.
- **재현**: 3년전 결손 −10억 입력 → 화면·store "1,000,000,000"(부호 소실) → 순손익가치 과대.
- **수정**: ROWS에 `signed` 플래그, `taxableIncome`(①)에 지정 → `allowNegative={row.signed}`. onChange `Number()||0` → `parseAmount(v)`.

### C-11. 개인가업 가업상속공제에 상증령 §15⑤1호 담보채무 차감 미구현 → 공제 과대 `(렌즈3)`
- **위치**: `lib/tax-engine/deductions/family-business.ts:247` (= H-19와 동일함수, 병합)
- **법령**: 상증령 §15⑤1호(mst 283637, 시행 2026-02-27) — 「소득세법 적용 가업」 재산가액은 "사업용 자산가액**에서 해당 자산에 담보된 채무액을 뺀 가액**". 법인세법 적용 가업(2호 사업무관자산 차감)은 이미 구현.
- **재현**: 개인가업 공장(기준시가 5억, 저당 8억) → grossEstate 편입 §66 하한 8억, 담보채무 8억은 §14로 별도 차감되나 가업공제 base에서 미차감.
- **수정**: `deriveFamilyBusinessValue`(:239)에 §15⑤1호 담보채무 차감 분기. `securedClaim` 산출부(`property-valuation.ts:381-383`)를 export 헬퍼로 추출(dual-truth 방지). **선결**: H-38(similarSales base) 선행.

### C-12. `decedentType` 엔진 미소비 → 비거주자에게 거주자 전용 공제 적용 `(렌즈3)` [G-1]
- **위치**: `lib/tax-engine/inheritance-tax.ts:485`
- **법령**: 상증법(mst 276123) — §18(기초공제)만 "거주자나 비거주자", §19·§20·§21은 "거주자의 사망으로". 저자 확인: `decedentType` grep 결과 엔진 소비처 0(UI 신고기한 표시만).
- **재현**: `decedentType:"non_resident"` → `totalDeduction:500,000,000`(일괄 5억), resident와 완전 동일. 정답 §18 2억만 → 과세표준 8억.
- **수정**: `InheritanceDeductionInput`에 `decedentType` 추가, `calcInheritanceDeductions` 초입에서 비거주자면 §18만. C-13·H-33과 동시 착지 필수(부분수정 시 anchor 미달). §22 금융재산공제도 거주자 한정이므로 범위 포함.

### C-13. §18의2① 거주자 요건 미검증 → 비거주자도 가업상속공제(최대 600억) 적격 `(렌즈3)` [G-1]
- **위치**: `lib/tax-engine/deductions/family-business.ts:174`
- **법령**: 상증법 §18의2①(mst 276123) 첫 문장 "**거주자의 사망으로 상속이 개시되는 경우로서**".
- **재현**: `decedentType:"non_resident"` + 요건 전부 충족 → 적격 판정 통과.
- **수정**: `FamilyBusinessInheritanceInput`에 `decedentType` 추가, `hasTaxFraudConviction` short-circuit(178행)과 동일 방식으로 비거주자 배제. `FamilyBusinessIneligibleReason` 유니온 추가로 라벨 Record가 누락을 컴파일타임 검출.

### C-14. 영농상속공제 §16⑤ 위반 — 자격 미충족 상속인 분배분이 영농재산가액에 합산 `(렌즈3)`
- **위치**: `lib/calc/inheritance-deduction-suggest.ts:422`
- **법령**: 상증령 §16⑤(mst 283637) — "제3항 요건을 갖춘 상속인이 받거나 받을 상속재산의 가액". 요건 미충족 상속인 분배분 제외.
- **재현**: h1(충족)+h2(미충족), 부록A 자동도출 모드, 농지 10억을 h1·h2 각 5억 → h2 5억이 그대로 합산.
- **수정**: `suggestFarmingAssetValue` 2번째 인자를 `FarmingInheritanceInput`으로 넓히고 `:422`를 `resolveEffectiveQualifiedHeirIds(farming)`(엔진 단일진실)로 교체.

### C-15. §59 외국납부세액공제가 메인+합산배제 스트림에 각각 전액 → 정확히 2배 공제 `(렌즈3)` [G-4]
- **위치**: `lib/tax-engine/gift-aggregation-excluded-stream.ts:133`
- **법령**: 상증법 §59(mst 276123) — 실제 부과받은 외국세액 1회분만 공제.
- **재현**(R1 H-6 재현 성공): 현금 10억 + 합산배제 5억, foreignTaxPaid 30,000,000. 단일 스트림 정상 감소 29,100,000(=3천만−§69 3%). 2스트림 실제 감소 **58,200,000**(각 스트림 전액 공제).
- **수정**: `creditInput: { ...input.creditInput, foreignTaxPaid: undefined }`로 §59를 메인 스트림에 일원화. + H-32(§21① 한도)와 함께.

---

## 3. HIGH (40건)

### 상속세 본체·배부
- **H-14** `inheritance-allocation.ts:586` `(렌즈3)` — §69 3% 하드코딩(C-5와 동일 근인, 배부표 각도). [G-2]
- **H-15** `presumed-inheritance.ts:21` `(렌즈3)` — 추정상속재산 §15에서 유가증권이 '기타재산'으로 분류(상증령 §11⑤1호는 현금·예금·유가증권 단일종류). 임계·20% 차감 이중적용. 정답 가산 240,000,000. → deposit 라벨 "현금·예금·유가증권"으로 확장 + category groupBy.
- **H-16** `inheritance-allocation.ts:560` `(렌즈3)` — 레거시 전역 `isGenerationSkip` 경로에서 §27 할증이 배부표 미반영 → Σ perHeir.finalTax가 결정세액보다 2.4억 적음. → warnings + `heirAllocationResult` undefined(자동 안분 fallback 금지).
- **H-33** `inheritance-tax.ts:147` `(렌즈3)` — §14② 위반, 비거주자인데 장례비·무담보 일반채무 차감. 정답 과세가액 +장례비. [G-1]
- **H-34** `inheritance-allocation-deductions.ts:125` `(렌즈3)` — 레거시 funeralExpense 경로에서 장례비 공제가 perHeir 미반영 → 각 상속인 과세가액상당액 장례비 전액만큼 과다. → `computeDebtByHeirWithFuneralCap`에 `funeralDeduction` 주입.

### 상속공제
- **H-17** `personal-deduction-calc.ts:366` `(렌즈3)` — §20 인적공제가 비상속인(며느리·사위 isHeir:false)까지 산입. → 공통 헬퍼 `isRealHeir`. **주의**: §20①1호 자녀공제는 「상속인」 한정 없어 blanket 배제 시 근거없는 불리 — 2~4호에만 적용. [G-3]
- **H-18** `inheritance-deductions.ts:513` `(렌즈3)` = C3축 재확인(H-31) — §23의2 10년 동거 미충족인데 전액 적용.
- **H-19** `inheritance-deduction-limit.ts:87` `(렌즈3)` — §24 종합한도 2호(선순위 상속포기로 다음순위가 받은 재산) 미구현 → 한도 과대. → `heirWaiverAmount?` 신규 필드(14지점 ⑫⑬⑭). 대습(§27 단서) 구별 위해 명시 입력.

### 가업상속
- **H-20** `family-business.ts:246` `(렌즈3)` — 개인가업 담보채무 미차감(C-11과 동일함수·병합).

### 증여세 본체
- **H-21** `gift-tax-two-stream.ts:293` `(렌즈3)` — 2스트림 경로 `giftDate` 미전달 → 일반 스트림 §69율 항상 3%. 정답 2017년 7%. 9,000,000 과소공제. [G-2]
- **H-22** `gift-aggregation-excluded-stream.ts:133` `(렌즈3)` — 합산배제 스트림 `giftDate` 미전달 → §69율 항상 3%. 3,360,000 과소. [G-2]
- **H-23** `gift-aggregation-excluded-stream.ts:133` `(렌즈3)` — §59 이중공제(C-15와 동일 라인). [G-4]
- **H-30** `gift-tax-two-stream.ts:63` `(렌즈3)` — 합산배제증여재산이 2스트림 특례 경로에서 §55①3호 분리과세·§47② 격리 상실. `isAggregationExcludedGift` 플래그를 436줄 전체에서 0회 참조. 정답 424,070,000 vs 실제 418,250,000. → STEP 0.1에서 합산배제 자산 먼저 분리 후 `calcAggregationExcludedStream` 3번째 스트림. [G-4]
- **H-31** `gift-special-stream.ts:163` `(렌즈3)` — 타입불일치 특례 사전증여가 두 스트림 모두 소실 + 조특법 §30의5⑭·§30의6⑦ 상호배제(창업자금·가업승계 병용금지) 미검증. → superRefine 상호배제 검사.

### 세액공제·납부
- **H-32** `credits/foreign-tax-credit.ts:99` `(렌즈3)` — 증여세 §59에 상증령 §48→§21① 점유비 한도 미적용 → 국외비중 10%여도 산출세액 전액 공제. 정답 한도 10,000,000 vs 실제 30,000,000 전액. → `foreignGiftTaxBase?` 신규 필드(14지점).
- **H-24** `inheritance-gift-tax-credit.ts:326` `(렌즈3)` — §74 문화유산 징수유예액이 §69 기준세액에서 미차감 → 신고세액공제 과대·결정세액 과소. → STEP 12.5를 STEP 11 앞으로 이동, `culturalHeritageDeferredTax?` 추가.

### 부담부증여
- **H-25** `burdened-gift-apportionment.ts:165` `(렌즈3)` — 미등기양도자산 개산공제율이 0.3%가 아닌 3%(10배 과대). 소령 §163⑥ 1호 "미등기 3/1000". → `computeEstimatedDeduction(price, isUnregistered)`로 확장.

### 재산평가
- **H-26** `property-valuation/capital-increase-adjustment.ts:74` `(렌즈3)` — §56⑤ 유상증자·감자 월할이 `fiscalYearStartDate` 무시하고 "종료일−1년+1일" 역산 → 1년미만 사업연도 과대·과소. → 시그니처에 `fiscalYearStartDates` 추가.
- **H-27** `lib/calc/unlisted-stock-valuation-lookup.ts:198` `(렌즈3)` — 비상장주식 이력조회 복원 시 §56④ 20개 가감항목·`fiscalYearStartDate` 필드명 불일치로 침묵 소실(`as unknown as` 이중캐스팅이 tsc 검출 무력화). → 캐스팅 제거 먼저(오타 전부 표면화).
- **H-38** `valuation/resolve-estate-item-value.ts:148` `(렌즈3)` — §60 우선순위에서 `similarSalesValue` 단계 누락 → 매매사례가액 평가 가업부동산의 공제 base가 0/기준시가로 축소. → appraised 단계 직후 similar_sales 삽입. [C-11 선행]

### 주식평가-상장
- **H-39** `lib/calc/listed-stock-besshi.ts:47` `(렌즈3)` — 상증령 §52의2②2·3호(평가기준일 이후 증자·합병) 미구현 → 사유발생일 이후 종가 전부 평균 산입. → `resolveStartOverrideDate`→`resolveOverridePeriod` 확장.

### 증여의제
- **H-28** `components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx:197` `(렌즈3)` — 순자산표 ③유보·⑱이연법인세대 음수 침묵제거 → 순자산 과대. [G-5]
- **H-29** `components/calc/deemed-gift/other-forms.tsx:321` `(렌즈3)` — §41의3 상장이익 폼 기업가치증가익·순손익 음수 입력 불가 → 증여재산가액 과소. [G-5]
- **H-40** `gift-deemed/nominee-trust.ts:45` `(렌즈3)` — §45·§45의2·§45의3·§42의3 증여의제 결과에 `aggregationExcluded` 플래그 부재 → 증여 마법사 이관 시 §53 공제·§47② 10년합산 대상화. → 4파일 반환객체에 `aggregationExcluded:true` + `§55①` 호 분기(1호 0·2호 0·3호 3천만) 동반.

### 조특법 특례
- (H-30·H-31 상기)

### 비과세
- **H-35** `components/calc/exemption/ExemptionChecklist.tsx:96` `(렌즈3)` — 장애인 신탁 §52의2③ 평생합산 5억 한도에서 기사용액(`priorDisabledTrustUsed`) UI 입력 부재 + 룰텍스트 '10년 합산' 오기 → 항상 잔여 5억(과소과세). → 전용 CurrencyInput 추가.

### 물납 (G-6, `payment-in-kind.ts` 집중)
- **H-36** `payment-in-kind.ts:189` `(렌즈3)` — §8 보험금·§9 금전신탁이 물납 요건3(§73①3호) 금융재산에서 누락(§73⑤에 보험금·특정금전신탁 명시열거) → 물납 불가를 "가능"으로 반전.
- **H-37** `payment-in-kind.ts:190` `(렌즈3)` — §9 부동산신탁이 물납 충당부동산(§74①1호)에서 누락 → 요건1 불충족화(불리).
- **H-41** `payment-in-kind.ts:209` `(렌즈3, 저자 확인)` — §73①1호 분자에서 유가증권 전량 누락(`eligibleSecuritiesValue:0` 하드코딩 + 비상장 미가산) → 비상장·유가증권 위주 상속 물납 전면 거부.
- **H-42** `payment-in-kind.ts:202` `(렌즈3)` — 표시용 `buildSummaryCategory`를 §73⑤ 금융재산 정의로 전용 → 대부금채권·전환사채·전세보증금 과대산입(불리), 보험금·특정금전신탁 과소산입(유리) 양방향.
- **H-43** `payment-in-kind.ts:95` `(렌즈3)` — §73①2호 금융회사등 채무 차감 미구현(debtItems 미전달 침묵소실) + 요건3(총액)과 한도2(순액) 단일변수 혼용. → `grossFinancialValue`/`netFinancialValue` 분리.

### 영농 사후관리
- **H-44** `deductions/farming-post-mgmt.ts:152` `(렌즈3)` — §18의3④ "상속개시일부터 5년 이내" 요건 미검증 → 5년 경과 후 처분·영농중단에도 전액+이자 추징. → `inheritanceStartDate` 추가, `violationDate > addYears(start,5)`면 무추징.

### 별지 서식 (G-7)
- **H-45** `gift-tax-filing-form-besshi10.ts:80` `(렌즈3)` — 합산배제 병존 시 별지10호 ㉓ 증여재산가산액 0 붕괴(사전증여 침묵소실).
- **H-46** `gift-tax.ts:423` `(렌즈3)` — 합산배제 병존 시 별지10호 ㉚과세표준·㉜산출세액·㊲세액공제가 §55①3호+4호 합산값으로 표시(서식 산식 붕괴).
- **H-47** `gift-tax-two-stream.ts:392` `(렌즈2)` — 2스트림 별지10호 ㊺ 자진납부세액이 combined값 → 12행 서식 ⑫와 2.5억 불일치. **착수 전 probe 재현.**
- **H-48** `lib/calc/gift-valuation-besshi.ts:56` `(렌즈1)` — 부표1 ⑭ 증여재산가산액 역산이 §47① 채무인수·§36 대납가산 미차감(엔진 역산헬퍼와 dual-truth). → `derivePriorGiftAddition` export 재사용. **착수 전 probe 재현.**
- **H-49** `lib/calc/filing-form-9-data.ts:147` `(렌즈0, 저자 확인)` — 별지9호 ㉛외국납부(§29)·㉜단기(§30)가 상수 0 하드코딩 → 엔진 계산 공제 소실. → `result.creditDetail` 단일진실 전환.
- **H-50** `lib/calc/deduction-besshi-data.ts:184` `(렌즈0, 저자 확인)` — 부표3 ⑲자녀·⑳미성년·㉑연로자·㉒장애인공제가 항상 null → itemized 모드 인적공제 전액 서식 소실. → `personalDeductionDetail` 읽어 매핑.

### 결과뷰
- **H-51** `components/calc/results/InheritanceTaxResultView.tsx:243` `(렌즈2)` — "납부할세액(징수유예 차감)"이 0 하한 없이 음수 표시(별지9호 ㊳=0과 모순). → `Math.max(0, finalTax − deferredTax)`. **착수 전 probe 재현.**

---

## 4. MEDIUM (17건) / LOW (1건)

| ID | 위치 | 결함 | 렌즈 |
|---|---|---|---|
| M-1 | `family-business-postmgmt-orchestrator.ts:143` | §18의2⑤4호나목 총급여 '5년 합계 vs 직전 2년 합계' 기간 불일치로 위반 놓침 | 2 |
| M-2 | `gift-aggregation-excluded-stream.ts:87` | 폼전역 감정평가수수료가 메인+합산배제 스트림 각각 차감(이중공제) [G-4] | 3 |
| M-3 | `results/GiftTaxResultView.tsx:226` | 연부연납 안내가 조특법 §30의6 특례에도 일반 5년(§71②2호가 15년 구분 코드베이스 부재) | 3 |
| M-4 | `burdened-gift-apportionment.ts:349` | K-5 부담부증여 개산공제 기준이 §163⑥ '취득당시 기준시가'가 아닌 환산취득가 → 채무비율 분모 어긋남 | 3 |
| M-5 | `lib/calc/listed-stock-besshi.ts:48` | §52의2②1호 '사유발생일 다음날부터'를 '발생일부터'로 구현(당일 종가 오산입) | 3 |
| M-6 | `deemed-gift/related-corp-form.tsx:84` | §45의3 일감몰아주기 '세무조정 후 영업손익' 음수 입력 불가 [G-5] | 3 |
| M-7 | `inheritance-house-valuation.ts:212` | §164⑦ 개별주택가격 추정 safeMultiply 후 부동소수 나눗셈 단일 floor 깨짐(1원 과대) [G-8] | 3 |
| M-8 | `inheritance-allocation-deductions.ts:143` | 장례비 안분이 상증령 §9②1호 500만 최소보장 미적용(Math.min만) | 3 |
| M-9 | `deductions/farming-post-mgmt.ts:122` | §16⑧2호 이자상당액 기간 1일 과소(말일 미포함) | 3 |
| M-10 | `data/installment-surcharge-rates.ts:33` | 연부연납 가산율 2016 시행일 1일 이른 오기(2016-03-06은 2.5%인데 1.8% 적용) | 3 |
| M-11 | `gift-tax-filing-form-besshi10.ts:156` | 조특법 §71 영농자녀 농지 감면세액이 별지10호 어느 행에도 없음(finalTax만 차감) | 3 |
| M-12 | `lib/calc/cohabit-besshi-data.ts:135` | 별지6호의2 ⑫칸이 자기 산식 min(⑩,⑪)과 불일치(2009~2019 상속 자체모순) | 3 |
| M-13 | `lib/calc/cohabit-besshi-data.ts:135` | 별지6호의2 ⑩이 §23의2 시기별율 미반영(2020 이전 상속) | 0 |
| M-14 | `results/useInheritanceResultDerived.ts:63` | `cultural-heritage-deferral` leaf가 `availablePrintIds` 누락(§74 카드 인쇄 불가) | 2 |
| M-15 | `results/GiftTaxResultView.tsx:255` | 증여 신고·분납기한이 §68① '말일 기산' 누락, 증여일에 직접 3개월(최대 30일 이르게) | 3 |
| M-16 | `credits/installment-payment.ts:125` | §71② 단서(각 회분 1천만 초과) 미적용 → 법상 불가능한 연부연납 일정 제시 | 2 |
| M-17 | `lib/calc/filing-form-9-data.ts:260` | 별지9호 ㊷신고·㊶분납기한이 §67④(비거주자 9개월) 미반영 → 연부연납표와 3개월 어긋남 | 3 |
| L-1 | `inheritance-generation-skip.ts:139` | §27 할증 per-heir 3항 부동소수곱 1원 미달(레거시 BigInt와 불일치) [G-8] | 3 |

---

## 5. PLAUSIBLE (13건) — 착수 전 선결과제 확인

| ID | 위치 | 결함 요약 | 반증 렌즈 | 선결과제 |
|---|---|---|---|---|
| P-1 | `transfer-tax-burdened-gift-step.ts:89` | 부담부증여 12억 분모가 증여가액C가 아닌 양도세 평가액 → 1세대1주택 고가판정 뒤집힘 | 법령근거 | §160① "양도가액" 해석(A 채무안분 vs B 증여가액) 법령 리서치 확정. 제안수정은 명문없는 불리 적용 소지 |
| P-2 | `inheritance-farming-deduction.ts:71` | §16⑭ 결격소득을 corporate(법인세법 영농) 트랙에도 적용(위임범위 밖) | 코드도달성 | corporate 트랙 도달성 재확인 |
| P-3 | `components/calc/PriorGiftInput.tsx:238` | §30의5①후단 특례 기간무관 합산이 증여 마법사서 도달 불가 | 수치재현 | 재차 창업자금 증여 입력경로 재확인 |
| P-4 | `inheritance-farming-deduction.ts:69` | §16⑭ 결격소득이 상속개시일 무관 적용(2026.2.27 신설 §16⑭2호 소급) | 코드도달성 | **부칙 적용례 원문 확인** — 소급이면 위법 |
| P-5 | `inheritance-corporate-exemption.ts:163` | 다수 영리법인 면제세액이 자기 산출세액 상한(Min) 초과 안분 | 법령근거 | §3의2② 지분상당액 산식 원문 재확인 |
| P-6 | `results/InheritanceTaxResultView.tsx:261` | 상속 결과뷰 `tax-credit` 섹션 레지스트리 미등록 → §28·§29·§30·§69 카드 인쇄 소실 | 수치재현 | leaf 등록 여부 재현 |
| P-7 | `legal-codes/inheritance-gift.ts:128` | 조특법 §71 영농자녀 감면 5년1억 한도 근거조문 상수 오기(§133④인데 §71②·§133②) [G-9] | 수치재현 | 표시 전용 |
| P-8 | `gift-deemed/contribution-in-kind.ts:127` | 현물출자 고가인수 §29의3① 본문단서(전·후 1주당 ≤0) 미구현 | 코드도달성 | 입력층 개방(음수 입력 가부) 설계결정 선행 |
| P-9 | `exemption-evaluator.ts:219` | 동일 ruleId 복수항목 시 §8③ 금양임야+묘토 2억 한도가 findIndex로 첫항목만(우회) | 코드도달성 | UI 복수입력 경로 재확인 |
| P-10 | `exemption-rules.ts:353` | 증여 비과세 룰 lawRef 대량 오기(§48①·§46의2 오출력) [G-9] | 수치재현 | 표시 전용 |
| P-11 | `gift-prior-aggregation.ts:290` | §47② 감면농지 합산 근거를 §71⑥으로(정답 §71⑦, §71⑥은 상속세 규정) [G-9] | 수치재현 | 표시 전용 |
| P-12 | `inheritance-gift-common.ts:310` | §57 증여할증 ⑧ surchargeBase 부동소수비율 곱 1원미달(⑩ 한도는 BigInt·내부 불일치) [G-8] | 수치재현 | 1원 위생수정 |
| P-13 | `exemption-rules.ts:116` | 금양임야 요건에 '종중 소유·직접관리' 명시(민법 §1008의3·상증령 §8③1호와 정반대, 불리 오안내) | 수치재현 | 원문 재확인 |

---

## 6. 수정 순서 제안 (의존·회귀위험 기준 4웨이브)

> **⚠️ 착수 전 필수 (2026-07-16 실착수 교훈)**: Wave 1의 "1줄·저위험"으로 분류된 세액 수정 다수가 실제로는 **법령 사실 확정(교재 대조·시행일 원문)·기존 anchor의 법령 정합성 판단**을 선행해야 한다. C-3는 착수하자 PDF 379p 교재 anchor와 충돌해 보류됐고(위), M-10은 국기칙 §19의3 시행일 원문 확인이 필요하다. **각 세액 수정은 KoreanLaw MCP로 법령 원문을 확정하고 관련 기존 테스트 anchor를 정독한 뒤 착수할 것.** 순수 표시 정합성 버그(엔진 값이 이미 맞고 서식/합산만 소실 — H-49·H-50 등)는 세액 무영향이라 상대적으로 안전.

- ~~**C-3** 복수가업 `individualCap` 제거~~ → **보류**(PDF 379p 교재 충돌, 위 C-3 참조)
- **C-6** `other` 평가 `resolveValuationAmount` 위임(validate·사이드바가 이미 §60 우선순위)
- **C-7** deposit 유령채무(UI 조건 + 엔진 가드 2지점)
- **H-38** `resolveEstateItemValue`에 similarSales 단계 삽입(**C-11 선행**)
- **H-15** 추정상속재산 유가증권 재분류 + category groupBy
- **C-9** 감자 §29의2①2호 액면 게이트(**④⑥⑧⑫ 동시**)
- **M-10** 연부연납 가산율 시행일 정정(1줄)

### Wave 2 — 단일진실 헬퍼 도입 (그룹 단위)
- **G-3 `isRealHeir(h)` 헬퍼** → C-1 + H-17 동시(H-17은 §20①2~4호에만)
- **G-2 `giftDate` required 승격** → H-21 + H-22 자동 해소
- **C-5/H-14** 배부표 §69 `resolveFilingCreditRate(deathDate)` (**부칙 기준일 축 확정 후**)
- **H-34/M-8** 장례비 `funeralDeduction` 주입 + 500만 최소보장 + 불변식 anchor(`Σ perHeir == 총액`)
- **H-16** 레거시 세대생략 배부 warnings(자동 안분 금지)

### Wave 3 — 순서의존·범위확장
- **C-12/C-13/H-33** `decedentType` 배선 (a)공제 (b)§14② (c)가업 **동시**(부분수정 시 anchor 미달, §22 포함)
- **C-11/H-20** 개인가업 §15⑤1호 담보채무 차감(H-38 선행, `securedClaim` export)
- **H-24** §74 → §69①1호 STEP 이동(H-14 선행 권장)
- **C-2** 가업 사후관리 산입액↔세액 분리(설계 결정: `결정상속세액` 입력)
- **H-30/H-40** 합산배제 스트림 분리 + §55① 호 분기 + `aggExclClass` 구분자
- **C-15/H-23/H-32/M-2** §59 이중공제 격리 + §21① 점유비 한도(동일 파일·구조)
- **G-6 물납 재설계** H-36·H-37·H-41·H-42·H-43 (`buildSummaryCategory` 전용 → §73⑤·§74① 법정분류 헬퍼 + grossFinancial/netFinancial 분리)

### Wave 4 — 차단전환·회귀위험·서식·저액
- **H-18/C3** §23의2①1호 차단(상속 E2E 전수 회귀 확인, `cohabitStartDate` 미입력 시 기존동작 유지)
- **H-19** §24 2호 `heirWaiverAmount` 신규 필드(14지점, 회귀 0)
- **C-4** §47② 1천만 임계 + §58·§57 연계값(증여 E2E)
- **G-5 일괄** C-10 + H-28 + H-29 + M-6(`allowNegative`, Zod와 1:1, `parseAmount` 교체, 회귀 0)
- **H-26/H-27/H-39** 비상장·상장 주식평가(캐스팅 제거 먼저)
- **H-25/M-4** 부담부증여 개산공제(동일함수)
- **G-7 서식 일괄** H-45~H-50 + M-11~M-13·M-17(엔진값 단일진실 전환, `pdf_table_row_one_to_one_mapping`)
- **H-35** 장애인 신탁 §52의2③ UI 입력
- **H-44** 영농 §18의3④ 5년 요건
- **M-3/M-15/M-16/M-17** 신고·납부기한 §67④·§68① 말일 기산
- **G-8 일괄** M-7 + L-1 + P-12(`safeMultiplyThenDivide` 이식)
- **G-9 일괄** P-7 + P-10 + P-11 + M-5(`legal-codes` 상수화, 표시 전용)

### 공통 회귀 게이트
- 배부 경로에 `Σ perHeir.finalTax === result.finalTax` 불변식 anchor 일괄 도입.
- Wave 3 착수 전 `npx vitest run __tests__/tax-engine/inheritance/ __tests__/tax-engine/gift*/` 기준선 확보.
- 차단 validation 전환(H-18)은 상속 E2E 전수 회귀 후 머지(`feedback_blocking_validation_full_e2e_regression`).
- `(렌즈0·1)` 서식 건(H-47·H-48·H-49·M-13·H-51)은 착수 전 probe 재현 필수.

---

## 7. 미조사 잔여 (3라운드 후보 — 지출 한도로 미실행)

2R 완전성비평 에이전트가 미실행됐으나 커버리지 노트로 파악된 잔여:
- **§8~§10 상속재산 의제 산식**(보험금 §8① 안분·퇴직금 §10 단서) — `legal-codes`에 조문 상수 부재, `deemedCategory` 문자열로만 처리. 물납(H-36·H-37)에서 부분 확인됐으나 의제 산식 자체는 미검증.
- **§16·§17·§48 공익법인 출연재산 사후관리** — `public-interest-stock-limit.ts` 한도주식수 산식 표본만 확인.
- **§75·§76 결정·경정** — grep 히트 0(미구현). 기능 갭 여부 미판정.
- **기대여명 테이블**(`data/life-expectancy-2023.ts`) — 통계청 2023 생명표 원본 대조 미완(§20①4호·§62·§61 3경로 전파).
