# UI 디자인 — 협의분할 입력 통합 행 + 높이 압축

> 계획서: `docs/01-plan/heir-allocation-compaction.plan.md`
> 대상: `HeirAllocationInput`(공유 본체) · `HeirAllocationToggleSection`(ToggleCard 래퍼)
> 성격: **순수 입력 UI 압축** — 엔진 input/result·API·validation·결과뷰 무변경

## 1. 목표 / 비목표

**목표**: 협의분할 입력 패널 세로 길이·라벨 중복 축소.
- 상속인 선택 칩 + 금액 입력 행을 **통합 행**으로 합쳐 이름 1회 표시.
- 제목 3중복(패널·ToggleCard·내부 헤더) 중 내부 헤더 제거 + ToggleCard 제목·설명 압축.
- 중첩 카드(겹3) 평탄화.

**비목표**: chip-config 칩 상태 라벨, 엔진/결과 배부 표, `heirAllocations` 데이터 의미.

## 2. 케이스 인벤토리 (render-site × 상태)

| # | render-site | heading | flush | 상태 | 표시 |
|---|---|---|---|---|---|
| C1 | 인라인 패널(부동산/주식) `HeirAllocationToggleSection`→`EstateChipInlineExpand` | `null` | `true` | 미선택(`!hasInput`) | 합계 chip 없음·법정상속분 안내·전원 토글(+ 표시)·(단독+평가액>0 시 autofill 버튼) |
| C2 | 〃 | `null` | `true` | 일부 선택 | 합계 chip(색)·선택 행 금액 인라인·미선택 행 토글만 |
| C3 | 〃 | `null` | `true` | 평가액 0 + 선택 | 합계 chip **gray**(평가액 미입력 안내) |
| C4 | 〃 | `null` | `true` | 합계=평가액 | 합계 chip **emerald** ✓ |
| C5 | 〃 | `null` | `true` | 합계≠평가액 | 합계 chip **rose** (평가액 N) |
| C6 | 추정상속 `PresumedInheritanceInput:247` | 기본(`협의분할 (상속인별 분배)`) | `false` | — | 헤더+카드 유지(현행) + 통합 행 |
| C7 | 채무 `DebtAllocationInput:322` | 기본 | `false` | — | 헤더+카드 유지(현행) + 통합 행 |
| C8 | 면적 입력(`showAreaInput`) | 임의 | 임의 | 선택 | 선택 행에 금액 + 면적(㎡) 인라인 |
| C9 | 분배 후보 0명 | — | — | — | `상속인·수유자가 1명 이상…` 안내(현행 `:123-128` 유지) |

## 3. 컴포넌트 API 변경

### 3.1 `HeirAllocationInput` props (추가 2개 — 하위호환)

```ts
interface HeirAllocationInputProps {
  allocations: HeirAllocation[] | undefined;
  expectedTotal: number;
  heirs: Heir[];
  onChange: (next: HeirAllocation[] | undefined) => void;  // undefined = 협의분할 해제(현행 :54)
  showAreaInput?: boolean;        // 기존
  // ── 신규 (기본값 = 현행 동작 유지, C6·C7 회귀 0) ──
  heading?: React.ReactNode | null;  // 기본 "협의분할 (상속인별 분배)". null이면 내부 헤더 미표시
  flush?: boolean;                   // 기본 false(현행 카드). true면 sky border·bg·p-3 제거
}
```

- 시그니처 호환: 신규 2개 모두 optional + 기본값이 현행 → `PresumedInheritanceInput`·`DebtAllocationInput` **호출부 무변경**.
- `heirShortLabel`(`:59-71`) export·시그니처 **불변**(외부 3 사용처 보존).

### 3.2 `HeirAllocationToggleSection` 변경

```tsx
<ToggleCard
  tone="violet"
  title="협의분할 직접 입력"            // 기존 "상속인·수유자별 협의분할 입력" → 패널 헤더와 중복 해소·자기식별 유지(R-3)
  description="법정상속분(§1009) 대신 상속인·수유자에게 직접 분배(§1013·§1073) · 영리법인 제외"  // 2줄 → 1줄
  ...
>
  <HeirAllocationInput ... heading={null} flush />   {/* 인라인 압축 */}
</ToggleCard>
```

> ✅ Pre-Do probe 완료(R-3 확정): `EstateCommonAttributesSection:224`는 **활성** — 주식 평가 카드(상장 `StockValuationForm:296`·비상장 `:454`)가 `heirs` 전달해 렌더, **패널 헤더 없음**. 따라서 ToggleCard 제목은 **자기식별 유지 필수** → `협의분할 직접 입력` 채택. (부동산은 `EstateChipInlineExpand` 인라인 패널 헤더 경로 — D-O1 "유일 렌더"는 부동산 칩 흐름 한정, 주식은 별도 경로.)
> ⚠️ 테스트 영향: `e2e/inheritance-unlisted-stock-gross-estate.spec.ts`가 현재 제목 `상속인·수유자별 협의분할 입력`을 단언 → 새 제목으로 갱신.

