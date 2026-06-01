# 상속인별 상속세부담액 집계 표 — UI 가독성 3건 수정 계획서

> 대상: 이미지8(상속인별 상속세부담액 집계 표) — 결과 화면 + PDF 섹션
> 원본 양식: 첨부 이미지4 (교재 표8), 현행 구현: 첨부 이미지3
> 작성일: 2026-06-01

## 0. 배경

이미지8은 상속세 결과 화면의 영리법인·세대생략 포함 인별 배부 표다. 첨부 이미지3(앱)은
이미지4(교재 원본)를 재현한 것인데, 사용자가 가독성 문제 3건을 지적했다. 이 표는
**화면 컴포넌트와 PDF 섹션이 동일한 변환 헬퍼**(`buildSummaryTable`·`fmt`·`labelOf`)를
공유하므로, 헬퍼 변경은 양쪽에 동시 반영된다.

## 1. 영향 파일 (3 + 테스트 3)

| 파일 | 역할 | 이슈 1 | 이슈 2 | 이슈 3 |
|---|---|:--:|:--:|:--:|
| `lib/calc/heir-allocation-summary.ts` | 행 매트릭스·라벨·`fmt` (화면+PDF 공유) | ✅ | — | ✅ |
| `components/calc/results/HeirAllocationSummaryTable.tsx` | 화면 표 렌더 | ✅ | ✅ | ✅(파생) |
| `lib/pdf/sections/inheritance-heir-allocation-section.tsx` | PDF 표 렌더 | ✅ | — | ✅(파생) |
| `__tests__/tax-engine/inheritance/heir-allocation-summary-table.test.ts` | 행 개수·라벨 anchor | ✅ | — | ✅ |
| `__tests__/tax-engine/inheritance/summary-table-bugfix-pre-do.test.ts` | 회귀 anchor | △ | — | △ |
| `e2e/inheritance-summary-table.spec.ts` | testid·행 존재 검증 | △ | — | △ |

> `fmt`·`labelOf`는 이 표 전용(다른 세목 미사용) — grep 확인 완료. 영향 범위는 위 6개 파일로 한정.

---

## 2. 이슈 1 — 그룹 맥락 복원 (그룹 헤더 행 삽입)

### 문제
이미지4는 좌측에 **그룹 칼럼(rowSpan)** + **세부 칼럼** 2칼럼 구조다:
- `⑥ 과세표준` → ㉠직접배부 / ㉡간접배부 / ㉢과세표준상당액 계
- `⑩ 상속인(수유자)외 증여세액공제` → ⓐ증여세산출세액 / ⓑ공제한도액 / ⓒ공제할 증여세액
- `⑫ 상속인등의 증여세액공제` → ⓐ / ⓑ / ⓒ

앱은 1칼럼으로 합치면서 그룹명이 소실됐다. `직접배부`만 표시돼 "무엇의 직접배부"인지
불명확하고, ⑩a·⑫a가 둘 다 `증여세 산출세액`으로 동일 라벨이라 상속인외/상속인등 구분이 안 된다.

### 해결 (사용자 결정: 그룹 헤더 행 삽입)
원본과 동일하게 **그룹 헤더 행을 한 줄 삽입**하고 세부행을 들여쓰기한다.

```
⑥ 과세표준                          ← 그룹 헤더 행 (값 없음)
    ㉠ 직접배부
    ㉡ 간접배부
    ㉢ 과세표준상당액 계
⑩ 상속인(수유자)외 증여세액공제        ← 그룹 헤더 행 (값 없음)
    a 증여세 산출세액
    b 공제 한도
    c 공제할 증여세액 = Min(a, b)
⑫ 상속인등의 증여세액공제             ← 그룹 헤더 행 (값 없음)
    a 증여세 산출세액
    b 공제 한도
    c 사전증여세액공제 = Min(a, b)
```

### 변경 상세 — `heir-allocation-summary.ts`

1. **그룹 헤더 행 3개 신설** (`SummaryTableRow`에 `isGroupHeader?: boolean` 플래그 추가):
   - `row-6-group` rowNo `⑥` label `과세표준` (⑥㉠ 직전 삽입)
   - `row-10-group` rowNo `⑩` label `상속인(수유자)외 증여세액공제` (⑩a 직전)
   - `row-12-group` rowNo `⑫` label `상속인등의 증여세액공제` (⑫a 직전)
   - 그룹 헤더 행은 `total: null` + 전 인별 `headerOnly()` (값 칸 전부 빈칸).

