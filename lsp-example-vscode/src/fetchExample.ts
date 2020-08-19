import { ChildProcessPromise, spawn } from "promisify-child-process";
import { JavaConfig } from "metals-languageclient";

interface FetchMetalsOptions {
  serverVersion: string;
  serverProperties: string[];
  javaConfig: JavaConfig;
}

export function fetchExample({
  serverVersion,
  serverProperties,
  javaConfig: { javaPath, javaOptions, extraEnv, coursierPath },
}: FetchMetalsOptions): ChildProcessPromise {
  const fetchProperties = serverProperties.filter(
    (p) => !p.startsWith("-agentlib")
  );

  return spawn(
    javaPath,
    [
      ...javaOptions,
      ...fetchProperties,
      "-jar",
      coursierPath,
      "fetch",
      "-p",
      "--ttl",
      // Use infinite ttl to avoid redunant "Checking..." logs when using SNAPSHOT
      // versions. Metals SNAPSHOT releases are effectively immutable since we
      // never publish the same version twice.
      "Inf",
      `org.scalameta:lsp-example_2.12:${serverVersion}`,
      "-r",
      "sonatype:public",
      "-r",
      "sonatype:snapshots",
      "-p",
    ],
    {
      env: {
        COURSIER_NO_TERM: "true",
        ...extraEnv,
        ...process.env,
      },
    }
  );
}
