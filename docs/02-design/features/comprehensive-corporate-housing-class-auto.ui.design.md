# 종합부동산세 법인 주택분 §9②1·2호 요건 자동판정 — UI 설계

> 계획서: `docs/01-plan/features/comprehensive-corporate-housing-class-auto.plan.md`
> 엔진 설계: `comprehensive-corporate-housing-class-auto.engine.design.md`
> 핵심: 3-way §9② class 수동 라디오(`Step1Basic.tsx:168-206`) → **세부유형 Select(9종) + 조건 RadioCardGroup + 실시간 도출 배지**. 도출은 `resolveCorporateHousingClass()` import(이중진실 금지).

## 1. 사용자 시나리오
1. 납세의무자 [법인] 선택 → 세부유형 Select 노출(기본 `general_corp` = 그 외 일반법인, D-4).
2. 세부유형 선택:
   - 무조건 1호(공공주택사업자·주택조합·정비사업·종중) → 즉시 §9②1호 배지.
   - 조건부(민간건설임대·도시개발·사회적기업·공익법인) → [충족]/[미충족] RadioCardGroup 노출(무기본). 미선택 시 계산 차단.
   - general_corp → §9②3호 배지.
3. 조건 응답 → 실시간 도출 배지(§9②1/2/3호 + 세율·상한 요약) + §9②1·2호면 §4의4② 서류제출 안내.
4. 계산 → 결과뷰가 도출 class(`corporateHousingClass`) 기준 배지·산식 표시.

## 2. 위젯 변경

### 2.1 `Step1Basic.tsx` — 법인 세부유형 native `<select>` (현행 168-195 라디오 대체)
> **Do 환류**: 설계는 shadcn `Select`였으나 **native `<select>`** 로 구현. 이 계산기의 기존 드롭다운(PropertyListInput `exclusionType`·StandardPriceInput)이 전부 native `<select>` → 일관성 + E2E `selectOption`/`:has(option[value])` 패턴(검증됨). 드롭다운은 toggle/radio 아님 → "native 신규 금지" 정책 무관(exclusionType 선례).
```tsx
// 현행: corporate_special/general/public 3-way RadioCardGroup → CORP_TYPE_OPTIONS(9종) 모듈 상수
<label className="text-xs font-semibold text-violet-800">법인 세부 유형 *</label>
<select aria-label="법인 세부 유형"
        value={formData.corporateHousingType}
        onChange={(e) => updateFormData({ corporateHousingType: e.target.value as CorporateHousingType })}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
  {CORP_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
</select>
// CORP_TYPE_OPTIONS: public_housing_operator(§4의4①1호) … general_corp(§9②3호) 9종
```
- **Select 채택 근거(U4)**: 세부유형 9종 → RadioCardGroup stack은 세로 과다. shadcn `Select`(비-native, 프로젝트 기존 사용 — `feedback_select_component`)로 컴팩트. `SelectTrigger aria-label` 명시(SelectValue 단독 금지). 기본 `general_corp`(D-4).

### 2.2 `Step1Basic.tsx` — 조건부 요건 RadioCardGroup (신규, 조건부 유형일 때만)
```tsx
const reqKey = requiredCorporateReqKey(formData.corporateHousingType ?? "general_corp");
{reqKey && (
  <RadioCardGroup name="corpReq" tone="violet" layout="inline"
    value={formData[reqKey] === undefined ? "" : formData[reqKey] ? "met" : "unmet"}
    onChange={(v) => updateFormData({ [reqKey]: v === "met" })}
    options={[
      { value: "met",   label: "충족", description: REQ_LABEL[reqKey].met },
      { value: "unmet", label: "미충족", description: REQ_LABEL[reqKey].unmet },
    ]} />
)}
// REQ_LABEL: reqKey별 질문·근거 (예 corpHoldsQualifyingRentalHousingOnly →
//   "민간건설임대 2호 이상 + §4의4①5호 가·나·다목 주택만 보유")
```
- **무기본**: `formData[reqKey] === undefined` → value `""`(미선택). 미선택 시 §3.2 최종단계 검증 차단(C-15·U1).
- **미선택 렌더(U2 확인)**: RadioCardGroup은 `has-[:checked]:` CSS 기반 → value="" 시 전 옵션 itemOff(tone 배경 유지·강조 없음). 3-state 정상 지원.
- 2-state ToggleCard 불가(미응답 표현 X) → RadioCardGroup 3-state(P2).
- **computed key(U3)**: `updateFormData({ [reqKey]: v === "met" } as Partial<ComprehensiveFormData>)` (TS 위드닝 캐스트). `formData[reqKey]` 는 reqKey ∈ keyof CorporateHousingReqs ⊂ keyof FormData 로 타입세이프.

