/**
 * anchor — 단건 자동 백업 id는 **세션 공유 신호**다 (다건 합산 진입, 2026-09-16)
 *
 * 계획서: `docs/00-pm/transfer-history-multi-aggregate-entry.plan.md` §5-4
 *
 * ## 종전 결함
 *
 * 단건 계산이 끝나면 다건 store의 `properties[0]`에 자동 백업이 들어간다. 그것이
 * 「사용자 입력이 아니다」라고 가르는 신호는 **단건 계산기 컴포넌트의 `useRef`** 하나뿐이었다.
 *
 * 이력 화면은 **다른 컴포넌트**라 그 ref가 없다. 그래서 이력에서 「합산」으로 들어가면
 * `multiStoreHasUserWork(properties, null)`이 **항상 true**가 되어, 지울 사용자 입력이
 * 하나도 없는데도 「입력 중인 다건 작업이 있습니다」 폐기 확인이 **매번** 떴다 —
 * 그것도 「단건 계산 → 이력 → 합산」이라는 **가장 흔한 경로**에서.
 *
 * ⚠️ `multiStoreHasUserWork`의 안전측 규칙(id를 모르면 보존)은 **그대로 둔다**
 *    (`multi-backup-user-work-guard.anchor.test.ts`). 고친 것은 「id를 어떻게 아는가」다.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  useMultiTransferStore,
  multiStoreHasUserWork,
  setAutoBackupPropertyId,
  readAutoBackupPropertyId,
} from "@/lib/stores/multi-transfer-tax-store";
import { backupSingleToMulti } from "@/app/calc/transfer-tax/transfer-calc-actions";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  useMultiTransferStore.getState().reset();
});

describe("자동 백업 propertyId 세션 공유", () => {
  it("기록한 id를 다른 화면에서도 읽는다", () => {
    setAutoBackupPropertyId("backup-1");
    expect(readAutoBackupPropertyId()).toBe("backup-1");
  });

  it("🔴 백업 1건뿐이면 폐기 확인을 띄우지 않는다 — 지울 사용자 입력이 없다", () => {
    setAutoBackupPropertyId("backup-1");
    expect(
      multiStoreHasUserWork([{ propertyId: "backup-1" }], readAutoBackupPropertyId()),
    ).toBe(false);
  });

  it("사용자가 다건에서 자산을 늘렸으면 여전히 폐기 확인 대상", () => {
    setAutoBackupPropertyId("backup-1");
    expect(
      multiStoreHasUserWork(
        [{ propertyId: "backup-1" }, { propertyId: "user-2" }],
        readAutoBackupPropertyId(),
      ),
    ).toBe(true);
  });

  it("세션을 비우면(reset) 백업 신호도 함께 무효다 — 남기면 남의 입력을 덮어쓴다", () => {
    setAutoBackupPropertyId("backup-1");
    useMultiTransferStore.getState().reset();
    expect(readAutoBackupPropertyId()).toBeNull();
    expect(multiStoreHasUserWork([{ propertyId: "backup-1" }], readAutoBackupPropertyId())).toBe(
      true,
    );
  });

  /**
   * 🔑 헬퍼가 있는 것과 **생산자가 그것을 부르는 것**은 다른 층이다.
   *    이 단언이 없으면 `backupSingleToMulti`에서 한 줄을 지워도 위 4건이 전부 초록이다.
   */
  it("단건 자동 백업이 세션 키를 실제로 기록한다", () => {
    const form = {
      assets: [{ assetKind: "apartment" }],
      transferDate: "2026-10-05",
    } as unknown as TransferFormData;

    const id = backupSingleToMulti(form);

    expect(readAutoBackupPropertyId()).toBe(id);
    const { properties } = useMultiTransferStore.getState().form;
    expect(multiStoreHasUserWork(properties, readAutoBackupPropertyId())).toBe(false);
  });
});