2. **기존 세부행 rowNo 단축** — 그룹 번호가 헤더로 분리되므로:
   - `row-6a-direct`: `⑥㉠` → `㉠`, `row-6b-indirect`: `⑥㉡` → `㉡`, `row-6c-total`: `⑥㉢` → `㉢`
   - `row-10a/b/c`: `⑩a` → `a`, `⑩b` → `b`, `⑩c` → `c`
   - `row-12a/b/c`: `⑫a` → `a`, `⑫b` → `b`, `⑫c` → `c`
   - **rowId는 불변** (testid 동결 — e2e·anchor 보호).

3. ⑩c·⑫c 라벨의 `Min(⑩a, ⑩b)`·`Min(⑫a, ⑫b)` → `Min(a, b)`로 단축 (번호가 그룹 내 상대표기로 바뀌므로).

### 변경 상세 — 화면 컴포넌트
- 그룹 헤더 행: `isGroupHeader` 분기 — 좌측 라벨 `font-semibold`, 값 칸은 렌더하되 빈 셀(colSpan 미사용, 기존 셀 구조 유지).
- 세부행 좌측 라벨에 **들여쓰기** (`pl-6` 등) — `isGroupHeader`가 아니면서 직전 행이 그룹인 행에만.
  → 구현 단순화: 행에 `isGroupChild?: boolean` 플래그를 헬퍼에서 부여하고, 컴포넌트는 `isGroupChild ? "pl-6" : ""` 적용.

### 변경 상세 — PDF 섹션
- 동일하게 `isGroupHeader` 행은 굵게·값 칸 공란, `isGroupChild` 행은 라벨 `paddingLeft` 부여.
- 라벨·rowNo는 헬퍼에서 오므로 자동 반영. 들여쓰기 스타일만 추가.

> **검증 포인트**: 그룹 헤더 행 3개 추가로 화면 행 개수가 기존 대비 +3. anchor의
> `rows.length`·행 인덱스 단언을 갱신해야 함 (이슈 1 핵심 회귀 지점).

---

## 3. 이슈 2 — 숫자 폰트 크기·종류 통일

### 문제
숫자 데이터의 폰트 크기·종류가 통일되지 않아 읽기 불편 (사용자 보고).

### 확인 필요 (Pre-Do probe — 추정 금지)
현행 화면 표는 `<table className="… text-xs tabular-nums">` 1곳에만 폰트를 지정하고
모든 td가 상속받는 구조다. 사용자가 체감한 불통일의 실제 원인을 **Do 진입 전 probe로
실측**한 뒤 통일 범위를 확정한다. 후보 원인:

| # | 가설 | 검증 방법 |
|---|---|---|
| P-1 | 강조행(`isBoldFinal` 굵게)·그룹행(`font-medium`)과 일반행 weight 차이를 폰트 차이로 체감 | 렌더 DOM의 weight 클래스 트리 확인 |
| P-2 | `burdenRatio` 행 `toFixed(4)`("0.3169")와 천단위 콤마("468,259,020")가 다른 폭으로 보임 — `tabular-nums` 미상속 여부 | td별 computed `font-variant-numeric` 확인 |
| P-3 | 인접 표(`HeirAllocationTable`)와 폰트가 달라 비교 체감 | 두 컴포넌트 className 대조 |
| P-4 | 합계열과 인별열 폰트 weight·size 불일치 | thead/tbody td 클래스 대조 |

### 해결 (probe 결과 반영, 기본 방향)
- 모든 **숫자 td**에 단일 클래스 강제: `text-xs tabular-nums`(폭 고정 숫자) — size·variant 통일.
- weight는 **강조 의미가 있는 행만** 의도적 차등(⑮ 차감자진납부세액 bold, 그룹 소계 medium).
  그 외 데이터 행은 동일 weight.
- font-family는 컨테이너 단일 상속 — 숫자 셀에 별도 family 지정 없음(시스템 sans + tabular-nums).
- `0.3169` 등 비율 행도 동일 `tabular-nums` 적용해 정수 행과 정렬·폭 일치.

> probe로 P-1~P-4 중 실제 원인을 특정한 뒤 해당 지점만 수정. "통일했다"는 probe 전후
> 동일 스크린샷/DOM 대조로 입증.

---

