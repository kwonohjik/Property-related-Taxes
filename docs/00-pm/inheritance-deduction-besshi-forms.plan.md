# 상속세 3개 공식 서식 100% 재현 계획서 — 부표3 · 별지1호 · 별지5호

> 2026-06-02 · feature: `inheritance-deduction-besshi-forms` · branch: `feat/inheritance-3-deduction-forms` (worktree 격리)
> 선행 선례: 별지 제9호서식(앞쪽) `filing-form-9` 완료(`7953490`·`0187183`) / 별지 제9호서식 부표2 `besshi-buppyo-2` 진행(master)
> 소관: `inheritance-gift-tax-senior`(엔진·데이터 §2·§3) · `inheritance-gift-tax-ui-senior`(UI·PDF §4)
> 근거 검증: **KoreanLaw MCP `get_annexes`(상속세 및 증여세법 시행규칙, 2026-06-02 조회)** — 본 계획서 모든 양식 칸은 이 본문 1:1 전사

---

## 0. 사전 결정 사항 (사용자 인터뷰 2026-06-02)

| # | 결정 항목 | 결정 |
|---|---|---|
| D-1 | **데이터 채움 깊이** | **양식재현 + 가용 자동 (별지9호 선례 동일)**. 양식 칸·표·라벨·코드표 100% 시각 재현 + 엔진 보유 데이터 자동 채움 + 식별정보(주민번호·주소·계좌·사업자번호·가업상세) 공란 + "인쇄 후 수기 작성" 안내. **엔진·입력·API·validate 변경 0** |
| D-2 | **작업 범위** | **3개 동시 재현** — 부표3 · 별지5호 · 별지1호 한 PR. 가업(별지1호)도 양식 100% 재현하되 자동 채움분(~35%)만, 나머지 공란 |
| D-3 | **산출물** | **화면 토글 + PDF 다운로드** 둘 다 (별지9호·부표2 패턴 동일) |
| D-4 | 양식 정체 | 3종 = (A) 별지 제9호서식 부표 3 「채무·공과금·장례비용 및 상속공제명세서」 / (B) 별지 제1호서식 「가업상속공제신고서」 / (C) 별지 제5호서식 「금융재산 상속공제 신고서」 |
| D-5 | 데이터 도달 | 부표3·별지5호 소스(`debtItems`·`estateItems`·`deductionDetail`)는 `InheritanceTaxResultView` props에 **이미 존재**(실측 §1-4). 별지1호 가업현황 상세만 `familyBusinessInput` prop 1개 추가(엔진 변경 0) |

**정책 준수 사전 점검** (memory · 스킬):
- `besshi-form-replica` — KoreanLaw 본문·코드표 검증(완료 §1), 칸 번호 testid 동결, 빈 행 정책, Tailwind 직접, print 자동 펼침, **구판→최신본 라벨 환류**(별지1호 §1-2)
- `feedback_no_silent_apportion_fallback` — 협의분할 미입력 채무·자산의 행 자동 안분 **금지**(§3). 미입력 칸은 공란, 자동 보정 0
- `feedback_no_internal_id_in_result` — 자산/채무명 미입력 시 카테고리 한글 라벨 fallback, 내부 id 노출 금지(§4-1)
- `feedback_korean_law_citation_verify` / `enum-verification-before-mapping` — 코드표(공과금 6종·재산종류)·enum 매핑은 KoreanLaw 검증 표 **단일 출처**, `Record<EnumType,…>` 타입으로 누락 catch(§3, C-codes)
- `amount-column-align` — 금액 칸 `font-mono tabular-nums text-right`(공용 `BesshiColumn`)
- `print-only-css-toggle` — `className={open ? "block" : "hidden print:block"}` + 토글 `print:hidden`, 다크모드 강제 흰 배경
- `single-source-engine-helper` — `financialDeductionDetail`·`familyBusinessDetail` 엔진 detail 직접 소비, 재계산 0

---

## 1. KoreanLaw MCP 검증 결과 (단일 출처 — `besshi-form-replica` Phase 0)

### 1-1. 개정일 환류 (★ 구판 1종 적발)

