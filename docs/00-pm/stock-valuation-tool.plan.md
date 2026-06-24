# 주식 평가 독립 도구 구현 계획서

> 작성일: 2026-06-24
> 상태: Plan (Do 미착수)
> 라우트: `/tools/stock-valuation`

## 1. 목표 / 비목표

### 목표
홈 메뉴에서 **세금 계산을 거치지 않고 주식 가치 평가만** 독립적으로 수행하는 도구를 추가한다.
현재 주식 평가는 상속세·증여세 마법사 Step1에서 "주식"을 선택해야만 진입 가능하다.

- 상장주식 평가 (상증법 §63①1가 — 평가기준일 전후 2개월 종가 단순평균 × 주식 수)
- 비상장주식 평가 (시행령 §54 — (순손익가치×3 + 순자산가치×2)/5, 부동산과다 2:3)
- 키움 OpenAPI 자동조회 재사용
- 별지 평가조서 서식(상장 갑지·을지 / 비상장 부표3) 화면·PDF 출력
- 계산 이력 저장 (`tax_type = "stock_valuation"` 신설)

### 비목표
- 세금(상속·증여세) 계산 — 평가액만 산출, 세액 계산 없음
- 주식 양도소득세(`stock_transfer`)와 통합 — 별개 기능 (`/calc/stock-transfer-tax` 유지)
- 신규 평가 산식 — 기존 엔진 100% 재사용, 산식 변경 0

## 2. 확정된 설계 결정 (사용자 인터뷰 2026-06-24)

| 항목 | 결정 |
|---|---|
| 입력 폼 | **기존 `StockValuationForm` 재사용 (목록형)** — 여러 종목 테이블 + 편집 모달 |
| 결과 출력 | **별지 평가조서 서식까지** (요약 카드 + 갑지/부표3 + 인쇄/PDF) |
| 이력 저장 | **저장함** (`tax_type = "stock_valuation"` 신설) |
| 라우트 | **`/tools/stock-valuation`** (건물 기준시가 도구와 같은 독립 도구 그룹) |
| 이력 `resultData` | **평가대상회사·평가기준일·주식수·평가액** 4필드 (종목별 배열 + 합계) |
| PDF 범위 | **평가조서 전체 PDF** (섹션 선택 없음 — 입력된 종목 전부) |

## 3. 현황 분석 (실측 확인됨)

### 3.1 홈 메뉴
- `app/page.tsx:64-148` — `MENU` 배열. 카드 객체 `{ href, title, subtitle, icon, tone }`.
- `app/page.tsx:16-62` — `TONE_STYLE` (9톤: sky·cyan·emerald·amber·rose·orange·indigo·violet·slate).
- `app/page.tsx:163-189` — `MENU.map()` 자동 렌더. 배열에 객체 추가만 하면 카드 노출.
- 선례: 건물 기준시가 계산기 `{ href: "/tools/building-standard-price", icon: "🏗️" }` (`app/page.tsx:129`).

### 3.2 재사용 입력 폼
- `components/calc/StockValuationForm.tsx` — 목록 테이블 + 편집 모달. props:
  - `items: EstateItem[]`, `onChange`, `mode?: "inheritance" | "gift"`(기본 inheritance), `valuationDate?`, `heirs?`, `hideHeader?`, `addPanelOpen?`/`onAddPanelOpenChange?`.
- `components/calc/inheritance/stock/StockItemEditor.tsx` — 1건 편집 모달 내용물.
  - mode 분기: **inheritance → 협의분할(heirs) 섹션**, **gift → `StockBurdenedDebtSection`(부담부채무)** 렌더.
- `components/calc/inheritance/stock/StockItemTableView.tsx` — 요약 행 렌더.
- `components/calc/KiwoomValuationAutoFetchButton.tsx` + `useKiwoomValuationFetch` — 자동조회. **그대로 재사용 가능.**

