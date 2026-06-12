# §165⑨ 본체 — 엔진 설계 (stock-transfer-165-9-main-b4)

> 계획: `docs/00-pm/stock-transfer-165-9-main-b4.plan.md` · 기준 origin/master `a59c5675`
> 법령: 시행령 §165⑨ 본체(양도·취득 기준시가 동일) + 소칙 §81④ 1호 월할 가산. KoreanLaw 축자 2026-06-12(MST 286211·286379)
> 원칙: §99①4(비상장)만 실효(§81④ 1호 사업연도 모수) · 80% 하한 비대칭 비스코프 · dual-truth 금지(공유 헬퍼)

## 1. 케이스 인벤토리 (계획 §2 → 엔진 동작)

| # | 시장 | 양도≟취득 기준시가 | 토글(1호) | 전전연도 | 엔진 동작 | anchor |
|---|---|---|---|---|---|---|
| M-1 | 비상장 | 다름 | — | — | 현행 환산 (보정 미발동) | B4-ENGINE-1 |
| M-2 | 비상장 | 같음 | ON | 입력 | §81④ 1호 상향 → 환산비율<1 → 양(+)차익 | B4-ENGINE-2 |
| M-3 | 비상장 | 같음 | OFF | — | 보정 없음(2호) + warning · 차익 0 | B4-ENGINE-3 |
| M-4 | 비상장 | 같음 | ON | 미입력 | 엔진 방어 warning + 미적용 (validate ⑧ 차단) | (validate) |
| M-5 | 비상장 | 같음 | ON | 전전>직전 | adjusted<prior · 환산비율>1 (음수 상승률 단일 floor) | B4-ENGINE-4 |
| M-6 | 비상장 | 같음 | ON | adjusted≤0 | "환산 불가" 가드 warning + 미적용 | B4-ENGINE-5 |
| M-7 | 비상장 | 80% 하한 양도측 발동 → 최종 상이 | ON | — | 트리거 미성립 → M-1 경로 | B4-ENGINE-6 |
| M-8 | 상장 | 같음 | (무관) | — | §81④ 2호 — 결과 불변 + 정보성 warning | B4-LISTED-1 |
| M-9 | 비상장 | 무관 | OFF | — | 완전 현행 (회귀 0) | (회귀) |

## 2. 알고리즘 — §165⑨ 본체 보정 (`stock-valuation-unlisted.ts`)

`calcUnlistedValuation` weighted_avg 말미(`:430` 취득기준시가 산출 직후, `:433` 환산 직전) 주입:

