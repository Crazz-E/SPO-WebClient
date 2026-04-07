/**
 * RDO Protocol Constants & Primitives
 * Low-level protocol definitions for Starpeace Online RDO communication
 */

/**
 * Standard ports defined in the protocol documentation.
 */
export const RDO_PORTS = {
  DIRECTORY: 1111,
  MAP_SERVICE: 6000,
  CONSTRUCTION_SERVICE: 7001,
};

export const RDO_CONSTANTS = {
  PACKET_DELIMITER: ';',
  CMD_PREFIX_CLIENT: 'C',
  CMD_PREFIX_ANSWER: 'A',
  TOKEN_SEPARATOR: ',',
  METHOD_SEPARATOR: '"^"',
  PUSH_SEPARATOR: '"*"',
};

export enum RdoVerb {
  IDOF = 'idof',
  SEL = 'sel',
}

export enum RdoAction {
  GET = 'get',
  SET = 'set',
  CALL = 'call'
}

export interface RdoPacket {
  raw: string;
  type: 'REQUEST' | 'RESPONSE' | 'PUSH';
  rid?: number;
  verb?: RdoVerb;
  targetId?: string;
  action?: RdoAction;
  member?: string;
  args?: string[];
  separator?: string;
  payload?: string;
  /** RDO error code (0-17) if the response is an error. See ErrorCodes.pas */
  errorCode?: number;
  /** Human-readable error name from ErrorCodes.pas */
  errorName?: string;
}

/**
 * RDO error codes from ErrorCodes.pas.
 * Format on wire: "error <code>" as the response payload.
 */
export const RDO_ERROR_CODES: Record<number, string> = {
  0: 'errNoError',
  1: 'errMalformedQuery',
  2: 'errIllegalObject',
  3: 'errUnexistentProperty',
  4: 'errIllegalPropValue',
  5: 'errUnexistentMethod',
  6: 'errIllegalParamList',
  7: 'errIllegalPropType',
  8: 'errQueryTimedOut',
  9: 'errIllegalFunctionRes',
  10: 'errSendError',
  11: 'errReceiveError',
  12: 'errMalformedResult',
  13: 'errQueryQueueOverflow',
  14: 'errRDOServerNotInitialized',
  15: 'errUnknownError',
  16: 'errNoResult',
  17: 'errServerBusy',
};

export interface WorldZone {
  id: string;
  name: string;
  path: string;
}

export const WORLD_ZONES: WorldZone[] = [
  { id: 'beta', name: 'BETA', path: 'Root/Areas/Asia/Worlds' },
  { id: 'free', name: 'Free Space', path: 'Root/Areas/America/Worlds' },
  { id: 'restricted', name: 'Restricted Space', path: 'Root/Areas/Europe/Worlds' }
];

export const DIRECTORY_QUERY = {
  QUERY_BLOCK: `General/Population
General/Investors
General/Online
General/Date
Interface/IP
Interface/Port
Interface/URL
Interface/Running`
};

/**
 * Session phases for connection state machine
 */
export enum SessionPhase {
  DISCONNECTED = 'DISCONNECTED',
  DIRECTORY_CONNECTED = 'DIRECTORY_CONNECTED',
  WORLD_CONNECTING = 'WORLD_CONNECTING',
  WORLD_CONNECTED = 'WORLD_CONNECTED',
  RECONNECTING = 'RECONNECTING',
}
