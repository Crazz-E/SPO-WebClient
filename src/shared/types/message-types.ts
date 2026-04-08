/**
 * Message Types - WebSocket Protocol Messages
 * Contains all request/response types for Gateway <-> Browser communication
 */

import type {
  WorldInfo,
  CompanyInfo,
  MapData,
  ChatUser,
  BuildingFocusInfo,
  BuildingCategory,
  BuildingInfo,
  SurfaceData,
  FacilityDimensions,
  BuildingDetailsResponse,
  BuildingSupplyData,
  BuildingProductData,
  CompInputData,
  WarehouseWareData,
  SearchMenuCategory,
  TownInfo,
  TycoonProfile,
  TycoonProfileFull,
  RankingCategory,
  RankingEntry,
  SurfaceType,
  MailFolder,
  MailMessageHeader,
  MailMessageFull,
  CurriculumData,
  BankAccountData,
  BankActionType,
  BankActionResult,
  ProfitLossData,
  CompaniesData,
  AutoConnectionsData,
  AutoConnectionActionType,
  CurriculumActionType,
  PolicyData,
  PoliticsData,
  PoliticalRoleInfo,
  TransportData,
  ClusterInfo,
  ClusterFacilityPreview,
} from './domain-types';

import type { RdoVerb, RdoAction } from './protocol-types';

// =============================================================================
// MESSAGE TYPE ENUM
// =============================================================================

export enum WsMessageType {
  // Client -> Gateway (Requests)
  REQ_AUTH_CHECK = 'REQ_AUTH_CHECK',
  REQ_CONNECT_DIRECTORY = 'REQ_CONNECT_DIRECTORY',
  REQ_LOGIN_WORLD = 'REQ_LOGIN_WORLD',
  REQ_RDO_DIRECT = 'REQ_RDO_DIRECT',
  REQ_MAP_LOAD = 'REQ_MAP_LOAD',
  REQ_SELECT_COMPANY = 'REQ_SELECT_COMPANY',
  REQ_SWITCH_COMPANY = 'REQ_SWITCH_COMPANY',
  REQ_MANAGE_CONSTRUCTION = 'REQ_MANAGE_CONSTRUCTION',

  // Gateway -> Client (Responses)
  RESP_AUTH_SUCCESS = 'RESP_AUTH_SUCCESS',
  RESP_CONNECT_SUCCESS = 'RESP_CONNECT_SUCCESS',
  RESP_LOGIN_SUCCESS = 'RESP_LOGIN_SUCCESS',
  RESP_RDO_RESULT = 'RESP_RDO_RESULT',
  RESP_ERROR = 'RESP_ERROR',
  RESP_MAP_DATA = 'RESP_MAP_DATA',
  RESP_CONSTRUCTION_SUCCESS = 'RESP_CONSTRUCTION_SUCCESS',

  // Gateway -> Client (Async Events / Pushes)
  EVENT_CHAT_MSG = 'EVENT_CHAT_MSG',
  EVENT_MAP_DATA = 'EVENT_MAP_DATA',
  EVENT_TYCOON_UPDATE = 'EVENT_TYCOON_UPDATE',
  EVENT_RDO_PUSH = 'EVENT_RDO_PUSH',
  EVENT_END_OF_PERIOD = 'EVENT_END_OF_PERIOD',
  EVENT_REFRESH_DATE = 'EVENT_REFRESH_DATE',

  // Chat functionality
  REQ_CHAT_GET_USERS = 'REQ_CHAT_GET_USERS',
  REQ_CHAT_GET_CHANNELS = 'REQ_CHAT_GET_CHANNELS',
  REQ_CHAT_GET_CHANNEL_INFO = 'REQ_CHAT_GET_CHANNEL_INFO',
  REQ_CHAT_JOIN_CHANNEL = 'REQ_CHAT_JOIN_CHANNEL',
  REQ_CHAT_SEND_MESSAGE = 'REQ_CHAT_SEND_MESSAGE',
  REQ_CHAT_TYPING_STATUS = 'REQ_CHAT_TYPING_STATUS',

  RESP_CHAT_USER_LIST = 'RESP_CHAT_USER_LIST',
  RESP_CHAT_CHANNEL_LIST = 'RESP_CHAT_CHANNEL_LIST',
  RESP_CHAT_CHANNEL_INFO = 'RESP_CHAT_CHANNEL_INFO',
  RESP_CHAT_SUCCESS = 'RESP_CHAT_SUCCESS',

  EVENT_CHAT_USER_TYPING = 'EVENT_CHAT_USER_TYPING',
  EVENT_CHAT_CHANNEL_CHANGE = 'EVENT_CHAT_CHANNEL_CHANGE',
  EVENT_CHAT_USER_LIST_CHANGE = 'EVENT_CHAT_USER_LIST_CHANGE',

  // GM Chat (gateway-level broadcast)
  REQ_GM_CHAT_SEND = 'REQ_GM_CHAT_SEND',

  REQ_BUILDING_FOCUS = 'REQ_BUILDING_FOCUS',
  REQ_BUILDING_UNFOCUS = 'REQ_BUILDING_UNFOCUS',
  RESP_BUILDING_FOCUS = 'RESP_BUILDING_FOCUS',
  EVENT_BUILDING_REFRESH = 'EVENT_BUILDING_REFRESH',
  EVENT_AREA_REFRESH = 'EVENT_AREA_REFRESH',
  EVENT_SHOW_NOTIFICATION = 'EVENT_SHOW_NOTIFICATION',
  EVENT_CACHE_REFRESH = 'EVENT_CACHE_REFRESH',

  // World socket reconnection events
  EVENT_WORLD_RECONNECTED = 'EVENT_WORLD_RECONNECTED',
  EVENT_WORLD_DISCONNECTED = 'EVENT_WORLD_DISCONNECTED',

  // Server maintenance (mirrors Delphi fMaintDue + fMSDownCount pattern)
  EVENT_MAINTENANCE = 'EVENT_MAINTENANCE',

  // Building Construction
  REQ_GET_BUILDING_CATEGORIES = 'REQ_GET_BUILDING_CATEGORIES',
  REQ_GET_BUILDING_FACILITIES = 'REQ_GET_BUILDING_FACILITIES',
  REQ_PLACE_BUILDING = 'REQ_PLACE_BUILDING',
  REQ_GET_SURFACE = 'REQ_GET_SURFACE',
  REQ_GET_ALL_FACILITY_DIMENSIONS = 'REQ_GET_ALL_FACILITY_DIMENSIONS',

