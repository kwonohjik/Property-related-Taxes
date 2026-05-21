# 영농상속공제 UI 통합 작업 계획서

> **대상**: PR-C UI 통합 (사업무관자산) + PR-E UI 통합 (Vworld 좌표 자동 저장 + Haversine 미리보기)
> **작성일**: 2026-05-21
> **선행**: PR-C 엔진 (`873daca`), PR-E 인프라 (`dd7e2fc`) 모두 master 반영 완료
> **참조**: `docs/00-pm/inheritance-farming-remaining-prs.plan.md` §6-5 + §5-5

---

## 1. 범위 분리

| Phase | 범위 | 작업량 | PR 분리 권장 |
|---|---|---|---|
| **UI-C** | `CorporateNonBusinessAssetsSection` PropertyValuationForm·StockValuationForm 카드 내부 통합 | 소(1~2h) | ✅ 단독 PR |
| **UI-E1** | EstateItem.estateLatLng·fishingAnchorLatLng Vworld 주소 검색 자동 저장 | 중(3~4h) | ✅ 단독 PR |
| **UI-E2** | FarmingEligibilitySection 거주지 좌표 입력 + Haversine 자동 미리보기 카드 | 중(3~4h) | ✅ 단독 PR (UI-E1 의존) |
| **UI-E3** | 사용자 override 토글 vs 자동 검증 boolean 동기화 + 결과 카드 노출 | 소(1~2h) | UI-E2 통합 가능 |

**총 4개 PR (또는 UI-E2+UI-E3 통합 시 3개)**.

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
5. (상속 모드) `EstateItemHeirAllocationToggle` — 기존

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

## 3. UI-E1 — Vworld 주소 검색 좌표 자동 저장

### 3-1. 현재 상태
- `EstateItem.estateLatLng`·`fishingAnchorLatLng` 필드 정의 완료 (`dd7e2fc`)
- Vworld API 호출 인프라 기존 존재 (`components/ui/address-search.tsx`)
- **자산 카드에서 주소 검색 결과를 좌표 형식으로 저장하지 않음** — 통합 필요

### 3-2. Vworld API 응답 좌표 구조 사전 조사

**사전 작업**:
```bash
grep -rn "AddressSearch\|address-search\|vworld" components/ lib/ --include="*.ts*" | head -20
```

확인 사항:
- Vworld API 응답에 `x`(경도)·`y`(위도) 좌표 포함 여부
- 현재 `<AddressSearch>` 컴포넌트가 onSelect 콜백에서 좌표 전달하는지

**없으면**: Vworld API 클라이언트 확장 (좌표 반환 형식 추가).

### 3-3. 자산 카드 주소 입력 위젯 신규

`components/calc/inheritance/AssetLocationField.tsx` 신규 (또는 기존 위젯 확장):

```tsx
interface AssetLocationFieldProps {
  item: EstateItem;
  field: "estateLatLng" | "fishingAnchorLatLng";
  label: string;
  hint?: string;
  onUpdate: (updated: EstateItem) => void;
}

// UI:
//  - 주소 검색 버튼 (Vworld 모달)
//  - 좌표 표시 (lat·lng 6자리)
//  - 좌표 직접 입력 옵션 (Vworld 미사용 시)
//  - 초기화 버튼
```

### 3-4. 통합 지점

자산 카드 내부 — `FarmingCategorySection` 직후 (영농 자산일 때만 노출):

```tsx
{item.farmingCategory && LAND_BASED.includes(item.farmingCategory) && (
  <AssetLocationField
    item={item}
    field="estateLatLng"
    label="자산 소재지 (Vworld 주소 검색)"
    hint="농지·초지·산림지·농업용 건축물·염전 — 거주지 30km 자동 검증용"
    onUpdate={updateItem}
  />
)}
{item.farmingCategory && FISHING_BASED.includes(item.farmingCategory) && (
  <AssetLocationField
    item={item}
    field="fishingAnchorLatLng"
    label="선적지·어장 연안 (Vworld)"
    hint="어선·어업권 — 거주지 30km 자동 검증용"
    onUpdate={updateItem}
  />
)}
```

### 3-5. anchor (E1-1~5)
- **E1-1**: farmingCategory 미선택 → AssetLocationField 미렌더
- **E1-2**: farmingCategory="farmland" → "자산 소재지 (Vworld)" 라벨 노출 + fishingAnchorLatLng 위젯 미렌더
- **E1-3**: farmingCategory="fishing_vessel" → "선적지·어장 연안" 라벨 노출 + estateLatLng 위젯 미렌더
- **E1-4**: 주소 검색 결과 onSelect → onUpdate에 latLng 객체 전달
- **E1-5**: 좌표 직접 입력 (lat·lng numeric) → onUpdate 정확 호출

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

### 4-3. ResidenceCheckPreviewCard 분기

| decedentMet / heirMet | minDistance | 카드 |
|---|---|---|
| true / true | 둘 다 ≤30 | emerald "✓ 자동 검증 통과 — 피상속인 N.Nkm / 상속인 N.Nkm" |
| true / false | decedent OK · heir > 30 | amber "⚠️ 상속인만 30km 초과 (N.Nkm)" |
| false / true | decedent > 30 · heir OK | amber "⚠️ 피상속인만 30km 초과 (N.Nkm)" |
| false / false | 둘 다 > 30 | rose "❌ 양쪽 30km 초과" |
| null / * | 좌표 또는 자산 미입력 | gray "ⓘ 좌표 또는 자산 위치 미입력 — 사용자 boolean 그대로" |

