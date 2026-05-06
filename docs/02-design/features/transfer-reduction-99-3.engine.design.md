# §99의3 신축주택의 취득자에 대한 양도소득세의 과세특례 — 엔진 설계

> **상태**: Phase 2 Design (Do 진입 전)
> **선행 산출물**: `docs/00-pm/transfer-reduction-expansion.plan.md`, `docs/02-design/features/transfer-reduction-mapping-audit.md`, `docs/02-design/features/anchors/reduction-99-3-case-2023.md`
> **작성일**: 2026-05-06

## Context

조특법 §99의3은 IMF 2차 부동산 활성화를 위한 신축주택 취득자 양도세 과세특례. 2001.5.23~2003.6.30 신축주택취득기간 중 가격 급등 지역(서울·과천·5대 신도시) **외**의 자기건설 또는 주건업자 취득 신축주택에 대해, 5년 내 양도 시 취득~양도 발생 양도소득금액 100% 차감, 5년 후 양도 시 5년간 발생 양도소득금액 차감 (단, 고가주택 배제).

기존 코드의 `unsold_housing` 매핑이 §99의3을 미분양으로 잘못 분류했음 (Phase 0 매핑 감사 §2.1). Phase 1에서 타입·식별 인프라 골격만 마련했고, 본 Phase 2에서 본격 계산 엔진 + UI + anchor 테스트를 완성한다.

**1번 우선순위 사례**: 사용자 제공 PDF (양도코리아 프로그램 재현 사례 26) — 갑氏 서울 서초구 A아파트 2023.02.16 양도. PHD 환산 + §99의3 5년 안분 결합.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 5년 후 양도 + PHD(공동주택 최초고시 전 취득) + 분자/분모 양수 | §99의3 ① 본문 + §164⑤ | 양도코리아 사례 26 (`reduction-99-3-case-2023.md`) | `reduction-99-3.test.ts` | ☐ TODO |
| 2 | 5년 내 양도 + 일반 케이스 (취득~양도 발생분 100% 차감) | §99의3 ① 본문 | 합성 케이스 (PDF 산식 적용) | `reduction-99-3.test.ts` | ☐ TODO |
| 3 | 5년 후 양도 + 분자 음수 / 분모 양수 → 감면 0 | §99의3 ① 본문 + 부동산-136(2012.3.6.) 해석 | PDF 부호 표 행 2 | `reduction-99-3.test.ts` | ☐ TODO |
| 4 | 5년 후 양도 + 분자 양수 / 분모 음수 → 양도소득금액 전액 감면 | §99의3 ① 본문 + 부동산-525(2010.4.7.) 해석 | PDF 부호 표 행 3 | `reduction-99-3.test.ts` | ☐ TODO |
| 5 | 5년 후 양도 + 분자 음수 / 분모 음수 → 감면 0 | §99의3 ① 본문 + 재산 2014-2035(2014.11.20.) 해석 | PDF 부호 표 행 4 | `reduction-99-3.test.ts` | ☐ TODO |
| 6 | 적용 배제 — 가격 급등 지역(서울 등) 소재 | §99의3 ① 본문 (대통령령 지역 제외) | 합성 케이스 (서울 강남) | `reduction-99-3.test.ts` | ☐ TODO |
| 7 | 적용 배제 — 고가주택 (소득세법 §89①3호) | §99의3 ① 단서 | 합성 케이스 (분양계약일 기준 고급/고가주택 4단계 정의) | `reduction-99-3.test.ts` | ☐ TODO |
| 8 | 적용 배제 — 신축주택취득기간 외 취득 | §99의3 ① 본문 | 합성 케이스 (취득 2003-07-01) | `reduction-99-3.test.ts` | ☐ TODO |
| 9 | 적용 배제 — 비거주자 (대통령령 거주자 제외) | §99의3 ① 본문 | 합성 케이스 | `reduction-99-3.test.ts` | ☐ TODO |
| 10 | 적용 배제 — 주택건설사업자 (본인이 사업자) | §99의3 ① 본문 (괄호 안 제외) | 합성 케이스 | `reduction-99-3.test.ts` | ☐ TODO |
| 11 | 매매계약일 입주사실 있는 주택 (1호 단서) | §99의3 ① 1호 단서 | 합성 케이스 | `reduction-99-3.test.ts` | ☐ TODO |
| 12 | 1세대1주택 비과세 + §99의3 신축주택 외 주택을 2007.12.31까지 양도 → 신축을 소유주택 아닌 것으로 봄 | §99의3 ② | 합성 케이스 | `reduction-99-3.test.ts` | ☐ TODO |
| 13 | 자기건설 신축주택 (1호: 사업자 취득 / 2호: 자기건설) 분기 | §99의3 ① 1호 vs 2호 | 합성 케이스 | `reduction-99-3.test.ts` | ☐ TODO |
| 14 | 농어촌특별세 20% — 감면세액에 부가 | 농특세법 §3 + §5 | PDF 사례 26 농특세 14,124,188 | `reduction-99-3.test.ts` | ☐ TODO |

