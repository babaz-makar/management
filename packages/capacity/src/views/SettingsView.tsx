// 設定（メンバー管理）ビュー。元HTML版 renderSettings/addMember/updateFile/removeMember を React 化。
import { useRef, useState } from "react";
import { useCapacity } from "../store";
import { parseXlsx, readFileAB } from "../lib/parseXlsx";

export function SettingsView() {
  const { allData, memberMeta, client, reload, toast } = useCapacity();
  const names = Object.keys(allData);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState<{ ab: ArrayBuffer; fileName: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function handleUpdate(name: string, file: File | undefined) {
    if (!file) return;
    setBusyMember(name);
    try {
      const ab = await readFileAB(file);
      await client.upsertMember(name, file.name, parseXlsx(ab));
      await reload();
      toast(`✅ ${name} を更新しました`);
    } catch (e) {
      toast("❌ " + (e as Error).message, 4000);
    } finally {
      setBusyMember(null);
    }
  }

  async function handleRemove(name: string) {
    if (!window.confirm(`${name} を削除しますか？`)) return;
    const meta = memberMeta[name];
    if (!meta) return;
    try {
      await client.deleteMember(meta.id);
      await reload();
      toast(`🗑 ${name} を削除しました`);
    } catch (e) {
      toast("❌ " + (e as Error).message, 4000);
    }
  }

  async function onNewFile(file: File | undefined) {
    if (!file) return;
    const ab = await readFileAB(file);
    setPending({ ab, fileName: file.name });
    if (!newName) {
      const parts = file.name.replace(/\.xlsx?$/i, "").split("_");
      if (parts.length >= 3) setNewName(parts[2]);
    }
  }

  async function handleAdd() {
    const name = newName.trim();
    if (!name) { window.alert("メンバー名を入力してください"); return; }
    if (!pending) { window.alert("ファイルを選択してください"); return; }
    setSubmitting(true);
    try {
      await client.upsertMember(name, pending.fileName, parseXlsx(pending.ab));
      await reload();
      closeForm();
      toast(`✅ ${name} を追加しました`);
    } catch (e) {
      toast("❌ " + (e as Error).message, 4000);
    } finally {
      setSubmitting(false);
    }
  }

  function openForm() {
    setAdding(true);
    setPending(null);
    setNewName("");
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }
  function closeForm() {
    setAdding(false);
    setNewName("");
    setPending(null);
  }

  return (
    <div className="main">
      <p className="sec" style={{ marginTop: 4 }}>メンバー管理</p>
      <div className="hint">
        各メンバーの最新キャパ管理シート（.xlsx）を添付すると、全員のダッシュボードに即時反映されます。データはSupabaseに保存されるため、
        <strong style={{ color: "var(--teal)" }}>誰かが更新したら全員の画面に反映</strong>されます。
      </div>

      <div className="settings-grid">
        {names.map((name) => {
          const meta = memberMeta[name] || {};
          const monthsN = Object.keys(allData[name] || {});
          const lastMo = monthsN[monthsN.length - 1];
          const upIso = lastMo ? allData[name][lastMo]?.uploadedAt : null;
          const upAt = upIso ? new Date(upIso).toLocaleDateString("ja-JP") : "—";
          const busy = busyMember === name;
          return (
            <div className="mc" key={name}>
              <div className="mc-head">
                <div className="mc-av">{name[0]}</div>
                <div>
                  <div className="mc-nm">{name}</div>
                  <div className="mc-st ok">✅ {monthsN.length}ヶ月 · {upAt} 更新</div>
                </div>
              </div>
              {meta.file_name && (
                <div className="file-chip"><span>📄</span><span className="fname">{meta.file_name}</span></div>
              )}
              <div className="mc-actions">
                <label className="btn btn-teal" style={{ cursor: "pointer" }}>
                  {busy ? "⏳" : "↑ 更新"}
                  <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} disabled={busy}
                    onChange={(e) => handleUpdate(name, e.target.files?.[0])} />
                </label>
                <button className="btn btn-danger" onClick={() => handleRemove(name)}>削除</button>
              </div>
            </div>
          );
        })}
      </div>

      {!adding ? (
        <div>
          <button className="add-btn" onClick={openForm}>＋ メンバーを追加</button>
        </div>
      ) : (
        <div>
          <div className="add-form">
            <label>メンバー名</label>
            <input ref={nameInputRef} type="text" placeholder="例: 直井理子" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <label>キャパ管理シート（.xlsx）</label>
            <div
              className={"drop-area" + (dragover ? " dragover" : "")}
              onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => { e.preventDefault(); setDragover(false); onNewFile(e.dataTransfer.files?.[0]); }}
            >
              <input type="file" accept=".xlsx,.xls" onChange={(e) => onNewFile(e.target.files?.[0])} />
              <div className="drop-text">📎 <strong>クリックまたはドロップ</strong>でファイルを選択</div>
            </div>
            {pending && (
              <div className="file-chip"><span>📄</span><span className="fname">{pending.fileName}</span></div>
            )}
            <div className="add-form-actions">
              <button className="btn btn-teal" disabled={submitting} onClick={handleAdd}>{submitting ? "⏳" : "追加"}</button>
              <button className="btn btn-ghost" onClick={closeForm}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
