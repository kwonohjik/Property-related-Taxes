# NBL F2 Phase B — UI 디자인 (별표4·5·6호·복잡비고)

> 계획: `gap-f2b-annex-phase-b.plan.md` · 엔진: `nbl-f2-phase-b.engine.design.md`. UI 진입점 `components/calc/transfer/nbl/OtherLandDetailSection.tsx`(Phase A sports/reserve 블록 확장). 클라이언트 8지점(①~⑧) + 위젯 명세.

---

## 1. 사용자 시나리오

1. 기타토지(§168의11①) → relatedBusinessType="sports"(체육시설) 선택.
2. **체육시설 유형** 선택(직장운동경기부=별표3 / 운동경기업=별표4 / 종업원=별표5).
   - 직장·운동경기업 → 종목 Select → 기준면적 자동.
   - 종업원 → 종업원수 입력 + 보유 시설 다중선택 → 기준면적 자동 합산.
3. relatedBusinessType="resort"(휴양시설업 6호) → 옥외방목장·부설주차장·건축물 부속토지 3요소 입력 → 합산.
4. 미선택/복잡 산정 → 기준면적 직접입력(`standardAreaLimit`) fallback.
5. landArea > 자동 기준면적 → 결과화면에 초과분 부분안분 중과(F3) 표시.

---

## 2. 위젯 명세 (ASCII)

### 2.1 체육시설(1호) — sports 블록 확장

```
┌─ 체육시설 (1호) ───────────────────────────────────┐
│ 체육시설 유형                      [§83의4①/③/④ 🔗] │
│  (●직장운동경기부  ○운동경기업  ○종업원)            │  ← RadioCardGroup 3옵션
│                                                      │
│ ▸ 직장운동경기부 / 운동경기업 선택 시                │
│   체육시설 종목 (별표3 / 별표4)   [▼ 축구장 ───────] │  ← Select(유형별 테이블)
│     · 테니스·연식정구 → 선수 수   [______] 인         │  ← B-2 조건부 DecimalInput
│     · (직장운동경기부) 실내 미설치 [○ 토글]          │  ← B-2 ToggleCard(workplace만)
│                                                      │
│ ▸ 종업원 선택 시                                     │
│   종업원 수                       [______] 인         │  ← DecimalInput
│   보유 시설 (다중)                                   │
│    [☑ 운동장] [☑ 코트] [☐ 실내]                      │  ← ToggleCard 다중(chip)
│                                                      │
│ ─ 미선택 시 기준면적 직접입력      [______] ㎡        │  ← fallback
└──────────────────────────────────────────────────────┘
```

> ⓘ 종목합산(`sportsExtraEvents` 다중)·실내미설치 위젯은 **B-2 후속** — B-1은 단일 종목 + 선수가산까지.

### 2.2 휴양시설업(6호) — resort 블록 확장 (§83의4⑫ 3요소)

```
┌─ 휴양시설업 (6호)                       [§83의4⑫ 🔗] ┐
│ 옥외 방목장·식물원 면적           [______] ㎡         │  ← 1호
│ 부설주차장 설치기준면적           [______] ㎡ (×2)    │  ← 2호 (엔진 ×2)
│ 건축물 부속토지 면적              [______] ㎡         │  ← 3호 (용도지역별 배율 적용 후·직접입력)
│   ⓘ 용도지역별 배율(지방세법 §101②)은 직접 적용     │  ← violet 안내
│ → 합산 = 옥외 + 주차×2 + 건축물 부속토지             │
│ ─ 미입력 시 기준면적 직접입력     [______] ㎡         │  ← fallback
└──────────────────────────────────────────────────────┘
```

---

## 3. 클라이언트 14지점 (①~⑧)

| # | 지점 | 작업 |
|---|---|---|
| ① | `calc-wizard-asset.ts` AssetForm | (B-1) `nblOtherSportsCategory:string`·`nblOtherEmployeeCount:string`·`nblOtherEmployeeFacilityKinds:string[]` (B-2) `nblOtherSportsPlayerCount:string`·`nblOtherSportsExtraEvents:string[]`·`nblOtherIndoorNotInstalled:boolean` (B-3) `nblOtherResortOutdoorArea:string`·`nblOtherResortParkingStdArea:string`·`nblOtherResortBuildingArea:string` |
| ② | `calc-wizard-asset-factory.ts` | 기본 `"workplace"`·`""`·`[]`·`""`·`[]`·`false`·`""`·`""`·`""` (800줄 경계 — 압축 1줄) |
| ③ | `calc-wizard-asset-nbl.ts`·`-nbl-other.ts` `NblOtherFormSlice` | 동일 default 미러 |
| ④ | `transfer-tax-api.ts` prefix-pick `k.startsWith("nbl")` | 자동 — 배열 필드 직렬화 확인 |
| ⑤ | `OtherLandDetailSection.tsx` | §2 위젯(유형 Radio·종목 Select·종업원수·시설 ToggleCard 다중·선수수·resort 3필드)·유형별 legalBasis·LawArticleModal |
| ⑥ | 사이드바 | N/A(면적 입력은 합계 비대상) |
| ⑦ | `NonBusinessLandResultCard.tsx` | 자동산출 기준면적 + 유형별 별표 근거(별표3/4/5)·legalBasis(§83의4①/③/④) |
| ⑧ | `transfer-tax-validate-asset.ts` | sports+employee→종업원수·시설 필수 / workplace·business→종목 OR standardAreaLimit / resort→3요소 OR standardAreaLimit (3중 fallback 동기화). ⚠️현 `needsStandardArea`(`:453` = parking_attached‖resort)에서 **resort 제거**(3요소 입력 시 standardAreaLimit 불요) |

