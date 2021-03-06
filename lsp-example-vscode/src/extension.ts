"use strict";

import { ChildProcessPromise } from "promisify-child-process";
import {
  workspace,
  ExtensionContext,
  window,
  commands,
  CodeLensProvider,
  EventEmitter,
  StatusBarAlignment,
  ProgressLocation,
  languages,
  WebviewPanel,
  ViewColumn,
  OutputChannel,
  Uri,
  Range,
  DecorationRangeBehavior,
  DecorationOptions,
  Position,
  TextEditorDecorationType,
  ConfigurationTarget,
} from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ExecuteCommandRequest,
  Location,
  TextDocument,
} from "vscode-languageclient";
import { LazyProgress } from "./lazy-progress";
import {
  getJavaHome,
  restartServer,
  checkDottyIde,
  getJavaConfig,
  JavaConfig,
  downloadProgress,
  installJava,
  ClientCommands,
  MetalsInitializationOptions,
  MetalsSlowTask,
  ExecuteClientCommand,
  MetalsOpenWindowParams,
  MetalsStatus,
  MetalsDidFocus,
  MetalsWindowStateDidChange,
  MetalsInputBox,
  MetalsQuickPick,
} from "metals-languageclient";
import * as metalsLanguageClient from "metals-languageclient";
import * as scalaDebugger from "./scalaDebugger";
import {
  DecorationTypeDidChange,
  DecorationsRangesDidChange,
} from "./decoration-protocol";
import { fetchExample } from "./fetchExample";
import { getExampleServerOptions } from "./getExampleServerOptions";

const outputChannel = window.createOutputChannel("Example");
const openSettingsAction = "Open settings";
const openSettingsCommand = "workbench.action.openSettings";
let currentClient: LanguageClient | undefined;

let decorationType: TextEditorDecorationType = window.createTextEditorDecorationType(
  {
    isWholeLine: true,
    rangeBehavior: DecorationRangeBehavior.OpenClosed,
  }
);

const config = workspace.getConfiguration("example");

export async function activate(context: ExtensionContext) {
  detectLaunchConfigurationChanges();
  checkServerVersion();
  configureSettingsDefaults();

  return window.withProgress(
    {
      location: ProgressLocation.Window,
      title: `Starting Example server...`,
      cancellable: false,
    },
    async () => {
      commands.executeCommand("setContext", "example:enabled", true);
      try {
        const javaHome = await getJavaHome(
          workspace.getConfiguration("example").get("javaHome")
        );
        return fetchAndLaunchMetals(context, javaHome);
      } catch (err) {
        outputChannel.appendLine(err);
        showMissingJavaMessage();
      }
    }
  );
}

export function deactivate(): Thenable<void> | undefined {
  return currentClient?.stop();
}

function showMissingJavaMessage(): Thenable<void> {
  const installJava8Action = "Install Java (JDK 8)";
  const installJava11Action = "Install Java (JDK 11)";

  const message =
    "Unable to find a Java 8 or Java 11 installation on this computer. " +
    "To fix this problem, update the 'Java Home' setting to point to a Java 8 or Java 11 home directory " +
    "or select a version to install automatically";

  outputChannel.appendLine(message);

  return window
    .showErrorMessage(
      message,
      openSettingsAction,
      installJava8Action,
      installJava11Action
    )
    .then((choice) => {
      switch (choice) {
        case openSettingsAction: {
          commands.executeCommand(openSettingsCommand);
          break;
        }
        case installJava8Action: {
          window.withProgress(
            {
              location: ProgressLocation.Notification,
              title: `Installing Java (JDK 8), please wait...`,
              cancellable: true,
            },
            () =>
              installJava({ javaVersion: "adopt@1.8", outputChannel }).then(
                updateJavaConfig
              )
          );
          break;
        }
        case installJava11Action: {
          window.withProgress(
            {
              location: ProgressLocation.Notification,
              title: `Installing Java (JDK 11), please wait...`,
              cancellable: true,
            },
            () =>
              installJava({ javaVersion: "adopt@1.11", outputChannel }).then(
                updateJavaConfig
              )
          );
          break;
        }
      }
    });
}

