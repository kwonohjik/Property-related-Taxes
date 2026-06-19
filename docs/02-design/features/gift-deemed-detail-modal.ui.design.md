# 증여이익 계산기 — 의제 유형 상세 입력 모달 전환 · UI 디자인

> 계획서: [`docs/00-pm/gift-deemed-detail-modal.plan.md`](../../00-pm/gift-deemed-detail-modal.plan.md)
> worktree: `.claude/worktrees/gift-deemed-modal` (feat/gift-deemed-modal ← origin/master `2daebabb`, DEV 3005 / E2E 3105)
> 성격: **순수 UI 재배치** — 엔진 input/result·Zod·route·결과 산식 **무변경**. 14지점 중 실질 변경은 **⑤ UI 위젯**(+ ⑧ validation 흐름·E2E). 모든 file:line은 fresh 트리(2daebabb, `trust_benefit` 포함 20종) 실측.

---

## 1. 사용자 시나리오 (6단계)

1. `/calc/gift-deemed` 진입 → "① 증여로 보는 경우 유형" 2열 라디오(`DeemedTypeSelector`)만 보임. (기존 인라인 증여일 카드·"② 상세 입력" 섹션은 사라짐.)
2. 유형 라디오 1개 선택 → **상세 입력 모달 자동 오픈**(폭 = 상속세 재산입력 모달 50.4rem).
3. 모달 안에서 **증여일** + 해당 유형 **상세 필드**(`DeemedInputFields`)를 입력 → 하단 "확인" 클릭(또는 Esc/backdrop)으로 닫음.
4. 메인에 **요약 카드**(선택 유형 라벨 + 법조문 + 증여일) + **[수정]** 버튼 표시. [수정] → 모달 재오픈(기존 입력 보존).
5. "증여이익 계산" → 결과(`DeemedGiftResultView`) 표시. 검증 실패 시 모달이 **자동 재오픈**(D7)되고 에러가 **모달 내부**(`deemed-detail-error`)에 표시.
6. (결과 후) "증여세 계산으로" → prefill 이관(`buildGiftWizardPrefill`, 기존 동작 유지).

**다른 유형으로 변경**: 메인 유형 라디오에서 다른 값 선택 → `onChange` 발화 → 새 유형으로 모달 재오픈. (동일 유형 재클릭은 native radio 특성상 `onChange` 미발화 → [수정] 버튼이 유일한 재오픈 경로.)

---

## 2. 케이스 인벤토리 (행 ≥ 3, 필수)

| # | 상태/액션 | 모달 | 메인 표시 | 계산 버튼 | 비고 |
|---|---|---|---|---|---|
| C1 | 초기 (유형 미선택) | 닫힘 | 요약 카드 없음 | `disabled`(`!form.type`) | 기존 `disabled` 유지 |
| C2 | 유형 라디오 선택 | **자동 오픈**(증여일+상세) | — | — | onChange→`setModalOpen(true)` |
| C3 | 모달 "확인"/Esc/backdrop 닫기 | 닫힘 | 요약 카드(유형·법조문·증여일) | 활성 | 라이브 상태 보존 |
| C4 | 요약 카드 [수정] | 같은 유형 재오픈 | — | — | 기존 입력 유지 |
| C5 | 유형 라디오 **동일 값** 재클릭 | 무동작 | 변화 없음 | — | native radio onChange 미발화 → [수정]만 |
| C6 | 유형 라디오 **다른 값** 선택 | 새 유형 재오픈 | — | — | 유형별 필드 전환 |
| C7 | 증여일 미입력 후 계산 | **자동 재오픈** | 메인 `deemed-error` | — | `validateDeemedInput` "증여일을 입력하세요" + 모달 내 `deemed-detail-error` |
| C8 | 상세 필수값 미입력 후 계산 | **자동 재오픈** | — | — | 유형별 검증 메시지(모달 내), 입력 보존 |
| C9 | 정상 입력 후 계산 | 닫힘 유지 | 결과뷰 | — | 검증 통과 → 재오픈 안 함 |
| C10 | §35 임계미달(미적용) 등 정상 결과 | 닫힘 유지 | 결과뷰(미적용 배너) | — | 검증 통과 → 재오픈 안 함(기존 anchor 영향 없음) |

