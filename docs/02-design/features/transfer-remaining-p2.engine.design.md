# P2 — §99의2 + §98의7 하이브리드 감면 엔진 설계

> 작성: 2026-06-11 · 마스터 플랜 `docs/00-pm/transfer-remaining-10-reductions.plan.md` §4 P2
> 법령: KoreanLaw 2026-06-11 원문 — 법 §98의7·§99의2 (MST 286597) / 령 §98의6·§99의2 (MST 286143)
> D-10 해소: 령 §98의6① "법 제98조의7제1항" 원문 확정. D-7' 해소: 사업주체등 = 사업주체 + 주택도시보증공사·시공자·기업구조조정부동산투자회사등·신탁업자 (령 §98의6③ — §98의7 위임도 동형).

## 1. 하이브리드 패턴 — 효과 2-경로

| 시점 | 효과 | 엔진 경로 | 농특세 |
|---|---|---|---|
| 취득일부터 5년 **이내** 양도 | 양도소득세 **100% 세액감면** | `calcReductions` 후보 push (§127⑦ max) — `evaluateHybridTaxAmountFromReductions` | 감면세액 × 20% (농특세법 §2①1호 — finalize STEP 8.7 신설) |
| 5년 **후** 양도 | 5년간 발생 양도소득금액 **전액 공제** (초과금액 없는 것) | `income-deduction-router` 합류 (STEP 4.6 차감) — §40① 준용 = `calcSignedAllocation` | 감면 전후 산출세액 차 × 20% (기존 2-pass fan-out 합류) |

- 중과 배제 (모드 1): 소령 §167의3①5호에 **§98의5부터 §98의8까지·§99의2** 열거 — 두 조문 모두 eligible 시 STEP 0.45 `isTaxSpecialExemption` 자동 주입. **5년 내(세액감면 경로)에도 배제** — 5호는 "감면되는 주택" (효과 경로 무관).
- §133 종합한도: 비대상 (plan §2-2).
- 모드 2 (주택수 제외 §98의7②·§99의2②): P5 일괄 — 본 Phase 범위 외.

## 2. 조문별 요건 (원문 확정)

### §98의7 (unsold_98_7) — 9억 이하 미분양 100%

| 요건 | 내용 | 입력 |
|---|---|---|
| 주체 | **내국인** (거주자 한정 아님 — 법①) | `isDomestic` (기본 true, UI 토글 없음 — §98의8 isResident 선례) |
| 시한 | 2012.9.24~2012.12.31 최초 매매계약(계약금 한정) 또는 그 계약에 따라 취득 | `contractDate` (UTC 상수) |
| 가액 | 취득가 9억 이하 (실거래가, 취득세·부대비용 불포함 — 령 §98의6②1호) | `acquisitionPrice` |
| 미분양 | 2012.9.24 현재 미분양 (입주자 계약일 경과 단지 + 2012.9.23까지 미계약 + 선착순 — 령①) | `isUnsoldAtCutoff` 토글 |
| 최초계약 | 사업주체등(령③ 4종 포함)과 최초 매매계약 + 계약금 | `isFirstContract` 토글 |
| 입주사실 | 매매계약일 현재 입주 사실 있는 주택 제외 (령②2호) | `isNotOccupiedAtContract` 토글 (true=입주사실 없음) |
| 재계약 | 9.23 이전 계약의 취득기간 중 해제분·본인/배우자(직계존비속·형제자매 포함) 재계약분 제외 (령②3·4호) | `isNotRecontract` 토글 |
| 면적 | **제한 없음** (9억 단일 한도) | — |
| 절차 | 매매계약서 사본 제출 (령⑤·⑧ — 법률상 적용 게이트 아님) | hint 안내만 |

### §99의2 (unsold_99_2) — 신축·미분양·1세대1주택 100%

