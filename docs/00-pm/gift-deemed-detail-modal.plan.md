# 증여이익 계산기 — 의제 유형 상세 입력 모달 전환 (증여일 통합)

> worktree: `.claude/worktrees/gift-deemed-modal` (feat/gift-deemed-modal ← origin/master `2daebabb`, slot 5 · DEV 3005 / E2E 3105)
> 모든 file:line 인용은 fresh 트리(2daebabb, `trust_benefit` 포함 20종)에서 실측. (stale `gift-2col` 트리는 신탁이익 미포함 — 사용 금지)

## 1. 배경·목표

증여이익 계산기(`/calc/gift-deemed`)는 "① 증여로 보는 경우 유형"을 선택하면 **유형 선택 아래쪽에 ② 상세 입력 카드가 인라인으로** 펼쳐진다(이미지8). 유형별 입력 필드가 많고(예: 신탁이익 §61은 라디오 3 + 가액 + 토글 + 4필드), 페이지가 세로로 길어진다.

**요구사항** (사용자):
- 유형을 선택하면 ② 상세 입력을 **별도 모달 창**에서 입력.
- **증여일**도 모달에 함께 넣는다.
- 모달 폭 = **상속세 재산입력 모달 폭과 동일**.

순수 UI 재배치 — **엔진·API·Zod·결과 산식 무변경**. 실제 작업량은 모달 마크업 + 메인 페이지 재구성 + E2E 스펙 ripple(증여일 순서 플립·모달 닫기 단계)이다.

## 2. 현재 구조 (실측)

### 진입점 — `components/calc/deemed-gift/DeemedGiftCalculator.tsx` (113줄)
- L73–77: 증여일 인라인 카드 — `<label>증여일</label><DateInput value={form.giftDate} onChange=…>` + hint.
- L79–83: `<SectionHeader title="① 증여로 보는 경우 유형" />` + `<DeemedTypeSelector value={form.type} onChange={(v)=>set({type:v})} />`.
- L85–90: **인라인 ② 상세 입력** — `{form.type && (<><SectionHeader title="② 상세 입력" /><DeemedInputFields form={form} set={set} /></>)}`.
- L92: 검증 오류 표시 `<p data-testid="deemed-error">{error}</p>`.
- L94–102: 계산 버튼 `data-testid="deemed-calc-btn"` `disabled={loading || !form.type}`.
- L104: `{result && <DeemedGiftResultView … />}`.
- 상태: `form: DeemedFormState`(useState INITIAL_DEEMED), `set(patch)` = merge + `setResult(null)`. `handleCalc` = `validateDeemedInput(form)` → `buildDeemedGiftInput(form)` → `fetch(/api/calc/gift-deemed)` → `setResult`.

### 상세 입력·라벨 소스 — `components/calc/deemed-gift/shared.tsx`
- `DeemedFormState` (L36~): `giftDate: string` + `type` + 유형별 평탄(flat) 필드 전부.
- `INITIAL_DEEMED` (L187), `DEEMED_TYPE_META` (L314, `{label, law}` × 20종, `trust_benefit` L318), `TYPE_OPTIONS` (L350에 trust_benefit), `DeemedTypeSelector` (L372 — `RadioCardGroup columns={2}` L386), `DeemedInputFields` (L395 — `switch(form.type)` 20 case → 유형별 `*Fields`).

### 검증 — `lib/calc/gift-deemed-validate.ts`
- `validateDeemedInput(form)`: `if(!form.giftDate) return "증여일을 입력하세요"` → `if(!form.type) …` → 유형별 체크. 반환 `string|null`.

### 페이지 컨테이너 — `app/calc/gift-deemed/page.tsx`
- `<div className="mx-auto max-w-2xl px-4 py-8">` (42rem) → `<DeemedGiftCalculator />`.

