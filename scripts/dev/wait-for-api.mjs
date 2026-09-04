const url = process.env.DEV_API_HEALTH ?? "http://127.0.0.1:4000/api/v1/health";
const deadline = Date.now() + Number(process.env.DEV_API_WAIT_MS ?? 30_000);

while (Date.now() < deadline) {
  try {
    const response = await fetch(url);
    if (response.ok) process.exit(0);
  } catch {
    // API is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
console.error(`لم تصبح API جاهزة خلال المهلة: ${url}`);
process.exit(1);
