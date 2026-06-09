# 엔진 설계 — 비영리법인 협의분할 과세 (per-heir corporate 게이팅)

> 계획서: `docs/01-plan/inheritance-heir-allocation-nonprofit-default-layout.plan.md`
> 성격: per-heir 배부에서 `corporate` 분기를 `isForProfit`으로 게이팅 → 비영리법인을 수유자처럼 과세. **input/result 타입 무변경**(기존 `Heir.isForProfit` 활용).

## 1. 목표 / 비목표

**목표**: `inheritance-allocation.ts`가 모든 `relation === "corporate"`를 영리법인(finalTax=0)으로 취급하는 것을 정정. **영리법인(isForProfit≠false)만** 면제 분기로, **비영리법인(isForProfit===false)은 자연인(수유자) 분기**로 정상 과세. UI·엔진 공용 `isForProfitCorporate` 단일 진실.

**비목표**: §3의2② 영리법인 면제 산식·perCorporate 배부·corporateGiftTaxBase 변경, §16 불산입, 법정상속분·세대생략·인적공제·가업상속의 corporate 제외(비영리법인 무관).

## 2. 케이스 인벤토리

| # | 상속인 | `relation` | `isForProfit` | `isForProfitCorporate` | per-heir 분기 | finalTax |
|---|---|---|---|---|---|---|
| E1 | 배우자/자녀 | spouse/child | — | false | 자연인(:520+) | 정상 |
| E2 | 수유자 | legatee | — | false | 자연인 | 정상(세대생략 할증 가능) |
| E3 | **비영리법인** | corporate | **false** | **false** | **자연인(정정)** | **정상 과세(정정)** |
| E4 | 영리법인 | corporate | undefined | **true** | 면제(:487) | 0(불변) |
| E5 | 영리법인 | corporate | true | **true** | 면제(:487) | 0(불변) |

> E3가 본 수정의 핵심. E4·E5는 회귀 가드(불변).

## 3. 시그니처 (신규 — 타입 변경 없음)

```ts
// lib/tax-engine/inheritance-gift-common.ts (Heir 이미 import: :19)
/**
 * 영리법인 수유자 판정 — relation === "corporate" AND isForProfit !== false.
 * 비영리법인(isForProfit === false)은 false → 협의분할 대상·수유자 과세.
 * 단일 진실: UI(HeirAllocationInput)·엔진(inheritance-allocation) 공용.
 * 기준: HeirComposition.tsx:486 `checked={isForProfit !== false}`(영리 기본 ON)과 동일.
 */
export function isForProfitCorporate(
  h: Pick<Heir, "relation" | "isForProfit">,
): boolean {
  return h.relation === "corporate" && h.isForProfit !== false;
}
```

## 4. 알고리즘 — allocation.ts 4-point 게이팅

```diff
// (1) :466 직접배부 과세표준 집계
- if (heir.relation === "corporate") continue;
+ if (isForProfitCorporate(heir)) continue;   // 비영리법인은 집계 포함

// (2) :483 영리/자연인 분기 판정
- const isCorporate = heir.relation === "corporate";
+ const isCorporate = isForProfitCorporate(heir);   // 비영리법인 → 자연인 분기

// (3) :626 floor 잔액 흡수자 후보 (비-영리법인)
- const nonCorp = heirs.filter((h) => h.relation !== "corporate" && perHeir[h.id]);
+ const nonCorp = heirs.filter((h) => !isForProfitCorporate(h) && perHeir[h.id]);

// (4) :664 categoryBreakdown·grossInheritance 후입력
- if (heir.relation === "corporate") continue;
+ if (isForProfitCorporate(heir)) continue;   // 비영리법인 후입력 포함
```

