/**
 * anchor — 판정 메뉴 ② 화면의 **양도 물건 소재지가 거주요건 판정에 도달하는가**.
 * 계획서: `docs/00-pm/one-house-judgment-step-reorder.plan.md` §8 AN-3 · §4 D-6.
 *
 * ## 배선
 *
 * 엔진은 정밀 판정 경로를 **이미 갖고 있었다**:
 *   `one-house/judge.ts:65` → `meetsOneHouseResidenceRequirement`
 *   → `transfer-tax-exemption-requirements.ts:473` `resolveWasRegulatedAtAcquisition(input)`
 *   → `regionCode`가 있으면 `isRegulatedByBjdCode(취득일)`, 없으면 boolean fallback(`:389`).
 *
 * ⑫ Zod(`transfer-tax-schema-base-shape.ts:116`)·⑭ 매핑(`engine-input.ts:68`)도 이미 있었다.
 * **빠진 배관은 ④ 하나**였다 — `one-house-exemption-api.ts`가 `regionCode`를 싣지 않았다.
 *
 * ## 이 파일은 Pre-Do anchor였고, 수정 후 반전됐다
 *
 * 수정 **전**에 「본문에 `regionCode`가 없다」 + 「그래서 조정지역 주소인데도 거주 0개월로
 * 비과세가 난다」를 현행에서 통과시켜 갭을 확정했다. 지금은 그 반대를 고정한다.
 *
 * 🔴 **⑤(주소 위젯)만 만들고 ④를 빠뜨리면 「입력해도 아무 데도 가지 않는 칸」이 된다.**
 *    그것을 막는 유일한 방어선이 이 anchor다
 *    (`feedback_api_trigger_without_input_path_is_noop`).
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

/** 서울 강남구 역삼동 — 취득 시점에 조정대상지역이었던 시료. AN-3a가 데이터로 확인한다. */
const SEOUL_GANGNAM = "1168010100";
const ACQ = "2019-06-01";

/**
 * 거주요건이 **실제로 걸리는** 시료 — 거주 0개월.
 *
 * 🔑 `wasRegulatedAtAcquisition: false`로 둔다. boolean fallback은 「비조정」이라 하고,
 *    `regionCode`는 「조정」이라 한다 ⇒ **둘이 갈리는 시료**라야 도달 여부를 관측할 수 있다
 *    (같은 답을 내면 구별력 0 — `feedback_mutation_zero_discrimination_is_not_proof`).
 */
function form(over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2026-06-01",
    contractTotalPrice: "1000000000",
    residencePeriodMonths: "0",
    wasRegulatedAtAcquisition: false,
    assets: [
      {
        ...f.assets[0],
        assetKind: "housing",
        acquisitionDate: ACQ,
        regionCode: SEOUL_GANGNAM,
      },
    ],
    ...over,
  } as OneHouseJudgmentFormData;
}

async function postForm(f: OneHouseJudgmentFormData) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
    }),
  );
  return { status: res.status, json: await res.json() };
}

describe("AN-3 — 양도 물건 법정동코드가 판정에 도달하는가", () => {
  it("[AN-3a] 전제 — 시료 코드는 취득일 현재 조정대상지역이다", () => {
    expect(isRegulatedByBjdCode(SEOUL_GANGNAM, ACQ).isRegulated).toBe(true);
  });

  it("[AN-3b] ④ 본문이 top-level `regionCode`를 싣는다", () => {
    const body = buildOneHouseExemptionApiBody(form());
    // 긍정 대조 — 빌더가 실제로 돌았다.
    expect(body.acquisitionDate).toBe(ACQ);
    expect(body.propertyType).toBe("housing");
    // 배선 본체. ⑫가 `z.string().length(10)`을 요구하므로 자릿수도 함께 본다.
    expect(body.regionCode).toBe(SEOUL_GANGNAM);
    expect(String(body.regionCode)).toHaveLength(10);
  });

  /**
   * 🔑 **본문에 키가 있다」는 도달을 증명하지 않는다** — Zod가 모르는 키는 침묵 strip되고,
   *    ⑭ 매핑이 없으면 엔진에 닿지 않는다(`feedback_leaf_anchor_skips_zod_layer`).
   *    그래서 `POST`를 직접 불러 **판정 결과로** 관측한다.
   */
  it("[AN-3c] 주소가 조정지역이면 토글이 OFF여도 거주요건이 걸려 과세다", async () => {
    const { status, json } = await postForm(form());
    expect(status).toBe(200);
    // `regionCode`가 boolean fallback(false)을 이겨 「조정」으로 판정 ⇒ 거주 0개월이라 과세.
    expect(json.data.judgment.isExempt).toBe(false);
  });

  /**
   * 음성 짝 — 주소를 지우면 토글(false)이 판정 근거가 되어 같은 시료가 비과세다.
   * 이 짝이 없으면 「어떤 이유로든 과세」여도 AN-3c가 초록이라 구별력이 0이다.
   */
  it("[AN-3d] 음성 짝 — 주소가 없으면 토글 OFF가 이겨 비과세다", async () => {
    const f = form();
    const { json } = await postForm({
      ...f,
      assets: [{ ...f.assets[0], regionCode: "" }],
    } as OneHouseJudgmentFormData);
    expect(json.data.judgment.isExempt).toBe(true);
  });

  it("[AN-3e] 음성 짝 2 — 주소 없이 토글을 켜면 과세다 (거주요건 축이 살아 있다)", async () => {
    const f = form({ wasRegulatedAtAcquisition: true });
    const { json } = await postForm({
      ...f,
      assets: [{ ...f.assets[0], regionCode: "" }],
    } as OneHouseJudgmentFormData);
    expect(json.data.judgment.isExempt).toBe(false);
  });
});
