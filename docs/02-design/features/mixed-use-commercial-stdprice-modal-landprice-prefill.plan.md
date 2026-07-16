# 겸용주택 상가건물 기준시가 모달 — 개별공시지가 prefill (계획서 rev.2)

- 작성일: 2026-07-16 (rev.4 — **Do 완료 환류** 반영)
- 상태: ✅ Do 완료 (구현·검증 완료, 커밋 대기)
- 범위: UI-only. 엔진·API·Zod 무변경. 신규 폼 필드 1개(UI 전용, 엔진 미전달) + 스냅샷 키 규약 복원
- 산출: PR 1건 / 커밋 3분리 — ①prefill ②B1·B2 키 수정 ③anchor·E2E
- 관련: [[project_transfer_mixed_use_asset_major_stdprice]] · [[project_transfer_phd_3point_batch_stdprice]] · [[project_transfer_mixed_use_commercial_land_price_year]]

---

## 1. 문제

겸용주택 「상가 기준시가」 섹션의 "건물 기준시가 계산" 모달을 열면 위치지수 산정용 개별공시지가 칸이
**빈 값**이라, 이미 화면·주택분 모달에서 입력한 값을 다시 입력해야 한다.

**현행 prefill 범위** (`BuildingStdPriceModalButton.tsx:47-53` — 실측): `floorArea`·`landAreaM2`·
`acquisitionDate`·`transferDate`만. **공시지가는 prefill 대상이 아니다.**

---

## 2. 실측 근거 (추정 없음 — 전부 파일 확인)

### 2-1. 모달 측 대상 필드

| 폼 필드 | 파일:line | 라벨 | 의미 |
|---|---|---|---|
| `acqLandPrice` | `BuildingStdPriceForm.tsx:449`(≤2000) / `:460`(≥2001) | 취득당시 (위치지수용) ㎡당 개별공시지가 | **취득연도 ≤2000 → 2001.1.1 기준 / ≥2001 → 취득당시 연도** |
| `transLandPrice` | `BuildingStdPriceForm.tsx:557` | 양도당시 ㎡당 개별공시지가 | 양도당시 연도 |

### 2-2. 부모 화면 측 소스 (겸용 상가 섹션)

| 폼 필드 | 파일:line | 기준 연도 |
|---|---|---|
| `mixedAcqLandPricePerSqm` (fallback `phdLandPricePerSqmAtAcq`) | `MixedUseAssetMajorStdPrice.tsx:273` | **토지 취득일** 기준 추천연도 |
| `mixedTransferLandPricePerSqm` (fallback `phdLandPricePerSqmAtTransfer`) | `MixedUseAssetMajorStdPrice.tsx:288` | `transferDate` 기준 추천연도 |

### 2-3. ⚠️ 취득시 — 화면 값과 모달 값은 의미가 다르다

`mixedAcqLandPricePerSqm`은 **부수토지 기준시가(land value) = 공시지가 × 면적** 산정용이라
**취득당시 연도** 값이다. 모달 `acqLandPrice`는 **건물 위치지수**용이라 취득 ≤2000이면
**2001.1.1 현재** 값이어야 한다(소령 §164⑤ · 고시 §6①). 코드가 이 구분을 3곳에 못박아 뒀다:

1. `MixedUsePreHousingDisclosureSection.tsx:253-257` — "취득 부수토지 개별공시지가는 토지 취득일 기준(§166⑥,
   부수토지 기준시가 = 공시지가 × 면적의 land value — **건물 위치지수용 아님**)"
2. `ThreePointStandardPriceInput.tsx:635-638` — "`props.landPricePerSqmAtAcq`(취득연도 공시지가·**토지 트랙**)를
   전용하지 않고 **빈 값 시드**"
3. `BuildingStdPriceForm.tsx:207-213` — 취득연도 ≤2000↔≥2001 경계 교차 시 `acqLandPrice` 자동 초기화
   ("의미가 달라 이월하면 **오입력**")

→ **화면의 취득 공시지가는 ≤2000에서 모달로 이월하면 안 된다.** (rev.1 결론 — 유효)

### 2-4. ✅ 그러나 2001.1.1 값의 소스는 존재한다 — 주택분 PHD 배치 모달

