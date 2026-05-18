# UI Design — 비상장 보충적 평가 직접계산 모드 (v1)

작성일: 2026-05-19
대응 계획서: `stock-transfer-unlisted-direct-calc.plan.md` v4
대응 엔진 디자인: `stock-transfer-unlisted-direct-calc.engine.design.md` v1

---

## 1. 활성 조건

`Step2.tsx` L396:
```tsx
{acquisitionMode === "estimated" && !isListed && (
  <EstimatedUnlistedBlock form={form} onChange={onChange} />
)}
```

→ **비상장 종목 + 환산 모드**에서만 렌더. 상장(PostListingValuationCard)과 `isListed` 차원 상호 배타 (계획서 §3-C E-1 정정).

---

## 2. 컴포넌트 트리

```
EstimatedUnlistedBlock (수정)
├── [기존] 가중치 안내 카드 (isHeavyRE / isNetAssetOnly 분기)
├── [기존] 순자산 단독 사유 RadioCardGroup (5 옵션)
├── [신규] 모드 토글 RadioCardGroup (simple / full) — tone="fuchsia"
├── if mode === "simple":
│     ├── [기존] 양도연도 4 필드 (NI 1 + NA 1, isNetAssetOnly 시 NI 비노출)
│     └── [기존] 취득연도 4 필드
└── if mode === "full":
      ├── [신규] EstimatedUnlistedNetIncomeStatement (양도/취득 24행 × 2)
      │     └── if !isNetAssetOnly: 양/취 컬럼 노출
      │     └── if  isNetAssetOnly: 전체 컴포넌트 비노출 + 안내 메시지
      ├── [신규] EstimatedUnlistedNetAssetStatement (양도/취득 19행 × 2) [DE-1 정정 21→19]
      └── [기존] 양도/취득 기준시가 미리보기 (계산 결과 카드) — [DM-1] full 모드에서도 동일 노출
            ※ adapter가 simple/full 모두에서 4 필드를 채우므로 기존 useMemo 미리보기 로직 자동 재사용
```

---

## 3. 모드 토글 (RadioCardGroup)

```tsx
<FieldCard
  label="입력 방식"
  hint="간이는 1주당 가액을 직접 입력, 행-수준 계산은 §54·§55 산식으로 자동 산출"
>
  <RadioCardGroup
    name="unlistedValuationMode"
    value={form.unlistedValuationMode || "simple"}
    onChange={(v) => onChange({ unlistedValuationMode: v as "simple" | "full" })}
    tone="fuchsia"
    layout="inline"
    options={[
      {
        value: "simple",
        label: "직접 입력",
        description: "1주당 순손익·순자산가치를 외부에서 산출하여 입력",
      },
      {
        value: "full",
        label: "행-수준 계산",
        description: "24행 순손익 + 21행 순자산을 입력하여 자동 산출",
      },
    ]}
  />
  <p className="mt-2 text-xs text-fuchsia-700">
    ⓘ 모드 전환 시 입력값은 양쪽 모두 보존됩니다 (실수 토글 보호)
  </p>
</FieldCard>
```

배치 위치: 가중치 안내 카드 직후 + 순자산 단독 사유 RadioCardGroup 직전 (사용자가 모드 결정 → 단독 사유 결정 → 입력 흐름).

---

## 4. full 모드 신규 컴포넌트

### 4-A. `EstimatedUnlistedNetIncomeStatement` (thin wrapper)

```tsx
"use client";
import { YearColumn } from "./PostListingNetIncomeStatement"; // [X-1] export 추가
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import { shouldSkipNetIncome } from "@/lib/tax-engine/stock-transfer/unlisted-flat-adapter";

interface Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function EstimatedUnlistedNetIncomeStatement({ form, onChange }: Props) {
  // [E-6 (1)] isNetAssetOnly === true 시 컴포넌트 전체 비노출 + 안내
  if (shouldSkipNetIncome(form)) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800">
        ⓘ {UNLISTED_MESSAGES.NET_ASSET_ONLY_HIDDEN}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/30 p-4 space-y-4">
      <p className="text-sm font-semibold text-sky-800">
        순손익 계산서 (상증령 §54 — 24행)
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <YearColumn form={form} onChange={onChange} col="EUTransfer" />
        <YearColumn form={form} onChange={onChange} col="EUAcq" />
      </div>
    </div>
  );
}
```

### 4-B. `EstimatedUnlistedNetAssetStatement` (thin wrapper)

```tsx
"use client";
import { YearColumn } from "./PostListingNetAssetStatement"; // [X-1] export 추가

export function EstimatedUnlistedNetAssetStatement({ form, onChange }: Props) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 space-y-4">
      <p className="text-sm font-semibold text-emerald-800">
        순자산가액 계산서 (상증령 §55 — 21행)
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <YearColumn form={form} onChange={onChange} col="EUTransfer" />
        <YearColumn form={form} onChange={onChange} col="EUAcq" />
      </div>
    </div>
  );
}
```

### 4-C. PostListing YearColumn export 변경 (X-1)

