# 가업상속공제(상증법 §18의2) PDF 요건 대비 구현 갭 보완 계획서

> 작성일: 2026-06-04 / 브랜치: `worktree-gaeop-inheritance-deduction-plan`
> 학습 자료: `가업상속공제.pdf` (세무 교재 제2편 상속세 제6절, 364~389p, 26쪽)
> 대상 법령: **상증법 §18의2** (mst=276123, 시행 2026-01-02) · **상증령 §15** (mst=283637, 시행 2026-02-27)
> **KoreanLaw MCP 직접 검증 완료** (2026-06-04, §18의2 전문 + §15) — `[[korean-law-citation-verify]]`
>
> 분석 방법: PDF 26쪽 → 요건 8개 차원·40개 항목 체크리스트 추출 → 차원별 구현 매핑(file:line) + **누락·부분 주장 적대적 재검증**(false-missing 차단) → 우선순위화.
> 검증 정책: 모든 file:line·동작·수치는 실제 코드/법령 원문으로 확인. 미확정은 "확인 필요" 명시. `[[feedback_numeric_impact_verify_before_bug_claim]]` · `[[feedback_pre_anchor_verification]]`
>
> 선행 계획서(중복 회피·연계):
> - `docs/00-pm/inheritance-family-business-deduction-expansion.plan.md` (v3) — 공제 정밀화 엔진 ✅ 구현됨
> - `docs/00-pm/inheritance-family-business-eligibility-autoderive.plan.md` — 요건 자동판정 Phase 1·2 ✅ 구현됨
> - `docs/00-pm/inheritance-family-business-postmgmt.plan.md` (v3) — 사후관리 시뮬레이터 ⚠️ 계획만(산식 헬퍼 동결, 통합 미완)
> - `docs/00-pm/inheritance-besshi1-family-business-autofill.plan.md` — 별지 제1호서식 자동채움 ✅ 완료

---

## 1. 배경

가업상속공제는 이미 광범위하게 구현되어 있다(공제 한도·요건 자동판정·법인 사업무관자산 차감 산식·중견 200% 가드·기회발전특구·연부연납 특례·별지서식). 본 계획서는 **첨부 PDF 26쪽 전체를 사전학습**하여 법령·실무 요건을 8개 차원으로 분해하고, 현행 구현과 1:1 대조하여 **(a) 실효성 결함, (b) 미통합 기능, (c) 신규 미구현, (d) 엣지/저빈도**로 분류한 결과다. 기존 계획서가 이미 다룬 항목은 그 상태를 인용하고 **잔여·통합 항목만** 도출한다.

### 1-1. PDF 핵심 요건 요약 (학습 결과)

| 영역 | 핵심 |
|---|---|
| 가업 정의 | 중소·중견기업(직전 3년 매출 평균 5천억 미만, 2023~) + 피상속인 10년↑ 계속 경영 |
| 피상속인 | 거주자 + 최대주주등 지분 40%(상장 20%)×10년 + 대표이사 재직(50%↑/소급10년중5년/승계 3택1) |
| 상속인 | 18세↑ + 2년↑ 종사(65세전 사망·천재인재 면제) + 신고기한내 임원 + 2년내 대표이사 + 배우자 간주 + 공동상속 허용 |
| 재산범위 | 개인=사업용자산−담보채무 / 법인=주식×(1−사업무관자산/총자산), 사업무관 5종 |
| 공제 | 100%, 한도 10년 300억/20년 400억/30년 600억, 복수가업 순차, 중견 200% 납부능력 가드 |
| 사후관리 | 5년, 자산 40%처분·미종사·지분감소·고용(정규직&총급여 모두 90%미달) 추징 + 이자상당액 |
| 배제 | 조세포탈·회계부정 형확정(전10년~후5년) |
| 부수 | 연부연납 20년/10년거치, 가업승계 증여특례(§27의6⑨) 연계, 기회발전특구 완화, 양도세 상당액 공제(§⑩) |

---

## 2. 현행 구현 — 정합 확인 (보완 불필요)

