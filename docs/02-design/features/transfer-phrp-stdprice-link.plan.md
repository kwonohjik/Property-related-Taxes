# §155⑳ 시나리오 B 3-시점 기준시가 ↔ 환산취득가 기준시가 입력 중복 제거 계획서

- 작성일: 2026-07-23 · rev.2 (자가검토: predicate 모드 우선순위·부담부증여 제외 반영, §7 보류 3건 전부 실측 해소)
- 대상: 양도소득세 — 장기임대주택 거주주택 비과세 특례(소령 §155⑳) 시나리오 B(임대→거주 전환, §161① 안분)
- 성격: **UX 중복 입력 제거** (세액 변동 없음 — tax-neutral. 동일 값이 다른 경로로 전달될 뿐)

## 1. 문제

환산취득가액 모드에서 사용자는 **취득정보 영역**(`CompanionAcqPurchaseBlock.tsx:546~613`)에
취득시 기준시가(`asset.standardPriceAtAcq`)·양도시 기준시가(`asset.standardPriceAtTransfer`)를 이미 입력한다.

그런데 §155⑳ 시나리오 B를 켜면 **기타 특례 섹션**(`RentalHousingExceptionSection.tsx:351~379`)에서
같은 자산·같은 시점의 기준시가를 다시 입력해야 한다:

| PRHP 필드 (`rentalHousingException.*`) | 중복 대상 (자산-수준) | 스크린샷 사례 |
|---|---|---|
| `standardPriceAtAcquisitionForPhrp` | `asset.standardPriceAtAcq` (환산 분자) | 300,000,000 = 300,000,000 |
| `standardPriceAtTransferForPhrp` | `asset.standardPriceAtTransfer` (환산 분모) | 500,000,000 = 500,000,000 |
| `standardPriceAtPriorTransfer` | **중복 아님** — 직전거주주택 양도 시점의 임대주택 기준시가. 자산-수준 대응 필드 없음 | 450,000,000 (유지) |

### 법령 근거 — 동일 값임의 확인

§161①의 "취득 당시 기준시가"·"양도 당시 기준시가"는 **양도하는 그 주택**(임대→거주 전환 주택)의
취득·양도 시점 기준시가다. 환산취득가(§114⑦, 시행령 §176의2②)의 분자·분모도 **같은 자산의 같은
시점 기준시가**다. 주택이므로 둘 다 공동주택가격(또는 개별주택가격) 총액 — 값이 달라질 법적 근거가 없다.
→ 별도 입력을 유지할 이유 없음 (단일 진실 원칙, memory `feedback_ui_engine_dual_truth_avoidance`).

## 2. 현행 배관 (실측)

```
⑤ UI  RentalHousingExceptionSection.tsx:352~379  CurrencyInputWithLookup ×3 (rhe 필드 직접 read/write)
       :382~404  §161① 안분 비율 미리보기 (rhe 필드 파싱)
④ 변환 lib/calc/transfer-tax-api-helpers.ts:181~183  parseAmount(rh.*) → API body (단건·다자산 공용)
⑧ 검증 lib/calc/transfer-tax-validate-rental-exception.ts:41~60  pAcq·pPrior·pTransfer > 0 + 순서·분모0 검증
⑫ Zod lib/api/transfer-tax-schema.ts:82~84  optional nonneg int (변경 불요)
⑭ Route app/api/calc/transfer/route.ts:363~365 · multi/route.ts:248~250  엔진 input 매핑 (변경 불요)
엔진   lib/tax-engine/transfer-tax/rental-housing-exception/index.ts:191·244  (변경 불요)
```

환산 모드 자산-수준 기준시가 쌍 렌더 조건 (`CompanionAcqPurchaseBlock.tsx:460~613` 분기 실측):
`useEstimatedAcquisition === true` 이면서 `isMixedUse`(=`asset.isMixedUseHouse`, :148)·
`isCommercialBuilding`·`isGeneralBuilding`·`asset.usePreHousingDisclosure` 모두 아님일 때만
`standardPriceAtAcq`/`standardPriceAtTransfer` 입력이 표시된다.
환산 모드 필수 검증은 `transfer-tax-validate-asset.ts:400` 부근에 기존재 (연동 시 빈 값 도달 불가).

