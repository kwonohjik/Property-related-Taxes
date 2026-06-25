# 현물출자에 따른 이익의 증여 (§39의3) — UI 설계

> 브랜치 `feat/gift-inkind-capital-39-3` · 워크트리 `.claude/worktrees/gift-inkind-capital`
> 계획서: `docs/00-pm/gift-inkind-contribution-39-3.plan.md`
> 엔진 설계: `docs/02-design/features/gift-inkind-contribution-39-3.engine.design.md`
> 작성 기준: **추정 금지** — 모든 인용은 file:line 실측 및 엔진 설계 동결 타입 기반.

---

## 0. 현행 상태 실측 요약

엔진 설계(`:514~551`)가 UI Phase B 위임 지점 8개를 확정했다.
현행 코드에서 `parties` 관련 필드·렌더·로직은 **0건** (`grep parties ./components ./lib/calc` 확인):
- `shared.tsx:133~141` — `conParties` 없음. `conRelatedRatioPct` (단일 %) 존재.
- `capital-forms.tsx:149~186` — `ContributionFields`에 roster 위젯 없음.
- `gift-deemed-api.ts:153~165` — `contribution` case에 `parties` 변환 없음.
- `gift-deemed-validate.ts:90~93` — `contribution` case에 roster 검증 없음.
- `gift-deemed-input.ts:141~151` — `contributionSchema`에 `parties` 없음.
- `DeemedGiftResultView.tsx:1~179` — `contributionBreakdown` / `grossDeemedGiftValue` 렌더 없음.
- `gift-deemed-api.ts:287~319` — `buildGiftWizardPrefill`에 contribution 분기 없음.

---

## 1. 폼 상태 타입 — ① 동기화 지점

### 신규 필드 정의

파일: `components/calc/deemed-gift/shared.tsx` (`DeemedFormState` 인터페이스)

현행 `conRelatedRatioPct: string` (단일 % 필드, `shared.tsx:140`) 아래에 추가:

```ts
/**
 * 현물출자 당사자 명부 — 3-state (feedback_three_state_optional_mode_toggle):
 *   undefined  = OFF  (현행 gross/relatedRatio 경로 유지)
 *   []         = ON 빈  (validate 차단 — roster 모드 진입했지만 행 없음)
 *   [{...}...] = 데이터
 * low: 증여자(현물출자자 外 전체 기존 주주)
 * high: 수증자(특수관계 기존주주만)
 * 분모 = conPreShares (caseType 무관 공통).
 */
conParties?: Array<{
  /** 당사자 표시명 (빈 문자열 허용 — 결과뷰에서 "주주"로 fallback) */
  name: string;
  /** 현물출자 전 보유 주식수 (CurrencyInput string 규약) */
  shares: string;
  /**
   * 증여자/수증자 관계 (증여세 본세 prefill용).
   * GiftDonorRelation 8종: "father"|"mother"|"grandparent"|"spouse"
   *   |"lineal_descendant"|"sibling"|"other_relative"|"other"
   * 미선택("")이면 prefill 후 증여세 마법사에서 관계 선택 필수.
   */
  relation: GiftDonorRelation | "";
}>;
```

**3-state 원칙** (`feedback_three_state_optional_mode_toggle`):
- `undefined` → 명부 OFF: 기존 gross/relatedRatio 경로 그대로.
- `[]` → 명부 ON 빈: ToggleCard가 ON이지만 행 추가 전 상태. validate 차단.
- `[{...}]` → 명부 ON 데이터: per-party 안분 경로.

**`length>0` 파생으로 ON/OFF 판정 금지** (`feedback_three_state_optional_mode_toggle`).

---

## 2. initial value — ② 동기화 지점

파일: `components/calc/deemed-gift/shared.tsx` (`INITIAL_DEEMED` 객체, `:212~349`)

`INITIAL_DEEMED.conSmallImputation: false` (`:291`) 아래에 추가:

```ts
conParties: undefined,   // OFF (기존 gross 경로 default)
```

---

## 3. normalize fallback — ③ 동기화 지점

sessionStorage에서 복원 시 `conParties`가 누락될 수 있다. 마이그레이션 코드(`lib/stores/calc-wizard-migration.ts`)가 `DeemedFormState`를 직접 처리하지 않으므로, `DeemedGiftCalculator`가 sessionStorage에서 `DeemedFormState`를 복원하는 지점에 `undefined`를 허용하는 normalize 보장 필요.

```ts
// 복원 시 normalize:
conParties: saved.conParties ?? undefined  // undefined 허용 (3-state 보존)
// [] 빈 배열도 그대로 복원 (validate가 차단)
// [{...}] 배열도 그대로 복원
```

> 주의: `conParties=[]`는 "ON 빈" 상태이므로 `undefined`로 변환하지 않는다. 변환하면 3-state 의미가 파괴된다.

---

## 4. API 변환 — ④ 동기화 지점

파일: `lib/calc/gift-deemed-api.ts` (`buildDeemedGiftInput` case `contribution`, `:153~165`)

