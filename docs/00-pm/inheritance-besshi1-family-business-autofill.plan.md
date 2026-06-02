# 가업상속공제 신고서(별지 제1호서식) 자동채움 확대 — 수정 계획서

> ✅ **Phase 1+2+3 구현 완료 (2026-06-02)**:
> - Phase 1·2: 다·라 인적사항 + 가 상호 + 마 수량/단가 자동채움(엔진 무변경).
> - Phase 3: 소스 없던 9칸(가 사업자번호·대표자성명/주민번호·개업일·업종, 다 재직기간·지분율, 라 종사기간·취임일)을 `FamilyBusinessEligibilitySection`에 "별지 제1호서식 표시 정보" 입력 서브섹션으로 신설 → `FamilyBusinessInheritanceInput` 표시 전용 9필드(계산 미사용) → buildBesshi1Data 매핑 → FormTable·PDF 바인딩.
> - **별지 제1호서식 26칸 중 자동/수집 채움 = 채움10 + Group A 4 + Group B 3 + Group C 9 = 전부.**
> - anchor B1-A1·A2·B1·B2·**C1** + RTL `Besshi1FormTable.test.tsx` 3건 + 전체 5982 PASS.
> - ⚠️ Group C 9필드는 Zod 미등록(`property-valuation-input.ts` 800줄 정책) — 결과뷰가 `form.familyBusiness` 직접 소비하므로 표시·이력 저장 동작(엔진 전송 시 strip되나 계산 미사용이라 무방).

- 작성일: 2026-06-02
- 대상 서식: 별지 제1호서식 「가업상속공제신고서」 (Besshi1)
- 화면: `components/calc/inheritance/deduction-besshi/Besshi1FormTable.tsx` (L23~148, 검증 완료)
- 데이터 빌더: `lib/calc/deduction-besshi-data.ts` `buildBesshi1Data` (L364~394, 검증 완료)
- 타입: `Besshi1Data` (L328~361) · `Besshi1AssetRow` (L243~249)
- PDF: `lib/pdf/InheritanceDeductionBesshiPdf.tsx` `Besshi1Page` (L84~101)
- 호출처: `components/calc/inheritance/deduction-besshi/DeductionBesshiFormsSection.tsx` `b1` useMemo

> 정책: 본 문서의 file:line·"채움/공란"·렌더 바인딩 여부는 실제 코드 확인 완료. 미확정 항목은 **확인 필요**로 명시.
> 선행 완료한 별지5호·별지9호 인적사항 자동채움(피상속인 성명·주민번호, 상속인 주민번호)과 동일 패턴 차용.

---

## 1. 배경·목표

별지 제5호·제9호서식은 피상속인 성명·주민번호(Step1 입력), 신고인(대표 상속인) 성명·주민번호를 자동채움하도록 직전 작업에서 완료됨. 그러나 **별지 제1호서식(가업상속공제신고서)는 동일 식별정보가 전달되지 않아 공란**이다.

목표: **현재 보유 데이터로 채울 수 있는 칸을 모두 자동채움**하고, 소스가 없어 자동 불가한 칸은 (선택적으로) 입력 필드를 신설하거나 수기 안내로 분류한다.

> ⚠️ **핵심 사실(검증)**: `Besshi1Data` 인터페이스에는 `businessName`·`representativeName`·`decedentName`·`decedentResidentId`·`heirName` 등 칸별 필드가 **선언만 되어 있고**, `buildBesshi1Data`는 이들을 **채우지 않으며**(return 객체에 부재, L375~385), `Besshi1FormTable`도 해당 칸을 **`&nbsp;` 하드코딩**으로 렌더(L34·38·39·42·43·72·73·78·83·93·94·97·98·119·120)한다. 즉 자동채움은 **(a) 빌더에서 필드 채움 + (b) FormTable·PDF 셀 바인딩**의 2중 작업이 필요하다("인자 전달만"으로 끝나지 않음 — 별지5호와의 차이점).

---

## 2. 현황 분석 — 별지 제1호서식 칸 매핑 (검증 완료)