| 서식 | 사용자 첨부 라벨 | **현행 (KoreanLaw 2026-06-02)** | 판정 |
|---|---|---|---|
| 별지 제9호서식 부표 3 | 2020.3.13 | **2020. 3. 13.** | ✅ 현행 일치 → 첨부 라벨 사용 |
| **별지 제1호서식** 가업상속공제신고서 | 2022.3.18 | **2023. 3. 20. 개정** | ⚠️ **구판 — 헤더 라벨 `〈개정 2023. 3. 20.〉`로 환류** |
| 별지 제5호서식 금융재산 상속공제 신고서 | 2020.3.13 | 앞쪽 미반환(HWP 추출 한계) | 🔍 **확인 필요** — 개정일 Do 단계 재검증(잠정 2020.3.13). 뒤쪽 작성방법은 검증 완료 |

> 별지5호 앞쪽 표는 `get_annexes`가 반복 조회에도 뒤쪽 작성방법만 반환(HWP 구조). 앞쪽 컬럼·번호는 사용자 이미지3 + 검증된 작성방법(③④⑤ 산식·한도표·계산사례)으로 확정. **개정일만 Do 단계 1차 재확인.**

### 1-2. 서식 A — 별지 제9호서식 부표 3 (개정 2020. 3. 13.) [본문 전사]

제목: **「채무·공과금·장례비용 및 상속공제명세서」** · 관리번호 · 용지 `210mm×297mm[백상지 80g/㎡]`

**가. 채무** (데이터행 4 + 계):
`① 채무종류 | ② 차입기간[발생연월일 | 종료(예정)연월일] | 채권자[③ 성명(상호) | 주민등록번호(사업자등록번호) | 주소(소재지)] | 금액` → `계`

**나. 공과금** (데이터행 4 + 계):
`공과금종류코드 | 연도별 | 분기별 | 금액` → `계`

**다. 장례비용** (데이터행 5 + 계):
`지급처[주민등록번호(사업자등록번호) | 성명(상호)] | 지급내역 | 금액` → `계`

**라. 상속공제** (KoreanLaw 본문 행 순서 — 사용자 이미지 번호 ⑱~㉛ 동결):
- 「기초공제 및 그 밖의 인적공제」 rowSpan=5: ⑱기초공제 · ⑲자녀공제 · ⑳미성년자공제 · ㉑연로자공제 · ㉒장애인공제
- ㉓일괄공제
- 「추가상속공제」 rowSpan=2: ㉔가업상속공제 · ㉕영농상속공제
- ㉖배우자상속공제 · ㉗금융재산상속공제 · ㉘재해손실공제 · ㉙동거주택상속공제 · ㉚공제적용한도액 · ㉛상속공제금액합계

**신청(신고)인 제출서류**: `1. 채무부담 및 공과금·장례비·감정평가수수료 지급 입증서류`

**작성방법** (검증):
1. 채무와 공과금은 상속개시 당시의 현황에 따라 적습니다.
2. ① 채무종류: 금융채무, 개인사채, 상가 임대보증금 등.
3. ⑧ 공과금종류코드 표 — `국세 01 / 지방세 02 / 공공요금 03 / 과태료·범칙금 04 / 회비 05 / 기타 06`
4. ㉖ 배우자상속공제: 배우자상속공제명세서(**별지 제9호서식 부표 3의2**)의 배우자 상속공제 금액을 옮겨 적음. (부표3의2는 본 범위 외 — `spouseDeduction` 값만 인용)

### 1-3. 서식 B — 별지 제1호서식 (개정 2023. 3. 20.) [본문 전사 · 칸 번호 없음]

제목: **「가업상속공제신고서」** · 용지 `210mm×297mm[백상지 80g/㎡]`

- **가. 가업현황**: `상호(법인명) | 사업자등록번호` / `성명(대표자) | 주민등록번호` / `개업연월일 | 업종` / `기준총급여액 | 기준고용인원`
- **나. 중소기업 또는 중견기업 여부**(해당란 √): `중소기업 여부 [ ]해당 [ ]해당안됨 | 상장여부(상장일) [ ]상장( . . ) [ ]비상장` / `중견기업 여부 [ ]해당 [ ]해당안됨 | 직전 3개 사업연도 평균 매출액`
- **다. 피상속인**: `성명 | 주민등록번호` / `가업영위기간 | 대표이사(대표자) 재직기간` / `최대주주등 여부 | 특수관계인포함 보유주식 등 지분율`
- **라. 가업상속인**: `성명 | 주민등록번호` / `가업종사기간 | 임원/대표이사 취임일` / `주소 (☎ )`
- **마. 가업상속 재산가액**(데이터행 2 + 계): `종류 | 수량(면적) | 단가 | 가액 | 비고`
- **바. 가업상속공제 신고액**: `___ 원`
- 근거 문구: 「상속세 및 증여세법」 제18조의2제3항 및 같은 법 시행령 제15조제22항에 따라 가업상속공제신고서를 제출합니다. + 신고인/세무서장 귀하
- 제출서류 3종(중소기업 등 기준검토표·주주현황·종사 입증서류) · 수수료 없음
- 작성방법 6항: 업종(시행령 별표)·기준총급여액(직전 2개 과세기간 평균)·기준고용인원·중소(조특령 §2①1·3, 자산 5천억 미만)·중견(조특령 §9④1·3, 매출 5천억 미만)·마·바는 **부표1(가업상속재산명세서)·부표2(가업용 자산 명세) 작성 후 옮겨 적기**