| 요건 | 구현 위치 | 상태 |
|---|---|---|
| 공제율 100% + 한도 300/400/600억(현행) | `family-business.ts:60-66` `familyBusinessCap` + 상수 `types:276-278` | ✅ §18의2① 원문 일치 |
| 요건 자동판정 heir 4종(18세·2년종사·임원·대표이사) | `family-business-autoderive.ts:46-98` + `resolveFamilyBusinessRequirements:230-363` | ✅ override>auto>legacy 3-state |
| 요건 자동판정 decedent 2종(지분 40%/20%×10년·대표이사 50%/소급10년중5년) | `family-business-autoderive.ts:117-177` | ✅ 현행 임계 정합 |
| 배우자 요건충족 간주(§15③2호 후단) | `family-business.ts:114` 무조건 skip | ✅ **개인·법인 공통 적용이 법령 정합** (§3절 검증 메모 ②) |
| 배우자공제 + 가업상속공제 중복 적용 (C7) | `inheritance-deductions.ts:691-696` 독립 합산(`spouseDeduction + … + familyBusinessDeduction`) | ✅ PDF 385p 재재산-254 정합 — 상호배제 없음. ⚠️ dead 함수 주석 정리 §5-9 |
| 65세전 사망·천재인재 2년종사 면제 | `family-business.ts:117` `decedentEarlyDeath` | ✅ §15③2호나 단서 |
| 법인 사업무관자산 5종 차감 산식 | `property-valuation-corporate.ts:20-77` `calcCorporateStockAdjustedValue` (BigInt) | ✅ §15⑤2호 산식 정합 (단 D3/D4 자동산정은 §5-5 갭) |
| 중견 200% 가드 산식 | `family-business.ts:171-184` `check200PercentGuard` | ⚠️ 산식 정합하나 **입력 미연동(§5-1 HIGH)** |
| 조세포탈·회계부정 short-circuit(§⑧1호) | `family-business.ts:81-84` `hasTaxFraudConviction` | ✅ boolean ack 설계 정합 |
| 기회발전특구 라목(2년내 대표이사) 면제 | `family-business.ts:122-124` `ofzExempted` | ✅ 사전판정 적용 (단 사후관리 면제는 §5-2 갭) |
| 연부연납 가업특례 20년/10년 거치 | `installment-payment.ts:241-376` `straight20`/`grace10` | ✅ §71②1가 구현 |
| 별지 제1호서식 자동채움 | `deduction-besshi-data.ts:426` `buildBesshi1Data` | ✅ 완료(besshi1 계획서) |
| 양도세 상당액 공제 산식(§⑩) | `family-business-cgt-credit.ts:44-65` | ✅ 산식 정합 (단 통합은 §5-3 갭) |
| 사후관리 추징·이자 산식(§⑤·§15⑮⑯) | `family-business-postmanagement.ts:72-158` | ✅ 산식 정합 (단 통합·세분은 §5-2 갭) |

---

## 3. 검증 메모 — "고치면 안 되는" 항목 (false-missing/scope 외 확정)

> 적대적 재검증 + KoreanLaw MCP로 1차 갭 주장을 반증했다. 아래는 **현행이 정확**하므로 후속 작업에서 손대지 말 것.

**① 고용유지 4호 = AND (정규직 & 총급여 모두 90% 미달)** — `[[korean-law-citation-verify]]`
- KoreanLaw 원문 §18의2⑤4호: **"다음 각 목에 모두 해당하는 경우"** 가.정규직 90%미달 + 나.총급여 90%미달.
- `family-business-postmanagement.ts:11,24` 주석/enum의 **"AND"가 법령 정합**. PDF 교재 요약 "정규직 90% **또는** 총급여 90% 미달"은 부정확한 포괄 표현.
- ⚠️ 향후 `calcRegularEmployeeAverage`(§5-2) 구현 시 **AND 조건 유지**. "OR로 수정" 금지.

**② 배우자 요건충족 간주 — 개인기업 차단 가드 추가 금지**
- 1차 분석이 "businessType==='corporate' 한정 가드 누락"을 갭으로 주장했으나, §15③2호 후단에 **corporate 한정 문구 없음**(KoreanLaw 검증). 다·라목 "대표이사등"은 §15③1호나에서 "(개인사업자인 경우 대표자)"로 정의되어 개인사업자 포함.
- `family-business.ts:113-114`의 무조건 skip이 정합. 가드 추가 시 **개인기업의 정당한 배우자 간주를 차단하는 신규 버그**.

