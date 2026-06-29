# E2E #7 — "부득이한 사유 있음" 토글 셀렉터 모호성 정리 계획

> 상태: Plan
> 규모: **소** (단일 spec · 셀렉터 4줄 · 엔진/컴포넌트 무관) → 디자인 문서 N/A
> 발견 경위: 2026-06-29 ToggleCard 제목-클릭 안티패턴 전수 스캔(transfer-p5 진단 후속)의 번호 인벤토리 **#7** 항목.
> 관련: [`e2e-selector-robustness-audit.plan.md`](e2e-selector-robustness-audit.plan.md)(패턴 A/B/C — 날짜 라벨·버튼 exact·결과 라벨 중복. **ToggleCard 제목-클릭은 미포함** → 본 건은 별개 후속).
> 핵심 결론: **현재는 통과하나 잠재 strict-mode 충돌**이 있는 1파일 4곳을 프로젝트 표준 `role=switch`로 전환. 컴포넌트 변경·타 spec 변경 없음.

## 1. #7의 정의 (실측 확정)

스캔이 식별한 "부득이한 사유 있음 셀렉터 모호성"의 정확한 실체:

| 항목 | 값 (실측) |
|---|---|
| 대상 spec | `e2e/inheritance-cohabit-phase23.spec.ts` |
| 호출 지점 | **4곳** — L180(P4-1) · L192(P4-2) · L208(P4-3) · L224(P4-4) |
| 현재 셀렉터 | `page.getByText("부득이한 사유 있음").click()` |
| 토글 컴포넌트 | `components/calc/inheritance/CohabitRequirementBlock.tsx:117` `ToggleCard`, `title="§23의2② 부득이한 사유 있음"`, `tone="violet"`, `data-testid="cohabit-reasons-toggle"`(L133) |

> "부득이한 사유 있음" **정확 문구**는 코드베이스에서 이 spec(E2E)과 `CohabitRequirementBlock.tsx`(컴포넌트)에만 존재. 다른 두 "부득이한 사유" 사용처는 #7과 무관:
> - `transfer-multi-house-detail.spec.ts:137` — title "부득이한 사유 취득 주택", **이미 `getByRole("switch", { name: /부득이한 사유 취득 주택/ })`** → 정상.
> - `transfer-exemption-154-proviso.spec.ts:35` — label "부득이한 사유 (3호)", `RadioCardGroup` 옵션(switch 아님) → 별개 패턴, 본 계획 비범위.

## 2. 모호성의 정확한 메커니즘 (추정 금지 — 코드 실측)

`getByText`는 Playwright 기본 **substring·whitespace-normalized** 매칭이다. `"부득이한 사유 있음"`을 포함하는 노드가 같은 컴포넌트에 **2개** 존재:

1. **`ToggleCard` 제목** — `CohabitRequirementBlock.tsx:121` → 렌더 시 `<span>§23의2② 부득이한 사유 있음</span>`(ToggleCard.tsx:273). 항상 노출.
2. **deprecated 안내 `<div>`** — `CohabitRequirementBlock.tsx:147`:
   ```
   정확한 계산을 위해 위 "부득이한 사유 있음" 토글을 켜서 사유별로 입력해주세요.
   ```
   조건부 렌더: `!hasReasonMode && (cohabitExcludedYears ?? 0) > 0` (L144).

**왜 현재는 셀렉터가 깨지지 않는가** (코드 실측 — 이번 세션 E2E **미실행**): 신규 마법사 흐름(`setupStep0WithCohabitChild`)에는 legacy `cohabitExcludedYears` 값이 없어 항상 `0` → L147 미렌더 → `getByText` 매칭 **1개** → strict 위반 없이 클릭됨. (테스트 baseline 통과 자체는 §5 단계 2 실행으로 확정한다.)

**왜 고쳐야 하는가 (잠재 위험)**: legacy `cohabitExcludedYears > 0`가 채워진 상태(예: 마이그레이션된 이력·sessionStorage 복원)에서 토글이 OFF면 L147이 렌더된다 → `getByText("부득이한 사유 있음")` 매칭 **2개** → Playwright **strict mode 위반**으로 `.click()`이 throw. 즉 현재 무사한 것은 "L147이 우연히 안 떠서"일 뿐, 셀렉터 자체가 견고하지 않다.

