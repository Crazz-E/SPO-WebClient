/**
 * CompanyCreationDialog - Modal dialog for creating a new company.
 * Allows user to enter company name and select a cluster type.
 */

const MAX_NAME_LENGTH = 50;

export interface CompanyCreationCallbacks {
  onCreateCompany: (companyName: string, cluster: string) => Promise<void>;
  onCancel: () => void;
}

export class CompanyCreationDialog {
  private overlay: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private clusterSelect: HTMLSelectElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;
  private errorMsg: HTMLElement | null = null;
  private visible = false;
  private callbacks: CompanyCreationCallbacks;
  private loading = false;

  constructor(callbacks: CompanyCreationCallbacks) {
    this.callbacks = callbacks;
  }

  public show(clusters: string[]): void {
    if (this.visible) return;
    this.visible = true;
    this.ensureDOM(clusters);
    if (this.overlay) {
      this.overlay.style.display = 'flex';
    }
    if (this.nameInput) {
      this.nameInput.value = '';
      this.nameInput.focus();
    }
    this.clearError();
    this.setLoading(false);
  }

  public hide(): void {
    if (!this.visible) return;
    this.visible = false;
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public showError(message: string): void {
    if (this.errorMsg) {
      this.errorMsg.textContent = message;
      this.errorMsg.style.display = 'block';
    }
  }

  public clearError(): void {
    if (this.errorMsg) {
      this.errorMsg.textContent = '';
      this.errorMsg.style.display = 'none';
    }
  }

  public setLoading(isLoading: boolean): void {
    this.loading = isLoading;
    if (this.submitBtn) {
      this.submitBtn.disabled = isLoading;
      this.submitBtn.textContent = isLoading ? 'Creating...' : 'Create Company';
    }
  }

  public destroy(): void {
    if (this.overlay && this.overlay.parentElement) {
      this.overlay.parentElement.removeChild(this.overlay);
    }
    this.overlay = null;
    this.panel = null;
    this.nameInput = null;
    this.clusterSelect = null;
    this.submitBtn = null;
    this.errorMsg = null;
    this.visible = false;
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  private ensureDOM(clusters: string[]): void {
    // Remove previous DOM if clusters changed
    if (this.overlay) {
      this.overlay.parentElement?.removeChild(this.overlay);
      this.overlay = null;
      this.panel = null;
    }

    this.overlay = document.createElement('div');
    this.overlay.id = 'company-creation-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 250;
    `;
    this.overlay.onmousedown = (e: MouseEvent) => {
      if (e.target === this.overlay) {
        this.hide();
        this.callbacks.onCancel();
      }
    };

    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      background: var(--bg-primary, #1e293b);
      border: 1px solid var(--glass-border, rgba(148,163,184,0.2));
      border-radius: 12px;
      padding: 24px;
      min-width: 360px;
      max-width: 440px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      color: var(--text-primary, #f1f5f9);
      font-family: var(--font-primary, system-ui);
    `;

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Create New Company';
    title.style.cssText = 'margin: 0 0 16px 0; font-size: 18px; font-weight: 700;';
    this.panel.appendChild(title);

    // Company name input
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Company Name';
    nameLabel.style.cssText = 'display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;';
    this.panel.appendChild(nameLabel);

    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = MAX_NAME_LENGTH;
    this.nameInput.placeholder = 'Enter company name...';
    this.nameInput.style.cssText = `
      width: 100%; box-sizing: border-box;
      padding: 8px 12px; margin-bottom: 16px;
      background: rgba(30,41,59,0.8);
      border: 1px solid var(--glass-border, rgba(148,163,184,0.2));
      border-radius: 8px;
      color: var(--text-primary, #f1f5f9);
      font-size: 14px;
      outline: none;
    `;
    this.nameInput.onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !this.loading) this.handleSubmit();
      if (e.key === 'Escape') { this.hide(); this.callbacks.onCancel(); }
    };
    this.panel.appendChild(this.nameInput);

    // Cluster select
    const clusterLabel = document.createElement('label');
    clusterLabel.textContent = 'Industry Cluster';
    clusterLabel.style.cssText = 'display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;';
    this.panel.appendChild(clusterLabel);

    this.clusterSelect = document.createElement('select');
    this.clusterSelect.style.cssText = `
      width: 100%; box-sizing: border-box;
      padding: 8px 12px; margin-bottom: 16px;
      background: rgba(30,41,59,0.8);
      border: 1px solid var(--glass-border, rgba(148,163,184,0.2));
      border-radius: 8px;
      color: var(--text-primary, #f1f5f9);
      font-size: 14px;
      outline: none;
    `;

    clusters.forEach(cluster => {
      const opt = document.createElement('option');
      opt.value = cluster;
      opt.textContent = cluster;
      this.clusterSelect!.appendChild(opt);
    });
    this.panel.appendChild(this.clusterSelect);

    // Error message area
    this.errorMsg = document.createElement('div');
    this.errorMsg.style.cssText = `
      display: none;
      padding: 8px 12px;
      margin-bottom: 12px;
      background: rgba(239,68,68,0.15);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 8px;
      color: #EF4444;
      font-size: 13px;
    `;
    this.panel.appendChild(this.errorMsg);

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 12px; justify-content: flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 8px 20px;
      background: rgba(51,65,85,0.5);
      border: 1px solid var(--glass-border, rgba(148,163,184,0.2));
      border-radius: 8px;
      color: var(--text-primary, #f1f5f9);
      font-size: 14px; cursor: pointer;
    `;
    cancelBtn.onclick = () => { this.hide(); this.callbacks.onCancel(); };

    this.submitBtn = document.createElement('button');
    this.submitBtn.textContent = 'Create Company';
    this.submitBtn.style.cssText = `
      padding: 8px 20px;
      background: var(--primary-blue, #3b82f6);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 14px; font-weight: 600; cursor: pointer;
    `;
    this.submitBtn.onclick = () => this.handleSubmit();

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(this.submitBtn);
    this.panel.appendChild(btnRow);

    this.overlay.appendChild(this.panel);
    document.body.appendChild(this.overlay);
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  private validate(): string | null {
    const name = this.nameInput?.value.trim() || '';
    if (name.length === 0) return 'Company name cannot be empty';
    if (name.length > MAX_NAME_LENGTH) return `Company name must be ${MAX_NAME_LENGTH} characters or less`;
    if (!this.clusterSelect?.value) return 'Please select a cluster';
    return null;
  }

  private handleSubmit(): void {
    if (this.loading) return;

    const error = this.validate();
    if (error) {
      this.showError(error);
      return;
    }

    this.clearError();
    this.setLoading(true);

    const companyName = this.nameInput!.value.trim();
    const cluster = this.clusterSelect!.value;

    this.callbacks.onCreateCompany(companyName, cluster)
      .then(() => {
        this.setLoading(false);
        this.hide();
      })
      .catch((err: unknown) => {
        this.setLoading(false);
        const msg = err instanceof Error ? err.message : 'Failed to create company';
        this.showError(msg);
      });
  }
}