function fetchAndLaunchMetals(context: ExtensionContext, javaHome: string) {
  if (!workspace.workspaceFolders) {
    outputChannel.appendLine(
      `Metals will not start because you've opened a single file and not a project directory.`
    );
    return;
  }
  const dottyIde = checkDottyIde(workspace.workspaceFolders[0]?.uri.fsPath);
  if (dottyIde.enabled) {
    outputChannel.appendLine(
      `Metals will not start since Dotty is enabled for this workspace. ` +
        `To enable Metals, remove the file ${dottyIde.path} and run 'Reload window'`
    );
    return;
  }

  outputChannel.appendLine(`Java home: ${javaHome}`);

  const serverVersionConfig: string = config.get<string>("serverVersion")!;
  const defaultServerVersion = config.inspect<string>("serverVersion")!
    .defaultValue!;
  const serverVersion = serverVersionConfig
    ? serverVersionConfig.trim()
    : defaultServerVersion;

  const serverProperties = config.get<string[]>("serverProperties")!;
  const customRepositories = config.get<string[]>("customRepositories")!;

  const javaConfig = getJavaConfig({
    workspaceRoot: workspace.workspaceFolders[0]?.uri.fsPath,
    javaHome,
    customRepositories,
    extensionPath: context.extensionPath,
  });

  const fetchProcess = fetchExample({
    serverVersion,
    serverProperties,
    javaConfig,
  });

  const title = `Downloading Metals v${serverVersion}`;
  return trackDownloadProgress(title, outputChannel, fetchProcess).then(
    (classpath) => {
      return launchMetals(
        outputChannel,
        context,
        classpath,
        serverProperties,
        javaConfig
      );
    },
    () => {
      const msg = (() => {
        const proxy =
          `See https://scalameta.org/metals/docs/editors/vscode.html#http-proxy for instructions ` +
          `if you are using an HTTP proxy.`;
        if (process.env.FLATPAK_SANDBOX_DIR) {
          return (
            `Failed to download Metals. It seems you are running Visual Studio Code inside the ` +
            `Flatpak sandbox, which is known to interfere with the download of Metals. ` +
            `Please, try running Visual Studio Code without Flatpak.`
          );
        } else if (serverVersion === defaultServerVersion) {
          return (
            `Failed to download Metals, make sure you have an internet connection and ` +
            `the Java Home '${javaHome}' is valid. You can configure the Java Home in the settings.` +
            proxy
          );
        } else {
          return (
            `Failed to download Metals, make sure you have an internet connection, ` +
            `the Metals version '${serverVersion}' is correct and the Java Home '${javaHome}' is valid. ` +
            `You can configure the Metals version and Java Home in the settings.` +
            proxy
          );
        }
      })();
      outputChannel.show();
      window.showErrorMessage(msg, openSettingsAction).then((choice) => {
        if (choice === openSettingsAction) {
          commands.executeCommand(openSettingsCommand);
        }
      });
    }
  );
}

function updateJavaConfig(javaHome: string, global: boolean = true) {
  config.update("javaHome", javaHome, global);
}

