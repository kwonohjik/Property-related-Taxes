# 영농상속공제 상속인별 자격 명시 override (PR5) — 설계

> 상위 계획: `docs/00-pm/inheritance-remaining-credit-deduction-gaps.plan.md` §3-a (그룹 ③-a, 권장 PR 5순위)
> 단계: Design · 도메인: 상속세 영농상속공제(§18의3 + 시행령 §16③⑤)
> KoreanLaw 검증: 시행령 §16③(상속인 요건)·§16⑤(자격자 분배분) — `20f75e2`에서 검증 완료

## Context

부록 A(`heirAssessments`)는 상속인별 자격을 평가해 `deriveQualifiedHeirIds`로 자격자를 자동 도출하고, §16⑤ 자격자 분배분만 영농상속재산가액에 합산(suggest). 사용자는 FarmingEligibilitySection에서 `qualifiedHeirIds`를 수동 선택할 수도 있다(line 494-518 토글).

**갭**: `step4-5.tsx:69-73`(`farmingWithDerivedIds`)·`79-87`(`farmingEligible`)이 heirAssessments 입력 시 **`deriveQualifiedHeirIds`(자동도출)로 사용자 명시 `qualifiedHeirIds`를 무조건 덮어씀** → 수동 선택이 farmingAssetValue 제안·eligible 판정에 무시됨. UI(수동 선택 제공)와 모순. (types.ts:86 "사용자 명시 보장 옵션은 미지원 — 별도 PR".)

## 해결 — 명시 override 우선 (순수 헬퍼)

`resolveEffectiveQualifiedHeirIds(farming)`:
- `heirAssessments === undefined` → `farming.qualifiedHeirIds` (legacy 경로 — 자동도출 미사용)
- `heirAssessments` 입력 + `qualifiedHeirIds` 명시값 존재 → **명시값 우선(override)**
- `heirAssessments` 입력 + `qualifiedHeirIds === undefined` → `deriveQualifiedHeirIds`(자동도출)

## ★ 케이스 인벤토리

| # | 케이스 | heirAssessments | qualifiedHeirIds | 결과 |
|---|---|---|---|---|
| FH-OVR-1 | legacy (부록 A 미사용) | undefined | undefined | undefined (폼-수준 평가) |
| FH-OVR-2 | legacy + 수동 자격자 | undefined | [h1] | [h1] (기존 — 자동도출 무관) |
| FH-OVR-3 | 부록 A 자동도출 | [평가들] | undefined | deriveQualifiedHeirIds 결과 |
| FH-OVR-4 | **부록 A + 명시 override** | [평가들] | [h2] | **[h2] (명시 우선 — override)** |
| FH-OVR-5 | override가 자동과 다름 | [h1 자격]평가 | [h1,h2] | [h1,h2] (사용자 책임 — §16③ 경고 배지) |

> FH-OVR-4가 핵심 fix. FH-OVR-3가 회귀(기존 자동도출 동작 보존 — qualifiedHeirIds undefined).

## 엔진/로직 변경

1. **`resolveEffectiveQualifiedHeirIds`(inheritance-deductions.ts)** 신규 — 위 우선순위 순수 함수. `deriveQualifiedHeirIds` 재사용.
2. **`step4-5.tsx`**:
   - `farmingWithDerivedIds`(69-73): `resolveEffectiveQualifiedHeirIds` 사용 → 명시 override 우선.
   - `farmingEligible`(79-87): heirAssessments 입력 시 `resolveEffectiveQualifiedHeirIds(...).length > 0`로 판정 (override 반영).

## UI 변경

- **FarmingEligibilitySection**: 명시 override 감지 시 **경고 배지** — "법령 자동판정(§16③)과 다를 수 있습니다. 명시 지정 자격자 기준으로 영농상속재산가액이 산정됩니다." (중립적 사실 — 유불리 표현 금지, [[feedback_tax_calculation_principle]]).
  - **override 감지 (L-3)**: `heirAssessments !== undefined && qualifiedHeirIds !== undefined && (정렬한 qualifiedHeirIds ≠ 정렬한 deriveQualifiedHeirIds)`. 두 배열이 같으면 경고 미표시(명시했으나 자동과 동일).
- 기존 수동 토글(line 494-518)·자동도출 안내(461) 유지.

## anchor

- FH-OVR-3 (회귀): `resolveEffectiveQualifiedHeirIds({heirAssessments:[...], qualifiedHeirIds:undefined})` === `deriveQualifiedHeirIds` 결과.
- FH-OVR-4: `resolveEffectiveQualifiedHeirIds({heirAssessments:[...], qualifiedHeirIds:["h2"]})` === `["h2"]` (override).
- FH-OVR-1·2 (legacy): heirAssessments undefined → qualifiedHeirIds 그대로.
- 회귀: 기존 `deriveQualifiedHeirIds`·영농 anchor 전수 불변.

## 동기화 지점

- `qualifiedHeirIds`는 **기존 필드** — 신규 필드 없음. types 변경 없음.
- ⑤ UI: step4-5 파생 로직 + 경고 배지. ⑥ suggest 반영(farmingAssetValue). 입력 구조 불변 → ①~④·⑧~⑭ 변경 없음.

## Silent fallback 식별

- override는 사용자 명시 입력. 자동 추정 없음. 미설정 시 자동도출(부록 A 의도된 기본). fallback 아님.

## 범위 외

- heirAssessmentMode enum 신설 불요 (qualifiedHeirIds undefined 여부로 모드 구분).