### 상속세 재산입력 모달 폭 (= 목표 폭, 실측)
`PropertyValuationForm.tsx:203` 외 6개 모달 공용:
```
<DialogContent className="sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full p-0" showCloseButton={false}>
  <DialogHeader className="px-4 pt-4 pb-0"><DialogTitle>…편집</DialogTitle></DialogHeader>
  <div className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3" data-testid="estate-edit-dialog">…</div>
  <div className="border-t px-4 py-3 flex justify-end"><button>닫기</button></div>
</DialogContent>
```
공용 사용처: `PropertyValuationForm:203`, `StockValuationForm:211`, `PriorGiftInput:223`, `CohabitantDependentSection:283`, `DebtAllocationInput:204`, `PresumedInheritanceInput:336`.
→ **50.4rem (≈806px)** 가 표준 폭. 페이지 컨테이너(42rem)보다 넓어 모달이 컨테이너를 벗어나 표시됨(의도 부합).

## 3. 목표 UX

```
[메인 페이지]
  ① 증여로 보는 경우 유형   (DeemedTypeSelector, 2열 — 그대로)
     └ 라디오 선택 → 모달 자동 오픈 ───────────────┐
                                                  ▼
  [요약 카드] (유형 선택 후·모달 닫힘 시 표시)        [모달] sm:max-w-[min(50.4rem,…)]
     · 선택 유형 라벨 + 법조문                          제목: "{유형 라벨} 상세 입력"
     · 증여일                                          ┌ 증여일 (DateInput)
     · [수정] 버튼 ─────────────────────────────┐     ├ ② 상세 입력 (DeemedInputFields)
                                               │     └ [확인] (닫기)
  [증여이익 계산] 버튼                            └──── 재오픈
  [결과뷰]
```

## 4. 설계 결정 (검토 시 변경 가능)

| # | 결정 | 근거 |
|---|---|---|
| **D1** | 유형 라디오 **선택 즉시 모달 오픈** | 요구사항 "유형을 선택하면 … 모달". `onChange={(v)=>{set({type:v}); setModalOpen(true);}}` |
| **D2** | **유형 선택기는 메인 페이지 유지**(모달 밖). 모달은 증여일+② 상세만 | 요구사항은 ①은 그대로, ②(상세 입력)가 모달로. 스크린샷도 ② 영역 |
| **D3** | **증여일을 모달 내부 최상단으로 이동**, 메인 인라인 카드(L73–77) 제거. 요약 카드에서 echo | 요구사항 "증여일과 함께 모달" |
| **D4** | 모달 닫힌 뒤 메인에 **요약 카드 + [수정] 버튼**(②인라인 섹션 대체). 1차 echo = 유형 라벨+법조문+증여일만 | 상속세 테이블뷰 "행 클릭→모달" 패턴 차용. 유형별 핵심값 echo는 20종 매핑 부담 → 후속(§9 옵션) |
| **D5** | **라이브 편집**(모달 내 `set()` 직접) + 푸터 **단일 "확인"(닫기)**. draft/취소-되돌리기 미도입 | 상속세 `EstateItemEditor` 동일 패턴. 파괴적 폐기 없음 → `window.confirm` 불필요(`feedback_dialog_data_discard_confirm` N/A) |
| **D6** | 폭 `sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full p-0` `showCloseButton={false}` | 상속세 모달과 동일(§2). `showCloseButton` prop 실재 확정(`components/ui/dialog.tsx:48`) |
| **D7** | calc **검증 실패 + `form.type` 존재** 시 모달 **자동 재오픈** | 누락 필드는 모달(닫히면 숨김) 안에 있어 메인 에러만 보면 못 고침. 검증 실패 시 `setModalOpen(true)`로 입력 지점 복귀(라이브 상태라 기존 입력 보존). 유형 미선택은 모달 없음(계산 버튼 `disabled`로 선차단) |

**유형 변경 경로 (실측 기반)**: `RadioCardGroup`은 native `<input type="radio">`(`RadioCardGroup.tsx:166` `onChange={() => onChange(opt.value)}`)이라 **이미 선택된 동일 유형을 재클릭해도 onChange가 발화하지 않는다**. 따라서:
- **같은 유형 재오픈** = 메인 유형 라디오 재클릭으로는 **불가** → 요약 카드의 **[수정] 버튼이 필수 경로**(옵션 아님).
- **다른 유형으로 변경** = 메인 유형 라디오에서 다른 값 선택 → checked 변경 → onChange 발화 → 새 유형으로 모달 재오픈.
- (모달 내 "유형 변경" 인라인 라디오는 옵션 — §9.)

