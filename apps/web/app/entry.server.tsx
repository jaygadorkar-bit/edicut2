import type { EntryContext, HandleErrorFunction } from "react-router";
import { ServerRouter } from "react-router";
import { renderToReadableStream } from "react-dom/server";
import { scheduleApplicationErrorCapture } from "./lib/application-error-log.server";

export const handleError: HandleErrorFunction = (error, { request, context }) => {
  scheduleApplicationErrorCapture(context, request, error);
};

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext
) {
  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    {
      onError() {
        responseStatusCode = 500;
      },
    }
  );

  responseHeaders.set("Content-Type", "text/html; charset=utf-8");

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
