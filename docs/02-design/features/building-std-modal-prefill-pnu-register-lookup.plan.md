# 건물 기준시가 모달 — prefill 소재지로 "건축물대장 조회" 버튼 활성화 정정 (수정 계획서)

> 상태: Plan (Do 미착수) · 작성 2026-07-14
> 대상: `AssetForm`(전체 PNU 저장) + `BuildingStdPriceForm`/`BuildingRegisterLookupField`로 소재지를 prefill하는 전 사이트
> 관련: [[project_transfer_regulated_area_regioncode]] · [[feedback_general_building_split_acquisition_date]] · [[feedback_store_default_vs_ui_display_fallback]]

## 0. 한 줄 요약

건물 기준시가 계산 모달(`BuildingStdPriceForm`)에서 소재지가 상위 화면에서 **prefill(자동채움)** 된 상태인데도 **"건축물대장 조회" 버튼이 비활성**이다. 소재지를 모달에서 **다시 조회해야만** 활성화된다. 원인: 자산이 주소 조회 시 **전체 PNU(19자리)를 버리고 `regionCode`(앞 10자리)만 저장**해, 부모가 모달에 전달하는 `initialAddress`에 `pnu`가 없기 때문. **자산에 전체 PNU를 저장**하고 prefill 경로로 전달해 정정한다.

---

## 1. 진단 (실측 file:line)

### 1.1 버튼 활성화 = 전체 PNU 필요

`BuildingRegisterLookupField.tsx:49`:
```ts
const canLookup = !!pnu && !!year && !disabled;
```
`pnu`(19자리) 없으면 버튼 비활성 + "소재지 입력 후 조회 가능합니다"(`:118`).

### 1.2 모달의 pnu는 initialAddress.pnu에서만 시드

`BuildingStdPriceForm.tsx:140`:
```ts
pnu: initialAddress.pnu ?? "",
```
- prefill(`initialAddress`)에 `pnu` 없으면 `f.pnu=""` → 버튼 비활성.
- 모달에서 `AddressSearch` 재조회 시 onSelect(`:343` `pnu: v.pnu ?? ""`)가 전체 PNU를 채움 → 활성화(= 사용자가 겪는 "재조회해야 됨").

### 1.3 부모의 stdPriceAddress에 pnu 필드 없음 (5곳)

`stdPriceAddress = { road, jibun, building, detail, lng, lat }` — **`pnu` 키 없음** (양도세, **총 6곳** 실측 확정):
- `GeneralBuildingBlock.tsx:74` · `CommercialBuildingBlock.tsx:56` · `PreHousingDisclosureSection.tsx:67` · `MixedUseLegacyStdPrice.tsx:73` · `MixedUseAssetMajorStdPrice.tsx:88`
- `MixedUsePreHousingDisclosureSection.tsx:203`(인라인 stdPriceAddress → ThreePointStandardPriceInput, `:203-210` road·jibun·building·detail·lng·lat만 — pnu 없음 실측 확인)

### 1.4 근본 원인 — 자산이 전체 PNU를 버림

`AssetSectionBasic.tsx:207-208` (주소 onSelect):
```ts
if (v.pnu && v.pnu.length >= 10) {
  patch.regionCode = v.pnu.slice(0, 10);   // ← 앞 10자리만 저장, 나머지 9자리(필지·본번·부번) 폐기
}
```
`AssetForm`에 저장되는 주소 필드(`calc-wizard-asset.ts:125-151`): `addressRoad/addressJibun/addressDetail/addressDong/addressHo/longitude/latitude/regionCode` — **전체 PNU 필드 없음**. → 부모가 모달에 넘길 전체 PNU가 존재하지 않음.

`AddressValue`(`address-search.tsx:29`)는 `pnu?`를 제공하므로, **조회 시점엔 전체 PNU가 있었으나 자산 저장에서 폐기**된 것.

---

## 2. 수정안 — 자산에 전체 PNU 저장 후 prefill 전달 (Option A, 권장)

### 2.1 AssetForm에 `addressPnu` 추가 (UI 전용 — 엔진 입력 아님)

`addressPnu?: string` (전체 19자리 PNU). 건축물대장 조회 prefill 전용, **엔진·API 입력 아님**(④⑨⑩⑫⑬⑭ 무관). 동기화 지점 축소:
- ① 타입: `lib/stores/calc-wizard-asset.ts` `AssetForm`
- ② initial: `makeDefaultAsset`
- ③ normalize: `migrateAsset`(sessionStorage 호환 — 미보유 자산은 `undefined`)

### 2.2 전체 PNU 저장 — 조회 캡처 1곳 + 복사 전파 1곳 (재검토 정정)

`regionCode`는 유지(조정대상지역 등 소비처 다수), `addressPnu`를 **추가** 저장. **실측 결과 두 사이트의 성격이 다름**:
- **조회 캡처** — `AssetSectionBasic.tsx:207` 주소 onSelect: `if (v.pnu && v.pnu.length === 19) patch.addressPnu = v.pnu` 추가. (유일한 AddressSearch 캡처 지점)
- **복사 전파** — `CompanionAssetCardReplot.tsx:152-164`: 자체 조회가 **아니라** primary 자산 주소를 복사(`addressRoad: asset.addressRoad` 등 + `regionCode: asset.regionCode`). → 복사 목록에 **`addressPnu: asset.addressPnu` 추가**(companion 쌍둥이 PNU 승계).

### 2.3 부모 stdPriceAddress에 `pnu: asset.addressPnu` 추가 (양도세 6곳)