현행 코드:
```ts
// gift-deemed-api.ts:153~165 현행
case "contribution": {
  const isHigh = form.conCaseType === "high";
  return {
    type: "contribution",
    caseType: form.conCaseType,
    preContribPrice: parseAmount(form.conPrePrice),
    preContribShares: parseAmount(form.conPreShares),
    newSharePrice: parseAmount(form.conNewPrice),
    contributedShares: parseAmount(form.conContributedShares),
    allocatedShares: parseAmount(form.conAllocatedShares),
    relatedRatio: isHigh ? { numer: Math.round(parseDecimal(form.conRelatedRatioPct) * 100), denom: 10_000 } : undefined,
    smallShareholderImputation: !isHigh ? form.conSmallImputation : undefined,
  };
}
```

변경 후:
```ts
case "contribution": {
  const isHigh = form.conCaseType === "high";
  // conParties 3-state: undefined=미전달 / []=빈(validate 차단됨) / [...]=데이터
  const parties: ContributionParty[] | undefined =
    form.conParties === undefined
      ? undefined
      : form.conParties.map((p) => ({
          name: p.name || undefined,          // 빈 문자열 → undefined (엔진이 "주주" fallback)
          preShares: parseAmount(p.shares),
          relation: (p.relation || undefined) as GiftDonorRelation | undefined,
        }));
  return {
    type: "contribution",
    caseType: form.conCaseType,
    preContribPrice: parseAmount(form.conPrePrice),
    preContribShares: parseAmount(form.conPreShares),
    newSharePrice: parseAmount(form.conNewPrice),
    contributedShares: parseAmount(form.conContributedShares),
    allocatedShares: parseAmount(form.conAllocatedShares),
    // 고가·roster無 경로 유지 (기존 CON-H 회귀 보존)
    relatedRatio: isHigh && !form.conParties
      ? { numer: Math.round(parseDecimal(form.conRelatedRatioPct) * 100), denom: 10_000 }
      : undefined,
    smallShareholderImputation: !isHigh ? form.conSmallImputation : undefined,
    parties,   // 엔진 ContributionInput.parties 동결 타입 일치
  };
}
```

**타입 import 추가 필요**: `ContributionParty` from `@/lib/tax-engine/gift-deemed/types`, `GiftDonorRelation` from `@/lib/tax-engine/types/inheritance-gift.types`.

**3중 패턴** (`mirror-pattern`):
- `conParties=undefined` → `parties=undefined` (OFF 경로, relatedRatio 유지)
- `conParties=[]` → validate가 차단하므로 도달 불가 (방어적으로 `parties=[]` 전달 가능, 엔진도 parties=[] 을 validate로 차단)
- `conParties=[{...}]` → `parties=[{...}]`

---

## 5. UI 입력 위젯 — ⑤ 동기화 지점 (핵심 신규 구현)

파일: `components/calc/deemed-gift/capital-forms.tsx` (`ContributionFields` 함수, `:149~186`)

### 5-1. 컴포넌트 구조

```
ContributionFields
├── RadioCardGroup: 저가(①1호) / 고가(①2호) 선택 (tone=violet, layout=inline) — 기존 유지
├── CurrencyInput: 현물출자 전 1주당 평가가액 — 기존 유지
├── CurrencyInput: 현물출자 전 발행주식총수 — 기존 유지
├── CurrencyInput: 신주 1주당 인수가액 — 기존 유지
├── CurrencyInput: 현물출자 주식수 — 기존 유지
├── CurrencyInput: 배정받은 신주수(low) / 인수 신주수(high) — 기존 유지
│
├── [저가(low) 전용] ToggleCard: 소액주주 1인 의제 (§39의3②) — 기존 유지
│
├── [고가(high) + roster無] FieldCard: 현물출자자 특수관계인 지분비율 % — 기존 유지
│   (conParties===undefined 일 때만 표시)
│
└── [NEW] RosterToggleSection: 당사자 명부 (저가/고가 공통)
    ├── ToggleCard: "당사자 명부 사용" (tone=violet, checked=conParties!==undefined)
    │   onCheckedChange: ON=set({conParties:[]}), OFF=set({conParties:undefined})
    │   description: 저가="증여자(현물출자자 外 기존 주주)별로 증여이익을 안분합니다 (조심2010서3741)"
    │                고가="수증자(특수관계 기존주주)별로 과세이익을 분리합니다 (상증령 §29의3①2호)"
    │
    └── [conParties !== undefined] 명부 입력 영역 (violet 박스)
        ├── 각 행: PartyRow (name + shares + relation)
        ├── "주주 추가" 버튼
        ├── 합계 주식수 echo (Σ / conPreShares)
        └── 경고: Σ > conPreShares 시 rose 경고 문구
```

### 5-2. 활성화 조건

| 조건 | 표시 내용 |
|---|---|
| `conParties === undefined` | ToggleCard OFF: 기존 gross / relatedRatio 경로 |
| `conParties !== undefined` (저가) | ToggleCard ON: 증여자 명부 violet 박스 + 각 행 입력 |
| `conParties !== undefined` (고가) | ToggleCard ON: 수증자 명부 violet 박스 + 각 행 입력 + 기존 지분비율 % 숨김 |

