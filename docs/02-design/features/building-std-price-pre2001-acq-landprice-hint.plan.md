# 건물 기준시가 계산 — 취득일 ≤ 2000.12.31. 시 취득시 공시지가 2001.1.1. 기준 안내 + pre-1990 자동주입 제거

> 상태: Plan (자가검토 완료 · 구현 대기)
> 대상: 국세청 건물기준시가 3시점 일괄계산 모달 + 상속주택 환산취득가액 배선
> 근거: 소득세법 시행령 §164⑤(건물)·§164④/시행규칙 §80⑥⑦(1990 이전 토지)

## 1. 문제 정의 (2개 결함)

이미지 #13(건물 기준시가 계산 모달)의 "시점별 개별공시지가 (위치지수)" 영역:

**결함 A — 안내 누락 + 잘못된 pre-fill (전 경로 공통, 모달)**
취득일이 **2000.12.31. 이전**인 건물은 취득당시 건물기준시가를 **2001.1.1. 체계**로 산정하므로(§164⑤ + 국세청 건물기준시가 최초 고시 2001.1.1.), 위치지수의 취득시 공시지가는 **2001.1.1. 현재 공시된 개별공시지가**를 입력해야 한다. 그러나 모달은 라벨을 취득연도(예: "취득시 (1983년) 공시지가")로만 표시하고, 어떤 값을 넣어야 하는지 안내(hint)가 없다. 사용자가 1983년 실제 공시지가를 입력하는 오류 유발.

- 모순의 방증: 같은 모달이 구조·용도는 이미 "취득당시 (구조·용도 — **2001년 체계**)"로 렌더(`schemeYear(≤2000 → 2001)`)하는데, 공시지가만 취득연도 라벨 → **자기모순**.
- **두 경로 모두 pre-2001 취득시 공시지가에 취득연도 값을 자동 pre-fill**: 상속 경로(`HouseValuationSection`)는 §164④ 환산값(결함 B), 일반 경로(`ThreePointStandardPriceInput.tsx:640`)는 `props.landPricePerSqmAtAcq`(취득연도 공시지가). 둘 다 2001.1.1. 값이 아니어서 새 힌트와 **모순** → 두 경로 모두 pre-2001은 빈 값 시드로 통일해야 힌트와 정합.

