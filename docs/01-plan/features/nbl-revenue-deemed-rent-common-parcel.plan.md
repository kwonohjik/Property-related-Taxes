# 비사업용 토지 §168의11② 수입금액 정밀화 — ③1호 간주임대료·③2호 공통수입 안분·② 후단 필지별

> 작성: 2026-06-29 · 브랜치 `feat/nbl-revenue-31-32` · 대상: 양도세 NBL 기타토지 수입금액비율
> 선행: §168의11③3호 연환산 완료(PR #419). 본 계획은 그 SCOPE_OUT 3건의 후속.

## 0. 범위 — 3개 독립 항목

| # | 항목 | 법령 | 규모 | 우선순위(권장) |
|---|---|---|---|---|
| **A** | §168의11③1호 전세·보증금 **간주임대료** 합산 | 시행령 §168의11③1호 → 부가세법 시행령 §65① → 부가세법 시행규칙 §47 | 중 | 1순위(실무 빈도↑) |
| **B** | §168의11③2호 **공통수입 안분** | 시행령 §168의11③2호 | 소~중 | 2순위 |
| **C** | §168의11② 후단 **필지별 비율** | 시행령 §168의11② 후단 | 대(구조) | **별도 사이클 보류(사용자 확정 2026-06-29)** |

**본 계획 범위 = A·B만.** C(필지별)는 자산-단위→필지-단위 구조 변경 + 면적 안분(§168의11⑤) 교차로 대규모라 별도 사이클로 보류. A·B는 상호 독립이며 §168의11③3호 연환산과도 독립이나, **간주임대료(A)·공통수입(B)은 연환산 전 "1과세기간 수입금액"에 합류**(아래 §3 결합식).

---

## 1. 법령 근거 (KoreanLaw MCP 본문 검증 2026-06-29)

### 1-A. §168의11③1호 — 간주임대료
시행령 §168의11③1호:
> "당해 토지 및 건축물·시설물 등에 관련된 사업의 1과세기간의 수입금액으로 하되, … 전세 또는 임대계약을 체결하여 전세금 또는 보증금을 받는 경우에는 **「부가가치세법 시행령」 제65조제1항에 따른 산식을 준용**하여 계산한 금액을 합산한다."

- **부가세법 시행령 §65①**(MST 283641, 시행 2026-04-01): 전세금·임대보증금 → 공급가액(간주임대료).
- **부가세법 시행규칙 §47**(MST 284995): "영 §65①의 계산식에 따른 계약기간 1년의 **정기예금 이자율은 1,000분의 31**"(= **3.1%**, 현행).
- **간주임대료 산식**: `간주임대료 = 전세금·보증금 × 과세대상기간 일수 × 정기예금이자율 ÷ 그 해 일수(365/366)`
- **연도별 율(검증 방침, 사용자 확정 2026-06-29)**: 시행규칙 §47 고시값은 개정됨 → 과세연도(당해·직전 각각)별 율 테이블 필요. **현행 31/1000(3.1%) 검증 완료**. 과거 연도값은 **Do의 데이터-테이블 작업에서 KoreanLaw 시행규칙 §47 버전별(efflaw) 조회로 실증 후 입력**(추정 금지). ⚠️ Plan 단계 amendment_track 조회는 동명 **법률 §47**(전자세금계산서 세액공제)로 해석되어 시행규칙 §47 이자율 연혁 미반환 — Do에서 버전별 MST(efYd 시행일자별)로 재조회. 미실증 연도는 테이블 미등재 + "해당 연도 율 확인 필요" 차단/경고(임의값 금지).

### 1-B. §168의11③2호 — 공통수입 안분
> "1과세기간의 수입금액이 당해토지등과 기타토지등에 공통으로 관련되어 실지귀속을 구분할 수 없는 경우:
> **당해토지등 수입금액 = 공통수입금액 × (당해 토지가액 ÷ (당해 토지가액 + 그 밖의 토지가액))**"

### 1-C. §168의11② 후단 — 필지별
> "당해 토지에서 발생한 수입금액을 토지의 필지별로 구분할 수 있는 경우에는 **필지별로 수입금액비율을 계산**한다."

---

## 2. 현황 (실측)

- `revenue-test.ts` `computeRevenueTest`: `currentRevenue`(연환산 전 raw)를 비율 분자로. 간주임대료·공통안분 **미반영**.
- `RevenueTestInput`(types.ts:348): businessType·currentRevenue·currentLandValue·businessDays·taxYear·prior*. 보증금·공통수입·기타토지가액 필드 **없음**.
- 필지: `OtherLandUsage.parcels?: NblParcel[]`(types.ts:278) 존재하나 **면적 안분(§168의11⑤)용**, revenue 필드 없음. 수입금액비율은 자산-단위 단일.
- 간주임대료율 상수 **부재**(installment-surcharge 0.031은 무관한 가산금율).

---

## 3. 설계

### 3-0. 결합식 (§168의11③ 본문 — 1호~3호 순서)
"연간수입금액"은 1호(간주 합산)·2호(공통 안분)로 **1과세기간 수입금액**을 정하고, 3호로 1년 미만이면 환산. 당해·직전 각각:

```
1과세기간 수입금액 = 직접 수입금액 + 간주임대료(③1호) + 공통수입 안분액(③2호)
연간수입금액 = 위 값을 §168의11③3호로 연환산 (영위일수 < 그해일수면)
```

**코드 변경점**: `computeRevenueTest`에서 `annualizeRevenue(rt.currentRevenue, …)` 호출 **직전에** `compositeCurrent = currentRevenue + deemedRent(current) + commonApportioned(current)`를 계산하고 `annualizeRevenue(compositeCurrent, …)`로 교체. **직전도 대칭**(`compositePrior = priorRevenue + deemedRent(prior) + commonApportioned(prior)`). 당해·직전 모두 1호·2호 합산 후 3호 환산.

### 3-A. 간주임대료 (③1호)
간주임대료는 엔진이 산정(단일 진실), §3-0 결합식의 1호 항으로 당해·직전 각각 합류.

- **신규 연도별 율 테이블**: `lib/tax-engine/data/nbl-deemed-rent-rate.ts` — `{ from: "YYYY-MM-DD", rateNum: 31, rateDen: 1000 }[]`(정수연산용 분수) + `resolveDeemedRentRate(date|taxYear)`. 현행 31/1000(시행규칙 §47). 과거값 verify 후 추가(미verify 시 현행만 + "확인 필요" 주석).
- **엔진**: `RevenueTestInput`에 `currentDeposit?`·`currentRentDays?`(과세대상기간 일수)·`priorDeposit?`·`priorRentDays?` 추가. `간주 = safeMultiplyThenDivide(보증금 × 임대일수, rateNum, 1000 × 그해일수)`. 산정 후 직접수입과 합산(§3-0) → 그 합계를 ③3호 연환산(**간주임대료도 연환산 대상**: 1호 합산 후 3호 환산).
- **율 윤년**: 부가세법 §65①은 일수 기준 — 분모 `1000 × getDaysInYear(taxYear)`로 윤년 자동(③3호와 동일 원리).
- **UI**: §168의11② violet 섹션에 (선택)보증금·임대 과세대상기간 입력 + 간주임대료 preview(공유 헬퍼).
- **결과 카드**: 간주임대료 echo(보증금·일수·적용율·산출액).

**정밀도(강제)**: 간주임대료 `보증금 × 일수 × 31` 및 공통안분 `공통수입 × 토지가액` 분자는 2^53(9.007×10¹⁵) 초과 가능(예: 공통 1억 × 토지 6억 = 6×10¹⁶). `safeMultiply`/BigInt로 분자 계산 후 정수 나눗셈 `Math.floor` (memory `feedback_safemul_decimal_apportion_precision`·`applyrate_fractional_rate_one_won_error`). 율은 분수 `31/1000`으로 정수연산(`floor(보증금×일수×31 ÷ (1000×그해일수))`).

### 3-B. 공통수입 안분 (③2호) — 당해+직전 (사용자 확정 2026-06-29)
- **엔진**: `RevenueTestInput`에 당해 `commonRevenue?`·`otherLandValue?`, **직전 `priorCommonRevenue?`·`priorOtherLandValue?`** 추가. 제공 시 각 기간:
  `commonApportioned = safeMultiplyThenDivide(commonRevenue, landValue, landValue + otherLandValue)` → 해당 기간 1과세기간 수입금액에 가산(§3-0). 당해는 `currentLandValue`, 직전은 `priorLandValue` 기준.
- **UI**: 토글 "공통수입 안분(③2호)" ON → 당해 공통수입·그 밖의 토지가액(필수쌍) + 직전 공통수입·그 밖의 토지가액(직전 합산비율 사용 시 입력, 선택). tone violet. (자동 안분 fallback 금지 — 토글 OFF면 안분 없음)
- **결과 카드**: 당해·직전 안분 산식·안분액 echo.

### 3-C. 필지별 비율 (② 후단) — 본 계획 제외(별도 사이클 보류 확정)
> 참고용 스케치만 기록. 본 계획에서 구현하지 않음(§0 확정).
- **구조 변경**: 자산-단위 단일 → 필지별. `NblParcel`에 `revenue?`·`landValue?` 추가 또는 별도 `revenueParcels?[]`. 필지별 `computeRevenueTest` 반복 → 필지별 pass(사업용/비사업용 혼재) → 면적/가액 안분 결합.
- **복잡도**: §168의11⑤ 면적 안분·부분 사업용·중과 안분과 교차 → **대규모**. 별도 사이클에서 전용 계획 수립.

---

## 4. 변경 지점 (A·B 공통 — 14 동기화, `tax-field-add`)

> 신규 폼 필드는 모두 **`nbl` 접두사**(prefix-pick 운반).
> A(8): `nblRevenueCurrentDeposit`·`nblRevenueCurrentRentDays`·`nblRevenuePriorDeposit`·`nblRevenuePriorRentDays`.
> B(5): 토글 `nblRevenueCommonApportion` + `nblRevenueCommonRevenue`·`nblRevenueOtherLandValue`(당해) + `nblRevenuePriorCommonRevenue`·`nblRevenuePriorOtherLandValue`(직전).

| # | 지점 | 파일 |
|---|---|---|
| 데이터 | 간주임대료율 테이블(A) | `lib/tax-engine/data/nbl-deemed-rent-rate.ts` (신규) + legal-codes 조문 상수 |
| 엔진 | input/result + 산정 | `non-business-land/types.ts`·`revenue-test.ts` |
| ① 폼타입 | `lib/stores/calc-wizard-asset-nbl-other.ts` |
| ② initial(2곳) | `calc-wizard-asset-nbl.ts` + `calc-wizard-asset-factory.ts` |
| ③ normalize | **불요(검증)** — factory 기본값 + 입력 컴포넌트 undefined→"" 처리. 이전 연환산 PR도 `migration.ts` 미편집·정상(실측). |
| ⑫ Zod | `lib/api/transfer-tax-schema-sub.ts` — 신규 string 8(A4+B4) + boolean 1(`nblRevenueCommonApportion: z.boolean().optional()`) (침묵 strip 방지) |
| ⑬ 운반 | prefix-pick 자동(`nbl` 접두사 확인 — boolean 토글 포함) |
| ⑭ 매퍼 | `form-mapper-helpers.ts` `buildRevenueTest` (보증금·임대일수·공통수입·기타토지가액 매핑) |
| ⑤ UI | `OtherLandDetailSection.tsx` §168의11② 섹션 |
| ⑦ 결과 | `NonBusinessLandResultCard.tsx` |
| ⑧ validation | `transfer-tax-validate-asset.ts` — **A: 필수 없음(전부 optional)**. **B: `nblRevenueCommonApportion` ON 시 당해 공통수입·그 밖의 토지가액 필수쌍**. 직전 공통쌍은 optional이나 **한쪽만 입력 시 나머지도 필수**(짝 검증). 자동 fallback 금지 |

## 5. Pre-Do anchor (A·B)

- **D1** 간주임대료 — 보증금 1,000,000,000 · 임대일수 365 · 2026(365) · 31/1000 → `floor(1e9×365×31 ÷ (1000×365)) = 31,000,000`. 직접수입 0이면 1과세기간 수입 = 31,000,000.
- **D1b** 간주 + 연환산 결합 — 보증금 1e9·임대일수 183·영위 183·2026 → 간주 `floor(1e9×183×31 ÷ (1000×365)) = 15,542,465`(원 단위 floor). 직접수입 0이면 합계 15,542,465를 영위 183일로 ③3호 환산 → `floor(15,542,465×365÷183) = 30,999,998`. **이중 floor**(간주 floor 후 환산 floor)로 31,000,000보다 2원 작음 — 정수연산 정책상 정상. 간주(임대일수)·환산(영위일수) 두 분모 독립 검증.
- **D2** 윤년 — 보증금 1e9·임대일수 366·2024(366) → `floor(1e9×366×31 ÷ (1000×366)) = 31,000,000`(연일수 약분 검증).
- **E1** 당해 공통수입 안분 — 공통 100,000,000 · 당해 토지가액 600,000,000 · 기타 400,000,000 → `safeMultiplyThenDivide(1e8, 6e8, 1e9)=60,000,000` 당해 가산. (분자 6×10¹⁶ > 2^53 → BigInt 필수)
- **E2** 직전 공통수입 안분 — 직전 공통 80,000,000 · 직전 토지가액 500,000,000 · 직전 기타 500,000,000 → `safeMultiplyThenDivide(8e7, 5e8, 1e9)=40,000,000` 직전 가산 → ② 합산비율에 반영.
- 율 테이블: `resolveDeemedRentRate("2026-..")` → 31/1000 (현행 검증값).
- 기존 revenue-test R0~R3·A1~A5 회귀 0.

## 6. 작업 순서 (A → B, C 보류)

```
1. (A) 율 테이블(현행 31/1000 + 과거 efflaw 실증) + legal-code 상수  → verify: resolveDeemedRentRate("2026..")=31/1000
2. (A) anchor D1·D1b·D2 (FAIL 확보) → 엔진 간주임대료(당해·직전)     → verify: D1·D1b·D2 통과, 회귀 0
3. (A) 폼①②(2곳)·Zod⑫·매퍼⑭·UI⑤·결과⑦                          → verify: tsc 0, raw 운반 테스트
4. (B) anchor E1·E2 → 엔진 공통안분(당해+직전) → 동기화(폼·Zod·매퍼·UI·결과·⑧validation 필수쌍) → verify: E1·E2 통과, 회귀 0
5. Check: ui-engine-sync-checker + E2E(신규 입력 노출·body nbl 신규필드)             → verify: 엔진 도달
```
> C(필지별)는 본 계획 제외 — 별도 사이클 보류(확정).

## 7. Do 진입 전 확정 필요

- [x] **C(필지별) 범위** — 별도 사이클 보류(사용자 확정 2026-06-29). 본 계획 = A·B만.
- [x] **간주임대료 연도별 율**: 과거 연도값 **검증 포함**(사용자 확정). Do 데이터-테이블 작업에서 시행규칙 §47 버전별(efflaw efYd) 실증 후 입력. 미실증 연도는 차단/경고(임의값 금지). 현행 31/1000 검증 완료.
- [x] **공통수입 안분 직전 과세기간**: **포함**(사용자 확정). 당해+직전 대칭 필드(E2 anchor).
- [x] **간주임대료 ↔ 연환산 순서**: §168의11③ 1호(간주합산)→3호(환산) 채택(§3-0). D1b 이중 floor anchor로 고정.
- [x] **공통수입 안분 UI**: 토글(기본 OFF), ON 시 필수쌍 — 자동 안분 fallback 금지 정책 준수.
