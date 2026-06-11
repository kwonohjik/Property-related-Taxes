---
name: project-multi-transfer-route-gaps
description: 다건 양도(multi) 경로가 단건과 달리 처리/차단하지 않는 모드 — 리뷰 시 3단 대조 포인트
metadata:
  type: project
---

다건 양도 경로(`lib/calc/multi-transfer-tax-api.ts` buildPropertyPayload → `multiInputSchema` → `app/api/calc/transfer/multi/route.ts`)는 단건과 달리 일부 입력을 침묵 누락한다.

**Why:** 합산 엔진은 단건 엔진을 반복 호출하나, 다건 변환(buildPropertyPayload)이 sub-object를 구성하지 않고 multi route가 매핑하지 않음. `validateMultiSupportedMode`(multi-transfer-tax-validate.ts)가 명시 차단 목록으로 막아야 하는데 일부 누락.

**How to apply:** 다건 양도 리뷰 시 아래를 3단 대조(body→schema→engineInput) + 차단목록 확인:
- 상속 보충평가(`inheritanceValuationMode==="auto"`) + `inheritedAcquisition`/`inheritedHouseValuation`: buildPropertyPayload 미빌드 + route 미매핑 + validateMultiSupportedMode 미차단. validateStep은 auto면 fixedAcquisitionPrice 불요(line 551)라 통과 → acquisitionPrice 0 침묵 오산.
- top-level `priorReductionUsage`(§133 5년 한도): multiInputSchema는 정의(line 659)하나 multi body 미전송 + route engineInput 미매핑. 단건 route는 매핑함(route.ts:215, bundled flow:667).

관련: [[feedback_api_zod_schema_sync]] (⑬⑭ 침묵 strip), CLAUDE.md 14 동기화 지점.
