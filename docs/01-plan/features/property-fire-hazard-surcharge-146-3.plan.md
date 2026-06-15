# 재산세 화재위험 건축물 소방분 중과 (§146③2호·2의2호) 구현 계획서

> 작성일: 2026-06-16 · 세목: 재산세(property) · 후속 갭 #2
> worktree: `.claude/worktrees/fire-hazard-surcharge` (branch `feat/property-fire-hazard-146-3`, origin/master 기준)
> 근거: 지방세법 §146③2호·2의2호 + 시행령 §138①②③ (KoreanLaw MCP 본문 검증 완료)

## 1. 배경 — 무엇이 미구현인가

재산세 후속 갭 #2. 현행 소방분 지역자원시설세는 **§146③1호 6구간 누진만** 구현되어 있고, 화재위험 건축물에 대한 **200%/300% 중과(§146③2호·2의2호)는 미구현**.

현행 코드 실측(worktree):
- `lib/tax-engine/property-tax-surtax.ts` — `calcRegionalResourceTax()`(§146③1호 6구간 누진)만 존재. `calcSurtax()`가 `objectType === "building"`일 때 base 소방분만 산출.
- `grep "화재|fire|중과"` → property-tax-surtax.ts·types 에 0건(주석 외).
- 즉 화재위험 건축물도 일반 소방분 세율만 적용 → 실제보다 과소 산출.

## 2. 법령 근거 (검증 완료)

### 지방세법 §146③ (MST 282559, 시행 2026-04-24)
- **1호**: 건축물 가액·시가표준액 기준 6구간 표준세율(4~12/10,000) → base 소방분. **(구현됨)**
- **2호**: *"저유장, 주유소, 정유소, 유흥장, 극장 및 4층 이상 10층 이하의 건축물 등 대통령령으로 정하는 **화재위험 건축물**"* → **제1호 산출액의 100분의 200**을 세액으로.
- **2의2호**: *"대형마트, 복합상영관, 백화점, 호텔, 11층 이상의 건축물 등 대통령령으로 정하는 **대형 화재위험 건축물**"* → **제1호 산출액의 100분의 300**을 세액으로.

> "100분의 200을 세액으로 한다" = 1호 산출액 **× 2** (200% 가산이 아니라 결과가 200%). 2의2호 = **× 3**.

### 시행령 §138 (MST 286395, 시행 2026-06-01) — 대통령령 위임 목록
- **§138①(2호, ×2)**: ⑴ 주거용 아닌 4~10층 건축물(지하·옥탑 제외), ⑵ 특정소방대상물 중 학원·위락시설·극장/영화상영관·판매시설·여객터미널·숙박(60㎡↑)·장례식장·공장·창고·주차용 건축물·위험물 시설·병원급 의료기관 등. (단, §138② 대형에 해당하면 제외)
- **§138②(2의2호, ×3)**: ⑴ 주거용 아닌 11층 이상, ⑵ 500㎡↑ 유흥주점·대형 영화상영관(10관↑/500석↑/지하)·1만㎡↑ 판매시설·5층↑ 50실↑ 숙박·1.5만㎡↑ 공장·창고·지정수량 3천배↑ 위험물·3만㎡↑ 복합건축물·100병상↑ 대형 의료기관 등.
- **§138③**: 1동 건축물이 화재위험 용도와 그 밖 용도로 겸용·구분사용 시 과세표준·세액 산정은 **행정안전부령**(시행규칙)으로 위임 → **v1 범위 외**(미확정 §9 참조).

## 3. 계산식 (정수 연산)

```
baseFireTax = calcRegionalResourceTax(publishedPrice)   // §146③1호 (기존)
multiplier  = fireHazardClass === "large_fire_hazard" ? 3
            : fireHazardClass === "fire_hazard"        ? 2
            : 1                                          // none/미지정
regionalResourceTax = baseFireTax * multiplier           // 정수 곱 — floor 불요
```
- `multiplier`는 정수(1/2/3)이므로 추가 절사 없음(`applyRate` 불필요).
- **적용 대상**: `objectType === "building"` 만 (소방분 자체가 건축물·선박 한정 §146④. 선박 소방분은 별도 사전 갭).
- base 소방분이 0(`objectType !== "building"`)이면 multiplier 무의미 → land/housing 무영향.

