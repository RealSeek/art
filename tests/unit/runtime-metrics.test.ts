import assert from 'node:assert/strict'
import test from 'node:test'
import { RuntimeMetricsService } from '../../server/src/common/runtime-metrics.service'

test('runtime metrics aggregates requests and bounds route cardinality', () => {
  const metrics = new RuntimeMetricsService()
  metrics.record('get', '/v1/health?verbose=true', 200, 12)
  metrics.record('GET', '/v1/health', 503, 28)
  const snapshot = metrics.snapshot()
  assert.equal(snapshot.totalRequests, 2)
  assert.equal(snapshot.totalErrors, 1)
  assert.equal(snapshot.routes.length, 1)
  assert.equal(snapshot.routes[0].averageDurationMs, 20)
  for (let index = 0; index < 250; index += 1) metrics.record('GET', `/v1/test/${index}`, 200, 1)
  assert.ok(metrics.snapshot().routes.length <= 200)
})
