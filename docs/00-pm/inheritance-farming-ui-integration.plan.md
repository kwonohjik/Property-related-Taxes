# 영농상속공제 UI 통합 작업 계획서 (v2)

> **대상**: PR-C UI 통합 (사업무관자산) + PR-E UI 통합 (Vworld 좌표 자동 저장 + Haversine 미리보기)
> **작성일**: 2026-05-21
> **v2 정정**: 2026-05-22 — `inheritance-farming-followup-critical-review.md` 13건 정정 반영
> **선행**: PR-C 엔진 (`873daca`), PR-E 인프라 (`dd7e2fc`) + 옵션 A 정책 (`1e915f1`) master 반영 완료
> **참조**: `docs/00-pm/inheritance-farming-remaining-prs.plan.md` §6-5 + §5-5

---

## 1. 범위 분리 (v2 정정)

| Phase | 범위 | 작업량 (v2) | PR 분리 권장 |
|---|---|---|---|
| **UI-C** | `CorporateNonBusinessAssetsSection` PropertyValuationForm·StockValuationForm 카드 내부 통합 | 소(1~2h) | ✅ 단독 PR |
| **C2 좌표 휘발 버그 수정** (선행 필수) | PropertyValuationForm `addrValue` local state → EstateItem.estateAddress·estateLatLng 직접 저장 | 중(2~3h) | ✅ 단독 PR — UI-E1 선행 |
| **UI-E1** | EstateItem.estateLatLng·fishingAnchorLatLng 통합 (AddressSearch onChange 확장) | 소(1~2h) — **v1 3~4h에서 정정** | ✅ 단독 PR (C2 의존) |
| **UI-E2** | FarmingEligibilitySection 거주지 좌표 입력 + Haversine 자동 미리보기 카드 | 중(3~4h) | ✅ 단독 PR (UI-E1 의존) |
| **UI-E3** | met·autoMet 비교 안내 카드 (옵션 A 정책) — 자동이 사용자 명시 덮어쓰지 않음 | 소(1~2h) | UI-E2 통합 가능 |

**총 5개 PR (또는 UI-E2+UI-E3 통합 시 4개)**.

### v1 정정 요약 (작업량)
- **UI-E1**: 신규 컴포넌트 불필요 (AddressSearch 이미 lat·lng 반환). 3~4h → 1~2h
- **C2 신규 추가**: PropertyValuationForm 좌표 휘발 버그 수정 별도 PR로 분리

---

## 2. UI-C — CorporateNonBusinessAssetsSection 카드 통합

### 2-1. 현재 상태
- `components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx` 신규 완성 (`873daca`)
- `isCorporateStock` 분기 조건부 렌더 + useMemo 미리보기 + 5필드 + totalAssets
- **호출처 없음** — 통합 대기 중

### 2-2. 통합 지점

| 위치 | 조건 | 배치 |
|---|---|---|
| `components/calc/PropertyValuationForm.tsx` 자산 카드 | `farmingCategory==="corporate_stock" \|\| familyBusinessCategory==="corporate_stock"` | FarmingCategorySection·FamilyBusinessCategorySection 직후 |
| `components/calc/StockValuationForm.tsx` 자산 카드 | 동일 | 동일 |

**자산 카드 내부 순서** (제안):
1. 기본 필드 (name·category·marketValue 등)
2. `FarmingCategorySection` (영농 자산 분류) — 기존
3. `FamilyBusinessCategorySection` (가업 자산 분류) — 기존
4. **`CorporateNonBusinessAssetsSection`** — 신규 (corporate_stock 시만)
5. (상속 모드) `HeirAllocationToggleSection` — 기존

### 2-3. Props 시그니처
컴포넌트 이미 완성:
```tsx
<CorporateNonBusinessAssetsSection
  item={item}
  onUpdate={(updated) => updateItem(item.id, updated)}
/>
```
PropertyValuationForm·StockValuationForm 둘 다 `onUpdate(updated)` 패턴 동일 — 변경 0.

### 2-4. anchor (FNB-UI-1~3 — 계획서 §6-8 기존)
- **FNB-UI-1**: corporate_stock 미선택 시 컴포넌트 미렌더 (`container.firstChild` null)
- **FNB-UI-2**: corporate_stock 선택 시 5필드 + totalAssets 노출 (`getAllByRole("textbox")` 또는 label 매칭)
- **FNB-UI-3**: 입력 변경 시 미리보기 useMemo 자동 재계산 (totalAssets 입력 → "차감 미리보기" 카드 노출)

