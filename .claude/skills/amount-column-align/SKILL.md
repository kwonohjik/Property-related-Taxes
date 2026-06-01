---
name: amount-column-align
description: 모든 결과 화면·신고서 양식·평가조서·표·PDF에서 금액(원) 숫자 칸을 고정폭(font-mono)+tabular-nums+우측정렬로 표시해 천·백만·십억 단위 콤마가 세로로 정확히 정렬되게 하는 표준. 비례 글꼴에서 1/8 폭 차이로 콤마가 어긋나는 문제를 차단. 신규 금액 표·보고서 작성 시 항상 적용.
trigger: 금액 정렬, 콤마 정렬, 숫자 정렬, 세로 정렬, 천단위 콤마, 백만단위, 십억단위, tabular-nums, font-mono, 우측정렬, text-right, 결과 카드 표, 신고서 금액, 평가조서 금액, 보고서 표, 표 금액, amount align, comma align, number column, 숫자 칸, formatKRW, toLocaleString, 자릿수 정렬, 금액 표시
---

# amount-column-align — 금액 숫자 칸 정렬 표준

세금 앱이 출력하는 **모든 금액(원) 칸**(결과 화면·신고서 양식·평가조서·산출근거 표·PDF)에서, 천(`,xxx`)·백만(`,xxx,xxx`)·십억(`x,xxx,xxx,xxx`) 단위 **콤마가 세로로 같은 위치**에 떨어지게 하는 표준. 신규 표·보고서를 작성할 때마다 적용한다.

## 적용 시점

- 신규 결과 카드·상세 표·신고서 양식(별지 N호)·평가조서에 **금액 열**을 추가할 때
- `toLocaleString("ko-KR")` / `formatKRW()` / `fmt()` 로 포맷한 금액을 여러 행에 표시하는 모든 표
- react-pdf 문서의 금액 셀
- 사용자가 "콤마가 안 맞는다 / 자릿수가 어긋난다 / 숫자 정렬" 류 피드백을 줄 때

## 왜 어긋나는가 (본 정책의 원인)

기본 본문 글꼴은 **비례 글꼴(proportional)** — `1`이 `8`보다 좁다. 우측정렬만 하면 자릿수가 다른 행끼리 같은 단위의 콤마가 미세하게 어긋난다. `tabular-nums`(OpenType `tnum`)는 글꼴이 지원할 때만 등폭이 되며, 한국어 글꼴 fallback 환경에서는 적용이 안 될 수 있다.

→ **고정폭(`font-mono`)** 을 함께 줘서 **숫자와 콤마 모두 동일 폭**으로 강제하면 우측정렬 시 콤마가 항상 세로 정렬된다.

## ✅ 표준 패턴 — HTML(화면)

금액 셀(`<td>`/`<div>`)에 아래 4개 클래스를 함께 적용:

```tsx
<td className="text-right font-mono tabular-nums whitespace-nowrap">
  {amount > 0 ? amount.toLocaleString("ko-KR") : "—"}
</td>
```

| 클래스 | 효과 |
|---|---|
| `text-right` | 우측 끝 정렬 → 자릿수 달라도 1의 자리부터 정렬 |
| `font-mono` | **모든 글자(숫자·콤마) 동일 폭** — 핵심 |
| `tabular-nums` | `font-variant-numeric: tabular-nums` 보강 |
| `whitespace-nowrap` | 줄바꿈으로 자리 밀림 방지 |

우측정렬 + 등폭이면 같은 단위 콤마가 우측에서 동일 offset(`,` = 4·8·12번째)에 떨어져 **자동으로 세로 일치**한다. (글자 크기는 표의 `text-sm` 등 단일 값을 상속받아 일치시킨다 — 금액 칸만 별도 크기 주지 말 것.)

## ✅ 표준 패턴 — react-pdf(PDF)

```ts
// besshi-pdf-styles.ts 의 cellAmount 재사용
cellAmount: { width: 100, padding: 3, fontSize: 8, textAlign: "right" }
```