**③ 조세포탈·회계부정 임계 자동판정 불가 (G2/G3 out_of_scope)**
- 처벌수준(포탈 3억↑&납부 30%↑/포탈 5억↑) ·회계부정(자산 5%) 임계는 **법원 형 확정**의 전제조건이며 시스템이 자동 산정할 대상이 아님(사법부 판결 결과).
- `hasTaxFraudConviction` 단일 boolean ack가 정확한 설계. 임계 계산 추가 금지. (UI hint에 "상속개시일 전 10년~후 5년 행위, 형 확정 한정" 안내 1줄만 권장 — §5-6)

---

## 4. 갭 분류 개요 (우선순위)

| # | 갭 | 차원 | 심각도 | 유형 |
|---|---|---|---|---|
| **5-1** | **중견 200% 가드 `taxIfNoFBD:0` 침묵 오배제** | E5 | 🔴 **HIGH** | 실효성 결함(실제 계산 영향) |
| 5-2 | 사후관리 시뮬레이터 통합(추징·정규직평균·정당사유·OFZ면제) | F·H3 | 🟡 MED | 미통합(산식 동결, 도달 불가) |
| 5-3 | 양도세 이월과세(§⑩) transfer-tax 연동 | H4 | 🟡 MED | 미통합 |
| 5-4 | 복수가업 순차공제 | E4 | 🟢 MED | 신규 미구현(계획 부재) |
| 5-5 | 사업무관자산 자동산정(과다현금 200%·2025 개정) | D3·D4 | 🟢 MED | 신규 미구현 |
| 5-6 | 개정연혁 시기별 임계(매출·한도·지분) | A7·E3·B2 | 🟢 MED | 과거연도 상속 오판정 |
| 5-7 | 거주자 요건 미반영 | B1 | 🔵 LOW | 엣지 |
| 5-8 | 영위기간 유권해석·조특령 독립성·별표업종·유예기업 | A8·A2·A3·A5·A6 | 🔵 LOW | 안내문으로 충분 |
| 5-9 | 공동상속 per-heir·상속개시당시 미경영 예외·증여특례 연계·담보채무·**dead 함수 정리** | C6·B5·H2·D1 | 🔵 LOW | 후속/확인 필요 |

> 색상 = 갭 **유형**(🔴 실효성 결함 · 🟡 미통합 · 🟢 신규 미구현 · 🔵 엣지), 심각도는 별도 컬럼(같은 MED라도 색상이 다름). PR 순서(§6) 근거 = HIGH 즉시 → **산식 동결분 통합**(빠른 이득) → 신규 → **교차도메인**(무거움) 최후.

---

## 5. 갭 상세 + 보완 방안

### 5-1. 🔴 [HIGH] 중견기업 200% 가드 — `taxIfNoFBD:0` 침묵 오배제

**근거 (실측 확정)**
- `lib/tax-engine/inheritance-tax.ts:449` → `taxIfNoFBD: 0` 하드코딩. 주석(:446) "Phase F+ 정밀화 예정, 본 PR은 0 fallback".
- `family-business.ts:176` `cap200pct = taxIfNoFBD * 2` → **0 × 2 = 0**.
- `family-business.ts:177,182` `otherEstateNet = max(0, heirOtherEstateValue − heirDebt)`, `exceeded = otherEstateNet > cap200pct`.
- **귀결**: `enterpriseSize==="medium"` AND `heirOtherEstateValue − heirDebt > 0` 인 모든 케이스에서 `exceeded = (양수) > 0 = true` → `family-business.ts:217-219` `reasons.push("medium_other_estate_exceeds_200pct")` → **가업상속공제 전액 배제**.

**numeric 영향 + 도달성 (검증)**: 발화 조건 = 중견기업 경로 + `heirOtherEstateValue`(가업외 상속재산) 입력. **사용자 도달 가능 확정** — `FamilyBusinessEligibilitySection.tsx:429-430` 입력 위젯(`parseAmount`) + Zod `family-business-inheritance-schema.ts:29` `heirOtherEstateValue: z.number().nonnegative().optional()`로 폼→엔진 도달. 즉 가업외 재산을 **성실히 입력한 중견기업 납세자일수록 공제가 통째로 사라진다**(빈칸이면 net=0 → 미발화). false-positive 배제로 §18의2② 본래 취지(가업외 재산이 납부세액의 2배 초과 시에만 배제)와 정반대 — **정상 입력을 벌하므로 HIGH**.

