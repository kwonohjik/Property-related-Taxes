# 사전증여 수증자 "기타" 분류 수정 — UI 설계

> Plan: [prior-gift-donee-classification-fix.plan.md](./prior-gift-donee-classification-fix.plan.md) · Engine: [.engine.design.md](./prior-gift-donee-classification-fix.engine.design.md)
> 동기화 지점: 8지점 중 **⑤ UI 단독** (Heir.isHeir는 기존 타입 — ①②③④⑧ 무변경. 단 엔진 게이트 1건 deductions:457은 anchor 실증 후 별도 판단)

---

## 1. HeirEditor — "상속인 여부" ToggleCard (신규 위젯)

**노출 조건**: `heir.relation === "other" && !heir.substituteGroupId` (대습상속인 제외 — 항상 상속인)
**배치**: 관계 선택 그리드 직후, "기타" 전용 입력 영역 최상단 (UI 순서 = 판정 로직 순서 — isHeir가 §13·법정상속분의 선행 게이트)

```
┌─ ToggleCard (tone=violet) ────────────────────────────────┐
│ ◉━━○  상속인 여부                                          │
│ ON: 민법상 상속인 (4촌 이내 방계혈족 등) — §13①1호 10년 합산 │
│ OFF: 비상속인 (며느리·사위 등) — §13①2호 5년 합산           │
└───────────────────────────────────────────────────────────┘
```

```tsx
<ToggleCard
  tone="violet"
  title="상속인 여부"
  description="ON: 민법상 상속인(4촌 이내 방계혈족 등) — §13①1호 10년 합산 · 법정상속분 포함 / OFF: 비상속인(며느리·사위 등) — §13①2호 5년 합산"
  checked={deriveIsHeirFromHeir(heir)}          // ★ derive 기반 — undefined(기존 데이터)=ON 표시
  onCheckedChange={(v) => set({ isHeir: v })}   // HeirEditor 기존 set 헬퍼(:207) — 명시값 set (미러링 아님)
/>
```

- ★ `checked={heir.isHeir === true}` **금지** — 기존 "기타"(undefined=추론 상속인)가 OFF로 표시되어 표시↔실제 모순 ([[feedback_store_default_vs_ui_display_fallback]]).
- `deriveIsHeirFromHeir`는 `lib/calc/prior-gift-donee-derive.ts` import ([[single-source-engine-helper]] — 재구현 금지).
- testid: `heir-isheir-toggle` (E2E용).

## 2. HeirComposition — "기타" 추가 기본값

`handleAdd(relation)` (`:152`): `relation === "other"`일 때만 `isHeir: false` 포함.

```tsx
const newHeir: Heir = {
  id: generateHeirId(),
  relation,
  ...(relation === "other" ? { isHeir: false } : {}),  // 기타 = 기본 비상속인 (T-1)
};
```

`handleAddSubstitute`(`:161`) **무변경** — 대습은 isHeir 미설정(추론 상속인).

## 3. changeHeirRelation — isHeir 전이 (engine.design §2)

공통 영역(대습 필드 정리 블록 `:102-107` 인접)에 진입 false / 이탈 undefined. UI 파급: 관계 그리드에서 자녀→기타 클릭 즉시 토글 OFF 상태로 노출(T-3).

## 4. GiftRowEditor — 수증자 select 라벨 동기화

`:264`: `isNonHeirRelation(h.relation)` → `!deriveIsHeirFromHeir(h)` 교체 (corporate 제외 조건 `h.relation !== "corporate"` 유지).

| 수증자 | 현행 옵션 라벨 | 수정 후 |
|---|---|---|
| 기타(isHeir=false) 윤며느리 | "기타 (윤며느리)" (suffix 없음 ✗) | "기타 (윤며느리) — 비상속인" ✓ |
| 기타(토글 ON, true) 사촌 | "기타 (사촌)" | "기타 (사촌)" (suffix 없음 = 상속인) ✓ |
| 대습(undefined) | "기타 (…)" | 동일 (상속인) ✓ |
| 수유자 | "수유자 — 비상속인" | 동일 ✓ |
| 영리법인 | "영리법인 (…)" | 동일 (corporate 제외 조건) ✓ |

교체 후 `isNonHeirRelation` import 제거 (UI 사용처 0 — 실측. --fix 함정: 한 라인 한 named).
요약 배지(`:282`)·`PriorGiftTableView`는 이미 derive 기반 — **무변경 자동 추종**.

## 5. HeirTableView — "기타" 행 비상속인 배지 (선택)

"기타" 행(비대습)에 `deriveIsHeirFromHeir(h)===false`일 때 작은 배지 "비상속인" (slate tone). 대습·다른 관계 미표시. 우선순위 낮음 — Do에서 여유 시.

## 6. GiftRowEditor — 모달 하단 "증여가액" 요약 삭제 (이슈 2)

- 파일 끝 `{/* 요약 미리보기 */}` 블록(`gift.giftAmount > 0 && <div>…formatKRW…</div>`) 삭제.
- `formatKRW` import 제거 (사용처 해당 블록 단일 — 실측).
- 카드/모달 공통 렌더 → 증여세 모드 포함 전체 삭제. 사이드바 `AggregationSummary`가 합계 대체.

## 7. E2E 시나리오

| # | 시나리오 | 검증 |
|---|---|---|
| E-1 | Step0 "기타" 추가 → 편집 모달 토글 OFF 기본 → Step3 수증자 선택 | 요약 배지 "비상속인 · §13①2호 5년 합산" + select "— 비상속인" suffix |
| E-2 | 토글 ON 후 Step3 수증자 선택 | 배지 "상속인 · §13①1호 10년 합산" |
| E-3 | 모달에 "증여가액" 요약 부재 | `getByText("증여가액")` count 0 (모달 scope) |

기존 회귀: `prior-gift-table-view.spec.ts`·`inheritance-prior-gift-donee.spec.ts`(자녀 수증 — 무영향 기대) + 대습 spec.

## 8. 동기화 자가 점검

- [ ] ①폼·②initial·③normalize — 무변경 (Heir.isHeir 기존 optional 필드)
- [ ] ④API — 무변경 (heirs 배열 그대로 전달)
- [ ] ⑤UI — §1~§6 본 작업
- [ ] ⑥사이드바 — 무변경
- [ ] ⑦결과 카드 — 무변경 (배부표는 엔진 isHeir 게이트 기존 추종)
- [ ] ⑧validation — 무변경 (`:336` 기존 동작 유지, plan 영향지점 #9)