**고가(high) roster有이면 `conRelatedRatioPct` 필드를 숨긴다** (per-donee 경로로 전환).

### 5-3. ToggleCard 세부 스펙

```tsx
<ToggleCard
  tone="violet"
  checked={form.conParties !== undefined}
  onCheckedChange={(on) => {
    if (on) {
      set({ conParties: [] });           // ON: [] (빈 배열 — validate 차단 상태)
    } else {
      set({ conParties: undefined });    // OFF: undefined (gross 경로 복귀)
    }
  }}
  title={isHigh
    ? "수증자(특수관계 기존주주) 명부 사용"
    : "증여자(현물출자자 外 기존 주주) 명부 사용"}
  description={isHigh
    ? "수증자별로 과세이익을 분리합니다 — 상증령 §29의3①2호"
    : "증여자별로 이익을 안분합니다 — 조세심판원 조심2010서3741·상증법 §47"}
/>
```

OFF에도 violet 배경 유지 (`feedback_tailwind_static_tone_mapping`).

**useEffect → store 미러링 금지** (`feedback_useeffect_store_mirror_forbidden`):
`conParties` ON/OFF는 위 `onCheckedChange`의 `set()` 직접 호출만. `useEffect`로 store의 다른 필드를 미러링하지 않는다.

### 5-4. 명부 행 (PartyRow) 상세

```tsx
// 명부 활성 시 렌더 (conParties !== undefined)
<div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
  <p className="text-xs font-semibold text-violet-700">
    {isHigh ? "수증자(특수관계 기존주주) 명부" : "증여자(현물출자자 外 주주) 명부"}
  </p>

  {/* 행 목록 */}
  {(form.conParties ?? []).map((party, idx) => (
    <div key={idx} className="rounded border border-violet-100 bg-white/60 p-2 space-y-1.5">
      {/* 섹션 번호 + 삭제 버튼 행 */}
      <div className="flex items-center justify-between">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
          {idx + 1}
        </span>
        <button type="button" onClick={() => removeParty(idx)}
          className="text-xs text-rose-500 hover:text-rose-700">삭제</button>
      </div>

      {/* 이름 (선택) */}
      <div className="space-y-1">
        <label className="block text-xs text-violet-700">
          {isHigh ? "수증자 이름" : "증여자 이름"} (선택)
        </label>
        <input
          type="text"
          className="w-full rounded border border-violet-200 px-2 py-1 text-xs"
          value={party.name}
          onChange={(e) => updateParty(idx, { name: e.target.value })}
          placeholder={isHigh ? "예: B 주주 (생략 가능)" : "예: A 주주 (생략 가능)"}
        />
      </div>

      {/* 보유 주식수 */}
      <CurrencyInput
        label={isHigh ? "현물출자 전 보유 주식수" : "현물출자 전 보유 주식수"}
        value={party.shares}
        onChange={(v) => updateParty(idx, { shares: v })}
        hint="분모 = 현물출자 전 발행주식총수"
      />

      {/* 관계 (RadioCardGroup) — native radio 금지 */}
      <div className="space-y-1">
        <label className="block text-xs text-violet-700">
          {isHigh ? "수증자와 현물출자자의 관계" : "증여자 관계"} (증여세 본세 prefill용, 선택)
        </label>
        <RadioCardGroup
          name={`con-party-relation-${idx}`}
          tone="violet"
          layout="inline"
          value={party.relation}
          onChange={(v) => updateParty(idx, { relation: v as GiftDonorRelation | "" })}
          options={[
            { value: "", label: "미지정", testId: `con-party-relation-${idx}-none` },
            { value: "father", label: "부", testId: `con-party-relation-${idx}-father` },
            { value: "mother", label: "모", testId: `con-party-relation-${idx}-mother` },
            { value: "grandparent", label: "조부모", testId: `con-party-relation-${idx}-grandparent` },
            { value: "spouse", label: "배우자", testId: `con-party-relation-${idx}-spouse` },
            { value: "lineal_descendant", label: "직계비속", testId: `con-party-relation-${idx}-lineal_descendant` },
            { value: "sibling", label: "형제자매", testId: `con-party-relation-${idx}-sibling` },
            { value: "other_relative", label: "기타친족", testId: `con-party-relation-${idx}-other_relative` },
            { value: "other", label: "기타", testId: `con-party-relation-${idx}-other` },
          ]}
          // GiftDonorRelation 8종 1:1 정합 (sibling 포함):
          //   father|mother|grandparent|spouse|lineal_descendant|sibling|other_relative|other.
          //   폼(§1 conParties.relation)·Zod(§9 contributionSchema.parties.relation)·엔진(ContributionParty.relation)
          //   8종이 동일. 교재 사례1의 B(C의 형제자매)는 sibling 필요.
        />
      </div>
    </div>
  ))}

  {/* 추가 버튼 */}
  <button
    type="button"
    data-testid="con-party-add"
    onClick={() => addParty()}
    className="w-full rounded border border-violet-300 bg-violet-50 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
  >
    + {isHigh ? "수증자 추가" : "증여자 추가"}
  </button>

  {/* 합계 주식수 echo */}
  {(form.conParties ?? []).length > 0 && (
    <div className="text-right text-xs text-violet-700 font-mono tabular-nums">
      합계: {formatKRW(totalPartyShares)} / {formatKRW(parseAmount(form.conPreShares))} 주
    </div>
  )}

  {/* 경고: Σ > preContribShares */}
  {parseAmount(form.conPreShares) > 0
    && totalPartyShares > parseAmount(form.conPreShares) && (
    <p className="text-xs text-rose-600">
      당사자 보유 주식수 합계가 현물출자 전 발행주식총수를 초과합니다.
    </p>
  )}
</div>
```