PDF는 `textAlign: "right"` + 고정 `width` 셀로 우측정렬. 폰트는 `BESSHI_FONT_STACK`(NanumGothic) — 숫자 폭이 거의 등폭이라 우측정렬로 충분하나, 어긋나면 숫자 전용 등폭 폰트 fallback 추가.

## 포맷 규칙 (함께 강제)

- 천단위 콤마: `n.toLocaleString("ko-KR")` 또는 `formatKRW(n)`.
- **"원" 미표기** ([[feedback_no_won_suffix]]) — 숫자 끝에 "원" 붙이지 않음.
- 0 처리: 의미상 0이면 `"0"`, 구조적 미배부/미해당이면 `"—"`(dash). 빈칸은 빈 셀.
- 세율 등 비금액(%)도 같은 셀에서 우측정렬 유지 (정렬 깨짐 방지).

## 공용 컴포넌트 (재사용 — 재구현 금지)

신규 신고서/표는 아래 공용 렌더러를 우선 재사용:

- **`components/calc/results/shared/BesshiRow.tsx`** (`BesshiRow`·`BesshiColumn`) — 별지 제9·10호 양식 금액 행. 금액 셀이 이미 본 패턴 적용. ([[besshi-form-replica]]와 함께)
- `HeirAllocationSummaryTable` 등 기존 표는 `tabular-nums` 기반 — 콤마 어긋남 보고 시 `font-mono` 추가로 마이그레이션.

직접 표를 만들 때도 금액 셀에 위 4개 클래스를 그대로 적용한다.

## anchor 패턴

CSS 정렬이므로 픽셀 검증 대신 **클래스 적용**을 anchor로 고정:

```tsx
it("금액 칸 고정폭 + 우측정렬 — 콤마 세로 정렬 보장", () => {
  render(<MyReport ... />);
  const amtCell = screen.getByTestId("row-⑰").querySelector("td:last-child");
  expect(amtCell?.className).toContain("font-mono");
  expect(amtCell?.className).toContain("text-right");
});
```

## 안티패턴 체크리스트

- ❌ `text-right` 만 적용(font-mono 없음) → 비례 글꼴에서 콤마 어긋남
- ❌ `tabular-nums` 단독 → 글꼴 미지원 시 무효
- ❌ 금액 칸마다 다른 `text-xs`/`text-sm` 혼용 → 글자 크기 불일치
- ❌ 좌측정렬·가운데정렬 금액 → 자릿수 정렬 불가
- ❌ 숫자 끝 "원" 표기 → 폭 흔들림 + [[feedback_no_won_suffix]] 위반
- ❌ 금액 셀을 표마다 새로 구현 → `BesshiRow`/공용 패턴 미재사용

## 적용 체크리스트

- [ ] 금액 셀 `text-right font-mono tabular-nums whitespace-nowrap` 적용
- [ ] 금액 글자 크기는 표 단일 값 상속(별도 크기 미지정)
- [ ] `toLocaleString("ko-KR")`/`formatKRW`, "원" 미표기
- [ ] 0/미해당은 `"0"`/`"—"` 일관 처리
- [ ] PDF는 `textAlign:"right"` + 고정 width
- [ ] 공용 `BesshiRow`/`BesshiColumn` 재사용 가능 시 직접 구현 금지
- [ ] 클래스 anchor 1건 이상

## 실제 사례

- `components/calc/results/shared/BesshiRow.tsx` 금액 셀(커밋 `0187183`): `text-right tabular-nums` → `text-right font-mono tabular-nums whitespace-nowrap`. 별지 제9·10호 양식 금액의 천·백만·십억 콤마가 세로 정렬됨. anchor `FilingForm9CoverSection.test.tsx`에서 `font-mono`·`text-right` 클래스 검증.

## 관련 정책

- ★ [[besshi-form-replica]] — 신고서 양식 금액 칸은 본 패턴 + BesshiRow 재사용
- ★ [[formula-display-builder]] — 산출근거 산식 표시도 금액 우측정렬 일관 적용
- ★ feedback_no_won_suffix — "원" 미표기
- ★ [[print-only-css-toggle]] — 같은 표가 인쇄/PDF로 출력될 때 정렬 유지
