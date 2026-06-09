# 대습상속인 법정상속분 반영 · UI 설계

- 계획서: `docs/01-plan/inheritance-substitute-heir.plan.md`
- 엔진 설계: `docs/02-design/features/inheritance-substitute-heir.engine.design.md`
- 작성일: 2026-06-09

## Context — 입력 폼 변경 (`HeirComposition.tsx`)

대습상속인을 **실제 상속인**으로 입력. `Heir` 신규 3필드(`substituteGroupId`·`substituteForRelation`·`substituteRole`)를 한 상속인 편집기 안에서 입력. 피대습자(사망 자녀·형제)는 **엔트리 미생성**(결정-B) — 그룹 라벨은 `substituteForRelation`+그룹 index로 파생("대습 그룹 #N · 사망 자녀"). 피대습자 실명 표시는 후속 옵션(엔진 무관).

> 결과 표(부표2·⑥⑪⑫)는 엔진 단일소스(`computeLegalShares` 내재 확장)로 자동 반영 — 결과 컴포넌트 직접 수정 0(⑦은 데이터 레이어 흡수).

## 사용자 시나리오 (SH-1: 배우자 + 생존자녀2 + 사망자녀1의 며느리·손자)

1. 배우자·생존자녀2 일반 추가(기존).
2. "상속인 추가" → 며느리: relation=기타(other) 선택 → **"대습상속인(민법 §1001)" 토글 ON**.
   - 원래순위 라디오: **사망한 자녀(1순위)** 선택 → `substituteForRelation="child"`.
   - 대습 그룹 라디오: "새 그룹" → 그룹 #1 생성(`substituteGroupId` 발급).
   - 역할 라디오: **피대습자의 배우자(며느리·사위)** → `substituteRole="spouse"`.
3. "상속인 추가" → 손자: relation=기타 → 대습 토글 ON → 원래순위 자녀 → **대습 그룹 #1 선택**(기존) → 역할 **직계비속(손자녀)** → `substituteRole="descendant"`.
4. 결과: 며느리 6/45·손자 4/45 자동(엔진), 부표2·⑥⑪⑫ 표시.

## UI 명세 (HeirEditor 내 — 자연인 전용)

**가시성 게이트(U2)**: 대습 토글은 `relation === "other"`일 때만 노출(며느리·사위·손자녀·조카를 모두 "기타"로 입력). 배우자·직계존속·corporate·legatee는 대습상속인 불가(§1001).

기존 `isCorporate`·`isLegatee` 분기와 병렬로, **대습 그룹 카드**(rose tone, §27과 동일 계열·혼동 방지 안내):

```
┌ ToggleCard rose "대습상속인 (민법 §1001·§1003②)" ───────────┐
│ 사망·결격된 자녀·형제를 갈음하여 상속하는 손자녀·며느리·사위.   │
│ ON 시 실제 상속인으로 법정상속분(§1010) 배분.                  │
│ [ON 시 펼침]                                                  │
│  ① 원래순위 RadioCardGroup (rose, inline)                     │
│     ○ 사망한 자녀 (1순위)   ○ 사망한 형제자매 (3순위)          │
│  ② 대습 그룹 RadioCardGroup (rose, stack)                     │
│     ○ 대습 그룹 #1 · 사망 자녀   … (기존 그룹)                 │
│     ○ + 새 대습 그룹                                          │
│  ③ 역할 RadioCardGroup (rose, inline)                         │
│     ○ 피대습자의 배우자 (며느리·사위, §1003②)                 │
│     ○ 피대습자의 직계비속 (손자녀·조카)                       │
└──────────────────────────────────────────────────────────────┘
```

