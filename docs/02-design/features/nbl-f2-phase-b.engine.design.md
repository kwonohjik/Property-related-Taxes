# NBL F2 Phase B — 엔진/데이터 설계 (별표4·5·6호·복잡비고)

> 계획: `docs/00-pm/nbl-gaps/gap-f2b-annex-phase-b.plan.md`. 법령 본문 실측(시행규칙 mst=286379 별표3·4·5·§83의4 / 시행령 mst=286211 §168의11·§168의10 / 지방세법 시행령 mst=286395 §101, 2026-06-17). 본 문서는 엔진/데이터 레이어 구현 명세. UI는 `nbl-f2-phase-b.ui.design.md`.

---

## 0. 케이스 인벤토리 (input → expected)

### B-1 별표4 운동경기업 선수전용 (sportsCategory="business")
| # | 종목/실내 | sportsPlayerCount | 산식 | 기준면적(㎡) |
|---|---|---|---|---|
| B1-4a | 축구장 | — | 별표4 lookup | 16,500 |
| B1-4b | 테니스장 | 6 | 975 + floor((6−2)/2)×725 | 2,425 |
| B1-4c | 실내 수영장 | — | 별표4 실내 | 1,500 |
| B1-4d | 종목 미선택 | — | standardAreaLimit fallback | (직접입력) |

### B-1 별표5 종업원 체육시설 (sportsCategory="employee")
| # | employeeFacilityKinds | employeeCount | 산식 | 기준면적(㎡) |
|---|---|---|---|---|
| B1-5a | [field] | 300 | 1,000+(300−100)×9 | 2,800 |
| B1-5b | [field] | 600 | 4,600+(600−500)×3 | 4,900 |
| B1-5c | [field] | 40 (≤50) | 비고2 → court(40) | 970 |
| B1-5d | [court] | 300 | 별표5 court 구간 | 970 |
| B1-5e | [indoor] | 300 | 별표5 indoor 구간 | 300 |
| B1-5f | [field,court] | 600 | 4,900+1,940 (보유시설 합산) | 6,840 |
| B1-5g | 시설 미선택 또는 n≤0 | — | standardAreaLimit fallback | (직접입력) |

### B-1 별표3 회귀 (sportsCategory="workplace", Phase A 불변)
| # | 종목 | sportsPlayerCount | 산식 | 기준면적(㎡) |
|---|---|---|---|---|
| B1-3a | 축구장 | — | 별표3(Phase A) | 11,000 |
| B1-3b | 테니스장 | 6 | 650 + floor((6−2)/2)×483 | 1,616 |

### B-3 6호 휴양시설 (relatedBusinessType="resort")
| # | 옥외 | 주차기준(×2) | 건축부속 | 산식 | 기준면적(㎡) |
|---|---|---|---|---|---|
| B3-1 | 5,000 | 1,000 | 2,000 | 5,000+1,000×2+2,000 | 9,000 |
| B3-2 | — | — | — | 3요소 미입력 → standardAreaLimit | (직접입력) |

### B-4 목장 별표1의3 (blocker — 동결)
| # | 축종 | 두수 | 산식 | 기준면적(㎡) |
|---|---|---|---|---|
| B4-1 | 한우 | 100 | 현행 동결값 10×100 | 1,000 (정본 대조 전 불변) |

### F3 연동
| # | 입력 | 기대 |
|---|---|---|
| B-F3 | landArea > 자동 기준면적 | `computeAreaProportioning`로 초과분만 비사업용(F3 부분안분 중과) |

---

## 1. 데이터 상수 (`data/area-standards.ts` 확장)

```ts
// 별표4 운동경기업 선수전용 (§83의4③ = §168의11①1호 가목(2))
export const SPORTS_BUSINESS_OUTDOOR_STD = {
  soccer: 16500, baseball: 21000, rugby: 13500, field_hockey: 9750,
  tennis: 975, soft_tennis: 975, american_football: 10500, equestrian: 9300,
  shooting: 6000, archery: 10650, other_outdoor: 4500,
} as const;
export const SPORTS_BUSINESS_INDOOR_STD = {
  ball_court: 1200, swimming: 1500, ice_rink: 2700,
} as const;

// 별표5 종업원 체육시설 (§83의4④ = §168의11①1호 나목) — 종업원수 선형보간
export function employeeSportsArea(
  kind: "field" | "court" | "indoor", n: number,
): number {
  if (kind === "court")  return n <= 500 ? 970 : n <= 2000 ? 1940 : 2910;
  if (kind === "indoor") return n <= 100 ? 150 : n <= 500 ? 300 : n <= 2000 ? 450 : 900;
  // field(운동장) — 구간내 선형보간
  if (n <= 100)   return 1000;
  if (n <= 500)   return 1000 + (n - 100) * 9;
  if (n <= 2000)  return 4600 + (n - 500) * 3;
  if (n <= 10000) return 9100 + (n - 2000) * 1;
  return 17100;
}
```

