"use client";

/**
 * 이력 백업 액션 — 내보내기/가져오기 버튼 + 경고·병합선택 Dialog + 토스트.
 *
 * 계획서: docs/00-pm/local-first-storage-backup.plan.md §4-5·§4-6
 * - 내보내기: 평문 경고 Dialog(세무사 모드 추가 고지) + 선택적 AES-GCM 비밀번호 암호화 → 다운로드.
 * - 가져오기: 파일 선택 → (암호화 시 비밀번호 복호화) → 검증 → 병합/덮어쓰기 → loadRecords 갱신.
 * - 파괴적 액션은 BaseUI Dialog(window.confirm 금지).
 */

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { SaveToast, type SaveToastMessage } from "@/components/calc/shared/SaveToast";
import { buildBackup, type BackupFile, type BackupFilter } from "@/lib/storage/backup-export";
import { validateBackup } from "@/lib/storage/backup-validate";
import { importBackup, type ImportMode } from "@/lib/storage/backup-import";
import {
  encryptBackup,
  decryptBackup,
  isEncryptedBackupShape,
  type EncryptedBackupFile,
} from "@/lib/storage/backup-crypto";
import { downloadJson, formatIsoStamp } from "@/lib/utils/file-download";
import type { UserMode, LocalTaxType } from "@/lib/storage/types";

interface Props {
  mode: UserMode;
  /** 가져오기 완료 후 목록 갱신 콜백 (loadRecords 재호출). */
  onImported: () => void;
  /** 현재 화면 필터 — "현재 보기만 내보내기" 옵션용. */
  currentFilter?: {
    taxType: LocalTaxType | "all";
    clientId: string | null | "all";
    label: string;
  };
}

const BTN_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 transition-colors disabled:opacity-40";

