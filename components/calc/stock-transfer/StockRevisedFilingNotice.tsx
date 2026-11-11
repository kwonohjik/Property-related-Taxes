/**
 * 주식 «수정신고» 선택 시 안내 (V-14 · Q-1 a · Q-2 항상)
 *
 * 계획서: docs/00-pm/stock-revised-filing-v14.plan.md
 * 수정신고를 골라도 계산은 확정신고와 같다 — 이 카드는 그 사실을 알리고 세액·전송에는 아무 영향이 없다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";

export function StockRevisedFilingNotice() {
  return (
    <ToneCard tone="amber" title="수정신고는 추가납부세액을 계산하지 않습니다">
      <div data-testid="stock-revised-filing-notice" className="space-y-2">
        <p className="text-sm">
          이 계산기는 수정신고(국세기본법 §45)의 <strong>추가납부세액</strong>(수정 결정세액 − 당초 결정세액)과{" "}
          <strong>가산세 감면</strong>(국세기본법 §48②1호 — 법정신고기한 후 수정신고 시기별 감면)을 계산하지 않습니다.
          결과는 확정신고와 같은 방식으로 나오며, 표시되는 결정세액은 <strong>수정 후 전체 세액</strong>입니다.
        </p>
        <p className="text-sm">
          이미 신고·납부한 <strong>당초 세액</strong>을 빼서 추가로 낼 세액을 직접 확인하세요. 과소신고가산세를 입력하는
          경우 «당초 신고세액»을 비우면 기준금액이 결정세액 전액이 되어 가산세가 커집니다.
        </p>
        <p className="text-caption text-muted-foreground">이 안내는 계산 방식을 알릴 뿐 세액에는 영향을 주지 않습니다.</p>
      </div>
    </ToneCard>
  );
}
