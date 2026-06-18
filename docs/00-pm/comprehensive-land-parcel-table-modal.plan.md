# 종합합산·별도합산 토지 필지 — 테이블 + 모달 전환 계획

> 작성 기준: 2026-06-18 · 전 file:line 실측(grep/Read) 완료, 추정 없음.
> 참조 패턴: 주택 `PropertyListInput`(이미 테이블+모달) · 상속재산/주식/채무 동형 전환.

## 1. 배경 / 현황

종합합산·별도합산 토지의 **필지별 자동 계산** 모드는 현재 **인라인 확장 카드**다
(이미지18 — `필지 1` 큰 카드 + `필지 추가`). 같은 마법사의 주택(`PropertyListInput`)·상속재산·
주식·채무는 이미 **요약 테이블 + 행 클릭 Dialog 모달**로 통일돼 있어, 토지만 구형 인라인이다.

**현재 구조** (`components/calc/comprehensive/LandParcelSection.tsx`, 192줄):
- `:49-137` `parcels.map` 인라인 카드 — 시군구·필지명·총면적·지분율·당해공시지가·(직전공시지가).
- `:139-145` `+ 필지 추가` 버튼.
- `:37-47` 집계/필지 모드 토글(`RadioCardGroup`), `:147-187` 직전연도 §15 서브모드(none/auto/direct).
- `aggregate`·`separate` 공용 (`kind` prop).

## 2. 목표

1. 필지 목록을 **요약 테이블 + 행 클릭 Dialog 모달**로 전환 (주택과 동일 UX).
2. `aggregate`·`separate` 공용 유지 (`kind` prop).
3. 추가 직후 자동 모달 오픈(E-1) · 삭제 시 모달 닫힘(E-2) · 빈 필지 자동 제거(E-3).
4. **엔진·API·validation·결과 무변경** — 순수 UI(⑤) 전환.

### 비범위 (Non-goals)

- `LandParcelForm` 데이터 스키마 무변경 (`store:97-106`).
- **집계 직접입력(summary) 모드 무변경** — 이번 전환은 `parcels` 모드 한정.
- **직전연도 §15 모드 토글·집계/필지 토글은 섹션 레벨 유지**(모달 밖). per-parcel 직전공시 *필드*만 모달 안.

## 3. 변경 지점 (검증된 file:line)

### A. 스토어 — `addLandParcel` id 반환 (auto-open용)

- `lib/stores/comprehensive-wizard-store.ts:366` `addLandParcel: (kind) => {…}` →
  **새 필지 id 반환** (`addProperty:303-312` 동일 패턴). 인터페이스 `:276` 시그니처
  `addLandParcel: (kind) => string` 으로 갱신.
- `removeLandParcel:384`·`updateLandParcel:395`·`LandParcelForm:97` — 무변경.

### B. 신규 `LandParcelTableView` (PropertyListTableView 미러)

- `components/calc/comprehensive/LandParcelTableView.tsx`.
- 컬럼: **필지(번호) · 시군구 · 필지명 · 면적(우정렬) · 지분 · 당해 공시지가(우정렬) · 편집**.
  (금액/숫자 셀 `text-right font-mono tabular-nums whitespace-nowrap` — amount-column-align.)
- 행: `role="button"` · `tabIndex={0}` · `onKeyDown`(Enter/Space) · `aria-label="필지 N 편집"` ·
  `data-testid={`land-${kind}-parcel-row-${parcel.id}`}` · 선택 시 violet 하이라이트.
- `parcels.length === 0` → `return null` (빈 상태 안내는 Section에서).

### C. 신규 `LandParcelEditor` (모달 본문 — 패턴만 차용)

- `components/calc/comprehensive/LandParcelEditor.tsx`.
- ★ `PropertyCardEditor`(640줄, 주택 전용 §8④·합산배제·다가구 방대)의 **literal 미러 아님** —
  controlled(`parcel` + `onUpdate`) 패턴만 차용. 6필드 소형 + **내부 state 불필요**(순수 controlled).