`PhdBuildingStdPriceModalButton`(주택 3시점 일괄 계산)은 취득 ≤2000일 때
**"취득시 (2001년 기준) 공시지가"** 칸을 `fixedYear={2001}`로 직접 노출한다(`:385-405`).
그리고 그 값을 **이미 모달 밖으로 내보내고 있다**:

```ts
// PhdBuildingStdPriceModalButton.tsx:45-48 (타입)
/** 시점별 입력 공시지가(원/㎡, 문자열) — 외부 3시점 섹션 되돌려쓰기용.
 *  값 입력된 시점만 포함. 취득≤2000 2001값 게이팅은 소비 측(applyBatch)에서 처리. */
landPrices?: { acquisition?: string; firstDisclosure?: string; transfer?: string };

// :228-231 (생산) — 입력된 시점 전부 방출 (≤2000 취득 포함)
if ((landPrices.acquisition ?? "").trim()) lp.acquisition = landPrices.acquisition;
```

**소비 측이 ≤2000이면 버린다**(`ThreePointStandardPriceInput.tsx:662`):

```ts
if (v.landPrices?.acquisition != null && !(acqYear != null && acqYear <= 2000))
  props.onLandPricePerSqmAtAcqChange(v.landPrices.acquisition);
```

버리는 이유는 **받을 그릇이 없어서**다 — `phdLandPricePerSqmAtAcq`는 취득당시 연도 트랙(§2-3)이라
2001.1.1 값을 넣으면 그 필드가 오염된다. 즉 **드롭은 옳은 방어였고, 빠진 건 전용 저장 필드다.**

**스냅샷에도 없다**: `phd-batch-snapshots.ts:89` `if (!point || catParts.length === 0 || point.year < BUILDING_STD_FIRST_YEAR) return;`
(`BUILDING_STD_FIRST_YEAR = 2001`, `phd-building-std-batch.ts:18`) → 취득 1997은 스냅샷 생성 자체가 생략(규칙 C).

**결론(rev.1 정정)**: 사용자가 주택분 배치 모달에서 입력한 2001.1.1 값은
**컴포넌트 로컬 state에만 살아 있고**(`landPrices`, `:132`) 폼·스냅샷 어디에도 저장되지 않는다.
→ 페이지 새로고침·이력 재진입 시 소실. **전용 필드 1개를 만들면 상가 모달이 읽어올 수 있다.**

### 2-5. 중복 입력이 실제로 발생하는 조건

`enableCommercial = splitMode`(`ThreePointStandardPriceInput.tsx:669`)이고
`splitMode = splitHousingCommercialForAcqAndFirst`(`:617`)는 **Case A(용도변경, 최초공시<용도변경)에서만** true.

| 시나리오 | 주택분 2001.1.1 입력처 | 상가 취득분 | 중복? |
|---|---|---|---|
| PHD **ON** + 용도변경 없음(Case B/asset-major) | 배치 모달 (주택 전용) | **상가 모달에서 2001 값 재입력** | **✅ 발생 — 본 건** |
| PHD **ON** + Case A | 배치 모달 (주택+상가 통합 산출) | 배치 모달이 처리 | 없음 |
| PHD **OFF** | 없음(개별주택공시가격 단일 입력) | 상가 모달이 유일 입력처 | 없음(읽어올 소스 자체가 없음) |

→ **PHD ON + 용도변경 없음**이 정확히 사용자가 지적한 케이스. PHD OFF에서는 소스가 없으므로
취득 ≤2000 칸은 여전히 직접 입력(단, Vworld 조회 1클릭 — §6).

---

## 3. 설계

### 3-1. [신규] AssetForm 필드 — `phdLandPricePerSqmAtAcq2001`

```ts
/** PHD 취득 ≤2000 — 2001.1.1 현재 개별공시지가(원/㎡). **위치지수 산정 전용**(§164⑤).
 *  취득당시 연도 토지값인 phdLandPricePerSqmAtAcq와 트랙이 다르다 — 혼용 금지.
 *  엔진 미전달(UI 전용) — 배치 모달 입력 보존 + 상가 모달 prefill 소스. */
phdLandPricePerSqmAtAcq2001: string;
```

**동기화 지점 — UI 전용이라 3곳만**(엔진 input 아님 → ④⑧⑨⑩⑪⑫⑬⑭ 무관):