```
// 입력: transferStdPricePerShare(:378-407, 80%하한 후), acquisitionStdPricePerShare(:430)
let appliedTransferStd = transferStdPricePerShare;
let section1659Detail;

const triggered =
  transferStdPricePerShare === acquisitionStdPricePerShare &&
  transferStdPricePerShare > 0;

if (triggered && input.unlistedSameBizYearToggle === true) {
  if (typeof input.prePriorYearNetIncomePerShare === "number" &&
      typeof input.prePriorYearNetAssetPerShare === "number") {
    // ★ Do 환류: 설계 초안 calcUnlistedPerShareWeighted(isHeavyRE) 대신 경로 자체의
    //   niWeight·naWeight(getValuationWeights 연혁 반영) 사용 — prior와 가중치 일관(연혁 정합).
    //   현행 연혁(2007.2.28~)은 양자 동일값. 80% 하한 미적용(환산비율 모수 관행).
    const prePrior = Math.floor(
      niWeight === 0
        ? input.prePriorYearNetAssetPerShare
        : calcWeightedAvgPerShare(
            input.prePriorYearNetIncomePerShare,
            input.prePriorYearNetAssetPerShare,
            niWeight,
            naWeight,
          ),
    );
    const m = calcAccrualMonths(input.acquisitionDate, transferDate);   // 본체: 양도일 종점
    const { adjusted } = apply81_4Accrual(
      transferStdPricePerShare, prePrior, m, input.priorBizYearMonths ?? 12,
    );
    if (adjusted > 0) {
      appliedTransferStd = adjusted;
      appliedRules.push(STOCK.ENFORCEMENT_DECREE_165_9_MAIN);
      appliedRules.push(STOCK.ENFORCEMENT_RULE_81_4_MONTHLY_ACCRUAL);
      section1659Detail = { prior: transferStdPricePerShare, prePrior, holdingMonths: m, priorBizYearMonths: input.priorBizYearMonths ?? 12, adjusted };
    } else {
      warnings.push("§81④ 보정 평가액 0 이하 — 보정 미적용");   // M-6
    }
  }
  // prePrior 미입력은 validate ⑧ 차단 — 엔진 도달 시 보정 미적용(방어)
} else if (triggered && input.unlistedSameBizYearToggle !== true) {
  warnings.push("§165⑨ — 양도·취득 기준시가 동일하나 동일 사업연도 아님(§81④ 2호) — 양도차익 0 가능");   // M-3
}

// 환산 분모 교체 (취득기준시가 = acquisitionStdPricePerShare 불변)
totalAcquisitionPrice = (appliedTransferStd > 0 && acquisitionStdPricePerShare > 0)
  ? Number(BigInt(transferPrice) * BigInt(acquisitionStdPricePerShare) / BigInt(appliedTransferStd))
  : 0;
```

### 2.1 공유 §81④ 헬퍼 추출 (`apply-81-4-accrual.ts` 신규)

post-listing 모듈 사유 헬퍼 2개를 sibling로 이동(dual-truth 제거 [[feedback_ui_engine_dual_truth_avoidance]]):

```ts
// calcAccrualMonths — :150에서 이동, 종점 일반화 (인자명 listingDate→to)
export function calcAccrualMonths(acquisitionDate: Date, to: Date): number {
  const fullMonths = differenceInMonths(to, acquisitionDate);
  const hasRemainder = addMonths(acquisitionDate, fullMonths) < to;
  return Math.max(1, fullMonths + (hasRemainder ? 1 : 0));   // 1개월 미만 절상
}

// §81④ 1호 산식 — :315-316에서 추출
export function apply81_4Accrual(
  prior: number, prePrior: number, holdingMonths: number, priorBizYearMonths: number,
): { adjusted: number } {
  const d = priorBizYearMonths > 0 ? priorBizYearMonths : 12;
  const adjusted = Math.floor((prior * d + (prior - prePrior) * holdingMonths) / d);   // 분수 단일 floor
  return { adjusted };
}
```

- post-listing(`stock-valuation-post-listing.ts`)는 두 헬퍼를 import — `calcAccrualMonths(acqDate, listingDate)` 호출 유지(준용·상장일 종점), `apply81_4Accrual`로 `:315-316` 대체. **사례 48 anchor(5,824) 불변** 확인이 추출 검증.
- 음수 상승률(M-5): `(prior - prePrior)`가 음수여도 분수 전체 단일 `Math.floor` 1회 — 방향 일관([[feedback_applyrate_fractional_rate_one_won_error]])

## 3. input/result 타입 (`types/stock-transfer.types.ts`)

### 3.1 입력 (StockTransferInput, top-level)

```ts
/** §165⑨ 본체 — 비상장 동일 사업연도 취득·양도(§81④ 1호) 수동 토글. default false(3중 패턴).
 *  PostListingDetailInput.monthlyAccrualToggle(중첩·준용)과 별개 — 본체 weighted_avg 경로 전용. */
unlistedSameBizYearToggle?: boolean;
// prePriorYearNetIncomePerShare?·prePriorYearNetAssetPerShare?·priorBizYearMonths? — 기존 :211/213/215 재사용
```

### 3.2 결과 (UnlistedValuationResult + StockValuationDetail)

