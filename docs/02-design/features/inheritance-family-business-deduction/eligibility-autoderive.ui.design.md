# 가업상속공제 요건 자동판정 (eligibility-autoderive) — UI 설계

> 계획서: `docs/00-pm/inheritance-family-business-eligibility-autoderive.plan.md`
> 엔진 설계: `eligibility-autoderive.engine.design.md`
> 대상 컴포넌트: `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx`(현 640줄) + 신규 sub.

## 사용자 시나리오

1. 사용자가 가업상속공제 토글 ON → 요건 입력 영역 활성.
2. 기본정보(개업일·기업규모) 입력 → **영위연수 제안값** 표시(operatingYears 빈칸 시 채움 제안).
3. **가업상속인 선택**(heirs RadioCardGroup) → 선택 Heir의 `birthDate`로 **18세 자동판정**(✓/✗ + 만 N세).
4. 종사시작일·임원취임일·대표취임일 입력 → 각 요건 **자동판정 미리보기**(✓충족 + 산식 / ✗미충족 / 입력필요).
5. 자동판정이 실제와 다른 예외 케이스만 **접힌 "수동 보정" 펼쳐** override.
6. 결과화면에 가업상속인명·만나이·영위연수·신고기한·요건별 판정근거 노출.

핵심: **토글이 1차가 아니라 자동판정이 1차** — 사용자 불만("형식적 토글") 해소.

---

## 화면 명세 (섹션 색상카드+번호, [[feedback_section_card_numbering]])

| 섹션 | tone | 내용 | 신규 위젯 |
|---|---|---|---|
| ① 가업 기본 | amber | 사업유형·기업규모·별표업종(기존) + 개업일(DateInput) + **영위연수 제안**(operatingYears DecimalInput + 제안 안내) | 영위연수 제안 카드 |
| ② 피상속인 요건 | amber | (Phase 1) 대표이사 종사·지분은 기존 ToggleCard 유지. (Phase 2에서 날짜화) | — |
| ③ 가업상속인 지정 | sky | `FamilyBusinessHeirSelector`(heirs RadioCardGroup, 1명 자동선택, corporate 차단) → birthDate 연동. 없으면 heirBirthDate DateInput | 신규 컴포넌트 |
| ④ 상속인 요건 | sky | **배우자 간주 토글(상단)** + 18세·2년종사·신고기한임원·2년내대표 각 **자동판정 미리보기 + 접힌 수동보정** | `FbAutoCheckPreviewCard` ×4 + 날짜 입력 3종 |
| ⑤ 안내·동의 | amber | 200%가드·사업무관자산·사후관리·조세포탈(기존 유지) | — |

### 표시전용→계산 승격 매핑
- `openingDate`(기존 DateInput) → 영위연수 제안 입력으로 승격(중복 입력 없이 단일 필드).
- `heirOfficerAppointDate`(기존 DateInput) → 다목 신고기한 비교로 승격.
- `heirEngagementPeriod`(string FbTextField) → `heirEngagementStartDate`(DateInput) 신규로 대체. string은 신고서 호환 위해 유지(비표시).
- 신규: `heirCEOAppointDate`(DateInput, 라목 대표이사 취임). 신고서(besshi-data.ts) "라. 대표이사 취임일"에도 매핑.

> **배우자 간주 처리**: 기존 `spouseFulfillsRequirements` 토글(FamilyBusinessEligibilitySection.tsx:388) ON 시 §15③2호 후단 간주 → ④ 4요건 미리보기·입력 **disabled**(기존 disabled 패턴 유지). 자동판정도 skip(엔진 evaluator가 spouse-skip).

---

## 자동판정 미리보기 카드 (`FbAutoCheckPreviewCard` 신규, ~100줄)

props: `{ autoMet: boolean | null, override: boolean | undefined, formula: string, lawLabel: string }`

영농 `ResidenceCheckPreviewCard` 패턴 차용하되 **자동이 1차**. 4분기 정적 tone([[feedback_tailwind_static_tone_mapping]]):

| 상태 | tone | 표시 |
|---|---|---|
| 자동 충족 | emerald | `✓ 충족 — {formula}` (예: "만 18세 (2006-03-01생, 상속 2024-05-10)") |
| 자동 미충족 | rose | `✗ 미충족 — {formula}` |
| 입력 필요(null) | amber | `{누락 안내}` (예: "종사시작일을 입력하면 자동판정") — **자동 안분 fallback 금지** |
| 자동≠override | sky | `⚠️ 시스템 {auto} → 수동 {override}. 근거서류 보관` |

산식·근거조문 라벨 한국어([[feedback_result_view_korean_formula]]).

