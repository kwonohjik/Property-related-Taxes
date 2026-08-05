# 주식 양도세 — 지분율 입력 모드 확장 (직접 입력 + 주식수 계산)

> **세목**: 주식 양도소득세 (stock-transfer)
> **대상**: 대주주 판정 (Step 3 / §157 · §167의8①2호)
> **트리거**: 사용자 요청 (2026-05-18) — 총발행주식수·본인보유주식수 입력으로 지분율 자동 산출
> **상태**: ✅ **구현 완료** (커밋 2a4cfc9c · 2026-05-18) — 2026-08-04 코드 실측 · 2026-08-05 인용 PR·커밋 재검증(종전 헤더는 stale이었음).
> ~~종전 표기: Plan~~
> **참조 컴포넌트**: `components/calc/stock-transfer/MajorShareholderBlock.tsx`

## 1. 배경 / 목적

현행 `MajorShareholderBlock`은 `selfShareRatio` / `combinedShareRatio`를 **% 단위 숫자 직접 입력**으로만 받는다. 그러나 실무에서 사용자는 두 가지 형태로 정보를 가지고 있다:

1. **지분율 (%) 직접 알고 있음** — 회계법인·세무사 자료, 사업보고서 인용
2. **주식수만 알고 있음** — 잔고증명서·예탁원 명세서. 총발행주식수와 본인 보유 주식수로 비율 산출 필요

(2) 케이스에서 사용자는 별도 계산기로 `보유수 ÷ 발행수 × 100`을 계산해 옮겨 입력해야 했다. 본 PR은 **두 입력 모드를 한 카드 안에 공존**시킨다.

## 2. 요구사항

### 2-1. 기능 요구

- **모드 토글 추가 (RadioCardGroup)**:
  - `direct` — 현재처럼 % 직접 입력 (기본값)
  - `shares` — 총발행주식수 + 본인보유주식수 입력 → 지분율 자동 계산
- 두 모드 모두 **본인 단독 지분율** + **최대주주그룹 합산 지분율** 양쪽에 적용 가능해야 한다.
- 모드 전환 시 다른 모드의 값은 **유지** (사용자가 다시 전환해도 데이터 손실 없음).
- 계산된 지분율은 **읽기 전용 표시** + 실제 `selfShareRatio` / `combinedShareRatio` store 필드에 onChange로 즉시 반영.
- 소수점 4자리까지 표시 (예: 1,234주 ÷ 100,000주 = 1.234%). 정규화는 기존 `parseDecimal`을 그대로 사용.

### 2-2. 비요구

- 단주(端株) 처리·우선주/보통주 구분·자기주식 차감 등 복잡한 분류는 **이번 PR 범위 아님**. 사용자가 가지고 있는 두 숫자(분자·분모)만 받는다.
- 엔진(`lib/tax-engine/stock-transfer/`) 변경 **없음** — UI 표시 계층에서만 처리. 엔진은 기존대로 `selfShareRatio` decimal 한 필드만 받는다.

## 3. 정책 선검토

| 정책 메모리 | 적용 여부 | 대응 |
|---|---|---|
| `feedback_useeffect_store_mirror_forbidden` | ✅ | useEffect 미러링 금지. **onChange 시점에 직접 산출** 후 patch에 함께 담아 호출 (기존 `handleAutoSyncChange` 패턴과 동일) |
| `feedback_store_default_vs_ui_display_fallback` | ✅ | 신규 필드 4종은 factory default `""` + normalize 빈문자 처리 + UI display fallback 없음. 단일 source of truth |
| `feedback_ui_engine_dual_truth_avoidance` | ✅ | 지분율 산식(`보유수 / 발행수`)은 UI 한정. 엔진과 중복 매트릭스 없음 |
| `feedback_api_zod_schema_sync` (14지점) | ✅ | 신규 필드는 **API/Zod 전달 대상 아님** (UI 보조 입력값). store ①②③ + UI ⑤만 동기화. ④⑨⑩⑫⑬⑭ 제외 |
| `feedback_no_silent_apportion_fallback` | ✅ | 미입력 시 자동 0 채움 금지. 분모(`totalShares`) 0 또는 빈값이면 계산 결과 미표시 + 기존 `selfShareRatio` 값 유지 |

