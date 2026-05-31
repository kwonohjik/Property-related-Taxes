# 상속공제 4,600m 정합 — 6개 수정 (버그 3 + 자동화 3) 계획서

> 트리거(이미지31~37): 교재 종합사례 ⑤ 상속공제 = **4,600,000,000**(교재 ⑥)이어야 하나 앱 화면 **3,987,142,857**.
> 사용자 인터뷰 2회: "자산·협의분할 입력으로 모든 공제가 자동 계산되길 기대"(Step4 별도 입력 안 함), 일괄공제도 자동 max.

---

## 0. 검증 결과 — 실측 (probe 재현 완료)

| 항목 | 결과 |
|---|---|
| 엔진 `calcInheritanceTax` | 교재 fixture(spouseActual 명시·legatee·giftTaxBase 정확) → **4,600m** (E-02 PASS) ✅ |
| §24 한도 | 5,965m ✅ |
| 전달 경로(Zod·API·route) | beneficiaryType·doneeId·giftTaxBase 보존 ✅ (dual-truth 아님 — **이전 추정 정정**) |
| 화면 배우자공제 | **2,707,142,857** (이전 추정 2,187m 오류 정정). probe: `spouseActual 미입력 + legatee=0 + 배우자 giftTaxBase 제거` 정확 재현 |

### 화면(이미지37) vs 교재 — 6항목 대조
| 공제 | 교재 | 화면 | 차이 | 분류 |
|---|---|---|---|---|
| 일괄 / 기초+인적 | 일괄 500m | 기초200+인적100=300m | −200 | **버그①** 자동 max 미작동 |
| 금융 §22 | 200m | 0 | −200 | **자동화④** 미입력 |
| 동거 §23의2 | 600m | 480m | −120 | **버그②** 80% (현행 100%) |
| 가업 §18의2 | 500m | 500m | — | ✅ |
| 배우자 §19 | 2,800m | 2,707m | −93 | **버그③+자동화⑤⑥** |
| 합계 | 4,600m | 3,987m | −613 | |

### 배우자공제 2,707m 분해 (probe)
`법정상속분 = numeratorCorrected 8,090m × 1.5/3.5 − spouseGiftTaxBase 760m = 2,707,142,857`
- numerator 8,090m = (6,680+350)+2,260(heir사전증여 정상가산) **−0(legatee 미반영)** −1,215+15 → 교재는 legatee 500m 차감해 7,590m.
- spouseGiftTaxBase **760m**(=giftAmount fallback) → 교재 과세표준 160m.
- spouseActual 미입력 → 법정상속분 자체가 배우자공제(2,707m < 2,800m).

---

## 1. 인터뷰 결과 (2026-05-31, 2회)

| # | 의문 | 결정 |
|---|---|---|
| I-1 | 정밀 산식 발동 | 항상 단일화 (조건부 제거, calcLegalShareRatios 근사식 폐기) |
| I-2 | 배우자 법정비율 | 공동상속인 전체 반영 (직계비속 우선, 없으면 직계존속) |
| I-3 | 배우자 사전증여 과세표준 차감 | 유지 (단, 과세표준=가액−§53공제 **자동 산정**) |
| I-4 | 일괄공제 | **자동 max 선택** (사용자 의도 안 함 → 버그) |
| I-5 | 금융·손녀유증 | **자산·협의분할 기반 자동 계산** (Step4 미입력) |
| I-6 | 배우자 실제상속액·과세표준 | **둘 다 자동화** |

---

## 2. 수정안 — 6개

### ★ 버그 ① 일괄공제 자동 max 미작동
- 화면 기초+인적 300m (일괄 500m 유리한데 미선택).
- `calcInheritanceDeductions:629` `preferLumpSum !== false && LUMP_SUM >= itemizedTotal` → 일괄.
- **점검**: `INITIAL_FORM.preferLumpSum` 기본값 / buildInput `form.preferLumpSum` 전달값. `false`로 굳어 있으면 자동 max 무력화.
- **수정**: 기본값을 자동 max(undefined/true)로. 사용자가 명시 항목별 선택 시에만 false.

