/**
 * Building Details Panel
 *
 * Main panel component for displaying detailed building information.
 * Uses templates to determine which properties to show for each building type.
 */

import {
  BuildingDetailsResponse,
  BuildingDetailsTab,
} from '../../../shared/types';
import {
  getGroupById,
} from '../../../shared/building-details';
import { renderPropertyGroup } from './property-renderers';
import { renderSuppliesWithTabs, renderProductsWithTabs, DisconnectCallback, TablePropertyChangeCallback, SearchConnectionCallback } from './property-table';
import { renderSparklineGraph } from './property-graph';

export interface BuildingDetailsPanelOptions {
  onClose?: () => void;
  onPropertyChange?: (propertyName: string, value: string, additionalParams?: Record<string, string>) => Promise<void>;
  onNavigateToBuilding?: (x: number, y: number) => void;
  onUpgradeAction?: (action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE', count?: number) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onRename?: (newName: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onActionButton?: (actionId: string, details: BuildingDetailsResponse) => void;
  onSearchConnections?: (fluidId: string, fluidName: string, direction: 'input' | 'output') => void;
  /** Current player's company name — used to determine building ownership */
  currentCompanyName?: string;
}

export class BuildingDetailsPanel {
  private container: HTMLElement;
  private modal: HTMLElement | null = null;
  private header: HTMLElement | null = null;
  private tabsNav: HTMLElement | null = null;
  private contentContainer: HTMLElement | null = null;

  private currentDetails: BuildingDetailsResponse | null = null;
  private currentTab: string = 'overview';

  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private posX = 0;
  private posY = 0;

  private options: BuildingDetailsPanelOptions;

  // Track focused/editing elements to avoid disrupting user input
  private activeFocusedElement: HTMLElement | null = null;

  // Rename mode state
  private isRenameMode: boolean = false;

  // Auto-refresh timer (20s interval while panel is open)
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly REFRESH_INTERVAL_MS = 20_000;

  /**
   * Whether the current player owns the currently displayed building.
   * When false, edit controls (rename, delete, sliders, upgrade) are hidden.
   */
  private get isOwner(): boolean {
    if (!this.currentDetails || !this.options.currentCompanyName) {
      console.debug(`[BuildingDetails] isOwner=false: details=${!!this.currentDetails}, companyName="${this.options.currentCompanyName || ''}"`);
      return false;
    }
    const match = this.currentDetails.ownerName === this.options.currentCompanyName;
    if (!match) {
      console.debug(`[BuildingDetails] isOwner=false: owner="${this.currentDetails.ownerName}" vs company="${this.options.currentCompanyName}"`);
    }
    return match;
  }

  /**
   * Whether the current player is the mayor of the currently displayed Town Hall.
   * Town Hall buildings use ActualRuler (in the townGeneral group) instead of
   * ownerName to determine who has editing privileges on town tabs.
   */
  private get isMayor(): boolean {
    if (!this.currentDetails || !this.options.currentCompanyName) return false;
    const townGeneralGroup = this.currentDetails.groups['townGeneral'];
    if (!townGeneralGroup) return false;
    const rulerProp = townGeneralGroup.find(p => p.name === 'ActualRuler');
    if (!rulerProp) return false;
    return rulerProp.value === this.options.currentCompanyName;
  }

  constructor(container: HTMLElement, options: BuildingDetailsPanelOptions = {}) {
    this.container = container;
    this.options = options;
    this.init();
  }

  /**
   * Update panel callback options
   */
  public updateOptions(opts: Partial<BuildingDetailsPanelOptions>): void {
    Object.assign(this.options, opts);
  }

  /**
   * Initialize the panel DOM
   */
  private init(): void {
    this.modal = document.createElement('div');
    this.modal.id = 'building-details-panel';
    this.modal.className = 'building-details-panel';
    this.modal.style.display = 'none';

    // Header
    this.header = this.createHeader();
    this.modal.appendChild(this.header);

    // Tabs navigation
    this.tabsNav = document.createElement('div');
    this.tabsNav.className = 'building-details-tabs';
    this.modal.appendChild(this.tabsNav);

    // Content container
    this.contentContainer = document.createElement('div');
    this.contentContainer.className = 'building-details-content';
    this.modal.appendChild(this.contentContainer);

    // Footer
    const footer = this.createFooter();
    this.modal.appendChild(footer);

    this.container.appendChild(this.modal);

    // Track focus events globally on the modal to detect active editing
    this.setupFocusTracking();
  }

