#!/usr/bin/env node
'use strict';

// Generates the Grafana dashboard JSON from a compact panel list, so panel
// layout and queries stay consistent. Run after editing:
//   node scripts/generate-dashboard.js
//
// The same JSON is used locally (file provisioning) and on EKS (ConfigMap
// labelled grafana_dashboard: "1"). It picks the datasource through a
// variable, so it works with either Grafana's Prometheus datasource.
//
// Pod CPU / memory / restart panels need cAdvisor and kube-state-metrics,
// so they only show data on Kubernetes.

const fs = require('node:fs');
const path = require('node:path');

const DS = { type: 'prometheus', uid: '${datasource}' };
const SVC = 'job=~"$service"';
const RATE = '[$__rate_interval]';

const panels = [];
let nextId = 1;
let y = 0;

function addRow(title) {
  panels.push({ id: nextId++, type: 'row', title, collapsed: false, gridPos: { h: 1, w: 24, x: 0, y }, panels: [] });
  y += 1;
}

// Lays out panels left to right in one row of the given height.
function addPanels(height, defs) {
  let x = 0;
  for (const def of defs) {
    const { title, w, unit = 'short', targets, type = 'timeseries', description, extra = {} } = def;
    panels.push({
      id: nextId++,
      type,
      title,
      description,
      datasource: DS,
      gridPos: { h: height, w, x, y },
      fieldConfig: {
        defaults: {
          unit,
          ...(type === 'timeseries' ? { custom: { lineWidth: 2, fillOpacity: 10, showPoints: 'never' } } : {}),
          ...extra.defaults,
        },
        overrides: [],
      },
      options: {
        ...(type === 'timeseries' ? { legend: { displayMode: 'list', placement: 'bottom' }, tooltip: { mode: 'multi' } } : {}),
        ...extra.options,
      },
      targets: targets.map(([expr, legendFormat], i) => ({
        refId: String.fromCharCode(65 + i),
        datasource: DS,
        expr,
        legendFormat,
      })),
    });
    x += w;
  }
  y += height;
}

addRow('Service overview');
addPanels(5, [{
  title: 'Service Health',
  description: 'Whether Prometheus can scrape each service (1 = UP).',
  type: 'stat',
  w: 24,
  targets: [[`up{${SVC}}`, '{{job}}']],
  extra: {
    defaults: {
      mappings: [{ type: 'value', options: { 0: { text: 'DOWN', color: 'red' }, 1: { text: 'UP', color: 'green' } } }],
      thresholds: { mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'green', value: 1 }] },
    },
    options: { colorMode: 'background', graphMode: 'none', textMode: 'value_and_name', reduceOptions: { calcs: ['lastNotNull'] } },
  },
}]);

addRow('Traffic — $service');
addPanels(8, [
  {
    title: 'Request Rate — $service',
    w: 12,
    unit: 'reqps',
    targets: [[`sum by (status_code) (rate(http_requests_total{${SVC}}${RATE}))`, '{{status_code}}']],
  },
  {
    title: 'Response Time — $service',
    w: 12,
    unit: 's',
    targets: [
      [`histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{${SVC}}${RATE})))`, 'p95'],
      [`histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{${SVC}}${RATE})))`, 'p99'],
    ],
  },
]);
addPanels(8, [
  {
    title: 'Active Requests',
    w: 8,
    targets: [[`sum by (job) (http_active_requests{${SVC}})`, '{{job}}']],
  },
  {
    title: 'Error Rate',
    description: '5xx responses as a percentage of all responses.',
    w: 8,
    unit: 'percent',
    targets: [[
      `100 * (sum(rate(http_requests_total{${SVC},status_code=~"5.."}${RATE})) or vector(0)) / sum(rate(http_requests_total{${SVC}}${RATE}))`,
      '5xx %',
    ]],
  },
  {
    title: 'HTTP Error Rate by Service',
    w: 8,
    unit: 'reqps',
    targets: [[`sum by (job, status_code) (rate(http_requests_total{${SVC},status_code=~"4..|5.."}${RATE}))`, '{{job}} {{status_code}}']],
  },
]);
addPanels(8, [{
  title: 'Request Rate by Service',
  w: 24,
  unit: 'reqps',
  targets: [[`sum by (job) (rate(http_requests_total${RATE}))`, '{{job}}']],
}]);

addRow('Node.js runtime');
addPanels(8, [
  {
    title: 'Node.js Heap Memory',
    w: 12,
    unit: 'bytes',
    targets: [
      [`nodejs_heap_size_used_bytes{${SVC}}`, '{{job}} used'],
      [`nodejs_heap_size_total_bytes{${SVC}}`, '{{job}} total'],
    ],
  },
  {
    title: 'Node.js Event Loop Lag',
    description: 'p99 event loop delay. Rising lag means the process is CPU-bound.',
    w: 12,
    unit: 's',
    targets: [[`nodejs_eventloop_lag_p99_seconds{${SVC}}`, '{{job}}']],
  },
]);

addRow('Kubernetes pods (EKS only)');
addPanels(8, [
  {
    title: 'Pod CPU Usage',
    w: 8,
    unit: 'cores',
    targets: [['sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="boutique",container!=""}[$__rate_interval]))', '{{pod}}']],
  },
  {
    title: 'Pod Memory Usage',
    w: 8,
    unit: 'bytes',
    targets: [['sum by (pod) (container_memory_working_set_bytes{namespace="boutique",container!=""})', '{{pod}}']],
  },
  {
    title: 'Pod Restart Count',
    description: 'Climbing restarts usually mean a crash loop.',
    w: 8,
    targets: [['sum by (pod) (kube_pod_container_status_restarts_total{namespace="boutique"})', '{{pod}}']],
  },
]);

const dashboard = {
  uid: 'boutique-microservices',
  title: 'Boutique Microservices',
  tags: ['boutique'],
  timezone: 'browser',
  schemaVersion: 39,
  version: 1,
  editable: true,
  refresh: '30s',
  time: { from: 'now-30m', to: 'now' },
  templating: {
    list: [
      {
        name: 'datasource',
        label: 'Datasource',
        type: 'datasource',
        query: 'prometheus',
        current: {},
        hide: 0,
      },
      {
        name: 'service',
        label: 'Service',
        type: 'query',
        datasource: DS,
        // Every Node.js service reports this from startup, even before traffic.
        query: { query: 'label_values(nodejs_version_info, job)', refId: 'service' },
        definition: 'label_values(nodejs_version_info, job)',
        refresh: 2,
        includeAll: true,
        multi: true,
        allValue: '.*',
        current: { text: 'All', value: '$__all' },
        sort: 1,
      },
    ],
  },
  annotations: { list: [] },
  panels,
};

const out = path.join(__dirname, '..', 'monitoring', 'grafana', 'dashboards', 'boutique-dashboard.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(dashboard, null, 2)}\n`);
console.log(`Wrote ${panels.filter((p) => p.type !== 'row').length} panels to ${path.relative(process.cwd(), out)}`);