  RESP_BUILDING_CATEGORIES = 'RESP_BUILDING_CATEGORIES',
  RESP_BUILDING_FACILITIES = 'RESP_BUILDING_FACILITIES',
  RESP_BUILDING_PLACED = 'RESP_BUILDING_PLACED',
  RESP_SURFACE_DATA = 'RESP_SURFACE_DATA',
  RESP_ALL_FACILITY_DIMENSIONS = 'RESP_ALL_FACILITY_DIMENSIONS',

  // Building Details
  REQ_BUILDING_DETAILS = 'REQ_BUILDING_DETAILS',
  RESP_BUILDING_DETAILS = 'RESP_BUILDING_DETAILS',
  REQ_BUILDING_TAB_DATA = 'REQ_BUILDING_TAB_DATA',
  RESP_BUILDING_TAB_DATA = 'RESP_BUILDING_TAB_DATA',
  REQ_BUILDING_REFRESH_PROPERTIES = 'REQ_BUILDING_REFRESH_PROPERTIES',
  RESP_BUILDING_REFRESH_PROPERTIES = 'RESP_BUILDING_REFRESH_PROPERTIES',
  REQ_BUILDING_SET_PROPERTY = 'REQ_BUILDING_SET_PROPERTY',
  RESP_BUILDING_SET_PROPERTY = 'RESP_BUILDING_SET_PROPERTY',


  // Building Upgrades
  REQ_BUILDING_UPGRADE = 'REQ_BUILDING_UPGRADE',
  RESP_BUILDING_UPGRADE = 'RESP_BUILDING_UPGRADE',

  // Building Rename
  REQ_RENAME_FACILITY = 'REQ_RENAME_FACILITY',
  RESP_RENAME_FACILITY = 'RESP_RENAME_FACILITY',

  // Building Deletion
  REQ_DELETE_FACILITY = 'REQ_DELETE_FACILITY',
  RESP_DELETE_FACILITY = 'RESP_DELETE_FACILITY',

  // Building Connection (map-click connect two facilities)
  REQ_CONNECT_FACILITIES = 'REQ_CONNECT_FACILITIES',
  RESP_CONNECT_FACILITIES = 'RESP_CONNECT_FACILITIES',

  // Clone Facility (propagate settings to same-type buildings)
  REQ_CLONE_FACILITY = 'REQ_CLONE_FACILITY',
  RESP_CLONE_FACILITY = 'RESP_CLONE_FACILITY',

  // Road Building
  REQ_BUILD_ROAD = 'REQ_BUILD_ROAD',
  RESP_BUILD_ROAD = 'RESP_BUILD_ROAD',
  REQ_GET_ROAD_COST = 'REQ_GET_ROAD_COST',
  RESP_GET_ROAD_COST = 'RESP_GET_ROAD_COST',
  REQ_DEMOLISH_ROAD = 'REQ_DEMOLISH_ROAD',
  RESP_DEMOLISH_ROAD = 'RESP_DEMOLISH_ROAD',
  REQ_DEMOLISH_ROAD_AREA = 'REQ_DEMOLISH_ROAD_AREA',
  RESP_DEMOLISH_ROAD_AREA = 'RESP_DEMOLISH_ROAD_AREA',

  // Search Menu / Directory
  REQ_SEARCH_MENU_HOME = 'REQ_SEARCH_MENU_HOME',
  REQ_SEARCH_MENU_TOWNS = 'REQ_SEARCH_MENU_TOWNS',
  REQ_SEARCH_MENU_TYCOON_PROFILE = 'REQ_SEARCH_MENU_TYCOON_PROFILE',
  REQ_SEARCH_MENU_PEOPLE = 'REQ_SEARCH_MENU_PEOPLE',
  REQ_SEARCH_MENU_PEOPLE_SEARCH = 'REQ_SEARCH_MENU_PEOPLE_SEARCH',
  REQ_SEARCH_MENU_RANKINGS = 'REQ_SEARCH_MENU_RANKINGS',
  REQ_SEARCH_MENU_RANKING_DETAIL = 'REQ_SEARCH_MENU_RANKING_DETAIL',
  REQ_SEARCH_MENU_BANKS = 'REQ_SEARCH_MENU_BANKS',

  RESP_SEARCH_MENU_HOME = 'RESP_SEARCH_MENU_HOME',
  RESP_SEARCH_MENU_TOWNS = 'RESP_SEARCH_MENU_TOWNS',
  RESP_SEARCH_MENU_TYCOON_PROFILE = 'RESP_SEARCH_MENU_TYCOON_PROFILE',
  RESP_SEARCH_MENU_PEOPLE = 'RESP_SEARCH_MENU_PEOPLE',
  RESP_SEARCH_MENU_PEOPLE_SEARCH = 'RESP_SEARCH_MENU_PEOPLE_SEARCH',
  RESP_SEARCH_MENU_RANKINGS = 'RESP_SEARCH_MENU_RANKINGS',
  RESP_SEARCH_MENU_RANKING_DETAIL = 'RESP_SEARCH_MENU_RANKING_DETAIL',
  RESP_SEARCH_MENU_BANKS = 'RESP_SEARCH_MENU_BANKS',

  // Logout
  REQ_LOGOUT = 'REQ_LOGOUT',
  RESP_LOGOUT = 'RESP_LOGOUT',

  // Mail
  REQ_MAIL_CONNECT = 'REQ_MAIL_CONNECT',
  REQ_MAIL_GET_FOLDER = 'REQ_MAIL_GET_FOLDER',
  REQ_MAIL_READ_MESSAGE = 'REQ_MAIL_READ_MESSAGE',
  REQ_MAIL_COMPOSE = 'REQ_MAIL_COMPOSE',
  REQ_MAIL_DELETE = 'REQ_MAIL_DELETE',
  REQ_MAIL_GET_UNREAD_COUNT = 'REQ_MAIL_GET_UNREAD_COUNT',
  REQ_MAIL_SAVE_DRAFT = 'REQ_MAIL_SAVE_DRAFT',

  RESP_MAIL_CONNECTED = 'RESP_MAIL_CONNECTED',
  RESP_MAIL_FOLDER = 'RESP_MAIL_FOLDER',
  RESP_MAIL_MESSAGE = 'RESP_MAIL_MESSAGE',
  RESP_MAIL_SENT = 'RESP_MAIL_SENT',
  RESP_MAIL_DELETED = 'RESP_MAIL_DELETED',
  RESP_MAIL_UNREAD_COUNT = 'RESP_MAIL_UNREAD_COUNT',
  RESP_MAIL_DRAFT_SAVED = 'RESP_MAIL_DRAFT_SAVED',

  EVENT_NEW_MAIL = 'EVENT_NEW_MAIL',

  // Profile
  REQ_GET_PROFILE = 'REQ_GET_PROFILE',
  RESP_GET_PROFILE = 'RESP_GET_PROFILE',