| 요건 | 내용 | 입력 |
|---|---|---|
| 주체 | 거주자 **또는 비거주자** (검증 없음) | — |
| 시한 | 2013.4.1~2013.12.31 최초 매매계약+취득(계약금 지급 포함). 자기건설(령①8호)은 동기간 사용승인·사용검사(임시 포함) | `contractDate` / `usageApprovalDate` (자기건설) |
| 대상 유형 | 령① 신축주택등(사업주체 1·2호/주택건설사업자 3호/HUG·시공사·리츠·신탁 4~7호/자기건설 8호/오피스텔 9호) 또는 령③ 감면대상기존주택(1세대1주택자) | `houseType`: `"new_or_unsold"` \| `"self_built"` \| `"existing_one_house"` + 확인 토글 |
| 가액·면적 | 6억 이하 **이거나** 전용 85㎡ 이하 — 둘 다 초과 시만 배제 (령②1호·⑤1호 "초과하고") | `acquisitionPrice` + `exclusiveAreaSqm` (둘 다 입력 필수, OR 판정) |
| 자기건설 제외 | 정비사업조합원 관리처분 취득·멸실 재건축 제외 (령①8호 가·나목) | `isNotExcludedSelfBuilt` 토글 |
| 1세대1주택자 | 2013.4.1 현재 1세대 + 매매계약일 1주택 + 취득등기~계약 2년 이상 (일시적 2주택 2호 포함) — 령③ | `meetsOneHouseSellerRequirement` 토글 |
| 오피스텔 | 령①9호·③1호 — 취득 후 주민등록(60일 후~양도일) 또는 임대등록(60일 내) 미충족 시 제외 (령②4호·⑤3호) | `isOfficetel` + `meetsOfficetelRequirement` 토글 |
| 재계약 | 령②2·3호·⑤2호 | `isNotRecontract` 토글 |
| 확인 날인 | 법④ — 확인 날인 매매계약서 제출 "경우에만 적용" (**법률상 게이트**) | `hasConfirmationSeal` 토글 |
| 급등지역 | 법③ — 령 위임 규정 부재 실측 (plan §1) → 지정 지역 없음, 주석만 | — |

## 3. 파일 설계

### 신규 `lib/tax-engine/transfer-reductions/unsold-hybrid.ts` (~480줄)

```ts
export interface UnsoldHybridResult {
  id: "unsold_98_7" | "unsold_99_2";
  isEligible: boolean;
  ineligibleReasons: { code: string; message: string; legalBasis: string }[];
  isWithin5Years: boolean;
  /** 5년 내 = "tax_amount"(세액감면 100%) / 5년 후 = "income_deduction"(소득금액 공제) */
  effectCategory: "tax_amount" | "income_deduction";
  taxReductionRate: number;            // 1.0
  /** 5년 내 세액감면액 — calcReductions 경로에서 채움 (router 평가 시 0) */
  reductionAmount: number;
  /** 5년 후 공제액 (소득금액 한도 — "초과금액 없는 것") */
  reducibleTransferIncome: number;
  fiveYearRatio: number;
  signCase: New993SignCase;
  formulaSteps: New993FormulaStep[];
  taxReductionForRuralSurtax: number;  // finalize에서 채움 (양 경로)
  ruralSurtax: number;
  legalBasis: string;
}
evaluateUnsold987(input: Unsold987Input): UnsoldHybridResult
evaluateUnsold992(input: Unsold992Input): UnsoldHybridResult
/** calcReductions 진입점 — reductions에서 1건 find, eligible+5년내면 reductionAmount=applyRate(calculatedTax, 1.0) */
evaluateHybridTaxAmountFromReductions(reductions, ctx: { transferDate; acquisitionDate; assetContractDate?; calculatedTax }): UnsoldHybridResult | undefined
/** router 진입점 — ReductionLike 필드 → Input 매핑 (router에서 호출) */
buildUnsold987Input(r, ctx) / buildUnsold992Input(r, ctx)
```

- 공통 효과 코어 `computeHybridEffect`: `isWithin5YearsCheck` → 5년 내 `{ effectCategory: "tax_amount", reducible: 0 }` / 5년 후 `calcSignedAllocation(transferIncome, std5Y−stdAcq, stdTransfer−stdAcq)` → `Math.min(allocation, max(0, transferIncome))`.
- 시한 상수 UTC: `new Date("2012-09-24")`~`new Date("2012-12-31")` / `new Date("2013-04-01")`~`new Date("2013-12-31")`.

### income-deduction-router.ts 확장

- `IncomeDeductionId` += `"unsold_98_7" | "unsold_99_2"`. `SURCHARGE_EXCLUDED_INCOME_DEDUCTION_IDS` += 2건.
- `IncomeDeductionResolution` += `eligibleId?: IncomeDeductionId` (**효과 경로 무관 적격** — 중과 배제 판정용. 기존 3조문은 eligibleId === appliedId), `unsold987Detail?`, `unsold992Detail?`.
- 하이브리드 분기: eligible && `effectCategory === "income_deduction"` → appliedId 설정(차감). eligible && `"tax_amount"` → appliedId **미설정**(STEP 4.6 차감 없음 — 이중 혜택 차단) + eligibleId만 설정 + step은 "5년 이내 양도 — 감면세액 단계에서 100% 세액감면 적용" 안내.
- `resolveSurchargeExclusionByReduction`: `appliedId` → `eligibleId` 기준으로 변경 (기존 3조문 동작 불변).

### calcReductions (transfer-tax-reductions-calc.ts)