**헬퍼 함수 (ContributionFields 내부)**:
```ts
const totalPartyShares = (form.conParties ?? []).reduce(
  (s, p) => s + parseAmount(p.shares), 0
);
const addParty = () => set({
  conParties: [...(form.conParties ?? []), { name: "", shares: "", relation: "" }]
});
const removeParty = (idx: number) => set({
  conParties: (form.conParties ?? []).filter((_, i) => i !== idx)
});
const updateParty = (idx: number, patch: Partial<typeof form.conParties[0]>) => set({
  conParties: (form.conParties ?? []).map((p, i) => i === idx ? { ...p, ...patch } : p)
});
```

**`name` 이름 입력 필드**: `<input type="text">` 직접 작성 (SelectOnFocusProvider가 전역 처리하므로 `onFocus` 수동 추가 불필요 — `components/calc/CLAUDE.md`).

### 5-5. testId 목록

| 요소 | testId |
|---|---|
| 명부 ToggleCard | `con-roster-toggle` |
| 행 추가 버튼 | `con-party-add` |
| 행 N 이름 입력 | `con-party-${idx}-name` |
| 행 N 주식수 | `con-party-${idx}-shares` |
| 행 N 관계 라디오 | `con-party-relation-${idx}-${value}` |
| 행 N 삭제 | `con-party-${idx}-delete` |
| 결과뷰 breakdown 표 | `deemed-contribution-breakdown` |
| 결과뷰 gross echo | `deemed-contribution-gross` |
| 결과뷰 amber 경고 | `deemed-contribution-roster-warning` |

---

## 6. 사이드바 합계 — ⑥ 동기화 지점

**해당 없음** — 의제 단일값(`deemedGiftValue`) 사이드바는 기존 표시 로직 그대로. 당사자 명부는 중간 입력 상태이므로 사이드바 합계 노출 불필요. `N/A`.

---

## 7. 결과 카드 — ⑦ 동기화 지점

파일: `components/calc/results/DeemedGiftResultView.tsx`

### 7-1. 신규 렌더 블록 위치

기존 `result.breakdown` 테이블(`:48~64`) 아래, `result.subGifts` 블록(`:67~96`) **위**에 삽입.

### 7-2. grossDeemedGiftValue echo 표시

```tsx
{/* §39의3 현물출자 — gross echo */}
{result.grossDeemedGiftValue !== undefined && (
  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
    <span>증여재산가액 총액 (상증령 §29의3①1호, 안분 전)</span>
    <span
      className="font-mono tabular-nums whitespace-nowrap"
      data-testid="deemed-contribution-gross"
    >
      {formatKRW(result.grossDeemedGiftValue)}
    </span>
  </div>
)}
```

### 7-3. amber 경고 — roster無 시 "gross=과세표준 아님" 안내

조건: `result.type === "contribution"` AND `result.grossDeemedGiftValue !== undefined`
AND `result.deemedGiftValue === result.grossDeemedGiftValue`
AND **`result.contributionBreakdown === undefined`** (roster 미제공)

```tsx
{result.type === "contribution"
  && result.grossDeemedGiftValue !== undefined
  && result.contributionBreakdown === undefined && (
  <div
    className="mt-2 rounded border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-700"
    data-testid="deemed-contribution-roster-warning"
  >
    당사자 명부를 입력하지 않았습니다. 표시된 증여이익은 법문(상증령 §29의3①1호)의
    전체 증여재산가액이며, 현물출자자 본인의 지분을 포함합니다.
    실제 과세표준은 증여자별 안분(조심2010서3741·상증법 §47) 후 결정됩니다.
    당사자 명부를 입력하면 각 증여자별 과세이익이 자동 계산됩니다.
  </div>
)}
```

### 7-4. contributionBreakdown per-party 표

조건: `result.contributionBreakdown && result.contributionBreakdown.length > 0`