> ★ 자식 서식(별지 제1호서식 부표1·부표2)은 본 범위 외 — 마.·바. 값은 `familyBusinessDetail`·`estateItems`에서 인용.

### 1-4. 서식 C — 별지 제5호서식 (잠정 2020. 3. 13.) [앞쪽=이미지3 · 뒤쪽=KoreanLaw 검증]

제목: **「금융재산 상속공제 신고서」** (앞쪽) · 용지 `210mm×297mm[백상지 80g/㎡]`

- **1. 피상속인 및 신고인(상속인) 인적사항**: `피상속인 성명 | 주민등록번호` / `상속인 성명 | 주민등록번호`
- **2. 금융재산 및 금융채무 명세**
  - **가-1. 금융재산** (데이터행 ~9 + ① 합계): `종류 | 계좌번호 등 | 상호 | 사업자등록번호 | 단가 | 가액`
  - **가-2. 금융채무** (데이터행 ~9 + ② 합계): `종류 | 계좌번호 등 | 상호 | 사업자등록번호 | 단가 | 가액`
- **3. 금융재산 상속공제금액**: `③ 순금융재산가액 (① − ②) | ④ 금융재산 상속공제 한도액(뒷면 표 참조) | ⑤ 금융재산 상속공제금액 (③과 ④ 중 적은 금액)`
- 근거 문구: 「상속세 및 증여세법」 제22조 및 같은 법 시행령 제19조제3항에 따라 금융재산 상속공제 신고서를 제출합니다.

**작성방법** (검증):
1. 가-1 금융재산 정의: 금융회사등 취급 예금·적금·부금·신탁·보험금·공제금·주식·채권·수익증권·출자지분·어음 + 비상장 주식·출자지분 중 금융기관 미취급분 + 직접 모집·매출 회사채. **최대주주 보유 주식·신고기한 내 미신고 타인명의 금융재산 제외**.
2. 가-2 금융채무: 금융기관 등에 대한 입증된 채무.
3. ③ 순금융재산가액 = ① − ②.
4. ④ **금융재산 상속공제 한도액 표**: `2,000만원 이하 → 전액 / 2,000만원 초과~1억 → 2천만원 / 1억 초과~10억 → ×20% / 10억 초과 → 2억`
5. ⑤ = min(③, ④).
- **계산사례** (검증 anchor — §6 BF-5·BF-6):
  | 구분 | 금융재산① | 금융채무② | 순금융재산③ | 공제금액⑤ |
  |---|--:|--:|--:|--:|
  | 가 | 40,000,000 | 25,000,000 | 15,000,000 | 15,000,000 |
  | 나 | 80,000,000 | 25,000,000 | 55,000,000 | 20,000,000 |
  | 다 | 140,000,000 | 20,000,000 | 120,000,000 | 24,000,000 |
  | 라 | 1,200,000,000 | 100,000,000 | 1,100,000,000 | 200,000,000 |

### 1-5. 실측 — 데이터 소스 도달 경로 (props·타입 직접 확인)

