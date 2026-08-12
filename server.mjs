// 兼容旧的直接启动方式；正式入口已迁移到 NestJS 的 src/main.ts。
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function startServer(options = {}) {
  if (!existsSync(new URL("./dist/src/main.js", import.meta.url))) {
    throw new Error("尚未构建应用，请先运行 npm run build");
  }
  const nest = await import("./dist/src/main.js");
  return nest.startServer(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
