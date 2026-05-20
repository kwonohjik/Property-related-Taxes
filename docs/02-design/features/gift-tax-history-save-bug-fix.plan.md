# 증여세 이력 자동 저장 누락 버그 수정 계획

> 작성일 2026-05-20 · 작성자 Claude · 우선순위 High (데이터 손실)
> v2 (2026-05-20) — 재검토 보강: ① 참조 동일성 근거 명시 ② 상속세 finalTax 확인 ③ HistoryDetailDrawer 상세 항목까지 fix 범위 확대 ④ 폼 변경 시 useEffect 재실행 안전성 ⑤ in-flight save 실패 롤백 anchor 추가

## 1. 증상 (사용자 보고)

- "3회증여" 라벨로 증여세 계산을 **3회 연속** 수행했음에도 계산 이력 목록에 **2건만 저장**됨 (스크린샷 첨부).
- 추가 증상: 저장된 2건 모두 목록 카드의 `납부세액` 컬럼이 **"-"** 로 표시됨 (실제 finalTax가 있어야 함).

## 2. 근본 원인 분석

### Bug A — `useAutoSaveCalculation` 한 컴포넌트 생애 1회 락 (★ 데이터 손실)

**위치**: `lib/storage/use-auto-save-calculation.ts:58~80`

```ts
const savedRef = useRef(false);

useEffect(() => {
  if (!resultData) return;
  if (pendingEditId) return;
  if (savedRef.current) return;   // ← 컴포넌트 unmount 전까지 영구 락
  savedRef.current = true;
  calculationRepository.save({ ... });
}, [taxType, inputData, resultData, taxLawVersion, clientId, pendingEditId]);
```

**시나리오**:

1. 1회차 계산 → 결과 화면 진입 → `savedRef = true` → save 1건 성공
2. 사용자가 결과 화면에서 **"다시 계산하기"** / **"처음으로"** 버튼 클릭
   - `GiftTaxForm.tsx:649~651`: `onBack` / `onGoToFirst`는 `setResult(null)` + `setStep(...)` 만 수행 → **컴포넌트는 unmount되지 않음**
3. 사용자가 폼 값을 수정하고 2회차 계산 → `setResult(data.result)` → useEffect 재실행
   - `resultData`는 새 객체지만 `savedRef.current === true` → **save skip**
4. 3회차도 동일하게 skip

즉, 같은 마법사 인스턴스에서 2건 이상 계산하면 **2번째 이후가 모두 침묵 손실**된다. 사용자가 본 "3건 중 2건만 저장" 증상과 정확히 일치 — 사이에 폼 페이지 자체로 (`window.history.back()`) 빠져나가 unmount되었던 1회가 별도 저장된 것으로 추정.

**영향 범위**: 증여세뿐 아니라 동 훅을 쓰는 모든 세목(양도세 `TransferTaxCalculator.tsx`, 주식 양도세 `StockTransferTaxCalculator.tsx`도 동일 위험).

### Bug B — `extractTotalTax` 가 증여세 `finalTax` 미인식 (표시 버그)

**위치**: `app/history/HistoryClient.tsx:134~146`, `components/history/HistoryDetailDrawer.tsx:39~46`

```ts
function extractTotalTax(resultData) {
  const inner = resultData?.result;
  if (inner?.totalTax) return inner.totalTax.toLocaleString();
  // ...
  return "-";
}
```

증여세 엔진 결과(`lib/tax-engine/gift-tax.ts:246`)는 **`finalTax`** 키만 노출, `totalTax`가 없다. 또한 저장된 `resultData`는 `data.result`(API 응답의 result 필드 자체)이므로 추가로 `.result` 한 단계 더 들어가는 분기에서도 매칭 실패. 따라서 모든 증여세 이력이 `-` 로 표시.

## 3. 수정 방안

### Fix A (Bug A) — `savedRef` 키 기반 가드로 교체

`savedRef:boolean`을 "마지막으로 저장한 result 참조"로 바꿔 **결과 객체가 바뀌면 새 save를 허용**한다.

**참조 동일성이 안전한 근거** (재검토 확인):

1. `GiftTaxForm.tsx:556`의 `resultData: result ? (result as unknown as Record<string, unknown>) : null` — `as` 캐스트는 TypeScript 컴파일 타임 어노테이션 → 런타임 객체 그대로. `resultData` 참조는 `result` 상태와 동일.
2. `setResult(data.result)` — `data.result`는 매 API 응답마다 `JSON.parse()`로 새로 생성된 객체 → 새 참조 보장.
3. 폼 입력이 변경되어 `form`(=`inputData`)만 바뀌고 `result`는 그대로일 때 useEffect 재실행되지만 `resultData` 참조는 동일 → 중복 저장 차단. ✓
4. `setResult(null)` 시 useEffect 재실행 → `!resultData` 가드로 조기 return → 참조 갱신 안 됨. ✓

**구현**:

```ts
const lastSavedResultRef = useRef<Record<string, unknown> | null>(null);
// savedRef 제거

useEffect(() => {
  if (!resultData) return;
  if (pendingEditId) return;
  if (lastSavedResultRef.current === resultData) return;   // 동일 참조면 skip

  const target = resultData;
  lastSavedResultRef.current = target;                     // optimistic 갱신

  const now = new Date().toISOString();
  const title = generateTitle(taxType, inputData, now);
  calculationRepository
    .save({ taxType, title, inputData, resultData: target, taxLawVersion, linkedCalculationId: null, clientId })
    .then((id) => { setSavedId(id); if (clientId) clientRepository.touch(clientId); })
    .catch((err) => {
      // 실패 시 롤백 — 단, target이 아직 최신일 때만 (race-safe)
      if (lastSavedResultRef.current === target) lastSavedResultRef.current = null;
      setError(err instanceof Error ? err.message : "저장 실패");
    });
}, [taxType, inputData, resultData, taxLawVersion, clientId, pendingEditId]);
```

`lastSavedResultRef`는 ref이므로 deps 누락 lint 위반 없음.

**옵션 A-2 (대안)**: 호출자에서 `result === null` 진입 시 명시적 reset

훅에 `reset()` 메서드를 추가하고 각 마법사의 "다시 계산하기" 경로에서 호출. 단, 누락 위험이 있어 비권장.

### Fix B (Bug B) — `extractTotalTax`에 `finalTax` fallback 추가

```ts
function extractTotalTax(resultData) {
  const inner = resultData?.result as Record<string, unknown> | undefined;
  if (inner) {
    if (inner.isExempt) return "비과세";
    if (typeof inner.totalTax === "number") return inner.totalTax.toLocaleString();
    if (typeof inner.finalTax === "number") return inner.finalTax.toLocaleString(); // 증여세·상속세
  }
  // resultData 최상위에도 동일 fallback
  if (resultData?.isExempt) return "비과세";
  if (typeof resultData?.totalTax === "number") return resultData.totalTax.toLocaleString();
  if (typeof resultData?.finalTax === "number") return resultData.finalTax.toLocaleString();
  // agg 분기 유지
  return "-";
}
```

**상속세 동일 영향 확인** (재검토): `lib/tax-engine/inheritance-tax.ts:407` `finalTax = Math.max(...)` — 증여세와 동일하게 `finalTax`만 노출, `totalTax` 없음. 같은 fallback으로 함께 해결됨.

**HistoryDetailDrawer 보강 (Drawer 상세 항목까지 확장)**:

`components/history/HistoryDetailDrawer.tsx:65~70`의 `extractResultSummaryItems`는 양도세 키만 등록:
```ts
addNum("산출세액", "calculatedTax");
addNum("결정세액", "determinedTax");
addNum("납부세액", "totalTax");
```

증여세·상속세는 `computedTax` / `taxBase` / `finalTax` 키. taxType 분기로 추가:

```ts
if (record.taxType === "gift" || record.taxType === "inheritance") {
  addNum("산출세액", "computedTax");
  addNum("과세표준", "taxBase");
  addNum("결정세액", "finalTax");
} else {
  addNum("산출세액", "calculatedTax");
  addNum("결정세액", "determinedTax");
  addNum("납부세액", "totalTax");
}
```

(`extractResultSummaryItems` 시그니처에 `taxType` 추가 필요 — 호출부 1군데도 같이 수정.)

## 4. 변경 파일

| # | 파일 | 변경 |
|---|---|---|
| 1 | `lib/storage/use-auto-save-calculation.ts` | `savedRef:boolean` → `lastSavedResultRef:Record\|null` 교체 (Fix A) |
| 2 | `app/history/HistoryClient.tsx` | `extractTotalTax` finalTax fallback (Fix B) |
| 3 | `components/history/HistoryDetailDrawer.tsx` | `extractTotalTax` + `extractResultSummaryItems`(taxType 분기) finalTax fallback (Fix B) |
| 4 | `__tests__/storage/use-auto-save-calculation.test.tsx` (신규) | 연속 2회 calc → 2건 save anchor |
| 5 | `__tests__/app/history/extract-total-tax.test.ts` (신규 또는 기존 확장) | 증여세 finalTax 추출 anchor |

총 3 source + 2 test (5 파일).

## 5. 테스트 계획

### Anchor 1 (Fix A): 동일 인스턴스 연속 저장

```ts
it("같은 마법사 인스턴스에서 result가 2회 갱신되면 save가 2회 호출된다", async () => {
  const { rerender } = render(<TestHarness resultData={null} />);
  rerender(<TestHarness resultData={{ finalTax: 100 }} />);
  await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
  rerender(<TestHarness resultData={null} />);                   // "다시 계산하기"
  rerender(<TestHarness resultData={{ finalTax: 200 }} />);       // 2회차 결과
  await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
  rerender(<TestHarness resultData={{ finalTax: 300 }} />);       // 3회차
  await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(3));
});
```