## 5. 변경 대상 파일

| 구분 | 파일 | 변경 |
|---|---|---|
| 신규 | `components/calc/deemed-gift/DeemedDetailModal.tsx` | Dialog wrap: 증여일(DateInput) + `DeemedInputFields` + (D7)모달 내 에러 + 확인 푸터. props `{open, onOpenChange, form, set, error?}`. 제목 = `DEEMED_TYPE_META[form.type].label + " 상세 입력"` |
| 수정 | `components/calc/deemed-gift/DeemedGiftCalculator.tsx` | 인라인 증여일(73–77)·② 섹션(85–90) 제거. `modalOpen` state. 유형 onChange→모달 오픈. 요약 카드 + [수정] 버튼. `<DeemedDetailModal …/>` 렌더 |
| 재사용(무변경) | `shared.tsx`(`DeemedTypeSelector`·`DeemedInputFields`·`DEEMED_TYPE_META`)·`DateInput`(`@/components/ui/date-input`)·`Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`(`@/components/ui/dialog`) | — |
| 무변경 | `gift-deemed-api.ts`·`gift-deemed-validate.ts`·`gift-deemed-input.ts`(Zod)·route·result view·엔진 | 순수 UI 재배치 |

800줄 정책: 두 파일 모두 여유(Calculator 113→~170, Modal 신규 ~80). 모달 분리로 Calculator 비대화 방지.

## 6. 동기화 지점 영향 (8 클라이언트 + 6 API)

엔진 input/result 필드 **추가·변경 없음** → 대부분 무변경:

| # | 지점 | 영향 |
|---|---|---|
| ① 폼 상태 | `DeemedFormState` | 무변경 (giftDate+유형필드 이미 flat) |
| ② initial | `INITIAL_DEEMED` | 무변경 |
| ③ normalize | — | 무변경 |
| ④ API 변환 | `buildDeemedGiftInput` | 무변경 |
| ⑤ **UI 위젯** | **변경** — 증여일·DeemedInputFields를 모달로 이동 + 요약 카드 신설 |
| ⑥ 사이드바 | — | N/A (deemed 계산기 사이드바 없음) |
| ⑦ 결과 카드 | `DeemedGiftResultView` | 무변경 |
| ⑧ validation | `validateDeemedInput` | 무변경 (giftDate/type 체크 유지). 오류 표시는 메인 `deemed-error`(L92) 유지 — 모달 닫고 계산 시 표시 |
| ⑨~⑭ Zod/route | — | 무변경 |

→ **실질 변경 = ⑤ + E2E**. 엔진 회귀 위험 0.

## 7. E2E ripple (필수 — 가장 큰 작업)

현재 모든 deemed 스펙은 `fillGiftDate(page)`(증여일 입력)를 **유형 선택 전**에 호출하고, `deemed-calc-btn`은 메인 페이지에 있다. 증여일이 모달로 이동하면:
- 증여일 DateInput은 **모달 오픈 후에만** 존재 → `fillGiftDate`를 `deemed-type-X.click()` **뒤로 이동**.
- `deemed-calc-btn`은 메인(모달 오버레이 뒤) → **계산 전 모달 닫기 단계 추가**.

영향 스펙 (**5** — `grep -rln "calc/gift-deemed" e2e/` 전수 실측):
1. `e2e/gift-deemed.spec.ts` (calc 3건)
2. `e2e/gift-deemed-capital.spec.ts` (calc 5건)
3. `e2e/gift-deemed-other.spec.ts` (calc 3건)
4. `e2e/gift-deemed-presumption.spec.ts` (calc 3건)
5. `e2e/gift-deemed-trust-benefit.spec.ts` (TB-UI-1 calc 1건 / TB-UI-2 calc 없음)

> ⚠️ `e2e/deemed-category-toggle-visibility.spec.ts`는 **영향 없음** — 파일명의 "deemed"는 상속세 *간주상속재산*(§8·§9·§10) 토글을 뜻하며 `/calc/inheritance-tax`를 방문한다(증여이익 계산기 무관, 실측 확인).

