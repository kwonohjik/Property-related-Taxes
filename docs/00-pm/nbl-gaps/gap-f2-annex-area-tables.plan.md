# F2 — 별표3~6·별표1의3 정본 자동산출

> 현재 직접입력(`standardAreaLimit`) 우회 중인 호의 기준면적을 별표 정본 표로 자동산출. **충실도 향상**(직접입력 fallback 유지). 별표1의3(목장)은 정본 미확보 blocker.

---

## 1. 법령 근거 — 별표 매핑 (시행규칙 §83의4 본문 실측 2026-06-17, mst=286379)

| 별표 | 호·목 | 위임 조항 | 내용 | 정본 확보 |
|---|---|---|---|---|
| **별표 3** | §168의11①1호 가목(1) | §83의4① | 선수전용 체육시설 기준면적 | ✅ 실측 |
| **별표 4** | 1호 가목(2) | §83의4③ | 기준면적 | ❌ Do 확보 |
| **별표 5** | 1호 나목 | §83의4④ | 종업원 체육시설 기준면적 | ❌ Do 확보 |
| **별표 6 제1호** | 5호 다목 | §83의4⑨ | 예비군훈련장 시설기준 | ✅ 실측 |
| **별표 6 제2호** | 5호 다목 | §83의4⑩ | 예비군훈련장 기준면적 | ✅ 실측 |
| **별표 1의3** | (목장) | 시행령 §168의10③·시행규칙 §83의5③3호 | 가축별 기준면적·가축두수 | ❌ **blocker** |

추가 (직접입력 유지 대상 — §83의4 비고·합산):
- **6호 휴양시설**(§83의4⑫): 단일값 아님 — ①옥외방목장/식물원 + ②부설주차장(설치기준×2 이내) + ③재산세 종합합산 건축물 부속토지(바닥면적×용도지역별 배율) **합산**.
- **2호 가목 부설주차장**(§168의11①2호가): 주차장법 설치기준면적 직접입력(별표 아님).

### 별표3 정본 (체육시설 — 실측, 복잡도 입증)
- 실외 11종: 축구장 11,000 · 야구장 14,000 · 럭비장 9,000 · 필드하키장 6,500 · 테니스장 650 · 연식정구장 650 · 미식축구장 7,000 · 승마장 6,200 · 사격장 4,000 · 궁도장 7,100 · 기타 3,000 (㎡)
- 실내 3구간: 핸드볼/배구/농구/탁구 등 800 · 수영/수구/다이빙 1,000 · 아이스하키/피겨/롤러 1,800
- 비고: ①실내 부속토지=바닥면적×**지방세법 시행령 §131의2② 용도지역별 적용배율** ②축구·야구·럭비·필드하키·미식축구 중 2종목↑=최대 1종목만 ③실내 바닥면적≤기준면적 시 배율 적용 ④실내 미설치=800 ⑤테니스·연식정구 선수 2인 기준, 초과 2인마다 +483㎡

### 별표6 정본 (예비군 — 실측)
- 시설기준: 교육보조재료창고 66㎡↑(대대급↑) · 강당 298㎡(중대급 185㎡)↑ · 간이목욕장(50명 동시)
- 기준면적(부대편성인원 4구간: 800↓ / 801~2,400 / 2,401~5,000 / 5,001↑):
  전술교육장 15,000/30,000/30,000/45,000 · 사격술예비훈련장 3,600/7,200/10,800/10,800 · 사격장 1,650/2,475/3,300/3,300 · 기초훈련장 2,500/5,000/7,500/7,500 · **계** 22,750/44,675/51,600/66,600
- 비고: 사격술예비·사격장·기초훈련장은 전술교육장에서 실시 불가 시에만 포함.

### 별표1의3 (목장) — blocker
- 근거: §83의5③3호 "영 별표 1의3에 따른 **가축별 기준면적과 가축두수**를 적용하여 계산한 면적".
- KoreanLaw `get_annexes` **가지번호("1의3") 파서 실패** (lawName/annexNo 양형식 모두 "의3"으로 절단) + classifier 일시 불가.
- 현행 `livestock-standards.ts` 하드코딩(한우10·젖소15·돼지모돈2.5·비육돈0.8·가금0.05·말20·면양2·산양2 ㎡/두)은 **별표1의3 본문 미대조** → numeric 변경 금지(memory 3c E-2).

