import { JavaConfig } from "metals-languageclient";

interface Executable {
  command: string;
  args?: string[];
  options?: { env?: typeof process.env };
}

export interface ServerOptions {
  run: Executable;
  debug: Executable;
}

interface GetServerOptions {
  metalsClasspath: string;
  serverProperties: string[] | undefined;
  clientName: string;
  javaConfig: JavaConfig;
}

export function getExampleServerOptions({
  metalsClasspath,
  serverProperties = [],
  clientName,
  javaConfig: { javaOptions, javaPath, extraEnv },
}: GetServerOptions): ServerOptions {
  const baseProperties = [
    `-Dexample.client=${clientName}`,
    "-Xss4m",
    "-Xms100m",
  ];
  const mainArgs = [
    "-classpath",
    metalsClasspath,
    "lspexample.ExampleLanguageServer",
    "start-server",
  ];

  // let user properties override base properties
  const launchArgs = [
    ...baseProperties,
    ...javaOptions,
    ...serverProperties,
    ...mainArgs,
  ];

  const env = { ...process.env, ...extraEnv };

  return {
    run: { command: javaPath, args: launchArgs, options: { env } },
    debug: { command: javaPath, args: launchArgs, options: { env } },
  };
}