| 소스 | 위치 (실측) | 도달 |
|---|---|---|
| `debtItems: DebtItem[]` | `InheritanceTaxResultView.tsx:135` props · 호출처 `InheritanceTaxForm.tsx:420` `debtItems={form.debtItems}` | ✅ 이미 전달 |
| `estateItems: EstateItem[]` | `InheritanceTaxResultView.tsx:137` · `InheritanceTaxForm.tsx:421` `[...estateItems,...stockItems]` | ✅ 이미 전달 |
| `result.deductionDetail` | `InheritanceTaxResult.deductionDetail` (`inheritance-gift.types.ts:1010`) | ✅ |
| `financialDeductionDetail` | `deductionDetail.financialDeductionDetail?` (`:866`) — `rows[]·netFinancial·cap·cappedDeduction` | ✅ (orchestrator patch) |
| `familyBusinessDetail` | `deductionDetail.familyBusinessDetail?` (`:851`) — `operatingYears·appliedCap·deduction·eligible` | ✅ |
| `deductionLimitDetail` | `deductionDetail.deductionLimitDetail?` (`:870`) — `ceiling·disasterLossDeduction` | ⚠️ optional(§24 발동 시) |
| `familyBusinessInput` (가업현황 상세) | **prop 미존재** → `InheritanceTaxResultView`에 `familyBusinessInput?: FamilyBusinessInheritanceInput` 1개 추가 + `InheritanceTaxForm`에서 `form.deductionInput?.familyBusiness` 전달 | 🔧 prop 1개 추가(엔진 0) |
| `deathDate` | `:141` · `InheritanceTaxForm.tsx:423` | ✅ |

---

## 2. 데이터 매핑 — 서식 A (부표 3) [추정 0 · 실측 확정]

> `DebtCategory = "financial" | "tax" | "personal" | "funeral"` (`inheritance-gift.types.ts:687`). `DebtItem{id,category,name,amount,isBongan?,heirAllocations?,creditorAddress?,incurredDate?}`.
> legacy fallback: `debtItems` 미입력 시 `funeralExpense`·`debts`·`funeralIncludesBongan` (deprecated `:938-944`) — 어댑터에서 `debtItems` 우선, 빈 배열이면 legacy 단일 행.

### 2-1. 가·나·다 (debtItems 분류)

| 칸 | 소스 | 분류 |
|---|---|---|
| 가 ① 채무종류 | `debtItems(category∈{financial,personal})` → `name.trim() \|\| DEBT_CATEGORY_LABEL[category]` (**name 우선** — 작성방법상 종류는 자유텍스트 "금융채무·개인사채·상가 임대보증금 등", 이미지1 "은행채무". 내부 id 금지) | 직접 |
| 가 ② 발생연월일 | `DebtItem.incurredDate` | 직접(optional) |
| 가 ② 종료(예정)연월일 | 미수집 | **공란** |
| 가 ③ 성명(상호) | 미수집 | **공란** |
| 가 ④ 주민/사업자번호 | 미수집 | **공란** |
| 가 ⑤ 주소(소재지) | `DebtItem.creditorAddress` | 직접(optional) |
| 가 ⑥ 금액 | `DebtItem.amount` | 직접 |
| 가 ⑦ 계 | `Σ amount` | 도출 |
| 나 ⑧ 공과금종류코드 | 미수집(코드표 01~06) | **공란** |
| 나 ⑨ 연도별 / ⑩ 분기별 | 미수집 | **공란** |
| 나 ⑪ 금액 | `debtItems(category="tax").amount` | 직접 |
| 나 ⑫ 계 | `Σ` | 도출 |
| 다 ⑬ 주민/사업자번호 / ⑭ 성명(상호) | 미수집 | **공란** |
| 다 ⑮ 지급내역 | `debtItems(category="funeral").name` (+ `isBongan` true → "(봉안시설)" 병기) | 직접 |
| 다 ⑯ 금액 | `amount` | 직접 |
| 다 ⑰ 계 | `Σ` | 도출 |

### 2-2. 라. 상속공제 ⑱~㉛ (`result.deductionDetail`)

| 칸 | 소스 | 분류 |
|---|---|---|
| ⑱ 기초공제 | `basicDeduction` | 직접 |
| ⑲ 자녀공제 | (개별 미노출) | **공란** R-1 |
| ⑳ 미성년자공제 | (개별 미노출) | **공란** R-1 |
| ㉑ 연로자공제 | (개별 미노출) | **공란** R-1 |
| ㉒ 장애인공제 | (개별 미노출) | **공란** R-1 |
| ㉓ 일괄공제 | `lumpSumDeduction` | 직접 |
| ㉔ 가업상속공제 | `familyBusinessDeduction` | 직접 |
| ㉕ 영농상속공제 | `farmingDeduction` | 직접 |
| ㉖ 배우자상속공제 | `spouseDeduction` | 직접 |
| ㉗ 금융재산상속공제 | `financialDeduction` | 직접 |
| ㉘ 재해손실공제 | `deductionLimitDetail?.disasterLossDeduction ?? 0` (§24 한도보정 입력값 echo `inheritance-tax.ts:483`·㉛합계 미반영 가능) | echo(R-2) |
| ㉙ 동거주택상속공제 | `cohabitationDeduction` | 직접 |
| ㉚ 공제적용한도액 | `deductionLimitDetail?.ceiling` | 도출(optional) R-2 |
| ㉛ 상속공제금액합계 | `totalDeduction` | 직접 |

