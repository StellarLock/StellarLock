import { performance } from "perf_hooks"

interface LoadTestResult {
  scenario: string
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  errorRate: number
  meanLatency: number
  p50Latency: number
  p95Latency: number
  p99Latency: number
  minLatency: number
  maxLatency: number
  throughput: number
  duration: number
}

interface LoadTestScenario {
  name: string
  concurrency: number
  duration: number
  operation: () => Promise<void>
  maxErrorRate?: number
  maxP95Latency?: number
}

class LoadTester {
  private results: number[] = []
  private errors: Error[] = []
  private startTime: number = 0
  private endTime: number = 0

  async runScenario(scenario: LoadTestScenario): Promise<LoadTestResult> {
    console.log(`\n📊 Starting load test: ${scenario.name}`)
    console.log(`   Concurrency: ${scenario.concurrency}`)
    console.log(`   Duration: ${scenario.duration}ms`)

    this.results = []
    this.errors = []
    this.startTime = performance.now()

    const endTime = this.startTime + scenario.duration
    const promises: Promise<void>[] = []

    // Start concurrent operations
    for (let i = 0; i < scenario.concurrency; i++) {
      promises.push(this.runContinuousOperation(scenario.operation, endTime))
    }

    await Promise.all(promises)
    this.endTime = performance.now()

    return this.getResults(scenario.name, scenario.maxErrorRate, scenario.maxP95Latency)
  }

  private async runContinuousOperation(
    operation: () => Promise<void>,
    endTime: number,
  ): Promise<void> {
    while (performance.now() < endTime) {
      try {
        const start = performance.now()
        await operation()
        const latency = performance.now() - start
        this.results.push(latency)
      } catch (err) {
        this.errors.push(err as Error)
      }
    }
  }

  private getResults(
    scenario: string,
    maxErrorRate?: number,
    maxP95Latency?: number,
  ): LoadTestResult {
    const duration = this.endTime - this.startTime
    const totalRequests = this.results.length + this.errors.length
    const successfulRequests = this.results.length
    const failedRequests = this.errors.length
    const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0

    this.results.sort((a, b) => a - b)

    const meanLatency = this.results.length > 0 ? this.results.reduce((a, b) => a + b) / this.results.length : 0
    const p50Latency = this.percentile(this.results, 50)
    const p95Latency = this.percentile(this.results, 95)
    const p99Latency = this.percentile(this.results, 99)
    const minLatency = this.results.length > 0 ? this.results[0] : 0
    const maxLatency = this.results.length > 0 ? this.results[this.results.length - 1] : 0
    const throughput = totalRequests / (duration / 1000)

    const result: LoadTestResult = {
      scenario,
      totalRequests,
      successfulRequests,
      failedRequests,
      errorRate,
      meanLatency,
      p50Latency,
      p95Latency,
      p99Latency,
      minLatency,
      maxLatency,
      throughput,
      duration,
    }

    this.printResult(result)

    // Check against targets
    if (maxErrorRate !== undefined && errorRate > maxErrorRate) {
      console.warn(`⚠️  Error rate ${errorRate.toFixed(2)}% exceeds target ${maxErrorRate}%`)
    }
    if (maxP95Latency !== undefined && p95Latency > maxP95Latency) {
      console.warn(`⚠️  P95 latency ${p95Latency.toFixed(0)}ms exceeds target ${maxP95Latency}ms`)
    }

    return result
  }

  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0
    const index = Math.ceil((p / 100) * arr.length) - 1
    return arr[Math.max(0, index)]
  }

  private printResult(result: LoadTestResult): void {
    console.log(`
✅ Results for: ${result.scenario}
   Duration: ${result.duration.toFixed(0)}ms
   Total Requests: ${result.totalRequests}
   Successful: ${result.successfulRequests} (${((result.successfulRequests / result.totalRequests) * 100).toFixed(1)}%)
   Failed: ${result.failedRequests}
   Error Rate: ${result.errorRate.toFixed(2)}%

   Latency:
   - Mean: ${result.meanLatency.toFixed(2)}ms
   - P50: ${result.p50Latency.toFixed(2)}ms
   - P95: ${result.p95Latency.toFixed(2)}ms ⚠️
   - P99: ${result.p99Latency.toFixed(2)}ms
   - Min: ${result.minLatency.toFixed(2)}ms
   - Max: ${result.maxLatency.toFixed(2)}ms

   Throughput: ${result.throughput.toFixed(2)} req/s
`)
  }
}

export { LoadTester }
export type { LoadTestScenario, LoadTestResult }
