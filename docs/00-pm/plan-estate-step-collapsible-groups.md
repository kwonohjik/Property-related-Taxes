# 계획서 — 상속재산 단계 그룹별 접기/펼치기 버튼

> 작성일: 2026-06-08 · 대상: 상속세 마법사 "상속재산" 단계 (`steps.tsx` 의 `Step1`)
> 요청: 상속재산 목록·주식/지분 목록·추정상속재산 §15 3개 그룹에 접기/펼치기 버튼 추가

---

## 1. 인터뷰 결정 사항 (2026-06-08)

| 항목 | 결정 |
|---|---|
| 기본 상태 | **모두 펼침** (처음 진입 시 3그룹 다 펼침) |
| 접음 헤더 요약 | **항목 개수 + 합계** (예: "상속재산 목록 (3건 · 12억)") |
| 상태 유지 | **로컬 상태(useState)** — 단계 이동/새로고침 시 기본(펼침) 복귀 |
| 적용 범위 | **상속재산 단계 3그룹만** — 공용화 행위 최소화 |

---

## 2. 현황 실측 (코드 기준)

### 2.1 대상 컴포넌트 — `components/calc/inheritance/steps.tsx:173` `Step1`
3개 그룹의 **제목 위치가 제각각**:

| 그룹 | 본문 컴포넌트 | 제목·설명 위치 |
|---|---|---|
| ① 상속재산 목록 | `PropertyValuationForm` | **컴포넌트 내부** ("상속재산 목록" / "주식·지분은 아래…") |
| ② 주식·지분 목록 | `StockValuationForm` | **컴포넌트 내부** ("주식·지분 목록" / "상장주식과…") |
| ③ 추정상속재산 §15 | `PresumedInheritanceInput` | **steps.tsx** (`<h3>추정상속재산 §15</h3>` + 설명, `:196~205`) |

→ 접기 버튼을 일관되게 두려면 **제목을 헤더 컴포넌트로 통일**해야 함. ①② 는 내부 제목을 숨기는 prop이 필요.

### 2.2 합계 데이터 — `lib/stores/inheritance-summary.ts`
- `computeInheritanceSummary` 는 estate+stock 을 **합쳐서** valuation 추정 후 reduce (`:127~136`). **그룹별 분리 합계 없음.**
- valuation 추정 map 함수(estate/stock 공통)와 `presumedItems.reduce` 가 이미 존재 → **그룹별 합계로 분리 재사용 가능**.
- 추정상속재산: `form.presumedItems` 의 금액 합.

### 2.3 데이터 출처
- `form.estateItems: EstateItem[]`, `form.stockItems: EstateItem[]`, `form.presumedItems: PresumedInheritanceItem[]` (모두 zustand store)
- 접기 시 본문을 unmount해도 입력값은 store에 보존됨 (본문 컴포넌트는 store 기반) — 단 안전하게 **CSS `hidden`(display:none)** 으로 처리해 내부 로컬 포커스/상태 소실 방지.

---

## 3. 설계안

### 3.1 신규 컴포넌트 — `components/calc/inheritance/CollapsibleEstateGroup.tsx`
상속재산 단계 전용 접기/펼치기 래퍼. (적용 범위 결정에 따라 상속세 내부 전용, 공용 디렉터리 승격 안 함.)

```tsx
interface CollapsibleEstateGroupProps {
  title: string;             // "상속재산 목록"
  description?: ReactNode;    // 부제 (링크 포함 가능)
  count: number;             // 항목 개수
  totalAmount: number;       // 합계(원) — 0이면 요약에서 금액 생략
  defaultOpen?: boolean;     // 기본 true
  children: ReactNode;
}
```

- 헤더: `▸/▾` 아이콘 + 제목 + (접힘 시) 요약 배지 "N건 · X" — `amount-column-align` 불필요(인라인 텍스트), 금액은 한국어 단위 축약(억/만) 또는 콤마.
- 헤더 버튼: `aria-expanded`, `data-testid="estate-group-toggle-{key}"`, 키보드 접근.
- 본문: `<div className={open ? "block" : "hidden"}>` (CSS 토글, unmount 안 함).
- 펼친 상태에서도 요약 표시 여부: **펼치면 본문에 다 보이므로 요약 숨김**, 접으면 요약 표시. (결정: 접음 헤더만 요약)

### 3.2 제목 통일 — 내부 제목 숨김 prop 추가
- `PropertyValuationForm` 에 `hideHeader?: boolean` 추가 → 내부 "상속재산 목록" 제목/설명 미렌더.
- `StockValuationForm` 에 `hideHeader?: boolean` 추가 → 내부 "주식·지분 목록" 제목/설명 미렌더.
- `steps.tsx` 에서 제목/설명을 `CollapsibleEstateGroup` 의 `title`/`description` 으로 끌어올림.
- 추정상속재산은 이미 steps.tsx 에 제목 있음 → 그대로 `CollapsibleEstateGroup` 으로 감쌈.

