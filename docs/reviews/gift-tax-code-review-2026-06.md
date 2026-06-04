# 증여세 코드 리뷰 — 통합 리포트 (2026-06)

> 멀티 에이전트 워크플로(15영역 병렬 리뷰 → 적대적 검증) 산출물. 엔진+UI+테스트.
> 결과: 제기 46 → **확정 31** (반증 기각 15). HIGH 9 · MEDIUM 12 · LOW 10.
> 검증 표기: `[N/N]`=refuter 코드/probe 재확인 확정. `[미검증]`=refuter StructuredOutput 실패 자동보존(정적 사실 위주, 적용 전 확인 권장).

## ⚠️ 최우선 — §47 cutoff 회귀 (상속세 §13 수정이 증여 경로 누락)

**G-H1 [법령] §47 동일인 10년 합산 cutoff가 증여 실경로에서 연(年) 절사 — `lib/tax-engine/gift-prior-aggregation.ts:112-113` `[2/2]`**
`differenceInYears(current, giftDate) > 10` 만연수 절사 → 10년+1~364일 도과 사전증여를 §47 합산에 잘못 포함 → 과세표준·산출세액·§53 잔여공제·§58 한도 모두 과대. 증여 엔진(`gift-tax.ts:35,99`)이 import하는 것은 이 3-arg 함수다. 상속세 리뷰에서 한 일 단위 수정(`subYears`+`isBefore`)은 **`inheritance-gift-common.ts:377-404`의 미사용 2-arg 동명 함수에만** 적용 → 증여 경로 미반영(dual-truth). 부담부증여(`burdened-gift-apportionment.ts`→`calcGiftTax`)도 동일 경로.
- **probe**: 증여일 2026-05-21, 사전 2016-05-20(10년+1일) → OLD 포함(오류)/NEW 제외(정답). 경계 2016-05-21 → 양쪽 포함.
- **수정**: `gift-prior-aggregation.ts:112-113`을 `const boundary47 = subYears(current,10); if (isBefore(new Date(gift.giftDate), boundary47)) continue;`로 교체(`differenceInYears` 제거). **G-M1과 함께** 미사용 2-arg 함수 제거/단일화(`single-source-engine-helper`). 증여 경로 경계 anchor 추가(G-M10·G-M11).
- **연관**: G-M1(동명 함수 dual-truth), G-M10(anchor가 미사용 함수 검증 → false confidence), G-M11(증여 §47 경계 anchor 부재), LOW(이력모달 boundary 표시↔필터 불일치 `PriorGiftHistoryModal.tsx:262`·`prior-gift-lookup.ts:211` 동일 패턴).

---

## 🔴 HIGH (distinct)

### G-H2 [법령/부담부증여] §159①2호 양도가액 ≠ 인수채무액 — `lib/tax-engine/burdened-gift-apportionment.ts:222-243` `[미검증]`
standard 모드 자산별 양도가액 안분 분자가 항상 기준시가 합(supplementary)으로 고정인데, `selectedMode`가 mortgage/rental이면 분모(`sangjeungbeopValuation.max`)가 더 커서 `total = supplementary × B / max < B`. §159①2호상 양도가액=인수채무액(B)이어야 하나 담보(§66)·임대(§61⑤) 평가가 기준시가보다 큰 일반 케이스에서 **양도가액 과소 → 양도세 과소**. workingInput.transferPrice override라 본 계산 전체 영향.
- **probe**: 채무 700M·supplementary 500M·mortgage 700M → totalTransfer 500M(채무보다 200M 과소).
- **수정**: selectedMode≠supplementary일 때 자산별 양도가액 안분 합이 max와 일치하도록 재구성, 또는 `(assetValue/ΣassetValue) × B`로 §159①2호 정의대로. mortgage/rental anchor 추가(현재 supplementary만).

### G-H3 [테스트] buildInput(GiftTaxForm) API 변환 테스트 전무 — `components/calc/GiftTaxForm.tsx:609-638` `[미검증]`
폼→`GiftTaxInput` ④ 변환(marriageExemption·birthExemption·priorUsedDeduction·creditInput·priorGifts sourceCalculationId strip·isGenerationSkip·exemptions 조건부 undefined)을 검증하는 테스트 0건. 신규 필드 strip·fallback 회귀가 TS·테스트 양쪽 침묵.
- **수정**: buildInput export 또는 `lib/calc/gift-api.ts` 추출 후 순수함수 anchor.

### G-H4 [부담부증여] buildBurdenedGiftInfo 변환 테스트 전무 — `lib/calc/transfer-tax-api-burdened-gift.ts:59-148` `[미검증]`
⑬ body spread 변환(priorGifts §58 computedTax/giftTaxBase 매핑·assetKind 4분기 landStd/buildingStd)을 import·실행하는 테스트 0건. floor 안분·assetKind 분기 누락 무방비.
- **수정**: 단위 anchor(§58 필드 보존·assetKind 4분기·floor 정수).