§1.3의 **6곳 전부**(General·Commercial·PreHousingDisclosure·MixedUseLegacy·MixedUseAssetMajor·MixedUsePreHousingDisclosure):
```ts
const stdPriceAddress = { road: …, jibun: …, building: …, detail: …, lng: …, lat: …, pnu: asset.addressPnu };
```
→ 모달 `initialAddress.pnu` 채워짐 → `f.pnu` 시드 → 버튼 **활성화**(재조회 불요).

### 2.4 Fallback (회귀 0)

- `addressPnu` 미보유(레거시 자산·PNU 없는 주소 입력) → `initialAddress.pnu=undefined` → 종전대로 버튼 비활성 + 재조회 안내(현행 동작 보존). **악화 없음**.
- 모달 내 재조회는 그대로 동작(onSelect가 pnu 갱신).

## 3. 대안 검토 (기각)

- **Option D — 모달/부모에서 regionCode(10) + jibun으로 PNU 역산**: PNU = 법정동(10)+필지구분(1)+본번(4)+부번(4). jibun 파싱(산/대지·본번·부번)이 표기 편차로 **취약** → 기각. 조회 시점에 이미 있던 전체 PNU를 저장하는 Option A가 견고.

## 4. 영향 범위

- 신규 필드 `addressPnu`는 **UI 전용**(건축물대장 조회 prefill) → 엔진/검증/결과 무영향. 8지점 중 ①②③ + 조회 캡처(AssetSectionBasic 1) + 복사 전파(Companion 1) + stdPriceAddress(6)만.
- 혜택: 상가 모달(이미지47)뿐 아니라 **전 양도세 건물 기준시가 모달**(General·Commercial·Mixed·PHD) prefill 소재지에서 버튼 활성화.
- ⚠️ **상속·증여는 별개 소스**(재검토 발견): `EstateBodySupplementaryValuation.tsx:235`가 `initialAddress={addrValue}`(EstateItem 기반 `AddressValue`, `EstateBodyRealEstate:239`에서 주입)를 씀 → **AssetForm.addressPnu로 커버 안 됨**. §8로 별도 후속(estate 주소가 pnu 보존하는지 확인 후, 미보존이면 estate 주소 저장에 pnu 추가).

## 5. Pre-Do Anchor

- **A1 (모달 단위)**: `BuildingStdPriceForm`을 `initialAddress={{ road, jibun, …, pnu: "4717032026..."(19자리) }}`로 렌더 → "건축물대장 조회" 버튼 **활성**(disabled 아님). `pnu` 없는 initialAddress → 비활성(회귀 가드).
  - 파일: `__tests__/components/building-std-modal-prefill-pnu.test.tsx`
- **A2 (저장 단위)**: `AssetSectionBasic` 주소 onSelect가 `addressPnu`에 전체 PNU 저장(RTL 또는 onChange patch 단위 테스트).

## 6. 구현 단계

1. Pre-Do anchor A1 작성·실행 → verify: pnu 있는 initialAddress에서 버튼 활성 기대(현행 fail 재현).
2. `AssetForm.addressPnu` ①②③ 추가 → tsc 0.
3. `AssetSectionBasic` 주소 onSelect `addressPnu` 캡처(length===19) + `CompanionAssetCardReplot:152-164` 복사 목록에 `addressPnu` 추가 → tsc 0.
4. stdPriceAddress **6곳** `pnu: asset.addressPnu` 추가 → tsc 0.
5. anchor 재실행 → A1·A2 pass.
6. 회귀: `npx vitest run __tests__/calc/ __tests__/components/` → green.
7. lint → 0.
8. 브라우저/E2E: 상위에서 주소 조회 → 겸용/일반 건물 기준시가 모달 열기 → 버튼 즉시 활성. 레거시(주소 재입력 안 한) 자산 → 비활성 유지 확인. [[feedback_browser_verify_with_playwright]]

## 7. 완료 기준 (DoD)

- [ ] Pre-Do anchor A1(pnu prefill=버튼 활성)·A2(onSelect=addressPnu 저장) 통과
- [ ] prefill 소재지(전체 PNU 보유)에서 건축물대장 조회 버튼 **재조회 없이 활성**
- [ ] `addressPnu` 미보유 시 종전 동작(비활성+안내) 유지(회귀 0)
- [ ] stdPriceAddress 6곳 pnu 전달 확인
- [ ] `tsc --noEmit` 0 · 회귀 green · lint 0
- [ ] 브라우저/E2E 확인 또는 미수행 명시

## 8. 미결·확인 필요 (재검토 2026-07-14 반영)

- ✅ **해소**: `MixedUsePreHousingDisclosureSection:203` stdPriceAddress 실측 확정(pnu 없음, 6번째 사이트) → §1.3·§2.3.
- ✅ **해소·정정**: `CompanionAssetCardReplot`은 주소 onSelect가 **아니라** primary 복사 사이트(`:152-164`) → `addressPnu: asset.addressPnu` 복사(§2.2). 조회 캡처는 `AssetSectionBasic` **단독**.
- ✅ **해소**: 전체 PNU = 19자리(`address-search.tsx:152` `pnu.length === 19` 확인) → 저장 가드 `length === 19`.
- 🟠 **신규 후속(별도 계획)**: **상속·증여 건물 std 모달**(`EstateBodySupplementaryValuation` ← `addrValue` ← `EstateBodyRealEstate:239`)은 EstateItem 기반 `AddressValue` 소스. 본 계획(AssetForm) 범위 밖. estate 주소 저장이 pnu를 보존하는지(= 이미 활성인지) 확인 후, 미보존이면 estate 주소 저장 지점에 pnu 추가하는 **별도 정정** 필요.