## 4. 신규 폼 필드 (store ① ② ③)

### 4-0. ⚠️ 기존 필드 재사용 — `totalIssuedShares`

`StockTransferFormData`에는 이미 **`totalIssuedShares: string` (발행주식 총수)** 필드가 존재 (`calc-wizard-stock-store.ts:67`). 이 값은 회사의 **총 발행주식 수**로 본인 단독·합산 모두 **분모로 공유 가능**. `FaceValueBlock`/`PostListingValuationCard`/엔진 API/Validate에서 이미 사용 중 — **신설 금지·재사용**.

별도로 `shareCount`(양도 주식수, line 66)도 존재하지만 이는 **양도 수량**이지 **보유 수량**과 다름 (보유 중 일부만 양도 가능). 따라서 `selfOwnedShares`는 신설 필요.

### 4-1. 신설 4 필드 (분자 + 모드만)

```typescript
// 지분율 입력 모드 + 분자 주식수 (UI 보조 — 엔진 미전달)
selfShareRatioMode: "direct" | "shares";        // 본인 단독 모드
selfOwnedShares: string;                         // 본인 단독 보유 주식수 (분자)

combinedShareRatioMode: "direct" | "shares";    // 합산 모드
combinedOwnedShares: string;                     // 본인+특수관계인 보유 주식수 (분자)
```

- **분모**: 기존 `totalIssuedShares` 재사용 (본인·합산 공통)
- **initial** (`createInitialStockFormData`): `Mode = "direct"`, 주식수 필드 = `""`
- **normalize** (`normalizeStockFormData`): `boolField`·`strField` 대신 enum field 사용 — 잘못된 값 → `"direct"` default. legacy session storage 호환
- **persist 마이그레이션**: sessionStorage에 기존 값 있어도 신규 필드는 default로 채워짐 (호환 안전)

### 4-2. ⚠️ 기존 `selfShareRatio` 단위 위험

`selfShareRatio` 주석은 "소수점 (0.05 = 5%)" 이지만 **실사용은 % 단위** (`MajorShareholderBlock.tsx:85`에서 `* 0.01`로 정규화). 본 PR은 실사용 단위(%)를 따라 `(owned / total) * 100`을 `toFixed(4)` 문자열로 store에 기록. 부수 작업으로 store 주석 한 줄 정정 권장 (`// % 단위 (예: "3" = 3%)`).

## 5. UI 변경 (⑤)

### 5-1. 본인 단독 영역

기존 `FieldCard label="본인 단독 지분율"` 1개 → **모드 라디오 + 분기 입력 2케이스**:

```tsx
<RadioCardGroup
  label="본인 단독 지분율 입력 방식"
  value={form.selfShareRatioMode}
  options={[
    { value: "direct", label: "지분율 직접 입력", description: "% 단위" },
    { value: "shares", label: "주식수로 계산", description: "총발행 ÷ 본인보유" },
  ]}
  layout="inline"
  tone="violet"
  onChange={(v) => onChange({ selfShareRatioMode: v })}
/>

{form.selfShareRatioMode === "direct" ? (
  <FieldCard label="본인 단독 지분율" hint="% 단위 입력 (예: 1.5 = 1.5%)" unit="%">
    <DecimalInput value={form.selfShareRatio} onChange={(v) => handleAutoSyncChange({ selfShareRatio: v })} />
  </FieldCard>
) : (
  <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
    <FieldCard label="총 발행주식수" hint="해당 법인의 발행주식 총수 (주). 다른 단계에서도 함께 사용됩니다.">
      {/* 기존 totalIssuedShares 재사용 (FaceValueBlock 등과 양방향 공유) */}
      <DecimalInput value={form.totalIssuedShares} onChange={(v) => handleSharesChange("self", { totalIssuedShares: v })} />
    </FieldCard>
    <FieldCard label="본인 보유 주식수" hint="본인 단독 명의 보유 주식수 (주)">
      <DecimalInput value={form.selfOwnedShares} onChange={(v) => handleSharesChange("self", { selfOwnedShares: v })} />
    </FieldCard>
    {/* 계산 결과 박스 */}
    {selfRatioFromShares !== null && (
      <div className="rounded-md bg-violet-100/60 px-3 py-2 text-sm text-violet-900">
        산출 지분율: <strong>{selfRatioFromShares.toFixed(4)}%</strong>
        <span className="ml-1 text-xs text-violet-700">
          ({form.selfOwnedShares} / {form.totalIssuedShares} × 100)
        </span>
      </div>
    )}
  </div>
)}
```