> ⚠️ 키는 별표3(`SPORTS_OUTDOOR_STD`·`SPORTS_INDOOR_STD`)과 **동일**해야 `sportsFacilityType` 단일 필드가 별표3/4 양 테이블에서 lookup 가능(workplace↔business 종목 동일·면적만 상이).
> ⚠️ 별표5 구간 경계 연속성(실측): n=500→4,600 / n=2,000→9,100 / n=10,000→17,100. court·indoor는 계단식 고정.

별표1의3(목장)·용도지역별 배율(지방세법 시행령 §101②)·6호 3호 배율: **상수 미인코딩**(blocker·cross-statute). `LIVESTOCK_STANDARD_AREA` 동결 유지.

---

## 2. 타입 확장 (`types.ts OtherLandUsage`)

```ts
export interface OtherLandUsage {
  // ── 기존 (Phase A) ───────────────────────────
  relatedBusinessType?: NblRelatedBusinessType;
  standardAreaLimit?: number;
  sportsFacilityType?: keyof typeof SPORTS_OUTDOOR_STD | keyof typeof SPORTS_INDOOR_STD;
  reserveForcesUnitSize?: keyof typeof RESERVE_FORCES_STD;
  reserveForcesFacilities?: Array<"tactical" | "shooting_prep" | "range" | "basic">;

  // ── Phase B 신규 ─────────────────────────────
  // B-1 체육시설 유형
  sportsCategory?: "workplace" | "business" | "employee";          // 기본 workplace(별표3)
  employeeCount?: number;                                           // 별표5 종업원수
  employeeFacilityKinds?: Array<"field" | "court" | "indoor">;      // 별표5 보유 시설(다중·합산)
  // B-2 복잡 비고
  sportsPlayerCount?: number;                                       // 테니스·연식정구 선수가산
  sportsExtraEvents?: Array<keyof typeof SPORTS_OUTDOOR_STD>;       // 비고2 종목합산(5종목군 max1)
  indoorNotInstalled?: boolean;                                     // 별표3 비고4 실내미설치=800
  // B-3 6호 휴양 3요소
  resortOutdoorArea?: number;                                       // §83의4⑫1호
  resortParkingStdArea?: number;                                    // §83의4⑫2호 (엔진 ×2)
  resortBuildingAttachedArea?: number;                             // §83의4⑫3호 (배율 적용 후 면적·직접입력)
}
```

result 타입 **무변경**: 기준면적은 `resolveAreaLimit` 내부 산출 → `computeAreaProportioning` 입력(F3 `surcharge.nonBusinessAreaRatio` 경유 노출). 결과카드 별표 라벨은 UI 측 매핑(§83의4①/③/④).

---

## 3. 알고리즘 — `resolveAreaLimit(o)` 분기 (`other-land.ts:52`)

```
// ── B-1 확정 의사코드 (별표4·5 lookup·employee 합산·resort 3요소) ──
switch o.relatedBusinessType:
  case "sports":
    cat = o.sportsCategory ?? "workplace"               // 하위호환 default
    if cat == "employee":
      n = o.employeeCount; kinds = o.employeeFacilityKinds
      if kinds?.length && n != null && n > 0:           // n>0 가드(0/음수=fallback)
        if n <= 50: return employeeSportsArea("court", n)            // 비고2: 50인↓ 코트만
        return Σ_{k∈kinds} employeeSportsArea(k, n)                  // 보유시설 합산
      return o.standardAreaLimit                                     // fallback
    // workplace | business — 종목 lookup (별표3/4)
    tbl  = cat=="business" ? SPORTS_BUSINESS_OUTDOOR_STD : SPORTS_OUTDOOR_STD
    itbl = cat=="business" ? SPORTS_BUSINESS_INDOOR_STD  : SPORTS_INDOOR_STD
    return applyTableNotes(                                          // ↓ B-2 가산 적용점
      tbl[o.sportsFacilityType] ?? itbl[o.sportsFacilityType] ?? o.standardAreaLimit, o, cat)
  case "resort":                                          // B-3 6호 3요소
    sum = (o.resortOutdoorArea ?? 0)
        + (o.resortParkingStdArea ?? 0) * 2               // §83의4⑫2호 2배
        + (o.resortBuildingAttachedArea ?? 0)             // 3호 (배율 후 면적·직접입력)
    return sum > 0 ? sum : o.standardAreaLimit            // 3요소 미입력 시 fallback
  case "parking_attached": return o.standardAreaLimit     // 변경 없음
  // reserve_forces·parking_garage 등 Phase A 유지

// ── B-2 분리 블록 (후속 — applyTableNotes, 착수 시 확정) ──
// base(B-1 lookup 결과)에 비고 가산·조정. B-1만 머지 시 applyTableNotes = identity.
applyTableNotes(base, o, cat):
  if base == null: return base
  // (a) 선수가산(테니스·연식정구) — 별표3 483 / 별표4 725
  if o.sportsFacilityType ∈ {tennis, soft_tennis} && (o.sportsPlayerCount ?? 0) > 2:
    base += floor((o.sportsPlayerCount − 2) / 2) * (cat=="business" ? 725 : 483)
    // ⚠️ "2인마다" 홀수 잔여(예: 5인) 처리 유권해석 — 확인 필요
  // (b) 종목합산(비고2) — sportsExtraEvents 중 축구·야구·럭비·필드하키·미식축구는 max1만,
  //     그 외 종목 합산 명문 부재 → ⚠️ 유권해석 확인 필요(미확정 시 base 단일 종목만)
  // (c) 실내미설치(별표3 비고4·workplace만): if cat=="workplace" && o.indoorNotInstalled: base = 800
  // (d) 실내 부속토지 용도지역별 배율(비고1·3): 직접입력 유지(§101② 미확보)
  return base
```