---

## 2. 현황 (실측)

- `area-standards.ts` `NBL_AREA_MULTIPLIER` 자동산출 4건만(2호나×1.5·4호×200·7호×1.2·13호 660).
- `other-land.ts:52~70 resolveAreaLimit`: sports·parking_attached·reserve_forces·resort → `o.standardAreaLimit`(직접입력). 미입력 시 undefined → 면적기준 미적용.
- `pasture.ts:139~146`: `getLivestockStandardArea(livestockType, livestockCount)` 자동(별표1의3 미대조값).
- UI `OtherLandDetailSection.tsx`: relatedBusinessType RadioCardGroup 10옵션 + 직접입력 DecimalInput(갭 3a).

---

## 3. 설계 — 2-Phase (Phase B는 직접입력 유지)

### Phase A — 단순 lookup 자동화
별표 표가 **단일 선택 → 단일값**인 부분만 자동:
- 별표3 실외(11종) / 실내(3구간) — 종목 select → 기준면적.
- 별표5 종업원 체육시설(별표4와 함께 Do 정본 확보 후 동일 패턴).
- 별표6 — 부대편성인원(4구간) × 시설구성 → 기준면적 합(전술교육장 + 조건부 3시설).

데이터(`data/area-standards.ts` 확장):
```ts
export const SPORTS_OUTDOOR_STD = { soccer:11000, baseball:14000, rugby:9000, field_hockey:6500,
  tennis:650, soft_tennis:650, american_football:7000, equestrian:6200, shooting:4000, archery:7100, other:3000 } as const;
export const SPORTS_INDOOR_STD = { ball_court:800, swimming:1000, ice_rink:1800 } as const;
export const RESERVE_FORCES_STD = {  // 부대편성인원 구간별
  "le800":   { tactical:15000, shooting_prep:3600, range:1650, basic:2500 },
  "le2400":  { tactical:30000, shooting_prep:7200, range:2475, basic:5000 },
  "le5000":  { tactical:30000, shooting_prep:10800, range:3300, basic:7500 },
  "gt5000":  { tactical:45000, shooting_prep:10800, range:3300, basic:7500 },
} as const;
```

types.ts `OtherLandUsage` 추가(선택 필드):
```ts
sportsFacilityType?: keyof typeof SPORTS_OUTDOOR_STD | keyof typeof SPORTS_INDOOR_STD;
reserveForcesUnitSize?: "le800" | "le2400" | "le5000" | "gt5000";
reserveForcesFacilities?: Array<"tactical"|"shooting_prep"|"range"|"basic">;
```

`resolveAreaLimit` 분기 확장: sports → `sportsFacilityType` lookup, reserve_forces → 부대규모×시설 합. **선택 미입력 시 `standardAreaLimit` 직접입력 fallback**(3중 패턴).

### Phase B — 별표4·5 자동화 + 복잡 비고 (→ 상세: [gap-f2b-annex-phase-b.plan.md](gap-f2b-annex-phase-b.plan.md))

