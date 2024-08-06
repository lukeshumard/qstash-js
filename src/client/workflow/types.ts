import type { Receiver } from "../../receiver";
import type { Client } from "../client";
import type { HTTPMethods } from "../types";
import type { WorkflowContext } from "./context";
import type { WorkflowLogger } from "./logger";

export const StepTypes = ["Initial", "Run", "SleepFor", "SleepUntil", "Call"] as const;
export type StepType = (typeof StepTypes)[number];

type ThirdPartyCallFields<TBody = unknown> = {
  /**
   * Third party call URL. Set when context.call is used.
   */
  callUrl: string;
  /**
   * Third party call method. Set when context.call is used.
   */
  callMethod: HTTPMethods;
  /**
   * Third party call body. Set when context.call is used.
   */
  callBody: TBody;
  /**
   * Third party call headers. Set when context.call is used.
   */
  callHeaders: Record<string, string>;
};

export type Step<TResult = unknown, TBody = unknown> = {
  /**
   * index of the step
   */
  stepId: number;
  /**
   * name of the step
   */
  stepName: string;
  /**
   * type of the step (Initial/Run/SleepFor/SleepUntil/Call)
   */
  stepType: StepType;
  /**
   * step result. Set if context.run or context.call are used.
   */
  out?: TResult;
  /**
   * sleep duration in seconds. Set when context.sleep is used.
   */
  sleepFor?: number;
  /**
   * unix timestamp (in seconds) to wait until. Set when context.sleepUntil is used.
   */
  sleepUntil?: number;
  /**
   * number of steps running concurrently if the step is in a parallel run.
   * Set to 1 if step is not parallel.
   */
  concurrent: number;
  /**
   * target step of a plan step. In other words, the step to assign the
   * result of a plan step.
   *
   * Set to 0 if the step is not a plan step (of a parallel run). Otherwise,
   * set to the target step.
   */
  targetStep: number;
} & (ThirdPartyCallFields<TBody> | { [P in keyof ThirdPartyCallFields]?: never });

export type RawStep = {
  messageId: string;
  body: string; // body is a base64 encoded step or payload
  callType: "step" | "toCallback" | "fromCallback";
};

export type SyncStepFunction<TResult> = () => TResult;
export type AsyncStepFunction<TResult> = () => Promise<TResult>;
export type StepFunction<TResult> = AsyncStepFunction<TResult> | SyncStepFunction<TResult>;

export type ParallelCallState = "first" | "partial" | "discard" | "last";

export type WorkflowServeParameters<TInitialPayload, TResponse = Response> = {
  routeFunction: (context: WorkflowContext<TInitialPayload>) => Promise<void>;
  options?: WorkflowServeOptions<TResponse, TInitialPayload>;
};

type ReceiverOption = Receiver | false;

/**
 * Not all frameworks use env variables like nextjs does. In this case, we need
 * to be able to get the client and receiver explicitly.
 *
 * In this case, we extend the WorkflowServeParameters by requiring an explicit
 * client & receiever parameters and removing client & receiever from options.
 */
export type WorkflowServeParametersExtended<TInitialPayload = unknown, TResponse = Response> = Pick<
  WorkflowServeParameters<TInitialPayload, TResponse>,
  "routeFunction"
> & {
  client: Client;
  receiver: ReceiverOption;
  options?: Omit<WorkflowServeOptions<TResponse, TInitialPayload>, "client" | "receiver">;
};

/**
 * Function parsing initial payload from string to an object
 */
export type InitialPayloadParser<TInitialPayload = unknown> = (
  initialPayload: string
) => TInitialPayload;

export type WorkflowServeOptions<TResponse = Response, TInitialPayload = unknown> = {
  /**
   * QStash client
   */
  client?: Client;
  /**
   * Function called to return a response after each step execution
   *
   * @param workflowRunId
   * @returns response
   */
  onStepFinish?: (workflowRunId: string) => TResponse;
  /**
   * Function to parse the initial payload passed by the user
   */
  initialPayloadParser?: InitialPayloadParser<TInitialPayload>;
  /**
   * Url of the endpoint where the workflow is set up.
   *
   * If not set, url will be inferred from the request.
   */
  url?: string;
  /**
   * Verbose mode
   *
   * Disabled if set to false. If set to true, a logger is created automatically.
   *
   * Alternatively, a WorkflowLogger can be passed.
   *
   * Disabled by default
   */
  verbose?: WorkflowLogger | boolean;
  /**
   * Receiver to verify requests coming from QStash
   *
   * All requests except the first invocation are verified.
   *
   * Enabled by default. A receiver is created from the env variables
   * QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY.
   */
  receiver?: ReceiverOption;
};