**보완 방안**
1. orchestrator(`inheritance-tax.ts`)에서 **가업상속공제 미적용 1차 산출세액**(가업상속인 부담분)을 실제 계산해 `taxIfNoFBD`로 주입.
   - 설계 난점: `taxIfNoFBD`는 "FBD 없이 계산한 세액"이므로 deduction 단계에 순환 의존. → **2-pass 산정** (pass 1: FBD=0으로 과세표준→산출세액 도출 → `taxIfNoFBD` 확정 / pass 2: 200% 가드 판정 후 FBD 적용한 최종 계산). 또는 `taxIfNoFBD ≈ 산출세액(과세표준 + 가업상속공제액)` 근사.
   - 가업상속인 "부담분" = 인별 안분(`heirShare`)이 필요 → `perHeir` 집계 헬퍼 재사용.
2. **미연동 기간 안전장치(즉시 적용 가능)**: `taxIfNoFBD === 0`일 때 200% 가드를 **비활성**(undefined 반환)하여 오배제 차단. 또는 `inheritance-validate.ts`에서 `enterpriseSize==="medium" && heirOtherEstateValue>0`이면 "200% 가드 미지원 — 직접입력 모드 사용" 안내로 차단. `[[feedback_validation_sync_8th_point]]`
3. anchor: `FB-GUARD-200-1` 중견+가업외 net ≤ 2×taxIfNoFBD → 공제 유지 / `FB-GUARD-200-2` net > 2×taxIfNoFBD → 배제 / `FB-GUARD-200-3` **안전장치 검증** — taxIfNoFBD 미연동(0) 시 가드 비활성 → 공제 **유지**(현행 오배제를 의도적으로 교정. "현행 보존" 아님 — 현행이 곧 버그).

> 우선순위 1 사유: 유일하게 **실제 산출세액을 잘못 만드는** 결함이며, 정상 입력을 벌하는 방향이다.

---

### 5-2. 🟡 [MED] 사후관리(추징) 시뮬레이터 통합

**현황**: 산식 헬퍼는 동결(`family-business-postmanagement.ts` — `calcFamilyBusinessRecapture:72`·`calcFamilyBusinessInterest:124`·`calcAssetDisposalRatio:155`, commit `76f7282`). 그러나 **실 호출처 0건**(테스트 제외) — `app/calc/inheritance-postmgmt/page.tsx`는 영농(§18의3) 전용이며 가업 추징 UI 진입점 없음. `InheritanceTaxResult`에 `familyBusinessPostMgmtMeta` 부재. → 산식이 사용자에게 도달하지 않음.

**기존 계획**: `inheritance-family-business-postmgmt.plan.md` (v3)에 4단계 마법사·orchestrator 메타·정규직 평균·정당사유 17종·5년 가드·수정신고 매핑까지 **상세 설계 존재**. 본 계획서는 그 미구현 잔여를 확인·우선순위만 부여한다.

**잔여 항목 (postmgmt.plan.md §1-1 + 본 검증)**
1. **정규직 평균 산정 미구현** — §15⑬(정의)·§15⑰(평균 산식)·§15⑱(분할·합병). 신규 `family-business-employment.ts`. ⚠️ 위반 조건 **AND** 유지(§3 검증메모 ①).
2. **재차 부과 처리 미구현** — §15⑩ 단서(종전 처분 자산 제외).
3. **정당사유 자동 면제 미구현** — §15⑧ 1~3호 17종 enum(수용·협의매수·국가증여·시설개체·사업장이전·내용연수경과·연구인력개발비 사용 등 + 5년 경과 면제 `outside_five_year_period`).
4. **OFZ 사후관리 면제 미구현** — §15㉕ → §15⑪1호(대표이사 미종사) + §15⑪2호(업종변경) 자동 면제. **§15⑪3호(1년 휴/폐업)는 면제 대상 아님**.
5. **`business_cessation` 미분리** — 현행 단일 유형(`family-business-postmanagement.ts:23`)을 `ceo_cessation`(§15⑪1호)·`industry_change`(§15⑪2호)·`closure`(§15⑪3호)로 세분 후 OFZ 면제 분기.
6. **UI·orchestrator 메타** — `inheritance-postmgmt` 페이지에 영농과 병렬로 가업 추징 마법사 연결 + `InheritanceTaxResult.familyBusinessPostMgmtMeta`(추징 prefill 소스).
7. **신고·납부 기한(F8)** — §18의2⑨ 위반일 말일부터 6개월 이내 신고·납부. postmgmt.plan.md L13(수정신고 마법사·별지 제9호서식 매핑)에서 다룸 — 기한 표시·수정신고 데이터 흐름 포함.