---

## 🟡 MEDIUM (distinct)

### G-M1 [dual-truth] 동명 함수 2개 공존 — `inheritance-gift-common.ts:377-404`(미사용 2-arg) vs `gift-prior-aggregation.ts:102`(실사용 3-arg) `[1/1]`
일 단위 수정이 미사용 함수에만. **G-H1과 함께 단일화** — gift-prior-aggregation 단일 진실, 2-arg 삭제.

### G-M2 [dual-truth] isMinorDonee(§57 40%) 토글이 isGenerationSkip ToggleCard children 중첩 — `GiftTaxForm.tsx:340-355` `[2/2]`
ToggleCard는 `{checked && children}` → isGenerationSkip OFF면 isMinorDonee 미렌더. 엔진은 §57을 donor=grandparent로 판정하고 isMinorDonee를 항상 읽음(40%=`isMinorDonee && grossGiftValue>20억`). donor=조부모+isGenerationSkip OFF+미성년+20억 초과 시 엔진 30%인데 **사용자가 40% 입력 불가** → 세액 과소.
- **수정**: isMinorDonee를 donor=grandparent일 때 항상 노출(엔진 게이트와 가시성 일치), 또는 isGenerationSkip을 donor 자동도출로 통일.

### G-M3 [dual-truth] donor(§47/§57) vs donorRelation(§53) 이중 입력 cross-validation 부재 — `GiftTaxForm.tsx:274-338` `[1/1]`
동일 관계를 두 enum으로 입력, validateStep 정합성 미검사. donorRelation=spouse(6억)+donor=grandparent(세대생략 할증) 같은 양립불가 조합 통과 → 비정상 세액.
- **수정**: donor→donorRelation 자동도출 매핑 또는 validateStep 양립성 검증(미성년 분기 isMinorDonee 정합).

### G-M4 [dual-truth] 사전증여 동일그룹 판정 하드코딩(A·B만) → C~G 그룹 §58 침묵 누락 — `GiftTaxForm.tsx:222-233` `[1/1]`
⑤⑦ 필수 판정을 father/mother·grandparent 하드코딩으로. spouse 등 C~G 그룹 동일그룹 사전증여 시 ⑤⑦ 미입력 통과 → 엔진은 §47 합산하나 §58 분자 0 → **기납부 증여세 미공제(이중과세)**.
- **수정**: 엔진 `isSameDonorGroup(p.donor, form.donor)` import 재사용(`single-source-engine-helper`).

### G-M5 [표시] 부담부증여 라벨 lineal_ascendant_minor 입력"직계비속"↔엔진/결과"직계존속" — `BurdenedGiftBlock.tsx:50-59` `[1/1]`
같은 enum 값 라벨이 입력↔엔진(`gift-deductions.ts:209`)↔결과(`BurdenedGiftDetailCard.tsx:25`)에서 정반대. 세액 무관, 보고 혼동. 입력 블록의 `lineal_ascendant_*` 두 값이 반대로 라벨됨.
- **수정**: 3지점 라벨 단일화(타입 의미 "미성년자 직계존속" 기준).

### G-M6 [동기화] giftDate prop 미전달 → 상장주식 평가조서 valuationDate undefined — `GiftTaxForm.tsx:697-716` `[미검증]`
`<GiftTaxResultView ... />`에 giftDate 누락 → 갑지 ④ 평가기준일 공백. **1줄**: `giftDate={form.giftDate}`.

### G-M7 [동기화] startupInvestmentCompleted UI 위젯 누락 — `GiftTaxForm.tsx:499-528` `[미검증]`
창업자금 §30의5④ 투자완료 필드(Zod·엔진 존재)가 FormState·위젯·buildInput 누락 → 항상 undefined. `special-tax-treatment.ts:89` 엄격 false 비교라 투자 미완료 차단 불가.
- **수정**: specialTreatment='startup' 시 체크박스 + FormState + buildInput 매핑.

### G-M8 [동기화] GiftTaxForm 복원 시 normalizeRestoredFormDates 미호출 — `GiftTaxForm.tsx:544-556` `[미검증]`
`InheritanceTaxForm`은 복원 후 호출(H-5 수정), gift 폼은 raw spread만 → V2 비상장주식 Date string화로 validate 차단(H-5 버그 gift 경로 재현).
- **수정**: 복원 블록에 `normalizeRestoredFormDates(parsed)` 적용.

