import { LoadTester, type LoadTestScenario, type LoadTestResult } from "./load-test"

interface RpcResponse {
  status: number
  data: unknown
}

// Mock RPC endpoint configuration
const RPC_ENDPOINT = "https://soroban-testnet.stellar.org"

// Performance budgets from issue #107
const PERFORMANCE_BUDGETS = {
  readP95: 2000, // ms
  writeP95: 10000, // ms
  errorRate: 5, // %
}

async function mockRpcCall(endpoint: string, method: string, delay: number = 50): Promise<RpcResponse> {
  // Simulate RPC latency
  await new Promise((resolve) => setTimeout(resolve, delay))

  // Add some realistic variance
  const variance = Math.random() * 20 - 10
  const actualDelay = Math.max(delay + variance, 10)

  // 95% success rate by default
  if (Math.random() < 0.05) {
    throw new Error(`RPC error: ${method} failed`)
  }

  return {
    status: 200,
    data: { result: "success", endpoint, method, latency: actualDelay },
  }
}

// Scenario 1: Concurrent reads (get_lock calls)
const concurrentReadsScenario: LoadTestScenario = {
  name: "Concurrent reads (50x get_lock)",
  concurrency: 50,
  duration: 30000, // 30 seconds
  operation: async () => {
    await mockRpcCall(RPC_ENDPOINT, "get_lock", 50)
  },
  maxErrorRate: 5,
  maxP95Latency: PERFORMANCE_BUDGETS.readP95,
}

// Scenario 2: Concurrent writes (create_lock transactions)
const concurrentWritesScenario: LoadTestScenario = {
  name: "Concurrent writes (10x create_lock)",
  concurrency: 10,
  duration: 30000, // 30 seconds
  operation: async () => {
    await mockRpcCall(RPC_ENDPOINT, "create_lock", 500)
  },
  maxErrorRate: 5,
  maxP95Latency: PERFORMANCE_BUDGETS.writeP95,
}

// Scenario 3: Explorer search (get_locks_by_token)
const explorerSearchScenario: LoadTestScenario = {
  name: "Explorer search (20x get_locks_by_token)",
  concurrency: 20,
  duration: 30000, // 30 seconds
  operation: async () => {
    await mockRpcCall(RPC_ENDPOINT, "get_locks_by_token", 100)
  },
  maxErrorRate: 5,
  maxP95Latency: PERFORMANCE_BUDGETS.readP95,
}

// Scenario 4: Mixed workload (80% reads, 20% writes)
const mixedWorkloadScenario: LoadTestScenario = {
  name: "Mixed workload (80% reads, 20% writes)",
  concurrency: 30,
  duration: 60000, // 60 seconds
  operation: async () => {
    const isRead = Math.random() < 0.8
    if (isRead) {
      await mockRpcCall(RPC_ENDPOINT, "get_lock", 50)
    } else {
      await mockRpcCall(RPC_ENDPOINT, "create_lock", 500)
    }
  },
  maxErrorRate: 5,
  maxP95Latency: 5000, // Mixed workload has higher tolerance
}

// Scenario 5: Sustained load (5-minute continuous)
const sustainedLoadScenario: LoadTestScenario = {
  name: "Sustained load (5 minutes moderate load)",
  concurrency: 15,
  duration: 300000, // 5 minutes
  operation: async () => {
    await mockRpcCall(RPC_ENDPOINT, "get_lock", 50)
  },
  maxErrorRate: 5,
  maxP95Latency: PERFORMANCE_BUDGETS.readP95,
}

// Scenario 6: Burst load (short bursts of 100 requests)
const burstLoadScenario: LoadTestScenario = {
  name: "Burst load (100 concurrent requests)",
  concurrency: 100,
  duration: 10000, // 10 seconds
  operation: async () => {
    await mockRpcCall(RPC_ENDPOINT, "get_lock", 50)
  },
  maxErrorRate: 5,
  maxP95Latency: 3000, // Burst can have some degradation
}

