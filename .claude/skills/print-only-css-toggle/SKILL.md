---
name: print-only-css-toggle
description: '결과 화면 펼침/접힘 토글에서 인쇄 시 자동 펼침을 useEffect·isPrinting 상태 추적 없이 CSS-only로 구현. `className={open ? "block" : "hidden print:block"}` 단일 패턴 + 토글 버튼은 `print:hidden`. 다크모드 강제 흰 배경과 함께 PDF 출력 품질 직결.'
trigger: print 자동 펼침, 인쇄 시 펼침, print:block, hidden print:block, isPrinting 추적, useEffect 인쇄, 인쇄 미디어쿼리, window.print, PDF 출력 펼침, 토글 인쇄
---

# print-only-css-toggle — 인쇄 자동 펼침 CSS-only 패턴

결과 화면의 사용자 토글(펼침/접힘) 카드가 인쇄(PDF 출력) 시 **자동으로 펼쳐져야** 할 때, `useState`·`useEffect`·`isPrinting` 상태 추적 없이 **Tailwind print: variant만으로** 해결하는 표준 패턴.

## 적용 시점

- 결과 화면에 펼침 토글로 감춰진 카드가 있고, 인쇄 시 그 카드도 함께 출력해야 할 때
- `window.print()` / PDF 인쇄 시 사용자가 미리 토글을 열지 않으면 누락되는 영역 차단
- 양식 컴포넌트(`besshi-form-replica` 등)를 카드 안에 감싸는 패턴

## 적용 금지

- 토글 카드가 인쇄에 포함될 필요가 없는 경우 — `print:hidden`만 적용
- 동적 콘텐츠가 인쇄 시점에 fetch되어야 하는 경우 — useEffect 필요할 수 있음 (별도 패턴)

## 안티패턴 (본 정책의 원인)

다음은 모두 ❌ — 본 패턴으로 대체.

### ❌ A1. useEffect + isPrinting 상태

```tsx
const [isPrinting, setIsPrinting] = useState(false);

useEffect(() => {
  const beforePrint = () => setIsPrinting(true);
  const afterPrint = () => setIsPrinting(false);
  window.addEventListener("beforeprint", beforePrint);
  window.addEventListener("afterprint", afterPrint);
  return () => {
    window.removeEventListener("beforeprint", beforePrint);
    window.removeEventListener("afterprint", afterPrint);
  };
}, []);

// 사용:
{(open || isPrinting) && <Card />}
```

**문제**: 보일러플레이트 길고, SSR 호환성 이슈, 매 컴포넌트마다 동일 코드 반복, addEventListener 누수 위험.

### ❌ A2. matchMedia 추적

```tsx
const [isPrint, setIsPrint] = useState(
  () => typeof window !== "undefined" && window.matchMedia("print").matches
);
// ... 더 많은 코드
```

**문제**: SSR-unsafe, hydration mismatch, brittle.

### ❌ A3. 별도 인쇄 전용 컴포넌트 트리

```tsx
<div className="print:hidden">
  {open && <Card />}
</div>
<div className="hidden print:block">
  <Card />
</div>
```

**문제**: 동일 Card를 2번 렌더 → 무거운 컴포넌트는 성능 저하, 중복 props.

## ✅ 표준 패턴 — CSS-only

```tsx
{/* 토글 버튼 — 인쇄 시 자동 숨김 */}
<button
  type="button"
  onClick={() => setOpen((v) => !v)}
  className="... print:hidden"
>
  <span>카드 제목</span>
  {/* 라벨·모양은 ExpandToggleButton 표준 — components/calc/results/shared/ExpandToggleButton.tsx */}
  <span className={expandToggleClass("slate")} aria-hidden>{expandToggleLabel(open)}</span>
</button>

{/* 카드 컨텐츠 — 사용자 토글 + 인쇄 시 강제 펼침 */}
<div className={open ? "block p-4" : "hidden print:block print:p-0"}>
  <ExpensiveCard {...props} />
</div>
```

### 핵심 규칙

| 요소 | 적용 클래스 | 효과 |
|---|---|---|
| 토글 버튼 | `print:hidden` | 인쇄 시 자동 숨김 |
| 카드 컨테이너 (open) | `block` 또는 `block p-4` | 화면에서 표시 + 패딩 |
| 카드 컨테이너 (closed) | `hidden print:block` (+ `print:p-0`) | 화면 숨김, 인쇄 시 강제 표시 |
| 인쇄용 배경 (양식) | `print:bg-white print:text-black` | 다크모드에서도 흰 배경 |

### 동작 원리

`print:` variant는 Tailwind에서 `@media print { ... }`로 컴파일됨. CSS-only이므로:
- React 상태 불필요
- SSR safe (서버에서도 CSS는 그대로 출력)
- 매 컴포넌트마다 보일러플레이트 0
- DOM은 그대로 (조건부 렌더 아님) → 인쇄 시 즉시 표시

## 실제 사례