렌더 = `Besshi1FormTable.tsx`. "바인딩"列 = 해당 셀이 현재 `data.*`를 읽는지(O)·하드코딩 `&nbsp;`인지(X).

| 섹션 | 칸 | 현재 | 셀 바인딩 | 소스 현황 (검증) |
|---|---|---|---|---|
| **가** | 상호(법인명) | 공란 | X (`&nbsp;`, testid `b1-가-상호` L34) | 가업자산 `EstateItem.name` 도출 후보 — Group B |
| 가 | 사업자등록번호 | 공란 | X (L35) | 소스 없음 |
| 가 | 성명(대표자) | 공란 | X (L38) | 소스 없음 (법인 대표자 ≠ 피상속인 단정 불가) |
| 가 | 주민등록번호(대표자) | 공란 | X (L39) | 소스 없음 |
| 가 | 개업연월일 | 공란 | X (L42) | 소스 없음 |
| 가 | 업종 | 공란 | X (L43) | 소스 없음 (`isEligibleIndustry` boolean만) |
| **나** | 중소기업 여부 | 채움 | O (`data.isSme` L54) | `familyBusinessInput.enterpriseSize` |
| 나 | 상장여부 | 채움 | O (`data.isListed` L56) | `familyBusinessInput.isListedOnExchange` |
| 나 | 중견기업 여부 | 채움 | O (`data.isMedium` L60) | `familyBusinessInput.enterpriseSize` |
| 나 | 직전 3개 사업연도 평균 매출액 | 채움 | O (`data.avgRevenue3Y` L62) | `familyBusinessInput.averageRevenue3Y` |
| **다** | 성명 | **공란** | X (L72) | ✅ Step1 `decedentName` (Group A) |
| 다 | 주민등록번호 | **공란** | X (L73) | ✅ Step1 `decedentResidentNumber` → 필드 `decedentResidentId` (Group A) |
| 다 | 가업영위기간 | 채움 | O (`data.operatingYears` L77) | `familyBusinessDetail.operatingYears` |
| 다 | 대표이사 재직기간 | 공란 | X (L78) | 소스 없음 (`decedentCEORequirementMet` boolean만) |
| 다 | 최대주주등 여부 | 채움 | O (`data.isMajorShareholder` L82) | `familyBusinessInput.decedentMajorShareholdingMet` |
| 다 | 특수관계인포함 지분율 | 공란 | X (L83) | 소스 없음 |
| **라** | 성명 | **공란** | X (L93) | ✅ `heirs` 가업상속인 식별 (Group A) |
| 라 | 주민등록번호 | **공란** | X (L94) | ✅ `heirs` 식별 — **`Besshi1Data.heirResidentNumber` 필드 신설 필요**(라 섹션 현재 heirName·heirEngagement·officerAppointDate·heirAddress만, L352~355) |
| 라 | 가업종사기간 | 공란 | X (L97) | 소스 없음 (`heirTwoYearEngagement` boolean만) |
| 라 | 임원/대표이사 취임일 | 공란 | X (L98) | 소스 없음 |
| **마** | 종류 | 채움 | O (`r.kindLabel` L118) | `FAMILY_BUSINESS_CATEGORY_LABEL[familyBusinessCategory]` |
| 마 | 수량(면적) | 공란 | X (`&nbsp;` L119 — `r.quantity` 미참조) | **주식** = `listedStockShares`(상장)·`unlistedStockValuationV2.ownedShares`(비상장, 소유 주식수). **부동산** = `area`/`quantityCount` — Group B |
| 마 | 단가 | 공란 | X (L120) | **주식 1주당 가액** = 1주당 평가액(`perShareValueNonMaxShareholder`/`premiumPerShare`) 또는 가액÷수량 역산. **부동산** = 가액÷면적 — Group B |
| 마 | 가액 | 채움 | O (`r.amount` L121) | `result.valuationResults` `valuatedAmountOf` |
| 마 | 비고 | 채움 | O (`r.note` L122) | `EstateItem.name` (`note: e.name.trim()` L372) |
| **바** | 가업상속공제 신고액 | 채움 | O (`data.declaredAmount` L136) | `familyBusinessDetail.deduction` |