function launchMetals(
  outputChannel: OutputChannel,
  context: ExtensionContext,
  metalsClasspath: string,
  serverProperties: string[],
  javaConfig: JavaConfig
) {
  const serverOptions = getExampleServerOptions({
    metalsClasspath,
    serverProperties,
    javaConfig,
    clientName: "vscode",
  });

  const initializationOptions: MetalsInitializationOptions = {
    compilerOptions: {
      completionCommand: "editor.action.triggerSuggest",
      overrideDefFormat: "unicode",
      parameterHintsCommand: "editor.action.triggerParameterHints",
    },
    decorationProvider: true,
    debuggingProvider: true,
    doctorProvider: "html",
    didFocusProvider: true,
    executeClientCommandProvider: true,
    globSyntax: "vscode",
    icons: "vscode",
    inputBoxProvider: true,
    openFilesOnRenameProvider: true,
    openNewWindowProvider: true,
    quickPickProvider: true,
    slowTaskProvider: true,
    statusBarProvider: "on",
    treeViewProvider: true,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "plaintext" }],
    synchronize: {
      configurationSection: "example",
    },
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    outputChannel: outputChannel,
    initializationOptions,
  };

  const client = new LanguageClient(
    "example",
    "Example",
    serverOptions,
    clientOptions
  );

  currentClient = client;
  function registerCommand(command: string, callback: (...args: any[]) => any) {
    context.subscriptions.push(commands.registerCommand(command, callback));
  }

  registerCommand(
    "example.restartServer",
    restartServer(
      // NOTE(gabro): this is due to mismatching versions of vscode-languageserver-protocol
      // which are not trivial to fix, currently
      // @ts-ignore
      client,
      window
    )
  );

  context.subscriptions.push(client.start());

  return client.onReady().then(() => {
    let doctor: WebviewPanel | undefined;
    function getDoctorPanel(isReload: boolean): WebviewPanel {
      if (!doctor) {
        doctor = window.createWebviewPanel(
          "example-doctor",
          "Example Doctor",
          ViewColumn.Active,
          { enableCommandUris: true }
        );
        context.subscriptions.push(doctor);
        doctor.onDidDispose(() => {
          doctor = undefined;
        });
      } else if (!isReload) {
        doctor.reveal();
      }
      return doctor;
    }

    let channelOpen = false;

    registerCommand(ClientCommands.FocusDiagnostics, () =>
      commands.executeCommand("workbench.action.problems.focus")
    );

    registerCommand(ClientCommands.RunDoctor, () =>
      commands.executeCommand(ClientCommands.RunDoctor)
    );

    registerCommand(ClientCommands.ToggleLogs, () => {
      if (channelOpen) {
        client.outputChannel.hide();
        channelOpen = false;
      } else {
        client.outputChannel.show(true);
        channelOpen = true;
      }
    });

    registerCommand(ClientCommands.StartDebugSession, (...args: any[]) => {
      scalaDebugger.start(false, ...args).then((wasStarted) => {
        if (!wasStarted) {
          window.showErrorMessage("Debug session not started");
        }
      });
    });

    registerCommand(ClientCommands.StartRunSession, (...args: any[]) => {
      scalaDebugger.start(true, ...args).then((wasStarted) => {
        if (!wasStarted) {
          window.showErrorMessage("Run session not started");
        }
      });
    });

    // should be the compilation of a currently opened file
    // but some race conditions may apply
    let compilationDoneEmitter = new EventEmitter<void>();

    let codeLensRefresher: CodeLensProvider = {
      onDidChangeCodeLenses: compilationDoneEmitter.event,
      provideCodeLenses: () => undefined,
    };

    languages.registerCodeLensProvider(
      { scheme: "file", language: "scala" },
      codeLensRefresher
    );

    // Handle the metals/executeClientCommand extension notification.
    client.onNotification(ExecuteClientCommand.type, (params) => {
      switch (params.command) {
        case ClientCommands.GotoLocation:
          const location =
            params.arguments && (params.arguments[0] as Location);
          if (location) {
            gotoLocation(location);
          }
          break;
        case ClientCommands.RefreshModel:
          compilationDoneEmitter.fire();
          break;
        case ClientCommands.OpenFolder:
          const openWindowParams = params
            .arguments?.[0] as MetalsOpenWindowParams;
          if (openWindowParams) {
            commands.executeCommand(
              "vscode.openFolder",
              Uri.parse(openWindowParams.uri),
              openWindowParams.openNewWindow
            );
          }
          break;
        case ClientCommands.RunDoctor:
        case ClientCommands.ReloadDoctor:
          const isRun = params.command === ClientCommands.RunDoctor;
          const isReload = params.command === ClientCommands.ReloadDoctor;
          if (isRun || (doctor && isReload)) {
            const html = params.arguments && params.arguments[0];
            if (typeof html === "string") {
              const panel = getDoctorPanel(isReload);
              panel.webview.html = html;
            }
          }
          break;
        case ClientCommands.FocusDiagnostics:
          commands.executeCommand(ClientCommands.FocusDiagnostics);
          break;
        default:
          outputChannel.appendLine(`unknown command: ${params.command}`);
      }

      // Ignore other commands since they are less important.
    });

    // The server updates the client with a brief text message about what
    // it is currently doing, for example "Compiling..".
    const item = window.createStatusBarItem(StatusBarAlignment.Right, 100);
    item.command = ClientCommands.ToggleLogs;
    item.hide();
    client.onNotification(MetalsStatus.type, (params) => {
      item.text = params.text;
      if (params.show) {
        item.show();
      } else if (params.hide) {
        item.hide();
      }
      if (params.tooltip) {
        item.tooltip = params.tooltip;
      }
      if (params.command) {
        item.command = params.command;
        commands.getCommands().then((values) => {
          if (params.command && values.includes(params.command)) {
            registerCommand(params.command, () => {
              client.sendRequest(ExecuteCommandRequest.type, {
                command: params.command!,
              });
            });
          }
        });
      } else {
        item.command = undefined;
      }
    });

    registerCommand(ClientCommands.EchoCommand, (arg: string) => {
      client.sendRequest(ExecuteCommandRequest.type, {
        command: arg,
      });
    });

    window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isSupportedLanguage(editor.document.languageId)) {
        client.sendNotification(
          MetalsDidFocus.type,
          editor.document.uri.toString()
        );
      }
    });

    window.onDidChangeWindowState((windowState) => {
      client.sendNotification(MetalsWindowStateDidChange.type, {
        focused: windowState.focused,
      });
    });

    client.onRequest(MetalsInputBox.type, (options, requestToken) => {
      return window
        .showInputBox(options, requestToken)
        .then(MetalsInputBox.handleInput);
    });

    client.onRequest(MetalsQuickPick.type, (params, requestToken) => {
      return window
        .showQuickPick(params.items, params, requestToken)
        .then((result) => {
          if (result === undefined) {
            return { cancelled: true };
          } else {
            return { itemId: result.id };
          }
        });
    });

    // Long running tasks such as "import project" trigger start a progress
    // bar with a "cancel" button.
    client.onRequest(MetalsSlowTask.type, (params, requestToken) => {
      return new Promise((requestResolve) => {
        const showLogs = ` ([show logs](command:${ClientCommands.ToggleLogs} "Show Metals logs"))`;
        window.withProgress(
          {
            location: ProgressLocation.Notification,
            title: params.message + showLogs,
            cancellable: true,
          },
          (progress, progressToken) => {
            // Update total running time every second.
            let seconds = params.secondsElapsed || 0;
            const interval = setInterval(() => {
              seconds += 1;
              progress.report({ message: readableSeconds(seconds) });
            }, 1000);

            // Hide logs and clean up resources on completion.
            function onComplete() {
              clearInterval(interval);
            }

            // Client triggered cancelation from the progress notification.
            progressToken.onCancellationRequested(() => {
              onComplete();
              requestResolve({ cancel: true });
            });

            return new Promise((progressResolve) => {
              // Server completed long running task.
              requestToken.onCancellationRequested(() => {
                onComplete();
                progress.report({ increment: 100 });
                setTimeout(() => progressResolve(), 1000);
              });
            });
          }
        );
      });
    });
    scalaDebugger
      .initialize(outputChannel)
      .forEach((disposable) => context.subscriptions.push(disposable));
    client.onNotification(DecorationTypeDidChange.type, (options) => {
      decorationType = window.createTextEditorDecorationType(options);
    });
    client.onNotification(DecorationsRangesDidChange.type, (params) => {
      const editor = window.activeTextEditor;
      if (
        editor &&
        Uri.parse(params.uri).toString() === editor.document.uri.toString()
      ) {
        const options = params.options.map<DecorationOptions>((o) => {
          return {
            range: new Range(
              new Position(o.range.start.line, o.range.start.character),
              new Position(o.range.end.line, o.range.end.character)
            ),
            hoverMessage: o.hoverMessage,
            renderOptions: o.renderOptions,
          };
        });
        editor.setDecorations(decorationType, options);
      } else {
        outputChannel.appendLine(
          `Ignoring decorations for non-active document '${params.uri}'.`
        );
      }
    });
  });
}

