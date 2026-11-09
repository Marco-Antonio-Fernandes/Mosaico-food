import { useEffect, useState, type FormEvent } from "react";
import { Building2, Check, X } from "lucide-react";
import { formatCnpj, normalizeCnpj, type MosaicoAccount } from "@/components/shared/account-context";

interface AccountSetupModalProps {
  open: boolean;
  account: MosaicoAccount | null;
  onSave: (account: MosaicoAccount) => Promise<void> | void;
  onClose?: () => void;
}

export function AccountSetupModal({ open, account, onSave, onClose }: AccountSetupModalProps) {
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setDocument(formatCnpj(account?.document ?? ""));
    setCity(account?.city ?? "");
    setError("");
    setSaving(false);
  }, [account, open]);

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) return;
    const cnpj = normalizeCnpj(document);
    if (cnpj.length !== 14) {
      setError("Informe um CNPJ válido com 14 dígitos.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        id: account?.id ?? crypto.randomUUID(),
        name: normalizedName,
        document: formatCnpj(cnpj),
        city: city.trim(),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a empresa.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="account-setup-backdrop" role="presentation">
    <section className="account-setup-modal" role="dialog" aria-modal="true" aria-labelledby="account-setup-title">
      <header className="account-setup-header">
        <div className="account-setup-icon"><Building2 size={22} aria-hidden="true" /></div>
        <div>
          <span className="account-setup-kicker">Conta da empresa</span>
          <h2 id="account-setup-title">Identifique sua operação</h2>
        <p>Produtos, pedidos, clientes, WhatsApp e notas ficam associados a esta empresa.</p>
        </div>
        {account && onClose && <button type="button" className="account-setup-close" onClick={onClose} aria-label="Fechar configuração da conta"><X size={18} /></button>}
      </header>

      <form className="account-setup-form" onSubmit={submit}>
        <label>Nome da empresa<input autoFocus required value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Lanchonete da Ana" /></label>
        <div className="account-setup-grid">
          <label>CNPJ <span>obrigatório</span><input required inputMode="numeric" value={document} onChange={event => setDocument(formatCnpj(event.target.value))} placeholder="00.000.000/0000-00" /></label>
          <label>Cidade <span>opcional</span><input value={city} onChange={event => setCity(event.target.value)} placeholder="Ex.: Curitiba - PR" /></label>
        </div>
        {error && <p className="account-setup-error" role="alert">{error}</p>}
        <div className="account-setup-note"><Check size={15} aria-hidden="true" /><span>Esta é a conta ativa. Você poderá revisar esses dados depois em Configurações.</span></div>
        <footer className="account-setup-footer">
          {account && onClose && <button type="button" className="account-setup-secondary" onClick={onClose} disabled={saving}>Cancelar</button>}
          <button type="submit" disabled={saving}><Check size={16} aria-hidden="true" />{saving ? "Salvando…" : "Salvar empresa"}</button>
        </footer>
      </form>
    </section>
  </div>;
}