### 2.3 `Step1Basic.tsx` — 실시간 도출 배지 (안내 카드 동적화, 현행 196-204 대체)
```tsx
const corporateClass = useMemo(() => isCorporate
  ? resolveCorporateHousingClass(formData.corporateHousingType ?? "general_corp", {
      corpHoldsOnlyPublicPurposeHousing: formData.corpHoldsOnlyPublicPurposeHousing,
      corpHoldsQualifyingRentalHousingOnly: formData.corpHoldsQualifyingRentalHousingOnly,
      corpMeetsSocialEnterpriseRequirements: formData.corpMeetsSocialEnterpriseRequirements,
    })
  : undefined,
  [isCorporate, formData.corporateHousingType, formData.corpHoldsOnlyPublicPurposeHousing,
   formData.corpHoldsQualifyingRentalHousingOnly, formData.corpMeetsSocialEnterpriseRequirements]);
// 미선택(reqKey 있고 미응답)이면 corporateClass 도출되나 배지에 "요건 응답 필요" 우선 표시
```
- 배지 색조: Record 정적 매핑(memory `feedback_tailwind_static_tone_mapping`) — special=violet, general/public=sky.
- 도출은 **useMemo**(store 미러링 금지 — `feedback_useeffect_store_mirror_forbidden`). store엔 corporateHousingType/corp* 만 저장, class 미저장.

## 3. 가시성·검증 정합 (`page.tsx`)

### 3.1 가시성 도출 (현행 :297-301 — 4-value 직접비교 대체)
```ts
import { resolveCorporateHousingClass } from "@/lib/tax-engine/comprehensive-corporate-class";
const corporateClass = (formData.taxpayerType ?? "individual") === "corporate"
  ? resolveCorporateHousingClass(formData.corporateHousingType ?? "general_corp", {
      corpHoldsOnlyPublicPurposeHousing: formData.corpHoldsOnlyPublicPurposeHousing,
      corpHoldsQualifyingRentalHousingOnly: formData.corpHoldsQualifyingRentalHousingOnly,
      corpMeetsSocialEnterpriseRequirements: formData.corpMeetsSocialEnterpriseRequirements,
    })
  : undefined;
const isCorporateSpecial = corporateClass === "corporate_special";   // :299 대체
const isCorporateGeneral = corporateClass === "corporate_general";   // :301 대체
```
- 전년도세액 입력 숨김(:333 `!isCorporateSpecial`)·조정2주택 토글 숨김(:317 `!isCorporateGeneral`)·검증(:530 `!isCorporateSpecial`) **모두 도출 class** 기준(R1).
- 동일 도출을 `useMemo` 헬퍼로 추출 권장(중복 제거).

### 3.2 C-15 조건부 플래그 검증 위치 (U1 — Step1 가드 부재)
`handleNext`(:520-526)는 **step 0~3 무검증**(setStep만) — Step1 next-guard 없음. 기존 검증은 전부 **최종 계산단계 블록**(:528-567, auto-mode·split·multiFamily·landParcels)에 집결. 따라서 C-15도 **동일 블록에 추가**:
```ts
// 최종단계 — 법인 조건부 요건 미응답 차단 (도출 class 직전, ⑧)
if ((formData.taxpayerType ?? "individual") === "corporate") {
  const reqKey = requiredCorporateReqKey(formData.corporateHousingType ?? "general_corp");
  if (reqKey && formData[reqKey] === undefined) {
    setError("법인 세부 유형의 요건 충족 여부를 선택해주세요 (시행령 §4의4).");
    return;
  }
}
```
+ **Zod refine**(comprehensive-input.ts) 동일 차단(서버 백스톱·UI↔validate 정합). Step1 도출 배지는 "요건 응답 필요" **즉시 피드백**만(하드블록은 계산 시점).

## 4. 결과뷰 (`ComprehensiveTaxResultView.tsx` · `HousingPayableTaxCalcCard.tsx`)
- `:190` `:256` `:34` `result.taxpayerType === "corporate_special"` → **`result.corporateHousingClass === "corporate_special"`**.
- `:261-264` 배지(corporate_general/public) → `result.corporateHousingClass` 분기. 라벨 유지(§9②1호 공공주택사업자등 / §9②2호 공익법인등).
- 세부유형 표시: `result.corporateHousingType` → 한글 라벨(CORP_TYPE_LABEL Record). 도출 호 배지 병기.

