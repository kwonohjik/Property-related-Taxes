# NBL 잔여 갭 — UI 설계 (consolidated)

> STEP 12 산출물 (plan-design-self-review-loop) · 엔진 설계 [nbl-remaining-gaps.engine.design.md] 대응 · **R1 정정 반영본**
> 공용: `ToggleCard`/`RadioCardGroup`(native 금지)·`DecimalInput`(면적·연수)·`DateInput`·`SigunguSelect`·`FieldCard`·`LawArticleModal`. OFF도 tone 유지.

## 갭 1 — 토지 소재지 SigunguSelect

**위치**: `NblSectionContainer.tsx` — **거주이력 게이트(farmland‖forest‖pasture) 내, 거주이력 섹션 위**(R1: §4⑤ grid직후 주장 폐기, §5.C 게이트 배치로 통일). 주택·별장·기타토지는 재촌 무관.
```
[농지·임야·목장 선택 시]
 ┌─ 토지 소재지 (시·군·구)  [LawArticleModal: 소득령 §168의8②/§168의9②] ─┐
 │  SigunguSelect (typeahead + 5자리 직접입력)   testid=nbl-land-sigungu   │
 │  hint: 재촌 판정 — 거주지와 동일/연접 시·군·구 매칭                       │
 └────────────────────────────────────────────────────────────────────┘
 ┌─ 거주 이력 (ResidenceHistorySection) ─┐   ← 기존, 토지 소재지 아래
```
- 바인딩: `code={asset.nblLandSigunguCode}` `name={asset.nblLandSigunguName}` `onChange={(c,n)=>onAssetChange({nblLandSigunguCode:c, nblLandSigunguName:n})}`. import `./shared/SigunguSelect`.
- `anyExempt` opacity 게이트 안쪽(무조건면제 시 비활성).
- ⑧ validation: **미입력 차단 안 함**(거리 fallback legacy 양립 — UI 통과↔validate 모순 금지).

## 갭 2 — 이농 ToggleCard

**위치**: `UnconditionalExemptionSection.tsx` 종중 ToggleCard(:156-168) 뒤.
```
 ┌─ ☐ 2006.12.31 이전 이농 농지  [소득령 §168-14③5호 (시행규칙 §83의5④2호)] ─┐  tone=violet
 │   (ON 시 펼침)  이농일  [DateInput]  · hint: 농지 한정·2009.12.31까지 양도분    │
 └──────────────────────────────────────────────────────────────────────────┘
```
- 바인딩: `checked={asset.nblExemptInong}` `onCheckedChange` / children `DateInput value={asset.nblExemptInongDate}`.
- **R1 Critical — anyExempt 이중 합류**: (a) `UnconditionalExemptionSection.tsx:14-21` (b) **`NblSectionContainer.tsx:53-60`**(opacity 게이트 제어) **둘 다** `|| asset.nblExemptInong` 추가. 한 곳 누락 시 의제 활성인데 폼 dimming 안 됨.
- 공장인접 ToggleCard(:120-132) 라벨 정정: → "공장 오염피해 인접토지 (소유자 요구로 취득)" + label "소득령 §168-14③5호 (시행규칙 §83의5④1호)".
- ⑧ validation: 이농일 **미입력 차단 안 함**(R1: 기존 의제 날짜 필드 차단 패턴 부재 → 엔진 cutoff 위임, 단일 토글만 비일관 차단 금지).
- ⑦ 결과: 강조배너는 하드코딩 "§168-14③" 불변(R1), 정정 legalBasis는 judgmentSteps 배지만.

## 갭 3a — 면적기준 호별 RadioCardGroup

