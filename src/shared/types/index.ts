/**
 * Types Index - Barrel Export
 * Re-exports all types from domain files for backward compatibility
 */

// Protocol types (RDO protocol constants and primitives)
export {
  RDO_PORTS,
  RDO_CONSTANTS,
  RDO_ERROR_CODES,
  RdoVerb,
  RdoAction,
  SessionPhase,
  WORLD_ZONES,
  DIRECTORY_QUERY,
} from './protocol-types';

export type {
  RdoPacket,
  WorldZone,
} from './protocol-types';

// Domain types (business entities)
export {
  SurfaceType,
} from './domain-types';

export type {
  WorldInfo,
  CompanyInfo,
  MapObject,
  MapBuilding,
  MapSegment,
  MapData,
  ChatUser,
  ChatChannel,
  BuildingFocusInfo,
  BuildingCategory,
  BuildingInfo,
  SurfaceData,
  FacilityDimensions,
  ZoneOverlayState,
  BuildingPropertyValue,
  BuildingConnectionData,
  BuildingSupplyData,
  BuildingProductData,
  BuildingDetailsTab,
  BuildingDetailsResponse,
  SearchMenuCategory,
  TownInfo,
  TycoonProfile,
  RankingCategory,
  RankingEntry,
  RoadDrawingState,
  // Mail types
  MailMessageHeader,
  MailMessageFull,
  MailAttachment,
  // Profile types
  TycoonProfileFull,
  // Profile tab types
  CurriculumData,
  LoanInfo,
  BankAccountData,
  BankActionResult,
  ProfitLossNode,
  ProfitLossData,
  CompanyListItem,
  CompaniesData,
  SupplierEntry,
  AutoConnectionFluid,
  AutoConnectionsData,
  PolicyEntry,
  PolicyData,
  PoliticsRatingEntry,
  PoliticsCampaignEntry,
  PoliticsData,
} from './domain-types';

export type { MailFolder, BankActionType, AutoConnectionActionType } from './domain-types';

// Message types (WebSocket protocol)
export {
  WsMessageType,
  isWsRequest,
} from './message-types';

export type {
  WsMessage,
  // Request payloads
  WsReqConnectDirectory,
  WsReqLoginWorld,
  WsReqRdoDirect,
  WsReqMapLoad,
  WsReqManageConstruction,
  WsReqSelectCompany,
  WsReqSwitchCompany,
  // Response payloads
  WsRespError,
  WsRespConnectSuccess,
  WsRespLoginSuccess,
  WsRespRdoResult,
  WsRespConstructionSuccess,
  WsRespMapData,
  // Event payloads
  WsEventChatMsg,
  WsEventTycoonUpdate,
  WsEventRdoPush,
  WsEventEndOfPeriod,
  // Chat messages
  WsReqChatGetUsers,
  WsReqChatGetChannels,
  WsReqChatGetChannelInfo,
  WsReqChatJoinChannel,
  WsReqChatSendMessage,
  WsReqChatTypingStatus,
  WsRespChatUserList,
  WsRespChatChannelList,
  WsRespChatChannelInfo,
  WsRespChatSuccess,
  WsEventChatUserTyping,
  WsEventChatChannelChange,
  WsEventChatUserListChange,
  // Building focus messages
  WsReqBuildingFocus,
  WsReqBuildingUnfocus,
  WsRespBuildingFocus,
  WsEventBuildingRefresh,
  // Building construction messages
  WsReqGetBuildingCategories,
  WsReqGetBuildingFacilities,
  WsReqPlaceBuilding,
  WsReqGetSurface,
  WsReqGetAllFacilityDimensions,
  WsRespBuildingCategories,
  WsRespBuildingFacilities,
  WsRespBuildingPlaced,
  WsRespSurfaceData,
  WsRespAllFacilityDimensions,
  // Building details messages
  WsReqBuildingDetails,
  WsRespBuildingDetails,
  WsReqBuildingSetProperty,
  WsRespBuildingSetProperty,
  WsReqBuildingUpgrade,
  WsRespBuildingUpgrade,
  WsReqRenameFacility,
  WsRespRenameFacility,
  WsReqDeleteFacility,
  WsRespDeleteFacility,
  // Search menu messages
  WsReqSearchMenuHome,
  WsRespSearchMenuHome,
  WsReqSearchMenuTowns,
  WsRespSearchMenuTowns,
  WsReqSearchMenuTycoonProfile,
  WsRespSearchMenuTycoonProfile,
  WsReqSearchMenuPeople,
  WsRespSearchMenuPeople,
  WsReqSearchMenuPeopleSearch,
  WsRespSearchMenuPeopleSearch,
  WsReqSearchMenuRankings,
  WsRespSearchMenuRankings,
  WsReqSearchMenuRankingDetail,
  WsRespSearchMenuRankingDetail,
  WsReqSearchMenuBanks,
  WsRespSearchMenuBanks,
  // Road building messages
  WsReqBuildRoad,
  WsRespBuildRoad,
  WsReqGetRoadCost,
  WsRespGetRoadCost,
  // Road demolition messages
  WsReqDemolishRoad,
  WsRespDemolishRoad,
  // Logout messages
  WsReqLogout,
  WsRespLogout,
  // Mail messages
  WsReqMailConnect,
  WsReqMailGetFolder,
  WsReqMailReadMessage,
  WsReqMailCompose,
  WsReqMailDelete,
  WsReqMailGetUnreadCount,
  WsRespMailConnected,
  WsRespMailFolder,
  WsRespMailMessage,
  WsRespMailSent,
  WsRespMailDeleted,
  WsRespMailUnreadCount,
  WsEventNewMail,
  WsReqMailSaveDraft,
  WsRespMailDraftSaved,
  // Profile messages
  WsReqGetProfile,
  WsRespGetProfile,
  // Profile tab messages
  WsReqProfileCurriculum,
  WsRespProfileCurriculum,
  WsReqProfileBank,
  WsRespProfileBank,
  WsReqProfileBankAction,
  WsRespProfileBankAction,
  WsReqProfileProfitLoss,
  WsRespProfileProfitLoss,
  WsReqProfileCompanies,
  WsRespProfileCompanies,
  WsReqProfileAutoConnections,
  WsRespProfileAutoConnections,
  WsReqProfileAutoConnectionAction,
  WsRespProfileAutoConnectionAction,
  WsReqProfilePolicy,
  WsRespProfilePolicy,
  WsReqProfilePolicySet,
  WsRespProfilePolicySet,
  // Politics
  WsReqPoliticsData,
  WsRespPoliticsData,
  WsReqPoliticsVote,
  WsRespPoliticsVote,
  WsReqPoliticsLaunchCampaign,
  WsRespPoliticsLaunchCampaign,
  // Connection Search
  WsReqSearchConnections,
  WsRespSearchConnections,
  // Company Creation
  WsReqCreateCompany,
  WsRespCreateCompany,
} from './message-types';

export type { ConnectionSearchResult } from './message-types';
