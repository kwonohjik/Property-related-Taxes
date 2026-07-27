# 상속 취득가액 — "자산 구분" 토글 보조계산 강등 계획서 (self-review 정정본)

## Context (왜)

양도세 취득원인=상속에서 **"자산 구분(토지/개별·다세대주택/공동주택)" 라디오가 섹션 상단에 필수처럼 노출**된다(`CompanionAcqInheritanceBlock.tsx:130-159`). 그러나 실측상:

- 정상(현대) 상속 취득가액 = **상속세 신고가액을 그대로** 취득가로 씀(`inheritance-acquisition-price.ts:176`). 이 경로에서 자산 구분은 **세액 무영향**.
- 자산 구분의 실질 역할은 ① 보충적평가 보조계산(자동조회) 토지/주택 스위치, ② §164⑦ 오래된 주택(<2005.4.30) 환산의 개별/공동 구분뿐.
- 즉 핵심 입력은 **평가방법 + 신고가액**인데, 결과에 영향 주는 분류처럼 상단에 상시 노출되어 혼란(사용자 지적).

**목표**: 기본 화면을 "평가방법 + 신고가액"으로 정리하고, 자산 구분은 실제 필요한 맥락(보조계산 ON, §164⑦ 환산)에서만 노출("보조계산 안으로 강등" — 사용자 승인).

## 성공 기준 (verify 가능)

1. 상속 진입 기본 화면 = **평가방법 + 신고가액**만(상단 coarse 라디오 제거).
2. 주택 자산에서 보충적평가 보조계산 ON 또는 §164⑦ 섹션 활성 시에만 개별/공동 선택 노출.
3. **회귀 금지 ①**: 오래된 주택 상속(<2005.4.30) 직접입력이어도 §164⑦ max(상증법 평가액, §164⑦ 환산) 자동적용 유지. ← 최우선.
4. **회귀 금지 ②**: 주택·토지·상가 경로의 현행 취득가액 산정값 **불변**. 건물·입주권·분양권 계열은 "신고가액 총액 직수"로 **정규화**(단건은 현행과 동일; 다건에서 기존 라디오 "토지" 오선택 시 발생하던 ×면적 잠재오류는 제거되어 값이 바뀔 수 있음 — 의도된 교정).
5. `tsc` 0 · 기존 상속/양도세 테스트 GREEN · 신규 anchor 통과.

## Self-review로 확인된 핵심 사실 (설계 근거)

- **coarse 라디오는 6개 assetKind에서 표시**된다: `general_building`은 `CompanionAcquisitionCauseSection.tsx:42`에서 조기 라우팅(`GeneralBuildingAcquisitionCards` 자체 처리)되어 **이 블록 미도달**. 나머지 중 블록 내부 게이트(`:131 assetKind !== "commercial_building"`)로 상가 제외 → housing·land·**building·right_to_move_in·presale_right·redevelopment_apt**에서 라디오 노출. 이 중 건물·권리 계열엔 "토지/개별주택/공동주택" 라벨이 애초에 부적합. (redevelopment_apt는 상속 시 이 블록 + `RedevelopmentBlock` **동시 활성** — memory 관측.)
- 엔진 §164⑦ 게이트 `inheritance-acquisition-helpers.ts:142`가 `base.assetKind ∈ {house_individual,house_apart}`로 주입 판정. UI `showHouseValuation`(`PostDeemedInputs.tsx:68`)·`isPreDisclosure`(`:73-75`)도 `inheritanceAssetKind`로 게이팅. **pre-disclosure면 helper가 숨겨져**(`:198`) 픽커를 helper 안에만 두면 §164⑦이 순환적으로 깨짐 → house 판정을 상단 `assetKind`로 분리 필수.
- **엔진이 실제 구분하는 것은 land(단가×면적/legacyFallback) vs house(총액)** 이분뿐. `computeSupplementary`(`inheritance-acquisition-price.ts:258-272`): land=`floor(publishedValue×area)`, house=`floor(publishedValue)`.
- **페이로드 2종**:
  - 단건 `inheritedAcquisition`(`transfer-tax-api-inheritance.ts:46-82`): land=**총액**(UI helper가 단가×면적 완료 → `publishedValueAtInheritance`). `assetKind` :50/:70, `landAreaM2` :77-78 = **`acquisitionArea`**.
  - 다건 `inheritanceValuation`(`transfer-tax-api.ts:623-635` primary / `transfer-tax-api-helpers.ts:369-380` companion): schema상 land=**단가(원/㎡)**·house=총액(`schema-sub.ts:443`), `landAreaM2` = `acquisitionArea`.