> 대안(범위 최소): 내부 제목 유지 + 컴포넌트 헤더 우측에 접기 토글만 삽입. 그러나 ①②③ 헤더 마크업이 제각각이라 3곳을 각각 수정해야 하고 요약 배지 위치가 불균일 → **제목 끌어올림 안을 권고**.

### 3.3 그룹별 합계 헬퍼 — `lib/stores/inheritance-summary.ts` 에 export 추가
```ts
// valuation 추정 로직(기존 computeInheritanceSummary 내부 map)을 분리/재사용
export function sumEstateItemsValuation(items: EstateItem[]): number
// 사용처: estate / stock 각각 호출. presumed 는 호출처에서 reduce 또는 전용 헬퍼.
export function sumPresumedItems(items: PresumedInheritanceItem[]): number
```
- 기존 `computeInheritanceSummary` 가 동일 로직을 쓰도록 내부에서도 이 헬퍼 재사용(중복 제거, 단일 출처).

### 3.4 `Step1` 조립 (steps.tsx)
```tsx
const estateTotal = useMemo(() => sumEstateItemsValuation(form.estateItems), [form.estateItems]);
const stockTotal  = useMemo(() => sumEstateItemsValuation(form.stockItems), [form.stockItems]);
const presumedTotal = useMemo(() => sumPresumedItems(form.presumedItems), [form.presumedItems]);

<CollapsibleEstateGroup title="상속재산 목록" description={<>주식·지분은 아래 <span…>주식평가</span> 섹션에 별도 입력</>}
  count={form.estateItems.length} totalAmount={estateTotal}>
  <PropertyValuationForm hideHeader … />
</CollapsibleEstateGroup>

<CollapsibleEstateGroup title="주식·지분 목록" description="상장주식과 비상장주식을 구분하여 입력하세요"
  count={form.stockItems.length} totalAmount={stockTotal}>
  <StockValuationForm hideHeader … />
</CollapsibleEstateGroup>

<CollapsibleEstateGroup title="추정상속재산 §15" description="상속개시 전 2년 이내…"
  count={form.presumedItems.length} totalAmount={presumedTotal}>
  <PresumedInheritanceInput … />
</CollapsibleEstateGroup>
```

---

## 4. 영향 범위 / 동기화

- **엔진 input·result 변경 없음** → 14지점 중 ⑤(UI 위젯)만 해당. ②③④⑧ 등 무관.
- 신규 export 헬퍼(`sumEstateItemsValuation`·`sumPresumedItems`)는 사이드바 합계와 **동일 valuation 로직 공유**(드리프트 방지).
- `PropertyValuationForm`·`StockValuationForm` 의 `hideHeader` 는 optional → 다른 세목(증여 등) 사용처는 무변경(기존 헤더 유지).

---

## 5. 작업 항목

1. `lib/stores/inheritance-summary.ts`: `sumEstateItemsValuation`·`sumPresumedItems` 추출·export, `computeInheritanceSummary` 내부 재사용
2. `CollapsibleEstateGroup.tsx` 신규 (접기 토글 + 요약 배지 + a11y + testid)
3. `PropertyValuationForm`·`StockValuationForm`: `hideHeader` prop 추가
4. `steps.tsx Step1`: 3그룹을 `CollapsibleEstateGroup` 으로 조립, 제목 끌어올림
5. anchor: 합계 헬퍼 단위 테스트(개수·합계) + 기존 사이드바 합계 회귀 불변 확인
6. `npx tsc --noEmit` + `npx vitest run __tests__/calc/ __tests__/tax-engine/inheritance/`
7. E2E(`feedback_browser_verify_with_playwright`): 그룹 접기 → 본문 hidden·요약 표시 → 펼치기 spec

---

## 6. 확인 요청 / 잔여 의문

- **금액 요약 표기**: 접음 헤더 합계를 "12억" 같은 한국어 축약 vs "1,200,000,000" 콤마 — 어느 쪽? (권고: 헤더는 가독성 위해 **억/만 축약**, 정확 금액은 펼침 본문·사이드바에 이미 있음)
- **요약 "건수"** 기준: 주식 그룹은 종목 카드 수, 추정상속은 4유형 중 입력된 항목 수로 카운트 — 현 데이터 배열 length 기준이면 충분한지.
- 위 2건은 구현 중 합리적 기본값(억/만 축약, 배열 length)으로 진행 가능 — 별도 지시 없으면 권고안 적용.