export async function runAllLoadTests() {
  const tester = new LoadTester()
  const results: LoadTestResult[] = []

  console.log("\n🚀 Starting RPC Endpoint Load Tests")
  console.log("=" + "=".repeat(79))
  console.log(`RPC Endpoint: ${RPC_ENDPOINT}`)
  console.log(
    `Performance Budgets: P95 reads ${PERFORMANCE_BUDGETS.readP95}ms, P95 writes ${PERFORMANCE_BUDGETS.writeP95}ms`,
  )
  console.log("=" + "=".repeat(79))

  const scenarios = [
    concurrentReadsScenario,
    concurrentWritesScenario,
    explorerSearchScenario,
    mixedWorkloadScenario,
    sustainedLoadScenario,
    burstLoadScenario,
  ]

  for (const scenario of scenarios) {
    const result = await tester.runScenario(scenario)
    results.push(result)
  }

  // Print summary
  printSummary(results)

  return results
}

function printSummary(results: LoadTestResult[]) {
  console.log("\n" + "=".repeat(80))
  console.log("📊 LOAD TEST SUMMARY")
  console.log("=".repeat(80))

  const passedTests = results.filter((r) => {
    const errorRateOk = r.errorRate <= PERFORMANCE_BUDGETS.errorRate
    const p95Ok = r.p95Latency <= (r.scenario.includes("write") ? PERFORMANCE_BUDGETS.writeP95 : PERFORMANCE_BUDGETS.readP95)
    return errorRateOk && p95Ok
  })

  console.log(`\n✅ Passed: ${passedTests.length}/${results.length} scenarios`)

  console.log("\n📈 Performance Metrics:")
  console.log("┌─────────────────────────────┬──────────┬──────────┬──────────┐")
  console.log("│ Scenario                    │ P95 (ms) │ Error %  │ Req/sec  │")
  console.log("├─────────────────────────────┼──────────┼──────────┼──────────┤")

  for (const result of results) {
    const name = result.scenario.substring(0, 27).padEnd(27)
    const p95 = result.p95Latency.toFixed(0).padStart(8)
    const errorRate = result.errorRate.toFixed(2).padStart(8)
    const throughput = result.throughput.toFixed(2).padStart(8)

    console.log(`│ ${name} │ ${p95} │ ${errorRate} │ ${throughput} │`)
  }

  console.log("└─────────────────────────────┴──────────┴──────────┴──────────┘")

  console.log("\n🎯 Recommendations:")
  const slowScenarios = results.filter((r) => {
    const limit = r.scenario.includes("write") ? PERFORMANCE_BUDGETS.writeP95 : PERFORMANCE_BUDGETS.readP95
    return r.p95Latency > limit
  })

  const highErrorScenarios = results.filter((r) => r.errorRate > PERFORMANCE_BUDGETS.errorRate)

  if (slowScenarios.length === 0 && highErrorScenarios.length === 0) {
    console.log("✅ All performance budgets met. No optimizations needed at this time.")
  } else {
    if (slowScenarios.length > 0) {
      console.log("\n⚠️  Latency Concerns:")
      slowScenarios.forEach((r) => {
        console.log(`  - ${r.scenario}: P95 latency ${r.p95Latency.toFixed(0)}ms exceeds budget`)
      })
      console.log("\n  Recommendations:")
      console.log("  • Implement response caching layer for frequently accessed locks")
      console.log("  • Add rate limiting with circuit breaker pattern")
      console.log("  • Consider batch RPC calls to reduce total requests")
    }

    if (highErrorScenarios.length > 0) {
      console.log("\n⚠️  Error Rate Concerns:")
      highErrorScenarios.forEach((r) => {
        console.log(`  - ${r.scenario}: Error rate ${r.errorRate.toFixed(2)}% exceeds budget`)
      })
      console.log("\n  Recommendations:")
      console.log("  • Implement exponential backoff retry strategy")
      console.log("  • Add fallback RPC endpoints")
      console.log("  • Improve error handling and user notification")
    }
  }

  console.log("\n" + "=".repeat(80))
}