---

## 3. 폼 상태 / 14개 동기화 지점 명세

### 지점 ① 폼 상태 타입 — **변경 없음**
`DeemedFormState`(`components/calc/deemed-gift/shared.tsx:36~`)에 `giftDate`·`type`·유형별 flat 필드 이미 존재. 신규 필드 0.

### 지점 ② initial — **변경 없음**
`INITIAL_DEEMED`(`shared.tsx:187`) 그대로.

### 지점 ③ normalize — **변경 없음 / 해당 없음**
deemed 계산기는 zustand persist/마이그레이션 미사용(`useState(INITIAL_DEEMED)`, `DeemedGiftCalculator.tsx:26`).

### 지점 ④ API 변환 — **변경 없음**
`buildDeemedGiftInput`(`lib/calc/gift-deemed-api.ts`) 그대로. 입력 출처(인라인→모달)만 바뀌고 `form` 형상은 동일.

### 지점 ⑤ UI 위젯 — **변경 (핵심)**

**신규** `components/calc/deemed-gift/DeemedDetailModal.tsx`:
```tsx
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeemedInputFields, DEEMED_TYPE_META, type DeemedFormState } from "./shared";

export function DeemedDetailModal({ open, onOpenChange, form, set, error }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: DeemedFormState;
  set: (p: Partial<DeemedFormState>) => void;
  error?: string | null;   // D7: 재오픈 시 모달 내부 에러 (오버레이 뒤 메인 에러 가림 방지)
}) {
  const title = form.type ? `${DEEMED_TYPE_META[form.type].label} 상세 입력` : "상세 입력";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full p-0" showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-0"><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3" data-testid="deemed-detail-dialog">
          <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 mb-4">
            <label className="mb-1 block text-sm font-semibold text-slate-700">증여일</label>
            <DateInput value={form.giftDate} onChange={(v) => set({ giftDate: v })} />
            <p className="mt-1 text-xs text-muted-foreground">증여시기·적정이자율 연도 기준</p>
          </div>
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
- 폭/마크업 = 상속세 재산입력 모달과 동일(`PropertyValuationForm.tsx:203` 외 6곳). `showCloseButton` prop 실재 확정(`components/ui/dialog.tsx:48`).
- `title`은 `form.type` 가드 → `DEEMED_TYPE_META[form.type]`(`Record<DeemedGiftType,…>`, `shared.tsx:314`) `""` 인덱싱 TS 오류 회피.

**ASCII 레이아웃**
```
┌─ 메인 (max-w-2xl) ────────────────────────────┐
│ ① 증여로 보는 경우 유형                          │
│  [보험금][저가양수] [채무면제][부동산무상]        │  ← RadioCardGroup columns=2 (유지)
│  …(20종)…                                       │
│  ┌ 요약 카드 ──────────────────── [수정] ┐       │  ← 유형 선택 후·모달 닫힘 시
│  │ 신탁이익의 증여 · 상증법 §33            │       │
│  │ 증여일 2026-01-03                       │       │
│  └─────────────────────────────────────────┘     │
│  (error)                                        │  ← deemed-error (메인)
│  [ 증여이익 계산 ]                               │
│  [ 결과뷰 ]                                      │
└──────────────────────────────────────────────┘