  // Profile Tabs
  REQ_PROFILE_CURRICULUM = 'REQ_PROFILE_CURRICULUM',
  RESP_PROFILE_CURRICULUM = 'RESP_PROFILE_CURRICULUM',
  REQ_PROFILE_BANK = 'REQ_PROFILE_BANK',
  RESP_PROFILE_BANK = 'RESP_PROFILE_BANK',
  REQ_PROFILE_BANK_ACTION = 'REQ_PROFILE_BANK_ACTION',
  RESP_PROFILE_BANK_ACTION = 'RESP_PROFILE_BANK_ACTION',
  REQ_PROFILE_PROFITLOSS = 'REQ_PROFILE_PROFITLOSS',
  RESP_PROFILE_PROFITLOSS = 'RESP_PROFILE_PROFITLOSS',
  REQ_PROFILE_COMPANIES = 'REQ_PROFILE_COMPANIES',
  RESP_PROFILE_COMPANIES = 'RESP_PROFILE_COMPANIES',
  REQ_PROFILE_AUTOCONNECTIONS = 'REQ_PROFILE_AUTOCONNECTIONS',
  RESP_PROFILE_AUTOCONNECTIONS = 'RESP_PROFILE_AUTOCONNECTIONS',
  REQ_PROFILE_AUTOCONNECTION_ACTION = 'REQ_PROFILE_AUTOCONNECTION_ACTION',
  RESP_PROFILE_AUTOCONNECTION_ACTION = 'RESP_PROFILE_AUTOCONNECTION_ACTION',
  REQ_PROFILE_POLICY = 'REQ_PROFILE_POLICY',
  RESP_PROFILE_POLICY = 'RESP_PROFILE_POLICY',
  REQ_PROFILE_POLICY_SET = 'REQ_PROFILE_POLICY_SET',
  RESP_PROFILE_POLICY_SET = 'RESP_PROFILE_POLICY_SET',
  REQ_PROFILE_CURRICULUM_ACTION = 'REQ_PROFILE_CURRICULUM_ACTION',
  RESP_PROFILE_CURRICULUM_ACTION = 'RESP_PROFILE_CURRICULUM_ACTION',

  // Politics
  REQ_POLITICS_DATA = 'REQ_POLITICS_DATA',
  RESP_POLITICS_DATA = 'RESP_POLITICS_DATA',
  REQ_POLITICS_VOTE = 'REQ_POLITICS_VOTE',
  RESP_POLITICS_VOTE = 'RESP_POLITICS_VOTE',
  REQ_POLITICS_LAUNCH_CAMPAIGN = 'REQ_POLITICS_LAUNCH_CAMPAIGN',
  RESP_POLITICS_LAUNCH_CAMPAIGN = 'RESP_POLITICS_LAUNCH_CAMPAIGN',
  REQ_POLITICS_CANCEL_CAMPAIGN = 'REQ_POLITICS_CANCEL_CAMPAIGN',
  RESP_POLITICS_CANCEL_CAMPAIGN = 'RESP_POLITICS_CANCEL_CAMPAIGN',
  REQ_TYCOON_ROLE = 'REQ_TYCOON_ROLE',
  RESP_TYCOON_ROLE = 'RESP_TYCOON_ROLE',

  // Connection Search
  REQ_SEARCH_CONNECTIONS = 'REQ_SEARCH_CONNECTIONS',
  RESP_SEARCH_CONNECTIONS = 'RESP_SEARCH_CONNECTIONS',

  // Company Creation
  REQ_CREATE_COMPANY = 'REQ_CREATE_COMPANY',
  RESP_CREATE_COMPANY = 'RESP_CREATE_COMPANY',

  // Cluster Browsing (company creation)
  REQ_CLUSTER_INFO = 'REQ_CLUSTER_INFO',
  RESP_CLUSTER_INFO = 'RESP_CLUSTER_INFO',
  REQ_CLUSTER_FACILITIES = 'REQ_CLUSTER_FACILITIES',
  RESP_CLUSTER_FACILITIES = 'RESP_CLUSTER_FACILITIES',

  // Transport (Railroad/Train)
  REQ_TRANSPORT_DATA = 'REQ_TRANSPORT_DATA',
  RESP_TRANSPORT_DATA = 'RESP_TRANSPORT_DATA',

  // Empire (Owned Facilities via Favorites)
  REQ_EMPIRE_FACILITIES = 'REQ_EMPIRE_FACILITIES',
  RESP_EMPIRE_FACILITIES = 'RESP_EMPIRE_FACILITIES',

  // Research / Inventions
  REQ_RESEARCH_INVENTORY = 'REQ_RESEARCH_INVENTORY',
  RESP_RESEARCH_INVENTORY = 'RESP_RESEARCH_INVENTORY',
  REQ_RESEARCH_DETAILS = 'REQ_RESEARCH_DETAILS',
  RESP_RESEARCH_DETAILS = 'RESP_RESEARCH_DETAILS',

  // Zone Painting
  REQ_DEFINE_ZONE = 'REQ_DEFINE_ZONE',
  RESP_DEFINE_ZONE = 'RESP_DEFINE_ZONE',

  // Camera Position
  REQ_UPDATE_CAMERA = 'REQ_UPDATE_CAMERA',

  // Capitol
  REQ_BUILD_CAPITOL = 'REQ_BUILD_CAPITOL',
  RESP_CAPITOL_PLACED = 'RESP_CAPITOL_PLACED',
  RESP_CAPITOL_COORDS = 'RESP_CAPITOL_COORDS',
}

// =============================================================================
// BASE MESSAGE INTERFACE
// =============================================================================

export interface WsMessage {
  type: WsMessageType;
  wsRequestId?: string;
}

// =============================================================================
// REQUEST PAYLOADS
// =============================================================================

export interface WsReqAuthCheck extends WsMessage {
  type: WsMessageType.REQ_AUTH_CHECK;
  username: string;
  password: string;
}

export interface WsReqConnectDirectory extends WsMessage {
  type: WsMessageType.REQ_CONNECT_DIRECTORY;
  username: string;
  password: string;
  zonePath?: string;
}

export interface WsReqLoginWorld extends WsMessage {
  type: WsMessageType.REQ_LOGIN_WORLD;
  username: string;
  password: string;
  worldName: string;
}

export interface WsReqRdoDirect extends WsMessage {
  type: WsMessageType.REQ_RDO_DIRECT;
  verb: RdoVerb;
  targetId: string;
  action?: RdoAction;
  member?: string;
  args?: string[];
}

