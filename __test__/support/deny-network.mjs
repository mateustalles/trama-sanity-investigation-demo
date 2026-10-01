/** Script unit suites must use injected fake adapters, never live providers. */
globalThis.fetch = async () => {
  throw new Error('Live fetch is disabled in the offline AI harness. Inject a fake adapter instead.')
}