**규칙 준수**: 14행 중 사용자 제공 anchor 1행, 합성 anchor 13행. 합성은 PDF 부호 표 + 조문 단서 기반으로 산식 직접 적용한 결과를 anchor로 사용.

---

## 법령 근거

```ts
// lib/tax-engine/legal-codes/transfer.ts
TRANSFER_REDUCTION_ARTICLE.NEW_99_3 = "조특법 §99의3"
```

**원문 핵심 (사용자 제공 §99의3 ①)**:

> 거주자(주택건설사업자는 제외)가 부동산 가격 급등 지역으로서 대통령령으로 정하는 지역 **외**의 지역에 있는 다음 각 호의 신축주택을 취득하여 그 취득일부터 5년 이내에 양도하는 경우에는 그 신축주택을 취득한 날부터 양도일까지 발생한 양도소득금액을 양도소득세 과세대상소득금액에서 빼며, 해당 신축주택을 취득한 날부터 5년이 지난 후에 양도하는 경우에는 그 신축주택을 취득한 날부터 5년간 발생한 양도소득금액을 양도소득세 과세대상소득금액에서 뺀다. 다만, 해당 신축주택이 「소득세법」 §89①3호에 따라 양도소득세의 비과세대상에서 제외되는 고가 주택에 해당하는 경우에는 그러하지 아니하다.

> 1. 주택건설사업자로부터 취득한 신축주택의 경우: 2001.5.23~2003.6.30 중 매매계약 + 계약금 납부 (매매계약일 입주사실 있거나 대통령령 사유 해당 시 제외)
> 2. 자기가 건설한 신축주택의 경우: 신축주택취득기간 중 사용승인 또는 사용검사

> ② 신축주택 외의 주택을 2007.12.31까지 양도하는 경우에만 신축주택을 거주자의 소유주택으로 보지 아니한다 (소득세법 §89①3호).

---

## 핵심 산식

### 5년 내 양도

```
감면 양도소득금액 = 취득일부터 양도일까지 발생한 양도소득금액 전체
                = 양도소득금액 (전액)
```

→ 양도소득세 과세대상소득금액에서 양도소득금액 전체를 차감 → **과세표준이 사실상 0** (단, 양도소득기본공제 2.5M 적용 후 잔액).

### 5년 후 양도 — 안분 산식 (PDF 사례 26 산식 박스)

```
감면 양도소득금액 = 양도소득금액 × (5년 시점 기준시가 - 취득시 기준시가)
                              ───────────────────────────────────
                              (양도시 기준시가 - 취득시 기준시가)
```

- **5년 시점**: 취득일 + 5년 시점의 기준시가 (가장 가까운 고시일)
- **부호별 처리** (PDF 부호 표):

| 분자(=5년시점-취득시) | 분모(=양도시-취득시) | 감면소득금액 | 출처 |
|---|---|---|---|
| 양수(+) | 양수(+) | 안분비율 적용 | (본문) |
| 음수(-) | 양수(+) | **0** | 부동산-136 (2012.3.6.) |
| 양수(+) | 음수(-) | **양도소득금액 전체** | 부동산-525 (2010.4.7.) |
| 음수(-) | 음수(-) | **0** | 재산 2014-2035 (2014.11.20.) |

### 농어촌특별세

```
농특세 = 양도세 감면세액 × 20%
```

농특세법 §3 + §5. 본 사례에서는 PDF 신고서상 70,620,940 × 20% = 14,124,188.