```tsx
{result.contributionBreakdown && result.contributionBreakdown.length > 0 && (
  <div
    className="rounded-lg border border-violet-200 bg-violet-50/40 p-4"
    data-testid="deemed-contribution-breakdown"
  >
    <p className="text-sm font-semibold text-violet-800">
      {result.type === "contribution"
        ? (/* low/high 구분은 result.caseType echo로 판정 (M2 — gross 대소비교 금지:
              고가 roster有도 gross(base) >= Σper-donee 성립 → gross 비교 시 오판) */
           result.caseType === "high"
           ? "수증자별 과세이익 명세 (상증령 §29의3①2호)"
           : "증여자별 안분 명세 (상증법 §47 · 조심2010서3741)")
        : "당사자별 명세"}
    </p>

    <table className="mt-2 w-full text-sm">
      <thead>
        <tr className="text-xs text-violet-700 border-b border-violet-200">
          <th className="py-1 text-left font-medium">당사자</th>
          <th className="py-1 text-right font-medium">보유 주식수</th>
          <th className="py-1 text-right font-medium">비율</th>
          <th className="py-1 text-right font-medium">과세이익 (원)</th>
        </tr>
      </thead>
      <tbody>
        {result.contributionBreakdown.map((row, i) => (
          <tr key={i} className="border-t border-violet-100">
            <td className="py-1.5 pr-2 text-muted-foreground">
              {row.party}
            </td>
            {/* amount-column-align: font-mono tabular-nums 우측정렬 */}
            <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
              {row.preShares.toLocaleString("ko-KR")}
            </td>
            <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-xs text-muted-foreground">
              {row.ratioLabel}
            </td>
            <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-medium">
              {formatKRW(row.value)}
            </td>
          </tr>
        ))}
        {/* 합계 행 */}
        <tr className="border-t-2 border-violet-300 font-semibold">
          <td className="py-1.5 pr-2 text-violet-800">합계</td>
          <td />
          <td />
          <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-violet-900">
            {formatKRW(result.deemedGiftValue)}
          </td>
        </tr>
      </tbody>
    </table>

    {/* gross echo (roster有 저가 — gross > deemedGiftValue 시) */}
    {result.grossDeemedGiftValue !== undefined
      && result.grossDeemedGiftValue > result.deemedGiftValue && (
      <p className="mt-2 text-xs text-muted-foreground">
        증여재산가액 총액 (법문 §29의3①1호, 현물출자자 자기지분 포함):
        <span className="ml-1 font-mono tabular-nums">
          {formatKRW(result.grossDeemedGiftValue)}
        </span>
        — 현물출자자 본인의 기존 보유 지분({formatKRW(result.grossDeemedGiftValue - result.deemedGiftValue)})은
        자기 증여에 해당하여 과세 제외 (상증법 §47 · 조심2010서3741).
      </p>
    )}

    {/* 법령 note */}
    <div className="mt-3 space-y-1 border-t border-violet-100 pt-2 text-xs text-muted-foreground">
      <p>증여시기: 현물출자 납입일 (상증법 §39의3① 본문)</p>
      <p>최대주주 할증평가 배제: 상증령 §53⑧3호</p>
      <p>증여자 연대납부의무 면제: 상증법 §4의2⑥ 단서</p>
      <p>중복배제: 상증법 §43① / 1년 동일거래 합산: 상증법 §43② · 상증령 §32의4 6호</p>
    </div>
  </div>
)}
```

**법령 note는 GIFT.* 상수 사용** — 결과뷰에서 문자열 직접 기입은 임시 표기이며, Do 단계에서 `GIFT.CONTRIBUTION_TIMING` 등 상수(`lib/tax-engine/legal-codes/inheritance-gift.ts` 신규 4개 상수)로 대체. 결과뷰 컴포넌트가 `GIFT` 상수를 import하는 패턴은 기존 다른 결과뷰 참조.

**금액 정렬** (`amount-column-align`): 모든 금액 셀 `text-right font-mono tabular-nums whitespace-nowrap`.

**BesshiRow 재사용 고려**: 현재 `DeemedGiftResultView`의 breakdown 테이블은 `<tr>` 직접 렌더 패턴 사용 (`:48~64`). contribution 명부 표도 동일 패턴으로 구현한다. `BesshiRow`는 §38 신고서 표 전용이므로 재사용보다 인라인 `<tr>` 패턴이 적합.

### 7-5. "증여세 본세로 계산" 버튼 — 고가 multi-수증자 UX

기존 `onToGiftTax` 버튼(`:165~173`) 로직 연동:

- **저가** (roster有): 버튼 클릭 → `buildGiftWizardPrefill`이 N 증여자 동시증여 prefill. 버튼 문구는 "이 금액으로 증여세 계산하기 →" 유지.
- **고가** (roster有, N 수증자): 결과뷰에 수증자별 금액 리스트 표시 후, 각 수증자 행에 "이 수증자로 증여세 계산" 버튼 추가. **multi-수증자 자동 N-건 UX는 Phase B 설계 확정** (본 PR은 단건 수증자 prefill까지만 — plan.md §6 결정 4).

---

## 8. Validation — ⑧ 동기화 지점

파일: `lib/calc/gift-deemed-validate.ts` (`validateDeemedInput` case `contribution`, `:90~93`)

현행:
```ts
case "contribution":
  if (parseAmount(form.conPrePrice) <= 0) return "현물출자 전 1주당 평가가액을 입력하세요";
  if (parseAmount(form.conPreShares) <= 0) return "현물출자 전 발행주식총수를 입력하세요";
  break;
```