### 3.3 평가 엔진 (순수 함수 — 그대로 재사용)
- `lib/tax-engine/property-valuation-stock.ts`
  - `evaluateListedStock(item, { valuationDate })` → `PropertyValuationResult` (`besshiData` 포함).
  - `calcUnlistedStockPerShareValue(data, isRealEstateHeavy)` (간편 V1).
- `lib/tax-engine/property-valuation/unlisted-orchestrator.ts`
  - `evaluateUnlistedStockV2(input)` → `UnlistedStockValuationResult` (정식 V2, 부표3 재현).
- `computeStockValuation(item)`·`resolveUnlistedDisplayMode(item)` — 정의: `lib/tax-engine/valuation/resolve-estate-item-value.ts:69·47` (dual-truth 차단 SSOT). `lib/calc/stock-valuation.ts:23`은 re-export 배럴 → 양쪽 경로 import 가능.

### 3.4 평가조서 서식 (결과뷰·PDF — 그대로 재사용)
- 상장: `components/calc/results/ListedStockBesshiResultSection.tsx` — props `{ estateItems, valuationDate }`. 내부에서 `evaluateListedStock` 호출.
- 비상장: `components/calc/results/UnlistedStockBesshiResultSection.tsx` — props `{ estateItems }`. **`it.unlistedStockValuationV2` 있는 종목만 필터(:27)** → 정식평가(V2)만 부표3 렌더. **간편평가(V1)는 부표3 미생성**(평가액만, 조서 없음).
- 두 섹션 모두 **`estateItems[]`만 받으면 동작** → 독립 도구에서 바로 재사용 가능.
- 현재 호출처: `InheritanceTaxResultView.tsx:24,26` · `GiftTaxResultView.tsx:25,28`.
- 인쇄: `hidden print:block` CSS 토글 + `window.print()`. PDF: react-pdf (`UnlistedStockBesshiPdfDownloadButton`). 건물 도구 `NtsBuildingStdPriceReport`와 동일 패턴.

### 3.5 이력 저장 (확장 필요)
- `actions/calculations.ts:12-20` — `TaxType` union (현재 `stock_transfer`까지 8종).
- `lib/storage/types.ts:7-14` — `LocalTaxType` (7종).
- `lib/storage/use-auto-save-calculation.ts` — 결과 화면 마운트 시 1회 자동 저장 (`resultData = {}`면 skip).
- `lib/storage/title-generator.ts` — 제목 생성.
- `lib/storage/business-key.ts` — dedup용 업무 식별 키.
- `app/history/HistoryClient.tsx` — `TAX_TYPE_LABELS`(23-32)·`FILTER_OPTIONS`(34-43)·`TAX_TYPE_ROUTES`(13-21)·날짜 추출(63-133)·resume(205-260).
- `lib/storage/db.ts:74-76` — Dexie `calculations` 스키마 (taxType 인덱스 — enum 추가만으론 마이그레이션 불필요, 문자열 인덱스).

### 3.6 독립 진입 시 끊어야 할 의존성
| 의존성 | 현재 출처 | 독립 시 대체 |
|---|---|---|
| `valuationDate` | 마법사 `form.deathDate`/`giftDate` | **신규 평가기준일 입력 필드** |
| 협의분할(heirs) UI | inheritance mode | **숨김** (평가만) |
| 부담부채무 UI | gift mode | **숨김** (평가만) |
| 폼 상태 | 마법사 zustand FormState | **전용 경량 store** (이력 resume 위해 필요) |
| 세금 API 호출 | `callInheritanceTaxAPI` 등 | **불필요** (엔진 순수함수 직접 호출) |

## 4. 핵심 설계 포인트 — valuationOnly prop (Do 구현 확정)

> ⚠️ **Do-time deviation**: 당초 §4는 `mode` union에 `"valuation"` 추가를 제안했으나, 구현 중 `heirs`(협의분할)가 **공유 컴포넌트 `EstateCommonAttributesSection`**에서 렌더됨을 확인. mode를 "valuation"으로 확장하면 공유 estate 컴포넌트·`chip-config`·`resolveChips`·그 자식까지 union cascade. → **`valuationOnly: boolean` prop**으로 변경(stock 컴포넌트에만 국한). chip-config·resolveChips·공유 estate 타입 **무변경**. 테이블은 `mode="gift"` 전달(협의분할 컬럼 `mode === "inheritance"` 가드로 자동 숨김).

