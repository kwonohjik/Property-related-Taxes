# 겸용주택 양도시 개별주택공시가격 단일 입력화 (B안) — 수정 계획서 (v2)

> 이미지20: 상단(양도 sub-block)의 "양도시 개별주택공시가격"과 하단(PHD 패널)의 "양도시 개별주택가격"이 중복. **PHD ON일 때 하단 하나로 단일화**한다.
> v2: 코드 재검증으로 legacy 경로·`phdTransferHousingPrice` 필드·E2E 실측 반영(오류·누락·모순 정정).

## 1. 핵심 제약

`mixedTransferHousingPrice`(양도시 개별주택공시가격)는 **양도가액 계산에 항상 필요**(취득 미공시 여부 무관). 중복은 **PHD ON일 때만** 발생(PHD OFF에선 하단 패널 미렌더 → 상단만 존재 = 중복 아님). 따라서 "상단을 없앤다"는 **PHD ON일 때만 상단을 숨기고, PHD OFF에선 상단을 유지**로 구현한다.

## 2. 검증된 현행 구조 (코드 실측)

### 2.1 렌더 분기 — `MixedUseStandardPriceInputs.tsx:38`
- `hasPartialUsageChange === true` → **`MixedUseLegacyStdPrice`** (용도변경 경로)
- else → **`MixedUseAssetMajorStdPrice`** (이미지20, 비-용도변경 경로)

### 2.2 `MixedUsePreHousingDisclosureSection`(하단 PHD 패널)은 **두 경로 모두**에서 렌더
- `MixedUseAssetMajorStdPrice.tsx:145`
- `MixedUseLegacyStdPrice.tsx:203`
→ 이 컴포넌트의 ④ 양도시 개별주택가격을 편집화하면 **양 경로에 동시 반영**된다. (v1의 "asset-major 한정" 가정은 오류.)

### 2.3 상단 양도시 입력 (경로별로 별도 존재, 둘 다 `mixedTransferHousingPrice` write)
| 경로 | 위치 | 게이팅 |
|---|---|---|
| AssetMajor | `MixedUseAssetMajorStdPrice.tsx:112–122` (양도 sub-block 전체 = 개별주택공시가격 1개) | 없음(항상) |
| Legacy | `MixedUseLegacyStdPrice.tsx:109–116` (개별주택공시가격 `FieldCard`) — 같은 emerald sub-block에 `{!isCaseA}` 상가 필드(118–168)도 있음 | 없음(항상) |

### 2.4 하단 ④ 양도시 개별주택가격 — `MixedUsePreHousingDisclosureSection`
- 현행(직전 커밋 예정분): Row 2 오른쪽, **read-only 미러**(`mixedTransferHousingPrice` read), `자동` 배지.
- **`isCaseA` 게이팅 없음 → Case A에서도 항상 렌더.**

### 2.5 필드·엔진 배선 (실측)
- **별개 필드 2개**: `mixedTransferHousingPrice`(겸용, 상단·하단이 쓰는 값) vs `phdTransferHousingPrice`(**단독주택 PHD** `PreHousingDisclosureSection.tsx:133` 전용, 겸용 미사용).
- **API**(`transfer-tax-api.ts`): `:150` `housingPrice = parseAmount(mixedTransferHousingPrice)||0`; `:193–206` PHD 양도분은 **`phdTransferHousingPrice || mixedTransferHousingPrice`**(phd 우선). 겸용 자산은 `phdTransferHousingPrice`가 항상 `""`라 `mixedTransferHousingPrice`로 귀결.
- **Validation**(`transfer-tax-validate-asset.ts:333,342–346`): `phdTransferHousingPrice || mixedTransferHousingPrice` fallback로 `mixedTransferHousingPrice` 인정.
→ **하단은 반드시 `mixedTransferHousingPrice`에 write**(phd 아님). 현행 미러 소스와 동일 → API·validation **무변경**.

## 3. 설계 (조건부 숨김 + 동일 필드 편집)

동일 폼 필드 `mixedTransferHousingPrice`를 두 위치에서 **상호배타적으로** 노출(CLAUDE.md「같은 의미 폼 필드 양방향 read/write」, 신규 필드 X):

| PHD 상태 | 상단(양도 sub-block) | 하단(PHD 패널 ④) |
|---|---|---|
| **OFF** | ✅ 표시·편집 (유일 입력) | 패널 미렌더 |
| **ON** | ❌ 숨김 | ✅ 표시·편집 |

→ 어느 상태·경로에서도 양도시 입력란 정확히 1개.

## 4. 변경 파일 (3개, UI-only)

### 4.1 `MixedUseAssetMajorStdPrice.tsx` — 상단 양도 sub-block 조건부 숨김
`112–122` 양도 sub-block 전체를 `{!asset.usePreHousingDisclosure && ( … )}` 로 감싼다. (취득 sub-block이 이미 `:152`에서 동일 패턴 사용 — 대칭.)