**테스트 파일**: `__tests__/components/calc/inheritance/corporate-non-business-section.test.tsx` 신규.

### 2-5. 14지점 영향
- ⑤ UI 입력 위젯: PropertyValuationForm·StockValuationForm 2곳 통합
- ⑦ 결과 카드 — 자동차감 적용 시 결과 카드에서 `corporateNonBusinessAssets` 정보 표시 (선택적)
- 나머지 ①~④·⑥·⑧·⑨~⑭: 신규 optional 객체이므로 자동 통과

### 2-6. 위험 요소
- 카드 두 영역(farming + family-business)에서 동일 컴포넌트 노출 — 사용자 혼동 방지 위해 헤더 라벨로 명시 (이미 "법인 사업무관자산 차감 (시행령 §15⑤2호 + §16⑤2호)")
- corporate_stock 카테고리가 farming + family-business 동시 선택 시 단일 컴포넌트만 노출 (이미 `||` OR 조건)

---

## 3. UI-E1 — AddressSearch 좌표 통합 (v2 정정)

### 3-1. 현재 상태 (실측, 2026-05-22)
- `EstateItem.estateLatLng`·`fishingAnchorLatLng` 필드 정의 완료 (`dd7e2fc`)
- `components/ui/address-search.tsx`의 `AddressValue` 이미 `lat: string`·`lng: string` 포함
- `PropertyValuationForm.tsx:163` 이미 AddressSearch 사용 — onChange에서 `v.lat`·`v.lng` 접근 가능
- **그러나 `addrValue`가 useState local — EstateItem에 저장 안 됨 (C2 좌표 휘발 버그)**

### 3-2. Vworld API 응답 좌표 구조 (사전 조사 완료, 2026-05-22)

✅ **확인 완료**:
- `AddressValue`: `{ road, jibun, building, detail, lng, lat, pnu }`
- 모두 string 타입 — number 변환 필요 (`parseFloat(v.lat)` / `parseFloat(v.lng)`)
- 좌표 6자리 표시 이미 line 288-292에 구현

### 3-3. 통합 방식 (신규 컴포넌트 불필요 — v1 정정)

**v1 폐기**: AssetLocationField 신규 컴포넌트 제안. 기존 AddressSearch onChange 확장만으로 충분.

PropertyValuationForm onChange 콜백 확장:
```tsx
<AddressSearch
  value={addrValue}
  onChange={(v) => {
    setAddrValue(v);  // local state 유지 (C2 수정 후 폐기 예정)
    const parts = [v.road || v.jibun, v.building, v.detail].filter(Boolean);
    const auto = parts.join(" ").trim();

    // 신규: EstateItem에 좌표 저장 (UI-E1 핵심)
    const latLng =
      v.lat && v.lng
        ? { lat: parseFloat(v.lat), lng: parseFloat(v.lng) }
        : undefined;

    const update: Partial<EstateItem> = {};
    if (auto) update.name = auto;
    if (latLng) {
      // farmingCategory 기반 분기
      const isFishing =
        item.farmingCategory === "fishing_vessel" ||
        item.farmingCategory === "fishing_right";
      if (isFishing) update.fishingAnchorLatLng = latLng;
      else update.estateLatLng = latLng;
    }
    if (Object.keys(update).length > 0) set(update);
  }}
/>
```

**조건부 분기**:
- `farmingCategory ∈ LAND_BASED`: `estateLatLng` 저장
- `farmingCategory ∈ FISHING_BASED`: `fishingAnchorLatLng` 저장
- `farmingCategory === "corporate_stock"` 또는 undefined: 좌표 미저장 (corporate는 거주 요건 무관)

### 3-4. 통합 지점 (실측 후 정정)

**PropertyValuationForm**: 기존 AddressSearch (line 163) — real_estate_* 카테고리만 노출. 어선·어업권은 별도 위젯 필요 (`other` 카테고리에서는 AddressSearch 미렌더).

**StockValuationForm**: AddressSearch 미사용 — corporate_stock 거주 요건 무관이므로 좌표 입력 위젯 불필요 (C3 발견 반영).

**어선·어업권 좌표 입력** (PropertyValuationForm 확장 필요):
- 현재는 farmingCategory="fishing_vessel"이어도 category="other"이면 AddressSearch 미렌더
- 분기 조건 확장: `(isRealEstate || isFishing) && farmingCategory가 좌표 필요 카테고리`
- 또는 별도 위젯 (FishingAnchorAddressField) 신규