### 2-3. 확인 필요 → Pre-Do anchor 검증

| R | 항목 | 결정 (anchor로 확정) |
|---|---|---|
| R-1 | ⑱기초 vs ㉓일괄 표시 분기 | `lumpSumComparisonDetail.selectedMethod`로 분기. `lump_sum` → ⑱·⑲~㉒ dash, ㉓=`lumpSumDeduction`. `itemized` → ⑱=`basicDeduction`, ⑲~㉒ dash(개별 미노출), ㉓ dash. **AN-A1로 `basicDeduction`이 일괄 채택 시 0인지 2억인지 실측 후 확정** — 추정 금지 |
| R-2 | ㉘재해손실·㉚한도액 노출 | `deductionLimitDetail` optional. undefined(단순 케이스) → ㉘=0·㉚ dash. ㉘는 §24 한도보정 입력값 echo(`inheritance-tax.ts:483`)로 ㉛합계 미반영 가능(엔진에 §23 공제 항목 부재). AN-A2로 단순/한도초과 분기 검증 |
| R-3 | 채무 carve-out | `debtItems` 중 `category="funeral"`→다, `"tax"`→나, `{financial,personal}`→가. 분류 누락 0 (4 enum 전수). isBongan은 다 ⑮ 병기만(금액 영향 0 — 한도는 엔진 §14에서 이미 반영) |

---

## 3. 데이터 매핑 — 서식 C (별지5호) · 서식 B (별지1호)

### 3-1. 별지5호 금융재산공제 (`financialDeductionDetail` 단일 출처)

> `FinancialDeductionDetail{rows[],netFinancial,bracket,rate,rawDeduction,cap,cappedDeduction}`. `rows: FinancialBreakdownRow{label,amount}` — orchestrator가 estateItems(financial/listed_stock·deemed insurance) + debtItems(financial) 집계.

| 칸 | 소스 | 분류 |
|---|---|---|
| 1. 피상속인·상속인 성명/주민번호 | 미수집 | **공란** |
| 가-1 행: 종류 | `rows[].label` (label ≠ 채무 라벨) | 직접 |
| 가-1 행: 계좌·상호·사업자번호·단가 | 미수집 | **공란** |
| 가-1 행: 가액 | `rows[].amount` | 직접 |
| ① 합계 | `Σ 자산 rows` | 도출 |
| 가-2 행: 종류·가액 | `financialDeductionDetail.rows.filter(label==="금융채무")` → 1행 합산(`inheritance-tax.ts:457` 실측). 자기일관 보장 | 직접 |
| ② 합계 | `Σ 채무 rows` (= `① − netFinancial` 자기일관) | 도출 |
| ③ 순금융재산가액 (①−②) | `netFinancial` | 직접 |
| ④ 한도액 | `cappedDeduction` | 직접 |
| ⑤ 공제금액 (min ③④) | `financialDeduction` (= `deductionDetail.financialDeduction`) | 직접 |

- **렌더 가드**: `financialDeductionDetail` 존재 AND (`netFinancial > 0` OR `financialDeduction > 0`). 미존재/0 → 서식 숨김.
- **중복 정상**: financial 채무는 부표3 가.채무 + 별지5호 가-2 양쪽 표시 — 부표3=전체 채무명세 / 별지5호=금융재산공제 계산, 목적 상이(중복 아님).
- **R-C1 (확정 — `inheritance-tax.ts:453-457` 실측)**: `financialDeductionDetail.rows` label = 자산 `{예금·상장주식·보험금·기타금융}` + 채무 `{금융채무}`(1행 합산). 가-1 = 자산 4종 rows, 가-2 = 채무 rows 1행. `isDebtLabel(label) = label === "금융채무"`. AN-C1은 자기일관(①−②=③) 회귀 방지로 유지.

### 3-2. 별지1호 가업상속공제신고서 (`familyBusinessDetail` + `estateItems` + `familyBusinessInput?`)

> `FamilyBusinessDeductionDetail{eligible,appliedCap,operatingYears,finalValue,deduction,...}`. `FamilyBusinessInheritanceInput{businessType,operatingYears,enterpriseSize,averageRevenue3Y?,isListedOnExchange?,decedentMajorShareholdingMet?,isEligibleIndustry,...}`. `FamilyBusinessCategory` 6종.