**칸 합계(검증): 26칸 = 채움 10 / Group A(즉시) 4 / Group B(자산 도출) 3 / Group C(소스 없음) 9.**
- 채움 10: 나 4 + 다(영위기간·최대주주) 2 + 마(종류·가액·비고) 3 + 바 1
- Group A 4: 다 성명·주민번호 + 라 성명·주민번호
- Group B 3: 가 상호 + 마 수량 + 마 단가
- Group C 9: 가(사업자번호·대표자성명·대표자주민번호·개업일·업종) 5 + 다(대표이사재직기간·특수관계인지분율) 2 + 라(가업종사기간·임원취임일) 2

---

## 3. 작업 분류

### Group A — 즉시 자동채움 (신규 입력 0) ★ 핵심
데이터는 이미 보유(Step1 `decedentName`/`decedentResidentNumber`, `form.heirs`). 단 **별지5호와 달리** Besshi1은 (a) 빌더 필드 채움 + (b) FormTable·PDF 셀 바인딩 + (c) `heirResidentNumber` 필드 신설이 함께 필요.

1. **다. 피상속인 성명·주민번호** ← Step1 `decedentName` → `Besshi1Data.decedentName`, `decedentResidentNumber` → `Besshi1Data.decedentResidentId`(필드명 비대칭 주의)
2. **라. 가업상속인 성명·주민번호** ← `heirs` 가업상속인 식별(§4) → `heirName`·신설 `heirResidentNumber`

### Group B — 자동 도출 후보 (자산 데이터 기반, 설계 단계 확인 필요)
빌더 `assetRows.map`에 필드 추가 + FormTable L119·120 셀 바인딩 필요.

3. **가. 상호(법인명)** ← 가업자산(`familyBusinessCategory != null`) `EstateItem.name` (마. 비고 `note`와 동일 소스). **확인 필요**: 복수 가업자산 시 대표 1건 선정 규칙 / 상호·비고 동일값 중복 표시 허용 여부.
4. **마. 수량(면적)** ← 자산 종류별 (주식: 수량 = 주식수):
   - 상장 주식: `EstateItem.listedStockShares`(L93)
   - 비상장 법인 주식(corporate_stock V2): `EstateItem.unlistedStockValuationV2.ownedShares`(소유 주식수, `unlisted-stock-valuation.types.ts:144`)
   - 부동산: `EstateItem.area`/`quantityCount`(L209·212)
   - `Besshi1AssetRow.quantity`는 **string 타입**(L245) → 포맷(주식 "N주", 부동산 "N㎡") 후 대입.
5. **마. 단가** ← 자산 종류별 (주식: 단가 = 1주당 가액):
   - 주식: 1주당 평가액 — 비상장 V2 결과 `perShareValueNonMaxShareholder`(⑦)/`premiumPerShare`(⑧, 최대주주 할증, `unlisted-stock-valuation.types.ts:279·280`), 또는 **가액÷수량 역산**(표시 가액과 자기일관).
   - 부동산: 가액÷면적.
   - **확인 필요**: 비상장 V2 결과를 결과뷰까지 전달하는지(`result.valuationResults`에 1주당 평가액 echo 여부) vs **가액÷수량 역산이 단일·안전**. 역산 권장 — 표시 `가액`과 항상 `가액 = 수량 × 단가` 자기일관.

> Group B 3칸(가. 상호 + 마. 수량 + 마. 단가)은 **주식·부동산 가업자산 모두 도출 가능**. 주식 = (수량 주식수, 단가 1주당 가액), 부동산 = (수량 면적, 단가 ㎡단가). 단가는 **가액÷수량 역산**으로 통일 시 모든 자산 종류·자기일관 충족.

### Group C — 소스 없음 (자동 불가)
`FamilyBusinessInheritanceInput`·`EstateItem`에 입력 필드 자체가 없음 → **사용자 요청("자동으로 채울 수 있는 항목")의 범위 밖**.
- 가. 사업자등록번호·성명(대표자)·주민번호(대표자)·개업연월일·업종 (5)
- 다. 대표이사 재직기간·특수관계인포함 지분율 (2)
- 라. 가업종사기간·임원/대표이사 취임일 (2)

