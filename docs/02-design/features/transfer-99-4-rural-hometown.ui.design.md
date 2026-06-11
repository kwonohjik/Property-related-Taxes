# §99의4 농어촌주택·고향주택 — UI 설계

> 선행: `transfer-99-4-rural-hometown.plan.md` · `.engine.design.md`
> 위치: `UnifiedReductionPanel` **new_housing 그룹**(amber tone) — §99의3 옆 라디오 2종 (그룹 라디오 단일 선택 — §99의3과 동시 선택 불가는 v1 한계, plan §5.3).

## 1. 사용자 시나리오

1. 일반주택(양도 자산) 입력 → 감면·공제 단계 → "신축주택" 그룹 펼침 → "§99의4 (농어촌주택)" 라디오 선택 (R-3와 동일하게 **라디오 활성** — 시한은 evaluator 판정, D-1 낙관).
2. 농어촌주택 취득일·기준시가 입력 + 소재지·연접 확인 토글 → 계산.
3. 결과: 비과세(12억 이하) 또는 고가주택 부분과세+표2. 농어촌주택 3년 미보유 시 추징 경고.

## 2. New994InputForm (1파일 공용 — `variant: "rural" | "hometown"` prop)

UI 순서 = 엔진 검증 순서 (취득일 → 가액 → 소재지·자격):

```
① amber 「농어촌주택 취득 정보」 (취득)
   - DateInput ruralHouseAcquisitionDate — label "농어촌주택 취득일" (hometown: "고향주택 취득일")
     hint: "취득기간 2003.8.1~2028.12.31 (고향주택 2009.1.1~). 일반주택 취득 후 취득한 주택이어야 합니다"
② sky 「가액 요건」
   - CurrencyInput ruralHouseStdPrice — label "취득 당시 기준시가 합계"
     hint: "주택과 부속토지 합계 — 3억 이하 (등록 한옥 4억)"  ※ placeholder 숫자 금지
   - ToggleCard(chip, sky) isRegisteredHanok "등록 한옥" — desc "지자체 등록 한옥은 한도 4억 (령⑭)"
③ rose 「소재지 요건」
   - ToggleCard(rose) meetsLocationRequirement "소재지 요건 충족 확인"
     desc rural: "읍·면(또는 별표12 동) 소재 + 수도권·도시지역·조정대상지역·허가구역·관광단지 아님 (기회발전특구는 충족 간주)"
     desc hometown: "별표12 시 지역 + 수도권·조정대상지역·관광단지 아님"
   - ToggleCard(rose) isAdjacentArea "일반주택과 같은·연접 읍면동(시)" — ON이면 배제 (③) — desc에 명시
   - [hometown 전용] ToggleCard(violet — 자격) meetsHometownRequirement "고향 요건 충족"
     desc: "가족관계등록부 등록기준지 10년 이상 또는 10년 이상 거주한 시 (령⑥)"
emerald 자동 표시 (useMemo, store 미기록):
   - "농어촌주택 보유기간 (취득일→양도일)" 미리보기
   - 3년 미만이면 amber 경고 예고: "3년 미보유 양도도 특례 적용되나(④), 이후 3년 보유 못하면 추징(⑥)"
```

- 모든 토글 OFF에도 tone 배경 유지 (가시성 원칙). native input 금지.
- 미리보기 적격 판정은 **UI 자체계산 금지** — 엔진 단일 진실 (보유기간 단순 diff만 표시).

## 3. 폼 상태 (①②③ — `calc-wizard-asset-reduction.ts`)

```typescript
| ({ type: "new_99_4_rural";
     ruralHouseAcquisitionDate: string;   // "" 초기
     ruralHouseStdPrice: string;          // "" 초기
     isRegisteredHanok: boolean;          // false
     isAdjacentArea: boolean;             // false
     meetsLocationRequirement: boolean; })// false
| ({ type: "new_99_4_hometown"; /* 동일 */ meetsHometownRequirement: boolean })
```
- ② getReductionDefault: 위 초기값. ③ migrateAsset: 구 `_phase1Stub` 데이터 → 본 필드 기본값 방어 보정.
- 3-state 불요 (전부 boolean 토글·텍스트 — 미선택 차단 대상은 ⑧에서 날짜·금액만).

## 4. ⑧ validate (`transfer-tax-validate-reductions.ts`)

- 선택 시 `ruralHouseAcquisitionDate`·`ruralHouseStdPrice` 미입력 → step 2 차단 메시지 (자산명 + "§99의4").
- 토글류(소재지·연접·고향)는 차단하지 않음 — 엔진 불적용 사유로 안내 (낙관 입력 → 결과 피드백 패턴).

## 5. New994DetailCard (⑦ — 결과 카드)

```
[violet 카드 — house_count_exclusion]
  제목: "§99의4 — 농어촌주택(고향주택) 소유주택 제외"
  본문: "농어촌주택 1채를 소유주택에서 제외하여 1세대 1주택으로 보아
        소득세법 제89조제1항제3호(비과세·고가주택 안분·장기보유특별공제 표2)를 적용합니다"
  행: 농어촌주택 보유기간 N년 (ruralHoldingYears)
  [clawbackWarning=true → amber 경고 박스]
    "농어촌주택 보유 3년 미만 — 이후 3년 이상 보유하지 못하게 되면 특례로 줄어든
     세액을 그 사유 발생 달의 말일부터 2개월 내 납부해야 합니다 (§99의4⑥, 수용·상속·멸실 제외)"
  각주: "다주택 중과 판정의 주택 수에는 반영되지 않습니다" (R-D)
불적용 시: rose 카드 + ineligibleReasons 목록 (Rental97DetailCard 패턴)
```
- 산식 한국어 풀어쓰기·"원" 미표기·내부 id 미노출.

## 6. E2E (`e2e/transfer-99-4.spec.ts`)

97-4 spec 패턴: 양도일 입력 → 사이드바 "감면·공제" → "신축주택" 그룹 펼침 → "§99의4 (농어촌주택)" 라디오 활성 확인·클릭 → 폼 렌더("취득 당시 기준시가"·"3억" hint) 확인. ⚠️ stale 서버 — `lsof -ti :3100 | xargs kill` 후 실행.

## 7. 클라이언트 동기화 매핑 (요약 — 상세는 engine.design §5)

①②③ 폼/initial/normalize → §3 · ④ toEngineReductions 2분기(Date·parseAmount) · ⑤ 폼+패널 렌더 분기 2개 · ⑥ 사이드바 영향 없음 · ⑦ §5 카드 · ⑧ §4.
