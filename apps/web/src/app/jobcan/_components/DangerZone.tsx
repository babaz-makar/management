"use client";

import type { JobcanImportFileError } from "@management/shift-management";
import { IosCallout } from "./ios";

interface DangerZoneProps {
  totalDeletes: number;
  mismatchFiles: JobcanImportFileError[];
}

/**
 * 危険操作の可視化パネル(削除件数・取り違え兆候)。
 * 削除>0 または staff_code_mismatch があるときだけ表示し、本反映前に赤で強調する。
 */
export function DangerZone({ totalDeletes, mismatchFiles }: DangerZoneProps) {
  const hasDanger = totalDeletes > 0 || mismatchFiles.length > 0;
  if (!hasDanger) return null;

  return (
    <IosCallout tone="danger" title="危険な変更が含まれます" style={{ marginBottom: 20 }}>
      {totalDeletes > 0 && (
        <p style={{ margin: "4px 0", fontWeight: 700 }}>
          カレンダーから {totalDeletes} 件の予定を削除します。
        </p>
      )}
      {mismatchFiles.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: "4px 0", fontWeight: 700 }}>
            ファイル取り違えの兆候({mismatchFiles.length}件):
          </p>
          <ul style={{ margin: "4px 0 0", paddingLeft: "1.2rem" }}>
            {mismatchFiles.map((file, index) => (
              <li key={`${file.fileName}-${index}`}>{file.fileName}</li>
            ))}
          </ul>
        </div>
      )}
    </IosCallout>
  );
}