### 3-5. anchor (E1-1~6 — v2 추가)
- **E1-1**: farmingCategory 미선택 → AddressSearch onChange 시 좌표 미저장
- **E1-2**: farmingCategory="farmland" → AddressSearch 선택 시 estateLatLng 저장 + fishingAnchorLatLng 미변경
- **E1-3**: farmingCategory="fishing_vessel" → fishingAnchorLatLng 저장 + estateLatLng 미변경
- **E1-4**: farmingCategory="corporate_stock" → 좌표 미저장 (거주 요건 무관)
- **E1-5**: AddressSearch onChange — lat/lng 빈 문자열일 때 좌표 미저장 (parseFloat NaN 방지)
- **E1-6 (신규)**: sessionStorage 마이그레이션 — 기존 폼은 좌표 undefined로 호환 (N1 대응)

### 3-6. 위험 요소
- Vworld API 응답에 좌표 미포함 시 별도 좌표 조회 API 호출 필요 → API 키 추가 환경변수
- 사용자 직접 좌표 입력 시 WGS84 vs 한국 좌표계(GRS80·UTM-K) 혼동 → label에 "WGS84 (위도·경도)" 명시
- 모바일 UX — 모달 vs 인라인 선택

---

## 4. UI-E2 — FarmingEligibilitySection 거주지 좌표 + Haversine 미리보기

### 4-1. 현재 상태
- `FarmingInheritanceInput.decedentResidenceLatLng`·`heirResidenceLatLng` 필드 정의 완료
- `checkFarmingResidenceCompliance` 헬퍼 완성 (`dd7e2fc`)
- **FarmingEligibilitySection이 좌표 입력 위젯·미리보기 노출 안 함** — 통합 필요

### 4-2. UI 영역 신규

`FarmingEligibilitySection.tsx`에 거주지 요건 ToggleCard 직후 좌표 입력 + 미리보기 카드 추가:

```tsx
{farming.type === "personal" && (
  <>
    <ToggleCard title="거주지 충족" ... />  {/* 기존 */}

    {/* 신규: 좌표 자동 검증 */}
    <div className="rounded-md border border-emerald-200 bg-emerald-50/30 p-3 space-y-2">
      <p className="text-xs font-semibold">📍 거주지 좌표 자동 검증 (선택)</p>
      <AddressSearchField
        label="피상속인 주소"
        value={farming.decedentResidenceLatLng}
        onChange={(latLng) => update({ decedentResidenceLatLng: latLng })}
      />
      <AddressSearchField
        label="상속인 주소"
        value={farming.heirResidenceLatLng}
        onChange={(latLng) => update({ heirResidenceLatLng: latLng })}
      />
      {residenceCheck && (
        <ResidenceCheckPreviewCard result={residenceCheck} />
      )}
    </div>
  </>
)}
```

`residenceCheck`는 useMemo:
```tsx
const residenceCheck = useMemo(
  () => checkFarmingResidenceCompliance(estateItems, farming),
  [estateItems, farming],
);
```

### 4-3. ResidenceCheckPreviewCard 분기 (v2 — autoMet 별도 노출)

옵션 A 정책 반영: 자동 결과(`autoMet`)는 안내용. 사용자 명시(`met`)는 별도 토글.

| decedentAutoMet / heirAutoMet | 라벨 |
|---|---|
| true / true (좌표 입력 + 양쪽 ≤30km) | emerald "🤖 자동 검증 — 피상속인 N.Nkm / 상속인 N.Nkm (둘 다 30km 이내)" |
| true / false | amber "🤖 자동 검증 — 상속인만 30km 초과 (N.Nkm)" |
| false / true | amber "🤖 자동 검증 — 피상속인만 30km 초과 (N.Nkm)" |
| false / false | rose "🤖 자동 검증 — 양쪽 30km 초과" |
| null / * | gray "ⓘ 좌표 또는 자산 위치 미입력 — 자동 검증 보류" |

**모순 안내 (met vs autoMet 차이)**:
- met=true + autoMet=false → 노란 경고 "⚠️ 사용자 명시 통과 / 자동 검증 30km 초과 — 시·군·구·연접 거주 사유 명확화 권장"
- met=false + autoMet=true → 파란 안내 "ℹ️ 자동 검증 30km 이내 — 거주지 충족 가능성 검토 권장"

### 4-4. 사용자 토글 정책 (옵션 A — v2 정정)

**v1 폐기**: "자동 결과를 사용자 boolean 토글에 미리채움" 정책.

