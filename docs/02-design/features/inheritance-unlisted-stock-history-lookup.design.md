# 비상장주식 평가 이력 자동조회 모달 (PR-H) Design

> **Plan**: `docs/00-pm/inheritance-unlisted-stock-history-lookup.plan.md`
> **Pattern**: memory `history-lookup-modal` skill + `lib/calc/prior-gift-lookup.ts` 모범 사례
> **Date**: 2026-05-24

---

## 1. UnlistedStockCandidate 타입

```ts
export interface UnlistedStockCandidate {
  /** Source 식별자 (record.id) */
  calculationId: string;
  /** 의뢰인 ID (세무사 모드 — null = 본인) */
  clientId: string | null;

  /** ★ 매칭 키: 법인명 */
  corpName: string;
  /** 평가기준일 (ISO YYYY-MM-DD) */
  evaluationDate: string;

  /** 발행주식총수 (참고용 표시) */
  totalShares: number;
  /** 1주당 액면가 */
  faceValuePerShare: number;
  /** 1주당 평가액 (⑥) — 카드 라벨 표시 */
  finalPerShareValue: number;
  /** 총 평가액 — 카드 라벨 표시 */
  totalValuation: number;

  /** 평가 모드 (상속·증여 구분 — UI 배지) */
  sourceTaxType: "inheritance" | "gift";
  /** 저장 시각 — 정렬 동률 시 사용 */
  createdAt: string;
  /** 자동 생성 title */
  title: string;

  /** ★ 전체 입력 객체 (prefill 원본) — Partial 추출용 */
  fullInput: UnlistedStockValuationInput;
}

export type UnlistedStockLookupWarningReason =
  | "corp_missing"        // record.corpName 누락
  | "input_missing"       // unlistedStockValuationV2 미입력
  | "result_missing"      // result.totalValuation 누락
  | "excluded"            // excludeCalculationIds 포함
  | "different_client"    // 다른 의뢰인 격리
  | "different_corp";     // corpName 필터 불일치 (정보용)

export interface UnlistedStockLookupWarning {
  calculationId: string;
  reason: UnlistedStockLookupWarningReason;
  message: string;
}

export interface UnlistedStockLookupResult {
  candidates: UnlistedStockCandidate[];
  warnings: UnlistedStockLookupWarning[];
}
```

---

## 2. filterCandidates 알고리즘

```
function filterUnlistedStockCandidates(
  records: CalculationRecord[],
  currentClientId: string | null,
  currentCorpName: string | undefined,  // undefined = 전체, set = corpName 필터
  excludeCalculationIds: ReadonlyArray<string>,
): UnlistedStockLookupResult

알고리즘:
  1. record.taxType !== "inheritance" && !== "gift" → silent skip (Q6 cross 모드)
  2. excludeCalculationIds 포함 → warnings.excluded
  3. record.clientId !== currentClientId → warnings.different_client
  4. inputData.estateItems[] 또는 giftItems[]에서 unlistedStockValuationV2 입력 추출
     - 다중 비상장주식 자산 시 각각을 후보로 푸시 (1 record → N candidates)
  5. v2.corpName 누락 → warnings.corp_missing
  6. v2.totalShares·ownedShares 누락 → warnings.input_missing
  7. resultData 누락 → warnings.result_missing
  8. currentCorpName 지정 시 corpName 불일치 → warnings.different_corp (silent — UI에서 회색 섹션)
  9. 위 통과 → candidates.push

정렬: evaluationDate desc → createdAt desc
```

### 2.1 다중 자산 처리 (1 record → N candidates)

상속세 마법사는 `estateItems`에 여러 비상장주식 자산을 포함할 수 있다. 각 자산을 독립 후보로 추출:

```ts
const items = (input.estateItems || input.giftItems) as EstateItem[];
for (const item of items) {
  if (item.category !== "unlisted_stock") continue;
  if (!item.unlistedStockValuationV2) continue;
  candidates.push(extractCandidate(record, item.unlistedStockValuationV2, item.id));
}
```

calculationId는 `${record.id}-${item.id}` 합성으로 sourceCalculationId 유니크 보장.

---

## 3. candidateToInput 변환 (Q1 B안 — 법인 정보만)

```ts
export function candidateToUnlistedStockInput(
  c: UnlistedStockCandidate,
): Partial<UnlistedStockValuationInput> {
  const src = c.fullInput;
  return {
    // ✅ 법인 정보 (사용자 재평가 시에도 동일)
    corpName: src.corpName,
    representative: src.representative,
    businessStartDate: src.businessStartDate,
    faceValuePerShare: src.faceValuePerShare,
    totalShares: src.totalShares,
    isRealEstateHeavy: src.isRealEstateHeavy,
    realEstateHeavyMode: src.realEstateHeavyMode,
    totalAssetsForJudgment: src.totalAssetsForJudgment,
    realEstateAssetsForJudgment: src.realEstateAssetsForJudgment,
    netAssetOnlyReason: src.netAssetOnlyReason,
    fiscalYears: src.fiscalYears,
    capitalChanges: src.capitalChanges,
    netAssetValueRaw: src.netAssetValueRaw,
    isContinuousLossLastThreeYears: src.isContinuousLossLastThreeYears,
    capitalizationRate: src.capitalizationRate,
    goodwillRate: src.goodwillRate,
    companySize: src.companySize,

    // ❌ 평가시점·보유주식수·할증 — 사용자 입력 보존 (Q7·Q1 B안)
    // evaluationDate: undefined,
    // ownedShares: undefined,
    // isMaxShareholder: undefined,
    // section22MajorShareholderMode: undefined,
  };
}
```

