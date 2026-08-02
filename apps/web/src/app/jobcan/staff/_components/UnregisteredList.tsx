"use client";

import { IosCallout } from "../../_components/ios";

interface UnregisteredListProps {
  /** 取込画面の warning から遷移してきた未登録 staffCode。 */
  staffCode: string;
  /** 既に名簿に存在するか(存在するなら「登録済み」表示に切替)。 */
  alreadyRegistered: boolean;
}

/** 取込画面(email 未登録 warning)から渡された staffCode の案内。 */
export function UnregisteredList({ staffCode, alreadyRegistered }: UnregisteredListProps) {
  if (staffCode.length === 0) return null;

  return (
    <IosCallout
      tone={alreadyRegistered ? "success" : "warning"}
      style={{ marginBottom: 20 }}
    >
      {alreadyRegistered ? (
        <span>
          <strong>{staffCode}</strong> は登録済みです。取込画面へ戻って再実行できます。
        </span>
      ) : (
        <span>
          取込画面から <strong>{staffCode}</strong>{" "}
          の登録依頼が来ています。下のカードで email を対応づけてください。
        </span>
      )}
    </IosCallout>
  );
}
