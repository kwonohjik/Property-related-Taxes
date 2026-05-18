# Step 1 single 모드 취득일·취득원인 통합 — UI 디자인

> **세목**: 주식 양도소득세 (stock-transfer)
> **참조 Plan**: `docs/00-pm/stock-step1-single-mode-cause-merge.plan.md` v1.2
> **선행 디자인**: `docs/02-design/features/stock-split-lots.ui.design.md` v1.2
> **상태**: Design v1 (2026-05-18)

## 1. Context

### 1-1. 통합 동기

사용자 보고: single 모드에서 **취득일(섹션 3)과 취득원인(섹션 4)이 분리**되어 있음. 그러나 취득원인은 취득일의 속성. split 모드는 이미 lot 내부에 통합되어 있음 — single만 UX 패턴 불일치.

### 1-2. 통합 효과

- 섹션 4 → AcquisitionInfoBlock에 흡수 (single 모드)
- 동적 번호: single+OFF 5→**4**, single+ON 6→**5**
- split 모드 영향 없음 (이미 lot 통합)

## 2. 사용자 시나리오

### S-1. 매매 단순 케이스 (가장 빈도 높음)
- single 모드 + cause=purchase (default)
- 입력: 취득일·양도일·양도주식수·발행주식총수
- 보조 일자: 없음

### S-2. 상속 케이스
- single 모드 + cause=inheritance
- amber 카드에 inheritance nested 카드 노출 → 피상속인 취득일 입력
- 안내: "1985.12.31. 이전 → 의제취득일 1986.1.1."

### S-3. 증여 케이스
- single 모드 + cause=gift
- "취득일" 라벨 자동 변경 → "수증일"
- gift nested 안내 카드 노출 ("§97의2 이월과세 미적용")
- 보조 일자 입력 없음

### S-4. 합병·분할 케이스
- single 모드 + cause=merger_split
- merger_split nested 카드 노출 → 종전 주식 취득일 입력

### S-5. cause 변경 시 보조 일자 유지
- inheritance → purchase 전환 시 사용자가 입력한 decedentAcquisitionDate는 store에 보존 (재선택 시 자동 복원)

### S-6. split → single 마이그레이션
- split 모드에서 첫 lot의 cause·보조일자가 폼-전역으로 복원
- AcquisitionInfoBlock에 정확히 표시

## 3. UI 통합 구조 (single 모드 섹션 3)

```
┌─ 3. 양도·취득 정보 ────────────────────────────────────────┐
│ [모드 토글 ●단일 ○분할]                                    │
│                                                            │
│ ┌─ ⓐ 취득 정보 (amber tone, AcquisitionInfoBlock) ─────┐  │
│ │ 📅 * 취득일 [____] (gift 시 "수증일" 라벨)             │  │
│ │ 📋 * 취득원인 [● 매매] [○ 상속] [○ 증여] [○ 합병·분할] │  │
│ │   ⓘ §104② — 취득원인에 따라 단기 보유기간 기산점이...   │  │
│ │                                                        │  │
│ │ (inheritance) ─────────────────────────────────────┐   │  │
│ │ │ amber-100 nested 카드                           │   │  │
│ │ │ * 피상속인 취득일 [____] (§104②1)               │   │  │
│ │ │ ⓘ 1985.12.31. 이전 → 의제취득일 1986.1.1. 자동   │   │  │
│ │ └─────────────────────────────────────────────────┘   │  │
│ │                                                        │  │
│ │ (gift) ────────────────────────────────────────────┐   │  │
│ │ │ amber-100 nested 안내                            │   │  │
│ │ │ ⓘ 수증일 = 취득일. §97의2 이월과세는 주식에 미적용  │   │  │
│ │ └─────────────────────────────────────────────────┘   │  │
│ │                                                        │  │
│ │ (merger_split) ────────────────────────────────────┐   │  │
│ │ │ amber-100 nested 카드                            │   │  │
│ │ │ * 종전 주식 취득일 [____] (§104②3)               │   │  │
│ │ └─────────────────────────────────────────────────┘   │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                            │
│ ┌─ ⓑ 양도 정보 (emerald tone) ──────────────────┐         │
│ │ * 양도일 [____]   * 양도 주식수 [____]         │         │
│ └────────────────────────────────────────────────┘         │
│                                                            │
│ * 발행주식 총수 [____]                                     │
└────────────────────────────────────────────────────────────┘

(섹션 4 "취득원인" — Step1 sections.useMemo에서 제거)
```

