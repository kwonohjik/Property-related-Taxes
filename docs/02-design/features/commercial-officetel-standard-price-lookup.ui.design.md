# 상업용건물·오피스텔 기준시가 자동조회 — UI 설계

> 계획서: [`../../01-plan/features/commercial-officetel-standard-price-lookup.plan.md`](../../01-plan/features/commercial-officetel-standard-price-lookup.plan.md)
> 데이터·API 설계: [`commercial-officetel-standard-price-lookup.engine.design.md`](commercial-officetel-standard-price-lookup.engine.design.md)

## 1. 배치

| 배치 | 진입 조건 | 조회 시점 | 채우는 필드 |
|---|---|---|---|
| **A. 환산** `CommercialBuildingBlock` ② 섹션 | `assetKind==="commercial_building"` + `useEstimatedAcquisition` + `cbEra` 선택됨 | 양도일 + (취득일 \| 2005-01-01) | `cbUnitPriceAtTransfer`, `cbUnitPriceAtFirstOrAcq`, `cbExclusiveArea`, `cbSharedArea` |
| **B. 상속 §164⑥** `CommercialInheritanceStdPriceSection` ② 섹션 | `acquisitionCause==="inheritance"` + 상속개시일 < 2005-01-01 | **2005-01-01 고정** | `cbUnitPriceAtFirstOrAcq`, `cbExclusiveArea`, `cbSharedArea` |

⚠️ 배치 B에는 `cbUnitPriceAtTransfer` 입력이 **렌더되지 않는다**(`CommercialInheritanceStdPriceSection.tsx:85-89`). 화면에 없는 필드를 채우면 안 된다.

## 2. 런처 버튼

```tsx
<Button type="button" variant="modalLauncher" size="xs"
        disabled={!asset.addressPnu}
        title={!asset.addressPnu ? "소재지를 다시 선택하면 조회할 수 있습니다" : undefined}
        data-testid="cb-stdprice-lookup-open"
        onClick={() => setOpen(true)}>
  호별 고시가 조회
</Button>
{!asset.addressPnu && (
  <p className="text-caption text-muted-foreground">소재지를 다시 선택하면 조회할 수 있습니다</p>
)}
```

- **`variant="modalLauncher"` 필수** — native `<button>` 신규 작성 금지(components/calc/CLAUDE.md)
- **`size="xs"`** — 같은 카드의 기존 런처가 `xs`다(`BuildingStdPriceModalButton.tsx:156`). 나란히 놓이므로 크기를 맞춘다
- **라벨을 `"호별 고시가 조회"`로 고정** — 인접한 `"건물 기준시가 계산"`(`:81,156`)과 혼동 방지
- ⚠️ **`<Button>`에는 `disabledReason` prop이 없다** — Props가 `ButtonPrimitive.Props & VariantProps<typeof buttonVariants>`뿐이다(`components/ui/button.tsx:52`). `disabledReason`은 `ToggleCard`의 prop이며, 여기에 쓰면 TS 초과 프로퍼티로 **빌드가 깨진다**. `title`(`...props` 통과) + 별도 `<p>` 안내로 대체한다.
- 구 세션 자산은 `addressPnu`가 `undefined`다(`calc-wizard-asset-migrate.ts:572-573` — *"구 세션 미보유 시 undefined(모달 재조회 fallback)"*).

## 3. 모달 레이아웃

```
┌─ 호별 고시가 조회 ─────────────────────────────────────────┐
│ 소재지  서울특별시 종로구 적선동 80                          │
│ 조회 시점  취득시 2013-01-01 · 양도시 2021-01-01            │
│                                        [ 조회 ]            │
├────────────────────────────────────────────────────────────┤
│ ① 호 목록                              🔍 [호 검색____]     │
│    (200행 초과 시에만 검색 입력 노출)                        │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 건물명       동      층        호   전용㎡  공유㎡  구분 │ │
│ │ 적선현대빌딩 1(단일) 지상 1층   1   639.47  357.74 [상가]│ │
│ │ 적선현대빌딩 1(단일) 지하 1층   1     7.18    2.40 [상가]│ │
│ │ 적선현대빌딩 1(단일) 지상 1층   2   198.41  110.94 [상가]│ │
│ └────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────┤
│ ② 선택한 호 — 시점별 고시가                                 │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 시점              고시일자      ㎡당 고시가   전용㎡     │ │
│ │ 취득시 (2013)     2013-01-01    3,570,000    639.47     │ │
│ │ 양도시 (2021)     2021-01-01    5,898,000    639.47     │ │
│ └────────────────────────────────────────────────────────┘ │
│ ⓘ 대지면적은 등기부에서 직접 입력하세요 (고시 자료에 없음)   │
├────────────────────────────────────────────────────────────┤
│                              [ 취소 ]  [ 적용 ]            │
└────────────────────────────────────────────────────────────┘
```

