// Runs in the "main world" (same JS context as the page) so it can read
// window.ReadParams, the same technique the capture extension's page_bridge.js
// already uses. Only responds to explicit requests from autopilot.js
// (request/response, rather than firing once on load) so there's no race
// between this script dispatching and autopilot.js's listener being ready -
// autopilot.js only needs this value several seconds into its flow, but it
// re-requests on an interval until it gets an answer either way.
(function () {
  document.addEventListener("bilinovel-autopilot-request-nexturl", () => {
    const params = window.ReadParams;
    document.dispatchEvent(
      new CustomEvent("bilinovel-autopilot-nexturl", {
        detail: { url_next: params ? params.url_next || null : null },
      }),
    );
  });
})();