## 4. 통합 행 레이아웃 (ASCII)

### Before (현행 — 이미지)
```
┌ 인라인 패널: 상속인·수유자별 협의분할              [X] ┐
│ ┌ ToggleCard: 상속인·수유자별 협의분할 입력      [⏻] ┐ │
│ │ OFF: 법정상속분(§1009) 자동 안분 / ON: 직접 분배   │ │
│ │ (§1013·§1073). 영리법인은 협의분할 대상이 아닙니다.│ │  ← 2줄
│ │ ┌ 협의분할 (상속인별 분배)  합계 …✓ ───────────┐ │ │  ← 겹3 헤더
│ │ │ [✓배우자(한배우자)][+자녀][+자녀][+수유자][+기타]│ │ │  ← 칩 row
│ │ │ 배우자 (한배우자)  [ 1,500,000,000 ]           │ │ │  ← 이름 중복
│ │ └──────────────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### After (통합 행 + 압축)
```
┌ 인라인 패널: 상속인·수유자별 협의분할              [X] ┐
│ ┌ ToggleCard: 협의분할 직접 입력                 [⏻] ┐ │
│ │ 법정상속분(§1009) 대신 직접 분배(§1013·§1073)·법인 제외│ │  ← 1줄
│ │   합계 1,500,000,000 ✓                              │ │  ← heading 없음, chip만
│ │   ☑ 배우자(한배우자)   [ 1,500,000,000 ]            │ │  ← 통합 행(이름 1회)
│ │   ☐ 자녀(김첫째)       [            ]               │ │
│ │   ☐ 자녀(김둘째)                                    │ │  ← 미선택=토글만
│ │   ☐ 수유자(김손자)                                  │ │
│ │   ☐ 기타(윤며느리)                                  │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 통합 행 JSX 스켈레톤
> C9 보존: `distributableHeirs.length === 0`이면 현행 early return(`:123-128` `상속인·수유자가 1명 이상…` 안내) 그대로 — 아래 본 렌더 이전.
> `toggleHeir` ADD 동작 보존(`:93-100`): 미선택 행을 켜면 금액이 **잔여액(`Math.max(0, expectedTotal - currentSum)`) 자동 채움**(0 아님). 첫 선택 시 전액. 사용자 명시 액션이라 자동 안분 fallback 정책 위반 아님.
```tsx
<div className={flush ? "space-y-2" : "rounded-md border border-sky-200 bg-sky-50/40 ... p-3 space-y-2"}>
  {/* 상단: heading? + 합계 chip + autofill */}
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      {heading && <span className="text-xs font-semibold text-sky-700 ...">{heading}</span>}
      {/* 합계 chip — gray/emerald/rose (현행 :138-154 로직 그대로) */}
    </div>
    {!hasInput && distributableHeirs.length === 1 && expectedTotal > 0 && (
      <button onClick={handleAutoFillSingle} ...>단독 상속 자동 입력</button>
    )}
  </div>

  {/* 미선택(전무) 시 법정상속분 안내 (현행 :168-172 보존) */}
  {!hasInput && <p className="text-[11px] ...">미입력 시 <strong>법정상속분</strong>(배우자 1.5 : …)으로 자동 배분됩니다.</p>}

  {/* 통합 행 — distributableHeirs 전원, 선택 시 금액 인라인 */}
  <div className="space-y-1.5" data-testid="heir-allocation-rows">
    {distributableHeirs.map((heir) => {
      const alloc = allocs.find((a) => a.heirId === heir.id);
      const selected = !!alloc;
      return (
        <div key={heir.id} className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={selected}    {/* Do 환류: role=checkbox 대신 aria-pressed — 기존 getByRole("button") 단언 호환 + 유효 토글버튼 a11y */}
            onClick={() => toggleHeir(heir)}
            className={`text-xs px-2 py-1 rounded-full border ... ${selected ? "bg-sky-200 …" : "bg-white …"}`}
          >
            {selected ? "✓ " : "+ "}{heirShortLabel(heir)}
          </button>
          {selected && (
            <div className="flex-1 min-w-[140px] max-w-[200px]">
              <CurrencyInput label="" value={alloc.amount > 0 ? String(alloc.amount) : ""}
                onChange={(v) => updateAmount(heir.id, parseAmount(v))} placeholder="분배 금액" hideUnit />
            </div>
          )}
          {selected && showAreaInput && (
            <input type="text" inputMode="decimal" placeholder="면적(㎡)" value={alloc.areaM2 ?? ""}
              onChange={(e) => updateArea(heir.id, e.target.value === "" ? undefined : parseFloat(e.target.value))}
              className="w-24 shrink-0 ..." />
          )}
        </div>
      );
    })}
  </div>
</div>
```