## 3. 수정안 — `role=switch` 전환

4곳 모두 동일 치환:

```diff
- await page.getByText("부득이한 사유 있음").click();
+ await page.getByRole("switch", { name: /부득이한 사유 있음/ }).click();
```

### 근거 (실측)
- **접근성 이름 = title**: `ToggleCard`의 `Switch`는 `aria-label={title}`(ToggleCard.tsx:295) → 이 토글 스위치의 accessible name = `"§23의2② 부득이한 사유 있음"`. 정규식 `/부득이한 사유 있음/`(부분 매칭)로 명중.
- **충돌 면역**: L147은 `<div>`(role 없음) → `getByRole("switch", …)`는 **구조적으로** 텍스트 노드와 절대 충돌하지 않는다. legacy 값 유무와 무관하게 안전.
- **고유성**: `"부득이한 사유 있음"` 정확 문구는 코드베이스 전체에서 이 `ToggleCard` title에만 존재(§1 grep 실측) → role=switch 중 `/부득이한 사유 있음/` 매칭은 이 토글 **1개**뿐. (단계 2 실행에서 strict 위반 0으로 최종 확정.)
- **동적-title 이중토글 위험 없음**: title이 checked 상태와 무관하게 정적 → 스캔이 일괄 전환을 보류시킨 "동적-title 카드" 부류가 **아니다**. 그래서 #7은 전환이 안전한 케이스.
- **프로젝트 표준 정합**: `e2e/CLAUDE.md` + 기 적용 사례(`transfer-multi-house-detail.spec.ts:137`, transfer-p5 픽스 `05e07821`)와 동일 패턴.

### 채택하지 않은 대안
- **`getByText(..., { exact: true })`**: 정확 문구가 `"§23의2② 부득이한 사유 있음"`(접두 `§23의2②` 포함)이라 `"부득이한 사유 있음"` exact는 0건 매칭으로 실패. title 전체를 하드코딩하면 라벨 변경에 취약.
- **`getByTestId("cohabit-reasons-toggle")`**: **사용 불가**. `ToggleCard`는 `data-testid`를 props로 받지도(`ToggleCardProps`에 필드 없음) DOM에 spread 하지도 않는다(rest-prop 전개 없음 — ToggleCard.tsx 전문 확인) → `CohabitRequirementBlock.tsx:133`의 `data-testid="cohabit-reasons-toggle"`는 **런타임 DOM에 나타나지 않는 죽은 prop**. 따라서 testid 셀렉터는 매칭 0건.

## 4. 비범위 (명시적 제외 — Surgical)

- **나머지 ~59건 제목-클릭 토글**: 스캔 결과 전부 통과 중 + 동적-title 카드 일괄 전환 시 이중토글 위험 → 손대지 않음(스캔 결론 유지). #7은 "잠재 충돌이 실재하는" 예외 1건만.
- **동일 spec 내 다른 `getByText(...).click()` 토글류 셀렉터** (`동거주택 상속공제 해당` 등): #7처럼 **실증된 substring 충돌이 확인된 건 아님** → ~59건 보류 대상에 함께 두고 #7만 전환(Surgical). 같은 파일이라도 일괄 전환은 회귀 리스크 > 이득.
- **`L217` 텍스트 단언** (`getByText("부득이한 사유에 해당하지 않습니다")`): 토글 클릭이 아니라 경고문 가시성 단언(인접 `cohabit-reason-overseas-warning-0` testid 존재). #7(토글 셀렉터)과 무관 → 변경 없음.
- **죽은 `data-testid` prop 정리** (`CohabitRequirementBlock.tsx:133`): §3에서 확인된 무효 prop. 제거 또는 `ToggleCard`의 data-testid 포워딩 추가는 **공용 컴포넌트/타 파일 변경**이라 #7 셀렉터 정리 범위 밖. 별도 후속(선택)으로 분리. *(tsc가 이 무효 prop을 허용하는 경위 — 전역 `data-*` JSX 허용 여부 — 는 미확인. 정리 착수 시 확인 필요.)*