## 3. 설계 — "환산 모드 = 자산 단일 소스" (조건부 소스 전환, 3중 패턴)

fallback(override 허용)이 아니라 **소스 ternary**로 설계한다. 연동 조건 충족 시 rhe 필드는 무시되고
자산 필드만 쓰인다 → stale override가 침묵으로 이기는 경로 원천 차단.

### 3.1 연동 판정 predicate — 단일 소스 (신규)

`lib/calc/transfer-phrp-stdprice-link.ts` (신규, ~20줄):

```ts
/** §155⑳ 시나리오 B 취득·양도시 기준시가를 자산-수준 환산 입력과 연동하는지 판정.
 *  조건 = CompanionAcqPurchaseBlock에서 asset-level 기준시가 쌍이 실제 렌더되는 조건과 동일.
 *  ⚠️ 산정 방식은 3중 배타 유니온(isSalesCase > isAppraisal > isEstimated —
 *  CompanionAcqPurchaseBlock.tsx:134~143, API 변환 transfer-tax-api.ts:82-84와 동일 우선순위).
 *  stale 세션 플래그 혼재 방어를 위해 상위 우선순위 2모드를 명시 배제한다. */
export function isPhrpStdPriceLinked(asset: AssetForm): boolean {
  return (
    asset.useEstimatedAcquisition === true &&
    !asset.isSalesCaseAcquisition &&        // 매매사례가액 모드 아님 (우선순위 1위)
    !asset.isAppraisalAcquisition &&        // 감정가액 모드 아님 (우선순위 2위)
    asset.acquisitionCause === "purchase" &&
    asset.transferType !== "burdened_gift" && // 부담부증여: 산정방식·기준시가 영역 전체 숨김(:273·312)
    !asset.isMixedUseHouse &&
    !asset.usePreHousingDisclosure
  );
}
```

- `assetKind`는 호출부에서 이미 housing/right_to_move_in 한정 (`AssetSectionExtras.tsx:28`) — predicate 중복 불요.
  `right_to_move_in`은 cause=purchase 시 PurchaseBlock이 숨김 분기 없이 렌더 → 연동 **포함** (실측 `CompanionAcquisitionCauseSection.tsx:119`).
  `redevelopment_apt`는 assetKind 게이트로 자연 제외.
- commercial/general_building은 assetKind 자체가 달라 PRHP 섹션 미렌더 → 조건 불요.
- 상속·증여·신축 취득(cause ≠ purchase)은 환산 입력 경로가 달라(3-시점 배치 등) 보수적으로 **현행 유지**.
- 부담부증여(`transferType === "burdened_gift"`)는 취득가액을 §159로 엔진이 자동 산정하며 산정방식·기준시가
  입력 영역 전체가 숨겨짐 → 연동 시 사용자가 입력 불가능한 빈 값이 소스가 되므로 **명시 제외** (현행 rhe 입력 유지).
- UI(⑤)·API 변환(④)·validate(⑧) 3곳이 **이 함수 하나만** import — 조건 드리프트 방지.

### 3.2 ⑤ UI — `RentalHousingExceptionSection.tsx`

- props에 `asset: AssetForm` 추가 (호출부 `AssetSectionExtras.tsx:29`는 이미 asset 보유 — 1줄).
- `linked = isPhrpStdPriceLinked(asset)` 일 때:
  - 취득/현양도 기준시가 `CurrencyInputWithLookup` 2개 **숨김**.
  - 대신 amber 계열 echo 카드(`TONE.amber.chip` 톤) 표시:
    "취득시 300,000,000 · 양도시 500,000,000 — 취득 정보의 환산 기준시가와 자동 연동됩니다. 수정은 취득가액 산정 영역에서."
  - 자산 값 미입력 시: "취득 정보에서 취득시/양도시 기준시가를 먼저 입력하세요" 안내 (입력 강요 아님 — 환산 validate가 차단).