| # | 파일 | 내용 |
|---|---|---|
| ① 타입 | `lib/stores/calc-wizard-asset.ts` (`:366` 인근) | 필드 선언 |
| ② initial | `lib/stores/calc-wizard-asset-factory.ts` (`:130` 인근) | `""` |
| ③ normalize | `lib/stores/calc-wizard-asset-migrate.ts` (`:313` 인근) | `if (!a.phdLandPricePerSqmAtAcq2001) a.phdLandPricePerSqmAtAcq2001 = "";` |

> ⚠️ **④ API 변환에 절대 추가하지 않는다.** 엔진 취득 부수토지 기준시가는 취득당시 연도 값
> (`phdLandPricePerSqmAtAcq`)이어야 한다. 이 필드를 엔진에 흘리면 §2-3 드롭 방어를 무력화한다.

### 3-2. 배치 모달 → 필드 write (`ThreePointStandardPriceInput.tsx`)

신규 prop `landPricePerSqmAtAcq2001` / `onLandPricePerSqmAtAcq2001Change` 추가 후 `:662` 드롭을 **라우팅**으로 교체:

```ts
if (v.landPrices?.acquisition != null) {
  if (acqYear != null && acqYear <= 2000) props.onLandPricePerSqmAtAcq2001Change?.(v.landPrices.acquisition);
  else props.onLandPricePerSqmAtAcqChange(v.landPrices.acquisition);
}
```

**보너스 — 배치 모달 재오픈 시 복원**(`:638`, 현재 무조건 빈 값 시드):

```ts
const acqLandPerM2 = acqYear != null && acqYear <= 2000
  ? (props.landPricePerSqmAtAcq2001 ?? "")   // 종전: "" (입력값 소실)
  : props.landPricePerSqmAtAcq;
```

→ 새로고침·이력 재진입 후에도 주택분 2001.1.1 입력이 살아난다(현행 소실 버그의 부수 수정).

배선: `MixedUsePreHousingDisclosureSection.tsx:263-264` 인근에 2줄 추가.
**단독주택 경로(`PreHousingDisclosureSection.tsx:182` 계열)도 같은 위젯을 쓴다** — prop을 optional로 두면
미배선 시 종전 동작(드롭) 유지. 단독 배선은 후속(§7).

### 3-3. 모달 prefill 확장 (`BuildingStdPriceModalButton.tsx`)

```ts
prefill?: {
  floorArea?: string;
  landAreaM2?: string;
  acquisitionDate?: string;
  transferDate?: string;
  /** 취득당시 연도 기준 ㎡당 공시지가 — 취득 ≥2001에서만 사용 */
  acqLandPricePerSqm?: string;
  /** 2001.1.1 현재 ㎡당 공시지가(위치지수용) — 취득 ≤2000에서만 사용 */
  acqLandPricePerSqm2001?: string;
  /** 양도당시 ㎡당 공시지가 */
  transferLandPricePerSqm?: string;
};
```

주입(기존 `prefillForm` 블록 `:98-113`에 추가):

```ts
const acqYearNum = acqYear ? parseInt(acqYear, 10) : NaN;
const pre2001 = Number.isFinite(acqYearNum) && acqYearNum <= 2000;
const acqLand = pre2001 ? prefill.acqLandPricePerSqm2001 : prefill.acqLandPricePerSqm;
...
...(acqLand ? { acqLandPrice: acqLand } : {}),
...(prefill.transferLandPricePerSqm ? { transLandPrice: prefill.transferLandPricePerSqm } : {}),
```

**게이트를 모달 내부에 두는 이유**: 이미 `deriveYearFromEventDate(prefill.acquisitionDate)`로 `acqYear`를
계산 중(`:97`) → 재파생 불필요. 호출부 3곳(+향후 CB/GB)에 ≤2000 판정을 복제하면 dual-truth.
빈 값 미주입 규약(`:96` "빈 값은 미주입 — 사용자 이전 입력 보존")과 동일 결.

**취득일 미입력 시**: `acqYear=""` → `pre2001=false` → 취득당시 값 주입 가능. 그러나 사용자가 모달에서
≤2000 연도를 고르는 순간 `changeYearWithGuard`(`:207-213`)가 `acqLandPrice`를 **초기화**한다
(`parseInt("")=NaN <= 2000` → `false` → `true` 경계 교차). → 기존 가드가 커버, 신규 가드 불필요.

