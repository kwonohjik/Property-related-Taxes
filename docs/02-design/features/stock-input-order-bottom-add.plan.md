# 주식 입력 탭 — 입력 순서 표시 + 하단 추가 버튼 계획서

> 대상 컴포넌트: `components/calc/StockValuationForm.tsx` (상속·증여 공용)
> 성격: 순수 UI 변경 (엔진·타입·API·Validation 무변경 — 14 동기화 지점 중 ⑤만)
> worktree: `feat/asset-card-table-modal`

## 1. 배경·목표

사용자 요청 2건:
1. **입력 순서 표시**: 현재 주식 입력 탭은 사용자 입력 순서와 무관하게 항상 **상장 → 비상장** 순으로 강제 표시. → 사용자가 추가한 순서 그대로 표시.
2. **하단 추가 버튼**: PR #76에서 "주식·지분 추가" 버튼을 섹션 헤더 우측으로 이동. 긴 목록에서 헤더가 스크롤 위로 사라지므로, **주식 탭 맨 아래에도** 동일 추가 버튼을 둠(헤더 버튼과 병존).

## 2. 현황 실측 (`StockValuationForm.tsx`)

| 위치 | 현재 동작 |
|---|---|
| `:595-596` | `listedItems = items.filter(listed_stock)` / `unlistedItems = items.filter(unlisted_stock)` |
| `:616-637` | **📈 상장주식 섹션** — `items.map` 중 `listed_stock`만 렌더, `index={listedItems.indexOf(item)}`(`:627`). 그룹 헤더 `<p>📈 상장주식</p>`(`:619-621`) |
| `:639-650` | **📋 비상장주식 섹션** — `items.map` 중 `unlisted_stock`만 렌더, `index={unlistedItems.indexOf(item)}`(`:650`). 그룹 헤더 `<p>📋 비상장주식</p>`(`:642-644`) |
| `:180` | ListedStockEditor 카드 헤더 `📈 상장주식 {index+1}` (자체 타입·번호 표시) |
| `:410` | UnlistedStockCard 카드 헤더 `비상장주식 {index+1}` (자체 타입·번호 표시) |
| `:704-715` | 하단 추가 버튼 — PR #76 이후 `!isAddControlled &&`(`:706`)로 controlled 시 **미렌더**, 텍스트 "주식·지분 추가"(`:713`) |
| controlled | `addPanelOpen`/`onAddPanelOpenChange` (PR #76). **Step1Estate(`:121`)만** 전달 → 헤더 버튼 트리거. gift(`gift-tax-form-shared.tsx:404`)는 미전달=uncontrolled |

**결론**: 두 변경 모두 `StockValuationForm.tsx` 렌더부 국소 수정. 엔진은 카테고리별 합산이라 `items` 순서 무관(계산 결과 불변). 상속(controlled)·증여(uncontrolled) 공용 컴포넌트 1곳 수정으로 양 경로 동시 반영.

## 3. 변경 1 — 입력 순서 표시

### 설계
두 필터 섹션(`:617-650`)을 **단일 순회**로 통합. `items`를 배열 순서대로 한 번 `map`하되, `category`로 분기해 적절한 에디터 렌더:

```tsx
{items.length > 0 && (
  <div className="space-y-3">
    {items.map((item, i) =>
      item.category === "listed_stock" ? (
        <ListedStockEditor
          key={item.id}
          item={item}
          index={listedItems.indexOf(item)}   // 카테고리별 번호 보존 (상장주식 1·2…)
          onUpdate={(u) => handleUpdate(i, u)}
          onRemove={() => handleRemove(i)}
          valuationDate={valuationDate} mode={mode} heirs={heirs}
        />
      ) : (
        <UnlistedStockCard
          key={item.id}
          item={item}
          index={unlistedItems.indexOf(item)} // 비상장주식 1·2…
          onUpdate={(u) => handleUpdate(i, u)}
          onRemove={() => handleRemove(i)}
          mode={mode} heirs={heirs} valuationDate={valuationDate}
        />
      ),
    )}
  </div>
)}
```

### 결정 사항
- **그룹 헤더(📈 상장주식 / 📋 비상장주식 라벨, `:619-621`·`:642-644`) 제거**: 입력 순서로 섞이면 그룹 구분이 무의미. 각 카드가 헤더에 emoji+타입+번호를 자체 표시(`:180`·`:410`)하므로 식별 손실 없음.
- **카테고리별 번호 유지**: `index`는 `listedItems.indexOf`/`unlistedItems.indexOf` 그대로 → "상장주식 1", "비상장주식 1" 의미 보존(전역 통번호 아님).
- `listedItems`/`unlistedItems`는 `index` 계산용으로만 유지(렌더 분기는 `items` 단일 순회).

### 영향 분석 (실측)
- spec들의 `getByText("상장주식"/"비상장주식", { exact: true })`(26개 중 다수)는 **추가 패널 카테고리 버튼**(`:665`·`:677`, 텍스트 정확히 "상장주식")을 클릭하는 용도 — 그룹 헤더가 아님. 그룹 헤더는 `📈 상장주식`(non-exact `<p>`)이라 애초에 매칭 안 됨 → **제거해도 무영향**.
- `getByRole("button", { name: /비상장주식/ })`(예: fiscal-year-autofill `:97`)도 추가 패널 **버튼**만 매칭. 그룹 헤더는 `<p>`(버튼 아님)·카드 헤더는 `<span>`(버튼 아님)이라 그룹 헤더 제거와 무관.
- 엔진/결과뷰/별지: `items` 순서 비의존(카테고리 합산) → 무영향.
- gift(증여세) 경로도 동일 컴포넌트 → 입력 순서 표시가 함께 적용(의도된 일관 동작).

## 4. 변경 2 — 하단 추가 버튼 (헤더와 병존)

### 설계
하단 추가 버튼(`:693-702`)을 controlled 모드에서도 렌더하되, **`items.length > 0`일 때만** 노출:

```tsx
{showAddPanel ? (
  /* 카테고리 picker 패널 (기존 :652-692) */
) : (
  // 빈 목록: 헤더 버튼만(중복·strict 위반 회피). 목록 있으면 하단에도 추가 버튼.
  (!isAddControlled || items.length > 0) && (
    <button
      type="button"
      onClick={() => setShowAddPanel(true)}
      data-testid="stock-add-bottom"
      className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed ... "
    >
      <span className="text-lg">+</span>
      주식·지분 추가
    </button>
  )
)}
```

- 헤더 버튼·하단 버튼 모두 동일 controlled setter(`setShowAddPanel(true) = onAddPanelOpenChange(true)`) 호출 → 같은 패널 토글. 패널 열리면 둘 다 숨김(헤더는 Step1Estate `!stockAddOpen`, 하단은 `showAddPanel ?` 분기).
- uncontrolled(증여세 등 직접 사용처)는 기존대로 항상 하단 버튼(헤더 없음) — `!isAddControlled` 분기로 보존.

### 핵심 리스크 & 완화 — E2E strict 위반
- **26개 spec**이 `getByRole("button", { name: /주식·지분 추가/ }).click()`로 추가 트리거. 하단 버튼을 **무조건** 노출하면 헤더+하단 2개 매칭 → Playwright strict 위반(전 spec 깨짐).
- **완화 = `items.length > 0` 게이팅**: 모든 해당 spec은 **빈 목록에서 1회만 추가**(first-add). 빈 목록 시 하단 버튼 미노출 → 헤더 단독 매칭 → **spec 변경 0**.
- **전수 실측 확정(검토 단계 완료)**: 다중 카운트 7파일(`inheritance-estimated-profit`·`pre-ipo-listing`·`fiscal-year-autofill`·`fiscal-year-annualize`·`capital-change-relocation`·`enter-key-navigation`·`financial-chip-absent`)의 모든 `name:/주식·지분 추가/` 호출이 **test() 블록보다 위(공유 헬퍼)** 또는 **테스트 내 빈 목록 first-add**임을 확인. 유일하게 테스트 본문 내부 호출인 `fiscal-year-autofill:96`(T-FY-AUTO-3)도 `gotoStep0AndFillDeathDate` 직후 **빈 목록 1회 추가**(이후는 간편↔정식 모드 토글, 2번째 추가 아님). → **한 테스트에서 non-empty 2번째 추가 케이스 0건** → `.first()` 보정 불필요, spec 변경 0 확정.
- 신규 testid `stock-add-bottom` 기존 충돌 0건(grep 확인).

## 5. 동기화 지점 (14 중 해당)

| # | 지점 | 변경 |
|---|---|---|
| ⑤ | UI 입력 위젯 | **변경**: 렌더 순서 통합 + 하단 버튼 조건 |
| 그 외 ①②③④⑥⑦⑧⑨~⑭ | — | **무변경** (타입·initial·normalize·API·validation·엔진 불변) |

## 6. 신규 E2E (anchor)

`e2e/stock-input-order-bottom-add.spec.ts`:
- **SO-1 (입력 순서)**: 비상장 추가 → 상장 추가 → 카드 DOM 순서가 [비상장, 상장] (입력 순) 확인. (`.nth(0)`이 비상장 카드, `.nth(1)`이 상장 카드)
- **SO-2 (하단 버튼 게이팅)**: 빈 목록 → `stock-add-bottom` 부재 + 헤더 버튼 단독. 1건 추가 후 → `stock-add-bottom` 노출. 하단 버튼 클릭 → 패널 펼침.
- **회귀**: 기존 26개 중 대표(`inheritance-stock-financial-chip-absent`·`listed-stock-besshi`) — first-add 헤더 단독 매칭 통과 확인.

## 7. Pre-Do anchor (착수 전 우선 검증)
1. 입력 순서 보존 — SO-1로 실증(**현행은 실패 예상**: 항상 상장 우선 → 비상장→상장 입력 시 [상장, 비상장]로 나옴). Do 전 실패 확보.
2. 빈 목록에서 `getByRole("button",{name:/주식·지분 추가/})` 단독 매칭 유지(하단 게이팅 `items.length>0`) — 신규 SO-2로 실증.
3. ~~"2번째 주식 추가(non-empty)" 전수~~ — **검토 단계에서 완료**(§4): non-empty 2번째 추가 0건 확정, `.first()` 보정 불필요.

## 8. 검증 체크리스트
- [ ] `npx tsc --noEmit` 0
- [ ] 신규 `e2e/stock-input-order-bottom-add.spec.ts` SO-1·SO-2 통과
- [ ] 회귀: 주식 추가 사용 26개 spec(특히 다중 카운트 7파일) E2E 통과 — baseline 대조
- [ ] 회귀(gift): 증여세 주식 입력 E2E 1건 — uncontrolled 하단 버튼·입력 순서 동작 확인
- [ ] 카테고리별 번호("상장주식 1"·"비상장주식 1") 유지 확인
- [ ] 브라우저: 비상장→상장 순 입력 시 그 순서로 표시 + 목록 있을 때 하단 버튼 노출

## 10. Do 단계 결과·deviation (구현 후 환류)

- **구현**: `StockValuationForm.tsx` 변경 1(단일 순회 + `data-testid="stock-card"`·`data-category`)·변경 2(`(!isAddControlled || items.length>0)` + `stock-add-bottom`). tsc 0.
- **anchor**: 신규 `e2e/stock-input-order-bottom-add.spec.ts` SO-1·SO-2 — Pre-Do 현행 실패 확보 → 구현 후 2/2 통과.
- **회귀**: 주식 spec 28/28 통과(다중카운트 7파일·gift 경로 T-EP-3·T-L-2 포함).
- **deviation(예상 외 — 사전존재 실패 복구)**: 회귀 중 `enter-key-navigation`·`listed-stock-besshi` 2건이 **heir 추가 단계**에서 실패. 원인은 PR #68 heir **2단계 picker** 전환인데 두 spec이 **1단계 stale 패턴**(`상속인 추가`→`자녀` 직접)을 사용 — 본 stock 변경과 무관(stock 단계 이전 실패). 두 spec이 stock spec이므로 heir-add를 `addHeir`(2단계+모달 RRN)로 마이그레이션해 복구 → 실제 stock 검증 회복. (이전 `inheritance-heir-allocation-table` 복구와 동일 클래스 — PR #68 미완 마이그레이션 잔재.)

## 9. 범위 외 (참고)
- **상속재산(`PropertyValuationForm`) 하단 버튼**: 본 요청은 주식 탭만. 동일 패턴 적용은 후속 별건. (상속재산은 테이블 뷰라 카드 순서 이슈 없음 — 입력 순서 표시는 주식 전용 이슈.)
- **증여세(gift) 경로**: 동일 `StockValuationForm` 사용(`gift-tax-form-shared.tsx:404`)이나 controlled prop 미전달=uncontrolled → 변경 2의 하단 버튼은 **기존대로 항상 노출**(`!isAddControlled` 분기, 헤더 버튼 없음). 변경 1(입력 순서)은 gift에도 동일 적용. gift는 별도 작업 불필요(공용 컴포넌트 수정으로 자동 반영) — 단 Do 단계 gift 주식 입력 E2E 1건으로 회귀 확인.