- `standardPriceAtPriorTransfer` 입력은 **항상 유지**.
- §161① 안분 미리보기(:382~404): `pAcq`·`pTransfer` 파싱 소스를 `linked ? asset.* : rh.*`로 교체.
- linked=false(실가·감정·겸용·PHD·상속 등)는 **현행 그대로**.

### 3.3 ④ API 변환 — `transfer-tax-api-helpers.ts:181~183`

`toRentalHousingExceptionApi(asset: AssetForm)` — **asset 전체를 이미 수령**(:155 실측, 파라미터 추가 불요).
단건(`transfer-tax-api.ts:674`)·다자산(`multi-transfer-tax-api.ts:78`) 모두 이 함수 경유 — 1곳 수정으로 양쪽 커버 확정. 변환:

```ts
const linked = isPhrpStdPriceLinked(asset);
standardPriceAtAcquisitionForPhrp: linked
  ? parseAmount(asset.standardPriceAtAcq) || undefined
  : parseAmount(rh.standardPriceAtAcquisitionForPhrp ?? "") || undefined,
standardPriceAtTransferForPhrp: linked
  ? parseAmount(asset.standardPriceAtTransfer) || undefined
  : parseAmount(rh.standardPriceAtTransferForPhrp ?? "") || undefined,
```

- **API 필드명·Zod(⑫)·Route(⑭)·엔진 불변** — 서버 측 6지점 무변경. 변경은 클라이언트 3지점(④⑤⑧)뿐.

### 3.4 ⑧ 검증 — `transfer-tax-validate-rental-exception.ts:41~43`

동일 ternary로 소스 교체 (`asset` 파라미터 기존재:12):

```ts
const linked = isPhrpStdPriceLinked(asset);
const pAcq = linked ? parseAmount(asset.standardPriceAtAcq) : parseAmount(rh.standardPriceAtAcquisitionForPhrp ?? "");
const pTransfer = linked ? parseAmount(asset.standardPriceAtTransfer) : parseAmount(rh.standardPriceAtTransferForPhrp ?? "");
```

- 오류 문구도 linked 시 "취득 정보의 취득시/양도시 기준시가를 입력하세요"로 위치 안내 교체.
- 순서 검증(:50~55)·분모0(:58~60)은 소스만 바뀌고 로직 동일.
- 3중 패턴 충족: UI 표시값 = API 전송값 = validate 판정값 (memory `feedback_store_default_vs_ui_display_fallback`).

### 3.5 ①②③⑥⑦ — 변경 없음 (근거)

- ①②③: 폼 필드 **신설·삭제 없음** (rhe 필드는 비연동 모드용으로 존치. factory·migrate 불변).
- ⑥ 사이드바: 기준시가는 합계 항목 아님.
- ⑦ 결과: 엔진 echo·표시 로직 무변경 (전달 값 자체가 동일).

## 4. 케이스 매트릭스

| # | 취득가액 모드 | 기타 조건 | linked | 취득/현양도 기준시가 소스 | UI |
|---|---|---|---|---|---|
| C1 | 환산 (스크린샷) | purchase·비겸용·비PHD | ✅ | `asset.standardPriceAtAcq/Transfer` | 입력 숨김 + echo 카드 |
| C2 | 실가 | — | ❌ | `rhe.*` (현행) | 현행 입력 2필드 |
| C3 | 감정가액 | standardPriceAtAcq는 개산공제 base로만 존재, 양도시 쌍 미표시 | ❌ | 현행 | 현행 (부분 연동은 혼란 — 제외) |
| C4 | 환산 + 겸용주택 | `isMixedUseHouse` | ❌ | 현행 | 현행 (자산-수준 총액 필드 미사용 경로) |
| C5 | 환산 + PHD §164⑤/⑦ | `usePreHousingDisclosure` | ❌ | 현행 | 현행 (취득기준시가는 엔진이 3-시점에서 도출 — 클라이언트에 총액 없음) |
| C6 | 상속·증여·신축 취득 | cause ≠ purchase | ❌ | 현행 | 현행 |
| C6b | 부담부증여 | `transferType === "burdened_gift"` — 산정방식·기준시가 영역 숨김(§159 자동) | ❌ | 현행 | 현행 (연동 시 입력 불가능한 빈 값이 소스가 됨 → 명시 제외) |
| C6c | 매매사례가액 | `isSalesCaseAcquisition` (stale 세션에서 useEstimated와 혼재 가능) | ❌ | 현행 | 우선순위 1위 명시 배제 |
| C7 | C1 + 자산 기준시가 미입력 | — | ✅ | (빈 값) | echo 카드에 선입력 안내. 계산 시 환산 validate(:400)가 선차단 |
| C8 | C1 + 과거 세션에 stale rhe 값 잔존 | sessionStorage 복원 | ✅ | **asset 값이 이김** (ternary — silent override 없음) | echo 카드 |
| C9 | 시나리오 A | — | n/a | 3-시점 필드 자체 미사용 | 변경 없음 |