**재오픈**: `initialForm={{ ...restoredForm, ...prefillForm }}`(`:139`) → prefill이 snapshot보다 우선.
`useState(() => ...)`(`BuildingStdPriceForm.tsx:135`) + Dialog 언마운트(forceMount 미사용) → 열 때마다 재시드.
기존 `floorArea`/`landAreaM2`와 동일한 확립된 동작.

### 3-4. 호출부 (겸용 3곳)

| 파일:line | snapshotKey |
|---|---|
| `MixedUseAssetMajorStdPrice.tsx:249` | `bsp-{id}-phd-commercial` (통합 `onApplyBoth`) |
| `MixedUseLegacyStdPrice.tsx:196` | `bsp-{id}-phd-acq-commercial` |
| `MixedUseLegacyStdPrice.tsx:317` | `bsp-{id}-phd-transfer-commercial` |

값은 화면 표시 fallback과 **동일 우선순위**(3중 패턴 — [[mirror-pattern]]):

```ts
acqLandPricePerSqm:     asset.mixedAcqLandPricePerSqm || asset.phdLandPricePerSqmAtAcq,
acqLandPricePerSqm2001: asset.phdLandPricePerSqmAtAcq2001,
transferLandPricePerSqm: asset.mixedTransferLandPricePerSqm || asset.phdLandPricePerSqmAtTransfer,
```

Legacy 2곳은 시점별 모달이지만 **취득·양도 둘 다 넘긴다** — 폼이 항상 2시점을 함께 계산하므로
반대 시점 입력도 필요(`applyTimePoint`는 *적용 버튼* 노출만 제어).

> Legacy 2곳에 `applyTimePoint` 미적용(오적용 방지 부재)은 **사전존재 사안** — 범위 밖. 언급만.

### 3-5. 범위 — CB/GB 제외 (권장)

`CommercialBuildingBlock.tsx:214,244`·`GeneralBuildingBlock.tsx:342,370`도 같은 모달을 쓰지만
취득일 모델이 다르고(GB: `gbBuildingAcquisitionDate` 이원 — [[feedback_general_building_split_acquisition_date]])
PHD 경로가 없어 2001 소스도 없다. → **후속 분리**. prefill prop 확장이 적용 여지를 열어둔다.

---

## 4. 케이스 매트릭스

| # | 취득연도 | PHD | 소스 값 | 모달 `acqLandPrice` 기대 | `transLandPrice` 기대 |
|---|---|---|---|---|---|
| 1 | 1997 | ON, 배치 모달에 2001값 1,200,000 입력 | `phdLandPricePerSqmAtAcq2001=1200000` | **1,200,000** ← 본 건 해결 | 6,216,000 |
| 2 | 1997 | ON, 배치 모달 미사용 | 2001값 없음 | **빈 값** (직접 입력·Vworld 조회) | 6,216,000 |
| 3 | 1997 | OFF | 2001값 없음 | **빈 값** | 6,216,000 |
| 4 | 2005 | OFF | `mixedAcqLandPricePerSqm=1000000` | 1,000,000 | 6,216,000 |
| 5 | 2005 | ON | `phdLandPricePerSqmAtAcq` | phd 값 | phd 값 |
| 6 | 2005 | — | 취득 공시지가 빈 값 | 빈 값(미주입 → snapshot 복원값 보존) | 6,216,000 |
| 7 | 취득일 미입력 | — | 1,000,000 | 주입 → 사용자가 1997 선택 시 가드가 초기화 | 6,216,000 |
| 8 | 1997 → 2005로 변경 | ON | 2001값 존재 | 재오픈 시 취득당시 트랙으로 전환(2001값 미주입) | — |

**배치 모달 복원 케이스**(§3-2 보너스):

| # | 상황 | 기대 |
|---|---|---|
| 9 | 취득 1997, 배치 모달에 2001값 입력 → "모두 적용" → 새로고침 → 재오픈 | 2001값 복원 (현행: **소실**) |
| 10 | 취득 2005, 배치 모달 적용 | 종전대로 `phdLandPricePerSqmAtAcq`에 write (회귀 없음) |
| 11 | 단독주택 PHD(prop 미배선) | 종전 동작(드롭) 유지 |

---

## 5. 실행 계획

**커밋 3분리** — ①prefill(기능) ②B1·B2(버그) ③anchor·E2E. PR 1건으로 ship.

