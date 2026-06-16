# #2a 혼인 합가 주택수 차감 — UI 설계

> 계획서: `docs/00-pm/multi-house-surcharge-2a-marriage.plan.md` / 엔진: `.engine.design.md` / worktree `feat/mh-2a`
> 근거 실측(b886b42b): `MergeDateSection.tsx`(폼 marriageDate) · `HouseEntryEditor.tsx`(per-house 위젯) · `MultiHouseSurchargeDetailCard.tsx`(결과) · `HousesListSection.tsx:272`(factory) · `calc-wizard-asset-nbl.ts:46-`(HouseEntry)
> 범위: 신규 1필드 `isSpouseOwned`(per-house) UI + **기존 UI 텍스트 드리프트 정정**(5년→10년). marriageDate 폼 경로는 기존 재사용.

---

## 1. 사용자 시나리오

1. Step4에서 **혼인합가일 입력**(`MergeDateSection` — 기존). marriageDate 설정 시 "혼인합가 ON".
2. 보유주택 목록(`HousesListSection`)에서 각 주택 편집(`HouseEntryEditor`).
3. **혼인합가 ON + 3주택↑일 때** 각 주택 카드에 **"배우자 단독 보유" chip** 노출 → 배우자 소유 주택 체크.
4. 계산 → 결과(`MultiHouseSurchargeDetailCard`): 3주택은 배우자 주택 "산정 제외(혼인 차감)" 표기 + count 감소, 2주택은 "혼인합가 특례(10년)" 배제 표기.

> **데이터 모델**(실측 `transfer-tax-api-houses.ts:124`): 엔진 `houses[]` = `[sellingHouse(id:"selling", 양도자산 본인), ...otherHouses(보유주택)]`. **UI 목록(`HousesListSection`)은 otherHouses만** — 양도주택은 id "selling"으로 별도 생성(목록에 없음). ∴ chip은 목록 전체에 노출(양도주택 제외 불요), 엔진 `h.id !== sellingHouseId` 필터가 방어. sellingHouse는 isSpouseOwned 생략(본인 소유).

---

## 2. 14 동기화 지점 (UI 레이어 + 확인)

| # | 지점 | 파일:line | 변경 | 비고 |
|---|---|---|---|---|
| ① | 폼 HouseEntry | `lib/stores/calc-wizard-asset-nbl.ts:46-` | `isSpouseOwned?: boolean` 추가(`isUnsoldNewHouse?:56` 인접) | |
| ② | factory | `app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx:272` | `newHouse`에 `isSpouseOwned: false`(`isUnsoldNewHouse:284` 인접) | |
| ③ | normalize | `calc-wizard-migration.ts` | **N/A**(houses 미처리·optional 자동호환) | |
| ④⑬ | API 변환 | `lib/calc/transfer-tax-api-houses.ts`(otherHouses map) | `isSpouseOwned: h.isSpouseOwned` | |
| ⑤ | UI 위젯 | `components/calc/transfer/HouseEntryEditor.tsx:125-155`(특례 chip 행) | 혼인 ON 시 "배우자 단독 보유" chip(ToggleCard variant=chip) | §3 ASCII |
| ⑥ | 사이드바 | — | **N/A**(보유주택 보조입력, 합계 비노출) | |
| ⑦ | 결과 카드 | `components/calc/MultiHouseSurchargeDetailCard.tsx` | (a) `EXCLUDED_REASON_LABEL`(L28-37) `spouse_marriage_subtraction` 추가 (b) `EXCLUSION_REASON_LABEL`(L42) `marriage_merge` **"5년"→"10년"** | §4 |
| ⑧ | validation | `lib/calc/transfer-tax-validate.ts` | 비차단 경고만(§plan4 ⑧) | 차단 금지 |
| ⑫ | Zod | `lib/api/transfer-tax-schema-sub.ts`(houseSchema) | `isSpouseOwned: z.boolean().optional()` | 작성자 grep |
| ⑭ | route | `lib/api/transfer-route-multi-house.ts`(mapHousesToEngine) | `isSpouseOwned: h.isSpouseOwned` (다건 `multi/route.ts:148` 자동) | |
| (별도) | 폼 힌트 정정 | `MergeDateSection.tsx:41` | "혼인합가 후 5년 이내" → 정확 문구(§4) | UI 드리프트 |