- props: `{ parcel, kind, refDate, priorYear, priorMode, onUpdate }`.
- 필드(현행 인라인 `LandParcelSection:68-135`과 동일, 2열 그리드):
  - 시군구(text) · 필지명(text)
  - 총면적(`DecimalInput`) · 지분율(`DecimalInput`)
  - 당해 개별공시지가 `LandPriceLookupField`(refDate)
  - `priorMode === "auto"` 시 직전연도 `LandPriceLookupField`(priorYear-06-01)
- ★ **`LandPriceLookupField` prop은 현행과 100% 동일** — `label`·`pricePerSqm`·`onPricePerSqmChange`·
  `referenceDate`·`jibun`만 전달, **`area` 미전달 유지**. (현행 인라인이 `area`를 안 넘겨 토지기준시가
  자동표시가 현재도 미작동 — 동작 보존. area 배선은 별도 enhancement scope 밖.)
- **모달은 1필지만 표시 → field testid에서 인덱스 제거**:
  `land-${kind}-parcel-jurisdiction` / `-area` / `-share` / `-price` / `-prior-price`
  (kind 포함이라 aggregate↔separate 구분됨). 모달 컨테이너 testid `land-${kind}-parcel-dialog`.

### D. `LandParcelSection` → 오케스트레이터 (PropertyListInput 미러)

- `:37-47` 집계/필지 모드 토글 — **유지**.
- `parcels` 모드 블록(`:49-189`)을 다음으로 교체:
  - `selectedParcelId` `useState<string|null>`(UI ephemeral — store 금지).
  - 0필지면 빈 상태 안내, 아니면 `<LandParcelTableView>`.
  - `<Dialog>` + `<DialogContent>` + `<LandParcelEditor key={parcel.id}>` (PropertyListInput:125-177 패턴).
    모달 헤더 `필지 N 편집`, footer 삭제(rose)·닫기.
  - `+ 필지 추가` 버튼(유지) — `handleAdd = () => setSelectedParcelId(addLandParcel(kind))`.
    초기 `landAggregateParcels:[]`이므로(주택과 달리 자동 1건 없음) parcels 모드 진입 시 빈 상태 → 추가 클릭.
    **자동 1필지 추가 안 함**(현행 동작 보존).
  - `closeModal`: 빈 필지(`isEmptyParcel`) 자동 제거 — 주택 closeModal과 동일.
    `isEmptyParcel(p)` = jurisdiction·name·jibun·area·officialPricePerSqm·priorOfficialPricePerSqm 모두 공백
    **AND** shareRatio가 빈/기본("100"). (신규 필지 기본 `shareRatio:"100"` `store:374` — 의도 입력만 판정.)
    주택과 달리 length 가드 없음(0필지 허용) → 마지막 빈 필지도 닫으면 제거.
  - 삭제 가드: 토지는 0필지 허용(필지 모드 자체가 선택) → `canRemove` 항상 true.
- `:147-187` 직전연도 §15 서브모드(`RadioCardGroup` + direct `CurrencyInput`) — **유지**(모달 밖).

### E. 빈 상태 안내 (Section)

- `parcels.length === 0` 시 sky tone 카드: "필지가 없습니다. &lsquo;필지 추가&rsquo;로 입력하세요."
  (`PropertyListTableView`가 0건이면 null이므로 대체 안내 — 주택 `property-empty-state` 패턴.)

### F. 소비처 — 무변경

- `app/calc/comprehensive-tax/page.tsx` Step4Land(`:278`·`:342`)는 `<LandParcelSection kind=… />`
  호출만 — 시그니처 동일 → 무변경.

## 4. E2E 재작성 (testid 변경 — 필수 동기화)

현행 인덱스 testid(`land-${kind}-parcel-${index}-jurisdiction` 등)에 의존하는 **2 스펙 동시 갱신**:

- `e2e/comprehensive-land-payable-calc.spec.ts` — `fillParcel` 헬퍼를
  "**필지 추가(자동 모달 오픈) → 모달 필드 fill → 모달 닫기**" 로 재작성. 사례10 결과 **8,638,017 유지**(회귀 anchor).
