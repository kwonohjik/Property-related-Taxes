# §27 단서 대습상속 할증 배제 — UI 설계

> 계획서: `docs/00-pm/inheritance-section27-substitute-inheritance.plan.md`
> 엔진 설계: `docs/02-design/features/inheritance-section27-substitute-inheritance.engine.design.md`
> 작성일: 2026-06-07 / 13단계 자가검토 STEP 12

## Context

§27 단서(대습상속 할증 배제) UI. **입력**: HeirComposition §27 토글 하위 "대습상속" ToggleCard 1개. **출력**: `GenerationSkipFormulaRows` 배제 행 분기. 엔진(`isSubstituteInheritance`·`excludedBySubstitution`)은 엔진 시니어 선행.

---

## 14지점 영향 요약

| 지점 | 작업 | 위험 |
|------|------|------|
| ① 폼 상태 | Heir에 `isSubstituteInheritance`(엔진 타입 공유) | 낮음 |
| ② initial | 신규 heir undefined | 낮음 |
| ③ normalize | boolean → 불요 | — |
| ④ API | heirs spread 자동 | 낮음 |
| ⑤ UI 위젯 | HeirComposition 대습 ToggleCard | 낮음 |
| ⑦ 결과 | GenerationSkipFormulaRows 배제 행 분기 | 중 |
| ⑧ validation | 최소(boolean) | 낮음 |
| ⑨⑩⑫ Zod | heirSchema 1필드 | 낮음 |

---

## ⑤ UI 위젯 — `components/calc/HeirComposition.tsx`

위치: 기존 §27 세대생략 ToggleCard(:265~276) 하위, 미성년 3-state 블록과 동렬.
게이트: `isLegatee && heir.isGenerationSkipBeneficiary` (gen-skip ON일 때만 노출 — SI-05 UI 미도달).

```
{isLegatee && (
  <>
    <ToggleCard ... §27 세대생략 ... checked={isGenerationSkipBeneficiary} />
    {heir.isGenerationSkipBeneficiary && (
      <>
        {/* 신규 — 대습상속 배제 */}
        <ToggleCard
          tone="rose"
          title="대습상속 (민법 §1001) — §27 할증 배제"
          description="손자녀가 사망·결격된 부모(피상속인의 자녀)를 갈음하여 상속하는 경우. ON 시 세대생략 할증(30%·40%) 전액 배제."
          checked={heir.isSubstituteInheritance ?? false}
          onCheckedChange={(v) => set({ isSubstituteInheritance: v || undefined })}
        />
        {/* 기존 미성년 3-state 블록 — 대습 ON 시 할증 자체 배제이므로 미성년 무관(안내만 유지 가능) */}
        {heir.birthDate && autoIsMinor !== null && ( ... )}
      </>
    )}
  </>
)}
```

- 대습 ON 시 미성년 토글은 표시 유지하되 "대습상속이면 할증 배제(미성년 무관)" 보조 안내 권장.
- tone=rose(§27 그룹 일관).

### ★ stale flag 정리 필수 (STEP 13 — 3경로)
`isSubstituteInheritance`는 gen-skip 종속 → 다음 3곳에서 함께 `undefined` 정리(기존 `isMinorOverride` 패턴 미러). 누락 시 gen-skip OFF인데 대습 ON 잔류 → 엔진은 gen-skip OFF라 무해하나, 재-ON 시 stale 대습 부활.
1. `relation → corporate`(:89 블록) — `next.isSubstituteInheritance = undefined`.
2. `relation ≠ legatee`(:101-103 블록) — 동일 추가.
3. §27 토글 OFF(:270-275 onCheckedChange) — `isSubstituteInheritance: v ? heir.isSubstituteInheritance : undefined`.

---

## ⑦ 결과 — `components/calc/results/allocation-breakdown/GenerationSkipFormulaRows.tsx`