표준 변경 패턴 (helper 추출 권장):
```ts
async function openDetail(page, type) {            // 유형 클릭 → 모달 오픈 → 증여일 입력
  await page.getByTestId(`deemed-type-${type}`).click();
  await fillGiftDate(page);                        // 증여일이 이제 모달 안
}
async function closeDetail(page) {                 // 계산 전 모달 닫기
  await page.getByRole("button", { name: "확인" }).click(); // 또는 page.keyboard.press("Escape")
}
// 본문: openDetail → 상세 placeholder fill → closeDetail → deemed-calc-btn.click
```
- 상세 필드 `getByPlaceholder(...)` fill은 모달 열린 상태에서 그대로 동작(접근 가능).
- `closeDetail`은 **calc를 호출하는 케이스에만** 필요(`deemed-calc-btn`이 메인·오버레이 뒤). calc 미호출 케이스는 불필요.
  - **TB-UI-2 예외**: calc 미호출(순수 토글 가시성) → closeDetail 불필요. `fillGiftDate`를 `deemed-type-trust_benefit.click()` **뒤로만** 이동하면 됨(증여일·수익률 토글·수익률 입력 모두 모달 안에서 검증).

신규 스펙 `e2e/gift-deemed-detail-modal.spec.ts`:
- M-1 유형 선택 → 모달 오픈(`deemed-detail-dialog` 보임) → 증여일+상세 입력 → 확인 닫기 → 요약 카드(유형 라벨·증여일) 표시 → 계산.
- M-2 [수정] 버튼 → 모달 재오픈 + 기존 입력 유지(라이브).
- M-3 (옵션) 유형 라디오 변경 → 새 유형으로 모달 재오픈.

## 8. 케이스 매트릭스

| 케이스 | 기대 동작 |
|---|---|
| 유형 미선택 | 모달 닫힘, 요약 카드 없음, 계산 버튼 `disabled`(현 `!form.type` 유지) |
| 유형 선택(라디오) | 모달 자동 오픈 (증여일 + 해당 유형 상세) |
| 모달 닫기(확인/Esc/backdrop) | 요약 카드 표시(유형 라벨+법조문+증여일), 계산 가능 |
| 요약 카드 [수정] | 같은 유형 모달 재오픈, 기존 입력 유지 (라이브) |
| 유형 라디오 **동일 값** 재클릭 | onChange 미발화(native radio) → 무동작. 재오픈은 [수정]만 (D7 무관) |
| 유형 라디오 **다른 값** 선택 | onChange 발화 → 새 유형으로 모달 재오픈 (유형별 필드 전환) |
| 증여일 미입력 후 계산 | `validateDeemedInput` "증여일을 입력하세요" → 메인 `deemed-error` + **모달 자동 재오픈**(D7) |
| 상세 필수값 미입력 후 계산 | 기존 유형별 검증 메시지 + **모달 자동 재오픈**(D7), 입력 보존 |

## 9. 컴포넌트 설계 (DeemedDetailModal)

```tsx
export function DeemedDetailModal({ open, onOpenChange, form, set, error }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  form: DeemedFormState; set: (p: Partial<DeemedFormState>) => void;
  error?: string | null;   // D7: 검증 실패로 재오픈 시 모달 내부에 표시 (오버레이 뒤 메인 에러 가림 방지)
}) {
  const title = form.type ? `${DEEMED_TYPE_META[form.type].label} 상세 입력` : "상세 입력";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full p-0" showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-0"><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3" data-testid="deemed-detail-dialog">
          {/* 증여일 */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 mb-4">
            <label className="mb-1 block text-sm font-semibold text-slate-700">증여일</label>
            <DateInput value={form.giftDate} onChange={(v) => set({ giftDate: v })} />
            <p className="mt-1 text-xs text-muted-foreground">증여시기·적정이자율 연도 기준</p>
          </div>
          {/* ② 상세 입력 */}
          <DeemedInputFields form={form} set={set} />
          {error && <p className="mt-3 text-sm font-medium text-rose-600" data-testid="deemed-detail-error">{error}</p>}
        </div>
        <div className="border-t px-4 py-3 flex justify-end">
          <button type="button" onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-md text-sm border border-gray-300 hover:bg-gray-50 transition-colors">
            확인
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```
- `showCloseButton={false}` 확정 가능(`components/ui/dialog.tsx:48` prop 실재) — 우상단 X 숨김, 푸터 "확인"으로 닫기 단일화(상속세 모달과 동일).
- `title`은 `form.type` 가드로 `DEEMED_TYPE_META[form.type]`(`Record<DeemedGiftType,…>`) 인덱싱 — `""` 인덱싱 TS 오류 회피(모달은 유형 선택 시에만 오픈되므로 실제 `""` 도달 없음).