```ts
// PostListingNetIncomeStatement.tsx
// 변경 1: Column 타입 확장
export type Column = "Listing" | "Acq" | "EUTransfer" | "EUAcq";

// 변경 2: COL_LABEL 확장 [DE-3 정정 — 중복 라벨 차별화]
const COL_LABEL: Record<Column, string> = {
  Listing: "상장연도 직전",
  Acq: "취득연도 직전 (상장 §165⑤)",       // PostListing context 명시
  EUTransfer: "양도연도 직전 (비상장 §165④)",
  EUAcq: "취득연도 직전 (비상장 §165④)",     // Acq와 라벨 텍스트 명확히 차별
};

// 변경 3: named export
export function YearColumn({ form, onChange, col }: {...}): React.JSX.Element { ... }
```

NetAssetStatement도 동일 패턴 적용. **[DX-2] 내부 헬퍼 영향**: `getField(form, key)` 같은 키 access 함수는 string key를 받으므로 col 타입 확장 영향 없음. 단 `addKeys`/`subKeys`/`shareKey` 배열 생성 시 `as const` 타입 단언이 새 col 값에서도 정상 해석되는지 확인 필요 — 구현 단계에서 `tsc --noEmit` 검증.

---

## 5. 14 동기화 지점 점검

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 타입 | `unlistedValuationMode` + 78 신규 필드 | YES |
| ② initial | 모두 `""`, `niDiscountRate*` = `"10"`, mode = `"simple"` | YES |
| ③ normalize | `enumField("unlistedValuationMode", ["simple","full"], "simple")` + 78 stringField | YES |
| ④ API 변환 | `adaptUnlistedFlatToApiBody` 분기 (engine §6) | YES |
| ⑤ UI 위젯 | RadioCardGroup + 2 신규 thin wrapper + YearColumn export | YES |
| ⑥ 사이드바 | `computeUnlistedPerShareSummary` selector — adapter 공유 | YES |
| ⑦ 결과 카드 | [DM-3 결정] full 모드 사용 시 결과 화면 헤더에 `UNLISTED_MESSAGES.FULL_MODE_BADGE` 배지 표시 채택 — 사용자가 산출 방식 추적 가능 | YES |
| ⑧ Validate | mode + isNetAssetOnly 분기 (engine §7) | YES |
| ⑨~⑭ Zod·route·엔진 input | **무변동** (4 필드만 body로 전달) | NO |

---

## 6. UI 케이스 매트릭스 (계획서 §10-A0 동일)

| mode | isNetAssetOnly | UI 표시 |
|---|---|---|
| simple | F | 4 필드 (양/취 × NI/NA) 직접 입력 |
| simple | T | NI 2 필드 비노출 + NA 2 필드만 |
| full   | F | NI 24행 × 2 컬럼 + NA 21행 × 2 컬럼 (총 4 블록) |
| full   | T | **NI 컴포넌트 전체 비노출 + 안내 메시지** + NA 21행 × 2 컬럼 |

---

## 7. 데이터 보존 정책 (E-6 (5) · M-1)

zustand store는 모든 79 entry를 무조건 보유. UI는 모드/단독 사유 토글에 따라 노출/비노출 결정만 — store 키 자체는 절대 삭제하지 않음.

→ 사용자가 토글을 OFF→ON→OFF로 돌리면 입력값 그대로 복원. 실수 토글 보호.

---

## 8. tone 색상 가이드

- 모드 토글: `fuchsia` (분기 토글)
- NI 계산서 블록: `sky` (계산 영역)
- NA 계산서 블록: `emerald` (계산 영역)
- isNetAssetOnly 안내 메시지: `amber` (주의 / 경고)
- 가중치 안내 (기존): `violet` (isHeavyRE) / `fuchsia` (default)

---

## 9. 사이드바 합계 표시

`StockSidebar`는 `computeUnlistedPerShareSummary(formData)` 호출 결과 4 값(transferNi/Na, acqNi/Na)을 사용하여:
- 양도기준시가 (1주당) 표시
- 취득기준시가 (1주당) 표시
- 개산공제 base 표시

simple/full 모드 무관 동일 표시 인터페이스.

---

## 10. 접근성 / UX

- 모드 토글 변경 시 focus는 유지 (스크롤 점프 없음)
- 신규 컴포넌트 입력 셀은 기존 YearColumn의 Enter→다음 셀 이동 동작 자동 상속
- isNetAssetOnly 토글 → NI 컴포넌트 비노출 시 부드러운 transition 불필요 (단순 mount/unmount)

---

## 11. 테스트 매트릭스 (UI anchor — 계획서 §10-D 동일)

| ID | 케이스 | 검증 |
|---|---|---|
| UI-1 | full + isNetAssetOnly=T | NI 컴포넌트 `queryByText("순손익 계산서") === null` |
| UI-2 | full + isNetAssetOnly=T | 안내 메시지 텍스트 정확 표시 (UNLISTED_MESSAGES 상수 비교) |
| UI-3 | full + isNetAssetOnly=T + isHeavyRE=T | 가중치 안내 카드 "단독 평가" 분기 표시 |
| UI-4 | OFF→ON→OFF 토글 | NI 입력값 store 보존 후 UI 복원 |
| UI-5 | simple ↔ full 토글 | 양쪽 모드 입력값 모두 store 보존 (M-1) |