본 프로젝트 `GiftTaxResultView.tsx` 평가 명세서 카드 (도입 커밋 `56e11ae`, 현행은 ExpandToggleButton 표준 + 가로 스크롤 적용):

```tsx
<div className="border rounded-xl">
  <button
    type="button"
    onClick={() => setShowValuation((v) => !v)}
    className="... print:hidden"
  >
    <span>증여재산 및 평가명세서 (별지 제10호서식 부표 1) — {N}건</span>
    <span className={expandToggleClass("slate")} aria-hidden>{expandToggleLabel(showValuation)}</span>
  </button>
  {showValuation ? (
    <HorizontalScrollContainer hint="← → 좌우 스크롤 또는 thumb 드래그로 모든 컬럼 보기">
      <GiftTaxValuationFormTable {...props} />
    </HorizontalScrollContainer>
  ) : (
    <div className="hidden print:block print:p-0 print:overflow-visible">
      <GiftTaxValuationFormTable {...props} />
    </div>
  )}
</div>
```

→ 사용자가 화면에서 토글 닫아도 `PrintSelectionPanel`의 `선택 항목 인쇄` 클릭 시(해당 카드를 출력 항목으로 선택한 경우 — `PrintSection`) 자동 펼침. useEffect 0줄.

## 추가 패턴 — 인쇄 시 추가 헤더·푸터

인쇄 전용 정보(페이지 번호·법적 고지·로고 등)는 `hidden print:block`:

```tsx
<div className="hidden print:block text-[10px] text-center mt-4">
  ※ 본 출력물은 ... 참고용입니다. 정확한 신고는 ...
</div>
```

(Tailwind에는 `screen:` variant가 없다 — 본 프로젝트 Tailwind v4 실측에서 `screen:hidden`은 CSS를 전혀 생성하지 않아 화면에서도 그대로 노출된다. 반드시 `hidden print:block`을 사용.)

## 인쇄용 추가 정책 (besshi-form-replica와 연관)

| 정책 | 클래스 |
|---|---|
| 다크모드에서도 흰 배경 | `bg-white text-black print:bg-white print:text-black` |
| 인쇄 시 그림자 제거 | `print:shadow-none` |
| 인쇄 시 border 진하게 | `print:border-black` |
| 페이지 분할 방지 | `print:break-inside-avoid` (긴 표) |
| 페이지 강제 분할 | `print:break-before-page` |

## anchor 패턴

CSS-only이므로 unit test로 print 효과 검증은 불가 — 대신:

```tsx
it("hidden 상태에서도 print:block 클래스 적용", () => {
  const { container } = render(<Card open={false} />);
  const cardDiv = container.querySelector('[data-testid="card-container"]');
  expect(cardDiv?.className).toContain("hidden");
  expect(cardDiv?.className).toContain("print:block");
});

it("토글 버튼은 print:hidden", () => {
  const button = screen.getByRole("button", { name: /토글/ });
  expect(button.className).toContain("print:hidden");
});
```

실제 인쇄 효과는 **Playwright E2E**(`e2e/*.spec.ts`)로 검증 — 사용자 수동 확인 안내 금지 ([[feedback_browser_verify_with_playwright]]).

## 안티패턴 체크리스트

- ❌ `useState(isPrinting)` 사용
- ❌ `useEffect`에서 `addEventListener("beforeprint", ...)` 추적
- ❌ `window.matchMedia("print")` SSR-unsafe 호출
- ❌ 동일 카드를 `print:hidden` + `hidden print:block` 2번 렌더
- ❌ 토글 버튼에 `print:hidden` 누락 → 인쇄 시 "▲▼" 표시
- ❌ 인쇄용 다크모드 강제 흰 배경(`print:bg-white print:text-black`) 누락

## 적용 체크리스트

- [ ] 토글 버튼 `print:hidden` 적용
- [ ] 카드 컨테이너 `className={open ? "block" : "hidden print:block"}` 적용
- [ ] (양식인 경우) `print:bg-white print:text-black` 강제 흰 배경
- [ ] useState/useEffect로 isPrinting 추적 코드 0건
- [ ] 클래스명 anchor 1건 이상 (선택적)
- [ ] 인쇄 미리보기 Playwright E2E 검증 (`e2e/*.spec.ts` — 사용자 수동 확인 안내 금지)

## 관련 정책

- ★ [[besshi-form-replica]] — 신고서 양식 컴포넌트에서 본 패턴 함께 활용
- ★ [[formula-display-builder]] — 산출근거 펼침 카드에도 적용 권장
- ★ [[mirror-pattern]] — useEffect → store 금지 정책과 같은 철학 (CSS-first)

## 확장 가능성

- 양도세·상속세·취득세 등 모든 세금 결과 화면의 펼침 카드에 일괄 적용
- 신고서 양식·산출근거·증여공제 상세·재산 평가 내역 등 모든 토글 카드에 표준화
- 기존 useEffect + isPrinting 추적 코드가 발견되면 본 패턴으로 마이그레이션