| 칸 | 소스 | 분류 |
|---|---|---|
| 가 상호·대표자·개업일·업종·기준급여·고용인원·사업자번호·주민번호 | 미수집 | **공란** |
| 나 중소기업 여부 | `familyBusinessInput?.enterpriseSize === "sme"` → [√]해당 | 도출(prop) |
| 나 중견기업 여부 | `enterpriseSize === "medium"` → [√]해당 | 도출(prop) |
| 나 상장여부 | `isListedOnExchange` → [√]상장/[√]비상장 | 도출(prop) |
| 나 직전 3개 사업연도 평균 매출액 | `averageRevenue3Y` | 도출(prop) |
| 다 가업영위기간 | `familyBusinessDetail.operatingYears` (년) | 직접 |
| 다 최대주주등 여부 | `familyBusinessInput?.decedentMajorShareholdingMet` → "여"/"부" | 도출(prop) |
| 다 성명·주민번호·재직기간·지분율 | 미수집 | **공란** |
| 라 성명 | (가업상속인) 미수집 | **공란** R-B1 |
| 라 임원/대표이사 취임일 | 미수집(`heirOfficerByFilingDeadline` 체크만) | **공란** |
| 라 가업종사기간·주소 | 미수집 | **공란** |
| 마 가업상속재산: 종류 | `estateItems(familyBusinessCategory != null)` → `FAMILY_BUSINESS_CATEGORY_LABEL` | 직접 |
| 마 수량·단가 | 미수집 | **공란** |
| 마 가액 | `valuationResults.find(estateItemId===e.id).valuatedAmount` (최종 평가액 `inheritance-gift.types.ts:338` — `marketValue`는 입력값이라 부정확) | 직접 |
| 바 가업상속공제 신고액 | `familyBusinessDetail.deduction` | 직접 |

- **렌더 가드**: `familyBusinessDetail?.deduction > 0` (가업상속공제 적용 시만 표시). 미적용 → 서식 숨김.
- **R-B1**: 가업상속인 식별 — `heirs` 중 누가 가업상속인인지 엔진 미보유 → 라.성명 공란(D-1 정책). 후속 확장 시 Heir 플래그.
- **R-B2**: `familyBusinessInput` prop 미전달(form 경로 부재) 시 나·다 일부도 공란. **AN-B1로 `form.deductionInput.familyBusiness` 경로 존재 실측** 후 prop 결선 확정.

---

## 4. UI·PDF 구조 (요약 — 상세 `*.ui.design.md`)

### 4-1. 컴포넌트 트리 (`besshi-form-replica` Phase 3·4 + 별지9호 선례)

**디렉터리**: `components/calc/inheritance/deduction-besshi/`

| 파일 | 역할 | 예상 줄수 | 주요 testid |
|---|---|---|---|
| `DeductionBesshiFormsSection.tsx` | 오케스트레이터. 3개 서식 각각 open 토글 + dynamic ssr:false PDF 버튼. `buildBuppyo3Data`·`buildBesshi5Data`·`buildBesshi1Data` 호출 | ~150 | `besshi-forms-root` |
| `Buppyo3FormTable.tsx` | 부표3 (가·나·다·라 4블록) | ~220 | `bp3-가①~⑦ · bp3-나⑧~⑫ · bp3-다⑬~⑰ · bp3-라⑱~㉛` |
| `Besshi5FormTable.tsx` | 별지5호 (1·2·3 블록) | ~180 | `b5-인적 · b5-가1-row-{i} · b5-가2-row-{i} · b5-③④⑤` |
| `Besshi1FormTable.tsx` | 별지1호 (가~바 6블록) | ~200 | `b1-가-* · b1-나-* · b1-다-* · b1-라-* · b1-마-row-{i} · b1-바` |
| `deduction-besshi-constants.ts` | 칸 라벨·코드표(공과금6·재산종류·가업카테고리)·제목·작성방법·footer (화면·PDF 공유) | ~180 | — |
| `DeductionBesshiPdfButtons.tsx` | dynamic ssr:false PDF 3종 | ~50 | `bp3-pdf-btn · b5-pdf-btn · b1-pdf-btn` |
| `index.ts` | barrel | ~10 | — |

데이터 어댑터: `lib/calc/deduction-besshi-data.ts` (신규) — `buildBuppyo3Data`·`buildBesshi5Data`·`buildBesshi1Data`. 자체 산식 0, 집계·분류·도출만. `result`·`heirs`·`debtItems`·`estateItems`·`familyBusinessInput?` 소비.

