export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootWorker } = await import('@/server/boot');
    bootWorker();
  }
}