- 토글 OFF→ON: `substituteGroupId`=(선택/신규), `substituteForRelation`·`substituteRole` 기본 미설정(미선택 시 validation 차단 ⑧).
- 토글 ON→OFF: 3필드 전부 undefined(stale 정리, `changeHeirRelation` 패턴 차용).
- **★ U1 `changeHeirRelation` 확장**: relation을 other 외(corporate·legatee·spouse·lineal_ascendant·child·sibling)로 변경 시 `substituteGroupId`·`substituteForRelation`·`substituteRole` 전부 clear(잔류 데이터의 법정상속분 오염 차단 — `:77-109` 기존 정리 블록에 추가).
- ② 그룹 목록: `heirs` 스캔 → distinct `substituteGroupId` + 파생 라벨. "새 그룹" 선택 시 신규 id 발급(`subst-${Date.now()}-${n}`).
- relation 제약: 대습 토글은 **자연인(비corporate) 전용**. 며느리·사위=other, 손자녀·조카=other 권장(표시는 역할로 구분). relation은 표시용 — 판정은 substituteGroupId 단독.
- **§27 legatee 토글과 분리 안내**: legatee+세대생략 카드 하단에 "손자 대습상속은 위 '대습상속인' 토글(실제 상속인)을 사용하세요 — 본 §27 경로는 유증(수유자) 전용"(amber 안내). 레거시 호환 유지.

## 동기화 지점 (14지점 중 해당)

| # | 지점 | 작업 |
|---|---|---|
| ① 폼 상태 | `Heir`에 3필드(엔진 타입 직접 사용 — 별도 FormData 없음, heirs는 Heir[] 그대로) | 타입 A에서 처리 |
| ② initial | 신규 heir 추가 시 3필드 미설정(undefined) — 기본 OFF | `handleAdd` 무변경(undefined 자연) |
| ③ normalize | sessionStorage 호환 — optional이라 무변경 | — |
| ④ API 변환 | `inheritance-api.ts:81` heirs 통째 spread → strip 0 | 변경 불요(실측) |
| ⑤ UI 위젯 | 위 대습 그룹 카드 | HeirComposition |
| ⑥ 사이드바 | N/A(상속인 구성은 합계 미표시) | — |
| ⑦ 결과 카드 | 부표2·⑥⑪⑫ 엔진 자동 | 직접 수정 0 |
| ⑧ validation | `lib/calc/inheritance-validate.ts`(실측 확정) | 아래 |
| ⑨⑩⑫ Zod | `property-valuation-input.ts` heirSchema 3필드 optional + superRefine | 타입 D |
| ⑪⑬⑭ | heirs spread 경로(④와 동일) — 별도 매핑 없음 | 변경 불요 |

## Validation (⑧ — 결정-C·법령 제약)

- **빈 그룹 차단**: `substituteGroupId`가 존재하는 그룹에 멤버 0명일 수는 없으나(멤버가 곧 그룹 생성자), **그룹에 멤버는 있는데 `substituteForRelation`/`substituteRole` 미선택** → 차단("대습상속인의 원래순위·역할을 선택하세요").
- **2순위·배우자 대습 차단**: `substituteForRelation`은 child·sibling만(§1001). UI에서 2순위(직계존속) 옵션 미제공 → 입력 불가(타입 enum 강제).
- **역할 spouse 중복 차단(권장)**: 한 그룹에 `substituteRole="spouse"` ≥2 → 경고(피대습자 배우자는 1인). validation Medium.
- 자동 안분 fallback 금지 — 미선택은 오류 차단(메모리 `feedback_no_silent_apportion_fallback`).

## testid·접근성

- ToggleCard·RadioCardGroup 공용(기존 a11y 보존). 신규 `heir-substitute-toggle-${index}`·`heir-substitute-relation-${index}`·`heir-substitute-group-${index}`·`heir-substitute-role-${index}`.
- 그룹 라디오 옵션 라벨에 파생 그룹명(내부 id 미노출 — 메모리 `feedback_no_internal_id_in_result`).

## E2E (메모리 `feedback_browser_verify_with_playwright`)

`e2e/inheritance-substitute-heir.spec.ts`: SH-1 입력→계산→결과 부표2에 며느리·손자 행·법정상속분 표시 검증. claude-in-chrome·수동안내 금지.

## 자가 검토 이력 (STEP 13) — 정정 3건

1. (누락 High) `changeHeirRelation` 신규 3필드 stale 정리 → other 외 전환 시 clear 추가(`:77-109`).
2. (누락 Medium) 대습 토글 가시성 게이트 `relation==="other"` 명시.
3. (오류 Low) ⑧ validation 경로 `lib/calc/inheritance-validate.ts` 실측 확정.