## 5. 동기화 지점 (UI 한정)

| # | 지점 | 변경 |
|---|---|---|
| ⑤ UI 위젯 | `HeirAllocationInput`·`HeirAllocationToggleSection` | **본 작업** (통합 행·props·압축) |
| ① 폼 상태 | `heirAllocations: HeirAllocation[]` | 무변경 (타입·필드 동일) |
| ②③ initial/normalize | `buildInitialHeirAllocations` | 무변경 |
| ④ API 변환 | — | 무변경 |
| ⑥ 사이드바 합계 | — | 무변경 |
| ⑦ 결과 카드 | 배부 표 | 무변경 |
| ⑧ Validation | `lib/calc/inheritance-validate.ts` (컴포넌트 주석 `:12` 명시) | 무변경 (합계≠평가액은 UI chip 색만, 차단 아님 — 현행) |

→ **8지점 중 ⑤만 변경.** 데이터·계약 무변경.

## 6. 테스트 설계

### 6.1 신규 anchor (컴포넌트)
- A-1: 미선택 → 전원 토글 노출(`+`), 금액 input 0개, `법정상속분` 안내 노출.
- A-2: 1명 선택 → 그 행에 금액 input 1개(값=잔여액 자동 채움, 첫 선택 시 전액), 이름은 토글에만 1회(중복 라벨 부재).
- A-3: 선택 해제(toggle off) → 금액 input 사라짐, store alloc 제거.
- A-4: 합계 색 전이 — 평가액 0=gray / 합계=평가액=emerald✓ / 불일치=rose.
- A-5: `showAreaInput` → 선택 행에 면적 input 인라인.
- A-6: `heading` 기본값(미전달) → `협의분할 (상속인별 분배)` 노출(C6·C7 회귀). `heading={null}` → 미노출.
- A-7: a11y — 토글 `<button aria-pressed={selected}>` 반영(role=button 유지).

### 6.2 기존 테스트 갱신
- `e2e/estate-chip-ux-fixes.spec.ts:85` `getByText("협의분할 (상속인별 분배)")` → **패널 헤더 `상속인·수유자별 협의분할` 또는 합계 chip 존재**로 교체. `:91` `분배 금액` placeholder 유지(통과).
- `property-valuation-form-heir-allocation`·`estate-card-compaction`·`heir-allocation-zero-valuation` — 통합 행 구조·이름 단일 가정으로 단언 조정(Do 시 정밀 확인).
- Debt/Presumed 계열 테스트 — `heading`/`flush` 기본값 유지로 통과 예상, 통합 행 구조분만 확인.
- **`e2e/inheritance-unlisted-stock-gross-estate.spec.ts` — ⚠️ ToggleCard 제목 단언**: 현재 `상속인·수유자별 협의분할 입력`(주식 카드 경로) → 새 제목 `협의분할 직접 입력`으로 갱신.

### 6.3 영향 아님
- `e2e/inheritance-heir-allocation-table.spec.ts`(결과 배부 표)·`AllocationBreakdownSection`·`HeirAllocationSummaryTableUiFix` — 결과뷰, 입력 무관.

## 7. 작업 순서

1. Pre-Do probe(R-3): `EstateCommonAttributesSection:224` 활성 여부.
2. `HeirAllocationInput`: `heading`/`flush` props + 통합 행 재구성 + 상단 행 조건부 + 보존 요소.
3. `HeirAllocationToggleSection`: `heading={null} flush` + 제목·설명 압축.
4. C6·C7 호출부 무변경 확인.
5. anchor(§6.1) + 기존 테스트 갱신(§6.2).
6. `tsc` 0 + vitest 관련 → 전체 `npm test`.
7. E2E: estate-chip-ux-fixes + Debt/Presumed 경로.
8. 3 render-site 브라우저/E2E 확인.

## 8. DoD

- [ ] C1~C9 케이스 의도대로 렌더.
- [ ] 이름 1회(중복 제거)·미선택 행 금액 칸 미표시.
- [ ] 제목 3중복 해소·설명 1줄·겹3 카드 평탄화.
- [ ] `heading`/`flush` 기본값 → Presumed·Debt 회귀 0.
- [ ] 보존: 합계 chip 색·법정상속분 안내·단독 autofill·`heirShortLabel` export·`showAreaInput`.
- [ ] a11y aria 노출 · `useEffect→store` 미러링 0 · 자동 안분 fallback 0.
- [ ] ⑤만 변경(데이터·계약 무변경) 확인.
- [ ] `tsc` 0 + vitest + 전체 `npm test` + E2E 통과.