**구현 (확정)**:
- `StockValuationForm`에 `valuationOnly?: boolean` 추가 → `StockItemEditor`로 전달.
- `StockItemEditor` 3개 컴포넌트(`ListedStockEditor`·`UnlistedStockCard`·dispatcher)에 `valuationOnly` 추가:
  - `true` 시 `<StockBurdenedDebtSection>`·`<EstateCommonAttributesSection>`(협의분할·저당·임대보증금) **미렌더**.
  - `UnlistedStockV2Card`의 `taxKind`는 `valuationOnly ? "inheritance" : mode` (평가심의위원회 패널 union 연쇄 차단 — 중립 default).
- 도구는 `<StockValuationForm mode="gift" valuationOnly … />` 호출.

(이하 당초 분석 — mode 확장 cascade 근거 기록용)

`StockValuationForm`/`StockItemEditor`의 `mode`는 현재 `"inheritance" | "gift"`뿐이다.
순수 평가에서는 **협의분할·부담부채무 둘 다** 숨겨야 한다.

**제안**: `mode` union에 `"valuation"` 추가.

**중요 — 로직 변경은 거의 불필요, 타입 union 확장이 주작업** (실측 확인):
- `StockBurdenedDebtSection`은 `mode !== "gift"` 시 **자동 `return null`**(`components/calc/gift/StockBurdenedDebtSection.tsx:67`) → "valuation"이면 그대로 숨김.
- `StockItemTableView`는 `mode === "inheritance"`일 때만 협의분할 컬럼 렌더(`:150`) → "valuation"이면 그대로 숨김. (주석 :14 "mode!=='inheritance'는 평가액 칩만")
- 즉 **숨김 로직은 이미 존재**. "valuation"이 `!== "inheritance"` AND `!== "gift"`라 두 섹션 모두 자동 미렌더.

**타입 union 확장 필요 지점 (6곳 — TS 컴파일 차단이므로 누락 시 빌드 실패로 즉시 탐지)**:
1. `StockValuationForm.tsx:96` — `mode?: "inheritance" | "gift"`
2. `StockItemEditor.tsx:139` (ListedStock 통합 인터페이스)
3. `StockItemEditor.tsx:333` (메인 에디터 인터페이스)
4. `StockItemTableView.tsx:82`
5. `StockBurdenedDebtSection.tsx:37`
6. `chip-config.ts:286` `countNonDefaultOptions(item, mode)` — `mode !== "inheritance"` 시 `return 0`(실측 확인) → **타입만 확장, 동작 안전**.

**연쇄 차단 (중요)**: `UnlistedStockV2Card.taxKind`(:116)는 `"inheritance"|"gift"`이며 `EvaluationCommitteeResultPanel`·`FilingGuideCard`(:337·339·375)로 재전파된다. `taxKind={mode}`로 그대로 넘기면 union 확장이 **3개 컴포넌트 더** 연쇄. → call site(`StockItemEditor:455`)에서 **`taxKind={mode === "valuation" ? "inheritance" : mode}`**로 매핑해 평가심의위원회 패널 쪽 union 확장을 차단(평가 전용 도구는 상속/증여 신고 안내가 무의미 → 중립 default "inheritance").

> 대안: `hideHeirs`/`hideDebt` boolean prop. → 기존 숨김 로직이 이미 mode 기반이라 union 확장이 자연스럽고 응집적. `"valuation"` 권장.
> ⚠️ Do 착수 시 grep(`mode.*"inheritance".*"gift"`)으로 union 확장 누락 0 확인. `taxKind` 연쇄는 call site 매핑으로 차단됐는지 확인.

## 5. 작업 범위 — Phase별