> 권고: postmgmt.plan.md를 **본 PR의 실행 계획으로 승격**. 헬퍼는 이미 동결되어 있어 통합·세분·UI 위주.

---

### 5-3. 🟡 [MED] 양도세 이월과세 상당액 공제(§⑩) transfer-tax 연동

**근거**: `family-business-cgt-credit.ts:44-65` `calcFamilyBusinessCgtCredit`(`max(0, §97의2④ − §97)`)는 §⑩ 원문 정합. 그러나 헤더(:17) "실 호출 통합은 추후 transfer-tax 도메인 PR" — **호출처 0건**.

**보완**: 가업상속공제 받은 자산을 후속 양도할 때 transfer-tax 엔진이 (a) 일반 산식(§97) (b) 의제 취득가(§97의2④) 두 양도세를 산출 → 차액을 상속세 산출세액에서 공제. 두 도메인(transfer ↔ inheritance) 연동 설계 필요. 사후관리 추징(§5-2)의 `cgtCreditAmount`(과다납부 양도세 차감)와 입력 일원화.

> postmgmt.plan.md §1-1 #C1·R8에서 "transfer-tax 측 산정 → postmgmt 수동 입력(자동 prefill은 후속)"으로 분담 명시됨. 본 항목은 그 자동화.

---

### 5-4. 🟢 [MED] 복수가업 순차공제 — **신규(기존 계획 부재)**

**근거 (실측 확정)**: `FamilyBusinessInheritanceInput`(types:35)은 단일 interface, `operatingYears`(types:40)는 단일 scalar. `inheritance-gift.types.ts:839` `familyBusiness?: FamilyBusinessInheritanceInput`(배열 아님). `calcFamilyBusinessDeductionPhase2`(family-business.ts:196)는 단일 input→단일 cap→단일 deduction. grep 결과 "복수/순차/businesses/잔여한도 차감 루프" **0건**. → 둘 이상 독립 가업 동시 상속 시 1건만 계산.

**법령 (상증령 §15④ + 상증칙5, 2016.2.5.~)**: 영위기간 긴 기업부터 순차, 총한도 = 가장 긴 기업 한도, 개별 Min 누적:
```
㉮(30년↑) = Min(X, 600억)
㉯(20~30) = Min(600억 − ㉮, Y, 400억)
㉰(10~20) = Min(600억 − ㉮ − ㉯, Z, 300억)
공제 합계 = ㉮ + ㉯ + ㉰   (≤ 600억)
```
**보완**: `FamilyBusinessInheritanceInput[]` 확장 → 영위기간 내림차순 정렬 → 잔여한도 차감 누적 루프. UI는 가업 카드 다중화. anchor: PDF 379p 표 재현(3개 가업 X/Y/Z, 한도 누적). 실무 빈도 낮아 MED. **단일 가업 경로의 총 공제액은 현재 정확**(회귀 무위험).

---

### 5-5. 🟢 [MED] 사업무관자산 자동산정 — 과다현금 200% + 2025.2.28. 개정

**근거**: `property-valuation-corporate.ts:20-31` `sumNonBusinessAssets`는 5종(`nonBusinessLand`·`rentedRealEstate`·`externalLoans`·`excessCash`·`nonOperatingFinancial`)을 **사용자 직접입력 집계값**으로 단순 합산. 차감 산식(주식×(총자산−사업무관)/총자산)은 정합하나, 각 항목의 **판정·산정 로직 부재**.

**미반영 (PDF 374~377p, §15⑤2호)**
- **과다보유현금 200%** — 직전 5개 사업연도말 평균 현금(요구불예금·만기 3개월내 금융상품 포함)의 **200% 초과분**만 사업무관. 현행은 `excessCash`를 사용자가 미리 계산해 입력. (2025.2.28. 150%→200% 개정 반영됨이 전제)
- **2025.2.28. 개정 제외 단서** — ㉡ 임직원 사택(국민주택규모↓ or 기준시가 6억↓ + 5년↑ 무상제공) 제외 / ㉢ 임직원 학자금·기준시가 6억↓ 주택 전세금 제외 / 과다현금 비율 150%→200%.

**보완**: (a) 과다현금 = `max(0, 보유현금 − 5년말평균 × 2.0)` 자동산정 헬퍼 + 5개년 현금 입력 위젯. (b) 임대부동산·대여금에서 사택·학자금·전세금 제외 토글. anchor: 200% 경계·사택 제외. ⚠️ 이중차감 가드(`corporateTotalAssets` 입력 여부로 직접입력 vs 자동 모드 분기, family-business.ts:148 기존 패턴) 유지.

