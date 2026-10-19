"use client";
import { useRef, useState } from "react";
import { Download, Upload, ShieldCheck, X, LoaderCircle } from "lucide-react";
import { backupChanges, BEFORE_RESTORE_KEY, createBackup, MAX_BACKUP_BYTES, parseBackup, writeSnapshot, type Product, type StockBackup } from "@/lib/backup";

export function BackupPanel({ snapshot, localSavedAt, storageError, canRestore, busy, onReview, onRestore, onReviewEnd }: {
  snapshot: StockBackup | null;
  localSavedAt: string | null;
  storageError: string;
  canRestore: boolean;
  busy: boolean;
  onReview: () => Promise<Product[]>;
  onRestore: (backup: StockBackup, expected: Product[]) => Promise<void>;
  onReviewEnd: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [review, setReview] = useState<{ backup: StockBackup; expected: Product[] } | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const formatDate = (date: string) => new Date(date).toLocaleString();
  function download(backup: StockBackup, label = "stockroom-backup") {
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${label}-${backup.savedAt.replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function choose(file: File | undefined) {
    if (!file || !canRestore || busy) return;
    setWorking(true); setError(""); setMessage("");
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("Choose a JSON backup smaller than 2 MB.");
      const backup = parseBackup(await file.text());
      const expected = await onReview();
      setReview({ backup, expected });
      setTimeout(() => cancelRef.current?.focus(), 0);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t open backup."); onReviewEnd(); }
    finally { setWorking(false); }
  }
  function close() { if (working) return; setReview(null); setError(""); onReviewEnd(); }
  async function restore() {
    if (!review) return;
    setWorking(true); setError("");
    try {
      if (review.expected.length) {
        // Preserve an independent, explicit pre-restore file as well as a local copy.
        const before = createBackup(review.expected);
        download(before, "stockroom-before-restore");
        try { writeSnapshot(window.localStorage, before, BEFORE_RESTORE_KEY); } catch { /* Download remains available when browser storage is blocked. */ }
      }
      await onRestore(review.backup, review.expected);
      setReview(null); onReviewEnd(); setMessage("Backup restored. Shared stock is up to date.");
    } catch (e) { setError(e instanceof Error ? e.message : "Restore failed. Refresh and review again."); }
    finally { setWorking(false); }
  }
  const changes = review ? backupChanges(review.backup, review.expected) : [];
  return <>
    <section className="backup-panel" aria-label="Stock backups">
      <div className="backup-info"><ShieldCheck size={21}/><div><strong>Keep a copy of your count</strong><p>{localSavedAt ? `Local backup · ${formatDate(localSavedAt)}` : "A local copy is saved after your first successful sync."}</p>{storageError && <p className="backup-error">{storageError}</p>}</div></div>
      <div className="backup-actions"><button disabled={!snapshot || busy || working} onClick={() => { if (snapshot) { download(snapshot); setMessage("Backup download started. Keep the JSON file somewhere safe."); } }}><Download size={15}/> Download backup</button><button disabled={!canRestore || busy || working} onClick={() => { setError(""); fileInput.current?.click(); }}><Upload size={15}/> Restore</button><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => { void choose(e.target.files?.[0]); e.target.value = ""; }}/></div>
      {(message || (error && !review) || working && !review) && <p className={error ? "backup-feedback backup-error" : "backup-feedback"} role="status">{error || (working ? "Checking backup and current stock…" : message)}</p>}
      <p className="backup-note">Local copies belong to this browser. Download a file after counting; clearing site data can remove the local copy. Downloads contain confirmed stock only.</p>
    </section>
    {review && <div className="modal-backdrop"><section className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-title" onKeyDown={e => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") { const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')); const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    }}>
      <div className="dialog-heading"><h2 id="restore-title">Review stock restore</h2><button disabled={working} aria-label="Close restore preview" onClick={close}><X size={20}/></button></div>
      <p>Backup saved: <b>{formatDate(review.backup.savedAt)}</b></p><p><b>{changes.length} products</b> will change. All other quantities stay the same.</p>
      <div className="restore-list"><table><thead><tr><th>Product</th><th>Current</th><th>Backup</th></tr></thead><tbody>{changes.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.previous}</td><td>{p.quantity}</td></tr>)}</tbody></table>{!changes.length && <p className="no-changes">This backup already matches the saved stock.</p>}</div>
      <p className="restore-help">Restoring replaces current quantities. A pre-restore backup download starts when you confirm. If another device changes stock after this preview, the restore is blocked.</p>
      {error && <p className="backup-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button ref={cancelRef} disabled={working} onClick={close}>Cancel</button><button className="confirm-restore" disabled={working || !changes.length} onClick={() => void restore()}>{working && <LoaderCircle size={15} className="spin"/>}{working ? "Restoring…" : `Restore ${changes.length} changes`}</button></div>
    </section></div>}
  </>;
}