→ **제안**: Phase 3에서 가업현황 입력 섹션을 선택적으로 신설(`FamilyBusinessEligibilitySection` 확장 또는 신규 카드 + `FamilyBusinessInheritanceInput` 확장 + Zod·FormState). "자동"이 아닌 "수집"이므로 본 계획 필수 범위에서 제외하고 후속 옵션으로 분리.

---

## 4. 케이스 인벤토리 — 라. 가업상속인 식별 (Group A 핵심 분기)

가업상속인 = 가업 자산(`familyBusinessCategory != null` `EstateItem`)을 실제 상속받는 상속인. `HeirAllocation`은 `{ heirId, amount, areaM2? }`(인터페이스 정의 L637) — `heirId`로 `heirs` 매칭 가능.

| # | 조건 | 가업상속인 도출 | 비고 |
|---|---|---|---|
| C-1 | 가업자산 `heirAllocations` 1명 | 그 `heirId` → `heirs` 매칭 → name·residentNumber | 정확 |
| C-2 | 가업자산 `heirAllocations` 복수 | **확인 필요**: 최대 지분 1명 vs 전원(복수 행) | 설계 결정 |
| C-3 | `heirAllocations` 미입력(법정 자동배분) | fallback `sortHeirs(heirs)[0]` | 별지5호와 동일 |
| C-4 | 복수 가업자산 간 수령자 상이 | **확인 필요**: 자산별 다른 상속인 — 라 단일 표기 한계 | 설계 결정 |

> 별지5호 신고인은 단순 `sortHeirs(heirs)[0]`. 가업상속인은 **가업자산 수령자가 더 정확**(C-1 우선, 미입력 시 C-3 fallback). 이 차이를 설계 문서에 명시.

---

## 5. 동기화 지점 (Definition of Done)

엔진(계산) 무변경 — 식별정보는 `form.heirs`·Step1 입력에서 결과뷰로 직접 전달(엔진 우회). `DeductionBesshiFormsSection`은 이미 `decedentName`·`decedentResidentNumber`·`heirs`를 props로 보유(별지5호용) → **별지1호 호출로 전달만 추가**(신규 prop 0).

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| 1 | 타입 | `Besshi1Data` 인터페이스 | **`heirResidentNumber?` 필드 신설**(라 섹션). 다 주민번호 필드는 기존 `decedentResidentId` 재사용 |
| 2 | 빌더 시그니처 | `buildBesshi1Data` | `heirs?`·`decedentName?`·`decedentResidentNumber?` 인자 추가 |
| 3 | 빌더 도출 | 동상 return | 다(피상속인)·라(가업상속인 §4)·(Group B 시) 가 상호·마 수량/단가 매핑. `assetRows.map`에 `quantity`/`unitPrice` 추가 |
| 4 | 호출처 | `DeductionBesshiFormsSection` | `buildBesshi1Data(result, estateItems, familyBusinessInput, heirs, decedentName, decedentResidentNumber)` |
| 5 | 화면 셀 바인딩 | `Besshi1FormTable.tsx` | 다 성명/주민번호(L72·73)·라 성명/주민번호(L93·94) `&nbsp;`→`data.*`. (Group B 시) 가 상호(L34)·마 수량/단가(L119·120) |
| 6 | testid 신설 | `Besshi1FormTable.tsx` | 바인딩 칸에 testid 추가 — 현재 다·라 빈 칸 testid 부재(가-상호만 보유). anchor·E2E용 `b1-다-성명`·`b1-다-주민번호`·`b1-라-성명`·`b1-라-주민번호` |
| 7 | PDF 렌더 | `InheritanceDeductionBesshiPdf.tsx` `Besshi1Page` | 현재 나/다영위기간/마/바만 렌더(L84~101) → 다·라 인적사항 행 추가(화면과 단일 출처 `b1`) |
| 8 | (Group C 시) 입력·Zod·FormState | `FamilyBusinessEligibilitySection`·`shared.ts`·`property-valuation-input.ts` | Phase 3 한정 |

