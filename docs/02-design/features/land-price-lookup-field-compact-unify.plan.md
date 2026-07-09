# LandPriceLookupField 컴팩트 3열 레이아웃 전역 통일 — 수정 계획서

> 이미지24(상가부수토지 `LandPriceLookupField`)를 이미지25(`ThreePointStandardPriceInput`의 `PointBlock` 컴팩트 3열)와 동일한 레이아웃으로 통일. **사용자 결정: 전역 통일(13곳) + 외부 링크·힌트 제거.**

## 0. 결정 반영 (사용자 확정)
- **범위**: 전역 — `LandPriceLookupField`를 쓰는 **13개 사용처 일괄** 변경(컴포넌트 자체 재설계).
- **링크·힌트**: 기준연도 행 아래 `ReferenceSiteLinks`(공시가격 확인/토지대장) + "소재지 입력 후 조회 가능합니다" 힌트 **제거**(이미지25 동일).

> 확인: "2번" = 위 두 가지(전역 + 제거)로 해석. 다르면 알려주세요.

## 1. 현행 vs 목표 레이아웃

**현행(`LandPriceLookupField`, 이미지24)** — 세로 2단:
1. 기준연도 행(전폭 FieldCard 라벨-좌): `[Select][조회]` + "소재지 입력 후 조회" 힌트 + `ReferenceSiteLinks`(2개 링크)
2. 2열 그리드: `[개별공시지가]` `[토지기준시가]`

**목표(`PointBlock`, 이미지25)** — 컴팩트 3열 1행:
`grid grid-cols-1 sm:grid-cols-3 gap-2` — `[공시지가 연도(자동배지) · Select+조회 인라인]` `[개별공시지가]` `[토지기준시가]`, 각 `FieldCard stacked`. 외부 링크·"소재지 입력 후" 힌트 없음.

## 2. 변경 파일

| 파일 | 작업 |
|---|---|
| `components/calc/inputs/LandPriceLookupField.tsx` | **본체 재설계** — 3열 컴팩트, 링크·힌트 제거 (13곳 일괄 반영) |
| (사용처 13곳) | **props 무변경** — 호출부 수정 불필요(레이아웃만 컴포넌트 내부에서 변경) |

**사용처 13곳(참고, 무수정)**: comprehensive/LandParcelEditor(2)·transfer/RedevelopmentValuationSection(4)·GeneralBuildingBlock(2)·CommercialBuildingBlock(3)·mixed-use/MixedUseLegacyStdPrice(2)·mixed-use/MixedUseAssetMajorStdPrice·inheritance/PostDeemedInputs·building-std-price(LandParcelsSection·ApartmentConversionSection·BuildingStdPriceForm)·inheritance estate-card variants(3). (전부 `area`+`referenceDate`+`label` 전달 → 3필드 구조 충족.)

## 3. 재설계 상세 (`LandPriceLookupField` 렌더)

```
<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
  {/* ① 공시지가 연도 — Select + 조회 인라인 (이미지25 동일) */}
  <FieldCard label="공시지가 연도" badge={yearBadge} stacked>
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0"><Select .../></div>
      <button ...>공시지가 조회</button>
    </div>
    {lookupError && <p ...>{lookupError}</p>}
  </FieldCard>

  {/* ② 개별공시지가 */}
  <FieldCard label={label} hint={hint} unit="원/㎡" stacked>
    <CurrencyInput ... hideUnit />
  </FieldCard>

  {/* ③ 토지기준시가 (자동 계산) */}
  <FieldCard label="토지기준시가" unit="원" stacked
    hint={area ? `${area.toFixed(2)}㎡ × 공시지가` : "면적 입력 후 자동 계산"}>
    <div className="...read-only...">{landStdPrice ?? "면적 입력 후 자동 계산"}</div>
  </FieldCard>
</div>
```

