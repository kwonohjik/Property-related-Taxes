# 상속세·증여세 UI 코드 리뷰 — 통합 대장 (2026-09)

> 멀티 에이전트 워크플로 산출물: **27청크 병렬 리뷰 → 발견마다 독립 refuter 2명**
> (코드사실 렌즈 / 규칙·영향 렌즈) 적대적 검증. 전 항목 2렌즈 검증 완료 — 미검증 0.
> 범위: **277파일 · 60,349줄** — 상속·증여 UI 전체(마법사·별지서식·증여의제·사후관리·결과뷰·메인 폼).
> 결과: 제기 174 → **확정 164** (동일근본 병합 2 · NIT 강등 8 · 반증 기각 0).

## 검증 상태 표기

- `[2/2]` — 독립 refuter 2명이 코드·규칙·법령을 재확인하고 **반증에 실패**한 건. 실재 확정.
- `[½]` — refuter가 **절반만 성립**한다고 판정해 주장이 정정된 건. 정정 내용을 함께 적었다.
- `[강등]` — refuter가 심각도를 낮춘 건. 원래 심각도를 병기했다.

**확정 164건** — BLOCKER 10 · MAJOR 81 · MINOR 73

| 축 | 건수 | 내용 |
|---|---:|---|
| A-배관 | 32 | 14 동기화 지점 — ④API변환·⑧validate·⑫Zod·⑬body·⑭Route 단절 |
| B-3중패턴 | 14 | UI fallback ↔ API ↔ validate 불일치, 부분 patch 덮어쓰기 |
| C-공용컴포넌트 | 10 | ToggleCard·ToneCard·CurrencyInput·HomeButton 등 강제 규칙 |
| D-타입 | 4 | 침묵 strip·죽은 prop·부동소수 |
| E-표시법령 | 71 | 라벨≠내용, 산식 불일치, 조문 인용 오류, 별지 서식 재현 |
| F-도달가능성 | 33 | 렌더 게이트에 갇힌 입력, 스스로 사라지는 카드, 인쇄 누락 |

---

## 우선 처리 — BLOCKER 요약

| ID | 파일 | 결함 |
|---|---|---|
| c03-1 | `components/calc/deemed-gift/other-forms.tsx:585` | §45의5 «지분율 직접» 모드에서 법인세 자동안분 3필드가 엔진에 전혀 도달하지 않는다 |
| c04-1 | `components/calc/exemption/ExemptionChecklist.tsx:96` | 사회통념 비과세 5항목은 금액 입력란이 없어 항상 0원 차감 |
| c07-1 | `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:251` | 개업연월일이 ⑫Zod에서 침묵 strip돼 엔진에 미도달 |
| c08-1 | `lib/calc/inheritance-api.ts:68` | ⑬ body에 filingPenalty 누락 — 상속 가산세가 조용히 0 |
| c09-1 | `components/calc/inheritance/Step4DeductionChecklist.tsx:322` | heirWaiver 칩이 없어 §24②2호 입력 칸에 영원히 도달 못 함 |
| c10-1 | `components/calc/inheritance/estate-card/CategoryChangeDialog.tsx:207` | 「필드가 삭제됩니다」 경고와 달리 비호환 필드가 남아 §14 유령 담보채무가 계산된다 |
| c11-1 | `components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx:274` | 토지 '양도시 개별공시지가'가 원/㎡를 총액 필드 item.standardPrice에 쓴다 |
| c14-1 | `components/calc/inheritance/family-business/FbHeirRequirementsSection.tsx:294` | 가업 임원취임일이 Zod ⑫에서 침묵 strip — 다목 자동판정 미도달 |
| c17-1 | `components/calc/inheritance/unlisted-stock-v2/OtherUnlistedHoldingSection.tsx:176` | 상호출자 counterparty 5필드가 Zod에 없어 서버에서 침묵 stripping |
| c24-1 | `components/calc/HeirEditor.tsx:572` | 동거요건 블록의 부분 patch를 전체 patch로 매핑 — 시작일↔사유가 서로를 지운다 |

**공통 근본이 둘 있다.** ⑬ body 명시 키 누락(`c08-1`)과 ⑫Zod 스키마 키 부재(`c07-1`·`c14-1`·`c17-1`)는
모두 **TypeScript가 잡지 못하는 침묵 stripping**이다 — 루트 CLAUDE.md가 「⑫⑬⑭는 tsc 미감지」로 경고한 그 패턴이다.

---

## BLOCKER (10건)

### IG-001 · §45의5 «지분율 직접» 모드에서 법인세 자동안분 3필드가 엔진에 전혀 도달하지 않는다

`[2/2]` · **BLOCKER** · A-배관 · `components/calc/deemed-gift/other-forms.tsx:585`

- **현상**: SpecificCorpFields의 섹션2(법인세 상당액)는 scMode와 무관하게 항상 렌더되어, scMode="single"에서도 scCorporateTaxMode="auto"를 고를 수 있다. auto를 고르면 직접입력 칸(scCorporateTax, :576-584)이 사라지고 산출세액·공제감면·소득금액 3칸(:585-616)이 대신 뜬다. 그런데 ④API 변환은 이 3필드를 roster 분기 안에서만 전달한다(gift-deemed-api.ts:553 `if (isRoster && form.scShareholders...)` → :570-572). single 경로는 그 아래 :590 `corporateTax: parseAmount(form.scCorporateTax)`로 떨어지는데, 그 값은 auto 모드에서 UI가 칸을 숨겨 항상 ""→0이다.
- **근거**: components/calc/deemed-gift/other-forms.tsx:565(모드 라디오·게이트 없음)·:576(`{!isAuto &&` 직접입력 숨김)·:585-607(auto 3필드) / lib/calc/gift-deemed-api.ts:553·:570-572(auto는 roster에서만)·:590(single 경로가 scCorporateTax만 전달) / lib/calc/gift-deemed-validate.ts:329-331(single+auto에서 산출세액·소득금액을 필수로 «요구») / lib/tax-engine/gift-deemed/specific-corp.ts:26-28(`corpProfit = transactionBenefit - corporateTax`)
- **영향**: single+auto 경로에서 법인세 상당액이 항상 0으로 계산된다. 특정법인의 이익 = 거래이익 전액이 되어 증여의제이익이 「법인세 안분액 × 지배주주 지분율」만큼 과대 산출된다(예: 거래이익 5억·산출세액 2억·소득금액 10억·지분율 50% → 정답 2억, 실제 2.5억 = 5천만원 과대). ⑧validate는 그 3칸을 필수로 요구하므로 사용자는 반드시 입력해야 하고, 화면의 corpTaxEcho(:608-614)는 안분액을 계산해 보여주면서 엔진에는 0이 가는 «이중 진실»이 된다. 형제 축인 lgCorpGrowthMode auto는 gift-deemed-api.ts:507-515에서 정상 전달되므로 이 경로만 누락이다.
- **제안**: gift-deemed-api.ts single 경로(:586-592)에도 `isAuto`일 때 annualIncome·corporateTaxComputed·corporateTaxCredit을 전달하도록 분기를 추가한다(엔진 calcSpecificCorpGift가 single에서 auto 안분을 못 하면, roster auto와 동일한 안분식을 single에도 태울 수 있게 엔진 입력을 열어야 한다). 그 전까지는 대안으로 other-forms.tsx:565의 라디오를 `isRoster`일 때만 렌더해 도달 자체를 막는다 — 다만 그 경우 validate:329-331의 single+auto 분기도 함께 제거해야 한다.
- **대조**: `lib/calc/gift-deemed-api.ts:553` · `lib/calc/gift-deemed-api.ts:570` · `lib/calc/gift-deemed-api.ts:590` · `lib/calc/gift-deemed-validate.ts:329` · `lib/tax-engine/gift-deemed/specific-corp.ts:26` · `lib/tax-engine/gift-deemed/specific-corp.ts:64`
- *(리뷰 ID c03-1)*

### IG-002 · 사회통념 비과세 5항목은 금액 입력란이 없어 항상 0원 차감

`[2/2]` · **BLOCKER** · F-도달가능성 · `components/calc/exemption/ExemptionChecklist.tsx:96`

- **현상**: 금액 입력 위젯이 `{rule.limitType !== "social_norm" && (...)}` 게이트 안에만 있다. `handleAmountChange`(:371)를 호출하는 지점은 이 위젯 하나뿐이고(claimedAmount 기록 지점 grep 결과 :109 단일), 체크 시 생성되는 항목은 `{ruleId, claimedAmount: 0}`(:367)이다. 따라서 limitType이 social_norm인 규칙은 claimedAmount가 영구히 0이다.
- **근거**: ExemptionChecklist.tsx:96(게이트)·:109(유일한 writer)·:367(초기값 0) / lib/tax-engine/exemption-rules.ts:209 inh_disaster_relief·:244 gift_living_cost·:263 gift_congratulatory·:281 gift_wedding_gifts·:317 gift_disaster_relief 5건이 limitType "social_norm" / lib/tax-engine/exemption-evaluator.ts:179-180 `if (rule.limitType === "social_norm" ...) exemptAmount = item.claimedAmount;`
- **영향**: 이재구호금품·치료비(상속), 생활비·교육비·치료비 / 축의금·부의금 / 혼수품 / 재해구호금품(증여) 5개 비과세 항목을 칩으로 선택해도 비과세 차감액이 항상 0원이다. 사용자가 해당 비과세를 적용할 수단이 아예 없고, 결과 화면에는 -0원이 찍힌다. ⑧validate도 claimedAmount>0을 요구하지 않아(lib/calc/inheritance-validate-exemption.ts 전문) 오류 없이 통과한다.
- **제안**: social_norm도 금액 입력을 렌더한다(엔진이 claimedAmount를 그대로 쓰므로 한도 표기만 생략). 반대로 「금액 없이 인정」이 의도라면 엔진 :179 분기가 claimedAmount를 쓰지 않도록 바꾸고 칩의 「금액 미입력」 경고 집계(:171)에서도 제외해야 한다 — 지금은 UI와 엔진 중 한쪽이 반드시 틀렸다.
- **대조**: `lib/tax-engine/exemption-evaluator.ts:179` · `lib/tax-engine/exemption-rules.ts:209` · `lib/calc/inheritance-validate-exemption.ts:15`
- *(리뷰 ID c04-1)*

### IG-003 · 개업연월일이 ⑫Zod에서 침묵 strip돼 엔진에 미도달

`[2/2]` · **BLOCKER** · A-배관 · `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:251`

- **현상**: 이 DateInput이 쓰는 familyBusiness.openingDate가 familyBusinessInheritanceInputSchema에 선언되어 있지 않다. deductionInput은 route에서 `as` 캐스팅되므로 TypeScript도 못 잡는다. 반면 엔진은 openingDate를 실제로 소비한다(decedentCEOPeriods와 함께 있을 때만 대표이사 요건 자동판정).
- **근거**: lib/validators/family-business-inheritance-schema.ts:12-65 에 openingDate 없음(파일 전체 확인). 런타임 probe: familyBusinessInheritanceInputSchema.parse({...openingDate:"2005-01-01", decedentCEOPeriods:[...]}) → openingDate=false / decedentCEOPeriods=true. 엔진 소비지점 lib/tax-engine/deductions/family-business-autoderive.ts:345-349 `else if (input.decedentCEOPeriods?.length && input.openingDate)`.
- **영향**: 사용자가 개업연월일+대표이사 재직구간을 입력하면 화면(FbDecedentRequirementsSection:85-87)은 「재직 비율 X% — 1호 충족」을 보여주지만, 서버 엔진은 openingDate가 없어 자동판정 분기에 못 들어가고 legacy decedentCEORequirementMet(EMPTY_FB 기본 false)를 쓴다 → decedent_ceo_requirement_failed로 가업상속공제 0원. 화면과 세액이 반대다.
- **제안**: familyBusinessInheritanceInputSchema에 `openingDate: z.string().optional()` 추가. 같은 스키마에 heirOfficerAppointDate도 부재한데 엔진(family-business-autoderive.ts:291-293)이 소비하므로 함께 점검할 것.
- **대조**: `lib/validators/family-business-inheritance-schema.ts:12` · `app/api/calc/inheritance/route.ts:52` · `app/api/calc/inheritance/route.ts:86` · `lib/validators/property-valuation-input.ts:366` · `lib/tax-engine/deductions/family-business-autoderive.ts:345`
- **병합**: 동일 근본으로 `c14-2` 흡수
- *(리뷰 ID c07-1)*

### IG-004 · ⑬ body에 filingPenalty 누락 — 상속 가산세가 조용히 0

`[2/2]` · **BLOCKER** · A-배관 · `lib/calc/inheritance-api.ts:68`

- **현상**: callInheritanceTaxAPI의 body 객체(68~93행)는 키를 하나씩 명시 나열하는데 filingPenalty가 없다. buildInput은 이 필드를 만들고(components/calc/InheritanceTaxForm.tsx:416 `...buildFilingPenaltyInput(...)`), Zod(⑫)도 route(⑭)도 이 필드를 갖고 있으나, 클라이언트가 보내는 JSON에서 빠지므로 서버에 도달하지 않는다.
- **근거**: lib/calc/inheritance-api.ts:68-93 (body 키 전수: decedentType·deathDate·estateItems·funeralExpense·funeralBonganExpense·funeralIncludesBongan·debts·debtItems·presumedItems·exemptions·preGiftsWithin10Years·heirs·deductionInput·creditInput·valuationBaseDate·isGenerationSkip·isMinorHeir·generationSkipAssetAmount·appraisalFee — filingPenalty 없음) / lib/tax-engine/inheritance-tax.ts:394·401 `input.filingPenalty ?? { filingStatus: "on_time" }` / app/api/calc/inheritance/route.ts:98 `filingPenalty: parsedData.filingPenalty` / lib/validators/property-valuation-input.ts:535
- **영향**: 무신고·기한후신고를 선택해도 §47의2 신고불성실가산세와 §47의4 납부지연가산세가 항상 0으로 계산된다. 엔진이 미도달 시 on_time으로 fallback하므로 오류도 뜨지 않는다. 증여세는 engineInput 전체를 그대로 보내(components/calc/GiftTaxForm.tsx:161-164) 이 문제가 없어 세목 간 결과가 갈린다.
- **제안**: body에 `filingPenalty: input.filingPenalty,`를 추가한다(appraisalFee 바로 아래). 재발 방지로 body 키 집합을 InheritanceTaxInput 키에 대해 satisfies로 고정하는 가드를 두는 것도 가능.
- **대조**: `components/calc/InheritanceTaxForm.tsx:416` · `app/api/calc/inheritance/route.ts:98` · `lib/tax-engine/inheritance-tax.ts:394` · `lib/validators/property-valuation-input.ts:535` · `lib/calc/inheritance-gift-filing-penalty-input.ts:90-160`
- **병합**: 동일 근본으로 `c25-1` 흡수
- *(리뷰 ID c08-1)*

### IG-005 · heirWaiver 칩이 없어 §24②2호 입력 칸에 영원히 도달 못 함

`[2/2]` · **BLOCKER** · F-도달가능성 · `components/calc/inheritance/Step4DeductionChecklist.tsx:322`

- **현상**: MANUAL_KEYS·MANUAL_META는 수동 항목 9개(heirWaiver 포함)를 정의하는데, 칩 그리드는 familyBusiness(:314) + B그룹 5개(:322) + C그룹 2개(:334) = 8개만 렌더한다. heirWaiver 칩이 어디에도 없다.
- **근거**: lib/calc/inheritance-deduction-checklist.ts:41-51 MANUAL_KEYS 9개 · :143-144 manualItemHasValue("heirWaiver")=hasStr(heirWaiverAmount) · :207-209 isManualItemActive = overrides[key] ?? hasValue. deductionChecklistOverrides의 유일한 writer는 Step4DeductionChecklist.tsx:208 (grep 전수 확인 — 다른 writer 0건). heirWaiverAmount의 유일한 writer는 Step4Deductions.tsx:431이고 그 칸은 :427 manualActive.heirWaiver 게이트 안에 있다.
- **영향**: heirWaiverAmount는 초기값 ""(shared.ts:278)이라 활성 조건이 거짓 → 칸이 안 그려짐 → 값을 넣을 수 없음 → 영원히 거짓. 사용자는 「선순위 상속포기로 후순위가 받은 재산」(§24②2호)을 입력할 방법이 전혀 없고, 엔진(inheritance-deduction-limit.ts:67·76)·Zod(property-valuation-input.ts:360)·결과카드(DeductionLimitDetailCard.tsx:79)는 전부 구현돼 있는데 종합한도 분자에서 그 금액이 차감되지 않아 공제한도가 과대 → 세액 과소.
- **제안**: B그룹 칩 배열(:322)에 "heirWaiver"를 추가한다. GROUP_MAP(Step4Deductions.tsx:223)에 heirWaiver→"adjust"가 이미 있어 펼침 배선은 그대로 동작한다.
- **대조**: `components/calc/inheritance/Step4Deductions.tsx:427` · `lib/calc/inheritance-deduction-checklist.ts:207` · `components/calc/InheritanceTaxForm.tsx:286` · `lib/tax-engine/deductions/inheritance-deduction-limit.ts:67`
- *(리뷰 ID c09-1)*

### IG-006 · 「필드가 삭제됩니다」 경고와 달리 비호환 필드가 남아 §14 유령 담보채무가 계산된다

`[2/2]` · **BLOCKER** · F-도달가능성 · `components/calc/inheritance/estate-card/CategoryChangeDialog.tsx:207`

- **현상**: 그룹 간 카테고리 변경 시 다이얼로그는 amber 카드로 「⚠️ 그룹 간 변경 — 다음 필드가 삭제됩니다」(:175)를 띄우고 lossFields를 열거한다. 그러나 onConfirm에는 `preserved`(축소 객체)만 넘기고(:207), 호출부 EstateItemEditor.tsx:290이 `onUpdate({ ...item, ...preserved })`로 원본 item을 먼저 펼쳐 병합한다. preserved에 없는 키는 undefined로 덮이는 것이 아니라 원본 값 그대로 살아남는다. pickPreservedFields가 그룹 간에는 id·name·heirAllocations·category(+호환 deemedCategory·금액 1개)만 담으므로(category-change-policy.ts:68-73) LOSS_TRACKED_KEYS 16개가 전부 잔존한다. isDeemedCategoryCompatible 호환성 가드(:76-78)도 같은 이유로 무력화된다.
- **근거**: CategoryChangeDialog.tsx:175(경고문)·:207(onConfirm(preserved)) / EstateItemEditor.tsx:290 `onUpdate({ ...item, ...preserved } as EstateItem);` / lib/calc/category-change-policy.ts:68-73(base 객체) · :105-122(LOSS_TRACKED_KEYS) / lib/tax-engine/inheritance-collateral-debt.ts:60-73(deductSecuredClaimAsDebt===true면 mortgageAmount+leaseDeposit을 §14 채무로 파생, deposit만 제외) / lib/validators/estate-item-schema.ts:20-140(standardPrice·mortgageAmount·deductSecuredClaimAsDebt·deemedCategory 등이 전부 baseItemSchema에 있어 discriminatedUnion 어느 멤버에서도 Zod가 strip하지 않는다 → 엔진까지 그대로 도달) / components/calc/PropertyValuationForm.tsx:145-156(handleUpdate에 정화 로직 없음)
- **영향**: 저당권 있는 주택(deductSecuredClaimAsDebt=true·mortgageAmount=X)을 현금·예금·기타로 바꾸면, 화면은 「§14 담보채무 자동공제 삭제」를 약속했는데 실제로는 그 플래그와 채권액이 남아 deriveCollateralDebts가 현금 자산에 대해 X원 채무를 계속 파생한다. 상속세 과세가액이 X만큼 과소 계산되고 사용자는 경고를 봤기 때문에 남은 것을 인지하지 못한다. estateAddress·standardPrice·farmingCategory·familyBusinessCategory 등도 같은 경로로 잔존한다.
- **제안**: 호출부에서 원본을 펼치지 말고 preserved만 쓰거나(EstateItemEditor.tsx:290 → `onUpdate(preserved as EstateItem)`), pickPreservedFields가 그룹 간 변경 시 LOSS_TRACKED_KEYS를 명시적으로 `undefined`로 담아 spread 병합에서도 지워지게 한다. 어느 쪽이든 「경고 문구 ↔ 실제 결과」 일치를 anchor로 고정할 것.
- **대조**: `components/calc/EstateItemEditor.tsx:290` · `lib/calc/category-change-policy.ts:68` · `lib/tax-engine/inheritance-collateral-debt.ts:60` · `lib/validators/estate-item-schema.ts:20`
- *(리뷰 ID c10-1)*

### IG-007 · 토지 '양도시 개별공시지가'가 원/㎡를 총액 필드 item.standardPrice에 쓴다

`[2/2]` · **BLOCKER** · A-배관 · `components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx:274`

- **현상**: land 분기의 '양도시(증여시) 개별공시지가 (원/㎡)'(:279)는 LandPriceLookupField의 onPricePerSqmChange(:274-276)로 받은 **㎡당 단가**를 그대로 onTransferStdPriceChange → onChange({ standardPrice: v })(:203-204)로 item.standardPrice에 저장한다. LandPriceLookupField는 단가×면적 총액을 ③열에 **표시만** 하고(:143-146) 어디에도 write-back하지 않는다(:216-223의 CurrencyInput 값 = 원/㎡). 그런데 같은 필드의 정본 write 경로인 보충적 평가 섹션은 StandardPriceInput의 onTotalPriceChange로 **총액**을 저장한다(EstateBodySupplementaryValuation.tsx:210-213). 두 섹션은 같은 자산 카드에서 함께 렌더된다(EstateBodyRealEstate.tsx:233·258). :265 주석 자신도 '(area prop 필수 → 총액으로 저장됨)'이라 적어 코드와 어긋난다.
- **근거**: BurdenedGiftTransferSection.tsx:265(주석 '총액으로 저장됨')·:274-276(onPricePerSqmChange→standardPrice)·:279(label '원/㎡') / LandPriceLookupField.tsx:143-146(총액은 표시 전용)·:216-223 / EstateBodySupplementaryValuation.tsx:210-213(정본 write=총액) / lib/tax-engine/property-valuation.ts:244(evaluateLand: resolveValuationAmount→standardPrice를 그대로 평가액으로 사용, 면적 곱셈 없음) / components/calc/gift-tax-form-validate.ts:156(⑧ 주석 '토지: standardPrice = 개별공시지가 총액 … → 총액 저장')
- **영향**: 토지 부담부증여에서 한 필드를 두 소비자가 다른 단위로 읽어 **둘 다 맞을 수 없다**. ① 사용자가 이 칸에 단가(예 3,000,000)를 넣으면 evaluateLand의 증여재산 평가액이 총액(200㎡ 기준 600,000,000) 대신 3,000,000이 되어 증여세가 붕괴한다. ② 반대로 보충적 평가에서 총액을 먼저 넣으면 이 칸이 총액을 '원/㎡'로 표시하고 ③열 토지기준시가에 총액×면적을 띄우며, ④ gift-burdened-transfer-api.ts:107-111의 §159 안분 분모(총액)와 분자 standardPriceAtAcquisition(:245-246에서 원/㎡로 저장)이 면적배만큼 어긋나 양도차익 안분이 틀린다. e2e/gift-burdened-transfer.spec.ts:416-423은 이 칸에 250,000을 넣고 §66 담보채권 하한이 평가액을 가려 통과하므로 안전망이 없다.
- **제안**: 이 칸이 쓰는 값을 총액으로 통일한다 — LandPriceLookupField가 총액을 돌려주지 않으므로, 보충적 평가와 동일하게 StandardPriceInput(area-mode, onTotalPriceChange)을 쓰거나 이 위치에서는 item.areaSqm을 곱해 총액을 저장하고 라벨을 '총액'으로 바꾼다. 같은 커밋에서 :245-246의 standardPriceAtAcquisition도 같은 단위(총액)로 맞춰야 §159 분자/분모 비가 유지된다.
- **대조**: `lib/calc/gift-burdened-transfer-api.ts:107-111` · `lib/calc/gift-burdened-transfer-api.ts:198-201` · `components/calc/gift-tax-form-validate.ts:156` · `components/calc/gift-tax-form-validate.ts:161` · `lib/tax-engine/types/inheritance-gift-estate.types.ts:1036-1039` · `lib/tax-engine/property-valuation.ts:104-117`
- *(리뷰 ID c11-1)*

### IG-008 · 가업 임원취임일이 Zod ⑫에서 침묵 strip — 다목 자동판정 미도달

`[2/2]` · **BLOCKER** · A-배관 · `components/calc/inheritance/family-business/FbHeirRequirementsSection.tsx:294`

- **현상**: 이 컴포넌트는 ⑤UI로 `heirOfficerAppointDate`(다목 임원 취임일)를 입력받고(:292-295), 같은 값으로 미리보기 자동판정을 돌린다(:101-109). ④변환은 `deductionInput`을 통째로 전달하므로(lib/calc/inheritance-api.ts:84) body에는 실린다. 그러나 ⑫Zod `familyBusinessInheritanceInputSchema`(z.object)에 이 키가 없어 route에서 침묵 strip된다. 엔진 `resolveFamilyBusinessRequirements`는 `else if (input.heirOfficerAppointDate)` 분기를 타지 못하고 legacy boolean `heirOfficerByFilingDeadline`(EMPTY_FB 기본값 false)로 떨어진다.
- **근거**: 실측 probe(npx tsx, 스크래치패드): 위 스키마에 openingDate·heirOfficerAppointDate·heirCEOAppointDate를 함께 넣고 safeParse → success:true, `heirOfficerAppointDate` in data = **false**, `heirCEOAppointDate` = true. 스키마 lib/validators/family-business-inheritance-schema.ts:47-55(자동판정 기초데이터 목록에 heirCEOAppointDate는 있고 heirOfficerAppointDate는 없음, 파일 헤더 :8이 「미추가 시 엔진 미도달」 경고). 엔진 lib/tax-engine/deductions/family-business-autoderive.ts:288-300. 기본값 components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:67.
- **영향**: 신고기한 내 임원 취임일을 정확히 입력해도 화면 미리보기는 emerald ✓충족을 보여주지만 엔진은 다목 미충족으로 판정해 가업상속공제 전액이 부인된다(ineligibleReason `heir_officer_not_appointed`). 사용자에게는 화면과 결과가 어긋난 이유가 전혀 보이지 않는다. 수동 보정 override(`heirOfficerByFilingDeadlineOverride`)는 스키마에 있어 살아 있으므로, 우회는 되지만 설계된 자동 경로가 죽어 있다.
- **제안**: lib/validators/family-business-inheritance-schema.ts의 ⑫ 블록(:47-55)에 `heirOfficerAppointDate: z.string().optional(),` 한 줄 추가.
- **대조**: `lib/validators/family-business-inheritance-schema.ts:47` · `lib/calc/inheritance-api.ts:84` · `lib/tax-engine/deductions/family-business-autoderive.ts:291` · `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:67`
- *(리뷰 ID c14-1)*

### IG-009 · 상호출자 counterparty 5필드가 Zod에 없어 서버에서 침묵 stripping

`[2/2]` · **BLOCKER** · A-배관 · `components/calc/inheritance/unlisted-stock-v2/OtherUnlistedHoldingSection.tsx:176`

- **현상**: UI는 10% 초과 보유 행에서 counterparty(netAssetExStock·totalLiabilities·issuedShares·netIncomePerShare·crossHeldOfTarget·isRealEstateHeavy·netAssetOnly)와 bookValue를 입력받아 EstateItem.unlistedStockValuationV2.otherUnlistedHoldings에 저장한다(OtherUnlistedHoldingSection.tsx:164·176~195). 그러나 ⑫ Zod의 otherUnlistedHoldings 행 객체는 rowId·issuerCorpName·holdingShares·totalShares·treasuryShares·movingAverageAcquisitionValue·marketValue 7키만 정의한다(schema:202~214). Zod v4의 z.object는 미정의 키를 strip하고, route는 parsed.data를 그대로 엔진에 넘긴다.
- **근거**: lib/validators/unlisted-stock-valuation-v2.schema.ts:202-214 (bookValue·counterparty 키 부재) · lib/validators/estate-item-schema.ts:282 · lib/validators/property-valuation-input.ts:502 · app/api/calc/inheritance/route.ts:52·70 (safeParse 후 parsed.data 사용) · package.json zod ^4.3.6
- **영향**: 서버 재계산 경로(lib/tax-engine/valuation/resolve-estate-item-value.ts:104 → unlisted-orchestrator.ts:207~236)에서 counterparty가 사라져 evaluateCrossHoldingReflection이 undefined를 반환하고(cross-holding-equations.ts:367~376) ②평가차액 주입액이 0이 된다. 화면(PerShareValuationResultCard)은 상호출자 연립평가를 반영한 순자산·1주당 평가액을 보여주는데, 실제 상속세는 그것을 반영하지 않은 값으로 계산된다. ⑧ validate는 같은 필드를 필수로 요구하고 있어(inheritance-validate-unlisted.ts:224~233) 배관 층 사이가 정면으로 어긋난다.
- **제안**: unlisted-stock-valuation-v2.schema.ts:209~211 인접에 bookValue: z.number().nonnegative().optional() 과 counterparty: z.object({netAssetExStock, totalLiabilities, issuedShares, netIncomePerShare, isRealEstateHeavy, netAssetOnly, crossHeldOfTarget}).optional() 을 추가한다(OtherUnlistedCounterparty 타입 1:1).
- **대조**: `lib/validators/unlisted-stock-valuation-v2.schema.ts:202` · `lib/validators/unlisted-stock-valuation-v2.schema.ts:214` · `lib/calc/inheritance-validate-unlisted.ts:224` · `lib/calc/inheritance-validate-unlisted.ts:231` · `lib/tax-engine/property-valuation/unlisted-orchestrator.ts:207` · `lib/tax-engine/property-valuation/cross-holding-equations.ts:367` · `lib/tax-engine/valuation/resolve-estate-item-value.ts:104` · `app/api/calc/inheritance/route.ts:52`
- *(리뷰 ID c17-1)*

### IG-010 · 동거요건 블록의 부분 patch를 전체 patch로 매핑 — 시작일↔사유가 서로를 지운다

`[2/2]` · **BLOCKER** · B-3중패턴 · `components/calc/HeirEditor.tsx:572`

- **현상**: CohabitRequirementBlock은 항상 키 하나짜리 부분 patch만 올린다(CohabitRequirementBlock.tsx:111 `{cohabitStartDate}`, :127 `{cohabitReasons: []}`, :130 `{cohabitReasons: undefined}`, :139 `{cohabitReasons}`). 그런데 HeirEditor:572-577은 patch의 두 키를 명시적으로 다시 나열해 `set({ cohabitStartDate: patch.cohabitStartDate, cohabitReasons: patch.cohabitReasons })`로 넘긴다. set은 `onUpdate({ ...heir, ...patch })`(HeirEditor.tsx:217)이므로 patch에 없던 키가 `undefined` 값을 가진 own property로 들어가 기존 값을 덮어쓴다.
- **근거**: components/calc/HeirEditor.tsx:217(set 정의) · :572-577(2키 명시 매핑) / components/calc/inheritance/CohabitRequirementBlock.tsx:44-47(onChange 타입=부분 patch) · :111 · :127 · :130 · :139(각각 단일 키만 발신)
- **영향**: 동거 시작일을 입력한 뒤 「§23의2② 부득이한 사유 있음」 토글을 켜면 방금 입력한 동거 시작일이 즉시 사라진다(DateInput value=cohabitStartDate ?? ""). 반대로 사유 목록을 입력한 뒤 동거 시작일을 고치면 cohabitReasons가 undefined로 돌아가 토글이 꺼지고 입력한 사유 배열이 전부 소실된다. 두 값 모두 엔진에 도달해 §23의2①1호 10년 판정을 가르므로(lib/tax-engine/deductions/inheritance-deductions.ts:204-217에서 calcCohabitYears 호출 → :250-252 cohabitTenYearFailed) 시작일이 지워지면 10년 미달 차단이 아예 돌지 않고, 사유가 지워지면 제외연수가 빠져 유효 동거연수가 늘어난다. 최대 6억원 동거주택상속공제의 차단 여부가 사용자가 누른 적 없는 방향으로 바뀐다.
- **제안**: patch를 그대로 전달한다 — `onChange={(patch) => set(patch)}`. 키를 나열해야 한다면 `set({ ...heir, ...patch })`가 아니라 patch에 실제로 존재하는 키만 넘기도록 조건부로 구성할 것.
- **대조**: `lib/tax-engine/deductions/inheritance-deductions.ts:204` · `lib/tax-engine/deductions/inheritance-deductions.ts:250` · `components/calc/inheritance/CohabitRequirementBlock.tsx:111` · `components/calc/inheritance/CohabitRequirementBlock.tsx:127`
- *(리뷰 ID c24-1)*

---

## MAJOR (81건)

### IG-011 · 정당사유 17개가 위반 유형과 무관하게 전부 노출 — 엔진은 무조건 면제

`[2/2]` · **MAJOR** · F-도달가능성 · `app/calc/family-business-postmgmt/page.tsx:364`

- **현상**: `<select>`가 `JUSTIFIABLE_REASON_OPTIONS` 17건을 위반 유형(`v.type`)과 무관하게 전부 렌더한다(370). 그런데 이 상수는 파일 안에서 이미 §15⑧ 1호(자산처분 예외 7건, 52~59) · 2호(가업 미종사 예외 3건, 60~63) · 3호(지분 감소 예외 7건, 64~72)로 주석 구분돼 있고, 타입 정의도 같은 그룹핑을 명시한다. 그래서 「지분 감소」 위반에 「1호가. 수용·협의매수」를 고를 수 있고, §15⑧에 예외가 아예 없는 「고용 미달(4호)」에도 17건이 그대로 뜬다.
- **근거**: app/calc/family-business-postmgmt/page.tsx:364-373(select·전건 map) · 51-72(호별 그룹 주석) · lib/tax-engine/types/inheritance-family-business-postmgmt.types.ts:41-64(`heir_death`/`heir_death_cessation`/`heir_death_succession`이 호별로 코드가 분리돼 있음) · lib/tax-engine/credits/family-business-postmgmt-orchestrator.ts:104-108(`justifiableReasons`에 항목이 있으면 위반 유형 대조 없이 `exempted: true`, recapture 0)
- **영향**: 엔진이 위반 유형을 전혀 대조하지 않으므로 UI가 유일한 게이트다. 호가 어긋난 사유를 고르면 추징세액·이자상당액이 전액 0으로 떨어져 화면이 「추징 면제」를 단정한다. 형제 시뮬레이터(영농)는 같은 함정을 위반 유형으로 막고 있다.
- **제안**: `JUSTIFIABLE_REASON_OPTIONS`에 대상 위반 유형을 필드로 달고 `select` 옵션을 `v.type`으로 필터한다. `employment_drop`이면 정당사유 칸 자체를 렌더하지 않는다(영농 페이지 262행의 `isFourthParaViolation` 게이트와 동형).
- **대조**: `lib/tax-engine/credits/family-business-postmgmt-orchestrator.ts:104` · `lib/tax-engine/types/inheritance-family-business-postmgmt.types.ts:41` · `app/calc/inheritance-postmgmt/page.tsx:262`
- *(리뷰 ID c01-1)*

### IG-012 · ③의 「4호 위반: 아니오」와 ②의 4호 추징이 같은 화면에서 모순

`[2/2]` · **MAJOR** · E-표시법령 · `app/calc/family-business-postmgmt/page.tsx:471`

- **현상**: ③ 섹션이 정규직·총급여를 받아 `bothViolated`로 「4호 위반: 예/아니오」를 렌더한다(471-473). 그런데 ②에서 위반 유형 `employment_drop`(42행 옵션)을 고르면 엔진은 그 판정을 보지 않고 공제액 전액(추징율 100%)을 산입한다. 결과 화면에 「추징세액 > 0」과 「4호 위반: 아니오」가 동시에 표시될 수 있다.
- **근거**: app/calc/family-business-postmgmt/page.tsx:466-474(판정 표시) · 42(`employment_drop` 옵션) · lib/tax-engine/credits/family-business-postmgmt-orchestrator.ts:96-162(위반 루프에 `employmentResult` 참조 없음) · lib/tax-engine/credits/family-business-postmanagement.ts:85-89(`effectiveRatio`는 `asset_disposal`만 감쇄, 나머지는 1.0 고정)
- **영향**: 한 화면이 서로 반대되는 두 결론을 낸다. 사용자는 ③이 「유지」로 판정했는데도 공제액 전액이 추징되는 금액을 보고, 어느 쪽이 결론인지 판단할 수 없다.
- **제안**: ③ 판정이 `bothViolated === false`이면 ②의 `employment_drop` 선택을 disabled(+`disabledReason`)로 막거나, 결과 카드에 두 값이 어긋났음을 명시하는 경고를 띄운다.
- **대조**: `lib/tax-engine/credits/family-business-postmgmt-orchestrator.ts:96` · `lib/tax-engine/credits/family-business-postmanagement.ts:85`
- *(리뷰 ID c01-2)*

### IG-013 · 수정신고 기한을 첫 번째 위반 사건 날짜로만 계산

`[2/2]` · **MAJOR** · E-표시법령 · `app/calc/family-business-postmgmt/page.tsx:215`

- **현상**: `buildAmendmentReturnData(result, violations[0].date)`로 기한을 뽑는다. 이 페이지는 「+ 사건 추가」(313)로 위반을 여러 건 받고 결과의 금액(추가 결정세액·이자상당액·최종 납부세액)은 전 건 합계인데, 기한 배너만 배열 첫 원소에서 나온다. `violations`는 입력 순서일 뿐 날짜순 정렬이 없다.
- **근거**: app/calc/family-business-postmgmt/page.tsx:214-215 · 313(사건 추가) · 480-482(「신고·납부 기한 (§18의2⑨): {amendment.amendmentDeadline}까지」) · lib/tax-engine/credits/family-business-postmgmt-orchestrator.ts:195-207(`amendmentDeadline`은 넘겨받은 단일 `violationDate`의 월말 + 6개월) · 202-205(금액은 전 건 합계인 `totalRecapture`/`totalInterest`)
- **영향**: 위반이 2건 이상이고 날짜가 다르면, 나중에 입력한 더 이른 사건의 기한이 화면에서 사라진다. 사용자가 배너 날짜를 믿으면 이미 지난 신고·납부 기한을 놓친다.
- **제안**: 기한을 위반별로 산출해 사건마다 표시하거나, 최소한 `violations` 중 가장 이른 날짜를 쓰고 「사건이 여러 건이면 각 사유별로 기한이 따로 진행된다」는 안내를 붙인다.
- **대조**: `lib/tax-engine/credits/family-business-postmgmt-orchestrator.ts:195` · `__tests__/tax-engine/inheritance/family-business-postmgmt.test.ts:231`
- *(리뷰 ID c01-3)*

### IG-014 · 합병대가 미입력 → ④가 0을 보내 엔진 `?? face` fallback이 죽고 §28③2가 항상 0원

`[2/2]` · **MAJOR** · B-3중패턴 · `components/calc/deemed-gift/capital-forms.tsx:211`

- **현상**: 라벨이 「합병대가 (액면 미달 시 적용)」이라 대가가 액면 이상인 사용자는 비워둔다. ④ API가 `mergeConsideration: parseAmount(form.mrgConsideration)`으로 **0**을 보내고, 엔진은 `const consideration = input.mergeConsideration ?? face;` — 0은 nullish가 아니므로 fallback이 발동하지 않는다. `base = Math.min(face, 0) = 0` → `perShareGain = 0 − overvaluedSharePrice < 0` → gain 0. ⑧ validate도 이 칸을 보지 않는다(non_stock 분기는 mrgFaceValue·mrgOvervaluedPrice만 검사).
- **근거**: components/calc/deemed-gift/capital-forms.tsx:211 (label="합병대가 (액면 미달 시 적용)") · lib/calc/gift-deemed-api.ts:136 `mergeConsideration: parseAmount(form.mrgConsideration)` · lib/tax-engine/gift-deemed/merger.ts:66-74 `const consideration = input.mergeConsideration ?? face; const base = Math.min(face, consideration);` · lib/calc/gift-deemed-validate.ts:100-104 (non_stock 조기 break) · lib/validators/gift-deemed-input.ts는 mergeConsideration을 optional로 통과
- **영향**: 주식 외 재산 교부(§38·§28③2) 사용자가 「액면 미달 시 적용」이라는 라벨대로 칸을 비우면 증여재산가액이 항상 0원으로 나오고 「이익이 기준금액(3억) 미만」이라는 사실과 다른 제외 사유가 표시된다. 과세되어야 할 건이 조용히 비과세로 계산된다.
- **제안**: ④에서 같은 파일 다른 분기와 동일한 관례를 적용한다 — `mergeConsideration: parseAmount(form.mrgConsideration) || undefined` (선례: lib/calc/gift-deemed-api.ts:239 `faceValue: parseAmount(form.cdFaceValue) || undefined`). 그러면 엔진의 `?? face`가 의도대로 산다.
- **대조**: `lib/calc/gift-deemed-api.ts:136` · `lib/tax-engine/gift-deemed/merger.ts:67` · `lib/calc/gift-deemed-validate.ts:100`
- *(리뷰 ID c02-1)*

### IG-015 · 저가감자 단일 — 산식 인자 2칸이 ⑧에 없고, ⑧이 지키는 칸은 산식에 안 쓰인다

`[2/2]` · **MAJOR** · A-배관 · `components/calc/deemed-gift/capital-forms.tsx:521`

- **현상**: 단일·저가 분기 UI는 「총감자 주식수」·「대주주등 감자후 지분비율」·「대주주등 특수관계인 감자 주식수」 3칸을 렌더한다. 엔진 `decreaseLow`의 이익 산식은 `diff × relatedRedeemedShares × majorPostRatio`이며 `totalRedeemedShares`는 표시용 breakdown 행에만 쓰인다. 그런데 ⑧ validate의 저가 분기는 `cdTotalShares`만 요구하고, 실제 곱셈 인자인 `cdMajorRatioPct`·`cdRelatedShares`는 검사하지 않는다. ④는 빈값을 `{numer:0,denom:10000}`·`0`으로 그대로 보내고 ⑫ Zod도 둘 다 optional/nonnegative라 통과한다.
- **근거**: components/calc/deemed-gift/capital-forms.tsx:520-523 (DecimalInput cdMajorRatioPct · CurrencyInput cdRelatedShares) · lib/calc/gift-deemed-validate.ts:197 `if (parseAmount(form.cdTotalShares) <= 0) return "총감자 주식수를 입력하세요";` (저가 분기의 유일한 수량 검사) · lib/calc/gift-deemed-api.ts:262-263 · lib/tax-engine/gift-deemed/capital-decrease.ts:21-30 `majorPostRatio = input.majorPostRatio ?? {numer:0,denom:1}` / `gain = safeMultiplyThenDivide(base, numer, denom)` · lib/validators/gift-deemed-input.ts:234-235 둘 다 `.optional()`
- **영향**: 두 칸 중 하나만 비어도 증여재산가액이 0원이 되고 「이익이 기준금액(3억, 차액 30%↑ 시 0) 미만」이라는 틀린 사유가 표시된다. 사용자는 총감자 주식수만 채우면 검증을 통과하므로 결함을 알아챌 신호가 없다. 저장소 정책(자동 안분 fallback 금지 · 미입력은 검증 오류로 차단)과 정면 충돌한다.
- **제안**: lib/calc/gift-deemed-validate.ts 저가 분기에 `parseDecimal(form.cdMajorRatioPct) <= 0` · `parseAmount(form.cdRelatedShares) <= 0` 차단을 추가한다(cdTotalShares 검사 유지 여부는 별개 판단).
- **대조**: `lib/calc/gift-deemed-validate.ts:197` · `lib/calc/gift-deemed-api.ts:262` · `lib/tax-engine/gift-deemed/capital-decrease.ts:21`
- *(리뷰 ID c02-2)*

### IG-016 · 증자 §39 「이익 귀속 주식수」가 ⑧ 미검증 — 0이면 사실과 다른 제외 사유가 뜬다

`[2/2]` · **MAJOR** · A-배관 · `components/calc/deemed-gift/capital-forms.tsx:256`

- **현상**: `ciForfeitedShares`는 `CI_SHARES_LABEL[ciSubType]`(실권주수·직접배정 신주수·초과배정 신주수)로 렌더되는 필수 입력이고, 엔진에서 1주당 이익에 곱해지는 유일한 수량이다. ⑧ validate의 capital_increase 분기는 ciPrePrice·ciPreShares·(고가 비가목의)ciRatioDenomShares·상장 종가평균만 검사하고 ciForfeitedShares는 보지 않는다. ⑫ Zod도 `z.number().nonnegative()`라 0을 통과시킨다.
- **근거**: components/calc/deemed-gift/capital-forms.tsx:256 `<CurrencyInput label={sharesLabel} value={form.ciForfeitedShares} ...>` · lib/calc/gift-deemed-validate.ts:141-149 (capital_increase 분기 전체 — ciForfeitedShares 부재) · lib/calc/gift-deemed-api.ts:200 `forfeitedShares: parseAmount(form.ciForfeitedShares)` · lib/validators/gift-deemed-input.ts:166 `forfeitedShares: z.number().nonnegative()` · lib/tax-engine/gift-deemed/capital-increase.ts:65 `base = perShareGain > 0 ? safeMultiply(perShareGain, forfeitedShares) : 0`, :77 `exclusionReason = "증자 후 1주가가 인수가 이하 — 이익 없음"`
- **영향**: 이 칸을 비우면 증여재산가액이 0원이 되면서 「증자 후 1주가가 인수가 이하 — 이익 없음」이라는, 1주당 이익이 실제로 양수인데도 거짓인 사유가 결과에 표시된다. 사용자는 저가발행 요건을 못 갖춘 것으로 오인한다.
- **제안**: lib/calc/gift-deemed-validate.ts의 capital_increase 분기에 `parseAmount(form.ciForfeitedShares) <= 0` 차단(라벨은 `CI_SHARES_LABEL[form.ciSubType]` 재사용)을 추가한다.
- **대조**: `lib/calc/gift-deemed-validate.ts:141` · `lib/calc/gift-deemed-api.ts:200` · `lib/tax-engine/gift-deemed/capital-increase.ts:65`
- *(리뷰 ID c02-3)*

### IG-017 · 합병 §38 주식교부 단일모드 「대주주등 주식수」가 ⑧ 미검증 → 0원

`[2/2]` · **MAJOR** · A-배관 · `components/calc/deemed-gift/capital-forms.tsx:205`

- **현상**: 주주 매트릭스 OFF(`!useSh`) 경로에서 `mrgMajorShares`는 엔진 `mergerStock`이 1주당 이익에 곱하는 유일한 수량이다. ⑧ validate의 merger 분기는 mrgExchangedShares·mrgUnderSharePrice·mrgPreShares·mrgUnderPreShares·mrgPostMergerTotalShares·mrgMergedPrice까지 촘촘히 검사하면서 mrgMajorShares만 빠져 있다(매트릭스 ON 경로에서는 majorShares를 0으로 보내므로 무관).
- **근거**: components/calc/deemed-gift/capital-forms.tsx:205 `<CurrencyInput label="대주주등 주식수" value={form.mrgMajorShares} ...>` · lib/calc/gift-deemed-validate.ts:99-138 (merger 분기 전체 — mrgMajorShares 부재; grep 결과 validate 파일 내 mrgMajorShares 0건) · lib/calc/gift-deemed-api.ts:159 `majorShares: useSh ? 0 : parseAmount(form.mrgMajorShares)` · lib/tax-engine/gift-deemed/merger.ts:31 `gain = perShareGain > 0 ? safeMultiply(perShareGain, majorShares) : 0`
- **영향**: 단일 대주주 모드에서 이 칸만 비면 증여재산가액이 0원이 되고 「이익이 기준금액(합병후평가 30%·3억 중 적은 금액) 미만」이라는 틀린 사유가 뜬다. 같은 분기의 다른 수량 6개는 전부 차단되므로 사용자는 이 칸도 검증되고 있다고 신뢰한다.
- **제안**: lib/calc/gift-deemed-validate.ts merger 분기의 `else`(비매트릭스) 블록에 `parseAmount(form.mrgMajorShares) <= 0` 차단을 추가한다.
- **대조**: `lib/calc/gift-deemed-validate.ts:124` · `lib/calc/gift-deemed-api.ts:159` · `lib/tax-engine/gift-deemed/merger.ts:31`
- *(리뷰 ID c02-4)*

### IG-018 · 전환주식 «분모 신주수» 미입력을 ⑧validate가 안 봐 증여이익이 조용히 0원

`[2/2]` · **MAJOR** · A-배관 · `components/calc/deemed-gift/convertible-stock-form.tsx:118`

- **현상**: CsNumericSection은 needsRatio(=`isHigh && csSubType !== "forfeited_realloc"`, :128)일 때 «특수관계인이 인수한 신주수»·«분모 신주수»를 렌더한다(:115-120). ④API도 같은 조건으로 relatedAcquiredShares·ratioDenomShares를 전달한다(gift-deemed-api.ts:373·382-383). 그러나 ⑧validate의 convertible_stock 케이스(:229-238)는 두 칸을 전혀 검사하지 않는다. 엔진은 `denom > 0 ? safeMultiplyThenDivide(...) : 0`이라 분모가 0이면 조용히 0을 낸다.
- **근거**: components/calc/deemed-gift/convertible-stock-form.tsx:128(needsRatio)·:115-120(두 칸 렌더) / lib/calc/gift-deemed-api.ts:373·382-383 / lib/calc/gift-deemed-validate.ts:229-238(두 칸 검사 없음) / lib/tax-engine/gift-deemed/capital-increase.ts:129-130(`denom > 0 ? ... : 0`) / 형제 대조: lib/calc/gift-deemed-validate.ts:143-145는 증자 §39에서 동일 조건으로 「분모 신주수를 입력하세요」를 이미 차단한다
- **영향**: 고가발행 + (제3자 직접배정·초과배정·실권주 미배정)을 고른 사용자가 분모 신주수를 비워두면 검증을 통과하고, 전환·발행 두 시점 이익이 모두 0이 되어 증여이익 0원이라는 오답이 아무 경고 없이 표시된다. 전환주식은 「전환 시점 − 발행 시점」이라 한 시점만 비어도 결과가 뒤집힌다.
- **제안**: gift-deemed-validate.ts의 convertible_stock 케이스에 capital_increase(:143-145)와 같은 가드를 시점별로 추가한다 — `if (form.csDirection === "high" && form.csSubType !== "forfeited_realloc") { if (parseAmount(form.csConvRatioDenomShares) <= 0) return "전환 시점 분모 신주수를 입력하세요"; if (parseAmount(form.csIssueRatioDenomShares) <= 0) return "발행 시점 분모 신주수를 입력하세요"; }`
- **대조**: `lib/calc/gift-deemed-validate.ts:229` · `lib/calc/gift-deemed-validate.ts:143` · `lib/calc/gift-deemed-api.ts:373` · `lib/calc/gift-deemed-api.ts:382` · `lib/tax-engine/gift-deemed/capital-increase.ts:129`
- *(리뷰 ID c03-2)*

### IG-019 · 초과배당 «정산 입력»을 켜도 증여자 관계를 안 고르면 정산이 조용히 계산되지 않는다

`[2/2]` · **MAJOR** · F-도달가능성 · `components/calc/deemed-gift/other-forms.tsx:206`

- **현상**: §41의2 정산 토글(edSettlementMode)은 섹션3 «증여자와의 관계»(:128-202)와 형제 관계로 게이트 없이 항상 렌더된다. 그런데 ④API는 giftTaxContext를 `form.edDonorRelationship`이 있을 때만 만들고(gift-deemed-api.ts:467), 엔진은 `if (input.giftTaxContext)` 안에서만 runSettlement2Pass를 호출한다(excess-dividend.ts:93-94). ⑧validate는 정산 ON 시 실제 소득세액만 요구하고(:281-283) 관계 선택은 요구하지 않는다.
- **근거**: components/calc/deemed-gift/other-forms.tsx:206-233(정산 토글 — edDonorRelationship 게이트 없음)·:229-231(「정산 결과는 계산 후 결과 화면에 표시됩니다」) / lib/calc/gift-deemed-api.ts:467(giftTaxContext = edDonorRelationship ? ... : undefined) / lib/tax-engine/gift-deemed/excess-dividend.ts:93-94 / lib/calc/gift-deemed-validate.ts:281-283
- **영향**: 관계를 고르지 않은 채 정산을 켜고 실제 소득세납부세액을 입력한 사용자는 검증을 통과하지만 결과 화면에 정산 항목이 하나도 나타나지 않는다. 화면 안내문이 「표시됩니다」라고 단언하므로 사용자는 입력이 반영된 것으로 오인한다. 섹션3 제목의 「(선택)」 표기와도 모순된다 — 정산을 쓰려면 선택이 아니라 필수다.
- **제안**: ⑧validate에 `if (form.edSettlementMode && !form.edDonorRelationship) return "정산 계산에는 증여자와의 관계 선택이 필요합니다";`를 추가하거나, other-forms.tsx:206의 정산 ToggleCard에 `disabled={!form.edDonorRelationship}` + disabledReason을 달아 도달 자체를 막는다(둘 중 하나만 — UI 게이트를 택하면 validate와 일관되게).
- **대조**: `lib/calc/gift-deemed-api.ts:467` · `lib/tax-engine/gift-deemed/excess-dividend.ts:93` · `lib/calc/gift-deemed-validate.ts:281` · `lib/tax-engine/gift-deemed/excess-dividend-settlement.ts:58`
- *(리뷰 ID c03-3)*

### IG-020 · 간접출자법인 섹션이 숨겨져도 ⑧validate가 그 행을 계속 요구 — 영구 차단

`[2/2 · ½]` · **MAJOR** · A-배관 · `components/calc/deemed-gift/related-corp-form.tsx:166`

- **현상**: 섹션 3은 `{corpOptions.length > 0 && ...}`(corpOptions = isCorporate 주주)일 때만 렌더된다. 반면 ⑧validate R-5는 `form.rcIntermediaryCorps`를 무조건 순회하며 빈 `corpShareholderId`를 차단한다. 법인주주를 개인으로 되돌리거나(:146) 삭제하면(:110) 섹션은 사라지지만 행은 상태에 남는다.
- **근거**: related-corp-form.tsx:166(렌더 게이트)·:253(빈 행 `corpShareholderId: ""` 추가, deemed-form-state.ts:702)·:146·:110(정리 없음) / lib/calc/gift-deemed-validate.ts:389-391 `for (const row of form.rcIntermediaryCorps) { if (!row.corpShareholderId) return "…법인주주를 선택하세요"; }` / DeemedGiftCalculator.tsx:41-45 오류 시 계산 차단 후 모달 재오픈
- **영향**: 「+ 간접출자법인 추가」로 빈 행을 만든 뒤 주주 유형을 개인으로 되돌리면, 계산 버튼이 화면에 존재하지 않는 칸을 가리키는 오류("1번째 간접출자법인의 법인주주를 선택하세요")로 영구 차단된다. 주주를 다시 법인으로 바꿔야 한다는 것을 알아내기 전에는 §45의3 계산 자체가 불가능하다.
- **제안**: 주주 isCorporate 해제·삭제 시 그 주주를 참조하는 `rcIntermediaryCorps` 행을 함께 제거하거나(같은 set 호출 안에서), validate R-5를 `corpOptions.length > 0`과 동일한 조건에서만 적용한다.
- **대조**: `lib/calc/gift-deemed-validate.ts:389` · `components/calc/deemed-gift/deemed-form-state.ts:702` · `components/calc/deemed-gift/DeemedGiftCalculator.tsx:41`
- **½ 정정(rule-impact)**: 기전·근거·도달 경로는 지적대로 전부 성립한다. 다만 "영구 차단"은 정확히는 **세션 범위의 dead-end**다: (a) 주주 유형을 다시 「법인」으로 되돌리면 섹션 3이 복귀해 그 행을 삭제하거나 채울 수 있고, (b) 이 계산기는 `DeemedGiftCalculator.tsx:28`의 `useState(INITIAL_DEEMED)` 로컬 상태만 쓰고 마법사 store 같은 sessionStorage persist가 없어 새로고침이면 초기화된다. 즉 화면상 복구 컨트롤(주주 유형 select)이 존재하므로 절대적 차단은 아니고, 오류 문구가 화면에 없는 섹션을 가리켜 **복구 방법을 발견할 수 없는 차단**이다 — 새로고침 탈출은 3개 roster·재무 입력 전량 소실을 대가로 한다. 아울러 같은 파일에 **동형 미보고 결함 1건**이 있다: 섹션 4 `rulingStakes`가 :326 `row.isRelated && row.exclusionType === ""`로 게이트되는데 validate R-6(gift-deemed-validate.ts:405-409)은 무조건 순회한다. 수정 시 R-5와 함께 처리해야 한다. 수정 방향은 제안 2안(validate를 게이트와 같은 술어에 태우기)이 메모리 `feedback_ui_gate_removes_sole_input_path` 5번("값은 지우지 않는다 — 표시 게이트만")과 정합적이다.
- *(리뷰 ID c04-2)*

### IG-021 · 화면에서 사라진 간접출자법인 행이 그대로 전송돼 증여의제이익을 바꾼다

`[2/2]` · **MAJOR** · F-도달가능성 · `components/calc/deemed-gift/related-corp-form.tsx:146`

- **현상**: 주주 유형을 법인→개인으로 바꾸는 onChange는 `rcIntermediaryCorps`를 건드리지 않는다. ④API 변환은 게이트와 무관하게 배열 전체를 매핑하고, 엔진 `computeIndirectRatio`는 `corpShareholderId`를 전혀 보지 않고 `corp.owners` × `corp.stakeInBeneficiary`만으로 간접보유비율을 누적한다.
- **근거**: related-corp-form.tsx:146(정리 없는 flip)·:166(섹션 소멸) / lib/calc/gift-deemed-api.ts:608-615(무조건 매핑) / lib/tax-engine/gift-deemed/related-corp-helpers.ts:64-84 `computeIndirectRatio`는 corpShareholderId 미사용, owners만 매칭 / related-corp.ts:123·166이 이 값을 단계7 보유비율에 투입
- **영향**: 완성된 간접출자법인 행을 남긴 채 해당 법인주주를 개인으로 바꾸면 validate는 통과하고(필드가 모두 채워져 있으므로) 화면 어디에도 보이지 않는 간접출자 경로가 계속 계산된다. 수증자의 보유비율이 부풀려져 §45의3 증여의제이익이 사용자가 볼 수 없는 이유로 달라진다.
- **제안**: isCorporate 해제·주주 삭제 시 해당 `corpShareholderId`를 참조하는 간접출자법인 행을 같은 patch에서 제거한다(자동 안분 fallback이 아니라 명시적 정리).
- **대조**: `lib/calc/gift-deemed-api.ts:608` · `lib/tax-engine/gift-deemed/related-corp-helpers.ts:72` · `lib/tax-engine/gift-deemed/related-corp.ts:166`
- *(리뷰 ID c04-3)*

### IG-022 · §⑭ 지배주주등 보유비율 행이 숨겨져도 validate가 계속 요구

`[2/2]` · **MAJOR** · A-배관 · `components/calc/deemed-gift/related-corp-form.tsx:326`

- **현상**: §⑭3호 보유비율 블록은 `{row.isRelated && row.exclusionType === "" && ...}`일 때만 렌더된다. ⑧validate R-6은 매출처의 `rulingStakes`를 isRelated·exclusionType과 무관하게 순회하며 빈 shareholderId·0 비율을 차단한다.
- **근거**: related-corp-form.tsx:326(렌더 게이트)·:373(빈 행 `{shareholderId: "", ratioPctStr: ""}` 추가) / lib/calc/gift-deemed-validate.ts:405-408 `for (const stake of row.rulingStakes) { if (!stake.shareholderId) return "…주주를 선택하세요"; }`
- **영향**: 보유비율 행을 추가한 뒤 특수관계 여부를 「비특수관계」로 바꾸거나 과세제외유형을 고르면 블록이 언마운트되고, 계산 시 화면에 없는 칸을 요구하는 오류로 차단된다. (엔진 쪽은 related-corp.ts:145에서 `!p.isRelated || p.exclusionType`를 건너뛰므로 계산 오염은 없다 — 차단만 문제다.)
- **제안**: isRelated를 끄거나 exclusionType을 선택할 때 그 행의 `rulingStakes`를 함께 비우거나, validate R-6의 stake 검사를 `row.isRelated && !row.exclusionType`일 때만 수행한다.
- **대조**: `lib/calc/gift-deemed-validate.ts:405` · `lib/tax-engine/gift-deemed/related-corp.ts:145`
- *(리뷰 ID c04-4)*

### IG-023 · 칩 툴팁이 「값 보존」이라 하지만 해제 시 입력값이 삭제된다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/exemption/ExemptionChecklistPanel.tsx:104`

- **현상**: 체크된 칩의 title이 `${label} — 클릭하여 숨기기 (값 보존)`이다. 그러나 onToggle이 연결된 부모 `handleToggle`은 해제 시 `value.filter((v) => v.ruleId !== ruleId)`로 항목 자체를 배열에서 제거한다 — 금액·면적·협의분할·§16② 주식수 입력이 함께 사라진다.
- **근거**: ExemptionChecklistPanel.tsx:102-106(title 문자열)·:99 handleClick→onToggle / ExemptionChecklist.tsx:363-369 `if (checkedMap.has(ruleId)) { onChange(value.filter(...)) }` / 같은 파일 :162-167 주석도 「체크 해제 = 배열 제거」이며 값 보존은 미구현이라고 적고 있다
- **영향**: 공익법인 출연 주식수 4필드·금양임야 면적·협의분할 표까지 입력한 뒤 칩을 한 번 누르면 확인 없이 전부 소실된다. 툴팁이 안전하다고 안내하므로 사용자가 되돌릴 수 없는 조작을 유도당한다.
- **제안**: 툴팁 문구를 실제 동작(입력값 삭제)에 맞추거나, 미체크 항목도 배열에 유지하는 checked 플래그를 도입해 문구대로 값을 보존한다. 둘 중 하나로 문구와 구현을 일치시킬 것.
- **대조**: `components/calc/exemption/ExemptionChecklist.tsx:365` · `components/calc/exemption/ExemptionChecklistPanel.tsx:166`
- *(리뷰 ID c04-5)*

### IG-024 · 동시증여 서브카드 안에 또 동시증여 토글이 열리고 입력은 ④가 폐기

`[2/2]` · **MAJOR** · F-도달가능성 · `components/calc/gift/SimultaneousGiftCard.tsx:272`

- **현상**: SimultaneousGiftCard가 서브폼(`sub`)을 `as FormState`로 캐스팅해 GiftCreditChecklist를 그대로 렌더한다. GiftCreditChecklist는 동시증여 ToggleCard(:429-485)를 게이트 없이 항상 그린다. 서브카드에서 그 토글을 켜면 `set({simultaneousGiftForms: []})`가 onChange를 타고 `sub`에 기록되고, 중첩 「+ 동시증여 추가」로 건을 더 넣을 수 있다.
- **근거**: components/calc/gift/SimultaneousGiftCard.tsx:272-274 `form={sub as ...FormState}` / components/calc/gift/GiftCreditChecklist.tsx:429-485 (게이트 prop 없음) / lib/calc/gift-api.ts:177 `buildGiftTaxInput({ ...sub, simultaneousGiftForms: undefined } as FormState)` / components/calc/gift-tax-form-validate.ts:425 는 최상위 `form.simultaneousGiftForms`만 순회
- **영향**: 중첩 입력한 증여 건은 ④에서 명시적으로 undefined로 덮여 엔진에 도달하지 않고, ⑧도 중첩 배열을 순회하지 않아 경고 한 줄 없이 사라진다. 사용자는 입력한 건이 계산에 들어갔다고 믿는다. `GiftSubFormState = Omit<FormState,"simultaneousGiftForms">`인데 `as FormState` 캐스트가 이 불일치를 TypeScript에서 가린다.
- **제안**: GiftCreditChecklist에 `hideSimultaneous?: boolean`(또는 `variant="sub"`) prop을 두고 SimultaneousGiftCard에서 켜서 동시증여 ToggleCard를 렌더하지 않는다. 캐스트도 함께 제거해 서브폼 타입이 그대로 흐르게 한다.
- **대조**: `lib/calc/gift-api.ts:177` · `components/calc/gift/GiftCreditChecklist.tsx:429` · `components/calc/gift-tax-form-validate.ts:425`
- *(리뷰 ID c05-2)*

### IG-025 · 중소기업 여부 입력 위젯이 없어 ④가 항상 false 전송 (세율 10%→20%)

`[2/2]` · **MAJOR** · A-배관 · `components/calc/gift/StockBurdenedDebtSection.tsx:230`

- **현상**: 양도소득세 토글 ON 시 `isSmallMediumEnterprise: undefined`로 초기화만 하고, 이 컴포넌트 어디에도 해당 값을 쓰는 입력 위젯이 없다. 저장소 전체에서 이 필드를 쓰는 곳은 이 초기화(:230)와 ④의 매핑뿐이다.
- **근거**: components/calc/gift/StockBurdenedDebtSection.tsx:230 / lib/calc/gift-burdened-transfer-api.ts:504 `isSmallMediumEnterprise: bgt.isSmallMediumEnterprise ?? false` / lib/tax-engine/types/inheritance-gift-estate.types.ts:1006-1010 「중소기업 해당 여부 (§104①11나목 10%/20% 분기)」 / lib/tax-engine/stock-transfer/stock-transfer-rate-calc.ts:117 `return isSmallMediumEnterprise ? "10" : "20"` · :122 `!isSmallMediumEnterprise && isShortTermHolding ? "30" : "20_25"` / grep 결과 이 필드에 쓰는(write) 위젯 0건
- **영향**: 중소기업 주식을 부담부증여하면 비대주주 세율이 10%가 아니라 20%로 계산되고, 대주주·1년 미만이면 20~25% 대신 30%가 적용된다. 사용자가 화면에서 정정할 방법이 없다. 설계 매핑표는 이 값을 「stockItem에서 온다」고 적었고 SCOPE OUT 목록(acquisitionCause·acquiredBeforeListing 등)에도 없다 — 의도된 제외가 아니다.
- **제안**: ⑥ 대주주 판정 ToneCard 옆에 `isSmallMediumEnterprise` ToggleCard(§104①11나목)를 추가해 `setBgt`로 배선한다. 즉시 추가가 어려우면 최소한 ④의 `?? false`에 「입력 UI 없음」 근거 주석을 남기고 화면에 비중소 전제를 고지한다.
- **대조**: `lib/calc/gift-burdened-transfer-api.ts:504` · `lib/tax-engine/stock-transfer/stock-transfer-rate-calc.ts:117` · `docs/02-design/features/gift-stock-burdened-transfer-tax.engine.design.md:273`
- *(리뷰 ID c05-3)*

### IG-026 · 상속세 모드에서 적용되지 않은 필터 조건을 적용된 것처럼 표시

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/gift/PriorGiftHistoryModal.tsx:315`

- **현상**: 필터 요약 박스가 `mode`를 보지 않는다. 상속세 모드 호출부는 `currentDonor`에 필러 `"other"`, `currentClientId`에 `null`을 넘기는데, 박스는 그대로 「증여자 관계: 기타」(:315-318)와 「필터: 10년 이내 … + 동일 수증자(=의뢰인)」(:319-321)를 출력한다. 실제 `filterInheritancePriorGiftCandidates`에는 donor 매칭도 clientId 격리도 없다.
- **근거**: components/calc/gift/PriorGiftHistoryModal.tsx:315-321 / components/calc/PriorGiftInput.tsx:193-196 「상속세 모드에서는 currentDonor·currentClientId 무시 (필러 — 인터페이스 호환)」 `currentDonor={"other" as GiftDonorRelation}` `currentClientId={null}` / lib/calc/prior-gift-lookup.ts:348-350 「donor §47 동일인 그룹 매칭 미적용 / clientId 격리 미적용」 · :358-446 본문에 clientId 비교 없음
- **영향**: 상속세 사전증여 조회 목록에는 다른 의뢰인의 증여 이력도 섞여 나오는데 화면은 「동일 수증자(=의뢰인)」로 걸렀다고 단언한다. 사용자가 확인 없이 §13 사전증여로 가져오면 남의 회차가 상속세 과세가액에 가산된다. 「증여자 관계: 기타」는 아무 의미 없는 필러가 필터 조건으로 표시되는 것이다.
- **제안**: 필터 요약을 `mode`로 분기한다 — 상속세 모드에서는 「현재 증여일」을 「상속개시일」로, 「증여자 관계」 줄을 제거, 필터 문구를 「상속개시일 기준 10년 이내 전수 조회(수증자 필터 없음)」로 바꾼다. 카드의 「✓ 동일 수증자(=의뢰인) 이력」 배지(:175-177)도 같은 분기가 필요하다.
- **대조**: `components/calc/PriorGiftInput.tsx:193` · `lib/calc/prior-gift-lookup.ts:358`
- *(리뷰 ID c05-4)*

### IG-027 · 특례 귀속 자산 평가액을 자체 산식으로 뽑아 주식·부동산이 0으로 표시

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/gift/SpecialTreatmentAssetSelector.tsx:35`

- **현상**: `getAssetValue`가 `marketValue ?? appraisedValue ?? similarSalesValue ?? standardPrice ?? 0`만 본다. 이는 엔진 단일소스 `computeEffectiveValuation`의 마지막 「cash·기타」 분기만 복제한 것으로, 비상장·상장주식(§63 보충평가)·부동산(§60 임대료환산·담보하한 등)·예금·정기금 경로를 전부 건너뛴다.
- **근거**: components/calc/gift/SpecialTreatmentAssetSelector.tsx:35-43 / lib/calc/estate-item-valuation.ts:192-197 (주식은 명시값 없으면 `computeStockValuation`) · :296-299 (cash·기타만 해당 4단 fallback) / lib/stores/inheritance-summary.ts:96-102 「자산 평가액 — 엔진 단일 소스(computeEffectiveValuation)에 위임 … dual-truth 제거」 / lib/tax-engine/gift-special-stream.ts:193-195 family_business 대상은 listed_stock·unlisted_stock **뿐**
- **영향**: 가업승계 §30의6의 유일한 대상인 주식은 대개 `unlistedStockData`로 평가되므로 이 화면에서 금액이 0이 된다 — 자산 1개 분기는 「—」(:133), N≥2 분기는 `val > 0` 게이트(:202)에 걸려 금액이 아예 안 나온다. 사용자가 특례 귀속 자산을 고르는 화면에서 판단 근거인 평가액을 못 본다. 저장소가 명시적으로 금지한 UI 자체 재계산(dual-truth)이다.
- **제안**: `getAssetValue`를 지우고 `computeEffectiveValuation(item, giftDate)`를 호출한다. 평가기준일이 필요하므로 GiftCreditChecklist(:557-559)에서 `valuationDate={form.giftDate}`를 함께 내려준다.
- **대조**: `lib/calc/estate-item-valuation.ts:192` · `lib/stores/inheritance-summary.ts:100` · `components/calc/gift/GiftCreditChecklist.tsx:557`
- *(리뷰 ID c05-5)*

### IG-028 · 지운 연도 칸이 0으로 저장돼 5년 평균을 끌어내린다

`[2/2]` · **MAJOR** · B-3중패턴 · `components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx:88`

- **현상**: updateCashYear는 빈 문자열 입력에 대해 parseKrw("")=undefined → `?? 0`으로 0을 저장한다(:88). 표시는 `assets?.cashByYearEnd?.[i] ? String(...) : ""`(:197)라 저장된 0이 **빈 칸으로 보인다**. 엔진 resolveExcessCash는 `filter(Number.isFinite)`만 하므로 0은 평균 분모·분자에 그대로 들어간다(property-valuation-corporate.ts:56·58). 즉 UI가 "입력한 칸의 평균 사용"(:189)이라고 안내한 것과 실제 계산이 어긋난다.
- **근거**: components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx:88(`arr[idx] = parseKrw(v) ?? 0;`)·:189·:197 / lib/tax-engine/property-valuation-corporate.ts:56-60
- **영향**: 값을 넣었다가 지운 칸이 0으로 남아 직전 5년 평균현금이 과소 산정된다 → 과다보유현금(라목) 과대 → 사업무관자산 합 과대 → calcCorporateStockAdjustedValue의 adjustedValue 과소 → 가업·영농상속공제 대상 주식가액이 과소되어 세액이 과대 산출된다. 화면상 칸이 비어 있어 사용자는 원인을 볼 수 없다.
- **제안**: 빈 입력은 0이 아니라 미입력으로 되돌린다 — `arr[idx] = parseKrw(v)`로 두고(요소 타입을 `number|undefined`로) 엔진의 Number.isFinite 필터에 맡기거나, 3-state가 어렵다면 최소한 저장된 0을 `String(0)`으로 표시해 「비어 보이는 0」을 없앤다.
- **대조**: `lib/tax-engine/property-valuation-corporate.ts:56` · `lib/calc/inheritance-api.ts:71` · `components/calc/InheritanceTaxForm.tsx:389`
- *(리뷰 ID c06-1)*

### IG-029 · 연도 칸을 건너뛰면 배열에 구멍 → Zod가 null을 거절해 계산 차단

`[2/2]` · **MAJOR** · A-배관 · `components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx:87`

- **현상**: 5개 칸 중 앞칸을 비워두고 뒤칸부터 입력하면 `arr[idx] = ...`가 희소(sparse) 배열을 만든다(:87-88). node로 실측: `const a=[];a[2]=500000;JSON.stringify([...a])` → `[null,null,500000]`. 그런데 ⑫ Zod는 `cashByYearEnd: z.array(z.number().nonnegative())`라 null 원소를 거절한다(estate-item-schema.ts:145). 엔진은 반대로 비유한 값을 걸러내도록(:56 filter(Number.isFinite)) 이미 부분 입력을 허용하게 짜여 있고 UI도 "입력한 칸의 평균 사용"(:189)이라고 안내한다.
- **근거**: components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx:87-89·:189 / lib/validators/estate-item-schema.ts:145 / lib/tax-engine/property-valuation-corporate.ts:56 (node 실측: 희소배열 JSON → null)
- **영향**: 「1년 전」 칸을 비우고 2~5년 전만 입력하는 정상 사용에서 POST /api/calc/inheritance가 400으로 떨어진다(issues path: estateItems.N.corporateNonBusinessAssets.cashByYearEnd.0, "Expected number"). 사용자는 화면에 채운 칸만 보이므로 어떤 칸이 문제인지 알 수 없고 계산 자체가 막힌다.
- **제안**: 저장 전에 구멍을 없앤다 — updateAssets 직전 `cashByYearEnd: arr.map((v) => v ?? 0)` 대신 **입력된 칸만 남기는 압축**(구멍·미입력 제거) 또는 Zod를 `z.array(z.number().nonnegative().nullable())`로 넓히고 엔진 필터에 맡긴다. 둘 중 하나만 고르면 UI 안내("입력한 칸의 평균")와 일치한다.
- **대조**: `lib/validators/estate-item-schema.ts:145` · `lib/calc/inheritance-api.ts:71` · `app/api/calc/inheritance/route.ts:74`
- *(리뷰 ID c06-2)*

### IG-030 · 차감 미리보기의 주식가액이 엔진 §60 평가순위와 달라 카드가 안 뜬다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx:61`

- **현상**: 미리보기 base를 `item.marketValue ?? item.appraisedValue ?? item.standardPrice ?? 0`로 직접 계산한다(:61-62). 엔진·lib/calc는 모두 resolveEstateItemValue를 쓰며, 여기엔 similarSalesValue(§49④)와 **주식 보충평가**(listed=평균종가×주식수, unlisted=V2/V1) 단계가 더 있다(resolve-estate-item-value.ts:134-159). corporate_stock 분류는 listed_stock·unlisted_stock 자산에서만 선택 가능하고(FamilyBusinessCategorySection.tsx:59·FarmingCategorySection.tsx:49), 이들 자산은 marketValue를 store에 쓰지 않는 정책이다(inheritance-deduction-suggest.ts:70 주석 — mirror 금지, derive만).
- **근거**: components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx:61-62·:68-71(stockValue<=0이면 preview null) / lib/tax-engine/valuation/resolve-estate-item-value.ts:134-159 / lib/tax-engine/deductions/family-business.ts:273 / lib/calc/inheritance-deduction-suggest.ts:80-92
- **영향**: V2로 평가한 비상장주식·평균종가×수량으로 평가한 상장주식(=이 카드가 뜨는 전형적 케이스)에서 stockValue가 0이 되어 「⚖️ 차감 미리보기」가 아예 렌더되지 않는다. 엔진은 정상적으로 차감을 적용하므로, 사용자는 자신이 입력한 사업무관자산이 반영되는지 화면에서 확인할 수 없다. 파일 상단이 선언한 single-source-engine-helper 정책(:17)과도 어긋난다.
- **제안**: `resolveEstateItemValue(item)`(또는 이미 export된 inheritance-deduction-suggest의 getValuatedAmount)를 import해 stockValue를 구한다 — 엔진이 실제로 쓰는 값과 동일해진다.
- **대조**: `lib/tax-engine/valuation/resolve-estate-item-value.ts:134` · `lib/tax-engine/deductions/family-business.ts:273` · `lib/calc/inheritance-deduction-suggest.ts:91`
- *(리뷰 ID c06-3)*

### IG-031 · ⑩ 지분율 입력이 부동소수 왕복으로 깨져 두 자리 입력 불가

`[2/2]` · **MAJOR** · D-타입 · `components/calc/inheritance/CorporateHeirFields.tsx:187`

- **현상**: 지분율을 비율(0~1)로 저장하고 표시할 때마다 `String(shareholder.shareRatio * 100)`으로 되돌린다(:185-189). onChange는 입력값을 즉시 /100 한다(:190-197). node 실측: 1~100 중 7·14·28·29·55·56·57·58에서 `(p/100)*100`이 정확한 정수 문자열을 내지 않는다(예: 7 → "7.000000000000001").
- **근거**: components/calc/inheritance/CorporateHeirFields.tsx:185-197 (node 실측: String(0.07*100)==="7.000000000000001") / 형제 구현은 비율을 문자열로 보관하고 DecimalInput을 쓴다 — components/calc/property/Step0.tsx:410-418
- **영향**: "7"을 입력하는 순간 칸이 "7.000000000000001"로 바뀌고, 이어서 자릿수를 더 입력해도 그 쓰레기 문자열에 붙어 파싱되므로 75% 같은 값을 입력할 수 없다. 부표 5 주주 명세 ⑩ 칸이 특정 지분율에서 사실상 입력 불능이 된다.
- **제안**: 표시값을 폼 상태(문자열)로 보관하거나, 최소한 표시에서 `String(...)` 대신 반올림 표기(예: 소수 4자리 정규화)를 적용해 왕복 시 사용자가 친 문자열이 보존되게 한다.
- **대조**: `lib/validators/property-valuation-input.ts:223` · `components/calc/property/Step0.tsx:410`
- *(리뷰 ID c06-4)*

### IG-032 · 자격 미리보기가 자동판정 전 입력으로 판정해 항상 미충족

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:165`

- **현상**: 미리보기는 evaluateFamilyBusinessEligibility(familyBusiness)를 원본 폼값으로 호출한다. 그런데 heirIsAdult·heirTwoYearEngagement·heirOfficerByFilingDeadline·heirCEOWithinTwoYears는 UI가 절대 쓰지 않는다(EMPTY_FB:65-68에서 false로 고정, FbHeirRequirementsSection은 날짜와 *Override만 기록). 엔진은 resolveFamilyBusinessRequirements로 날짜에서 이 4개를 도출한 뒤 같은 함수를 부른다.
- **근거**: 런타임 probe(생년월일·종사개시일·임원취임일·대표이사취임일 모두 충족 입력): 원본 입력 → {eligible:false, reasons:["heir_not_adult","heir_engagement_short","heir_officer_not_appointed","heir_ceo_not_scheduled"]}, resolveFamilyBusinessRequirements 통과 입력 → {eligible:true, reasons:[]}. UI 쓰기 지점 부재는 grep으로 확인(components/ 전체에서 familyBusiness의 heirIsAdult: 쓰기 0건).
- **영향**: 의도된 자동판정(날짜 입력) 경로를 쓰는 모든 사용자에게 하단 미리보기가 「✗ 자격 미충족 — 상속인 18세 미만 / 2년 종사 미충족 / 신고기한 내 임원 미취임 / 2년 내 대표이사 미취임」을 상시 표시한다(:544-557). 같은 화면 섹션④의 FbAutoCheckPreviewCard는 「충족」을 보여주므로 한 화면이 자기 자신과 모순되고, 사용자는 공제 불가로 오인해 입력을 포기한다.
- **제안**: 미리보기도 엔진과 같은 입력으로 판정한다 — resolveFamilyBusinessRequirements(familyBusiness, selectedHeirBirthDate, deathDate).resolvedInput을 evaluateFamilyBusinessEligibility에 넘길 것(같은 모듈에서 이미 resolveFamilyBusinessHeirId를 import 중이라 추가 의존 없음). deathDate 미전달 시에는 미리보기를 렌더하지 않는 편이 안전하다.
- **대조**: `lib/tax-engine/deductions/inheritance-deductions.ts:377` · `lib/tax-engine/deductions/family-business-autoderive.ts:357` · `lib/tax-engine/deductions/family-business.ts:220`
- *(리뷰 ID c07-2)*

### IG-033 · 장례비 합계가 §9②1호 500만 최소보장을 빠뜨려 엔진과 다름

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/DebtAllocationInput.tsx:115`

- **현상**: 카드 하단 합계가 funeralAppliedMeal = Math.min(funeralMeal, 10_000_000)으로 상한만 적용한다. 상증령 §9②1호는 clamp[500만, 1천만]이라 하한도 있는데 UI에는 없다.
- **근거**: 런타임 probe(식대 3,000,000·봉안 0): 엔진 calcFuneralExpenseDeduction → 5,000,000 / 이 파일의 산식 → 3,000,000. 엔진 단일 소스 lib/tax-engine/inheritance-gift-common.ts:553 `Math.min(Math.max(mealExpense, FUNERAL_MIN), FUNERAL_GENERAL_MAX)`. 형제 소비처는 모두 헬퍼를 쓴다 — lib/stores/inheritance-summary.ts:167(사이드바), lib/calc/deduction-besshi-data.ts:150(별지 서식).
- **영향**: 식대 500만원 미만 입력 시 이 카드만 「식대 3,000,000 → 한도 3,000,000 … 합계 3,000,000」을 표시하고, 같은 화면의 사이드바·결과·별지 서식은 5,000,000을 쓴다. 사용자가 화면 안에서 서로 다른 두 금액을 동시에 본다.
- **제안**: 로컬 재구현을 버리고 lib/tax-engine/inheritance-gift-common.ts의 calcFuneralExpenseDeduction(funeralMeal, funeralBongan)을 그대로 호출해 표시할 것(사이드바가 이미 그렇게 한다). inheritance-allocation-deductions.ts:128에 같은 결함(M-8)을 이미 한 번 고친 기록이 있다.
- **대조**: `lib/tax-engine/inheritance-gift-common.ts:553` · `lib/tax-engine/inheritance-tax-estate-steps.ts:96` · `lib/stores/inheritance-summary.ts:167` · `lib/calc/deduction-besshi-data.ts:150`
- *(리뷰 ID c07-3)*

### IG-034 · 공제 한도 미리보기가 deathDate 없이 계산돼 개정 전 상속에 오표시

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:173`

- **현상**: capPreview가 familyBusinessCap(familyBusiness.operatingYears)를 인자 1개로 부른다. 컴포넌트는 deathDate prop을 받고 있는데(:155) 넘기지 않는다. 엔진은 항상 2번째 인자로 상속개시일을 넘긴다.
- **근거**: 런타임 probe(operatingYears 12): familyBusinessCap(12) → 30,000,000,000 / familyBusinessCap(12, "2020-03-01") → 20,000,000,000. 엔진 호출부 lib/tax-engine/deductions/family-business.ts:358 `familyBusinessCap(input.operatingYears, input.deathDate)`, 시기 분기 :82-93. 형제 FbAdditionalBusinessesSection.tsx:74는 같은 이유로 deathDate를 넘긴다(:47 주석 「시기별 한도」).
- **영향**: 상속개시일이 2014-01-01~2022-12-31인 사건에서 「✓ 10년 이상 (1호) — 한도 300억」(:313)과 자격 배너의 「(한도 300억)」(:539)이 엔진 실제 한도(200억)와 100억 어긋난다. 표시 문구의 호 번호도 함께 틀어진다.
- **제안**: familyBusinessCap(familyBusiness.operatingYears, deathDate)로 인자를 추가하고 useMemo 의존성에 deathDate를 넣을 것. 금액→라벨 매핑(:310-316)은 시기별 표에서 같은 금액이 다른 호에 대응하므로 operatingYears 구간으로 라벨을 정하도록 함께 바꿔야 한다.
- **대조**: `lib/tax-engine/deductions/family-business.ts:73` · `lib/tax-engine/deductions/family-business.ts:358` · `components/calc/inheritance/family-business/FbAdditionalBusinessesSection.tsx:74`
- *(리뷰 ID c07-4)*

### IG-035 · 「미입력 시 기준 미충족」 hint가 엔진 동작과 정반대

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:340`

- **현상**: 자산총액 CurrencyInput의 hint가 「미입력 시 기준 미충족으로 처리」라고 안내한다. 엔진은 (input.totalAssets ?? 0) >= 5천억일 때만 배제하므로 미입력(undefined)은 0으로 읽혀 규모 요건을 통과한다.
- **근거**: lib/tax-engine/deductions/family-business.ts:201 `if ((input.totalAssets ?? 0) >= FAMILY_BUSINESS_SCALE_THRESHOLD)`, :206 중견기업도 `(input.averageRevenue3Y ?? 0) >=`. 런타임 probe에서 totalAssets 미입력 입력의 reasons에 enterprise_size_exceeded가 없음을 확인.
- **영향**: 사용자가 안내를 믿고 비워 두면 「미충족되겠지」라고 생각하지만 실제로는 규모 요건을 통과해 가업상속공제가 적용된다. 세액이 납세자에게 유리한 방향으로 조용히 갈리는 안내 오류다. 347행 중견기업 매출액 hint도 같은 문구로 같은 모순을 갖는다.
- **제안**: 엔진 동작에 맞춰 「미입력 시 기준 이하로 간주되어 규모 요건을 통과합니다」로 문구를 바꾸거나, 반대로 엔진 문구대로 막으려면 ⑧validate에 필수 입력 검증을 추가해 UI·엔진·validate 셋을 일치시킬 것(자동 fallback 금지 원칙상 후자가 정합).
- **대조**: `lib/tax-engine/deductions/family-business.ts:201` · `lib/tax-engine/deductions/family-business.ts:206`
- *(리뷰 ID c07-5)*

### IG-036 · 계산 전 요약이 체크리스트 게이트를 무시해 미적용 공제를 「적용 예정」으로 표시

`[2/2]` · **MAJOR** · B-3중패턴 · `components/calc/inheritance/InheritanceReviewSummary.tsx:96`

- **현상**: 96~100행은 `has(form.familyBusinessValue) || has(form.familyBusinessDirectAmount) || form.familyBusiness != null`만 보고 「가업상속공제」 칩을 그린다. 반면 ④ buildInput은 같은 세 필드를 전부 `isManualItemActive(form, "familyBusiness")`로 게이팅해 비활성이면 undefined를 보낸다. 체크리스트에서 항목을 해제하면 overrides.familyBusiness=false가 저장되고 값은 보존되므로(값 유지·계산 제외), 두 판정이 정반대가 된다.
- **근거**: components/calc/inheritance/InheritanceReviewSummary.tsx:96-100 / components/calc/InheritanceTaxForm.tsx:270·278·313-314(세 필드 모두 isManualItemActive 게이트) / lib/calc/inheritance-deduction-checklist.ts:202-210(`overrides[key] ?? manualItemHasValue`) / components/calc/inheritance/Step4DeductionChecklist.tsx:193-197(해제 시 `next[chipKey] = false` — 값 보존)
- **영향**: 「계산 전 입력 요약」은 누락 인지를 목적으로 하는 카드인데, 사용자가 명시적으로 끈 공제를 「적용 예정」으로 보여 준다. 파일 docstring(13행)이 「적용 여부는 buildInput/autos와 동일한 fallback 규칙으로 판정(단일 진실)」이라 단언하고 있어 오독이 더 굳어진다.
- **제안**: 공제 칩 판정도 `isManualItemActive(form, "familyBusiness")`를 그대로 호출한다(이미 export된 공용 술어). 106행 외국납부세액공제(`foreignTax`)와 107-108행 단기재상속공제(`shortTermReinherit`)도 buildInput 346·354행에서 같은 게이트를 쓰므로 함께 확인이 필요하다.
- **대조**: `components/calc/InheritanceTaxForm.tsx:270` · `components/calc/InheritanceTaxForm.tsx:313` · `lib/calc/inheritance-deduction-checklist.ts:202` · `components/calc/inheritance/Step4DeductionChecklist.tsx:193`
- *(리뷰 ID c08-3)*

### IG-037 · groupBVisibleCount가 heirWaiver를 안 세어 활성이어도 칸이 가려짐

`[2/2]` · **MAJOR** · F-도달가능성 · `components/calc/inheritance/Step4Deductions.tsx:179`

- **현상**: groupBVisibleCount는 legatee·priorGiftDeduction·disasterAdjust·casualtyLoss·appraisalFee 5개만 더한다. manualActive.heirWaiver(:107)가 빠져 있다. 그룹 B는 :409에서 count===0이면 children 전체 대신 EmptyGroupNotice를 렌더한다.
- **근거**: Step4Deductions.tsx:179-184 (heirWaiver 미포함) · :409 `{groupBVisibleCount === 0 ? <EmptyGroupNotice /> : (...)}` · :427 heirWaiver 칸은 그 children 안에 있음. groupAdjustData(:132-140)도 form.heirWaiverAmount를 안 본다.
- **영향**: heirWaiver만 활성이고 다른 B그룹 항목이 전부 비활성이면 count=0 → "위 체크리스트에서 항목을 선택하면 입력 섹션이 열립니다"만 뜨고 heirWaiver 칸은 계속 숨는다. 앞 지적(칩 추가)을 고쳐도 이 결함은 그대로 남아 칩을 켜도 칸이 안 나온다.
- **제안**: groupBVisibleCount에 `(manualActive.heirWaiver ? 1 : 0)`를 더한다. groupAdjustData 배열에도 form.heirWaiverAmount를 넣어 「입력됨」 배지·초기 펼침이 맞도록 한다.
- **대조**: `components/calc/inheritance/Step4Deductions.tsx:107` · `components/calc/inheritance/Step4Deductions.tsx:409`
- *(리뷰 ID c09-2)*

### IG-038 · 감정평가수수료만 ④에 체크리스트 게이트가 없어 「계산 제외」가 거짓

`[2/2]` · **MAJOR** · B-3중패턴 · `components/calc/inheritance/Step4Deductions.tsx:461`

- **현상**: ⑤UI는 appraisalFee 섹션을 manualActive.appraisalFee로 게이트하는데, ④API 변환은 게이트 없이 폼 필드를 그대로 읽는다. 같은 파일의 다른 수동 항목(legatee·priorGiftDeduction·disasterAdjust·foreignTax·shortTermReinherit)은 ④에서 전부 isManualItemActive로 게이트된다.
- **근거**: components/calc/InheritanceTaxForm.tsx:412 `appraisalFee: buildAppraisalFee(form)` — 게이트 없음. lib/calc/appraisal-fee-form.ts:28-31은 form의 3종 금액을 그대로 읽는다. 대조: InheritanceTaxForm.tsx:283-296(legatee·priorGiftDeduction·disasterAdjust)·347-356(foreignTax)은 `isManualItemActive(form, key) ? ... : undefined`. ④의 계약도 :268-270 주석이 「isManualItemActive false이면 undefined(값 보존, 계산 제외), 자동 항목만 게이트 없음」이라 명시하고 appraisalFee는 자동 항목이 아니다(inheritance-deduction-checklist.ts:24 AUTO_KEYS 4개).
- **영향**: 수수료를 입력한 뒤 칩을 해제하면 섹션이 숨고 칩은 「입력값이 있으나 계산에서 제외됩니다」(Step4DeductionChecklist.tsx:243)·「N개 항목 — 입력값 있으나 계산 제외」(:294)를 표시하지만, 실제로는 §25 감정평가수수료가 그대로 과세표준에서 공제된다. 화면에서 사라진 값이 payload로 새어 세액이 과소 산출되고, UI 안내가 계산과 정반대다.
- **제안**: InheritanceTaxForm.tsx:412를 `appraisalFee: isManualItemActive(form, "appraisalFee") ? buildAppraisalFee(form) : undefined`로 바꿔 다른 수동 항목과 같은 게이트를 건다.
- **대조**: `components/calc/InheritanceTaxForm.tsx:412` · `components/calc/InheritanceTaxForm.tsx:268` · `lib/calc/appraisal-fee-form.ts:28` · `components/calc/inheritance/Step4DeductionChecklist.tsx:243`
- *(리뷰 ID c09-3)*

### IG-039 · 별지6호의2 상속인별 표 — thead의 rowSpan={7}이 tbody를 못 덮어 본문이 한 칸 어긋난다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/deduction-besshi/Besshi6_2Section2.tsx:176`

- **현상**: 「상속인」 좌측 라벨 th가 `<thead>` 안에서 rowSpan={7}로 선언돼 있으나 thead에는 헤더 2행뿐이고 나머지 5행(데이터 4 + ⑨계)은 `<tbody>`에 있다. HTML 표 모델에서 rowspan은 행 그룹(thead/tbody/tfoot)을 넘지 못하므로 col1은 tbody 행에서 비게 된다. 실제 열 수를 세면 thead 1행 = 1+3+2+2+9+2 = 19열인데, tbody 데이터행(:225-255)은 3+2+2+2+7+2 = 18열, 패딩행(:262-267)도 18열, ⑨계 행(:273-279)은 16+2 = 18열이다.
- **근거**: components/calc/inheritance/deduction-besshi/Besshi6_2Section2.tsx:172(<thead> 시작)·:176(rowSpan={7})·:219(</thead>)·:220(<tbody>)·:225-255(데이터행 18열)·:273-279(⑨계 18열). 형제 섹션은 모두 tbody 안에서만 rowSpan을 쓴다 — Besshi6_2Section1.tsx:41(rowSpan={2})·Besshi6_2Section3.tsx:53(rowSpan={2})·같은 파일 :62(rowSpan={4})은 전부 정상 19열.
- **영향**: 인쇄·PDF로 제출하는 공식 서식에서 상속인별 표 본문 전체가 헤더 대비 한 칸 왼쪽으로 밀린다 — 성명이 「상속인」 라벨 칸 아래에 오고, ⑧ 요건충족지분 값이 ⑦ 무주택자 칸에 걸린다. 동거 상속인이 5명 이상이면 rowSpan={7} 가정 자체도 어긋난다(minRows=max(len,4), :44).
- **제안**: 헤더 2행과 본문을 한 행 그룹으로 합치거나(전부 tbody), 「상속인」 셀을 thead용 rowSpan={2}로 두고 tbody 첫 행에 별도 rowSpan 셀을 두어 tbody 행도 19열이 되게 한다. 행 수는 `2 + minRows + 1`로 파생해 하드코딩 7을 제거할 것.
- **대조**: `components/calc/inheritance/deduction-besshi/Besshi6_2Section1.tsx:41` · `components/calc/inheritance/deduction-besshi/Besshi6_2Section3.tsx:53` · `lib/calc/cohabit-besshi-data.ts:112`
- *(리뷰 ID c10-2)*

### IG-040 · 카테고리 목록을 단일 출처에서 복제하면서 crypto_asset을 빠뜨렸다

`[2/2]` · **MAJOR** · C-공용컴포넌트 · `components/calc/inheritance/estate-card/CategoryChangeDialog.tsx:51`

- **현상**: 다이얼로그가 INHERITANCE_CATEGORIES(:51-65, 13개)·GIFT_CATEGORIES(:67-80, 12개)를 자체 선언한다. 그런데 저장소가 「단일 출처」로 명시한 목록은 각각 lib/calc/deemed-category-policy.ts:29-43(14개)과 components/calc/inheritance/estate-card/estate-category-meta.ts:51-65(13개)이고, 둘 다 `crypto_asset`을 포함한다. 다이얼로그 사본만 두 목록에서 crypto_asset이 빠졌다. CATEGORY_LABELS(:34-49)도 estate-category-meta.ts:16의 사본이다(deposit 라벨이 서로 다름).
- **근거**: CategoryChangeDialog.tsx:51-65·:67-80(crypto_asset 없음)·:47(라벨은 존재) / lib/calc/deemed-category-policy.ts:29-43(crypto_asset 포함, :41) / components/calc/inheritance/estate-card/estate-category-meta.ts:2(「단일 출처」 명시)·:63(crypto_asset) / components/calc/PropertyValuationForm.tsx:295-296(자산 추가 시 GIFT_CATEGORIES 또는 DEEMED_ALLOWED_CATEGORIES[none]=INHERITANCE_CATEGORIES 사용 → 두 모드 모두 가상자산 생성 가능)
- **영향**: 가상화폐(가상자산)는 추가는 되는데 카테고리 변경으로는 도달할 수 없다 — 잘못 분류한 자산을 가상자산으로 고치려면 삭제 후 재입력해야 한다. 반대로 crypto_asset 항목에서 다이얼로그를 열면 현재 카테고리에 대응하는 라디오가 없어 「(현재)」 표시 없이 아무것도 선택되지 않은 상태로 렌더된다.
- **제안**: 로컬 두 배열을 지우고 deemed-category-policy.ts의 INHERITANCE_CATEGORIES·estate-category-meta.ts의 GIFT_CATEGORIES를 import한다(라벨도 estate-category-meta.CATEGORY_LABELS 재사용). 다이얼로그 전용 문구(「전세보증금 반환채권 (상속세 전용)」)가 필요하면 라벨 override 맵 1개만 로컬에 둔다.
- **대조**: `lib/calc/deemed-category-policy.ts:29` · `components/calc/inheritance/estate-card/estate-category-meta.ts:51` · `components/calc/PropertyValuationForm.tsx:295`
- *(리뷰 ID c10-3)*

### IG-041 · 협의분할 패널 기준액이 평가기준일을 빼고 계산돼 칩 평가액과 다르다

`[2/2 · ½]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/estate-card/EstateChipInlineExpand.tsx:128`

- **현상**: 이 컴포넌트는 평가기준일을 deathDate prop(:45·:78)으로 받는데, 협의분할 패널에 넘길 기준액 fallback에서는 `computeEffectiveValuation(item)`을 인자 없이 호출한다(:128). 같은 값을 만드는 칩 라벨 쪽은 `computeEffectiveValuation(item, valuationDate)`로 날짜를 전달한다(chip-config.ts:136-137, 주석 '지상권은 평가기준일 의존 → valuationDate 전달'). computeEffectiveValuation은 superficies·intangible_ip·receivable·convertible_bond·trust_benefit에서 valuationDate가 없으면 잔존연수 0 등으로 다른 값(대개 0)을 낸다(lib/calc/estate-item-valuation.ts:200-231, injectSuperficiesRemainingYears는 valuationDateISO 미전달 시 remainingYears=0 반환). 호출자 EstateItemEditor.tsx:262-270은 effectiveValuation을 전달하지 않아 항상 이 fallback이 탄다 — 형제 호출자 EstateStockChipsHeader.tsx:134는 전달한다.
- **근거**: EstateChipInlineExpand.tsx:45(deathDate prop)·:128(computeEffectiveValuation(item) — 날짜 미전달) / chip-config.ts:136-137(칩은 valuationDate 전달) / lib/calc/estate-item-valuation.ts:201-207(superficies 분기) / EstateItemEditor.tsx:262-270(effectiveValuation 미전달, deathDate만 전달) / EstateStockChipsHeader.tsx:134(형제는 effectiveValuation 전달) / HeirAllocationToggleSection.tsx:68(expectedTotal={effectiveValuation})
- **영향**: 지상권·무체재산권·채권·전환사채·신탁수익권 자산에서 헤더 칩은 정상 평가액을 보여주는데 협의분할 패널의 기준액은 0(또는 다른 값)이 된다. expectedTotal이 0이면 합계 검증이 통째로 무력화되고(HeirAllocationInput.tsx:47 `expectedTotal === 0 || …`), '잔액 자동 채움'(:123)과 단독상속인 '전액 배분'(:144)이 0을 넣는다. 사용자는 상속인별 분배를 틀린 기준으로 입력하게 되고 화면 경고도 뜨지 않는다.
- **제안**: 이미 갖고 있는 deathDate를 fallback에 넘긴다 — `effectiveValuation ?? computeEffectiveValuation(item, deathDate)`. (칩과 동일 인자 세트가 되어 단일 진실 복구.)
- **대조**: `lib/calc/estate-item-valuation.ts:177-231` · `components/calc/inheritance/HeirAllocationInput.tsx:44-47` · `components/calc/inheritance/HeirAllocationInput.tsx:123` · `components/calc/inheritance/HeirAllocationInput.tsx:144` · `components/calc/EstateItemEditor.tsx:118`
- **½ 정정(code-fact)**: 성립: EstateChipInlineExpand.tsx:128의 fallback이 평가기준일을 빼고 계산해, 부동산 카드(EstateItemEditor 경로)에서 협의분할 패널의 expectedTotal이 헤더 칩 평가액과 갈린다. 지상권·무체재산권은 0이 되고, 채권(discounted)은 반대로 과대(할인 미적용, 1억 vs 68,058,320)가 된다 — 「대개 0」은 절반만 맞다. 무력화되는 것은 합계 불일치 rose 경고(HeirAllocationInput.tsx:47 `expectedTotal === 0 ||`)와 칩 클릭 시 잔액 자동 채움(:123이 0을 넣음)이다. 정정 1: 「단독상속인 '전액 배분'(:144)이 0을 넣는다」는 틀렸다 — 그 버튼은 :190에서 `expectedTotal > 0`으로 게이트되어 0일 때 렌더되지 않는다. 정정 2: 「화면 경고도 뜨지 않는다」도 틀렸다 — :173이 회색 배지 '합계 … (평가액 미입력 — 카드 본체에서 시가·감정가·기준시가 입력)'를 띄운다. 다만 칩에는 평가액이 표시되는 상황이라 이 안내문 자체가 사실과 다른 오도(誤導)이고, 정작 필요한 rose 불일치 경고는 뜨지 않으므로 결함의 무게는 그대로다. 제안(`computeEffectiveValuation(item, deathDate)`)은 유효. 부수 발견: handleChipClick.ts:90도 같은 날짜 누락 호출이나, buildInitialHeirAllocations가 `void effectiveValuation; return []`(HeirAllocationInput.tsx:56-61)이라 무해(inert)다.
- *(리뷰 ID c11-2)*

### IG-042 · 전세보증금 반환채권 카드가 엔진이 쓰지 않는 「÷12%」 산식을 라벨로 표시

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/estate-card/variants/EstateBodyDeposit.tsx:36`

- **현상**: EstateBodySection subtitle(:36) `자산 명칭 · 임대보증금 — 환산가액 = 보증금 ÷ 12%` 와 FieldCard hint(:59) `환산가액 = 보증금 ÷ 12%` 가 나란히 「÷12%」를 안내한다. 그런데 같은 파일 :51의 안내문은 `반환받을 채권 액면가`라고 정반대로 적혀 있다 — 파일이 자기 자신과 모순이다.
- **근거**: components/calc/inheritance/estate-card/variants/EstateBodyDeposit.tsx:36·:51·:59 / 엔진 lib/tax-engine/property-valuation.ts:405 `const amount = item.leaseDeposit;` (÷12% 없음), 같은 파일 :386-388 주석이 명시적으로 경고: 「평가액 = 전세보증금 액면가(시가 = 액면). 주의: §61의 "보증금 ÷ 12%" 공식은 임대료 수익을 자본화하는 공식으로 전세권(권리) 평가가 아니라 임대수익 재산 평가에 적용되는 것임」 / 사이드바 추정도 동일: lib/calc/estate-item-valuation.ts:249-251 `if (item.category === "deposit") return item.leaseDeposit ?? 0;`
- **영향**: 화면이 안내하는 산식과 실제 평가가 다르다. 라벨을 믿은 사용자가 「환산가액」을 스스로 계산해(보증금 ÷ 0.12 = 8.33배) 입력하면 상속재산이 8.33배 과대 평가되고, 그대로 액면가를 넣은 사용자는 화면 설명이 틀렸다고 판단하게 된다. 엔진 주석이 「혼동 금지」라 못 박은 바로 그 혼동이 UI에 남아 있다.
- **제안**: 두 문자열의 「환산가액 = 보증금 ÷ 12%」를 :51과 같은 취지(「반환받을 채권 액면가 = 전세보증금」)로 교체. 엔진·표시 어느 쪽도 바꾸지 않는 문구 수정 2곳.
- **대조**: `lib/tax-engine/property-valuation.ts:386` · `lib/tax-engine/property-valuation.ts:405` · `lib/calc/estate-item-valuation.ts:250`
- *(리뷰 ID c12-1)*

### IG-043 · §23의2 동거주택 공제 토글이 「상업용 건물」 자산에도 열린다

`[2/2 · ½]` · **MAJOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx:251`

- **현상**: `showCohabitToggle={showLeaseDeposit && mode === "inheritance"}` 인데 `showLeaseDeposit`(:153-154)은 `cat === "real_estate_apartment" || cat === "real_estate_building"` 이다. 임대보증금 노출 조건(주택+상가 공통)을 §23의2 주택 여부 판정에 그대로 재사용했다. 컴포넌트 주석(:278)은 「주택 카테고리: apartment·building」이라고 적었지만 저장소의 카테고리 정의는 그 반대다.
- **근거**: components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx:153-154·:251·:278 / components/calc/inheritance/estate-card/estate-category-meta.ts:18 `real_estate_building: "상업용 건물"`, :8-9 주석 「real_estate_apartment 키는 "주택"(아파트·공동·단독)을 의미 … real_estate_building 은 상업용·기타 건물」 / 같은 파일 SUBTITLE :112-113 도 real_estate_building 을 「상업용 건물」로 표시 / resolvePropertyKind → "building_non_residential" (EstateBodyHelpers.ts:21)
- **영향**: 상업용 건물 카드에서 「동거주택 공제 대상 (§23의2)」을 켤 수 있고, 하류에 카테고리 필터가 전혀 없어 그대로 공제가 도출된다 — lib/calc/inheritance-deduction-suggest.ts:596 은 `estateItems.filter((i) => i.isCohabitantHouse === true)` 로 카테고리를 보지 않는다. §23의2①이 주택을 요구하는데 상업용 건물에 최대 6억 공제가 열린다.
- **제안**: showCohabitToggle 조건을 임대보증금 축에서 떼어 `cat === "real_estate_apartment" && mode === "inheritance"` 로 좁힌다(주석 :278 도 함께 정정).
- **대조**: `lib/calc/inheritance-deduction-suggest.ts:596` · `components/calc/inheritance/estate-card/estate-category-meta.ts:18`
- **½ 정정(rule-impact)**: 【현상·영향은 그대로 유지】 showCohabitToggle이 임대보증금 노출축(showLeaseDeposit = apartment||building, 실질은 「land가 아님」)을 재사용해 상업용 건물(근린생활시설 등) 카드에도 §23의2 토글이 열리고, 하류(inheritance-deduction-suggest.ts:596 · inheritance-validate.ts:749)에 카테고리 필터가 전혀 없어 InheritanceTaxForm.tsx:262 autoOrManual 경로로 최대 6억 공제가 자동 도출된다. :278 주석 「주택 카테고리: apartment·building」은 estate-category-meta.ts:19·:8-9 및 resolvePropertyKind(building_non_residential)와 모순된다.

【정정: 제안된 수정은 채택 불가】 `cat === "real_estate_apartment"`로 좁히면 안 된다. AssetCategory에 오피스텔 카테고리가 없어(types:42-58 · deemed-category-policy.ts:20-23) 상시주거용 오피스텔의 유일한 입력 경로가 real_estate_building 카드이며(EstateBodySupplementaryValuation.tsx:44-46 「일괄고시 … 오피스텔·대규모 상가」), CohabitRequirementBlock.tsx:261이 그 오피스텔을 §23의2 적용 가능으로 안내하고 있다. 게이트를 apartment로 좁히면 앱이 스스로 「적용 가능」이라 안내한 케이스의 입력 경로를 없앤다.

【올바른 처방 방향】 카테고리로 「닫는」 대신 주택성 판정을 선언 축으로 옮긴다: building 카드에서도 토글은 유지하되 (a) COHABIT_RIGHT_OPTIONS(:53-86)에 「상시주거용 오피스텔(실제 주거 사용)」 같은 선언 옵션을 추가하고, (b) building + 미선언 시 rose 안내로 §23의2① 「주택」 요건 미충족을 명시하거나 공제 0 처리하며, (c) deriveCohabitHouseStdPrice(:596)에 그 선언값을 보는 게이트를 함께 넣어 UI·derive 두 층의 술어를 일치시킨다(술어가 한 층에만 있으면 안 됨). 아울러 :278 주석을 정정하고, estate-body-realestate-advanced.test.tsx에 category=real_estate_building 케이스를 추가한다(현 B-3 fixture는 apartment라 갭을 못 본다).
- *(리뷰 ID c12-2)*

### IG-044 · 상장 신주인수권증서의 유일한 입력칸을 ⑫Zod가 검증하지 않아 미입력 통과

`[2/2]` · **MAJOR** · A-배관 · `components/calc/inheritance/estate-card/variants/EstateBodyConvertibleBond.tsx:86`

- **현상**: 증권 종류 = `preemptive_right` + 거래소 거래 ON 이면 UI가 노출하는 입력칸은 「전체 거래일 종가평균」(`cbExchange2mAvg`) 하나뿐이다(:85-95). 그런데 ⑫Zod superRefine의 거래소 분기는 `preemptive_right`를 명시적으로 제외하고, 이어지는 비거래소 분기도 `isPreemptive`면 원금·만기년수를 건너뛰고 `cbConvertible`(이 조합에서는 렌더되지 않아 false)만 본다 — 결국 이 조합에서는 필수 검증이 하나도 실행되지 않는다.
- **근거**: components/calc/inheritance/estate-card/variants/EstateBodyConvertibleBond.tsx:85-95 (isPreemptive 시 cbExchange2mAvg 단일 필드) / lib/validators/estate-item-schema.ts:546 `if (item.cbTradedOnExchange && item.cbSecurityType !== "preemptive_right") { … return; }`, :561 `if (!isPreemptive) {`, :570 `if (item.cbConvertible) {` / 엔진 lib/tax-engine/property-valuation-convertible-bond.ts:170-171 `if (item.cbTradedOnExchange) { const v = item.cbExchange2mAvg ?? 0;` / 클라이언트 ⑧에도 cb* 검증 없음(lib/calc/inheritance-validate.ts 내 cb 필드 grep 0건)
- **영향**: 상장 신주인수권증서를 추가하고 종가평균을 비워둔 채 계산하면 차단 없이 통과하고, 엔진이 `?? 0`으로 받아 그 자산의 평가액이 0원이 된다. 카드에 미리보기가 없어 사용자는 0원 처리를 알아채지 못한 채 상속·증여재산이 과소 신고된다.
- **제안**: estate-item-schema.ts 거래소 분기에 preemptive 경로를 추가한다 — 예: :546 조건 앞에 `if (item.cbTradedOnExchange && item.cbSecurityType === "preemptive_right") { need((item.cbExchange2mAvg ?? 0) > 0, "cbExchange2mAvg", "전체 거래일 종가평균을 입력하세요."); return; }`.
- **대조**: `lib/validators/estate-item-schema.ts:546` · `lib/validators/estate-item-schema.ts:561` · `lib/tax-engine/property-valuation-convertible-bond.ts:170`
- *(리뷰 ID c12-3)*

### IG-045 · §61 경로 A 전환 시 공실 3필드가 남아 숨겨진 채 평가액을 올린다

`[2/2]` · **MAJOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/EstateBodySupplementaryValuation.tsx:194`

- **현상**: 경로 라디오에서 「일괄고시(§61①3호)」로 되돌리면 onChange가 `appurtenantLandStandardPrice`만 undefined로 지운다(:194-196). 그러나 같은 경로 B에서만 입력·표시되는 `totalBuildingArea`(:233-241 게이트), `vacantBuildingArea`·`vacantBuildingStandardPrice`(:92-115, VacancyPortionFields는 :299-303에서 `separateLandMode` 게이트)는 store에 그대로 남는다. 경로 A에서는 이 세 필드의 입력·표시 UI가 전부 언마운트되므로 사용자가 값을 보거나 지울 방법이 없다.
- **근거**: components/calc/inheritance/estate-card/variants/EstateBodySupplementaryValuation.tsx:190-197(경로 전환 시 appurtenantLandStandardPrice만 clear) · :233-241(totalBuildingArea가 separateLandMode 게이트 안) · :299-303(VacancyPortionFields가 separateLandMode 게이트 안) / lib/tax-engine/property-valuation.ts:140-147(calcVacantPortionStandardPrice는 vacantArea>0 && totalArea>0이면 vacantBuildingStd를 무조건 가산) · :168-175(specialValue = rentalValue + calcVacantPortionStandardPrice, amount보다 크면 채택) / lib/calc/estate-item-vacancy-validate.ts:15-31(세 필드가 서로 정합하면 통과 — 경로와 무관)
- **영향**: 경로 B에서 공실 입력을 마친 뒤 경로 A로 되돌린 사용자는, 화면 어디에도 보이지 않는 「미임대분 건물 기준시가」가 §61⑤ 임대료환산 특례액에 계속 더해져 평가액이 과대 산정된다. validate도 통과하므로 경고조차 없다.
- **제안**: `if (!sep)` 분기에서 `appurtenantLandStandardPrice`와 함께 `appurtenantLandArea`·`totalBuildingArea`·`vacantBuildingArea`·`vacantBuildingStandardPrice`도 undefined로 정리한다(경로 A는 토지·건물 일괄 1개 값이라 이 필드들이 의미를 갖지 않는다).
- **대조**: `lib/tax-engine/property-valuation.ts:140` · `lib/tax-engine/property-valuation.ts:170` · `lib/tax-engine/property-valuation.ts:322` · `lib/calc/estate-item-vacancy-validate.ts:19`
- *(리뷰 ID c13-1)*

### IG-046 · 후보 0건 안내가 가리키는 「평가기간 외 목록」이 렌더되지 않는다

`[2/2]` · **MAJOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal.tsx:550`

- **현상**: `status === "empty"` 블록(:540-554)은 `outOfPeriod.length > 0`일 때 「평가기간 외 거래 N건이 있습니다 (위 목록에 표시)」라고 안내한다. 그러나 평가기간 외 거래를 실제로 펼쳐 보여주는 블록(:585-611)은 `status === "ready" && candidates.length > 0` 게이트(:557) 안에 있다. `empty`는 정의상 `ranked.length === 0`(:297-301)이므로 이 게이트가 결코 참이 되지 않는다.
- **근거**: components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal.tsx:548-552(안내 문구) · :557(`{status === "ready" && candidates.length > 0 && (`) · :585-611(평가기간 외 펼침 블록이 그 게이트 내부) · :297-301(ranked 0건 → setStatus("empty")) / lib/calc/rtms-similar-sales-filter.ts:320-323·:329-343(candidates 0건이어도 outOfPeriod는 채워져 반환)
- **영향**: 평가기간 내 사례가 없고 기간 외 사례만 있는 경우 — 즉 참고 거래가 가장 필요한 상황 — 에 사용자는 존재한다고 안내받은 목록을 볼 수 없다. 「위 목록에 표시」는 사실과 다르다.
- **제안**: 평가기간 외 펼침 블록(:585-611)을 후보 리스트 게이트 밖으로 빼서 `outOfPeriod.length > 0`만으로 렌더하거나, empty 상태 문구에서 「위 목록에 표시」를 제거한다.
- **대조**: `lib/calc/rtms-similar-sales-filter.ts:320` · `lib/calc/rtms-similar-sales-filter.ts:342`
- *(리뷰 ID c13-2)*

### IG-047 · 평가기간 외 행은 체크는 켜지지만 평균·채우기에서 침묵 제외된다

`[2/2]` · **MAJOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal.tsx:322`

- **현상**: 평가기간 외 행도 in-period 행과 똑같이 `isSelected`·`onToggle`을 받아 완전히 상호작용 가능하다(:600-605). 그러나 `selectedCandidates`는 `candidates`(기간 내 배열)만 필터하므로(:322) 기간 외 선택은 선택 건수·평균금액·「이 금액으로 채우기」 어디에도 반영되지 않는다. `candidates`와 `outOfPeriod`는 필터에서 서로 배타적인 배열이다.
- **근거**: components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal.tsx:322(`candidates.filter((c) => selectedIds.has(tradeKey(c)))`) · :325-327(selectedAvg) · :596-607(outOfPeriod 행도 onToggle 전달) · :636-648(푸터가 selectedCandidates.length로 표시) / lib/calc/rtms-similar-sales-filter.ts:320-323(isWithinPeriod에 따라 candidates 또는 outOfPeriod 중 한쪽에만 push — 교집합 없음)
- **영향**: 기간 외 행 2건 + 기간 내 행 2건을 고르면 화면엔 체크 4개가 켜져 있는데 푸터는 「선택 2건 평균」을 표시한다. 기간 외만 고르면 체크가 켜져도 버튼이 계속 비활성이고 이유가 표시되지 않는다.
- **제안**: 기간 외 행을 선택 대상에서 제외할 의도라면 `CandidateRow`에 disabled(클릭 불가) 상태를 주고, 포함할 의도라면 `selectedCandidates`를 `[...candidates, ...outOfPeriod]` 기준으로 계산한다. 둘 중 하나를 명시적으로 택해야 한다.
- **대조**: `lib/calc/rtms-similar-sales-filter.ts:320`
- *(리뷰 ID c13-3)*

### IG-048 · 자동선택 경로에서 생년월일 칸이 항상 뜨고 입력값은 엔진에서 무시된다

`[2/2]` · **MAJOR** · B-3중패턴 · `components/calc/inheritance/family-business/FamilyBusinessHeirSelector.tsx:118`

- **현상**: `selectedHeir`는 display fallback인 `effectiveHeirId`가 아니라 store 원값 `heirId`로 조회된다(:55-58). 자연인 상속인이 1명이라 자동선택되는 경로에서는 `heirId`가 undefined이므로 `selectedHeir`가 항상 null이 되고, 그 결과 `:118`의 `!selectedHeir?.birthDate` 조건이 항상 참이 되어 그 상속인이 이미 birthDate를 갖고 있어도 생년월일 DateInput이 노출된다. `:99`의 옵션 설명은 `h.birthDate`를 직접 읽으므로 같은 화면에서 나이가 이미 표시되고 있다.
- **근거**: components/calc/inheritance/family-business/FamilyBusinessHeirSelector.tsx:55-58(selectedHeir가 heirId로 조회) · :73·83(autoSelected/effectiveHeirId) · :118(`effectiveHeirId && !selectedHeir?.birthDate`) · :99(옵션은 h.birthDate 사용) / lib/tax-engine/deductions/inheritance-deductions.ts:369-376(`heirs.find(h => h.id === resolvedHeirId)?.birthDate ?? familyBusiness.heirBirthDate` — Heir.birthDate가 우선) / components/calc/HeirEditor.tsx:61-65(child·lineal_ascendant·sibling·legatee는 birthDate 입력 대상)
- **영향**: 자녀 1명이 가업을 상속하는 가장 흔한 구성에서, 이미 주민번호로 생년월일이 채워졌는데도 「생년월일을 입력하면 18세 자동판정을 수행합니다」라는 칸이 뜬다. 사용자가 여기에 다른 날짜를 넣으면 `heirBirthDate`에 저장되지만 엔진은 Heir.birthDate를 우선하므로 그 입력은 침묵 무시된다.
- **제안**: `selectedHeir`를 `naturalHeirs.find(h => h.id === effectiveHeirId)`로 바꿔 자동선택 경로에서도 실제 상속인을 가리키게 한다(:62 ageLabel도 함께 정상화된다).
- **대조**: `lib/tax-engine/deductions/inheritance-deductions.ts:374` · `lib/tax-engine/deductions/family-business-autoderive.ts:205`
- *(리뷰 ID c13-4)*

### IG-049 · 피상속인 지분 임계 40/20 하드코딩 — 엔진은 상속개시일 시기별

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/family-business/FbDecedentRequirementsSection.tsx:54`

- **현상**: UI는 `const threshold = isListed ? 20 : 40;`으로 상속개시일과 무관하게 임계를 고정하고, 그 값을 소제목(:147), placeholder(:165), 자동판정 산식 문구(:69·76 「지분 45.00% (기준 40%)」)에 쓴다. 반면 미리보기의 판정값 자체는 엔진 `deriveFBDecedentShareholding`(:59)이 계산하며, 엔진은 `getShareThresholdByDate(deathDate, isListed)`로 2011~2022년 상속개시는 비상장 50%/상장 30%, 2010년 이전은 50%/40%를 적용한다.
- **근거**: UI: 본 파일 :54, :69, :76, :147, :165. 엔진 임계표: lib/tax-engine/deductions/family-business-autoderive.ts:120-124(2023-01-01~ 0.4/0.2, 2011-01-01~ 0.5/0.3, 그 이전 0.5/0.4)와 :131-143. 이 헬퍼는 barrel lib/tax-engine/deductions/family-business.ts:50으로 이미 export되어 UI가 import 가능하다. 회귀 테스트도 시기별 값을 고정한다(__tests__/tax-engine/inheritance/family-business-autoderive-p2.test.ts:146-159).
- **영향**: 2022년 이전 상속개시 건에서 화면이 자기모순을 일으킨다. 예: 상속개시 2020-06-01·비상장·지분 45% 입력 시 라벨·산식은 「기준 40%」라 적고 45%를 보여주면서, 미리보기 카드는 rose ✗ 미충족을 표시한다(엔진 임계 50%). 사용자는 무엇이 틀렸는지 알 수 없고, 반대로 40~49% 구간에서 요건을 충족했다고 오해하게 된다.
- **제안**: `getShareThresholdByDate(deathDate, isListed) * 100`을 useMemo로 파생해 threshold 하드코딩을 대체(단일 소스화). 표시용 값과 판정용 값이 같은 함수에서 나오게 한다.
- **대조**: `lib/tax-engine/deductions/family-business-autoderive.ts:120` · `lib/tax-engine/deductions/family-business-autoderive.ts:138` · `lib/tax-engine/deductions/family-business.ts:50`
- *(리뷰 ID c14-3)*

### IG-050 · 최대주주 할증 기업규모가 '중소기업'으로 보이나 store는 미입력

`[2/2]` · **MAJOR** · B-3중패턴 · `components/calc/inheritance/listed-stock/ListedStockBesshiAttributesSection.tsx:211`

- **현상**: 기업 규모 RadioCardGroup이 `value={item.companySize ?? "small"}`로 display fallback을 걸어 미입력 상태에서도 「중소기업」이 선택된 것처럼 렌더된다. 그런데 §63③ 토글 ON 핸들러(:190-201)는 companySize에 기본값을 세팅하지 않고, ⑧validate는 `isMaxShareholder && !companySize`를 하드 차단한다. 같은 파일의 갑지 토글은 반대로 ON 시 `set({ stockClass: "common" })`으로 기본값을 명시 저장해(:132-135, 주석 「기본값 명시 — store/UI/API 3중 일치」) 올바른 관례를 이미 보여준다.
- **근거**: UI display fallback: 본 파일 :211. ON 핸들러가 companySize를 세팅하지 않음: :190-201. validate 차단: lib/calc/inheritance-validate.ts:707-709 「§63③ — 기업 규모 (중소·중견·대기업) 입력 필요」(validateInheritanceTaxInput 안에서 return, :509-511). 대조 관례: 본 파일 :132-135.
- **영향**: 최대주주 토글만 켜고 라디오를 손대지 않은 사용자는 화면상 「중소기업」이 선택돼 보이므로 입력이 끝났다고 판단하지만, 계산 버튼이 「기업 규모 입력 필요」로 영구 차단된다. 화면 어디에도 미선택 표시가 없어 원인을 찾을 수 없다(선택된 것처럼 보이는 옵션을 다시 클릭해야만 해소).
- **제안**: §63③ 토글 ON 시 `companySize: item.companySize ?? "small"`(또는 도메인상 적절한 기본값)을 함께 set해 stockClass와 같은 3중 일치 패턴으로 맞추거나, display fallback을 제거해 미선택이 보이게 한다.
- **대조**: `lib/calc/inheritance-validate.ts:708` · `lib/calc/inheritance-validate.ts:509` · `lib/tax-engine/property-valuation-stock.ts:132`
- *(리뷰 ID c14-4)*

### IG-051 · 직전기 배당률 0을 입력할 수 없는데 validate는 0을 요구

`[2/2 · ½]` · **MAJOR** · A-배관 · `components/calc/inheritance/listed-stock/ListedStockBesshiAttributesSection.tsx:319`

- **현상**: ⑪ 직전기 배당률 onChange가 `parseDecimal(v) || undefined`다. `parseDecimal("0")`은 숫자 0을 반환하고 0은 falsy라 store에는 `undefined`가 저장된다. 반면 ⑧validate는 §63②3호 분기(`isCapitalIncreaseUnlistedShare`)에서 `priorDividendRate == null`이면 「직전기 배당률 입력 필요 (0 허용)」로 차단한다. 즉 메시지가 명시적으로 허용한다고 밝힌 값을 UI가 저장할 수 없다.
- **근거**: UI: 본 파일 :318-320. parseDecimal 구현: components/calc/inputs/DecimalInput.tsx:92-96(빈 문자열·NaN도 0 반환). validate: lib/calc/inheritance-validate.ts:698-700, 게이트 진입 조건 :694. 분기 활성화 경로: 본 파일 :268-282(증자/합병 선택 시 `isCapitalIncreaseUnlistedShare: true` 세팅). 엔진은 0을 정상 수용한다(lib/tax-engine/property-valuation-stock.ts:218 `item.priorDividendRate ?? 0`).
- **영향**: 직전기 무배당 법인의 미상장 신주(§63②3호)를 평가하려는 사용자는 배당률 0을 입력해도 저장되지 않아 계산이 영구 차단된다. 0.0001 같은 허위 값을 넣지 않으면 진행할 수 없고, 그 허위 값은 배당차액 계산에 그대로 반영된다.
- **제안**: `parseDecimal(v) || undefined` → 빈 문자열만 undefined로 보내는 형태(예: `v.trim() === "" ? undefined : parseDecimal(v)`)로 바꿔 0을 보존한다. 같은 카드의 액면가(:313)는 0이 애초에 무효라 무관하다.
- **대조**: `lib/calc/inheritance-validate.ts:698` · `components/calc/inputs/DecimalInput.tsx:92` · `lib/tax-engine/property-valuation-stock.ts:218`
- **½ 정정(code-fact)**: 차단 결함 자체는 그대로 성립한다(직전기 무배당 법인의 §63②3호 미상장 신주는 UI에서 0을 저장할 수 없어 계산이 영구 차단된다). 정정 대상은 「허위 값의 파급」 서술 하나다 — 「그 허위 값은 배당차액 계산에 그대로 반영된다」는 **틀렸다**. priorDividendRate는 배당차액에 도달하지 않는다: dividendDifference·perShareValue는 `applyCapitalIncreaseShareValuation(closingAvg, item.listedStockDividendDifference ?? 0, sameBaseDate)`(property-valuation-stock.ts:240-243)가 **별개 입력 필드**로 산정하고, priorDividendRate는 `priorDividendAmount = Math.floor(faceValuePerShare × priorRate)`(:219)만 만든다. 이 값은 별지 서식 ⑫칸 표시(Page1CoverSection.tsx:178)와 PDF(ListedStockBesshiPdfDocument.tsx:221) 전용 echo이며, 과세표준 경로인 resolve-estate-item-value.ts:70-89은 priorDividendRate를 읽지 않는다. ⇒ 0.0001 같은 허위 값을 넣어도 **세액은 변하지 않고**, 오염은 공식 서식·PDF의 ⑪칸(fmtPct)이 무배당을 0이 아닌 배당률로 표기하는 **표시 정확성 결함**에 그친다(액면가 5,000원 × 0.0001이면 ⑫는 floor(0.5)=0으로 떨어져 ⑫조차 안 움직인다). 제안된 수정(`v.trim() === "" ? undefined : parseDecimal(v)`)은 그대로 유효하다.
- *(리뷰 ID c14-5)*

### IG-052 · 별지9호 PDF가 물납·분납액 인자를 안 받아 화면과 다른 값 출력

`[2/2 · ½]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/filing-form-9/FilingForm9PdfDownloadButton.tsx:57`

- **현상**: 화면 섹션은 `buildFilingForm9Data`를 8인자로 호출해 ㊵ 물납액·㊶ 분납액·⑩ 주소를 채운다(FilingForm9CoverSection.tsx:87). 반면 PDF 버튼은 같은 어댑터를 5인자로만 호출해(`splitPaymentAmount`·`paymentInKindAmount`·`decedentAddress` 누락) ㊵·㊶이 0/대시로 빌드된다. Props 인터페이스(:41-47)에 애초에 그 세 필드가 없어 부모가 값을 넘겨줄 수도 없다(명시 prop 매핑 strip).
- **근거**: PDF 버튼 호출: 본 파일 :56-59, Props :41-47, 부모가 넘기는 5개 prop: FilingForm9CoverSection.tsx:100-106. 어댑터 시그니처 6·7·8번 인자: lib/calc/filing-form-9-data.ts:112-117. 해당 행이 그 인자를 그대로 쓰는 지점: 같은 파일 :206(㊵ `paymentInKindAmount ?? 0`)·:207-214(㊶ `splitPaymentAmount ?? 0`). PDF는 rightRows를 그대로 렌더한다: lib/pdf/InheritanceFilingForm9PdfDocument.tsx:106. 값의 실제 출처: components/calc/results/InheritanceTaxResultView.tsx:414-420.
- **영향**: 사용자가 물납·분납액을 입력하면 화면 별지9호에는 금액이 찍히지만, 같은 화면의 「별지9호 PDF」 버튼으로 받은 파일에는 ㊵·㊶이 대시로 비어 나온다. 제출용 서식 두 벌이 서로 다른 납부방법을 말하게 된다(단일 어댑터로 dual-truth를 막겠다는 파일 헤더 주석의 전제가 깨진다).
- **제안**: PDF 버튼 Props에 `splitPaymentAmount`·`paymentInKindAmount`(필요 시 `decedentAddress`)를 추가하고 화면 섹션이 그대로 전달하도록 한다. useMemo 의존배열에도 함께 넣는다.
- **대조**: `components/calc/inheritance/filing-form-9/FilingForm9CoverSection.tsx:87` · `components/calc/inheritance/filing-form-9/FilingForm9CoverSection.tsx:100` · `lib/calc/filing-form-9-data.ts:112` · `lib/calc/filing-form-9-data.ts:206` · `components/calc/results/InheritanceTaxResultView.tsx:415`
- **½ 정정(rule-impact)**: 핵심 주장(㊵ 물납액·㊶ 분납액이 화면과 PDF에서 갈린다)은 실측으로 그대로 성립한다. 다만 ⑩ 피상속인 주소는 **출력 괴리를 만들지 않는다** — PDF Document가 `data.decedentAddressText`를 아예 렌더하지 않기 때문이다(InheritanceFilingForm9PdfDocument.tsx:68-91의 metaRow는 ①②⑤⑦⑧⑫+신고기한만 출력). 따라서 8번째 인자 `decedentAddress`를 넘겨도 PDF는 변하지 않는다. 정정된 주장: 「PDF 버튼이 6·7번째 인자(`splitPaymentAmount`·`paymentInKindAmount`)를 안 받아 ㊵·㊶이 화면과 다르게(대시로) 출력된다. ⑩ 주소는 인자 누락이긴 하나 PDF에 렌더 지점 자체가 없어 현시점 영향은 0 — 수정 시 함께 넘기는 것은 무해하나 그것만으로 ⑩이 채워지진 않는다(PDF metaRow 추가가 별건으로 필요).」

실측 근거:
- 화면 섹션은 8인자 호출(FilingForm9CoverSection.tsx:87), PDF 버튼은 5인자 호출(FilingForm9PdfDownloadButton.tsx:57). Props 인터페이스(:41-47)에 세 필드 없음 → 부모(:100-106)가 넘길 경로 자체가 없음. 확인.
- 어댑터에서 그 인자를 소비하는 지점 확인: filing-form-9-data.ts:206 `amtRow("㊵", paymentInKindAmount ?? 0, "right")` → `amtRow`(:71-86)가 `amount > 0`가 아니면 `display:"dash"`. :207-214 ㊶도 `splitPaymentAmount && >0 ? "amount" : "dash"`. ⇒ 인자 누락 시 둘 다 "—".
- PDF가 rightRows를 그대로 렌더: InheritanceFilingForm9PdfDocument.tsx:106 `data.rightRows.map(...)`, CalcRow(:33-56)가 `display==="dash"`면 "—" 출력. ⇒ 괴리가 실제 산출물에 나타남.
- 값 도달 가능성 확인(가상 시나리오 아님): InheritanceTaxResultView.tsx:415-420이 `paymentInKindFilingAmount`(useInheritanceResultDerived.ts:112-130 — `calcPaymentInKindAssessment` 실계산)와 `parseAmount(splitPaymentAmount)`를 화면 섹션에만 전달. 플래그는 사용자 입력에서 옴(InheritanceTaxForm.tsx:496·501·503).
- 「의도된 설계」 반증 시도 실패: 오히려 PDF Document 헤더 주석(:5-7)이 "단일 출처: 화면과 동일 buildFilingForm9Data 결과(data) 소비 … dual-truth 0"을 명시해 이 5인자 호출이 그 전제를 깬다. 형제 경로도 관례가 아니라 같은 결함이다 — lib/pdf/inheritance-besshi-pages.tsx:69가 3인자로만 호출해 통합 결과 PDF에서도 ㊵·㊶이 대시다(반증이 아니라 결함 확대).
- 반대 정황 1건(심각도 완화 요인이나 결함 부정은 못 함): 화면 섹션 하단 :245 각주가 "※ 식별정보…·납부방법 금액은 자동 산출되지 않습니다 — 인쇄 후 수기 작성"이라 적혀 있다. 그러나 2026-06-05 `c6cc5fe8`(분납 §70② 연동)로 화면은 실제로 ㊵·㊶을 채우게 됐으므로 이 각주는 화면 기준으로 이미 stale이다. 「PDF는 일부러 비워 수기 작성하게 둔 것」이라는 방어는 화면이 채운다는 사실과 PDF 헤더 주석의 단일출처 선언 앞에서 성립하지 않는다.
- *(리뷰 ID c14-6)*

### IG-053 · 평가액 미리보기가 평가기준일 미전달 — §53⑧2호 배제를 못 본다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/listed-stock/ListedStockValuationPreviewCard.tsx:42`

- **현상**: evaluateListedStock(item, {}) 로 호출해 context.valuationDate 를 넘기지 않는다. 엔진 resolveListedPremiumRate 는 premiumExclusionReason 이 all_sold_within_6m 일 때 toOptionalDate(valuationDate) 가 undefined 면 게이트를 돌리지 않고 exclusionEffective 를 none 으로 무효화한 뒤(failReason=missing_input) companySize==='large' 분기로 떨어져 premiumRate 0.2 를 반환한다. 같은 편집 화면의 형제 카드 ListedStockBesshiPreviewCard.tsx:41 은 { valuationDate } 를 전달한다.
- **근거**: components/calc/inheritance/listed-stock/ListedStockValuationPreviewCard.tsx:42 · 형제 ListedStockBesshiPreviewCard.tsx:41 · 엔진 lib/tax-engine/property-valuation-stock.ts:108-126, 137-139 · 렌더 지점 components/calc/inheritance/stock/StockItemEditor.tsx:221(전달)과 :298(미전달, valuationDate 는 같은 스코프에 있음)
- **영향**: 최대주주·대기업 + §53⑧2호 배제를 선택하고 요건(전부매각·§49①1호·기간)을 충족한 사용자에게, 같은 화면의 평가조서(갑) 미리보기 ⑩은 할증 없는 1주당 가액을, 평가액 미리보기는 ×1.2 한 1주당 가액과 총 평가액을 동시에 보여준다. 할증 배제 사유 안내(:105)도 평가액 미리보기에서만 사라진다.
- **제안**: Props 에 valuationDate?: string 를 추가하고 evaluateListedStock(item, { valuationDate }) 로 호출, StockItemEditor.tsx:298 에서 형제 카드와 동일하게 전달. (같은 누락이 lib/tax-engine/valuation/resolve-estate-item-value.ts:76 에도 있어 실제 세액 경로까지 어긋난다 — 청크 밖이지만 함께 확인 필요)
- **대조**: `lib/tax-engine/property-valuation-stock.ts:108` · `lib/tax-engine/property-valuation-stock.ts:137` · `lib/tax-engine/valuation/resolve-estate-item-value.ts:76` · `components/calc/inheritance/stock/StockItemEditor.tsx:298`
- *(리뷰 ID c15-1)*

### IG-054 · §53⑧2호 게이트 실패 라벨이 어느 화면에도 표시되지 않는다

`[2/2]` · **MAJOR** · A-배관 · `components/calc/inheritance/listed-stock/besshi/Page1CoverSection.tsx:224`

- **현상**: 갑지는 page1Values.premiumExclusionLabel 만 렌더한다. 엔진은 같은 객체에 section53_8_2FailLabel(SECTION_53_8_2_FAIL_LABELS 의 out_of_period·not_all_sold·not_normal_transaction 문구)을 함께 echo 하고 타입에도 선언돼 있으나, 저장소 전체에서 이 필드를 읽는 UI 가 0건이다. 엔진이 warnings 배열에도 담지만 evaluateListedStock 을 부르는 4개 호출부(ListedStockBesshiResultSection.tsx:57, 두 미리보기 카드, PDF) 모두 result.warnings 를 읽지 않는다.
- **근거**: components/calc/inheritance/listed-stock/besshi/Page1CoverSection.tsx:224-231 (premiumExclusionLabel 만) · 엔진 lib/tax-engine/property-valuation-stock.ts:196-199, 334-336, 388-390 · 타입 lib/tax-engine/types/listed-stock-valuation.types.ts:141 · 라벨 lib/tax-engine/data/stock-premium-exclusion-labels.ts:44-53 (주석: 결과 rose tone·warnings 용) · grep 결과 소비자 0건
- **영향**: 사용자가 §53⑧2호 배제를 선택하고 매매계약일을 넣었지만 기간 밖(상속 ±6월 / 증여 전6·후3월)이면, ⑧validate(inheritance-validate.ts:716-720)는 날짜 존재만 보므로 통과하고 엔진은 20% 할증을 적용한다. 화면에는 배제 사유도, 배제가 거부된 이유도 전혀 나오지 않아 왜 ⑩이 120%인지 알 수 없다.
- **제안**: Page1CoverSection 의 :224 블록 옆에 page1Values.section53_8_2FailLabel 이 있으면 별도 안내(rose 톤)로 렌더. 형제 결과뷰 ListedStockBesshiResultView 도 동일 슬롯 필요.
- **대조**: `lib/tax-engine/property-valuation-stock.ts:196` · `lib/tax-engine/types/listed-stock-valuation.types.ts:141` · `lib/calc/inheritance-validate.ts:716` · `components/calc/results/ListedStockBesshiResultSection.tsx:57`
- *(리뷰 ID c15-2)*

### IG-055 · 협의분할 모드 진입이 봉안비만 안 지워 숨겨진 값이 계속 공제된다

`[2/2 · ½]` · **MAJOR** · F-도달가능성 · `components/calc/inheritance/steps.tsx:177`

- **현상**: enterAllocationMode 는 funeralExpense·funeralIncludesBongan·debts 세 legacy 필드를 빈 값으로 되돌리지만 funeralBonganExpense 는 건드리지 않는다. 그런데 UI 는 isAllocationMode(:220) 게이트로 봉안비 입력칸(:247)을 통째로 언마운트한다. 엔진은 input.debtItems.length > 0 일 때만 신규 경로를 타고, debtItems===[] 이면 legacy 분기로 내려가 funeralBonganExpense 를 그대로 §9②2호 공제에 쓴다.
- **근거**: components/calc/inheritance/steps.tsx:177-184 (3필드만 클리어) · :220 렌더 게이트 · :247 봉안비 입력칸 · 엔진 분기 lib/tax-engine/inheritance-tax-estate-steps.ts:79, 113-118 · 전달 경로 lib/calc/inheritance-api.ts:75 · app/api/calc/inheritance/route.ts:77 · 산식 lib/tax-engine/inheritance-gift-common.ts:551-557
- **영향**: 봉안비를 먼저 입력한 뒤 협의분할 모드를 켜면 그 칸은 화면에서 사라지는데, 항목을 아직 추가하지 않은 상태(debtItems=[])로 계산하면 최대 500만원이 계속 차감된다. 화면 어디에도 그 금액의 입력·표시 경로가 없어 사용자가 확인·수정할 수 없다. 모드를 다시 끄면 일반 장례비는 지워졌는데 봉안비만 되살아나 비대칭 상태가 된다.
- **제안**: enterAllocationMode 의 set() 에 funeralBonganExpense: "" 를 추가해 나머지 legacy 장례비 필드와 동일하게 처리.
- **대조**: `lib/tax-engine/inheritance-tax-estate-steps.ts:79` · `lib/tax-engine/inheritance-tax-estate-steps.ts:113` · `lib/calc/inheritance-api.ts:75` · `app/api/calc/inheritance/route.ts:77`
- **½ 정정(rule-impact)**: 결함 본체(누락된 클리어 → debtItems===[] 상태에서 legacy 분기로 stale 봉안비 최대 500만원 계속 공제)와 제안(enterAllocationMode에 funeralBonganExpense: "" 추가)은 전부 성립한다. 다만 영향 서술 중 「화면 어디에도 그 금액의 입력·표시 경로가 없어 사용자가 확인·수정할 수 없다」는 절반만 맞다 — 입력·수정 경로는 실제로 없지만(모드 ON 중 :247 칸이 언마운트), 표시 경로는 두 곳에 있다: (1) 사이드바가 같은 legacy 분기를 재현해(lib/stores/inheritance-summary.ts:172-177) InheritanceSidebar.tsx:88-94의 「− 채무·공과·장례」 + 부라벨 「장례 한도 적용 {funeralApplied}」에 합산 반영되고, (2) 결과 화면 breakdown에는 inheritance-gift-common.ts:577-593이 「봉안시설·자연장지 비용 지출액 / 공제액(한도 500만)」 행을 항목별로 내보낸다. 즉 완전히 침묵하는 것이 아니라 「보이지만 그 화면에서 고칠 수 없는」 상태다. 「모드를 다시 끄면 봉안비만 되살아나 비대칭」은 정확하며, 그것이 사실상 유일한 정정 수단이다.
- *(리뷰 ID c15-3)*

### IG-056 · §63②3호 토글이 unlistedShareMode를 안 써서 validate가 숨은 칸을 요구한다

`[2/2]` · **MAJOR** · A-배관 · `components/calc/inheritance/stock/StockItemEditor.tsx:249`

- **현상**: StockItemEditor의 §63②3호 ToggleCard는 `set({ isCapitalIncreaseUnlistedShare: v || undefined, ... })`로 엔진 플래그만 쓴다. 같은 모달 위쪽 ListedStockBesshiAttributesSection은 1주당 액면가·직전기 배당률·배당기산일 입력 패널을 `unlistedMode !== "none"`으로 게이팅하는데, 그 `unlistedMode`는 `item.unlistedShareMode`(+레거시 날짜)에서만 파생하고 `isCapitalIncreaseUnlistedShare`는 보지 않는다. 타입 주석은 `unlistedShareMode`를 「라디오 value·패널 가시성 게이트·엔진 플래그의 단일 출처」로 선언한다.
- **근거**: StockItemEditor.tsx:249-254 (set 호출) · ListedStockBesshiAttributesSection.tsx:107-114(unlistedMode 파생)·:289(패널 게이트) · inheritance-gift-estate.types.ts:160-174(단일 진실 선언) · inheritance-validate.ts:696(액면가 필수)·:509(차단 호출)
- **영향**: 이 토글만 켜면 `isCapitalIncreaseUnlistedShare=true` + `unlistedShareMode=undefined`가 되어 액면가·배당률 입력 패널이 렌더되지 않는데, validateListedStockBesshi가 「1주당 액면가 입력 필요」로 상속세 계산 전체를 차단한다. 오류 메시지가 가리키는 칸이 화면에 없어 사용자는 갑지 섹션의 라디오를 따로 찾아 「증자」를 선택해야만 빠져나올 수 있다. 반대로 토글을 끄면 unlistedShareMode는 그대로 남아 라디오는 「증자」, 토글은 OFF로 같은 플래그가 모순 표시된다.
- **제안**: 토글의 onCheckedChange에서 `unlistedShareMode`도 함께 쓰거나(`v ? "capital_increase" : "none"`), 갑지 라디오와 중복되는 이 토글을 제거하고 배당차액·§18② 단서 입력만 `unlistedMode !== "none"` 아래로 옮긴다.
- **대조**: `lib/calc/inheritance-validate.ts:696` · `lib/calc/inheritance-validate.ts:509` · `lib/tax-engine/types/inheritance-gift-estate.types.ts:174` · `components/calc/inheritance/listed-stock/ListedStockBesshiAttributesSection.tsx:107` · `components/calc/inheritance/listed-stock/ListedStockBesshiAttributesSection.tsx:289`
- *(리뷰 ID c16-1)*

### IG-057 · 평가심의위 토글 ON 기본값 0이 Zod positive()에 걸려 계산 전체가 400

`[2/2]` · **MAJOR** · A-배관 · `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeToggle.tsx:40`

- **현상**: 토글 ON 시 DEFAULT_INPUT을 주입하는데 taxpayerPerShareValuation이 0이다(EvaluationCommitteeToggle.tsx:38~43·60). 신청 평가액은 선택 입력처럼 보이며(hint만 있고 required 표시 없음, :159~170) 사용자가 비운 채 진행할 수 있다. 반면 ⑫ Zod는 z.number().positive()로 필수·양수를 강제한다.
- **근거**: components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeToggle.tsx:40 (taxpayerPerShareValuation: 0) · lib/validators/unlisted-stock-valuation-v2.schema.ts:219 · `grep -rn evaluationCommittee lib/calc/` 결과 0건 — ⑧ validate에 검사 없음(lib/calc/inheritance-validate-unlisted.ts 전문 확인)
- **영향**: UI·⑧ validate는 통과시키고 서버 Zod만 거부한다. 자산 1건의 선택 옵션을 켰다는 이유로 상속세 계산 전체가 400으로 실패하며, 오류가 필드 단위 안내 없이 Zod path(evaluationCommittee.taxpayerPerShareValuation)로만 나온다. §54⑥은 계산에 영향 없는 참고 항목인데 계산 자체를 막는다.
- **제안**: inheritance-validate-unlisted.ts에 v2.evaluationCommittee가 있으면 taxpayerPerShareValuation > 0을 요구하는 규칙을 추가한다(method === "other" + methodNotes 공백에 대한 schema:346~354 superRefine도 같은 짝이 없다).
- **대조**: `lib/validators/unlisted-stock-valuation-v2.schema.ts:219` · `lib/validators/unlisted-stock-valuation-v2.schema.ts:346` · `lib/calc/inheritance-validate-unlisted.ts:210`
- *(리뷰 ID c17-2)*

### IG-058 · 평가심의위 신청 기한 카운트다운이 신고기한 자체를 기한으로 표시

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeResultCard.tsx:129`

- **현상**: 카드가 "평가심의위 신청 기한 (상속세 신고기한 준용)"이라는 라벨로 D-N을 표시하고, 기한값은 inheritanceApplicationDeadline(=상속개시월 말일+6개월) / giftApplicationDeadline(=증여월 말일+3개월), 즉 §67·§68 신고기한 그 자체다(EvaluationCommitteeResultCard.tsx:53~61·128~141). 상증령 §49의2⑤ 본문은 "법 제67조에 따른 상속세 과세표준 신고기한 만료 4개월 전(증여의 경우에는 법 제68조에 따른 증여세 과세표준 신고기한 만료 70일 전)까지 신청해야 한다"이다.
- **근거**: components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeResultCard.tsx:53-61·129-141 · lib/calc/evaluation-committee-deadline.ts:23-34 (헤더 주석이 "일반적으로 신고기한과 동일"이라는 미검증 전제를 명시) · 상증령 §49의2⑤ 본문 (KoreanLaw MCP, 시행 20260227, MST 283637)
- **영향**: 상속은 실제 신청기한보다 4개월, 증여는 70일 늦은 날짜를 D-N으로 보여준다. 사용자가 이 카운트다운을 믿고 기다리면 §54⑥ 신청 자체가 불가능해진다. 같은 화면에 함께 뜨는 EvaluationCommitteeFilingGuideCard는 "신청 4개월 이내"라고 적어(:50~53) 두 카드가 서로 다른 기한을 말한다.
- **제안**: inheritanceApplicationDeadline/giftApplicationDeadline은 신고기한 계산으로 남기고, 신청기한은 신고기한 − 4개월(상속) · 신고기한 − 70일(증여)로 별도 산출해 카드에 쓴다. 통지기한(§49의2⑥ 신고기한 만료 1개월 전 / 20일 전)도 같은 기준으로 파생한다.
- **대조**: `lib/calc/evaluation-committee-deadline.ts:23` · `lib/calc/evaluation-committee-deadline.ts:31` · `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeFilingGuideCard.tsx:50`
- *(리뷰 ID c17-3)*

### IG-059 · 보험법인 토글이 useState 로컬 캐시라 이력 자동채움 후 OFF로 남는다

`[2/2]` · **MAJOR** · B-3중패턴 · `components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx:115`

- **현상**: 보험 3필드 표시 여부를 useState(insuranceHasValue)로 마운트 시점에만 초기화한다(:111~115). 이력 조회 모달이 netAssetValueRaw를 통째로 교체해도(candidateToUnlistedStockInput가 보험 3필드 포함 — unlisted-stock-valuation-lookup.ts:478) 컴포넌트는 key 없이 같은 위치에 유지되어 재마운트되지 않으므로 토글은 OFF로 남는다. ToggleCard는 checked일 때만 children을 렌더한다(ToggleCard.tsx:303).
- **근거**: components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx:111-115·258-315 · lib/calc/unlisted-stock-valuation-lookup.ts:478 (netAssetValueRaw 통째 전달) · __tests__/calc/unlisted-stock-valuation-lookup.test.ts:272-278 (insuranceReservePolicy가 partial에 실림을 단언) · components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:342-346 (key 없음)
- **영향**: 이력에서 보험법인을 불러오면 책임준비금 등이 ⑲ 부채총액 미리보기(:158~160)와 엔진(net-asset-calc.ts:77~79) 양쪽에 계속 가산되는데, 화면의 보험법인 토글은 OFF이고 금액 칸은 보이지도 않는다. 사용자가 확인하려고 토글을 ON→OFF 하면 toggleInsuranceCompany가 3필드를 undefined로 지워(:117~128) 값이 소실된다. 같은 저장소가 이 안티패턴을 이미 High로 판정해 mergerBlock을 useMemo derive로 바꿨다.
- **제안**: insuranceCompanyOpen을 로컬 state 대신 netAssetValueRaw에서 파생(useMemo)하거나, 사용자 override가 필요하면 override 여부만 state로 두고 파생값과 OR 한다 — UnlistedStockV2Card.tsx:138~144의 mergerBlock 패턴과 동일하게.
- **대조**: `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:136` · `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:342` · `lib/calc/unlisted-stock-valuation-lookup.ts:478` · `lib/tax-engine/property-valuation/net-asset-calc.ts:77` · `components/calc/inputs/ToggleCard.tsx:303`
- *(리뷰 ID c17-4)*

### IG-060 · 총액 모드 평가차액 입력이 음수를 못 받아 부호가 조용히 반전된다

`[2/2]` · **MAJOR** · B-3중패턴 · `components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable.tsx:334`

- **현상**: `assetValuationDelta`는 저장소 전체가 부호 있는 필드로 선언한다 — Zod `assetValuationDelta: z.number()`(schema:107), 형제 NetAssetCalculationTable의 SIGNED_NET_ASSET_KEYS 주석은 "음수(△유보·평가차손…)가 정상값인 순자산 필드"라며 이 키를 첫 줄에 넣고 `allowNegative`를 켠다(:23-27, :209). 같은 파일의 행 모드도 음수 차액을 △로 렌더한다(:202·:281·:314). 그런데 총액 fallback CurrencyInput(:334-340)만 `allowNegative`를 넘기지 않는다. CurrencyInput은 기본값에서 `e.target.value.replace(/[^0-9]/g,"")`로 `-`를 제거해 onChange를 부르고(:95-97), `toRawDigits(value,false)`가 표시값의 `-`도 지운다(:37-43).
- **근거**: components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable.tsx:334-340 · components/calc/inputs/CurrencyInput.tsx:37-43,95-97 · components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx:23-27,209 · lib/validators/unlisted-stock-valuation-v2.schema.ts:107
- **영향**: 평가차손(장부가 > 상증법 평가액)을 총액 모드로 입력할 수 없다. 사용자가 "-91,548,350"을 치면 저장값은 +91,548,350이 되어 순자산가액이 차액의 2배만큼 과대 계상된다. 섹션 6에서 이미 음수로 넣어둔 값도 이 칸에는 양수로 보여, 사용자가 그대로 재확인·재입력하면 부호가 뒤집힌다.
- **제안**: `allowNegative`를 붙이고 파싱을 형제와 같이 `parseAmount(v)`로 통일한다.
- **대조**: `lib/validators/unlisted-stock-valuation-v2.schema.ts:107` · `components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx:23` · `components/calc/inputs/CurrencyInput.tsx:95`
- *(리뷰 ID c18-1)*

### IG-061 · 행 모드 토글 OFF가 확인 없이 입력 행을 전부 삭제한다

`[2/2]` · **MAJOR** · F-도달가능성 · `components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable.tsx:110`

- **현상**: `toggleInputMode(false)`가 `onRowsChange([])`로 자산 50행·부채 30행까지의 계정과목별 입력을 즉시 파기한다. 확인 Dialog가 없다. 같은 디렉터리의 데이터 파기형 토글 3개는 모두 확인 Dialog를 둔다 — PreIpoListingToggle(:104-115,:249-276), EstimatedProfitToggle(:13,:380), EvaluationCommitteeToggle(:9,:206). 또한 삭제 시 `onFallbackChange`가 호출되지 않아 `assetValuationDelta`는 행 입력 이전 값(기본 0) 그대로 남는다.
- **근거**: components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable.tsx:105-114 (onRowsChange([]) 단독 호출, onFallbackChange 미호출) · 형제 확인 Dialog: PreIpoListingToggle.tsx:249, EstimatedProfitToggle.tsx:380, EvaluationCommitteeToggle.tsx:206
- **영향**: 토글을 잘못 눌러 되돌릴 방법이 없다(재토글하면 빈 행 2개만 생성). 동시에 엔진이 쓰는 ② 평가차액이 행 합계에서 stale 총액(대개 0)으로 조용히 떨어져 순자산가액·1주당 평가액·세액이 바뀐다.
- **제안**: 형제 3개와 동일하게 `hasRows`일 때 폐기 확인 Dialog를 거치도록 하거나, 최소한 OFF 전에 계산된 평가차액을 fallback 총액으로 이월한다.
- **대조**: `components/calc/inheritance/unlisted-stock-v2/PreIpoListingToggle.tsx:249` · `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeToggle.tsx:206`
- *(리뷰 ID c18-2)*

### IG-062 · 별지 2쪽 「다」가 §55① 후단 0 하한을 빼먹어 다+라 ≠ 마

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable.tsx:41`

- **현상**: `preGoodwill = assetSubtotal - liabilitySubtotal`을 그대로 「다」 행에 그린다. 엔진 `calcNetAssetTotal`은 같은 값에 `Math.max(0, raw)`를 적용해 `netAssetBeforeGoodwill`을 만들고(net-asset-calc.ts:85-86), orchestrator는 `netAssetTotal = netAssetBeforeGoodwill + goodwillFinal`로 「마」를 만든다(unlisted-orchestrator.ts:267). 「마」는 이 엔진 값을 prop으로 받는다(Page2NetAssetTable.tsx:91).
- **근거**: components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable.tsx:41,89,91 · lib/tax-engine/property-valuation/net-asset-calc.ts:85-86 · lib/tax-engine/property-valuation/unlisted-orchestrator.ts:267
- **영향**: 자산총액 < 부채총액인 법인에서 인쇄·PDF 별지가 「다」에 음수를, 「마」에 0을 찍는다. 서식 라벨이 명시한 항등식 「마. 순자산가액 = 다 + 라」가 화면에서 깨지고, 「다」는 엔진이 실제로 쓰지 않은 값이라 신고서 재현이 틀린다.
- **제안**: 「다」도 엔진과 동일하게 0 하한을 적용해 표시하거나(또는 `netAssetBeforeGoodwill`을 prop으로 받아 그린다), 0 처리 발동 시 `zeroFloorApplied` 근거 주석 행을 붙인다.
- **대조**: `lib/tax-engine/property-valuation/net-asset-calc.ts:85` · `lib/tax-engine/property-valuation/unlisted-orchestrator.ts:267`
- *(리뷰 ID c18-3)*

### IG-063 · currentClientId가 부모에서 안 넘어와 세무사 모드에서 이력 조회가 항상 0건

`[2/2]` · **MAJOR** · A-배관 · `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:127`

- **현상**: `currentClientId = null` 기본값을 그대로 UnlistedStockHistoryModal에 넘긴다. 유일한 렌더 지점인 StockItemEditor는 `input·onChange·valuationDate·taxKind`만 전달하고 `currentClientId`를 넘기지 않는다(StockItemEditor.tsx:462-467). 한편 이력 레코드는 `clientId: activeClientId`로 저장되고(InheritanceTaxForm.tsx:132,164), 필터는 `record.clientId !== currentClientId`인 레코드를 `different_client`로 전부 걸러낸다(unlisted-stock-valuation-lookup.ts:326-333).
- **근거**: components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:107-108,127-128,275 · components/calc/inheritance/stock/StockItemEditor.tsx:461-467 · lib/calc/unlisted-stock-valuation-lookup.ts:326-333 · components/calc/InheritanceTaxForm.tsx:132,164
- **영향**: 세무사 모드(activeClientId 있음)에서 저장한 비상장주식 평가는 그 의뢰인으로 다시 들어가도 후보가 0건이 되어 "저장된 비상장주식 평가 이력이 없습니다"만 뜬다. PR-H 이력 자동조회가 세무사 모드에서 전혀 동작하지 않는다.
- **제안**: StockItemEditor가 `useProfessionalStore`의 `activeClientId`를 `currentClientId`로 전달한다(같은 파일의 다른 폼들이 이미 하는 방식).
- **대조**: `components/calc/inheritance/stock/StockItemEditor.tsx:462` · `lib/calc/unlisted-stock-valuation-lookup.ts:326` · `components/calc/InheritanceTaxForm.tsx:132`
- *(리뷰 ID c18-4)*

### IG-064 · §53의2 칸이 관계 변경으로 사라져도 값이 남아 validate가 영구 차단

`[2/2 · ½ · 강등 BLOCKER→MAJOR]` · **MAJOR** · A-배관 · `components/calc/prior-gift/GiftRowEditor.tsx:509`

- **현상**: §53의2 입력 카드는 `showIsHeir && isInheritancePriorGiftMarriageBirthEligible(gift.doneeRelation)` 게이트 안에만 있다(:508-509). 그런데 doneeRelation을 바꾸는 두 경로 — 수동 관계 select `handleManualRelationChange`(:177-179)와 수증자 select `handleDoneeSelect`(:154-160, deriveDoneeRelationFromHeir가 배우자→"spouse"·수유자/법인→undefined) — 어디도 `marriageBirthDeduction`을 정리하지 않는다. 값이 store에 남은 채 카드만 언마운트된다.
- **근거**: components/calc/prior-gift/GiftRowEditor.tsx:508-509(게이트)·177-179·154-160(관계 변경 write site, marriageBirthDeduction 미정리) / lib/calc/inheritance-validate.ts:271-272 → lib/calc/prior-gift-marriage-birth-rule.ts:49·55-57 (marriageBirthDeduction != null 이고 비적격 관계면 문자열 반환) / lib/calc/inheritance-validate.ts:499-502 (사전증여 전건 루프에서 첫 오류로 return)
- **영향**: 직계비속으로 §53의2 금액을 입력한 뒤 관계를 배우자·수유자·영리법인으로 바꾸면 「§53의2는 피상속인의 직계비속(자녀 등)이 받은 사전증여에만 적용됩니다.」로 계산이 차단되는데, 그 값을 지울 입력칸이 화면에서 사라진 뒤다. 그 행을 삭제하고 새로 만들지 않는 한 상속세 계산을 진행할 수 없다.
- **제안**: handleManualRelationChange·handleDoneeSelect의 patch에 `...(isInheritancePriorGiftMarriageBirthEligible(rel) ? {} : { marriageBirthDeduction: undefined })`를 추가해 게이트가 닫힐 때 값도 함께 정리한다(§30 라디오가 :612-614에서 priorSpecialTaxPaid를 정리하는 형제 관례와 동일).
- **대조**: `lib/calc/inheritance-validate.ts:265-272` · `lib/calc/inheritance-validate.ts:499-502` · `lib/calc/prior-gift-marriage-birth-rule.ts:49` · `lib/calc/prior-gift-marriage-birth-rule.ts:55-57` · `lib/validators/prior-gift-schema.ts:124-131`
- **½ 정정(code-fact)**: doneeRelation을 §53의2 비적격 값(spouse·other_relative·lineal_ascendant_* / 수유자·영리법인 선택 시 undefined)으로 바꾸면 §53의2 카드만 언마운트되고 `marriageBirthDeduction`은 store에 남아, client validate(inheritance-validate.ts:271-272)와 server Zod(prior-gift-schema.ts:123-131)가 「§53의2는 피상속인의 직계비속(자녀 등)이 받은 사전증여에만 적용됩니다.」로 계산을 차단한다 — 화면에는 그 값을 지울 입력칸이 없다. 다만 "영구 차단·행 삭제 외 방법 없음"은 아니다: 관계를 직계비속으로 되돌리면 칸이 복귀해 지울 수 있고(행에는 §53의2 배지도 계속 표시된다), 회복이 사실상 파괴적인 것은 `giftTaxBase`가 입력된 행뿐이다(관계를 되돌려도 ⓘ 안내만 나와, 과세표준 산정 방식을 "자동"으로 되돌려 giftTaxBase를 버려야 칸이 나온다). 수정 제안(두 handler patch에 비적격 시 `marriageBirthDeduction: undefined` 추가, §30 라디오 :613-614 관례 동일)은 그대로 유효하다.
- *(리뷰 ID c19-1)*

### IG-065 · 영리법인 수증자를 고르면 과세표준이 지워지는데 manual 모드 플래그는 남는다

`[2/2 · ½]` · **MAJOR** · A-배관 · `components/calc/prior-gift/GiftRowEditor.tsx:479`

- **현상**: `computeTaxPatch`는 beneficiaryType이 "corporate"가 되면 `giftTaxBase: undefined`를 쓴다(:107-113). `handleDoneeSelect`는 영리법인 Heir 선택 시 이 patch를 그대로 적용한다(:154-160). 그러나 `priorGiftTaxBaseInputMode`는 손대지 않고, GiftTaxBaseModeBlock은 `showIsHeir && !isCorporate` 게이트라(:479) 그 순간 언마운트된다.
- **근거**: components/calc/prior-gift/GiftRowEditor.tsx:104-116(corporate 분기에서 giftTaxBase: undefined)·154-160(선택 시 적용)·479(블록 게이트) / components/calc/prior-gift/GiftTaxBaseModeBlock.tsx:69-82(giftTaxBase 입력칸이 이 블록 안에만 존재) / lib/calc/inheritance-validate.ts:274-280 (mode=="manual" 이고 giftTaxBase == null 이면 차단) / lib/calc/prior-gift-donee-derive.ts:56-62 (corporate 파생)
- **영향**: 「직접 입력」 모드로 증여 과세표준을 넣은 뒤 수증자를 영리법인으로 바꾸면 「직접 입력 모드: 증여 과세표준을 입력하세요 (증여세 신고서 과세표준 ⑤).」로 차단되는데, 과세표준 입력칸도 모드 라디오도 화면에서 사라진 뒤라 되돌릴 수 없다(세액 입력란을 직접 수정한 적이 있어 userTouchedTax가 true면 발생하지 않음).
- **제안**: computeTaxPatch의 corporate 분기에서 `giftTaxBase`를 지울 때 `priorGiftTaxBaseInputMode: undefined`도 함께 지워, 모드 플래그와 값이 항상 같은 층에서 정리되게 한다.
- **대조**: `lib/calc/inheritance-validate.ts:274-280` · `lib/calc/prior-gift-donee-derive.ts:56-62` · `components/calc/prior-gift/GiftTaxBaseModeBlock.tsx:69-82`
- **½ 정정(rule-impact)**: 결함·제안은 그대로 성립한다(정정 없음). 영향 서술 한 구절만 정정: 「되돌릴 수 없다」가 아니라 「그 상태 화면에는 되돌릴 수단이 없다」이다. 수증자를 다른 비영리법인 상속인으로 바꾸면 beneficiaryType이 갱신되어(:157) 블록이 다시 나타나 auto로 복귀한 뒤 영리법인을 재선택할 수 있다 — 다만 「선택 안 함」(:144-148)은 doneeId만 지우고 beneficiaryType을 corporate로 남기므로 블록이 계속 숨겨진 채 「doneeId 필수」로 오류만 바뀐다. 즉 복구 경로가 존재하되 비직관적이며, 오류 메시지가 가리키는 입력칸이 화면에 없다는 점은 그대로다. 추가로, 스테일 플래그는 PriorGiftTableView 배지(prior-gift-badges.ts:52)에도 「과세표준 직접입력」으로 노출된다.
- *(리뷰 ID c19-3)*

### IG-066 · 증여세 모드 「수증자」 칸이 증여자 관계를 보여주고, donor는 표에 없다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/prior-gift/PriorGiftTableView.tsx:71`

- **현상**: 증여세 모드 분기는 `DONOR_RELATION_LABELS[gift.doneeRelation]`만 「수증자」 칸(헤더 :220)에 넣는다(:69-74). 그런데 증여세 모드에서 `doneeRelation`은 이력 조회가 `c.donorRelation`(증여자 관계)을 그대로 복사해 넣은 값이고(prior-gift-lookup.ts:327), GiftRowEditor는 증여세 모드에서 수증인 관계 select 자체를 렌더하지 않는다(:371 `showIsHeir` 게이트). 반면 증여세 모드에서 실제로 입력받고 §47 동일인 그룹을 가르는 `gift.donor`(:248-270)는 표에도 배지에도 없다.
- **근거**: components/calc/prior-gift/PriorGiftTableView.tsx:69-74·220 / lib/calc/prior-gift-lookup.ts:327 (`doneeRelation: c.donorRelation`) / components/calc/prior-gift/GiftRowEditor.tsx:371(수증인 관계 select는 상속 모드 전용)·248-270(증여세 모드 입력은 donor) / components/calc/prior-gift/prior-gift-badges.ts:27-74 (donor 배지 없음)
- **영향**: 이력에서 불러온 행은 「수증자」 칸에 "직계존속 (성인)" 같은 증여자 쪽 라벨이 뜨고, 수동 추가 행은 항상 "수증인 미지정"으로 남는다. 부·모·조부모를 섞어 입력해도 표에서 행을 구분할 수 없어(증여일·금액만 다름) §47 동일인 합산 대상 행을 눈으로 확인할 수 없다.
- **제안**: 증여세 모드 분기에서 `GIFT_DONOR_LABELS[gift.donor]`(meta.ts:60-69)를 표시하고 컬럼 헤더를 모드별로 「수증자」/「증여자」로 나눈다.
- **대조**: `lib/calc/prior-gift-lookup.ts:327` · `components/calc/prior-gift/GiftRowEditor.tsx:248-270` · `components/calc/prior-gift/GiftRowEditor.tsx:371` · `components/calc/prior-gift/meta.ts:60-69`
- *(리뷰 ID c19-4)*

### IG-067 · 장례비 500만원 최소 인정 미반영 — 카드 합계가 엔진 공제액과 다름

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/DebtAllocationResultCard.tsx:64`

- **현상**: 카드는 `funeralMealApplied = Math.min(funeralMeal, FUNERAL_MEAL_LIMIT)`(64행)로 상한만 적용하고 하한을 두지 않는다. 엔진의 debtItems 경로는 `calcFuneralExpenseDeduction(funeralMeal, funeralBongan).deduction`을 쓰고, 그 안에서 식대를 `Math.min(Math.max(mealExpense, 5_000_000), 10_000_000)`으로 clamp한다(하한 500만).
- **근거**: components/calc/results/DebtAllocationResultCard.tsx:64·66·72·170 / lib/tax-engine/inheritance-tax-estate-steps.ts:96-98(debtItems 경로가 calcFuneralExpenseDeduction 호출) / lib/tax-engine/inheritance-gift-common.ts:554(식대 clamp [500만,1000만]) · 497-507(행별 배부 경로도 동일 하한 보정)
- **영향**: 식대 항목 합계가 500만 미만이면(예 300만) ② "장례비 한도 적용 합계"가 3,000,000으로, ① "한도 적용 후 합계"도 200만 과소로 표시된다. 엔진은 실제로 5,000,000을 과세가액에서 차감하므로 같은 결과 화면의 계산단계(「장례비 (식대 한도 500만~1천만 + 봉안 한도 5백만)」)와 숫자가 어긋난다.
- **제안**: UI에서 한도를 재구현하지 말고 엔진 단일 소스(`calcFuneralExpenseDeduction` 또는 `capFuneralRowAmounts`, `FUNERAL_MIN` 상수)를 import해 표시값을 도출한다.
- **대조**: `lib/tax-engine/inheritance-tax-estate-steps.ts:96` · `lib/tax-engine/inheritance-gift-common.ts:554` · `lib/tax-engine/inheritance-gift-common.ts:500` · `components/calc/results/InheritanceTaxResultView.tsx:371`
- *(리뷰 ID c20-1)*

### IG-068 · 「증여세 결정세액」 라벨 아래에 가산세 포함 총 납부세액 표시

`[2/2 · ½]` · **MAJOR** · E-표시법령 · `components/calc/results/GiftTaxResultView.tsx:280`

- **현상**: 280행 라벨은 "증여세 결정세액"인데 287행 값은 `result.totalPayableWithPenalty ?? result.finalTax`다. 엔진 타입은 `totalPayableWithPenalty = finalTax(결정세액) + 가산세`이며 가산세 0이면 undefined라고 명시한다. 하위 3칸(산출세액·세대생략 할증·세액공제)에는 가산세 항목이 없어 표시된 큰 숫자를 재구성할 수도 없다.
- **근거**: components/calc/results/GiftTaxResultView.tsx:279-288 / lib/tax-engine/types/inheritance-gift.types.ts:634-641 / 형제 경로는 라벨을 분리한다: components/calc/results/InheritanceTaxResultView.tsx:268-270 "총 납부세액 (결정세액 + 가산세)"
- **영향**: 가산세가 산출된 경우 헤드라인 숫자가 결정세액이 아닌데 결정세액으로 읽힌다. 같은 화면의 동시증여 합계 카드(395행 `result.finalTax`, 라벨 "건 0 결정세액")·별지10호 ㊺가 같은 용어로 다른 숫자를 보여 사용자가 어느 값이 결정세액인지 알 수 없다.
- **제안**: 상속세 결과뷰처럼 결정세액(finalTax) 행과 「총 납부세액(결정세액+가산세)」 행을 분리하거나, 가산세가 있을 때 헤드라인 라벨을 총 납부세액으로 바꾼다.
- **대조**: `lib/tax-engine/types/inheritance-gift.types.ts:634` · `lib/tax-engine/gift-tax.ts:491` · `lib/tax-engine/gift-tax-filing-form-besshi10.ts:210` · `components/calc/results/InheritanceTaxResultView.tsx:269`
- **½ 정정(rule-impact)**: GiftTaxResultView.tsx:280 라벨 "증여세 결정세액" 아래 287행이 가산세 포함 `totalPayableWithPenalty`를 표시한다(가산세>0일 때). 값 교체는 282-285행 주석대로 의도됐으나 라벨이 따라가지 않아, 헤드라인 숫자가 결정세액이 아닌데 결정세액으로 읽힌다. 형제 경로 InheritanceTaxResultView.tsx:235·268-270은 「결정세액」/「총 납부세액 (결정세액 + 가산세)」 두 행으로 분리한다. 다만 (a) 가산세 금액은 바로 아래 FilingPenaltyDetailCard/LatePaymentPenaltyDetailCard(320·325행)가 항상 함께 렌더되어 재구성이 **가능하고**, (b) 별지10호 ㊺(besshi10:210)는 라벨이 "자진납부할 세액(합계액)"이며 헤드라인과 **같은 값**이라 용어 충돌 대상이 아니다. 실제 용어 충돌은 동시증여 카드다 — 392·401행이 `finalTax`를 "건 N 결정세액"으로, 386·423행이 그 합계를 "수증자 총 납부세액 합계"로 불러 헤드라인과 용어가 정확히 뒤집혀 있다.
- *(리뷰 ID c20-2)*

### IG-069 · gross-up 결과를 「최종 과세표준」으로 표기 — 실제는 공제 전 과세가액

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/GiftDonorPaidGrossUpSection.tsx:68`

- **현상**: ⑤행(68행) 라벨이 "gross-up 후 최종 과세표준", 흐름 행(87행)이 "(최종 과표)"인데 표시값은 `grossUp.grossedUpNetGift`다. 엔진 타입 주석은 이 필드를 "과세표준(taxBase)이 아님 — 공제 차감 전 합산 과세가액"이라고 명시적으로 부정한다. 같은 카드 ①행(40행)은 동일 축(§53 차감 전)을 "과세가액"이라 부른다 — 카드 내부가 서로 모순된다.
- **근거**: components/calc/results/GiftDonorPaidGrossUpSection.tsx:40·68·87 / lib/tax-engine/types/inheritance-gift.types.ts:731-736("수렴 후 aggregatedGiftValue V* = A + donorPaidTax … 과세표준(taxBase)이 아님")
- **영향**: §53 증여재산공제(직계비속 5천만 등) 차감 전 금액이 과세표준으로 읽힌다. 같은 결과 화면의 별지 제10호서식 ㉚ "과세표준"(`r.taxBase`)과 다른 값이 같은 법정 용어로 병존한다.
- **제안**: 68행·87행 라벨을 "gross-up 후 증여세 과세가액"으로 정정한다(값·산식은 그대로).
- **대조**: `lib/tax-engine/types/inheritance-gift.types.ts:731` · `lib/tax-engine/gift-tax-filing-form-besshi10.ts:182`
- *(리뷰 ID c20-3)*

### IG-070 · 납부지연가산세만 있으면 총 납부세액 행이 통째로 사라진다

`[2/2 · ½]` · **MAJOR** · A-배관 · `components/calc/results/InheritanceTaxResultView.tsx:261`

- **현상**: 과세 요약의 「신고불성실가산세」 행과 「총 납부세액 (결정세액 + 가산세)」 행이 둘 다 `(result.underreportPenalty ?? 0) > 0` 하나의 게이트 안에 들어 있다(261~274). 정기·정확 신고 + 납부지연만 있는 경우 underreportPenalty=0 이므로 두 행 모두 렌더되지 않고, 요약은 「결정세액」에서 끝난다. 엔진이 내보낸 `totalPayableWithPenalty`(= finalTax + 신고불성실 + 납부지연)는 상속세 결과 화면 어디에도 표시되지 않는다.
- **근거**: InheritanceTaxResultView.tsx:261 게이트, :270 `result.totalPayableWithPenalty ?? result.finalTax`. 엔진: lib/tax-engine/inheritance-tax.ts:403 `totalPenalty = filingPenalty + latePaymentResult.penalty`, :453 `totalPenalty > 0`이면 totalPayableWithPenalty 설정 — 즉 납부지연 단독으로도 값이 채워진다. 입력 경로: lib/calc/inheritance-gift-filing-penalty-input.ts:95~103 — `on_time` + `!isUnderReported` + `applyLatePaymentPenalty`면 납부지연 축만 전송(주석 :66 「신고 상태와 독립이다」). 형제 GiftTaxResultView.tsx:287은 게이트 없이 `totalPayableWithPenalty ?? finalTax`를 헤드라인에 쓴다.
- **영향**: 기한 내 신고했지만 납부가 늦은 사용자는 요약의 마지막 숫자(결정세액)를 실제 납부액으로 오인한다. 별지9호 ㊳「납부할세액(합계액)」에 해당하는 값이 화면에서 사라진다.
- **제안**: 두 행의 게이트를 분리한다 — 「총 납부세액」 행은 `result.totalPayableWithPenalty != null`(또는 underreport+latePayment 합 > 0)로, 「신고불성실가산세」 행만 underreportPenalty > 0으로 건다. 납부지연가산세 행도 같은 층위 형제로 추가.
- **대조**: `lib/tax-engine/inheritance-tax.ts:403` · `lib/tax-engine/inheritance-tax.ts:453` · `lib/calc/inheritance-gift-filing-penalty-input.ts:95` · `components/calc/results/GiftTaxResultView.tsx:287`
- **½ 정정(code-fact)**: 정기·정확 신고 + 납부지연만 있는 경우(underreportPenalty=0, latePaymentPenalty>0), InheritanceTaxResultView.tsx:261의 단일 게이트가 「신고불성실가산세」 행과 「총 납부세액 (결정세액 + 가산세)」 행을 함께 삼켜, **과세 요약이 결정세액에서 끝난다**. 상단 핵심 결과 카드가 제거된 상태라 요약이 유일한 요약 표면이며, 형제 GiftTaxResultView.tsx:287은 게이트 없이 총액을 헤드라인에 쓴다. 단, 「그 값이 화면에서 완전히 사라진다」는 과장이다 — 납부지연가산세 금액은 게이트 밖 LatePaymentPenaltyDetailCard(:282)가 표시하고, 총액에 해당하는 별지9호 ㊳는 filing-form-9-data.ts:151~154·:202에서 ㊲를 포함해 산출·렌더된다. 다만 별지9호 섹션은 heirAllocationResult 조건부이며 기본 접힘이라, 주 요약만 보는 사용자는 결정세액을 실제 납부액으로 오인한다. 수정 방향은 원 제안대로 게이트 분리(총액 행은 `totalPayableWithPenalty != null`, 신고불성실 행만 underreportPenalty>0, 납부지연 행을 같은 층위 형제로 추가).
- *(리뷰 ID c21-1)*

### IG-071 · 「재산 평가 내역」은 접힘 시 언마운트되어 인쇄가 빈 껍데기다

`[2/2 · ½]` · **MAJOR** · F-도달가능성 · `components/calc/results/InheritanceTaxResultView.tsx:535`

- **현상**: `{showValuation && ( ... )}`로 조건부 렌더한다. 기본값은 `useState(false)`(:92)라 접힌 상태이며, 이 블록은 `PrintSection id="valuation-detail"`(:525) 안에 있고 그 id는 `availablePrintIds`에 무조건 등록된다(useInheritanceResultDerived.ts:81 `s.add("valuation-detail")`). 즉 사용자가 출력 항목으로 「재산 평가 내역」을 선택하고 인쇄하면, 펼치지 않은 한 헤더 버튼만 인쇄되고 평가 행은 하나도 나오지 않는다. 토글 버튼(:527~534)에 `print:hidden`도 없다.
- **근거**: InheritanceTaxResultView.tsx:535 `{showValuation && (`. 대조 — 같은 파일이 소비하는 형제들은 전부 print-only-css-toggle을 지킨다: InheritanceFilingFormTable.tsx:99 `open ? "block" : "hidden print:block"`, HeirAllocationSummaryTable.tsx:67 동일, GiftValuationBasisCard.tsx:145~147 동일. 증여 쪽 동일 성격 섹션도 GiftTaxResultView.tsx:621 `<div className="hidden print:block ...">` 폴백을 둔다.
- **영향**: 선택 출력에서 「재산 평가 내역」을 골라도 인쇄물·브라우저 PDF에 내용이 나오지 않는다. 사용자는 항목을 선택했는데 빈 제목만 받는다.
- **제안**: `{showValuation && ...}`를 `<div className={showValuation ? "..." : "hidden print:block"}>`로 바꾸고 토글 버튼에 `print:hidden`을 붙인다(형제 3곳과 동일 패턴).
- **대조**: `components/calc/results/useInheritanceResultDerived.ts:81` · `components/calc/results/InheritanceFilingFormTable.tsx:99` · `components/calc/results/HeirAllocationSummaryTable.tsx:67`
- **½ 정정(code-fact)**: 「재산 평가 내역」 본문이 `{showValuation && (`(InheritanceTaxResultView.tsx:535) 조건부 렌더라 기본 접힘(:92) 상태에서는 DOM에 존재하지 않는다. `valuation-detail`은 availablePrintIds에 무조건 등록되고(useInheritanceResultDerived.ts:81) channel이 SCREEN뿐이라(lib/print/inheritance-print-sections.ts:103) 출력 경로는 `window.print()`(PrintSelectionPanel.tsx:173) 하나뿐이므로, 항목을 선택해도 펼치지 않은 한 헤더만 인쇄된다. 수정은 본문 래퍼를 `<div className={showValuation ? "divide-y divide-border text-xs" : "hidden print:block divide-y divide-border text-xs"}>`로 바꾸는 것 하나로 충분하다 — 토글 배지(:533)는 `expandToggleClass`(ExpandToggleButton.tsx:34 EXPAND_BASE)에 이미 `print:hidden`이 들어 있고, `:527`의 `<button>`은 섹션 제목을 겸하므로 여기에 `print:hidden`을 붙이면 인쇄물에서 제목이 사라진다(붙이면 안 된다).
- *(리뷰 ID c21-2)*

### IG-072 · 연부연납 안내가 가산율 「연 1.8%」를 하드코딩 — 현행 3.1%

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/GiftTaxResultViewHelpers.tsx:88`

- **현상**: 연부연납 안내 카드가 「※ 이자 상당액(연 1.8% 기준) 별도 납부」라고 문자열로 박아 두었다. 저장소의 가산율 정본 테이블은 2025-03-21부터 연 3.1%이며 `CURRENT_SURCHARGE_RATE = 0.031` 상수를 export한다. 1.8%는 2020-03-13~2021-03-15 구간 값이다.
- **근거**: GiftTaxResultViewHelpers.tsx:88 문자열. 정본: lib/tax-engine/data/installment-surcharge-rates.ts:27~44 `INSTALLMENT_SURCHARGE_RATE_HISTORY`(2021-03-16 1.2% → 2023-03-20 2.9% → 2024-03-22 3.5% → 2025-03-21 3.1%), :45 `export const CURRENT_SURCHARGE_RATE = 0.031`. 상속 쪽 형제는 이 상수를 쓴다 — InstallmentScheduleCard.tsx:83 `CURRENT_SURCHARGE_RATE * 100`, :238 `연 {futureRate}%`. 이 컴포넌트는 GiftTaxResultView.tsx:673에서만 소비되므로 증여세 결과 화면에만 1.8%가 뜬다.
- **영향**: 증여세 결과 화면이 상속세 결과 화면과 다른 가산율을 안내한다. 사용자가 연부연납 부담을 약 절반으로 과소 추정한다(상증령 §69 → 국기칙 §19의3).
- **제안**: 문자열 대신 `CURRENT_SURCHARGE_RATE`를 import해 `연 ${(CURRENT_SURCHARGE_RATE*100).toFixed(1)}%`로 렌더한다(고시 개정 시 자동 추종).
- **대조**: `lib/tax-engine/data/installment-surcharge-rates.ts:45` · `components/calc/results/installment/InstallmentScheduleCard.tsx:83` · `components/calc/results/GiftTaxResultView.tsx:673`
- *(리뷰 ID c21-3)*

### IG-073 · 부표1이 §47② 합산 제외 사전증여까지 A24 본문 행으로 찍는다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/GiftTaxValuationFormTable.tsx:260`

- **현상**: `priorGifts.map(...)`이 전달된 사전증여 **전건**을 재산구분코드 A24 본문 행으로 렌더하고 ⑦ 평가가액에 `pg.giftAmount`를 넣는다. 필터가 전혀 없다. 반면 계 영역 ⑭ 증여재산가산액(:152 `computeRow14`)은 엔진의 `aggregatedGiftValue`에서 역산한 값이라, 엔진이 §47② 합산에서 제외한 회차(10년 도과·동일인 그룹 불일치·증여자 사망·조특법 특례 prior)는 ⑭에 들어 있지 않다. 결과적으로 본문 A24 행의 합과 ⑭·⑮가 어긋난다.
- **근거**: GiftTaxValuationFormTable.tsx:260~301 필터 없는 map. 엔진 제외 규칙: lib/tax-engine/gift-prior-aggregation.ts:160(특례 prior 제외)·:168(10년 boundary 제외)·:170(donor 미입력 제외)·:177(동일인 그룹 불일치 제외)·:187(증여자 사망 제외). ⑭ 산식: lib/calc/gift-valuation-besshi.ts:60 → lib/tax-engine/gift-tax-filing-form-besshi10.ts:86~87 (aggregatedGiftValue 기반). 호출부는 원본 폼 배열을 그대로 넘긴다 — GiftTaxResultView.tsx:609~617(donor조차 매핑에서 빠져 컴포넌트가 그룹 판정을 할 수도 없다), GiftTaxForm.tsx:330. 형제 상속 표는 반대로 처리한다 — InheritanceFilingFormTable.tsx:78~79이 `isWithin13Cutoff`로 included/excluded를 갈라 도과분을 별도 dimmed 참고 섹션(:137~168)에 둔다.
- **영향**: 10년 도과분·타 증여자분이 있는 사용자는 공식 서식(별지 제10호 부표 1)에 합산 대상이 아닌 증여가 본문 행으로 인쇄되고, 행 합계와 ⑭·⑮가 맞지 않는 신고서를 출력한다.
- **제안**: 상속 표와 동일하게 엔진 판정 집합만 본문 A24로 렌더한다. 엔진 헬퍼(`isSameDonorGroup`·10년 boundary)를 재사용하려면 호출부에서 `donor`·`specialTreatmentType`·`donorDeceasedDate`를 함께 넘기거나, 엔진이 matched prior 목록을 echo 필드로 노출하도록 한다.
- **대조**: `lib/tax-engine/gift-prior-aggregation.ts:157` · `lib/tax-engine/gift-tax-filing-form-besshi10.ts:86` · `components/calc/results/GiftTaxResultView.tsx:609` · `components/calc/results/InheritanceFilingFormTable.tsx:78`
- *(리뷰 ID c21-4)*

### IG-074 · 「일반 증여 산출세액」 라벨에 결정세액을 표시한다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/GiftTwoStreamDetailSection.tsx:34`

- **현상**: `<Row label="일반 증여 산출세액" value={formatKRW(result.ordinaryStreamTax)} />`. 그러나 `ordinaryStreamTax`는 세액공제(§58·§69·§29 등)를 모두 차감한 **결정세액**이다. 같은 카드 헤더의 조문 배지도 §47·§53·§56(과세가액·공제·세율)만 달려 있어 공제 반영 사실이 드러나지 않는다.
- **근거**: GiftTwoStreamDetailSection.tsx:34 라벨. 엔진: lib/tax-engine/gift-tax-two-stream.ts:335~338 `ordinaryFinalTax = max(0, ordinaryTotalWithSurcharge - creditResult.totalCredit)`, :501 `ordinaryStreamTax: ordinaryFinalTax`. 엔진 자신의 breakdown 라벨은 :347 「일반 스트림 **납부세액**」이고, :397 주석도 「일반 스트림 **결정세액**」이라 부른다. 타입 주석(lib/tax-engine/types/inheritance-gift.types.ts:669~675)도 §69를 포함한 일반 과세분으로 정의한다.
- **영향**: 산출세액(§56)과 결정세액은 법정 용어가 다른 별개 금액이다. 화면 숫자를 신고서 ㉞(산출세액계) 칸에 옮겨 적으면 신고세액공제만큼 과소 기재된다.
- **제안**: 라벨을 「일반 증여 결정세액」(또는 「일반 스트림 납부세액」 — 엔진 breakdown과 동일 용어)으로 바꾸고, 조문 배지에 §58·§69를 추가한다.
- **대조**: `lib/tax-engine/gift-tax-two-stream.ts:335` · `lib/tax-engine/gift-tax-two-stream.ts:501` · `lib/tax-engine/types/inheritance-gift.types.ts:675`
- *(리뷰 ID c21-5)*

### IG-075 · 「처음으로」가 확인 없이 전체 입력을 폐기한다

`[2/2]` · **MAJOR** · C-공용컴포넌트 · `components/calc/results/InheritanceTaxResultView.tsx:696`

- **현상**: 결과 화면 하단 CTA `<CtaButton onClick={onReset}>처음으로</CtaButton>`가 전체 초기화 콜백에 직결돼 있다. 호출부의 `onReset`은 `handleReset` — `setForm(INITIAL_FORM)`으로 상속인·재산·채무·사전증여 입력을 전부 버린다. 폐기 확인 다이얼로그가 없다. 규약이 지정한 공용 컴포넌트 `RestartFromScratchButton`(「처음부터 새로」 + `ConfirmDialog`)을 쓰지 않는다.
- **근거**: InheritanceTaxResultView.tsx:696 / 호출부 components/calc/InheritanceTaxForm.tsx:463~469 `handleReset` → `setForm(INITIAL_FORM)`, :479 `onReset={handleReset}`. 규약: components/calc/CLAUDE.md:14 「전체 초기화는 그 라벨에 달지 않는다 — `<RestartFromScratchButton>` 전용… window.confirm 금지」. 공용 컴포넌트 존재: components/calc/shared/RestartFromScratchButton.tsx:27~46(ConfirmDialog 필수). 양도세 3곳은 이 규약대로 이미 마이그레이션됨 — TransferTaxResultView.tsx:729, BundledAllocationCard.tsx:530, TransferTaxCalculator.tsx:578. (증여 GiftTaxResultView.tsx:744에 같은 미마이그레이션 패턴이 남아 있다.)
- **영향**: 「다시 계산」 옆의 「처음으로」를 홈 이동으로 오인해 누르면 확인 없이 입력이 전부 사라진다. 상속세는 입력량이 가장 많은 세목이다.
- **제안**: 해당 버튼을 `<RestartFromScratchButton onReset={onReset} />`로 교체한다(양도세 3곳과 동일). 증여세 결과뷰도 같은 처리 필요.
- **대조**: `components/calc/InheritanceTaxForm.tsx:463` · `components/calc/shared/RestartFromScratchButton.tsx:27` · `components/calc/results/TransferTaxResultView.tsx:729`
- *(리뷰 ID c21-6)*

### IG-076 · 동거주택공제 「미적용」 표시 경로가 게이트에 갇혀 영구 도달 불가

`[2/2 · ½]` · **MAJOR** · F-도달가능성 · `components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:164`

- **현상**: 부모 게이트가 `{dd.cohabitationDeduction > 0 && <CohabitDeductionDetailCard .../>}`다. 그런데 엔진은 §23의2 미적용(1+1 입주권·분양권·동거 10년 미충족) 시 공제를 0으로 만들면서 동시에 `cohabitDeductionDetail.isExcluded=true`를 채운다. 즉 isExcluded가 true인 순간 공제액이 0이 되어 카드 자체가 언마운트되므로, CohabitDeductionDetailCard가 갖고 있는 미적용 배지(:78~85)·미적용 상세표(:110~118)·10년 미달 경고 배지(:87~94)는 어떤 입력으로도 화면에 나올 수 없다.
- **근거**: 게이트: components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:164. 도달 불가 UI: components/calc/results/deduction-breakdown/CohabitDeductionDetailCard.tsx:78-85, 87-94, 110-118. 엔진이 isExcluded=true와 deduction=0을 함께 세우는 지점: lib/tax-engine/deductions/inheritance-deductions.ts:255-277(자산유형 게이트), :278-303(10년 미충족). 두 testid(cohabit-excluded-badge·cohabit-years-warning-badge)를 참조하는 테스트는 저장소에 0건.
- **영향**: 1+1 입주권·분양권을 고른 사용자나 동거 10년을 못 채운 사용자는 동거주택공제 행이 결과에서 통째로 사라진 것만 보고, 왜 0원인지·법적 사유가 무엇인지 어디서도 확인할 수 없다.
- **제안**: 형제 카드가 이미 쓰는 관례대로 게이트에 detail 존재 조건을 OR로 더한다 — `{(dd.cohabitationDeduction > 0 || dd.cohabitDeductionDetail !== undefined) && (...)}`.
- **대조**: `components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:108` · `components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:119` · `lib/tax-engine/deductions/inheritance-deductions.ts:265` · `lib/tax-engine/deductions/inheritance-deductions.ts:291`
- **½ 정정(code-fact)**: 동거주택공제 카드의 부모 게이트(DeductionBreakdownSection.tsx:164)가 `dd.cohabitationDeduction > 0`뿐이라, 엔진이 isExcluded=true와 공제 0을 동시에 세우는 1+1 입주권·분양권·동거 10년 미충족 케이스에서 카드가 통째로 언마운트된다. 그 결과 CohabitDeductionDetailCard.tsx:78-85(cohabit-excluded-badge)와 :110-118(미적용 상세표)은 어떤 입력으로도 표시되지 않고, 사유를 담은 result.warnings도 상속 결과뷰가 렌더하지 않아 사용자는 행이 사라진 것만 본다. 단, :87-94의 「10년 미달 경고 배지」는 부모 게이트가 아니라 엔진이 meetsRequirement=false를 곧바로 isExcluded=true로 승격시키는 결합(inheritance-deductions.ts:278-303) 때문에 죽은 것이며, 제안한 OR 게이트로도 되살아나지 않는다(해당 케이스는 excluded 배지 "동거 10년 미충족 미적용"으로 표시됨). 또한 cohabitDeductionDetail은 엔진 4분기 전부에서 항상 할당되므로, 제안대로 `|| dd.cohabitDeductionDetail !== undefined`를 더하면 동거주택공제 행이 모든 결과에 0원으로 상시 노출된다(형제 카드와 동일 거동이나 의도된 결과인지 확인 필요).
- *(리뷰 ID c22-1)*

### IG-077 · §24 한도 산정에서 상속포기 차감액이 같은 값으로 두 번 표시된다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/deduction-breakdown/DeductionLimitDetailCard.tsx:79`

- **현상**: `detail.heirWaiverAmount > 0` 조건의 DetailRow가 :79-87과 :88-96에 두 번 있고 둘 다 같은 `detail.heirWaiverAmount`를 `− 금액`으로 그린다(라벨만 「선순위 상속포기 후순위 상속액 (§24 ②2호)」/「상속포기 후순위 상속인액 (§24 ①2호)」로 다르다). 엔진은 이 값을 ceiling에서 한 번만 뺀다.
- **근거**: 중복 행: components/calc/results/deduction-breakdown/DeductionLimitDetailCard.tsx:79-96. 엔진 1회 차감: lib/tax-engine/deductions/inheritance-deduction-limit.ts:75(`heirWaiver = params.heirWaiverAmount ?? 0`)·:76-78 ceiling 산식(`taxableEstateValue - legateeNonHeir - heirWaiver - netPriorGiftDeducted`). 유입 경위: `git show fc839a0c` 가 :79 행을 신규 추가했는데 `git show fc839a0c^` 로 확인하면 :88 행이 이미 같은 필드로 존재했다(그때는 엔진이 항상 0이라 화면에 안 떠서 못 봤다).
- **영향**: 상속포기 항목을 입력한 사용자는 「상속세 과세가액 − 유증 − 포기 − 포기 − 사전증여」로 보이는 산식과 그 아래 §24 한도(ceiling) 값이 서로 맞지 않아 계산이 틀렸다고 오해한다.
- **제안**: 두 행 중 하나를 삭제한다(§24는 항 구분 없이 각 호로 열거되므로 조문 표기도 남기는 쪽 하나로 통일).
- **대조**: `lib/tax-engine/deductions/inheritance-deduction-limit.ts:67` · `lib/tax-engine/deductions/inheritance-deduction-limit.ts:76` · `lib/tax-engine/deductions/inheritance-deduction-limit.ts:95`
- *(리뷰 ID c22-2)*

### IG-078 · 영리법인 과세표준 역산값이 법인별 한도 산식 분자와 일치하지 않는다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/allocation-breakdown/CorporateGiftCreditDetailCard.tsx:31`

- **현상**: `corpGiftTaxBase = result.taxBase − computedTaxShareDenominator`로 역산해 법인 **행마다** 「= 산출세액 × (영리법인 과세표준 / 과세표준)」을 그린다. 그런데 엔진의 분모는 `taxBase − corporateGiftTaxBase − nonPayerNaturalGiftTaxBase`이므로 역산값은 (전체 영리법인 합계 + 비상속인 자연인 사전증여 과세표준)이 되고, 같은 행에 붙는 ⓑ 값 `p.priorGiftCreditLimit`은 **그 법인 하나의** 과세표준으로 계산된 값이다. 영리법인이 2곳 이상이거나 비상속인 자연인 사전증여가 있으면 산식과 값이 어긋난다.
- **근거**: UI 역산: components/calc/results/allocation-breakdown/CorporateGiftCreditDetailCard.tsx:31, 산식 렌더 :53-66, ⓑ 값 :52. 엔진 분모: lib/tax-engine/inheritance-allocation.ts:455-456. 법인별 한도(개별 giftTaxBase 기준): lib/tax-engine/inheritance-allocation.ts:467-471. corporateGiftTaxBase가 전 영리법인 합계임: lib/tax-engine/inheritance-corporate-exemption.ts:52-53·:101-104.
- **영향**: 영리법인이 둘 이상인 신고에서 각 법인 행의 한도 산식 분자가 두 법인 합계로 표시되어, 사용자가 산식대로 재계산하면 화면의 ⓑ 공제 한도가 재현되지 않는다.
- **제안**: 역산을 버리고 법인별 과세표준을 엔진 echo(`perHeir[h.id].directTaxBaseShare` — 영리법인 분기에서 giftTaxBase가 그대로 들어간다)로 바꿔 행마다 그 법인의 값을 쓴다.
- **대조**: `lib/tax-engine/inheritance-allocation.ts:456` · `lib/tax-engine/inheritance-allocation.ts:467` · `lib/tax-engine/inheritance-allocation.ts:479` · `lib/tax-engine/inheritance-corporate-exemption.ts:102`
- *(리뷰 ID c22-4)*

### IG-079 · 금융재산공제 §22① 1호·2호 인용이 서로 뒤바뀜

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/deduction-breakdown/FinancialDeductionDetailCard.tsx:140`

- **현상**: tier1(순금융재산 2천만 이하 전액)을 「㉠ 전액 공제 (§22 ①1호)」(140행), tier2(2천만~1억 고정 2천만)를 「㉠ 고정액 (§22 ①2호)」(133행)로 표기한다. 법문은 반대다.
- **근거**: KoreanLaw MCP 상증법 §22①(mst=276123, 시행 20251001): 「1. 순금융재산의 가액이 2천만원을 초과하는 경우: … 100분의 20 또는 2천만원 중 큰 금액 / 2. 순금융재산의 가액이 2천만원 이하인 경우: 그 순금융재산의 가액」. 엔진 tier 구분은 lib/tax-engine/deductions/inheritance-deduction-items.ts:198-217(≤2천만=전액, 2천만~1억=2천만 고정, 1억 초과=20%)
- **영향**: 사용자가 결과 화면에서 근거 조문을 확인할 때 반대 호를 보게 되어, 신고서·소명 작성 시 잘못된 호를 인용하게 된다.
- **제안**: tier1 라벨을 「§22 ①2호」, tier2 라벨을 「§22 ①1호」로 교체(tier2·tier3은 모두 1호의 MAX 두 갈래임을 병기).
- **대조**: `lib/tax-engine/deductions/inheritance-deduction-items.ts:198` · `lib/tax-engine/legal-codes/inheritance-gift.ts:38`
- *(리뷰 ID c23-2)*

### IG-080 · 분납 신고기한이 비거주자 9개월(§67④)을 무시하고 항상 6개월

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/useInheritanceResultDerived.ts:144`

- **현상**: splitDueDates가 addMonths(endOfMonth(deathDate), 6)으로 고정돼 있고 decedentType을 보지 않는다. 이 값이 SplitPaymentCard의 「기한」 표시(신고기한·분납기한)로 그대로 나간다. 같은 결과뷰의 형제 카드 둘은 비거주자를 이미 9개월로 처리한다.
- **근거**: useInheritanceResultDerived.ts:140-150 (decedentType 인자 없음, 6 하드코딩) · InheritanceTaxResultView.tsx:626-627이 splitDueDates를 SplitPaymentCard에 전달 · 대비: InstallmentScheduleCard.tsx:86 `const filingMonths = decedentType === "non_resident" ? 9 : 6;` · PaymentInKindCard.tsx:82 동일 · 엔진은 result.decedentType을 이 용도로 echo한다(lib/tax-engine/inheritance-tax.ts:406 「M-17: 신고기한 §67④ 비거주자 9개월 표시용 echo」)
- **영향**: 비거주자 상속(steps.tsx:115에서 선택 가능)에서 분납 카드가 실제보다 3개월 이른 신고기한·분납기한을 제시한다. 같은 화면의 연부연납·물납 카드와 날짜가 서로 어긋난다.
- **제안**: 훅에서 result.decedentType(또는 인자 추가)을 읽어 filingMonths를 6/9로 분기한다 — 형제 카드와 동일 술어를 쓰도록 공용 헬퍼로 뽑는 것이 안전하다.
- **대조**: `components/calc/results/installment/InstallmentScheduleCard.tsx:86` · `components/calc/results/payment-in-kind/PaymentInKindCard.tsx:82` · `lib/tax-engine/inheritance-tax.ts:406` · `components/calc/results/InheritanceTaxResultView.tsx:626`
- *(리뷰 ID c23-3)*

### IG-081 · 물납 요건 미충족인데 별지9호 ㊵에 물납액이 찍힌다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/useInheritanceResultDerived.ts:130`

- **현상**: paymentInKindFilingAmount가 `d.acceptedRequest ?? d.allowedLimit`만 반환하고 d.eligible을 보지 않는다. 엔진은 요건 충족 여부와 무관하게 allowedLimit(=min(한도1,한도2))을 계산한다. 화면 카드는 같은 데이터로 「물납 요건 미충족」을 띄우고 한도 블록 자체를 감춘다.
- **근거**: useInheritanceResultDerived.ts:112-130 (eligible 미참조) · lib/tax-engine/credits/payment-in-kind.ts:110-125 (eligible과 별개로 limit1·limit2·allowedLimit 산정) · PaymentInKindCard.tsx:118 「물납 요건 미충족」, :122 `{data.eligible && …}`로 한도 숨김 · lib/calc/filing-form-9-data.ts:205 `amtRow("㊵", paymentInKindAmount ?? 0, "right")` (게이트 없음)
- **영향**: 물납 신청 토글만 켜고 §73① 3요건 중 하나라도 미달하면, 화면은 「미충족」이라 하는데 같은 결과 페이지의 별지 제9호서식 ㊵에는 양수 물납액이 인쇄된다 — 신고서에 허가 불가능한 물납액이 기재된다.
- **제안**: 훅에서 `if (!d.eligible) return undefined;`를 추가해 요건 미충족 시 ㊵를 0/미표시로 두고, 화면 카드와 신고서의 판정을 일치시킨다.
- **대조**: `lib/tax-engine/credits/payment-in-kind.ts:110` · `components/calc/results/payment-in-kind/PaymentInKindCard.tsx:122` · `lib/calc/filing-form-9-data.ts:205` · `components/calc/results/InheritanceTaxResultView.tsx:420`
- *(리뷰 ID c23-4)*

### IG-082 · 「납부할세액 (별지9호 ㊳)」이 가산세를 뺀 다른 값이다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/inheritance/CulturalHeritageDeferralCard.tsx:65`

- **현상**: 카드는 payable = max(0, finalTax − 징수유예)(46행)를 「= 납부할세액 (별지9호 ㊳)」로 표기한다. 실제 별지9호 ㊳은 여기에 신고불성실가산세(㊱)·납부지연가산세(㊲)를 더한 값이다.
- **근거**: CulturalHeritageDeferralCard.tsx:46·65 · lib/calc/filing-form-9-data.ts:155 `const b43 = Math.max(0, result.finalTax - b26) + b36 + b37;`(b36=underreportPenalty, b37=latePaymentPenalty) · 가산세는 실제 입력 경로가 있다(app/api/calc/inheritance/route.ts:98 filingPenalty, lib/tax-engine/inheritance-tax.ts:443·451)
- **영향**: 징수유예 + 가산세가 함께 있는 신고에서 같은 결과 페이지가 칸 번호 ㊳에 대해 서로 다른 두 금액을 보여준다. 카드 값을 신고서에 옮겨 적으면 가산세만큼 과소 기재된다.
- **제안**: 라벨에서 ㊳ 표기를 빼고 「징수유예 차감 후 세액(가산세 별도)」로 바꾸거나, buildFilingForm9Data와 동일한 b43 산식을 써서 값을 맞춘다.
- **대조**: `lib/calc/filing-form-9-data.ts:144` · `lib/calc/filing-form-9-data.ts:155` · `components/calc/results/InheritanceTaxResultView.tsx:246`
- *(리뷰 ID c23-5)*

### IG-083 · 평가액 칸이 평가기준일 없이 계산돼 엔진값과 어긋난다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/EstateItemTableView.tsx:62`

- **현상**: `computeEffectiveValuation(item)`을 2번째 인자(valuationDate) 없이 호출한다. 이 헬퍼는 지상권·무체재산권·채권·전환사채·신탁수익권·정기금·적금(auto) 카테고리에서 평가기준일을 잔존연수·할인일수·이자 계산에 쓴다. 부모 PropertyValuationForm은 valuationDate를 보유해 EstateItemEditor에는 넘기지만(PropertyValuationForm.tsx:221) EstateItemTableView 호출부(:187-193)에는 넘기지 않고, EstateItemTableViewProps(:144-153)에 그 prop 자체가 없다.
- **근거**: components/calc/EstateItemTableView.tsx:62 · :144-153(props에 valuationDate 부재) / lib/calc/estate-item-valuation.ts:199-245(superficies·intangible_ip·receivable·convertible_bond·trust_benefit·periodic_payment가 valuationDate 의존) · :263-276(financial auto 모드는 valuationDate 없으면 savingsPrincipal만 반환) / components/calc/PropertyValuationForm.tsx:102 · :187-193 · :221
- **영향**: 지상권은 잔존연수가 0으로 합성돼(estate-item-valuation.ts:59-62) 평가액 칸이 0 또는 오값으로 뜨고, 적금 auto 모드는 경과이자가 빠진 원금만 표시된다. 결과 화면·사이드바(lib/stores/inheritance-summary.ts:101은 valuationDate를 넘긴다)와 숫자가 달라져 사용자가 입력 단계에서 자산 평가액을 검증할 수 없다.
- **제안**: 형제 컴포넌트와 동일하게 valuationDate를 prop으로 받아 computeEffectiveValuation에 전달한다(StockItemTableView.tsx:84·91·184·196·225가 이미 그 형태). 같은 prop을 :67의 resolveChips에도 함께 넘겨야 칩의 평가액 출처가 일치한다.
- **대조**: `components/calc/inheritance/stock/StockItemTableView.tsx:91` · `lib/stores/inheritance-summary.ts:101` · `lib/calc/estate-item-valuation.ts:199`
- *(리뷰 ID c24-2)*

### IG-084 · 대습상속인 토글을 켜면 「상속인 여부」의 유일한 입력 경로가 사라진다

`[2/2]` · **MAJOR** · F-도달가능성 · `components/calc/HeirEditor.tsx:475`

- **현상**: 「상속인 여부」 ToggleCard는 `isSubstituteEligible && !heir.substituteGroupId` 게이트 안에 있다. 그 아래(:486)의 SubstituteHeirPanel에서 대습 토글을 켜면 substituteGroupId만 세팅되고(SubstituteHeirPanel.tsx:68-79) isHeir은 손대지 않는데, 그 순간 위의 「상속인 여부」 토글이 언마운트돼 isHeir을 되돌릴 UI가 없어진다. 「기타」로 추가된 상속인은 HeirComposition.tsx:158에서 isHeir:false가 자동으로 붙고, 관계 변경으로 other가 되어도 HeirEditor.tsx:113에서 isHeir:false가 붙는다.
- **근거**: components/calc/HeirEditor.tsx:475(게이트) · :480-481(유일한 isHeir 쓰기 지점) · :486(SubstituteHeirPanel) · :112-113(other 전이 시 isHeir=false) / components/calc/HeirComposition.tsx:156-158(handleAdd("other") → isHeir:false) / components/calc/inheritance/SubstituteHeirPanel.tsx:68-79(isHeir 미변경) / lib/calc/prior-gift-donee-derive.ts:31-34(substituteGroupId 예외 없음)
- **영향**: 며느리·사위를 「기타」로 추가한 뒤 대습상속인 토글을 켜면 isHeir:false가 고정된다. 법정상속분·인적공제는 엔진이 대습 예외로 구제하지만(lib/tax-engine/inheritance-legal-share.ts:41 `h.isHeir !== false || h.substituteGroupId != null`) 사전증여 경로에는 그 예외가 없어 GiftRowEditor가 isHeir:false를 그대로 심고(GiftRowEditor.tsx:156) 엔진이 합산기간을 5년으로 잡는다(lib/tax-engine/inheritance-gift-common.ts:423 `gift.isHeir ? 10 : 5`). 6~10년 전 사전증여가 합산에서 빠져 상속세가 과소 산출되며, 수증자 드롭다운·요약 배지도 대습상속인을 「비상속인 · §13①2호 5년 합산」으로 표시한다(GiftRowEditor.tsx:325 · :341-343).
- **제안**: SubstituteHeirPanel이 대습 ON 시 substituteGroupId와 함께 isHeir을 undefined로 되돌리도록 단일 배치로 세팅하거나, deriveIsHeirFromHeir에 inheritance-legal-share.ts:41과 동일한 substituteGroupId 예외를 넣어 두 층의 술어를 일치시킨다.
- **대조**: `lib/tax-engine/inheritance-legal-share.ts:41` · `lib/tax-engine/inheritance-gift-common.ts:423` · `components/calc/prior-gift/GiftRowEditor.tsx:156` · `lib/calc/prior-gift-donee-derive.ts:31`
- *(리뷰 ID c24-3)*

### IG-085 · 「재산 합계 (예상)」가 평가기준일을 안 넘겨 날짜기반 자산이 0원

`[2/2 · ½]` · **MAJOR** · E-표시법령 · `components/calc/PropertyValuationForm.tsx:327`

- **현상**: PropertyValuationForm은 `valuationDate` prop을 받아(:102) EstateItemEditor에는 넘기지만(:221), 하단 합계는 `<TotalEstimatedValue items={items} />`(:327)로 날짜 없이 호출한다. TotalEstimatedValue는 `computeEffectiveValuation(item)`을 valuationDate 없이 부른다(property-valuation-preview.tsx:94). 같은 목록의 접기 헤더 합계는 `sumEstateItemsValuation(form.estateItems, form.deathDate)`로 날짜를 넘긴다(Step1Estate.tsx:48).
- **근거**: components/calc/PropertyValuationForm.tsx:327 `<TotalEstimatedValue items={items} />` / components/calc/property-valuation-preview.tsx:92-94 `TotalEstimatedValue({ items })` → `computeEffectiveValuation(item)` / lib/calc/estate-item-valuation.ts:177 `computeEffectiveValuation(item, valuationDate?)` — superficies는 :206에서 `injectSuperficiesRemainingYears(item, valuationDate)`를 태우고, 그 함수 :59-61이 `valuationDateISO` 없으면 `superficiesRemainingYears: 0`을 넣는다 → lib/tax-engine/property-valuation-special-rights.ts:99-110에서 years=0이면 합계 0원. receivable(:216)·convertible_bond(:224)·trust_benefit(:232)·periodic_payment(:240)·financial auto(:263)도 같은 인자에 의존. 이 카테고리는 전부 이 폼에서 추가 가능(lib/calc/deemed-category-policy.ts:29-43 INHERITANCE_CATEGORIES). 사이드바는 lib/stores/inheritance-summary.ts:101에서 날짜를 넘긴다.
- **영향**: 지상권·무체재산권·채권·전환사채·신탁수익권·정기금·예금(auto) 자산을 정상 입력해도 목록 하단 합계에서 0원으로 빠진다. 같은 화면의 접기 헤더 합계·좌측 사이드바 「상속재산」과 숫자가 어긋나 사용자가 어느 쪽을 믿어야 할지 알 수 없고, 그 자산만 있으면 합계 카드가 아예 렌더되지 않는다(total===0이면 null 반환).
- **제안**: TotalEstimatedValue에 `valuationDate?: string` prop을 추가해 `computeEffectiveValuation(item, valuationDate)`로 넘기고, PropertyValuationForm.tsx:327에서 `valuationDate={valuationDate}`를 전달한다.
- **대조**: `components/calc/property-valuation-preview.tsx:94` · `lib/calc/estate-item-valuation.ts:177` · `lib/calc/estate-item-valuation.ts:206` · `lib/stores/inheritance-summary.ts:101` · `components/calc/inheritance/Step1Estate.tsx:48`
- **½ 정정(code-fact)**: valuationDate 미전달로 하단 「재산 합계 (예상)」가 접기 헤더 합계·사이드바와 어긋나는 것은 사실이나, **어긋나는 방향이 카테고리마다 다르다 — 「전부 0원으로 빠진다」가 아니다**. 실측: ▸0원이 되는 것 = superficies(injectSuperficiesRemainingYears :59-61 → years 0 → special-rights.ts:105-110 Σ 공백 → 0. 단 `superficiesRemainingYearsOverride`가 있으면 정상) · intangible_ip(override·appraisal 모드 제외) · periodic_payment finite(periodic.ts:47 N=0 → pv 0. perpetual은 1년분×20이라 무영향) · trust_benefit 중 `diff_income`. ▸**과대**가 되는 것 = receivable discounted 모드(receivable.ts:84-91 valDate null → n=0 → 할인 없이 액면 전액) · trust_benefit `diff_principal`(원본 − 0). ▸**과소하되 0은 아닌 것** = financial auto(estate-item-valuation.ts:263-277 날짜 없으면 `savingsPrincipal`만 반환 — 미수이자·원천세 누락). ▸**무영향** = receivable simple · convertible_bond 거래소 경로 · trust_benefit 기본값 `same` · periodic perpetual. 따라서 「그 자산만 있으면 합계 카드가 아예 렌더되지 않는다(total===0 → null)」는 앞 그룹에만 성립한다. 또한 **같은 누락이 목록 표 행에도 있다** — EstateItemTableView.tsx:62 `computeEffectiveValuation(item)`이고 PropertyValuationForm.tsx:187이 이 컴포넌트에 valuationDate를 아예 넘기지 않는다(StockItemTableView.tsx:184 주석이 「EstateItemTableView엔 없음」이라 이미 인지 상태). 수정은 TotalEstimatedValue뿐 아니라 표 행까지 함께 날짜를 받도록 해야 완결된다. 반면 계산 결과 자체(buildInput/API 경로)는 날짜를 주입하므로 영향 없다 — 입력 단계 표시 드리프트에 한정.
- *(리뷰 ID c25-2)*

### IG-086 · 증여 ⑧이 납부지연가산세 ON의 미납액·법정납부기한 미입력을 안 막는다

`[2/2 · ½]` · **MAJOR** · A-배관 · `components/calc/gift-tax-form-validate.ts:339`

- **현상**: validateStep step 3(332~457)은 filingStatus·과소신고·외국납부·특례·동시증여만 검사하고, applyLatePaymentPenalty가 ON일 때 unpaidTax·paymentDeadline이 비어 있는지는 검사하지 않는다. ④(inheritance-gift-filing-penalty-input.ts:74-78)는 빈 칸이면 키 자체를 payload에서 빼고, 엔진(inheritance-gift-penalty.ts:410)은 `unpaidTax<=0 || !paymentDeadline`이면 LATE_PAYMENT_ZERO를 반환한다. 증여 폼의 유일한 클라이언트 게이트는 이 validateStep이다(GiftTaxForm.tsx:133-160은 buildGiftTaxInput 후 곧바로 fetch — 상속의 validateInheritanceTaxInput 같은 제출 전 전체 검증이 없다).
- **근거**: components/calc/gift-tax-form-validate.ts:339-349(step3 검사 전부) · lib/calc/inheritance-gift-filing-penalty-input.ts:74-78 · lib/tax-engine/inheritance-gift-penalty.ts:410 · 형제 상속 경로는 이미 차단한다: lib/calc/inheritance-validate.ts:677-679 「법정납부기한을 입력하세요. (국세기본법 §47의4①1호 산정기간의 기산점)」 · 공용 위젯 자신이 그 계약을 명시한다: components/calc/shared/LatePaymentPenaltyFields.tsx:19 「⇒ 입력받고 ⑧이 미입력을 차단한다」
- **영향**: 증여세 폼에서 「납부지연가산세(§47의4)」 토글을 켜고 미납세액이나 법정납부기한을 비워 둔 채 계산하면 차단도 경고도 없이 통과하고, 납부지연가산세가 조용히 0원으로 산출된다. 사용자는 가산세를 반영했다고 믿지만 실제 고지세액과 갈린다. 상속세 동일 위젯에서는 차단되므로 두 세목의 동작도 어긋난다.
- **제안**: step 3에 상속과 같은 층위의 차단 2건 추가: `form.applyLatePaymentPenalty && !form.unpaidTax.trim()` → 미납·과소납부세액 입력 요구, `form.applyLatePaymentPenalty && !form.paymentDeadline` → 법정납부기한 입력 요구(inheritance-validate.ts:677과 같은 문구·근거).
- **대조**: `lib/calc/inheritance-gift-filing-penalty-input.ts:74` · `lib/calc/inheritance-validate.ts:677` · `lib/tax-engine/inheritance-gift-penalty.ts:410` · `components/calc/GiftTaxForm.tsx:133` · `components/calc/shared/LatePaymentPenaltyFields.tsx:19`
- **½ 정정(code-fact)**: 증여 ⑧(gift-tax-form-validate.ts step 3, 332~458)이 납부지연가산세 토글 ON 상태의 unpaidTax·paymentDeadline 미입력을 전혀 검사하지 않아, 사용자가 「납부지연가산세(§47의4)」를 켜고 빈 칸으로 계산하면 엔진이 LATE_PAYMENT_ZERO를 돌려주고 결과 카드마저 렌더되지 않는 완전 침묵 0원이 된다(Zod·route에도 교차 검증 없음, 증여 폼에는 제출 전 전체 검증도 없음). 단, 형제 대비는 한쪽 축에만 성립한다 — 「미납액이 있는데 법정납부기한이 없다」는 상속(inheritance-validate.ts:677)·주식(stock-transfer-tax-validate.ts:587)이 이미 차단하므로 증여만 어긋나지만, 「토글 ON인데 미납액이 비었다」는 상속·주식도 차단하지 않는 공유 갭이다. 따라서 우선 처리는 증여에 법정납부기한 차단(상속과 동일 문구·조건)을 추가하는 것이고, 미납액 미입력 차단은 증여 단독이 아니라 상속·주식과 함께 같은 층위로 도입해야 새 불일치를 만들지 않는다.
- *(리뷰 ID c26-1)*

### IG-087 · §54④ 6호 선택 시 순손익 3칸이 사라져 영업권 입력 경로가 없어진다

`[2/2]` · **MAJOR** · F-도달가능성 · `components/calc/UnlistedStockSimpleFields.tsx:44`

- **현상**: isNetIncomeRequired가 liquidation·lt3y와 함께 remaining_3y(§54④ 6호)도 false로 판정해, 428행 게이트가 ② 순손익가치 섹션(netIncomeY1/Y2/Y3 + 자본환원율)을 통째로 언마운트한다. 그러나 엔진은 6호에서 영업권을 배제하지 않는다 — property-valuation-stock.ts:516이 `remaining_3y: undefined // §55③ 배제 대상 아님 → 영업권 정상 가산`이고, 영업권 분자는 netIncomeY1~Y3에서만 나온다(:542-551 resolveWeightedNetIncome3yForGoodwill, :616). 6호의 최종값은 perShareAssetValue인데 그 값은 영업권을 포함한 netAssetWithGoodwill로 계산된다(:624-629). 1호·2호는 :512-513에서 실제로 배제되므로 숨김이 타당하고, 3호·5호는 게이트를 통과한다 — 어긋나는 것은 6호뿐이다.
- **근거**: components/calc/UnlistedStockSimpleFields.tsx:41-47(isNetIncomeRequired), :428(게이트), :455-479(순손익 3칸의 유일한 입력 경로 — 저장소 전체에서 netIncomeY1을 쓰는 컴포넌트는 이 파일뿐) · lib/tax-engine/property-valuation-stock.ts:516 · :616 · :624-629 · 옵션 실재: components/calc/inheritance/UnlistedStockSpecialReasonSection.tsx:54-56 「6호 — 잔여 존속기한 3년 이내」
- **영향**: 「6호 — 잔여 존속기한 3년 이내」를 먼저 선택하면 3년치 순손익을 입력할 칸이 화면에서 사라지고, 그 결과 §59② 영업권이 항상 0으로 가산되어 1주당 순자산가치(=6호의 최종 평가액)가 과소 산정된다. 순손익을 먼저 입력한 뒤 6호를 고른 사용자와 값이 달라진다(입력 순서가 세액을 가른다).
- **제안**: isNetIncomeRequired의 false 목록에서 remaining_3y를 빼고(6호도 영업권 산정에 순손익이 필요), 6호에서는 3호·5호와 같은 안내 문구 대신 「최종값은 순자산가치이지만 §59② 영업권 산정에 3년치 순손익이 필요합니다」 취지의 안내를 붙인다.
- **대조**: `lib/tax-engine/property-valuation-stock.ts:516` · `lib/tax-engine/property-valuation-stock.ts:616` · `lib/tax-engine/property-valuation-stock.ts:624` · `components/calc/inheritance/UnlistedStockSpecialReasonSection.tsx:54`
- *(리뷰 ID c26-2)*

### IG-088 · 미리보기 §66 담보채권액이 신용보증기관 보증액을 안 뺀다

`[2/2 · ½]` · **MAJOR** · E-표시법령 · `components/calc/property-valuation-preview.tsx:45`

- **현상**: securedClaim을 (leaseDeposit ?? 0) + (mortgageAmount ?? 0)으로 직접 재계산한다. 엔진 단일 진실 computeSecuredClaim은 max(0, mortgageAmount − creditGuaranteeAmount) + leaseDeposit이다. 같은 카드의 예상 평가액(line 39·82)은 엔진값(computeEffectiveValuation → evaluateEstateItem().valuatedAmount)이라, 신용보증액이 입력되면 line 70-72의 하한 금액과 line 82의 평가액이 한 카드 안에서 어긋난다.
- **근거**: lib/tax-engine/valuation/resolve-estate-item-value.ts:169-175 computeSecuredClaim(주석: 단일 진실 dual-truth 방지) · lib/tax-engine/property-valuation.ts:178 applyCollateralFloor가 그 값을 Math.max에 쓴다 · lib/calc/estate-item-valuation.ts:31-33 부동산은 엔진 valuatedAmount 위임 · 입력 경로 존재: components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx:609
- **영향**: 기준시가 5억·저당 10억·신용보증액 3억이면 엔진 평가액은 7억인데 카드는 담보채권액 하한 1,000,000,000과 예상 평가액 700,000,000을 나란히 보여준다. 상속재산 카드 미리보기가 결과 화면 엔진값과 3억 어긋난다.
- **제안**: computeSecuredClaim(item)을 import해 line 45를 대체한다. line 74의 담보채무 별도 공제 안내도 같은 값을 쓰게 된다.
- **대조**: `lib/tax-engine/valuation/resolve-estate-item-value.ts:169` · `lib/tax-engine/property-valuation.ts:178`
- **½ 정정(rule-impact)**: line 45의 `securedClaim` 재계산이 **line 70-72(§66 담보채권액 하한)** 표시에 쓰이는 한에서 결함이다 — 엔진 단일 진실 `computeSecuredClaim`(= max(0, mortgage − creditGuarantee) + leaseDeposit)과 달라, 신용보증액 입력 시 하한(1,000,000,000)이 바로 아래 예상 평가액(700,000,000)보다 크게 표시되는 자기모순이 생긴다(실측). 다만 **같은 값이 쓰이는 line 74-78의 「담보채무 … 부채 명세 별도 공제」(§14) 안내에서는 현행 식이 옳다** — §14 채무액의 단일 진실인 `deriveCollateralDebts`(inheritance-collateral-debt.ts:65-68)가 `mortgageAmount + leaseDeposit`로 신용보증을 차감하지 않기 때문이다. 따라서 지적의 「제안」대로 line 45를 통째로 `computeSecuredClaim`으로 치환하면 §14 안내가 과소표시되는 새 dual-truth를 만든다. 수정은 두 값 분리: 하한 행 = `computeSecuredClaim(item)`, §14 안내 행 = `(leaseDeposit ?? 0) + (mortgageAmount ?? 0)` 유지.
- *(리뷰 ID c27-1)*

### IG-089 · 소명대상 금액이 §15 임계 분기를 무시하고 1년+2년을 그대로 더한다

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/source-summary/PresumedInheritanceTable.tsx:98`

- **현상**: scrutiny = amountWithin1Y + amountWithin2Y를 무조건 계산해 소계 열(line 115)·소명비율(line 121)·합계(line 36-39, 141)에 쓴다. 엔진은 scrutinyAmount = triggered2Y ? total : amountWithin1Y이고 임계 미발동이면 0이다. resultItems에 scrutinyAmount가 이미 echo돼 있는데(PresumedInheritanceItemResult) 표는 baseDeduction·addedAmount만 읽는다.
- **근거**: lib/tax-engine/presumed-inheritance.ts:100-109 (scrutinyAmount 분기·baseDeduction) · 같은 파일 82-90 임계 미발동 시 scrutinyAmount 0 · lib/tax-engine/types/inheritance-gift-estate.types.ts:880 scrutinyAmount echo 존재 · __tests__/components/calc/results/source-data-summary.test.tsx에 Table B 케이스 없음
- **영향**: 부동산 1년 3억·2년 1.5억이면 엔진 소명대상은 3억(2년 합 4.5억 < 5억)인데 표는 소계 4.5억을 찍고, 같은 행의 기준금액 열은 엔진값 6천만(=3억×20%)이라 4.5억×20%=9천만과 맞지 않는다. 임계 미발동 건은 소명대상 2억을 표시하면서 기준금액·산입액은 0이라 사용자가 계산을 재현할 수 없다.
- **제안**: resultMap.get(item.id)?.scrutinyAmount를 우선 쓰고 result 미도달 시에만 1Y+2Y로 fallback한다. 소명비율·합계도 같은 값을 쓴다.
- **대조**: `lib/tax-engine/presumed-inheritance.ts:100` · `lib/tax-engine/types/inheritance-gift-estate.types.ts:880`
- *(리뷰 ID c27-2)*

### IG-090 · {open && ...} 언마운트라 인쇄 시 4표가 통째로 빠진다

`[2/2]` · **MAJOR** · C-공용컴포넌트 · `components/calc/results/source-summary/SourceDataSummarySection.tsx:77`

- **현상**: 본문을 {open && (...)}로 조건부 렌더한다. 기본값은 접힘(line 44 useState(false))이고 토글 span은 expandToggleClass가 print:hidden을 붙인다. 저장소 표준은 className={open ? "block" : "hidden print:block"}이며 results/ 33개 파일이 그렇게 쓴다.
- **근거**: components/calc/results/shared/ExpandToggleButton.tsx:8-11이 이 컴포넌트를 이름으로 지목하며 본문은 hidden print:block이라고 규정 · 같은 결과뷰의 형제 InheritanceFilingFormTable.tsx:99가 그 패턴 사용 · lib/print/inheritance-print-sections.ts:79에 source-data가 선택 가능한 인쇄 섹션(상속개시자료 요약)으로 등록 · components/calc/results/InheritanceTaxResultView.tsx:319 PrintSection id=source-data
- **영향**: 사용자가 인쇄 선택 패널에서 상속개시자료 요약을 체크하고 인쇄하면 제목 줄만 나오고 협의분할·추정상속·채무·사전증여 4표가 전부 빠진다. 미리 펼쳐 두지 않으면 재현되며 화면상 아무 경고도 없다.
- **제안**: {open && (...)}를 <div className={open ? "block space-y-4 p-4" : "hidden print:block space-y-4 p-4"}>로 바꾼다.
- **대조**: `components/calc/results/shared/ExpandToggleButton.tsx:8` · `components/calc/results/InheritanceFilingFormTable.tsx:99` · `lib/print/inheritance-print-sections.ts:79`
- *(리뷰 ID c27-3)*

### IG-091 · 영리법인 사전증여 산출세액을 corporateGiftComputedTax에서 안 읽어 항상 공란

`[2/2]` · **MAJOR** · E-표시법령 · `components/calc/results/source-summary/PriorGiftSummaryTable.tsx:133`

- **현상**: 증여세 산출세액 열(line 133)과 소계(line 74-77)가 gift.computedTax만 읽는다. 상속세 마법사에서 영리법인 행은 산출세액을 corporateGiftComputedTax에 저장하고 computedTax는 설정하지 않는다. 형제 표는 영리법인 분기에서 corporateGiftComputedTax를 읽는다.
- **근거**: components/calc/prior-gift/GiftRowEditor.tsx:101 주석(영리법인: corporateGiftComputedTax·giftTaxPaid=0·giftTaxBase=undefined)·:110 실제 set · components/calc/results/InheritanceFilingFormTable.tsx:200 gift.corporateGiftComputedTax ?? 0 · components/calc/prior-gift/AggregationSummary.tsx:44 동일 필드 합산 · 이 표의 비고 열(line 136)은 영리법인을 §3의2②로 표시하면서 정작 그 세액은 못 읽는다
- **영향**: 영리법인 사전증여 행의 증여세 산출세액이 항상 - 로 나오고 소계에서도 빠진다. §3의2② 면제 한도의 근거 금액이 요약표에서 사라져 같은 결과뷰의 사전증여재산 명세와 값이 서로 다르다. 기존 테스트는 픽스처에 computedTax를 직접 넣어 이 결함을 가린다(source-data-summary.test.tsx:236).
- **제안**: beneficiaryType === "corporate"이면 gift.corporateGiftComputedTax를, 아니면 gift.computedTax를 쓰도록 분기한다(형제 InheritanceFilingFormTable:200과 동일).
- **대조**: `components/calc/prior-gift/GiftRowEditor.tsx:101` · `components/calc/results/InheritanceFilingFormTable.tsx:200`
- *(리뷰 ID c27-4)*

---

## MINOR (73건)

### IG-092 · 이자율 칸을 비우면 게이트를 통과해 이자상당액이 조용히 0

`[2/2]` · **MINOR** · A-배관 · `app/calc/family-business-postmgmt/page.tsx:169`

- **현상**: `canCalculate`가 이자율을 `Number(interestRate) >= 0 && <= 1`로만 본다. `Number("")`는 0이라 빈칸이 통과하고, `annualInterestRate: Number(interestRate)`(201)로 0이 엔진에 들어가 이자상당액이 0으로 계산된다. 같은 `useMemo`가 `baseTaxableAmount`에는 `.trim().length > 0` 가드를 두고 「빈칸=silent 0 방지」라고 주석까지 달았는데(164-165) 이자율만 빠졌다. 게다가 빈칸일 때 placeholder가 현행 율(285)을 보여줘 「기본값이 적용된다」로 읽힌다.
- **근거**: app/calc/family-business-postmgmt/page.tsx:169-170(게이트) · 164-165(base의 trim 가드와 그 주석) · 201(엔진 전달) · 285(placeholder가 현행 율) · 동일 패턴 app/calc/inheritance-postmgmt/page.tsx:139-140·151
- **영향**: 사용자가 이자율을 지우고 계산하면 §15⑯ 이자상당액이 0으로 나오는데 화면 어디에도 경고가 없다. 「이자상당액 (§15⑯) + 0」이 정상 결과처럼 보인다.
- **제안**: `interestRate.trim().length > 0` 조건을 `canCalculate`에 추가한다(base 필드와 동일 처리).
- **대조**: `app/calc/inheritance-postmgmt/page.tsx:139` · `lib/tax-engine/credits/family-business-postmgmt-orchestrator.ts:150`
- *(리뷰 ID c01-4)*

### IG-093 · 분기 토글을 native checkbox로 작성 — ToggleCard 강제 규칙 위반

`[2/2 · ½]` · **MINOR** · C-공용컴포넌트 · `app/calc/inheritance-postmgmt/page.tsx:283`

- **현상**: 「최대주주 지위 유지 (§16⑥6호 단서)」가 native `<input type="checkbox">`로 작성됐다. 이 값은 정당사유 인정 여부를 가르는 분기 토글이고(153-155에서 엔진 input으로 전달), 같은 축의 형제 시뮬레이터는 동일 성격 토글을 전부 `ToggleCard`로 쓴다.
- **근거**: app/calc/inheritance-postmgmt/page.tsx:282-287(native checkbox) · components/calc/CLAUDE.md:242(「native <input type="checkbox"> 신규 작성 금지」) · 대조: app/calc/family-business-postmgmt/page.tsx:293-306·382-388(ToggleCard) · app/calc/public-interest-postmgmt/Clause1Form.tsx:132-139(chip variant ToggleCard)
- **영향**: OFF 상태에 tone 배경이 없어 토글의 존재가 카드에 묻힌다. 미체크 시 정당사유가 불인정되어 추징이 적용되는 분기라 발견 실패가 곧 잘못된 세액으로 이어진다.
- **제안**: `<ToggleCard tone="emerald" variant="chip" title="최대주주 지위 유지 (§16⑥6호 단서)" checked={maintainsMajorShareholder} onCheckedChange={setMaintainsMajorShareholder} />`로 교체한다.
- **대조**: `components/calc/inputs/ToggleCard.tsx:29` · `app/calc/family-business-postmgmt/page.tsx:293`
- **½ 정정(code-fact)**: app/calc/inheritance-postmgmt/page.tsx:282-287의 「최대주주 지위 유지 (§16⑥6호 단서)」는 정당사유 인정 여부를 가르는 분기 토글인데 native <input type="checkbox">로 작성돼 components/calc/CLAUDE.md:242의 ToggleCard 강제 규칙을 위반한다. git blame상 2026-05-21 작성으로, 2026-04-29 전면 마이그레이션 이후의 「신규 작성」에 해당한다. 다만 영향은 「tone 배경이 없어 묻힌다」가 아니다 — 280행 래퍼가 이미 border-emerald-200 bg-emerald-50/40 tone 카드이고 292-294행에 추징 안내문도 있다. 실제 결손은 ToggleCard가 제공하는 표준 ON/OFF 보조신호(Switch thumb 위치·border 진하기·ring)와 넓은 클릭 타깃이 없어 상태 인지가 형제 시뮬레이터(family-business-postmgmt/page.tsx:293·300·382, public-interest-postmgmt/Clause1Form.tsx:132)와 불일치한다는 점이다. 교체를 막는 안전망은 없다(e2e/inheritance-gaps.spec.ts는 heading만 단언, checkbox 셀렉터 0건).
- *(리뷰 ID c01-5)*

### IG-094 · undefined 센티널 가드가 IntegerInput 앞에서 무력화된다

`[2/2 · ½]` · **MINOR** · A-배관 · `app/calc/public-interest-postmgmt/Clause2Form.tsx:115`

- **현상**: `heldShares === undefined || otherDonated === undefined || otherHeld === undefined`로 「빈칸 → silent 0」을 막으려 한다(114-116 주석). 그런데 이 값들을 쓰는 `IntegerInput`은 빈 문자열을 `0`으로 바꿔 `onChange(number)`로 올리고, 값이 0이면 화면을 빈칸으로 그린다. 즉 사용자가 한 번 입력했다가 지우면 상태는 `0`, 화면은 빈칸이 되어 가드가 통과한다. `undefined`는 한 번도 손대지 않은 초기 상태에서만 유지된다.
- **근거**: app/calc/public-interest-postmgmt/Clause2Form.tsx:110-129(canCalculate) · 74(ShareField의 IntegerInput) · components/calc/inputs/IntegerInput.tsx:14-17(`parseInteger("")` → 0) · 37(`value ? value.toLocaleString() : ""` — 0을 빈칸으로 표시) · 44(`onChange(parseInteger(e.target.value))`)
- **영향**: 가목·나목·다목 합산분이 조용히 0으로 들어가 §16②2호 보유비율 판정이 과소 계산된다. 초과주식수·과세가액이 그만큼 줄어드는데 화면에는 아무 신호가 없다.
- **제안**: `ShareField`를 문자열 상태로 바꿔 `trim().length > 0`로 판정하거나(다른 금액 칸들이 쓰는 방식), `IntegerInput`이 빈 입력을 `undefined`로 올리도록 시그니처를 확장한다.
- **대조**: `components/calc/inputs/IntegerInput.tsx:14` · `app/calc/public-interest-postmgmt/Clause1Form.tsx:63`
- **½ 정정(rule-impact)**: `undefined` 센티널 가드(Clause2Form.tsx:115)는 **「한 번도 손대지 않은 초기 상태」만** 막는다. 사용자가 가목·나목·다목 칸을 입력했다가 지우면 IntegerInput이 `0`을 올리고(IntegerInput.tsx:45·13-17) 화면은 다시 빈칸이 되므로(:37) 가드가 통과하고, 그 목이 조용히 0으로 합산되어(engine:164·223·226) 초과주식수·과세가액·증여세가 과소 계산된다. 다만 **「화면에 아무 신호가 없다」는 과장**이다 — 계산 후 「보유비율 초과 판정」 산출근거가 `가목 0 + 나목 0 + 다목 0`을 문자열로 명시 출력한다(engine:234-241 → PublicInterestStepList.tsx:26-37). 사각지대는 계산 버튼 게이트(입력 단계)에 한정된다. 또한 같은 약한 가드가 Clause6Form.tsx:43에도 있고, 뿌리는 IntegerInput이 정당한 0과 빈칸을 표시상 구별하지 못하는 점이므로 수정은 두 파일 + 컴포넌트 시그니처를 함께 봐야 한다.
- *(리뷰 ID c01-6)*

### IG-095 · 「직접입력 모드로 공제받은 사례」 토글이 아무것도 하지 않는다

`[2/2 · ½]` · **MINOR** · F-도달가능성 · `app/calc/family-business-postmgmt/page.tsx:300`

- **현상**: `usedDirectInput` 상태(125)를 ToggleCard가 읽고 쓰지만, 이 값은 엔진 input 객체(192-210)에도 없고 결과 영역(411-506) 어디에도 표시되지 않는다. 파일 전체에서 소비 지점이 0이다. description은 「(표시용)」이라고 적었으나 실제로 표시되는 것도 없다.
- **근거**: app/calc/family-business-postmgmt/page.tsx:125(선언) · 300-306(유일한 사용처 = 자기 자신) · 192-210(FamilyBusinessPostMgmtInput 구성 — 미포함) · lib/tax-engine/types/inheritance-family-business-postmgmt.types.ts:114-138(입력 타입에 대응 필드 없음)
- **영향**: ① 기본 정보 섹션 안에서 OFZ 특례 토글과 나란히 놓여 있어 계산에 영향을 준다고 읽힌다. 사용자가 켜고 결과가 그대로인 것을 보면 계산 오류로 오인한다.
- **제안**: 결과 카드에 이 사실을 표기하는 문구를 붙이거나, 표시할 것이 없으면 토글을 제거한다.
- **대조**: `lib/tax-engine/types/inheritance-family-business-postmgmt.types.ts:114`
- **½ 정정(code-fact)**: `usedDirectInput`은 계산에 대해 완전한 no-op다 — 엔진 input(page.tsx:192-210 / types:114-138)에도, 결과 영역(411-506)에도, 엔진 함수(orchestrator:79-)에도 소비 지점이 없다. 그러나 「표시되는 것이 없다」는 부정확하다: 이 값은 InheritanceTaxResultView.tsx:516이 붙이는 `?direct=1`로 prefill되어 **토글의 ON 상태 자체가 「직접입력 모드로 공제받은 사례」라는 이월 사실의 표시**다. 진짜 결함은 「소비 지점 0」이 아니라 **읽기 전용 이월 사실을 사용자가 바꿀 수 있는 interactive 토글로, 그것도 계산에 영향을 주는 OFZ 토글(293-299) 바로 아래 나란히 렌더한 것**이다. 사용자가 이 토글을 조작하면 화면상 이월 사실이 왜곡되고 결과는 그대로여서 계산 오류로 오인된다. ⇒ 처방은 「제거」가 아니라 **읽기 전용 배지·안내 문구로 강등**(또는 결과 카드에 이 사실을 함께 표기)이어야 한다. 제거하면 `direct=1` prefill 신호가 화면에서 사라진다.
- *(리뷰 ID c01-7)*

### IG-096 · native `<input type="checkbox">` — ToggleCard 강제 규칙 위반

`[2/2 · ½]` · **MINOR** · C-공용컴포넌트 · `components/calc/deemed-gift/SpecificCorpShareholderTable.tsx:124`

- **현상**: 「증여자 본인 (과세 제외)」 토글이 native checkbox로 작성되어 있다. components/calc/CLAUDE.md:242가 「분기·옵션 토글은 반드시 ToggleCard 사용. native `<input type="checkbox">` 신규 작성 금지(2026-04-29 프로젝트 전체 마이그레이션 완료, native checkbox 0건)」로 못박은 항목이다. 같은 디렉터리의 capital-forms.tsx는 동일 성격 토글을 전부 `ToggleCard`(variant="chip" 포함)로 쓰고 있어 관례가 아니라 이탈이다.
- **근거**: components/calc/deemed-gift/SpecificCorpShareholderTable.tsx:119-131 (`<input type="checkbox" checked={row.isDonor} ...>`) · components/calc/CLAUDE.md:242 · 대조: components/calc/deemed-gift/capital-forms.tsx:100-107·111-117·641-649 등 전부 ToggleCard · 저장소 전역 grep `type="checkbox"` = 4건뿐
- **영향**: OFF 상태에 tone 배경이 없어 회색 체크박스가 주변 텍스트에 묻힌다. 「과세 제외」를 가르는 판정 입력이라 발견되지 않으면 증여자 본인에게까지 §45의5 증여세가 계산된다.
- **제안**: `<ToggleCard tone="sky" variant="chip" title="증여자 본인 (과세 제외)" checked={row.isDonor} onCheckedChange={(v) => update(i, { isDonor: v })} />`로 교체. E2E 셀렉터 `sc-sh-is-donor-${i}`는 ToggleCard가 data-testid를 DOM에 흘리는지 먼저 확인할 것(feedback_shared_card_testid_not_forwarded).
- **대조**: `components/calc/CLAUDE.md:242` · `components/calc/deemed-gift/capital-forms.tsx:100`
- **½ 정정(rule-impact)**: 규칙 위반은 성립한다 — components/calc/CLAUDE.md:242의 강제 규칙에 대해 SpecificCorpShareholderTable.tsx:123-129이 2026-04-29 마이그레이션 **이후(2026-06-25 생성)** 작성된 native checkbox 분기 토글이고, 과세제외(donor_self)를 가르는 판정 입력이면서 validate에 짝 가드가 없다(gift-deemed-validate.ts:313-320). 다만 정정할 것: ① 「유일한 이탈·전역 4건」이 아니라 **전역 5개 요소, 그중 app/calc/inheritance-postmgmt/page.tsx:283(2026-05-21)도 동일 성격의 post-migration 분기 토글** — 즉 재발 패턴이고 CLAUDE.md의 「native checkbox 0건」 괄호가 stale이므로 이 건 수정 시 그 문구도 함께 갱신해야 한다. ② 「회색이라 묻힌다」가 아니라 「체크박스는 border-sky-300이고 컨테이너도 sky 톤이지만, 토글 자체에 ToggleCard가 보장하는 OFF tone 배경이 없다」가 정확한 서술이다. ③ 제안 코드는 그대로 쓰면 안 된다 — ToggleCardProps에 data-testid도 rest spread도 없어 tsc가 깨지고 e2e/gift-deemed-specific-corp.spec.ts:59·115의 `.check()`가 셀렉터를 잃는다. 교체하려면 ToggleCard에 testid 패스스루를 먼저 추가하거나 E2E 셀렉터를 Switch role 기반으로 함께 옮겨야 한다(같은 디렉터리 행 테이블 형제 2건은 공용 컴포넌트 대신 raw input을 쓰는 국소 관례가 있으나 둘 다 불리언이 없어 면책 근거가 되지 못한다).
- *(리뷰 ID c02-5)*

### IG-097 · 페이지 부제가 1호·4호만 적혀 있으나 실제로는 6개 사유를 제공한다

`[2/2]` · **MINOR** · E-표시법령 · `app/calc/public-interest-postmgmt/page.tsx:110`

- **현상**: 헤더 부제는 「상증법 §48② — 출연받은 재산(1호)·매각대금(4호)의 3년 사후관리 위반 시 추징 증여세 계산」이다. 그러나 같은 파일의 `CLAUSE_OPTIONS`는 1·2·3·4·6·8호 **6개**를 제공하고, 파일 상단 docstring(:6-12)도 6개를 열거한다. 부제만 2개 사유 시절 문구로 남아 있다.
- **근거**: app/calc/public-interest-postmgmt/page.tsx:109-111 (부제) · 같은 파일 :46-82 (CLAUSE_OPTIONS 6개: clause1·clause2·clause3·clause4·clause6·clause8) · :6-12 docstring 6개 열거 · :151-156 6개 폼 렌더
- **영향**: 2호(주식등 취득 초과)·3호(운용소득 목적 외)·6호(의결권 행사)·8호(운용 의무 위반)를 찾는 사용자가 이 계산기가 해당 사유를 다루지 않는다고 판단해 이탈한다. 「3년 사후관리」라는 한정도 6호·8호에는 맞지 않는다.
- **제안**: 부제를 실제 범위대로 고친다 — 예: 「상증법 §48② 증여세 추징 사유(1·2·3·4·6·8호) 계산. 5호·7호는 §78⑨ 가산세로 별도 계산기」.
- **대조**: `app/calc/public-interest-postmgmt/page.tsx:46` · `app/calc/public-interest-postmgmt/page.tsx:151`
- *(리뷰 ID c02-7)*

### IG-098 · 현물출자 소액주주 의제 토글은 명부 ON 시 사라지지만 값은 계속 전송된다

`[2/2 · ½]` · **MINOR** · B-3중패턴 · `components/calc/deemed-gift/contribution-form.tsx:215`

- **현상**: conSmallImputation 토글은 `!isHigh && !hasRoster`일 때만 렌더된다(:215). 반면 ④API는 `smallShareholderImputation: !isHigh ? form.conSmallImputation : undefined`로 roster 여부를 보지 않고 전달한다(gift-deemed-api.ts:288). 바로 위 형제 필드 conRelatedRatioPct는 `isHigh && !form.conParties`로 UI 게이트와 정확히 같은 조건을 API에도 걸어 두었다(gift-deemed-api.ts:285-287) — 두 필드의 처리가 비대칭이다.
- **근거**: components/calc/deemed-gift/contribution-form.tsx:208(conRelatedRatioPct 게이트 `isHigh && !hasRoster`)·:215(conSmallImputation 게이트 `!isHigh && !hasRoster`) / lib/calc/gift-deemed-api.ts:285-287(roster 반영)·:288(roster 미반영) / lib/tax-engine/gift-deemed/contribution-in-kind.ts:79-80·:152(roster 경로에서도 imputationNote를 결과 note에 붙인다)
- **영향**: 저가인수에서 소액주주 의제를 켠 뒤 당사자 명부 토글을 켜면, 토글이 화면에서 사라져 되돌릴 수 없는데도 결과의 증여재산가액 note에 「· §39의3② 소액주주 1인 의제」가 계속 붙고 thresholdEcho.smallShareholderImputation도 true로 남는다. 세액은 변하지 않지만 적용되지 않은 법령 조항이 결과에 표시된다.
- **제안**: gift-deemed-api.ts:288을 형제 필드와 같은 형태로 맞춘다 — `smallShareholderImputation: !isHigh && !form.conParties ? form.conSmallImputation : undefined`.
- **대조**: `lib/calc/gift-deemed-api.ts:285` · `lib/calc/gift-deemed-api.ts:288` · `lib/tax-engine/gift-deemed/contribution-in-kind.ts:79` · `lib/tax-engine/gift-deemed/contribution-in-kind.ts:152`
- **½ 정정(rule-impact)**: 현물출자 저가인수에서 ⑤ UI 게이트(`!isHigh && !hasRoster`, contribution-form.tsx:215)와 ④ API 게이트(`!isHigh`, gift-deemed-api.ts:288)가 어긋난다. 바로 위 형제 필드 relatedRatio(:285-287)는 두 층의 조건이 일치하므로 비대칭이 맞다. 의제 토글을 켠 뒤 당사자 명부 토글을 켜면 토글이 화면에서 사라지지만 값은 계속 전송되어, 결과 breakdown의 「증여재산가액(과세)」 note에 「· §39의3② 소액주주 1인 의제」가 계속 표시된다(contribution-in-kind.ts:152 → DeemedGiftResultView.tsx:89). 단 (a) 비가역이 아니다 — 명부 토글을 끄면 의제 토글이 다시 나타나 끌 수 있고 대가는 입력한 명부 행 소실이며, (b) thresholdEcho.smallShareholderImputation은 결과 객체에만 남고 이를 읽는 결과뷰가 없어 화면에 노출되지 않는다. 세액은 양 경로 모두 불변(표시 전용). 수정 방향은 ④를 형제와 같이 `!isHigh && !form.conParties`로 좁히거나, 반대로 ⑤를 넓혀 로스터 ON에서도 토글을 노출하는 것 중 택일 — 엔진이 roster 분기에서도 imputationNote를 처리하므로(:152) 후자도 타당하다.
- *(리뷰 ID c03-4)*

### IG-099 · ToggleCard에 직접 넘긴 data-testid 6건이 DOM에 도달하지 않는다

`[2/2]` · **MINOR** · D-타입 · `components/calc/deemed-gift/other-forms.tsx:188`

- **현상**: ToggleCardProps(ToggleCard.tsx:134-163)에는 data-testid가 없고, 컴포넌트는 props 스프레드 없이 명시 구조분해만 한다(:165-180). card variant 렌더도 data-slot/data-variant/data-checked/data-disabled만 찍는다(:242-246). TSX는 하이픈 포함 속성을 미선언이어도 오류로 잡지 않으므로 tsc가 침묵하고, 6개 속성이 그대로 버려진다.
- **근거**: components/calc/deemed-gift/other-forms.tsx:188·197·212·227·293·302(ToggleCard에 data-testid 직접 전달) / components/calc/inputs/ToggleCard.tsx:134-163(props에 data-testid 없음)·:165-180(스프레드 없음)·:242-246(렌더 속성 목록) / 형제 대조: components/calc/deemed-gift/free-realestate-form.tsx:37·101은 같은 목적을 `<div data-testid="...">` 래퍼로 처리한다
- **영향**: 현재 이 6개 testid를 참조하는 테스트는 저장소에 없다(grep 0건)라 즉시 깨지는 것은 없지만, 이 셀렉터를 믿고 E2E·RTL을 작성하면 렌더는 성공하는데 요소를 못 찾아 실패한다. CurrencyInput·DecimalInput은 data-testid를 실제로 내부 input에 전달하므로(CurrencyInput.tsx:60·132, DecimalInput.tsx:28·76) 같은 파일 안에서 동작하는 것과 안 하는 것이 섞여 있다.
- **제안**: free-realestate-form.tsx:37과 같은 래퍼 div 방식으로 바꾸거나, ToggleCardProps에 `"data-testid"?: string`을 추가해 최상위 div에 전달한다(공용 컴포넌트를 고치면 전 세목에 일관 적용된다).
- **대조**: `components/calc/inputs/ToggleCard.tsx:134` · `components/calc/inputs/ToggleCard.tsx:242` · `components/calc/deemed-gift/free-realestate-form.tsx:37` · `components/calc/inputs/CurrencyInput.tsx:132` · `components/calc/inputs/DecimalInput.tsx:76`
- *(리뷰 ID c03-5)*

### IG-100 · 결과 카드 금액이 만원 단위로 절사돼 실제 차감액과 다르게 표시

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/exemption/ExemptionSummaryCard.tsx:15`

- **현상**: 로컬 `formatKRW`가 억·만 단위로만 조립한다(`Math.floor(amount/1e8)`, `Math.floor((amount%1e8)/1e4)`). 만원 미만이 버려져 표시값이 실제 값보다 최대 9,999원 작다. 저장소 정본 `formatKRW`(components/calc/inputs/CurrencyInput.tsx:29)는 `toLocaleString()`으로 무손실인데 같은 이름을 이 파일이 로컬로 가린다.
- **근거**: ExemptionSummaryCard.tsx:15-23(로컬 정의)·:103(총 차감)·:36(항목별)·:46(한도 초과분) / components/calc/inputs/CurrencyInput.tsx:29-31 `export function formatKRW(amount) { return amount.toLocaleString(); }`
- **영향**: 비과세 차감액 123,456,789원이 「1억 2345만원」으로 표시돼 6,789원이 사라진다. 항목별 −금액과 총 차감, 그리고 다른 결과 카드의 정확 표기가 서로 맞지 않아 사용자가 합계를 검산할 수 없다. 반환 경로도 일관성이 없어 1만원 미만은 접미사 없이 `9,999`로만 나온다(:22).
- **제안**: 로컬 formatKRW를 제거하고 CurrencyInput의 정본 `formatKRW`(toLocaleString)를 import한다.
- **대조**: `components/calc/inputs/CurrencyInput.tsx:29`
- *(리뷰 ID c04-6)*

### IG-101 · 칩의 amber 경고 점 분기가 구조적으로 도달 불가

`[2/2]` · **MINOR** · F-도달가능성 · `components/calc/exemption/ExemptionChecklistPanel.tsx:85`

- **현상**: `itemMap`이 `checkedMap`과 동일한 Map으로 별칭 지정돼 있다(:168). 따라서 `active = checkedMap.has(ruleId)`가 false이면 `itemMap.get(ruleId)`는 항상 undefined이고, `showWarning = !active && item != null && ...`은 언제나 false다. :120-126의 경고 점은 렌더될 수 없다.
- **근거**: ExemptionChecklistPanel.tsx:82-85(active·item·showWarning)·:168 `const itemMap = checkedMap;`·:121 `{showWarning && (…)}` / 파일 헤더 :10은 「값 있는데 미체크 → amber 경고 점」을 기능으로 명시
- **영향**: 문서화된 기능이 동작하지 않는다. 죽은 분기와 `itemMap` prop이 남아 이후 수정자가 경고가 표시되고 있다고 오인할 수 있다.
- **제안**: 미체크 항목의 값을 담는 별도 소스가 없다면 `itemMap` prop과 showWarning 분기를 제거하고 헤더 주석의 기능 서술도 함께 지운다.
- **대조**: `components/calc/exemption/ExemptionChecklistPanel.tsx:168` · `lib/calc/inheritance-exemption-checklist.ts:59`
- *(리뷰 ID c04-7)*

### IG-102 · ⑧이 동시증여를 `simultaneousGifts`로만 보고 대납 조합을 못 막아 API 400

`[2/2 · ½ · 강등 MAJOR→MINOR]` · **MINOR** · A-배관 · `components/calc/gift/GiftCreditChecklist.tsx:433`

- **현상**: 같은 카드에 대납 토글(:344 `checked={form.donorPaysGiftTax === true}`)과 동시증여 토글(:433 `checked={form.simultaneousGiftForms !== undefined}`)이 나란히 있고 상호배타 안내가 없다. ⑧ validateStep의 대납 차단 ⓐ는 `form.simultaneousGifts`(증여의제 prefill 전용 구 간이 필드)만 검사한다. 현행 UI 경로가 쓰는 `form.simultaneousGiftForms`는 검사하지 않는다.
- **근거**: components/calc/gift/GiftCreditChecklist.tsx:433, :344 / components/calc/gift-tax-form-validate.ts:446 `if (form.simultaneousGifts && form.simultaneousGifts.length > 0)` / lib/validators/property-valuation-input.ts:713-721 `giftSimultaneousRequestSchema` superRefine이 `simultaneousGiftForms.length > 0 && donorPaysGiftTax === true`를 차단 / components/calc/GiftTaxForm.tsx:113 validateStep 통과 후 :159 fetch
- **영향**: 동시증여 1건 이상 + 대납 ON이면 Step3 「다음(계산)」이 ⑧을 통과한 뒤 서버가 400을 돌려준다. 사용자는 마지막 단계에서만 막히고, 화면에는 두 토글이 함께 켜지는 것을 막는 안내가 없다. CLAUDE.md의 「UI 통과↔API 400 모순 금지」 위반이며, validate 파일 자신이 :445에 「Zod ⑫ superRefine과 동일 메시지」라고 적어 둔 규약과 어긋난다.
- **제안**: gift-tax-form-validate.ts의 대납 차단 ⓐ에 `form.simultaneousGiftForms && form.simultaneousGiftForms.length > 0` 조건을 Zod와 같은 메시지로 추가한다(추가 건의 `sub.donorPaysGiftTax`도 동일).
- **대조**: `components/calc/gift-tax-form-validate.ts:446` · `lib/validators/property-valuation-input.ts:713` · `components/calc/GiftTaxForm.tsx:139`
- **½ 정정(code-fact)**: ⑧ validateStep(step 3)이 대납 차단 ⓐ에서 구 간이 필드 `form.simultaneousGifts`만 검사하고, 현행 UI 경로의 `form.simultaneousGiftForms`와 추가 건의 `sub.donorPaysGiftTax`(SimultaneousGiftCard:272가 GiftCreditChecklist를 중첩 렌더해 UI로 켤 수 있다)를 검사하지 않는다. 그 결과 두 토글 동시 ON은 ⑧을 통과하고 Zod ⑫ giftSimultaneousRequestSchema(:717-733)가 서버에서 400으로 막는다. 다만 차단은 사용자에게 **같은 「계산하기」 클릭에서 명시적 한국어 메시지로** 표시되며(e2e/gift-donor-paid-grossup.spec.ts E-3가 그 서버 문구를 이미 고정) 오계산·침묵 실패는 없다. 실질 결함은 ⑧↔⑫ 미러링 규약(validate 파일 :445 주석 「Zod ⑫ superRefine과 동일 메시지」) 위반과 불필요한 서버 왕복이다.
- *(리뷰 ID c05-1)*

### IG-103 · 새 동시증여 건이 donor="father" 기본값으로 생성돼 즉시 동일그룹 차단

`[2/2]` · **MINOR** · B-3중패턴 · `components/calc/gift/GiftCreditChecklist.tsx:472`

- **현상**: 「+ 동시증여 추가」가 `{ ...INITIAL_FORM, giftDate: form.giftDate }`로 서브폼을 만든다. `INITIAL_FORM.donor`는 `"father"`(gift-tax-form-shared.tsx:191)이므로 새 건은 「부」가 선택된 채로 나타난다. 반면 SimultaneousGiftCard는 donor 미선택을 전제로 `"관계 선택"` 라벨(:114)과 `value={sub.donor ?? ""}`(:157)를 갖고 있다.
- **근거**: components/calc/gift/GiftCreditChecklist.tsx:472 / components/calc/gift-tax-form-shared.tsx:191 `donor: "father"` / components/calc/gift/SimultaneousGiftCard.tsx:114, :157 / components/calc/gift-tax-form-validate.ts:432-440 (`!sub.donor` 미선택 차단은 통과, 대신 동일그룹 차단이 걸림) / lib/tax-engine/gift-prior-aggregation.ts:52 `isSameDonorGroup`
- **영향**: 주 건의 기본 증여자도 「부」이므로 추가 버튼을 누르는 즉시 카드가 rose 톤 「§47② 동일인 그룹」 경고 상태로 생성되고, 관계를 바꾸지 않으면 다음 단계가 「선택하세요」가 아닌 동일그룹 메시지로 막힌다. 컴포넌트가 준비해 둔 「관계 선택」 미선택 상태는 도달 불가다.
- **제안**: 새 서브폼 생성 시 donor를 비운다 — `{ ...INITIAL_FORM, giftDate: form.giftDate, donor: undefined as unknown as GiftDonorRelation }` 대신 `GiftSubFormState.donor`를 optional로 두고 명시적으로 미선택 상태를 만든다.
- **대조**: `components/calc/gift-tax-form-shared.tsx:191` · `components/calc/gift/SimultaneousGiftCard.tsx:114` · `components/calc/gift-tax-form-validate.ts:432`
- *(리뷰 ID c05-6)*

### IG-104 · 호출부가 fallback 값을 넘겨 「채우기」 미도달·「되돌리기」 무동작

`[2/2 · ½]` · **MINOR** · F-도달가능성 · `components/calc/inheritance/AutoSuggestBadge.tsx:60`

- **현상**: 배지는 `currentValue.trim()===""`로 빈값 상태를 판정한다(:60). 그런데 4개 호출부 전부 currentValue에 **display fallback이 적용된 값**을 넘긴다(Step4Deductions.tsx:261·279·298·330, autoFillValue는 raw가 ""면 제안값 문자열을 반환 — :57-60). 따라서 제안값>0인 한 isEmpty는 항상 false·isMatch는 항상 true다. "되돌리기"가 부르는 onApply("")도 폼을 ""로 되돌릴 뿐이라 autoFillValue가 즉시 같은 값을 다시 표시하고, ④ API 변환도 동일 fallback(autoOrManual)을 적용한다(InheritanceTaxForm.tsx:251-252).
- **근거**: components/calc/inheritance/AutoSuggestBadge.tsx:56-62·100-119·152-156 / components/calc/inheritance/Step4Deductions.tsx:57-60·259-265 / components/calc/InheritanceTaxForm.tsx:251-252
- **영향**: 사용자가 아무것도 하지 않았는데 배지가 항상 "✓ 자동 채움 적용됨"으로 표시되고, "이 값으로 채우기" 버튼은 어떤 경로로도 나타나지 않으며, 노출된 "되돌리기"는 눌러도 화면·전송값 어느 쪽도 바뀌지 않는다(무동작 컨트롤).
- **제안**: 호출부가 currentValue에 raw 폼 값(form.netFinancialAssets 등)을 넘기게 하고, 표시 fallback은 CurrencyInput 쪽에만 두면 배지 문서(:11-15)가 규정한 3상태가 그대로 살아난다.
- **대조**: `components/calc/inheritance/Step4Deductions.tsx:57` · `components/calc/InheritanceTaxForm.tsx:251`
- **½ 정정(rule-impact)**: 호출부 4곳이 currentValue에 display fallback이 적용된 값을 넘겨(Step4Deductions.tsx:261·279·298·330 ← autoFillValue :57-60), 배지의 빈값 판정(:60)이 무력화됐다. 결과: (1) 제안값 > 0인 한 「이 값으로 채우기」 분기(:100-110)는 도달 불가한 dead code다(제안값이 0이면서 isApplicable=true인 퇴화 케이스에서만 노출되며, 그때 눌러도 API 전송값은 그대로라 역시 무동작). (2) 사용자가 값을 건드리지 않았거나 제안값과 같은 값을 넣은 경우 항상 isMatch가 되어 노출되는 「되돌리기」(:111-119)는 눌러도 화면·전송값 어느 쪽도 바뀌지 않는 죽은 컨트롤이다 — set({X:""}) 후 표시는 autoFillValue가, ④ API는 autoOrManual(InheritanceTaxForm.tsx:251-252)이 같은 값을 그대로 복원한다. 단, (3) 사용자가 제안값과 다른 값을 입력한 mismatch 경로(:62·120-130)는 정상 동작하며, (4) "✓ 자동 채움 적용됨" 문구 자체는 3중 미러 패턴상 사실이다(자동값이 표시·API 양쪽에 실제 적용됨) — 허위 표시가 아니라 「죽은 컨트롤·죽은 분기」가 결함의 실체다. 최초 커밋 e1a0a04a는 currentValue에 raw를 넘겼고, a67b2871에서 value용 display fallback을 currentValue까지 감싸며 회귀했다.
- *(리뷰 ID c06-5)*

### IG-105 · §154⑦ 지역별 배율이 UI 안에서만 두 번 재선언(엔진과 3중)

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/inheritance/CohabitAncillaryLandBlock.tsx:86`

- **현상**: 한도 면적 미리보기용 배율표를 :86-91에 선언하고, 같은 파일 :182-187에서 같은 표를 인라인으로 한 번 더 선언한다. 엔진에는 동일 값의 ANCILLARY_LAND_RATIO가 있으나 export되지 않아 UI가 재사용하지 못하고 있다(inheritance-cohabit-helpers.ts:390-396).
- **근거**: components/calc/inheritance/CohabitAncillaryLandBlock.tsx:86-91·182-187 / lib/tax-engine/deductions/inheritance-cohabit-helpers.ts:390-396
- **영향**: 소득세 시행령 §154⑦ 배율이 개정되면 세 곳을 모두 고쳐야 하며, 한 곳만 고치면 화면의 「한도 면적」·「초과 …㎡ 차감 적용」 안내가 엔진 실제 차감과 조용히 어긋난다(계산은 엔진 값, 표시는 UI 값).
- **제안**: 엔진의 ANCILLARY_LAND_RATIO를 export해 UI가 import하고, 파일 내 두 번째 인라인 사본은 첫 번째 상수를 참조하도록 한 곳으로 합친다.
- **대조**: `lib/tax-engine/deductions/inheritance-cohabit-helpers.ts:390` · `lib/calc/inheritance-validate.ts:638`
- *(리뷰 ID c06-6)*

### IG-106 · ToggleCard에 넘긴 data-testid는 DOM에 닿지 않는 죽은 prop

`[2/2 · ½]` · **MINOR** · D-타입 · `components/calc/inheritance/CohabitRequirementBlock.tsx:133`

- **현상**: `<ToggleCard ... data-testid="cohabit-reasons-toggle">`를 넘기지만 ToggleCardProps에는 해당 필드가 없고(:134-163) 컴포넌트가 props를 명시 destructure할 뿐 `...rest` 전개가 없어 DOM에 붙지 않는다(ToggleCard.tsx 내 data-testid 문자열 0건). TypeScript는 하이픈 속성을 JSX 특례로 통과시켜 tsc가 잡지 못한다.
- **근거**: components/calc/inheritance/CohabitRequirementBlock.tsx:133 / components/calc/inputs/ToggleCard.tsx:134-163 (grep data-testid → 0건) / 같은 결론이 이미 docs/00-pm/e2e-cohabit-reason-toggle-selector-fix.plan.md:57에 기록됨
- **영향**: getByTestId("cohabit-reasons-toggle") 셀렉터는 영구 0건 매칭이다. §23의2② 부득이사유 토글을 잡으려는 테스트가 조용히 대상을 못 찾고, 코드만 보면 testid가 붙은 것으로 오인된다.
- **제안**: testid를 ToggleCard를 감싸는 div에 붙이거나(저장소 확립 패턴), 조작은 getByLabelText(title)로 하고 이 죽은 prop은 제거한다.
- **대조**: `components/calc/inputs/ToggleCard.tsx:134`
- **½ 정정(rule-impact)**: `CohabitRequirementBlock.tsx:133`의 `data-testid="cohabit-reasons-toggle"`는 DOM에 도달하지 않는 죽은 prop이 맞다(ToggleCardProps에 필드 없음 :134-163 · `...rest` 전개 없음 :165-180 · 컴포넌트 내 data-testid 0건). tsc가 잡지 못하는 것도 실증됐다(격리 probe: 하이픈 속성 에러 0 / 대조군 `dataTestid` TS2322). 다만 **영향은 잠재적이다** — 이 testid를 참조하는 테스트가 e2e/·__tests__/ 통틀어 0건이고, 해당 spec은 이미 다른 셀렉터로 확정됐으므로 지금 "조용히 실패하는 테스트"는 없다(그리고 0-매칭 getByTestId는 timeout으로 시끄럽게 실패하지, 조용하지 않다). 또한 이 파일 고유 결함이 아니라 ToggleCard 호출부 **9곳**에 복제된 저장소 전역 패턴의 1건이며(ForeignStockBlock:234 · other-forms:188·197·212·227·293·302 · BurdenedGiftTransferSection:218), 9곳 모두 소비처 0건이다. 따라서 처방은 이 한 줄 제거보다 ToggleCard의 testid 포워딩 추가 또는 9곳 일괄 정리(감싸는 div 패턴 — 메모리 feedback_shared_card_testid_not_forwarded)가 적절하다.
- *(리뷰 ID c06-7)*

### IG-107 · 영농·가업 토글을 동시에 켤 수 있으나 validate가 계산을 차단

`[2/2]` · **MINOR** · A-배관 · `components/calc/inheritance/EstateCommonAttributesSection.tsx:153`

- **현상**: 주식 자산은 visibility.farming·visibility.familyBusiness가 둘 다 "default"라 두 ToggleCard가 나란히 렌더된다(:153-160). 두 컴포넌트는 서로를 모르고 disabled/disabledReason도 쓰지 않아 둘 다 ON이 된다. 그런데 ⑧validate는 이 조합을 에러로 반환한다.
- **근거**: lib/calc/asset-toggle-visibility.ts:112-123 listed_stock·unlisted_stock 매트릭스가 farming·familyBusiness 모두 "default". 차단 지점 lib/calc/inheritance-validate.ts:57-59 `if (item.farmingCategory && item.familyBusinessCategory) return ... asset_dual_category_conflict`, 호출 lib/calc/inheritance-validate.ts:469-470(에러 반환 시 즉시 return).
- **영향**: 주식 카드에서 영농·가업을 함께 켜면 계산 버튼이 「영농·가업 분류 동시 선택 불가」로 막힌다. UI에는 사전 신호가 전혀 없어 사용자가 계산 시점에야 알게 된다.
- **제안**: 두 섹션 중 한쪽이 활성일 때 다른 쪽 ToggleCard에 disabled + disabledReason(「영농·가업 분류는 동시 선택 불가 (상증령 §15⑤·§16⑤)」)을 전달할 것. ToggleCard가 이미 지원하는 prop이다.
- **대조**: `lib/calc/inheritance-validate.ts:57` · `lib/calc/inheritance-validate.ts:469` · `lib/calc/asset-toggle-visibility.ts:112`
- *(리뷰 ID c07-6)*

### IG-108 · 내부 enum 값 corporate_stock이 화면 힌트로 그대로 노출

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/inheritance/FarmingCategorySection.tsx:91`

- **현상**: 주식 자산에서 비적격 옵션의 hint를 "법인 주식은 corporate_stock 분류만 가능"으로 설정한다. corporate_stock은 FarmingCategory 유니온의 내부 식별자다.
- **근거**: RadioCardGroup이 hint를 실제 텍스트로 렌더한다 — components/calc/inputs/RadioCardGroup.tsx:224-228 `{opt.hint && <p className="text-xs text-amber-700 ...">{opt.hint}</p>}`. 저장소 관례가 아님 — components/calc/ 전체에서 사용자 표시 문자열에 corporate_stock을 넣은 곳은 이 파일과 FamilyBusinessCategorySection뿐(grep 확인).
- **영향**: 납세자가 보는 안내문에 코드 식별자가 노출된다. 같은 화면의 옵션 라벨은 「법인 영농 주식」(:42)이라 사용자는 두 이름을 연결하지 못한다.
- **제안**: hint를 옵션 라벨과 같은 한국어로 바꿀 것 — 예: "주식 자산은 「법인 영농 주식」 분류만 선택할 수 있습니다". 같은 파일 42행 라벨을 그대로 인용하면 된다.
- **대조**: `components/calc/inputs/RadioCardGroup.tsx:224`
- *(리뷰 ID c07-7)*

### IG-109 · 내부 enum 값 corporate_stock이 화면 힌트로 그대로 노출

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/inheritance/FamilyBusinessCategorySection.tsx:95`

- **현상**: 주식 자산에서 비적격 옵션의 hint를 "주식 자산은 corporate_stock 분류만 가능"으로 설정한다. corporate_stock은 FamilyBusinessCategory 유니온의 내부 식별자다.
- **근거**: RadioCardGroup이 hint를 텍스트로 렌더한다 — components/calc/inputs/RadioCardGroup.tsx:224-228. 같은 파일 52행 옵션 description에도 "businessType=corporate 한정"이라는 내부 키가 들어 있고, FamilyBusinessEligibilitySection.tsx:459-460에도 "법인 주식(corporate_stock)"·"familyBusinessCategory 선택 시"가 있다.
- **영향**: 납세자가 보는 안내문에 코드 식별자가 노출된다. 옵션 라벨은 「가업 법인 주식」(:52)이라 사용자는 hint가 어느 옵션을 가리키는지 알 수 없다.
- **제안**: hint를 "주식 자산은 「가업 법인 주식」 분류만 선택할 수 있습니다"로, 52행 description의 "businessType=corporate 한정"을 "가업 유형이 「법인」일 때만 선택 가능"으로 바꿀 것.
- **대조**: `components/calc/inputs/RadioCardGroup.tsx:224`
- *(리뷰 ID c07-8)*

### IG-110 · 자격자 전부 해제(빈 배열) 상태에서 안내문이 정반대 규칙을 설명

`[2/2 · ½ · 강등 MAJOR→MINOR]` · **MINOR** · E-표시법령 · `components/calc/inheritance/FarmingEligibilitySection.tsx:548`

- **현상**: 548-551행 안내문은 「미체크 시 전체 상속인이 자격 충족된 것으로 간주 (전체 영농자산 합산)」이라고 고정 문구로 표시된다. 그러나 566-572행 onCheckedChange는 마지막 체크를 해제할 때 `qualifiedHeirIds: []`를 저장한다(571행 주석이 「자격자 0명」으로 의도 명시). 두 상태(undefined=미선택, []=전부 해제)는 화면상 모든 토글이 꺼진 동일한 모습이고, 구분되는 신호는 577행의 작은 「↺ 되돌리기」 링크뿐인데 안내문은 undefined 기준 설명을 계속 유지한다.
- **근거**: components/calc/inheritance/FarmingEligibilitySection.tsx:545-551(고정 안내문)·554-576(토글, 571행 「모두 해제 시 빈배열(자격자 0명…)」)·577-587(되돌리기 링크) / lib/tax-engine/deductions/inheritance-farming-deduction.ts:209-215 resolveEffectiveQualifiedHeirIds가 []를 그대로 반환 / lib/calc/inheritance-deduction-suggest.ts:429-448 — qualifiedIds가 undefined가 아니면 useAllocation=true가 되어 heirAllocations 있는 자산의 합산액이 0이 된다
- **영향**: 사용자가 한 명을 체크했다가 다시 해제하면 화면은 처음 상태와 같아 보이지만 영농상속재산가액 자동 도출값이 0으로 떨어지고(협의분할이 입력된 자산 기준) 영농상속공제(최대 30억)가 사라진다. 화면의 설명문은 그 반대(전체 합산)를 말한다.
- **제안**: 안내문을 `qualifiedHeirIds === undefined`일 때와 `[]`일 때로 분기해, 빈 배열 상태에서는 「자격 충족 상속인 0명으로 지정됨 — 영농상속재산가액 0」임을 명시한다(되돌리기 링크는 유지).
- **대조**: `lib/tax-engine/deductions/inheritance-farming-deduction.ts:209` · `lib/calc/inheritance-deduction-suggest.ts:429`
- **½ 정정(code-fact)**: FarmingEligibilitySection.tsx:545-551의 안내문은 `qualifiedHeirIds === undefined`만 설명하고, 전부 해제로 만들어지는 `[]`(자격자 0명 → 영농상속재산가액 0) 상태를 설명하지 않는다 — 파일 내부 문구/상태 불일치는 실재한다. 다만 이 컴포넌트는 a67b2871(2026-06-02)에서 유일한 마운트 지점 step4-5.tsx가 삭제된 뒤 **앱 어디에서도 렌더되지 않는 고아 컴포넌트**(import처는 테스트 4파일뿐)이고 `set({ farming: ... })` 쓰기 경로도 없어, 서술된 사용자 영향(체크 후 해제 → 공제 30억 소실)은 현행 앱에서 재현 불가다. 게다가 재마운트하더라도 Step4의 AutoSuggestBadge가 suggest notes의 「⚠️ 자격 충족 상속인 0명 — 영농상속재산가액 0 (§16⑤ 본문)」를 표시하므로 무신호도 아니다. ⇒ 실제 처리 대상은 「고아 컴포넌트(재마운트 시 안내문 분기 필요)」이며, 문구 분기 수정은 재마운트를 전제로 할 때만 의미가 있다.
- *(리뷰 ID c08-4)*

### IG-111 · showAreaInput을 true로 넘기는 호출부가 없어 분배 면적 입력 경로가 없다

`[2/2]` · **MINOR** · F-도달가능성 · `components/calc/inheritance/HeirAllocationInput.tsx:243`

- **현상**: 분배 면적(㎡) 입력은 `{selected && showAreaInput && ...}` 게이트 안에 있고 showAreaInput의 기본값은 false다. 저장소 전체에서 이 prop을 전달하는 호출부는 0건이다(HeirAllocationToggleSection.tsx:66-73, DebtItemEditor.tsx:116-121, ExemptionChecklist.tsx:223-228, PresumedInheritanceInput.tsx:243-248 모두 미전달). 즉 HeirAllocation.areaM2에 값을 넣을 UI 경로가 존재하지 않는다.
- **근거**: components/calc/inheritance/HeirAllocationInput.tsx:72·101·243 / `grep -rn showAreaInput` 결과 전 저장소 3건이 모두 이 파일 자신(worktree 제외) / 소비처: lib/calc/besshi-buppyo-2-data.ts:306-307 `item.areaSqm ?? alloc.areaM2 ?? …`, components/calc/results/source-summary/source-summary-helpers.ts:49-62
- **영향**: 파일 헤더(6-7행)가 지원 목적으로 명시한 「공장부지 1물건을 배우자 2,500㎡ + 차남 1,500㎡로 분할」 케이스에서 상속인별 면적을 입력할 수 없고, 별지 제9호 부표2 「수량·면적」 칸의 areaM2 fallback이 영구히 사문화된다.
- **제안**: 자산-수준 호출부(HeirAllocationToggleSection)에서 showAreaInput을 전달하거나, 쓰지 않기로 확정했다면 prop과 updateArea·areaM2 fallback 소비처를 정리한다. 살릴 경우 현재 native `<input type="text">`+parseFloat은 소수 입력이 불가하므로(제어값이 즉시 숫자로 되돌아감) 형제 구현과 같이 DecimalInput+parseDecimal로 바꿔야 한다(components/calc/exemption/ExemptionChecklist.tsx:148-156).
- **대조**: `lib/calc/besshi-buppyo-2-data.ts:307` · `components/calc/results/source-summary/source-summary-helpers.ts:61` · `components/calc/exemption/ExemptionChecklist.tsx:148`
- *(리뷰 ID c08-5)*

### IG-112 · 재해손실공제 카드가 자기 토글을 끄면 스스로 언마운트된다

`[2/2 · ½]` · **MINOR** · F-도달가능성 · `components/calc/inheritance/Step4Deductions.tsx:458`

- **현상**: CasualtyLossSection은 자체 ToggleCard가 form.casualtyLossEnabled를 쓰는데, 그 카드를 렌더하는 조건도 manualActive.casualtyLoss(=casualtyLossEnabled)다. 즉 카드 안 스위치를 OFF로 내리는 순간 카드 자체가 사라진다.
- **근거**: Step4Deductions.tsx:458 `{manualActive.casualtyLoss && <CasualtyLossSection .../>}` · lib/calc/inheritance-deduction-checklist.ts:202-206 isManualItemActive("casualtyLoss") = form.casualtyLossEnabled · components/calc/inheritance/CasualtyLossSection.tsx:57-58 `checked={form.casualtyLossEnabled} onCheckedChange={(v) => set({ casualtyLossEnabled: v })}`.
- **영향**: ToggleCard의 OFF 상태(tone 배경 유지 · 스위치 좌측)가 구조적으로 렌더될 수 없다. 사용자는 스위치를 내린 직후 카드가 통째로 사라져 되돌리는 법을 잃는다(복구는 상단 체크리스트 칩으로만 가능 — 같은 화면 다른 위치라 연결이 드러나지 않는다).
- **제안**: 카드 렌더 게이트를 별도 축으로 분리하거나(칩 override로만 표시 여부 결정), CasualtyLossSection 내부 ToggleCard를 제거해 칩을 유일한 ON/OFF 컨트롤로 둔다.
- **대조**: `components/calc/inheritance/CasualtyLossSection.tsx:57` · `lib/calc/inheritance-deduction-checklist.ts:202`
- **½ 정정(rule-impact)**: CasualtyLossSection은 저장소에서 **유일하게** 자기 ToggleCard의 필드(`casualtyLossEnabled`)로 자신의 렌더 게이트가 결정되는 컴포넌트다 — 형제(InstallmentInputSection·PaymentInKindInputSection·UnlistedStockSpecialReasonSection)는 무조건 렌더, CulturalHeritageSection은 독립 축 게이팅. 그 결과 카드 내부 스위치를 OFF로 내리면 카드가 언마운트되어 ToggleCard의 OFF 상태가 이 컴포넌트에서는 렌더될 수 없다.

단, **사용자가 되돌리는 법을 잃지는 않는다**: 체크리스트 칩이 항상 렌더되고(Step4DeductionChecklist.tsx:322) OFF 스타일·라벨·`title="클릭하여 입력 섹션 열기"`를 유지하며, 칩↔섹션 연결은 화면 문구 2곳(Step4Deductions.tsx:197-198, 패널 헤더)에 명시돼 있고 입력값도 보존된다. 또한 components/calc/CLAUDE.md의 OFF-tone 규칙은 OFF의 도달가능성을 요구하지 않으므로 규칙 위반은 아니다 — 관례 이탈에 따른 UX 일관성 문제다.

수정 방향은 **내부 ToggleCard 제거(칩을 유일 ON/OFF 컨트롤로)로 한정**된다. "칩 override로 별도 축 분리"는 anchor 테스트 C-3(inheritance-deduction-checklist.test.ts:215-223)이 잠근 「단일 진실·override 무시」를 깨뜨리므로 제안에서 제외해야 한다.
- *(리뷰 ID c09-4)*

### IG-113 · 배우자 칩은 배우자 상속인이 없어도 「직접 입력 가능」이라 안내한다

`[2/2]` · **MINOR** · A-배관 · `components/calc/inheritance/Step4DeductionChecklist.tsx:304`

- **현상**: AUTO_KEYS 4개 칩은 조건 없이 전부 렌더되고, 미감지 칩은 title이 「클릭하여 직접 입력란 열기」다. 그러나 배우자 §19 입력 칸은 Step4Deductions에서 hasSpouse 게이트 안에 있다.
- **근거**: Step4DeductionChecklist.tsx:304-312 `{AUTO_KEYS.map(...)}` (게이트 없음) · :143-153 미감지 칩 title="클릭하여 직접 입력란 열기" · Step4Deductions.tsx:250 `{hasSpouse && (` 배우자 §19 CurrencyInput · :91-97 autoDetected.spouse = hasSpouse.
- **영향**: 배우자 상속인이 없는 케이스에서 칩을 눌러도 그룹 A만 펼쳐지고 배우자 칸은 나오지 않는다. 형제 3개(금융·동거·영농)는 항상 노출이라 칩과 칸이 1:1인데 배우자만 어긋나, 「칸을 찾지 못하는」 상태가 된다.
- **제안**: 배우자 칩을 hasSpouse일 때만 렌더하거나, hasSpouse=false면 disabled + 사유(「배우자 상속인이 없습니다」)를 함께 표시한다.
- **대조**: `components/calc/inheritance/Step4Deductions.tsx:250` · `components/calc/inheritance/Step4Deductions.tsx:91`
- *(리뷰 ID c09-5)*

### IG-114 · 기존 대습 그룹 선택 시 피대습자 성명만 동기화하고 원래순위는 안 맞춘다

`[2/2]` · **MINOR** · B-3중패턴 · `components/calc/inheritance/SubstituteHeirPanel.tsx:139`

- **현상**: 이 컴포넌트는 forRelation을 그룹 속성으로 다룬다(:41 그룹 대표값으로 수집, :58-59 그룹 라벨에 사용). 그런데 기존 그룹을 고를 때 set()은 substituteGroupId·substituteAncestorName만 갱신하고 substituteForRelation은 이 상속인이 앞서 고른 값 그대로 둔다.
- **근거**: SubstituteHeirPanel.tsx:138-143 (`set({ substituteGroupId: v, substituteAncestorName: g?.ancestorName ?? ... })` — substituteForRelation 미포함) · :41 `forRelation: h.substituteForRelation` 그룹 대표값 수집 · lib/calc/inheritance-validate-substitute.ts는 그룹당 spouse 1인만 검증하고 forRelation 일치는 검증하지 않는다.
- **영향**: 한 그룹에 forRelation="child"와 "sibling"이 섞이면 lib/tax-engine/inheritance-legal-share.ts:151-162의 groupsByRel이 같은 gid를 childGroups·siblingGroups 양쪽에 넣고, :168-186에서 활성 순위 한쪽만 activeGroups가 되어 다른 쪽 멤버는 :228-235 shares 배열에 아예 들어가지 않는다 → 그 상속인의 법정상속분이 조용히 0이 되고 배우자공제 한도(법정상속분 기준)까지 움직인다.
- **제안**: 기존 그룹 선택 시 `substituteForRelation: g?.forRelation ?? heir.substituteForRelation`도 함께 set 하거나, validateSubstituteHeirs에 「같은 그룹은 원래순위가 동일해야 한다」 검증을 추가한다.
- **대조**: `lib/tax-engine/inheritance-legal-share.ts:151` · `lib/tax-engine/inheritance-legal-share.ts:228` · `lib/calc/inheritance-validate-substitute.ts:10`
- *(리뷰 ID c09-6)*

### IG-115 · 다이얼로그가 항상 마운트돼 있어 재오픈 시 이전 선택이 남는다

`[2/2]` · **MINOR** · F-도달가능성 · `components/calc/inheritance/estate-card/CategoryChangeDialog.tsx:98`

- **현상**: `useState<SupportedCategory>(currentCategory)`는 마운트 시 1회만 초기화된다. 호출부는 다이얼로그를 조건부 렌더하지 않고 항상 마운트한 채 `open` prop만 토글하므로(EstateItemEditor.tsx:285-294), 사용자가 다른 카테고리를 고른 뒤 취소하고 다시 열면 state가 그 선택을 그대로 유지한다.
- **근거**: CategoryChangeDialog.tsx:98(useState 초기값)·:106(isSameCategory)·:137(「현재 카테고리」 표시는 item.category 기준) / components/calc/EstateItemEditor.tsx:285-294(<CategoryChangeDialog open={categoryDialogOpen} …> — 조건부 렌더 아님)
- **영향**: 재오픈 시 상단 「현재 카테고리: 주택」과 라디오 선택(예: 현금)이 서로 다른 상태로 뜨고, amber 「필드 삭제」 경고와 rose 확인 버튼이 사용자가 이번에 아무것도 고르지 않았는데도 이미 활성화돼 있다. 무심코 확인을 누르면 의도치 않은 카테고리로 바뀐다.
- **제안**: `open`이 false→true로 바뀔 때 `setNewCategory(currentCategory)`로 리셋하거나(useEffect 대신 open 전이 감지용 key), 호출부에서 `{categoryDialogOpen && <CategoryChangeDialog …/>}`로 조건부 렌더해 마운트마다 초기화되게 한다.
- **대조**: `components/calc/EstateItemEditor.tsx:285`
- *(리뷰 ID c10-4)*

### IG-116 · 부표2 화면에 「(앞쪽)」·용지 규격 표기가 빠져 형제 서식과 어긋난다

`[2/2 · ½]` · **MINOR** · E-표시법령 · `components/calc/inheritance/besshi-buppyo-2/Buppyo2HeirSheet.tsx:47`

- **현상**: besshi-buppyo-2-constants.ts는 BP2_FORM_SIDE("(앞쪽)")와 BP2_FOOTER("210mm×297mm[백상지 80g/㎡]")를 서식 정적 텍스트 단일 출처로 선언(:16-17)하지만, Buppyo2HeirSheet의 머리글(:47-52)은 SUBTITLE·TITLE만 렌더하고 두 상수는 저장소 어디에서도 소비되지 않는다(grep 결과 정의부 외 참조 0건). 같은 상속세 서식 replica인 형제들은 모두 PAPER_FOOTER를 렌더한다.
- **근거**: components/calc/inheritance/besshi-buppyo-2/besshi-buppyo-2-constants.ts:16-17(BP2_FORM_SIDE·BP2_FOOTER 정의) / Buppyo2HeirSheet.tsx:47-52(머리글, 두 상수 미사용) / 형제 관례: Besshi1FormTable.tsx:161 · Besshi5FormTable.tsx:162 · Buppyo3FormTable.tsx:163 모두 `{PAPER_FOOTER}` 렌더, Besshi6_2FormTable.tsx:37은 `(앞쪽)`을 렌더 / grep으로 BP2_FORM_SIDE·BP2_FOOTER 소비처 0건 확인
- **영향**: 인쇄해 제출하는 공식 서식 재현에서 부표2만 앞·뒤쪽 구분 표기와 용지 규격 각주가 빠진다. 상수 2개는 소비처 없는 사문(死文)으로 남아 이후 서식 갱신 시 화면과 어긋난 채 방치된다.
- **제안**: Buppyo2HeirSheet 머리글 우측에 BP2_FORM_SIDE를, 시트 하단에 BP2_FOOTER를 형제 서식과 같은 위치·클래스(text-micro text-gray-500)로 렌더한다.
- **대조**: `components/calc/inheritance/deduction-besshi/Besshi1FormTable.tsx:161` · `components/calc/inheritance/deduction-besshi/Buppyo3FormTable.tsx:163` · `components/calc/inheritance/deduction-besshi/Besshi6_2FormTable.tsx:37`
- **½ 정정(code-fact)**: 성립하는 부분: BP2_FORM_SIDE·BP2_FOOTER는 화면(Buppyo2HeirSheet)과 PDF(InheritanceBuppyo2PdfDocument) 어디에서도 소비되지 않는 사문(死文)이고, 세로 형제 서식 3건(Besshi1:161·Besshi5:162·Buppyo3:163)이 모두 렌더하는 용지규격 각주가 부표2에만 빠져 있다 — SCREEN_PDF 인쇄 대상(inheritance-print-sections.ts:91)이므로 서식 재현 충실도 갭이 맞다.

성립하지 않는 부분: 「(앞쪽) 누락이 형제 관례와 어긋난다」는 과장이다. 인용된 형제 4건 중 (앞쪽)을 렌더하는 것은 Besshi6_2:37 하나뿐이고(나머지 3건은 grep 0건), 그 서식은 :43이 명시하듯 실제 양면 서식인 반면 부표2는 (뒤쪽) 상수가 없고 2쪽이 조건부 「별지 계속」 오버플로다. 또한 제안대로 BP2_FOOTER를 그대로 렌더하면 landscape로 렌더되는 서식(:315,327)에 세로 규격 210mm×297mm를 찍게 되는데, 이 저장소의 landscape 관례는 297mm×210mm다(GiftValuationFormPdfDocument.tsx:314 · GiftTaxValuationFormTable.tsx:422).

⇒ 조치는 「두 상수를 그대로 렌더」가 아니라 ①BP2_FOOTER 값이 공식 부표2의 실제 용지 방향과 맞는지 먼저 확인해 정정하고 ②화면과 PDF 양쪽에 함께 렌더하며 ③BP2_FORM_SIDE는 (뒤쪽) 대응이 정리되기 전까지는 렌더 대신 상수를 제거하거나 미사용 사유를 남기는 쪽이다.
- *(리뷰 ID c10-5)*

### IG-117 · 날짜 역변환에 new Date() 직접 호출 — date-coerce 정책 위반

`[2/2 · ½]` · **MINOR** · A-배관 · `components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx:52`

- **현상**: strToDate(:50-54)가 `new Date(s)`를 직접 호출하고, HousingFieldSet·NonHousingFieldSet·일시적2주택도 각각 `new Date(v)`를 인라인한다(:451·:587·:609·:658). 루트 CLAUDE.md는 '신규 코드 new Date(x) 직접 호출 금지 / toDate·toOptionalDate 사용'을 명시하고, 같은 디렉터리 형제 파일 BurdenedGiftValuationModeSection.tsx는 toOptionalDate를 import해(:19) constructionDate에 적용한다(:357) — 주석까지 'new Date 직접 호출 금지 — 역변환은 toOptionalDate'라고 적혀 있다(:23). 더해 두 파일의 dateToStr이 서로 다르다: 이 파일은 로컬 getter(:44-47), 형제는 toISOString(:25).
- **근거**: BurdenedGiftTransferSection.tsx:50-54·:42-48·:451·:587·:609·:658 / BurdenedGiftValuationModeSection.tsx:19·:23-26·:357 / lib/api/date-coerce.ts:toOptionalDate / CLAUDE.md 'API Date 직렬화' 절
- **영향**: new Date("YYYY-MM-DD")는 UTC 자정으로 파싱되는데 이 파일의 dateToStr은 로컬 getFullYear/getMonth/getDate로 되돌린다 — UTC보다 서쪽 타임존에서는 왕복 시 하루가 앞당겨져 취득일·종전/신규 주택 취득일이 화면에서 하루 어긋난다(보유기간·§155① 판정 입력). 형제 파일은 UTC-in/UTC-out이라 같은 카드 안에서 두 규칙이 공존한다.
- **제안**: strToDate와 4곳의 인라인 new Date(v)를 toOptionalDate(v)로 교체하고, dateToStr을 형제 파일과 동일하게 toISOString().slice(0,10) 기준으로 통일한다.
- **대조**: `lib/api/date-coerce.ts` · `components/calc/inheritance/estate-card/variants/BurdenedGiftValuationModeSection.tsx:23-26` · `components/calc/inheritance/estate-card/variants/BurdenedGiftValuationModeSection.tsx:357`
- **½ 정정(code-fact)**: 인용된 코드 사실은 전건 정확하다(줄번호 6곳 모두 일치, strToDate는 :232에서 실제 사용되어 dead code 아님, 형제 파일 :19·:23-26·:357도 서술대로). 그러나 결함의 소재가 뒤바뀌어 있다.

(1) 제안의 전반부는 no-op이다. `toOptionalDate`는 문자열 입력에 대해 `const d = new Date(value); return isNaN(d.getTime()) ? undefined : d`를 그대로 실행한다(date-coerce.ts:60-64). :52·:451·:587·:609·:658을 `toOptionalDate(v)`로 바꾸면 **완전히 동일한 Date**가 나오며 주장된 하루 어긋남을 한 건도 고치지 못한다. 이 5곳의 교체는 순수한 정책·스타일 정합(루트 CLAUDE.md "신규 코드 new Date(x) 직접 호출 금지") 사안이지 런타임 효과가 없다.

(2) 실제 결함은 반대 방향인 정변환(Date→str)에 있다 — UTC 자정 파싱과 짝지어진 로컬 getter `dateToStr`(:42-48)과 그 인라인 복제 3곳(:443-446 · :582 · :653). 제목 "날짜 **역변환**에 new Date() 직접 호출"은 오명명이다. 역변환은 멀쩡하고 정변환이 버그다. 제안의 후반부(dateToStr을 toISOString().slice(0,10)로 통일)만이 유일한 실효 수정이다.

(3) 영향의 방향은 맞으나 1차 피해는 표시다. DateInput은 부모가 값을 변형하면 강제 동기화한다(date-input.tsx:97-107 — `value !== lastEmittedRef.current`이면 return하지 않고 setYear/setMonth/setDay). 따라서 UTC 서쪽 타임존에서 2020-01-01 입력 시 화면은 즉시 2019-12-31로 뒤집히지만 **store에 저장된 Date는 2020-01-01T00:00Z로 올바르다** — 엔진(보유기간·§155① 판정)에 도달하는 값 자체는 이 시점에 정확하다. 다만 뒤집힌 표시를 사용자가 고치려 재입력하면 그때 잘못된 날짜가 저장되므로 엔진 값 오염은 2차적으로 도달 가능하다.

(4) 노출 범위: 이 앱은 KST(UTC+9) 대상이고 UTC+0 이상에서는 왕복이 안정적이라 실사용 노출은 낮다. 지적문도 "UTC보다 서쪽 타임존에서는"이라 스스로 한정하고 있어 이 점은 과장이 아니다.

(5) 형제 파일이 정답이라는 판단은 유효하다. 형제는 UTC-in(toOptionalDate)/UTC-out(toISOString)이라 전 타임존에서 안정적이고, sessionStorage 복원 경로(normalize-restored-form-dates.ts:112-126)도 toOptionalDate로 UTC 자정을 만들므로 이 파일을 toISOString 기준으로 통일해도 KST 역행 위험은 없다. 같은 카드 안 두 규칙 공존이라는 유지보수 지적도 성립한다.

⇒ 종합: 지적 보존. 단 제목·현상을 "정변환 dateToStr의 로컬 getter가 UTC 자정 파싱과 어긋나 UTC 서쪽에서 표시가 하루 밀린다(+ new Date 직접 호출 5곳은 별건의 정책 위반)"으로 정정하고, 수정 시 dateToStr 4곳(:42-48·:443-446·:582·:653) 통일이 본체·new Date 5곳 교체는 부수임을 명시해야 한다.
- *(리뷰 ID c11-3)*

### IG-118 · 옵션 카운트가 최대주주 §22②를 안 세어 칩과 숫자가 어긋난다

`[2/2 · ½]` · **MINOR** · E-표시법령 · `components/calc/inheritance/estate-card/chip-config.ts:304`

- **현상**: resolveChips는 major-shareholder 칩에 isActiveData: isMajor를 부여하는데(:286), countNonDefaultOptions(:298-315)는 isSection22MajorShareholder를 세지 않는다. ChipState.isActiveData의 문서 주석은 '판정 술어는 countNonDefaultOptions와 동일한 item 필드 기준 (단일 진실)'이라고 명시한다(:56-58). 두 값은 StockItemTableView의 **같은 행**에서 나란히 렌더된다 — 칩은 :95-100·:153에서, 카운트는 :101·:161-164에서.
- **근거**: chip-config.ts:56-58(단일 진실 주석)·:277-289(major-shareholder 칩, isActiveData: isMajor)·:304-314(countNonDefaultOptions — isSection22MajorShareholder 부재) / StockItemTableView.tsx:95-101·:153·:161-164 / EstateStockChipsHeader.tsx:86-88·:121(⚙️ 배지)
- **영향**: §22② 최대주주 보유주식 배제만 켠 주식 자산은 테이블 '분류·옵션' 열에 칩이 뜨는데 같은 행의 ⚙️ 카운트는 0이라 배지가 아예 사라지고, 카드 헤더의 '옵션 (N)' 배지에도 반영되지 않는다. 금융재산공제 배제라는 세액 영향 설정을 사용자가 '설정된 옵션'으로 인지하지 못한다.
- **제안**: countNonDefaultOptions에 `if (item.isSection22MajorShareholder === true) n++;`를 추가해 :286의 isActiveData 술어와 맞춘다.
- **대조**: `components/calc/inheritance/stock/StockItemTableView.tsx:95-101` · `components/calc/inheritance/stock/StockItemTableView.tsx:161-164` · `components/calc/inheritance/EstateStockChipsHeader.tsx:86-88`
- **½ 정정(rule-impact)**: countNonDefaultOptions(chip-config.ts:298-315)가 isSection22MajorShareholder === true를 세지 않는다. 이 필드는 기본 false(EstateCommonAttributesSection.tsx:223)이므로 true는 사용자 지정 비기본 옵션이고, 같은 성격의 deductSecuredClaimAsDebt === true는 :313에서 카운트된다 — 카운트 함수 자신의 「비기본 옵션」 판정에서만 이 필드가 누락된 드리프트다(PR-B FU-2로 8번째 칩을 추가할 때 count 미갱신). 근거를 ":56-58 단일 진실 주석 위반"에 두면 안 된다 — 기본 financial 자산의 section22는 isActiveData=true인데 count=0이며(테스트 :35-38 · :479-482에서 양쪽 다 anchor로 고정) 형제 EstateItemTableView.tsx:63-70이 그 상태를 상시 렌더하므로, 칩↔카운트 불일치 자체는 이 저장소가 허용하는 상태다. 영향도 정정: V1(상장·simple)에서는 rose "✓ 최대주주 §22②" 칩이 같은 셀에 남으므로 숫자만 빠질 뿐 인지 차단은 아니다. 반면 지적이 놓친 V2 formal 비상장주식은 칩 자체가 미노출(stock-valuation.ts:35-40)이고 section22 칩도 hidden_permanent(asset-toggle-visibility.ts:219-221)라 해당 행에 §22② 배제 표시가 전무해진다 — 제안 수정의 실질 가치는 여기에 있다.
- *(리뷰 ID c11-5)*

### IG-119 · 거래소 ON이 전환 토글을 언마운트하는데 ⑫는 그 안의 칸을 계속 요구

`[2/2]` · **MINOR** · A-배관 · `components/calc/inheritance/estate-card/variants/EstateBodyConvertibleBond.tsx:186`

- **현상**: 주식전환 ToggleCard(:271)와 그 하위 「권리락 전 주식가액」(:281)·「신주인수가액」(:316-317)은 전부 `{!traded && ( … )}` 블록(:186) 안에 있다. 반면 ⑫Zod는 `cbConvertible`이 true면 `cbTradedOnExchange` 값과 무관하게 preemptive 경로에서 두 필드를 필수로 요구한다.
- **근거**: components/calc/inheritance/estate-card/variants/EstateBodyConvertibleBond.tsx:186 `{!traded && (`, :271-277 (cbConvertible ToggleCard), :281·:316 (해당 입력칸) / lib/validators/estate-item-schema.ts:570-573 `if (item.cbConvertible) { if (isPreemptive) { need((item.cbExRightsPriorPrice ?? 0) > 0, …); need((item.cbSubscriptionPrice ?? 0) > 0, …); } }` — 이 분기는 :546의 preemptive 제외 때문에 거래소 ON일 때도 도달한다
- **영향**: 거래소 OFF 상태에서 전환 토글을 켠 뒤(또는 다른 증권 종류에서 켠 뒤 신주인수권증서로 바꾼 뒤) 거래소 ON으로 전환하면, 화면에 존재하지 않는 「권리락 전 주식가액을 입력하세요」로 계산이 막힌다. 사용자가 거래소 토글을 다시 끄고 전환 토글을 꺼야 한다는 것을 스스로 알아내야 한다.
- **제안**: 거래소 ON 전환 시 `set({ cbTradedOnExchange: v, cbConvertible: v ? undefined : item.cbConvertible })`로 전환 플래그를 함께 해제하거나, ⑫의 :570 분기를 `if (item.cbConvertible && !item.cbTradedOnExchange)`로 좁힌다.
- **대조**: `lib/validators/estate-item-schema.ts:570` · `lib/validators/estate-item-schema.ts:546`
- *(리뷰 ID c12-4)*

### IG-120 · 원천징수율 0% 입력이 `|| undefined`에 먹혀 항상 14%로 되돌아감

`[2/2]` · **MINOR** · B-3중패턴 · `components/calc/inheritance/estate-card/variants/EstateBodyFinancial.tsx:251`

- **현상**: onChange가 `v === "" ? undefined : parseDecimal(v) || undefined` 이고, `parseDecimal("0")`은 0이므로 `0 || undefined` → undefined 가 된다. 표시값은 `item.savingsWithholdingRate != null ? String(...) : "14"`(:243-247)이라 사용자가 0을 입력하는 즉시 칸이 「14」로 되돌아간다. 같은 저장소·같은 청크에서 0을 유효값으로 다루는 필드는 `|| undefined` 없이 처리한다.
- **근거**: components/calc/inheritance/estate-card/variants/EstateBodyFinancial.tsx:243-253 / parseDecimal 정의: components/calc/inputs/DecimalInput.tsx:92-96 (`"0"` → 0) / 0을 살리는 형제 관례: EstateBodyConvertibleBond.tsx:210 `cbCouponRate: v.trim() === "" ? undefined : parseDecimal(v)`, :344 (cbPriorDividendRate 동일) / 엔진 fallback: lib/tax-engine/property-valuation-deposit.ts:81 `withholdingRate: item.savingsWithholdingRate ?? 14`
- **영향**: 비과세종합저축 등 원천징수율 0%인 예금을 §63④ 자동 계산 모드로 입력할 수 없다. 항상 14%(+지방소득세 1.4%)가 미수이자에서 차감되어 평가액이 과소 산출된다.
- **제안**: `savingsWithholdingRate: v.trim() === "" ? undefined : parseDecimal(v)` 로 두 번째 `|| undefined`를 제거(형제 파일 EstateBodyConvertibleBond.tsx:210과 동일 형태).
- **대조**: `components/calc/inputs/DecimalInput.tsx:92` · `lib/tax-engine/property-valuation-deposit.ts:81`
- *(리뷰 ID c12-5)*

### IG-121 · RTMS 자동조회 버튼이 평가기준일 미입력을 disabled 조건에서 빠뜨려 클릭 무반응

`[2/2]` · **MINOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx:332`

- **현상**: `rtmsDisabled = !hasAddress || !hasSigunguCode || !hasArea || !hasStandardPrice` 에 valuationDate가 없다. 그런데 모달 렌더는 `{cat === "real_estate_apartment" && rtmsModalOpen && valuationDate && ( … )}`(:464)로 valuationDate를 요구한다. valuationDate는 optional prop(variants/types.ts:15)이고 상위에서 `form.deathDate`/`form.giftDate`를 그대로 넘긴다.
- **근거**: components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx:332·:433·:464 / variants/types.ts:15 `valuationDate?: string;` / 상위 전달: components/calc/inheritance/Step1Estate.tsx:96 `valuationDate={form.deathDate}`, components/calc/gift-tax-form-shared.tsx:458 `valuationDate={form.giftDate}` (양쪽 다 빈 문자열 가능 — components/calc/InheritanceTaxForm.tsx가 곳곳에서 `form.deathDate || undefined` 로 방어) / 형제 관례: components/calc/PriorGiftInput.tsx:148-153 는 같은 modalLauncher를 `disabled={!canLookup}` + title "1단계에서 상속개시일을 먼저 입력하세요" 로 막는다
- **영향**: 상속개시일(증여일)을 아직 입력하지 않은 상태에서 주소·면적·기준시가만 채우면 「자동조회」 버튼이 활성 상태로 보인다. 눌러도 모달이 열리지 않고 오류·안내도 없어, 사용자는 기능이 고장 났다고 판단한다.
- **제안**: rtmsDisabled에 `|| !valuationDate` 를 추가하고 rtmsDisabledReason 체인에 「상속개시일(증여일)을 먼저 입력해주세요」 분기를 넣는다(PriorGiftInput.tsx:151-153과 동일 패턴).
- **대조**: `components/calc/inheritance/estate-card/variants/types.ts:15` · `components/calc/PriorGiftInput.tsx:151` · `components/calc/inheritance/Step1Estate.tsx:96`
- *(리뷰 ID c12-6)*

### IG-122 · 공용 RadioCardGroup·ToggleCard에 넘긴 data-testid가 DOM에 나가지 않음

`[2/2]` · **MINOR** · D-타입 · `components/calc/inheritance/estate-card/variants/EstateBodyCryptoAsset.tsx:119`

- **현상**: RadioCardGroupProps·ToggleCardProps 어디에도 `data-testid`가 없고 두 컴포넌트 모두 `...props` 스프레드를 하지 않는다. JSX의 하이픈 포함 속성은 TypeScript 초과 프로퍼티 검사를 통과하므로 tsc가 잡지 못하고 값만 조용히 버려진다. 같은 디렉터리의 형제 파일들은 이미 올바른 우회 수단을 쓴다.
- **근거**: components/calc/inheritance/estate-card/variants/EstateBodyCryptoAsset.tsx:119(RadioCardGroup)·:132(ToggleCard), EstateBodyFinancial.tsx:149·:190(RadioCardGroup) / 미선언 확인: components/calc/inputs/RadioCardGroup.tsx:106-122 (RadioCardGroupProps), components/calc/inputs/ToggleCard.tsx:136-163 (ToggleCardProps) — 둘 다 구조분해만 하고 rest 스프레드 없음 / 올바른 형제 관례: EstateBodyIntangibleIp.tsx:90 `options={IP_TYPE_OPTIONS.map((o) => ({ ...o, testId: … }))}` (RadioCardOption.testId는 RadioCardGroup.tsx:197에서 실제 input에 부여됨), EstateBodyPeriodicPayment.tsx:76 는 `<div data-testid=…>` 래퍼 사용
- **영향**: 의도한 셀렉터가 DOM에 존재하지 않는다. 현재 E2E(e2e/deposit-savings-valuation-63-4.spec.ts:116)는 `input[name*="savings-accrual-method"]`로 name 속성을 쓰고 있어 지금 깨지지는 않지만, 이 testid를 믿고 셀렉터를 작성하는 다음 테스트는 원인 없이 실패한다.
- **제안**: RadioCardGroup은 `options`의 `testId`(EstateBodyIntangibleIp.tsx:90 방식)로, ToggleCard는 `<div data-testid=…>` 래퍼(EstateBodyRealEstate.tsx:704 방식)로 바꾸고, 전달되지 않는 `data-testid` prop 4곳은 제거한다.
- **대조**: `components/calc/inputs/RadioCardGroup.tsx:106` · `components/calc/inputs/ToggleCard.tsx:136` · `components/calc/inheritance/estate-card/variants/EstateBodyIntangibleIp.tsx:90` · `components/calc/inheritance/estate-card/variants/EstateBodyFinancial.tsx:149`
- *(리뷰 ID c12-7)*

### IG-123 · 복수가업 미리보기가 자격 미충족일 때도 0이 아닌 공제액을 보여준다

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/inheritance/estate-card/variants/FbAdditionalBusinessesSection.tsx:183`

- **현상**: 미리보기는 `value.length > 0`이면 무조건 `calcMultipleFamilyBusinessDeduction`을 호출해 「복수가업 공제 합계」를 렌더한다(:64-75, :183-203). 컴포넌트는 자격 판정 결과를 prop으로 받지 않는다. 반면 엔진은 `hasMultiple = finalEligible && additional.length > 0` 게이트를 두어 자격 미충족이면 순차공제를 아예 계산하지 않고 공제액을 0으로 만든다.
- **근거**: components/calc/inheritance/family-business/FbAdditionalBusinessesSection.tsx:39-49(props에 자격 정보 없음) · :64-75(preview useMemo — 게이트 없음) · :183-203(합계 렌더) / lib/tax-engine/deductions/family-business.ts:354-368(`finalEligible = reasons.length === 0`, `hasMultiple = finalEligible && additional.length > 0`) · :381-386(미충족 시 cap 0 → deduction 0) / components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:544-558(바로 위에 「✗ 자격 미충족」 카드가 렌더됨)
- **영향**: 「✗ 자격 미충족」 카드 바로 아래에서 「복수가업 공제 합계 nn원」이 표시되어, 실제 결과 화면의 공제액 0과 어긋난다.
- **제안**: 자격 충족 여부를 prop으로 받아 미충족이면 미리보기를 감추거나 「자격 미충족 — 실제 공제 0」 안내로 대체한다.
- **대조**: `lib/tax-engine/deductions/family-business.ts:367` · `lib/tax-engine/deductions/family-business.ts:383`
- *(리뷰 ID c13-5)*

### IG-124 · 「회수불가능 사유」 hint가 존재하지 않는 별지 표기를 약속한다

`[2/2 · ½]` · **MINOR** · E-표시법령 · `components/calc/inheritance/estate-card/variants/EstateBodyReceivable.tsx:205`

- **현상**: hint가 「채무자 파산·부도 등 근거 (별지 표기)」라고 안내하지만, `receivableUncollectibleReason`을 읽는 코드는 타입 선언과 Zod 스키마뿐이다. 결과뷰·별지 서식·엔진 어디에서도 소비되지 않는다.
- **근거**: components/calc/inheritance/estate-card/variants/EstateBodyReceivable.tsx:205(hint 문구) · :206-212(입력) / 저장소 전역 grep 결과 `receivableUncollectibleReason` 소비처는 lib/tax-engine/types/inheritance-gift-estate.types.ts:344(선언)와 lib/validators/estate-item-schema.ts:456(스키마) 2곳뿐 — 렌더·계산 사용처 0건
- **영향**: 사용자가 신고서에 반영될 것으로 믿고 사유를 적지만 어떤 출력물에도 나타나지 않는다.
- **제안**: 별지 출력이 아직 없다면 hint에서 「(별지 표기)」를 빼고 보관용 메모임을 밝히거나, 별지에 실제로 행을 추가한다.
- **대조**: `lib/validators/estate-item-schema.ts:456` · `lib/tax-engine/types/inheritance-gift-estate.types.ts:344`
- **½ 정정(rule-impact)**: 「회수불가능 사유」 hint의 "(별지 표기)"가 모호해, 입력값이 앱의 어떤 출력물에도 나타나지 않는데 별지에 찍히는 것으로 오해될 수 있다. 필드는 타입 주석상 의도된 「메모」이므로(inheritance-gift-estate.types.ts:343) 결함은 「죽은 필드」가 아니라 **문구 모호성** 한 가지다. 조치도 문구 정정 하나로 한정된다 — hint를 "보관용 메모(신고 시 별지·증빙에 직접 기재)" 취지로 바꾼다. 공식 부표에 비고·사유 칸이 없으므로(GiftTaxValuationFormTable.tsx:206-215) 「별지에 행 추가」 대안은 채택 불가다.
- *(리뷰 ID c13-6)*

### IG-125 · 대표이사 재직구간 절반 입력 시 '입력 필요'가 아니라 '미충족' 표시

`[2/2]` · **MINOR** · F-도달가능성 · `components/calc/inheritance/family-business/FbDecedentRequirementsSection.tsx:85`

- **현상**: `ceoResult`의 null(=amber 「입력 필요」) 가드가 `!periods?.length || !fb.openingDate` 두 경우만 덮는다. 취임일만 입력하고 퇴임일을 아직 안 넣은 상태에서는 `handlePeriodChange`가 `[{startDate:"2005-01-01", endDate:""}]`를 저장하므로 periods.length는 1이 되고, 엔진 `clipDays`가 빈 endDate에 대해 0을 반환해 ratioPercent 0·met false가 나온다. 결과적으로 미리보기가 rose ✗ 「미충족 — 재직 비율 0.0% ... 미충족」을 표시한다.
- **근거**: 가드: 본 파일 :83-87(과 :91-103의 문구 분기). 반쪽 구간 생성 지점: :110-119. clipDays의 빈 문자열 처리: lib/tax-engine/deductions/family-business-autoderive.ts:106-111(`e = pe < hi ? pe : hi` → "", 이어서 `s >= e` → 0). validate도 양쪽이 다 있을 때만 검사하므로 차단되지 않는다: lib/calc/inheritance-validate.ts:98-104. 이 파일 헤더 :14는 「미입력 시 false(보수적) + amber 안내」를 정책으로 선언한다.
- **영향**: 자연스러운 입력 순서(취임일 먼저)에서 사용자가 「요건 미충족」이라는 확정적 빨간 판정을 보게 되어, 실제로는 입력이 덜 된 상태를 법적 결론으로 오해한다. 그대로 계산을 실행하면 실제로 나목 미충족으로 공제가 부인되는데 validate 경고도 없다.
- **제안**: null 가드를 `!periods?.[0]?.startDate || !periods?.[0]?.endDate || !fb.openingDate`로 넓혀 반쪽 구간을 amber(퇴임일 입력 안내)로 분류한다.
- **대조**: `lib/tax-engine/deductions/family-business-autoderive.ts:106` · `lib/calc/inheritance-validate.ts:98`
- *(리뷰 ID c14-8)*

### IG-126 · 평가조서(을) 금액 칸에 font-mono 누락 — 형제 평가조서는 준수

`[2/2 · ½]` · **MINOR** · E-표시법령 · `components/calc/inheritance/listed-stock/besshi/Page2DailyClosingTable.tsx:44`

- **현상**: 종가 셀(ClosingCell)과 소계·종가합계·종가평균 행이 text-right tabular-nums 만 쓰고 font-mono 가 없다. 갑지 값 칸(Page1CoverSection.tsx:48)도 동일. 형제인 비상장주식 평가조서는 모든 금액 셀에 text-right font-mono 를 적용한다.
- **근거**: components/calc/inheritance/listed-stock/besshi/Page2DailyClosingTable.tsx:37,44,162,175,191,207,223 · 형제 components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable.tsx:129 · BesshiSharedAtoms.tsx:46,71 · 공용 components/calc/results/shared/BesshiRow.tsx:58-59 · 규칙 components/calc/CLAUDE.md:176
- **영향**: 4그룹 × 31행 종가 표와 합계 행에서 천·백만 단위 콤마가 행마다 어긋나 대조·검산이 어렵다. 인쇄·PDF 서식 재현 품질에 직접 영향.
- **제안**: ClosingCell 및 소계·합계·평균 td 의 className 에 font-mono whitespace-nowrap 추가(공용 BesshiRow/BesshiColumn 재사용도 가능).
- **대조**: `components/calc/results/shared/BesshiRow.tsx:58` · `components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable.tsx:129`
- **½ 정정(code-fact)**: 상장주식 평가조서(을) `Page2DailyClosingTable.tsx`의 종가 셀(`:37,:44`)과 소계·종가합계·종가평균 행(`:162,:175,:207,:223`)이 `text-right tabular-nums`만 쓰고 `font-mono`가 없어, `components/calc/CLAUDE.md:176` 및 `amount-column-align` 스킬이 명시한 안티패턴(「tabular-nums 단독」)에 해당한다. 형제 모듈(unlisted-stock-v2/besshi)은 `TD_AMT = "border border-black p-1 text-right font-mono"` 상수로 금액 셀 100% 준수하므로 대조 성립. 단 두 가지를 정정한다: (1) 근거에 함께 열거된 `:191`은 거래일수 카운트 행(text-center)으로 금액 칸이 아니어서 대상 제외, (2) 갑지 `Page1CoverSection.tsx:48`은 법인명·대표자·주소·날짜·퍼센트를 함께 렌더하는 **공용 값 셀**이라 일괄 `font-mono` 추가는 부적절 — 금액 값(⑨⑩⑫⑮)에만 적용되도록 값 종류별 분기가 필요하다. 수정 범위는 ClosingCell + 소계·합계·평균 td 4곳(+ 선택적으로 갑지 금액 4칸)이며, 현행 클래스를 고정하는 테스트는 없어(parity·e2e에 className 단언 0건) 수정을 막는 안전망도 없다.
- *(리뷰 ID c15-5)*

### IG-127 · 협의분할 기준 평가액만 평가기준일 fallback을 빼먹어 테이블과 갈린다

`[2/2 · ½ · 강등 MAJOR→MINOR]` · **MINOR** · B-3중패턴 · `components/calc/inheritance/stock/StockItemEditor.tsx:372`

- **현상**: UnlistedStockCard가 협의분할용 effectiveValuation을 useMemo로 직접 구현하며 `evaluateUnlistedStockV2(v2)`를 원본 그대로 호출한다. 같은 파일이 이미 import한 단일 소스 `computeStockValuation(item, valuationDate)`는 `if (!v2.evaluationDate && valuationDate) v2 = { ...v2, evaluationDate: vd }` fallback을 적용한다. 테이블 행(computeEffectiveValuation)과 V2 카드 미리보기(effectiveInput)는 이 fallback을 적용하고, 이 useMemo만 적용하지 않는다.
- **근거**: StockItemEditor.tsx:367-389(useMemo)·:40(computeStockValuation import)·:171(상장 분기만 단일 소스 사용) · resolve-estate-item-value.ts:98(fallback 주입) · estate-item-valuation.ts:198 · StockItemTableView.tsx:91
- **영향**: CorporateInfoSection에서 평가기준일을 지우면 store의 evaluationDate가 undefined가 된다(CorporateInfoSection.tsx:268이 undefined를 그대로 전달). 그 상태에서 converted-shares.ts:89의 `c.changeDate <= evaluationDate`가 전부 false가 되어 자본금 변동이 통째로 환산에서 빠진 평가액이 나온다. 테이블 평가액·V2 미리보기는 fallback을 넣어 정상값을 보이는데 협의분할 expectedTotal만 다른 값이 되고, 그 값이 HeirAllocationInput의 잔여 자동입력(remaining = expectedTotal − sum)으로 heirAllocations에 그대로 기입된다 — 엔진 입력이 틀어진다.
- **제안**: useMemo 본문을 `computeStockValuation(item, valuationDate)` 호출로 교체한다(상장 분기가 이미 쓰는 단일 소스).
- **대조**: `lib/tax-engine/valuation/resolve-estate-item-value.ts:98` · `lib/calc/estate-item-valuation.ts:198` · `components/calc/inheritance/stock/StockItemTableView.tsx:91` · `components/calc/inheritance/HeirAllocationInput.tsx:123` · `lib/tax-engine/property-valuation/converted-shares.ts:89`
- **½ 정정(code-fact)**: 【성립하는 부분】StockItemEditor.tsx:367-389의 useMemo가 evaluateUnlistedStockV2(v2)를 원본 그대로 호출해 evaluationDate fallback을 적용하지 않는 것은 사실이다. 같은 파일 :40이 computeStockValuation을 import하고 :171(상장 분기)이 그것을 쓰며, 테이블 행(StockItemTableView.tsx:91 → estate-item-valuation.ts:198 → resolve-estate-item-value.ts:98)과 V2 카드 미리보기(UnlistedStockV2Card.tsx:180-189 effectiveInput)는 fallback을 적용한다. valuationDate는 UnlistedStockCard 스코프에 이미 있고(:358, 래퍼 :531-539에서 전달), CorporateInfoSection.tsx:268이 strToDate("")→undefined를 그대로 store에 쓰는 것도 사실(:45-48). 즉 "화면 안에서 같은 평가액이 두 숫자로 갈린다"는 현상 자체는 실재한다.

【성립하지 않는 부분 1 — "이 useMemo만 적용하지 않는다"】틀렸다. 엔진 권위 경로가 똑같이 fallback을 적용하지 않는다. property-valuation.ts:498-502가 V2 formal을 evaluateUnlistedStockV2AsPropertyResult로 라우팅하고, :600이 `evaluateUnlistedStockV2(item.unlistedStockValuationV2)`를 fallback 없이 원본 그대로 호출한다. resolveEngineValuatedAmount(:519-521)도 이 경로다. 따라서 fallback 미적용 진영은 useMemo·엔진·resolveEngineValuatedAmount 셋이고, 적용 진영이 테이블·V2 미리보기·inheritance-validate-unlisted(:44-50 ctx.evaluationDateFallback)다. useMemo는 예외가 아니라 엔진 쪽이다.

【성립하지 않는 부분 2 — 영향 "heirAllocations에 기입 → 엔진 입력이 틀어진다"】반증된다. 두 가지로 무너진다. (a) 협의분할 합계 검증인 validateEstateItemAllocations(inheritance-validate.ts:203-217)의 expected가 resolveEngineValuatedAmount = 엔진 권위값이고, 그 값이 곧 useMemo와 같은 fallback 미적용 값이다. 즉 잔여 자동입력(HeirAllocationInput.tsx:123)이 채우는 금액은 엔진·validate와 일치한다. 어긋나는 쪽은 오히려 테이블·미리보기 표시액이다. (b) evaluationDate가 undefined인 상태 자체가 엔진에 도달하지 못한다 — lib/validators/unlisted-stock-valuation-v2.schema.ts:150이 `evaluationDate: z.coerce.date()`(필수)이고 estate-item-schema.ts:282가 이를 그대로 물리므로, inheritance-api.ts:60-95의 body가 JSON.stringify로 undefined 키를 떨어뜨린 채 route.ts:52의 safeParse에 도달해 400으로 거부된다. 엔진 input이 틀어진 값으로 오염되는 시나리오는 발생하지 않는다.

【성립하지 않는 부분 3 — 제안이 역효과】제안대로 useMemo를 computeStockValuation(item, valuationDate)로 바꾸면 협의분할 expectedTotal이 fallback 적용값이 되어, validateEstateItemAllocations의 expected(엔진 권위 = fallback 미적용)와 어긋난다. 칩 클릭으로 자동 채운 금액이 곧바로 "협의분할 합계 X원 ≠ 평가액 Y원"으로 차단되는, CLAUDE.md ⑧이 금지하는 "UI 통과 ↔ validate 차단" 모순을 새로 만든다. 덧붙여 computeStockValuation은 computeEffectiveValuation이 앞에 두는 §60 시가 우선(marketValue·appraisedValue·similarSalesValue)을 갖지 않으므로, 제안대로 고쳐도 테이블과 일치하지 않는다.

【정정된 주장】"협의분할 기준 평가액만 fallback을 빼먹었다"가 아니라, "evaluationDate fallback이 세 층(표시 / 협의분할·엔진·allocation validate / Zod)에 서로 다른 정책으로 흩어져 있다"가 실제 결함이다. 고칠 지점은 useMemo 단독이 아니며, 고치는 방향도 useMemo에 fallback을 넣는 쪽이 아니라 엔진(property-valuation.ts:600)·Zod(필수 유지 여부)·표시 계층의 정책을 하나로 정하는 쪽이다. 남는 실제 피해는 "평가기준일을 지운 동안 테이블·미리보기 표시액과 협의분할 기준액이 다르게 보인다"이며, 그 상태로는 계산 자체가 400으로 막히므로 세액 오류로 이어지지 않는다 ⇒ MAJOR가 아니라 MINOR.
- *(리뷰 ID c16-2)*

### IG-128 · 전후 2개월 종가 평균이 CurrencyInput 대신 native input이다

`[2/2]` · **MINOR** · C-공용컴포넌트 · `components/calc/inheritance/stock/StockItemEditor.tsx:228`

- **현상**: 필수 금액 입력(`ls-avg-price`)이 native `<input type="text">` + `value={avgPrice.toLocaleString()}` + `parseInt`로 작성돼 있다. 같은 파일 274행(배당차액)·같은 기능의 형제 컴포넌트(CorporateInfoSection·ListedStockBesshiAttributesSection)의 금액 칸은 전부 CurrencyInput이다.
- **근거**: StockItemEditor.tsx:228-239 · 대비: StockItemEditor.tsx:274 · CorporateInfoSection.tsx:285·295·316 · components/calc/CLAUDE.md 「금액(원) input은 CurrencyInput + parseAmount」
- **영향**: 포커스 중에도 매 키 입력마다 콤마가 재삽입돼 문자열 중간을 고칠 때 캐럿이 끝으로 밀린다. CurrencyInput은 이 문제 때문에 포커스 중 raw 숫자만 표시하도록 만들어져 있다(CurrencyInput.tsx:89-91). 또 값이 0이면 `avgPrice > 0` 조건 때문에 입력한 「0」이 화면에서 사라진다.
- **제안**: `<CurrencyInput label="전후 2개월 종가 단순평균" hideLabel hideUnit value={String(avgPrice || "")} onChange={(v) => set({ listedStockAvgPrice: parseAmount(v) || undefined })} data-testid="ls-avg-price" />`로 교체(FieldCard로 라벨·hint 이관).
- **대조**: `components/calc/inputs/CurrencyInput.tsx:89`
- *(리뷰 ID c16-3)*

### IG-129 · 종가 평균 칸 placeholder가 「주당 순손익 입력」이라고 다른 항목을 지시

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/inheritance/stock/StockItemEditor.tsx:236`

- **현상**: 라벨은 「전후 2개월 종가 단순평균 (원/주)」인데 placeholder는 `"주당 순손익 입력 (원)"`이다. 주당 순손익은 비상장주식 §56 순손익가치 항목이라 이 필드와 무관하다.
- **근거**: StockItemEditor.tsx:226(라벨)·:236(placeholder)·:240(설명 「평가기준일 기준 전 2개월 + 후 2개월 종가 평균」)
- **영향**: 상장주식 평가액 전체를 좌우하는 필수 칸(§63①1호 가목)에 사용자가 다른 수치를 입력하도록 유도한다.
- **제안**: placeholder를 「전후 2개월 종가 단순평균」으로 정정하거나 비우고, 형식 안내는 FieldCard hint로 옮긴다.
- *(리뷰 ID c16-4)*

### IG-130 · 발행법인명 미입력 시 내부 rowId(UUID)를 화면에 그대로 노출

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/CrossHoldingResultCard.tsx:59`

- **현상**: 발행법인 셀이 `{h.issuerCorpName || h.rowId}`로 fallback한다. rowId는 `crypto.randomUUID()` 또는 `oh-<타임스탬프>-<랜덤>` 형태의 내부 식별자다.
- **근거**: CrossHoldingResultCard.tsx:59 · OtherUnlistedHoldingSection.tsx:24-31(newRowId 생성) · 저장소 내 `issuerCorpName || rowId` 표시는 이 1곳뿐(형제 관례 아님)
- **영향**: 이 카드는 입력 화면에서 실시간 렌더되므로(UnlistedStockV2Card.tsx:354) 법인명을 아직 안 적은 행이 있으면 사용자에게 UUID가 그대로 보인다. 계산 시점 validate(발행법인명 필수)는 입력 중에는 작동하지 않는다.
- **제안**: `h.issuerCorpName?.trim() || `발행법인 ${index + 1}`` 처럼 순번 라벨로 대체한다.
- **대조**: `lib/calc/inheritance-validate-unlisted.ts:215` · `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:354`
- *(리뷰 ID c16-5)*

### IG-131 · 추정이익 폐기 확인 게이트가 기관명·사유를 데이터로 안 본다

`[2/2 · ½]` · **MINOR** · F-도달가능성 · `components/calc/inheritance/unlisted-stock-v2/EstimatedProfitToggle.tsx:116`

- **현상**: OFF 전환 시 확인 다이얼로그를 띄울지 판정하는 `hasData`가 `agencyEstimates > 0`과 절차 3요건 boolean만 본다. `value.agencies`(기관 유형·기관명)와 `value.reasonCode`(기본값에서 변경했는지)는 판정에서 빠져 있다.
- **근거**: EstimatedProfitToggle.tsx:116-121(hasData)·:174-182(handleAgencyNameChange가 agencies에 기록)·:129-132(reasonCode 변경) · 파일 헤더 주석 「ON → OFF 시: Dialog 확인 후 estimatedProfit 통째 폐기 (dialog-data-discard-confirm)」
- **영향**: 사유를 고르고 평가기관 2곳의 유형·기관명을 입력한 뒤 금액을 아직 안 넣은 상태에서 토글을 끄면 확인 없이 입력이 전부 사라진다. 되돌릴 방법이 없다.
- **제안**: hasData에 `(value.agencies?.some((a) => a.name.trim() !== "") ?? false)`와 `value.reasonCode !== DEFAULT_INPUT.reasonCode`를 OR로 추가한다.
- **½ 정정(rule-impact)**: 추정이익 폐기 확인 게이트가 「평가기관 메타(유형·기관명)」를 데이터로 안 본다. hasData(EstimatedProfitToggle.tsx:116-118)가 `value.agencies`를 보지 않아, 사유를 고르고 평가기관 유형·기관명만 입력한 뒤(금액 미입력·절차 토글 OFF) 토글을 끄면 확인 없이 사라지고 복구 경로가 없다. 형제 EvaluationCommitteeToggle.tsx:63-67이 자유입력 `methodNotes`·`evaluatorOrganization`을 `.trim()`으로 챙기는 것과 어긋난다. 단, `reasonCode`(라디오)를 hasData에 넣으라는 제안 부분은 성립하지 않는다 — 형제 두 곳(EvaluationCommittee `method`, PreIpoListing `preparationType`) 모두 라디오 선택을 hasData에서 의도적으로 제외하는 것이 이 저장소의 관례다. 수정 시 기관명뿐 아니라 유형만 변경한 경우도 포함해야 한다(handleAgencyTypeChange:163-171은 name=""인 agencies를 만든다).
- *(리뷰 ID c16-6)*

### IG-132 · 영업권 배제 사유를 내부 enum 문자열 그대로 화면에 출력

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx:394`

- **현상**: "⚠️ 영업권 자동 배제 (상증령 §55 ③) — 사유: {result.goodwillCalculation.excludedByLaw}"로 렌더한다. excludedByLaw의 값은 "liquidation"·"real_estate_80"·"lt3y"·"continuous_loss_3y" 내부 식별자다(unlisted-stock-valuation.types.ts:293).
- **근거**: components/calc/inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx:392-395 · lib/tax-engine/types/unlisted-stock-valuation.types.ts:293
- **영향**: 결과 화면에 영문 enum id가 그대로 노출된다(내부 id 화면 노출 금지). 형제 3곳은 모두 한국어로 매핑한다 — GoodwillCalculationTable.tsx:61~64, besshi/Page5GoodwillTable.tsx:32, lib/pdf/UnlistedStockBesshiPdfDocument.tsx:69 — 이 파일만 예외다.
- **제안**: Page5GoodwillTable.tsx:32의 excludedReasonLabel(또는 동등한 Record<NonNullable<UnlistedGoodwillResult["excludedByLaw"]>, string>)을 공용으로 올려 이 지점에서도 재사용한다.
- **대조**: `components/calc/inheritance/unlisted-stock-v2/GoodwillCalculationTable.tsx:61` · `components/calc/inheritance/unlisted-stock-v2/besshi/Page5GoodwillTable.tsx:32` · `lib/pdf/UnlistedStockBesshiPdfDocument.tsx:69`
- *(리뷰 ID c17-5)*

### IG-133 · 최대주주 할증 배제 사유도 내부 enum 문자열 그대로 노출

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx:401`

- **현상**: "ℹ️ 최대주주 할증평가 배제 — 사유: {result.premiumExclusionReason} (상증령 §53 ⑧)"(:399~402)와 ⑦행 hint(:344)가 raw 값을 출력한다. result.premiumExclusionReason은 orchestrator가 premium.exclusionReason을 그대로 담은 StockPremiumExclusionReason enum이다(unlisted-orchestrator.ts:501, types:335).
- **근거**: components/calc/inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx:344·399-402 · lib/tax-engine/property-valuation/unlisted-orchestrator.ts:501 · lib/tax-engine/types/unlisted-stock-valuation.types.ts:32·335
- **영향**: "small_medium_enterprise"·"not_max_after_succession" 같은 영문 식별자가 결과 화면에 표시된다. 라벨 단일 소스 STOCK_PREMIUM_EXCLUSION_LABELS(상장·비상장 공용, §53⑧ 각 호 문구 검증본)가 이미 있고 엔진 property-valuation-stock.ts:203이 그것을 쓴다.
- **제안**: lib/tax-engine/data/stock-premium-exclusion-labels.ts의 STOCK_PREMIUM_EXCLUSION_LABELS(또는 SHORT_LABELS)를 import해 두 지점에 적용한다.
- **대조**: `lib/tax-engine/data/stock-premium-exclusion-labels.ts:17` · `lib/tax-engine/property-valuation-stock.ts:203` · `lib/tax-engine/property-valuation/unlisted-orchestrator.ts:501`
- *(리뷰 ID c17-6)*

### IG-134 · 신청·통지 기한 근거를 §49의2④로 인용 — 실제는 ⑤·⑥

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeFilingGuideCard.tsx:102`

- **현상**: 화면에 "② 신청·통지 기한 (§49의2④ — 상속세)"로 항 번호를 표시하고 파일 헤더도 "§49의2④ — 신청·통지 기한"이라 적었다(:12·:102). 현행 상증령 §49의2④는 위원의 해임·해촉 사유이고, 신청기한은 ⑤ 본문, 통지기한은 ⑥ 본문이다. 같은 카드가 첨부자료를 "§49의2⑤2호"로 인용하는데(:73), ⑤는 자료 열거와 신청기한을 함께 담은 항이므로 카드 내부에서 인용이 서로 어긋난다.
- **근거**: components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeFilingGuideCard.tsx:12·73·102 · 상증령 §49의2 ④⑤⑥ 본문 (KoreanLaw MCP, 시행 20260227, MST 283637)
- **영향**: 결과·안내 화면의 근거 조항이 틀린 항을 가리킨다. 사용자가 §49의2④를 찾아가면 신청기한 규정이 아니라 위원 해촉 규정을 보게 된다.
- **제안**: 신청기한 표기는 §49의2⑤, 통지기한 표기는 §49의2⑥으로 정정한다(필요 시 lib/tax-engine/legal-codes/inheritance-gift.ts 상수로).
- **대조**: `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeFilingGuideCard.tsx:73`
- *(리뷰 ID c17-7)*

### IG-135 · onIntangibleDeductionChange는 아무 데도 연결되지 않은 죽은 prop

`[2/2]` · **MINOR** · F-도달가능성 · `components/calc/inheritance/unlisted-stock-v2/GoodwillCalculationTable.tsx:30`

- **현상**: props에 "매입 무체재산권 차감액 (선택 입력)" 콜백을 선언했지만 컴포넌트는 goodwill·sectionNum만 구조분해하고(:39) 이 콜백을 쓰지 않는다. 아 행은 read-only RowDisplay로만 렌더된다(:90). 부모도 이 prop을 넘기지 않는다(UnlistedStockV2Card.tsx:437).
- **근거**: components/calc/inheritance/unlisted-stock-v2/GoodwillCalculationTable.tsx:29-30·39·90 · components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:437 · lib/tax-engine/property-valuation/unlisted-orchestrator.ts:259-265 (calcGoodwill 호출에 intangibleDeduction 미전달) · lib/validators/unlisted-stock-valuation-v2.schema.ts에 intangible 키 0건
- **영향**: 별지 부표3 5쪽 "아. 매입 무체재산권 차감액"은 UI·Zod·orchestrator 어디에도 입력 경로가 없어 항상 0으로 고정된다(goodwill.ts:84 기본 0). 서식 행↔변수 1:1이 끊긴 채 입력 가능한 것처럼 보이는 prop만 남아, 나중에 이 prop을 넘기는 호출자가 생기면 조용히 무시된다.
- **제안**: 현재 범위에서 아 행을 입력받지 않는다면 onIntangibleDeductionChange prop과 "선택 입력" 주석을 제거해 계약을 사실과 맞춘다. 입력을 지원할 계획이면 ①폼~⑫Zod~⑭엔진 전달까지 함께 배선한다.
- **대조**: `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:437` · `lib/tax-engine/property-valuation/unlisted-orchestrator.ts:259` · `lib/tax-engine/property-valuation/goodwill.ts:84`
- *(리뷰 ID c17-8)*

### IG-136 · 영업권 섹션 번호 11이 화면상 8·9·10보다 위에 그려진다

`[2/2 · ½]` · **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:357`

- **현상**: 렌더 순서대로 ToneCard 번호배지가 1 → 3 → 4 → 5 → 6 → 7 → 7 → **11** → 8 → 9 → 10 → 12로 찍힌다. GoodwillPanel에 `sectionNum={11}`을 주고(:357) 그 아래에 MajorShareholderStockToggle 8(:363)·PreIpoListingToggle 9(:372)·EvaluationCommitteeToggle 10(:381)을 배치했다. ToneCard는 `sectionNum`을 그대로 번호 배지로 렌더한다(ToneCard.tsx:52-58).
- **근거**: components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:312,328,338,345,352,354,357,363,372,381,389 · components/calc/shared/ToneCard.tsx:52-58
- **영향**: 「색상 카드 + 섹션 번호」 패턴에서 번호가 화면 순서와 역전돼, 사용자가 안내문의 섹션 번호 참조를 따라갈 수 없다.
- **제안**: 영업권 패널을 8·9·10 뒤로 옮기거나, 번호를 렌더 순서에 맞춰 재부여한다.
- **대조**: `components/calc/shared/ToneCard.tsx:52`
- **½ 정정(code-fact)**: UnlistedStockV2Card의 섹션 번호 배지가 화면 순서와 역전된다. 유효 입력 기준 실제 렌더 순서는 1 → 2 → 3 → 4 → 5 → 6 → 7 → **11(영업권, :357)** → 8(:363) → 9(:372) → 10(:381) → 12(:389)로, 영업권 패널의 11이 8·9·10보다 위에 그려진다(루트가 `space-y-4` 블록이라 DOM 순서 = 화면 순서). 배지 "2"는 CorporateInfoSection.tsx:332의 하드코딩 span이다. 추가로 다른 비상장법인 보유가 입력된 경우에 한해 OtherUnlistedHoldingSection(:352)과 CrossHoldingResultCard(:354)가 둘 다 7을 달아 중복된다. 원인은 e80c2023이 영업권을 7→11로 바꾸면서 1e13c232가 세운 "화면순서 순차" 원칙을 깬 것이며, 주석(:356 `{/* 7. 영업권 평가 */}`)이 옛 번호로 남아 있다. 기존 anchor(UnlistedStockV2SectionNumbering.test.tsx:69)는 `/^[1-9]$/` 필터 때문에 10·11·12를 무시해 현행 역전을 통과시키므로, 수정 시 두 자리 배지까지 수집하도록 anchor도 함께 고쳐야 한다.
- *(리뷰 ID c18-5)*

### IG-137 · 증여세 평가에서도 별지 총계 행이 "상속재산가액"으로 표시된다

`[2/2 · ½]` · **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/besshi/Page1CoverSection.tsx:136`

- **현상**: 총계 행 라벨을 `BESSHI_P1_SECTION3.total(...)`로 고정 사용하는데 그 상수는 `상속재산가액 (⑨ × 보유주식수 N주)`이다(besshi-form-constants.ts:79). Page1CoverSectionProps는 `input`·`result`만 받고 taxKind를 받지 않는다(:23-26). 상위 UnlistedStockV2Card는 `taxKind`를 갖고 있고 StockItemEditor가 gift 모드에서도 이 카드를 렌더한다(`taxKind={valuationOnly ? "inheritance" : mode}`).
- **근거**: components/calc/inheritance/unlisted-stock-v2/besshi/Page1CoverSection.tsx:23-26,133-139 · components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts:78-79 · components/calc/inheritance/stock/StockItemEditor.tsx:466
- **영향**: 증여세 마법사에서 출력·인쇄한 별지 제4호 부표3의 총계 행이 "상속재산가액"으로 나온다. 신고서로 쓸 서식의 항목명이 세목과 다르다.
- **제안**: Page1CoverSection에 taxKind를 주입하고 라벨 상수를 세목별 분기(상속/증여재산가액)로 만든다.
- **대조**: `components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts:79` · `components/calc/inheritance/stock/StockItemEditor.tsx:466`
- **½ 정정(rule-impact)**: 별지 부표3 제1쪽의 총계 행 라벨(BESSHI_P1_SECTION3.total, besshi-form-constants.ts:74)이 "상속재산가액"으로 하드코딩되어, 증여 마법사(gift-tax-form-shared.tsx:484 → … → UnlistedStockV2Card.tsx:392)와 증여 결과화면(GiftTaxResultView.tsx:655 → UnlistedStockBesshiResultSection.tsx:49) 모두에서 증여 평가인데 "상속재산가액"으로 렌더된다. 이 행은 공식 양식 항목이 아니라 앱이 추가한 편의 행이므로(parity.plan.md:64,74) 문구 동결 제약이 없고, 형제 컴포넌트(EvaluationCommitteeFilingGuideCard.tsx:102 등)가 이미 taxKind 분기 관례를 갖고 있다. 수정 범위는 Page1CoverSection 단독이 아니라 ① BesshiForm4Buppyo3PrintView ② UnlistedStockBesshiResultSection(+호출부 2곳: InheritanceTaxResultView.tsx:586 / GiftTaxResultView.tsx:655) ③ Page1CoverSection ④ 화면·PDF 단일출처 유지를 위해 lib/pdf/UnlistedStockBesshiPdfDocument.tsx:185까지 taxKind 배선이 필요하다. 심각도는 MINOR 유지(표시 용어이며 공식 서식 항목명이 아님).
- *(리뷰 ID c18-6)*

### IG-138 · 폐기 확인 게이트가 신고일·준비유형 입력을 데이터로 세지 않는다

`[2/2 · ½]` · **MINOR** · F-도달가능성 · `components/calc/inheritance/unlisted-stock-v2/PreIpoListingToggle.tsx:105`

- **현상**: `hasData = (publicOfferingPrice ?? 0) > 0 || !!listingDate` 로만 판정한다. 사용자가 준비 유형을 §63②2호(association_registration)로 바꾸고 유가증권 신고일만 실제 날짜로 고쳐둔 상태에서 토글을 끄면 확인 Dialog 없이 `onChange(undefined)`로 즉시 파기된다. 정작 그 Dialog의 본문은 폐기 대상으로 "공모가격·신고일·상장일"을 명시한다(:254).
- **근거**: components/calc/inheritance/unlisted-stock-v2/PreIpoListingToggle.tsx:104-109,253-255 · 준비유형 기본값 seed는 :102, 신고일 seed는 :99
- **영향**: 신고일·준비유형만 입력한 사용자는 경고 없이 입력을 잃는다. 파기 확인이라는 게이트의 취지가 절반만 성립한다.
- **제안**: hasData에 `preparationType !== "exchange_listing"`와 `securitiesFilingDate`가 ON 시 seed(evaluationDate)와 다른 경우를 포함한다.
- **대조**: `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeToggle.tsx:62`
- **½ 정정(code-fact)**: hasData(:105-106)가 사용자가 직접 편집하는 `securitiesFilingDate`를 세지 않아, 공모가격 0·상장일 미입력 상태에서 신고일만 고친 사용자는 확인 Dialog 없이 입력을 잃는다(:107-108 → 부모 :367-369에서 preIpoListing 통째 삭제). Dialog 본문(:254)이 "신고일"을 폐기 대상으로 명시하므로 파일이 자기 자신과 모순된다. 수정은 신고일이 ON 시 seed(`evaluationDate ?? new Date()`, :99)와 다른 경우를 hasData에 포함하는 것으로 족하다. 다만 `preparationType`까지 포함하라는 원 제안은 채택 근거가 없다 — 대조 파일 EvaluationCommitteeToggle.tsx:63-66도 라디오 `method`를 세지 않고(관례), Dialog 본문도 준비유형을 폐기 대상으로 적지 않는다.
- *(리뷰 ID c18-7)*

### IG-139 · 증여자를 「선택」으로 되돌리면 사망일 입력칸이 사라지고 빈 문자열이 남는다

`[2/2 · ½ · 강등 MAJOR→MINOR]` · **MINOR** · F-도달가능성 · `components/calc/prior-gift/GiftRowEditor.tsx:280`

- **현상**: 증여자 사망 ToggleCard는 `showGiftPhaseA && gift.donor` 게이트 안에 있고(:280), ON 시 `donorDeceasedDate: ""`를 쓴다(:285-288). 증여자 select의 `<option value="">선택</option>`을 다시 고르면 `donor: undefined`가 되어(:256-261) 카드 전체가 언마운트되지만 `donorDeceasedDate`는 `""` 그대로 남는다. 토글 OFF만이 undefined로 되돌리는 유일한 경로다.
- **근거**: components/calc/prior-gift/GiftRowEditor.tsx:280(게이트)·285-288(ON 시 "" 세팅)·256-261(donor를 undefined로 되돌리는 경로) / lib/calc/prior-gift-deceased-rule.ts:26-28 (undefined가 아니고 YYYY-MM-DD 아니면 오류) / lib/validators/prior-gift-schema.ts:133-140 (증여세 route의 Zod superRefine)
- **영향**: 증여세 모드에서 사망 토글을 켠 뒤 증여자를 「선택」으로 되돌리면 서버 Zod가 「증여자 사망일을 입력하세요 (YYYY-MM-DD).」로 400을 내는데, 화면에는 그 날짜를 넣거나 토글을 끌 UI가 남아 있지 않다. 그 사전증여 행을 지우기 전에는 증여세 계산이 되지 않는다.
- **제안**: 증여자 select onChange에서 donor가 undefined가 될 때 `donorDeceasedDate: undefined`도 함께 patch하거나, 게이트를 `showGiftPhaseA && (gift.donor || gift.donorDeceasedDate !== undefined)`로 넓혀 값이 남아 있으면 카드를 계속 렌더한다.
- **대조**: `lib/calc/prior-gift-deceased-rule.ts:26-28` · `lib/validators/prior-gift-schema.ts:133-140` · `app/api/calc/gift/route.ts:59-60` · `lib/validators/property-valuation-input.ts:560`
- **½ 정정(code-fact)**: 상태 누수 자체는 사실이다 — GiftRowEditor.tsx:255-262의 증여자 select onChange가 donor만 patch하므로, 사망 토글을 켠 뒤 「선택」으로 되돌리면 donorDeceasedDate가 ""로 남고 :280 게이트가 카드를 언마운트한다. lib/calc/gift-api.ts:112-114가 sourceCalculationId만 strip하고 rest를 그대로 spread하므로 ""는 서버에 도달하고, prior-gift-schema.ts:106-109(필드 regex)와 :133-140(superRefine, zod 4에서 base 실패 후에도 실행됨 — 실측 확인)이 둘 다 issue를 낸다.

그러나 「도달 불가·행 삭제 전엔 계산 불가」라는 영향 서술은 성립하지 않는다:
(1) 증여자 select 자체는 :250-270로 게이트 **밖**에 있어 화면에 남는다. 아무 증여자나 다시 고르면 donorDeceasedDate가 ""로 보존된 채 카드가 다시 마운트되고(checked = "" !== undefined → true), 사망일 DateInput과 토글 OFF 경로가 **둘 다 복구된다**. 행을 지울 필요가 없다.
(2) 실제로 계산에 영향을 주는 행(giftAmount > 0)은 components/calc/gift-tax-form-validate.ts:291-299가 Step2에서 「사전증여 N: 증여자를 선택하세요 (§47 합산 그룹 판정).」로 **POST 전에 차단**한다. 즉 지적이 서술한 서버 400은 이 경우 발생하지 않고, 오류 메시지가 카드를 복구시키는 바로 그 행동을 지시한다.

남는 실제 결함은 좁다: giftAmount === 0인 행은 위 client 블록(`if (p.giftAmount > 0)`)을 통째로 건너뛰므로 orphan ""가 Zod에 도달해, 화면에 없는 칸을 가리키는 400이 뜬다. 다만 그런 행은 makeEmptyGift(prior-gift/meta.ts:148-153)의 giftDate: ""도 함께 들고 있어 이미 독립적으로 400이 나므로, 이 누수가 구별되는 경로는 「증여일은 입력했으나 가액을 0으로 둔 행」뿐이다. 제안(donor가 undefined가 될 때 donorDeceasedDate도 undefined로 patch)은 위생상 여전히 타당하다.
- *(리뷰 ID c19-2)*

### IG-140 · 「§28 공제 대상」 합계에 제척기간 만료 회차가 그대로 들어간다

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/prior-gift/AggregationSummary.tsx:85`

- **현상**: 합계는 `gifts.reduce((s, g) => s + g.giftTaxPaid, 0)`로 전 회차를 더하고(:23) 「기납부 증여세 합계 (§28 공제 대상)」로 라벨링한다(:85). 엔진은 `giftTaxTimeBarred !== true`인 회차만 공제 대상으로 거른다.
- **근거**: components/calc/prior-gift/AggregationSummary.tsx:23·83-88 / lib/tax-engine/inheritance-gift-tax-credit.ts:93 (`const creditableGifts = priorGifts.filter((g) => g.giftTaxTimeBarred !== true)`) / components/calc/prior-gift/GiftRowEditor.tsx:588-596 (제척기간 만료 토글 입력 경로)
- **영향**: 「증여세 부과제척기간 만료」 토글을 켠 회차의 기납부세액이 요약 카드에서는 §28 공제 대상 합계에 계속 포함되어, 사용자가 실제 결과보다 큰 증여세액공제를 기대하게 된다(계산 자체는 엔진이 옳게 제외).
- **제안**: reduce에 `.filter((g) => g.giftTaxTimeBarred !== true)`를 걸어 엔진 술어와 일치시키거나, 제외된 금액을 별도 행으로 분리 표시한다.
- **대조**: `lib/tax-engine/inheritance-gift-tax-credit.ts:93` · `lib/tax-engine/inheritance-gift-tax-credit.ts:55-56` · `components/calc/prior-gift/GiftRowEditor.tsx:588-596`
- *(리뷰 ID c19-5)*

### IG-141 · ⑲ 소계 산식 라벨이 보험준비금 3행을 포함하지 않아 값과 맞지 않는다

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts:162`

- **현상**: `liabilitySubtotalFormula`는 「소계 (⑨+⑩+⑪+⑫+⑬+⑭+⑮−⑯−⑰−⑱)」로 고정돼 있으나(:162), ⑲ 칸에 들어가는 값은 `sumNetAssetRows(BESSHI_P2_LIABILITY_ROWS, ...)`(:180-185)이고 이 배열에는 cellNum "*"인 보험준비금 3행이 가산 항목으로 들어 있다(:147-149).
- **근거**: components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts:147-149(보험준비금 3행)·162(산식 문자열)·180-185(sumNetAssetRows) / components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable.tsx:40·86 (같은 행에 산식 라벨과 sum 값을 함께 렌더) / lib/pdf/UnlistedStockBesshiPdfDocument.tsx:220 (PDF도 동일)
- **영향**: 보험회사 평가조서에서 ⑨~⑱을 손으로 더한 값과 화면·PDF의 ⑲ 값이 보험준비금 3항목만큼 달라진다. 표에 「*」 행이 함께 보이지만 산식 문자열이 그 행을 배제하고 있어 서식 행↔변수 대응이 성립하지 않는다.
- **제안**: 보험준비금 값이 하나라도 있으면 ⑲ 라벨에 「+ 보험준비금」 같은 가산 표기를 덧붙이거나, 산식 문자열을 행 배열에서 파생시켜 라벨과 값이 같은 소스에서 나오게 한다.
- **대조**: `components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable.tsx:40` · `components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable.tsx:86` · `lib/pdf/UnlistedStockBesshiPdfDocument.tsx:220`
- *(리뷰 ID c19-7)*

### IG-142 · 장례비 한도 근거를 §14①3호로 인용 — 3호는 채무, 장례비는 2호

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/results/DebtAllocationResultCard.tsx:149`

- **현상**: ② 섹션 제목이 "② 장례비 한도 적용 (§14①3호)"이다. 같은 파일 307행은 담보채무를 "§14①3호 「피상속인의 채무」"로 인용해, 한 파일에서 같은 호가 장례비와 채무 두 대상에 동시에 붙는다.
- **근거**: components/calc/results/DebtAllocationResultCard.tsx:149 vs 307 / 상증법 §14① 본문(KoreanLaw MCP, MST 276123): 1호 공과금 · 2호 장례비용 · 3호 채무 / 엔진 주석도 2호로 적는다 — lib/tax-engine/inheritance-allocation-deductions.ts:121·138, lib/tax-engine/inheritance-tax-estate-steps.ts:71
- **영향**: 결과 화면이 잘못된 호를 근거로 제시한다. 사용자가 그대로 신고서·상담에 옮기면 오인용이 전파되고, 같은 카드 안에서 3호가 두 뜻으로 쓰여 근거를 확인할 수 없다.
- **제안**: "② 장례비 한도 적용 (§14①2호 · 상증령 §9②)"로 정정한다(한도 수치의 직접 근거는 §14③ 위임을 받은 상증령 §9②).
- **대조**: `lib/tax-engine/inheritance-allocation-deductions.ts:121` · `lib/tax-engine/inheritance-tax-estate-steps.ts:71` · `components/calc/results/DebtAllocationResultCard.tsx:307`
- *(리뷰 ID c20-4)*

### IG-143 · 「처음으로」가 폐기 확인 없이 전체 입력을 초기화

`[2/2]` · **MINOR** · C-공용컴포넌트 · `components/calc/results/GiftTaxResultView.tsx:744`

- **현상**: 744행 `<CtaButton onClick={onReset}>처음으로</CtaButton>`. 전달된 `onReset`은 GiftTaxForm의 `handleReset`으로 `setForm(INITIAL_FORM)` + 결과·양도세 결과·동시증여 결과를 전부 비우고 step 0으로 되돌린다. 확인 다이얼로그가 없다. 743행 "다시 계산"이 `onGoToFirst ?? onBack`로 복귀만 하는 라벨 분리는 이미 지켜져 있다 — 빠진 것은 폐기 확인이다.
- **근거**: components/calc/results/GiftTaxResultView.tsx:743-744 / components/calc/GiftTaxForm.tsx:276-287(handleReset 본문)·318 / 규칙: components/calc/CLAUDE.md:14 "전체 초기화는 그 라벨에 달지 않는다 — <RestartFromScratchButton>(「처음부터 새로」 + 폐기 확인 Dialog) 전용" / 이행 선례: components/calc/results/TransferTaxResultView.tsx:729 · BundledAllocationCard.tsx:530
- **영향**: 결과 화면에서 한 번 잘못 누르면 마법사에 입력한 값 전체가 확인 절차 없이 사라지고 되돌릴 수 없다.
- **제안**: 744행을 `<RestartFromScratchButton onReset={onReset} />`로 교체한다. (참고: InheritanceTaxResultView.tsx:696도 같은 미이관 상태 — 별건으로 함께 처리 가능)
- **대조**: `components/calc/GiftTaxForm.tsx:276` · `components/calc/results/TransferTaxResultView.tsx:729` · `components/calc/results/InheritanceTaxResultView.tsx:696`
- *(리뷰 ID c20-6)*

### IG-144 · 「= 일반 + 특례」 산식 라벨이 합산배제 스트림을 빠뜨린다

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/results/GiftTwoStreamDetailSection.tsx:92`

- **현상**: 최종 합산 행의 라벨을 `= 일반 {ordinaryStreamTax} + 특례 {specialStreamTax}`로 고정 조립하고 값은 `result.finalTax`를 표시한다. 그런데 엔진의 finalTax는 합산배제 스트림(§41의3·§41의5)까지 더한 값이라, 합산배제 자산이 함께 있으면 라벨의 두 항 합 ≠ 표시 금액이 된다.
- **근거**: GiftTwoStreamDetailSection.tsx:91~95. 엔진: lib/tax-engine/gift-tax-two-stream.ts:339 `finalTax = specialStream.finalTax + ordinaryFinalTax + (aggExcl?.finalTax ?? 0)`. 엔진 자신의 breakdown note는 :356~358에서 aggExcl 유무로 「= 특례 + 일반 + 합산배제」/「= 특례 + 일반」을 분기한다. 합산배제 항목 경로는 lib/calc/gift-deemed-prefill.ts:168 `isAggregationExcludedGift: true`(증여의제 프리필) — 다른 자산을 추가하면 특례 스트림과 공존 가능(lib/tax-engine/gift-special-stream.ts:110~126).
- **영향**: 합산배제 증여이익이 함께 있는 화면에서 사용자가 「A + B」를 더해 보면 표시된 최종 세액과 맞지 않는다.
- **제안**: 엔진 breakdown(:356)과 동일하게 `result.aggregationExcludedDetail` 유무로 라벨을 분기하거나, 라벨에 산식을 넣지 않고 별도 행으로 세 항을 나열한다.
- **대조**: `lib/tax-engine/gift-tax-two-stream.ts:339` · `lib/tax-engine/gift-tax-two-stream.ts:356` · `lib/calc/gift-deemed-prefill.ts:168`
- *(리뷰 ID c21-7)*

### IG-145 · 부표1 금액 칸에 font-mono 누락 — 콤마 세로 정렬 깨짐

`[2/2]` · **MINOR** · C-공용컴포넌트 · `components/calc/results/GiftTaxValuationFormTable.tsx:125`

- **현상**: `const CELL_AMOUNT = `${CELL_BASE} text-right tabular-nums`` — 금액 칸 표준 4요소 중 `font-mono`와 `whitespace-nowrap`이 빠져 있다. ⑤ 수량·⑥ 단가·⑦ 평가가액과 계 영역 ⑨~⑮ 전부 이 클래스를 쓴다.
- **근거**: GiftTaxValuationFormTable.tsx:125. 규약: components/calc/CLAUDE.md 「금액(원) 셀은 `text-right font-mono tabular-nums whitespace-nowrap`」. 같은 성격의 형제 서식 replica는 전부 4요소를 갖는다 — components/calc/inheritance/besshi-buppyo-2/Buppyo2GaSection.tsx:15, Buppyo2NaTable.tsx:31, Buppyo2KyeSection.tsx:21 (`border border-black p-1 ... text-right font-mono tabular-nums whitespace-nowrap`). 공용 BesshiRow.tsx:59도 동일.
- **영향**: 비례 글꼴이라 천·백만·십억 콤마가 행마다 어긋나고, 긴 금액이 줄바꿈될 수 있다. 공식 서식 출력물의 가독성이 형제 서식보다 낮다.
- **제안**: `const CELL_AMOUNT = `${CELL_BASE} text-right font-mono tabular-nums whitespace-nowrap`;`
- **대조**: `components/calc/inheritance/besshi-buppyo-2/Buppyo2GaSection.tsx:15` · `components/calc/results/shared/BesshiRow.tsx:59`
- *(리뷰 ID c21-8)*

### IG-146 · 「배부대상 산출세액 = ⑦ − 영리법인 면제」 산식이 차감항 하나를 빠뜨렸다

`[2/2 · ½ · 강등 MAJOR→MINOR]` · **MINOR** · E-표시법령 · `components/calc/results/allocation-breakdown/ComputedTaxDetailCard.tsx:66`

- **현상**: 라벨은 `배부대상 산출세액 = ⑦ − 영리법인 면제 {corporateExemption}`인데 값으로 그리는 `distributableTax`는 엔진에서 영리법인 면제 **외에** 비상속인 자연인의 §28②본문 증여세액공제(`nonPayerNaturalGiftCredit`)까지 뺀 값이다. 며느리·후순위 인척처럼 법정상속분이 없고 사전증여만 받은 상속인이 있으면 두 항이 모두 0이 아니어서 화면 산식이 성립하지 않는다.
- **근거**: UI: components/calc/results/allocation-breakdown/ComputedTaxDetailCard.tsx:65-68. 엔진: lib/tax-engine/inheritance-allocation.ts:452 `const distributableTax = computedTax - corporateExemption - nonPayerNaturalGiftCredit;` (nonPayerNaturals 판정 :424-426, 공제 합 :433-438). 대상자 판정 근거 lib/tax-engine/inheritance-gift-common.ts:64-74(법정상속분 비멤버인 혈족·인척은 false). 해당 공제액은 heirAllocationResult 상위 echo가 없어 UI가 역산으로도 복구 불가(lib/tax-engine/types/inheritance-allocation-result.types.ts:132-147에 필드 없음).
- **영향**: 비상속인 자연인에게 사전증여가 있는 신고에서 사용자가 화면 산식대로 계산해도 표시된 배부대상 산출세액이 나오지 않아, 이후 ⑪ 배부액 전부가 검증 불가능해진다.
- **제안**: 엔진이 `nonPayerNaturalGiftCredit`을 heirAllocationResult에 echo하고, 라벨을 「= ⑦ − 영리법인 면제 − 상속인 외 자 증여세액공제」로 항을 모두 적는다(값이 0이면 해당 항 생략).
- **대조**: `lib/tax-engine/inheritance-allocation.ts:424` · `lib/tax-engine/inheritance-allocation.ts:433` · `lib/tax-engine/inheritance-allocation.ts:452` · `lib/tax-engine/types/inheritance-allocation-result.types.ts:137`
- **½ 정정(code-fact)**: ComputedTaxDetailCard.tsx:66의 라벨이 차감항 `nonPayerNaturalGiftCredit`(비상속인 자연인 §28②본문 증여세액공제)을 빠뜨려, 며느리·후순위 인척처럼 법정상속분 없이 사전증여만 받은 수증자가 있으면 표시 산식이 표시 값과 맞지 않는다. 단, 그 금액은 이미 perHeir[h].nonHeirGiftCredit로 echo되어 있어(types:111, engine:529) UI가 합산만으로 복구 가능하며 — heir-allocation-summary.ts:449-451이 같은 합을 이미 계산한다 — 엔진 echo 추가는 불필요하다. 또한 그 금액은 같은 결과 화면 HeirAllocationSummaryTable의 ⑩c 행에 표시되므로 「⑪ 검증 불가」는 성립하지 않는다. 수정 범위는 UI 라벨(및 stale 주석 inheritance-allocation.ts:714·types:137) 한정이다.
- *(리뷰 ID c22-3)*

### IG-147 · 교재 예제의 고정 금액을 모든 §45의3 결과에 「본 시스템 산출」로 표시

`[2/2 · ½ · 강등 MAJOR→MINOR]` · **MINOR** · E-표시법령 · `components/calc/results/RelatedCorpResultSection.tsx:141`

- **현상**: 섹션 맨 아래 주석이 조건 없이 항상 렌더되며 「교재는 … 갑 직접이익을 20,510,000원대로 표시. 본 시스템은 정확분수(1/12) 정수연산으로 20,520,000원 산출.」이라는 고정 문장을 그린다. 이 두 금액은 설계 문서의 특정 교재 사례(수혜법인 A, 2023 귀속)의 anchor 값이고, 사용자가 어떤 값을 넣든 그대로 나온다.
- **근거**: 무조건 렌더: components/calc/results/RelatedCorpResultSection.tsx:141-143 (조건 래핑 없이 반환 JSX 말미). 렌더 조건은 §45의3 결과 + breakdown 존재뿐: components/calc/results/DeemedGiftResultView.tsx:104-106. 해당 수치의 출처가 특정 사례 anchor임: docs/00-pm/gift-related-corp-45-3.plan.md:18·:168, docs/02-design/features/gift-related-corp-45-3.ui.design.md:29.
- **영향**: 자기 사건 금액이 36,720,000원이 아닌 사용자도 결과 화면에서 「본 시스템은 20,520,000원 산출」이라는 자기 계산과 무관한 금액을 보게 되어, 화면 표의 소계와 모순되는 안내를 읽는다.
- **제안**: 수치를 뺀 일반 문구(예: 「교재의 거래비율 반올림 표기와 달리 본 시스템은 정확분수 정수연산을 적용합니다」)로 바꾸거나, 문장을 제거한다.
- **대조**: `components/calc/results/DeemedGiftResultView.tsx:104` · `lib/tax-engine/gift-deemed/related-corp.ts:79`
- **½ 정정(rule-impact)**: §45의3 결과 섹션 말미(components/calc/results/RelatedCorpResultSection.tsx:141-143)의 교재 비교 주석은 조건 래핑 없이 항상 렌더되며, 특정 교재 사례(수혜법인 A·2023 귀속)의 anchor 값 「갑 직접이익 20,510,000원대 / 본 시스템 20,520,000원」을 모든 사용자에게 고정 출력한다. 상위 렌더 게이트는 `result.type === "related_corp" && result.recipientBreakdown`뿐이고(DeemedGiftResultView.tsx:104-106), 엔진은 과세요건 미충족 경로에서도 `recipientBreakdown: []`을 실어 보내므로(related-corp.ts:113 — 빈 배열은 truthy, 섹션의 `if (!breakdown) return null`도 통과) **증여의제이익 0원 결과에서도** 이 주석이 그대로 뜬다(지적문이 놓친 부분 — 지적 방향에는 유리). 다만 두 가지는 정정이 필요하다: (1) 문장은 「교재 vs 본 시스템」 비교로 명시 서술돼 있어 화면 표의 소계와 «모순되는 단언»이라기보다 «출처 불명의 참조사례 수치 노출»이다 — 오독 유발이지 계산·표시 모순은 아니다. (2) 심각도: 세액·표시값·입력 경로에 아무 영향이 없는 정적 안내문 1줄이고, 이 저장소가 강제하는 규칙(components/calc/CLAUDE.md:302의 「숫자 예시 금지」는 placeholder 한정, 리뷰 축 E는 산식 한국어화·내부 id 노출·원 접미사만 규정) 중 이를 직접 금지하는 조항이 없다. 유사 사례인 「경정 예고 후 0%를 2년 초과 경과로 설명(사유 오표시)」·「내부 식별자 receiveOnly 인쇄」는 직전 UI 리뷰 대장에서 **낮음**으로 처리됐다 ⇒ MINOR가 적정. 제안(수치 제거한 일반 문구 또는 삭제)은 그대로 유효하며, 이 문장을 단언하는 테스트는 없다(__tests__·e2e 전수 grep 0건)이므로 회귀 위험도 없다.
- *(리뷰 ID c22-5)*

### IG-148 · 상속공제 상세 내역은 접힌 상태로 인쇄하면 내용이 통째로 빠진다

`[2/2 · ½]` · **MINOR** · F-도달가능성 · `components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:66`

- **현상**: 본문을 `{showBreakdown && (...)}`로 조건 마운트하고 헤더 토글 버튼에도 `print:hidden`이 없다. 이 섹션은 인쇄 선택 패널에 「상속공제 상세 내역」으로 노출되는 선택 대상인데, 사용자가 화면에서 펼치지 않은 채 선택해 인쇄하면 제목과 「펼치기」 버튼만 찍히고 공제 내역은 한 줄도 나오지 않는다. 같은 결과뷰의 형제 인쇄 섹션은 CSS 자동 펼침을 구현하고 있다.
- **근거**: 조건 마운트: components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:66. 토글 버튼에 print:hidden 없음: 같은 파일 :56-64. 형제 구현: components/calc/results/allocation-breakdown/AllocationBreakdownSection.tsx:38(`print:hidden`)·:44(`hidden print:block`). 인쇄 래퍼는 강제 펼침을 하지 않음: components/calc/results/shared/PrintSection.tsx:23-29. 선택 항목 등록: lib/print/inheritance-print-sections.ts:70-71(두 섹션이 나란히 등록됨).
- **영향**: PDF 출력에서 「상속공제 상세 내역」을 골라도 빈 헤더만 인쇄되어, 신고 첨부용 산출근거가 누락된다.
- **제안**: 형제 섹션과 같은 print-only-css-toggle 패턴으로 바꾼다 — 본문을 `className={showBreakdown ? "block" : "hidden print:block"}`로 항상 마운트하고 헤더 버튼에 `print:hidden`을 붙인다.
- **대조**: `components/calc/results/allocation-breakdown/AllocationBreakdownSection.tsx:38` · `components/calc/results/allocation-breakdown/AllocationBreakdownSection.tsx:44` · `components/calc/results/shared/PrintSection.tsx:23` · `lib/print/inheritance-print-sections.ts:70`
- **½ 정정(rule-impact)**: 「상속공제 상세 내역」 섹션 본문이 `DeductionBreakdownSection.tsx:66`에서 조건 마운트(`{showBreakdown && ...}`, 기본 접힘)라, 인쇄 선택 패널에서 이 항목을 골라 「선택 항목 인쇄」(브라우저 인쇄 → PDF 저장)를 하면 **섹션 제목만 찍히고 공제 내역이 한 줄도 출력되지 않는다**(「펼치기」 배지는 `EXPAND_BASE`의 `print:hidden`으로 이미 안 찍힘. 서버 PDF는 이 leaf가 SCREEN 채널이라 애초에 대상이 아님). 저장소 표준(`ExpandToggleButton.tsx:8` 주석·형제 `AllocationBreakdownSection.tsx:44`·results 하위 34파일)은 본문을 `hidden print:block`으로 항상 마운트하는 것이다. 수정 시 버튼에 `print:hidden`을 붙인다면 형제처럼 `hidden print:block` 제목 div(`AllocationBreakdownSection.tsx:45-47`)를 **함께** 넣어야 인쇄물에서 제목이 사라지지 않는다.
- *(리뷰 ID c22-6)*

### IG-149 · 인적공제 카드가 현행 금액·연령을 하드코딩 — 2016년 前 상속에서 라벨≠금액

`[2/2 · ½ · 강등 MAJOR→MINOR]` · **MINOR** · E-표시법령 · `components/calc/results/deduction-breakdown/PersonalDeductionDetailCard.tsx:45`

- **현상**: 카드가 자녀 5,000만원(45행), 미성년 (19−나이)년×1,000만원(61행), 연로자 5,000만원·65세(76행), 장애인 기대여명×1,000만원(98행)을 문자열에 고정한다. 엔진은 resolveS20Params(deathDate)로 상속개시일 2016-01-01 前이면 자녀 3,000만원·미성년 상한 20세·연 500만원·연로자 60세 3,000만원을 적용한다. 금액 칸(value)은 엔진 값이므로 라벨과 값이 서로 어긋난다.
- **근거**: lib/tax-engine/deductions/personal-deduction-calc.ts:55-63 (S20_REVISION_2016 = "2016-01-01", pre2016 tier = childAmount 30,000,000 · perYearAmount 5,000,000 · minorAgeLimit 20 · elderAgeThreshold 60 · elderAmount 30,000,000) · 같은 파일 97·160·292행이 p.childAmount/p.perYearAmount로 실제 공제액 산정 · 엔진은 breakdown 라벨을 manLabel(p.childAmount)로 동적 생성(104·180행)하는데 카드만 고정 문자열
- **영향**: 2016년 前 상속 계산에서 예: 자녀 2명이면 값 60,000,000(3천만×2)이 「자녀공제 2명 × 5,000만원」 라벨과 함께 표시되어, 사용자가 계산이 틀렸다고 오인하거나 잘못된 단가를 사실로 받아들인다. 미성년(20세 상한)·연로자(60세)도 같은 방식으로 어긋난다.
- **제안**: 엔진의 resolveS20Params(deathDate)를 그대로 import해 단가·상한연령을 라벨에 주입하거나, detail에 tier 파라미터를 echo해 카드가 그것을 읽게 한다(자체 재계산 금지).
- **대조**: `lib/tax-engine/deductions/personal-deduction-calc.ts:59` · `lib/tax-engine/deductions/personal-deduction-calc.ts:104` · `lib/tax-engine/deductions/personal-deduction-calc.ts:169` · `components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:90`
- **½ 정정(code-fact)**: PersonalDeductionDetailCard가 §20 단가·연령을 현행 tier로 하드코딩해, 2016-01-01 前 상속개시분에서 라벨(자녀 5,000만원 / (19−age)년 × 1,000만원 / 65세·5,000만원 / 기대여명 × 1,000만원)이 엔진이 산정한 값(3,000만원 / (20−age)년 × 500만원 / 60세·3,000만원 / 기대여명 × 500만원)과 어긋난다. 다만 이 카드는 「기초+인적」이 채택된 itemized 분기에서만 렌더되므로, 실제로 화면에 드러나는 경로는 (a) 기초+인적 > 5억(pre-2016 tier로는 인적공제 3억 초과 필요 — 다자녀·장애인 등), (b) 배우자 단독상속 §21②(장애인 배우자면 장애인공제 표시), (c) 비거주자에 한정된다. 리뷰 원문의 예시「자녀 2명 → 60,000,000이 5,000만원 라벨과 함께 표시」는 성립하지 않는다(2.6억 < 5억이라 일괄공제가 채택되어 카드 미표시). 세액 계산 자체는 정확하고 오류는 설명 라벨에 한정된다. 표시되는 경우의 모순은 실재한다 — 예: 2015년 상속·만11세 미성년이면 값 45,000,000(=9×500만) 옆에 「(19 − 11)년 × 1,000만원」이 붙어 화면 내 산식과 금액이 자체 모순된다.
- *(리뷰 ID c23-1)*

### IG-150 · 금융재산공제 소계 라벨의 산식이 실제 값과 다르다

`[2/2 · ½]` · **MINOR** · E-표시법령 · `components/calc/results/deduction-breakdown/FinancialDeductionDetailCard.tsx:152`

- **현상**: 소계 행 라벨이 「최대주주가 있을 시 MAX[MIN(㉠, ㉡), 2천만]」인데 표시 값은 detail.cappedDeduction = min(rawDeduction, 2억)이다. 엔진에 2천만 하한(MAX) 연산은 없고, 최대주주 여부는 §22②의 자산 제외 규정이라 공제액 산식의 조건이 아니다.
- **근거**: FinancialDeductionDetailCard.tsx:151-155(value = formatKRW(detail.cappedDeduction)) · lib/tax-engine/deductions/inheritance-deduction-items.ts:220 `const cappedDeduction = Math.min(rawDeduction, FINANCIAL_MAX);` · lib/tax-engine/types/inheritance-deduction-detail.types.ts:239 「한도 적용 후 공제액 (= min(rawDeduction, cap))」 · KoreanLaw 상증법 §22②는 최대주주 보유주식을 금융재산에서 제외하는 규정 · 저장소 전체에서 이 문구는 이 1곳뿐(다른 설계 근거 없음)
- **영향**: 순금융재산 2천만 이하(tier1)에서 값은 실제 순금융재산 전액인데 라벨은 「MAX[…, 2천만]」이라 최소 2천만이 공제된 것처럼 읽힌다. 최대주주 조건도 사실과 다르다.
- **제안**: 라벨을 「공제액 = MIN(㉠ 산정액, ㉡ 한도 2억)」로 바꾸고, 최대주주 관련 안내는 이미 위에 있는 §22② 제외 배지(84행)에 맡긴다.
- **대조**: `lib/tax-engine/deductions/inheritance-deduction-items.ts:220` · `lib/tax-engine/types/inheritance-deduction-detail.types.ts:239`
- **½ 정정(rule-impact)**: FinancialDeductionDetailCard.tsx:152 소계 라벨 「최대주주가 있을 시 「㉠과 ㉡ 중 작은 금액」과 2천만원 중 큰 금액」이 표시 값 `detail.cappedDeduction`(= min(rawDeduction, 2억))과 어긋난다. 오류는 두 가지다. ⑴ 「최대주주가 있을 시」 — §22②는 최대주주 보유주식을 금융재산 범위에서 빼는 규정일 뿐 공제액 산식의 조건이 아니고, `calcFinancialDeduction(netFinancialAssets: number)`은 최대주주 여부를 인자로 받지도 않는다. 이 안내는 이미 :84-89의 §22② 전용 배지가 담당한다. ⑵ 「…과 2천만원 중 큰 금액」 — 2천만 하한은 §22①1호에 실재하나 엔진이 이미 tier 분해로 ㉠에 접어 넣었다(tier2 rawDeduction=2천만이 그 MAX의 결과). 라벨이 MAX를 한 번 더, 그것도 tier 구분 없이 적용하는 바람에 §22①2호가 적용되는 tier1(순금융재산 ≤ 2천만, 전액공제)에서 값은 전액인데 라벨은 최소 2천만으로 읽힌다. 정정 라벨은 저장소 정본 표기(한국어 산문)를 따라야 한다 — 예: 「㉠ 산정액과 ㉡ 한도 2억원 중 작은 금액」. 원 제안의 「MIN(㉠ 산정액, ㉡ 한도 2억)」은 `__tests__/components/minmax-function-notation-policy.test.ts`(ALLOWLIST 빈 배열, 대소문자 무관 정규식)에 걸려 테스트를 깨므로 **채택 불가**다. 형제 CohabitDeductionDetailCard.tsx:269가 이미 정본 패턴을 보여준다.
- *(리뷰 ID c23-6)*

### IG-151 · 충당순서 인용에 법/령 구분이 없어 §74②가 다른 조문으로 읽힌다

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/results/payment-in-kind/PaymentInKindCard.tsx:158`

- **현상**: 카드 제목이 「물납 안내 (상증법 §73)」인 상태에서 충당순서를 「§74②, 정당사유 없는 한」으로만 적었다. 여기서 §74②는 상증령 §74②(충당재산 순서)인데, 법 §74②는 문화유산 징수유예 재산의 즉시 징수 규정이다. 허용한도 제목(127행)의 「§73①」도 요건(법 §73①)과 한도(령 §73①)가 같은 문자열로 겹친다.
- **근거**: PaymentInKindCard.tsx:127·158 · 엔진은 층위를 명시한다: lib/tax-engine/credits/payment-in-kind.ts:2 「상증법 §73 / 상증령 §73·§74」, :110 「허용한도 (상증령 §73① — 적은 금액)」, :133 「충당순서 (상증령 §74②)」, :161 경고문 「상증령 §74②5호」 · KoreanLaw MCP 상증법 §74②(mst=276123) = 「유상으로 양도하거나 … 인출하는 경우에는 즉시 그 징수유예한 상속세를 징수」 · 같은 결과 페이지의 CulturalHeritageDeferralCard.tsx:98이 「상증법 §74②」를 그 뜻으로 쓴다
- **영향**: 한 결과 페이지에서 「§74②」가 두 개의 다른 규정을 가리켜, 사용자가 근거 조문을 조회하면 물납 충당순서 대신 문화유산 징수유예 조문에 닿는다.
- **제안**: 「상증령 §74②」·「상증령 §73①」로 층위를 명시한다(엔진 주석·경고문과 동일 표기).
- **대조**: `lib/tax-engine/credits/payment-in-kind.ts:133` · `lib/tax-engine/credits/payment-in-kind.ts:161` · `components/calc/results/inheritance/CulturalHeritageDeferralCard.tsx:98`
- *(리뷰 ID c23-7)*

### IG-152 · 화면에 없는 영농 복제본이 30억 고정 — 유일한 UI 테스트가 그것을 본다

`[2/2 · ½]` · **MINOR** · F-도달가능성 · `components/calc/results/deduction-breakdown/FarmingDeductionDetailRowExport.tsx:78`

- **현상**: 이 파일의 FarmingDeductionDetailRow는 InheritanceTaxResultView가 re-export만 할 뿐 어디에서도 렌더되지 않는다(실렌더는 FarmingDeductionDetailCard). 복제본은 한도를 3_000_000_000으로 고정해 「30억 한도 적용」을 판단하지만, 실렌더 카드는 엔진의 연도별 appliedLimit(30억/15억/5억)을 쓴다. 영농상속공제 UI 테스트 13건은 전부 이 복제본만 렌더한다.
- **근거**: FarmingDeductionDetailRowExport.tsx:78·83(3_000_000_000 하드코딩) vs FarmingDeductionDetailCard.tsx:68 `const limit = detail.appliedLimit || 3_000_000_000;` · 렌더 경로는 DeductionBreakdownSection.tsx:120의 FarmingDeductionDetailCard뿐 · InheritanceTaxResultView.tsx:52는 export 문일 뿐 렌더 없음 · __tests__/components/calc/inheritance/farming-section.test.tsx:17·275 등이 복제본을 render · 연도별 한도는 실측 확인됨(__tests__/tax-engine/inheritance/farming-limit-and-mortgage.test.ts:100·105에서 appliedLimit 15억·5억)
- **영향**: 실제 화면 카드의 연도별 한도 표시가 깨져도 테스트가 초록이다(안전망이 다른 컴포넌트를 보고 있다). 사용자 화면은 현재 정상이므로 즉시 피해는 없다.
- **제안**: 테스트를 FarmingDeductionDetailCard(또는 FarmingDeductionDetailRowContent) 렌더로 옮기고, 옮긴 뒤 복제 파일과 re-export를 정리한다.
- **대조**: `components/calc/results/deduction-breakdown/FarmingDeductionDetailCard.tsx:68` · `components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:120` · `lib/tax-engine/deductions/inheritance-farming-deduction.ts:292`
- **½ 정정(rule-impact)**: 복제본 `FarmingDeductionDetailRowExport.tsx`의 `FarmingDeductionDetailRow`는 어디에서도 렌더되지 않고(유일 import가 테스트), 한도를 3_000_000_000으로 고정한다. 실렌더 `FarmingDeductionDetailCard`(DeductionBreakdownSection.tsx:120)는 엔진의 연도별 `appliedLimit`(30억/15억/5억)을 쓴다. 이 복제본만 렌더하는 테스트는 `farming-section.test.tsx`의 `[RD-UI]` describe **12건**(파일 전체 24건 중 나머지 12건은 실컴포넌트를 렌더한다)이며, 실렌더 카드를 렌더하는 vitest·E2E는 0건이라 카드의 연도별 한도 표시 회귀를 잡을 안전망이 없다. 이관 시 Card와 문구가 다르므로(「공제 0원」→「공제 적용 불가」, 이모지 제거) 단언 문구를 함께 고쳐야 하고, Card:141 `FarmingDeductionDetailRowContent`는 현재 완전 미사용 dead export다.
- *(리뷰 ID c23-8)*

### IG-153 · 미성년·연로자 배지가 연령 임계를 19/65로 하드코딩 — 2016년 개정 전 tier 미반영

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/CohabitantTableView.tsx:101`

- **현상**: `age < 19`(미성년)·`age >= 65`(연로자)를 상수로 박아 두고 deathDate와 무관하게 판정한다. 엔진은 상속개시일로 tier를 가르는 단일 소스 헬퍼를 이미 export한다 — 2016-01-01 이전 상속개시분은 minorAgeLimit 20·elderAgeThreshold 60이다.
- **근거**: components/calc/CohabitantTableView.tsx:101-102 · :107-108(배지 push) / lib/tax-engine/deductions/personal-deduction-calc.ts:56(S20_REVISION_2016="2016-01-01") · :59-64(resolveS20Params: pre2016 → minorAgeLimit 20, elderAgeThreshold 60) · :212-222(calcElderDeduction이 resolveS20Params로 판정)
- **영향**: 상속개시일이 2015-12-31 이전인 사건에서, 만 62세 동거가족은 엔진이 연로자공제 3천만원을 적용하는데 테이블에는 「연로자」 배지가 뜨지 않고, 만 19세 동거가족도 미성년자공제 대상인데 「미성년」 배지가 없다. 결정세액은 엔진값이라 틀리지 않지만 사용자가 입력 화면에서 공제 대상을 확인할 수 없다.
- **제안**: deathDate로 `resolveS20Params(deathDate)`를 호출해 minorAgeLimit·elderAgeThreshold를 받아 비교한다(엔진 헬퍼 직접 재사용 — 임계값 재정의 금지).
- **대조**: `lib/tax-engine/deductions/personal-deduction-calc.ts:59` · `lib/tax-engine/deductions/personal-deduction-calc.ts:212`
- *(리뷰 ID c24-4)*

### IG-154 · 입력 화면의 저장하기 버튼 2개가 구조적으로 항상 disabled

`[2/2]` · **MINOR** · F-도달가능성 · `components/calc/GiftTaxForm.tsx:361`

- **현상**: `if (result) { return <GiftTaxResultView .../> }`(:314)로 result가 truthy면 결과 뷰를 조기 반환한다. 그 아래의 폼 렌더 구간에서 result는 항상 null이므로 :361·:402의 `disabled={!result}`는 언제나 true다.
- **근거**: components/calc/GiftTaxForm.tsx:314(조기 반환) · :359-363(헤더 SaveButton, disabled={!result}) · :399-404(하단 SaveButton, 동일) / components/calc/shared/SaveButton.tsx:44(disabled 그대로 button에 전달)
- **영향**: 증여세 마법사 입력 화면의 저장하기 버튼 두 개는 어떤 입력을 해도 활성화되지 않는 죽은 컨트롤이다. 형제인 상속세 마법사는 같은 자리에서 `disabled={isEmpty}`로 입력 기반 임시 저장을 허용한다(InheritanceTaxForm.tsx:526 · :602) — 증여세만 임시 저장 경로가 없다.
- **제안**: 형제와 같은 술어로 바꾸거나(입력이 하나라도 있으면 활성) 폼 화면에서 버튼 자체를 렌더하지 않는다. 지금의 disabledReason 문구는 활성화될 수 없는 조건을 안내하고 있다.
- **대조**: `components/calc/InheritanceTaxForm.tsx:526` · `components/calc/InheritanceTaxForm.tsx:602` · `components/calc/shared/SaveButton.tsx:44`
- *(리뷰 ID c24-5)*

### IG-155 · 주식 합계 미리보기가 단일진실 헬퍼를 우회해 할증 판정이 갈린다

`[2/2 · ½ · 강등 MAJOR→MINOR]` · **MINOR** · E-표시법령 · `components/calc/StockValuationForm.tsx:54`

- **현상**: TotalStockValue는 상장분만 엔진 단일진실 `computeStockValuation(item)`에 위임하고(:48), 비상장분은 `evaluateUnlistedStockV2(item.unlistedStockValuationV2)`를 직접 호출한다(:54). 그러나 `computeStockValuation`은 V2의 `evaluationDate`가 비어 있으면 인자 valuationDate를 주입한 뒤 평가한다(resolve-estate-item-value.ts:97-101). StockValuationForm은 `valuationDate` prop을 갖고 있지만(:98) TotalStockValue에 넘기지 않는다(:307).
- **근거**: components/calc/StockValuationForm.tsx:54 `evaluateUnlistedStockV2(item.unlistedStockValuationV2)` · :307 `<TotalStockValue items={items} />` / lib/tax-engine/valuation/resolve-estate-item-value.ts:97-101 `if (!v2.evaluationDate && valuationDate) { … v2 = { ...v2, evaluationDate: vd }; }` / evaluationDate는 §53⑧2호 게이트로 흘러가 lib/tax-engine/property-valuation/max-shareholder-premium.ts:101-106에서 `D` 부재 시 `section53_8_2FailReason = "missing_input"`으로 배제를 무효화한다 / UI는 평가기준일 빈 칸에 「상속개시일·증여일 자동 적용」을 안내한다(components/calc/inheritance/unlisted-stock-v2/CorporateInfoSection.tsx:264-267) / 같은 목록의 헤더 합계는 lib/stores/inheritance-summary.ts:101을 통해 날짜를 넘긴다(components/calc/inheritance/Step1Estate.tsx:52).
- **영향**: 비상장주식 V2에서 평가기준일을 비운 채(UI 안내대로) 최대주주 §53⑧2호 배제를 선택하면, 헤더 합계·사이드바·엔진은 배제 성립으로 할증 0%인데 「주식 합계 (예상)」만 배제 무효로 20% 할증된 금액을 보여준다. 같은 화면 두 합계가 어긋난다.
- **제안**: TotalStockValue의 비상장 분기를 지우고 상장·비상장 모두 `computeEffectiveValuation(item, valuationDate)`(또는 최소한 `computeStockValuation(item, valuationDate)`)로 위임하며, StockValuationForm.tsx:307에서 valuationDate를 전달한다.
- **대조**: `lib/tax-engine/valuation/resolve-estate-item-value.ts:97` · `lib/tax-engine/property-valuation/max-shareholder-premium.ts:101` · `lib/stores/inheritance-summary.ts:101` · `components/calc/inheritance/Step1Estate.tsx:52` · `components/calc/inheritance/unlisted-stock-v2/CorporateInfoSection.tsx:264`
- **½ 정정(code-fact)**: TotalStockValue가 valuationDate fallback을 우회해 「주식 합계 (예상)」이 같은 화면의 그룹 헤더 합계(sumEstateItemsValuation(items, deathDate))와 갈린다 — 실측 3,839,760,000 vs 3,199,860,000(§53⑧2호 배제 무효화로 20% 할증 차이 639,900,000). 단, 어긋나는 상대는 「엔진」이 아니다: 서버 엔진 경로(evaluateAllEstateItems → evaluateUnlistedStockV2AsPropertyResult)도 동일하게 날짜를 주입하지 않아 20% 쪽이며, 애초에 unlistedStockValuationV2Schema:150이 evaluationDate를 필수로 요구해 그 상태의 요청은 Zod 400으로 거부된다(buildInput에 주입 단계 없음). 따라서 이 항목은 「미리보기 ↔ 헤더 합계·사이드바·validate」 3자 불일치이고, valuationDate 전달만으로는 엔진 leaf·Zod 층의 fallback 부재라는 별개 갭이 남는다.
- *(리뷰 ID c25-3)*

### IG-156 · 미성년 배지가 사용자 지정 override를 무시해 엔진과 어긋난다

`[2/2 · ½]` · **MINOR** · E-표시법령 · `components/calc/HeirTableView.tsx:169`

- **현상**: HeirTableView는 미성년 여부를 `differenceInYears(deathDate, birthDate) < 19`로 직접 계산한다(:169-182). 엔진의 단일진실 술어 `resolveMinorBeneficiary`는 `heir.isMinorOverride`가 있으면 그 값을 먼저 쓴다(inheritance-gift-common.ts:634). 배지 계산에는 override 참조가 없다.
- **근거**: components/calc/HeirTableView.tsx:167-182 (`const isMinor = !isCorporate && !!birthDateForMinor && !!deathDate && (() => { … differenceInYears(death, birth) < 19 })()`) — 파일 어디에도 `isMinorOverride` 없음 / lib/tax-engine/inheritance-gift-common.ts:630-641 `resolveMinorBeneficiary` 1순위 `if (heir.isMinorOverride != null) return heir.isMinorOverride;` / 이 헬퍼가 §27② 40% 할증 판정에 쓰인다: lib/tax-engine/inheritance-generation-skip.ts:115 `const isMinor = resolveMinorBeneficiary(heir, input.deathDate);` / override 입력 경로는 실재한다: components/calc/HeirEditor.tsx:435-449 「미성년 판정 수동 변경」 ToggleCard.
- **영향**: 세대생략 수유자에 대해 사용자가 「미성년자로 처리」를 켜면 엔진은 40% 할증을 적용하는데 표에는 「미성년」 배지가 뜨지 않고, 반대로 override를 OFF(성년)로 두면 엔진은 30%인데 배지는 「미성년」으로 표시된다. 표가 실제 적용 할증률과 반대 신호를 준다.
- **제안**: 배지 계산을 `resolveMinorBeneficiary(heir, deathDate)` 호출로 교체한다(single-source-engine-helper). deathDate 미입력 시에만 배지를 숨기면 된다.
- **대조**: `lib/tax-engine/inheritance-gift-common.ts:634` · `lib/tax-engine/inheritance-generation-skip.ts:115` · `components/calc/HeirEditor.tsx:437`
- **½ 정정(rule-impact)**: 기전(機轉)은 전부 사실이나 「영향」서술이 과장됐다. 정정: HeirTableView의 「미성년」배지는 override를 보지 않는 순수 연령 판정이고, 엔진 resolveMinorBeneficiary는 override를 1순위로 쓴다 — 이 어긋남이 실제로 관측되는 범위는 **relation="legatee" + isGenerationSkipBeneficiary=ON + isMinorOverride 명시 설정** 조합뿐이다(HeirEditor.tsx:390-466이 그 조건에서만 override를 노출하고, changeHeirRelation은 legatee 이탈·corporate 전환 시 isMinorOverride를 undefined로 지운다 — HeirEditor.tsx:75·94). 일반 상속인 행에서는 override가 항상 undefined라 제안된 교체는 no-op이다. 또한 「엔진은 40% 할증을 적용하는데」는 무조건 성립하지 않는다 — inheritance-generation-skip.ts:137은 `isMinor && numerator > MINOR_SURCHARGE_THRESHOLD(20억)`일 때만 40%이고, 20억 이하면 override를 뒤집어도 세액은 30%로 동일하다(세액 영향 없음). 다만 **표시 모순은 20억과 무관하게 성립한다**: 결과 화면 GenerationSkipFormulaRows.tsx:63-69가 엔진 `row.isMinor`(override 반영)로 "30%, 미성년" 태그를 붙이므로, 같은 계산 안에서 입력 표(자동판정)와 결과 표(override 반영)가 서로 반대 라벨을 낸다. 즉 결함의 실체는 「표가 할증률과 반대 신호」가 아니라 「입력 표 배지 ↔ 결과 표 미성년 라벨의 화면 간 모순」이며, 세액 무영향인 표시 결함이므로 MINOR 유지가 타당하다. 수정 시 주의: 배지는 `parsedRrn?.birthDate ?? heir.birthDate`로 주민번호 파생 생년월일도 쓰지만 resolveMinorBeneficiary는 heir.birthDate만 본다(HeirEditor.tsx:241-253이 주민번호 입력 시 birthDate를 함께 set하므로 실무상 동치이나, 단순 치환 시 이 fallback이 사라진다).
- *(리뷰 ID c25-4)*

### IG-157 · 한국어 라벨 오류 포매터가 미배선 — Zod 내부 경로가 그대로 노출

`[2/2 · ½]` · **MINOR** · E-표시법령 · `components/calc/InheritanceTaxForm.tsx:449`

- **현상**: InheritanceTaxFormErrors.ts는 Zod issue path를 한국어 라벨로 바꾸는 `formatInheritanceApiError`(+`INHERITANCE_FIELD_LABELS`·`labelForInheritancePath`)를 export하고 InheritanceTaxForm이 이를 import하지만(:82), 실제 오류 표시(:449)는 lib/calc/inheritance-api.ts의 동명 일반 포매터(`formatApiError`, :44에서 별칭 import)를 부른다. 특화 포매터는 어디서도 호출되지 않는다.
- **근거**: components/calc/InheritanceTaxForm.tsx:82 `import { collectStepErrors, formatStepErrors, formatInheritanceApiError } from "./InheritanceTaxFormErrors";` · :44 `formatInheritanceApiError as formatApiError` · :449 `? formatApiError(res.data)` / lib/calc/inheritance-api.ts:109-124는 `iss.path.join(".")` 원문을 그대로 출력 / components/calc/InheritanceTaxFormErrors.ts:59-82는 `INHERITANCE_FIELD_LABELS`로 한국어 라벨 치환 + `n번` 순번 표기 / `npx eslint components/calc/InheritanceTaxForm.tsx` → `82:47 warning 'formatInheritanceApiError' is defined but never used` (warning이라 lint 게이트를 통과한다).
- **영향**: 서버 Zod 검증 실패 시 사용자에게 `deductionInput.familyBusiness.heirId: Required` 같은 내부 필드 경로가 그대로 표시된다(내부 식별자 화면 노출 금지 원칙 위반). 라벨 테이블·순번 표기는 코드에 있으나 죽어 있다.
- **제안**: line 449의 `formatApiError`를 InheritanceTaxFormErrors의 `formatInheritanceApiError`로 바꾸고, line 44의 별칭 import를 제거한다(둘 중 하나만 남긴다).
- **대조**: `components/calc/InheritanceTaxFormErrors.ts:72` · `lib/calc/inheritance-api.ts:109`
- **½ 정정(rule-impact)**: 미배선·데드코드 사실관계는 전건 성립한다. :44가 lib/calc/inheritance-api의 일반 포매터를 formatApiError로 별칭 import하고, :82가 특화 포매터를 별도 import하며, 실제 호출부 :449는 일반 포매터를 부른다. 특화 formatInheritanceApiError·labelForInheritancePath·INHERITANCE_FIELD_LABELS는 저장소 전체에서 InheritanceTaxFormErrors.ts 내부 외에는 참조가 없고, eslint가 `82:47 warning 'formatInheritanceApiError' is defined but never used`를 warning(0 errors)으로 내어 게이트를 통과한다. 형제 경로는 반증이 아니라 확증이다 — components/calc/gift/gift-api-error-format.ts가 라벨표·`n번` 순번·slice(0,8) 불릿까지 거의 동일한 쌍둥이이고 GiftTaxForm.tsx:168이 그것을 실제로 호출한다. 즉 특화 포매터 사용이 저장소 관례이고 상속세만 이탈했다.

정정 지점은 「영향」이다. 두 포매터를 실제 실행해 비교한 결과, 리뷰어가 든 예시 `deductionInput.familyBusiness.heirId`는 제안한 교체로 고쳐지지 않는다 — 특화 포매터도 `• deductionInput › familyBusiness › heirId: Required`를 내어 내부 식별자가 그대로 남고 구분자만 바뀐다. INHERITANCE_FIELD_LABELS가 inheritanceTaxInputSchema(lib/validators/property-valuation-input.ts:499-537)와 드리프트해 있기 때문이다: 최상위 20개 키 중 라벨이 있는 것은 estateItems·funeralExpense·generationSkipAssetAmount 3개뿐이고, 표에는 `inheritanceDate`가 있으나 실제 스키마 키는 `deathDate`, 표의 `priorGiftsTotal`에 대응하는 스키마 키는 `preGiftsWithin10Years`다. 실효가 있는 경로는 사실상 estateItems 배열 계열(`estateItems.0.marketValue` → `상속재산 › 1번 › 시가`)에 한정된다. 또한 :449는 :432의 클라이언트 validate ⑧ 조기반환 뒤에 있어 validate와 Zod가 어긋날 때만 도달한다.

따라서 올바른 처방은 「:449를 특화 포매터로 교체 + :44 별칭 import 제거」에 더해, 라벨표를 실제 Zod 스키마 키에 맞춰 정정하는 것(최소 deathDate·preGiftsWithin10Years·heirs·deductionInput·creditInput 등)까지 포함해야 한다. 교체만 하면 리뷰어가 제시한 대표 증상은 그대로 남는다.
- *(리뷰 ID c25-5)*

### IG-158 · §69 산출근거 각주의 「3%」가 하드코딩돼 연도율과 어긋난다

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/TaxCreditBreakdownCard.tsx:305`

- **현상**: buildSection69Formula은 283·286행에서 filingRatePct(= credit.filingCreditRate 연도 echo)로 율을 표시해 놓고, 바로 아래 305행 각주는 「각각 3% 적용 후 합산」으로 3%를 문자열에 박아 두었다. §69 율은 기준일별로 다르다 — 2016 이전 10% / 2017 7% / 2018 5% / 2019~ 3%이고 엔진이 그 값을 echo한다.
- **근거**: components/calc/TaxCreditBreakdownCard.tsx:283·286(동적) vs :305(하드코딩 3%) · 연도율 실재: __tests__/tax-engine/gift/filing-credit-year-rate.test.ts:37-42(2016-12-31→0.10, 2017-01-01→0.07, 2018-01-01→0.05) · echo 경로: lib/tax-engine/inheritance-gift-tax-credit.ts:601·380 filingCreditRate
- **영향**: 2018년 이전 증여·상속 기준일로 계산하면 같은 펼침 안에서 「× 5%」와 「각각 3% 적용」이 동시에 표시돼 산출근거가 자기모순이 된다. 사용자가 각주 쪽을 신뢰하면 신고세액공제액을 잘못 검산한다.
- **제안**: 305행 문자열의 3%를 filingRatePct 보간으로 바꾼다(283행과 동일 변수 재사용).
- **대조**: `lib/tax-engine/inheritance-gift-tax-credit.ts:601` · `__tests__/tax-engine/gift/filing-credit-year-rate.test.ts:37`
- *(리뷰 ID c26-3)*

### IG-159 · 신고세액공제 율 표시가 2017년에 「7.000000000000001%」로 나온다

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/TaxCreditBreakdownCard.tsx:486`

- **현상**: 라벨(486행)과 산식(260행)이 모두 `(credit.filingCreditRate ?? 0.03) * 100`으로 퍼센트를 만든다. 2017년 기준일이면 rate가 0.07이고 JS에서 0.07*100 = 7.000000000000001이다(node로 실측 확인). 0.03·0.05·0.10은 정확히 떨어지므로 2017년 케이스에서만 드러난다.
- **근거**: components/calc/TaxCreditBreakdownCard.tsx:260 · :283 · :286 · :486 · 0.07 echo 실재: __tests__/tax-engine/gift/filing-credit-year-rate.test.ts:38-39(2017-01-01·2017-12-31 → 0.07) · 같은 산식이 엔진 신고서 행 빌더에도 있다: lib/tax-engine/gift-filing-form-rows.ts:80
- **영향**: 2017년 증여·상속 결과 화면의 세액공제 카드 라벨이 「신고세액공제 (7.000000000000001%)」로, 펼침 산식도 「× 7.000000000000001%」로 표시된다.
- **제안**: 퍼센트 산출을 `+(rate * 100).toFixed(2)` 같은 정규화 헬퍼 1개로 모으고 라벨·산식이 그것을 공유하게 한다(엔진 gift-filing-form-rows.ts:80도 같은 헬퍼 대상).
- **대조**: `lib/tax-engine/gift-filing-form-rows.ts:80` · `__tests__/tax-engine/gift/filing-credit-year-rate.test.ts:38`
- *(리뷰 ID c26-4)*

### IG-160 · §69 신고분 세액 산식에 §71 농지감면 차감항이 빠져 등식이 안 맞는다

`[2/2]` · **MINOR** · E-표시법령 · `components/calc/TaxCreditBreakdownCard.tsx:290`

- **현상**: buildSection69Formula의 신고분 세액 산식은 증여세액공제·영리법인 면제·외국납부·단기재상속·조특 특례 다섯 항만 차감해 base와 같다고 표시한다(290-303행). 그러나 증여세 엔진은 §69 기준(remainingTax)에서 조특법 §71 영농자녀 농지 감면세액도 차감한 뒤 그것을 filingCreditBase로 echo한다.
- **근거**: components/calc/TaxCreditBreakdownCard.tsx:289-303(표시 산식) · lib/tax-engine/inheritance-gift-tax-credit.ts:523-528(remainingTax에서 farmlandReductionAmount 차감) · :600(filingCreditBase = 그 remainingTax) · 실제 전달 경로: lib/tax-engine/gift-tax.ts:325 farmlandReductionAmount
- **영향**: §71 농지 감면이 적용된 증여 계산에서 펼친 산식의 뺄셈 결과가 화면에 표시된 base와 감면액만큼 어긋난다. 사용자가 표시된 숫자로 검산하면 산출근거가 틀린 것으로 보인다.
- **제안**: corporateExemption과 같은 방식으로 농지 감면액을 prop으로 받아 `{farmland > 0 && <> − 농지 감면세액</>}` 항을 산식 양쪽 줄에 추가한다(GiftTaxResultView가 result.farmlandReductionDetail을 이미 갖고 있다).
- **대조**: `lib/tax-engine/inheritance-gift-tax-credit.ts:523` · `lib/tax-engine/inheritance-gift-tax-credit.ts:600` · `lib/tax-engine/gift-tax.ts:325` · `components/calc/results/GiftTaxResultView.tsx:538`
- *(리뷰 ID c26-5)*

### IG-161 · ⑧ 대납 차단 목록에 「동시증여 다중 건」이 없어 ⑫에서 400이 난다

`[2/2]` · **MINOR** · A-배관 · `components/calc/gift-tax-form-validate.ts:446`

- **현상**: donorPaysGiftTax=true의 차단 조합을 ⓐ simultaneousGifts(§46①2호 안분 배열) · ⓑ 특례 · ⓒ 세대생략 셋만 검사한다. ⑫ Zod는 여기에 더해 simultaneousGiftForms(동시증여 다중 건 배열)가 1건이라도 있으면 건 0의 donorPaysGiftTax=true를 차단한다. 두 토글은 GiftCreditChecklist에서 서로를 가리지 않는 형제라 동시에 켤 수 있다.
- **근거**: components/calc/gift-tax-form-validate.ts:444-457(ⓐⓑⓒ만 — ⓐ는 form.simultaneousGifts를 본다) · lib/validators/property-valuation-input.ts:716-733(giftSimultaneousRequestSchema superRefine: simultaneousGiftForms 있으면 donorPaysGiftTax 차단) · 두 토글: components/calc/gift/GiftCreditChecklist.tsx:344(대납)·:433(동시증여 다중 건) · 다건 경로 전송: components/calc/GiftTaxForm.tsx:141-156
- **영향**: 대납 토글과 동시증여 다중 건 토글을 함께 켜면 단계 검증은 통과하고, 계산 버튼을 눌러 API 왕복 후에야 400(「동시증여 다중 건 계산과 대납(代納)은 현재 함께 계산할 수 없습니다」)으로 막힌다. 이 저장소가 명시적으로 방지하는 「UI 통과 ↔ API 400 모순」이다.
- **제안**: 444행 블록에 ⓓ를 추가한다: `if (form.simultaneousGiftForms && form.simultaneousGiftForms.length > 0) return "동시증여 다중 건 계산과 대납(代納)은 현재 함께 계산할 수 없습니다.";` — Zod와 같은 문구로 동기화.
- **대조**: `lib/validators/property-valuation-input.ts:716` · `components/calc/gift/GiftCreditChecklist.tsx:344` · `components/calc/gift/GiftCreditChecklist.tsx:433` · `components/calc/GiftTaxForm.tsx:141`
- *(리뷰 ID c26-6)*

### IG-162 · 증여세만 공통 저장 헬퍼를 안 써 미결(임시) 저장이 안 된다

`[2/2 · ½ · 강등 MAJOR→MINOR]` · **MINOR** · C-공용컴포넌트 · `components/calc/gift-tax-save-handler.ts:28`

- **현상**: 7개 {tax}-save-handler 중 증여세만 makeRunManualSave를 쓰지 않고 자체 구현으로 result가 없으면 NO_RESULT를 throw한다. 공통 헬퍼는 result가 없으면 saveOrUpdateByBusinessKey로 미결 draft를 저장한다.
- **근거**: components/calc/shared/save-handler-builders.ts:3-8(6세목 공통 저장 헬퍼 v4 §3 표준 통합)·:74-85 draft 저장 분기 · acquisition/comprehensive/inheritance/property/stock-transfer/transfer 6개 handler가 모두 makeRunManualSave 사용(각 파일 상단 import) · components/calc/GiftTaxForm.tsx:359·399가 계산 전 화면에서도 SaveButton을 노출
- **영향**: 증여세 마법사에서 계산 전에 저장하기를 누르면 안내 토스트만 뜨고 아무것도 저장되지 않는다. 나머지 6세목은 같은 조작에서 미결 이력이 남아 다음 세션에 이어서 작업할 수 있다.
- **제안**: gift-tax-save-handler를 makeRunManualSave<GiftForm>({ taxType: "gift", isFormEmpty, getTaxLawVersion: (f) => f.giftDate || "" })로 교체하고 GiftTaxForm의 isDraft 하드코딩(:300)을 제거한다.
- **대조**: `components/calc/shared/save-handler-builders.ts:74` · `components/calc/inheritance-tax-save-handler.ts:25`
- **½ 정정(code-fact)**: 증여세만 7개 {tax}-save-handler 중 유일하게 공통 makeRunManualSave를 쓰지 않고, result가 없으면 NO_RESULT를 throw하는 자체 구현(gift-tax-save-handler.ts:28-30)을 유지한다. 그 결과 GiftTaxForm은 저장 버튼을 disabled={!result}로 묶어(:361·402) 미결(임시) 저장 경로 자체가 없고, :300에서 isDraft:false를 하드코딩한다. 같은 2슬롯 레이아웃을 쓰는 형제 InheritanceTaxForm은 disabled={isEmpty}로 열려 있어 입력 1건만 있어도 draft가 남고, transfer·stock_transfer는 헤더 저장 버튼이 상시 열려 있다(3세목 대조군). 배관은 이미 갖춰져 있다 — business-key.ts:74-76이 gift에 대해 null을 반환해 calculation-repository.ts:190-204의 saveDraftByContent 폴백으로 이어지므로, 공통 헬퍼로 교체하면 draft가 그대로 저장된다. 다만 사용자에게는 조용한 실패가 아니라 비활성 버튼 + 사유 툴팁으로 드러나며, 취득·재산·종부 3세목은 폼 화면에 저장 버튼 자체가 없어 동일 기능이 애초에 없다. 수정하려면 handler 교체만으로는 부족하고 (a) :361·402의 disabled={!result} 제거, (b) :300의 isDraft 하드코딩 제거, (c) formatGiftSaveMessage → 공통 formatSaveMessage(draft 분기 + 190건 한도 경고), (d) :94-102의 손수 만든 autoSaveToast → buildAutoSaveToast(승격 분기)까지 함께 가야 한다.
- *(리뷰 ID c27-5)*

### IG-163 · 증여세 저장 토스트에만 이력 한도 경고가 없다

`[2/2]` · **MINOR** · C-공용컴포넌트 · `components/calc/gift-tax-save-handler.ts:48`

- **현상**: formatGiftSaveMessage는 count 파라미터 자체가 없어 HISTORY_WARNING_THRESHOLD 경고 줄을 붙이지 않는다. 공통 formatSaveMessage는 count를 받아 한도 경고를 덧붙이고, 다른 세목 폼은 useRecordCount로 그 값을 넘긴다.
- **근거**: components/calc/shared/save-handler-builders.ts:101-135(count 인자·경고 문구) · components/calc/InheritanceTaxForm.tsx:134·166 useRecordCount → formatInheritanceSaveMessage(outcome, recordCount) · components/calc/AcquisitionTaxForm.tsx:120·129 동일 · components/calc/GiftTaxForm.tsx:308·310은 인자 1개만 전달
- **영향**: 증여세 사용자만 저장 한도 임박 경고를 못 받는다. 한도 도달 시 오래된 이력이 자동 삭제되는데 그 사실이 사전에 안내되지 않는다.
- **제안**: 공통 formatSaveMessage로 교체하면서 GiftTaxForm에 useRecordCount를 붙여 count를 전달한다.
- **대조**: `components/calc/shared/save-handler-builders.ts:132` · `components/calc/InheritanceTaxForm.tsx:166`
- *(리뷰 ID c27-6)*

### IG-164 · 기본(auto) 모드에서 증여재산공제·과세표준 열과 소계가 항상 0

`[2/2 · ½]` · **MINOR** · E-표시법령 · `components/calc/results/source-summary/PriorGiftSummaryTable.tsx:130`

- **현상**: 증여세 과세표준 열은 gift.giftTaxBase를, 증여재산공제 열은 giftAmount − (giftTaxBase ?? giftAmount)를 쓴다. 상속세 마법사의 기본 모드는 auto이고 그때 giftTaxBase는 undefined다(엔진이 derivePriorGiftTaxBase로 내부 도출). 소계는 formatCellOrDash를 거치지 않아 0으로 표시된다(line 155·152).
- **근거**: components/calc/prior-gift/GiftTaxBaseModeBlock.tsx:33·51 기본 auto, auto 복귀 시 giftTaxBase undefined · lib/tax-engine/inheritance-tax.ts:94-96 derivePriorGiftTaxBase로 엔진 내부 도출 · components/calc/results/InheritanceTaxResultView.tsx:328 및 InheritanceTaxForm.tsx:487 form.priorGifts 원본 그대로 전달
- **영향**: 기본 설정으로 계산하면 증여재산가액 소계는 수십억인데 증여재산공제·증여세 과세표준 소계는 0으로 찍혀 표 안에서 서로 모순된다. 엔진이 실제로 쓴 과세표준이 요약표에 드러나지 않는다.
- **제안**: auto 모드에서는 두 열에 자동 도출(§53) 표기를 넣거나(형제 InheritanceFilingFormTable.tsx:265의 라벨 방식) 도출값을 result로 echo해 표시한다.
- **대조**: `components/calc/prior-gift/GiftTaxBaseModeBlock.tsx:33` · `lib/tax-engine/inheritance-tax.ts:96` · `components/calc/results/InheritanceFilingFormTable.tsx:265`
- **½ 정정(code-fact)**: 기본(auto) 모드에서 증여재산공제·증여세 과세표준 두 열은 행마다 "-"로 비고, 소계 행만 "0"으로 찍힌다(:152·:155가 formatCellOrDash를 거치지 않음). 즉 결함은 「열이 0」이 아니라 ①엔진이 derivePriorGiftTaxBase로 실제 사용한 §53 도출 과세표준이 요약표에 전혀 드러나지 않고(행은 "-"), ②증여재산가액 소계는 수십억인데 같은 소계 행의 공제·과세표준만 "0"이라 표 내부에서 모순되며 "-"인 행들과도 어긋난다는 점이다. 형제 InheritanceFilingFormTable.tsx:258-268이 동일 조건에서 "자동 도출(§53)" 라벨을 이미 붙이고 있어 제안된 처방(라벨 표기 또는 도출값 echo)은 그대로 유효하다.
- *(리뷰 ID c27-7)*

---

## NIT 강등 — 보고 대상 제외 (8건)

refuter가 「취향·무해」로 판정해 심각도를 NIT로 낮춘 건. 규칙상 NIT는 리뷰 보고 대상이 아니므로 본문에서 제외했다.

- `c02-6` (원 MINOR) — `components/calc/deemed-gift/ExcessShareholderTable.tsx:116` — `label=""` + `hideLabel` 조합이 CurrencyInput의 aria-label 보존 계약을 무력화한다
- `c08-2` (원 MAJOR) — `components/calc/inheritance/FinancialDeductionChip.tsx:63` — §22② 최대주주 자산에서 금융재산공제 토글이 무반응(사유 안내 없음)
  - ⚠️ **두 렌즈 판정이 갈린 유일한 건**: rule-impact는 2회 모두 반증, code-fact는 1차 반증 → 2차 「절반 성립·NIT」.
    최신 실행 채택 정책에 따라 기각이 아닌 NIT로 분류했다.
- `c11-4` (원 MINOR) — `components/calc/inheritance/estate-card/EstateItemAdvancedPanel.tsx:92` — 패널의 print:block이 죽어 있다 — 부모가 접힘 상태에서 언마운트한다
- `c14-7` (원 MINOR) — `components/calc/inheritance/filing-form-9/FilingForm9CoverSection.tsx:165` — 별지9호 ⑨ 거주구분이 항상 미체크 — result.decedentType 미사용
- `c15-4` (원 MINOR) — `components/calc/inheritance/listed-stock/ListedStockSecurityInfoSection.tsx:95` — 보유 주식 수는 필수 표시도 ⑧validate 도 없어 평가액 0이 침묵 통과한다
- `c15-6` (원 MINOR) — `components/calc/inheritance/listed-stock/ListedStockValuationPreviewCard.tsx:73` — 산식 표시에 floor() 를 그대로 노출한다
- `c19-6` (원 MINOR) — `components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts:24` — §54④ 삭제 호 인용이 틀렸다 — 삭제된 것은 4호이고 3호는 현행
- `c20-5` (원 MINOR) — `components/calc/results/GenerationSkipSurchargeBreakdownCard.tsx:97` — ⑧ 정확 분수 분기가 도달 불가 — 항상 정수 반올림 % 등식만 표시

---

## 부록 A — 전역 정적 스캔 (main-loop 실측, 워크플로와 독립)

## 규칙 준수 확인 (위반 0건)

| 축 | 검사 | 결과 |
|---|---|---|
| C | 임의 px `text-[Npx]` | **0건** |
| C | native `<input type="radio"\|"checkbox">` | **0건** |
| C | `<input type="date">` | **0건** |
| C | native `<Link href="/">` 홈링크 | **0건** |
| C | 동적 톤 보간 `bg-${...}` | **0건** (6건은 전부 "금지" 설명 주석) |
| D | `any` · `<any>` · `as any` | **0건** |
| D | `@ts-ignore` / `@ts-expect-error` | **0건** |
| E | 절세·유리·불리·절감 표현 | **0건** |
| F | 800줄 초과 | **0건** (최대 751줄) |

## 위반 후보 (워크플로 검증 대상)

### S-1 [MINOR·정정됨] LoginPromptBanner — 렌더 경로가 죽은 dead prop (당초 MAJOR로 제기 → 실측으로 반감)

- `components/calc/results/InheritanceTaxResultView.tsx:657` · `GiftTaxResultView.tsx:729`
  → `{showLoginPrompt && <LoginPromptBanner />}`
- 배너 문구는 실제로 허위다: "로그인 후 계산 이력 조회 및 PDF 다운로드가 가능합니다."
  (`proxy.ts:4` 실측 — "이력은 로컬 IndexedDB 일원화 — 보호 라우트(/api/history·/api/pdf) 제거됨")
- **그러나 사용자에게 보이지 않는다.** `showLoginPrompt` 기본값 `false`이고,
  저장소 전체에서 이 prop을 `true`로 넘기는 호출부가 **0건**이다(전수 grep 확인).
  호출부 `InheritanceTaxForm.tsx:478`·`GiftTaxForm.tsx:316` 모두 이 prop을 전달하지 않는다.
- 남는 결함은 둘:
  1. **dead prop + dead import**가 결과뷰 2곳에 살아 있다 — 누가 켜면 즉시 허위 문구가 뜬다.
  2. **문서 드리프트**: `components/calc/CLAUDE.md`가 「상속·증여·종부세 **3곳은 아직 이 컴포넌트를 쓴다**」고
     적었으나, 상속·증여는 렌더 경로가 죽어 있어 실질적으로 쓰지 않는다.
     실제로 조건 없이 렌더하는 곳은 **종부세 1곳**뿐이다(`app/calc/comprehensive-tax/page.tsx:546` — 이번 범위 밖).
- 제안: 결과뷰 2곳의 `showLoginPrompt` prop·import·렌더 라인을 제거하고, CLAUDE.md 서술을 「종부세 1곳」으로 정정.

### S-2 [MINOR] placeholder 숫자 예시 (규칙 명시 금지)
- `components/calc/inheritance/CorporateHeirFields.tsx:198` — `placeholder="예: 60"`
- `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:255` — `placeholder="예: 20년"`
- `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:256` — `placeholder="예: 60%"`
- 근거: components/calc/CLAUDE.md 「placeholder에 숫자 예시 금지 … 잘못된 예: `placeholder="예: 91.78"`」
- 회색지대(형식 예시·계산 예제 아님): `other-forms.tsx:270`·`ListedStockSecurityInfoSection.tsx:87` 종목코드 "예: 005930"

### S-3 [MINOR] `onFocus={(e) => e.target.select()}` 수동 추가 (Provider 중복)
- `app/calc/family-business-postmgmt/page.tsx:283, 392, 397`
- `components/calc/deemed-gift/contribution-form.tsx:64`
- `components/calc/deemed-gift/presumption-forms.tsx:112, 121`
- 근거: components/calc/CLAUDE.md 「`onFocus` 수동 추가 금지 (Provider가 처리)」

### S-4 [MINOR] 금액 셀 `font-mono` 인데 `tabular-nums` 없음 — 34건
- 근거: 「금액(원) 셀은 `text-right font-mono tabular-nums whitespace-nowrap`」
- 대표: `unlisted-stock-v2/PerShareValuationResultCard.tsx:376~386`(7행) ·
  `NetAssetCalculationTable.tsx:223,254` · `unlisted-stock-v2/besshi/Page1CoverSection.tsx:46~50` ·
  `results/CorporateExemptionSection.tsx:116` · `inheritance/DebtAllocationInput.tsx:152` ·
  `app/calc/inheritance-postmgmt/page.tsx:375`
- 전체 목록: `e5.txt`

### S-5 [MINOR·재집계] "원" 접미사 직접 표기 — **50건** (첫 집계 23건은 정규식이 좁아 과소)

- 근거: 메모리 `feedback_no_won_suffix` 원문 — 「모든 결과/보고서 숫자 끝의 "원"은 표기하지 않는다.
  표·카드·PDF·formula 모두. 콤마 포맷만 유지. 단위가 필요하면 컬럼 헤더·라벨·hint로만」
- **예외로 판정한 것**(규칙 명문): 입력 필드 placeholder/hint의 "원" 안내 · 법령 키워드 · 법정 금액 서술
  (`"증여재산공제 5천만원"`·`"2,000만원 초과 ~ 1억원 이하"`) · 입력란 단위 span 2건
  (`EstateBodyCryptoAsset.tsx:149` · `FiscalYearAdjustmentTable.tsx:358`) · 검증 에러 메시지 5건
  (`InheritanceTaxFormErrors.ts` · `UnlistedStockSimpleFields.tsx` · `gift-tax-form-validate.ts`)

| 파일 | 건수 |
|---|---:|
| `inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx` | **32** |
| `inheritance/unlisted-stock-v2/UnlistedStockHistoryModal.tsx` | 3 |
| `inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx` | 3 |
| `inheritance/unlisted-stock-v2/GoodwillCalculationTable.tsx` | 2 |
| `inheritance/listed-stock/ListedStockBesshiResultView.tsx` | 2 |
| `inheritance/listed-stock/KiwoomValuationResultCard.tsx` · `inheritance/DeductionLimitNoticeCard.tsx` · `exemption/ExemptionSummaryCard.tsx` | 각 1 |

- `PerShareValuationResultCard.tsx` 한 파일이 71%다 — 이 파일은 워크플로도 `c17-5`·`c17-6`(내부 enum 노출)로 지적했다.
- `DeductionLimitNoticeCard.tsx:10`은 로컬 포맷터 자체가 `` `${n.toLocaleString()}원` `` — 한 줄 수정으로 그 파일 전체가 해소된다.
- 전체 목록: `won-violations.txt`

### S-6 [검증필요] `as unknown as Date` — BurdenedGiftTransferSection.tsx 5건
- `:59` `acquisitionDate: undefined as unknown as Date` (createEmptyBgt)
- `:452, :590, :614, :659` `set({ ...: d as unknown as Date })` — `d`는 `Date | undefined`
- 파생 결함: 같은 파일 `:51 strToDate()`가 `isNaN(getTime())` 검증을 하는데,
  `:451, :587, :609, :658`은 그 헬퍼를 **쓰지 않고 인라인 `new Date(v)`**를 쓴다 →
  "2026-02-30"처럼 정규식은 통과하나 실재하지 않는 날짜가 Invalid Date로 store에 들어간다.
  `:232`는 헬퍼를 쓴다(동일 파일 내 두 관례 공존).

### S-7 [검증필요] native `<input>` 72건
- 금액·소수점·날짜에 native input을 쓰면 규칙 위반(CurrencyInput/DecimalInput/DateInput 강제).
  텍스트·종목코드 등은 위반 아님 → **필드별 문맥 판정 필요**
- 확정 위반 후보: `app/calc/inheritance-postmgmt/page.tsx:246`(이자율 소수 입력) ·
  `app/calc/family-business-postmgmt/page.tsx:392,397`(inputMode="decimal")
- 전체 목록: `c10b.txt`

## 해소 확인 (결함 아님)

- **G-19 국세기본법 §43의3 부존재** — `app/calc/inheritance-postmgmt/page.tsx:243` 주석이 정정 이력이고,
  라벨은 이미 "국세기본법 **시행령** §43의3② 본문 → **시행규칙** §19의3"로 고쳐져 있다. 현행 정확.

워크플로가 잡지 못하고 정적 스캔만 발견한 항목: **S-1**(LoginPromptBanner dead prop) · **S-3**(onFocus 수동) ·
**S-5**("원" 접미사 50건) · **S-6**(`as unknown as Date`). 반대로 워크플로만 잡은 것이 본문 166건이다.

---

## 부록 B — 리뷰 방법과 신뢰도

**청크 분할**: 경로 사전순 · 줄 수 균형(목표 2,100줄)으로 27청크. **합집합 = 전체 파일 목록** 대조로
커버리지 100% 확인(중복 0 · 누락 0). 범위는 import 그래프로 재산정해 1차에서 빠진 메인 폼 31파일을 2차로 보강했다.

**리뷰**: 각 청크 에이전트가 6축(A~F)을 전부 적용. 배관 축은 `lib/calc/*-api.ts` · `*validate*.ts` ·
`app/api/calc/*/route.ts` · `lib/tax-engine/`를 함께 열어 대조하도록 강제했다.

**검증**: 발견마다 refuter 2명. `refuted:true`는 **성립하지 않음을 입증**했을 때만 허용하고,
입증 실패는 보존(`false`)으로 두었다. 두 렌즈가 모두 반증해야 기각된다.

**재현성 실측**: 세션 한도로 일부가 중복 실행되면서 (건, 렌즈) 조합 348개 중 **192개가 2회 이상 검증**됐다.
그중 **판정이 갈린 것은 1개**(`c08-2` code-fact)뿐이다 — 나머지 191개는 동일 판정을 재현했다.
중복 실행분은 **최신 실행을 채택**하는 정책으로 병합했다.

**정정 비율**: 확정 164건 중 **47건**을 refuter가 「절반만 성립」으로 정정했고,
**18건**의 심각도를 낮췄다. 리뷰어의 최초 주장을 그대로 신뢰하면 안 된다는 뜻이다.

**렌즈별 기여도**(119건 표본 실측): 「절반만 성립」 정정 35건 중 rule-impact가 33건(94%)을,
code-fact가 20건(57%)을 포착했다. 단독 포착은 rule-impact 15건 · code-fact 2건. 두 렌즈는 대체재가 아니다.