## 4. AcquisitionInfoBlock.tsx 컴포넌트 명세

### Props

```tsx
interface AcquisitionInfoBlockProps {
  form: Pick<
    StockTransferFormData,
    | "acquisitionDate"
    | "acquisitionCause"
    | "decedentAcquisitionDate"
    | "preMergerAcquisitionDate"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}
```

### 구현 가이드

```tsx
"use client";

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

export function AcquisitionInfoBlock({ form, onChange }: AcquisitionInfoBlockProps) {
  const cause = form.acquisitionCause || "purchase";
  const dateLabel = cause === "gift" ? "수증일" : "취득일";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <span className="text-amber-800 font-semibold text-sm">📋 취득 정보</span>
        <span className="text-xs text-amber-700">§104② — 취득원인에 따라 단기 보유기간 기산점이 달라집니다</span>
      </div>

      {/* 취득일 (single column) */}
      <FieldCard label={dateLabel} required hint={cause === "gift" ? "수증일 (§97의2 미적용)" : "실제 취득일 (YYYY-MM-DD)"}>
        <DateInput
          value={form.acquisitionDate}
          onChange={(v) => onChange({ acquisitionDate: v })}
        />
      </FieldCard>

      {/* 취득원인 — FieldCard wrap (기존 AcquisitionCauseBlock 패턴 유지) */}
      <FieldCard label="취득원인 (단기 30% 기산점)" hint="§104② — 취득원인에 따라 단기 보유기간 기산점이 달라집니다">
        <RadioCardGroup
          name="acquisitionCause"
          value={cause}
          onChange={(v) =>
            onChange({ acquisitionCause: v as StockTransferFormData["acquisitionCause"] })
          }
          tone="amber"
          layout="inline"
          options={[
            { value: "purchase", label: "매매", description: "취득일 기산" },
            { value: "inheritance", label: "상속", description: "피상속인 취득일 (§104②1)" },
            { value: "gift", label: "증여", description: "수증일 (§97의2 미적용)" },
            { value: "merger_split", label: "합병·분할", description: "종전 주식 (§104②3)" },
          ]}
        />
      </FieldCard>

      {/* inheritance nested */}
      {cause === "inheritance" && (
        <div className="ml-4 rounded-lg border border-amber-300 bg-amber-100/60 p-3 space-y-2">
          <FieldCard
            label="피상속인 취득일 (§104②1)"
            required
            hint="단기 30% 세율 적용 여부는 피상속인 취득일 → 양도일로 계산"
          >
            <DateInput
              value={form.decedentAcquisitionDate ?? ""}
              onChange={(v) => onChange({ decedentAcquisitionDate: v })}
            />
          </FieldCard>
          <p className="text-xs text-amber-800">
            ⓘ 1985.12.31. 이전 취득 주식: 의제취득일 1986.1.1. 자동 적용 (시행령 §162①)
          </p>
        </div>
      )}

      {/* gift nested 안내 */}
      {cause === "gift" && (
        <div className="ml-4 rounded-lg border border-amber-300 bg-amber-100/60 p-3">
          <p className="text-xs text-amber-800">
            ⓘ 증여 주식은 수증일(= 취득일)부터 기산합니다. §97의2 이월과세는 주식에 미적용.
          </p>
        </div>
      )}

      {/* merger_split nested */}
      {cause === "merger_split" && (
        <div className="ml-4 rounded-lg border border-amber-300 bg-amber-100/60 p-3">
          <FieldCard
            label="종전 주식 취득일 (§104②3)"
            required
            hint="합병·분할로 취득한 신주의 단기 기산점은 종전 주식 취득일"
          >
            <DateInput
              value={form.preMergerAcquisitionDate ?? ""}
              onChange={(v) => onChange({ preMergerAcquisitionDate: v })}
            />
          </FieldCard>
        </div>
      )}
    </div>
  );
}
```