배제 행 분기 추가. 현행 `tag = rate%/미성년` → 배제 행은 "대습상속 §27 단서 배제"로, 산식 줄 미표시.

```
detail.rows.map((row, i) => {
  const name = row.heirName?.trim() || LEGATEE_LABEL;
  const prefix = multi ? `${i + 1}. ` : "";
  if (row.excludedBySubstitution) {
    return (
      <Fragment key={row.heirId}>
        <DetailRow label={`${prefix}${name} — 대습상속(민법§1001) §27 단서 배제`} value={formatKRW(0)} />
        <DetailRow label="= 세대생략 할증 미적용 (직계비속이나 대습상속)" value="" indent muted />
      </Fragment>
    );
  }
  // ... 기존 일반 행 (rate% 태그 + 산식 줄)
})
```

- 전원 대습(SI-07): `result.generationSkipDetail` non-null → ⑧ 행 "세대생략 가산액 0" + 배제 행 표시(STEP 6 게이트 확인). 소실 없음.
- multi 합계 행: `detail.total`(배제행 0 제외 합). SI-07은 0.
- 내부 id 노출 금지 — `heirName || LEGATEE_LABEL`.

---

## ⑧ validation — `lib/calc/inheritance-validate.ts`

- 최소. boolean → 검증 불요. 대습 ON인데 gen-skip OFF는 UI에서 미도달(토글 숨김) → 추가 검증 불요.

---

## ⑨⑩⑫ Zod — `lib/validators/property-valuation-input.ts` `heirSchema`(:400)

```
isSubstituteInheritance: z.boolean().optional(),
```
- 단일 `heirSchema`가 메인(:567)·컴패니언(:680) 공용 → 1곳 추가로 ⑨⑩⑫ 충족.

## ④⑬⑭ — heirs spread

- `inheritance-api.ts` heirs 통째 전달(spread) → `isSubstituteInheritance` 자동 흐름. route 매핑 Date 무관. strip 없음 grep 확인.

---

## 위젯 ASCII

```
┌─ 상속인 #2 (손자녀, 수유자) ──────────────┐
│ [rose] §27 세대생략 할증 대상 [ON]          │
│   └ [rose] 대습상속(민법§1001) §27 배제 [ON]│  ← 신규
│   └ 미성년 자동판정: 예 — (대습 시 무관)     │
└─────────────────────────────────────────┘

결과 ⑧ 세대생략 가산액              0
  1. 손자A 유증분 할증 (30%)    50,000,000
  2. 손자B — 대습상속 §27 단서 배제      0
     = 세대생략 할증 미적용(대습상속)
  합계 세대생략 할증세액         50,000,000
```

---

## 14지점 체크 (Do 완료 전)

- [ ] ① Heir `isSubstituteInheritance`(엔진 타입)
- [ ] ② makeEmptyHeir/initial undefined
- [ ] ③ normalize 불요(boolean)
- [ ] ④ heirs spread 확인
- [ ] ⑤ HeirComposition 대습 ToggleCard(isLegatee && gen-skip 게이트)
- [ ] ⑥ 사이드바 해당 없음
- [ ] ⑦ GenerationSkipFormulaRows 배제 행 분기 + 전원 대습 표시(SI-07)
- [ ] ⑧ validation 불요
- [ ] ⑨⑩⑫ heirSchema Zod 1필드
- [ ] `npx tsc --noEmit` 0 + vitest inheritance + E2E

---

## UI 위험·중단 사전 적용

- 800줄: `HeirComposition.tsx` **604줄(STEP 13 실측 — 여유, 분할 불요)**. ② initial은 optional 필드라 undefined 자동(factory 편집 불요).
- ⑦ 배제 행 분기 — `excludedBySubstitution` 미체크 시 "0%" 오표시(STEP 1 핵심). 분기 우선.
- stale 정리 3경로(위 ⑤ §stale flag) — gen-skip 종속 cleanup 누락 금지.