- 엔진 input/result·API Zod 무변경(Group A·B — 식별정보·자산 표시만). Group C만 Zod·FormState 확장.

---

## 6. 단계별 실행 계획

### Phase 1 (필수 — Group A) : 다·라 인적사항 자동채움
- `Besshi1Data.heirResidentNumber` 필드 신설.
- `buildBesshi1Data`에 `heirs`·`decedentName`·`decedentResidentNumber` 인자 + 도출(가업상속인 식별 헬퍼 C-1→C-3, `sortHeirs` 재사용).
- FormTable 다·라 4칸 `&nbsp;`→`data.*` 바인딩 + testid 신설. PDF 다·라 행 추가.
- 호출처 인자 전달.
- anchor: heirAllocations 1명 → heirName/heirResidentNumber 일치 / 미입력 → sortHeirs fallback / decedent pass-through.

### Phase 2 (권장 — Group B) : 가 상호·마 수량/단가 도출
- 가업자산 1건 선정 규칙 확정 후 `businessName` 매핑 + FormTable L34 바인딩.
- `assetRows.map`에 `quantity`(string: 주식 "N주"/부동산 "N㎡")·`unitPrice`(가액÷수량 역산, `Math.floor`) 추가 + FormTable L119·120 바인딩.
  - 수량 소스: `listedStockShares` ?? `unlistedStockValuationV2.ownedShares` ?? `quantityCount` ?? `area`.
- anchor: 법인 주식(ownedShares·1주당) / 부동산(면적·㎡단가) / 수량=0 가드(단가 미산정).

### Phase 3 (옵션 — Group C) : 가업현황 입력 신설 (자동 불가 칸)
- 별도 합의 후 진행. 본 계획 필수 범위 외(자동 아님).

---

## 7. 검증 계획

- **anchor** (`__tests__/calc/deduction-besshi-data.test.ts`):
  - B1-가업상속인: heirAllocations 1명 → `heirName`/`heirResidentNumber` 일치
  - B1-fallback: heirAllocations 미입력 → `sortHeirs[0]`
  - B1-피상속인: `decedentName`/`decedentResidentId` pass-through
  - (Phase 2) B1-수량/단가/상호: 주식·부동산 자산별