function gotoLocation(location: Location): void {
  const range = new Range(
    location.range.start.line,
    location.range.start.character,
    location.range.end.line,
    location.range.end.character
  );
  workspace
    .openTextDocument(Uri.parse(location.uri))
    .then((textDocument) =>
      window.showTextDocument(textDocument, { selection: range })
    );
}

function trackDownloadProgress(
  title: string,
  output: OutputChannel,
  download: ChildProcessPromise
): Promise<string> {
  const progress = new LazyProgress();
  return downloadProgress({
    download,
    onError: (stdout) =>
      stdout.forEach((buffer) => output.append(buffer.toString())),
    onProgress: (msg) => {
      output.appendLine(msg);
      progress.startOrContinue(title, output, download);
    },
  });
}

function readableSeconds(totalSeconds: number): string {
  const minutes = (totalSeconds / 60) | 0;
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    if (seconds === 0) return `${minutes}m`;
    else return `${minutes}m${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

function detectLaunchConfigurationChanges() {
  metalsLanguageClient.detectLaunchConfigurationChanges(
    workspace,
    ({ message, reloadWindowChoice, dismissChoice }) =>
      window
        .showInformationMessage(message, reloadWindowChoice, dismissChoice)
        .then((choice) => {
          if (choice === reloadWindowChoice) {
            commands.executeCommand("workbench.action.reloadWindow");
          }
        })
  );
}

function checkServerVersion() {
  const config = workspace.getConfiguration("example");
  metalsLanguageClient.checkServerVersion({
    config,
    updateConfig: ({
      configSection,
      latestServerVersion,
      configurationTarget,
    }) =>
      config.update(configSection, latestServerVersion, configurationTarget),
    onOutdated: ({
      message,
      upgradeChoice,
      openSettingsChoice,
      dismissChoice,
      upgrade,
    }) =>
      window
        .showWarningMessage(
          message,
          upgradeChoice,
          openSettingsChoice,
          dismissChoice
        )
        .then((choice) => {
          switch (choice) {
            case upgradeChoice:
              upgrade();
              break;
            case openSettingsChoice:
              commands.executeCommand(openSettingsCommand);
              break;
          }
        }),
  });
}

function isSupportedLanguage(languageId: TextDocument["languageId"]): boolean {
  switch (languageId) {
    case "example":
    case "scala":
    case "sc":
    case "java":
      return true;
    default:
      outputChannel.appendLine("is supported: " + languageId);
      return false;
  }
}

// NOTE(gabro): we would normally use the `configurationDefaults` contribution point in the
// extension manifest but that's currently limited to language-scoped settings in VSCode.
// We use this method to set global configuration settings such as `files.watcherExclude`.
function configureSettingsDefaults() {
  function updateFileConfig(
    configKey: string,
    propertyKey: string,
    newValues: Record<string, boolean>,
    configurationTarget:
      | ConfigurationTarget.Global
      | ConfigurationTarget.Workspace
  ) {
    const config = workspace.getConfiguration(configKey);
    const configProperty = config.inspect<Record<string, boolean>>(propertyKey);
    const currentValues = ((): Record<string, boolean> => {
      switch (configurationTarget) {
        case ConfigurationTarget.Global:
          return configProperty?.globalValue ?? {};
        case ConfigurationTarget.Workspace:
          return configProperty?.workspaceValue ?? {};
      }
    })();
    config.update(
      propertyKey,
      { ...currentValues, ...newValues },
      configurationTarget
    );
  }
  updateFileConfig(
    "files",
    "watcherExclude",
    {
      "**/.bloop": true,
      "**/.metals": true,
      "**/.ammonite": true,
    },
    ConfigurationTarget.Global
  );
  updateFileConfig(
    "files",
    "watcherExclude",
    {
      "**/target": true,
    },
    ConfigurationTarget.Workspace
  );
}
