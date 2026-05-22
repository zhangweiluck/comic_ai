import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const serverEntrypoint = join(
  process.cwd(),
  "apps",
  "backend",
  "src",
  "entrypoints",
  "phone-auth-dev-server.ts",
);
const envFilePath = join(process.cwd(), ".env");

if (!existsSync(serverEntrypoint)) {
  console.error(`Unable to find dev server entrypoint at ${serverEntrypoint}`);
  process.exit(1);
}

loadDotEnvFile(envFilePath);

try {
  const { createPhoneAuthDevServer } = await import(pathToFileUrl(serverEntrypoint));
  const server = createPhoneAuthDevServer();
  const port = Number(process.env.PORT ?? "4310");
  await server.listen(port);
  console.log("Phone auth dev server listening on " + server.origin);
  setInterval(() => {}, 1000);
} catch (error) {
  console.error(error);
  process.exit(1);
}

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/")}`;
}

function loadDotEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) {
    return;
  }

  const content = readFileSync(envFilePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
