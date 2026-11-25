// Preload only in the isolated benchmark child, before loading the production server.
globalThis.fetch = () => {
  console.error('BENCHMARK_NETWORK_BLOCKED');
  throw new Error('Outbound network is forbidden in synthetic benchmarks.');
};