### 4-4. 사용자 override 동기화 (UI-E3)

자동 검증 결과를 사용자 boolean 토글에 미리채움:
- 자동 false → 토글 OFF 유지 (사용자 명시 통과 의도가 있을 수 있음)
- 자동 true → 토글 ON 자동 (안내 라벨 "🤖 자동 검증 통과")
- 사용자 명시 변경 시 자동 결과 override 표시 ("⚠️ 자동 검증과 다름")

**구현 주의**:
- mirror-pattern 위반 금지 — useEffect로 자동 결과를 store에 미러링하지 않음
- display fallback만: `value={farming.decedentResidenceMet || autoCheckResult.decedentMet}` ❌ — store 실값과 표시값 불일치 위험
- **권장 패턴**: 별도 표시 안내 카드 + 토글은 명시 사용자 입력만

### 4-5. anchor (E2-1~7)
- **E2-1**: personal 모드 → 거주지 좌표 입력 영역 노출
- **E2-2**: corporate 모드 → 거주지 좌표 입력 영역 미렌더 (법인 영농 거주 요건 없음)
- **E2-3**: 양쪽 좌표 입력 + 자산 좌표 30km 이내 → emerald 카드 노출
- **E2-4**: 한쪽 초과 → amber 카드 노출
- **E2-5**: 양쪽 초과 → rose 카드 노출
- **E2-6**: 좌표 미입력 → gray "사용자 boolean 그대로" 안내
- **E2-7**: 사용자 명시 true + 자동 false → "⚠️ 자동 검증과 다름" 경고

### 4-6. 위험 요소
- 자동 검증 결과를 사용자 boolean 토글에 미리채움 vs 사용자 명시 우선 정책 충돌 — **명시 우선** 유지 (이미 `checkFarmingResidenceCompliance`에 구현)
- 사용자 명시 false + 자동 true — `checkFarmingResidenceCompliance` 결과는 true (자동 우선). UI는 "🤖 자동 검증 통과 (사용자 명시 false 무시)" 안내
- 행정구역 OR 조건 미적용 — "30km 초과" 카드에 "단, 시·군·구 또는 연접 시·군·구 거주 시 사용자 직접 boolean 체크 권장" 안내

---

## 5. 14지점 동기화 점검

| # | 지점 | UI-C | UI-E1 | UI-E2 |
|---|---|---|---|---|
| ① 폼 상태 타입 | EstateItem.corporate* / latLng / FarmingInput.latLng | ✅ 이미 추가 | ✅ 이미 추가 | ✅ 이미 추가 |
| ② initial value | undefined (optional) | ✅ 자동 | ✅ 자동 | ✅ 자동 |
| ③ normalize fallback | undefined 그대로 | ✅ 자동 | ✅ 자동 | ✅ 자동 |
| ④ API 변환 (`lib/calc/*-api.ts`) | 객체 spread | ⚠️ 확인 필요 | ⚠️ 확인 필요 | ⚠️ 확인 필요 |
| ⑤ UI 입력 위젯 | **신규 통합** | **신규** | **신규** |
| ⑥ 사이드바 합계 | 무관 | 무관 | 무관 |
| ⑦ 결과 카드 | 선택적 표시 | 선택적 | 선택적 |
| ⑧ Validation (`lib/calc/*-validate.ts`) | nonnegative number | ⚠️ 확인 | ⚠️ 확인 | ⚠️ 확인 |
| ⑨~⑭ Zod·body·route | ✅ 이미 추가 | ✅ 이미 추가 | ✅ 이미 추가 |

**⚠️ 확인 필요**: `lib/calc/inheritance-tax-api.ts` 또는 동등 모듈에서 estateItem·farming 객체 spread가 신규 필드를 자동 포함하는지 grep 점검.

---

## 6. 진행 순서

```
UI-C (단독, 1~2h)
  ↓
UI-E1 (단독, 3~4h) — AssetLocationField 신규 + Vworld 응답 좌표 조사
  ↓
UI-E2 (UI-E1 의존, 3~4h) — ResidenceCheckPreviewCard 분기 + 좌표 입력
  ↓
UI-E3 (UI-E2 통합, 1~2h) — 사용자 override 안내 카드
```

**총 8~12시간**. UI-E1 사전 조사 단계에서 Vworld API 좌표 응답 형식 확인 결과에 따라 시간 변동 가능.

---

## 7. Definition of Done

- [ ] UI-C: PropertyValuationForm·StockValuationForm 양쪽 통합 + FNB-UI 3 anchor PASS
- [ ] UI-E1: AssetLocationField 신규 + estateLatLng/fishingAnchorLatLng 분기 + E1 5 anchor PASS
- [ ] UI-E2: FarmingEligibilitySection 좌표 입력 + ResidenceCheckPreviewCard 5분기 + E2 7 anchor PASS
- [ ] UI-E3: 사용자 override 안내 카드 + 토글 자동 미리채움 (mirror-pattern 위반 없음)
- [ ] TS 0건 / 회귀 통과
- [ ] 브라우저 수동 확인 — 폼 입력 → 좌표 저장 → 거주지 자동 검증 미리보기 노출
- [ ] sessionStorage 마이그레이션 호환 — 기존 폼은 undefined로 자동 마이그

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