- **landAreaM2 refine은 다건 `inheritanceValuation` land에만**(`transfer-tax-schema.ts:717-726`). 단건 `inheritedAcquisition`엔 land refine 없음.
- §164⑦ payload는 **별도 함수** `buildInheritedHouseValuationPayload:148-150`가 `inheritanceAssetKind` house로 트리거.
- **R0″ 단가/총액 이중의미**(단건 land=총액 vs 다건 land=단가)는 **선재 이슈** — 본 demote는 `publishedValueAtInheritance` 산정 로직·`assetKind=land` 전송을 그대로 두어 **동작 보존**(범위 밖).

## 설계 (정정본 — 엔진·Zod 무수정)

### A. coarse 판정을 상단 `asset.assetKind`에서 파생 (라디오 값 의존 제거)
UI 게이트 소스 변경:
- `isLand ≡ assetKind === "land"`
- `isHouse ≡ assetKind === "housing" || assetKind === "redevelopment_apt"` (재개발 아파트 현행 house 취급 보존)
- `isCommercial ≡ assetKind === "commercial_building"` (이미 `PostDeemedInputs.tsx:65`)
- 그 외(building·입주권·분양권): land도 house도 아님 → 보조계산·§164⑦ 미노출, **신고가액 직접 입력만**(토지/주택 조회 부적합 — 의도된 단순화, 취득가액=총액 직수라 결과 정확). `general_building`은 이 블록 미도달(별도 카드)이라 무관.

### B. 엔진 payload `assetKind` 파생 헬퍼 (엔진 코드 불변)
신규 `deriveEngineInheritanceAssetKind(asset)`:
```
assetKind==="land"                          → "land"      (단가×면적 / legacyFallback)
assetKind==="housing"|"redevelopment_apt"   → inheritanceAssetKind ∈{house_*}? 그값 : "house_apart"
그 외(building·rights·general·commercial)    → "house_apart"   (총액 직수 — 안전·정확)
```
적용: `assetKind:` 직대입 4곳 → 헬퍼 경유
`transfer-tax-api-inheritance.ts:50,70` · `transfer-tax-api.ts:629` · `transfer-tax-api-helpers.ts:373`.
그리고 §164⑦ 트리거 `buildInheritedHouseValuationPayload:148-150` → `isHouse`(assetKind 기반)로 변경.
→ 보조계산/픽커 상태와 무관하게 엔진 §164⑦(`helpers.ts:142`)·다건 land 안분이 항상 정확.

**왜 무수정 가능**: 파생 결과는 항상 enum(`land`/`house_individual`/`house_apart`) → Zod enum·refine(:720 land→landAreaM2, landAreaM2는 `acquisitionArea`로 현행과 동일) 불변. 엔진 :142는 파생 house 값으로 정상 판정. 상가는 엔진이 `propertyType`로 §164⑥ 처리(`helpers.ts:158`).

### C. fine 개별/공동 픽커 (housing/redevelopment 전용, 맥락 노출)
- 위치: `PostDeemedInputs`(보조계산 helper 내부 + §164⑦ 섹션 내부) 및 필요 시 `PreDeemedInputs`(case A 주택). 두 맥락에서 동일 값(`inheritanceAssetKind` = house_individual|house_apart) 세팅.
- 기본값: `addressDong && addressHo` 있으면 공동, 없으면 개별 (silent 오설정 방지 — 명시 표시). 토지·기타 자산은 픽커 없음.
- 기존 라디오 onChange의 보조계산 초기화 로직(`CompanionAcqInheritanceBlock.tsx:150-155`)은 fine 픽커 onChange로 이관.
- `HouseValuationSection.tsx:183`은 `inheritanceAssetKind`를 **읽기만** 하므로 무수정(픽커가 필드를 채움).

### D. 필드·기본값·migration
- `inheritanceAssetKind` 필드/타입/factory 기본값("land") 유지. coarse 게이트가 더는 이 값에 의존 안 하므로 stale 기본값이 non-house 자산에 남아도 세액 안전(엔진 파생이 총액 처리).
- migration 불요(기존 저장값 유효). 주택 자산 픽커 초기 표시만 동·호로 추정.

