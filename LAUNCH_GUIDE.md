# Launch Guide

A practical playbook for launching Web Mock Studio publicly: what to prepare, where to post,
ready-to-use copy, and answers to the questions that will come up in the first 48 hours.

The positioning in one sentence:

> Web Mock Studio mocks any API inside a browser tab, using a Service Worker, with schema
> inference, fake data, cURL import and failure injection, and no server, install or account.

---

## 1. Pre-launch checklist

Complete every item before the first post. A broken demo link on launch day is the most
common and most expensive mistake.

### Repository

- [ ] GitHub Pages is enabled (Settings > Pages > Source: GitHub Actions) and the repository
      variable `PAGES_ENABLED` is set to `true`.
- [ ] The live demo at `https://zzoraemon043.github.io/web-mock-studio/` loads, shows
      "Service Worker" in the sidebar, and the starter rules answer requests in the Runner.
- [ ] The CI badge in the README is green.
- [ ] Repository description: "Mock any API in your browser. Service Worker interception,
      JSON Schema inference, fake data and cURL import. No server, no install."
- [ ] Website field set to the live demo URL.
- [ ] Topics: `mock`, `mock-server`, `api-mocking`, `service-worker`, `json-schema`, `faker`,
      `curl`, `frontend`, `devtools`, `testing`, `qa`, `offline-first`, `react`, `typescript`.
- [ ] Social preview image uploaded (Settings > General > Social preview), 1280 x 640, using
      the dark-theme screenshot with the tagline.
- [ ] Discussions enabled, with categories Q&A, Ideas and Show and tell.
- [ ] Private vulnerability reporting enabled (Settings > Code security).
- [ ] A `v1.0.0` release published with a short changelog and the demo link.
- [ ] Five to eight issues labeled `good first issue`, each with clear scope and pointers to
      the relevant file in `src/core`.

### Assets

- [ ] A 30 to 45 second screen recording (GIF or MP4) showing: paste a cURL command, send it,
      capture as mock, switch to 3G with 30% failures, resend.
- [ ] Light and dark screenshots of each tool.
- [ ] One architecture diagram image (export the Mermaid diagram from the README).

### Readiness

- [ ] Test the demo in current Chrome, Firefox, Safari and Edge, including a private window.
- [ ] Test on a slow connection and on a phone-width viewport.
- [ ] Block four hours after each post to answer comments quickly.

---

## 2. Launch sequence

| Day | Channel | Goal |
| --- | --- | --- |
| Day 0, Tuesday to Thursday, 8:00 to 10:00 US Eastern | Show HN | Primary launch, technical audience |
| Day 0, a few hours after HN | r/webdev | Frontend practitioners |
| Day 1 | r/programming (link post to a write-up, not the repo) | Broader reach |
| Day 1 | X / Bluesky / Mastodon thread with the demo video | Social amplification |
| Day 2 | r/reactjs, r/javascript, r/QualityAssurance | Niche communities, follow each subreddit's self-promotion rules |
| Day 3 to 7 | Dev.to or Hashnode article: "How to mock APIs with a Service Worker and no server" | Long-tail search traffic |
| Week 2 | Newsletters: JavaScript Weekly, Frontend Focus, Bytes, React Status (submit via their forms) | Sustained discovery |
| Week 2 | Product Hunt | Non-HN audience |

Do not post to every channel at once. Spread posts so that you can respond to each thread,
and reuse feedback from earlier threads to sharpen later posts.

---

## 3. Show HN

**Title** (80 characters maximum, no superlatives):

```
Show HN: Web Mock Studio - mock any API in the browser with a Service Worker
```

**URL:** the live demo link.

**First comment** (post immediately after submitting):

```
Hi HN, I built Web Mock Studio because every frontend project I worked on needed fake APIs,
and every option had some friction: a Node server to keep running, a desktop app, an account
that stores payloads in someone else's cloud, or a test-only library that never reaches the
browser I'm actually clicking around in.

It is a static web app. A Service Worker intercepts fetch and XHR calls from the page and
forwards them over a MessageChannel to the app, which resolves them against your rules and
sends back a decision: respond, pass through, or fail. The worker itself holds no rules (MSW
uses the same split), so edits apply instantly and the matching logic exists in one place.

What it does:
- Route matching with :params, {params}, wildcards, absolute URLs and query conditions;
  the most specific rule wins.
- Per-rule latency profiles (4G, 3G, custom with jitter) and failure injection
  (401, 429, 500, 503 or a real network error at a chosen rate).
- Paste a JSON sample, get a JSON Schema 2020-12 document and 10/50/100 realistic records.
  The fake data generators are a few hundred lines with no dependencies and pick generators from field names, so
  "email" looks like an email and matches the generated first and last name.
- Paste a "Copy as cURL" command from DevTools, send it, and capture the response as a mock.
- Export everything as one JSON file, as MSW handlers, or as a drop-in script you can paste
  into another site's console to mock its API in place.

Everything is stored in IndexedDB. There is no backend, analytics or telemetry.

Limitations I know about: requests in the first few hundred milliseconds after load are not
intercepted yet, and the fallback for browsers without Service Workers only patches fetch.

MIT licensed. I would especially like feedback on the schema inference heuristics and on what
a stateful CRUD mode should look like.
```

---

## 4. Reddit

### r/webdev

**Title:**

```
I built a browser-only API mocking tool: Service Worker interception, fake data from a JSON sample, cURL import. No server or install.
```

**Body:**