---

## 3. 위젯 ASCII

### 3.1 HouseEntryEditor — "배우자 단독 보유" chip (혼인 ON + 비양도주택)

```
특례 구분
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ 소형신축 │ │  미분양  │ │ 인구감소 │ │ 준공후미분양 │   ← 기존(L129-155)
└──────────┘ └──────────┘ └──────────┘ └──────────────┘
┌────────────────────────┐
│ 배우자 단독 보유 주택  │   ← 신규(혼인합가일 입력 시에만 노출)
└────────────────────────┘
  └ ⓘ 혼인 전부터 배우자가 보유하던 주택 (§167의3⑨ 3주택↑ 차감 대상)
```

- 노출 조건: `form.marriageDate` 존재(혼인합가 ON). 목록(otherHouses)엔 양도주택이 없으므로 sellingId 제외 불요. (marriageDate 미설정 시 hidden — `feedback_ui_toggle_auto_visibility_policy` 활성 우선.)
- `HouseEntryEditor`는 `form.marriageDate` 접근 필요 → prop `showSpouseOwned?: boolean`(부모 `HousesListSection`이 `!!form.marriageDate` 계산해 주입). useEffect→store 미러링 금지(`feedback_useeffect_store_mirror_forbidden`).
- 위젯: `<ToggleCard variant="chip" label="배우자 단독 보유 주택" checked={house.isSpouseOwned ?? false} onCheckedChange={(v) => onUpdate({ isSpouseOwned: v })} />`

### 3.2 MergeDateSection (기존 — 힌트만 정정)

```
세대 합가 특례 (선택 — 혼인·동거봉양 합가 시 중과 배제)
  혼인합가일  [ 2021-06-01 ]
  └ 혼인합가 후 2주택은 10년·3주택↑은 5년 이내 양도 시 중과 경감   ← 정정(현재 "5년 이내")
```

---

## 4. UI 텍스트 드리프트 정정 (엔진 5→10 동반)

| 위치 | 현재 | 정정 |
|---|---|---|
| `MergeDateSection.tsx:41` | "혼인합가 후 5년 이내 양도 시 중과 배제" | "혼인합가 후 2주택은 10년·3주택↑은 5년(배우자 주택수 차감) 이내 양도 시 중과 경감" |
| `MultiHouseSurchargeDetailCard.tsx:42` | `marriage_merge: "혼인합가 특례 (5년 이내)"` | `"혼인합가 1세대1주택 의제 (2주택·10년)"` |
| `MultiHouseSurchargeDetailCard.tsx:37영역` | (EXCLUDED_REASON_LABEL 없음) | `spouse_marriage_subtraction: "혼인합가 배우자 주택 차감 (3주택·§167의3⑨)"` 추가 |
| `Step4.tsx:322` | "§155 … 1세대1주택 비과세 그대로" | (참고 — 2주택 한정 문맥, 경미. 필요 시 "2주택" 명시) |

> ★ 결과/힌트 "원" 단위·약어 금지(`feedback_no_won_suffix`·`feedback_result_view_korean_formula`). detail은 한국어 풀어쓰기.

---

## 5. E2E (E2E_PORT=3103)

`e2e/transfer-multi-house-marriage.spec.ts`(신규):
1. 보유주택 3채 입력(본인1 양도 + 배우자2) → 혼인합가일 2년전 입력 → 배우자 2채 "배우자 단독 보유" 체크.
2. 계산 → 결과: 산정 제외 주택 2채(혼인 차감) + 중과 미적용(effectiveCount 1) 확인.
3. Network request body `houses[].isSpouseOwned` true 2건 확인.

> E2E 함정(메모리 `project_transfer_input_error_prevention`): getByLabel 토글 오매칭 주의 → textbox role 한정. chip은 testid(`spouse-owned-chip-{houseId}`) 부여.

---

## 6. 노출 정책 요약 (`feedback_three_state_optional_mode_toggle` 정합)

- `isSpouseOwned`: per-house boolean(undefined=미설정=false 간주). 3-state 배열 아님 — 단순 boolean으로 충분(혼인 ON 게이트가 노출 제어).
- marriageDate 미설정 → chip hidden(데이터 무의미). marriageDate 설정 → 목록(otherHouses) 전체 노출(양도주택은 목록 밖, 별도 "selling" 생성).