**v2 정책**:
- 토글은 명시 사용자 입력만 — 자동 변경 없음
- ResidenceCheckPreviewCard에 met·autoMet 비교 노출
- 사용자가 자동 결과 보고 직접 토글 조작
- mirror-pattern 위반 0건 — useEffect 미사용

**근거**: 비판 검토 M3 + farming-residence-check.ts 옵션 A 정책 (`1e915f1`)

### 4-5. anchor (E2-1~9 — v2 확장)
- **E2-1**: personal 모드 → 거주지 좌표 입력 영역 노출
- **E2-2**: corporate 모드 → 거주지 좌표 입력 영역 미렌더 (법인 영농 거주 요건 없음)
- **E2-3**: 양쪽 autoMet=true → emerald "🤖 자동 검증" 카드
- **E2-4**: 한쪽 autoMet=false → amber 카드
- **E2-5**: 양쪽 autoMet=false → rose 카드
- **E2-6**: autoMet=null (좌표 미입력) → gray 보류 안내
- **E2-7 (옵션 A)**: met=true + autoMet=false → 노란 경고 "⚠️ 사용자 명시 통과 / 자동 30km 초과"
- **E2-8 (옵션 A 신규)**: met=false + autoMet=true → 파란 안내 "ℹ️ 자동 30km 이내 — 충족 검토 권장"
- **E2-9 (옵션 A 신규)**: 사용자 토글 조작 시 자동값 변경 안 됨 (mirror-pattern 검증)

### 4-6. 위험 요소
- 자동 검증 결과를 사용자 boolean 토글에 미리채움 vs 사용자 명시 우선 정책 충돌 — **명시 우선** 유지 (이미 `checkFarmingResidenceCompliance`에 구현)
- 사용자 명시 false + 자동 true — `checkFarmingResidenceCompliance` 결과는 true (자동 우선). UI는 "🤖 자동 검증 통과 (사용자 명시 false 무시)" 안내
- 행정구역 OR 조건 미적용 — "30km 초과" 카드에 "단, 시·군·구 또는 연접 시·군·구 거주 시 사용자 직접 boolean 체크 권장" 안내

---

## 5. 14지점 동기화 점검 (v2 — grep 확정)

| # | 지점 | UI-C | UI-E1 | UI-E2 |
|---|---|---|---|---|
| ① 폼 상태 타입 | EstateItem.corporate* / latLng / FarmingInput.latLng | ✅ 이미 추가 | ✅ 이미 추가 | ✅ 이미 추가 |
| ② initial value | undefined (optional) | ✅ 자동 | ✅ 자동 | ✅ 자동 |
| ③ normalize fallback | undefined 그대로 | ✅ 자동 | ✅ 자동 | ✅ 자동 |
| ④ API 변환 (`lib/calc/inheritance-tax-api.ts`) | 객체 spread | ✅ grep 후 확정 | ✅ grep 후 확정 | ✅ grep 후 확정 |
| ⑤ UI 입력 위젯 | **신규 통합** | **AddressSearch 확장** | **신규 카드** |
| ⑥ 사이드바 합계 | 무관 | 무관 | 무관 |
| ⑦ 결과 카드 | **표시 의무** (N2 정정) | **표시 선택** | **표시 선택** |
| ⑧ Validation (`lib/calc/inheritance-tax-validate.ts`) | nonnegative number | ✅ grep 후 확정 | ✅ grep 후 확정 | ✅ grep 후 확정 |
| ⑨~⑭ Zod·body·route | ✅ 이미 추가 | ✅ 이미 추가 | ✅ 이미 추가 |

### 5-1. grep 사전 의무 (UI 진입 직전 자가 점검)

```bash
# ④ API 변환 — 신규 필드가 자동 spread되는지
grep -n "corporateNonBusinessAssets\|corporateTotalAssets\|estateLatLng\|fishingAnchorLatLng\|decedentResidenceLatLng\|heirResidenceLatLng" lib/calc/ -r

# ⑧ Validation
grep -n "corporateNonBusinessAssets\|estateLatLng" lib/calc/inheritance-tax-validate.ts 2>/dev/null
```

미발견 시 명시 추가 필요. 발견 시 spread만으로 자동 통과 확인.

### 5-2. 결과 카드 표시 정책 (N2 정정)

**UI-C 의무 표시** (v1 "선택적" 폐기):
- corporate_stock + 사업무관자산 차감 적용 시 결과 카드에 다음 표시 강제:
  - "차감 비율 N.NN% (사업무관자산 합 N억 / 총자산 N억)"
  - corporate_stock 자산 평가가액 옆 "(차감 전 N억 → 차감 후 N억)" 비교