### 4-2. placeholder 정책 준수 (v1.1 정정)

CLAUDE.md `feedback_placeholder_no_numeric_examples` (2026-05-03 이후) — placeholder에 숫자 예시 금지.

기존 Step1.tsx의 양도 정보 FieldCard에 placeholder 숫자 예시 잔존:
- `<DecimalInput placeholder="5000" />` (양도 주식수) — **제거**
- `<DecimalInput placeholder="100000" />` (발행주식 총수) — **제거**

본 PR에서 통합 작업과 함께 정리. 대체: hint에 "(주)" 단위만 명시.

### 4-3. handleLotsModeToggle 마이그레이션 영향 (v1.1 보강)

기존 Step1.tsx `handleLotsModeToggle` wrapper는 split↔single 전환 시 다음 폼-전역 필드를 마이그레이션:
- `acquisitionDate`·`acquisitionCause`·`decedentAcquisitionDate`·`preMergerAcquisitionDate`
- `transferDate`·`shareCount`·`perShareTransferPrice`·`perShareAcquisitionPrice`

본 PR은 **wrapper 자체에 변경 없음**. `AcquisitionInfoBlock`은 동일한 폼-전역 필드를 그대로 소비 — wrapper가 patch 적용하면 zustand store 갱신 → React 리렌더 → 통합 컴포넌트 즉시 반영. useMemo 의존성 `[form, onChange]` 그대로 작동.

### 4-4. DateInput hint 정책

cause별 hint 차별화는 **gift만 적용** ("수증일" 의미 명시). 나머지 3종(purchase·inheritance·merger_split)은 동일 hint "실제 취득일 (YYYY-MM-DD)". 보조 일자 hint는 각 nested 카드에 §104② 인용.

## 5. Step1.tsx 변경 명세

### Before (현재)

```tsx
const sections = useMemo(() => {
  const items = [
    { key: "market", ... },
    { key: "company", ... },
    { key: "dates", render: () => (
        <RadioCardGroup ... /> {/* lotsMode 토글 */}
        {form.lotsMode === "single" ? (
          <div className="grid grid-cols-2 gap-4">
            <FieldCard label="취득일">{...}</FieldCard>
            <FieldCard label="양도일">{...}</FieldCard>
            <FieldCard label="양도 주식수">{...}</FieldCard>
            <FieldCard label="발행주식 총수">{...}</FieldCard>
          </div>
        ) : ( <SplitLotsBlock ... /> )}
    ) },
  ];
  if (form.lotsMode === "single") {
    items.push({ key: "cause", render: () => <AcquisitionCauseBlock ... /> });
  }
  items.push({ key: "major", ... });
  if (...) items.push({ key: "other", ... });
  return items;
}, [form, onChange]);
```

### After

```tsx
const sections = useMemo(() => {
  const items = [
    { key: "market", ... },
    { key: "company", ... },
    { key: "dates", render: () => (
        <div className="space-y-4">
          <RadioCardGroup ... /> {/* lotsMode 토글 */}
          {form.lotsMode === "single" ? (
            <>
              {/* ⓐ 취득 정보 (amber) — 취득일·cause·보조일자 통합 */}
              <AcquisitionInfoBlock form={form} onChange={onChange} />

              {/* ⓑ 양도 정보 (emerald grid 2cell, placeholder 정책 준수) */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FieldCard label="양도일" required hint="실제 양도일 (YYYY-MM-DD)">
                    <DateInput value={form.transferDate} onChange={(v) => onChange({ transferDate: v })} />
                  </FieldCard>
                  <FieldCard label="양도 주식수" required hint="이번 거래에서 양도하는 주식수 (주)">
                    <DecimalInput
                      value={form.shareCount}
                      onChange={(v) => onChange({ shareCount: v })}
                      // placeholder="5000" 제거 (CLAUDE.md placeholder 정책)
                    />
                  </FieldCard>
                </div>
              </div>

              {/* 발행주식 총수 (full-width, placeholder 제거) */}
              <FieldCard label="발행주식 총수" required hint="해당 법인의 발행주식 총수 (주)">
                <DecimalInput
                  value={form.totalIssuedShares}
                  onChange={(v) => onChange({ totalIssuedShares: v })}
                  // placeholder="100000" 제거
                />
              </FieldCard>
            </>
          ) : ( <SplitLotsBlock ... /> )}
        </div>
    ) },
  ];
  // ❌ items.push({ key: "cause", ... }) — 삭제: AcquisitionInfoBlock에 통합
  items.push({ key: "major", ... });
  if (...) items.push({ key: "other", ... });
  return items;
}, [form, onChange]);
```