- rental97 패턴 동형: `evaluateHybridTaxAmountFromReductions` 호출 → eligible && tax_amount && amount>0 → candidates push `{ amount, type: id }`. detail은 `hybridTaxDetail`로 반환 (finalize에서 router detail과 병합).

### finalize (transfer-tax-finalize.ts)

- 2-pass fan-out: activePrelim 목록 += unsold987/992 (income_deduction 경로만 — appliedId 기반이라 자동).
- **STEP 8.7 신설**: `reductionTypeApplied ∈ {"unsold_98_7","unsold_99_2"}` 시 `ruralSurtaxHybrid = applyRate(cappedReductionAmount, 0.2)` + step push + totalTax 합산 + detail에 `taxReductionForRuralSurtax`/`ruralSurtax` 채움. (기존 §77 등 타 세액감면 농특세는 본 Phase 범위 외 — 현행 유지.)

### 기타

- `transfer.types.ts`: `unsold987Detail?` `unsold992Detail?` echo (798줄 — 주석 압축으로 800 내 유지).
- `metadata.ts`: 2건 `isFullyImplemented: true`. effectLabel 정정 — §99의2 "(오피스텔 포함·확인날인 필요)", §98의7 "내국인" 명시.
- `period-check.ts`: 두 조문 낙관 통과 + contractDate만 (취득일 fallback 금지 — 계약 2012·취득 2013 오차단 방지).
- stub.types: 본 필드 (접미사 `987` / `992`).

## 4. anchor 케이스 인벤토리

| # | 케이스 | 검증 |
|---|---|---|
| H7-1 | §98의7 5년 후 양도 — 100% 안분 공제 | calcSignedAllocation 분자분모 + 한도 |
| H7-2 | 9억 경계 (900,000,000 적격 / +1원 배제) | PRICE_LIMIT |
| H7-3 | 계약 시한 경계 (2012-09-24·2012-12-31 적격 / 9-23·익년 1-1 배제) | UTC 상수 |
| H7-4 | 토글 미확인 → 배제 사유 수집 | 령②2호 입주사실 등 |
| H2-1 | §99의2 5년 내 — effectCategory tax_amount + reducible 0 | 이중 혜택 차단 |
| H2-2 | 6억 OR 85 — (7억·84㎡) 적격 / (5억·100㎡) 적격 / (7억·86㎡) 배제 | OR 판정 |
| H2-3 | 1세대1주택자 주택 — 토글 미확인 배제 | 령③ |
| H2-4 | 오피스텔 — 사후요건 미충족 배제 | 령②4호 |
| H2-5 | 확인 날인 미보유 — 배제 (법④ 게이트) | 법④ |
| H2-6 | 자기건설 — 사용승인일 시한 + 조합원 제외 | 령①8호 |
| C-1 | 통합: §99의2 5년 내 → STEP 8 감면 100% + 농특세 20% + 결정세액 0 | 산출세액 전액 감면·원단위 |
| C-2 | 통합: §98의7 5년 후 → STEP 4.6 차감 + 2-pass 농특세 | 차감 경로 |
| C-3 | 통합: 다주택+조정지역 + §99의2 5년 내 적격 → 중과 배제 (eligibleId 경로) | tax_amount 모드 중과 배제 |
| R-1 | §99의3·§99·§98의8 기존 anchor 전건 무변화 | 회귀 0 |

## 5. 13단계 검토 결과 (요약)

| # | 우선순위 | 발견 | 정정 |
|---|---|---|---|
| 1 | Critical | 5년 내 하이브리드를 appliedId로 차감하면 calcReductions와 이중 혜택 | eligibleId/appliedId 분리 (§3) |
| 2 | Critical | 중과 배제를 appliedId 기준으로 두면 5년 내 하이브리드 배제 누락 | resolveSurchargeExclusion → eligibleId 기준 |
| 3 | High | §98의7 "거주자" 오기 — 법① "내국인" | isDomestic + 메타 정정 (M-3 plan) |
| 4 | High | §99의2 거주자 토글 불필요 (비거주자도 적용) | 주체 검증 제거 |
| 5 | High | §99의2 법④ 확인날인은 적용 게이트 ("경우에만 적용") — §98의7 령⑤는 비게이트 | hasConfirmationSeal 토글은 §99의2만 |
| 6 | Medium | 6억 OR 85 판정에 두 입력 모두 필요 (한쪽 미입력 시 판정 불가) | 둘 다 필수 입력 + MISSING 사유 |
| 7 | Medium | 자기건설 §99의2 계약일 부재 — 사용승인일 분기 | houseType 3분기 |
| 8 | Medium | period-check 취득일 fallback이 "계약 후 익년 취득" 적격 케이스 오차단 | contractDate만 + 낙관 통과 |