### 4.1 데이터 흐름 (비영리법인 E3)
1. `resolveAllocationsByHeir`(:161): 자산 `heirAllocations`에 비영리법인 heirId 포함 → `estateByHeir.get(비영리id)` = 배정액(기존, heirId 무관 집계).
2. (1) ungate → `totalHeirDirectTaxBase`에 비영리법인 사전증여 과세표준 포함(통상 0 — 비영리법인 사전증여 드묾).
3. (2) ungate → 자연인 분기(:520+)에서 `directEstateAmount = estateByHeir.get(비영리id)` 읽어 `taxableValueShare` 산정 → 간접배부·산출세액·finalTax 정상 계산.
4. (3) ungate → 비영리법인도 floor 잔액 흡수자 후보(과세되므로 일관).
5. (4) ungate → `categoryBreakdownByHeir`(전체 heir 대상 **:374-375 초기화** 실측·자산 loop 집계)에서 비영리법인 bucket을 perHeir에 후입력. ★실측: `HeirTaxBreakdown.categoryBreakdown?`(types :56)·`grossInheritance?`(:63) **optional** → 618~664 사이 undefined 접근 없음(:626 흡수 블록은 두 필드 미접근) → NPE 없음.

### 4.2 총액 보존 (정밀도)
- `indirectNumerator = taxBase − totalHeirDirectTaxBase − corporateGiftTaxBase`. 비영리법인 직접분이 (1)로 `totalHeirDirectTaxBase`에 들어가면 분자에서 차감 → 비영리법인 직접배부는 직접분으로, 나머지는 간접배부. 일관.
- `:626` 잔액 흡수: nonCorp에 비영리법인 포함 → Σindirect==indirectNumerator, Σcomputed==distributableTax 보존([[feedback_floor_residual_absorption]]). 흡수자=최다 taxBaseShare 비-영리법인(비영리법인도 후보).
- BigInt round-div(:536) 경로 불변.

## 5. 그 외 corporate 분기 — 무변경 근거 (회귀 방지)

| 위치 | 유지 사유 |
|---|---|
| `inheritance-legal-share.ts:37` | 법정상속분은 민법상 자연인만 — 법인(영리·비영리)은 법정상속인 아님. 비영리법인은 유증(협의분할 직접 배정)만 받음. 전체 corporate 제외 유지 |
| `inheritance-generation-skip.ts:108` | 법인은 세대 개념 없음 → 세대생략 할증 비대상(영리·비영리 무관) |
| `inheritance-tax.ts:643` | `corporateId && relation==="corporate"` — 영리법인 perCorporate 배부 **입력** 매칭. 비영리법인은 이 입력 경로 미진입(corporateGift 필드 없음) |
| `deductions/inheritance-deductions.ts:457` · `personal-deduction-calc.ts:341` | 인적공제(§20)는 자연인 상속인 전용(legatee·corporate 제외) |
| `deductions/family-business-autoderive.ts:198,211` | 가업상속 자동선택 자연인 전용 |

> ★ 전체 corporate 제외가 **맞는** 5곳은 그대로 두고, per-heir 과세 배부(allocation.ts) 4곳만 게이팅. 혼동 금지.

### 5.1 Out of scope 경계 — 비영리법인 사전증여 (pre-existing)
실측: `inheritance-tax.ts:593` `corporateGifts = preGifts.filter(g => g.beneficiaryType === "corporate" ...)` — **PriorGift `beneficiaryType` 기준(영리/비영리 미구분)**. 따라서 비영리법인이 **사전증여**를 받으면 그 가액이 `corporateGiftTaxBase`(§3의2② 면제 분모·indirectNumerator :471 차감)에 포함되어 영리법인처럼 처리됨.
- 이는 **사전증여 도메인의 pre-existing 모델링 한계**(PriorGift에 영리/비영리 구분 필드 없음)로, **본 task(협의분할 estate 유증 배정)와 독립**.
- 본 변경(allocation.ts per-heir 게이팅)은 비영리법인이 **estate 유증**을 받는 경로만 정정. 사전증여 경로는 미변경(별도 과제).
- → 본 task에서 비영리법인 시나리오는 **estate 유증(협의분할 배정) 단독**으로 anchor(P-1). 사전증여 동시 보유 케이스는 OOS 명시.