## 4. 이슈 3 — "0" / "—" 혼재 정리

### 문제
빈 셀이 `0`과 `—`(대시)로 일관성 없이 표시됨.

### 해결 (사용자 결정: 값 0만 '0', 구조적 미배부는 빈칸)
- **값이 실제 0인 셀** → `"0"` (현행 유지)
- **구조적 미배부 셀**(null/undefined: ⑤상속공제·⑦산출세액 등 합계행의 인별 칸,
  영리법인 미해당 칸) → 현재 `"—"` → **빈칸 `""`**
- 결과: 대시(`—`) 기호 자체가 표에서 사라짐 → `0`과 `—`의 혼재 해소.
  원본 PDF 구조(미배부=공란)와도 정합.

### 변경 상세 — `heir-allocation-summary.ts` `fmt`
```ts
export function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";   // 기존: "—"
  if (v === 0) return "0";
  return v.toLocaleString();
}
```

### 변경 상세 — burdenRatio(*5) 분기 (화면 + PDF 각 1곳)
화면 컴포넌트·PDF 섹션 모두 `row-s5-burdenRatio`를 별도 분기해 `toFixed(4)` / `"—"`로
처리 중. 두 곳의 null fallback `"—"` → `""`로 변경.
- 화면: `HeirAllocationSummaryTable.tsx` L184·L196
- PDF: `inheritance-heir-allocation-section.tsx` L72

> **주의**: `fmt`는 PDF 섹션도 import. 변경 즉시 PDF에도 빈칸 반영됨 (의도된 동작).
> 그룹 헤더 행(이슈 1)의 값 칸도 `fmt(null)` → `""`로 자연히 공란 처리됨.

---

## 5. 작업 순서 (Do)

1. **Pre-Do probe (이슈 2)**: 현행 화면 DOM·className 트리 실측 → 폰트 불통일 실제 원인 특정.
   동시에 이슈 1·3 적용 전 현행 anchor 1건 실행해 기준 스냅샷 확보.
2. **헬퍼 수정** (`heir-allocation-summary.ts`): 그룹 헤더 행 3개 삽입 + `isGroupHeader`·
   `isGroupChild` 플래그 + rowNo 단축 + `fmt` null→"".
3. **화면 컴포넌트**: 그룹 헤더/들여쓰기 렌더 + 폰트 통일(probe 결과) + burdenRatio null→"".
4. **PDF 섹션**: 그룹 헤더/들여쓰기 + burdenRatio null→"".
5. **테스트 갱신**: 행 개수 +3, 그룹 헤더 행 라벨 anchor 추가, `fmt(null)==="" ` 단언,
   e2e 행 존재 검증 갱신. rowId 불변이므로 testid 기반 e2e는 대부분 보존.
6. `npx tsc --noEmit` 0건 → `npx vitest run __tests__/tax-engine/inheritance/` 통과 →
   e2e(`inheritance-summary-table.spec.ts`) 통과.

## 6. 회귀·검증 체크리스트

- [ ] 그룹 헤더 행 3개 추가 후 화면·PDF 행 정렬·번호 정상 (⑥/⑩/⑫ 헤더 + 들여쓴 세부행)
- [ ] `fmt(null) === ""`, `fmt(0) === "0"`, `fmt(150000000) === "150,000,000"` anchor
- [ ] burdenRatio 행: 값 있으면 `0.3169`, 미해당이면 빈칸 (화면·PDF 동일)
- [ ] 이미지4 원본과 라벨 1:1 (`과세표준`·`상속인(수유자)외 증여세액공제`·`상속인등의 증여세액공제`)
- [ ] 폰트 통일 probe 전후 DOM 대조로 입증 ("미수행" 금지 — e2e 또는 스크린샷)
- [ ] 숫자 합계·인별 값 자체는 **불변** (이번 작업은 표시 전용 — 엔진·산식 변경 0건)
- [ ] PDF 출력에서 그룹 헤더·빈칸·폰트 정상
- [ ] 전체 회귀 `npm test` 통과 (공유 모듈 영향 확인)

## 7. 비범위 (Non-goals)
- 엔진 산식·배부 로직·세액 계산 변경 없음 (순수 표시 레이어).
- 메모리 `project_inheritance_corporate_10a_source_fix` 등 기존 dual-source 수정과 무관.
- 열(상속인) 순서·heirOrder 정책 변경 없음.