**UI-E2 선택 표시**:
- met·autoMet 모순 시에만 결과 카드 안내 카드 추가 (필수 아님)

---

## 6. 진행 순서 (v2)

```
UI-C (단독, 1~2h) — 가장 안전한 시작점
  ↓
C2 좌표 휘발 버그 수정 (단독, 2~3h) — UI-E1 선행 필수
  ↓
UI-E1 (C2 의존, 1~2h) — AddressSearch onChange 확장 (신규 컴포넌트 0)
  ↓
UI-E2 (UI-E1 의존, 3~4h) — ResidenceCheckPreviewCard 옵션 A 모순 안내 분기
  ↓
UI-E3 (UI-E2 통합, 1~2h) — met·autoMet 비교 안내 카드
```

**총 8~13시간** (v1 8~12h + C2 2~3h 신규).

### v1 vs v2 시간 비교
- v1 UI-E1: 3~4h → v2: 1~2h (신규 컴포넌트 폐기)
- v1: 없음 → v2 C2: 2~3h (좌표 휘발 버그 수정 신규)
- 순증: ~2h

---

## 7. Definition of Done (v2)

### 7-1. PR별 체크리스트
- [ ] **UI-C**: PropertyValuationForm·StockValuationForm 양쪽 통합 + FNB-UI 3 anchor PASS + 결과 카드 차감 비율 표시 (N2)
- [ ] **C2**: PropertyValuationForm `addrValue` local state 폐기 → EstateItem.estateAddress(신규) + estateLatLng 직접 저장 + sessionStorage 호환 anchor
- [ ] **UI-E1**: AddressSearch onChange 확장 + farmingCategory 분기 + E1 6 anchor PASS
- [ ] **UI-E2**: FarmingEligibilitySection 좌표 입력 + ResidenceCheckPreviewCard 5분기 + E2 9 anchor PASS
- [ ] **UI-E3**: met·autoMet 비교 안내 카드 (mirror-pattern 위반 0건 — useEffect 미사용 확인)
- [ ] TS 0건 / 회귀 통과
- [ ] **`inheritance-gift-tax-ui-senior` 에이전트 호출** (N3, Plan·Design 단계)
- [ ] 14지점 ④⑧ grep 사전 확정 (m5)

### 7-2. 브라우저 수동 확인 7단계 (N4 정정)

1. `npm run dev` 후 `/calc/inheritance-tax` 진입
2. Step1 영농 자산 1건 추가 (farmingCategory="farmland")
3. AddressSearch로 자산 주소 검색 → `estateLatLng` 자동 저장 확인 (DevTools React 상태)
4. Step4 영농상속공제 토글 ON → 거주지 좌표 입력
5. 자동 검증 미리보기 카드 노출 확인 (5분기: emerald/amber/rose/gray + 모순 안내)
6. F5 새로고침 → 좌표·미리보기 유지 확인 (sessionStorage 호환)
7. 결과 페이지 → 사업무관자산 차감 비율 표시 확인 (corporate_stock 시)
8. (옵션 A 검증) 자동 검증 통과 + 사용자 토글 false → 결과 boolean false 유지 확인

---

## 8. 위험 요소 종합

1. **Vworld API 좌표 응답 형식 불명** — UI-E1 사전 조사 필수. 미응답 시 별도 좌표 조회 API 또는 사용자 직접 입력 fallback
2. **자동 검증 결과 vs 사용자 boolean 동기화** — mirror-pattern 위반 위험. 안내 카드 + 명시 사용자 입력 우선 정책 유지
3. **800줄 정책** — FarmingEligibilitySection 현재 375줄. 좌표 입력 + 미리보기 추가 시 분할 신호. AddressSearchField·ResidenceCheckPreviewCard sibling 컴포넌트 추출 권장
4. **모바일 Vworld 모달 UX** — 데스크톱과 다른 인터랙션 필요 (기존 `address-search.tsx` 패턴 따름)
5. **WGS84 좌표계 명시** — 사용자 직접 입력 시 GRS80·UTM-K 혼동 차단

---

## 9. 후속 (본 계획서 범위 외)

- **행정구역 OR 조건** (시·군·구·연접 시·군·구) — 별도 PRD: `inheritance-farming-administrative-district.prd.md`
- **자동 검증 결과를 엔진 입력에 통합** — 현재는 UI 안내만. evaluateFarmingEligibility에 좌표 기반 자동 판정 적용 시 신규 PR