> `inheritance-family-business-deduction-expansion.plan.md`에서 "FB-8 후속 PR"로 예고됨(자동화 미착수). 본 항목이 그 FB-8.

---

### 5-6. 🟢 [MED] 개정연혁 시기별 임계 (매출·한도·지분)

**근거**: 모두 **현행(2023.1.1.~) 단일값**만 하드코딩. `deathDate`(상속개시일) 기반 시기별 분기 부재.
- **매출 임계(A7)**: `FAMILY_BUSINESS_SCALE_THRESHOLD = 500_000_000_000` 단일(types:283). PDF 367p: 2011~12 1500억 / 2013 2000억 / 2014~21 3000억 / 2022 4000억 / 2023~ 5000억.
- **공제 한도(E3)**: `familyBusinessCap`(family-business.ts:60-66)은 `operatingYears`만 받고 `deathDate` 미수신. PDF 378·381p: 2014~17(10년200/15년300/20년500) / 2018~22(10년200/20년300/30년500) / 2023~(300/400/600). **구간 경계도 다름**(15년 vs 20년).
- **지분 임계(B2)**: `deriveFBDecedentShareholding`(autoderive.ts:124) `isListed ? 0.2 : 0.4` 고정. PDF 382p: 2011~22 비상장 50%/상장 30% → 2023~ 비상장 40%/상장 20%.

**numeric 영향**: 과거연도 상속개시 케이스 오판정. 예) 2020년 상속 매출 4천억 기업 → 현행 5천억 기준 통과하나 당시 3천억 기준이면 부적격. 한도도 과대/과소.

**보완**: `deathDate` 기반 시기별 테이블 + 선택 함수(`getFamilyBusinessCapByDate`·`getScaleThresholdByDate`·`getShareThresholdByDate`). `[[feedback_historical_tax_tables]]` 정적 상수 패턴. ⚠️ **현행(2023+) 상속이 다수**이므로 default를 최신본 유지(회귀 무위험), 과거 분기만 추가. anchor: 2020·2016·2024 상속 각 한도/임계.

---

### 5-7~5-9. 🔵 [LOW] 엣지·저빈도·확인 필요

