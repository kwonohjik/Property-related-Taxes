# 상속세 사전증여 수증자 단일화 — UI 디자인 문서

> Plan: `docs/00-pm/inheritance-prior-gift-donee-redesign.plan.md`
> Design: `docs/02-design/features/inheritance-prior-gift-donee-redesign.design.md`
> 대상: `components/calc/prior-gift/GiftRowEditor.tsx` (상속세 모드 `showIsHeir=true` 전용)

---

## 0. 디자인 원칙

- 엔진/폼 키 변경 0 — UI 재배치 + 파생 4필드 자동 set + 매핑 헬퍼 2종.
- 도메인 규칙: 증여인=피상속인(고정·비노출), 수증인=Step1 heirs 중 `doneeId` 단일 선택.
- 증여세 모드(`showGiftPhaseA=true`) 무영향 — 본 변경은 상속세 모드 한정.
- ToggleCard/select 기존 컴포넌트 재사용, native 신규 금지.

---

## 1. 사용자 시나리오

### S1 — 상속인(배우자)에게 사전증여 (정상 흐름)
1. 사전증여 행 추가 → 증여일 입력
2. **수증자 select**에서 "배우자 (김마누라)" 선택
3. → ④ 요약 배지 자동 표시: "배우자 (김마누라) · 상속인 · §13①1호 10년 합산"
4. → `isHeir=true`·`beneficiaryType=heir`·`doneeRelation=spouse` 자동 set (숨김)
5. 증여재산가액·기납부 증여세 입력 → 결과 ② 인별 배부에 배우자 열 반영

### S2 — 비상속인(수유자)에게 사전증여
1. 수증자 select에서 "수유자 (홍손녀딸) — 비상속인" 선택
2. → ④ 요약: "수유자 (홍손녀딸) · 비상속인 · §13①2호 5년 합산"
3. → `isHeir=false`·`beneficiaryType=legatee` 자동

### S3 — 수증자 미선택 (인별 배부 생략·합산만)
1. 수증자 select "선택 안 함" 유지
2. → ⑤ "상속인에게 증여" 토글 + ⑥ "수증인과의 관계" select 노출 (수동)
3. → ② 인별 배부 0 + sky 안내 ("수증자 지정 시 ② 반영")

### S4 — 영리법인 수증자
1. 영리법인 토글 ON → 수증자 select·요약·⑤⑥ 전부 숨김
2. `CorporateGiftFields`(자체 doneeId·산출세액) 입력 (기존 동작 무변경)

### S5 — heirs 0 (Step1 상속인 미입력)
1. 수증자 select 미노출 → ⑤⑥ 수동 경로 (S3과 동일 fallback)

### S6 — orphan: 수증자 선택 후 Step1에서 삭제
1. doneeId 남고 매칭 Heir 사라짐
2. → ④' amber 안내: "지정한 수증자가 상속인 목록에서 삭제됨 — 다시 선택하세요" + select value=""

### S7 — 회귀: 증여세 모드
1. `showGiftPhaseA=true` → doneeId/요약/⑤ 없음, doneeRelation select가 §53 핵심 입력으로 유지

---

## 2. UI 위젯 명세 — `GiftRowEditor.tsx` 상속세 모드

### 2-1. 렌더 순서 (영리법인 OFF)

```
헤더 (증여 N · 삭제 · 이력/영리법인 배지)
① 영리법인 토글 (showIsHeir)                            [기존, 위치 유지]
② 증여일                                                [기존]
③ 수증자 select (doneeId) ─────────────────── 【신규 위치: 증여일 직하】
   data-testid="gift-donee-select"
   options: heirs.filter(h => h.relation !== "corporate")
   value: matchedHeir ? gift.doneeId : ""
   ├─ doneeId+matchedHeir: ④ 요약 배지 (violet, read-only)
   ├─ doneeId+!matchedHeir: ④' orphan amber 안내
   └─ !doneeId: ⑤ + ⑥
       ⑤ isHeir 토글 "상속인에게 증여"  [기존, ⑥보다 위로 이동]
       ⑥ doneeRelation select "수증인과의 관계"  [기존, ③ 위치에서 ⑤ 아래로 이동]
⑦ 증여재산가액                                          [기존]
⑧ 기납부 증여세                                          [기존]
⑨ 부표1 메타                                            [기존]
```

### 2-2. ③ 수증자 select (신규 최상단)