- **E2E** (`e2e/inheritance-decedent-info.spec.ts` 확장 또는 신규): 가업 시나리오(corporate_stock 자산 + familyBusiness 입력) → 별지1호 다·라 칸 표시. **testid 신설 선행 필수**(§5 #6).
- 회귀: `npx vitest run __tests__/calc __tests__/tax-engine/inheritance*` 0 회귀. 기존 Besshi1 anchor(E-11 등) 영향 확인.

---

## 8. 미해결·확인 필요 (Do 진입 전 해소)

1. ✅ 해소: `Besshi1Data` 라 섹션 `heirResidentNumber` 부재 → 신설 1건 필요(§5 #1).
2. ✅ 해소: FormTable 가·다·라 빈 칸은 `data.*` 미바인딩(`&nbsp;` 하드코딩) → 바인딩 작업 필요(§5 #5).
3. ✅ 해소: 다 주민번호 필드명 `decedentResidentId`(≠ 별지5호 `decedentResidentNumber`) — 빌더 param→field 매핑 시 주의.
4. Group B 자산 도출: 복수 가업자산 시 가. 상호 대표 선정(C-4), 단가 역산 절사 정책(`Math.floor(가액/수량)` 권장).
5. ✅ 해소(3회차, 사용자 피드백): 주식 = (수량 `ownedShares`/`listedStockShares`, 단가 1주당 가액). **마. 수량/단가는 주식·부동산 모두 도출 가능**(2회차 "부동산 한정" 오류 정정). 단가는 가액÷수량 역산으로 통일.
6. 비상장 V2 1주당 평가액(`perShareValueNonMaxShareholder`/`premiumPerShare`)을 `result.valuationResults`에 echo하는지 — 미echo 시 가액÷수량 역산 사용(권장).
7. 가업상속인 복수 수령(C-2): 라 단일 행 vs 복수 행 표기.
8. 가. 상호 ↔ 마. 비고 동일값(자산 name) 중복 표시 허용 여부. `note: e.name.trim() || undefined`(L372)라 name 미입력 시 상호·비고 모두 공란.

---

## 9. 범위 밖 (명시)

- 엔진 계산 로직(가업상속공제 산식·한도·자격 판정) 변경 없음 — 표시·자동채움 한정.
- Group C(가업현황 사업자번호·대표자·개업일·업종 등)는 자동 불가 → 본 계획 필수 범위 제외, Phase 3 옵션.

---

## 부록 A. 검토 이력 (self-review loop)

### 1회차 검토 정정 (2026-06-02)
- **[오류] 칸 수**: "30칸/16칸 채움/4/2/8" → 실측 "26칸/10 채움/4 A/3 B/9 C"로 정정.
- **[오류] 렌더 바인딩**: §2가 가·다·라 빈 칸을 `data.*` 바인딩으로 오기 → 실제 `&nbsp;` 하드코딩(L34·72·73·93·94·119·120) 확인, "셀 바인딩"列 신설.
- **[모순] Group B 칸 수**: §2 요약 "2칸" ↔ §3 "3 items" → 3칸으로 통일.
- **[누락] FormTable 작업**: "인자 전달만"으로 끝나지 않고 (a)빌더+(b)셀 바인딩+(c)필드 신설 2~3중 작업 필요 — §1 경고·§5 #1·#5·#6 추가.
- **[누락] 필드명 비대칭**: 다 주민번호 = `decedentResidentId`(별지5호는 `decedentResidentNumber`) 명시.
- **[누락] PDF**: `Besshi1Page`는 다·라 미렌더(L84~101) → §5 #7 추가.
- **[누락] 수량 타입**: `Besshi1AssetRow.quantity`는 string → 포맷 필요 명시.
- **[누락] testid**: 다·라 빈 칸 testid 부재 → §5 #6 신설.

### 2회차 검토 정정 (2026-06-02)
- **[오류] 인용 라인**: §4 `HeirAllocation`을 "L1071 인근"으로 오기(L1071은 EstateItem.heirAllocations 필드 위치) → 인터페이스 정의 **L637**로 정정.
- **[오류/누락] 마. 수량 소스**: `listedStockShares`(L93)는 **상장 전용** — 이미지의 주 케이스 `법인 주식`(corporate_stock, 비상장)은 주식수 필드 부재로 **수량/단가 자동 불가**. Group B를 "자산 종류 조건부(부동산 한정)"로 강등·명시(§3·§2·§8).
- **[개선] 상호/비고 공란 edge**: `note = e.name.trim() || undefined` — name 미입력 시 상호·비고 동시 공란(§8 #7).
- **검토 결과**: 핵심 구조(Group A 4칸 즉시 자동채움 + 셀 바인딩·필드 신설 2~3중 작업)는 유효.

### 3회차 정정 (2026-06-02, 사용자 피드백 "주식 수량과 1주당 가액이 단가")
- **[오류 정정] 2회차 결론 번복**: "법인 주식 주식수 필드 부재 → 수량/단가 자동 불가"는 **틀림**. 비상장 V2 `UnlistedStockValuationInput.ownedShares`(소유 주식수, types L144) = 수량, `perShareValueNonMaxShareholder`/`premiumPerShare`(1주당 평가액, L279·280) = 단가. 상장은 `listedStockShares`.
- **[반영]** 마. 수량/단가를 **주식·부동산 모두 도출 가능**으로 복원(§2·§3·Phase 2). 단가는 **가액÷수량 역산**으로 통일(자기일관·단일 소스). Group B 3칸 = 법인 주식 사례에서도 전부 자동채움 가능.
- **[교훈]** 2회차에서 `listedStockShares`(상장)만 grep하고 비상장 V2 `ownedShares`를 누락 → 도메인 사실 미검증으로 잘못된 강등. 자산-종류별 평가 타입(V2)까지 확인했어야 함.
