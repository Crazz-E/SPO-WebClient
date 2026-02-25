/**
 * Property Table Component
 *
 * Renders tabular data like supply connections.
 */

import { BuildingConnectionData, BuildingSupplyData, BuildingProductData, BuildingPropertyValue } from '../../../shared/types';
import {
  formatCurrency,
  formatPercentage,
  formatNumber,
  PropertyDefinition,
  PropertyType,
  TableColumn,
} from '../../../shared/building-details';

/** Callback for property changes from within supply/product tables */
export type TablePropertyChangeCallback = (
  propertyName: string,
  value: string,
  additionalParams?: Record<string, string>
) => Promise<void>;

/** Callback for disconnecting a connection */
export type DisconnectCallback = (
  fluidId: string,
  connectionX: number,
  connectionY: number
) => Promise<void>;

/** Callback for opening the connection search dialog */
export type SearchConnectionCallback = (
  fluidId: string,
  fluidName: string,
  direction: 'input' | 'output'
) => void;

/**
 * Render a connections table for a supply
 */
export function renderConnectionsTable(
  supply: BuildingSupplyData,
  onConnectionClick?: (x: number, y: number) => void,
  onDisconnect?: DisconnectCallback,
  onSearchConnection?: SearchConnectionCallback,
  onPropertyChange?: TablePropertyChangeCallback
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'property-table-container';

  // Header with supply info
  const header = document.createElement('div');
  header.className = 'supply-header';

  const costPerc = supply.lastCostPerc ? ` (Cost: ${escapeHtml(supply.lastCostPerc)}%)` : '';
  header.innerHTML = `
    <div class="supply-name">${escapeHtml(supply.name)}</div>
    <div class="supply-info">
      <span class="supply-fluid">${escapeHtml(supply.metaFluid)}</span>
      <span class="supply-value">${escapeHtml(supply.fluidValue)}${costPerc}</span>
      <span class="supply-count">${supply.connectionCount} connection${supply.connectionCount !== 1 ? 's' : ''}</span>
    </div>
  `;

  if (onSearchConnection) {
    const connectBtn = document.createElement('button');
    connectBtn.className = 'search-connection-btn';
    connectBtn.textContent = 'Find Suppliers';
    connectBtn.title = 'Search for suppliers to connect';
    connectBtn.onclick = (e) => {
      e.stopPropagation();
      onSearchConnection(supply.metaFluid, supply.name, 'input');
    };
    header.appendChild(connectBtn);
  }

  container.appendChild(header);

  // Supply controls bar (SortMode + MaxPrice) — owner-only when onPropertyChange provided
  if (onPropertyChange) {
    const controlsBar = document.createElement('div');
    controlsBar.className = 'supply-controls';

    // Sort mode toggle (0=cost, 1=quality)
    const sortDiv = document.createElement('div');
    sortDiv.className = 'supply-control-item';
    const sortLabel = document.createElement('label');
    sortLabel.className = 'control-label';
    sortLabel.textContent = 'Sort: ';
    const sortSelect = document.createElement('select');
    sortSelect.className = 'supply-sort-select';
    const optCost = document.createElement('option');
    optCost.value = '0';
    optCost.textContent = 'By Cost';
    const optQuality = document.createElement('option');
    optQuality.value = '1';
    optQuality.textContent = 'By Quality';
    sortSelect.appendChild(optCost);
    sortSelect.appendChild(optQuality);
    sortSelect.value = supply.sortMode === '1' ? '1' : '0';
    sortSelect.onchange = () => {
      onPropertyChange('RDOSetInputSortMode', sortSelect.value, { fluidId: supply.metaFluid });
    };
    sortDiv.appendChild(sortLabel);
    sortDiv.appendChild(sortSelect);
    controlsBar.appendChild(sortDiv);

    // Max price slider (0-1000)
    const priceDiv = document.createElement('div');
    priceDiv.className = 'supply-control-item';
    const priceLabel = document.createElement('label');
    priceLabel.className = 'control-label';
    priceLabel.textContent = 'Max Price: ';
    const priceSlider = document.createElement('input');
    priceSlider.type = 'range';
    priceSlider.className = 'property-slider';
    priceSlider.min = '0';
    priceSlider.max = '1000';
    priceSlider.step = '10';
    const currentMaxPrice = parseInt(supply.maxPrice || '200', 10);
    priceSlider.value = isNaN(currentMaxPrice) ? '200' : String(currentMaxPrice);
    const priceValueSpan = document.createElement('span');
    priceValueSpan.className = 'slider-value';
    priceValueSpan.textContent = `${priceSlider.value}%`;
    priceSlider.oninput = () => {
      priceValueSpan.textContent = `${priceSlider.value}%`;
    };
    let priceDebounce: ReturnType<typeof setTimeout> | null = null;
    priceSlider.onchange = () => {
      if (priceDebounce) clearTimeout(priceDebounce);
      priceDebounce = setTimeout(() => {
        onPropertyChange('RDOSetInputMaxPrice', priceSlider.value, { fluidId: supply.metaFluid });
      }, 300);
    };
    priceDiv.appendChild(priceLabel);
    priceDiv.appendChild(priceSlider);
    priceDiv.appendChild(priceValueSpan);
    controlsBar.appendChild(priceDiv);

    container.appendChild(controlsBar);
  }

  if (supply.connections.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'table-empty';
    empty.textContent = 'No connections';
    container.appendChild(empty);
    return container;
  }

  // Table
  const table = document.createElement('table');
  table.className = 'property-table';

  // Table header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>Facility</th>
      <th>Company</th>
      <th>Price</th>
      <th>Quality</th>
      <th>Last</th>
      <th>Status</th>
    </tr>
  `;
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement('tbody');
  for (const conn of supply.connections) {
    const disconnectHandler = onDisconnect
      ? () => onDisconnect(supply.metaFluid, conn.x, conn.y)
      : undefined;
    const row = createConnectionRow(conn, onConnectionClick, disconnectHandler);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  container.appendChild(table);
  return container;
}

/**
 * Create a table row for a connection
 */
function createConnectionRow(
  conn: BuildingConnectionData,
  onConnectionClick?: (x: number, y: number) => void,
  onDisconnect?: () => void
): HTMLElement {
  const tr = document.createElement('tr');
  tr.className = conn.connected ? 'connection-active' : 'connection-inactive';

  // Facility name (clickable)
  const tdFacility = document.createElement('td');
  tdFacility.className = 'cell-facility';
  if (conn.x > 0 && conn.y > 0 && onConnectionClick) {
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = conn.facilityName || 'Unknown';
    link.onclick = (e) => {
      e.preventDefault();
      onConnectionClick(conn.x, conn.y);
    };
    tdFacility.appendChild(link);
  } else {
    tdFacility.textContent = conn.facilityName || 'Unknown';
  }
  tr.appendChild(tdFacility);

  // Company
  const tdCompany = document.createElement('td');
  tdCompany.className = 'cell-company';
  tdCompany.textContent = conn.companyName || '-';
  tr.appendChild(tdCompany);

  // Price
  const tdPrice = document.createElement('td');
  tdPrice.className = 'cell-price';
  const price = parseFloat(conn.price);
  tdPrice.textContent = isNaN(price) ? conn.price : formatCurrency(price);
  tr.appendChild(tdPrice);

  // Quality
  const tdQuality = document.createElement('td');
  tdQuality.className = 'cell-quality';
  tdQuality.textContent = conn.quality || '-';
  tr.appendChild(tdQuality);

  // Last value
  const tdLast = document.createElement('td');
  tdLast.className = 'cell-last';
  tdLast.textContent = conn.lastValue || '-';
  tr.appendChild(tdLast);

  // Status + Disconnect button
  const tdStatus = document.createElement('td');
  tdStatus.className = 'cell-status';
  const statusSpan = document.createElement('span');
  statusSpan.className = conn.connected ? 'status-connected' : 'status-disconnected';
  statusSpan.textContent = conn.connected ? 'Active' : 'Off';
  tdStatus.appendChild(statusSpan);

  if (onDisconnect && conn.x > 0 && conn.y > 0) {
    const disconnectBtn = document.createElement('button');
    disconnectBtn.className = 'disconnect-btn';
    disconnectBtn.textContent = 'X';
    disconnectBtn.title = 'Disconnect';
    disconnectBtn.onclick = (e) => {
      e.stopPropagation();
      onDisconnect();
    };
    tdStatus.appendChild(disconnectBtn);
  }
  tr.appendChild(tdStatus);

  return tr;
}

/**
 * Render all supplies with nested tabs
 */
export function renderSuppliesWithTabs(
  supplies: BuildingSupplyData[],
  onConnectionClick?: (x: number, y: number) => void,
  onDisconnect?: DisconnectCallback,
  onSearchConnection?: SearchConnectionCallback,
  onPropertyChange?: TablePropertyChangeCallback
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'supplies-container';

  if (supplies.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'supplies-empty';
    empty.textContent = 'No supplies configured';
    container.appendChild(empty);
    return container;
  }

  if (supplies.length === 1) {
    // Single supply - no tabs needed
    container.appendChild(renderConnectionsTable(supplies[0], onConnectionClick, onDisconnect, onSearchConnection, onPropertyChange));
    return container;
  }

  // Multiple supplies - use tabs
  const tabsNav = document.createElement('div');
  tabsNav.className = 'nested-tabs-nav';

  const tabsContent = document.createElement('div');
  tabsContent.className = 'nested-tabs-content';

  supplies.forEach((supply, index) => {
    // Tab button
    const tabBtn = document.createElement('button');
    tabBtn.className = 'nested-tab-btn' + (index === 0 ? ' active' : '');
    tabBtn.textContent = supply.name || `Supply ${index + 1}`;
    tabBtn.dataset.index = index.toString();

    // Tab content
    const tabPane = document.createElement('div');
    tabPane.className = 'nested-tab-pane' + (index === 0 ? ' active' : '');
    tabPane.dataset.index = index.toString();
    tabPane.appendChild(renderConnectionsTable(supply, onConnectionClick, onDisconnect, onSearchConnection, onPropertyChange));

    // Click handler
    tabBtn.onclick = () => {
      // Deactivate all
      tabsNav.querySelectorAll('.nested-tab-btn').forEach(btn => btn.classList.remove('active'));
      tabsContent.querySelectorAll('.nested-tab-pane').forEach(pane => pane.classList.remove('active'));

      // Activate clicked
      tabBtn.classList.add('active');
      tabPane.classList.add('active');
    };

    tabsNav.appendChild(tabBtn);
    tabsContent.appendChild(tabPane);
  });

  container.appendChild(tabsNav);
  container.appendChild(tabsContent);

  return container;
}

/**
 * Render a single product/output gate with its header info + connections table
 */
function renderProductGateTable(
  product: BuildingProductData,
  onConnectionClick?: (x: number, y: number) => void,
  onPriceChange?: TablePropertyChangeCallback,
  onDisconnect?: DisconnectCallback,
  onSearchConnection?: SearchConnectionCallback
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'property-table-container';

  // Header with output gate properties
  const header = document.createElement('div');
  header.className = 'supply-header';

  const marketPrice = parseFloat(product.marketPrice);
  const pricePc = parseInt(product.pricePc, 10);
  const priceDisplay = !isNaN(marketPrice) && !isNaN(pricePc)
    ? formatCurrency(marketPrice * pricePc / 100) + ` (${pricePc}%)`
    : product.pricePc ? `${product.pricePc}%` : '-';

  header.innerHTML = `
    <div class="supply-name">${escapeHtml(product.name)}</div>
    <div class="supply-info">
      <span class="product-stat"><b>Produced:</b> ${escapeHtml(product.lastFluid || '-')}</span>
      <span class="product-stat"><b>Quality:</b> ${escapeHtml(product.quality ? product.quality + '%' : '-')}</span>
      <span class="product-stat"><b>Price:</b> ${priceDisplay}</span>
      <span class="product-stat"><b>Avg:</b> ${escapeHtml(product.avgPrice ? product.avgPrice + '%' : '-')}</span>
      <span class="supply-count">${product.connectionCount} client${product.connectionCount !== 1 ? 's' : ''}</span>
    </div>
  `;

  if (onSearchConnection) {
    const connectBtn = document.createElement('button');
    connectBtn.className = 'search-connection-btn';
    connectBtn.textContent = 'Find Clients';
    connectBtn.title = 'Search for clients to connect';
    connectBtn.onclick = (e) => {
      e.stopPropagation();
      onSearchConnection(product.metaFluid, product.name, 'output');
    };
    header.appendChild(connectBtn);
  }

  container.appendChild(header);

  // Price slider (owner-only, rendered when callback provided)
  if (onPriceChange) {
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'product-price-slider';

    const label = document.createElement('label');
    label.textContent = 'Sell Price: ';
    label.className = 'slider-label';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '300';
    slider.step = '5';
    slider.value = isNaN(pricePc) ? '100' : pricePc.toString();
    slider.className = 'property-slider';

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'slider-value';
    valueDisplay.textContent = `${slider.value}%`;

    slider.oninput = () => {
      valueDisplay.textContent = `${slider.value}%`;
    };

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    slider.onchange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onPriceChange('RDOSetOutputPrice', slider.value, { fluidId: product.metaFluid });
      }, 300);
    };

    sliderContainer.appendChild(label);
    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(valueDisplay);
    container.appendChild(sliderContainer);
  }

  if (product.connections.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'table-empty';
    empty.textContent = 'No clients connected';
    container.appendChild(empty);
    return container;
  }

  // Connections table
  const table = document.createElement('table');
  table.className = 'property-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>Facility</th>
      <th>Company</th>
      <th>Last Value</th>
      <th>Cost</th>
      <th>Status</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const conn of product.connections) {
    const disconnectHandler = onDisconnect
      ? () => onDisconnect(product.metaFluid, conn.x, conn.y)
      : undefined;
    const row = createConnectionRow(conn, onConnectionClick, disconnectHandler);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  container.appendChild(table);
  return container;
}

/**
 * Render all products/outputs with nested tabs (FingerTabs pattern)
 * Mirror of renderSuppliesWithTabs but for output gates
 */
export function renderProductsWithTabs(
  products: BuildingProductData[],
  onConnectionClick?: (x: number, y: number) => void,
  onPriceChange?: TablePropertyChangeCallback,
  onDisconnect?: DisconnectCallback,
  onSearchConnection?: SearchConnectionCallback
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'supplies-container';

  if (products.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'supplies-empty';
    empty.textContent = 'No products configured';
    container.appendChild(empty);
    return container;
  }

  if (products.length === 1) {
    container.appendChild(renderProductGateTable(products[0], onConnectionClick, onPriceChange, onDisconnect, onSearchConnection));
    return container;
  }

  // Multiple products — use nested tabs
  const tabsNav = document.createElement('div');
  tabsNav.className = 'nested-tabs-nav';

  const tabsContent = document.createElement('div');
  tabsContent.className = 'nested-tabs-content';

  products.forEach((product, index) => {
    const tabBtn = document.createElement('button');
    tabBtn.className = 'nested-tab-btn' + (index === 0 ? ' active' : '');
    tabBtn.textContent = product.name || `Product ${index + 1}`;
    tabBtn.dataset.index = index.toString();

    const tabPane = document.createElement('div');
    tabPane.className = 'nested-tab-pane' + (index === 0 ? ' active' : '');
    tabPane.dataset.index = index.toString();
    tabPane.appendChild(renderProductGateTable(product, onConnectionClick, onPriceChange, onDisconnect, onSearchConnection));

    tabBtn.onclick = () => {
      tabsNav.querySelectorAll('.nested-tab-btn').forEach(btn => btn.classList.remove('active'));
      tabsContent.querySelectorAll('.nested-tab-pane').forEach(pane => pane.classList.remove('active'));
      tabBtn.classList.add('active');
      tabPane.classList.add('active');
    };

    tabsNav.appendChild(tabBtn);
    tabsContent.appendChild(tabPane);
  });

  container.appendChild(tabsNav);
  container.appendChild(tabsContent);

  return container;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