**Calculator 결선**: `<DeemedDetailModal open={modalOpen} onOpenChange={setModalOpen} form={form} set={set} error={modalOpen ? error : null} />`. 유형 onChange = `(v) => { set({ type: v }); setModalOpen(true); }`. `handleCalc` 검증 실패 시 `setError(v); if (form.type) setModalOpen(true)`(D7) → 에러는 모달 내부(`deemed-detail-error`)에 표시. 단, `set()`이 `setResult(null)`만 하고 `error`는 안 지우므로, 모달 내 입력 변경 시 에러 잔존 방지 위해 `set`에서 `setError(null)`도 호출(현 `set` 확장).

**요약 카드(Calculator 내)**: `DEEMED_TYPE_META[form.type]`의 `label`·`law` + `form.giftDate`(미입력 시 "미입력") + [수정] 버튼(`setModalOpen(true)`). rose tone(유형 선택기와 동계열) 또는 slate 카드. **번호 체계**: 메인 `SectionHeader`는 "① 증여로 보는 경우 유형" 유지, 요약 카드는 ①의 선택 결과 표시이므로 별도 번호 없음(기존 "② 상세 입력" 인라인 섹션 헤더는 제거 — ②는 모달 제목으로 대체).

**옵션(후속 — 1차 스코프 제외, R3)**: ⓐ 유형별 핵심 입력값 echo(20종 매핑), ⓑ 모달 내 "유형 변경" 인라인 라디오.

## 10. 리스크·확인 필요

검토 단계에서 추정 항목을 실측으로 모두 해소(✅ = 확정):

- ✅ **R1 (해소)**: `deemed-category-toggle-visibility.spec.ts`는 상속세 간주상속재산 스펙(`/calc/inheritance-tax`) — gift-deemed 무관, **영향 없음**. (`grep -rln "calc/gift-deemed" e2e/` = 5 스펙만.)
- ✅ **R2 (해소·설계 반영)**: `RadioCardGroup`은 native radio(`RadioCardGroup.tsx:166` `onChange={() => onChange(opt.value)}`) → 동일 checked 재클릭 onChange **미발화** 확정. 같은 유형 재오픈은 [수정] 버튼이 **필수 경로**(D4·D7).
- ✅ **R5 (해소)**: `showCloseButton` prop 실재(`components/ui/dialog.tsx:48`) → §9 제안 코드 유효.
- **R3 (잔존·스코프 결정)**: 요약 카드 유형별 핵심 입력값 echo는 20종 분기 부담 → **1차 스코프 제외**(유형 라벨+법조문+증여일만). 후속 과제(§9 옵션).
- ✅ **R4 (해소)**: deemed 페이지에 DateInput은 증여일 1개뿐 → E2E `getByLabel("연도").first()`는 모달 오픈 후 안전.

## 11. 작업 순서 (Do)

1. `DeemedDetailModal.tsx` 신규 (§9).
2. `DeemedGiftCalculator.tsx`: 인라인 증여일·② 제거 → `modalOpen` state → 유형 onChange가 모달 오픈 → 요약 카드+[수정] → `<DeemedDetailModal/>` → `handleCalc` 검증 실패 시 `if (form.type) setModalOpen(true)`(D7).
3. `npx tsc --noEmit` 0건.
4. E2E: helper `openDetail`/`closeDetail` 추출, **5 스펙** 순서 플립+닫기 단계(§7, TB-UI-2는 순서만), 신규 `gift-deemed-detail-modal.spec.ts`(M-1~4: 오픈·요약·[수정]재오픈·검증실패 재오픈).
5. `E2E_PORT=3105 npx playwright test e2e/gift-deemed*.spec.ts` + 전체 `npm test` 회귀.
6. 브라우저 수동 확인(또는 E2E 충족 명시).
7. `scripts/ship.sh feat/gift-deemed-modal "<msg>"`.

