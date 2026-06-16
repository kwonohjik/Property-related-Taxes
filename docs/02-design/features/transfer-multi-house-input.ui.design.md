# 양도세 다주택 중과 입력 위젯 — UI 설계

> 계획: `docs/00-pm/transfer-multi-house-input.plan.md` · 엔진: `transfer-multi-house-input.engine.design.md`
> 패턴: 상속 자산/채무/주식 카드의 확립된 **테이블 + 모달**.

## 배치

양도세 마법사 Step4(보유 상황) — `app/calc/transfer-tax/steps/Step4.tsx:369`,
조건 `isHousingLike(primaryKind) && householdHousingCount >= 2` 섹션 "③ 다른 보유 주택 목록" 내부.
`HousesListSection`(`step4-sections/HousesListSection.tsx`)이 담당.

## 컴포넌트 구조

```
HousesListSection (테이블 + 모달 + gracePeriod)
├── 양도 주택 소재지 RadioCardGroup (sellingHouseRegion)
├── 주택 테이블 (No.·지역·취득일·공시가격·특례배지·편집/삭제)
│     · "+ 주택 추가" → 신규 HouseEntry + 즉시 모달 오픈
│     · 특례 배지: 상속(amber)·장기임대(violet)·아파트/오피스텔/미분양(sky) — 정적 색조 매핑
├── Dialog 모달 → HouseEntryEditor
│     ├── ① 기본정보 (sky):   지역 RadioCardGroup · 취득일 DateInput · 공시가격 CurrencyInput
│     │                      · 아파트/오피스텔/미분양 ToggleCard chip (미분양 chip = 기존 버그 수정)
│     ├── ② 상속 (amber):     isInherited ToggleCard → inheritedDate DateInput (ON 시만)
│     └── ③ 장기임대 (violet): isLongTermRental ToggleCard
│            → isRegisteredRental(중첩 ToggleCard) → rentalRegistrationDate·businessRegistrationDate DateInput
│            → rentalPeriodYears DecimalInput · rentalCancelledDate DateInput(optional)
└── GracePeriodSection (violet, 조건: isOneHousehold && count>=2 && houses.length>0)
      └── ToggleCard ON → contractDate DateInput(필수) · isLandPermitArea chip
                          · hasTenantInResidence chip(토지허가 ON 시) · areaDesignatedDate DateInput(optional)
```

## 위젯 ASCII (모달)

```
┌─ 주택 N 정보 입력 ───────────────────────────┐
│ ① 기본 정보  (sky)                            │
│   [수도권][지방]  취득일[____]  공시가격[____] │
│   (아파트)(오피스텔)(미분양주택)               │
│ ② 상속 정보  (amber)                          │
│   [상속주택 ▢] → 상속개시일[____]              │
│ ③ 장기임대 정보  (violet)                     │
│   [장기임대 등록주택 ▢]                        │
│     [임대사업자 정식 등록 ▢] → 등록일[__]사업자[__] │
│     임대기간(년)[__]  말소일[__]               │
│                              [완료]           │
└───────────────────────────────────────────────┘
```

## 14개 동기화 지점 (구현 위치)

| # | 지점 | 위치 |
|---|---|---|
| ① 폼 타입 | HouseEntry(calc-wizard-asset-nbl.ts) · TransferFormData.gracePeriod(calc-wizard-store.ts) |
| ② initial | addHouse() 팩토리(9필드, 신규 optional undefined) · gracePeriod 미설정(undefined) |
| ③ normalize | optional undefined-safe (마이그레이션 불요) |
| ④ API | transfer-tax-api.ts housesPayload 게이트 + gracePeriod body |
| ⑤ 위젯 | HouseEntryEditor.tsx + HousesListSection.tsx |
| ⑥ 사이드바 | n/a (houses 합산 대상 아님) |
| ⑦ 결과 | MultiHouseSurchargeDetailCard(기존) + isSurchargeSuspended |
| ⑧ validation | transfer-tax-validate.ts step1 (상속개시일·등록정보·계약일 — houses>0 게이트) |
| ⑨⑫ Zod | transfer-tax-schema.ts gracePeriod · transfer-tax-schema-sub.ts houseSchema 6필드 |
| ⑬ body | transfer-tax-api.ts (housesPayload && form.gracePeriod) |
| ⑭ Route | transfer-route-multi-house.ts mapHousesToEngine/mapGracePeriodToEngine |

## 정책 준수

- ToggleCard/RadioCardGroup 전용(native 금지) · OFF도 tone 유지.
- 날짜 DateInput · 소수(임대기간) DecimalInput · 금액 CurrencyInput.
- **useEffect→store 미러링 금지**: 토글 OFF 시 onChange/onUpdate에서 직접 undefined set (3-state).
- 자동 안분 fallback 금지: 미입력 = validation 차단.
- Tailwind 정적 색조 매핑(CHIP_*·SECTION_* 상수).
- gracePeriod 위젯·API·validation·엔진 사용을 `houses.length>0`로 일치 (silent-omission 차단, 13단계 M1).

## E2E

`e2e/transfer-multi-house-detail.spec.ts` (2 시나리오):
1. 보유 상황 → 2채 → 주택 추가 모달 → 3섹션·상속개시일·임대등록·임대기간·미분양 → 테이블 배지.
2. 주택 1건 추가 → gracePeriod 토글 → 매매계약일·토지거래허가 노출.
- worktree: `E2E_PORT=3103`. ToggleCard 셀렉터: `getByRole("switch", {name: /title/})` (aria-labelledby).