┌─ 모달 (sm:max-w-[min(50.4rem,…)]) ───────────┐
│ {유형 라벨} 상세 입력                            │  ← DialogTitle
│ ┌ 증여일 ───────────────────────────┐          │
│ │ [DateInput 연 / 월 / 일]            │          │
│ └────────────────────────────────────┘          │
│ ② 상세 입력 (DeemedInputFields, 유형별)          │
│ (deemed-detail-error)                           │  ← D7 재오픈 시
│ ───────────────────────────────────  [ 확인 ]   │
└──────────────────────────────────────────────┘
```

**요약 카드 (Calculator 내)**: `DEEMED_TYPE_META[form.type]`의 `label`·`law` + `form.giftDate`(미입력 시 "미입력") + [수정] 버튼(`setModalOpen(true)`). slate 또는 rose tone(유형 선택기와 동계열). 번호 없음(① 헤더의 선택 결과).

**Calculator 결선** (`DeemedGiftCalculator.tsx` 수정):
```tsx
const [modalOpen, setModalOpen] = useState(false);
const set = (patch: Partial<DeemedFormState>) => {
  setForm((p) => ({ ...p, ...patch }));
  setResult(null);
  setError(null);            // ← 추가: 모달 내 편집 시 에러 잔존 방지
};
// 유형 선택 → 모달 오픈
<DeemedTypeSelector value={form.type} onChange={(v) => { set({ type: v }); setModalOpen(true); }} />
// (인라인 증여일 카드 73–77 · "② 상세 입력" 섹션 85–90 제거)
// 요약 카드 + [수정] (form.type 있을 때)
<DeemedDetailModal open={modalOpen} onOpenChange={setModalOpen} form={form} set={set} error={modalOpen ? error : null} />
// handleCalc 검증 실패 분기
if (v) { setError(v); if (form.type) setModalOpen(true); return; }   // D7
```

### 지점 ⑥ 사이드바 합계 — **해당 없음 (추가 금지)**
deemed 계산기는 `WizardSidebar` 미사용(`DeemedGiftCalculator.tsx:71~112` 단순 `div`). 합계 selector 없음.

### 지점 ⑦ 결과 카드 — **변경 없음**
`DeemedGiftResultView`(`components/calc/results/DeemedGiftResultView.tsx`) 그대로. testid `deemed-result-value`·`deemed-exclusion`·`deemed-to-wizard` 유지.

### 지점 ⑧ Validation — **변경 없음 (흐름만)**
`validateDeemedInput`(`lib/calc/gift-deemed-validate.ts:7`) 로직 그대로(`giftDate`→`type`→유형별). 변경점은 **표시 위치**: 검증 실패 시 D7로 모달 재오픈하고 `error`를 모달 내부에도 표시. 검증은 **계산 시점 단일**(모달 "확인"은 무검증 닫기 — 라이브 편집, 의도). UI 통과↔validate 차단 모순 없음.

### 지점 ⑨⑩⑪⑫⑬⑭ API/Route — **전부 변경 없음**
엔진 input/result·`deemedGiftInputSchema`(`lib/validators/gift-deemed-input.ts`)·route handler 무관(순수 UI). 신규 필드·enum 0 → ⑫⑬⑭ 침묵 strip 위험 없음.

---

## 4. UI 컴포넌트 패턴 준수

- 날짜 입력 `DateInput`(`@/components/ui/date-input`, `type="date"` 금지) — `feedback_date_input`
- 라디오 `RadioCardGroup`(native 금지, OFF tone 유지, `columns={2}`) — `feedback_toggle_card_visibility` / 2열 배치(PR #295)
- 모달은 shadcn `Dialog`/`DialogContent` — 폭 `sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full p-0` + `showCloseButton={false}`(상속세 재산입력 모달과 동일 폭·마크업)
- **`window.confirm` 금지 / 폐기 확인 다이얼로그 불필요** — 라이브 편집이라 모달 닫기로 폐기되는 draft 없음(`feedback_dialog_data_discard_confirm` N/A)
- **useEffect→store 미러링 금지** — `set()` 직접 호출(라이브), 요약 카드는 `form` 파생(`feedback_useeffect_store_mirror_forbidden`)
- 포커스 시 전체 선택은 `SelectOnFocusProvider` 전역 적용 → 모달 내 input 별도 처리 불필요
- 결과 산식·"원" 단위 표기 규칙 — 결과뷰 무변경이므로 영향 없음

---

## 5. 동기화 지점 체크리스트

| # | 지점 | 파일 | 상태 |
|---|---|---|---|
| ① | 폼 상태 타입 | `shared.tsx` `DeemedFormState` | ✅ 변경 없음 |
| ② | initial | `INITIAL_DEEMED` | ✅ 변경 없음 |
| ③ | normalize | (persist 미사용) | ✅ 해당 없음 |
| ④ | API 변환 | `gift-deemed-api.ts` `buildDeemedGiftInput` | ✅ 변경 없음 |
| ⑤ | **UI 위젯** | `DeemedDetailModal.tsx`(신규) + `DeemedGiftCalculator.tsx`(모달 결선·요약 카드·인라인 제거) | ☐ |
| ⑥ | 사이드바 합계 | **추가 금지** (사이드바 없음) | ✅ 해당 없음 |
| ⑦ | 결과 카드 | `DeemedGiftResultView` | ✅ 변경 없음 |
| ⑧ | validation | `gift-deemed-validate.ts` (로직 동일·표시 위치만 모달 내 `error`) | ☐ 흐름 |
| ⑨~⑭ | Zod/route | `gift-deemed-input.ts`·route | ✅ 변경 없음 |
| + | `set()`에 `setError(null)` 추가 (모달 편집 중 에러 잔존 방지) | `DeemedGiftCalculator.tsx` | ☐ |
| + | D7: `handleCalc` 검증 실패 시 `if (form.type) setModalOpen(true)` | `DeemedGiftCalculator.tsx` | ☐ |
| + | testid: `deemed-detail-dialog`·`deemed-detail-error` 신설, 기존 `deemed-type-*`·`deemed-calc-btn`·`deemed-error`·`deemed-result-value` 유지 | — | ☐ |

### E2E (5 기존 + 신규) — `feedback_browser_verify_with_playwright` · `feedback_e2e_worktree_port_isolation`(E2E_PORT=3105)

helper 추출 (구현 확정):
```ts
async function openDetail(page, type) {            // 유형 선택 → 모달 오픈 → 증여일(모달 내)
  await page.getByTestId(`deemed-type-${type}`).click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("3");
  await dialog.getByLabel("일", { exact: true }).fill("15");  // ★ Do deviation
}
const closeDetail = (page) => page.getByTestId("deemed-detail-confirm").click();
```
> ★ **Do 환류**: 증여일이 모달로 이동하면서 (1) page 스코프 `getByLabel("일").first()`가 "정산기준일" 설명을 가진 `listing_gain` 라디오를 오매칭 → **다이얼로그 스코프**로 한정. (2) `trust_benefit` 모달엔 "증여시기"(약정일·위탁자 사망일 등)·"해지·철회 일시금"이 있어 다이얼로그 내에서도 "일"이 다중 매칭 → **`{ exact: true }`** (DateInput `aria-label="일"` 정확 일치, `date-input.tsx:204`). closeDetail은 `deemed-detail-confirm` testid 사용(메인 calc 버튼 "확인"과 무충돌). 메모리 `project_transfer_input_error_prevention` 함정 재현.
- 기존 5 스펙(`gift-deemed`·`-capital`·`-other`·`-presumption`·`-trust-benefit`): `fillGiftDate`를 유형 클릭 **뒤로** 이동(openDetail), calc 전 `closeDetail`. **TB-UI-2 예외**: calc 없음 → `closeDetail` 불필요, 순서만 조정.
- 신규 `e2e/gift-deemed-detail-modal.spec.ts`: M-1 오픈+요약+계산 / M-2 [수정] 재오픈+입력 보존 / M-3 다른 유형 선택→재오픈 / M-4 증여일 미입력 계산→모달 재오픈 + `deemed-detail-error`.
- ⚠️ `deemed-category-toggle-visibility.spec.ts`는 **상속세** 간주상속재산 스펙(`/calc/inheritance-tax`) → 영향 없음(수정 금지).

---

## 6. 후속 PR (UI 측, 1차 스코프 제외 — 계획서 R3)

- ⓐ 요약 카드에 유형별 핵심 입력값 echo (20종 매핑) — 가독성 향상.
- ⓑ 모달 내 "유형 변경" 인라인 라디오 (모달 안에서 유형 전환).
- ⓒ 모바일 가독성: 모달 전체화면(현 `w-full` + `max-h-[80vh]`로 충분 추정, 실측 후 조정).
