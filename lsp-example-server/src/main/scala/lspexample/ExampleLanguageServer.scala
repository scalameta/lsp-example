package lspexample

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.StandardOpenOption
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

import scala.concurrent.Await
import scala.concurrent.ExecutionContext
import scala.concurrent.ExecutionContextExecutorService
import scala.concurrent.Promise
import scala.concurrent.duration.Duration
import scala.util.control.NonFatal

import lspexample.ExampleEnrichments._

import org.eclipse.lsp4j.DidChangeTextDocumentParams
import org.eclipse.lsp4j.DidCloseTextDocumentParams
import org.eclipse.lsp4j.DidOpenTextDocumentParams
import org.eclipse.lsp4j.DidSaveTextDocumentParams
import org.eclipse.lsp4j.InitializeParams
import org.eclipse.lsp4j.InitializeResult
import org.eclipse.lsp4j.SaveOptions
import org.eclipse.lsp4j.ServerCapabilities
import org.eclipse.lsp4j.ServerInfo
import org.eclipse.lsp4j.TextDocumentSyncKind
import org.eclipse.lsp4j.TextDocumentSyncOptions
import org.eclipse.lsp4j.jsonrpc.Launcher
import org.eclipse.lsp4j.jsonrpc.services.JsonNotification
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest

class ExampleLanguageServer(
    ec: ExecutionContextExecutorService,
    redirectSystemOut: Boolean,
    initialConfig: ExampleServerConfig,
    sh: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
) {
  ThreadPools.discardRejectedRunnables("ExampleLanguageServer.sh", sh)
  ThreadPools.discardRejectedRunnables("ExampleLanguageServer.ec", ec)
  val buffers: Buffers = Buffers()
  lazy val shutdownPromise = new AtomicReference[Promise[Unit]](null)
  var workspace: Path = _
  var initializeParams: Option[InitializeParams] = None
  val languageClient = new DelegatingLanguageClient(NoopLanguageClient)
  private val cancelables = new MutableCancelable()
  private implicit val executionContext: ExecutionContextExecutorService = ec
  private var diagnostics: Diagnostics =
    new Diagnostics(() => workspace, languageClient, buffers)

  def connectToLanguageClient(client: ExampleLanguageClient): Unit = {
    languageClient.underlying = client
    LanguageClientLogger.languageClient = Some(languageClient)
    cancelables.add(() => languageClient.shutdown())
  }

  def cancelAll(): Unit = {
    Cancelable.cancelAll(
      List(
        cancelables,
        Cancelable(() => ec.shutdown()),
        Cancelable(() => sh.shutdown())
      )
    )
  }

  @JsonRequest("initialize")
  def initialize(
      params: InitializeParams
  ): CompletableFuture[InitializeResult] = {
    val capabilities = new ServerCapabilities()

    val textDocumentSyncOptions = new TextDocumentSyncOptions()
    textDocumentSyncOptions.setChange(TextDocumentSyncKind.Full)
    textDocumentSyncOptions.setSave(new SaveOptions(true))
    textDocumentSyncOptions.setOpenClose(true)
    capabilities.setTextDocumentSync(textDocumentSyncOptions)

    capabilities.setDefinitionProvider(true)

    val serverInfo = new ServerInfo("Example", BuildInfo.exampleVersion)
    val result = new InitializeResult(capabilities, serverInfo)
    CompletableFuture.completedFuture(result)
  }

  @JsonNotification("textDocument/didOpen")
  def didOpen(params: DidOpenTextDocumentParams): CompletableFuture[Unit] = {
    val path = params.getTextDocument().getUri().toPath
    buffers.put(path, params.getTextDocument().getText())
    diagnostics.didChange(path)
    CompletableFuture.completedFuture(())
  }

  @JsonNotification("textDocument/didChange")
  def didChange(
      params: DidChangeTextDocumentParams
  ): CompletableFuture[Unit] = {
    params.getContentChanges().asScala.headOption match {
      case None =>
        CompletableFuture.completedFuture(())
      case Some(change) =>
        val path = params.getTextDocument().getUri().toPath
        pprint.log(change.getText())
        buffers.put(path, change.getText())
        diagnostics.didChange(path)
        CompletableFuture.completedFuture(())
    }
  }

  @JsonNotification("textDocument/didClose")
  def didClose(params: DidCloseTextDocumentParams): Unit = {
    val path = params.getTextDocument().getUri().toPath
    buffers.remove(path)
    CompletableFuture.completedFuture(())
  }

  @JsonNotification("textDocument/didSave")
  def didSave(params: DidSaveTextDocumentParams): CompletableFuture[Unit] = {
    CompletableFuture.completedFuture(())
  }

  @JsonRequest("shutdown")
  def shutdown(): CompletableFuture[Unit] = {
    val promise = Promise[Unit]()
    // Ensure we only run `shutdown` at most once and that `exit` waits for the
    // `shutdown` promise to complete.
    if (shutdownPromise.compareAndSet(null, promise)) {
      scribe.info("shutting down Metals")
      try {
        cancelAll()
      } catch {
        case NonFatal(e) =>
          scribe.error("cancellation error", e)
      } finally {
        promise.success(())
      }
      promise.future.asJava
    } else {
      shutdownPromise.get().future.asJava
    }
  }

  @JsonNotification("exit")
  def exit(): Unit = {
    // `shutdown` is idempotent, we can trigger it as often as we like.
    shutdown()
    // Ensure that `shutdown` has completed before killing the process.
    // Some clients may send `exit` immediately after `shutdown` causing
    // the build server to get killed before it can clean up resources.
    try {
      Await.result(
        shutdownPromise.get().future,
        Duration(3, TimeUnit.SECONDS)
      )
    } catch {
      case NonFatal(e) =>
        scribe.error("shutdown error", e)
    } finally {
      System.exit(0)
    }
  }

}

object ExampleLanguageServer {
  def main(args: Array[String]): Unit = {
    val out = Paths.get("example.log")
    Files.write(
      out,
      List(s"args: ${args.toList}").asJava,
      StandardOpenOption.APPEND,
      StandardOpenOption.CREATE
    )
    args.toList match {
      case "start-server" :: Nil => startServer()
      case other => printHelp()
    }
  }
  def printHelp(): Unit =
    println(
      """|Usage: lsp-example-server start-server
         |""".stripMargin
    )

  def startServer(): Unit = {
    val systemIn = System.in
    val systemOut = System.out
    val tracePrinter = GlobalTrace.setup("LSP")
    val exec = Executors.newCachedThreadPool()
    val ec = ExecutionContext.fromExecutorService(exec)
    val initialConfig = ExampleServerConfig.default
    val server = new ExampleLanguageServer(
      ec,
      redirectSystemOut = true,
      initialConfig = initialConfig
    )
    try {
      scribe.info(
        s"Starting Example server with configuration: $initialConfig"
      )
      val launcher = new Launcher.Builder[ExampleLanguageClient]()
        .traceMessages(tracePrinter)
        .setExecutorService(exec)
        .setInput(systemIn)
        .setOutput(systemOut)
        .setRemoteInterface(classOf[ExampleLanguageClient])
        .setLocalService(server)
        .create()
      val clientProxy = launcher.getRemoteProxy
      server.connectToLanguageClient(clientProxy)
      launcher.startListening().get()
    } catch {
      case NonFatal(e) =>
        e.printStackTrace(System.out)
        sys.exit(1)
    } finally {
      server.cancelAll()
    }
  }
}