**자동값 도출은 `useMemo`만** — store 미러링(useEffect→set) 금지([[feedback_useeffect_store_mirror_forbidden]]). 미리보기는 표시 전용, 실제 판정은 엔진 resolve가 계산 시점에 수행.

---

## 3-state override UX

요건별 레이아웃:
```
[FbAutoCheckPreviewCard]               ← 항상 표시 (자동 1차)
[▼ 수동 보정 (자동과 다른 경우만)]      ← useState 접힘 기본
  [ToggleCard heirIsAdultOverride 등]  ← 펼칠 때만, true/false/undefined(=자동복귀)
```
- override 설정 시 `*Override` 필드에 write. undefined로 되돌리면 자동 복귀.
- 자동≠override 시 sky 불일치 카드 자동 노출.

---

## 가업상속인 지정 (`FamilyBusinessHeirSelector` 신규, ~80줄)

props: `{ heirs: Heir[], heirId?: string, heirBirthDate?: string, deathDate: string, onChange }`
- RadioCardGroup(tone=sky, stack): 각 Heir `name`+`relation`+(birthDate 있으면 만 N세).
- heirs 0명: "상속인을 먼저 등록" 안내. 1명: 자동선택 badge.
- `relation==="corporate"` Heir: 선택지에서 **제외**(가업상속인은 자연인 — §15③2호 가목 18세 등 자연인 요건). 자연인 상속인만 selector 노출.
- 선택 Heir `birthDate` 미입력: `heirBirthDate` DateInput 노출("생년월일 입력 시 18세 자동판정").

---

## prop 스레딩 (`steps.tsx:405`, 워크트리 기준)

```tsx
<FamilyBusinessEligibilitySection
  familyBusiness={form.familyBusiness}
  onChange={(v) => set({ familyBusiness: v })}
  deathDate={form.deathDate}   // 신규 — 미리보기 useMemo(영위연수·신고기한·18세)
  heirs={form.heirs}           // 신규 — 가업상속인 selector
/>
```
`heirId`·`heirBirthDate`는 `familyBusiness` 객체 내부 필드 — UI는 `familyBusiness.heirId`로 read/write(별도 store 필드 불필요, 통째 전달 흐름 유지).

---

## 동기화 지점 (UI측)

| # | 지점 | 작업 |
|---|---|---|
| ① 폼상태 | `EMPTY_FB`(FamilyBusinessEligibilitySection.tsx:48) | heirId·heirBirthDate·heirEngagementStartDate·heirCEOAppointDate·*Override 신규 `undefined` |
| ⑤ 위젯 | 본 문서 화면명세 | DateInput·DecimalInput·RadioCardGroup + FbAutoCheckPreviewCard + FamilyBusinessHeirSelector |
| ⑥ 사이드바 | `capPreview` 기존(line 584) | 변경 없음(영위연수 제안이 operatingYears 채우면 기존 capPreview 동작) |
| ⑦ 결과카드 | `FamilyBusinessDetailCard` / InheritanceTaxResultView | detail.resolvedRequirements(filingDeadline·source) + 가업상속인명(heirs에서 heirId→name resolve, **id 직접노출 금지** [[feedback_no_internal_id_in_result]]) |
| ⑧ validate | `inheritance-validate.ts` | 날짜 정합성: 종사시작>상속개시·재직 시작>종료·취임일>신고기한+2년 차단. heirId 미지정+heirs 1명=자동선택(경고 아님). `calcInheritanceFilingDeadline` UI·validate 동일 사용 |

> ⚠️ 엔진측 ⑫ Zod(property-valuation-input.ts:656~681 신규 필드)는 엔진 시니어 선처리 — 누락 시 침묵 strip(UI 통과해도 엔진 미도달).

---

## 800줄 분할 (현 640줄 → 추정 1,100+)

```
FamilyBusinessEligibilitySection.tsx  (오케스트레이터 ~280줄, 섹션①②⑤ 인라인 + Dialog)
└ family-business/
  ├ FamilyBusinessHeirSelector.tsx     (섹션③ ~80줄)
  ├ FbHeirRequirementsSection.tsx      (섹션④ 4요건 ~230줄)
  └ FbAutoCheckPreviewCard.tsx         (미리보기 공통 ~100줄)
```
re-export 보존([[feedback_800line_split_export_preservation]]) — `steps.tsx:20` import 무변경.

testid: `fb-heir-selector`·`fb-preview-adult`·`fb-preview-officer`·`fb-preview-ceo`·`fb-preview-engagement`·`fb-override-*`.

---

## 하위호환

- 기존 boolean 토글로 입력하던 데이터: legacy fallback(resolve 우선순위 마지막) → 기존 동작 보존.
- 신규 필드 전부 optional → sessionStorage 기존 데이터 자연 `undefined`.
- 마이그레이션 코드 불필요.