`standardPriceAtPriorTransfer`(450M)는 전 케이스에서 현행 입력 유지.

## 5. Anchor 테스트

기존 픽스처 재활용: `__tests__/.../rental-housing-exception/` (PDF 사례 25 — 과세 172,605,000 / 산출세액 44,699,900).

| # | 파일 | 검증 |
|---|---|---|
| A1 | `transfer-phrp-stdprice-link.test.ts` (신규) | predicate: C1 true / C2~C6c false 전 분기 (감정·매매사례 플래그 혼재, 부담부증여 포함) |
| A2 | api-helpers 변환 테스트 | linked 자산(standardPriceAtAcq=3억, rhe 필드 빈 값) → body `standardPriceAtAcquisitionForPhrp === 300_000_000` |
| A3 | 동상 | linked + stale rhe(다른 값) → **asset 값 전송** (C8) |
| A4 | validate 테스트 | linked + asset 값 존재 + rhe 빈 값 → null(통과) / 비연동 + rhe 빈 값 → 기존 오류 문구 (회귀) |
| A5 | RTL 컴포넌트 | linked 시 취득/현양도 입력 미렌더 + echo 카드 렌더 + prior 입력 존치 |
| A6 | 회귀 | 사례 25 전엔진 anchor(P1~P6, PR#755) 무변경 GREEN — 엔진 미변경 증명 |

## 6. 작업 순서

```
1. predicate 신규 + A1        → verify: vitest GREEN
2. ④ 변환 + A2·A3            → verify: vitest GREEN
3. ⑧ validate + A4           → verify: vitest GREEN
4. ⑤ UI + A5                 → verify: vitest GREEN + tsc 0건
5. 전체 회귀 (rental-housing-exception 9파일 + 전체) → verify: ALL GREEN
6. 브라우저 확인: 환산 모드 → §155⑳ B → echo 카드·Network body 값 300M/500M 확인
```

## 7. 확인 필요 → 전부 실측 해소 (rev.2)

- [x] api-helpers 시그니처: `toRentalHousingExceptionApi(asset: AssetForm)` — asset 전체 수령(:155). 파라미터 추가 불요.
- [x] 입주권 + 환산: cause=purchase 시 PurchaseBlock 렌더(:119), right_to_move_in 숨김 분기 없음 → 기준시가 쌍 렌더 → 연동 포함.
- [x] 부담부증여: 산정방식·기준시가 영역 전체 숨김(:273·312) 실측 → predicate 명시 제외 확정 (C6b).

## 8. 리스크

- **낮음**: 서버(⑨~⑭)·엔진 무변경. linked 조건이 잘못 넓으면 → 사용자가 입력 못 한 값(빈 asset 필드)이 전송되나 환산 validate가 선차단하므로 silent 오세액 없음. 조건이 잘못 좁으면 → 현행(중복 입력)과 동일 — 기능 저하 없음.
- 기존 계산 이력 재열람: 결과 표시는 엔진 echo 기반 — 영향 없음.
