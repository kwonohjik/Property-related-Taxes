# 공동주택(아파트) 최초고시 전 취득 환산취득가액 — 엔진·UI 설계 (A안)

> **상태**: ✅ **구현 완료** (커밋 743d8e50 · 2026-05-13) — 2026-08-04 코드 실측 · 2026-08-05 인용 PR·커밋 재검증(종전 헤더는 stale이었음).
> ~~종전 표기: Plan 확정 (anchor 전부 확보 — Do 진입 가능)~~
> **방안**: A안 — `housingType` 메타 필드 도입 없이 UI 라벨·가이드만 동적 변경
> **작성일**: 2026-05-04
> **출처 사례**: 양도소득세 사례집 23번 + 예제 검증 화면

---

## Context

### 사례 요약 (23번)

| 항목 | 값 |
|---|---|
| 양도자산 | 경기 성남시 분당구 서현동 87 삼성아파트 108동 1402호 |
| 양도일 | 2023.02.19 / 양도가액 1,320,000,000 |
| 취득일 | 1992.01.30 (취득 실거래가 미확인) |
| 취득원인 | 일반취득 — 환산가액 |
| 거주 | 2년 미만 (사원아파트 거주) |
| 비과세 | 1세대1주택 + 2017.8.2 이전 → 거주무관 비과세, 12억 초과분 과세 |
| LTHL | 표1 (거주 2년 미만) — 보유 31년 → 30% 상한 |
| 등기·비사업용 | 등기 / 비사업용토지 아님 / 조정지역 아님 |
| 면적 | 토지 65.49㎡, 건물 263.452㎡ (= 전용 192.15 + 공유 71.302) |

### 예제 검증값 (anchor 확정)

**고시가격 (공동주택가격)**

| 결정고시일 | 고시가액 | 비고 |
|---|---|---|
| 2022-04-29 | 1,525,000,000 | 양도시 (P_T) |
| 1993-02-01 | 280,000,000 | 최초고시 (P_F) |

**개별공시지가**

| 연도 | 1992 | 2000 | 2022 |
|---|---|---|---|
| 원/㎡ | 600,000 | 820,000 | 5,930,000 |

**산출 결과**

| 항목 | 값 (원) |
|---|---|
| 환산취득가액 | 244,991,717 |
| 기타 필요경비 (개산공제) | 8,491,190 |
| 전체 양도차익 | 1,066,517,093 |
| 비과세 양도차익 | 969,560,994 |
| 과세대상 양도차익 (12억 초과분) | 96,956,099 |
| 장기보유특별공제 (표1, 30%) | 29,086,829 |
| 양도소득금액 | 67,869,270 |
| 양도소득기본공제 | 2,500,000 |
| 과세표준 | 65,369,270 |
| 세율 | 24% |
| **산출세액** | **9,928,624** |

### 산식 검증 (수동)

```
12억 초과비율 = (1,320,000,000 - 1,200,000,000) / 1,320,000,000 = 9.0909090909...%
과세 양도차익 = 1,066,517,093 × 0.0909090909 = 96,956,099 (floor) ✓
LTHL (표1 30% 상한) = 96,956,099 × 30% = 29,086,829.7 → 29,086,829 (floor) ✓
양도소득금액 = 96,956,099 - 29,086,829 = 67,869,270 ✓
과세표준 = 67,869,270 - 2,500,000 = 65,369,270 ✓
산출세액 = 65,369,270 × 24% - 5,760,000(누진공제) = 9,928,624 ✓
```

---

