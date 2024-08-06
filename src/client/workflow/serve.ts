/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Receiver } from "../../receiver";
import { Client } from "../client";
import { WorkflowContext } from "./context";
import { WorkflowLogger } from "./logger";
import type { WorkflowServeOptions, WorkflowServeParameters } from "./types";
import { parseRequest, validateRequest } from "./workflow-parser";
import {
  handleThirdPartyCallResult,
  recreateUserHeaders,
  triggerFirstInvocation,
  triggerRouteFunction,
  triggerWorkflowDelete,
} from "./workflow-requests";

/**
 * Fills the options with default values if they are not provided.
 *
 * Default values for:
 * - client: QStash client created with QSTASH_URL and QSTASH_TOKEN env vars
 * - onFinish: returns a Response with workflowRunId in the body and status: 200
 * - initialPayloadParser: calls JSON.parse if initial request body exists.
 *
 * @param options options including the client, onFinish and initialPayloadParser
 * @returns
 */
const processOptions = <TResponse = Response, TInitialPayload = unknown>(
  options?: WorkflowServeOptions<TResponse, TInitialPayload>
): Required<WorkflowServeOptions<TResponse, TInitialPayload>> => {
  return {
    client: new Client({
      baseUrl: process.env.QSTASH_URL!,
      token: process.env.QSTASH_TOKEN!,
    }),
    onStepFinish: (workflowRunId: string) =>
      new Response(JSON.stringify({ workflowRunId }), { status: 200 }) as TResponse,
    initialPayloadParser: (initialRequest: string) => {
      // if there is no payload, simply return undefined
      if (!initialRequest) {
        return undefined as TInitialPayload;
      }

      // try to parse the payload
      try {
        return JSON.parse(initialRequest) as TInitialPayload;
      } catch (error) {
        // if you get an error when parsing, return it as it is
        // needed in plain string case.
        if (error instanceof SyntaxError) {
          return initialRequest as TInitialPayload;
        }
        // if not JSON.parse error, throw error
        throw error;
      }
    },
    url: "", // will be overwritten with request.url
    verbose: false,
    receiver: new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    }),
    ...options,
  };
};

/**
 * Creates an async method that handles incoming requests and runs the provided
 * route function as a workflow.
 *
 * @param routeFunction - A function that uses WorkflowContext as a parameter and runs a workflow.
 * @param options - Options including the client, onFinish callback, and initialPayloadParser.
 * @returns An async method that consumes incoming requests and runs the workflow.
 */
export const serve = <
  TInitialPayload = unknown,
  TRequest extends Request = Request,
  TResponse = Response,
>({
  routeFunction,
  options,
}: WorkflowServeParameters<TInitialPayload, TResponse>): ((
  request: TRequest
) => Promise<TResponse>) => {
  // Prepares options with defaults if they are not provided.
  const { client, onStepFinish, initialPayloadParser, url, verbose, receiver } = processOptions<
    TResponse,
    TInitialPayload
  >(options);

  const debug = WorkflowLogger.getLogger(verbose);
  const verify = receiver || undefined;

  /**
   * Handles the incoming request, triggering the appropriate workflow steps.
   * Calls `triggerFirstInvocation()` if it's the first invocation.
   * Otherwise, starts calling `triggerRouteFunction()` to execute steps in the workflow.
   * Finally, calls `triggerWorkflowDelete()` to remove the workflow from QStash.
   *
   * @param request - The incoming request to handle.
   * @returns A promise that resolves to a response.
   */
  return async (request: TRequest) => {
    await debug?.log("INFO", "ENDPOINT_START");
    const callReturnCheck = await handleThirdPartyCallResult(request, client, debug, verify);

    if (callReturnCheck.isErr()) {
      await debug?.log("ERROR", "SUBMIT_THIRD_PARTY_RESULT", { error: callReturnCheck.error });
      throw callReturnCheck.error;
    } else if (callReturnCheck.value === "continue-workflow") {
      const { isFirstInvocation, workflowRunId } = validateRequest(request);
      const { initialPayload, steps } = await parseRequest(request, isFirstInvocation, verify);

      const workflowContext = new WorkflowContext<TInitialPayload>({
        client,
        workflowRunId,
        initialPayload: initialPayloadParser(initialPayload),
        headers: recreateUserHeaders(request.headers as Headers),
        steps,
        url: url || request.url,
        debug,
      });

      const result = isFirstInvocation
        ? await triggerFirstInvocation(workflowContext, debug)
        : await triggerRouteFunction({
            onStep: async () => routeFunction(workflowContext),
            onCleanup: async () => {
              await triggerWorkflowDelete(workflowContext, debug);
            },
          });

      if (result.isErr()) {
        await debug?.log("ERROR", "ERROR", { error: result.error });
        throw result.error;
      }

      // Returns a Response with `workflowRunId` at the end of each step.
      await debug?.log("INFO", "RESPONSE_WORKFLOW", {
        workflowRunId: workflowContext.workflowRunId,
      });
      return onStepFinish(workflowContext.workflowRunId);
    }

    // response to QStash in call cases
    await debug?.log("INFO", "RESPONSE_DEFAULT");
    return onStepFinish("no-workflow-id");
  };
};
