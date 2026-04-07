/**
 * Mock RDO Session for Unit Testing
 * Simulates RDO protocol commands and responses without real server connection
 */

import { RdoCommand, RdoValue } from '../../shared/rdo-types';

export interface MockResponseConfig {
  pattern: RegExp;
  response: string;
}

export class MockRdoSession {
  private sentCommands: string[] = [];
  private mockResponses: Map<string, string> = new Map();
  private requestIdCounter = 0;

  /**
   * Records a command sent to the "server"
   */
  send(command: string): void {
    this.sentCommands.push(command);
  }

  /**
   * Configures a mock response for commands matching a pattern
   */
  mockResponse(commandPattern: RegExp, response: string): void {
    this.mockResponses.set(commandPattern.source, response);
  }

  /**
   * Simulates a server response based on configured mock responses
   */
  simulateResponse(command: string): string {
    for (const [pattern, response] of this.mockResponses) {
      if (new RegExp(pattern).test(command)) {
        return response;
      }
    }
    throw new Error(`No mock response configured for command: ${command}`);
  }

  /**
   * Returns the history of all sent commands
   */
  getCommandHistory(): string[] {
    return [...this.sentCommands];
  }

  /**
   * Checks if a command matching the pattern was sent
   */
  hasCommand(pattern: RegExp): boolean {
    return this.sentCommands.some(cmd => pattern.test(cmd));
  }

  /**
   * Returns the first command matching the pattern
   */
  getCommand(pattern: RegExp): string | undefined {
    return this.sentCommands.find(cmd => pattern.test(cmd));
  }

  /**
   * Returns all commands matching the pattern
   */
  getCommands(pattern: RegExp): string[] {
    return this.sentCommands.filter(cmd => pattern.test(cmd));
  }

  /**
   * Clears command history and mock responses
   */
  reset(): void {
    this.sentCommands = [];
    this.mockResponses.clear();
    this.requestIdCounter = 0;
  }

  /**
   * Gets next request ID (for commands that need RID)
   */
  private getNextRequestId(): number {
    return ++this.requestIdCounter;
  }

  // === Simulation Methods ===

  /**
   * Simulates complete login flow with RDO commands
   */
  async simulateLogin(username: string, password: string, interfaceServerId: number = 1): Promise<string[]> {
    const rid1 = this.getNextRequestId();
    const rid2 = this.getNextRequestId();
    const rid3 = this.getNextRequestId();

    // SetLanguage command
    const setLanguageCmd = `C ${rid1} sel ${interfaceServerId} call SetLanguage "*" "%English";`;
    this.send(setLanguageCmd);

    // ClientAware command
    const clientAwareCmd = `C ${rid2} sel ${interfaceServerId} call ClientAware "*" ;`;
    this.send(clientAwareCmd);

    // Logon command
    const logonCmd = RdoCommand
      .sel(interfaceServerId)
      .withRequestId(rid3)
      .call('Logon')
      .args(RdoValue.string(username), RdoValue.string(password))
      .build();
    this.send(logonCmd);

    return this.getCommandHistory();
  }