### G-M9 [JSON직렬화] 부담부증여 giftDate `toISOString()` KST 1일 시프트 — `burdened-gift-apportionment.ts:285` `[미검증]`
`params.giftDate.toISOString().split("T")[0]` → KST 자정 Date가 UTC 전날로 롤백. §47 boundary·§53의2 2년 윈도우 기준일 1일 오차. CLAUDE.md Date 정책 위반.
- **수정**: `format(params.giftDate, 'yyyy-MM-dd')` 또는 date-coerce 헬퍼.

### G-M10 [테스트] §47 day-unit anchor가 미사용 함수 검증 → false confidence — `section13-cutoff-day-precision.test.ts:25` `[미검증]`
CUTOFF-A5/A6이 2-arg(미사용) 함수를 검증 → 녹색이어도 증여 실경로 무검증. G-H1을 가림.
- **수정**: 3-arg `gift-prior-aggregation` 경계 anchor 추가.

### G-M11 [법령] 증여 §47 경계 anchor 부재 — `gift.test.ts E13` `[미검증]`
증여 경로 §47 cutoff 경계(10년 vs 11년) anchor 없음(E13은 경과 3년 무관).
- **수정**: 경계 anchor 2건(포함/제외).

### G-M12 [JSON직렬화] gift route 통합 테스트 부재 — `app/api/calc/gift/route.ts:46-83` `[미검증]`
Zod round-trip strip·422/400 매핑·result Map→{} 소실 검증 0건.
- **수정**: safeParse round-trip + result 직렬화 보존 anchor.

---

## 🟢 LOW (10)
- **§69 신고세액공제 formula** `(⑬−⑯)×3%`가 외국납부(§59)·특례 차감 생략 — `gift-filing-form-rows.ts:180` `[1/1]`. 표시만(금액은 엔진값 정확). (단기재상속 §30은 증여 무관 — 주장 일부 정정)
- **이력모달 boundary 표시↔필터 불일치** — `PriorGiftHistoryModal.tsx:262`·`prior-gift-lookup.ts:211` `[1/1]`. 표시. G-H1과 동일 패턴.
- **isGenerationSkip dead field 주석 드리프트** — `gift-tax.ts:159` `[미검증]`. (G-M2 연관) 주석 "명시 입력 우선"↔실제 donor만.
- **priorGiftCreditDetail.creditLimit BigInt 미경유** — `gift-tax.ts:224` `[미검증]`. 2^53 초과 ±1원. `safeMultiplyThenDivide` 사용.
- **부담부증여 priorGifts donor 강제 매핑** — `burdened-gift-apportionment.ts:320` `[미검증]`. 확인필요(다른 그룹 prior 표현 불가한지).
- **§53의2 혼인출산 공제 상한 캡 누락 + donorRelation 게이트 부재** — `gift-deductions.ts:100-130` `[미검증]`. 확인필요(§53의2는 직계존속 한정인데 게이트 없음). G18 anchor 연관.
- **리뷰 지시 vs 구현 입도 anchor 미동결** — `gift.test.ts E13` `[미검증]`. (G-M10/11 중복)
- **G18 anchor 배우자+혼인공제 비적격 조합 동결** — `gift-deductions.test.ts:156` `[미검증]`. §53의2 직계존속 한정 위반 조합을 정상 anchor화.
- **E13 anchor priorUsedDeduction 자기일관성 미검증** — `gift.test.ts` `[미검증]`.
- **§53/§53의2 fallback 3중 패턴 검증 누락** — `GiftTaxForm.tsx:614` `[미검증]`.

---

## 권장 조치 순서

1. **🚨 G-H1 §47 cutoff 일 단위 정정** (+ G-M1 함수 단일화 + G-M10·G-M11 anchor) — 상속세 §13 수정이 증여 경로 누락된 **회귀**. 세액 직접 영향. 최우선.
2. **G-H2 §159 부담부증여 양도가액** — 양도세 과소(법령정확성).
3. **UI dual-truth**: G-M2(isMinorDonee 노출)·G-M3(donor/donorRelation 정합)·G-M4(동일그룹 §58).
4. **동기화 누락**: G-M6(giftDate 1줄)·G-M7(startup)·G-M8(복원 Date)·G-M9(toISOString).
5. **표시/법령**: G-M5(라벨)·§53의2 게이트(LOW)·§69 formula.
6. **테스트 가드**: G-H3·G-H4·G-M12 + LOW anchor 품질.

## 메타
- 워크플로 73 subagent · 3.25M 토큰. 통합 리포트 에이전트 세션 한도 실패 → 31건 구조화 데이터에서 수동 종합.
- §47 cutoff(G-H1)는 6개 영역 중복 검출 — 본 리뷰 최고 신뢰·최고 우선.