```tsx
{showIsHeir && !isCorporate && (heirs ?? []).length > 0 && (() => {
  const matchedHeir = (heirs ?? []).find((h) => h.id === gift.doneeId);
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
        수증자 (상속인·수유자)
      </label>
      <select
        data-testid="gift-donee-select"
        value={matchedHeir ? gift.doneeId : ""}
        onChange={(e) => handleDoneeSelect(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">선택 안 함 (인별 배부 생략)</option>
        {(heirs ?? [])
          .filter((h) => h.relation !== "corporate")   // 영리법인 제외 (토글 전담)
          .map((h) => (
            <option key={h.id} value={h.id}>
              {HEIR_RELATION_LABEL[h.relation]}{h.name ? ` (${h.name})` : ""}
              {isNonHeirRelation(h.relation) ? " — 비상속인" : ""}
            </option>
          ))}
      </select>
      {/* ④ / ④' / 안내 — 아래 2-3 */}
    </div>
  );
})()}
```

### 2-3. ④ 요약 배지 / ④' orphan 안내 / 미선택 안내

```tsx
{gift.doneeId && matchedHeir && (
  <div data-testid="gift-donee-summary"
       className="rounded-md bg-violet-50 dark:bg-violet-900/20 border border-violet-200 px-3 py-2 text-[11px] text-violet-700 dark:text-violet-300">
    {HEIR_RELATION_LABEL[matchedHeir.relation]}
    {matchedHeir.name ? ` (${matchedHeir.name})` : ""}
    {" · "}
    {deriveBeneficiaryTypeFromHeir(matchedHeir) === "heir" ? "상속인 · §13①1호 10년 합산" : "비상속인 · §13①2호 5년 합산"}
  </div>
)}
{gift.doneeId && !matchedHeir && (
  <p data-testid="gift-donee-orphan" className="text-[11px] text-amber-600 dark:text-amber-400">
    ⚠️ 지정한 수증자가 상속인 목록에서 삭제되었습니다 — 수증자를 다시 선택하세요.
  </p>
)}
{!gift.doneeId && (
  <p className="text-[11px] text-sky-600 dark:text-sky-400">
    ⓘ 수증자를 지정하면 상속인별 배부표 ② 사전증여 열에 반영됩니다. (미지정 시 합산만)
  </p>
)}
```

### 2-4. ⑤ isHeir 토글 + ⑥ doneeRelation select (미선택 시에만, ⑤가 위)

```tsx
{showIsHeir && !isCorporate && !gift.doneeId && (
  <>
    {/* ⑤ 상속인에게 증여 — doneeRelation보다 위 (2차검토 G) */}
    <ToggleCard
      tone="violet"
      title="상속인에게 증여"
      description="상속인: 10년 이내 합산 (§13①1호) / 비상속인: 5년 이내 합산 (§13①2호)"
      checked={gift.isHeir}
      onCheckedChange={(v) => set({ isHeir: v, beneficiaryType: v ? "heir" : "legatee" })}
    />
    {/* ⑥ 수증인과의 관계 (§53 제안) */}
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">수증인과의 관계</label>
      <select
        value={gift.doneeRelation ?? ""}
        onChange={(e) => set({ doneeRelation: (e.target.value || undefined) as DonorRelation | undefined })}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ...">
        <option value="">선택</option>
        {DONOR_RELATION_LIST.map((r) => <option key={r} value={r}>{DONOR_RELATION_LABELS[r]}</option>)}
      </select>
    </div>
  </>
)}
```

> ⚠️ ⑤ 토글 onChange에서 `beneficiaryType`도 동시 set (isHeir↔beneficiaryType 일관 — 수동 경로에서도 엔진 우월 키 동기화).

### 2-5. 영리법인 토글 ON 시

기존 `isCorporate` 가드로 ③④⑤⑥ 전부 숨김, `CorporateGiftFields`만. 무변경.

### 2-6. `doneeRelation` select 모드별 위치 분리 (13차 검토 R)

기존 `GiftRowEditor.tsx:209-238`의 **무조건 노출 `doneeRelation` select**(증여일 직후·상단)는 모드별로 위치가 달라야 하므로 **두 블록으로 분리** (상호 배타 — 중복 렌더 없음):

| 모드 | 위치 | 렌더 조건 |
|---|---|---|
| **증여세** (`showGiftPhaseA`) | 증여일 직후 (기존 위치 유지) | `showGiftPhaseA` |
| **상속세 미선택** (`showIsHeir`) | ⑤ isHeir 토글 아래 (2-4) | `showIsHeir && !isCorporate && !gift.doneeId` |