### Phase A — 라우트 골격 + 홈 메뉴 카드
- `app/tools/stock-valuation/page.tsx` 신규 (건물 도구 page.tsx 구조 차용 — `"use client"`).
- `app/page.tsx` `MENU` 배열에 카드 1개 추가:
  - `{ href: "/tools/stock-valuation", title: "주식 평가", subtitle: "상장·비상장주식 보충적 평가", icon: "📊", tone: "cyan" }`
  - verify: 홈에서 카드 노출 + 클릭 시 라우트 진입.

### Phase B — 독립 평가 폼
- `components/calc/tools/StockValuationTool.tsx` 신규 (오케스트레이터):
  - 평가기준일 `DateInput` 1개 (상단).
  - `StockValuationForm` 렌더 (`mode="valuation"`, `valuationDate`, `items`/`onChange`).
  - 상태: 전용 store(Phase D) 또는 우선 local `useState`.
- mode union `"valuation"` 확장 (§4 — 6곳 타입 확장, 로직 변경 거의 0).
- verify: 상장·비상장 종목 추가·편집·삭제, 키움 자동조회 동작, 협의분할/부담부채무 UI 미노출, `tsc --noEmit` 0건.

### Phase C — 결과뷰 (평가조서)
- `StockValuationTool` 하단에 결과 섹션:
  - `ListedStockBesshiResultSection`(estateItems, valuationDate) + `UnlistedStockBesshiResultSection`(estateItems) 재사용.
  - 상단 요약 카드: 종목별 **평가대상회사·평가기준일·주식수·평가액** + 총 평가액 합계 (`computeStockValuation`·V2 합산 — `StockValuationForm`의 `TotalStockValue` 로직 참고).
- **평가조서 전체 PDF**: 입력된 모든 종목(상장 갑지·을지 + 비상장 V2 부표3)을 섹션 선택 없이 통째로 출력. 상속·증여 PDF의 `selectedSectionIds` 분기 제거한 단순 버전.
  - ⚠️ 비상장 **간편평가(V1)** 종목은 부표3 미생성(§3.4) → 평가조서가 필요하면 V2 정식평가 입력 유도(요약 카드엔 평가액 표시). 안내 문구 노출 검토.
- verify: 평가조서 갑지/부표3 화면 표시 + 인쇄 펼침 + 전체 PDF 다운로드.

### Phase D — 이력 저장
- `actions/calculations.ts:12` `TaxType`에 `"stock_valuation"` 추가.
- `lib/storage/types.ts:7` `LocalTaxType`에 `"stock_valuation"` 추가.
- `lib/storage/title-generator.ts` — 라벨 `"주식 평가"` + 제목 생성(대표 종목명 + 평가기준일).
- `lib/storage/business-key.ts` — `stock_valuation` dedup 키 (종목·평가기준일 기반).
- `app/history/HistoryClient.tsx` — `TAX_TYPE_LABELS`·`FILTER_OPTIONS`·`TAX_TYPE_ROUTES`(`/tools/stock-valuation`)·날짜/요약 추출 분기.
- `components/history/HistoryDetailDrawer.tsx` — 상세 표시 분기.
- 전용 store `lib/stores/calc-stock-valuation-store.ts` 신규 (sessionStorage persist, `result` partialize 제외) + `normalizeStockValuationFormData`.
- 결과 화면에 `useAutoSaveCalculation({ taxType: "stock_valuation", inputData, resultData, ... })` 적용.
  - `resultData` 형태(확정): 종목별 `{ companyName, valuationDate, shares, valuationAmount }[]` + `totalValuationAmount`. (auto-save skip 방지 위해 비어있지 않게 보장.)
  - **"평가대상회사" 추출 category 분기**: listed=`item.companyName`(없으면 `item.name`), 비상장 V2=`item.unlistedStockValuationV2.corpName`, 비상장 V1=`item.name`. 단일 필드 가정 금지(V1/V2 공란 위험).
  - **"주식수" 추출**: listed=`listedStockShares`, 비상장 V2=`unlistedStockValuationV2.ownedShares`, V1=`unlistedStockData.ownedShares`.
