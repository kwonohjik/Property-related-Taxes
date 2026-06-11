# P3 — §98의3 + §98의5 + §98의6 하이브리드 감면 엔진 설계

> 작성: 2026-06-12 · 마스터 플랜 §4 P3 · P2 하이브리드 골격(`unsold-hybrid.ts`) 확장
> 법령: KoreanLaw 2026-06-12 원문 — 법 §98의3·§98의5·§98의6 (MST 286597) / 령 §98의3·§98의4·§98의5 (MST 286143)
> D-10 해소: 령 §98의4① "법 제98조의5제1항" 확정. D-8 해소: §98의5 법문에 계약 시작 경계 없음 — 단 "2010.2.11 현재 미분양" 컷오프상 그 이전 본인 계약은 미분양 모순 → 사실상 2010.2.12 이후 (period-check 시작 경계 유지 + 낙관 통과).

## 1. 조문별 요건·효과 (원문 확정)

| 항목 | §98의3 (unsold_98_3) | §98의5 (unsold_98_5) | §98의6 (unsold_98_6) |
|---|---|---|---|
| 주체 | 거주자 / 국내사업장 없는 비거주자 (소법 §120) | 동일 | 동일 |
| 시한 | 거주자 2009.2.12~2010.2.11 / 비거주자 2009.3.16~2010.2.11 최초 매매계약+취득 (2010.2.11까지 계약+계약금 포함) | ~2011.4.30 최초 매매계약+취득 (계약금 포함) | 1호: 사업주체등 ~2011.12.31 임대계약+2년 임대 후 최초 매매계약 취득 / 2호: 최초 매매계약 취득 후 5년 임대 (~2011.12.31 임대계약 한정) |
| 지역·물건 | 서울 밖 + 지정지역(소법 §104의2) 제외. 과밀억제권역은 대지 660㎡ AND 연면적(전용) 149㎡ 이내 한정 (령①단서, 과밀 판정 = 매매계약일 현재 령④) | 2010.2.11 현재 수도권 밖 미분양 (령 §98의4①) | 사용검사·승인 후 2011.3.29 현재 미계약+선착순 (령 §98의5②). 기준시가 합계 6억 초과 **또는** 연면적(전용) 149 초과 제외 (취득 당시, 1호는 최초 임대개시 시) |
| 자기건설 | ② 동기간 착공+사용승인 포함 (조합원 관리처분·멸실 재건축 제외) | 없음 | 없음 |
| 감면·공제율 | 100% (과밀억제권역 60%) | 분양가 인하율별: ≤10% 60% / 10~20% 80% / >20% 100% (령④ 계산식 — 인하율 % 직접 입력) | 50% |
| 5년 내 세액감면 | ○ (rate 적용) | ○ (rate 적용) | **1호 한정** ○ 50% — 2호는 5년 내 혜택 없음 |
| 5년 후 차감 | 5년 발생분 × rate | 동일 | 5년 발생분 × 50% (1·2호) |
| 제외 (령) | 입주사실(②1호)·해제 재계약(②2호)·대체취득(②3호) | 동일 구조 (령 §98의4②) | 준공 후 입주사실(③1호)·재계약(③2호)·대체취득(③3호) |
| 장특·세율 특칙 | ④ 표1(§95②단서 시 표2) + **§104①1호** | ③ 동일 | ③ 동일 |
| 임대기간 | — | — | 2호: 사업자등록+임대사업자등록 후 임대개시일 기산 + 상속 합산 (령⑤ — §98의8 동형) |
| 농특세 | **비과세** (농특세령 §4⑦1호) | **비과세** | 과세 (열거 없음 — 감면세액·차감 ×20%) |
| 중과 배제 | 소령 §167의3①5호 열거 ○ | ○ | ○ |

## 2. 신규 인프라 — 특칙 2종

### 2-1. 단기세율 배제 (§104①1호 강제)

법 ④/③ 2호: "§95② 및 §104①**3호** 불구 ... 세율: §104①1호" — 보유 1·2년 미만 단기세율(§104①2·3호) 대신 기본 누진세율 강제.
- `TransferTaxInput.suppressShortTermRate?: boolean` (엔진 내부 — STEP 7에서 주입, 사용자 입력 아님).
- transfer-tax.ts: `incomeDeduction.eligibleId ∈ RATE_SPECIAL_REDUCTION_IDS` 시 taxRateInput에 주입. finalize 2-pass도 동일 taxRateInput 사용 — 자동 일관.
- calcTax: 단기세율 분기 직전 가드. 미등기(§104①10호)는 특칙 범위 밖 — 유지.
- LTHD 표1: 기본 동작과 동일 (표1은 3년+ 요건 자체 보유 — 특칙이 3년 요건을 면제하지 않음). 중과 시 LTHD 배제 경로는 중과 자동 배제(§167의3①5호)로 도달 불가 — 훅 불요.

### 2-2. 농특세 비과세 플래그

- `UnsoldHybridResult.ruralSurtaxExempt: boolean` — evaluator가 설정 (§98의3·§98의5 true).
- finalize STEP 7.5 (2-pass)·STEP 8.7: exempt면 농특세 0 + step 미발생. 카드는 "농특세 비과세 (농특세령 §4⑦1호)" 표기.

## 3. 파일 설계