## 12. 검증 기준

- [ ] 케이스 매트릭스(§8) 전 분기 동작 확인 (D7 검증실패 재오픈 포함)
- [ ] ⑤ UI 위젯 + ⑧ validation 정합 (증여일 모달 이동 후에도 검증 경로 단일)
- [ ] `tsc --noEmit` 0건
- [ ] **5** 기존 E2E 스펙 green(순서 플립·닫기 단계 반영) + 신규 모달 스펙(M-1~4) green
- [ ] 전체 `npm test` 회귀 0건
- [ ] 모달 폭 = 상속세 재산입력 폭(50.4rem) 시각 확인

## 13. 자가 검토 이력 (오류·누락·모순)

**1회차 (계획 vs 실측)** — 8건:

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| 1 | 오류 | High | §7·R1 | category-toggle 스펙을 영향(6번째)으로 오분류 — 실측 상속세 간주상속재산 스펙 | 영향 6→**5**, 제거, R1 해소 |
| 2 | 오류 | High | R2 | RadioCardGroup 동일값 재클릭 onChange "미확인" | 실측 확정(native radio L166 미발화) → [수정] 버튼 **필수** 격상(D4·D7) |
| 3 | 누락 | High | §3·§4·§8 | 검증 실패 시 누락 필드가 닫힌 모달 안 → 못 고침 | **D7 신설**(검증 실패+유형존재 시 모달 자동 재오픈) |
| 4 | 오류 | Medium | §7 | "계산 전 닫기"를 전 스펙 일괄 — TB-UI-2는 calc 없음 | closeDetail은 calc 스펙만 |
| 5 | 누락 | Low | §5·§9 | Dialog import 경로 미명시 | `@/components/ui/dialog` 명시 |
| 6 | 개선 | Low | §3·§9 | ②번호 체계 — 요약 카드 대체 시 정리 | ① 헤더 유지·② 모달 제목 대체 |
| 7 | 확정 | Info | §9 | showCloseButton prop 실재 | dialog.tsx:48 확정 |
| 8 | 누락 | Medium | §4·§9 | DateInput aria-label 충돌 우려(R4) | 증여일 1개뿐 → 해소 |

**2회차 (1회차 정정의 파급)** — 1건:

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| 9 | 누락 | Medium | D7·§9 | D7 재오픈 시 메인 에러가 **모달 오버레이 뒤 가림** → 어느 필드인지 모름. 또 `set()`이 error 미초기화 → 편집 중 에러 잔존 | 모달에 `error?` prop + `deemed-detail-error` 표시. `set`에 `setError(null)` 추가 |

**통합 비교 (계획 내부 정합축)**:

| 정합 축 | 위치 | 판정 |
|---|---|---|
| 모달 폭 50.4rem | §2 실측 · §4 D6 · §9 코드 | ✓ |
| 영향 E2E 스펙 = 5 | §7 · §11.4 · §12 | ✓ |
| D7 재오픈+모달내 에러 | §4 D7 · §8 · §9 결선 · §11.2 · §12 | ✓ |
| [수정] 필수성(R2 확정) | §4 · §8 · §10 R2 | ✓ |
| 동기화 영향 = ⑤+⑧+E2E | §6 · §12 | ✓ |
| showCloseButton 실재 | §4 D6 · §9 · §10 R5 (dialog.tsx:48) | ✓ |

→ Critical/High 잔존 0. 추정 잔여 0(R1·R2·R4·R5 실측 해소, R3은 스코프-제외 결정). 정정 누적 9건.

> 비고: 본 기능은 **엔진 입력/결과 무변경(순수 UI)** 이라 `.engine.design.md`는 실익 없음. 별도 UI 설계 문서가 필요하면 §9를 `.ui.design.md`로 승격 가능(요청 시).
