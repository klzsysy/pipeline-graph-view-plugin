// re-export Result so the relative path exists in one location.
export * from "../../../common/RestClient.tsx";
export type {
  StageInfo,
  StageType,
} from "../../../pipeline-graph-view/pipeline-graph/main/PipelineGraphModel.tsx";
export { Result } from "../../../pipeline-graph-view/pipeline-graph/main/PipelineGraphModel.tsx";

export const LOG_FETCH_SIZE = 150 * 1024;
export const POLL_INTERVAL = 1000;
// Fork customization: load the whole log when a step is opened for the first time.
// 0 means "start at byte 0" while still acting as the tailing sentinel, so the
// initial fetch of a step starts at the buffer's initial endByte (0) and the
// server returns everything up to the end of the log - the "There's more to see"
// button never shows up (it requires stepBuffer.startByte > 0).
// Upstream default is -LOG_FETCH_SIZE (only the trailing 150KiB).
export const TAIL_CONSOLE_LOG = 0;