const PW_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function HistoryBackupActions({ mode, onImported, currentFilter }: Props) {
  const [exportOpen, setExportOpen] = useState(false);
  const [exportEncrypt, setExportEncrypt] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportFiltered, setExportFiltered] = useState(false);

  const filterActive =
    !!currentFilter &&
    (currentFilter.taxType !== "all" || currentFilter.clientId !== "all");

  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);
  const [pendingEncrypted, setPendingEncrypted] = useState<EncryptedBackupFile | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importDecryptError, setImportDecryptError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<SaveToastMessage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function resetExportDialog() {
    setExportOpen(false);
    setExportEncrypt(false);
    setExportPassword("");
    setExportFiltered(false);
  }

  async function handleExportConfirm() {
    const encrypt = exportEncrypt;
    const password = exportPassword;
    const useFilter = exportFiltered && filterActive;
    const filter: BackupFilter | undefined =
      useFilter && currentFilter
        ? {
            taxType:
              currentFilter.taxType !== "all" ? currentFilter.taxType : undefined,
            clientId:
              currentFilter.clientId !== "all" ? currentFilter.clientId : undefined,
          }
        : undefined;
    resetExportDialog();
    setBusy(true);
    try {
      const backup = await buildBackup(undefined, filter);
      if (backup.calculations.length === 0 && backup.clients.length === 0) {
        setToast({ kind: "info", text: "내보낼 이력이 없습니다." });
        return;
      }
      if (encrypt) {
        const enc = await encryptBackup(backup, password);
        downloadJson(enc, `korean-tax-calc-backup_${formatIsoStamp()}_encrypted.json`);
        setToast({ kind: "success", text: `${backup.calculations.length}건 암호화 내보내기 완료` });
      } else {
        downloadJson(backup, `korean-tax-calc-backup_${formatIsoStamp()}.json`);
        setToast({ kind: "success", text: `${backup.calculations.length}건 내보내기 완료` });
      }
    } catch {
      setToast({ kind: "error", text: "내보내기에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (isEncryptedBackupShape(raw)) {
        // 암호화 파일 → 비밀번호 입력 Dialog
        setImportPassword("");
        setImportDecryptError(null);
        setPendingEncrypted(raw);
        return;
      }
      const result = validateBackup(raw);
      if (!result.ok) {
        setToast({ kind: "error", text: result.error });
        return;
      }
      setPendingBackup(result.data);
    } catch {
      setToast({ kind: "error", text: "JSON 파일을 읽을 수 없습니다." });
    }
  }

  async function handleDecrypt() {
    if (!pendingEncrypted) return;
    setBusy(true);
    setImportDecryptError(null);
    try {
      const raw = await decryptBackup(pendingEncrypted, importPassword);
      const result = validateBackup(raw);
      if (!result.ok) {
        setImportDecryptError(result.error);
        return;
      }
      setPendingEncrypted(null);
      setPendingBackup(result.data); // 병합/덮어쓰기 선택으로 진행
    } catch (err) {
      setImportDecryptError(
        err instanceof Error ? err.message : "복호화에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(importMode: ImportMode) {
    if (!pendingBackup) return;
    const backup = pendingBackup;
    setPendingBackup(null);
    setBusy(true);
    try {
      const res = await importBackup(backup, importMode);
      onImported();
      const parts = [`신규 ${res.added}건`];
      if (res.skipped) parts.push(`중복 ${res.skipped}건 건너뜀`);
      if (res.linksCleared) parts.push(`연결 ${res.linksCleared}건 정리`);
      setToast({ kind: "success", text: `가져오기 완료 — ${parts.join(", ")}` });
    } catch {
      setToast({ kind: "error", text: "가져오기에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  }

  const exportConfirmDisabled = exportEncrypt && exportPassword.trim().length === 0;

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          disabled={busy}
          className={BTN_CLASS}
          data-testid="history-export-button"
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          내보내기
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className={BTN_CLASS}
          data-testid="history-import-button"
        >
          <Upload className="h-3.5 w-3.5 shrink-0" />
          가져오기
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
        data-testid="history-import-file"
      />

      {/* 내보내기 — 평문 경고 + 선택적 암호화 */}
      <Dialog open={exportOpen} onOpenChange={(o) => (o ? setExportOpen(true) : resetExportDialog())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>이력 내보내기</DialogTitle>
            <DialogDescription>
              주소·공시가격·세액·거래일자·계산 대상자 정보
              {mode === "professional" ? "·의뢰인 연락처·이메일·메모" : ""} 등 모든
              계산 입출력이 저장됩니다.
              {mode === "professional" &&
                " 의뢰인의 개인정보가 포함되므로 동의 없이 공유·저장하지 마세요."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {filterActive && (
              <ToggleCard
                variant="chip"
                tone="sky"
                title="현재 보기만 내보내기"
                description={currentFilter?.label}
                checked={exportFiltered}
                onCheckedChange={setExportFiltered}
              />
            )}
            <ToggleCard
              variant="chip"
              tone="violet"
              title="비밀번호로 암호화"
              description="AES-256 암호화 — 안전하게 외부 보관"
              checked={exportEncrypt}
              onCheckedChange={setExportEncrypt}
            />
            {exportEncrypt ? (
              <div className="space-y-1">
                <input
                  type="password"
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                  placeholder="암호화 비밀번호"
                  className={PW_INPUT_CLASS}
                  data-testid="history-export-password"
                />
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  비밀번호를 잊으면 백업을 복구할 수 없습니다. 안전하게 보관하세요.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                암호화하지 않으면 <strong>평문</strong>으로 저장됩니다. 안전한 곳에 보관하세요.
              </p>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={resetExportDialog}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted/60"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleExportConfirm}
              disabled={exportConfirmDisabled}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="history-export-confirm"
            >
              내보내기
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 가져오기 — 암호화 파일 비밀번호 입력 */}
      <Dialog
        open={pendingEncrypted !== null}
        onOpenChange={(o) => !o && setPendingEncrypted(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>암호화된 백업 — 비밀번호 입력</DialogTitle>
            <DialogDescription>
              암호화된 백업 파일입니다. 내보낼 때 설정한 비밀번호를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <input
              type="password"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              placeholder="비밀번호"
              className={PW_INPUT_CLASS}
              data-testid="history-import-password"
              onKeyDown={(e) => {
                if (e.key === "Enter" && importPassword.trim()) handleDecrypt();
              }}
            />
            {importDecryptError && (
              <p className="text-xs text-rose-600 dark:text-rose-400" data-testid="history-decrypt-error">
                {importDecryptError}
              </p>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setPendingEncrypted(null)}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted/60"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleDecrypt}
              disabled={busy || importPassword.trim().length === 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="history-decrypt-confirm"
            >
              {busy ? "복호화 중..." : "복호화"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 가져오기 — 병합/덮어쓰기 선택 */}
      <Dialog
        open={pendingBackup !== null}
        onOpenChange={(o) => !o && setPendingBackup(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>이력 가져오기</DialogTitle>
            <DialogDescription>
              {pendingBackup
                ? `${pendingBackup.calculations.length}건의 계산 이력을 가져옵니다. `
                : ""}
              신뢰할 수 있는 출처의 백업만 가져오세요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
            <button
              type="button"
              onClick={() => handleImport("merge")}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              data-testid="history-import-merge"
            >
              병합 — 기존 이력 유지 + 중복 제외
            </button>
            <button
              type="button"
              onClick={() => handleImport("overwrite")}
              className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-300"
              data-testid="history-import-overwrite"
            >
              덮어쓰기 — 기존 이력 전체 교체
            </button>
            <button
              type="button"
              onClick={() => setPendingBackup(null)}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted/60"
            >
              취소
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SaveToast message={toast} onClose={() => setToast(null)} />
    </>
  );
}