> **갱신(2026-06-17, Phase A ✅PR#249 후)**: Phase B를 별도 계획서로 구체화. 별표4(운동경기업)·별표5(종업원)는 KoreanLaw 정본 확보로 **자동화 승격**(직접입력 유지 아님). 용도지역별 배율(지방세법 §101② — 표 추출 실패)·6호 휴양 3호만 직접입력 유지. 별표1의3 목장은 blocker 유지.

자동화 보류, 직접입력 + 안내문(B-2·B-3 일부):
- 별표3·4·5 비고 실내 부속토지 **용도지역별 배율**(지방세법 §101② 교차의존 — 정본 미확보).
- 6호 휴양 §83의4⑫ 3호 건축물 부속토지(배율 의존).
- → UI에 "복잡 산정은 직접입력" 안내(violet 카드), `standardAreaLimit` 유지.

자동화 승격(B-1·B-2·B-3):
- 별표4·5 체육시설 유형(직장운동경기부/운동경기업/종업원) 분기 + 종목 lookup / 종업원수 선형보간.
- 종목 합산 max·선수수 가산(별표3 483㎡·별표4 725㎡)·실내 미설치 800㎡.
- 6호 휴양 1·2호(옥외방목장·식물원 + 부설주차장 ×2).

### 별표1의3 (blocker) — 현행 유지
- `livestock-standards.ts` numeric 동결. Do 단계 정본 확보 절차:
  1. `search_law` 또는 `get_annexes bylSeq` 로 별표1의3 bylSeq 탐색.
  2. 실패 시 법제처 사이트 직접 확인.
  3. 정본 대조 후 하드코딩 정정 + per-head anchor.
- **정본 미확보 시 본 F2에서 목장 부분 제외**(체육·예비군만 자동화).

---

## 4. 케이스 매트릭스

| # | 호 | 입력 | 기준면적 | 기대 |
|---|---|---|---|---|
| C1 | 1호 sports 실외 축구장 | sportsFacilityType=soccer | 11,000 | 자동 lookup |
| C2 | 1호 sports 실내 수영장 | swimming | 1,000 | 자동 |
| C3 | 1호 sports 직접입력 (미선택) | standardAreaLimit=5000 | 5,000 | fallback |
| C4 | 1호 비고② 2종목 | (복잡) | 직접입력 | Phase B 안내 |
| C5 | 5호 reserve le2400 전술+사격장 | unitSize+facilities | 30,000+2,475 | 합산 |
| C6 | 6호 resort | standardAreaLimit | 직접입력 | Phase B (§83의4⑫ 3요소) |
| C7 | 목장 별표1의3 | livestockType+count | 현행 하드코딩 | blocker (정본 대조 전) |
| C8 | 자동+초과 | landArea > 자동기준면적 | `computeAreaProportioning` | **F3 연동** |

---

## 5. 14 동기화 지점 (신규 선택 필드)

| # | 지점 | 작업 |
|---|---|---|
| ① | AssetForm | `nblOtherSportsFacilityType`·`nblOtherReserveUnitSize`·`nblOtherReserveFacilities`(string[]) |
| ② | factory | 기본 "" / [] |
| ③ | normalize | NBL_DEFAULTS 동일 |
| ④⑬ | API | prefix-pick 자동 (단 배열 필드 직렬화 확인) |
| ⑤ | UI | `OtherLandDetailSection`에 sports/reserve 선택 시 하위 select·체크박스(조건부) |
| ⑥ | 사이드바 | N/A |
| ⑦ | 결과카드 | 자동산출 기준면적·별표 근거 표시 |
| ⑧ | validate | sports/reserve 선택 시 하위 필드 또는 직접입력 중 하나 필수 (3중 fallback 동기화) |
| ⑫ | Zod | `transfer-tax-schema-sub.ts` 신규 3필드(배열 `z.array(z.string())`) |
| ⑭ | route | `buildOtherLand`(form-mapper-helpers) 매핑 추가 |

---

## 6. anchor 명세

- **AT-F2-1 (Pre-Do)**: sports=soccer·landArea 12,000 → 기준면적 11,000 자동·초과 1,000 areaProportioning. 현재 standardAreaLimit 미입력이면 면적기준 미적용(사업용) → FAIL 확보 → 구현 → PASS.
- **AT-F2-2 (fallback)**: sportsFacilityType 미선택·standardAreaLimit=5000 → 5,000 직접입력 유지(회귀).
- **AT-F2-3 (별표6 합산)**: reserve le2400 + [tactical, range] → 30,000+2,475=32,475.
- **AT-F2-4 (별표1의3 동결)**: 목장 numeric 불변(현행값 toBe, 정본 대조 전 변경 금지).
- **AT-F2-5 (Phase B)**: resort·복잡 호는 직접입력 경로 유지.

---

## 7. 규모·위험·blocker

- 규모 **L** (데이터 표 인코딩 + UI 하위 선택 + 14지점).
- 별표4·5 정본 Do 선행 확보(별표3·6 성공 패턴 — `get_annexes lawName="소득세법 시행규칙 별표 4/5" knd="1"`).
- **별표1의3 blocker**: 가지번호 파서 실패 → 목장 정본 미확보. 미확보 시 목장 제외하고 체육·예비군만 자동화.
- F3 머지 후 rebase(SR-F1) — F2의 정확 기준면적이 F3 부분안분 입력 품질 향상(독립 동작).
- 위험 중(직접입력 fallback이 안전망 — 자동화 실패해도 기존 경로 유지).