## 5. 작업 단계 (verify 포함)

```
1. 4곳 치환 (L180·192·208·224) → verify: rg "getByText(\"부득이한 사유 있음\")" e2e/ 결과 0건
2. 단독 실행 npx playwright test e2e/inheritance-cohabit-phase23.spec.ts
   → verify: Phase 4 4개 테스트(P4-1~4) 포함 전체 pass (기능 동등 확인)
3. 회귀 국소 — 본 spec만 재실행으로 충분 (변경이 1파일 셀렉터에 국한, 타 spec·컴포넌트 무영향)
```

> 충돌 면역은 **구조적 보장**(switch role ≠ div)이라 legacy 값 주입 재현 테스트는 불필요. 단계 2의 기능 동등 pass + §3 근거로 충분.

## 6. 리스크·메모

- **회귀 리스크 극소**: 셀렉터 의미 동등(같은 토글 클릭), 컴포넌트·엔진·타 spec 무변경.
- **base**: master `bb626c00`(PR #423 머지 후) 기준.
- **커밋**: 단일 파일 변경 → `e2e/inheritance-cohabit-phase23.spec.ts`만 `git add`. 한국어 메시지 + Co-Authored-By.

## 7. Do 실측 — 사전존재 RED 발견 (2026-06-29, Do 환류)

> §2의 "현재 셀렉터가 1개 매칭(무사)"는 **스캔의 미검증 가정**을 계승한 것이었다. Do 실행으로 **이 spec이 사전존재 RED**임이 드러나 정정한다. (추정 금지 — 실측 우선)

- **실측**: `npx playwright test e2e/inheritance-cohabit-phase23.spec.ts` → **11/12 실패**. 유일 통과 = `E2E-G5-2`(셋업 미사용).
- **실패 지점**: 내가 바꾼 줄(L180+)이 **아님**. 공유 셋업 `setupStep0WithCohabitChild`의 **L29 `getByText("동거주택 상속공제 해당").click()`** 에서 timeout(**0 매칭** — strict 위반 아님).
- **baseline 대조**: 내 4줄을 `git stash`한 **원본 master(`bb626c00`)** 에서 `E2E-G3-1` 실행 → **동일하게 L29 실패**. ⇒ **사전존재 확정, 내 #7 변경 무죄**(상류 셋업이 죽어 내 줄에 도달 불가).
- **근본원인 (stale — 모달 마이그레이션 드리프트)**: 동거주택 ToggleCard(`HeirEditor.tsx:541`, `showCohabitant`)와 그 하위 `CohabitRequirementBlock`(#7 타깃 토글 포함)이 **"상속인 편집" 모달 안**으로 이전됨. 그러나 셋업 헬퍼는 `addHeir(...)`(L26)로 모달을 **닫은 뒤** 토글을 찾는다(`keepModalOpen` 미사용 — 옵션 doc L134-136이 "동거 편집은 keepModalOpen"이라 명시). `project_inheritance_stale_e2e_specs`·`feedback_e2e_gift_modal_chip_switch_selectors` 부합.
- **#7에 대한 함의**:
  1. #7 셀렉터 변경 자체는 **정상·회귀 0**(구조적 + baseline 검증). 단 **green 기능 확인 불가** — 셋업이 상류에서 죽어 P4 4개 테스트가 #7 줄에 도달하지 못함.
  2. 스펙을 un-stale(`keepModalOpen` + 모달 내 입력·`dialog` 스코프)하면, 내 `page.getByRole("switch", …)`도 **`dialog.getByRole(...)`** 로 스코프해야 정확 → #7은 un-stale 작업에 자연 흡수.
- **분기 (사용자 결정)**: **A** #7 단독 커밋 + 모달 stale 별도 후속(Surgical) / **B** 스펙 전체 un-stale 확장(#7 흡수, 11개 green 목표 — #7 범위 초과).