**Dialog 구성 (기존 동종 모달과 동일 override 필수)**

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent
    className="max-h-[88vh] overflow-y-auto sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full shadow-2xl"
    overlayClassName="bg-black/60"
    forceOverlay
  >
    <DialogHeader><DialogTitle>호별 고시가 조회</DialogTitle></DialogHeader>
    …
```

⚠️ `DialogContent` 기본값은 **`sm:max-w-sm`(384px)**(`components/ui/dialog.tsx:62`)이라 7열 표가 들어가지 않는다. 세로도 필지 최대 5,371행이므로 `max-h-[88vh] overflow-y-auto` 없이는 뷰포트를 넘긴다. 선례 `BuildingStdPriceModalButton.tsx:160-164`와 동일하게 override한다.

**표는 `HorizontalScrollContainer`(`components/calc/shared/HorizontalScrollContainer.tsx`)로 감싼다** — 7열이라 좁은 화면에서 넘친다.

**렌더 상한**: 초기 200행만 렌더하고 그 이상은 `[더 보기]` 또는 검색 필터 적용 후 표시한다. 최대 5,371행 × 3시점 가격 열을 전부 DOM에 그리면 모달 열기가 느려진다(검색 입력 노출은 필터 UI일 뿐 렌더 수를 줄이지 않는다).

**목록 행 선택은 키보드로도 가능해야 한다** — 행을 `<button>` 또는 `role="radio"` 그룹으로 구현하고 `aria-selected` + Enter/Space 선택 + ↑↓ 이동을 지원한다. Dialog의 focus trap은 base-ui가 제공하나 목록 내 선택은 별개다.

- **건물명·층구분을 반드시 표시**한다 — 이 둘이 없으면 서로 다른 물건이 같은 행으로 보인다(설계 §3-2 불변식2: 층구분 충돌 0.370%, 건물명 충돌 0.225%)
- 목록 정렬: 층구분(지하→지상→옥탑) → 층(숫자) → 호(숫자). `fl`·`ho`가 문자열이라 사전순이면 `"10" < "2"` 함정
- 건물구분 칩(상가/오피스텔/복합) — 한 필지에 혼재 가능(2021 표본 오피스텔 159,920 / 상가 140,080)
- 금액 칸: `text-right font-mono tabular-nums whitespace-nowrap` (amount-column-align, 선례 `BesshiRow.tsx:58`)
- 카드 톤은 `<ToneCard>` 사용, 인라인 하드코딩 금지. 라벨 크기는 역할별 정본 클래스(임의 `text-[Npx]` 금지 — pre-push 하드블록)

## 4. 상태 표시 (3상태 필수)

선례: `LandPriceLookupField.tsx:194`(`{isLookingUp ? "조회 중…" : "…"}`)·`:197-199`(에러) · `BuildingStdPriceModalButton.tsx:186`(rose 박스).

| 상태 | 표시 |
|---|---|
| 조회 중 | 버튼 `조회 중…` + 목록 스켈레톤 |
| 네트워크·서버 오류 | rose 박스 + `error` 문구 |
| `parcelReason="unjoinable_parcel"` | **"이 지번은 고시 자료 형식상 자동조회할 수 없습니다 — 수기 입력하세요"** (0.154% 필지) |
| `parcelReason="invalid_pnu"` | "소재지를 다시 선택해 주세요" |
| 전 시점 `unit_not_found` / `no_notice` | **"미고시 물건입니다 — 수기 입력하세요"** ← *정상 동작임을 명시* |
| 일부 시점 `partial_data` | **"해당 연도 자료가 아직 확보되지 않았습니다"** (≠ 미고시) |
| 일부 시점 `partition_missing` | "해당 연도 자료가 준비되지 않았습니다" |

⚠️ **`no_notice`를 실패로 보이게 하지 말 것.** 고시 대상이 전수가 아니므로(계획서 §7-C) 미고시는 정상이다.

## 5. 시점별 부분 매칭 (핵심 UX)

실제 보유기간에서 3시점이 모두 매칭되는 경우가 오히려 소수다 — 매칭률 2년 93.9% / **8년 66.1%** / **16년 53.6%**(계획서 §4-2).

```
② 선택한 호 — 시점별 고시가   (post_disclosure · 취득 2013 · 양도 2021)
   취득시 (2013)   —          해당 고시분에 이 호가 없습니다 → 수기 입력
   양도시 (2021)   2021-01-01  5,898,000   639.47