| # | 갭 | 근거 | 보완 |
|---|---|---|---|
| **B1** 거주자 요건 | `decedentType`(types:968)이 `FamilyBusinessInheritanceInput`에 미전달 — `evaluateFamilyBusinessEligibility`가 거주자 미참조 → 비거주자 피상속인도 자격 통과 | `decedentType` 스레딩 + `non_resident` 시 `reasons.push("decedent_non_resident")`(reason union 확장). §18의2① "거주자의 사망" |
| **A8** 영위기간 유권해석 | `suggestFBOperatingYears`(autoderive.ts:96)는 개업~사망 단순 만연수. 법인전환(포함)·인적분할(분할전 기산)·흡수합병·사업장이전 규칙 0건 | `operatingYears` 직접입력 유지 + "유권해석(법인전환·인적분할·합병 통산) 반영하여 입력" hint. 자동도출은 단순 만연수임 명시 |
| **A2·A3** 조특령 독립성 | 조특령 §2①3호·§9④3호(관계기업 매출 합산·외국법인 지분) grep 0건. `enterpriseSize` 자기선택 enum | 자기확인 boolean(`isIndependentEnterprise`) 추가 or "독립성 요건 납세자 확인" 안내 |
| **A5·A6** 별표업종·유예기업 | `isEligibleIndustry` boolean 자기확인(KSIC 대조 없음), 중소기업 졸업 유예기업 제외 분기 없음 | 현행 boolean 유지 + "별표 해당 업종/유예 졸업기업 제외 납세자 확인" 안내 1줄 |
| **C6** 공동상속 per-heir | 단일 `heirId`(types:86), `resolveFamilyBusinessHeirId`(autoderive.ts:192) 1명만. **총 공제액은 정확**(한도·가액 상속인 수 무관), per-heir 요건·지분 안분만 갭 | 후속 PR — `heirId[]` 배열 + 상속인별 §15③2호 평가 + 지분 안분. 협의분할 표 정합 시점 착수 |
| **B5** 상속개시당시 미경영 예외 | 재재산-741(건강상 불가피 미종사) 명시 필드 0건. 단 CEO 재직판정이 시점 종사 미강제로 결과 부분 일치 | `decedentNonEngagementByHealth` 입력 + 안내. numeric 영향 미미 |
| **H2** 가업승계 증여특례 연계 | `inheritance-gift-tax-credit.ts:317` `specialTreatmentCredit: 0 // 상속세: 조특법 특례 없음`. §27의6⑨ 의제 전환(증여받은 가업주식 → 가업상속 의제) 경로 0건 | 후속 — `PriorGift`에 `fromFamilyBusinessGift` 플래그 + 증여~상속 영위연수 통산 골격화 |
| **D1** 개인기업 담보채무 차감 | `deriveFamilyBusinessValue`(family-business.ts:141-160)는 raw 합산(gross). §15⑤1호 "사업용자산−담보채무" | **확인 필요**: 전체 채무공제(§14)와 **이중차감 위험** 분석 후 결정. 단순 차감 금지. `project_inheritance_collateral_66_max`(저당권 §66 MAX) 상호작용 검토 |
| **dead 함수 정리** (개선) | legacy `calcFamilyBusinessDeduction`(`inheritance-deductions.ts:348`)는 테스트 import 1곳 외 호출처 0(dead). 주석(:346) "배우자공제는 제한 있음"이 C7 중복적용(§2)과 충돌, stale 상수 `FAMILY_BUSINESS_MAX_10Y=60_000_000_000`(:97, 600억 단일 cap — 활성 300억과 불일치) | 즉시 정리(quick-win): dead 함수·상수·오해 주석 삭제 또는 활성 `family-business.ts`로 일원화. 테스트 import도 정리. 회귀 무위험(미사용) |
| **C8** 직계존속 상속 | PDF 385p 법규재산-5040: 자녀(피상속인) 가업을 직계존속이 상속 가능. 현행 엔진은 상속인 relation 방향 제한 없음 → **암묵적 정합** | 추가 작업 불요. 안내 시 직계존속 가능 명시(선택) |
| **D5** 임차보증금·유동자산 | PDF 374p: 임차보증금 포함(조심2012서626)·유동자산 제외(조심2019중2136). 현행은 `familyBusinessCategory` 사용자 분류 의존 | 자산 분류 hint에 "임차보증금 포함·유동자산 제외" 안내. 카테고리에 임차보증금 슬롯 검토 |

---

## 6. 권고 실행 순서

1. **PR-1 (🔴 즉시)**: §5-1 중견 200% 가드 — 안전장치(`taxIfNoFBD===0` 시 가드 비활성 or validate 차단) **선반영** + 2-pass `taxIfNoFBD` 산정. 정상 입력 오배제 차단.
2. **PR-2 (🟡)**: §5-2 사후관리 시뮬레이터 — `postmgmt.plan.md` v3 승격(통합·세분·정규직평균·정당사유·OFZ면제·UI).
3. **PR-3 (🟢)**: §5-5 사업무관자산 자동산정(FB-8) + §5-6 개정연혁 시기별 테이블.
4. **PR-4 (🟢)**: §5-4 복수가업 순차공제.
5. **PR-5 (🟡)**: §5-3 양도세 이월과세 transfer-tax 연동.
6. **후속/안내**: §5-7~5-9 — 안내문(A2·A3·A5·A6·A8·B5) 즉시, 골격화(B1·C6·H2·D1) 후속.
7. **quick-win(PR-1 동행 가능)**: §5-9 dead 함수 정리 — `calcFamilyBusinessDeduction`(:348)·stale `FAMILY_BUSINESS_MAX_10Y`(:97)·오해 주석(:346) 삭제. 회귀 무위험(미사용), C7 모순 제거.

---

## 7. 검증·정책 체크 (Do 진입 시)

