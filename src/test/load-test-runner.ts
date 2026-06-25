import { runAllLoadTests } from "./rpc-load-tests"

async function main() {
  try {
    await runAllLoadTests()
    console.log("\n✅ Load tests completed successfully!")
    process.exit(0)
  } catch (error) {
    console.error("\n❌ Load tests failed:", error)
    process.exit(1)
  }
}

main()