### 5-2. 합산 모드 영역

`isLargestShareholderGroup === true` 펼침 영역 안의 `FieldCard label="합산 지분율"`도 동일 패턴으로 분기.

### 5-3. onChange 처리 — `handleSharesChange`

```typescript
const handleSharesChange = (
  scope: "self" | "combined",
  patch: Partial<StockTransferFormData>,
) => {
  // 1) 새 주식수 값 반영한 임시 form 생성
  const next = { ...form, ...patch };
  // 2) 분자/분모 모두 양수일 때만 비율 산출
  //    분모는 본인·합산 공통 totalIssuedShares (기존 필드 재사용)
  const total = parseDecimal(next.totalIssuedShares);
  const owned = parseDecimal(scope === "self" ? next.selfOwnedShares : next.combinedOwnedShares);
  let ratioStr = scope === "self" ? form.selfShareRatio : form.combinedShareRatio;
  if (total > 0 && owned >= 0) {
    const pct = (owned / total) * 100;
    ratioStr = pct.toFixed(4); // % 단위 문자열 (기존 selfShareRatio·combinedShareRatio와 동일 단위)
  }
  // 3) handleAutoSyncChange로 자동 대주주 산출까지 일괄
  const ratioPatch = scope === "self"
    ? { ...patch, selfShareRatio: ratioStr }
    : { ...patch, combinedShareRatio: ratioStr };
  handleAutoSyncChange(ratioPatch);
};
```

- **분모 0 또는 빈값**: `selfShareRatio` 변경하지 않음 (기존 값 유지) — 자동 0 fallback 금지 정책 준수
- 산출 즉시 `selfShareRatio` store 필드를 정상값으로 갱신 → 기존 자동 대주주 판정 로직(`computeAutoIsMajor`)이 그대로 동작

### 5-4. 모드 전환 시 동작

- `direct → shares`: 기존 `selfShareRatio` 값은 store에 그대로. 주식수 입력 시 자동으로 덮어씀.
- `shares → direct`: 마지막 산출된 `selfShareRatio`가 그대로 표시되어 사용자가 보정 가능.

## 6. Validation (⑧)

`lib/calc/stock-transfer-tax-validate.ts` (해당 시):
- 모드가 `shares`인데 `selfTotalShares <= 0`이면 **검증 오류** ("총 발행주식수를 입력하세요").
- 모드가 `shares`인데 `selfOwnedShares > selfTotalShares`이면 **검증 오류** ("본인 보유 주식수가 총 발행주식수를 초과합니다").
- `direct` 모드는 기존 검증 유지.

(검증 파일 미존재 시 — MajorShareholderBlock 내 inline 가이드 카드로 대체)

## 7. API / Zod (④⑨⑩⑫⑬⑭) — **변경 없음**

- 신규 4 필드는 **UI 보조 입력**으로 store에만 머무름.
- `lib/calc/stock-transfer-api.ts`는 기존대로 `selfShareRatio` decimal만 엔진에 전달.
- Zod 스키마 (route handler)도 변경 없음.
- **확인 grep**: `selfTotalShares`·`selfOwnedShares` 가 `transfer-tax-api.ts` / route / Zod에 나타나지 않아야 함.

