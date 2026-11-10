import { Building2 } from "lucide-react";

import { loadMosaicoAccount } from "@/components/shared/account-context";
import { FoodBackupPanel } from "@/features/system/food-backup-panel";
import { FoodNotificationsPanel } from "@/features/system/food-notifications-panel";
import { FoodPrinterPanel } from "@/features/system/food-printer-panel";
import { FoodUpdatePanel } from "@/features/system/food-update-panel";

export function FoodSettingsPanel() {
  const account = loadMosaicoAccount();
  return <div className="food-settings">
    <section className="food-settings-account">
      <div className="food-update-icon"><Building2 size={22} /></div>
      <div>
        <p className="food-backup-eyebrow">Loja</p>
        <h2>{account?.name ?? "Loja sem nome"}</h2>
        <p>{[account?.document, account?.city].filter(Boolean).join(" · ") || "Cadastre os dados da empresa no botão da conta."}</p>
      </div>
      <span className="food-settings-hint">Para alterar, use o botão da conta no topo da tela.</span>
    </section>
    <FoodBackupPanel />
    <FoodNotificationsPanel />
    <FoodUpdatePanel />
    <FoodPrinterPanel />
  </div>;
}