> **주의**: 양도세 감면세액의 정의 — §99의3은 "소득금액 감면방식"이라 산출세액 단계에서 별도 감면 없음. 따라서 PDF 신고서의 "감면세액 0" + 농특세 신고서의 "소득세 감면세액 70,620,940"은 다음 산식으로 도출:
>
> ```
> 양도세 감면세액 = 감면 없을 때 산출세액 - 감면 적용 후 산출세액
> ```
>
> 즉, 양도소득금액 차감 전·후의 산출세액 차이 → 농특세 부과 기준.

---

## 엔진 input 타입

```ts
// lib/tax-engine/transfer-reductions/new-99-3.ts
export interface New993Input {
  /** 양도일 */
  transferDate: Date;
  /** 취득일 */
  acquisitionDate: Date;
  /** 분양계약일 (1호 적용 — 주건업 취득) — 시한 검증 + 고가주택 적용기준일 결정 */
  contractDate?: Date;
  /** 사용승인일 (2호 적용 — 자기건설) */
  usageApprovalDate?: Date;
  /** 양도소득금액 (산정 후) */
  transferIncome: number;
  /** 취득시 기준시가 (PHD 환산 후 값 — 호출자가 사전 처리) */
  standardPriceAtAcquisition: number;
  /** 5년 시점 기준시가 (취득일 + 5년 인접 고시일 가격) */
  standardPriceAt5Years: number;
  /** 양도시 기준시가 */
  standardPriceAtTransfer: number;
  /** 양도가액 (고가주택 판정용) */
  transferPrice: number;
  /** 분양계약일 또는 사용승인일 — 고가주택 적용기준일 (없으면 acquisitionDate fallback) */
  highValueBaseDate?: Date;
  /** 전용면적 (㎡) — 고가주택 면적 기준 적용 */
  exclusiveAreaSqm: number;
  /** 지역 — "outside_speculation"(가격 급등 외) | "speculation"(서울/과천/5대 신도시) */
  region: "outside_speculation" | "speculation";
  /** 거주자 여부 (대통령령 거주자 외 제외) */
  isResident: boolean;
  /** 본인이 주택건설사업자인 경우 적용 배제 */
  isHousingConstructionBusiness: boolean;
  /** 취득 유형 — 1호(주건업 취득) | 2호(자기건설) */
  acquisitionType: "from_builder" | "self_built";
  /** (1호만) 매매계약일 입주사실 있는 주택 — 적용 배제 */
  hasOccupancyAtContract?: boolean;
  /** 산출세액 (감면세액 산정용 — 호출자가 감면 전 산출세액 전달) */
  calculatedTaxBeforeReduction: number;
  /** 감면 적용 후 산출세액 (감면세액 = before - after, 농특세 산정용) */
  calculatedTaxAfterReduction?: number;
}
```

## 엔진 result 타입

```ts
export interface New993Result {
  isEligible: boolean;
  /** 미충족 사유 (적용 배제 시) */
  ineligibleReasons: { code: string; message: string; legalBasis: string }[];
  /** 5년 이내 양도 여부 */
  isWithin5Years: boolean;
  /** 감면 대상 양도소득금액 (= 차감액) */
  reducibleTransferIncome: number;
  /** 5년 안분 비율 (5년 후 양도 시) */
  fiveYearRatio: number;
  /** 부호 케이스 분류 */
  signCase: "all_positive" | "neg_pos" | "pos_neg" | "all_negative" | "within_5_years" | "ineligible";
  /** 산식 단계 (UI 표시용) */
  formulaSteps: { label: string; value: number; formula?: string }[];
  /** 농특세 산정 기준 — 양도세 감면세액 */
  taxReductionForRuralSurtax: number;
  /** 농특세 (감면세액 × 20%) */
  ruralSurtax: number;
  /** 법적 근거 */
  legalBasis: string;
}
```

---

## 적용 배제 우선순위

다음 순서로 검증, 미충족 발견 시 즉시 `isEligible: false`로 반환:

1. **거주자 여부**: `isResident === false` → 배제
2. **주택건설사업자 본인**: `isHousingConstructionBusiness === true` → 배제
3. **지역**: `region === "speculation"` → 배제 (가격 급등 지역)
4. **취득 시기**: 1호(`contractDate`) 또는 2호(`usageApprovalDate`) 시한 외 → 배제
5. **1호 단서**: `hasOccupancyAtContract === true` → 배제
6. **고가주택**: 분양계약일 기준 고급/고가주택 정의 충족 → 배제 (단서)
7. **모두 통과** → 5년 내/후 분기로 산식 적용

