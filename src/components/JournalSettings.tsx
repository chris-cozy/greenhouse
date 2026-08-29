import { useRef, useState } from "react";
import { ArchiveRestore, Download, FileArchive, ShieldCheck, Trees, Upload } from "lucide-react";
import { api } from "../api";
import { setForestAesthetic, useForestAesthetic } from "../appearance";
import { ErrorNote, Modal, PageHeader } from "./Common";
import { useMutation } from "./Interaction";

export function SettingsPage() {
  const appearance = useForestAesthetic();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null), [confirm, setConfirm] = useState(false), [restored, setRestored] = useState(false);
  const mutation = useMutation(), completed = useRef(false);
  const busy = mutation.busy || restored;
  const restore = () => {
    if (!file || completed.current) return;
    void mutation.run(async () => {
      const form = new FormData(); form.append("backup", file);
      await api.upload("/api/restore", form);
    }, () => {
      completed.current = true; setRestored(true); setConfirm(false);
      // A restored database requires a full reload even if navigation occurs during this confirmation.
      window.setTimeout(() => window.location.assign("/"), 800);
    });
  };
  return <div className="content settings-page">
    <PageHeader eyebrow="Settings" title="Your Local Greenhouse" description="Data lives on this computer. Keep a portable backup somewhere safe."/>
    <section className="settings-card appearance-settings" aria-labelledby="appearance-heading">
      <div className="appearance-heading"><Trees aria-hidden="true"/><h2 id="appearance-heading">Appearance</h2></div>
      <div className="appearance-choice">
        <div><label id="forest-aesthetic-label" htmlFor="forest-aesthetic">Forest aesthetic</label><p id="forest-aesthetic-help">Use a softly lit forest and green glass panels. Saved in this browser.</p></div>
        <button id="forest-aesthetic" className="appearance-switch" type="button" role="switch" aria-checked={appearance.enabled} aria-labelledby="forest-aesthetic-label" aria-describedby="forest-aesthetic-help forest-aesthetic-storage" onClick={() => setForestAesthetic(!appearance.enabled)}><span aria-hidden="true"/><span className="visually-hidden">{appearance.enabled ? "On" : "Off"}</span></button>
      </div>
      <p id="forest-aesthetic-storage" className="appearance-storage" role="status">{!appearance.remembered && "This choice works for this session, but browser storage is unavailable so it could not be remembered."}</p>
    </section>
    <div className="settings-grid">
      <article className="settings-card"><div className="setting-icon"><Download/></div><span className="eyebrow">Complete backup</span><h2>Take your greenhouse with you</h2><p>Download one ZIP containing a consistent SQLite snapshot, every uploaded image, and a versioned manifest.</p><a className="button primary" href="/api/backup"><FileArchive/> Download backup</a></article>
      <article className="settings-card"><div className="setting-icon amber"><ArchiveRestore/></div><span className="eyebrow">Restore</span><h2>Return to a saved state</h2><p>Restoring replaces your current greenhouse with the contents of a backup. Download a fresh backup first if you want to keep today’s records.</p><p><ShieldCheck size={16} aria-hidden="true"/> Greenhouse validates the file and keeps a rollback copy while restoring.</p>
        <input ref={input} hidden disabled={busy} aria-label="Backup ZIP file" type="file" accept=".zip,application/zip" onChange={e => { setFile(e.target.files?.[0] || null); mutation.clearError(); }}/>
        {file && <span className="backup-filename">Selected: {file.name}</span>}
        <div className="restore-controls"><button className="button ghost" disabled={busy} onClick={() => input.current?.click()}><Upload/> {file ? "Choose another backup" : "Choose backup"}</button>{file && <button className="button primary" disabled={busy} onClick={() => setConfirm(true)}>Restore this backup</button>}</div>
        <div className="success-note" role="status">{restored && "Greenhouse was restored successfully. Reloading…"}</div>
        {!confirm && mutation.error && <ErrorNote message={mutation.error}/>}
      </article>
    </div>
    <Modal open={confirm} busy={mutation.busy} title="Replace this greenhouse?" eyebrow="Restore a backup" onClose={() => { if (!mutation.isBusy()) setConfirm(false); }}>
      <div className="restore-confirm"><p>Restore <strong>{file?.name}</strong> and replace the current plants, terrariums, species, journal entries, and photos with this backup.</p><p>This cannot be undone from the application. Keep a current backup before continuing.</p>{mutation.error && <ErrorNote message={mutation.error}/>}<div className="form-actions"><button className="button ghost" disabled={mutation.busy} onClick={() => setConfirm(false)}>Cancel</button><button className="button danger" disabled={mutation.busy} onClick={restore}>{mutation.busy ? "Restoring…" : "Replace and restore"}</button></div></div>
    </Modal>
  </div>;
}