export interface WsReqMapLoad extends WsMessage {
  type: WsMessageType.REQ_MAP_LOAD;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WsReqManageConstruction extends WsMessage {
  type: WsMessageType.REQ_MANAGE_CONSTRUCTION;
  x: number;
  y: number;
  action: 'START' | 'STOP' | 'DOWN';
  count?: number;
}

export interface WsReqSelectCompany extends WsMessage {
  type: WsMessageType.REQ_SELECT_COMPANY;
  companyId: string;
}

export interface WsReqSwitchCompany extends WsMessage {
  type: WsMessageType.REQ_SWITCH_COMPANY;
  company: CompanyInfo;
}

// =============================================================================
// RESPONSE PAYLOADS
// =============================================================================

export interface WsRespError extends WsMessage {
  type: WsMessageType.RESP_ERROR;
  errorMessage: string;
  code: number;
}

export interface WsRespAuthSuccess extends WsMessage {
  type: WsMessageType.RESP_AUTH_SUCCESS;
}

export interface WsRespConnectSuccess extends WsMessage {
  type: WsMessageType.RESP_CONNECT_SUCCESS;
  worlds: WorldInfo[];
}

export interface WsRespLoginSuccess extends WsMessage {
  type: WsMessageType.RESP_LOGIN_SUCCESS;
  tycoonId: string;
  contextId: string;
  companyCount: number;
  companies?: CompanyInfo[];
  worldXSize?: number;
  worldYSize?: number;
  worldSeason?: number;  // 0=Winter, 1=Spring, 2=Summer, 3=Autumn
}

export interface WsRespRdoResult extends WsMessage {
  type: WsMessageType.RESP_RDO_RESULT;
  result: string | string[];
}

export interface WsRespConstructionSuccess extends WsMessage {
  type: WsMessageType.RESP_CONSTRUCTION_SUCCESS;
  action: string;
  x: number;
  y: number;
}

export interface WsRespMapData extends WsMessage {
  type: WsMessageType.RESP_MAP_DATA;
  data: MapData;
}

// =============================================================================
// EVENT PAYLOADS
// =============================================================================

export interface WsEventChatMsg extends WsMessage {
  type: WsMessageType.EVENT_CHAT_MSG;
  channel: string;
  from: string;
  message: string;
  isGM?: boolean;
}

export interface WsEventTycoonUpdate extends WsMessage {
  type: WsMessageType.EVENT_TYCOON_UPDATE;
  cash: string;
  incomePerHour: string;
  ranking: number;
  buildingCount: number;
  maxBuildings: number;
  /** 0 = nominal, 1 = warning (debt), 2 = alert (near bankruptcy) */
  failureLevel?: number;
}

export interface WsEventRdoPush extends WsMessage {
  type: WsMessageType.EVENT_RDO_PUSH;
  rawPacket: string;
}

export interface WsEventEndOfPeriod extends WsMessage {
  type: WsMessageType.EVENT_END_OF_PERIOD;
}

export interface WsEventRefreshDate extends WsMessage {
  type: WsMessageType.EVENT_REFRESH_DATE;
  dateDouble: number;
}

// =============================================================================
// CHAT MESSAGES
// =============================================================================

export interface WsReqChatGetUsers extends WsMessage {
  type: WsMessageType.REQ_CHAT_GET_USERS;
}

export interface WsReqChatGetChannels extends WsMessage {
  type: WsMessageType.REQ_CHAT_GET_CHANNELS;
}

export interface WsReqChatGetChannelInfo extends WsMessage {
  type: WsMessageType.REQ_CHAT_GET_CHANNEL_INFO;
  channelName: string;
}

export interface WsReqChatJoinChannel extends WsMessage {
  type: WsMessageType.REQ_CHAT_JOIN_CHANNEL;
  channelName: string;
}

export interface WsReqChatSendMessage extends WsMessage {
  type: WsMessageType.REQ_CHAT_SEND_MESSAGE;
  message: string;
}

export interface WsReqChatTypingStatus extends WsMessage {
  type: WsMessageType.REQ_CHAT_TYPING_STATUS;
  isTyping: boolean;
}

export interface WsRespChatUserList extends WsMessage {
  type: WsMessageType.RESP_CHAT_USER_LIST;
  users: ChatUser[];
}

export interface WsRespChatChannelList extends WsMessage {
  type: WsMessageType.RESP_CHAT_CHANNEL_LIST;
  channels: string[];
}

export interface WsRespChatChannelInfo extends WsMessage {
  type: WsMessageType.RESP_CHAT_CHANNEL_INFO;
  info: string;
}

export interface WsRespChatSuccess extends WsMessage {
  type: WsMessageType.RESP_CHAT_SUCCESS;
}

export interface WsEventChatUserTyping extends WsMessage {
  type: WsMessageType.EVENT_CHAT_USER_TYPING;
  username: string;
  isTyping: boolean;
}

export interface WsEventChatChannelChange extends WsMessage {
  type: WsMessageType.EVENT_CHAT_CHANNEL_CHANGE;
  channelName: string;
}

export interface WsReqGmChatSend extends WsMessage {
  type: WsMessageType.REQ_GM_CHAT_SEND;
  message: string;
}

export interface WsEventChatUserListChange extends WsMessage {
  type: WsMessageType.EVENT_CHAT_USER_LIST_CHANGE;
  user: ChatUser;
  action: 'JOIN' | 'LEAVE';
}

// =============================================================================
// BUILDING FOCUS MESSAGES
// =============================================================================

export interface WsReqBuildingFocus extends WsMessage {
  type: WsMessageType.REQ_BUILDING_FOCUS;
  x: number;
  y: number;
}

export interface WsReqBuildingUnfocus extends WsMessage {
  type: WsMessageType.REQ_BUILDING_UNFOCUS;
}

export interface WsRespBuildingFocus extends WsMessage {
  type: WsMessageType.RESP_BUILDING_FOCUS;
  building: BuildingFocusInfo;
}

export interface WsEventBuildingRefresh extends WsMessage {
  type: WsMessageType.EVENT_BUILDING_REFRESH;
  building: BuildingFocusInfo;
  /** 0=fchStatus (text only), 1=fchStructure (visual changed), 2=fchDestruction */
  kindOfChange: number;
}

export interface WsEventAreaRefresh extends WsMessage {
  type: WsMessageType.EVENT_AREA_REFRESH;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WsEventShowNotification extends WsMessage {
  type: WsMessageType.EVENT_SHOW_NOTIFICATION;
  /** 0=MessageBox, 1=URLFrame, 2=ChatMessage, 3=Sound, 4=GenericEvent */
  kind: number;
  title: string;
  body: string;
  options: number;
}

export interface WsEventCacheRefresh extends WsMessage {
  type: WsMessageType.EVENT_CACHE_REFRESH;
}

export interface WsEventWorldReconnected extends WsMessage {
  type: WsMessageType.EVENT_WORLD_RECONNECTED;
}

export interface WsEventWorldDisconnected extends WsMessage {
  type: WsMessageType.EVENT_WORLD_DISCONNECTED;
}

/** Server maintenance event — mirrors Delphi fMaintDue / fServerError broadcast */
export interface WsEventMaintenance extends WsMessage {
  type: WsMessageType.EVENT_MAINTENANCE;
  /** true = maintenance starting, false = maintenance ended */
  active: boolean;
  /** Human-readable message (e.g., "Server restarting in 5 minutes") */
  message: string;
}

// =============================================================================
// BUILDING CONSTRUCTION MESSAGES
// =============================================================================

export interface WsReqGetBuildingCategories extends WsMessage {
  type: WsMessageType.REQ_GET_BUILDING_CATEGORIES;
  companyName: string;
}

export interface WsReqGetBuildingFacilities extends WsMessage {
  type: WsMessageType.REQ_GET_BUILDING_FACILITIES;
  companyName: string;
  cluster: string;
  kind: string;
  kindName: string;
  folder: string;
  tycoonLevel: number;
}

export interface WsReqPlaceBuilding extends WsMessage {
  type: WsMessageType.REQ_PLACE_BUILDING;
  facilityClass: string;
  x: number;
  y: number;
}

export interface WsReqGetSurface extends WsMessage {
  type: WsMessageType.REQ_GET_SURFACE;
  surfaceType: SurfaceType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WsReqGetAllFacilityDimensions extends WsMessage {
  type: WsMessageType.REQ_GET_ALL_FACILITY_DIMENSIONS;
}

export interface WsRespBuildingCategories extends WsMessage {
  type: WsMessageType.RESP_BUILDING_CATEGORIES;
  categories: BuildingCategory[];
  capitolIconUrl?: string;
}

export interface WsRespBuildingFacilities extends WsMessage {
  type: WsMessageType.RESP_BUILDING_FACILITIES;
  facilities: BuildingInfo[];
}

export interface WsRespBuildingPlaced extends WsMessage {
  type: WsMessageType.RESP_BUILDING_PLACED;
  x: number;
  y: number;
  buildingId: string;
}

export interface WsRespSurfaceData extends WsMessage {
  type: WsMessageType.RESP_SURFACE_DATA;
  data: SurfaceData;
}

export interface WsRespAllFacilityDimensions extends WsMessage {
  type: WsMessageType.RESP_ALL_FACILITY_DIMENSIONS;
  dimensions: Record<string, FacilityDimensions>;
  civicVisualClassIds: string[];
}

// =============================================================================
// BUILDING DETAILS MESSAGES
// =============================================================================

export interface WsReqBuildingDetails extends WsMessage {
  type: WsMessageType.REQ_BUILDING_DETAILS;
  x: number;
  y: number;
  visualClass: string;
}

export interface WsRespBuildingDetails extends WsMessage {
  type: WsMessageType.RESP_BUILDING_DETAILS;
  details: BuildingDetailsResponse;
}

export interface WsReqBuildingTabData extends WsMessage {
  type: WsMessageType.REQ_BUILDING_TAB_DATA;
  x: number;
  y: number;
  tabId: string;
  visualClass: string;
}

export interface WsRespBuildingTabData extends WsMessage {
  type: WsMessageType.RESP_BUILDING_TAB_DATA;
  x: number;
  y: number;
  tabId: string;
  supplies?: BuildingSupplyData[];
  products?: BuildingProductData[];
  compInputs?: CompInputData[];
  warehouseWares?: WarehouseWareData[];
}

/** Lightweight property refresh — reuses existing Delphi temp object. */
export interface WsReqBuildingRefreshProperties extends WsMessage {
  type: WsMessageType.REQ_BUILDING_REFRESH_PROPERTIES;
  x: number;
  y: number;
  visualClass: string;
  /** Active tab ID — when provided, server only refreshes this tab + overview (R1 optimisation). */
  activeTabId?: string;
}

export interface WsRespBuildingRefreshProperties extends WsMessage {
  type: WsMessageType.RESP_BUILDING_REFRESH_PROPERTIES;
  details: BuildingDetailsResponse;
}

export interface WsReqBuildingSetProperty extends WsMessage {
  type: WsMessageType.REQ_BUILDING_SET_PROPERTY;
  x: number;
  y: number;
  propertyName: string;
  value: string;
  additionalParams?: Record<string, string>;
}

export interface WsRespBuildingSetProperty extends WsMessage {
  type: WsMessageType.RESP_BUILDING_SET_PROPERTY;
  success: boolean;
  propertyName: string;
  newValue: string;
}

export interface WsReqBuildingUpgrade extends WsMessage {
  type: WsMessageType.REQ_BUILDING_UPGRADE;
  x: number;
  y: number;
  action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE';
  count?: number;
}

export interface WsRespBuildingUpgrade extends WsMessage {
  type: WsMessageType.RESP_BUILDING_UPGRADE;
  success: boolean;
  action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE';
  message?: string;
}

export interface WsReqRenameFacility extends WsMessage {
  type: WsMessageType.REQ_RENAME_FACILITY;
  x: number;
  y: number;
  newName: string;
}

export interface WsRespRenameFacility extends WsMessage {
  type: WsMessageType.RESP_RENAME_FACILITY;
  success: boolean;
  newName: string;
  message?: string;
}

export interface WsReqDeleteFacility extends WsMessage {
  type: WsMessageType.REQ_DELETE_FACILITY;
  x: number;
  y: number;
}

export interface WsRespDeleteFacility extends WsMessage {
  type: WsMessageType.RESP_DELETE_FACILITY;
  success: boolean;
  message?: string;
}

// =============================================================================
// BUILDING CONNECTION (map-click connect two facilities)
// =============================================================================

export interface WsReqConnectFacilities extends WsMessage {
  type: WsMessageType.REQ_CONNECT_FACILITIES;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export interface WsRespConnectFacilities extends WsMessage {
  type: WsMessageType.RESP_CONNECT_FACILITIES;
  success: boolean;
  resultMessage: string;
}

// =============================================================================
// CLONE FACILITY MESSAGES
// =============================================================================

export interface WsReqCloneFacility extends WsMessage {
  type: WsMessageType.REQ_CLONE_FACILITY;
  x: number;       // Source building X coordinate
  y: number;       // Source building Y coordinate
  options: number;  // Bitmask of clone option flags (OR'd together)
}

export interface WsRespCloneFacility extends WsMessage {
  type: WsMessageType.RESP_CLONE_FACILITY;
  success: boolean;
}

// =============================================================================
// SEARCH MENU MESSAGES
// =============================================================================

export interface WsReqSearchMenuHome extends WsMessage {
  type: WsMessageType.REQ_SEARCH_MENU_HOME;
}

export interface WsRespSearchMenuHome extends WsMessage {
  type: WsMessageType.RESP_SEARCH_MENU_HOME;
  categories: SearchMenuCategory[];
}

export interface WsReqSearchMenuTowns extends WsMessage {
  type: WsMessageType.REQ_SEARCH_MENU_TOWNS;
}

export interface WsRespSearchMenuTowns extends WsMessage {
  type: WsMessageType.RESP_SEARCH_MENU_TOWNS;
  towns: TownInfo[];
}

export interface WsReqSearchMenuTycoonProfile extends WsMessage {
  type: WsMessageType.REQ_SEARCH_MENU_TYCOON_PROFILE;
  tycoonName: string;
}

export interface WsRespSearchMenuTycoonProfile extends WsMessage {
  type: WsMessageType.RESP_SEARCH_MENU_TYCOON_PROFILE;
  profile: TycoonProfile;
}

export interface WsReqSearchMenuPeople extends WsMessage {
  type: WsMessageType.REQ_SEARCH_MENU_PEOPLE;
}

export interface WsRespSearchMenuPeople extends WsMessage {
  type: WsMessageType.RESP_SEARCH_MENU_PEOPLE;
}

export interface WsReqSearchMenuPeopleSearch extends WsMessage {
  type: WsMessageType.REQ_SEARCH_MENU_PEOPLE_SEARCH;
  searchStr: string;
}

export interface WsRespSearchMenuPeopleSearch extends WsMessage {
  type: WsMessageType.RESP_SEARCH_MENU_PEOPLE_SEARCH;
  results: string[];
}

export interface WsReqSearchMenuRankings extends WsMessage {
  type: WsMessageType.REQ_SEARCH_MENU_RANKINGS;
}

export interface WsRespSearchMenuRankings extends WsMessage {
  type: WsMessageType.RESP_SEARCH_MENU_RANKINGS;
  categories: RankingCategory[];
}

export interface WsReqSearchMenuRankingDetail extends WsMessage {
  type: WsMessageType.REQ_SEARCH_MENU_RANKING_DETAIL;
  rankingPath: string;
}

export interface WsRespSearchMenuRankingDetail extends WsMessage {
  type: WsMessageType.RESP_SEARCH_MENU_RANKING_DETAIL;
  title: string;
  entries: RankingEntry[];
}

export interface WsReqSearchMenuBanks extends WsMessage {
  type: WsMessageType.REQ_SEARCH_MENU_BANKS;
}

export interface WsRespSearchMenuBanks extends WsMessage {
  type: WsMessageType.RESP_SEARCH_MENU_BANKS;
  banks: unknown[];
}

// =============================================================================
// ROAD BUILDING MESSAGES
// =============================================================================

export interface WsReqBuildRoad extends WsMessage {
  type: WsMessageType.REQ_BUILD_ROAD;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WsRespBuildRoad extends WsMessage {
  type: WsMessageType.RESP_BUILD_ROAD;
  success: boolean;
  cost: number;
  tileCount: number;
  message?: string;
  errorCode?: number;
  partial?: boolean;
}

export interface WsReqGetRoadCost extends WsMessage {
  type: WsMessageType.REQ_GET_ROAD_COST;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WsRespGetRoadCost extends WsMessage {
  type: WsMessageType.RESP_GET_ROAD_COST;
  cost: number;
  tileCount: number;
  costPerTile: number;
}

// =============================================================================
// ROAD DEMOLITION MESSAGES
// =============================================================================

export interface WsReqDemolishRoad extends WsMessage {
  type: WsMessageType.REQ_DEMOLISH_ROAD;
  x: number;
  y: number;
}

export interface WsRespDemolishRoad extends WsMessage {
  type: WsMessageType.RESP_DEMOLISH_ROAD;
  success: boolean;
  message?: string;
  errorCode?: number;
}

export interface WsReqDemolishRoadArea extends WsMessage {
  type: WsMessageType.REQ_DEMOLISH_ROAD_AREA;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WsRespDemolishRoadArea extends WsMessage {
  type: WsMessageType.RESP_DEMOLISH_ROAD_AREA;
  success: boolean;
  message?: string;
  errorCode?: number;
}

// =============================================================================
// LOGOUT MESSAGES
// =============================================================================

export interface WsReqLogout extends WsMessage {
  type: WsMessageType.REQ_LOGOUT;
}

export interface WsRespLogout extends WsMessage {
  type: WsMessageType.RESP_LOGOUT;
  success: boolean;
  message?: string;
}

// =============================================================================
// MAIL MESSAGES
// =============================================================================

export interface WsReqMailConnect extends WsMessage {
  type: WsMessageType.REQ_MAIL_CONNECT;
}

export interface WsReqMailGetFolder extends WsMessage {
  type: WsMessageType.REQ_MAIL_GET_FOLDER;
  folder: MailFolder;
}

export interface WsReqMailReadMessage extends WsMessage {
  type: WsMessageType.REQ_MAIL_READ_MESSAGE;
  folder: MailFolder;
  messageId: string;
}

export interface WsReqMailCompose extends WsMessage {
  type: WsMessageType.REQ_MAIL_COMPOSE;
  to: string;         // Recipient address(es), semicolon-separated
  subject: string;
  body: string[];      // Lines of text
  headers?: string;    // Original message headers for reply/forward threading (AddHeaders)
}

export interface WsReqMailDelete extends WsMessage {
  type: WsMessageType.REQ_MAIL_DELETE;
  folder: MailFolder;
  messageId: string;
}

export interface WsReqMailGetUnreadCount extends WsMessage {
  type: WsMessageType.REQ_MAIL_GET_UNREAD_COUNT;
}

export interface WsRespMailConnected extends WsMessage {
  type: WsMessageType.RESP_MAIL_CONNECTED;
  unreadCount: number;
}

export interface WsRespMailFolder extends WsMessage {
  type: WsMessageType.RESP_MAIL_FOLDER;
  folder: MailFolder;
  messages: MailMessageHeader[];
}

export interface WsRespMailMessage extends WsMessage {
  type: WsMessageType.RESP_MAIL_MESSAGE;
  message: MailMessageFull;
}

export interface WsRespMailSent extends WsMessage {
  type: WsMessageType.RESP_MAIL_SENT;
  success: boolean;
  message?: string;
}

export interface WsRespMailDeleted extends WsMessage {
  type: WsMessageType.RESP_MAIL_DELETED;
  success: boolean;
}

export interface WsRespMailUnreadCount extends WsMessage {
  type: WsMessageType.RESP_MAIL_UNREAD_COUNT;
  count: number;
}

export interface WsEventNewMail extends WsMessage {
  type: WsMessageType.EVENT_NEW_MAIL;
  unreadCount: number;
}

export interface WsReqMailSaveDraft extends WsMessage {
  type: WsMessageType.REQ_MAIL_SAVE_DRAFT;
  to: string;
  subject: string;
  body: string[];
  headers?: string;           // Original headers for reply/forward threading
  existingDraftId?: string;   // If editing existing draft, delete old one first
}

export interface WsRespMailDraftSaved extends WsMessage {
  type: WsMessageType.RESP_MAIL_DRAFT_SAVED;
  success: boolean;
  message?: string;
}

// =============================================================================
// PROFILE MESSAGES
// =============================================================================

export interface WsReqGetProfile extends WsMessage {
  type: WsMessageType.REQ_GET_PROFILE;
}

export interface WsRespGetProfile extends WsMessage {
  type: WsMessageType.RESP_GET_PROFILE;
  profile: TycoonProfileFull;
}

// =============================================================================
// PROFILE TAB MESSAGES
// =============================================================================

// --- Curriculum ---
export interface WsReqProfileCurriculum extends WsMessage {
  type: WsMessageType.REQ_PROFILE_CURRICULUM;
}

export interface WsRespProfileCurriculum extends WsMessage {
  type: WsMessageType.RESP_PROFILE_CURRICULUM;
  data: CurriculumData;
}

// --- Bank Account ---
export interface WsReqProfileBank extends WsMessage {
  type: WsMessageType.REQ_PROFILE_BANK;
}

export interface WsRespProfileBank extends WsMessage {
  type: WsMessageType.RESP_PROFILE_BANK;
  data: BankAccountData;
}

export interface WsReqProfileBankAction extends WsMessage {
  type: WsMessageType.REQ_PROFILE_BANK_ACTION;
  action: BankActionType;
  amount?: string;
  toTycoon?: string;
  reason?: string;
  loanIndex?: number;
}

export interface WsRespProfileBankAction extends WsMessage {
  type: WsMessageType.RESP_PROFILE_BANK_ACTION;
  result: BankActionResult;
}

// --- Profit & Loss ---
export interface WsReqProfileProfitLoss extends WsMessage {
  type: WsMessageType.REQ_PROFILE_PROFITLOSS;
}

export interface WsRespProfileProfitLoss extends WsMessage {
  type: WsMessageType.RESP_PROFILE_PROFITLOSS;
  data: ProfitLossData;
}

// --- Companies ---
export interface WsReqProfileCompanies extends WsMessage {
  type: WsMessageType.REQ_PROFILE_COMPANIES;
}

export interface WsRespProfileCompanies extends WsMessage {
  type: WsMessageType.RESP_PROFILE_COMPANIES;
  data: CompaniesData;
}

// --- Auto Connections ---
export interface WsReqProfileAutoConnections extends WsMessage {
  type: WsMessageType.REQ_PROFILE_AUTOCONNECTIONS;
}

export interface WsRespProfileAutoConnections extends WsMessage {
  type: WsMessageType.RESP_PROFILE_AUTOCONNECTIONS;
  data: AutoConnectionsData;
}

export interface WsReqProfileAutoConnectionAction extends WsMessage {
  type: WsMessageType.REQ_PROFILE_AUTOCONNECTION_ACTION;
  action: AutoConnectionActionType;
  fluidId: string;
  suppliers?: string;
}

export interface WsRespProfileAutoConnectionAction extends WsMessage {
  type: WsMessageType.RESP_PROFILE_AUTOCONNECTION_ACTION;
  success: boolean;
  message?: string;
}

// --- Policy ---
export interface WsReqProfilePolicy extends WsMessage {
  type: WsMessageType.REQ_PROFILE_POLICY;
}

export interface WsRespProfilePolicy extends WsMessage {
  type: WsMessageType.RESP_PROFILE_POLICY;
  data: PolicyData;
}

export interface WsReqProfilePolicySet extends WsMessage {
  type: WsMessageType.REQ_PROFILE_POLICY_SET;
  tycoonName: string;
  status: number;
}

export interface WsRespProfilePolicySet extends WsMessage {
  type: WsMessageType.RESP_PROFILE_POLICY_SET;
  success: boolean;
  message?: string;
}

// --- Curriculum Action ---
export interface WsReqProfileCurriculumAction extends WsMessage {
  type: WsMessageType.REQ_PROFILE_CURRICULUM_ACTION;
  action: CurriculumActionType;
  value?: boolean;
}

export interface WsRespProfileCurriculumAction extends WsMessage {
  type: WsMessageType.RESP_PROFILE_CURRICULUM_ACTION;
  success: boolean;
  message?: string;
}

// =============================================================================
// POLITICS
// =============================================================================

export interface WsReqPoliticsData extends WsMessage {
  type: WsMessageType.REQ_POLITICS_DATA;
  townName: string;
  buildingX: number;
  buildingY: number;
}

export interface WsRespPoliticsData extends WsMessage {
  type: WsMessageType.RESP_POLITICS_DATA;
  data: PoliticsData;
}

export interface WsReqPoliticsVote extends WsMessage {
  type: WsMessageType.REQ_POLITICS_VOTE;
  buildingX: number;
  buildingY: number;
  candidateName: string;
}

export interface WsRespPoliticsVote extends WsMessage {
  type: WsMessageType.RESP_POLITICS_VOTE;
  success: boolean;
  message?: string;
}

export interface WsReqPoliticsLaunchCampaign extends WsMessage {
  type: WsMessageType.REQ_POLITICS_LAUNCH_CAMPAIGN;
  buildingX: number;
  buildingY: number;
  townName?: string;
}

export interface WsRespPoliticsLaunchCampaign extends WsMessage {
  type: WsMessageType.RESP_POLITICS_LAUNCH_CAMPAIGN;
  success: boolean;
  message?: string;
}

export interface WsReqPoliticsCancelCampaign extends WsMessage {
  type: WsMessageType.REQ_POLITICS_CANCEL_CAMPAIGN;
  buildingX: number;
  buildingY: number;
  townName?: string;
}

export interface WsRespPoliticsCancelCampaign extends WsMessage {
  type: WsMessageType.RESP_POLITICS_CANCEL_CAMPAIGN;
  success: boolean;
  message?: string;
}

// =============================================================================
// TYCOON POLITICAL ROLE (Cache Query)
// =============================================================================

export interface WsReqTycoonRole extends WsMessage {
  type: WsMessageType.REQ_TYCOON_ROLE;
  tycoonName: string;
}

export interface WsRespTycoonRole extends WsMessage {
  type: WsMessageType.RESP_TYCOON_ROLE;
  role: PoliticalRoleInfo;
}

// =============================================================================
// CONNECTION SEARCH
// =============================================================================

export interface WsReqSearchConnections extends WsMessage {
  type: WsMessageType.REQ_SEARCH_CONNECTIONS;
  buildingX: number;
  buildingY: number;
  fluidId: string;
  direction: 'input' | 'output';
  filters?: {
    company?: string;
    town?: string;
    maxResults?: number;
    roles?: number;
  };
}

export interface ConnectionSearchResult {
  facilityName: string;
  companyName: string;
  x: number;
  y: number;
  price?: string;
  quality?: string;
  town?: string;
}

export interface WsRespSearchConnections extends WsMessage {
  type: WsMessageType.RESP_SEARCH_CONNECTIONS;
  results: ConnectionSearchResult[];
  fluidId: string;
  direction: 'input' | 'output';
}

// =============================================================================
// COMPANY CREATION MESSAGES
// =============================================================================

export interface WsReqCreateCompany extends WsMessage {
  type: WsMessageType.REQ_CREATE_COMPANY;
  companyName: string;
  cluster: string;
}

export interface WsRespCreateCompany extends WsMessage {
  type: WsMessageType.RESP_CREATE_COMPANY;
  success: boolean;
  companyName: string;
  companyId: string;
  message?: string;
}

// =============================================================================
// CLUSTER BROWSING MESSAGES (COMPANY CREATION)
// =============================================================================

export interface WsReqClusterInfo extends WsMessage {
  type: WsMessageType.REQ_CLUSTER_INFO;
  clusterName: string;
}

export interface WsRespClusterInfo extends WsMessage {
  type: WsMessageType.RESP_CLUSTER_INFO;
  clusterInfo: ClusterInfo;
}

export interface WsReqClusterFacilities extends WsMessage {
  type: WsMessageType.REQ_CLUSTER_FACILITIES;
  cluster: string;
  folder: string;
}

export interface WsRespClusterFacilities extends WsMessage {
  type: WsMessageType.RESP_CLUSTER_FACILITIES;
  facilities: ClusterFacilityPreview[];
}

// =============================================================================
// TRANSPORT MESSAGES
// =============================================================================

export interface WsReqTransportData extends WsMessage {
  type: WsMessageType.REQ_TRANSPORT_DATA;
}

export interface WsRespTransportData extends WsMessage {
  type: WsMessageType.RESP_TRANSPORT_DATA;
  data: TransportData;
}

// =============================================================================
// EMPIRE (OWNED FACILITIES) MESSAGES
// =============================================================================

/** A bookmarked facility from the Favorites tree. */
export interface FavoritesItem {
  id: number;
  name: string;
  x: number;
  y: number;
}

export interface WsReqEmpireFacilities extends WsMessage {
  type: WsMessageType.REQ_EMPIRE_FACILITIES;
}

export interface WsRespEmpireFacilities extends WsMessage {
  type: WsMessageType.RESP_EMPIRE_FACILITIES;
  facilities: FavoritesItem[];
}

// =============================================================================
// RESEARCH / INVENTIONS MESSAGES
// =============================================================================

/** A single invention item from the server cache. */
export interface ResearchInventionItem {
  /** Invention string ID (e.g., "GreenTech.Level1") */
  inventionId: string;
  /** Display name (from cache if volatile, falls back to ID) */
  name: string;
  /** Whether this invention can be researched (available items only) */
  enabled?: boolean;
  /** Formatted cost string (completed items only) */
  cost?: string;
  /** Parent category for tree grouping */
  parent?: string;
  /** Whether this is a volatile/dynamic invention */
  volatile?: boolean;
}

/** Research data for a single category tab. */
export interface ResearchCategoryData {
  categoryIndex: number;
  available: ResearchInventionItem[];
  developing: ResearchInventionItem[];
  completed: ResearchInventionItem[];
}

/** Detailed invention info from RDOGetInvPropsByLang + RDOGetInvDescEx. */
export interface ResearchInventionDetails {
  inventionId: string;
  /** Multi-line properties text (Price, Licence, Implementation Cost, etc.) */
  properties: string;
  /** Description + prerequisites */
  description: string;
}

export interface WsReqResearchInventory extends WsMessage {
  type: WsMessageType.REQ_RESEARCH_INVENTORY;
  buildingX: number;
  buildingY: number;
  categoryIndex: number;
}

export interface WsRespResearchInventory extends WsMessage {
  type: WsMessageType.RESP_RESEARCH_INVENTORY;
  data: ResearchCategoryData;
}

export interface WsReqResearchDetails extends WsMessage {
  type: WsMessageType.REQ_RESEARCH_DETAILS;
  buildingX: number;
  buildingY: number;
  inventionId: string;
}

export interface WsRespResearchDetails extends WsMessage {
  type: WsMessageType.RESP_RESEARCH_DETAILS;
  details: ResearchInventionDetails;
}

// =============================================================================
// ZONE PAINTING MESSAGES
// =============================================================================

export interface WsReqDefineZone extends WsMessage {
  type: WsMessageType.REQ_DEFINE_ZONE;
  zoneId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WsRespDefineZone extends WsMessage {
  type: WsMessageType.RESP_DEFINE_ZONE;
  success: boolean;
  message?: string;
}

// =============================================================================
// CAPITOL MESSAGES
// =============================================================================

export interface WsReqBuildCapitol extends WsMessage {
  type: WsMessageType.REQ_BUILD_CAPITOL;
  x: number;
  y: number;
}

export interface WsRespCapitolPlaced extends WsMessage {
  type: WsMessageType.RESP_CAPITOL_PLACED;
  x: number;
  y: number;
  buildingId: string;
}

export interface WsRespCapitolCoords extends WsMessage {
  type: WsMessageType.RESP_CAPITOL_COORDS;
  x: number;
  y: number;
  hasCapitol: boolean;
}

// =============================================================================
// CAMERA POSITION MESSAGES
// =============================================================================

export interface WsReqUpdateCamera extends WsMessage {
  type: WsMessageType.REQ_UPDATE_CAMERA;
  x: number;  // column (j) — matches LastX.0 cookie
  y: number;  // row (i) — matches LastY.0 cookie
  viewX?: number;  // viewport top-left column
  viewY?: number;  // viewport top-left row
  viewW?: number;  // viewport width in tiles
  viewH?: number;  // viewport height in tiles
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isWsRequest(msg: WsMessage): boolean {
  return msg.type.startsWith('REQ_');
}