```ts
// UnlistedValuationResult
section1659Applied?: boolean;
section1659Detail?: {
  prior: number;            // 동일 기준시가(= 취득기준시가)
  prePrior: number;         // 전전 사업연도 평가
  holdingMonths: number;    // 취득→양도 (절상)
  priorBizYearMonths: number;
  adjusted: number;         // 상향된 양도기준시가
};
```

`StockTransferResult["valuationDetail"]`는 named 타입 아닌 **인라인 객체**(`types:514 valuationDetail?: {`) — 그 안에 `section1659Detail?` 추가(method "weighted_avg" passthrough). 신규 입력 1(top-level bool) + 결과 1(optional detail). 기존 필드 재사용.

## 4. allocate/orchestrator 영향 (`stock-transfer-tax.ts:313-350`)

`marketType==="unlisted"` 분기 무변경(보정은 valuation 내부). `unlistedResult.section1659Applied` 시 valuationDetail에 `section1659Detail` 전달 + `appliedRules` echo. estimatedBase(`:318` = `acquisitionStdPriceTotal`) **불변** — §165⑨은 양도기준시가만 교체, 취득기준시가·개산공제 base 불변.

## 5. 상장 경로 M-8 — orchestrator 레벨 (★ STEP 6 정정)

`ListedValuationResult`는 `warnings[]` 부재(`appliedRule` 단일 string `:36`) — 2호 warning을 모듈 내부에서 surfacing 불가. 따라서 **orchestrator**(`stock-transfer-tax.ts:392-404` 상장 분기)에서 `listedResult.perShareTransferStdPrice === listedResult.perShareAcquisitionStdPrice && both>0` 비교 → `warnings.push("§165⑨ — 상장 종가평균 동일, §81④ 2호 보정 없음")`. 산식 변경 0 · listed 모듈 무변경 — M-8 anchor는 orchestrator 결과 warnings 검증.

## 6. 14 동기화 지점 (계획 §6 — 신규 토글 1)

①form ②initial(false) ③normalize ④api ⑤UI(비상장 블록 §81④ 영역) ⑥사이드바(무) ⑦결과카드(section1659Detail) ⑧validate(unlistedSameBizYearToggle 병렬 블록) ⑨Zod ⑩⑪N/A(form-global) ⑫⑬⑭grep. 상세 계획 §6.

## 7. 파일 영향

| 파일 | 작업 |
|---|---|
| `apply-81-4-accrual.ts` (신규 ~40줄) | calcAccrualMonths + apply81_4Accrual 추출 |
| `stock-valuation-post-listing.ts` | 두 헬퍼 import로 전환(사유 정의 삭제) — 회귀 0 |
| `stock-valuation-unlisted.ts` | §165⑨ 본체 분기(+~25) + result 필드 |
| `stock-valuation-listed.ts` | **무변경** (M-8은 orchestrator) |
| `stock-transfer-tax.ts` | valuationDetail passthrough(+~3) + M-8 상장 equal warning(+~3) |
| `legal-codes/stock.ts` | `ENFORCEMENT_DECREE_165_9_MAIN` 상수 추가 |
| `types/stock-transfer.types.ts` | 입력 1 + result detail |

## 8. anchor (계획 §7)

`__tests__/tax-engine/stock-transfer/section-165-9-main-b4.test.ts` — B4-ENGINE-1~6·B4-BOUNDARY-1·B4-SHARED-1·B4-LISTED-1(9). Pre-Do: 사례 48·49·weighted_avg 계열 전수 통과 고정.

## 9. 비스코프 (계획 §9)

- 상장 §81④ 1호 상향(사업연도 모수 부재 — 2호 귀속)
- 80% 하한 양측 적용 재검토(기존 비대칭 컨벤션 유지 — 회귀 위험)
- 사업연도 자동 판정(엔진 사업연도 종료일 미보유 — 토글 필수)
</content>