```
[Pre-Do] anchor 작성(RED 확인) → verify: 케이스 1·2·4·9·12·13이 현행에서 실패
   · __tests__/calc/phd-batch-landprice-2001-writeback.test.ts — applyBatch 라우팅(단위)
   · __tests__/calc/building-std-snapshot-keys.test.ts — B2: idOfSnapshotKey("bsp-a1-mx-commercial") === "a1"
   · __tests__/components/mixed-use-commercial-stdprice-modal-landprice-prefill.anchor.test.tsx — RTL
     ⚠️ RTL은 afterEach(cleanup) 수동 필요 ([[feedback_rtl_manual_cleanup_required]])

[커밋 ②] B1·B2 키 수정 — 선행(prefill이 이 위에 얹힘)
   1. building-std-snapshot-keys.ts — idOfSnapshotKey에 `-mx-commercial$` 분기 → verify: 단위 anchor GREEN
   2. MixedUseAssetMajorStdPrice.tsx:249 snapshotKey → `bsp-{id}-mx-commercial` → verify: B1 삭제 재현 테스트 GREEN
      ⚠️ MixedUseLegacyStdPrice 2곳은 **미변경**(§7 — 규약 정상·Case A 재생성 의도)

[커밋 ①] prefill
   3. AssetForm 필드 3지점(①②③) → verify: npx tsc --noEmit 0건
   4. ThreePointStandardPriceInput 라우팅 + :638 복원 시드 → verify: 단위 anchor GREEN
   5. MixedUsePreHousingDisclosureSection 배선 (2줄)
   6. BuildingStdPriceModalButton prefill 3필드 + ≤2000 분기 → verify: RTL anchor GREEN
   7. 겸용 호출부 3곳 배선 → verify: anchor 전건 GREEN

[커밋 ③] 회귀·E2E
   8. → verify:
      · npx vitest run __tests__/tax-engine/transfer-tax/   (겸용 T4·T5·T6)
      · npx vitest run __tests__/calc/phd-batch-snapshots.test.ts
      · baseline anchor(mixed-use-asset-major-baseline / mixed-use-case-a-baseline) **페이로드 불변**
        ← ④ API 미추가의 증거. 깨지면 엔진 오염 = 설계 위반
   9. E2E → verify: npx playwright test e2e/mixed-use-*.spec.ts \
        e2e/mixed-use-asset-major-commercial-modal.spec.ts \
        e2e/transfer-inheritance-house-val-building-std-batch.spec.ts
      (⚠️ 파이프 없이 exit code 확인 — `| tail`은 playwright 실패를 가림)
  10. 브라우저 수동 확인(Playwright) — 첨부 화면 재현:
      PHD 배치 모달에 2001값 1,200,000 입력·적용 → 상가 모달 취득칸 자동 채움 →
      배치 모달 재적용 → 상가 모달 재오픈 시 구조·용도 **보존**(B1) → 결과탭에 상가 계산서 **노출**(B2)
```

**B1·B2 추가 케이스**:

| # | 상황 | 기대 |
|---|---|---|
| 12 | 상가 모달 적용 → 배치 모달 재적용 → 상가 모달 재오픈 | 구조·용도·건축연도 **보존** (현행: 전부 소실) |
| 13 | asset-major 겸용, 상가 모달 적용 → 결과탭 | 상가건물 계산서 **노출** (현행: 미노출) |
| 14 | legacy(용도변경) 경로 | **무변경** — 기존 키·계산서 동작 그대로 |

## 6. 안전성 근거

- **엔진 페이로드 불변**: 신규 필드는 API 변환에 추가하지 않는다. 모달 → 부모 write는
  `onApply`/`onApplyBoth`(건물 기준시가 금액)뿐이며 변경 없음.
- **드롭 방어 유지**: `phdLandPricePerSqmAtAcq`(취득당시 연도 트랙)에는 여전히 2001 값이 들어가지 않는다.
  전용 필드로 **분리 저장**할 뿐 — §2-3 의미 구분은 그대로 보존.
- **useEffect 미러링 없음** — 배치 모달 "모두 적용" 콜백(사용자 액션) 안에서만 write ([[mirror-pattern]] 준수).
- **PHD OFF·단독·CB/GB 경로 무변경** — 신규 prop은 optional, 미배선 시 종전 동작.
- 취득 ≤2000 칸이 비어도 `LandPriceLookupField`가 `fixedYear={2001}` + 지번으로 **Vworld 자동조회**를 지원한다
  (`BuildingStdPriceForm.tsx:449-457`). **(실측)** `jibun = f.addressJibun`(`:168`) ← `initialAddress.jibun`(`:142`),
  겸용 호출부 3곳 모두 `initialAddress={stdPriceAddress}`를 넘기므로 **이미 활성**. → 케이스 2·3도 1클릭.