### 고가주택 적용기준일별 정의 (PDF 사례 26 표)

```ts
function isHighValueHouse(baseDate: Date, transferPrice: number, exclusiveAreaSqm: number): boolean {
  if (baseDate <= D("2002-09-30")) {
    return exclusiveAreaSqm >= 165 && transferPrice > 600_000_000;
  } else if (baseDate <= D("2002-12-31")) {
    return exclusiveAreaSqm >= 149 && transferPrice > 600_000_000;
  } else if (baseDate <= D("2008-10-05")) {
    return transferPrice > 600_000_000;  // 2003.1.1~2008.10.5: 6억 초과
  } else if (baseDate <= D("2021-12-07")) {
    return transferPrice > 900_000_000;  // 2008.10.6~2021.12.7: 9억 초과
  } else {
    return transferPrice > 1_200_000_000; // 2021.12.8~: 12억 초과
  }
}
```

> **주의**: 본 정의는 §99의3 적용에서 사용하는 고가주택 정의로, 일반 1세대1주택 12억 비과세 기준과 다를 수 있음. 분양계약일·사용승인일·취득일 중 가장 빠른 기준시점을 `baseDate`로 사용.

---

## PHD 통합 흐름 (사례 26)

본 사례는 §164⑤ 공동주택 PHD + §99의3 5년 안분 결합:

1. **PHD 환산** (기존 구현 `pre-housing-disclosure.ts`):
   - 취득시점이 최초고시일 이전 → 토지 공시지가·건물 표준시가로 환산
   - 결과: `standardPriceAtAcquisition` 산출
2. **§99의3 입력 준비**:
   - `standardPriceAtAcquisition` = PHD 환산 결과
   - `standardPriceAt5Years` = 취득일+5년 시점 인접 공시일 가격
   - `standardPriceAtTransfer` = 양도일 인접 공시일 가격
3. **§99의3 안분 산식 적용**:
   - 5년 후 양도 → 위 3개 기준시가로 안분 비율 계산
   - `reducibleTransferIncome` 산출 → 양도소득금액에서 차감

엔진 본체는 PHD를 직접 호출하지 않음 — PHD 결과를 input으로 받아 처리. 호출 흐름:

```
transfer-tax.ts (orchestrator)
  → STEP X: PHD 환산 (이미 존재)
  → STEP X+1: 양도소득금액 = 양도차익 - 장특공제
  → STEP X+2: §99의3 평가 (evaluateNew993)
    → isEligible 판정
    → reducibleTransferIncome 산출
  → STEP X+3: 차감된 양도소득금액으로 과세표준·산출세액 재계산
  → STEP X+4: 농특세 부가 (감면세액 × 20%)
```

---

## 전송 통합 — 메인 엔진 STEP 위치

기존 `transfer-tax.ts` 흐름:
- STEP 4.5: 양도소득금액 = 양도차익 - 장특공제
- STEP 5: 기본공제
- STEP 6: 과세표준
- STEP 7: 산출세액
- STEP 8: 감면세액

§99의3은 "소득금액 감면방식"이므로 STEP 4.5 직후 또는 STEP 5 직전에 차감:

```
STEP 4.5: 양도소득금액 = 415,118,683
STEP 4.6 (NEW): §99의3 5년 안분 차감 = 양도소득금액 - 179,917,278 = 235,201,405
STEP 5: 기본공제 2,500,000
STEP 6: 과세표준 = 232,701,405
STEP 7: 산출세액 = 232,701,405 × 38% = 88,426,533 (실제 PDF 검증값 확인 필요)
```

> **주의**: PDF 사례 26의 산출세액은 68,486,533이며 38% 적용. 정확한 누진세율 적용으로 검증 필요. 세율 38% 구간 (1.5억~3억) 또는 (3억~5억) 등 확인 필요.

---

## 14개 동기화 지점 사전 매핑