## 5. ASCII 레이아웃 (Step1Basic 법인 영역)
```
납세의무자 유형   ◉ 개인   ○ 법인
┌─ 법인 (violet) ─────────────────────────────────────────┐
│ 법인 세부 유형 *   [ 공익법인등 (상증법§16)            ▼ ] │
│                                                          │
│ 직접 공익목적사업용 주택만 보유? *   ◉ 충족   ○ 미충족    │  ← 조건부만
│   (충족=§9②1호 일반누진 / 미충족=§9②2호 주택수분기)        │
│                                                          │
│ ┌ 도출 (sky) ──────────────────────────────────────┐    │
│ │ → 적용: §9②1호 (공익목적주택만) — 일반 누진세율     │    │
│ │   기본공제 9억 · 세부담상한 적용                    │    │
│ │ ⓘ §4의4② 보유현황 신고기간 서류 제출 필요           │    │
│ └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```
(general_corp 선택 시 조건 라디오 없음 → 도출 배지 "§9②3호 단일세율·기본공제 0·상한 미적용" violet)

## 6. 동기화 지점 (계획서 §9)
| # | 파일 | 변경 |
|---|---|---|
| ① | comprehensive.types.ts | 2.x 타입 (엔진설계 §2) |
| ② | comprehensive-wizard-store.ts:125,224,432-434 | taxpayerType 2-value + corporateHousingType(기본 general_corp) + corp* 3 initial(undefined) + 레거시 매핑 |
| ③ | comprehensive-api.ts | corporate 아닐 때 corporateHousingType/corp* strip |
| ④ | comprehensive-api.ts:75,424-433 | spread + autoMode 도출 class(헬퍼 import) |
| ⑤ | Step1Basic.tsx:105-206 · page.tsx:297-301,529-530 | §2·§3 |
| ⑥ | (사이드바) | 미영향 |
| ⑦ | ComprehensiveTaxResultView.tsx:34,190,256-264,377 | §4 |
| ⑧ | comprehensive-input.ts:368-370 | enum 2-value + corporateHousingType + corp* refine(C-15) |

## 7. E2E 시나리오 (`e2e/comprehensive-corporate-housing-class.spec.ts`, E2E_PORT=3102)
- **T1 도출(공익법인 1호)**: 법인 → 세부유형 `:has(option[value="public_interest_corp"])` select → 조건 [충족] radio → 도출 배지 "§9②1호" textContent → 계산 → 결과 배지 "§9②2호" 아님 확인.
- **T2 일반법인 3호**: 법인 → general_corp → 조건 라디오 부재 확인 → 계산 → 상한 미적용 안내.
- 셀렉터(R8·P2): Select `:has(option[value=])`, 조건 `[role=radio]`/label(ToggleCard 아님). native nth 금지. 계산 전 모달 없음(법인 경로는 자산 모달 무관).

## 8. STEP 13 검토 반영
- **U1(High)**: C-15 차단 위치를 "Step1 가드"(부재) → **최종 계산단계 블록**(§3.2) + Zod refine. handleNext(:520-526) step 0~3 무검증 실측 반영.
- **U2**: RadioCardGroup value="" 미선택 렌더 — `has-[:checked]:` 기반 정상 지원 확인.
- **U3**: computed key `as Partial<ComprehensiveFormData>` 캐스트.
- **U4**: 9종 Select 채택 근거 명시.

## 9. 검증 에이전트 재점검 반영 (Do 후)
- **ui-engine-sync-checker**: 14 동기화 지점 전부 ✅, High/Medium 0. Low 2건 처리:
  - **L-1 (구현)**: §4 `result.corporateHousingType` 세부유형명을 결과뷰 도출 호 배지에 병기(`CORP_TYPE_LABEL` — corporate_general 7종 구분 표시). corporate_special 배지는 E2E 단언 보존 위해 "§9② 법인 단일세율" 유지.
  - **L-2 (정상 — 변경 없음)**: 레거시 `corporate_public → corpHoldsOnlyPublicPurposeHousing=false` 는 구 선택값("공익법인+공익목적주택만 아님")의 충실 매핑 → 동일 class·세액 보존. undefined로 두면 정상 레거시 사용자를 C-15가 불필요 차단. store 주석으로 명시.
- **bkit:gap-detector**: matchRate **99% PASS**(L-1 구현 후 사실상 100%). Missing 0·Added 0·R1 잔존 0.