  /**
   * Setup focus tracking to prevent refresh interference with user input
   */
  private setupFocusTracking(): void {
    if (!this.modal) return;

    // Track when user focuses on an input
    this.modal.addEventListener('focusin', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        this.activeFocusedElement = target;
      }
    });

    // Clear tracking when user leaves the input
    this.modal.addEventListener('focusout', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.activeFocusedElement) {
        this.activeFocusedElement = null;
      }
    });
  }

  /**
   * Create the panel header
   */
  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'building-details-header';

    const titleContainer = document.createElement('div');
    titleContainer.className = 'header-title-container';
    titleContainer.innerHTML = `
      <div class="header-icon">B</div>
      <div class="header-info">
        <div class="header-title-wrapper">
          <div class="header-title" id="bd-building-name">Building</div>
          <button class="rename-btn" id="bd-rename-btn" title="Rename building">✎</button>
        </div>
        <div class="header-subtitle" id="bd-template-name">Loading...</div>
      </div>
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'header-buttons';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'header-delete-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete building';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      this.showDeleteConfirmation();
    };

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'header-refresh-btn';
    refreshBtn.innerHTML = '↻';
    refreshBtn.title = 'Refresh current tab';
    refreshBtn.onclick = async (e) => {
      e.stopPropagation();
      await this.handleManualRefresh();
    };

    const closeBtn = document.createElement('button');
    closeBtn.className = 'header-close-btn';
    closeBtn.innerHTML = 'X';
    closeBtn.title = 'Close';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.hide();
      if (this.options.onClose) {
        this.options.onClose();
      }
    };

    buttonContainer.appendChild(deleteBtn);
    buttonContainer.appendChild(refreshBtn);
    buttonContainer.appendChild(closeBtn);

    header.appendChild(titleContainer);
    header.appendChild(buttonContainer);

    // Drag handlers - but not on buttons
    header.onmousedown = (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('button') && !target.closest('input')) {
        this.startDrag(e);
      }
    };

    return header;
  }

  /**
   * Create the panel footer
   */
  private createFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.className = 'building-details-footer';
    footer.innerHTML = `
      <div class="footer-coords" id="bd-coords">(0, 0)</div>
      <div class="footer-visual-class" id="bd-visual-class">VC: --</div>
      <div class="footer-timestamp" id="bd-timestamp">--:--:--</div>
    `;
    return footer;
  }

  /**
   * Show the panel with building details
   */
  public show(details: BuildingDetailsResponse): void {
    this.currentDetails = details;

    // Set initial position if not set
    if (this.posX === 0 && this.posY === 0) {
      const rect = this.container.getBoundingClientRect();
      this.posX = (rect.width - 650) / 2;
      this.posY = 80;
    }

    this.updatePosition();
    this.renderContent();

    if (this.modal) {
      this.modal.style.display = 'flex';
      this.modal.style.animation = 'scaleIn 0.2s ease-out';
    }

    // Start auto-refresh timer
    this.startAutoRefresh();
  }

  /**
   * Hide the panel
   */
  public hide(): void {
    this.stopAutoRefresh();

    if (this.modal) {
      this.modal.style.animation = 'fadeOut 0.2s ease-out';
      setTimeout(() => {
        if (this.modal) {
          this.modal.style.display = 'none';
        }
      }, 200);
    }
  }

  /**
   * Start periodic auto-refresh (every 20s)
   * Skips refresh if user is actively editing an input
   */
  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(async () => {
      if (!this.activeFocusedElement && this.options.onRefresh) {
        await this.options.onRefresh();
      }
    }, BuildingDetailsPanel.REFRESH_INTERVAL_MS);
  }

  /**
   * Stop the auto-refresh timer
   */
  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Check if panel is visible
   */
  public isVisible(): boolean {
    return this.modal?.style.display !== 'none';
  }

  /**
   * Update the panel with new details
   * Uses smart refresh to avoid disrupting user input
   */
  public update(details: BuildingDetailsResponse): void {
    this.currentDetails = details;

    // If user is actively editing an input, defer full render
    if (this.activeFocusedElement) {
      this.renderContentSmart();
    } else {
      this.renderContent();
    }
  }

  /**
   * Handle manual refresh button click
   * Triggers refresh callback provided by parent
   */
  private async handleManualRefresh(): Promise<void> {
    if (this.options.onRefresh) {
      const refreshBtn = this.header?.querySelector('.header-refresh-btn') as HTMLButtonElement;
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.style.opacity = '0.5';
      }

      try {
        await this.options.onRefresh();
      } finally {
        if (refreshBtn) {
          refreshBtn.disabled = false;
          refreshBtn.style.opacity = '1';
        }
      }
    }
  }

  /**
   * Setup rename button functionality
   */
  private setupRenameButton(): void {
    const renameBtn = document.getElementById('bd-rename-btn');
    if (!renameBtn) return;

    renameBtn.onclick = (e) => {
      e.stopPropagation();
      this.enterRenameMode();
    };
  }

  /**
   * Enter rename mode - replace title with input field
   */
  private enterRenameMode(): void {
    if (this.isRenameMode || !this.currentDetails) return;

    this.isRenameMode = true;
    const nameEl = document.getElementById('bd-building-name');
    const renameBtn = document.getElementById('bd-rename-btn');

    if (!nameEl) return;

    const currentName = nameEl.textContent || '';
    const wrapper = nameEl.parentElement;
    if (!wrapper) return;

    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = currentName;
    input.id = 'bd-rename-input';

    // Create confirm button
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'rename-confirm-btn';
    confirmBtn.innerHTML = '✓';
    confirmBtn.title = 'Confirm rename';

    // Create cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'rename-cancel-btn';
    cancelBtn.innerHTML = '✕';
    cancelBtn.title = 'Cancel rename';

    // Replace name with input + buttons
    nameEl.style.display = 'none';
    if (renameBtn) renameBtn.style.display = 'none';

    wrapper.appendChild(input);
    wrapper.appendChild(confirmBtn);
    wrapper.appendChild(cancelBtn);

    // Focus and select text
    input.focus();
    input.select();

    // Confirm handler
    const confirmRename = async () => {
      const newName = input.value.trim();
      if (newName && newName !== currentName && this.options.onRename) {
        try {
          await this.options.onRename(newName);
          // Update local state
          if (this.currentDetails) {
            this.currentDetails.buildingName = newName;
          }
        } catch (err) {
          console.error('[BuildingDetails] Failed to rename:', err);
        }
      }
      this.exitRenameMode();
    };

    // Cancel handler
    const cancelRename = () => {
      this.exitRenameMode();
    };

    confirmBtn.onclick = (e) => {
      e.stopPropagation();
      confirmRename();
    };

    cancelBtn.onclick = (e) => {
      e.stopPropagation();
      cancelRename();
    };

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    };
  }

  /**
   * Exit rename mode - restore title display
   */
  private exitRenameMode(): void {
    if (!this.isRenameMode) return;

    this.isRenameMode = false;
    const nameEl = document.getElementById('bd-building-name');
    const renameBtn = document.getElementById('bd-rename-btn');
    const input = document.getElementById('bd-rename-input');
    const confirmBtn = document.querySelector('.rename-confirm-btn');
    const cancelBtn = document.querySelector('.rename-cancel-btn');

    if (nameEl) nameEl.style.display = '';
    if (renameBtn) renameBtn.style.display = '';
    if (input) input.remove();
    if (confirmBtn) confirmBtn.remove();
    if (cancelBtn) cancelBtn.remove();
  }

  /**
   * Show delete confirmation popup
   */
  private showDeleteConfirmation(): void {
    if (!this.currentDetails) return;

    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'delete-confirmation-backdrop';

    // Create confirmation dialog
    const dialog = document.createElement('div');
    dialog.className = 'delete-confirmation-dialog';

    const title = document.createElement('h3');
    title.textContent = 'Delete Building';

    const message = document.createElement('p');
    message.textContent = `Are you sure you want to delete "${this.currentDetails.buildingName || 'this building'}"? This action cannot be undone.`;

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'delete-confirmation-buttons';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'delete-confirm-btn';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.onclick = async () => {
      backdrop.remove();
      await this.handleDelete();
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'delete-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
      backdrop.remove();
    };

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);

    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(buttonContainer);
    backdrop.appendChild(dialog);

    // Add to container
    this.container.appendChild(backdrop);

    // Close on backdrop click
    backdrop.onclick = (e) => {
      if (e.target === backdrop) {
        backdrop.remove();
      }
    };
  }

  /**
   * Handle delete action
   */
  private async handleDelete(): Promise<void> {
    if (!this.currentDetails || !this.options.onDelete) return;

    try {
      await this.options.onDelete();
      // Close the panel after successful deletion
      this.hide();
      if (this.options.onClose) {
        this.options.onClose();
      }
    } catch (error) {
      console.error('Failed to delete building:', error);
    }
  }

  /**
   * Render the full content
   */
  private renderContent(): void {
    if (!this.currentDetails) return;

    const details = this.currentDetails;

    // Update header
    const nameEl = document.getElementById('bd-building-name');
    const templateEl = document.getElementById('bd-template-name');
    const coordsEl = document.getElementById('bd-coords');
    const visualClassEl = document.getElementById('bd-visual-class');
    const timestampEl = document.getElementById('bd-timestamp');

    const nameValue = details.buildingName || details.templateName || 'Building';

    if (nameEl) nameEl.textContent = nameValue;
    if (templateEl) templateEl.textContent = details.templateName || '';
    if (coordsEl) coordsEl.textContent = `(${details.x}, ${details.y})`;
    if (visualClassEl) visualClassEl.textContent = `VC: ${details.visualClass}`;
    if (timestampEl) {
      const date = new Date(details.timestamp);
      timestampEl.textContent = date.toLocaleTimeString();
    }

    // Wire up rename button (owner only)
    this.setupRenameButton();

    // Security gating: hide owner-only controls for non-owned buildings
    const renameBtn = document.getElementById('bd-rename-btn');
    const deleteBtn = this.modal?.querySelector('.header-delete-btn') as HTMLElement;
    if (renameBtn) renameBtn.style.display = this.isOwner ? '' : 'none';
    if (deleteBtn) deleteBtn.style.display = this.isOwner ? '' : 'none';

    // Render tabs from server-provided tab configuration (data-driven from CLASSES.BIN)
    this.renderTabs(details.tabs);

    // Render active tab content
    this.renderTabContent();
  }

  /**
   * Smart refresh: Update only non-editable elements while user is editing
   * This prevents disrupting user input during automatic refreshes
   */
  private renderContentSmart(): void {
    if (!this.currentDetails || !this.contentContainer) return;

    const details = this.currentDetails;

    // Update header (safe - user won't be editing these)
    const nameEl = document.getElementById('bd-building-name');
    const templateEl = document.getElementById('bd-template-name');
    const coordsEl = document.getElementById('bd-coords');
    const visualClassEl = document.getElementById('bd-visual-class');
    const timestampEl = document.getElementById('bd-timestamp');

    const nameValue = details.buildingName || details.templateName || 'Building';

    if (nameEl) nameEl.textContent = nameValue;
    if (templateEl) templateEl.textContent = details.templateName || '';
    if (coordsEl) coordsEl.textContent = `(${details.x}, ${details.y})`;
    if (visualClassEl) visualClassEl.textContent = `VC: ${details.visualClass}`;
    if (timestampEl) {
      const date = new Date(details.timestamp);
      timestampEl.textContent = date.toLocaleTimeString();
    }

    // Update read-only values in the content area without re-rendering inputs
    this.updateReadOnlyValues();
  }

  /**
   * Update only read-only (non-input) values in the current view
   * Preserves all input elements to avoid disrupting user editing
   */
  private updateReadOnlyValues(): void {
    if (!this.currentDetails || !this.contentContainer) return;

    const details = this.currentDetails;
    const tab = details.tabs?.find(t => t.id === this.currentTab);
    if (!tab) return;
    const group = getGroupById(tab.id);
    if (!group) return;

    // Update text/display values only
    const textElements = this.contentContainer.querySelectorAll('.property-value:not(.property-slider-container)');

    textElements.forEach((el) => {
      const row = el.closest('.property-row');
      if (!row) return;

      // Skip if this row contains the focused element
      if (row.contains(this.activeFocusedElement)) return;

      const label = row.querySelector('.property-label');
      if (!label) return;

      const propertyName = label.textContent?.trim();
      if (!propertyName) return;

      // Find matching property definition
      const propDef = group.properties.find(p => p.displayName === propertyName);
      if (!propDef) return;

      // Get updated value
      const groupData = details.groups[group.id];
      if (!groupData) return;

      const propValue = groupData.find(p => p.name === propDef.rdoName);
      if (!propValue) return;

      // Update text content for read-only elements
      if (el.classList.contains('property-text')) {
        el.textContent = propValue.value || '-';
      } else if (el.classList.contains('property-currency')) {
        const num = parseFloat(propValue.value);
        el.textContent = `$${num.toLocaleString()}`;
      } else if (el.classList.contains('property-percentage')) {
        const num = parseFloat(propValue.value);
        el.textContent = `${num}%`;
      } else if (el.classList.contains('property-number')) {
        el.textContent = propValue.value;
      }
    });
  }

  /**
   * Render tab navigation
   */
  private renderTabs(tabs: BuildingDetailsTab[]): void {
    if (!this.tabsNav || !tabs?.length) return;

    this.tabsNav.innerHTML = '';

    // Sort tabs by order
    const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);

    // Check if current tab exists
    const tabExists = sortedTabs.some(t => t.id === this.currentTab);
    if (!tabExists && sortedTabs.length > 0) {
      this.currentTab = sortedTabs[0].id;
    }

    for (const tab of sortedTabs) {
      // Check if this tab has any data
      const hasData = (this.currentDetails?.groups[tab.id]?.length ?? 0) > 0 ||
        (tab.special === 'supplies' && (this.currentDetails?.supplies?.length ?? 0) > 0) ||
        (tab.special === 'products' && (this.currentDetails?.products?.length ?? 0) > 0) ||
        (tab.special === 'finances' && (this.currentDetails?.moneyGraph?.length ?? 0) > 0);

      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (this.currentTab === tab.id ? ' active' : '');
      if (!hasData) btn.classList.add('tab-empty');
      btn.innerHTML = `<span class="tab-icon">${tab.icon || ''}</span><span class="tab-label">${tab.name}</span>`;

      btn.onclick = async () => {
        const previousTab = this.currentTab;
        this.currentTab = tab.id;
        this.renderTabs(sortedTabs);
        this.renderTabContent();

        // Auto-refresh when switching to a new tab
        if (previousTab !== tab.id && this.options.onRefresh) {
          await this.options.onRefresh();
        }
      };

      this.tabsNav.appendChild(btn);
    }
  }

	private renderTabContent(): void {
	  if (!this.contentContainer || !this.currentDetails) return;

	  this.contentContainer.innerHTML = '';
	  const details = this.currentDetails;

	  // Find current tab from server-provided tab metadata
	  const tab = details.tabs?.find(t => t.id === this.currentTab);
	  if (!tab) {
		this.contentContainer.innerHTML = '<p>No data available</p>';
		return;
	  }

	  // Look up the PropertyGroup for property definitions (rendering types, etc.)
	  const group = getGroupById(tab.id);

	  // Security: only pass change callback if player has edit rights.
	  // For town hall tabs, editing is gated by mayor status (ActualRuler)
	  // instead of building ownership.
	  const isTownTab = tab.id.startsWith('town');
	  const canEdit = isTownTab ? this.isMayor : this.isOwner;
	  const changeCallback = canEdit ? this.handlePropertyChange.bind(this) : undefined;

	  // Special handling for certain tab types (based on tab.special or well-known IDs)
	  const isSupplies = tab.special === 'supplies';
	  const isProducts = tab.special === 'products';
	  const isFinances = tab.special === 'finances' || tab.id === 'finances';
	  const isUpgrade = tab.id === 'upgrade' || tab.handlerName === 'facManagement';

	  if (isSupplies && details.supplies?.length) {
		// Owner-only disconnect: RDODisconnectInput via connection list format "x,y"
		const supplyDisconnect: DisconnectCallback | undefined = this.isOwner
		  ? async (fluidId, x, y) => {
			if (this.options.onPropertyChange) {
			  await this.options.onPropertyChange('RDODisconnectInput', '0', {
				fluidId,
				connectionList: `${x},${y}`,
			  });
			  if (this.options.onRefresh) await this.options.onRefresh();
			}
		  }
		  : undefined;

		// Owner-only: search for suppliers to connect
		const supplySearch: SearchConnectionCallback | undefined = this.isOwner
		  ? (fluidId, fluidName, direction) => {
			this.options.onSearchConnections?.(fluidId, fluidName, direction);
		  }
		  : undefined;

		// Owner-only: supply property change (SortMode, MaxPrice)
		const supplyPropertyChange: TablePropertyChangeCallback | undefined = this.isOwner
		  ? async (propertyName, value, additionalParams) => {
			if (this.options.onPropertyChange) {
			  await this.options.onPropertyChange(propertyName, value, additionalParams);
			  if (this.options.onRefresh) await this.options.onRefresh();
			}
		  }
		  : undefined;

		const suppliesEl = renderSuppliesWithTabs(
		  details.supplies,
		  this.options.onNavigateToBuilding,
		  supplyDisconnect,
		  supplySearch,
		  supplyPropertyChange
		);
		this.contentContainer.appendChild(suppliesEl);
		return;
	  }

	  if (isProducts && details.products?.length) {
		// Owner-only price change: RDOSetOutputPrice
		const productPriceChange: TablePropertyChangeCallback | undefined = this.isOwner
		  ? async (propertyName, value, additionalParams) => {
			if (this.options.onPropertyChange) {
			  await this.options.onPropertyChange(propertyName, value, additionalParams);
			  if (this.options.onRefresh) await this.options.onRefresh();
			}
		  }
		  : undefined;

		// Owner-only disconnect: RDODisconnectOutput via connection list format "x,y"
		const productDisconnect: DisconnectCallback | undefined = this.isOwner
		  ? async (fluidId, x, y) => {
			if (this.options.onPropertyChange) {
			  await this.options.onPropertyChange('RDODisconnectOutput', '0', {
				fluidId,
				connectionList: `${x},${y}`,
			  });
			  if (this.options.onRefresh) await this.options.onRefresh();
			}
		  }
		  : undefined;

		// Owner-only: search for clients to connect
		const productSearch: SearchConnectionCallback | undefined = this.isOwner
		  ? (fluidId, fluidName, direction) => {
			this.options.onSearchConnections?.(fluidId, fluidName, direction);
		  }
		  : undefined;

		const productsEl = renderProductsWithTabs(
		  details.products,
		  this.options.onNavigateToBuilding,
		  productPriceChange,
		  productDisconnect,
		  productSearch
		);
		this.contentContainer.appendChild(productsEl);
		return;
	  }

	  if (isFinances && details.moneyGraph?.length) {
		const graphEl = renderSparklineGraph(details.moneyGraph, {
		  width: 440,
		  height: 100,
		  showLabels: true,
		});
		this.contentContainer.appendChild(graphEl);

		const financeProps = details.groups[tab.id];
		if (financeProps?.length && group) {
		  const propsEl = renderPropertyGroup(
			financeProps,
			group.properties,
			changeCallback,
			this.handleActionButton.bind(this)
		  );
		  this.contentContainer.appendChild(propsEl);
		}
		return;
	  }

	  // Standard property rendering
	  const groupData = details.groups[tab.id];
	  if (!groupData || groupData.length === 0) {
		// Show placeholder for unimplemented tabs
		const placeholder = document.createElement('div');
		placeholder.className = 'tab-placeholder';
		placeholder.innerHTML = `<p class="tab-placeholder-text">No data available for this section</p>`;
		this.contentContainer.appendChild(placeholder);
		return;
	  }

	  // Use property definitions from the group if available, otherwise render raw
	  const properties = group?.properties || [];
	  const propsEl = renderPropertyGroup(
		groupData,
		properties,
		changeCallback,
		this.handleActionButton.bind(this)
	  );
	  this.contentContainer.appendChild(propsEl);

	  // Wire up upgrade action buttons (owner only)
	  if (isUpgrade && this.isOwner) {
		this.wireUpgradeActions();
	  }
	}

	/**
	 * Handle property change from slider
	 * Converts RDO property name to RDO command with appropriate parameters
	 * Automatically refreshes data after successful update
	 */
	private async handlePropertyChange(propertyName: string, value: number, additionalParams?: Record<string, string>): Promise<void> {
	  if (!this.options.onPropertyChange) return;

	  // Extract RDO command and parameters from property name
	  const { rdoCommand, params } = this.mapPropertyToRdoCommand(propertyName, value);

	  // Merge with any additional params provided
	  const finalParams = { ...params, ...additionalParams };

	  // Send property change
	  await this.options.onPropertyChange(rdoCommand, value.toString(), finalParams);

	  // Auto-refresh after property update
	  if (this.options.onRefresh) {
	    await this.options.onRefresh();
	  }
	}

	/**
	 * Handle action button click from property renderers
	 */
	private handleActionButton(actionId: string): void {
	  if (this.options.onActionButton && this.currentDetails) {
	    this.options.onActionButton(actionId, this.currentDetails);
	  }
	}

	/**
	 * Map RDO property name to RDO command with parameters
	 *
	 * Examples:
	 * - srvPrices0 → { rdoCommand: 'RDOSetPrice', params: { index: '0' } }
	 * - Salaries0 → { rdoCommand: 'RDOSetSalaries', params: { salary0: '100', salary1: '100', salary2: '150' } }
	 * - MaxPrice → { rdoCommand: 'RDOSetInputMaxPrice', params: { metaFluid: '?' } }
	 */
	private mapPropertyToRdoCommand(propertyName: string, value: number): { rdoCommand: string; params: Record<string, string> } {
	  // 1. Check current tab's group for data-driven rdoCommands
	  const group = getGroupById(this.currentTab);
	  if (group?.rdoCommands) {
		// Exact match first
		const mapping = group.rdoCommands[propertyName];
		if (mapping) {
		  if (mapping.allSalaries) {
			const salaryParams = this.getSalaryParams(0, value);
			return { rdoCommand: mapping.command, params: salaryParams };
		  }
		  if (mapping.command === 'property') {
			return { rdoCommand: 'property', params: { propertyName } };
		  }
		  return { rdoCommand: mapping.command, params: mapping.params ? { ...mapping.params } : {} };
		}

		// Indexed match: strip trailing digits
		const indexMatch = propertyName.match(/^(\w+?)(\d+)(.*)$/);
		if (indexMatch) {
		  const baseName = indexMatch[1];
		  const index = indexMatch[2];
		  const baseMapping = group.rdoCommands[baseName];
		  if (baseMapping?.indexed) {
			return { rdoCommand: baseMapping.command, params: { index } };
		  }
		  // Check with suffix (e.g., TaxPercent from Tax0Percent)
		  const suffixName = baseName + indexMatch[3];
		  const suffixMapping = group.rdoCommands[suffixName];
		  if (suffixMapping?.indexed) {
			return { rdoCommand: suffixMapping.command, params: { index } };
		  }
		}
	  }

	  // 2. Fall back to hardcoded mappings for existing handlers
	  const indexMatch = propertyName.match(/^(\w+?)(\d+)$/);

	  if (indexMatch) {
		const baseName = indexMatch[1];
		const index = indexMatch[2];

		switch (baseName) {
		  case 'srvPrices':
			return { rdoCommand: 'RDOSetPrice', params: { index } };

		  case 'Salaries': {
			const salaryParams = this.getSalaryParams(parseInt(index), value);
			return { rdoCommand: 'RDOSetSalaries', params: salaryParams };
		  }

		  case 'cInputDem':
			return { rdoCommand: 'RDOSetCompanyInputDemand', params: { index } };

		  default:
			console.warn(`[BuildingDetails] Unknown indexed property: ${propertyName}`);
			return { rdoCommand: propertyName, params: {} };
		}
	  }

	  // Non-indexed properties
	  switch (propertyName) {
		case 'MaxPrice':
		  return { rdoCommand: 'RDOSetInputMaxPrice', params: {} };

		case 'minK':
		  return { rdoCommand: 'RDOSetInputMinK', params: {} };

		case 'PricePc':
		  return { rdoCommand: 'RDOSetOutputPrice', params: {} };

		case 'Stopped':
		  return { rdoCommand: 'property', params: { propertyName: 'Stopped' } };

		default:
		  console.warn(`[BuildingDetails] Unknown property: ${propertyName}`);
		  return { rdoCommand: propertyName, params: {} };
	  }
	}

	/**
	 * Get all 3 salary values for RDOSetSalaries command
	 * When one salary is changed, we need to send all 3 values
	 * Format: { salary0: '100', salary1: '100', salary2: '150' }
	 */
	private getSalaryParams(changedIndex: number, newValue: number): Record<string, string> {
	  const params: Record<string, string> = {};

	  // Get current salary values from building details
	  const workforceGroup = this.currentDetails?.groups['workforce'];
	  if (workforceGroup) {
		for (let i = 0; i < 3; i++) {
		  const propName = `Salaries${i}`;
		  const prop = workforceGroup.find(p => p.name === propName);
		  const currentValue = prop ? parseInt(prop.value) : 100;

		  // Use new value for changed index, current value for others
		  params[`salary${i}`] = i === changedIndex ? newValue.toString() : currentValue.toString();
		}
	  } else {
		// Fallback: use default values
		for (let i = 0; i < 3; i++) {
		  params[`salary${i}`] = i === changedIndex ? newValue.toString() : '100';
		}
	  }

	  return params;
	}

	/**
	 * Wire up upgrade action button handlers
	 * Interface: OK button, STOP button (when pending), Downgrade button
	 */
	private wireUpgradeActions(): void {
	  if (!this.contentContainer || !this.currentDetails) return;

	  // Find all upgrade action elements
	  const validateBtn = this.contentContainer.querySelector('.upgrade-validate-btn') as HTMLButtonElement;
	  const stopBtn = this.contentContainer.querySelector('.upgrade-stop-btn') as HTMLButtonElement;
	  const downgradeBtn = this.contentContainer.querySelector('.downgrade-btn') as HTMLButtonElement;
	  const qtyInput = this.contentContainer.querySelector('.upgrade-qty-input') as HTMLInputElement;

	  // Validate button - Start Upgrade with specified quantity
	  if (validateBtn && qtyInput) {
		validateBtn.onclick = async () => {
		  const count = parseInt(qtyInput.value) || 1;
		  if (this.options.onUpgradeAction && count > 0) {
			await this.options.onUpgradeAction('START_UPGRADE', count);

			// Auto-refresh 1 second after upgrade action to show updated status
			if (this.options.onRefresh) {
			  setTimeout(async () => {
				if (this.options.onRefresh) {
				  await this.options.onRefresh();
				}
			  }, 1000);
			}
		  }
		};
	  }

	  // Stop button - Stop pending upgrade
	  if (stopBtn) {
		stopBtn.onclick = async () => {
		  if (this.options.onUpgradeAction) {
			await this.options.onUpgradeAction('STOP_UPGRADE');

			// Auto-refresh 1 second after stop action to show updated status
			if (this.options.onRefresh) {
			  setTimeout(async () => {
				if (this.options.onRefresh) {
				  await this.options.onRefresh();
				}
			  }, 1000);
			}
		  }
		};
	  }

	  // Downgrade button - Downgrade by 1
	  if (downgradeBtn) {
		downgradeBtn.onclick = async () => {
		  if (this.options.onUpgradeAction) {
			await this.options.onUpgradeAction('DOWNGRADE');

			// Auto-refresh 1 second after downgrade action to show updated status
			if (this.options.onRefresh) {
			  setTimeout(async () => {
				if (this.options.onRefresh) {
				  await this.options.onRefresh();
				}
			  }, 1000);
			}
		  }
		};
	  }
	}


  /**
   * Start dragging
   */
  private startDrag(e: MouseEvent): void {
    if (!this.modal) return;

    this.isDragging = true;
    this.dragOffsetX = e.clientX - this.posX;
    this.dragOffsetY = e.clientY - this.posY;

    document.onmousemove = (ev) => this.onDrag(ev);
    document.onmouseup = () => this.stopDrag();

    if (this.header) {
      this.header.style.cursor = 'grabbing';
    }
  }

  /**
   * During drag
   */
  private onDrag(e: MouseEvent): void {
    if (!this.isDragging) return;

    this.posX = e.clientX - this.dragOffsetX;
    this.posY = e.clientY - this.dragOffsetY;

    this.updatePosition();
  }

  /**
   * Stop dragging
   */
  private stopDrag(): void {
    this.isDragging = false;
    document.onmousemove = null;
    document.onmouseup = null;

    if (this.header) {
      this.header.style.cursor = 'move';
    }
  }

  /**
   * Update modal position
   */
  private updatePosition(): void {
    if (!this.modal) return;

    this.modal.style.left = `${this.posX}px`;
    this.modal.style.top = `${this.posY}px`;
  }
}