### Anchor 2 (Fix A): 동일 result 참조 재실행 시 중복 저장 방지 (회귀 보호)

```ts
it("같은 resultData 객체로 useEffect가 재실행되어도 save는 1회만 호출", async () => {
  const result = { finalTax: 100 };
  const { rerender } = render(<TestHarness resultData={result} />);
  rerender(<TestHarness resultData={result} />);                  // 같은 참조
  await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
});
```

### Anchor 3 (Fix A): in-flight save 실패 후 재시도

```ts
it("save가 실패하면 같은 resultData로 재렌더 시 save가 재시도된다", async () => {
  saveSpy.mockRejectedValueOnce(new Error("IndexedDB full")).mockResolvedValue("id-1");
  const result = { finalTax: 100 };
  const { rerender } = render(<TestHarness resultData={result} />);
  await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));   // 실패
  // 폼 변경 트리거(=rerender) 시 ref가 null로 롤백되어 재시도됨
  rerender(<TestHarness resultData={result} inputData={{ touched: true }} />);
  await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));   // 성공
});
```

### Anchor 4 (Fix B): 증여세·상속세 finalTax 표시

```ts
// HistoryClient + HistoryDetailDrawer 양쪽 extractTotalTax
expect(extractTotalTax({ finalTax: 12_345_678 })).toBe("12,345,678");        // 증여·상속 top-level
expect(extractTotalTax({ result: { totalTax: 9_876 } })).toBe("9,876");      // 양도(중첩) 회귀
expect(extractTotalTax({ totalTax: 5_000 })).toBe("5,000");                  // 취득·재산·종부 top-level 회귀
expect(extractTotalTax({ aggregated: { totalTax: 1_000 } })).toBe("1,000");  // bundled 회귀
expect(extractTotalTax({})).toBe("-");                                        // 회귀
```

### Anchor 5 (Fix B 확장): HistoryDetailDrawer 상세 항목

```ts
const items = extractResultSummaryItems({ finalTax: 100, computedTax: 200, taxBase: 1000 }, "gift");
expect(items.find(i => i.label === "결정세액")?.value).toBe("100");
expect(items.find(i => i.label === "산출세액")?.value).toBe("200");
// 양도세 회귀
const t = extractResultSummaryItems({ result: { totalTax: 50, calculatedTax: 60 } }, "transfer");
expect(t.find(i => i.label === "납부세액")?.value).toBe("50");
```

### 수동 확인

1. 증여세 계산기 → 3회 연속 계산 (사이에 "다시 계산하기" 사용)
2. `/history` → 3건 모두 표시 + 각 카드 `납부세액: N,NNN,NNN` 표시
3. 카드 클릭 → 상세 Drawer에서도 정확한 finalTax 표시

## 6. 회귀 위험

- **Fix A 양도세·주식 양도세 영향**: 동일 훅 공유. 기존엔 unmount 의존이라 같은 마법사에서 2회차 계산 결과가 침묵 손실되던 케이스가 양도세에도 존재했을 가능성. 수정 후 **신규 저장이 추가로 발생**(의도된 동작). 회귀 anchor: 양도세 1회 계산 후 다시 계산 미수행 시 save 1회만 발생하는지 확인.
- **Fix A 수정 모드(pendingEditId)**: `editingCalculationId` sessionStorage 분기는 변경 없음. `saveAsUpdate`/`saveAsNew`는 별도 경로로 영향 0.
- **Fix B totalTax 우선 분기**: 양도·취득·재산·종부세 결과의 `totalTax`/`isExempt` 매칭은 우선순위 유지. `finalTax`는 fallback으로 추가만. `finalTax`와 `totalTax` 공존 result는 현재 엔진 매트릭스에서 없음 (배타적).
- **Fix B taxType 시그니처 변경**: `extractResultSummaryItems(resultData)` → `extractResultSummaryItems(resultData, taxType)` 호출부 1군데(`HistoryDetailDrawer.tsx` 내부)만 수정 필요.

## 7. 작업 순서 (단일 PR 권장)

1. `use-auto-save-calculation.ts` 수정 + Anchor 1·2 작성·실행
2. `HistoryClient.tsx` / `HistoryDetailDrawer.tsx` 수정 + Anchor 3
3. `npm run check:pre-pr` 통과
4. 브라우저 수동 확인 3회 시나리오
5. 메모리 `feedback_auto_save_lifetime_lock` 작성 (신규 훅 사용 시 ref-key 비교 원칙 강제)

## 8. Definition of Done

- [ ] Fix A·B 양쪽 코드 반영
- [ ] anchor 3건 PASS, 전체 회귀 0
- [ ] 브라우저 수동 3회 시나리오 통과 (저장 3건 + finalTax 표시)
- [ ] `npx tsc --noEmit` 0건
- [ ] 메모리 정책 업데이트