### ★ 버그 ② 동거주택공제 80% → 100% (§23의2)
- `COHABIT_SHARE_RATE = 0.80` (inheritance-deductions.ts:71). 화면 480m = 600m×80%.
- 상증법 §23의2: **2020.1.1. 개정으로 주택가액의 100%** (한도 6억). 2024 상속 → 100%.
- **수정**: `COHABIT_SHARE_RATE → 1.00` (+ 개정 전 상속개시 분기 필요 시 historical). **KoreanLaw MCP §23의2 비율·시행일 확정 선행**.

### ★ 버그 ③ 배우자 사전증여 과세표준 자동 (spouseGiftTaxBase)
- `spouseGiftTaxBase = g.giftTaxBase ?? g.giftAmount` (inheritance-tax.ts:257). 상속세 모드 사전증여엔 `giftTaxBase` 입력 UI 없음(증여세 모드 전용) → giftAmount(760m) fallback.
- `autoComputePriorGiftTax`는 taxBase(160m) 내부 계산하나 미저장.
- **수정**: 상속세 모드 사전증여 자동계산 시 `giftTaxBase = giftAmount − §53 관계공제`도 저장 (single-source). 또는 spouseGiftTaxBase fallback을 `(giftAmount − calcRelationDeduction)`로.

### 자동화 ④ 금융재산공제 자동 (§22)
- 자산 카드(예금·상장주식·보험 등) 순금융재산 자동 산출 → `netFinancialAssets` 미입력 시 자동 사용.
- 기존 `suggestNetFinancialAssets(estateItems, debtItems)` 재사용. §22② 최대주주 제외 반영.
- mirror 패턴: UI 표시(미입력 시 자동값) + buildInput API fallback (store 불변, single-source).

### 자동화 ⑤ 상속외자 유증 자동 (legateeAmountNonHeir)
- 수유자(legatee)·비상속인 협의분할 배분액 자동 합산 → `legateeAmountNonHeir`.
- 기존 `suggestLegateeAmountNonHeir(estateItems, heirs)` 재사용.
- mirror 패턴 (미입력 시 자동).

### 자동화 ⑥ 배우자 실제 상속액 자동 (§19, 집행기준 19-17-1)
- 협의분할 배우자 배분 자산 − 배우자 승계 채무 − 비과세 → `spouseActualAmount` 미입력 시 자동.
- `suggestSpouseActualAmount` **채무 차감 추가**(현재 자산만 3,300m → 2,800m) + 간주상속 포함 + buildInput 자동 사용.
- mirror 패턴.

### + 인터뷰 I-1·I-2 (법정상속분 산식)
- 2-D 정밀 산식 단일화 (조건 제거).
- 2-E `computeSpouseRatio(heirs)` 공동상속인 전체 (직계비속 우선).

> ⚠️ **자동 fallback 정책**([[feedback_no_silent_apportion_fallback]]): 일반적으로 미입력=검증오류이나, 본 건은 **사용자 명시 요청(자동 계산)** + 자산·협의분할이라는 **명확한 산출 근거 존재** + 사용자 수정 가능(mirror) → 자동 도출 허용. 안분 fallback과 구분.

---

## 2-검토. 13단계 자가검토 — S1 검토 → S2~S4 정정 (2026-05-31)

### S1 검토 ① 발견 (5카테고리)
- F1 §23의2 **100% KoreanLaw 확정**(mst 276123) + 2020.1.1. historical (High)
- F2 §23의2① **담보채무 차감 후 가액** ×100% — 코드 누락 (High)
- F3 버그③ 자동 시 **미성년 자녀 §53 2천만** 판정 (Med)
- F4 자동④ **§22② 최대주주 제외**(이미지37 메모) suggestNet 반영 확인 (High)
- F5 자동화 **mirror 3중**(display·API·validate) 구체화 (High)
- F6 AN-3 cohabit 입력값(600m/800m capped 6억) (Med)
- F7 자동⑥ 배우자 실제상속액 **사전증여·추정 제외**(19-17-1) (High)
- F8 validate **자동값 인식**(UI통과↔validate차단 방지) (High)
- F9 preferLumpSum **INITIAL_FORM 실측** (High)
- F10 동거주택 자동화 범위 (Med)