변경 후 (roster 검증 추가):
```ts
case "contribution":
  if (parseAmount(form.conPrePrice) <= 0) return "현물출자 전 1주당 평가가액을 입력하세요";
  if (parseAmount(form.conPreShares) <= 0) return "현물출자 전 발행주식총수를 입력하세요";
  // 명부 ON 빈 배열 차단 (feedback_no_silent_apportion_fallback)
  if (form.conParties !== undefined) {
    if (form.conParties.length === 0)
      return "당사자 명부를 사용하려면 주주를 1명 이상 추가하세요";
    for (const [i, p] of form.conParties.entries()) {
      if (parseAmount(p.shares) <= 0)
        return `${i + 1}번째 당사자의 보유 주식수를 입력하세요`;
    }
    const totalShares = form.conParties.reduce((s, p) => s + parseAmount(p.shares), 0);
    const preContribShares = parseAmount(form.conPreShares);
    if (preContribShares > 0 && totalShares > preContribShares)
      return "당사자 보유 주식수 합계가 현물출자 전 발행주식총수를 초과합니다";
  }
  break;
```

**UI 통과 ↔ validate 차단 모순 0**: UI에서 roster ON + 빈 배열이면 "주주를 1명 이상 추가하세요" 인라인 힌트 표시 + validate 동일 메시지. Σshares 초과는 UI에서 rose 경고 + validate 동일 차단.

**fallback 3중 패턴** (`feedback_validation_sync_8th_point`):
- `conParties=undefined` → validate도 undefined 허용 (기존 gross 경로 통과)
- `conParties=[]` → validate 차단 (빈 배열 금지)
- `conParties=[{...}]` → validate Σshares 검증

---

## 9. Zod 스키마 — ⑨ 동기화 지점

파일: `lib/validators/gift-deemed-input.ts` (`contributionSchema`, `:141~151`)

현행 `contributionSchema` 아래 `parties` 추가 + `deemedGiftInputSchema`의 `.superRefine`에 contribution 분기 추가:

```ts
// contributionSchema 변경
const contributionSchema = z.object({
  type: z.literal("contribution"),
  caseType: z.enum(["low", "high"]).optional(),
  preContribPrice: z.number().nonnegative(),
  preContribShares: z.number().positive({ message: "현물출자 전 발행주식총수는 0보다 커야 합니다" }),
  newSharePrice: z.number().nonnegative(),
  contributedShares: z.number().nonnegative(),
  allocatedShares: z.number().nonnegative(),
  relatedRatio: ratioSchema.optional(),
  smallShareholderImputation: z.boolean().optional(),
  // ── 신규: parties 3-state ──
  parties: z.array(
    z.object({
      name: z.string().optional(),
      preShares: z.number().nonnegative({ message: "보유 주식수는 0 이상이어야 합니다" }),
      relation: z.enum([
        "father", "mother", "grandparent", "spouse",
        "lineal_descendant", "sibling", "other_relative", "other",
      ]).optional(),
    })
  ).optional(),
});
```

```ts
// deemedGiftInputSchema .superRefine에 contribution 분기 추가
if (data.type === "contribution" && data.parties !== undefined) {
  // 빈 배열 차단
  if (data.parties.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["parties"],
      message: "당사자 명부를 사용하려면 주주를 1명 이상 추가하세요",
    });
  }
  // Σshares ≤ preContribShares
  const totalPartyShares = data.parties.reduce((s, p) => s + p.preShares, 0);
  if (totalPartyShares > data.preContribShares) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["parties"],
      message: "당사자 보유 주식수 합계가 현물출자 전 발행주식총수를 초과합니다",
    });
  }
}
```

**discriminatedUnion 제약**: `contributionSchema` 자체에 `.superRefine()` 불가 (ZodEffects → discriminatedUnion 불가). union 전체 `.superRefine`에 `data.type === "contribution"` 분기로 처리한다. 이 패턴은 `freeRealEstateSchema`(`:254~269`) 기존 선례와 동일.

---

## 10~14. API/Route 지점 — ⑩~⑭

| 지점 | 위치 | 변경 내용 |
|---|---|---|
| ⑩ Zod enum 컴패니언 | `gift-deemed-input.ts:141~151` | `parties` 추가 — ⑨에서 완료 |
| ⑪ 자산-수준 날짜 fallback | 해당 없음 — 현물출자 날짜 필드 없음(기존 `giftDate` 공통) | N/A |
| ⑫ `buildGiftWizardPrefill` | `lib/calc/gift-deemed-api.ts:287~319` | contribution 분기 신설 (아래 §10-1) |
| ⑬ API body spread | `gift-deemed-api.ts buildDeemedGiftInput` | ④에서 완료 (parties spread) |
| ⑭ Route handler 엔진 input 매핑 | `app/api/calc/gift-deemed/route.ts:42·62` | Zod 스키마 자동 통과 → 엔진 직달. Date 변환 필드 없음. 변경 없음. |

### 10-1. ⑫ buildGiftWizardPrefill — contribution 분기 신설