## 8. 동기화 지점 매트릭스

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① | FormData 타입 | `lib/stores/calc-wizard-stock-store.ts` | + 6 필드 |
| ② | initial | 동상 (`INITIAL_FORM`) | + default `"direct"` / `""` |
| ③ | normalize | 동상 (`normalizeStockTransferForm`) | + nullish fallback |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api.ts` | **변경 없음** (UI 한정 — `selfShareRatio`/`combinedShareRatio`/`totalIssuedShares`는 기존 그대로 전달) |
| ⑤ | UI 위젯 | `MajorShareholderBlock.tsx` | RadioCardGroup × 2 + 분기 입력 |
| ⑥ | 사이드바 합계 | — | 해당 없음 |
| ⑦ | 결과 카드 | — | 해당 없음 (대주주 판정 결과는 기존 그대로) |
| ⑧ | Validation | `stock-transfer-validate.ts` | + 모드별 분기 |
| ⑨⑩⑫⑬⑭ | Zod / route / body | — | **변경 없음** |

## 9. 테스트

### 9-1. 단위(헬퍼) — `__tests__/components/calc/stock-transfer/share-ratio-calc.test.ts`

- 100,000주 발행 · 3,000주 보유 → `selfShareRatio = "3.0000"`
- 100,000주 발행 · 0주 보유 → `selfShareRatio = "0.0000"`
- 0주 발행 (분모 0) → 기존 값 유지 (산출 패치 없음)
- 보유 > 발행 → 산출은 수행하되 validation에서 차단

### 9-2. UI 회귀

- 기존 11건 AT-* anchor (대주주 자동 판정) — `direct` 모드 default로 그대로 통과.
- 신규 모드 전환 후 주식수 입력 → `judgment.isMajor` 동일 결과 (계산된 % 값이 동일한 판정 산출).

## 10. 작업 분해

1. **Plan 확정** (본 문서)
2. **Do — store** ①②③ 필드 6종 추가 + normalize
3. **Do — UI** `MajorShareholderBlock` RadioCardGroup × 2 + 분기 입력 + 산출 박스
4. **Do — validate** 모드별 검증 분기 (선택적)
5. **Test** 단위 테스트 4건 + 기존 AT-* 회귀
6. **Check** `ui-engine-sync-checker` (④/⑨~⑭ 미변경 확인) + `npx tsc --noEmit` + `npx vitest run`
7. **수동 브라우저 확인** — 두 모드 전환·주식수 입력·자동 대주주 판정 동기화

## 11. 위험 / 후속

- **소수점 정밀도**: 4자리(`toFixed(4)`) 고정. 사용자가 매우 정밀한 지분율(소수 6자리)을 가진 경우 잘림 발생 가능 — 필요 시 `direct` 모드 사용 안내.
- **자기주식·우선주 구분**: 본 PR 범위 외. 필요 시 후속 PR에서 분모 보정 필드 추가.
- **회귀 가드**: AT-1~AT-11 anchor가 default `selfShareRatioMode = "direct"`로 그대로 통과해야 함. legacy persist 마이그레이션 시 모드 필드 누락 → normalize에서 `"direct"` 채움 — sessionStorage 호환 테스트 1건 추가 권장.
- **`totalIssuedShares` 양방향 공유 위험**: 이 필드는 `FaceValueBlock`·`PostListingValuationCard`·`EstimatedUnlistedBlock`에서도 수정 가능. 사용자가 어디서든 갱신 시 다른 곳에도 즉시 반영됨(zustand 단일 store) — **의도된 동작**(같은 회사의 발행주식 총수는 단일값). 단, UI에 "다른 단계에서도 함께 사용됩니다" 안내 문구 hint 추가하여 사용자 혼동 방지.

## 12. 근거 / 참고

- `MajorShareholderBlock.tsx:55-256` (현행 구현)
- `feedback_useeffect_store_mirror_forbidden` — onChange 직접 패치 패턴
- `feedback_store_default_vs_ui_display_fallback` — factory default + normalize 일치
- `feedback_no_silent_apportion_fallback` — 분모 0 시 자동 채움 금지
- `RadioCardGroup` (`components/calc/inputs/RadioCardGroup.tsx`) — layout="inline" + tone="violet"