> ⑨⑩⑪ N/A(enum·acq fallback 무관). ⑫⑬⑭은 엔진 설계 §4.

---

## 4. 컴포넌트 패턴 (Phase A 교훈 반영 — 강제)

- **BaseUI Select `onValueChange` value = `string | null`**: 빈 SelectItem 금지 → `__clear` sentinel + null 가드. `onValueChange={(v) => onAssetChange({ nblOtherSportsCategory: v && v !== "__clear" ? v : "workplace" })}` (category는 기본 workplace 복귀). `SelectValue`는 typed string label 변수.
- **ToggleCard testId prop 없음** → `<div data-testid={...}>` 래핑(Phase A reserve 시설과 동일).
- **체육시설 유형 default "workplace"** 3중 일치(factory·normalize·UI display fallback) — memory `feedback_store_default_vs_ui_display_fallback`. `value={asset.nblOtherSportsCategory || "workplace"}`.
- **DecimalInput**(종업원수·선수수·면적) — `parseDecimal`, CurrencyInput 금지(memory `feedback_decimal_input`). select-on-focus 전역 적용.
- **ToggleCard/RadioCardGroup 필수**(native 금지), OFF도 tone 유지. 색상 카드 + 번호(memory `feedback_section_card_numbering`).
- **3-state 다중 토글**(`employeeFacilityKinds`·`sportsExtraEvents`): `string[]` 빈배열=미선택, length>0 derive 금지(memory `feedback_three_state_optional_mode_toggle`는 undefined/[] 구분 — 본 필드는 항상 배열, 빈=미선택).

---

## 5. testid 매핑 (E2E)

| 위젯 | testid |
|---|---|
| 체육시설 유형 Radio | `nbl-other-sports-category-{workplace,business,employee}` |
| 종목 Select | `nbl-other-sports-facility`(기존 Phase A 재사용) |
| 종업원수 | `nbl-other-employee-count` |
| 보유 시설(다중) | `nbl-other-employee-kind-{field,court,indoor}` (div-wrap) |
| 선수 수 | `nbl-other-sports-player-count` |
| 실내 미설치 | `nbl-other-indoor-not-installed` (div-wrap) |
| resort 옥외 | `nbl-other-resort-outdoor` |
| resort 주차 | `nbl-other-resort-parking` |
| resort 건축물 | `nbl-other-resort-building` |

---

## 6. 결과카드 (⑦) 표시

- 자동산출 기준면적 + **유형별 별표 근거**: 직장운동경기부=별표3(§83의4①)·운동경기업=별표4(§83의4③)·종업원=별표5(§83의4④)·휴양=별표 없음(§83의4⑫ 3요소).
- AREA_BASIS(OtherLandDetailSection:46) sports legalBasis 단일(§168의11①1호)을 **유형별 분기** → `LawArticleModal`.
- landArea > 기준면적 시 F3 부분안분 중과 안내(기존 §168의11⑤⑥ 문구 재사용).

---

## 7. E2E 시나리오 (anchor 대응)

| E2E | 경로 | 검증 |
|---|---|---|
| E1 | sports·운동경기업·축구장 | 기준면적 16,500 결과 표시 |
| E2 | sports·종업원·300인·운동장 | 2,800 |
| E3 | sports·종업원·40인 | 970(코트강제) |
| E4 | resort·3요소 입력 | 합산 9,000 |
| E5 | 유형 미선택·직접입력 | fallback 회귀 |

> E2E 함정(Phase A): 계산/다음 전 모달·Select backdrop 닫기 · `getByLabel` 오매칭 시 `getByRole("textbox")` 한정 · 행 count 보존 · **worktree는 `E2E_PORT=3100` 필수**(memory `feedback_e2e_worktree_port_isolation`).