파일: `lib/calc/gift-deemed-api.ts` (`buildGiftWizardPrefill` 함수, `:287~319`)

현행 `trust_benefit` 분기(`:295~306`) 아래, 최종 fallback return(`:308~318`) 위에 삽입:

```ts
// contribution 저가: N 증여자 → 동시증여 다건 prefill
if (result.type === "contribution" && result.contributionBreakdown && result.contributionBreakdown.length > 0) {
  // M2 — 저가/고가 판정은 명시값으로. gross 대소비교 휴리스틱 금지:
  //   고가 roster有도 gross(=base) >= Σper-donee 과세 가 성립 → grossDeemedGiftValue >= deemedGiftValue 가
  //   고가에서도 참이라 저가로 오판 → 동시증여 prefill로 잘못 라우팅됨.
  //   prefill은 form 수신이므로 form.conCaseType 우선, 보조로 result.caseType echo.
  const isLow = form.conCaseType !== "high";

  if (isLow) {
    // 저가: N 증여자 → 동시증여 메커니즘 재사용 (calcSimultaneousGifts, §46①2호)
    // 1건(현물출자자 수증자 본인) + simultaneousGifts([증여자별])
    // trust_benefit subGifts prefill (gift-deemed-api.ts:295~306) 패턴 차용
    const mainBreakdown = result.contributionBreakdown[0];
    const restBreakdowns = result.contributionBreakdown.slice(1);

    // GiftDonorRelation → DonorRelation 변환 (gift-deemed-api.ts 책임)
    // isMinorDonee는 결과에 없으므로 false fallback (증여세 마법사에서 수정 가능)
    const toDonorRelation = (r?: GiftDonorRelation): DonorRelation =>
      r ? deriveDonorRelation(r, false) : "other_relative";

    // simultaneousGifts 배열: 나머지 증여자별 taxableValue + donorRelation
    const simultaneousGifts = restBreakdowns.map((bd) => ({
      donorRelation: toDonorRelation(bd.relation),
      taxableValue: String(bd.value),
    }));

    return {
      giftDate: form.giftDate,
      donorRelation: toDonorRelation(mainBreakdown.relation),
      giftItems: [
        {
          id: `deemed-contribution-${mainBreakdown.party}`,
          category: "other" as const,
          name: `현물출자에 따른 이익 — ${mainBreakdown.party} 증여분`,
          marketValue: mainBreakdown.value,
        },
      ],
      // 동시증여 — 나머지 N-1 증여자
      simultaneousGifts: simultaneousGifts.length > 0 ? simultaneousGifts : undefined,
    };
  }

  // 고가: 수증자 첫 행 단건 prefill (multi-수증자 N-건 자동화는 Phase B)
  const firstDonee = result.contributionBreakdown[0];
  return {
    giftDate: form.giftDate,
    // 고가: 현물출자자가 증여자. relation은 "수증자→현물출자자" 관계이므로
    // 증여세 마법사는 donorRelation 기준으로 공제 산출 → deriveDonorRelation 적용
    donorRelation: deriveDonorRelation(firstDonee.relation ?? "other", false),
    giftItems: [
      {
        id: `deemed-contribution-high-${firstDonee.party}`,
        category: "other" as const,
        name: `현물출자에 따른 이익 — ${firstDonee.party} 수증자분`,
        marketValue: firstDonee.value,
      },
    ],
  };
}
```

**다중 giftItems 단순 합산 금지** (`plan.md §6 결정 4`):
저가 증여자들은 §47상 서로 다른 증여자 → 동일인 합산 불가. 반드시 첫 건은 메인 신고, 나머지는 `simultaneousGifts`로 분리.

**동일인 그룹 가드**: `relation` 미지정(`""`) 시 `other_relative`로 fallback → 증여세 마법사 Step 0에서 `donorRelation` 수정 필요. `calcSimultaneousGifts` 내부의 `mergeSameDonorGroupGifts`가 실제 동일인 감지 → 경고 발생 시 마법사에서 사용자 안내.

**`deriveDonorRelation` import**: `lib/calc/prior-gift-donee-derive.ts:101` — 현재 `gift-deemed-api.ts`에 이미 import됨(`:7` `toOptionalDate` 등과 함께). 미import 시 import 추가.

---

## 11. 케이스 매트릭스 (14 동기화 지점 × 4 케이스)

| 케이스 | ① FormData | ② initial | ③ normalize | ④ API 변환 | ⑤ 위젯 | ⑦ 결과뷰 | ⑧ validate | ⑨ Zod | ⑫ prefill |
|---|---|---|---|---|---|---|---|---|---|
| 저가 roster無 | `conParties=undefined` | `undefined` | `undefined` 허용 | `parties=undefined` | ToggleCard OFF | gross=deemedValue, amber 경고 | `undefined` 통과 | `parties=undefined` OK | 기존 단건 `category:"other"` |
| 저가 roster有 (CASE-1) | `conParties=[A,B]` | — | 배열 복원 | `parties=[{name,preShares,relation}]` | ToggleCard ON + 행 2개 | breakdown 표, gross echo, 법령 note | Σ≤preShares OK | superRefine OK | N 증여자 동시증여 prefill |
| 저가 roster ON 빈 | `conParties=[]` | — | `[]` 복원 | validate 차단 전 | ToggleCard ON, 행 0개 | 미도달 | "주주 1명 이상 추가" 차단 | superRefine 차단 | 미도달 |
| 고가 roster有 (CASE-2) | `conParties=[B,C]` | — | 배열 복원 | `parties=[...]` | ToggleCard ON + 지분비율 % 숨김 | per-donee breakdown 표 | Σ≤preShares OK | superRefine OK | 수증자 첫 행 단건 prefill |

