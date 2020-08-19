package lspexample

import org.eclipse.lsp4j.services.LanguageClient
import org.eclipse.lsp4j.PublishDiagnosticsParams
import org.eclipse.lsp4j.MessageParams
import java.util.concurrent.CompletableFuture
import org.eclipse.lsp4j.{MessageActionItem, ShowMessageRequestParams}

class ExampleLanguageClient extends LanguageClient {
  override def telemetryEvent(x$1: Any): Unit = ()
  override def publishDiagnostics(x$1: PublishDiagnosticsParams): Unit = ()
  override def showMessage(x$1: MessageParams): Unit = ()
  override def showMessageRequest(
      x$1: ShowMessageRequestParams
  ): CompletableFuture[MessageActionItem] =
    new CompletableFuture[MessageActionItem]()
  override def logMessage(x$1: MessageParams): Unit = ()
  def shutdown(): Unit = {}
}
