# 함께 양도 일반건물 — 결과 카드 블록 7종 자산별 표시 계획서 v0.1

**작성**: 2026-10-23 · **상태**: Q-1 a · Q-2 a · Q-3 a 확정(2026-10-23) — 구현 완료(§9)
**선행**: #2466(`gb-bundled-result-formulas.plan.md` Q-1 a — 블록 7종은 이 별건으로 분리). #2466이 함께 양도 일반건물 자산마다 결과 상세를 `aggregated.generalBuildingDetailsByAsset`(키 = 카드 id 접미사 `primary`·`asset-…`)에 싣게 했다 — 이 계획은 그 상세를 결과 카드 블록에 잇는다.

## 1. 현상 — 실측 (2026-10-23 · 폼 → ④ → route POST · mock 세율)

블록 7종은 모두 `BundledAllocationCard.tsx`(일반건물 단건·함께 양도 공용 결과 화면)에 있고, 단건 슬롯 `aggregated.generalBuildingValuationDetail` 또는 `aggregated.swapApplied`를 읽는다. 함께 양도는 그 슬롯이 없어(#2466 C-1 — 수정신고 판별자) **7종 전부 화면에 안 나온다.** 세액은 단건과 같다(일반건물 파트 카드의 취득가액·차익이 단건과 일치 — 아래 각 행).

시료마다 「일반건물 단건」 · 「일반건물(첫 자산) + 토지 3억」 · 「토지 + 일반건물(둘째 자산)」 세 가지로 쟀다.

| # | 블록 (위치) | 단건 소스 | 함께 양도 자산별 상세에 재료가 있나 | 시료 · 실측 |
|---|---|---|---|---|
| B1 | 구분 기재 미입력 안내 (`:297`) | `slot.saleApportionBasisKind` + 첫 일반건물 폼 | ✅ 환산·실가 모두 | UNENT-act(구분 기재 선택 + 두 칸 비움): 단건 `std_price` · 함께 양도 상세 `std_price` |
| B2 | §100③ 판정 (`:305`) | `slot.saleSplitJudgment` | 환산 ✅ · **실가 ❌** | S100-est: 상세에 판정 있음 · S100-act(토지 13억·건물 3억 구분 기재): 단건 판정 있음 / 함께 양도 상세 **없음** |
| B3 | §163⑨ 상속 취득가액 (`:322`) | `slot.acquisitionByInheritance`·`buildingAcquisitionByInheritance` + 안분 표 행(`:340` `assetKind`로 파트 행 조회) | 환산 ✅ · **실가 ❌** | INH(1988 전부 상속 · 실가): 단건 `true/true` · 함께 양도 상세 **없음** / INH-est: 둘 다 `true/true` |
| B4 | 의제취득일 전 ①②③ (`:363`) | `slot.preDeemedAcquisition` | ✅ | PRE(1980 상속): 상세에 비교 echo 있음(토지 50,000,000 / 205,000,000 / 239,016,745 → 환산 채택) |
| B5 | 환산주택가격 99-164-10 (`:373`) | `slot.convertedHousing` | ✅ | CONV: 상세 `converted` 285,155,035 = 단건 |
| B6 | §97②2호 단서 swap (`:439`) | `aggregated.swapApplied`·`swapComparison` | **❌** (어디에도 없음) | SWAP(환산 · 자본적지출 5억): 단건 발동(환산측 269,553,853 < 직접측 510,000,000) · 함께 양도 `swapApplied` 없음. 세액은 반영됨 — 카드 차익 토지 448,657,498 · 건물 −33,657,498로 단건과 같다 |
| B7 | 3-way 표 (`GeneralBuilding3WayTable.tsx:16`) | `aggregated.properties`가 **정확히 3건** + `slot.assetCards` | 카드 ✅(접미사 id) | EXT3(증축): 함께 양도는 카드 4건(다른 자산 포함)이라 `length !== 3`으로 미표시 |

- 🔑 **안분 표 행은 함께 양도에서 자산 단위다** — 일반건물 주 자산 행 `assetId "primary"`·`assetKind "land"`(`bundled-apportionment.ts:127` — `general_building`은 `"land"`로 떨어진다)·라벨 「주 자산」. 그 행의 `allocatedAcquisitionPrice`는 파트 값이 아니다(INH 300,000,000 · UNENT-act 0 · PRE 50,000,000). B3가 단건처럼 `assetKind`로 행을 찾으면 「토지분 = 주 자산 행 값」·「건물분 없음」이 된다.
- 단건에서는 안분 표 행 값 = 파트 카드 취득가액이다(INH·INH-est·PRE·EXT-LOSS·UNENT-act 5시료 전부 일치 — 예 INH-est 토지 236,065,921 · 건물 172,731,161).
- 같은 슬롯을 읽는 소비처가 결과 카드 밖에도 있다 — 구분 기재 미입력 안내 모음 `collectSaleSplitUnenteredNotices`(`sale-split-unentered-notice.ts:85`)를 **신고서 양식 표**(`FilingFormTable.tsx:74`)와 **상세명세서**(`DetailedStatementHelpers.ts:231`)가 쓴다. B1과 같은 원인으로 함께 양도에서 빠진다.

## 2. 원인

- **표시(⑦)**: 블록 7종이 단건 슬롯만 읽는다. #2466이 자산별 상세를 만들었지만 블록에는 잇지 않았다(그 계획서 Q-1 a).
- **서버 echo(⑭)** 두 곳:
  - 실가 분기 결과 상세 재료 `buildGbPartCards`(`general-building-part-cards.ts:129` `detailBase`)에 §100③ 판정·§163⑨ 상속 표지가 없다. 단건 실가 경로는 같은 값을 직접 싣는다(`general-building-route-actual.ts:626-643`). 환산 분기는 `gbOut` 전체를 넘겨 이미 있다.
  - swap 결정은 `buildGbCompanionItems`(`general-building-part-cards.ts:266` `swap`) 안에 있지만 결과에 싣지 않는다. 단건은 `general-building-route-helper.ts:315`가 `aggregated.swapApplied`·`swapComparison`을 채운다.

## 3. 설계 제약 — 실측·코드 확인

| # | 제약 | 근거 |
|---|---|---|
| C-1 | 단건 슬롯은 계속 쓰지 않는다(수정신고 판별자). 블록은 자산별 상세를 읽는다 | #2466 C-1 · `transfer-amendment-entry.ts:71` |
| C-2 | **B3 파트 값은 안분 표 행이 아니라 그 자산의 파트 카드 취득가액**에서 가져온다(§1 🔑). 단건은 종전대로 안분 표 행을 쓴다(값이 같지만 경로를 바꾸지 않는다 — 회귀 0) | §1 실측 |
| C-3 | **블록마다 폼 자산도 그 자산의 것**이어야 한다 — B1 `isSaleSplitActual(…)`·B2 `saleSplitExemptionNote`는 지금 첫 자산(또는 첫 일반건물) 폼을 본다. `primary` → 첫 자산 · 그 밖은 `assetId` 일치(#2466 `gbFormulaInputsOf`와 같은 규칙) | `BundledAllocationCard.tsx:300·309` |
| C-4 | **B7의 결손 통산이 다른 자산으로 넘어간다** — EXT-LOSS(증축 · 건물 취득가 7억): 건물 결손 437,335,238을 단건은 토지가 전부 흡수, 함께 양도는 일반건물 토지 347,107,531 + 함께 양도 토지 90,227,707이 나눠 흡수한다. 표의 「결손 통산」 합계 칸은 `"0"` 하드코딩(`:219`)이고 각주는 「합계는 통산 전후 동일」(`:235`)이라 **그대로 그리면 거짓**이 된다 | 실측 · Q-2 |
| C-5 | **축 B(지분 분할 취득)도 같은 `detailBase`를 쓴다** — FRAC-act-split·FRAC-inh(50% 지분 둘 · 실가) 실측에서 단건 슬롯에 판정·상속 표지가 없다(같은 뿌리). 다만 축 B는 지분마다 판정·상속 여부가 달라 첫 지분 재료를 싣는 현행 조립(`general-building-fractional.ts:281` — ①②③도 같은 이유로 비운다)에 그대로 얹으면 다른 지분의 값으로 오독된다 | 실측 · Q-3 |

## 4. 설계

- **D-1 (⑭ 서버 echo — 함께 양도 상세만)**
  - 실가 분기 표시 echo를 함수 하나로 뽑는다 — `general-building-route-actual.ts`의 `actualExpenseEcho`처럼. §100③ 판정·§163⑨ 상속 표지 2종을 담는다. 단건 실가 경로(`:626`)와 `buildGbPartCards` 실가 분기가 같은 함수를 쓴다.
  - `buildGbPartCards`는 그 echo를 `detailBase`가 아니라 **별 필드**로 돌려준다. 이렇게 해야 축 B가 바뀌지 않는다(C-5 · Q-3 a). `buildGbCompanionItems`의 `onDetail` 조립에서만 펼친다.
  - swap 비교 조립(`general-building-route-helper.ts:315-328` — 발동 파트만 합산)을 함수로 뽑아 단건 경로와 `onDetail`이 같이 쓴다. 자산별 상세에 `swapComparison`을 싣는다. 타입은 `transfer-aggregate.types.ts`의 `generalBuildingDetailsByAsset` 값 타입을 `GeneralBuildingOutput & { swapComparison? }`로 넓힌다(767줄 `general-building.types.ts`는 건드리지 않는다).
- **D-2 (⑦ 표시)**
  - 블록 B1~B6을 새 컴포넌트 `GbResultBlocks`로 옮긴다(`BundledAllocationCard.tsx` 625줄 → 약 400줄). 입력은 「블록 뷰」 하나다:
    - 상세
    - 폼 자산(C-3)
    - 파트 취득가액 조회(C-2)
    - swap 비교
    - 자산 라벨(함께 양도만)
  - 뷰 목록은 헬퍼 하나가 만든다.
    - 단건(슬롯 있음): 뷰 1개 — 지금과 같은 소스(안분 표 행 · `aggregated.swap*`)라 화면이 바뀌지 않는다.
    - 함께 양도: `generalBuildingDetailsByAsset`를 폼 자산 순서로 펼친다. 라벨은 안분 표 행 라벨(「주 자산」·「자산 2」)이다.
    - 저장된 옛 결과(둘 다 없음): 0개 — 지금처럼 미표시.
  - 배치는 Q-1에 따른다.
  - B7 `GeneralBuilding3WayTable`은 `aggregated` 대신 **그 자산의 카드 3장 + 상세 카드**를 받는다.
    - 카드는 접미사로 고른다(#2466이 상세 카드 id = 응답 카드 id를 고정했다).
    - 「결손 통산」 합계 칸과 각주는 Q-2에 따른다.
  - `collectSaleSplitUnenteredNotices`의 aggregate 분기는 자산별 상세를 돈다. 자산이 둘 이상이면 자산 라벨을 앞에 붙인다(split 분기와 같은 규칙).
- 입력·계산 불변 — ①~⑥·⑧~⑬ 변경 없음. 세액 불변을 anchor로 고정한다.

## 5. 결정 필요

| Q | 질문 | 선택지 | 권장 |
|---|---|---|---|
| **Q-1** | 배치 | a **자산별 묶음** — 일반건물 자산마다 「일반건물 — 주 자산」 같은 소제목 아래 B1~B6을 단건과 같은 모양으로 반복(안분 표 바로 아래, 지금 자리). B7은 「핵심 결과·계산 내역」 자리에서 자산별 반복 / b **블록별** — 블록 하나 안에 자산별 행을 나열 | **a** — 블록마다 문장·산식 구조가 달라(B2 판정 명세 · B5 산식 · B6 비교식) 자산별 행으로 접으면 블록마다 새 레이아웃이 필요하다. a는 단건 블록을 그대로 재사용하고, 일반건물이 하나뿐인 함께 양도도 소제목으로 「어느 자산의 판정인가」가 분명해진다. 단건은 소제목 없이 지금과 같다 |
| **Q-2** | 3-way 표의 결손 통산이 다른 자산으로 넘어갈 때(C-4) | a **표 유지 + 합계 칸 계산** — 「결손 통산」 합계를 하드코딩 0 대신 세 칸의 실제 합으로 적는다. 0이 아니면 각주를 「결손 일부(90,227,707)가 함께 양도한 다른 자산에 흡수됨 — 이 표의 통산 후 합계는 통산 전과 다르다」로 바꾼다 / b 함께 양도는 통산 2행을 빼고 양도소득금액(통산 전)까지만 / c 함께 양도는 3-way 표를 계속 안 그림 | **a** — 단건은 실제 합이 늘 0이라(EXT-LOSS 단건: 흡수 437,335,238 = 기여 429,821,909 + 7,513,329) 화면이 바뀌지 않는다. 함께 양도에서는 「결손이 어디로 갔는가」가 바로 이 표가 보여 줄 정보다. b·c는 정보를 버린다 |
| **Q-3** | 축 B(지분 분할 취득) 실가 분기의 §100③·§163⑨ 블록 누락(C-5 — 같은 뿌리) | a **이번에는 함께 양도만** — echo를 함께 양도 상세에만 싣는다(축 B 화면 불변). 축 B는 별건으로 기록 / b 함께 고침 | **a** — 축 B는 지분마다 판정·상속 여부가 달라 「지분별 블록」 설계가 따로 필요하다(①②③을 비운 이유와 같다 `general-building-fractional.ts:280`). 첫 지분 값을 얹으면 오독이다. 함께 양도는 자산 하나가 한 지분이라 이 문제가 없다 |

### 5.1 확정 (2026-10-23 — 권장안)

- **Q-1 a**: 자산별 묶음으로 배치한다.
- **Q-2 a**: 3-way 표는 유지하고, 결손 통산 합계 칸을 계산하며 각주를 분기한다.
- **Q-3 a**: 함께 양도만 고친다. 축 B는 별건이다.

## 6. 범위 · 동기화 지점

- ⑭ `app/api/calc/transfer/general-building-part-cards.ts`(293줄)
- ⑭ `general-building-route-actual.ts`(651줄 — 실가 표시 echo 함수)
- ⑭ `general-building-route-helper.ts`(356줄 — swap 비교 함수)
- 타입 `lib/tax-engine/types/transfer-aggregate.types.ts`
- ⑦ `components/calc/results/BundledAllocationCard.tsx`(625줄 → 블록 분리)
- ⑦ 신규 `components/calc/results/transfer/GbResultBlocks.tsx` + 뷰 헬퍼
- ⑦ `GeneralBuilding3WayTable.tsx`(241줄)
- ⑦ `sale-split-unentered-notice.ts`(99줄)
- `bundled-route.ts`·`bundled-split-helpers.ts`(779줄)는 **건드리지 않는다**. `onDetail` 콜백은 그대로 쓰고, 상세 내용만 늘어난다.

## 7. 검증 계획

- **anchor (`.test.tsx` — route POST 응답으로 `BundledAllocationCard` 렌더)**
  - 함께 양도(첫 자산·둘째 자산 둘 다)에서 B1~B7이 자산 소제목 아래 단건과 같은 문장·금액으로 뜬다.
    - B3 파트 값은 카드 값이다 — INH 토지 300,000,000 · 건물 150,000,000. 주 자산 안분 행 값이 아니다.
    - B6은 269,553,853 < 510,000,000.
    - B7 EXT-LOSS는 합계 칸이 0이 아닌 실제 합이고, 각주가 바뀐다.
  - 일반건물 둘 + 토지면 블록이 자산별로 섞이지 않는다.
  - 신고서 표·상세명세서의 구분 기재 미입력 안내가 함께 양도에서도 나온다.
- **단건 회귀 0**
  - 7시료 단건 렌더 결과 텍스트가 구현 전후로 같다. 구현 전에 스냅샷을 떠 둔다.
  - 기존 `gb-extension-4mode-ui`·`evidence-gone-sweep` 등 블록 테스트가 전건 통과한다.
- **불변**
  - 결정세액 불변(S100-act 322,530,000 · INH 366,630,000 · SWAP 147,621,100 · EXT3 298,063,320).
  - 수정신고 판별은 `"bundled"` 유지.
  - 축 B 슬롯에 판정·상속 표지가 여전히 없다(Q-3 a 고정).
- **뮤테이션 후보**
  - 실가 echo 미적재
  - swap 비교 미적재
  - B3를 안분 행에서 읽기
  - 폼 자산을 첫 자산으로 고정
  - 3-way 접미사 필터 제거
  - 합계 칸 하드코딩 0 복귀
  - 축 B `detailBase`에 echo 적재
  - 단건 뷰를 상세 경로로 돌리기
- **E2E**: 함께 양도 일반건물 결과 화면에서 B3 문구를 확인한다(관련 spec 전건 포함).
- **브라우저 수동 확인**: Playwright로 함께 양도(일반건물 + 토지) 결과 화면을 캡처한다.

## 8. 범위 밖 · 확인 필요

- 축 B 실가 분기 §100③·§163⑨ 블록 누락(Q-3 a면 별건).
- 축 B §100③ 판정은 첫 지분 값이다 — FRAC-est-split 실측에서 구분 기재액 450,000,000 = 1/2이었다. 지분 합산 표시 여부는 별건이다.
- 상세명세서 소제목의 산정방식 집계(`aggregateAcqModes` — 함께 양도에서 일반건물 상세 없이 `filingDisplay`로 떨어짐)는 함께 양도에서 맞는지 **확인 필요**(이번 실측 안 함).
- C2·1985 전 상속 파트 근거 표기(「실거래가 §97①1호 가목」) — #2466 계획서 §8 별건 그대로.

## 9. 구현 기록 (2026-10-23)

- **⑭ echo**
  - 실가 블록 echo 함수 `actualBlockEcho`(`general-building-route-actual.ts`)를 단건 경로와 `buildGbPartCards` 실가 분기가 같이 쓴다.
  - 그 echo는 `GbPartCards.actualBlockEcho` 별 필드로 두고, `buildGbCompanionItems`의 `onDetail`에서만 펼친다. 축 B는 바뀌지 않는다(Q-3 a).
  - swap 비교 함수 `gbSwapComparison`(`general-building-route-helper.ts`)도 단건 경로와 함께 양도가 같이 쓴다.
  - 자산별 상세 타입은 `GbBundledAssetDetail`(`transfer-aggregate.types.ts` — `GeneralBuildingOutput & { swapComparison? }`)이다.
- **⑦ 표시**
  - 블록 6종을 `GbResultBlocks.tsx`로 옮겼다(`BundledAllocationCard.tsx` 625 → 448줄).
  - 뷰 헬퍼는 `gb-result-block-views.ts`다. 단건은 종전 소스, 함께 양도는 자산별 상세 + 파트 카드 + 그 자산 폼을 쓴다.
  - 3-way 표는 `view`를 받아 그 자산 카드 3장으로 그리고, 결손 통산 합계를 계산하며 각주를 분기한다.
  - 미입력 안내 모음은 자산별 상세를 돈다.
- **실측 추가**
  - 결손 없는 줄 알았던 EXT3도 증축분 결손 7,513,329 중 1,455,530이 함께 양도 토지로 넘어간다. 종전 하드코딩 0이었다면 함께 양도 표가 거짓이 됐을 시료다.
- **검증**
  - 단건 10시료는 결과 카드 전체 텍스트가 구현 전후 동일하다(스냅샷 대조).
  - anchor `__tests__/components/gb-bundled-result-blocks.anchor.test.tsx` 18건.
  - 뮤테이션 8/8 KILLED.
  - 전체 vitest 40,444건 실패 0.
  - 관련 E2E 20 spec 121건 통과. 신규 「§97②2호 단서 swap 블록이 그 일반건물 소제목 아래 뜬다」 포함 — 브라우저 확인을 겸한다.