**결함 B — 90.8.30 이전 토지 환산가액 자동주입 (상속 경로 전용, 명백한 오류)**
`HouseValuationSection`(상속주택 환산취득가액)의 batchPoints가 취득(상속) 시점 공시지가를 `isBefore1990 ? pre1990Land.pricePerSqm : …`로 채운다. 즉 **§164④ 1990.8.30 이전 토지 등급가액 환산값**(토지 트랙 전용)을 건물기준시가 위치지수(2001 체계)에 끌어온다 → **트랙 혼동**. (PR#531에서 도입된 배선. 이번에 되돌림.)

## 2. 법령 근거 (KoreanLaw 확인)

- **소득세법 시행령 §164⑤**: "법 제99조제1항제1호나목에 따른 기준시가(=국세청 건물기준시가)가 **고시되기 전에 취득한 건물의 취득당시 기준시가**는 [별표] 산식으로 계산." → 국세청 건물기준시가(신축가격기준액 방식) **최초 고시 2001.1.1.** 이전 취득 건물은 2001.1.1. 최초고시 기준시가를 기준으로 산정. 코드는 이미 `BUILDING_STD_FIRST_YEAR = 2001`(`lib/calc/phd-building-std-batch.ts:18`), `calcCompositeForYear(parts, 2001, …)`(`lib/tax-engine/building-standard-price.ts:172-213`)로 반영.
- **소득세법 시행령 §164④ + 시행규칙 §80⑥⑦**: "1990년 8월 30일 개별공시지가가 고시되기 전에 취득한 **토지**의 취득당시 기준시가"는 등급가액·시가표준액 비율 환산. → **토지 트랙 전용**. 건물 위치지수 공시지가로 전용(轉用)은 근거 없음.
- 두 조항은 별개 자산(건물 vs 토지)·별개 시점(2001.1.1. vs 1990.8.30.)의 트랙. 혼용은 오류.

## 3. 근본 원인

취득당시 건물기준시가 계산의 위치지수 공시지가는 **2001.1.1. 시점 공시지가**(취득이 2001 이전일 때) 하나로 고정되어야 하는데,
- (A) 모달이 그 사실을 안내하지 않고,
- (B) 상속 경로는 그 자리에 상속개시일 값(1990 이전이면 §164④ 등급가액 환산값)을 자동 주입한다.

→ **취득 ≤ 2000.12.31.이면 취득시 공시지가는 "2001.1.1. 현재 공시지가"로 통일**(사용자 입력, 힌트 안내), 자동주입 제거.

## 4. 수정 범위 (3파일 + 테스트 1) — RESULT 타입·엔진 변경 없음(UI-only)

- 모달 `PhdBuildingStdPriceModalButton.tsx`(힌트+라벨, 공유) · `HouseValuationSection.tsx`(상속 시드) · `ThreePointStandardPriceInput.tsx`(일반 시드) · 테스트 `inheritance-house-val-building-std-batch.test.tsx`(F3 반전).

### 4-1. 모달 힌트 + 라벨 — `components/calc/building-std-price/PhdBuildingStdPriceModalButton.tsx:368-370` (공유 → 두 경로 모두 적용)

라벨(368)·힌트(370)를 함께 수정. 취득 ≤ 2000이면 라벨을 "2001년 기준"으로 전환(사용자 결정 = 옵션 b).

```tsx
// Before (368)
label={`${POINT_LABEL[p.key]}${p.year ? ` (${p.year}년)` : " (연도 미상)"} 공시지가`}
// After (368) — 취득 ≤ 2000 → 취득연도 대신 "(2001년 기준)"
label={`${POINT_LABEL[p.key]}${
  p.key === "acquisition" && p.year != null && p.year <= 2000
    ? " (2001년 기준)"
    : p.year ? ` (${p.year}년)` : " (연도 미상)"
} 공시지가`}

// Before (370)
hint={p.year ? undefined : "해당 시점 날짜 미입력 — 계산 제외"}
// After (370)
hint={
  !p.year
    ? "해당 시점 날짜 미입력 — 계산 제외"
    : p.key === "acquisition" && p.year <= 2000
      ? "2001.1.1. 현재 공시지가를 입력하세요"
      : undefined
}
```

- 조건 `p.key === "acquisition" && p.year <= 2000` = 취득일 ≤ 2000.12.31.(연도 비교, 기존 `schemeYear` 임계와 동일).
- `p.year`는 이미 존재(취득연도). 신규 prop·상태 불요.
- 결과: pre-2001 취득 → "취득시 (2001년 기준) 공시지가" + 힌트 "2001.1.1. 현재 공시지가를 입력하세요". 2001 이후 취득은 기존 "취득시 (YYYY년) 공시지가" 그대로.

### 4-2. pre-1990 자동주입 제거 — `components/calc/transfer/inheritance/HouseValuationSection.tsx:244-263` (상속 경로 전용)

```tsx
// Before (245-248)
const acqLandPerM2 = isBefore1990
  ? (pre1990Land ? String(pre1990Land.pricePerSqm) : "")
  : asset.inhHouseValLandPricePerSqmAtInheritance;

// After — 취득 ≤ 2000이면 2001.1.1. 공시지가를 모달에서 직접 입력(빈 값 시드 + 힌트 안내).
//         등급가액 환산값(§164④, 토지 트랙)·상속개시일 개별공시지가를 위치지수로 전용하지 않음.
const acqYear = yearOf(inheritanceDate);
const acqLandPerM2 = (acqYear != null && acqYear <= 2000)
  ? ""
  : asset.inhHouseValLandPricePerSqmAtInheritance;
```

- deps 배열에서 `isBefore1990`, `pre1990Land` 제거(batchPoints에서 미사용). `acquisition`의 `year`는 위 `acqYear` 재사용.
- **`pre1990Land` useMemo 및 `isBefore1990`는 유지** — line 503-517의 land track 미리보기(`landStdA = isBefore1990 ? pre1990Land.total : …`, §164⑦ Sum_A 토지기준시가)에서 정당하게 사용. batchPoints 참조만 끊는다.
- **`Pre1990LandValuationInput` 위젯(443-461) 유지** — 상속개시일 토지 개별공시지가(§164④ 토지 트랙)는 정당. 이번 수정과 무관.

### 4-2b. 일반 경로 pre-2001 시드도 빈 값 통일 — `components/calc/transfer/ThreePointStandardPriceInput.tsx:640` (재개발·일반건물·상가)

공유 모달의 힌트가 "2001.1.1. 입력"을 안내하는데 이 경로는 취득연도 공시지가를 pre-fill → 모순. pre-2001은 빈 값 시드로 통일(4-1 힌트와 정합).

```tsx
// Before (640)
{ key: "acquisition" as const, label: "취득시", year: yearOf(props.acquisitionDate), landPricePerM2: props.landPricePerSqmAtAcq },

// After — 취득연도(yearOf) ≤ 2000이면 빈 값 시드. props.landPricePerSqmAtAcq(취득연도 공시지가·토지 트랙)를
//         건물 위치지수로 전용하지 않음. 2001.1.1. 공시지가는 모달에서 힌트 보고 직접 입력.
{ key: "acquisition" as const, label: "취득시",
  year: yearOf(props.acquisitionDate),
  landPricePerM2: (() => { const y = yearOf(props.acquisitionDate); return y != null && y <= 2000 ? "" : props.landPricePerSqmAtAcq; })() },
```

- `props.landPricePerSqmAtAcq` 자체는 불변(land track 취득 토지기준시가 용도 유지) — 모달 시드만 빈 값.
- ≥2001 취득은 기존대로 `props.landPricePerSqmAtAcq` 시드.

### 4-3. 시드 방식 결정 — 빈 값(권장) vs 신규 저장 필드

pre-2001 취득시 공시지가는 store에 저장 필드가 없다(양도·최초공시 시점은 `inhHouseValLandPricePerSqmAtFirst/Transfer`로 영속). 선택:
- **(권장) 빈 값 시드**: 모달에서 힌트 보고 직접 입력. 신규 필드·14지점 동기화 불요. 건물기준시가 **출력**은 `inhHouseValBuildingStdPriceAtInheritance`로 영속되므로 재계산 시에만 재입력(계산기 성격상 자연). 최소 변경.
- (대안) 신규 store 필드 `inhHouseValLandPricePerSqmAt2001` 추가: 영속. 그러나 8지점 동기화 + 본문 입력란 추가 → 범위 확대. **미채택 권장**.

## 5. 결정 사항 (확정)

**Q1. 취득시 공시지가 라벨 표기 (모달, pre-2001 케이스) → 옵션 (b) 채택**
라벨을 "취득시 (2001년 기준) 공시지가"로 전환 + 힌트 "2001.1.1. 현재 공시지가를 입력하세요". 자기모순 완전 해소. (4-1에 반영 완료.)

## 6. 테스트·회귀

- **단위 테스트 F3 반전 (필수)**: `__tests__/calc/inheritance-house-val-building-std-batch.test.tsx:91-114` `it("F3: pre-1990 상속취득 → 취득시 공시지가 seed = 등급가액 환산 per-sqm(>0)")`가 `expect(Number(acqLand)).toBeGreaterThan(0)`로 **자동주입(결함 B)을 정답으로 고정**. 수정 시 실패. → 제목·단정 반전:
  - 제목: "F3: pre-2001 상속취득 → 취득시 공시지가 seed = 빈 값(2001.1.1. 공시지가는 모달에서 직접 입력)"
  - 단정: `expect(acqLand ?? "").toBe("")` (또는 `toBeFalsy()`). `data-acq-land` = 빈 문자열.
  - 근거: `feedback_anchor_correction_legal_priority` — 법령상 틀린 동작을 고정한 테스트는 유지하지 않고 정정.
- **E2E (정정 — 단정 없음, green 유지만 확인)**: `e2e/transfer-inheritance-house-val-building-std-batch.spec.ts:104-106`은 취득 공시지가를 **index 기반** `land.nth(0).fill("598517")`로 직접 채우고 자동주입/라벨 텍스트를 단정하지 않음 → 시드·라벨 변경에 견고. 별도 수정 불요, 재실행 green만 확인.
- 회귀: `npx vitest run __tests__/tax-engine/`(엔진 무변경 → green 유지), `npx vitest run __tests__/calc/inheritance-house-val-building-std-batch.test.tsx`(F3 반전 후 green), `npx tsc --noEmit` 0건.
- **브라우저(Playwright E2E) 확인**: (a) 상속 경로 취득일 1983 → 모달 열기 → 취득시 공시지가 라벨 "취득시 (2001년 기준) 공시지가" + 힌트 "2001.1.1. 현재 공시지가를 입력하세요" 노출, 값 비어있음(자동주입 없음). (b) 일반 경로(재개발/일반건물/상가) pre-2001 취득도 동일 라벨·힌트·빈 값 확인.

## 7. DoD

- [ ] 모달 힌트 노출(취득 ≤ 2000): "2001.1.1. 현재 공시지가를 입력하세요" + 라벨 "취득시 (2001년 기준) 공시지가"
- [ ] 상속 경로(`HouseValuationSection`) 취득시 공시지가 자동주입 제거(pre-2001 빈 값 시드), `pre1990Land`/`isBefore1990`은 land track에서 유지, batchPoints deps 정리(orphan dep 제거)
- [ ] 일반 경로(`ThreePointStandardPriceInput:640`) pre-2001 취득 시드도 빈 값 통일(힌트와 정합), `props.landPricePerSqmAtAcq` 자체는 불변
- [ ] 단위 테스트 F3 반전(자동주입 단정 → 빈 값 단정), 재실행 green
- [ ] `npx tsc --noEmit` 0건 · E2E green 유지(단정 불요) · 회귀 0건
- [ ] 메모리 갱신: PR#531 pre-1990 주입이 **오류로 정정**됨을 `project_transfer_inheritance_house_val_building_std_batch` 및 pre-1990 관련 메모에 반영

## 8. 리스크·비고

- **RESULT/엔진 무변경**: 8동기화 지점 중 ⑤(UI 위젯 힌트)만 해당. 엔진 산식·타입 불변 → 세액 영향 없음.
- **공유 모달 + 두 경로 시드**: 힌트·라벨은 모달 공유로 두 경로 동시 적용. pre-2001 빈 값 시드는 상속·일반 각 경로에서 개별 수정(둘 다 힌트와 정합). 일반 경로 변경은 pre-2001 건물(재개발·일반건물·상가) 양도에만 영향(오래된 취득, 드묾) — 취득연도 공시지가 pre-fill이 애초에 위치지수로는 오류였으므로 빈 값+힌트가 정정.
- **되돌림 대상 명확화**: 결함 B는 PR#531 배선의 정정. `feedback_anchor_correction_legal_priority`(잘못된 구현을 유지하지 않음) 정책 적용.
- **미입력 트레이드오프(의도된 동작)**: 빈 값 시드 후 사용자가 2001.1.1. 공시지가를 입력하지 않으면 취득 시점이 계산에서 제외(`land <= 0`) → 취득당시 건물기준시가 미산출(상속 경로 §164⑦ Sum_A 건물성분=0). 그러나 종전 자동주입은 **법령상 틀린 값**(§164④ 토지환산을 위치지수로)을 산출했으므로, "빈 값+힌트로 입력 유도"가 "자동 오류값"보다 안전·정확. `feedback_no_silent_apportion_fallback` 정합(오류 fallback 대신 명시 입력 유도).
