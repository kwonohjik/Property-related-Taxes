# §98의9 수도권 밖 준공후미분양주택 — 엔진 설계

> 선행: `docs/00-pm/transfer-98-9-unsold.plan.md` (법 §98의9 + **령 §98의8** 원문·D-1'·F-4)
> 효과: 주택수 제외(`house_count_exclusion`) — **§99의4 STEP 0.9 인프라 재사용** (비과세·12억 안분·표2 3지점 주입, 중과 원본 R-D).

## 1. 파일 구조 (800줄 정책)

```
lib/tax-engine/transfer-reductions/
├── unsold-98-9.ts (신규, ~170줄)  # evaluateUnsold989 + FromReductions 라우터 (new-99-4.ts 패턴)
├── types.ts                       # Unsold989EvaluationInput·Unsold989Result 추가
├── period-check.ts                # D-1': unsold_98_9 낙관 통과
└── metadata.ts                    # isFullyImplemented: true (P3)
lib/tax-engine/transfer-tax.ts     # STEP 0.9 — 적용 1건 선택(§99의4 우선) 일반화 (⚠️ 800줄 — 초과 시 선택 로직을 unsold-98-9.ts 헬퍼로)
```

## 2. 케이스 인벤토리 (anchor 전수)

| # | 케이스 | 법령 | 기대 | 파일 | 상태 |
|---|---|---|---|---|---|
| A-1 | 적격 (2024.6.1 취득·5억·84㎡·토글 3종✓·취득순서✓) | 법 ①·령 §98의8① ✅ | isEligible·exclusion 1 | `unsold-98-9.test.ts` | ☐ |
| A-2 | 취득가 7.5억 → 불적용 / 정확히 7억 → 적용 (경계 포함) | 령 ①2호 ✅ | PRICE_EXCEEDED | 동상 | ☐ |
| A-3 | 전용 90㎡ → 불적용 / 85.00㎡ → 적용 (경계 포함) | 령 ①1호 ✅ | AREA_EXCEEDED | 동상 | ☐ |
| A-4 | 미분양 취득일 ≤ 종전주택 취득일 → 불적용 | 법 ① "취득 전 보유" ✅ | ACQUISITION_ORDER | 동상 | ☐ |
| A-5 | 시한 — 2024.1.9 / 2027.1.1 취득 → 불적용 (경계 2024.1.10·2026.12.31 적용) | 법 ① 기간 ✅ | OUT_OF_PERIOD | 동상 | ☐ |
| A-6 | 토글 미확인 3종 (수도권밖·취득시1주택·양도자자격) → 각 불적용 사유 | 법 ①1호·본문·령 ①3~5호 ✅ | 각 코드 | 동상 | ☐ |
| A-7 | 필수 입력(취득일·취득가·면적) 미입력 → 사유 (자동 fallback 금지) | — | MISSING_* | 동상 | ☐ |
| A-8 | 양도일 < 미분양 취득일 → 불적용 (법 ① "취득한 후 양도" — 재검토 발견) + §99의4 동형 1건 | 법 ① ✅ | TRANSFER_BEFORE_ACQUISITION | 동상 + `new-99-4.test.ts` | ☐ |
| B-1 | 양도 10억·2주택(미분양 적격) → 비과세 0원 + step·echo | §89①3호 ✅ | isExempt·totalTax 0 | `unsold-98-9-integration.test.ts` | ☐ |
| B-2 | 양도 15억·거주 10년·미분양 취득 2024.2.1 → 12억 안분+표2 — **산출세액 4,365,000** (§99의4 B-2 동형) | §89①3호·§95②·소령§159의4 ✅ | 원단위 toBe | 동상 | ☐ |
| B-3 | 대조군 reductions=[] → 2주택 과세·표1 | — | numeric 실증 | 동상 | ☐ |
| B-4 | §99의4 + §98의9 동시 입력(둘 다 적격) → §99의4 우선 1건·§98의9 경고 echo (F-4) | 보수 정책 | dualExclusionWarning | 동상 | ☐ |
| D-1' | period-check 낙관 통과 (기존 :200-207 재산정) | 법 ① 기준일 ✅ | inPeriod true | `reduction-period-check.test.ts` | ☐ |

## 3. 타입 (types.ts 추가)

```typescript
export interface Unsold989EvaluationInput {
  id: "unsold_98_9";
  /** 양도하는 종전주택의 취득일 (자산-수준 acquisitionDate — 취득순서 판정) */
  generalHouseAcquisitionDate: Date;
  transferDate: Date;
  /** 준공후미분양주택 취득일 — 시한(2024.1.10~2026.12.31)·취득순서 */
  unsoldHouseAcquisitionDate?: Date;
  /** 취득가액 (원) — 7억 이하 (령 §98의8①2호. 기준시가 아님) */
  unsoldHouseAcquisitionPrice?: number;
  /** 전용면적 (㎡) — 85 이하 (령 ①1호) */
  unsoldHouseExclusiveArea?: number;
  /** 수도권 밖 소재 (법 ①1호) — 사용자 확인 토글 */
  isNonCapitalRegion?: boolean;
  /** 취득 당시 1주택 보유 1세대 (법 ① 본문) — 토글 */
  wasOneHouseholdAtAcquisition?: boolean;
  /** 양도자 자격·최초계약·선착순·확인날인 (령 ①3~5호·②) — 묶음 토글 */
  meetsSellerAndContractRequirement?: boolean;
}

export type Unsold989IneligibleCode =
  | "OUT_OF_PERIOD" | "MISSING_UNSOLD_ACQ_DATE" | "MISSING_PRICE" | "MISSING_AREA"
  | "PRICE_EXCEEDED" | "AREA_EXCEEDED" | "ACQUISITION_ORDER"
  | "TRANSFER_BEFORE_ACQUISITION" // 재검토 발견: 법 ① "취득한 후 … 양도" — 양도일 ≤ 미분양 취득일 배제
  | "REGION_UNCONFIRMED" | "ONE_HOUSE_UNCONFIRMED" | "SELLER_UNCONFIRMED";

export type Unsold989Result =
  | { id: "unsold_98_9"; isEligible: false;
      ineligibleReasons: { code: Unsold989IneligibleCode; message: string; legalBasis: string }[];
      legalBasis: string; effectCategory: "house_count_exclusion" }
  | { id: "unsold_98_9"; isEligible: true;
      legalBasis: string; effectCategory: "house_count_exclusion";
      houseCountExclusion: 1;
      /** 종부세 ② 1세대1주택자 의제 — 별도 신청(9.16~9.30) 안내 (계산기 범위 외) */
      comprehensiveTaxNote: true;
      /** F-4: §99의4 동시 적격 시 §99의4 우선 적용 — isEligible(자체 요건 충족)이지만
       *  주택수 제외는 **미반영**. 카드가 "적격이나 §99의4 우선 적용으로 미적용" 표시 (ui.design §5). */
      dualExclusionWarning?: boolean;
      /** R-D: 중과 주택수 미반영 */
      surchargeNotAffected: true };
```

상수: `UNSOLD_98_9_FROM = 2024-01-10` · `UNSOLD_98_9_TO = 2026-12-31` · `PRICE_LIMIT = 700_000_000` · `AREA_LIMIT_SQM = 85`.

## 4. 알고리즘

### 4.1 evaluateUnsold989 (검증 순서)

1. 필수 입력: 취득일·취득가·전용면적 — 미입력 사유 (자동 fallback 금지).
2. 시한: `2024-01-10 ≤ unsoldHouseAcquisitionDate ≤ 2026-12-31` (D-1' — evaluator 판정).
3. 취득순서: `unsoldHouseAcquisitionDate > generalHouseAcquisitionDate`.
3'. 양도 시점: `transferDate > unsoldHouseAcquisitionDate` (법 ① "취득한 후 … 양도" — 재검토 발견. 위반 시 `TRANSFER_BEFORE_ACQUISITION`). **§99의4 evaluator도 동일 보강** (P1 동시 — 농어촌 취득 전 양도 입력이 보유 0년+추징 경고로 eligible 통과하는 갭 차단).
4. 가액: `price ≤ 7억` (경계 포함 — "이하"). 면적: `area ≤ 85` (경계 포함).
5. 토글 3종: `isNonCapitalRegion`·`wasOneHouseholdAtAcquisition`·`meetsSellerAndContractRequirement` 각 `!== true` → 사유.
6. eligible — 보유 요건·추징 없음 (§99의4와 달리 clawback 없음). `comprehensiveTaxNote: true`.

### 4.2 STEP 0.9 일반화 (transfer-tax.ts:293-307 확장)

```
new994Detail   = evaluateNew994FromReductions(...)      // 기존 불변
unsold989Detail = evaluateUnsold989FromReductions(...)  // 신규
// F-4: §99의4 우선 — 둘 다 eligible이면 §98의9는 경고만 (dualExclusionWarning)
applied = new994Detail?.isEligible ? new994Detail
        : unsold989Detail?.isEligible ? unsold989Detail : undefined
exemptionJudgeInput = applied ? { ...effectiveInput, householdHousingCount: max(count−1, 0) } : effectiveInput
steps.push — applied.id 분기 라벨: "농어촌·고향주택 …(§99의4)" / "준공후미분양주택 소유주택 제외 (§98의9)"
```
- 주입 3지점(checkExemption·LTHD·표시 산식)·중과 원본(R-D)·비과세 조기 반환 echo — **§99의4 경로 그대로** (변경 0).
- echo: `result.unsold989Detail` 신규 + 기존 `new994Detail` 불변. 둘 다 입력 시 두 카드 표시(§98의9 카드에 F-4 경고).
- ⚠️ 800줄: 현재 정확 800줄 — 선택 로직 추가분(~12줄)은 **`resolveHouseCountExclusion(reductions, ctx)` 헬퍼를 unsold-98-9.ts에** 두어 본문 증가 ≤ 4줄로 억제 (의존 방향: unsold-98-9 → new-99-4 단방향 import — 순환 없음).

## 5. 14 동기화 지점 매핑

| # | 지점 | 내용 |
|---|---|---|
| ① | AssetReductionForm | `unsold_98_9` stub → 본 필드 6종 (string·boolean) |
| ② | getReductionDefault | 날짜·금액·면적 ""·토글 false |
| ③ | migrateAsset | stub 방어 보정 — §99의4 보정 블록 옆에 별도 `if (r.type === "unsold_98_9")` 블록 신설 |
| ④ | toEngineReductions | 1분기 — 날짜 string 그대로·`parseAmount`(취득가)·`parseDecimal`(면적) |
| ⑤ | UI 위젯 | `Unsold989InputForm` + 패널 렌더 분기 1개 (unsold_housing 그룹) |
| ⑥ | 사이드바 | 영향 없음 |
| ⑦ | 결과 카드 | `Unsold989DetailCard` — 제외 산식·종부세 ② 안내·F-4 경고·R-D 안내 |
| ⑧ | validate | 취득일·취득가·면적 3종 필수. 토글 비차단 (낙관) |
| ⑨⑩ | Zod enum | `reductionSchema` 단일 정의 공용 — ⑫ 갱신만으로 커버 (§99의4 실측 동일) |
| ⑪ | 자산 취득일 | 엔진 통합부에서 `effectiveInput.acquisitionDate` 주입 (mapper는 reduction만 수신) |
| ⑫ | Zod 입력 객체 | `schema-sub.ts:365` stub → 본 필드 (날짜 `z.string().date()`·금액 `z.number()`·면적 `z.number()`) |
| ⑬ | body spread | reductions 배열 그대로 — 변경 불요 |
| ⑭ | route mapper | `unsold_98_9` Date 변환 분기 (단건+다건 공용) |

## 6. 검증

- anchor 전부 법정 산식 직접 계산 — B-2는 §99의4 B-2 동형(4,365,000 원단위).
- 기존 `reduction-period-check.test.ts:200-207` 법령 정합 재산정 (D-1').
- tsc 0 · `vitest transfer-tax/` · lint · E2E 1 spec (미분양 그룹 펼침 → 라디오 활성 → 7억·85㎡ hint, stale 서버 재시작).

## 6.5 Do 환류 (2026-06-11 — 설계 대비 deviation)

1. **transfer-tax.ts 800줄 대책 실현**: 설계 §4.2 예고대로 `buildHouseCountExclusionStep` 헬퍼를 unsold-98-9.ts에 추가 — STEP 0.9 교체 후 본문 **797줄**.
2. **UnifiedReductionPanel 800줄 분리 (설계 외)**: §98의9 분기 추가로 812줄 초과 → 순수 함수 블록(STANDALONE_LABELS·getStandaloneDefault·toggleGroupRadio·RENTAL_COMMON_DEFAULTS·getReductionDefault)을 **`UnifiedReductionPanel-defaults.ts`**(179줄)로 추출, 본체 644줄. 전부 내부 전용(외부 import 0 — 실측)이라 re-export 불요.
3. **DecimalInput `label` prop 없음**: 폼에서 별도 `<label>` 요소 사용 (tsc가 적발).
4. **검증**: anchor 15건(A 8+라우터 3 / B 4 — B-2 산출세액 4,365,000 §99의4 동형 원단위) + §99의4 A-8 동형 1건 + period-check D-1' 재산정. transfer-tax 103파일 1515 통과 · tsc 0 · lint 0 · E2E 3 spec(신규+§99의4·§97의3 회귀).

## 7. 게이트 (잔존)

| # | 내용 | 처리 |
|---|---|---|
| **F-4** | §99의4 ↔ §98의9 동시 적용 법리 | v1 §99의4 우선 1건 + `dualExclusionWarning` echo (B-4 anchor 고정). 외부 확인 후 후속 |
| R-D | 중과 §167의3 미분양 제외 여부 | §99의4와 동일 보수 — 원본 유지 + 안내 |
| 범위 외 | 종부세 ②(comprehensive-tax 연동)·령② 확인날인 자동검증 | 카드 안내만 |