### Anchor 예시 (건축물 시가표준액 1억원)
| 항목 | 값 |
|---|---|
| §146③1호 base | 49,100 + (100,000,000−64,000,000)×12/10,000 = 49,100 + 43,200 = **92,300** |
| fire_hazard (×2) | 92,300 × 2 = **184,600** |
| large_fire_hazard (×3) | 92,300 × 3 = **276,900** |
| none | **92,300** (불변) |

## 4. 입력 설계 (3-level 자기분류)

시행령 §138 목록은 소방시설법 별표2 기반으로 극도로 세분 → 엔진이 전 taxonomy를 인코딩하는 것은 부적절(dual-truth·유지보수 위험). **사용자 자기분류 3단계 셀렉터**를 제공하고 각 단계 hint에 대표 예시를 나열한다.

```ts
export type FireHazardClass = "none" | "fire_hazard" | "large_fire_hazard";
// PropertyTaxInput
fireHazardClass?: FireHazardClass;  // objectType==="building" 전용. 미지정=none(×1)
```
- UI: 건축물 분기에서 `RadioCardGroup`(rose tone — 지역·위험 정보). **option value ↔ enum 정확 매핑**(`enum-verification`):
  - `"none"` → 일반 (×1)
  - `"fire_hazard"` → 화재위험 건축물 (×2) — hint: "주거용 아닌 4~10층·학원·극장·유흥장·숙박·공장·창고·주유소·위험물시설 등 (시행령 §138①)"
  - `"large_fire_hazard"` → 대형 화재위험 건축물 (×3) — hint: "주거용 아닌 11층↑·대형마트·백화점·호텔·복합상영관·3만㎡↑ 복합건축물 등 (시행령 §138②)"
- **②(대형) 우선 안내(§138① 단서)**: ①·② 모두 해당하는 건축물은 시행령 §138① 단서("제2항 각 호에 해당하는 건축물은 제외")로 **①(×2)에서 제외되고 ②(×3)로 분류**됨 → hint에 "대형 요건을 충족하면 '대형 화재위험'을 선택" 명시.

## 5. 파이프라인 통합 위치

`calcSurtax()`(property-tax-surtax.ts)가 base 소방분을 산출하는 지점에 multiplier 적용. **신규 optional 파라미터** `fireHazardClass` 추가:

```ts
export function calcSurtax(
  determinedTax, taxBase, publishedPrice, objectType, isUrbanArea,
  fireHazardClass?: FireHazardClass,   // ← 신규 (optional — land 호출부 무변경)
) {
  ...
  const baseFireTax = objectType === "building" ? Math.max(0, calcRegionalResourceTax(publishedPrice)) : 0;
  const fireHazardMultiplier = objectType === "building" ? resolveFireHazardMultiplier(fireHazardClass) : 1;
  const regionalResourceTax = baseFireTax * fireHazardMultiplier;
  ...
}
```
- **orchestrator 호출 4지점**(property-tax.ts:516·583·642·710): land 3지점(516·583·642)은 `objectType="land"` early-return → 신규 인자 **불요**(optional). **non-land 공통 경로 710만** `input.fireHazardClass` 전달(housing/building/vessel/aircraft 공유 — building 외에는 calcSurtax 내부 `objectType==="building"` 게이트로 무영향).
- `resolveFireHazardMultiplier()` 단일 헬퍼(dual-truth 차단) + `PROPERTY_CONST.FIRE_HAZARD_MULTIPLIER`(2)·`LARGE_FIRE_HAZARD_MULTIPLIER`(3) 상수.

## 6. 동기화 지점 (재산세 8지점 + Zod)