- **제거**: `ReferenceSiteLinks` import·렌더, "소재지 입력 후 조회 가능합니다" 힌트 블록.
- **유지**: `yearBadge`(자동/수동+↻자동), Select 옵션, `handleLookup`·`handleYearSelect`·`handleResetToAuto`, 면적 자동채움(`onAreaChange`), 토지기준시가 계산.
- **라벨 통일**: "공시지가 기준연도" → "공시지가 연도"(이미지25 동일).
- **props 시그니처 불변** — 호출부 13곳 무수정.

## 4. 영향·리스크 (재검토 실측 반영)

- **엔진/API/validation 무변경**: UI 레이아웃만. props·상태·조회 로직 동일.
- **외부 링크는 LandPriceLookupField에서만 제거 — orphan 아님(실측)**: `ReferenceSiteLink(s)`는 **6개 다른 파일**(PropertyCardEditor·property/Step2SeparateAggregate·acquisition/Step0·GeneralBuildingBlock·inheritance EstateBodyRealEstate·BuildingStdPriceForm)에서도 사용 → 컴포넌트 파일 유지·import 삭제만. 단 **개별공시지가 필드에서만** 링크가 사라지고 위 6곳(재산세 필지·취득세 등)엔 그대로 남음 → "통일"은 개별공시지가 필드 한정(앱 전역 링크 제거 아님).
- **좁은 컨테이너 3열 — 리스크 낮음(실측)**: grid-cols-2 부모 셀 안 사용처 **0건**(grep). 사용처는 전폭 sub-block 위주 → `sm:grid-cols-3`(좁은 폭 1열 폴백)로 충분. Do 시 대표 화면 스크린샷으로 확인.
- **연도 select 폭**: 인라인 버튼과 함께 좁아짐 → "2025년 (자동)" 표시 확인.
- **긴 label 줄바꿈**: 일부 사용처 label이 김("직전연도(2024) 개별공시지가 (원/㎡)" 등) → 좁은 stacked 칸에서 줄바꿈(수용 가능).

## 5. 회귀 검증 (재검토 실측 반영)

- **E2E 셀렉터 정정 불필요(실측)**: 제거 대상("소재지 입력 후 조회"·링크 텍스트·"공시지가 기준연도")을 assert하는 스펙 **0건**. 유일 매칭(`building-standard-price.spec.ts:213`)은 **주석 1줄**이고 실제 assert는 `getByText("2015년 (자동)")`(연도 select 값 — 유지) → 무영향.
- 대표 화면 회귀 스펙 재실행: mixed-use(case-a·exclusive)·redev(transfer-98-8)·building-standard-price·comprehensive land·inheritance(postdeemed·house-val-batch).

## 6. 미결/확인
1. **범위·링크 제거 확정**(§0) — "2번" 해석 확인.
2. **좁은 컨테이너**(§4, 리스크 낮음): grid-cols-2 부모 0건이나, 전폭이 아닌 sub-block(mixed p-2 등) 실렌더는 Do 스크린샷으로 최종 확인. 과압박 시 해당만 2열 예외 판단.
3. 링크 처리: 기본=개별공시지가 필드에서 완전 삭제(다른 6곳은 유지).

## 7. Definition of Done
- [ ] `LandPriceLookupField` 3열 컴팩트 재설계(연도 Select+조회 인라인 | 공시지가 | 토지기준시가)
- [ ] `ReferenceSiteLinks`·"소재지 입력 후 조회" 힌트 제거, 라벨 "공시지가 연도" 통일
- [ ] props 시그니처·조회 로직·면적 자동채움 불변, 호출부 13곳 무수정
- [ ] `npx tsc --noEmit` 0건 / ESLint clean(LandPriceLookupField 내 ReferenceSiteLinks import 제거) / 800줄
- [ ] 회귀 E2E 통과(mixed·redev·building·comprehensive·inheritance)
- [ ] 대표 화면 3~4곳 스크린샷으로 3열 수용·이미지25 일치 확인
- [ ] 엔진/API/validation 무변경 확인