  /**
   * Simulates building focus command
   */
  async simulateBuildingFocus(worldId: number, x: number, y: number): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(worldId)
      .withRequestId(rid)
      .call('RDOFocusObject')
      .args(RdoValue.int(x), RdoValue.int(y))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates building property update command
   */
  async simulateBuildingUpdate(
    buildingId: number,
    rdoCommand: string,
    value: number,
    additionalArgs: number[] = []
  ): Promise<string> {
    const rid = this.getNextRequestId();
    const args = [RdoValue.int(0), RdoValue.int(value), ...additionalArgs.map(a => RdoValue.int(a))];

    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call(rdoCommand)
      .args(...args)
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates RDOSetSalaries command (requires 3 salary values)
   */
  async simulateSetSalaries(buildingId: number, salaries: [number, number, number]): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDOSetSalaries')
      .args(RdoValue.int(salaries[0]), RdoValue.int(salaries[1]), RdoValue.int(salaries[2]))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates road segment creation command
   */
  async simulateCreateRoadSegment(
    worldContextId: number,
    circuitId: number,
    ownerId: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cost: number
  ): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(worldContextId)
      .withRequestId(rid)
      .call('CreateCircuitSeg')
      .args(
        RdoValue.int(circuitId),
        RdoValue.int(ownerId),
        RdoValue.int(x1),
        RdoValue.int(y1),
        RdoValue.int(x2),
        RdoValue.int(y2),
        RdoValue.int(cost)
      )
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates building deletion command
   */
  async simulateDeleteBuilding(worldId: number, x: number, y: number): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(worldId)
      .withRequestId(rid)
      .call('RDODelFacility')
      .args(RdoValue.int(x), RdoValue.int(y))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates building rename command (SET command)
   */
  simulateRenameBuilding(buildingId: number, newName: string): string {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .set('Name')
      .args(RdoValue.string(newName))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates company selection command
   */
  async simulateSelectCompany(interfaceServerId: number, companyId: number): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(interfaceServerId)
      .withRequestId(rid)
      .call('SelectCompany')
      .args(RdoValue.int(companyId))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates upgrade start command
   */
  async simulateStartUpgrade(buildingId: number, count: number): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDOStartUpgrades')
      .args(RdoValue.int(count))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates upgrade stop command
   */
  async simulateStopUpgrade(buildingId: number): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDOStopUpgrade')
      .args()
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates downgrade command
   */
  async simulateDowngrade(buildingId: number): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDODowngrade')
      .args()
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates RDOEndSession command for graceful session termination
   * Uses interfaceServerId (same target as Logon)
   */
  async simulateEndSession(interfaceServerId: number): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(interfaceServerId)
      .withRequestId(rid)
      .call('RDOEndSession')
      .args()
      .build();

    this.send(cmd);
    return cmd;
  }

  // === Connection Management ===

  /**
   * Simulates RDOSetOutputPrice command
   * Voyager: ProdSheetForm.pas line 567
   */
  async simulateSetOutputPrice(buildingId: number, fluidId: string, price: number): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDOSetOutputPrice')
      .args(RdoValue.string(fluidId), RdoValue.int(price))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates RDOConnectInput command
   * Voyager: SupplySheetForm.pas line 295
   */
  async simulateConnectInput(buildingId: number, fluidId: string, connectionList: string): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDOConnectInput')
      .args(RdoValue.string(fluidId), RdoValue.string(connectionList))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates RDODisconnectInput command
   * Voyager: SupplySheetForm.pas line 418
   */
  async simulateDisconnectInput(buildingId: number, fluidId: string, connectionList: string): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDODisconnectInput')
      .args(RdoValue.string(fluidId), RdoValue.string(connectionList))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates RDOConnectOutput command
   * Voyager: ProdSheetForm.pas line 265
   */
  async simulateConnectOutput(buildingId: number, fluidId: string, connectionList: string): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDOConnectOutput')
      .args(RdoValue.string(fluidId), RdoValue.string(connectionList))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates RDODisconnectOutput command
   * Voyager: ProdSheetForm.pas line 363
   */
  async simulateDisconnectOutput(buildingId: number, fluidId: string, connectionList: string): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDODisconnectOutput')
      .args(RdoValue.string(fluidId), RdoValue.string(connectionList))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates RDOSetInputOverPrice command
   * Voyager: SupplySheetForm.pas line 435
   */
  async simulateSetInputOverPrice(buildingId: number, fluidId: string, index: number, overprice: number): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDOSetInputOverPrice')
      .args(RdoValue.string(fluidId), RdoValue.int(index), RdoValue.int(overprice))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates RDOSetInputSortMode command
   * Voyager: SupplySheetForm.pas line 722
   */
  async simulateSetInputSortMode(buildingId: number, fluidId: string, mode: number): Promise<string> {
    const rid = this.getNextRequestId();
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDOSetInputSortMode')
      .args(RdoValue.string(fluidId), RdoValue.int(mode))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates RDOSelSelected command (auto-buy toggle)
   * Voyager: SupplySheetForm.pas line 699
   */
  async simulateSelSelected(buildingId: number, selected: boolean): Promise<string> {
    const rid = this.getNextRequestId();
    const boolVal = selected ? -1 : 0; // WordBool: -1=true, 0=false
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDOSelSelected')
      .args(RdoValue.int(boolVal))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates RDOSetBuyingStatus command
   * Voyager: SupplySheetForm.pas line 741
   */
  async simulateSetBuyingStatus(buildingId: number, fingerIndex: number, buying: boolean): Promise<string> {
    const rid = this.getNextRequestId();
    const boolVal = buying ? -1 : 0; // WordBool: -1=true, 0=false
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .call('RDOSetBuyingStatus')
      .args(RdoValue.int(fingerIndex), RdoValue.int(boolVal))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates RDOConnectToTycoon command
   * Voyager: IndustryGeneralSheet.pas line 345
   */
  async simulateConnectToTycoon(buildingId: number, tycoonId: number, kind: number): Promise<string> {
    const cmd = RdoCommand
      .sel(buildingId)
      .call('RDOConnectToTycoon')
      .push()
      .args(RdoValue.int(tycoonId), RdoValue.int(kind), RdoValue.int(-1))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates RDODisconnectFromTycoon command
   * Voyager: IndustryGeneralSheet.pas line 357
   */
  async simulateDisconnectFromTycoon(buildingId: number, tycoonId: number, kind: number): Promise<string> {
    const cmd = RdoCommand
      .sel(buildingId)
      .call('RDODisconnectFromTycoon')
      .push()
      .args(RdoValue.int(tycoonId), RdoValue.int(kind), RdoValue.int(-1))
      .build();

    this.send(cmd);
    return cmd;
  }

  /**
   * Simulates Stopped property set (pause/resume facility)
   * Voyager: IndustryGeneralSheet.pas line 379/384
   */
  simulateSetStopped(buildingId: number, stopped: boolean): string {
    const rid = this.getNextRequestId();
    const boolVal = stopped ? -1 : 0;
    const cmd = RdoCommand
      .sel(buildingId)
      .withRequestId(rid)
      .set('Stopped')
      .args(RdoValue.int(boolVal))
      .build();

    this.send(cmd);
    return cmd;
  }
}