PDF: `lib/pdf/InheritanceDeductionBesshiPdf.tsx` (3 `<Document>` 또는 분리 3파일) + `besshi-pdf-styles.ts` `fontFamily` 배열 글리프 fallback 재사용. 800줄 초과 시 서식별 분리.

### 4-2. 14개 동기화 지점 (D-1 엔진 변경 0 → ⑤·⑦ + prop 1개)

| 지점 | 해당 | 비고 |
|---|---|---|
| ⑤ UI 위젯 | **해당** | 신규 출력 컴포넌트 7개 |
| ⑦ 결과 카드 | **해당** | `DeductionBesshiFormsSection` 결과뷰 마운트 |
| (prop) `familyBusinessInput` | **해당** | `InheritanceTaxResultView` props + `InheritanceTaxForm` 전달 (엔진/Zod/API/validate 무변경) |
| ①②③④⑥⑧⑨⑩⑪⑫⑬⑭ | N/A | FormData·API·Zod·validate·사이드바 무변경 |

### 4-3. 마운트 지점

`InheritanceTaxResultView.tsx:335` `FilingForm9CoverSection` 직후:
```tsx
<DeductionBesshiFormsSection
  result={result} heirs={heirs}
  debtItems={debtItems} estateItems={estateItems}
  familyBusinessInput={familyBusinessInput}  // 신규 prop
  deathDate={deathDate}
/>
```
가드: 각 서식 내부에서 자체 렌더 가드(부표3=항상, 별지5호=`financialDeductionDetail`, 별지1호=`familyBusinessDetail.deduction>0`).

### 4-4. 빈 행 정책 (`besshi-form-replica`)

| 서식 | ROWS_FIXED | 비고 |
|---|---|---|
| 부표3 가.채무 | 4 | 데이터 < 4 → 빈 행 padding, > 4 → 양식 늘어남 |
| 부표3 나.공과금 | 4 | 동상 |
| 부표3 다.장례비 | 5 | 동상 |
| 별지5호 가-1·가-2 | 9 | 동상 |
| 별지1호 마.가업재산 | 2 | 동상 |

빈 행 셀 `&nbsp;`로 높이 유지. 부표3 라.상속공제는 고정 14행(공란도 dash 렌더).

---

## 5. 통합 케이스 인벤토리 (Do/Design 진입 게이트 — 행 ≥ 1)

| # | 시나리오 | 서식 | 검증 포인트 |
|---|---|---|---|
| C-1 | 채무 2 + 공과금 1 + 장례비 2 (이미지1 재현) | 부표3 | 가⑦=Σ채무 · 나⑫=공과금 · 다⑰=Σ장례 · isBongan 병기 |
| C-2 | 일괄공제 채택(`lump_sum`) | 부표3 라 | ⑱·⑲~㉒ dash · ㉓=lumpSumDeduction · ㉛=totalDeduction (R-1) |
| C-3 | 항목별 채택(`itemized`) | 부표3 라 | ⑱=basicDeduction · ㉓ dash (R-1) |
| C-4 | 금융재산공제 라 케이스(11억→2억) | 별지5호 | ③=netFinancial=11억 · ④=cappedDeduction=2억 · ⑤=2억 (계산사례 anchor) |
| C-5 | 금융재산공제 다 케이스(1.2억→2,400만) | 별지5호 | ④=×20%=2,400만 · ⑤=min(③,④) |
| C-6 | 금융재산공제 0 (순금융 ≤ 0) | 별지5호 | 서식 **숨김**(렌더 가드) |
| C-7 | 가업상속공제 적용(중소·20년·600억 한도 미달) | 별지1호 | 나 중소[√] · 다 영위기간 · 바 deduction · 마 estateItems(familyBusinessCategory) |
| C-8 | 가업상속공제 미적용(deduction=0) | 별지1호 | 서식 **숨김**(렌더 가드) |
| C-9 | debtItems 미입력(legacy funeralExpense만) | 부표3 | 다.장례비 legacy 단일 행 fallback · 가·나 공란 |

---

## 6. Pre-Do Anchor 계획 (`pre-do-anchor-verification`)

> Do 진입 전 anchor 우선 실행 → 디자인 환류. "현행 일치 예상" 가정 금지. 실패 메시지로 R-1·R-2·R-B2·R-C1 확정.