| # | 위치 | 작업 |
|---|------|------|
| ① 폼 상태 타입 | `lib/stores/calc-wizard-store.ts` `AssetReductionForm` | `new_99_3` 케이스 필드 추가 |
| ② initial value | 동일 파일 | `getDefaultReduction("new_99_3")` |
| ③ normalize fallback | `lib/stores/calc-wizard-migration.ts` | (필요 시) |
| ④ API 변환 | `lib/calc/transfer-tax-api.ts` | new_99_3 변환 로직 |
| ⑤ UI 입력 위젯 | `app/calc/transfer-tax/steps/Step5.tsx` | new_99_3 항목 + 서브패널 |
| ⑥ 사이드바 합계 | (해당 없음) | |
| ⑦ 결과 카드 산식 | `components/calc/results/TransferTaxResultView.tsx` | 5년 안분 산식 한국어 표시 |
| ⑧ validation | `lib/calc/transfer-tax-validate.ts` | 분양계약일 + 사용승인일 + 5년 시점 기준시가 필수 검증 |
| ⑨ Zod enum | `lib/api/transfer-tax-schema.ts` priorReductionUsage | 이미 추가됨 (Phase 1) |
| ⑩ Zod 컴패니언 | `lib/api/transfer-tax-schema-sub.ts` reductionSchema | new_99_3 스키마 본 요건 필드 추가 |
| ⑪ acquisitionDate fallback | (필요 시) | |
| ⑫ Zod 입력 객체 | `transfer-tax-schema-sub.ts` 또는 메인 | new_99_3 신규 서브객체 (있다면) |
| ⑬ callTransferTaxAPI body spread | `lib/calc/transfer-tax-api.ts` | new_99_3 서브객체 spread |
| ⑭ Route handler 엔진 매핑 | `app/api/calc/transfer/route.ts` | new_99_3 input 매핑 (Date 변환) |

---

## anchor 약속

사례 26 검증값 (`anchors/reduction-99-3-case-2023.md`):

| 검증 항목 | 값 |
|---|---|
| 양도소득금액 | 415,118,683 |
| 소득금액 감면대상 | 179,917,278 |
| 과세표준 | 232,701,405 |
| 산출세액(38%) | 68,486,533 |
| 양도세 감면세액 | 70,620,940 |
| 농특세(20%) | 14,124,188 |
| 지방소득세(3.8%) | 6,848,653 |

> **주의**: 본 사례는 PHD 환산 결과(취득시 기준시가)에 의존. PHD 엔진 통합 후 상기 값들이 도출되어야 함. PHD 단독 anchor는 기존 `project_apartment_pre_disclosure.md` 17개 anchor에서 검증 완료.

---

## 미해결 항목

1. **취득시 기준시가 PHD 환산 결과 정확값** — 기존 PHD 엔진 호출로 도출 필요. 안분 비율 0.43342 역산 → `standardPriceAtAcquisition ≈ ?`. Phase 2 구현 단계에서 PHD 엔진과 통합 호출 후 anchor 검증.
2. **세율 38% 적용 구간** — PDF 산출세액 68,486,533을 과세표준 232,701,405에 적용한 결과가 어느 누진세율 적용인지 정확 검증 필요. **(검증 완료 — 1.5억~3억 38% + 누진공제 19,940,000)**
3. **농특세 70,620,940 도출 산식** — "양도세 감면세액 = 감면 전 산출세액 - 감면 후 산출세액" 가정이 맞는지 PDF 다른 부분 또는 사용자 추가 자료로 확인. **(검증 완료 — Phase 2 라운드 1·6에서 산식 일치 확인)**

위 1번은 Phase 3+ PHD 통합 anchor에서 검증 (사용자 추가 자료 필요).

---

## 시한 판정 기준 정정 (2026-05-06 추가)

§99의3 ①항은 다음 두 시점 중 **매매계약일 (1호) 또는 사용승인일 (2호)** 을 시한 판정 기준으로 합니다:

| 호 | 기준 | 시한 |
|---|---|---|
| ①항 1호 (주건업 취득) | **매매계약일 + 계약금 납부 (`contractDate`)** | 2001.5.23~2003.6.30 |
| ①항 2호 (자기건설) | **사용승인일·사용검사일 (`usageApprovalDate`)** | 2001.5.23~2003.6.30 |

**기존 `New993Input`에 두 필드 모두 정의되어 있고 엔진 `evaluateNew993`가 `acquisitionType` 분기로 정확히 처리**합니다 (구현 완료). 단, 활성/비활성 카운터 계산 시점에는 자산-수준 `assetContractDate`가 필요합니다 (Round 9 작업).

**Round 9 후속 작업**: `transfer-reduction-unified-panel.plan.md` §12 참조 — 자산-수준 `AssetForm.assetContractDate?` 필드 추가로 펼침 카운터 정확도 향상.