- HistoryClient resume 분기 — store hydrate 후 `/tools/stock-valuation` push.
- Zod validation: `actions/calculations.ts`의 `TaxType`은 union 확장으로 자동 적용. **단** `app/api/history/route.ts:19` Zod enum은 현재 `["transfer, inheritance, gift, acquisition, property, comprehensive_property"]`로 **`stock_transfer`조차 미포함**(실측) → 이 route는 저장 경로가 아닌 별도 용도로 추정. Do 착수 시 stock_transfer 저장이 어느 경로(Server Action vs 이 route)를 타는지 확인 후, 같은 경로에 `stock_valuation` 추가.
- verify: 평가 후 이력 목록 노출 → 클릭 → 폼 복원.

### Phase E — 검증
- `npx tsc --noEmit` 0건.
- anchor: 상장(종가평균×주식수)·비상장 V2 평가액 — 기존 엔진 테스트값 재사용으로 1건씩.
- E2E `e2e/stock-valuation-tool.spec.ts` — 진입→상장 입력→평가액 표시 / 비상장 V2→부표3 표시 / 이력 저장.
- 회귀: 기존 상속·증여 주식 평가 E2E 그대로 통과 (mode 확장이 inheritance/gift 무영향).

## 6. 신규/수정 파일 목록 (예상)

**신규**
- `app/tools/stock-valuation/page.tsx`
- `components/calc/tools/StockValuationTool.tsx`
- `lib/stores/calc-stock-valuation-store.ts`
- `e2e/stock-valuation-tool.spec.ts`
- (이 계획서) `docs/00-pm/stock-valuation-tool.plan.md`

**수정**
- `app/page.tsx` (MENU 카드 1개)
- mode union `"valuation"` 확장 (6곳 — §4): `StockValuationForm.tsx` · `StockItemEditor.tsx`(2 인터페이스) · `StockItemTableView.tsx` · `StockBurdenedDebtSection.tsx` · `chip-config.ts`(`countNonDefaultOptions`) · `UnlistedStockV2Card`(taxKind 경유)
- `actions/calculations.ts` · `lib/storage/types.ts` (enum)
- `lib/storage/title-generator.ts` · `lib/storage/business-key.ts`
- `app/history/HistoryClient.tsx` · `components/history/HistoryDetailDrawer.tsx`

## 7. 위험 / 미해결 질문

1. **mode 확장 범위** (Do 착수 시 확인): `StockItemEditor` 외에 `StockItemTableView`·`computeStockValuation` 경로가 mode를 참조하는지 grep 확인 필요 (현재 TableView는 `mode`·`heirsCount` prop 받음 — `valuation`에서 협의분할 컬럼 숨김 처리 확인).
2. ~~이력 resultData 형태~~ **확정**: 종목별 `{ companyName, valuationDate, shares, valuationAmount }[]` + `totalValuationAmount`. 비어있지 않으므로 auto-save skip 없음.
3. **비로그인 저장**: 건물 도구는 이력 미저장이라 선례 없음. 일반 세목과 동일하게 IndexedDB→로그인 후 마이그레이션 경로 그대로 태움.
4. ~~PDF 선택 출력~~ **확정**: 평가조서 전체 PDF (섹션 선택 없이 입력된 종목 전부). `selectedSectionIds` 분기 제거한 단순 버전.

## 8. 정책 점검 (메모리)

- ✅ `feedback_api_zod_schema_sync` — enum 추가 시 동기화 지점 전수 (Phase D).
- ✅ `feedback_no_silent_apportion_fallback` — 자동 안분 없음 (평가만).
- ✅ `feedback_useeffect_store_mirror_forbidden` — valuationDate→items 미러링 금지, 직접 prop 전달.
- ✅ `mirror-pattern` — display fallback + validate fallback 3중 패턴.
- ✅ `feedback_browser_verify_with_playwright` — 검증은 E2E spec으로 (수동 안내 금지).
- ✅ `feedback_no_internal_id_in_result` — 결과/이력에 stock- id 노출 금지, 종목명 사용.