- 두 조건은 `showGiftPhaseA`(=gift 모드)와 `showIsHeir`(=inheritance 모드)가 `PriorGiftInput.tsx:186-187`에서 상호 배타이므로 동시 참 불가 → 한 행에 doneeRelation select는 **항상 1개만** 렌더.
- 기존 218행 select의 `disabled={isCorporate}` 가드: 증여세 모드는 isCorporate 항상 false(영리법인 토글은 showIsHeir 전용)이므로 무영향. 상속세 모드는 `!isCorporate` 조건으로 이미 숨김 → disabled 불필요.
- 구현: 기존 select 블록을 `showGiftPhaseA` 가드로 감싸 증여일 직후 유지 + 상속세용 사본을 ⑤ 아래 신규 배치(2-4).

### 2-7. 신규 행 초기값 (13차 검토 Q)

`handleAdd`(`PriorGiftInput.tsx`) 신규 사전증여 행의 `isHeir`·`doneeId`·`beneficiaryType` 초기값은 **기존 동작 보존**. 신규 행은 `doneeId` 미설정 → ⑤ 토글 + ⑥ select 노출. ⑤ 토글 기본 상태 = 기존 `gift.isHeir` 초기값(변경 없음).

---

## 3. 14 동기화 지점 매트릭스

| # | 지점 | 변경 | 비고 |
|---|---|---|---|
| ① 폼 상태 | PriorGift | 무변경 | doneeId·isHeir·beneficiaryType·doneeRelation 기존 |
| ② initial | handleAdd 신규 행 | 무변경 | 기존 초기값 |
| ③ normalize | — | 무변경 | |
| ④ API 변환 | callInheritanceTaxAPI | 무변경 | estateItems/priorGifts 그대로 |
| ⑤ **UI 위젯** | **GiftRowEditor** | **★변경** | 순서·조건부·요약·헬퍼 (본 문서) |
| ⑥ 사이드바 | — | 무변경 | 사전증여 합계는 giftAmount 기반 |
| ⑦ 결과 카드 | HeirAllocationSummaryTable | 무변경 | doneeId per-heir 배부 기존 동작 |
| ⑧ validation | inheritance-validate | 무변경 | "선택 안 함" 차단 안 함 |
| ⑨~⑭ Zod·route | priorGiftSchema | 무변경 | 4필드 이미 정의(strip 없음) |

> ⑤만 변경 — 엔진/타입/API/Zod 무영향 (실측 확인).

---

## 4. 케이스 매트릭스 (입력 분기 전수)

| # | 시나리오 | doneeId | matchedHeir | isCorporate | 노출 | testid |
|---|---|---|---|---|---|---|
| U1 | 배우자 선택 | spouse Heir | O | false | ③+④요약 | gift-donee-select, gift-donee-summary |
| U2 | 수유자 선택 | legatee Heir | O | false | ③+④요약(비상속인) | 동상 |
| U3 | 미선택 | "" | — | false | ③+⑤토글+⑥select | gift-donee-select |
| U4 | 영리법인 | — | — | true | 영리법인 토글만 | (CorporateGiftFields) |
| U5 | heirs 0 | "" | — | false | ⑤+⑥ (③ 미노출) | — |
| U6 | orphan | 삭제된 id | X | false | ③+④' amber | gift-donee-orphan |
| U7 | 증여세 모드 | — | — | — | doneeRelation 항상 | (showGiftPhaseA) |

---

## 5. 접근성·UX

- ③ select: `aria-label` 또는 연결 label "수증자 (상속인·수유자)".
- ④ 요약 배지: read-only(`<div>`), violet tone, 파생값이므로 별도 state 없음(doneeId 변경 시 자동 재계산).
- ④' orphan: amber tone, 재선택 유도 문구.
- ⑤ ToggleCard OFF도 violet tone 유지 (토글 가시성 원칙).
- SelectOnFocusProvider 전역 적용 — 개별 onFocus 불필요.

---

## 6. anchor (디자인 문서 A1~A8과 1:1)

| anchor | testid/대상 | 검증 |
|---|---|---|
| A1 | deriveDoneeRelationFromHeir | 7종 매핑 |
| A2 | deriveBeneficiaryTypeFromHeir | Heir 객체, isHeir 일관 |
| A3 | gift-donee-select (U1·U2) | 선택 → 4필드 set + 요약 |
| A4 | U3·U5 | 미선택 → ⑤(위)·⑥(아래) 순서 |
| A5 | §53 제안 | doneeId 경로 doneeRelation 반영 |
| A6 | U4 | corporate select 제외 + 토글 |
| A7 | U7 | 증여세 모드 doneeRelation 유지 |
| A8 | gift-donee-orphan (U6) | orphan amber + value="" |
