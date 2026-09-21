"use client";

/**
 * 계산기 결과의 **출처 한 줄** — 판정 메뉴에서 넘겨받았음을 밝힌다 (P5-b-1)
 *
 * 계획서 §5.3 「출처 표시」 · §5.9 ①②.
 *
 * ## 🔑 **하나를 4종이 쓴다**
 *
 * 양도세 결과뷰는 단건·다건·겸용·일괄 **4종**이고 공유 헤더가 없다
 * (`feedback_transfer_result_view_is_not_one`). 문구를 4벌 쓰면 한쪽만 고쳐진다.
 * ⇒ 이 컴포넌트와 술어(`hasJudgmentProvenance`)를 4곳이 공유한다.
 *
 * ## 🔑 props는 **`formData`에서 온다** — `TransferTaxResult` 경유가 아니다
 *
 * 4종의 유일한 공통 콘텐츠 지점(`DetailedCalculationStatementCard`)은 3종이 **어댑터
 * 화이트리스트**로 객체를 새로 만들어 넘겨 새 필드를 **침묵 strip**한다
 * (`aggregateToFilingResult` · `mixedUseToFilingResult` — `feedback_explicit_prop_mapping_strip`).
 * 엔진 결과에 출처를 실으면 단건만 뜨고 나머지 3종은 빈 값이 된다.
 *
 * ## 🔑 `PrintSection` **밖**에 둔다
 *
 * 출처는 「이 세액이 어떤 사실에 근거하는가」라 선택 출력과 무관하게 **항상 인쇄**되어야 한다.
 * `DisclaimerBanner`가 4종 전건에서 같은 자리에 같은 이유로 놓여 있다.
 */
import { useEffect, useState } from "react";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  detectJudgmentProvenance,
  hasJudgmentProvenance,
  type JudgmentProvenance,
} from "@/lib/calc/one-house-judgment-provenance";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

type FormSlice = Pick<
  TransferFormData,
  "sourceJudgmentId" | "sourceJudgmentInputHash" | "importedOneHouseFacts"
>;

/** 상태별 문구 — 화면이 **아는 것만** 말한다. 모르면 모른다고 한다. */
function describe(p: JudgmentProvenance): { tone: "sky" | "amber"; body: React.ReactNode } {
  if (p.state === "source_changed") {
    return {
      tone: "amber",
      body: (
        <>
          <b>원본 판정이 그 뒤에 바뀌었습니다.</b> 아래 세액은 <b>넘겨받을 당시의 사실</b>로 계산한
          것입니다. 바뀐 판정을 반영하려면 판정 메뉴에서 다시 「이 결과로 세액 계산」을 누르세요.
        </>
      ),
    };
  }
  if (p.state === "unknown") {
    return {
      tone: "amber",
      body: (
        <>
          원본 판정이 그 뒤에 바뀌었는지 <b>확인할 수 없습니다</b>(기준값이 없는 이전 세션에서
          넘어온 값입니다). 확실히 하려면 판정 메뉴에서 다시 넘겨 주세요.
        </>
      ),
    };
  }
  return {
    tone: "sky",
    body: (
      <>
        판정 메뉴에서 넘겨받은 사실로 계산했습니다. 계산기는 판정 결과를 복사하지 않고{" "}
        <b>같은 엔진으로 다시 판정</b>하므로, 이 화면에서 양도일·양도가액을 바꾸면 판정도 그에 맞게
        바뀝니다.
      </>
    ),
  };
}

/**
 * @param form 결과뷰가 이미 들고 있는 계산기 폼. 없으면 렌더하지 않는다.
 * @param label 다건처럼 여러 자산을 한 화면에 그릴 때 어느 자산인지 밝힌다.
 */
export function OneHouseJudgmentProvenanceLine({
  form,
  label,
}: {
  form: FormSlice | null | undefined;
  label?: string;
}) {
  /**
   * 🔑 **지역 state다** — store에 넣지 않는다. 파생값을 persist되는 store에 넣으면
   *    `partialize`가 sessionStorage에 싣고 자동저장 `inputData`를 타고 **이력 record에까지**
   *    저장된다(`feedback_computation_meta_discarded` 형제 함정 · 다건 합산 선례).
   */
  const [prov, setProv] = useState<JudgmentProvenance | null>(null);
  const id = form?.sourceJudgmentId;
  const baseline = form?.sourceJudgmentInputHash;
  const imported = !!form?.importedOneHouseFacts;

  /**
   * 🔑 **setState는 전부 Promise 콜백 안에서** 부른다 — effect 본문에서 동기로 부르면
   *    cascading render가 되고 `react-hooks/set-state-in-effect`가 막는다.
   *    근거가 없으면 `detectJudgmentProvenance`가 `null`을 돌려주므로 리셋도 같은 경로로 간다
   *    (`PriorGiftHistoryModal`이 같은 규약을 쓴다).
   */
  useEffect(() => {
    let alive = true;
    void detectJudgmentProvenance({
      sourceJudgmentId: id,
      sourceJudgmentInputHash: baseline,
      // 🔑 술어가 이 값을 본다 — 전달 사실은 있는데 id만 없는 경합 경로를 살린다.
      importedOneHouseFacts: imported ? ({} as never) : undefined,
    }).then((p) => {
      if (alive) setProv(p);
    });
    return () => {
      alive = false;
    };
  }, [id, baseline, imported]);

  // 🔑 술어는 공용이다 — 뷰마다 조건을 따로 쓰면 「단건엔 뜨는데 겸용엔 안 뜨는」 상태가 생긴다.
  if (!hasJudgmentProvenance(form)) return null;
  /*
   * record를 아직 못 읽었거나(로딩) 지워졌으면 **아무 말도 하지 않는다**.
   * 「출처를 찾을 수 없습니다」를 띄우면 로딩 한 프레임마다 그 문구가 깜빡인다.
   */
  if (!prov) return null;

  const { tone, body } = describe(prov);
  const rec = prov.record;
  return (
    <div data-testid="one-house-judgment-provenance">
      <ToneCard tone={tone} title={label ? `출처 — ${label}` : "출처 — 1세대1주택 비과세 판정"}>
        <p className="text-sm leading-relaxed">{body}</p>
        {/*
          🔑 원본 record를 못 찾았으면 **판정 내용을 말하지 않는다.** 없는 값을 자리표시자로
             채우면 화면이 「판정 결과: —」처럼 알고 있는 척한다.
        */}
        {rec && (
          <p className="text-caption text-muted-foreground">
            판정 대상 양도(예정)일 <b className="font-mono tabular-nums">{rec.judgedFor}</b>
            {" · 판정 결과 "}
            <b data-testid="provenance-verdict">{rec.verdictLabel}</b>
            {" · 저장 "}
            <span className="font-mono tabular-nums">{rec.updatedAt.slice(0, 10)}</span>
          </p>
        )}
      </ToneCard>
    </div>
  );
}