---

## 12. 정책 점검 (Do 착수 전 자가 체크)

| 정책 | 적용 근거 |
|---|---|
| `feedback_three_state_optional_mode_toggle` | `conParties`: undefined/[]/[...] 3-state. `length>0` 파생 금지. |
| `feedback_no_silent_apportion_fallback` | roster無 시 gross만 표시 + amber 경고. 자동 안분 금지. |
| `feedback_useeffect_store_mirror_forbidden` | `conParties` ON/OFF는 `onCheckedChange` → `set()` 직접 호출. `useEffect` 금지. |
| `feedback_engine_result_map_json_loss` | `contributionBreakdown`은 배열(엔진 설계 동결). Map 금지. |
| `feedback_no_internal_id_in_result` | `row.party`는 `name.trim() \|\| "주주"` (엔진이 생성, 뷰는 그대로 표시). |
| `feedback_validation_sync_8th_point` | API 변환 parties=undefined 허용 → validate도 동일 허용. parties=[] → 양쪽 차단. |
| `feedback_tailwind_static_tone_mapping` | ToggleCard tone="violet" — 정적 violet 색 (동적 `bg-${tone}-50` 금지). |
| `amount-column-align` | breakdown 표 금액 셀 `text-right font-mono tabular-nums whitespace-nowrap`. |
| `mirror-pattern` | `conParties` ↔ prefill: onChange/변환함수. `useEffect→store` 미러링 금지. |
| `feedback_korean_law_citation_verify` | §53⑧3호·§4의2⑥·§43①② — 엔진 설계에서 KoreanLaw MCP 검증 완료(계획서 §3). |
| `feedback_tax_calculation_principle` | 유불리·절감 표현 금지. 법령 사실만 서술. |

---

## 13. 변경 파일 목록 (Do 단계)

| 파일 | 지점 | 변경 성격 |
|---|---|---|
| `components/calc/deemed-gift/shared.tsx` | ①② | `DeemedFormState.conParties?` 추가, `INITIAL_DEEMED` 초기값 |
| `components/calc/deemed-gift/capital-forms.tsx` | ⑤ | `ContributionFields` 위젯 확장 (ToggleCard + 명부 입력) |
| `lib/calc/gift-deemed-api.ts` | ④⑫ | `buildDeemedGiftInput` parties 변환, `buildGiftWizardPrefill` contribution 분기 |
| `lib/calc/gift-deemed-validate.ts` | ⑧ | `contribution` case roster 검증 |
| `lib/validators/gift-deemed-input.ts` | ⑨ | `contributionSchema.parties` + superRefine |
| `components/calc/results/DeemedGiftResultView.tsx` | ⑦ | gross echo, amber 경고, breakdown 표, 법령 note |

**③ normalize**: `DeemedGiftCalculator`가 sessionStorage를 복원하는 지점 확인 후 `conParties ?? undefined` 패턴 적용 (파일 위치는 Do 단계에서 실측).

---

## 14. Definition of Done (UI 전용)

- [ ] `DeemedFormState.conParties?` 3-state 타입 추가 (①②)
- [ ] `INITIAL_DEEMED.conParties = undefined` (②)
- [ ] `ContributionFields` ToggleCard + PartyRow 구현 — native checkbox/radio 0건 (⑤)
- [ ] 고가 roster有 시 `conRelatedRatioPct` % 필드 숨김 (⑤)
- [ ] `buildDeemedGiftInput` contribution case `parties` 매핑 (④)
- [ ] `buildGiftWizardPrefill` contribution 분기 — 저가 동시증여, 고가 단건 (⑫)
- [ ] `validateDeemedInput` contribution case roster 검증 (⑧) — UI 통과↔validate 차단 모순 0
- [ ] `contributionSchema.parties` + superRefine (⑨)
- [ ] `DeemedGiftResultView` gross echo + amber 경고 + breakdown 표 + 법령 note (⑦)
- [ ] 금액 칸 `font-mono tabular-nums` 우측정렬 (amount-column-align)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift-deemed/` 전건 통과 (CON-1·CON-H·IMP-CON 불변)
- [ ] E2E `e2e/gift-deemed-capital.spec.ts` 저가 roster 입력→결과뷰 per-party 표·gross echo→증여세 handoff→동시증여 N개 prefill 확인 1 happy-path
- [ ] 브라우저(또는 E2E) 확인: 저가 roster ON, 행 추가, 계산, breakdown 표, amber 경고 OFF 확인
