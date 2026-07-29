# 겸용주택 Case A(용도변경 4부분) 기준시가 입력 — 자산-우선 전환 (Plan)

- 상태: **Do + E2E 검증 완료 ✅ (커밋 대기)** — tsc 0·eslint 0·3034 테스트 0 회귀·Case A baseline anchor 불변·Excel 4부분 anchor 통과·transfer-phd E2E(T1~T10) 통과·신규 Case A 전치 구조 E2E 통과.
  - ✅ 헤더 재라벨 완료: Case A 시 "양도시 개별주택공시가격" / "주택·상가 기준시가 (취득·최초공시·양도 3시점)".
- 작성일: 2026-07-09
- 선행: [`mixed-use-asset-major-stdprice-layout.plan.md`](./mixed-use-asset-major-stdprice-layout.plan.md) (✅PR#541 — 용도변경 없음 경로 자산-우선 완료)
- 대상: `isMixedUseHouse && hasPartialUsageChange && direction==="house_to_commercial" && 최초공시일 < 용도변경일` (= **Case A / splitMode**)

> **검토 이력**: STEP 1 3-fork 병렬(오류+누락 / 모순+정책위반 / 개선+UI누락) → **옵션 B→A 피벗**(사용자 승인) + 정정 12건 반영. 상세 §10.

---

## 0. 결정 (재고 권고 후)

Case A 자산-우선 전환은 빈도 낮음·정밀 산식(§166⑥·집행기준 99-164-10)이나, 사용자가 **완전 전치**를 선택. 구현 방식은 self-review 결과 **옵션 A**로 확정:

- **옵션 A(채택)**: `ThreePointStandardPriceInput`에 `layout:"asset-major"`를 **additive·gated**로 추가(기본 time-major → 일반 PHD·case1/2 무영향). **⚠️ 정직 재특성화(STEP13)**: asset-major는 "prop 토글로 기존 렌더 축만 바꾸는" 게 아니라 — PointBlock이 시점당·양쪽자산 단위라 재사용 불가 → **신규 렌더 트리(~150줄: 단일자산·단일시점 셀 + 자산별 합계) 신설**이다. **splitMode(데이터·6값 배치 라우팅)는 유지**하고 layout(표시 축)은 **직교(orthogonal)**. PHD 스칼라·배치 모달·토지 auto·건물 필드 **배선은 전부 재사용**(중복 최소), 렌더 트리만 신설.
- **옵션 B(기각)**: bespoke 전면 재구현 → PHD 스칼라·6값 모달·토지 auto·양도 4부분·sub-block 대규모 중복·drift(fork2#1·fork3#1·#2).

**옵션 A는 공유 `ThreePointStandardPriceInput`을 additive로 수정**(gated라 회귀 위험 낮음). "공유 무손상"은 포기하되 중복·drift를 피한다.

---

## 1. 현행 Case A 구조 + 필드 매핑 (실측)

**시점-우선 + splitMode.** `hasPartialUsageChange`면 오케스트레이터가 `MixedUseLegacyStdPrice`로 라우팅(✅PR#541).

```
MixedUseLegacyStdPrice (isCaseA 분기)
├─ 개별주택공시가격(mixedTransferHousingPrice)  ★ isCaseA 삼항 밖 공용 렌더 (~:116)
├─ ② 양도시 (emerald) — 4부분 통합 레이아웃 (원 :120-193)
│    LandPriceLookupField(전체토지 공시지가) → 주택분/상가분 토지(auto)
│    → 주택건물[phdBuildingStdPriceAtTransfer] + 상가건물[mixedTransferCommercialBuildingPrice] (각 모달) → 4부분 합산
└─ ③ 취득시 (amber) — PHD 토글 → MixedUsePreHousingDisclosureSection
     PHD 스칼라: 주택부수토지면적(:114-132)·최초고시일(:134-144)·최초고시 개별주택가격(:159-174)·양도시 개별주택가격 read-only(:176-191)·pre1990 조건부(:193-212)
     PhdBuildingStdPriceModalButton (배치 — 6값 일괄 산출: 3시점×주택/상가)  :220 enableBatchCalc
     ThreePointStandardPriceInput (splitMode=true, hideTransferColumn=true)
       취득·최초공시 PointBlock: 주택분/상가분토지(auto) + 주택건물/상가건물(input). 양도 PointBlock 숨김(→ 위 ② 4부분)
```

### 필드 매핑 (Case A 4부분 × 3시점)

| | 취득 | 최초공시 | 양도 |
|---|---|---|---|
| 주택건물 | `phdBuildingStdPriceAtAcq` | `phdBuildingStdPriceAtFirst` | `phdBuildingStdPriceAtTransfer` |
| 상가건물 | `mixedAcqCommercialBuildingPrice`¹ | `phdCommercialBuildingStdPriceAtFirst` | `mixedTransferCommercialBuildingPrice` |
| 토지 ㎡당(공유) | `phdLandPricePerSqmAtAcq` | `phdLandPricePerSqmAtFirst` | `phdLandPricePerSqmAtTransfer` |
| 면적 | 주택분=autoLandArea, 상가분=totalLand−autoLandArea (양도시 면적 기준) | | |

**PHD 스칼라(3시점 무관, 필수)**: `mixedTransferHousingPrice`(양도 개별주택공시가격)·`phdFirstDisclosureDate`·`phdFirstDisclosureHousingPrice`·`phdResidentialLandArea`·pre1990군.

- ¹ 취득 상가건물: API read = `phdCommercialBuildingStdPriceAtAcq ∥ mixedAcqCommercialBuildingPrice`(`transfer-tax-api.ts:213·218`). **신규 UI write = `mixedAcqCommercialBuildingPrice`**(현행 splitMode 동일, `phd*`는 deprecated `""` — `MixedUsePreHousingDisclosureSection:249`).
- **🔴 `mixedTransferHousingPrice`는 PHD payload 게이트**(`transfer-tax-api.ts:189-190` `phdTransferHousingPrice>0 ∥ mixedTransferHousingPrice>0`) + `transferHousingPrice`(`:200-202`) 전달. **없으면 `preHousingDisclosure=undefined` → Case A 전면 붕괴**(fork1#1). 반드시 입력 위젯 유지.
- **엔진 소비**: `transfer-tax-api.ts:210-223` — `preHousingDisclosure`에 `commercialBuildingStdPriceAtAcq`·`commercialBuildingStdPriceAtFirstDisclosure`·`totalTransferPriceForFourPart`(Case A 게이트) + phd 3시점 건물·토지.

**splitMode 렌더**: `ThreePointStandardPriceInput.tsx:454-537`(4부분 입력) + `:577-600`(4부분 합계). **blast-radius**: 사용처 = `PreHousingDisclosureSection`(일반, split 미사용)·`MixedUsePreHousingDisclosureSection`(겸용, splitMode). → `layout` prop은 겸용 Case A에서만 asset-major, 나머지 기본 time-major → **회귀 격리**.

---

## 2. 목표 레이아웃 (옵션 A)

**tone**: 자산 헤더 중립(slate). sub-block 취득=amber·최초공시=violet·양도=emerald(위젯 기존 tone 계승, `ThreePoint:676/702/728`). ④거주 violet과 최초공시 violet 인접 중복은 **Design 동결**(§11). **시점 순서 = 취득→최초공시→양도**(위젯 계승, fork3#3). 토지 ㎡당은 **`LandPriceLookupField`×3 필수**(fork3#5).

```
겸용주택 분리계산 (Case A)
├─ ① 면적 (부모 MixedUseAreaInputs, 불변)
├─ [PHD 공통 스칼라]  주택부수토지면적 · 최초고시일 · 최초고시 개별주택가격 · 양도시 개별주택공시가격(입력) · pre1990(조건부)
├─ [6값 일괄 계산] PhdBuildingStdPriceModalButton (기존 배치 모달 재사용 — 3시점×주택/상가 산출)
├─ ② 주택 기준시가  [헤더 중립]
│    취득 [amber]   주택건물[phdBuildingStdPriceAtAcq] + 주택분토지(auto)
│    최초공시 [violet] 주택건물[phdBuildingStdPriceAtFirst] + 주택분토지(auto)
│    양도 [emerald]  주택건물[phdBuildingStdPriceAtTransfer] + 주택분토지(auto)
├─ ③ 상가 기준시가  [헤더 중립]
│    취득/최초공시/양도  상가건물[mixedAcq…/phdCommercial…First/mixedTransfer…] + 상가분토지(auto)
├─ [토지 ㎡당 3시점]  취득/최초공시/양도 LandPriceLookupField ×3 (주택·상가 공유, 배치는 §11)
├─ ④ 거주 · ⑤ 수도권 (불변)
```

> 별도 legacy "양도시 4부분 섹션"은 **제거** — 위젯이 asset-major로 양도까지 흡수(hideTransferColumn 불필요).

**성공 기준**: 재편 전후 동일 입력 → 동일 엔진 페이로드(anchor 불변) · Excel Case A 4부분 anchor 통과 · E2E T6 대체 통과 · tsc 0 · 일반 PHD·case1/2 회귀 0.

---

## 3. 핵심 안전성 근거

API가 공유 필드만 읽으므로 UI 위치·배치 이동은 페이로드 불변(§1 필드가 그대로 write 대상). **엔진·Zod·validation 무변경.** 14 지점 중 ⑤(UI 위젯) **재구성**(단순 이동 아님 — write 누락 위험 있어 §8 anchor로 방어). `mixedTransferHousingPrice` 게이트(§1) 유지가 전제.

---

## 4. 구현 방식 (옵션 A 상세)

1. **`ThreePointStandardPriceInput`에 `layout?: "time-major" | "asset-major"`(기본 time-major) — splitMode와 직교(STEP13)**:
   - time-major(현행): 시점별 3 PointBlock, splitMode 시 각 블록 내 주택/상가 4부분. **무변경.**
   - asset-major(신규): **splitMode=true는 유지**(파생 데이터·6값 배치 라우팅 `commercialAcqFirstMode`·`enableCommercial` 의존). layout=asset-major일 때 3-PointBlock 렌더 대신 **신규 렌더 트리**(2 자산 그룹 × 3시점 셀 = 건물 input + 그 자산분 토지 auto + 자산별 합계). PointBlock **미재사용**. 양도 표시(hideTransferColumn 무시).
   - splitMode의 토지 auto floor(`:325-328`)는 **공용 헬퍼로 추출**해 time/asset 양 렌더 공유(fork3#4, area-rounding 재현 금지).
2. **`MixedUsePreHousingDisclosureSection` Case A 경로**: `layout="asset-major"` 전달·`hideTransferColumn` 제거. **양도시 개별주택공시가격을 read-only(:176-191)→입력 위젯으로 전환**(§1 게이트). 나머지 PHD 스칼라·배치 모달 그대로.
3. **`MixedUseLegacyStdPrice`의 `isCaseA` 분기를 in-place asset-major 전환(STEP3 (b)안)**: 양도 4부분 섹션 제거 + PHD 위젯 asset-major. Case B·commercial_to_house 분기는 verbatim. **오케스트레이터(`MixedUseStandardPriceInputs`) 무변경**(hasPartialUsageChange→legacy 그대로) → 별도 신규 컴포넌트·dead code 없음.
4. **공유 헬퍼 `isMixedUseCaseA(asset)`** 추출(hasPartialUsageChange && dir==="house_to_commercial" && phdFirstDisclosureDate<partialChangeDate) — legacy 내부 inline isCaseA(`:85`)를 헬퍼로(명료화·재사용, `single-source-engine-helper`). 오케스트레이터는 hasPartialUsageChange만 검사(불변)이라 dual-truth 미발생.

---

## 5. 변경 파일 (옵션 A)

| 파일 | 변경 |
|---|---|
| `components/calc/transfer/ThreePointStandardPriceInput.tsx` | `layout` prop + asset-major 전치 렌더(2자산×3시점). **additive·gated**(기본 time-major 무변경). 토지 auto floor 공용 헬퍼화. |
| `components/calc/transfer/mixed-use/MixedUsePreHousingDisclosureSection.tsx` | Case A asset-major 경로: `layout="asset-major"`·`hideTransferColumn` 제거·양도 개별주택공시가격 입력화. |
| `components/calc/transfer/mixed-use/MixedUseLegacyStdPrice.tsx` | **isCaseA 분기 in-place asset-major 전환**(양도 4부분 섹션 제거·PHD 위젯 asset-major). Case B·commercial_to_house 분기 verbatim. (STEP3 (b)안 — dead code 회피) |
| `components/calc/transfer/mixed-use/MixedUseStandardPriceInputs.tsx` | **무변경**(오케스트레이터 hasPartialUsageChange→legacy 그대로). |
| (신규) `lib/calc/mixed-use-case.ts`(또는 co-loc) | `isMixedUseCaseA(asset)` + (검토) 토지 auto floor 헬퍼. |
| (검토) 공용 sub-block 래퍼 | case1/2 `MixedUseAssetMajorStdPrice`와 시점 tone·헤더 패턴 공용화(fork3#6, 800줄). |

**미변경(명시)**: `lib/calc/transfer-tax-api.ts`, `lib/calc/transfer-tax-validate-asset.ts`, `multi-transfer-tax-validate.ts`, Zod, 엔진 `mixed-use-*.ts`, `calc-wizard-asset*.ts`(필드), `calc-wizard-store.ts`(⑥). **legacy `MixedUseLegacyStdPrice`는 Case B·commercial_to_house 전용으로 존치**(Case A는 신규가 **전면 대체**, fork2#2).

---

## 6. 리스크

1. **ThreePoint 회귀(공유) + 신규 렌더 트리 코드량** — asset-major는 gated(기본 time-major)라 회귀 격리는 맞으나 **신규 렌더 트리(~150줄)** 로 코드량 큼(STEP13 #1). 일반 PHD(`PreHousingDisclosureSection`)·case1/2·time-major splitMode(T4/T5) 전건 회귀 확인 필수. layout↔splitMode 직교 배선 주의(splitMode 끄면 배치 붕괴, #2).
2. **`mixedTransferHousingPrice` 게이트** — 양도 개별주택공시가격 입력 누락 시 preHousingDisclosure 미전송 → Case A 붕괴. anchor로 방어.
3. **4부분 안분 정밀 + 토지 auto** — 주택분/상가분 면적 floor·최초공시 상가건물(`phdCommercialBuildingStdPriceAtFirst`). 공용 헬퍼로 `feedback_area_rounding_consistency`(parseFloat(toFixed(2))) 재현 금지.
4. **표시전용 self-consistency** — 4부분 합계·토지 auto는 표시전용(엔진이 실제 안분). 이동 시 산식 자기일관 보존(`feedback_engine_result_display_drift`).
5. **토지 3시점 공유 미러링 금지** — 주택/상가 공유 ㎡당 값은 직접 read/write 또는 단일 입력+auto. `useEffect→store` 금지.
6. **E2E T6 파급** — splitMode 진입 셀렉터("상가건물 기준시가" 등) 신규 레이아웃에서 변경 → T6 대체.
7. **legacy 무손상** — Case B·commercial_to_house.

---

## 7. 스코프

- **In**: Case A(house→commercial + 최초공시<용도변경일)만 자산-우선.
- **Out**: Case B·commercial_to_house·용도변경 없음(완료) — 현행. 엔진·API·Zod·validation 무변경.

---

## 8. 검증 계획

1. **Pre-Do anchor** — Case A 폼→페이로드 baseline(4부분 payload, 게이트 포함) 1건.
2. **엔진 anchor 불변** — `mixed-use-phd-case-a-fourpart.test.ts`(엔진 단위, UI 무관) 통과.
3. **E2E** — T6 대체(자산-우선 Case A 진입·6값 배치 산출·4부분 입력·계산 도달). + 일반 PHD(T1~T3)·case1/2 회귀.
4. tsc 0 · pre-push 전체.

---

## 9. 단계

1. plan-design-self-review(진행 중) + UI 설계 생성·검토.
2. Pre-Do anchor(Case A payload baseline).
3. Do: ThreePoint layout prop + asset-major 렌더 → MixedUsePreHousingDisclosureSection Case A 경로 → 오케스트레이터 분기 + `isMixedUseCaseA` 헬퍼 → 토지 auto 공용 헬퍼.
4. Check: payload diff 0 · Excel anchor · tsc · 일반 PHD/case1/2 회귀.
5. E2E T6 대체 + 회귀.

---

## 10. 검토 이력 (STEP 1 반영)

| ID | 우선 | 정정 | 위치 |
|---|---|---|---|
| A | High | **옵션 B→A 피벗**(중복 회피, ThreePoint 전치 gated) | §0·§4·§5 |
| B | High | PHD 스칼라 + **양도 개별주택공시가격(게이트)** 레이아웃 추가 | §1·§2 |
| C | High | 6값 배치 모달(`PhdBuildingStdPriceModalButton`) 재사용 명시 | §2·§4 |
| D | Medium | `isMixedUseCaseA` 공유 헬퍼(dual-truth 제거) | §4·§5 |
| E | Medium | legacy Case A "전면 대체" 명확화 | §5 |
| F | Medium | 토지 auto floor 공용 헬퍼(area-rounding) | §4·§6 |
| G | Medium | 토지 ㎡당 `LandPriceLookupField ×3` | §2 |
| H | Medium | case1/2 sub-block 공용화 | §5 |
| I | Medium | 3시점 순서 취득→최초공시→양도(위젯 계승) | §2 |
| J | Med·확인 | 최초공시 tone violet → Design 동결 | §2·§11 |
| K | Low | 4부분 합계·토지 auto 표시전용 self-consistency | §6 |
| L | Low | 상가취득 API fallback 명명·섹션번호 prop·transferHousingPrice 엔진 사용처 | §1·§5·§11 |

**정책 위반 0**(mirror·no-silent-apportion·dual-truth — STEP 1 실측 확인. isCaseA dual-truth는 D로 헬퍼 제거).

---

## 11. 미해결 (UI 설계에서 확정)

1. **토지 ㎡당 3시점 블록 배치** — 별도 "토지" 블록 vs 상가 섹션 내. 주택/상가 auto 소비 방식(단일 입력+auto).
2. **최초공시 sub-block tone** — 위젯 관행(violet) 유지 vs tone표 정합(sky 등). ④거주 violet 인접.
3. **양도 개별주택공시가격 배치** — 주택 섹션 vs PHD 공통 스칼라 블록.
4. **6값 배치 모달 vs 개별 시점 모달** — asset-major에서 배치 버튼 위치·개별 시점 폴백.
5. **case1/2 sub-block 공용 컴포넌트 추출 범위**.
6. transferHousingPrice 엔진 4부분 산식 사용처(참고).
7. **3시점 순서 divergence(STEP3)** — Case A=취득→최초공시→양도(위젯 계승) vs case1/2=양도→취득. 수용(위젯 재사용 근거) vs case1/2 재정렬 — Design 판단.
8. **`MixedUseLegacyStdPrice` 네이밍(STEP3)** — isCaseA 분기가 asset-major가 되면 "legacy"는 Case B·commercial_to_house 한정 의미. 리네이밍 여부 Design(surgical: 보류 가능).

---

## 부록 — 관련
- `project_transfer_mixed_use_asset_major_stdprice`(선행 case1/2)·`project_transfer_phd_3point_batch_stdprice`·`project_transfer_mixed_use_usage_change_acq_stdprice_usage_index`
- `feedback_area_rounding_consistency`·`mirror-pattern`·`feedback_engine_result_display_drift`·`single-source-engine-helper`·`feedback_tailwind_static_tone_mapping`