## 6. Pre-Do probe (Do 전 실측 — 강제)

- **P-1 (RED→GREEN)**: 비영리법인(corporate, isForProfit=false) 1 + 자녀 1, 자산 협의분할에 비영리법인 배정.
  - 수정 **전**: `perHeir[비영리id].finalTax === 0`(버그) 확인.
  - 수정 **후**: `perHeir[비영리id].finalTax > 0`(수유자 과세). `directEstateAmount === 배정액`.
- **P-2 (회귀)**: 영리법인(isForProfit=undefined/true) 동일 시나리오 → 수정 후에도 `finalTax === 0`, `priorGiftCreditLimit`(⑩b) echo 불변.
- **P-3 (총액 보존)**: Σ perHeir.finalTax(비영리 포함) + 영리법인 면제 = 총 산출세액 정합. `:626` 흡수 후 Σindirect 정확.
- **P-4 (categoryBreakdown)**: 비영리법인 `perHeir[id].categoryBreakdown` 비-empty·`grossInheritance > 0`(664 ungate 효과).

## 7. 테스트 anchor

신규 `__tests__/tax-engine/inheritance/nonprofit-heir-allocation.test.ts`:
- A-1 `isForProfitCorporate`: 영리(true)/비영리(false)/자연인(false)/legatee(false).
- A-2 (P-1): 비영리법인 협의분할 배정 → `finalTax > 0` + `directEstateAmount === 배정액`(원단위 anchor 고정).
- A-3 (P-2): 영리법인 → `finalTax === 0` 불변.
- A-4 (P-3): 총액 보존 Σ 정합.
- A-5 (P-4): 비영리법인 categoryBreakdown·grossInheritance 정상.

회귀: 기존 `inheritance-allocation*.test.ts`(영리법인 면제·잔액 흡수 anchor) 전부 통과 — 비-corporate·영리법인 케이스는 게이팅 전후 동일값.

> **결과뷰 forward-ref (→ UI 설계 STEP)**: `EstateAllocationTable` 등 per-heir 결과 컴포넌트는 corporate/isForProfit 필터가 **없음**(실측 grep). 비영리법인이 perHeir에 자연인 행으로 들어가면 결과표에 정상 행으로 렌더될 것으로 보이나, **렌더·라벨(법인 칩) 확정은 UI 설계 문서에서 검증**. 사이드바 `estimatedTax`(computeInheritanceSummary:187 Σ perHeir.finalTax)는 비영리법인 finalTax를 자동 포함(정정 효과 — 이전 0/오분산).

## 8. DoD
- [x] `isForProfitCorporate` 단일 진실(공용 import — UI·엔진).
- [x] allocation.ts 4곳 게이팅(:466 :483 :626 :664), 그 외 5곳 무변경.
- [x] P-1~P-4 실측(비영리 finalTax>0·영리 0 불변·총액 보존).
- [x] 신규 anchor + 기존 allocation 회귀 통과 + 전체 `npm test`.

## 9. ✅ 구현 결과 (2026-06-09)

**Pre-Do probe**: 비영리법인 협의분할 배정 시
- **RED(수정 전)**: `np.finalTax=0`·`directEstate=0`·`taxBaseShare=0`, 자녀 finalTax=620,800,000(비영리 몫 오분산).
- **GREEN(수정 후)**: `np.finalTax=310,400,000`·`directEstate=1,000,000,000`·`taxBaseShare=1,000,000,000`, 자녀=310,400,000. **Σ=620,800,000 총액 보존**(영리법인 단독 케이스와 동일).

**구현 파일**:
- `inheritance-gift-common.ts`: `isForProfitCorporate` 신설.
- `inheritance-allocation.ts`: import + 4곳 게이팅(466·483·626·664).

**검증**: 엔진 anchor `nonprofit-heir-allocation.test.ts` **A-1~A-5 통과**. 전체 vitest **6,832 passed/0 failed**. E2E 관련 6/6(영리법인 면제 경로 불변 포함). `tsc` 0·`lint` 0.