---

## 7. 🔴 사전존재 버그 2건 — **범위 포함**(2026-07-16 결정) · 같은 시나리오(PHD ON + 배치 모달 + 용도변경 없음)

`MixedUseAssetMajorStdPrice.tsx:249`의 상가 모달 키는 `bsp-{id}-phd-commercial`이고(`bspPrefix = bsp-{id}-phd`, `:105`),
배치 모달 prefix도 **동일한** `bsp-{id}-phd`(`MixedUsePreHousingDisclosureSection.tsx:205`). 여기서 두 문제가 나온다.

### B1. 배치 모달 "모두 적용" → 상가 모달 스냅샷 **삭제**

`replaceSnapshotsByPrefix`(`building-std-snapshot-store.ts:35-41`)는 `k.startsWith(`${prefix}-`)`를 전부 제거한다.
`"bsp-{id}-phd-commercial".startsWith("bsp-{id}-phd-")` → **true** → 삭제된다.
용도변경 없음(Case B)은 `enableCommercial=false`(`ThreePointStandardPriceInput.tsx:669`)라 배치가 상가 스냅샷을
**재생성하지도 않는다** → 순수 소실.

**증상**: 상가 모달 입력·적용 → 배치 모달 재적용 → 상가 모달 재오픈 시 **구조·용도·건축연도 전부 초기화**.
(§3 prefill이 들어와도 prefill은 면적·날짜·공시지가만 복원 → 구조·용도는 스냅샷 전담이라 여전히 재입력)

### B2. 상가 모달 스냅샷이 결과탭 「건물 기준시가 계산서」에 **미노출**

`idOfSnapshotKey`(`building-std-snapshot-keys.ts:15`) 정규식 `-(?:gb|cb|phd)-(?:acq|first|transfer)(?:-commercial)?$`는
`phd-commercial`(시점 세그먼트 없음)을 매칭하지 못한다. 실행 검증:

```
bsp-a1-phd-commercial          → id: "a1-phd-commercial"  ❌ inputStr.includes(id) 실패 → 계산서 미노출
bsp-a1-phd-acq-commercial      → id: "a1"                 ✅ (legacy 키는 정상)
bsp-a1-phd-acq / -transfer     → id: "a1"                 ✅
bsp-a1-cb-acq                  → id: "a1"                 ✅
```

`BuildingStdPriceReportSection.tsx:55-56`이 `id === "" || !inputStr.includes(id)` → `continue`로 건너뛴다.
→ **asset-major 겸용 상가건물 계산서는 결과탭에 표시된 적이 없다.** (legacy/용도변경 경로는 정상)

**유입 시점 — git 실측 확정(추정 아님)**:

| 커밋 | 날짜 | 내용 |
|---|---|---|
| `48fdc629` (#525) | 2026-07-07 | `idOfSnapshotKey` 정규식 `-(?:gb\|cb\|phd)-(?:acq\|first\|transfer)(?:-commercial)?$` 최종 형태 |
| `e62c95d0` (#541) | 2026-07-09 | asset-major 재편 — `bspPrefix = bsp-{id}-phd` + `-commercial` 단일 키 도입 |

`git merge-base --is-ancestor 48fdc629 e62c95d0` → **YES**. 정규식이 **먼저** 확정됐고 #541이 규약
(`building-std-snapshot-keys.ts:4-5` — `{acq|first|transfer}` 세그먼트 필수)을 벗어난 키를 도입하면서
`idOfSnapshotKey`를 갱신하지 않았다. → **B2 유입 = #541 확정.** B1도 동일 커밋(prefix 충돌).

### 수정 — **A안 채택**(2026-07-16 결정)

상가 모달 키를 phd prefix 밖으로 빼고 `idOfSnapshotKey`를 함께 고친다:

```ts
// MixedUseAssetMajorStdPrice.tsx — bspPrefix는 배치 모달 전용으로 남기고 상가는 분리
snapshotKey={`bsp-${asset.assetId}-mx-commercial`}   // 종전: `${bspPrefix}-commercial`

// building-std-snapshot-keys.ts:15 — mx-commercial(시점 세그먼트 없는 통합 모달) 분기 추가
.replace(/-(?:gb|cb|phd)-(?:acq|first|transfer)(?:-commercial)?$/, "")
.replace(/-mx-commercial$/, "")
```

- **B1 해결**: `bsp-{id}-mx-commercial`은 `bsp-{id}-phd-`로 시작하지 않음 → 배치 재적용에 삭제되지 않음.
- **B2 해결**: `idOfSnapshotKey` → `{id}` 환원 → 결과탭 계산서 노출. `phdTimepointLabel`은 null 반환
  (`-phd-` 미매칭) → `titleOverride`·`markCellOverride` undefined → **비-PHD 기본 렌더**(CB/GB와 동일 경로).
  통합 모달은 transfer 모드 2시점 폼이라 CB/GB(`bsp-a1-cb-acq`, 동일 transfer 모드)와 같은 취급이 맞다.
- 스냅샷은 sessionStorage(`:45`)라 키 개명의 **영속 손실 없음**(세션 한정).

**기각한 B안**: 배치 prefix를 `bsp-{id}-phd3`로 좁힘 → B1만 해결·B2 잔존, `-acq`/`-first`/`-transfer` 키
전부 개명이라 파급이 더 크다.

**⚠️ Legacy 경로는 건드리지 않는다**: `bsp-{id}-phd-{acq|transfer}-commercial`(`MixedUseLegacyStdPrice.tsx:199,320`)은
규약에 맞고 B2 정상이며, Case A에서 배치가 재생성하므로 B1도 의도된 동작. **verbatim 보존.**

---

---

## 8. Do 환류 — 설계와 달라진 점 (2026-07-16 구현 완료)

### D1. 신규 헬퍼 `lib/calc/phd-acq-land-price-track.ts` — 설계에 없던 추가

§164⑤ ≤2000 경계 판정이 **3곳**(배치 시드·applyBatch 라우팅·모달 prefill 게이트)에서 쓰여
조건 복제(dual-truth)를 막기 위해 단일 소스 헬퍼로 분리했다:

- `isAcq2001LocationIndexTrack(acqYear)` — 경계 판정(연도 미상·NaN → false = 취득당시 트랙)
- `pickAcqLocationIndexLandPrice(acqYear, atAcq, atAcq2001)` — 트랙별 소스 선택

설계 §3-3의 인라인 `pre2001` 삼항을 이 헬퍼 호출로 대체. **기존 ≤2000 판정 사이트
(`BuildingStdPriceForm.tsx:445` `acqIndexYear === 2001`, `PhdBuildingStdPriceModalButton.tsx:385`)는
리팩터하지 않았다** — Surgical 원칙(안 깨진 것 건드리지 않음).

### D2. anchor A2가 RED가 아니었음 (정직 기록)

계획 §5의 `phd-batch-landprice-2001-writeback.test.ts`는 "applyBatch 라우팅 RED"를 의도했으나,
실제로는 **신규 헬퍼의 단위 테스트**라 작성과 동시에 GREEN이었다(스펙 고정 역할).
라우팅 wiring의 RED→GREEN 증거는 **E2E가 담당**(아래 D3).

### D3. E2E 신규 스펙 — `e2e/mixed-use-commercial-stdprice-landprice-prefill.spec.ts`

사용자 시나리오(PHD ON + 용도변경 없음 + 취득 1997) 전 구간 재현:
배치 모달에 2001.1.1 값 1,200,000 입력·적용 → 상가 모달 취득칸 자동 채움 단언.

**stash 대조로 RED→GREEN 확정**: 소스 변경분만 `git stash push` 후 실행 →
`toHaveValue("1,200,000")` 실패(현행 코드는 값을 드롭) → `stash pop` 후 통과.

**E2E 셀렉터 함정 2건**(수정하며 실측):
- `겸용주택 분리계산` 토글은 `.click()`, `개별주택가격 미공시` 토글은 `.setChecked(true)` —
  **두 토글의 동작이 비일관적**이다. base-ui Switch는 `<span role="switch">`라 `setChecked`가
  "Not a checkbox or radio button"으로 **에러**나는 경우가 있다([[feedback_e2e_togglecard_setchecked]]는
  setChecked를 안전한 기본값이라 하나, 이 케이스는 반례). 형제 스펙에서 통과 확인된 방식을 각각 차용.
- 겸용 PHD 패널 헤더는 **"개별주택가격 미공시 취득"** (단독 패널의 "주택공시가격 미공시 취득"과 다름).

### D5. 🔴 계획 결함 — 두 번째 축(토지일↔건물일) 누락, 코드리뷰가 검출

**계획서 §2-3은 `≤2000 → 2001.1.1` 축만 다뤘다.** 실제로는 취득 공시지가에 **축이 2개**다:

| 축 | 내용 | 계획 반영 |
|---|---|---|
| ① 기준일 체계 | 취득 ≤2000 → 2001.1.1 / ≥2001 → 취득당시 연도 (§164⑤) | ✅ rev.2에서 반영 |
| ② **토지일 vs 건물일** | 겸용은 `acquisitionDate`=건물일 · `landAcquisitionDate`=토지일 이원(§166⑥) | 🔴 **누락** |

- 화면 상가부수토지 공시지가 = `acqLandReferenceDate`(**토지 취득일**) 기준 — PR#598이 정정한 그 값.
- 모달 취득 위치지수 칸 = `landRefFromEvent(f.acquisitionEventDate, …)`(**건물 취득일**) 기준
  (`BuildingStdPriceForm.tsx:464` — 실측).
- → 두 날짜가 다르면 **다른 연도의 값**. 주입 시 위치지수 오산 → 상가건물 기준시가 오류 → **세액 영향**.
- **신규 유입**: 종전엔 이 칸이 빈 값이라 사용자가 직접 입력했다. prefill이 조용히 틀린 값을 채우게 됨
  (무입력 → **침묵 오입력**은 명백한 악화). 겸용은 `landAcquisitionDate`가 스키마상 필수라 실제 발생 경로.

**RED 재현**: `mixed-use-commercial-stdprice-modal-landprice-prefill.anchor.test.tsx` —
토지 2005-06-10 / 건물 2012-03-01 → 모달 취득칸에 `2,280,000`(2005년 값) 누수 확인.

**수정**: 호출부 3곳에 게이트 — `canPrefillAcqLandPrice = acqLandReferenceDate === asset.acquisitionDate`.
불일치 시 `undefined`(미주입) → 종전 빈 값 = 안전. 모달 Vworld 조회 1클릭으로 커버.
⚠️ `acqLandPricePerSqm2001`은 **고정 기준일(2001.1.1)이라 이 축과 무관** → 게이트 대상 아님
(= 사용자가 보고한 ≤2000 케이스는 영향 없이 그대로 해결됨).

**게이트 위치가 §164⑤와 다른 이유**: ①축은 모달이 아는 정보(`acquisitionYear`)로 판정 가능 → 모달 내부 단일 게이트.
②축은 **소스 값의 기준일**을 아는 호출부만 판정 가능 → 호출부 게이트. 층위가 달라 분리가 맞다.

### D4. 검증 결과

| 게이트 | 결과 |
|---|---|
| anchor (3 파일) | **22/22 GREEN** |
| `npx tsc --noEmit` | **exit 0** |
| `npx vitest run` 전체 | **10,575 통과 / 14 skip** — 회귀 0 |
| baseline anchor(페이로드 불변) | **6/6** — ④ API 미추가 증거 |
| E2E (신규 + 기존 5스펙) | **exit 0** |
| `npm run lint` | **0 errors** (261 warnings = 사전존재) |
| pre-push 게이트(tone·font) | **0건** |
| 불변식 1 grep 검증 | `phdLandPricePerSqmAtAcq2001`가 `lib/calc`·`lib/api`·`app/api`·`lib/tax-engine`에 **0건** |
| 불변식 3 호출부 전수 | 단독 `PreHousingDisclosureSection` **미배선 → 종전 동작 유지** 확인 |

---

## 9. 후속 (범위 밖)

- **단독주택 PHD 경로**(`PreHousingDisclosureSection.tsx:182` 계열) 신규 prop 배선 — 동일 소실 버그가 있으나
  단독은 상가 모달이 없어 이득이 "재오픈 복원"뿐. 별건.
- CB/GB prefill 확장.
- Legacy 2곳 `applyTimePoint` 미적용 — 사전존재.
- `phd-batch-snapshots.ts` 규칙 C(≤2000 취득 스냅샷 생략) — 결과탭 계산서 재유도 문제라 본 건과 별개. 미변경.