| # | 지점 | 파일·위치 | 작업 |
|---|---|---|---|
| 엔진-T | 타입 | `types/property.types.ts` | `FireHazardClass` 타입 + `PropertyTaxInput.fireHazardClass?` / `PropertySurtaxDetail`에 `regionalResourceTaxBeforeSurcharge?`·`fireHazardMultiplier?` 추가 |
| 엔진-C | 법령 상수 | `legal-codes/property.ts` | `PROPERTY.FIRE_HAZARD_SURCHARGE = "지방세법 §146③2호·2의2호"` / `PROPERTY_CONST.FIRE_HAZARD_MULTIPLIER=2`·`LARGE_FIRE_HAZARD_MULTIPLIER=3` |
| 엔진-F | 계산 | `property-tax-surtax.ts` | `resolveFireHazardMultiplier()` + `calcSurtax` 6번째 param + multiplier 적용. orchestrator 710 전달 |
| ① | FormState | `components/calc/property/shared.ts` | `fireHazardClass: string`(기본 "none") |
| ② | INITIAL_FORM | 동상 | `fireHazardClass: "none"` |
| ③ | normalize | **해당 없음**(property component-local) |
| ④ | API 변환 | 동상 `buildPropertyTaxRequestBody` | `objectType==="building"` + ≠"none" 시 `body.fireHazardClass` 전송 |
| ⑤ | UI 위젯 | `components/calc/property/Step0.tsx` | 건축물 분기 `buildingType` RadioCardGroup 직하 `RadioCardGroup`(rose) |
| ⑥ | 사이드바 | **해당 없음** |
| ⑦ | 결과 카드 | `components/calc/results/PropertyTaxResultView.tsx` | 부가세 섹션 지역자원시설세 행에 "화재위험 중과 ×2/×3" 표기(중과 시) |
| ⑧ | Validation | 동상 `validateStep` | optional·기본 none → 차단 없음. (refine은 enum이라 형식 안전) |
| ⑫ | Zod | `lib/validators/property-input.ts` | `fireHazardClass: z.enum([...]).optional()` + building 외 refine(`buildingType` 패턴 차용) |
| ⑭ | Route | **자동**(`parsed.data as PropertyTaxInput` 직접 캐스트) |

## 7. 작업 순서 (PDCA Do — 시퀀셜)

1. **엔진 시니어**(`property-tax-senior`): 엔진-T·C·F → `resolveFireHazardMultiplier`·`calcSurtax` 확장 + anchor.
2. **Pre-Do anchor**(`pre-do-anchor-verification`): §3 anchor(1억 → 184,600/276,900) 우선 작성·실행 → 실패 확보.
3. **UI 시니어**(`property-tax-ui-senior`): ①②④⑤⑦⑧⑫ 동기화.
4. **Check**: `ui-engine-sync-checker`(8지점) + `bkit:gap-detector`.

## 8. 테스트 계획

`__tests__/tax-engine/property-tax.test.ts` (또는 분할):
- **FH-1**: 건축물 1억 / fire_hazard → regionalResourceTax 184,600.
- **FH-2**: 건축물 1억 / large_fire_hazard → 276,900.
- **FH-3**: 건축물 1억 / none(미지정) → 92,300 (기존 불변·회귀).
- **FH-4**: 주택·토지 + fireHazardClass 지정 → 무시(regionalResourceTax 0, 기존 결과 불변).
- **FH-5**: 경계 — base 소방분 0(저액 건축물) × multiplier = 0.
- **FH-6**: UI `buildPropertyTaxRequestBody` — 건축물+화재위험 전송 / 주택은 미전송 / none 미전송.
- **E2E**: 건축물+대형 화재위험 → 결과 "화재위험 중과 ×3" 표기.

## 9. 리스크·미확정 (확인 필요)

- **§138③ 겸용·구분사용**: 1동이 화재위험 용도와 그 밖 용도 혼재 시 과세표준·세액 산정은 **행안부령 위임** → v1은 **단일 용도 자기분류만** 지원. 겸용 안분은 후속(시행규칙 본문 확인 필요).
- **선박 소방분**: §146④는 건축물+선박 대상이나 현행 엔진은 건축물만(`objectType==="building"`). 선박 소방분·그 화재위험 중과는 **별도 사전 갭** — 본 계획 범위 외.
- **housing 건물분 소방분(§146④ 단서)과 무관**: 화재위험 중과는 `objectType==="building"` 전용. 주택의 건축물 부분 소방분(갭 #3)은 별개 — 본 계획은 building 소방분에만 multiplier 적용.
- **§146⑤ 조례 50% 가감**: 지자체 조례 가감은 표준세율 계산기 범위 외(중립적 표준세율 산출).
- **결과 뷰 표기 방식**: 중과 시 base→×배율→최종 3행으로 펼칠지, 단일행+배지로 할지 UI 시니어가 Do 시 `PropertySurtaxDetail` echo 필드로 결정.
- **Pre-Do 브라우저 확인**: 건축물 선택 → 화재위험 라디오 → Network body `fireHazardClass` 도달 + 결과 표기 (E2E 또는 명시적 미수행).