- **`unsold-hybrid-p3.ts` (신규)** — evaluateUnsold983 / evaluateUnsold985 / evaluateUnsold986 + reduction 매핑. 코어(`computeHybridEffect`·`ineligible`)는 unsold-hybrid.ts에서 export 추가 후 재사용 (800줄 정책 — 코어 파일 비대 방지).
- `computeHybridEffect` 확장: `rate` 파라미터 (P2는 1.0) — 5년 후 차감 = `applyRate(안분액, rate)`, 한도 min(소득금액). 5년 내 tax_amount는 rate echo만 (감면액은 calcReductions에서 `applyRate(calculatedTax, rate)`). §98의6 2호 5년 내 = ineligible(NO_WITHIN_5Y_BENEFIT) 처리.
- 라우터·calcReductions·중과 배제·finalize: P2 메커니즘에 3개 id 합류 (`IncomeDeductionId` += 3, SURCHARGE_EXCLUDED += 3, RATE_SPECIAL 신설).

### 입력 필드 (접미사 983/985/986)

- **983**: residencyType983("resident"|"nonresident_no_pe" — 시한 분기), houseType983("purchased"|"self_built"), contractDate983 / constructionStartDate983+usageApprovalDate983, isOutsideSeoulNotDesignated983(서울 밖+지정지역 아님 통합), isOverconcentration983(과밀 — ON 시 landAreaSqm983·floorAreaSqm983 필수: 660·149 한정 + rate 0.6), isUnsoldConfirmed983, isFirstContract983, isNotOccupiedAtContract983, isNotRecontract983, isNotExcludedSelfBuilt983(자기건설), std 3종.
- **985**: contractDate985(~2011.4.30), priceReductionRatePct985(% DecimalInput — 인하율 = (최초 공시 분양가 − 매매가) ÷ 최초 공시 분양가), isNonCapitalUnsoldAt20100211985, isFirstContract985, isNotOccupiedAtContract985, isNotRecontract985, std 3종.
- **986**: hoType986("seller_rented"|"buyer_rented"), contractDate986, stdPriceSumAtBase986(주택+부수토지 기준시가 합계 — 취득/최초 임대개시 당시, 6억), floorAreaSqm986(149), isUnsoldAfterCompletion986, isFirstContract986, isNotOccupiedAfterCompletion986, isNotRecontract986, 1호: sellerRented2Years986 / 2호: rentalContractDate986(~2011.12.31)+rentalStartDate986+rentalEndDate986+inheritedRentalMonths986, std 3종.

## 4. anchor 인벤토리

| # | 케이스 | 검증 |
|---|---|---|
| P3-1 | §98의3 5년 후 비과밀 — 100% 차감 + 농특세 0 | rate 1.0 + exempt |
| P3-2 | §98의3 과밀 — 60% + 660/149 한정 (초과 배제) | rate 0.6 |
| P3-3 | §98의3 비거주자 시한 분기 (2009.2.20 계약: 거주자 적격 / 비거주자 배제) | 시한 2-트랙 |
| P3-4 | §98의5 인하율 3단계 경계 (10%·10.01%·20%·20.01%) | 60/80/100 |
| P3-5 | §98의6 1호 5년 내 50% 세액감면 + 농특세 20% / 2호 5년 내 혜택 없음 | 호 분기 |
| P3-6 | §98의6 6억 OR 149 초과 제외 / 임대 기산 (2호 60개월) | 령② 단서·령⑤ |
| P3-7 | 통합: 단기세율 배제 — 보유 1년 6개월 + §98의3 적격 → 기본세율 (40% 단기 미적용) | suppressShortTermRate |
| P3-8 | 통합: §98의5 5년 내 80% 감면 + 농특세 0 + 결정세액 원단위 | 비과세 + rate |
| P3-9 | 기존 P1·P2 anchor 전건 무변화 | 회귀 0 |

## 5. 검토 (13단계 압축 — 발견·정정)

| # | 우선순위 | 발견 | 정정 |
|---|---|---|---|
| 1 | Critical | §98의6 5년 내 감면 1호 한정 — 2호 5년 내는 어떤 혜택도 없음 | 2호+5년 내 = ineligible(NO_WITHIN_5Y_BENEFIT) |
| 2 | Critical | 농특세 비과세 2건을 STEP 8.7 일괄 과세로 처리하면 과대 부과 | ruralSurtaxExempt 플래그 |
| 3 | High | §98의3 과밀 면적 한정은 AND (대지 660 이내 그리고 연면적 149 이내) — 비과밀은 무제한 | 과밀 ON 시만 검증 |
| 4 | High | 특칙 세율은 §104①2호(1년 미만)도 배제 ("세율은 1호" 강제 — 법문 명시는 3호) | 2·3호 모두 가드 |
| 5 | Medium | §98의5 시작 경계 (D-8) — 법문 부재나 2010.2.11 미분양 컷오프상 사실상 2.12 이후 | period-check 유지 + 낙관 + 주석 |
| 6 | Medium | §98의3 지정지역 제외 — 소법 §104의2 지정 이력 DB 없음 | 통합 확인 토글 (서울 밖+지정지역 아님) |
| 7 | Medium | §98의6 기준시가 6억은 "주택+부수토지 합계" — §98의8 취득가 6억과 다른 기준 | 라벨·hint 구분 |