### import 변경

```diff
- import { AcquisitionCauseBlock } from "@/components/calc/stock-transfer/AcquisitionCauseBlock";
+ import { AcquisitionInfoBlock } from "@/components/calc/stock-transfer/AcquisitionInfoBlock";
```

## 6. 동적 섹션 번호 매트릭스 (재계산)

| lotsMode | 기타자산 | 섹션 수 | 섹션 목록 |
|---|---|---|---|
| single | OFF | **4** | 시장 → 회사 → 양도·취득 정보(통합) → 대주주 |
| single | ON | **5** | 시장 → 회사 → 양도·취득 정보 → 대주주 → 기타자산 |
| split | OFF | 4 | 시장 → 회사 → 양도·취득 lot → 대주주 |
| split | ON | 5 | 시장 → 회사 → 양도·취득 lot → 대주주 → 기타자산 |

→ single과 split이 동일 섹션 수 / 동일 순서 (UX 일관성 ↑)

## 7. UX 규칙 적용

- **`feedback_section_card_numbering`** — amber tone 색상 카드
- **`feedback_toggle_card_visibility`** — RadioCardGroup OFF/ON 모두 amber 배경 유지
- **`feedback_ui_order_follows_logic`** — 취득일(취득시점) → 취득원인(분기 결정) → 보조일자(분기 결과) 순차
- **`feedback_no_silent_apportion_fallback`** — cause 변경 시 보조 일자 store 값 유지 (자동 삭제 금지)
- **`feedback_useeffect_store_mirror_forbidden`** — 모든 변경은 onChange 직접 patch

## 8. 14개 동기화 지점 영향

| # | 지점 | 변경 |
|---|---|---|
| ① | FormData 타입 | 변경 없음 |
| ② | initial | 변경 없음 |
| ③ | normalize | 변경 없음 |
| ④ | API 변환 | 변경 없음 |
| ⑤ | **UI 위젯** | `AcquisitionInfoBlock.tsx` 신규 + Step1 sections 갱신 + `AcquisitionCauseBlock.tsx` 삭제 |
| ⑥ | 사이드바 | 변경 없음 |
| ⑦ | 결과 카드 | 변경 없음 |
| ⑧ | Validation | 변경 없음 (필드 동일) |
| ⑨~⑭ | API/Zod/Route | 변경 없음 |

**오직 ⑤ UI 변경**. 위험도 최저.

## 9. 회귀 가드

- 기존 anchor 전체 통과 (필드·validate·엔진 동일)
- split → single 마이그레이션 wrapper 작동 확인 (cause·보조일자 폼-전역으로 복원)
- 4가지 cause 전환 시 보조 일자 store 값 유지
- 동적 섹션 번호 4가지 조합 (single×기타자산 ON/OFF, split×기타자산 ON/OFF) 모두 1~N 연속

## 10. 변경 로그

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-05-18 | v1 | Plan v1.2 기반 UI 디자인 작성. 컴포넌트 명세·Step1 변경·14지점 영향 분석·시각 구조·회귀 가드 포함 |
| 2026-05-18 | v1.1 | 검증 7건 정정: 🔴 ①placeholder 숫자 예시 제거(5000/100000) ②FieldCard wrap 패턴 명시 ③기존 평면 grid → emerald 카드 그룹화 명시. 🟡 ④cause별 hint 차별화 정책(gift만) ⑤AcquisitionCauseBlock 외부 참조 검증 ⑥handleLotsModeToggle wrapper 동작 명시 §4-3. 🟢 ⑦nullable 가드 패턴 |