### S2~S4 정정 반영
1. **버그②**(F1·F2): `COHABIT_SHARE_RATE` 100%(deathDate≥2020-01-01)/80%(이전) historical + 동거주택 기준가액 **담보채무 차감**(cohabitHouseStdPrice 모드).
2. **버그③**(F3): autoComputePriorGiftTax doneeRelation 미성년 자녀(child+미성년→`lineal_descendant_minor` 2천만). 단 사용자 케이스 성년 → 영향 0.
3. **자동④**(F4): `suggestNetFinancialAssets`가 §22② 최대주주 보유주식 제외하는지 확인. 이미지37 "최대주주 1건 500m 제외" 정합.
4. **mirror 3중**(F5·F8): 자동 도출 필드(netFinancial·legatee·spouseActual·giftTaxBase)는 ①UI 표시(미입력 시 자동값) ②buildInput API fallback ③validate 자동값>0 통과. **영리법인 cgct fallback 패턴 재사용**.
5. **자동⑥**(F7): 배우자 실제상속액 = 협의분할 배우자 배분 자산 − 배우자 담보채무. **사전증여·추정 제외**(19-17-1).
6. **버그①**(F9): `INITIAL_FORM.preferLumpSum` 실측 → 기본값 자동 max(undefined/true).

### S3 재검토 ② → S4 정정
- **R1**: 자동⑥ 비과세 차감 — estateItem 비과세 식별 복잡 → 1차 협의분할 자산−담보채무만(현 케이스 비과세 0), 비과세 후속.
- **R2**: 동거 historical — `deathDate < "2020-01-01"` 분기. 인라인 상수.
- **R3**: validate — `applyCorporateGiftTaxFallback` 패턴처럼 buildInput 자동 도출 후 검증.
- **R4 ★**: **사용자 명시 0 vs 미입력 구분** — `parseAmount("")=parseAmount("0")=0`이라 `|| auto` 쓰면 "0" 입력해도 자동 덮어씀. **`form.field === "" ? auto : parseAmount(form.field)`**(빈 문자열일 때만 자동). string 원형 유지.

---

## 3. anchor 계획 (Pre-Do, 교재 4,600m 단일화)
- **AN-1**: 사용자 시나리오 입력(spouseActual 미입력 + legatee 미입력 + giftTaxBase 미입력 + 금융 미입력 + 협의분할) → **totalDeduction 4,600m** (현재 3,987m RED).
- **AN-2(버그①)**: preferLumpSum 기본 → 일괄 500m.
- **AN-3(버그②)**: cohabitHouseStdPrice 600m → 600m (100%). 현재 480m RED.
- **AN-4(버그③)**: 배우자 사전증여 760m(giftTaxBase 미입력) → spouseGiftTaxBase 160m.
- **AN-5(자동④)**: 자산 순금융재산 자동 → 금융공제 200m.
- **AN-6(자동⑤)**: 수유자 협의분할 500m → legateeNonHeir 500m.
- **AN-7(자동⑥)**: 협의분할 배우자 자산−채무 → spouseActual 2,800m → 배우자공제 2,800m.
- **AN-8(회귀)**: 기존 EXAMPLE(명시 입력) → 4,600m 유지.

## 4. 14지점 (잠정)
| 지점 | 변경 |
|---|---|
| ① 폼 | preferLumpSum 기본값 |
| ④ API/buildInput | netFinancial·legatee·spouseActual·giftTaxBase 자동 도출 |
| ⑤ UI | 자동값 표시(미입력 시) + suggestSpouse 채무차감 |
| ⑦ 결과 | 동거 100%·배우자공제 산식·금융 자동 |
| 엔진 | COHABIT_SHARE_RATE·computeSpouseRatio·정밀산식 단일화·spouseGiftTaxBase |
| ⑧ validate | 자동 도출 필드는 검증 차단 완화 |

## 5. 검증 기준
- [ ] KoreanLaw §23의2 100%·시행일 확정
- [ ] AN-1~8 GREEN (4,600m 단일화)
- [ ] tsc 0 / 전체 npm test 회귀 0
- [ ] E2E: 자산·협의분할 입력만으로 4,600m
- [ ] 자동 도출 single-source (suggest 헬퍼 ↔ buildInput 동일)

## 6. Do 순서
1. KoreanLaw §23의2 검증 → AN-1~8 작성(RED)
2. 버그 ①②③ (preferLumpSum·COHABIT_SHARE_RATE·spouseGiftTaxBase)
3. 인터뷰 I-1·I-2 (정밀산식 단일화·computeSpouseRatio)
4. 자동화 ④⑤⑥ (suggest 헬퍼 + buildInput fallback, mirror)
5. tsc + 회귀 + E2E
6. 커밋·푸시