- [ ] **Pre-Do anchor 우선**(`[[feedback_pre_anchor_verification]]`): §5-1 `FB-GUARD-200-2`(중견 오배제 재현) 먼저 실패 확보 → 수정.
- [ ] **법령 인용 KoreanLaw 검증**(`[[korean-law-citation-verify]]`): §5-4 복수가업 §15④·상증칙5, §5-5 §15⑤2호 2025 개정 단서, §5-6 부칙 시기 직접 확인.
- [ ] **14개 동기화 지점**: 신규 입력(복수가업 배열·사택 토글·decedentType 등) 추가 시 ⑫⑬⑭ grep 자가점검(`[[feedback_api_zod_schema_sync]]`).
- [ ] **numeric 영향 먼저**(`[[feedback_numeric_impact_verify_before_bug_claim]]`): §3 검증메모(고용 AND·배우자 간주·형확정 임계)는 **변경 금지** 재확인.
- [ ] **회귀 0건**: 현행 단일 가업·현행 한도·legacy 경로 anchor 보존. `npm test` 전체.
- [ ] **브라우저 확인은 Playwright E2E**(`[[feedback_browser_verify_with_playwright]]`): 중견 200% 가드 폼→계산→결과.

---

## 부록 A. 분석 방법론 (재현 가능성)

PDF 26쪽 → 8개 차원(A 기업·B 피상속인·C 상속인·D 재산범위·E 공제·F 사후관리·G 배제·H 부수) × 40개 요건 체크리스트 → 워크플로 10개 차원 병렬 매핑(file:line) + 누락·부분 주장 적대적 재검증(false-missing 차단). A·B·C·E·G·H는 워크플로 검증, D·F·UI는 핵심 엔진 파일 직접정독(`property-valuation-corporate.ts`·`family-business-postmanagement.ts`·orchestrator)으로 교차확인. 헤드라인(E5)·법령 모호점(F5 AND/OR)·거주자(B1)는 `inheritance-tax.ts:449` 직접 읽기 + KoreanLaw MCP §18의2 전문으로 재확정.

**적대적 검증이 막은 false-bug 3건**: (1) 고용 OR 수정(실제 AND) (2) 배우자 간주 corporate 가드(실제 개인 포함) (3) 형확정 임계 자동판정(실제 사법부 영역). → §3 검증메모로 동결.

---

## 부록 B. 자가 검토 이력 (`[[plan-design-self-review-loop]]` 13단계)

본 문서는 **갭 트리아지·로드맵 계획서**이므로 13단계 중 1~4단계(계획 검토×2 + 정정 + 실측 확정)를 적용. 5~13단계(엔진/UI `.design.md` 생성·통합비교)는 **각 실행 PR(§6) 착수 시점**에 수행한다 — 단일 기능이 아니라 5개 독립 PR로 분기되므로 통합 설계는 PR별이 정확.

### 검토 사이클 1 (정정 7건 — 실측 후 단정)
| # | 카테고리 | 위치 | 정정 |
|---|---|---|---|
| 1 | 오류(인용) | §2 별지서식 | `buildBesshi1Data` :364-394 → **:426** (실측) |
| 2 | 모순(교차참조) | §2 배우자 간주 | "검증메모 ①" → **②** |
| 3 | 누락(요건) | C7 | §2 정합 행 추가 — `inheritance-deductions.ts:691-696` 독립 합산 실측, PDF 재재산-254 정합 |
| 4 | 개선(정리) | §5-9 | dead `calcFamilyBusinessDeduction:348`(호출처 0)·stale `FAMILY_BUSINESS_MAX_10Y=600억:97`·오해 주석:346 정리 항목 |
| 5 | 개선(근거) | §5-1 | E5 도달성 — UI `:429-430`+Zod `:29` 실측 인용으로 HIGH 정당화 |
| 6 | 누락(요건) | §5-9 | C8(직계존속 정합)·D5(임차보증금/유동자산) 추가, §5-2에 F8(6개월 신고) |
| 7 | 개선(가독) | §4 | 🔴🟡🟢 유형 범례 + PR 순서 근거 |

### 검토 사이클 2 (1차 정정의 파급 — 정정 1건)
| # | 카테고리 | 위치 | 정정 |
|---|---|---|---|
| 8 | 오류(논리모순) | §5-1 anchor | `FB-GUARD-200-3` "현행 회귀 방지"는 모순(현행=버그) → "안전장치 검증, 미배제가 정답"으로 교정 |
| 9 | 정합 확인 | C7↔§2↔§5-9↔§6 | 1차 추가분 교차참조 전수 ✅ 정합 |

**누적 정정 8건.** 실측으로 인용오류 2건(:426·교차참조②)·dead-code 트랩 1건 적발 — 1회 검토로는 누락됐을 항목. `[[korean-law-citation-verify]]`(§18의2 원문)·`[[feedback_numeric_impact_verify_before_bug_claim]]`(E5 도달성·F5 AND) 적용. Critical/High 잔존 0.