**예외**: `evaluationDate`는 prefill 안 함 — 사용자가 직접 입력. 같은 법인 다른 평가기준일 평가가 흔함.

---

## 4. UI 와이어프레임

### 4.1 UnlistedStockHistoryModal

```
┌─────────────────────────────────────────────────────────┐
│ 📂 비상장주식 평가 이력 조회                              │
│ 현재 법인: ㈜A (선택 시 자동 채움 — 평가기준일·보유주식수 │
│ 는 보존됩니다)                                          │
├─────────────────────────────────────────────────────────┤
│ ▼ 동일 법인 (3건)                                        │
│   ┌───────────────────────────────────────────────────┐ │
│   │ [상속] ㈜A · 2024-01-20 평가                       │ │
│   │ 발행 50,000주 / 액면 5,000원                       │ │
│   │ 1주당 10,910원 · 총 340,392,000원                  │ │
│   │                                  [선택 →]          │ │
│   └───────────────────────────────────────────────────┘ │
│   ┌───────────────────────────────────────────────────┐ │
│   │ [증여] ㈜A · 2023-06-15 평가                       │ │
│   │ ...                                  [선택 →]      │ │
│   └───────────────────────────────────────────────────┘ │
│                                                          │
│ ▼ 다른 법인 (1건) — 접힘 (기본 닫힘)                     │
│   ㈜B · 2024-03-10 평가 ...                              │
│                                                          │
│ ⚠ 후보 없음 시: "저장된 비상장주식 평가 이력이 없습니다  │
│   사례 6 등을 먼저 계산·저장해 보세요"                   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 UnlistedStockV2Card 상단

```
┌─────────────────────────────────────────────────────────┐
│ 비상장주식 평가 V2 (별지 부표3)        [📂 이력 조회]    │
├─────────────────────────────────────────────────────────┤
│ [선택 후] 이력 출처: ㈜A 2024-01-20 평가 (sky 배지, 작게) │
│ ... 기존 입력 필드 ...                                   │
└─────────────────────────────────────────────────────────┘
```

배지는 `sourceCalculationId` 부착 시만 표시. 사용자가 corpName 등 핵심 필드 수정 시 자동 제거.

---

## 5. anchor 매트릭스 (20건)

### 5.1 필터·후보 추출 (`unlisted-stock-valuation-lookup.test.ts`)

| ID | 시나리오 | records | 기대 |
|---|---|---|---|
| H-1 | 동일 법인 1건 매칭 (상속) | corpName "㈜A" 1건 + filter "㈜A" | candidates.length === 1 |
| H-2 | 동일 + 다른 법인 혼재 | "㈜A" 2건 + "㈜B" 1건 + filter "㈜A" | candidates.length === 2 + warnings.different_corp 1건 |
| H-3 | corpName 누락 | v2.corpName === "" | warnings.corp_missing |
| H-4 | resultData 손상 | result.totalValuation 누락 | warnings.result_missing |
| H-5 | excludeCalculationIds | 1건 제외 | warnings.excluded |
| H-6 | 다른 의뢰인 격리 | record.clientId !== current | warnings.different_client |
| H-7 | 상속·증여 cross 조회 | inheritance 1건 + gift 1건 | candidates.length === 2 |
| H-8 | 빈 records | [] | candidates=[], warnings=[] |
| H-9 | 정렬 evaluationDate desc | 2023·2024·2022 | [2024·2023·2022] |

### 5.2 변환 (`candidateToUnlistedStockInput`)

| ID | 시나리오 | 검증 |
|---|---|---|
| H-10 | Q1 B안 — 법인 정보만 | corpName·businessStartDate·재무상태표 17 포함 / evaluationDate·ownedShares·isMaxShareholder undefined |
| H-11 | capitalChanges 복사 | 배열 그대로 |
| H-12 | evaluationDeltaRows (PR-N) 복사 | netAssetValueRaw.evaluationDeltaRows 그대로 |
| H-13 | netAssetOnlyReason 보존 | §54④ 사유 5종 그대로 |
| H-14 | 보험사업 3필드 (PR-M) 보존 | insuranceReservePolicy 등 |
| H-15 | Date round-trip | record JSON → Date 복원 |

### 5.3 RTL Modal·Card (`UnlistedStockHistoryModal.test.tsx`)

| ID | 시나리오 | 검증 |
|---|---|---|
| H-16 | "📂 이력 조회" 클릭 → Dialog open | `getByRole("dialog")` |
| H-17 | 후보 카드 클릭 → onSelect + close | mock 호출 + `queryByRole("dialog")` null |
| H-18 | 선택 후 sourceCalculationId 부착 | form.sourceCalculationId === candidate.calculationId |
| H-19 | corpName 수정 시 sourceCalculationId 제거 | onChange mirror-pattern |
| H-20 | evaluationDate·ownedShares 보존 (Q1 B안) | 사용자 입력 유지 |

---

## 6. 구현 순서 (TDD 1-cycle)

1. **타입·mediator skeleton** → 컴파일 통과
2. **Pre-Do anchor H-1·H-10** → 실패 확인
3. **mediator 본문 구현** → H-1·H-10 통과
4. **Modal·카드 구현** → H-16·H-17 통과
5. **Zod·타입 ① ② ⑨ 추가** → tsc 0건
6. **나머지 anchor 추가** → 20/20 통과
7. **전체 회귀** → 4,765+ PASS

---

## 7. 회귀 보호

- 기존 18 anchor `case-5a-integration.test.ts`
- 신규 15 anchor `besshi-form-full-replica.test.tsx`
- PR-I 8 anchor `pr-i-fractional-shares.test.ts`
- PriorGiftHistoryModal 기존 테스트 (격리 — 본 모달은 별도 파일)