**위치**: `OtherLandDetailSection.tsx:95-100` 단일 ToggleCard 교체.
```
 ┌─ §168의11① 관련 사업 유형 (RadioCardGroup, layout=stack, tone=sky) ─┐
 │  ○ 해당 없음  ○ 부설주차장(2호가목)  ○ 업무용 차고(2호나목)            │
 │  ○ 청소년수련시설(4호)  ○ 하치장·야적장(7호)  ○ 무주택1세대 나지(13호) │
 │  ○ 체육시설(1호·별표3/4/5)  ○ 예비군훈련(5호다목)  ○ 휴양시설(6호)     │
 │  ○ 기타 유사토지(14호)                                                │
 └──────────────────────────────────────────────────────────────────┘
 [선택 호별 조건부 면적인자 FieldCard — DecimalInput(㎡/명), 색상카드+섹션번호]
   parking_attached·sports·reserve·resort → "기준면적(㎡)" nblOtherStandardAreaLimit
   hatchang → "매년 최대면적(㎡)" nblOtherMaxAnnualArea (hint: 120%까지 사업용)
   youth_training → "수용정원(명)" nblOtherYouthCapacity (×200㎡)
   parking_garage → "최저차고기준면적(㎡)" nblOtherMinGarageArea (×1.5)
   vacant_lot_1household → 안내만(660㎡ 고정)
```
- **R1**: sports는 별표3/4/5 3종 통합 → RadioCard 라벨에 별표번호 표기(혼선 방지). 면적인자는 `DecimalInput`(CurrencyInput 금지).
- ⑧ validation: 면적인자 요구 호 미입력 시 **차단**(자동 fallback 없음). 위치 446 revenue 블록 직후 별도 if(R1). revenueTest와 상호배타(동시 선택 시 revenueTest 우선·UI 동시활성 방지).
- ⑦ 결과카드: `NonBusinessLandResultCard` AreaBar 이미 areaProportioning 렌더. **scope-out hint**: "면적 초과분 안분 중과는 후속" 명시(R1 SR-4).
- etc_14호 선택 → buildOtherLand `isRelatedToResidenceOrBusiness=true` 도출(onChange 동시 set, useEffect 미러링 금지).

## 갭 3b — 유예사유 12종 GracePeriodSection

**위치**: `GracePeriodSection.tsx` 전면 개편(7종 → 12종).
```
 ┌─ ☐ 부동산매매업 매매용부동산  tone=amber  [단서: 1·2호 가산 배제] ─┐  ← 6번 섹션 상단(R1)
 └──────────────────────────────────────────────────────────────────┘
 [유예사유 항목 N] 사유 Select(12종 §83의5①) →
   fixed(6/8/9/10/11호): 기산일 DateInput + 자동종료일 read-only "멸실일+5년 = YYYY-MM-DD" testid=nbl-grace-auto-end-{idx}
   event_window(1/2/3/7/12호): 개시일·종료일 2개
   4호: 착공일·제공종료일 2개
   5호: 취득일(자산 자동)·착공일 + 선택 건설진행종료일
```
- 자동종료일: `useMemo`로 엔진 `resolveGraceIntervals` import(single-source) — string→Date 변환(toOptionalDate) 후 미리보기.
- 단서 토글 `nblBusinessIsRealEstateDealer`(tone=amber).
- ⑧ validation: 항목별 anchorDate 필수, event_window/4호 endDate 필수, 5호 secondaryDate(착공일) 필수.
- ⑦ 결과: judgmentSteps에 §83의5①N호 legalBasis 노출.

## 갭 3c — UI 변경 없음 (E-1)
warning 문자열 정정은 데이터-드리븐 → `NonBusinessLandResultCard.tsx:117-128` amber 박스에 자동 반영. standardArea 직접입력 위젯은 E-3 후속.

## 갭 3d — UI 변경 없음
**R1**: 결과카드 effectiveBusinessDays·businessUseRatio **숫자 불변**, 변경=판정(isNonBusinessLand)·detail 문구·중과 +10%p(판정 경유)뿐. 버킷·가나다 행 노출은 선택적 후속.

## UI 동기화 지점 (8 클라이언트)

| 갭 | ①폼 | ②init | ③norm | ⑤UI | ⑥사이드바 | ⑦결과 | ⑧validate |
|---|---|---|---|---|---|---|---|
| 1 | 재사용 | 재사용 | 재사용 | SigunguSelect 신설 | — | 자동(재촌기간) | 차단X |
| 2 | nblExemptInong·Date | ✓ | ✓ | ToggleCard + **anyExempt 2곳** | — | 배지만 | 차단X |
| 3a | nblOther 5필드 | ✓ | ✓ | RadioCardGroup+면적인자 | — | AreaBar+hint | 차단O |
| 3b | nblGracePeriods(신타입)·dealer | ✓ | ✓ | 12종 개편 | — | 배지 | 차단O |
| 3c | — | — | — | — | — | 자동 | — |
| 3d | — | — | — | — | — | 판정만 | — |

## E2E (worktree E2E_PORT=3101)
- **R1: NBL 전용 baseline spec 부재**(e2e/ nbl 매칭 0건) → 신규 spec **단독 통과** 기준. 재촌 시군구 입력·이농 toggle·면적한도 선택·유예 12종 → 계산 → Network 탭 `nonBusinessLandRaw.{신규필드}` 전송 확인.