### 4.2 `MixedUseLegacyStdPrice.tsx` — 상단 개별주택공시가격 숨김 (빈 박스 방지 포함)
`109–116` **개별주택공시가격 `FieldCard`만** `{!asset.usePreHousingDisclosure && ( … )}` 로 감싼다.
- emerald sub-block 래퍼·헤더·`{!isCaseA}` 상가 필드(118–168)는 유지(상가는 중복 아님·PHD 무관).
- **⚠️ 빈 박스 방지(2차 검토 발견)**: emerald sub-block 내용은 `[헤더 + FieldCard + {!isCaseA}상가]`. **Case A(항상 PHD ON)** 에서는 FieldCard 숨김 + 상가도 `{!isCaseA}`로 숨겨져 **헤더만 남는 빈 박스**가 된다. → emerald sub-block **`<div>` 전체를 `{!(isCaseA && usePreHousingDisclosure) && ( … )}`** 로 감싸 Case A+PHD ON에서 sub-block 자체를 미렌더. (non-Case-A + PHD ON은 상가 필드가 남아 정상.)
  - 정리: FieldCard는 `{!usePreHousingDisclosure}`, emerald sub-block 래퍼는 `{!(isCaseA && usePreHousingDisclosure)}` — 이중 가드.
- PHD OFF 시 취득 직접입력은 기존 `:211,215` `{!isCaseA && direction!=="commercial_to_house" && !usePreHousingDisclosure}` 로 이미 처리 — 무변경.

### 4.3 `MixedUsePreHousingDisclosureSection.tsx` — 하단 ④ read-only → 편집 입력
Row 2 오른쪽 칸을 편집 `CurrencyInput`(`mixedTransferHousingPrice` write, `required`, placeholder "양도시 개별주택공시가격")으로 교체. `자동` 배지·read-only div 제거. → Row 2 = 최초 고시 개별주택가격 | 양도시 개별주택가격(둘 다 편집, 이미지19 두번째 행과 동형).

## 5. Case A(용도변경 + 최초공시<용도변경) 취급

- Case A는 legacy 경로(`hasPartialUsageChange`)에서 `isCaseA=true`. 하단 ④는 `isCaseA` 무관하게 렌더되므로 **편집화가 Case A에도 적용**됨.
- legacy 상단(4.2)을 PHD ON에서 숨기면, Case A의 기존 방침("모든 입력은 PHD 블록으로 통합", `MixedUseLegacyStdPrice.tsx:210`)과 **일관**. (Case A는 항상 PHD ON 진입.)
- **브라우저 검증 필수**: Case A에서 하단 ④ 편집값이 양도가액 산정에 정상 반영되는지(4부분 안분과 충돌 없는지). 충돌 우려 시 ④를 `!isCaseA` 로 게이팅하는 대안 검토.

## 6. 영향 범위 — 엔진/API/validation 무변경
- 신규 폼 필드 없음. 세 위치 모두 기존 `mixedTransferHousingPrice` write → 14 동기화 지점 무관.
- API·Validation 기존 fallback 유지(§2.5). `useEffect→store` 미러링 없음(직접 write) → 무한 루프 위험 없음.

## 7. 회귀 검증 (E2E 실측 반영)
- **실측**: `e2e/*.spec.ts` 전수 grep 결과 **양도시 개별주택공시가격 입력란을 채우는 스펙 없음**(`mixedTransferHousingPrice`·"개별주택공시가격" 0건). → v1의 "셀렉터 이관 필요"는 과장, 이관 대상 없음.
- 단, 아래 스펙이 겸용 PHD 패널을 **렌더**하므로 상단 숨김·하단 편집화 후에도 통과 확인:

| 스펙 | 지점 |
|---|---|
| `e2e/transfer-phd-building-stdprice-calculator.spec.ts` | T4·T5·T7(겸용 PHD·Case A 배치) |
| `e2e/mixed-use-case-a-asset-major.spec.ts` | Case A 전치 구조 |
| `e2e/mixed-use-exclusive-common-area.spec.ts` | 부수토지 면적 |

## 8. Definition of Done
- [ ] AssetMajor 상단 양도 sub-block `{!usePreHousingDisclosure && …}` 숨김 (4.1)
- [ ] Legacy 상단 개별주택공시가격 FieldCard `{!usePreHousingDisclosure}` 숨김 + emerald sub-block 래퍼 `{!(isCaseA && usePreHousingDisclosure)}` 이중 가드(빈 박스 방지), 상가 필드 유지 (4.2)
- [ ] 하단 ④ 편집 `CurrencyInput`(`mixedTransferHousingPrice` write, `required`)으로 전환·배지 제거 (4.3)
- [ ] PHD ON: 하단만 / OFF: 상단만 — 양 경로 모두 양도시 입력 정확히 1개
- [ ] PHD 토글 ON↔OFF 전환 시 값 보존(동일 필드) 확인
- [ ] **Case A: 하단 ④ 편집값 양도가액 반영·4부분 충돌 없음 브라우저 확인** (§5)
- [ ] `npx tsc --noEmit` 0건 / ESLint clean
- [ ] E2E 3종 통과
- [ ] 스크린샷 — AssetMajor·Legacy 각각 PHD ON(하단만)/OFF(상단만)

## 9. 미결/판단
- 본 B안은 v1 대비 **legacy·Case A까지 범위 확장**(3파일). 단순 중복 제거만 원하면 A안(하단 미러 삭제, 상단 유지)이 1파일·위험 0이나, 사용자가 B(하단 단일화) 선택 → 상기 확장 반영.
- ④ 편집화가 Case A 4부분 안분과 충돌 시: ④를 `{!isCaseA}` 게이팅(Case A는 하단 ThreePoint/asset-major 위젯이 양도 흡수)하는 fallback 설계 준비.