### 정수 연산
- 면적(㎡)은 금액 아님 → `applyRate` 비대상. 별표5 선형보간·선수가산은 정수 산출(`*`·`floor`).
- `floor((p−2)/2)`: 짝수 초과만 anchor 고정. **홀수 잔여(예: 5인) 처리는 법문 "2인마다" 유권해석 — 확인 필요**(B-2).
- F3 면적안분(`computeAreaProportioning`)의 `safeMul` 소수 정밀도는 F3에서 처리(본 Phase는 기준면적만 산출).

---

## 4. 엔진 측 동기화 지점

| 파일 | 변경 |
|---|---|
| `data/area-standards.ts` | `SPORTS_BUSINESS_OUTDOOR_STD`·`SPORTS_BUSINESS_INDOOR_STD`·`employeeSportsArea()` 추가 (헤더 주석 Phase B 갱신) |
| `types.ts OtherLandUsage` | `sportsCategory`·`employeeCount`·`employeeFacilityKinds`·`sportsPlayerCount`·`sportsExtraEvents`·`indoorNotInstalled`·`resort*` 3필드 |
| `other-land.ts:52 resolveAreaLimit` | (B-1) sports `category` 분기·employee 합산(n>0)·resort 3요소 합산 / (B-2) `applyTableNotes` 헬퍼(선수가산·종목합산·실내미설치) |
| `form-mapper-helpers.ts:179 buildOtherLand` | `sportsCategory`·`employeeCount`(parseNumber)·`employeeFacilityKinds`(asArray)·`resort*`(parseNumber) 매핑 |

> ⚠️ 800줄 정책: `other-land.ts`·`area-standards.ts` 증가량 점검. resolveAreaLimit가 비대하면 `resolveSportsAreaLimit`·`resolveResortAreaLimit` 헬퍼 추출.

---

## 5. anchor 매핑 (Pre-Do FAIL 우선)

| anchor | phase | 케이스 | 검증 대상 |
|---|---|---|---|
| AT-F2B-1 | B-1 | B1-4a + landArea 18,000 | 별표4 lookup·초과 areaProportioning (FAIL 확보) |
| AT-F2B-2 | B-1 | B1-5a·B1-5b | 별표5 선형보간 정수 |
| AT-F2B-3 | B-1 | B1-5c | 비고2 50인↓ court 강제 |
| AT-F2B-4 | B-1 | B1-3a | 별표3 회귀(Phase A 불변) |
| AT-F2B-5 | **B-2** | B1-3b·B1-4b | 선수가산 단가 분기(483/725) |
| AT-F2B-6 | B-3 | B3-1 | 6호 3요소 합산 |
| AT-F2B-7 | B-1·B-3 | B1-4d·B3-2 | fallback 회귀 |
| AT-F2B-8 | B-4 | B4-1 | 별표1의3 동결(numeric 불변) |
| AT-F2B-9 | B-1 | B1-5f | 보유시설 합산(field+court) |

테스트 파일: `__tests__/tax-engine/non-business-land/other-land-area-limit.test.ts`(F2 describe 확장).

---

## 6. blocker·cross-statute (자동화 보류)

- **별표1의3 목장**: KoreanLaw `get_annexes` 가지번호("1의2"·"1의3") 전부 절단 실패 → 정본 미확보. `LIVESTOCK_STANDARD_AREA` 8축종 동결(AT-F2B-8). Do: 법제처 직접 확보 → per-head 정정 + anchor.
- **용도지역별 적용배율**(지방세법 시행령 §101②): KoreanLaw 표 본문 추출 실패. 별표3·4·5 실내 부속토지(비고1·3)·6호 3호 의존 → **직접입력 유지**(추정값 금지). 정본 확보 시 용도지역 select + 배율 자동.
- **§168의11⑥ 복합용도 건축물 부속토지 안분**(1호 단일건축물 연면적비·2호 다수건축물 바닥면적비): 본 Phase 밖(scope OUT).
- **별표3·4·5 비고1 단서**: "당해 토지가 §101①2호 건축물 부속토지 해당 시 배율 미적용" — 예외 처리 후속.