## ★ 케이스 인벤토리

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 공동주택(아파트) 최초고시(1993.2.1) 전 취득 + 환산취득가액 | 소령 §164⑤·⑦ | 사례 23 — 환산취득가 244,991,717 | `apartment-pre-disclosure.test.ts` | ☑ anchor 확보 |
| 2 | 1세대1주택 + 12억 초과 + 거주 2년 미만 → 표1 LTHL 30% | 소법 §89, §95② 표1 | 사례 23 — 양도소득금액 67,869,270 | `apartment-high-price-no-residence.test.ts` | ☑ anchor 확보 |
| 3 | 보유 31년 → 표1 30% 상한 적용 | 소법 §95② 표1 | 사례 23 — LTHL 29,086,829 | (#2 통합) | ☑ anchor 확보 |
| 4 | 환산취득가액 + 개산공제 = 8,491,190 (취득시 기준시가 × 3%) | 소령 §163⑥ | 사례 23 | `apartment-pre-disclosure.test.ts` | ☑ anchor 확보 |
| 5 | 산출세액 24% 구간 + 누진공제 5,760,000 | 소법 §104① | 사례 23 — 9,928,624 | `apartment-high-price-no-residence.test.ts` | ☑ anchor 확보 |
| 6 | (대조군) 거주 2년 충족 시 표2 LTHL 적용 | 소법 §95② 표2 | (anchor 추후) | `apartment-high-price-with-residence.test.ts` | ☐ |
| 7 | 공동주택 §97② 2호 단서 swap | 소법 §97② 2호 단서 | (anchor 추후) | `apartment-phd-swap.test.ts` | ☐ |

**진입 가능**: 케이스 #1·#2·#3·#4·#5 anchor 확보 → Do 단계 진입 가능. #6·#7은 후속 보강.

---

## A안: 핵심 결정사항

> **엔진 변경 없음. UI 라벨·가이드·디폴트만 동적 변경.**

| 항목 | 결정 |
|---|---|
| `housingType` 메타 필드 | **추가하지 않음** |
| `PreHousingDisclosureInput` 변경 | **없음** (기존 `firstDisclosureHousingPrice` / `transferHousingPrice` 그대로 사용) |
| 엔진 함수 시그니처 | **변경 없음** — `calcPreHousingDisclosureGain()` 그대로 |
| UI 라벨 | "개별주택가격" / "공동주택가격" 사용자 선택 (UI 로컬 state, 폼 state 아님) |
| 최초고시일 디폴트 | UI 로컬 안내 — 사용자 선택에 따라 placeholder 변경 (1990.4.30 / 1993.2.1 / 2005.4.30) |
| API 변환 | **변경 없음** |
| Validation | **변경 없음** (단, 도움말 텍스트만 보강) |

이유: 사례 23의 알고리즘은 단독·공동 동일하므로 엔진 분기 불필요. UI에서 사용자가 "공동주택" 토글을 켜면 라벨·가이드만 변경되고, 폼 state·API 페이로드·엔진 입력은 동일하게 유지됨.

---

## 법령 근거

```
소득세법 §89 ① 3호 단서: 1세대1주택 12억 초과분 과세
소득세법 §95 ② 표1: 일반 보유 LTHL (보유연수 × 2%, 최대 30%)
소득세법 시행령 §159의4: 1세대1주택 표2 적용 거주요건 (2년 거주)
소득세법 §97 ① 1호 나목: 환산취득가액
소득세법 시행령 §163 ⑥: 개산공제 = 취득시 기준시가 × 3% (주택)
소득세법 시행령 §164 ⑤: 개별주택가격 미공시 취득시 기준시가 추정
소득세법 시행령 §164 ⑦: 공동주택가격 미공시 취득시 동일 산식 추정
소득세법 시행령 §166 ⑥: 일괄양도 시 기준시가 비율 안분
```

법령 상수: 신규 추가 없음. 기존 `lib/tax-engine/legal-codes/transfer.ts`의 `TRANSFER.PRE_HOUSING_DISCLOSURE` 사용.

---

## 엔진 — 변경 없음

`calcPreHousingDisclosureGain()` 알고리즘이 이미 공동주택에도 적용 가능. **사례 23 입력 매핑**:

```ts
calcPreHousingDisclosureGain(1_320_000_000, {
  landArea: 65.49,
  landPricePerSqmAtAcquisition: 600_000,                 // 1992
  buildingStdPriceAtAcquisition: <bld_1992>,             // 사용자 입력
  landPricePerSqmAtFirstDisclosure: 600_000,             // 1993 (1992와 동일하다고 가정 시)
  buildingStdPriceAtFirstDisclosure: <bld_1993>,
  firstDisclosureHousingPrice: 280_000_000,              // P_F (공동주택가격)
  landPricePerSqmAtTransfer: 5_930_000,                  // 2022
  buildingStdPriceAtTransfer: <bld_2022>,
  transferHousingPrice: 1_525_000_000,                   // P_T (공동주택가격)
})
// → totalEstimatedAcquisitionPrice = 244,991,717
//   landLumpDeduction (개산공제) = 8,491,190
```

> **건물 기준시가 1992·1993·2022 시점값**: **사용자가 직접 입력**. 자동 산정·자동 룩업은 본 기능 범위 외. 사용자는 국세청 건물기준시가 고시 자료 또는 예제 등 외부 도구의 "건물기준시가계산서"를 참조하여 3시점 값을 직접 입력한다. UI는 도움말로 참조 경로만 안내.

---

## UI 변경 — 8개 동기화 지점 점검

| # | 지점 | A안 영향 |
|---|------|--------|
| ① | FormData 타입 | **변경 없음** |
| ② | initial value | **변경 없음** |
| ③ | normalize fallback | **변경 없음** |
| ④ | API 변환 (`transfer-tax-api.ts`) | **변경 없음** |
| ⑤ | UI 입력 위젯 | `PreHousingDisclosureSection.tsx` — UI 로컬 state로 "주택유형(개별/공동)" 토글 추가, 라벨·placeholder·도움말 동적 분기 |
| ⑥ | 사이드바 합계 | **변경 없음** |
| ⑦ | 결과 카드 산식 | "개별주택가격" → "공동주택가격" 표기 동적 (UI 로컬 또는 입력 토글값을 결과 화면에 전달) |
| ⑧ | validation | **변경 없음** (도움말 텍스트만 보강) |

### UI 작업 상세

**파일**: `components/calc/transfer/PreHousingDisclosureSection.tsx`

1. 컴포넌트 로컬 useState로 `housingTypeLabel: "individual" | "apartment"` 관리 (폼 state 아님 — 폼·API에 전달 안 함)
2. 토글 UI: `RadioCardGroup` (개별주택 / 공동주택)
3. 라벨 동적:
   - "개별주택가격" ↔ "공동주택가격"
   - "최초고시일" placeholder: 개별=`2005-04-30`, 공동=`1993-02-01` (또는 `1990-04-30`)
4. 도움말 텍스트:
   - 개별주택: 기존 유지
   - 공동주택: "공동주택가격은 부동산공시가격알리미에서 조회. 1990.4.30 또는 1993.2.1 이전 취득은 본 환산이 적용됩니다."
5. **메모리 정책 준수**:
   - useEffect로 store 미러링 금지 (`feedback_useeffect_store_mirror_forbidden.md`)
   - 자동 안분 fallback 금지 (`feedback_no_silent_apportion_fallback.md`)
   - "절감"·"유리" 표현 금지, 중립 사실만 (`feedback_tax_calculation_principle.md`)
   - 결과 카드 "원" 단위 표기 금지 (`feedback_no_won_suffix.md`)

**파일**: `components/calc/transfer/result/...` (해당 결과 카드)

- 라벨 변경 시 결과 화면도 동일 라벨 표기 → UI 로컬 state를 `sessionStorage` 또는 결과 카드 prop으로 전달. 단, 폼 state·API에는 포함하지 않음.
- 대안 (간단): 결과 카드에는 항상 "주택공시가격"이라는 중립 표현 사용. 사용자가 알아서 해석. → **권장**

---

## Silent fallback / 자동 안분

- 최초고시일 자동 채움 금지. 사용자가 직접 선택 (디폴트 placeholder만 안내).
- 건물 기준시가 자동 추정 금지. 미입력 시 validation 오류로 차단 (기존 동작 유지).
- 라벨 토글값은 폼 state에 들어가지 않으므로 fallback 동기화 불필요.

---

## 테스트 약속

### 신규 anchor (`apartment-` 접두 별도 파일)

```
__tests__/tax-engine/transfer-tax/
├── apartment-pre-disclosure.test.ts
│   ├── T-A23-1: 환산취득가액 = 244,991,717
│   ├── T-A23-2: 개산공제 = 8,491,190
│   └── T-A23-3: 토지·건물 안분 (예제 명세서 기준)
└── apartment-high-price-no-residence.test.ts
    ├── T-A23-4: 전체 양도차익 = 1,066,517,093
    ├── T-A23-5: 과세 양도차익 (12억 초과분) = 96,956,099
    ├── T-A23-6: LTHL (표1 30%) = 29,086,829
    ├── T-A23-7: 양도소득금액 = 67,869,270
    ├── T-A23-8: 과세표준 = 65,369,270
    ├── T-A23-9: 산출세액 = 9,928,624
    └── T-A23-10: (옵션) 지방소득세 10% = 992,862
```

### 입력값 (테스트 fixture)

```ts
{
  // 자산 기본
  transferDate: "2023-02-19",
  transferPrice: 1_320_000_000,
  acquisitionDate: "1992-01-30",
  landArea: 65.49,
  buildingArea: 263.452,
  landAcquisitionDate: "1992-01-30",  // PHD 토지 취득시 참조일

  // PHD 3-시점
  firstDisclosureDate: "1993-02-01",
  landPricePerSqmAtAcquisition: 600_000,
  landPricePerSqmAtFirstDisclosure: 600_000,
  landPricePerSqmAtTransfer: 5_930_000,
  // 건물 기준시가 3시점 — 사용자 직접 입력 전제
  // 사례 23 anchor 작성 시: 환산취득가 244,991,717을 역산하여 적합한 3시점 조합 fitting
  // (실제 운영에서는 사용자가 국세청 건물기준시가 자료를 참조해 직접 입력)
  buildingStdPriceAtAcquisition: <사용자 입력>,
  buildingStdPriceAtFirstDisclosure: <사용자 입력>,
  buildingStdPriceAtTransfer: <사용자 입력>,
  firstDisclosureHousingPrice: 280_000_000,
  transferHousingPrice: 1_525_000_000,

  // 비과세·LTHL
  isOneHouseExempt: true,
  highPriceHouseThreshold: 1_200_000_000,
  hasResided2Years: false,  // 표1 선택
  isPre20170802Acquisition: true,  // 거주무관 비과세

  // 부가
  isRegistered: true,
  isAdjustedArea: false,
  isNonBusinessLand: false,
}
```

> **건물 기준시가 3시점값**: 운영 환경에서는 **사용자가 직접 입력** (자동 산정·룩업 없음).
> 테스트 anchor 작성 시에는 예제 검증값(환산취득가 244,991,717·개산공제 8,491,190)을 역산하여
> 3시점 조합을 fitting한 뒤 fixture에 박제. fitting된 값은 테스트 전용으로만 사용하며,
> UI에서는 사용자 입력 필드로 그대로 노출.

### 회귀 anchor

- 기존 `pre-housing-disclosure.test.ts` 41 anchor 그대로 통과 (엔진 변경 없음).
- `transfer-tax.ts` 통합 테스트 회귀 검증.

---

## 구현 순서 (A안 — 경량)

### Phase 1: anchor 확정 (선결)

- [ ] 예제 검증값(환산취득가 244,991,717 · 개산공제 8,491,190)을 역산하여 1992·1993·2022 시점 건물 기준시가 fitting → 테스트 fixture에만 박제
- [ ] 토지·건물 안분 명세서 세부값 정리 (사례집 본문 또는 예제 명세서 확장)
- [ ] **운영 전제**: 건물 기준시가는 사용자가 직접 입력 — UI 자동 룩업·자동 추정 없음

### Phase 2: 엔진 — anchor 테스트만 작성 (transfer-tax-senior)

- [ ] `apartment-pre-disclosure.test.ts` — T-A23-1·2·3
- [ ] `apartment-high-price-no-residence.test.ts` — T-A23-4~9
- [ ] 통합 호출: `calculateTransferTax()` 메인 엔진을 통한 end-to-end anchor 확인
- [ ] 기존 41 anchor 회귀 pass 확인

### Phase 3: UI — 라벨·가이드 (transfer-tax-ui-senior)

- [ ] `PreHousingDisclosureSection.tsx` 라벨 토글 추가 (UI 로컬 state)
- [ ] 도움말 텍스트 보강 (공동주택 케이스 가이드)
- [ ] 결과 카드 라벨 중립화 ("주택공시가격") 또는 prop 전달
- [ ] 메모리 정책 6개 자가 점검:
  - [ ] useEffect store 미러링 없음
  - [ ] 자동 안분 fallback 없음
  - [ ] 절감·유리 표현 없음
  - [ ] "원" 단위 표기 없음
  - [ ] DateInput·DecimalInput·LandPriceLookupField 사용
  - [ ] ToggleCard·RadioCardGroup 사용

### Phase 4: Check

- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/apartment-*` 통과
- [ ] `ui-engine-sync-checker` (변경 없음 확인)
- [ ] 브라우저 수동 — 사례 23 입력 → 산출세액 9,928,624 일치 확인

### Phase 5: Act

- [ ] 메모리 추가: `project_apartment_pre_disclosure.md` (2026-05-04, 5 anchor, A안)
- [ ] PDCA 상태 갱신 (`.bkit/state/pdca-status.json`)
- [ ] 케이스 #6·#7 후속 백로그

---

## 8개 동기화 지점 자가 점검 (작업 완료 보고 전 필수)

- [ ] 케이스 인벤토리 #1·#2·#3·#4·#5 anchor 작성 완료 ☑
- [ ] ① FormData 타입 — 변경 없음 (확인)
- [ ] ② initial — 변경 없음 (확인)
- [ ] ③ normalize — 변경 없음 (확인)
- [ ] ④ API 변환 — 변경 없음 (확인)
- [ ] ⑤ UI 위젯 — 라벨 토글 추가
- [ ] ⑥ 사이드바 — 변경 없음 (확인)
- [ ] ⑦ 결과 카드 — 라벨 중립화 또는 토글값 전달
- [ ] ⑧ validation — 도움말만 보강 (차단 로직 없음)
- [ ] `npx tsc --noEmit` 0건
- [ ] 브라우저 수동 확인

---

## 미해결 / 후속 보강

1. **공동주택가격 자동 룩업** (부동산공시가격알리미) — 별도 로드맵 (본 기능 범위 외)
2. **건물 기준시가 자동 룩업** — 별도 로드맵. 본 기능에서는 **사용자 직접 입력** 유지
3. **대안 B 마이그레이션** — 사용자 피드백 후 `housingType` 메타 필드 도입 검토
4. **케이스 #6 (거주 2년 충족 + 표2 LTHL)** — 대조 anchor 보강
5. **케이스 #7 (§97② 2호 단서 swap)** — 자본적지출이 큰 사례 anchor 발굴
