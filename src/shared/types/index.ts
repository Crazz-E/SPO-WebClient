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
  ZoneType,
  ZONE_TYPES,
  OVERLAY_LIST,
  NOBILITY_TIERS,
  CHAT_MODIFIER_FLAGS,
  parseAccDesc,
} from './domain-types';

export type { ZoneTypeInfo, OverlayInfo } from './domain-types';

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
  CompInputData,
  WarehouseWareData,
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
  CurriculumRanking,
  CurriculumItem,
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
  PoliticalRoleInfo,
  // Transport types
  TrainInfo,
  TrainRouteStop,
  TransportData,
  // Cluster / company creation types
  ClusterInfo,
  ClusterCategory,
  ClusterFacilityPreview,
} from './domain-types';

export type { MailFolder, BankActionType, AutoConnectionActionType, CurriculumActionType, TrainStatus } from './domain-types';

// Message types (WebSocket protocol)
export {
  WsMessageType,
  isWsRequest,
} from './message-types';

export type {
  WsMessage,
  // Request payloads
  WsReqAuthCheck,
  WsReqConnectDirectory,
  WsReqLoginWorld,
  WsReqRdoDirect,
  WsReqMapLoad,
  WsReqManageConstruction,
  WsReqSelectCompany,
  WsReqSwitchCompany,
  // Response payloads
  WsRespError,
  WsRespAuthSuccess,
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
  WsEventRefreshDate,
  WsEventTycoonRetired,
  WsEventModelStatusChanged,
  WsEventRefreshSeason,
  WsEventMoveTo,
  WsEventChannelListChange,
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
  WsEventAreaRefresh,
  WsEventShowNotification,
  WsEventCacheRefresh,
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
  WsReqBuildingTabData,
  WsRespBuildingTabData,
  WsReqBuildingRefreshProperties,
  WsRespBuildingRefreshProperties,
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
  WsReqDemolishRoadArea,
  WsRespDemolishRoadArea,
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
  WsReqProfileCurriculumAction,
  WsRespProfileCurriculumAction,
  // Politics
  WsReqPoliticsData,
  WsRespPoliticsData,
  WsReqPoliticsVote,
  WsRespPoliticsVote,
  WsReqPoliticsLaunchCampaign,
  WsRespPoliticsLaunchCampaign,
  WsReqPoliticsCancelCampaign,
  WsRespPoliticsCancelCampaign,
  WsReqTycoonRole,
  WsRespTycoonRole,
  // Connection Search
  WsReqSearchConnections,
  WsRespSearchConnections,
  // Company Creation
  WsReqCreateCompany,
  WsRespCreateCompany,
  // Cluster Browsing
  WsReqClusterInfo,
  WsRespClusterInfo,
  WsReqClusterFacilities,
  WsRespClusterFacilities,
  // GM Chat
  WsReqGmChatSend,
  // Transport
  WsReqTransportData,
  WsRespTransportData,
  // Empire (Owned Facilities)
  WsReqEmpireFacilities,
  WsRespEmpireFacilities,
  // Research / Inventions
  WsReqResearchInventory,
  WsRespResearchInventory,
  WsReqResearchDetails,
  WsRespResearchDetails,
  // Zone Painting
  WsReqDefineZone,
  WsRespDefineZone,
  // Capitol
  WsReqBuildCapitol,
  WsRespCapitolPlaced,
  WsRespCapitolCoords,
  // Facility connections (trade)
  WsReqConnectFacilities,
  WsRespConnectFacilities,
  // Clone facility
  WsReqCloneFacility,
  WsRespCloneFacility,
} from './message-types';

export type { ConnectionSearchResult, FavoritesItem, ResearchCategoryData, ResearchInventionItem, ResearchInventionDetails } from './message-types';
