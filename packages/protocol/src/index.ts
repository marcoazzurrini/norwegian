// Everything that crosses the network between the app and the server, defined once.
//
// Each message is a Valibot schema; its TypeScript type is derived from the schema, so the two
// sides cannot disagree about a shape. The rules that both sides must apply in the same way
// (which copy of a memory is newer, how two copies of the settings combine) live here too.
export {
  CourseIdSchema,
  FIRST_COURSE,
  MessageCourseSchema,
  type CourseId,
} from "./course";

export {
  mergeMeta,
  SyncedMetaSchema,
  type SyncedMeta,
  type SyncedMetaInput,
} from "./meta";

export {
  ErrorBodySchema,
  ExplainRequestSchema,
  ExplainResponseSchema,
  type ErrorBody,
  type ExplainRequest,
  type ExplainResponse,
} from "./explain";

export {
  AudioListRequestSchema,
  AudioListResponseSchema,
  AUDIO_FILE,
  type AudioListRequest,
  type AudioListResponse,
} from "./audio";

export {
  LOG_PAGE,
  ResetRequestSchema,
  ResetResponseSchema,
  stampOf,
  SyncRequestSchema,
  SyncResponseSchema,
  WireCardSchema,
  WireLogSchema,
  WireMemSchema,
  type ResetRequest,
  type ResetResponse,
  type SyncRequest,
  type SyncResponse,
  type WireCard,
  type WireLog,
  type WireMem,
} from "./sync";

export {
  EVENT_PAGE,
  JournalEventSchema,
  JournalRequestSchema,
  JournalResponseSchema,
  type JournalEvent,
  type JournalRequest,
  type JournalResponse,
} from "./journal";

export { ROUTES } from "./routes";