## 수정 파일 (대표)

| 지점 | 파일 | 변경 |
|---|---|---|
| coarse 라디오 제거 | `components/calc/transfer/CompanionAcqInheritanceBlock.tsx:130-159` | 상단 자산구분 라디오 삭제(§154⑧3호·상가안내·의제섹션 유지) |
| coarse 파생 + fine 픽커 | `components/calc/transfer/inheritance/PostDeemedInputs.tsx` | `isLand/isHouse` 소스→`assetKind`; 주택 개별/공동 픽커를 helper·§164⑦ 맥락에 추가 (328줄 — 여유) |
| case A 파생 | `components/calc/transfer/inheritance/PreDeemedInputs.tsx:39` | `isHouse` 소스→`assetKind`; 주택 픽커 노출(해당 시) |
| 엔진 주입 파생 | `lib/calc/transfer-tax-api-inheritance.ts:50,70,148-150` · `transfer-tax-api.ts:629` · `transfer-tax-api-helpers.ts:373` | `deriveEngineInheritanceAssetKind()` 경유 + §164⑦ 트리거 isHouse |

**무수정**: 엔진 `inheritance-acquisition-*.ts` · Zod `transfer-tax-schema*.ts` · route · `HouseValuationSection.tsx`.

## 14 동기화 지점
①②(타입·factory) 유지 · ③ migration 불요 · ④ API 변환=핵심(파생 헬퍼, 4+1 지점) · ⑤ 위젯 재배치 · ⑥ N/A · ⑦ 결과 formula 불변 · ⑧ validate(landAreaM2 land 조건은 `acquisitionArea` 기반 — 현행 유지) · ⑨⑩⑫ Zod enum/refine 불변 · ⑭ route 불변.

## 검증 (E2E + 단위)

1. `npx tsc --noEmit` 0건.
2. **회귀 anchor**(현행 동작 고정 — 정정 설계의 핵심):
   - (회귀①) 오래된 주택 상속 <2005.4.30 + 보조계산 미사용/직접입력 → 엔진 §164⑦ max 적용(파생이 assetKind=house 주입). 
   - (회귀②-a) 단건 토지 상속 → 취득가액 총액 직수(현행값 불변).
   - (회귀②-b) **다건 토지 상속**(`inheritanceValuation` 경로) → 현행 산정값·landAreaM2 검증 불변(R0″ 동작 보존 확인).
   - (회귀②-c) 건물/입주권/분양권 상속 → 신고가액 총액 = 취득가액(파생 house_apart, ×면적 없음).
   - 현대 주택 + 보조계산 OFF → 취득가액 = 신고가액(자산구분 무관 동일값).
3. **RTL**: 상속 진입 시 상단 coarse 라디오 부재 · 평가방법+신고가액만 · 주택 보조계산 ON 시 개별/공동 등장 · 기존 `e2e/commercial-inheritance-asset-kind-label.spec.ts`(상가 라디오 부재) GREEN 유지.
4. **브라우저 수동**: 주택·토지·건물·다건 시나리오 폼→계산→결과, Network body `inheritedAcquisition.assetKind`(단건)·`inheritanceValuation.assetKind`(다건)가 파생값으로 도달 확인.
5. `npx vitest run __tests__/tax-engine/transfer-tax/` + 상속 취득가액 스위트 GREEN.

## 리스크·범위 경계
- **building·입주권·분양권 상속 UI 변경**: coarse 라디오 제거로 이들은 "신고가액 직접" 단일 경로가 됨(현행의 부적합 라디오 제거 = 단순화). 취득가액 총액 직수로 결과 정확하나 **UI 동작 변화** → 회귀②-c로 명시 검증. `general_building`은 별도 카드(`:42`)라 이 변경과 무관.
- **redevelopment_apt 이중 블록**: 상속 시 이 블록 + `RedevelopmentBlock` 동시 활성(memory 관측). isHouse에 포함해 현행 보존하되, Do 착수 시 재개발 상속의 실제 §164⑦/취득가 경로가 어느 블록을 쓰는지 확인 후 픽커 노출 위치 확정.
- **R0″ 단가/총액 이중의미**(다건 land): 선재 이슈, 본 계획 범위 밖. demote는 동작 보존만 보장(회귀②-b로 고정). 별도 트랙 권고.
