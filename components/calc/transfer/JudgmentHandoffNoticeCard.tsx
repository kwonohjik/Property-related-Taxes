import Link from "next/link";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { hasJudgmentProvenance } from "@/lib/calc/one-house-judgment-provenance";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/**
 * 2주택 이상인데 **넘겨받은 판정 사실이 없을 때** 새 입력 경로를 알리는 카드 (계획서 §5.4 · P6-b).
 *
 * ## 왜 필요한가 — 침묵 제거 금지
 *
 * P6-b가 계산기에서 §155①⑥⑦⑯·§156의2⑤·§154① 단서 입력을 뺐다. 안내가 없으면 2주택
 * 세대는 **특례를 선언할 칸이 사라진 것**으로 보이고, 그 상태의 세액은 「특례 없음」으로
 * 계산된다(OH-20). 현행에서 ③을 비워 둔 것과 같은 값이지만, **왜** 그런지가 화면에
 * 없으면 결함으로 읽힌다.
 *
 * 🔑 §155⑧·합가는 이 카드가 말하지 않는다 — 계산기에 **그대로 남아 있다**(중과 배제가
 *    §167의10①4호·§167의3⑨라 §154① 충족을 요구하지 않는다). 있는 칸을 「판정 메뉴에서」라고
 *    안내하면 거짓말이 된다.
 *
 * 🔑 불러오기 런처를 **여기에 또 두지 않는다**. Step1에 이미 있고(`open-one-house-judgment-load`),
 *    같은 testid를 하나 더 만들면 E2E 셀렉터 유일성이 깨진다
 *    (memory `feedback_new_widget_breaks_uniqueness_selectors`).
 */
export function JudgmentHandoffNoticeCard({
  form,
}: {
  form: Pick<TransferFormData, "sourceJudgmentId" | "importedOneHouseFacts">;
}) {
  if (hasJudgmentProvenance(form)) return null;

  return (
    <ToneCard tone="sky" title="2주택 이상 비과세 특례는 판정 메뉴에서">
      <div data-testid="judgment-handoff-notice" className="space-y-2 text-sm">
        <p>
          일시적 2주택(§155①)·문화유산주택(§155⑥)·농어촌주택(§155⑦)·공공기관 이전(§155⑯)·
          대체주택(§156의2⑤)과 §154① 단서 사유는{" "}
          <Link
            href="/calc/one-house-exemption"
            className="font-medium underline underline-offset-2"
            data-testid="judgment-handoff-link"
          >
            1세대1주택 비과세 판정
          </Link>
          에서 판정한 뒤, 1단계의 「📋 판정 불러오기」로 가져오세요.
        </p>
        <p className="text-xs text-muted-foreground">
          판정을 거치지 않으면 이 계산은 <strong>위 특례 없음</strong>으로 산출됩니다.
          바로 아래의 수도권 밖 부득이한 사유 주택(§155⑧)과 합가 특례는 여기서 직접 입력합니다.
        </p>
      </div>
    </ToneCard>
  );
}