```
Web Mock Studio is an open source tool for mocking APIs while you build frontends.
It runs entirely in a browser tab:

- Write a rule like GET /api/users/:id and every fetch/XHR to it is answered by a Service
  Worker, with the delay and failure rate you pick (handy for testing loading and retry states).
- Paste one example object and it infers a JSON Schema and generates 10, 50 or 100 realistic
  records, then serves them as a paginated endpoint that honors ?page=&pageSize=.
- Paste "Copy as cURL" from DevTools into the URL bar, send it, and capture the real response
  as a mock in one click.
- Export the workspace as JSON for your team, or export MSW handlers for tests.

No account, no backend, works offline, MIT licensed.

Demo: <live demo link>
Code: https://github.com/zzoraemon043/web-mock-studio

Happy to answer questions about the Service Worker approach. Feedback welcome, especially on
what is missing compared to the mocking tool you use today.
```

### r/programming

r/programming prefers technical write-ups over product announcements. Publish the article from
section 6 first, then post it as a link.

**Title:**

```
Mocking APIs with a Service Worker: routing requests through the page instead of the worker
```

**Comment to add after posting:**

```
Author here. The write-up covers why the worker forwards requests to the page instead of
holding the rules, how the worker avoids intercepting the app's own module loading, and how
seeded generation keeps paginated mock data stable across pages. The tool from the article is
open source (MIT): https://github.com/zzoraemon043/web-mock-studio
```

---

## 5. Short-form social copy

**Thread opener (attach the demo video):**

```
I got tired of running a mock server for every frontend project, so I built one that lives in
a browser tab.

Web Mock Studio: Service Worker interception, fake data from one JSON sample, cURL import,
3G and failure simulation. No server, no install, no account. Open source.
```

**Follow-up posts:**

```
1/ Paste "Copy as cURL" from DevTools straight into the URL bar. It parses headers, body and
   auth, sends the request, and can capture the response as a mock rule.

2/ Paste one example object. You get a JSON Schema 2020-12 document and realistic records
   where names, emails and avatars agree with each other. Same seed, same data.

3/ Need to see how your UI handles a 503 on a slow 3G connection? Two clicks per rule.

4/ Export to MSW handlers for your tests, or a drop-in script for any page.
   Code: https://github.com/zzoraemon043/web-mock-studio
```

---

## 6. Article outline

Title: **How to mock APIs with a Service Worker and no server**

1. The problem: mocking options and their friction.
2. Service Worker basics: scope, the fetch event, `respondWith`, `clients.claim()`.
3. Design choice: resolving in the page over a `MessageChannel` instead of in the worker.
4. Avoiding the bootstrap deadlock: filtering by `request.destination` and client activation
   with heartbeats.
5. Simulating latency and network failure (`Response.error()`).
6. Inferring JSON Schema from samples: folding observations, then deriving constraints.
7. Deterministic fake data with a seeded PRNG and per-record personas.
8. Results, limitations, and what is next.

---

## 7. Prepared answers

**How is this different from MSW?**
MSW is a library you install into your app and configure in code; it is excellent for tests.
Web Mock Studio is a visual workbench that needs no installation, adds schema inference, fake
data, latency and failure simulation, and a request runner. It also exports MSW handlers, so
the two work well together.

**How is this different from json-server or Mockoon?**
Both run a local server process. Web Mock Studio runs inside the browser tab, so there is no
port, no process to keep alive, and nothing to install on a locked-down machine.

**Can it mock requests made by my own app on another origin?**
A Service Worker only controls pages in its own origin and scope. For other apps, export the
drop-in script from the Workspace view and load it before your app code, paste it into the
DevTools console, or export MSW handlers. A browser extension is on the roadmap.

**Does it send my data anywhere?**
No. There is no backend, analytics or telemetry. Workspace data is stored in IndexedDB in your
browser. The Request Runner sends requests only to the URLs you enter.

**Why not just use the DevTools "Override content" feature?**
Overrides replace static responses for exact URLs. Web Mock Studio adds parameterized routes,
templated bodies, generated datasets, pagination, latency and failure injection, and a portable
export format.

**Why does a request to an external API fail with a CORS error?**
That is the browser enforcing the target server's CORS policy, which no client-side tool can
bypass. The runner explains the likely cause and offers alternatives: mock the endpoint, or
copy the request as cURL and run it in a terminal.

**Does it work offline?**
Yes. After the first visit the production build caches its own assets in the Service Worker,
and all features work without a network connection.

**Is the fake data good enough for demos?**
Names, emails, avatars, addresses and timestamps are generated from small curated corpora with
consistent personas per record. It is designed for realistic UI states, not statistical
fidelity.

**Why no faker.js dependency?**
Bundle size and control. The generators are a few hundred lines, deterministic by seed, and tuned
for field-name detection. A plugin interface for custom generators is a welcome contribution.

**What about GraphQL, WebSockets or Server-Sent Events?**
GraphQL over HTTP POST can be mocked today with a rule on the endpoint; operation-aware
matching is on the roadmap. WebSockets are not intercepted by Service Workers.

---

## 8. Engagement rules

- Reply to every comment in the first 24 hours, including critical ones. Thank people for bug
  reports and link the issue you opened for them.
- Never ask for upvotes or stars, and never coordinate voting. Communities penalize it.
- Do not argue about alternatives. Acknowledge where another tool is the better fit.
- Turn repeated questions into README sections or FAQ entries the same day.
- Convert concrete suggestions into issues and tag the person who suggested them.

---

## 9. Post-launch checklist

- [ ] Triage every new issue within 24 hours; label and respond.
- [ ] Ship a small release within a week that addresses the top feedback, and announce it in
      the original threads where appropriate.
- [ ] Add a "Used by" or "Testimonials" section once real users share their workflows.
- [ ] Track referrers in the repository Insights > Traffic view to see which channel worked.
- [ ] Write a short retrospective: what drove stars, what drove contributors, what to change
      for the next release.