- `e2e/comprehensive-land-only-zero-house.spec.ts` — 동일 `fillParcel` 갱신.
- ★함정(메모리 [[project_stock_item_table_modal_plan]]·[[project_heir_composition_table_modal_view]]):
  - **1건씩 add→fill→close 반복** — 모달이 열린 동안 "필지 추가" 버튼은 Dialog overlay 뒤라 클릭 불가.
    현행 `필지 추가 ×3` 연속 후 인덱스 fill 패턴은 **불가** → 추가마다 모달 채우고 닫아야 다음 추가 가능.
  - 계산/다음 **전 모달 닫기**(닫기 버튼 또는 backdrop) — 모달 열린 채 계산 클릭 오작동.
  - 동적 testid는 `land-${kind}-parcel-row-${id}`로 접근(인덱스 아님 — count 보존).
  - fill 후 닫으면 비어있지 않아 prune 안 됨(데이터 유지) — 빈 채 닫으면 자동 제거됨.

## 5. 7 동기화 지점 (UI 전용 전환)

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | `LandParcelForm` | 무변경 |
| ② initial | `landAggregateParcels:[]` 등 | 무변경 |
| ③ normalize | merge(`:529-530`) | 무변경 |
| ④ API 변환 | `comprehensive-api.ts:344-364` `toParcels` | 무변경 (parcels 배열 그대로) |
| ⑤ UI 위젯 | **테이블+모달** | **변경** (B·C·D) |
| ⑥ 사이드바 합계 | **N/A (확인 완료)** — 종부세 마법사는 `WizardSidebar`·`compute*Summary` 미사용(page.tsx 607줄 전수, Sidebar import 0건) |
| ⑦ 결과 카드 | `LandPayableTaxCalcCard` | 무변경 |
| ⑧ Validation | Zod 필지 refine(`comprehensive-input.ts:548-558`) | 무변경 |

## 6. 800줄 정책

분리로 각 파일 소형 유지: Section 오케스트레이터(~120) + TableView(~90) + Editor(~110).
현행 단일 192줄 → 3파일. 위반 없음.

## 7. 테스트 계획

- **RTL 신규**: `LandParcelTableView` 행 렌더(컬럼 값) · `LandParcelEditor` 필드 입력 → `onUpdate` 호출.
- **E2E 재작성 2종**: 사례10 8,638,017 회귀 anchor 유지 + 모달 흐름.
- **기존 유지**: `__tests__/components/comprehensive-land-payable-calc.test.tsx`(결과 카드 RTL — UI 입력과 무관) 무변경 통과.
- `npx tsc --noEmit` 0 · `npx vitest run __tests__/…/comprehensive-land*` · 전체 `npm test`.

## 8. 작업 순서 (Do)

1. 스토어 `addLandParcel` id 반환(A) — tsc anchor.
2. `LandParcelTableView`(B) 신규.
3. `LandParcelEditor`(C) 신규.
4. `LandParcelSection` 오케스트레이터 전환(D·E).
5. E2E 2종 재작성(4) + 실행 — 사례10 anchor 통과 확인.
6. RTL(7) + tsc + vitest 전체.
7. 브라우저 수동 확인 또는 E2E 통과로 충족.

## 9. 리스크 / 주의

- **testid 변경 → E2E 2종 동시 갱신 필수** — 누락 시 회귀(§4). 변환 전 현행 E2E green 확인 → 전환 후 재green.
- **직전연도 auto 모드 ↔ 모달 직전공시 필드** — `priorMode` prop을 Editor에 전달, auto일 때만 노출.
  priorMode를 none→auto로 바꾸면 이미 입력된 필지의 직전공시 칸이 모달에서 보여야 함(per-parcel 보존).
- **빈 필지 자동 제거(closeModal)가 사례10 3필지 입력 흐름을 깨지 않는지** — E2E로 확인
  (추가→fill→닫기 시 비어있지 않으므로 prune 안 됨).
- **⑥ 사이드바 — N/A 확정**(§5). 종부세 마법사 사이드바 없음(page.tsx 607줄·Sidebar import 0건).
- aggregate·separate 두 인스턴스가 같은 컴포넌트를 `kind`로 분기 → `selectedParcelId`는
  **인스턴스별 독립 useState**(컴포넌트 2회 렌더)이므로 교차 오염 없음 — 확인 완료(`page.tsx:278`
  aggregate · `:342` separate 각 1회 독립 렌더). 모달 컨테이너 testid도 `land-${kind}-parcel-dialog`로 분리.