```

⚠️ **조회는 2시점뿐이다** — 배치 A는 `양도일` + (`취득일` | `2005-01-01`)이고 배치 B는 `2005-01-01` 하나다.
`cbEra === "pre_disclosure"`일 때 취득시(2005년 이전) 기준시가는 **조회 대상이 아니라 엔진이 §164⑥으로 역환산하는 값**이므로 모달에 표시하지 않는다.

- `prices[date] === null`인 시점은 **필드를 채우지 않는다.** 0으로 표시·적용 금지
- **인접 호·유사 면적으로 자동 대체 금지** — 다른 호의 단가가 침묵 유입되면 환산취득가·세액 직결 오류(memory `feedback_no_silent_apportion_fallback`)
- 부분 매칭도 **적용 가능**하다(매칭된 시점만 채움). 적용 버튼 옆에 `2개 시점 중 1개만 채워집니다` 고지

## 6. 적용 규약 (강제)

```tsx
// ✅ 단일 배치 — patch 하나로 전달
onChange({
  cbUnitPriceAtTransfer: String(t.price),
  cbUnitPriceAtFirstOrAcq: String(f.price),
  cbExclusiveArea: String(u.ea),
  cbSharedArea: String(u.sa),
});

// ❌ 금지 — 개별 연속 호출
onChange({ cbUnitPriceAtTransfer: … });
onChange({ cbUnitPriceAtFirstOrAcq: … });   // stale spread로 앞 값이 되돌아감
```

수신부는 이미 다중키 patch를 받는다(`CommercialBuildingBlock.tsx:36` `onChange: (patch: Partial<AssetForm>) => void`). 상위에서 단일키 updater로 분해하면 **마지막 1필드만 반영**된다 — memory `feedback_multikey_patch_stale_spread_overwrite`(PR#804 §99의3 실사례).

**`useEffect → store` 미러링 금지** — 조회 결과는 사용자의 "적용" 클릭 시에만 onChange로 반영한다.

## 7. 면적 처리

3시점 면적이 상이할 수 있다(공통 키 중 0.33%). 엔진은 **단일 면적을 3시점 전부에 사용**한다(`commercial-building-valuation.ts:148`).

| 상황 | 동작 |
|---|---|
| 면적 필드가 비어 있음 | **양도시 고시분 면적**을 채운다(환산 분모가 양도시 호별총액이므로) |
| 이미 값이 있고 조회값과 **일치** | 그대로 둔다 |
| 이미 값이 있고 조회값과 **불일치** | 덮어쓰지 않되 **경고 + `[조회값으로 덮어쓰기]` 버튼** 제공 |
| 3시점 면적이 서로 다름 | amber 경고 배지 — *"취득시 366.1㎡ / 양도시 733.72㎡ — 확인하세요"*. **자동 보정 금지** |

`LandPriceLookupField.tsx:115`의 "빈 값일 때만" 패턴은 부수적 자동채움이지만, 여기서 면적은 **세액 직결 주요 입력**이라 덮어쓰기 수단이 필요하다.

## 8. 조회/수동 배지

선례: `LandPriceLookupField.tsx:138-155`("자동"/"수동" + `↻ 자동` 되돌리기), `CurrencyInputWithLookup.tsx:58,67-74`("자동조회 결과 (수정 가능)").

- 조회로 채운 4필드에 emerald `자동조회` 배지
- 사용자가 그 필드를 수동 수정하면 amber `수동` 으로 전환
- 선택한 호는 **신규 UI 스토어**에 보관 → 모달 재오픈 시 복원. **`AssetForm`에 필드를 추가하지 않는다**
  - 기존 `building-std-snapshot-store.ts`를 그대로 재사용할 수 없다 — 값 타입이 `Record<string, BuildingStdPriceFormState>`(`:17`)라 호 선택 객체를 담지 못한다. **패턴만 차용**해 신설한다(persist·`AssetForm` 미진입·sessionStorage).
  - **키 prefix `cbsp-${asset.assetId}`** — 기존 키는 전부 `bsp-`로 시작한다(`bsp-estate-…` · `bsp-${assetId}-{cb|gb|cbinh|phd}-…` · `…-red-phd`). 충돌을 피한다.

## 9. 동/호 자동선택 — **불가 (명시적 배제)**

`addressDong`·`addressHo`가 `AssetForm`에 실존하나(`calc-wizard-asset.ts:130,132`), `address-search.tsx:148`이 `propertyType: "housing"`(공동주택 NED)로만 units를 채우므로 **상가·오피스텔에서는 대개 공백**이다. 구현 시 이를 자동선택 근거로 오용하지 말 것. `addressDetail` 자유텍스트는 목록 하이라이트 힌트로만 쓴다.

## 10. 14 동기화 지점

| # | 지점 | 해당 | 내용 |
|---|---|---|---|
| ①~③ | 폼 타입·initial·normalize | ✕ | **신규 `AssetForm` 필드 0개** (스냅샷 스토어) |
| ④ | API 변환 | ✕ | 엔진 미전송 |
| ⑤ | UI 위젯 | **○** | 모달 + 런처 2배치 |
| ⑥ | 사이드바 합계 | ✕ | 대상 아님 |
| ⑦ | 결과 카드 | ✕ | 표시 없음 |
| ⑧ | validation | **○** | 상속 §164⑥ 8필드 all-or-nothing 안내(아래) |
| ⑨~⑭ | Zod·body·Route | ✕ | 엔진 input 무변경 |

### ⑧ 상속 §164⑥ 안내 (Critical)

`transfer-tax-validate-asset.ts:110-127`은 상속 §164⑥ 경로에서 **8필드 all-or-nothing**을 검증한다. 모달은 그중 **3개만** 채우므로(`cbExclusiveArea`·`cbSharedArea`·`cbUnitPriceAtFirstOrAcq`) 빈 상태에서 적용하면 `filled=3` → **즉시 검증 차단**된다.

배치 B 모달 하단에 고정 안내:
> ⓘ §164⑥ 적용에는 **대지면적 · 취득시·최초고시 개별공시지가 · 취득시·최초고시 건물 기준시가**를 추가로 입력해야 합니다. 일부만 입력하면 계산이 차단됩니다.

validate 로직은 **변경하지 않는다**.

## 11. testid · E2E

기존 스펙은 `getByRole("button",{name})` + `getByRole("dialog").filter({hasText})` 위주이고 `data-testid`는 선택적이다. **`CurrencyInput`은 label에 `htmlFor` 연결이 없어 `getByLabel` 불가**(`cb-building-stdprice-modal-apply.spec.ts:95` 주석).

⚠️ **구분자는 `__`** — 호 값에 하이픈이 실재한다(복원된 `3-2` 12,359행, 원본 `B-717` 코오롱레이크폴리스2차 7층). `-`를 구분자로 쓰면 `cb-stdprice-unit-4-1-B-717`처럼 파싱이 모호해진다.

| 요소 | testid |
|---|---|
| 런처 | `cb-stdprice-lookup-open` |
| 호 목록 행 | `cb-stdprice-unit-{fc}__{fl}__{ho}` (예: `cb-stdprice-unit-4__1__1`) |
| 적용 버튼 | `cb-stdprice-apply` |
| 상태 박스 | `cb-stdprice-status` |

**E2E mock**: 선례 `page.route("**/api/address/search**")`·`("**/api/address/standard-price**")`(`e2e/building-register-autofill.spec.ts:22,40,47`)와 동일하게 `**/api/address/commercial-standard-price**`를 mock한다. 워크트리는 `E2E_PORT` 격리(`playwright.config.ts:14`).

기존 스펙 회귀 확인: `e2e/cb-building-stdprice-modal-apply.spec.ts`(동일 modal-apply 패턴) · `e2e/commercial-inheritance-164-6-max.spec.ts`.

## 12. RTL 검증 항목

- 모달 렌더 · 호 목록 정렬(층구분→층→호 숫자 순)
- 층구분·건물명이 각각 다른 행으로 노출되는지 (충돌 필지)
- **단일 배치 `onChange` 1회 호출** 검증 (호출 횟수 assert)
- 3상태 표시 (조회중 / 오류 / 사유 6종)
- 부분 매칭 시 `null` 시점 필드 미충전
- 면적 불일치 경고 + 덮어쓰기 버튼
- **키보드 선택** — ↑↓ 이동 + Enter/Space 선택, `aria-selected` 반영
- 렌더 상한 200행 + `[더 보기]` 동작
- 무회귀 3케이스 — PNU 없음 / 미고시 / 파티션 부재 시 수기 입력 경로 정상

## 13. Phase 3 구현 결과 (2026-07-28)

**산출물**

```
components/calc/transfer/CommercialStdPriceLookupModal.tsx   런처 + 모달 (506줄)
lib/stores/commercial-stdprice-snapshot-store.ts             선택 호 스냅샷 (cbsp- 접두)
lib/stdprice/pick-notice-date.ts                             고시일자 선택 (클라이언트·서버 공용)
__tests__/components/commercial-stdprice-lookup-modal.test.tsx   RTL 11 케이스
e2e/commercial-stdprice-lookup-apply.spec.ts                     E2E 2 케이스
```

배선: `CommercialBuildingBlock` ② 섹션 상단(배치 A) · `CommercialInheritanceStdPriceSection` ② 섹션 상단(배치 B).

**검증**

| 항목 | 결과 |
|---|---|
| RTL 11 케이스 | ✅ 런처 비활성 사유 2종 · 층구분 분리 · **단일 배치 onChange 1회 + 4필드** · 부분 매칭 미충전 · 배치 B 양도시 미충전 · 면적 덮어쓰기 · 상태 2종 · linkedBy 노출 |
| E2E 2 케이스 | ✅ 조회→선택→적용 후 폼 4필드 충전 / 미고시 시 적용 버튼 비활성 |
| 회귀 E2E | ✅ `cb-building-stdprice-modal-apply` · `commercial-inheritance-164-6-max` |
| 게이트 | ✅ tsc 0 · eslint 0 · 임의 폰트 0 · 동적 톤 0 |

**설계 대비 편차 (Do 단계 환류)**

1. **고시일자 확정은 2단 요청**이다. 설계는 `pickNoticeDate(availableDates, refDate)`를 전제했으나 `availableDates`는 응답에 들어 있어 첫 요청 전에는 알 수 없다. → 1차로 **기준일 연도의 1/1**(전 고시가 1/1 시행이므로 그 해 고시분이 있으면 항상 정확)로 요청하고, 응답의 `availableDates`에 그 날짜가 없을 때만 직전 고시분으로 **1회 재요청**한다(§164③).
2. `pickNoticeDate`를 `lib/stdprice/pick-notice-date.ts`로 분리했다 — `load-partition.ts`는 `fs`를 import해 클라이언트에서 쓸 수 없다. `load-partition`이 재수출하므로 호출부 단일성은 유지된다.
3. **`linkedBy:"position"` 표시가 추가**됐다(Phase 2 산물). 목록에 `표기 상이` 배지, 상세에 시점별 원문 건물명과 "동·층·호가 일치해 같은 물건으로 연결했습니다 — 확인해 주세요" 문구. 키 충돌 물건은 `중복` 배지.
4. RTL은 `fireEvent` + `act`를 쓴다 — `@testing-library/user-event`가 프로젝트에 설치돼 있지 않다.
5. 키보드는 ↑↓ 이동만 직접 구현했다. 행이 `<button role="radio">`라 Enter/Space 선택·포커스 링은 브라우저 기본 동작이 처리한다.