1. **AN-A1** [R-1]: `buildBuppyo3Data` — 일괄공제 케이스에서 `deductionDetail.basicDeduction` 실측값 확인 → ⑱/㉓ 표시 분기 산식 확정. (basicDeduction이 미채택 시 0인지 2억인지)
2. **AN-A2** [R-2]: 단순 케이스(`deductionLimitDetail` undefined)에서 ㉚ dash, 한도초과 케이스에서 ㉚=ceiling 검증.
3. **AN-A3**: 부표3 가/나/다 carve-out — `debtItems` 4 enum(financial·tax·personal·funeral) 전수 → 가/나/다 정확 분류, 합계 자기일관.
4. **AN-C1** [R-C1]: `financialDeductionDetail.rows` label 집합 실측 → 자산/채무 분리 규칙 확정. ③ = ① − ② 자기일관. 계산사례 4건(가·나·다·라) 산출 일치.
5. **AN-B1** [R-B2]: `form.deductionInput.familyBusiness` 경로 존재 + `familyBusinessDetail.deduction` 렌더 가드 검증.

**anchor 파일**: `__tests__/calc/deduction-besshi-data.test.ts`. `afterEach(cleanup)` 필수(`besshi-form-replica`).

---

## 7. 작업 순서 (Plan 병렬 / Do 시퀀셜)

1. **엔진 시니어 선행**: ① `lib/calc/deduction-besshi-data.ts` 어댑터 3종 + 타입 → ② 코드 매핑(`DEBT_CATEGORY_LABEL`·공과금코드·`FAMILY_BUSINESS_CATEGORY_LABEL`) → ③ AN-A1~AN-B1 anchor 작성·실행 → R-1·R-2·R-B2·R-C1 확정·디자인 환류.
2. **UI 시니어 후행**: 확정된 어댑터 출력 받아 ④ 컴포넌트 7개 + ⑤ 상수 + ⑥ PDF + ⑦ 마운트 + `familyBusinessInput` prop 결선.
3. **Check**: `ui-engine-sync-checker`(⑤⑦) → `bkit:gap-detector`(matchRate) → 브라우저 E2E(`e2e/inheritance-deduction-besshi.spec.ts` — 3서식 렌더·토글·PDF 버튼·빈행).
4. **회귀**: `npx tsc --noEmit` 0 + `npm test` 전체(공유 모듈 영향 없음 — 신규 파일 위주).

---

## 8. 리스크·정책

| 리스크 | 대응 |
|---|---|
| 별지1호 구판 재현 | KoreanLaw 검증 `〈개정 2023. 3. 20.〉` 라벨 강제(§1-1·§1-3) |
| 별지5호 개정일 미확정 | Do 1차 `get_annexes` 재시도 또는 국세청 서식 확인. 잠정 2020.3.13 + "확인 필요" 주석 |
| ⑱/㉓ 일괄·항목별 분기 오류 | AN-A1 실측 후 산식 확정(R-1). 추정 금지 |
| 인적공제 4항목 공란 = 재현도 손실 | D-1 정책 직접 귀결. 후속 echo 확장(`personalDeductionTotal` 분해) 부록 |
| `familyBusinessInput` prop 미결선 | AN-B1 실측. 부재 시 나·다 공란(D-1 허용) |
| 800줄 초과 | 서식별 컴포넌트 분리(최대 ~220줄) + PDF 분리 |
| 금액 칸 콤마 어긋남 | 공용 `BesshiColumn`/`font-mono tabular-nums`(`amount-column-align`) |

---

## 부록: 미해결(향후 확장)

- **개별 인적공제 분해**(⑲자녀·⑳미성년·㉑연로자·㉒장애인): 엔진 `personalDeductionTotal` 합계만 → 개별 echo 필드 추가 시 공란 해소(별도 PR, `echo-field-pattern`).
- **식별정보 입력 경로**(채권자 성명·주민번호·계좌·사업자번호·가업현황 상세): 완전 작성 목적이면 `DebtItem`·`EstateItem`·`Heir`·`FamilyBusinessInheritanceInput` 필드 확장 필요(D-1 범위 외, `tax-field-add` 14지점).
- **자식 서식**: 부표3의2(배우자명세서)·별지1호 부표1/부표2(가업재산명세서·가업용자산명세) — 본 3종이 "옮겨적기" 상위 서식. 자식 서식은 별도 PR.
- **가업상속인 식별**: `Heir`에 가업상속인 플래그 추가 시 라.성명 자동.
